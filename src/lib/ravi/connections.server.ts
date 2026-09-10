import { sql } from "@/lib/db/client.server";
import { providerConfig } from "./providers.server";
import { storedKeyStatus } from "./keystore.server";
import { detectAvatarVendor } from "./heygen.server";

export type ConnectionKey = "openai" | "heygen";
export type ToggleableKey = "heygen";

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
  heygen_enabled: boolean;
  connection_status: Record<string, unknown>;
}

async function settingsRow(): Promise<SettingsRow> {
  const [data] = await sql<SettingsRow[]>`
    SELECT id, heygen_avatar_id, heygen_voice_id, heygen_avatar_name, heygen_voice_name,
           heygen_enabled, connection_status
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
    heygen_enabled: row.heygen_enabled,
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

  let data: SettingsRow | null = null;
  try { data = await settingsRow(); } catch { /* DB unreachable — use env var defaults */ }

  const checks = data ? readChecks(data) : {} as Record<string, CheckRecord>;

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
  ];

  return {
    connections,
    keys,
    activeChat: "openai" as const,
    activeStt: "openai" as const,
    avatarActive: Boolean(config.heygenKey),
    dbAvailable: data !== null,
    avatarSession: (checks["avatar_session"] ?? null) as
      | { ok?: boolean; reason?: string; checked_at?: string }
      | null,
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
      if (!config.storedKeys.heygenKey) return fail(key, "کلید LiveAvatar ثبت نشده است.");
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

    return fail(key, "سرویس ناشناخته است.");
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
};

const TOGGLE_LABEL: Record<ToggleableKey, string> = {
  heygen: "LiveAvatar",
};

/** The only columns a stored settings snapshot is allowed to write back. */
const RESTORABLE_COLUMNS = [
  "heygen_avatar_id",
  "heygen_voice_id",
  "heygen_avatar_name",
  "heygen_voice_name",
  "heygen_enabled",
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
