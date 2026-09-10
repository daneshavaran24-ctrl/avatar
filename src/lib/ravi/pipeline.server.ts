import { sql } from "@/lib/db/client.server";
import type { AnswerResult, InputMode, SourceType } from "./types";
import { normalizePersian } from "./persian";
import { buildSystemPrompt, type AppSettings } from "./persona.server";
import { classifyPolicyTopic } from "./policy.server";
import {
  chatComplete,
  chatProviderName,
  embedText,
  ProviderError,
} from "./providers.server";
import { matchKnowledgeChunks } from "./vector.server";

/** Evidence gate thresholds — tuned against the admin evaluation set, not fixed dogma. */
const STRONG_EVIDENCE = 0.52;
const WEAK_EVIDENCE = 0.4;
const MAX_CHUNKS = 6;

interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  content: string;
  similarity: number;
}

export async function loadSettings(): Promise<AppSettings> {
  const [data] = await sql<AppSettings[]>`
    SELECT * FROM app_settings ORDER BY updated_at ASC LIMIT 1
  `;
  if (!data) throw new Error("تنظیمات سامانه در دسترس نیست.");
  return data;
}

/**
 * Recent turns for a session, read from storage rather than taken from the
 * caller. The public endpoint is open to the internet, so client-supplied
 * history would be both a cost amplifier and a prompt-injection vector.
 */
export async function loadRecentHistory(
  sessionId: string,
  limit = 6,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await sql<{ role: string; content: string }[]>`
    SELECT role, content
    FROM conversation_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows
    .reverse()
    .filter((row): row is { role: "user" | "assistant"; content: string } =>
      row.role === "user" || row.role === "assistant",
    );
}

async function logProviderEvent(
  sessionId: string | null,
  provider: string,
  operation: string,
  startedAt: number,
  success: boolean,
  errorCode?: string,
) {
  await sql`
    INSERT INTO provider_events (session_id, provider, operation, latency_ms, success, error_code)
    VALUES (
      ${sessionId},
      ${provider},
      ${operation},
      ${Math.round(performance.now() - startedAt)},
      ${success},
      ${errorCode ?? null}
    )
  `;
}

async function retrieve(
  question: string,
  sessionId: string | null,
): Promise<RetrievedChunk[]> {
  const startedAt = performance.now();
  try {
    const embedding = await embedText(question);
    const matches = await matchKnowledgeChunks(embedding, MAX_CHUNKS);
    await logProviderEvent(sessionId, "openai", "embedding", startedAt, true);
    return matches;
  } catch (error) {
    await logProviderEvent(
      sessionId,
      "openai",
      "embedding",
      startedAt,
      false,
      error instanceof ProviderError ? String(error.status) : "RETRIEVAL_FAILED",
    );
    return [];
  }
}

function decideSource(chunks: RetrievedChunk[]): {
  sourceType: Exclude<SourceType, "POLICY_BLOCK">;
  used: RetrievedChunk[];
} {
  const top = chunks[0];
  if (!top) return { sourceType: "GENERAL_AI", used: [] };
  const best = top.similarity;
  const supporting = chunks.filter((chunk) => chunk.similarity >= WEAK_EVIDENCE);

  if (best >= STRONG_EVIDENCE && supporting.length >= 2) {
    return { sourceType: "KNOWLEDGE_BASE", used: supporting };
  }
  if (best >= STRONG_EVIDENCE || supporting.length >= 1) {
    return { sourceType: "HYBRID", used: supporting.length ? supporting : [top] };
  }
  return { sourceType: "GENERAL_AI", used: [] };
}

export async function runAnswerPipeline(params: {
  sessionId: string | null;
  question: string;
  inputMode: InputMode;
}): Promise<AnswerResult> {
  const startedAt = performance.now();
  const question = normalizePersian(params.question);
  const settings = await loadSettings();

  // Read before recording this turn, so the prompt sees prior turns only.
  const history = params.sessionId ? await loadRecentHistory(params.sessionId) : [];

  await recordMessage(params.sessionId, {
    role: "user",
    content: question,
    input_mode: params.inputMode,
  });

  // 1. Policy gate
  const topic = await classifyPolicyTopic(
    question,
    settings.political_block,
    settings.religious_block,
  );
  if (topic !== "NONE") {
    const latencyMs = Math.round(performance.now() - startedAt);
    const messageId = await recordMessage(params.sessionId, {
      role: "assistant",
      content: settings.refusal_text,
      source_type: "POLICY_BLOCK",
      latency_ms: latencyMs,
    });
    return {
      answer: settings.refusal_text,
      sourceType: "POLICY_BLOCK",
      latencyMs,
      messageId,
    };
  }

  // 2. Knowledge routing
  const chunks = await retrieve(question, params.sessionId);
  const { sourceType, used } = decideSource(chunks);
  const context = used.length
    ? used
        .map((chunk, index) => `[${index + 1}] «${chunk.document_title}»\n${chunk.content}`)
        .join("\n\n")
    : null;

  // 3. Persona + generation
  const chatStartedAt = performance.now();
  const provider = await chatProviderName();
  let answer = "";
  let tokenInput: number | null = null;
  let tokenOutput: number | null = null;

  try {
    const result = await chatComplete(
      [
        { role: "system", content: buildSystemPrompt(settings, context) },
        ...history,
        { role: "user", content: question },
      ],
    );
    answer = result.text;
    tokenInput = result.tokenInput;
    tokenOutput = result.tokenOutput;
    await logProviderEvent(
      params.sessionId,
      result.provider ?? provider,
      "chat",
      chatStartedAt,
      true,
    );
  } catch (error) {
    await logProviderEvent(
      params.sessionId,
      provider,
      "chat",
      chatStartedAt,
      false,
      error instanceof ProviderError ? String(error.status) : "CHAT_FAILED",
    );
    throw error;
  }

  if (!answer) {
    throw new Error("پاسخی از مدل دریافت نشد.");
  }

  const latencyMs = Math.round(performance.now() - startedAt);
  const messageId = await recordMessage(params.sessionId, {
    role: "assistant",
    content: answer,
    source_type: sourceType,
    latency_ms: latencyMs,
    token_input: tokenInput,
    token_output: tokenOutput,
  });

  if (messageId && used.length) {
    await sql`
      INSERT INTO retrieval_events ${sql(
        used.map((chunk, index) => ({
          message_id: messageId,
          document_id: chunk.document_id,
          chunk_id: chunk.chunk_id,
          score: chunk.similarity,
          rank: index + 1,
        })),
      )}
    `;
  }

  return { answer, sourceType, latencyMs, messageId };
}

async function recordMessage(
  sessionId: string | null,
  message: {
    role: "user" | "assistant";
    content: string;
    source_type?: SourceType;
    input_mode?: InputMode;
    latency_ms?: number;
    token_input?: number | null;
    token_output?: number | null;
  },
): Promise<string | null> {
  if (!sessionId) return null;
  try {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO conversation_messages
        (session_id, role, content, source_type, input_mode, latency_ms, token_input, token_output)
      VALUES (
        ${sessionId},
        ${message.role},
        ${message.content},
        ${message.source_type ?? null},
        ${message.input_mode ?? null},
        ${message.latency_ms ?? null},
        ${message.token_input ?? null},
        ${message.token_output ?? null}
      )
      RETURNING id
    `;
    return row?.id ?? null;
  } catch {
    return null;
  }
}