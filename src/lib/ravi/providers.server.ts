import { sql } from "@/lib/db/client.server";
import type { JsonValue } from "@/lib/db/schema";
import { loadStoredKeys } from "./keystore.server";
import {
  PERSIAN_LANGUAGE_CODE,
  MIN_AUDIO_SIZE_BYTES,
  MIN_PERSIAN_RATIO,
  MAX_WORD_SCORE,
  PUNCTUATION_BONUS,
  LOW_PERSIAN_PENALTY,
  MIN_TRANSCRIPT_LENGTH,
  DEFAULT_LIVEAVATAR_AVATAR_ID,
  DEFAULT_LIVEAVATAR_CONTEXT_ID,
  ERROR_AUDIO_TOO_SHORT,
  ERROR_TRANSCRIPTION_EMPTY,
  DEEPGRAM_MODEL_ATTEMPTS,
  EMBEDDING_BATCH_SIZE,
  type ChatProvider,
  type SttProvider,
} from "./constants";

/**
 * Provider layer. OpenAI is the only configurable engine for chat, embeddings,
 * speech-to-text and speech synthesis; DEEPGRAM_API_KEY optionally adds a
 * second transcription engine. There is no gateway to fall back to, so an
 * unset OPENAI_API_KEY is a configuration error rather than a degraded mode.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";

interface ServiceSwitches {
  heygen: boolean;
}

/**
 * Per-service switches from the admin panel. A disabled service is skipped.
 * @returns Service enablement status
 */
export async function serviceSwitches(): Promise<ServiceSwitches> {
  try {
    const [data] = await sql<
      { heygen_enabled: boolean }[]
    >`SELECT heygen_enabled FROM app_settings LIMIT 1`;

    return { heygen: data?.heygen_enabled ?? true };
  } catch (error) {
    console.error("[Config] Exception loading service switches:",
      error instanceof Error ? error.message : String(error)
    );
    return { heygen: true };
  }
}

/** Panel-entered keys win over environment variables; disabled services report no key. */
export async function providerConfig() {
  const [stored, enabled] = await Promise.all([loadStoredKeys(), serviceSwitches()]);
  const heygenKey = stored.HEYGEN_API_KEY || process.env["HEYGEN_API_KEY"] || null;
  const openAiKey = process.env["OPENAI_API_KEY"] || stored.OPENAI_API_KEY || null;
  return {
    enabled,
    storedKeys: { heygenKey, openAiKey },
    openAiKey,
    openAiModel: process.env["OPENAI_MODEL"] || "gpt-4o-mini",
    heygenKey: enabled.heygen ? heygenKey : null,
    liveAvatarAvatarId: process.env["LIVEAVATAR_AVATAR_ID"] || DEFAULT_LIVEAVATAR_AVATAR_ID,
    liveAvatarContextId: process.env["LIVEAVATAR_CONTEXT_ID"] || DEFAULT_LIVEAVATAR_CONTEXT_ID,
  };
}

/** Active chat provider. "none" means nothing is configured and answering will fail. */
export async function chatProviderName(): Promise<ChatProvider> {
  const config = await providerConfig();
  return config.openAiKey ? "openai" : "none";
}

/** Active speech-to-text provider. "none" means transcription will fail. */
export async function sttProviderName(): Promise<SttProvider> {
  const config = await providerConfig();
  return config.openAiKey ? "openai" : "none";
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  tokenInput: number | null;
  tokenOutput: number | null;
  /** Provider that produced the answer. */
  provider?: "openai";
}

/** Records why a provider was skipped so the admin panel shows the real cause. */
async function recordProviderDegradation(provider: string, message: string) {
  try {
    const [row] = await sql<{ id: string; connection_status: Record<string, JsonValue> }[]>`
      SELECT id, connection_status FROM app_settings LIMIT 1
    `;
    if (!row) return;
    const next: Record<string, JsonValue> = {
      ...(row.connection_status ?? {}),
      [provider]: { ok: false, message, latencyMs: null, at: new Date().toISOString() },
    };
    await sql`UPDATE app_settings SET connection_status = ${sql.json(next)} WHERE id = ${row.id}`;
  } catch {
    /* status logging must never break an answer */
  }
}

