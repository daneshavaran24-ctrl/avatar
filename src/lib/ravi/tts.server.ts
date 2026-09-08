import { gatewayFetch } from "@/lib/ai-gateway.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { splitSpeechChunks, toSpeechText } from "./persian-speech";
import {
  MAX_SPEECH_CHUNK_CHARS,
  MIN_TTS_SPEED,
  MAX_TTS_SPEED,
  DEFAULT_TTS_SPEED,
  DEFAULT_TTS_VOICE,
  ERROR_TTS_FAILED,
} from "./constants";

/**
 * Persian speech synthesis through the Lovable AI Gateway. The browser's own
 * `speechSynthesis` rarely ships a Persian voice, so answers used to be read
 * with a foreign accent; this path returns natural Persian audio on every
 * device. Audio is returned as base64 MP3 per chunk so playback can start on
 * the first sentence group instead of waiting for the whole answer.
 */
export const TTS_MODEL = "openai/gpt-4o-mini-tts";

/**
 * دستورالعمل تلفظ فارسی برای مدل‌های TTS.
 *
 * این دستورالعمل به مدل کمک می‌کند تا:
 * - با لحن استاندارد تهرانی صحبت کند
 * - هیچ لهجه یا تلفظ خارجی نداشته باشد
 * - لحن گرم، آرام و حرفه‌ای داشته باشد
 * - آهنگ طبیعی با مکث‌های مناسب داشته باشد
 */
const PERSIAN_INSTRUCTIONS =
  "با لحن فارسی استاندارد تهرانی، دقیقاً مثل یک گوینده بومی ایرانی حرف بزن — هیچ لهجه یا تلفظ خارجی نداشته باش. لحن گرم، آرام و حرفه‌ای یک کارشناس اداری ایرانی را داشته باش. آهنگ طبیعی با مکث‌های کوتاه بین جملات؛ همه کلمات را واضح و روان تلفظ کن.";

export interface TtsSettings {
  voice: string;
  speed: number;
}

/**
 * Loads TTS settings from database with sensible defaults.
 * @returns TTS configuration (voice and speed)
 */
export async function ttsSettings(): Promise<TtsSettings> {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("tts_voice, tts_speed")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[TTS] Failed to load settings:", error.message);
    }

    const row = (data ?? {}) as { tts_voice?: string | null; tts_speed?: number | null };
    const speed = Number(row.tts_speed ?? DEFAULT_TTS_SPEED) || DEFAULT_TTS_SPEED;

    return {
      voice: row.tts_voice || DEFAULT_TTS_VOICE,
      speed: Math.max(MIN_TTS_SPEED, Math.min(MAX_TTS_SPEED, speed)),
    };
  } catch (error) {
    console.error("[TTS] Exception loading settings:",
      error instanceof Error ? error.message : String(error)
    );
    return { voice: DEFAULT_TTS_VOICE, speed: DEFAULT_TTS_SPEED };
  }
}

/**
 * Splits an answer at sentence boundaries so the first audio chunk arrives fast.
 *
 * This enables streaming audio playback: the first chunk can start playing
 * while later chunks are still being generated.
 *
 * @param text Raw answer text (may contain markdown, numbers, etc.)
 * @param maxChars Maximum characters per chunk (default: MAX_SPEECH_CHUNK_CHARS)
 * @returns Array of speech-ready text chunks
 */
export function chunkForSpeech(text: string, maxChars = MAX_SPEECH_CHUNK_CHARS): string[] {
  return splitSpeechChunks(toSpeechText(text), maxChars);
}

/**
 * Converts ArrayBuffer to base64 string for browser playback.
 * @param bytes Audio data as ArrayBuffer
 * @returns Base64-encoded string
 */
function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  // Process in chunks to avoid call stack limits
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Synthesizes Persian speech with cascading TTS provider fallback.
 *
 * Priority:
 * 1. ElevenLabs Multilingual v2 (best Persian quality, no accent)
 * 2. Lovable AI Gateway (OpenAI TTS with Persian instructions)
 * 3. Throws error if both fail
 *
 * @param text Text to synthesize (will be normalized for speech)
 * @param context Previous/next chunks for better prosody continuity
 * @returns Base64 MP3 audio and MIME type
 * @throws {Error} If all TTS providers fail
 */
export async function synthesizePersian(
  text: string,
  context: { previous?: string | undefined; next?: string | undefined } = {},
): Promise<{ audio: string; mime: string }> {
  const settings = await ttsSettings();
  // Written Persian is rewritten into speakable Persian first: digits become
  // words, markdown disappears and punctuation carries the prosody.
  const spoken = toSpeechText(text);
  const previous = context.previous ? toSpeechText(context.previous) : undefined;
  const next = context.next ? toSpeechText(context.next) : undefined;

  // ElevenLabs speaks first: its multilingual v2 model delivers by far the
  // most natural, accent-free Persian. The gateway voice is the fallback.
  let elevenError: Error | null = null;
  try {
    const { synthesizeWithElevenLabs } = await import("./elevenlabs.server");
    const eleven = await synthesizeWithElevenLabs(spoken, settings.speed, { previous, next });
    if (eleven) return eleven;
  } catch (error) {
    elevenError = error instanceof Error ? error : new Error(String(error));
    console.error("[TTS] ElevenLabs failed, falling back to gateway:", {
      error: elevenError.message,
      text: spoken.slice(0, 50),
      speed: settings.speed,
    });
  }

  try {
    const clampedSpeed = Math.max(MIN_TTS_SPEED, Math.min(MAX_TTS_SPEED, settings.speed));
    const response = await gatewayFetch("/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: spoken,
        voice: settings.voice,
        instructions: PERSIAN_INSTRUCTIONS,
        speed: clampedSpeed,
        response_format: "mp3",
      }),
    });
    if (response.ok) {
      const audioBuffer = await response.arrayBuffer();
      if (audioBuffer.byteLength === 0) {
        console.error("[TTS] Gateway returned empty audio buffer");
        throw new Error(`${ERROR_TTS_FAILED}: Empty audio response`);
      }
      return { audio: toBase64(audioBuffer), mime: "audio/mpeg" };
    }
    const detail = (await response.text()).slice(0, 300);
    console.error("[TTS] Gateway TTS request failed:", {
      status: response.status,
      detail: detail.slice(0, 100),
    });
    throw new Error(`${ERROR_TTS_FAILED}_${response.status}: ${detail}`);
  } catch (error) {
    console.error("[TTS] Gateway TTS fallback failed:", {
      error: error instanceof Error ? error.message : String(error),
      text: spoken.slice(0, 50),
      model: TTS_MODEL,
      speed: settings.speed,
    });
    // Re-throw if it's already a TTS_FAILED error
    if (error instanceof Error && error.message.includes(ERROR_TTS_FAILED)) {
      throw error;
    }
  }

  // Both providers failed - throw the more specific error if available
  throw elevenError ?? new Error(`${ERROR_TTS_FAILED}: سرویس صدا در دسترس نیست.`);
}

