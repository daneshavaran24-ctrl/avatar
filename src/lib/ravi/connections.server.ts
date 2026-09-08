import { sql } from "@/lib/db/client.server";
import { providerConfig } from "./providers.server";
import { storedKeyStatus } from "./keystore.server";
import { detectAvatarVendor } from "./heygen.server";
import { elevenLabsKey, elevenSettings } from "./elevenlabs.server";

export type ConnectionKey = "openai" | "heygen" | "openrouter" | "groq" | "elevenlabs";
export type ToggleableKey = "heygen" | "openrouter" | "groq" | "elevenlabs";

export interface ConnectionStatus {
  key: ConnectionKey;
  configured: boolean;
  secretName: string | null;
  enabled: boolean;
  lastCheck: { ok: boolean; message: string; latencyMs: number | null; at: string } | null;
}

interface SettingsRow {
  id: string;
  heygen_avatar_id: string;
  heygen_voice_id: string;
  heygen_avatar_name: string;
  heygen_voice_name: string;
  openrouter_model: string;
  heygen_enabled: boolean;
  openrouter_enabled: boolean;
  groq_enabled: boolean;
  connection_status: Record<string, unknown>;
}

async function settingsRow(): Promise<SettingsRow> {
  const [data] = await sql<SettingsRow[]>`
    SELECT id, heygen_avatar_id, heygen_voice_id, heygen_avatar_name, heygen_voice_name,
           openrouter_model, heygen_enabled, openrouter_enabled, groq_enabled, connection_status
    FROM app_settings
    LIMIT 1
  `;
  if (!data) throw new Error("تنظیمات سامانه در دسترس نیست.");
  return data;
}

type CheckRecord = { ok: boolean; message: string; latencyMs: number | null; at: string };

function readChecks(row: SettingsRow): Record<string, CheckRecord> {
  const raw = row.connection_status;
  return (raw && typeof raw === "object" ? raw : {}) as Record<string, CheckRecord>;
}

/** Appends a new immutable snapshot of the operational settings. */
async function recordVersion(label: string, userId: string | null) {
  const row = await settingsRow();
  const [last] = await sql<{ version: number }[]>`
    SELECT version FROM settings_versions ORDER BY version DESC LIMIT 1
  `;
  const version = (last?.version ?? 0) + 1;
  const payload = {
    heygen_avatar_id: row.heygen_avatar_id,
    heygen_voice_id: row.heygen_voice_id,
    heygen_avatar_name: row.heygen_avatar_name,
    heygen_voice_name: row.heygen_voice_name,
    openrouter_model: row.openrouter_model,
    heygen_enabled: row.heygen_enabled,
    openrouter_enabled: row.openrouter_enabled,
    groq_enabled: row.groq_enabled,
  };
  await sql`
    INSERT INTO settings_versions (version, label, created_by, payload)
    VALUES (${version}, ${label}, ${userId}, ${sql.json(payload)})
  `;
  return version;
}

/** Only booleans cross the wire — key values never leave the server. */
export async function connectionOverview() {
  const config = await providerConfig();
  const keys = await storedKeyStatus();
  const eleven = await elevenSettings();
  const data = await settingsRow();
  const checks = readChecks(data);
  const avatarVendor = config.heygenKey ? await detectAvatarVendor(config.heygenKey) : null;

  const connections: ConnectionStatus[] = [
    {
      // OpenAI is the mandatory baseline: chat, embeddings, transcription and
      // the fallback voice all run through it.
      key: "openai",
      configured: Boolean(config.storedKeys.openAiKey),
      secretName: "OPENAI_API_KEY",
      enabled: true,
      lastCheck: checks["openai"] ?? null,
    },
    {
      key: "heygen",
      configured: Boolean(config.storedKeys.heygenKey),
      secretName: "HEYGEN_API_KEY",
      enabled: config.enabled.heygen,
      lastCheck: checks["heygen"] ?? null,
    },
    {
      key: "openrouter",
      configured: Boolean(config.storedKeys.openRouterKey),
      secretName: "OPENROUTER_API_KEY",
      enabled: config.enabled.openrouter,
      lastCheck: checks["openrouter"] ?? null,
    },
    {
      key: "groq",
      configured: Boolean(config.storedKeys.groqKey),
      secretName: "GROQ_API_KEY",
      enabled: config.enabled.groq,
      lastCheck: checks["groq"] ?? null,
    },
    {
      key: "elevenlabs",
      configured: Boolean(await elevenLabsKey()),
      secretName: "ELEVENLABS_API_KEY",
      enabled: eleven.enabled,
      lastCheck: checks["elevenlabs"] ?? null,
    },
  ];

  return {
    connections,
    keys,
    activeChat: config.openRouterKey ? ("openrouter" as const) : ("openai" as const),
    activeStt: config.groqKey ? ("groq" as const) : ("openai" as const),
    avatarActive: Boolean(config.heygenKey),
    avatarVendor,
    avatarSession: (checks["avatar_session"] ?? null) as
      | { ok?: boolean; reason?: string; checked_at?: string }
      | null,
    avatar: {
      avatarId: data.heygen_avatar_id || config.heygenAvatarId || "",
      voiceId: data.heygen_voice_id || config.heygenVoiceId || "",
      avatarName: data.heygen_avatar_name || "",
      voiceName: data.heygen_voice_name || "",
    },
    openRouterModel: data.openrouter_model || config.openRouterModel,
    elevenlabs: eleven,
  };
}