/**
 * Chat completion via OpenAI.
 *
 * @param messages Array of chat messages (system, user, assistant)
 * @param options Configuration options for the chat request
 * @param options.model Override the default model
 * @param options.maxTokens Maximum tokens to generate in the response
 * @returns Chat result with generated text and token usage
 * @throws {ProviderError} If the request fails
 */
export async function chatComplete(
  messages: ChatMessage[],
  options: { model?: string; maxTokens?: number } = {},
): Promise<ChatResult> {
  const config = await providerConfig();

  if (config.openAiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openAiKey}`,
        },
        body: JSON.stringify({
          model: options.model ?? config.openAiModel,
          messages,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        }),
      });
      if (response.ok) {
        const json = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = json.choices?.[0]?.message?.content?.trim() ?? "";
        if (text) {
          return {
            text,
            tokenInput: json.usage?.prompt_tokens ?? null,
            tokenOutput: json.usage?.completion_tokens ?? null,
            provider: "openai",
          };
        }
      } else {
        const detail = (await response.text()).slice(0, 300);
        console.error("openai chat failed", response.status, detail);
        await recordProviderDegradation(
          "openai",
          `سرویس OpenAI پاسخ نداد (کد ${response.status}).`,
        );
      }
    } catch (error) {
      console.error("openai chat error", error);
    }
  }

  throw new ProviderError(
    "chat",
    502,
    "هیچ سرویس پاسخ‌گویی در دسترس نیست؛ کلید OpenAI را بررسی کنید.",
  );
}


/**
 * One OpenAI embeddings call. Mixing embedding models would make stored
 * vectors incomparable with query vectors, so there is no second provider.
 */
async function requestEmbeddings(input: string[]): Promise<number[][]> {
  const config = await providerConfig();
  if (!config.openAiKey) {
    throw new ProviderError("openai", 401, "کلید OpenAI برای بردارسازی تنظیم نشده است.");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    console.error("[Embeddings] OpenAI request failed:", {
      status: response.status,
      detail: detail.slice(0, 100),
    });
    throw new ProviderError("openai", response.status, detail);
  }

  const json = (await response.json()) as { data?: { embedding: number[] }[] };
  return (json.data ?? []).map((item) => item.embedding);
}

/**
 * Generate a text embedding via OpenAI.
 * @param text Input text to embed
 * @returns Embedding vector as array of numbers
 * @throws {ProviderError} If API request fails or returns invalid data
 */
export async function embedText(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new ProviderError("input", 400, "Cannot embed empty text");
  }

  const [embedding] = await requestEmbeddings([text]);
  if (!embedding) {
    console.error("[Embeddings] Empty embedding response");
    throw new ProviderError("openai", 502, "empty embedding response");
  }
  return embedding;
}

/**
 * Generate embeddings for multiple texts in batches.
 *
 * Keeps batches small so a single failure does not lose a whole document.
 *
 * @param texts Array of texts to embed
 * @returns Array of embedding vectors
 * @throws {ProviderError} If any batch fails
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const out: number[][] = [];
  // Keep batches small so a single failure does not lose a whole document.
  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const slice = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
    const embeddings = await requestEmbeddings(slice);

    if (embeddings.length !== slice.length) {
      console.error("[Embeddings] Batch size mismatch:", {
        expected: slice.length,
        received: embeddings.length,
      });
    }

    out.push(...embeddings);
  }

  return out;
}

/**
 * Phrases speech models emit when they are handed silence, background noise or
 * music instead of speech. Returning them as a question would send the whole
 * conversation off-topic, so they are dropped.
 */
const HALLUCINATED_TRANSCRIPTS = [
  "موسیقی",
  "زیرنویس",
  "ادامه دارد",
  "پایان",
  "ممنون",
  "متشکرم",
  "بله",
  "خداحافظ",
  "thank you",
  "thanks for watching",
  "subtitles",
  "music",
  "you",
  "بفرمایید",
];

function cleanTranscript(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const bare = text.replace(/[.!?،؛…"'«»\-\s]/g, "").toLowerCase();
  if (bare.length < 2) return "";
  if (HALLUCINATED_TRANSCRIPTS.some((phrase) => bare === phrase.replace(/\s/g, "").toLowerCase())) {
    return "";
  }
  return text;
}

/**
 * Deepgram transcription (primary when DEEPGRAM_API_KEY is present).
 *
 * Tries nova-3 first (best Persian support), falls back to whisper-large
 * if the account doesn't support nova-3 or the language pair.
 *
 * @param key Deepgram API key
 * @param audio Audio blob to transcribe
 * @param filename Original filename for MIME type detection
 * @returns Cleaned transcript or null if all models fail
 */
async function transcribeWithDeepgram(
  key: string,
  audio: Blob,
  filename: string,
): Promise<string | null> {
  const contentType =
    audio.type && audio.type !== "application/octet-stream"
      ? audio.type
      : filename.endsWith(".mp3")
        ? "audio/mpeg"
        : filename.endsWith(".webm")
          ? "audio/webm"
          : "audio/wav";

  const body = await audio.arrayBuffer();

  // nova-3 handles Persian; whisper-large is the fallback when the model or
  // language pair is rejected by the account.
  const attempts = ["nova-3", "whisper-large"];
  let lastDetail = "";
  let attemptCount = 0;

  for (const model of attempts.slice(0, DEEPGRAM_MODEL_ATTEMPTS)) {
    attemptCount++;
    const url =
      `https://api.deepgram.com/v1/listen?model=${model}&language=${PERSIAN_LANGUAGE_CODE}` +
      `&smart_format=true&punctuate=true&numerals=true`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
        body,
      });

      if (!response.ok) {
        lastDetail = (await response.text()).slice(0, 400);
        console.error(`[STT] Deepgram ${model} failed:`, {
          status: response.status,
          detail: lastDetail.slice(0, 100),
        });
        continue;
      }

      const json = (await response.json()) as {
        results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
      };
      const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
      const cleaned = cleanTranscript(text);

      if (cleaned) {
        console.log(`[STT] Deepgram ${model} succeeded`);
        return cleaned;
      }
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
      console.error(`[STT] Deepgram ${model} exception:`, lastDetail);
    }
  }

  console.error("[STT] All Deepgram models failed:", { attemptCount, lastDetail });
  return null;
}

