import { sql } from "@/lib/db/client.server";
import { loadStoredKeys } from "./keystore.server";

/**
 * ElevenLabs provider. Its multilingual voices read Persian far more naturally
 * than generic gateway voices, so when an operator stores an ElevenLabs key it
 * becomes the primary voice for spoken answers.
 */
const BASE = "https://api.elevenlabs.io";

export interface ElevenVoiceOption {
  voiceId: string;
  name: string;
  category: string | null;
  labels: Record<string, string>;
  previewUrl: string | null;
  languages: string[];
}

export interface ElevenSettings {
  enabled: boolean;
  voiceId: string;
  voiceName: string;
  model: string;
  stability: number;
  similarity: number;
  style: number;
}

export async function elevenLabsKey(): Promise<string | null> {
  const stored = await loadStoredKeys();
  // Runtime secret is authoritative so a securely rotated key cannot be
  // shadowed by an older value saved through the legacy admin key form.
  const key = process.env["ELEVENLABS_API_KEY"] || stored.ELEVENLABS_API_KEY || "";
  return key.trim() || null;
}


export async function elevenSettings(): Promise<ElevenSettings> {
  try {
    const [data] = await sql<Record<string, unknown>[]>`
      SELECT elevenlabs_enabled, elevenlabs_voice_id, elevenlabs_voice_name, elevenlabs_model,
             elevenlabs_stability, elevenlabs_similarity, elevenlabs_style
      FROM app_settings
      LIMIT 1
    `;
    const row = data ?? {};
    return {
      enabled: row["elevenlabs_enabled"] !== false,
      voiceId: String(row["elevenlabs_voice_id"] ?? ""),
      voiceName: String(row["elevenlabs_voice_name"] ?? ""),
      model: "eleven_multilingual_v2",
      stability: Number(row["elevenlabs_stability"] ?? 0.45),
      similarity: Number(row["elevenlabs_similarity"] ?? 0.8),
      style: Number(row["elevenlabs_style"] ?? 0.35),
    };
  } catch {
    return {
      enabled: true,
      voiceId: "",
      voiceName: "",
      model: "eleven_multilingual_v2",
      stability: 0.45,
      similarity: 0.8,
      style: 0.35,
    };
  }
}

export interface ElevenVoiceListResult {
  voices: ElevenVoiceOption[];
  error: string | null;
}

/** Turns an ElevenLabs error body into an exact Persian reason. */
export async function describeElevenError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  let status = "";
  let message = "";
  try {
    const body = JSON.parse(raw) as { detail?: unknown };
    const detail = body.detail;
    if (typeof detail === "string") message = detail;
    else if (detail && typeof detail === "object") {
      status = String((detail as { status?: unknown }).status ?? "");
      message = String((detail as { message?: unknown }).message ?? "");
    }
  } catch {
    message = raw.slice(0, 200);
  }

  if (status === "missing_permissions" || /missing_permissions|permission/i.test(message)) {
    return `کلید معتبر است اما دسترسی لازم را ندارد (${status || "missing_permissions"}). در داشبورد ElevenLabs برای این کلید دسترسی‌های Voices (خواندن) و Text to Speech را فعال کنید.`;
  }
  if (status === "detected_unusual_activity" || /unusual activity/i.test(message)) {
    return "حساب ElevenLabs به‌دلیل «فعالیت غیرعادی» موقتاً محدود شده است؛ برای رفع آن باید اشتراک پولی فعال شود.";
  }
  if (status === "quota_exceeded" || /quota/i.test(message)) {
    return "سهمیهٔ کاراکترهای حساب ElevenLabs تمام شده است.";
  }
  if (response.status === 401) {
    return `کلید پذیرفته نشد (۴۰۱)${message ? `: ${message}` : "؛ کلید را دوباره از داشبورد ElevenLabs کپی کنید (بدون فاصلهٔ اضافی)."}`;
  }
  if (response.status === 429) return "سقف درخواست ElevenLabs پر شده است (۴۲۹)؛ کمی بعد تلاش کنید.";
  if (response.status >= 500) return `سرویس ElevenLabs در دسترس نیست (کد ${response.status}).`;
  return `درخواست پذیرفته نشد (کد ${response.status})${message ? `: ${message}` : ""}`;
}

