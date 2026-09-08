import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("*")
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("تنظیمات سامانه در دسترس نیست.");
  return data as AppSettings;
}

async function logProviderEvent(
  sessionId: string | null,
  provider: string,
  operation: string,
  startedAt: number,
  success: boolean,
  errorCode?: string,
) {
  await supabaseAdmin.from("provider_events").insert({
    session_id: sessionId,
    provider,
    operation,
    latency_ms: Math.round(performance.now() - startedAt),
    success,
    error_code: errorCode ?? null,
  });
}

async function retrieve(
  question: string,
  sessionId: string | null,
): Promise<RetrievedChunk[]> {
  const startedAt = performance.now();
  try {
    const embedding = await embedText(question);
    const { data, error } = await supabaseAdmin.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(embedding),
      match_count: MAX_CHUNKS,
    });
    if (error) throw new Error(error.message);
    await logProviderEvent(sessionId, "lovable-ai", "embedding", startedAt, true);
    return (data ?? []) as unknown as RetrievedChunk[];
  } catch (error) {
    await logProviderEvent(
      sessionId,
      "lovable-ai",
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
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<AnswerResult> {
  const startedAt = performance.now();
  const question = normalizePersian(params.question);
  const settings = await loadSettings();

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
        ...params.history.slice(-6),
        { role: "user", content: question },
      ],
      provider === "openrouter" && settings.openrouter_model
        ? { model: settings.openrouter_model }
        : {},
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
    await supabaseAdmin.from("retrieval_events").insert(
      used.map((chunk, index) => ({
        message_id: messageId,
        document_id: chunk.document_id,
        chunk_id: chunk.chunk_id,
        score: chunk.similarity,
        rank: index + 1,
      })),
    );
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
  const { data, error } = await supabaseAdmin
    .from("conversation_messages")
    .insert({
      session_id: sessionId,
      role: message.role,
      content: message.content,
      source_type: message.source_type ?? null,
      input_mode: message.input_mode ?? null,
      latency_ms: message.latency_ms ?? null,
      token_input: message.token_input ?? null,
      token_output: message.token_output ?? null,
    })
    .select("id")
    .single();
  if (error) return null;
  return data.id;
}