export interface ConnectionTestResult {
  key: ConnectionKey;
  ok: boolean;
  message: string;
  latencyMs: number;
}

/** A light, read-only request per provider — never a generation call. */
export async function testConnection(key: ConnectionKey): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  const result = await runTest(key);
  const withLatency = { ...result, latencyMs: Date.now() - startedAt };
  await persistCheck(key, withLatency);
  return withLatency;
}

async function persistCheck(key: ConnectionKey, result: Omit<ConnectionTestResult, "key">) {
  try {
    const row = await settingsRow();
    const checks = readChecks(row);
    checks[key] = {
      ok: result.ok,
      message: result.message,
      latencyMs: result.latencyMs,
      at: new Date().toISOString(),
    };
    await sql`
      UPDATE app_settings SET connection_status = ${sql.json(checks)} WHERE id = ${row.id}
    `;
  } catch {
    // A failed audit write must never mask the test result.
  }
}

async function runTest(key: ConnectionKey): Promise<Omit<ConnectionTestResult, "latencyMs">> {
  const config = await providerConfig();

  try {
    if (key === "openai") {
      if (!config.openAiKey) return fail(key, "کلید OpenAI ثبت نشده است.");
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${config.openAiKey}` },
      });
      return response.ok
        ? ok(key, "کلید OpenAI معتبر است؛ پاسخ‌گویی، بردارسازی و صدا در دسترس است.")
        : fail(key, describeStatus(response.status));
    }

    if (key === "heygen") {
      if (!config.storedKeys.heygenKey) return fail(key, "کلید HeyGen ثبت نشده است.");
      const vendor = await detectAvatarVendor(config.storedKeys.heygenKey);
      const label = vendor === "liveavatar" ? "LiveAvatar" : "HeyGen";
      const response = await fetch(
        vendor === "liveavatar"
          ? "https://api.liveavatar.com/v1/users/credits"
          : "https://api.heygen.com/v2/user/remaining_quota",
        {
          headers:
            vendor === "liveavatar"
              ? { "X-API-KEY": config.storedKeys.heygenKey }
              : { "x-api-key": config.storedKeys.heygenKey },
        },
      );
      return response.ok
        ? ok(
            key,
            config.enabled.heygen
              ? `کلید ${label} معتبر است و آواتار زنده در دسترس است.`
              : `کلید ${label} معتبر است، اما سرویس در پنل غیرفعال شده است.`,
          )
        : fail(key, describeStatus(response.status));
    }

    if (key === "openrouter") {
      if (!config.storedKeys.openRouterKey) return fail(key, "کلید OpenRouter ثبت نشده است.");
      const response = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${config.storedKeys.openRouterKey}` },
      });
      return response.ok
        ? ok(
            key,
            config.enabled.openrouter
              ? "کلید OpenRouter معتبر است و در خط پاسخ‌گویی استفاده می‌شود."
              : "کلید OpenRouter معتبر است، اما سرویس در پنل غیرفعال شده است.",
          )
        : fail(key, describeStatus(response.status));
    }

    if (key === "elevenlabs") {
      const elevenKey = await elevenLabsKey();
      if (!elevenKey) return fail(key, "کلید ElevenLabs ثبت نشده است.");
      const elevenResponse = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": elevenKey },
      });
      const settings = await elevenSettings();
      return elevenResponse.ok
        ? ok(
            key,
            settings.enabled
              ? settings.voiceId
                ? `کلید ElevenLabs معتبر است و صدای «${settings.voiceName || settings.voiceId}» برای پاسخ‌ها استفاده می‌شود.`
                : "کلید ElevenLabs معتبر است؛ اکنون یک صدا را از گالری انتخاب کنید."
              : "کلید ElevenLabs معتبر است، اما سرویس در پنل غیرفعال شده است.",
          )
        : fail(key, describeStatus(elevenResponse.status));
    }

    if (!config.storedKeys.groqKey) return fail(key, "کلید Groq ثبت نشده است.");
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${config.storedKeys.groqKey}` },
    });
    return response.ok
      ? ok(
          key,
          config.enabled.groq
            ? "کلید Groq معتبر است و برای گفتار به متن استفاده می‌شود."
            : "کلید Groq معتبر است، اما سرویس در پنل غیرفعال شده است.",
        )
      : fail(key, describeStatus(response.status));
  } catch {
    return fail(key, "ارتباط با سرویس برقرار نشد (سرویس در دسترس نیست یا شبکه پاسخ نداد).");
  }
}

function describeStatus(status: number): string {
  if (status === 401 || status === 403) return `کلید نامعتبر یا فاقد دسترسی است (کد ${status}).`;
  if (status === 429) return "سقف درخواست سرویس پر شده است (کد ۴۲۹).";
  if (status >= 500) return `سرویس در دسترس نیست (کد ${status}).`;
  return `کلید پذیرفته نشد (کد ${status}).`;
}

function ok(key: ConnectionKey, message: string) {
  return { key, ok: true, message };
}

function fail(key: ConnectionKey, message: string) {
  return { key, ok: false, message };
}

const TOGGLE_COLUMN: Record<ToggleableKey, string> = {
  heygen: "heygen_enabled",
  openrouter: "openrouter_enabled",
  groq: "groq_enabled",
  elevenlabs: "elevenlabs_enabled",
};

const TOGGLE_LABEL: Record<ToggleableKey, string> = {
  heygen: "HeyGen",
  openrouter: "OpenRouter",
  groq: "Groq",
  elevenlabs: "ElevenLabs",
};

/** The only columns a stored settings snapshot is allowed to write back. */
const RESTORABLE_COLUMNS = [
  "heygen_avatar_id",
  "heygen_voice_id",
  "heygen_avatar_name",
  "heygen_voice_name",
  "openrouter_model",
  "heygen_enabled",
  "openrouter_enabled",
  "groq_enabled",
] as const;

/** Flips a service on/off without touching the stored key. */
export async function toggleService(
  input: { key: ToggleableKey; enabled: boolean },
  userId: string | null,
) {
  const row = await settingsRow();
  try {
    // Column name comes from the TOGGLE_COLUMN map, never from caller input.
    await sql`
      UPDATE app_settings
      SET ${sql(TOGGLE_COLUMN[input.key])} = ${input.enabled}, updated_at = now()
      WHERE id = ${row.id}
    `;
  } catch {
    throw new Error("تغییر وضعیت سرویس ناموفق بود.");
  }
  await recordVersion(
    `${TOGGLE_LABEL[input.key]} ${input.enabled ? "فعال شد" : "غیرفعال شد"}`,
    userId,
  );
  return { ok: true as const };
}

export async function saveAvatarSelection(input: {
  avatarId: string;
  voiceId: string;
  avatarName: string;
  voiceName: string;
  previewUrl?: string;
}, userId: string | null) {
  const current = await settingsRow();
  try {
    await sql`
      UPDATE app_settings
      SET heygen_avatar_id = ${input.avatarId},
          heygen_voice_id = ${input.voiceId},
          heygen_avatar_name = ${input.avatarName},
          heygen_voice_name = ${input.voiceName},
          heygen_avatar_preview = ${input.previewUrl || null},
          updated_at = now()
      WHERE id = ${current.id}
    `;
  } catch {
    throw new Error("ذخیرهٔ انتخاب آواتار ناموفق بود.");
  }
  await recordVersion(`چهره: ${input.avatarName || input.avatarId || "بدون نام"}`, userId);
  return { ok: true as const };
}

export async function saveOpenRouterModel(model: string, userId: string | null) {
  const current = await settingsRow();
  try {
    await sql`
      UPDATE app_settings
      SET openrouter_model = ${model}, updated_at = now()
      WHERE id = ${current.id}
    `;
  } catch {
    throw new Error("ذخیرهٔ مدل ناموفق بود.");
  }
  await recordVersion(`مدل OpenRouter: ${model}`, userId);
  return { ok: true as const };
}

export async function listSettingsVersions() {
  try {
    return await sql<{ id: string; version: number; label: string; created_at: string }[]>`
      SELECT id, version, label, created_at
      FROM settings_versions
      ORDER BY version DESC
      LIMIT 50
    `;
  } catch {
    throw new Error("دریافت تاریخچهٔ تنظیمات ناموفق بود.");
  }
}

export async function restoreSettingsVersion(versionId: string, userId: string | null) {
  const [record] = await sql<{ version: number; payload: Record<string, unknown> }[]>`
    SELECT version, payload FROM settings_versions WHERE id = ${versionId} LIMIT 1
  `;
  if (!record) throw new Error("نسخهٔ مورد نظر یافت نشد.");

  const current = await settingsRow();
  // Restore only the columns recordVersion() snapshots, so a stored payload can
  // never reach a column it was not meant to write.
  const payload = record.payload as Record<string, unknown>;
  const restorable = RESTORABLE_COLUMNS.filter((column) => column in payload);
  if (restorable.length === 0) throw new Error("این نسخه داده‌ای برای بازگردانی ندارد.");

  try {
    await sql`
      UPDATE app_settings
      SET ${sql(payload, ...restorable)}, updated_at = now()
      WHERE id = ${current.id}
    `;
  } catch {
    throw new Error("بازگردانی نسخه ناموفق بود.");
  }
  await recordVersion(`بازگردانی به نسخهٔ ${record.version}`, userId);
  return { ok: true as const };
}