/**
 * Whisper transcription via OpenAI.
 * @param audio Audio blob to transcribe
 * @param filename Original filename for MIME type detection
 * @param config Provider configuration with API keys
 * @returns Cleaned transcript or null if transcription fails
 */
async function transcribeWithWhisper(
  audio: Blob,
  filename: string,
  config: Awaited<ReturnType<typeof providerConfig>>,
): Promise<string | null> {
  const form = new FormData();
  form.append("file", audio, filename || "speech.wav");
  // No `prompt` is sent: speech models repeat the prompt verbatim when the
  // recording is quiet, which used to surface as a fake Persian sentence.
  form.append("temperature", "0");
  form.append("language", PERSIAN_LANGUAGE_CODE);
  try {
    if (config.openAiKey) {
      form.append("model", "whisper-1");
      form.append("response_format", "json");
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.openAiKey}` },
        body: form,
      });
      if (response.ok) {
        const json = (await response.json()) as { text?: string };
        const text = cleanTranscript(json.text ?? "");
        if (text) return text;
      } else {
        console.error("openai transcription failed", (await response.text()).slice(0, 300));
      }
      return null;
    }
    console.error("[STT] No Whisper provider configured (set OPENAI_API_KEY)");
    return null;
  } catch (error) {
    console.error("whisper transcription error", error);
    return null;
  }
}

/**
 * Scores a candidate transcript for Persian quality.
 *
 * Scoring factors:
 * - Ratio of Persian letters (0-100 points)
 * - Word count (up to 25 points for 25+ words)
 * - Sentence punctuation (+5 points)
 * - Penalty for non-Persian text (-40 if < 50% Persian)
 *
 * @param text Transcript to score
 * @returns Quality score (-1 for invalid, higher is better)
 */
function scorePersianTranscript(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return -1;

  const letters = trimmed.replace(/[^\p{L}]/gu, "");
  if (!letters || letters.length < MIN_TRANSCRIPT_LENGTH) return -1;

  const persian = (letters.match(/[\u0600-\u06FF]/g) ?? []).length;
  const ratio = persian / letters.length;
  const words = trimmed.split(/\s+/).filter((word) => word.length > 1).length;

  let score = ratio * 100;
  score += Math.min(words, MAX_WORD_SCORE);

  if (/[.!?؟،]/.test(trimmed)) {
    score += PUNCTUATION_BONUS;
  }

  // Latin-heavy output means the engine missed the language entirely.
  if (ratio < MIN_PERSIAN_RATIO) {
    score += LOW_PERSIAN_PENALTY;
  }

  return score;
}

/**
 * Persian speech-to-text with parallel engine processing.
 *
 * Strategy:
 * - Deepgram (nova-3/whisper-large) and OpenAI Whisper run in parallel
 * - Each transcript is scored for Persian quality
 * - The highest-scoring transcript wins
 *
 * This approach ensures resilience: if one engine produces gibberish,
 * the other's result is used instead.
 *
 * @param audio Audio blob (must be >= MIN_AUDIO_SIZE_BYTES)
 * @param filename Original filename for content-type detection
 * @returns Best Persian transcript
 * @throws {ProviderError} If audio is too short or all engines fail
 */
export async function transcribeAudio(audio: Blob, filename: string): Promise<string> {
  const config = await providerConfig();

  // Below roughly half a second of 16 kHz audio there is nothing to recognise.
  if (audio.size < MIN_AUDIO_SIZE_BYTES) {
    console.error("[STT] Audio too short:", { size: audio.size, minSize: MIN_AUDIO_SIZE_BYTES });
    throw new ProviderError("input", 400, ERROR_AUDIO_TOO_SHORT);
  }

  const deepgramKey = process.env["DEEPGRAM_API_KEY"];
  const [deepgram, whisper] = await Promise.all([
    deepgramKey
      ? transcribeWithDeepgram(deepgramKey, audio, filename).catch((error) => {
          console.error("[STT] Deepgram failed:", error instanceof Error ? error.message : String(error));
          return null;
        })
      : Promise.resolve(null),
    transcribeWithWhisper(audio, filename, config),
  ]);

  const candidates = [
    { engine: "deepgram", text: deepgram ?? "", score: scorePersianTranscript(deepgram ?? "") },
    { engine: "whisper", text: whisper ?? "", score: scorePersianTranscript(whisper ?? "") },
  ].sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) {
    console.error("[STT] No candidates available");
    throw new ProviderError("stt", 502, ERROR_TRANSCRIPTION_EMPTY);
  }

  console.log(
    "[STT] Engine comparison:",
    candidates.map((item) => `${item.engine}:${item.score.toFixed(1)}`).join(" | "),
    `→ winner: ${best.engine}`,
  );

  if (best.score < 0) {
    console.error("[STT] All transcripts scored negative:", { candidates });
    throw new ProviderError("stt", 502, ERROR_TRANSCRIPTION_EMPTY);
  }

  return best.text;
}



export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
    public detail: string,
  ) {
    super(`${provider} error ${status}: ${detail}`);
    this.name = "ProviderError";
  }
}