export interface ElevenDiagnostics {
  ok: boolean;
  keyPresent: boolean;
  keyPreview: string | null;
  steps: { label: string; ok: boolean; detail: string }[];
}

/** One-click key test: checks access and synthesizes a real Persian phrase. */
export async function diagnoseElevenLabs(): Promise<ElevenDiagnostics> {
  const key = await elevenLabsKey();
  if (!key) {
    return {
      ok: false,
      keyPresent: false,
      keyPreview: null,
      steps: [
        {
          label: "کلید ذخیره‌شده",
          ok: false,
          detail: "هیچ کلید ElevenLabs در پنل ذخیره نشده است.",
        },
      ],
    };
  }

  const preview = `${key.slice(0, 6)}…${key.slice(-4)} (${key.length} کاراکتر)`;
  const steps: ElevenDiagnostics["steps"] = [];
  const probe = async (label: string, path: string) => {
    try {
      const response = await fetch(`${BASE}${path}`, { headers: { "xi-api-key": key } });
      if (response.ok) {
        steps.push({ label, ok: true, detail: "موفق (کد ۲۰۰)." });
        return response;
      }
      steps.push({ label, ok: false, detail: await describeElevenError(response) });
      return null;
    } catch (error) {
      steps.push({
        label,
        ok: false,
        detail: `ارتباط شبکه برقرار نشد: ${error instanceof Error ? error.message : "نامشخص"}`,
      });
      return null;
    }
  };

  const user = await probe("اعتبار کلید (حساب کاربری)", "/v1/user");
  const voices = await probe("دسترسی فهرست صداها", "/v1/voices");
  const settings = await elevenSettings();
  const voiceId = settings.voiceId || DEFAULT_VOICE_ID;
  let speech: Response | null = null;
  try {
    const response = await fetch(
      `${BASE}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "سلام، خوش آمدید. امروز با فارسی روان و طبیعی با شما گفت‌وگو می‌کنم.",
          model_id: "eleven_multilingual_v2",
          apply_text_normalization: "auto",
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarity,
            style: settings.style,
            use_speaker_boost: true,
            speed: 0.94,
          },
        }),
      },
    );
    if (response.ok) {
      speech = response;
      steps.push({
        label: "تولید واقعی فارسی",
        ok: true,
        detail: `موفق با مدل eleven_multilingual_v2 و صدای «${settings.voiceName || voiceId}».`,
      });
    } else {
      steps.push({ label: "تولید واقعی فارسی", ok: false, detail: await describeElevenError(response) });
    }
  } catch (error) {
    steps.push({
      label: "تولید واقعی فارسی",
      ok: false,
      detail: `ارتباط شبکه برقرار نشد: ${error instanceof Error ? error.message : "نامشخص"}`,
    });
  }

  return {
    ok: Boolean(user && voices && speech) && steps.every((step) => step.ok),
    keyPresent: true,
    keyPreview: preview,
    steps,
  };
}

/**
 * Voices available on the operator's ElevenLabs account. Never throws: an
 * invalid or missing key is an operator-fixable state, not a crash.
 */
export async function listElevenVoices(): Promise<ElevenVoiceListResult> {
  const key = await elevenLabsKey();
  if (!key) return { voices: [], error: "کلید ElevenLabs ذخیره نشده است." };
  let response: Response;
  try {
    response = await fetch(`${BASE}/v1/voices`, { headers: { "xi-api-key": key.trim() } });
  } catch {
    return { voices: [], error: "اتصال به ElevenLabs برقرار نشد؛ دوباره تلاش کنید." };
  }
  if (!response.ok) {
    return { voices: [], error: await describeElevenError(response) };
  }


  const payload = (await response.json()) as {
    voices?: {
      voice_id: string;
      name: string;
      category?: string | null;
      labels?: Record<string, string> | null;
      preview_url?: string | null;
      verified_languages?: { language?: string }[] | null;
      fine_tuning?: { language?: string | null } | null;
    }[];
  };
  const voices = (payload.voices ?? []).map((voice) => ({
    voiceId: voice.voice_id,
    name: voice.name,
    category: voice.category ?? null,
    labels: voice.labels ?? {},
    previewUrl: voice.preview_url ?? null,
    languages: Array.from(
      new Set(
        [
          ...(voice.verified_languages ?? []).map((item) => item.language ?? ""),
          voice.fine_tuning?.language ?? "",
        ].filter(Boolean),
      ),
    ),
  }));
  return { voices, error: null };
}


function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export interface SpeechContext {
  /** Text spoken just before this chunk; keeps prosody continuous. */
  previous?: string | undefined;
  /** Text that follows; stops the chunk ending with a hard full stop. */
  next?: string | undefined;
}

/**
 * Fallback voice when none is selected in the panel — Sarah is a multilingual
 * voice whose Persian delivery is clean. Restricted keys without voices_read
 * cannot list the account's voices, so synthesis must not depend on a saved
 * voice id.
 */
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

/** Speaks one chunk with the selected ElevenLabs voice; returns base64 MP3. */
export async function synthesizeWithElevenLabs(
  text: string,
  speed: number,
  context: SpeechContext = {},
): Promise<{ audio: string; mime: string } | null> {
  const [key, settings] = await Promise.all([elevenLabsKey(), elevenSettings()]);
  if (!key || !settings.enabled) return null;
  const voiceId = settings.voiceId || DEFAULT_VOICE_ID;

  const response = await fetch(
    // output_format must ride in the query string, never the JSON body.
    `${BASE}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        // Multilingual v2 handles Persian phonetics far better than turbo.
        // It auto-detects Persian — sending language_code "fa" is rejected
        // with unsupported_language, so no language hint is sent.
        // Keep the quality model fixed for Persian. Persisted legacy turbo
        // settings must never silently lower pronunciation quality again.
        model_id: "eleven_multilingual_v2",
        // Request stitching: neighbouring text keeps intonation continuous
        // across chunks instead of restarting on every clip.
        ...(context.previous ? { previous_text: context.previous.slice(-500) } : {}),
        ...(context.next ? { next_text: context.next.slice(0, 500) } : {}),
        apply_text_normalization: "auto",
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarity,
          style: settings.style,
          use_speaker_boost: true,
          speed: Math.min(1.2, Math.max(0.7, speed)),
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`ELEVENLABS_TTS_${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return { audio: toBase64(await response.arrayBuffer()), mime: "audio/mpeg" };
}


export async function saveElevenVoice(input: {
  voiceId: string;
  voiceName: string;
  model: string;
  stability: number;
  similarity: number;
  style: number;
}) {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM app_settings LIMIT 1`;
  if (!row) throw new Error("تنظیمات سامانه در دسترس نیست.");
  try {
    await sql`
      UPDATE app_settings
      SET elevenlabs_voice_id = ${input.voiceId},
          elevenlabs_voice_name = ${input.voiceName},
          elevenlabs_model = 'eleven_multilingual_v2',
          elevenlabs_stability = ${input.stability},
          elevenlabs_similarity = ${input.similarity},
          elevenlabs_style = ${input.style},
          updated_at = now()
      WHERE id = ${row.id}
    `;
  } catch {
    throw new Error("ذخیرهٔ صدای ElevenLabs ناموفق بود.");
  }
  return { ok: true as const };
}

export interface SharedPersianVoice {
  voiceId: string;
  ownerId: string;
  name: string;
  gender: string;
  accent: string;
  description: string;
  previewUrl: string | null;
}

/**
 * Native Persian voices from the shared library. Free plans cannot use library
 * voices through the API (402), so the caller surfaces that as a plan message.
 */
export async function listSharedPersianVoices(): Promise<{
  voices: SharedPersianVoice[];
  error: string | null;
}> {
  const key = await elevenLabsKey();
  if (!key) return { voices: [], error: "کلید ElevenLabs ذخیره نشده است." };
  let response: Response;
  try {
    response = await fetch(
      `${BASE}/v1/shared-voices?page_size=100&language=fa`,
      { headers: { "xi-api-key": key } },
    );
  } catch {
    return { voices: [], error: "اتصال به ElevenLabs برقرار نشد؛ دوباره تلاش کنید." };
  }
  if (!response.ok) return { voices: [], error: await describeElevenError(response) };
  const payload = (await response.json()) as {
    voices?: {
      voice_id: string;
      public_owner_id: string;
      name: string;
      gender?: string | null;
      accent?: string | null;
      description?: string | null;
      preview_url?: string | null;
    }[];
  };
  const voices = (payload.voices ?? []).map((voice) => ({
    voiceId: voice.voice_id,
    ownerId: voice.public_owner_id,
    name: voice.name,
    gender: voice.gender ?? "",
    accent: voice.accent ?? "",
    description: voice.description ?? "",
    previewUrl: voice.preview_url ?? null,
  }));
  return { voices, error: null };
}

/** Ranks native Persian voices: a young Tehrani male first, Noushin next. */
function rankPersianVoice(voice: SharedPersianVoice, prefer: "male" | "female"): number {
  const text = `${voice.name} ${voice.accent} ${voice.description}`.toLowerCase();
  let score = 0;
  if (voice.gender.toLowerCase() === prefer) score += 40;
  if (/noushin|نوشین/i.test(voice.name)) score += prefer === "female" ? 35 : 10;
  if (/tehran|iranian|persian|farsi/.test(text)) score += 20;
  if (/young|youth|جوان/.test(text)) score += 15;
  if (/conversational|narration|natural|warm/.test(text)) score += 10;
  return score;
}

/**
 * Copies the best native Persian voice into the account and selects it.
 * Needs a paid plan: the library endpoint answers 402 for free keys.
 */
export async function activatePersianLibraryVoice(
  prefer: "male" | "female" = "male",
): Promise<{ ok: boolean; voiceId?: string; voiceName?: string; error?: string }> {
  const key = await elevenLabsKey();
  if (!key) return { ok: false, error: "کلید ElevenLabs ذخیره نشده است." };
  const { voices, error } = await listSharedPersianVoices();
  if (error) return { ok: false, error };
  if (!voices.length) return { ok: false, error: "هیچ صدای بومی فارسی در کتابخانه پیدا نشد." };

  const ordered = [...voices].sort(
    (a, b) => rankPersianVoice(b, prefer) - rankPersianVoice(a, prefer),
  );
  let lastError = "افزودن صدای فارسی ناموفق بود.";
  for (const candidate of ordered.slice(0, 5)) {
    const response = await fetch(
      `${BASE}/v1/voices/add/${candidate.ownerId}/${candidate.voiceId}`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: candidate.name }),
      },
    );
    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as { voice_id?: string };
      const voiceId = body.voice_id || candidate.voiceId;
      const settings = await elevenSettings();
      await saveElevenVoice({
        voiceId,
        voiceName: candidate.name,
        model: "eleven_multilingual_v2",
        stability: settings.stability,
        similarity: settings.similarity,
        style: settings.style,
      });
      return { ok: true, voiceId, voiceName: candidate.name };
    }
    if (response.status === 402) {
      return {
        ok: false,
        error:
          "استفاده از صداهای کتابخانهٔ ElevenLabs (از جمله صداهای بومی فارسی) فقط با اشتراک پولی ممکن است؛ پس از ارتقای حساب و ثبت کلید جدید، همین دکمه صدا را فعال می‌کند.",
      };
    }
    lastError = await describeElevenError(response);
  }
  return { ok: false, error: lastError };
}

