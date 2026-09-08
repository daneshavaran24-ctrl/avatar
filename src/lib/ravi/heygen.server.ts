import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { providerConfig } from "./providers.server";

export interface AvatarCredentials {
  token: string;
  avatarId: string | null;
  voiceId: string | null;
  avatarName: string | null;
  voiceName: string | null;
  previewUrl: string | null;
}

export type AvatarVendor = "heygen" | "liveavatar";

export type AvatarSessionResult =
  | ({ configured: true; vendor: AvatarVendor } & AvatarCredentials)
  | { configured: false; reason: string; previewUrl: string | null; avatarName: string | null };

export interface HeygenAvatarOption {
  avatarId: string;
  name: string;
  previewUrl: string | null;
  gender: string | null;
  interactive: boolean;
}

export interface HeygenVoiceOption {
  voiceId: string;
  name: string;
  language: string | null;
  gender: string | null;
  previewUrl: string | null;
  interactive: boolean;
}

const HEYGEN_BASE = "https://api.heygen.com";
const LIVEAVATAR_BASE = "https://api.liveavatar.com";

/** Keeps the last avatar-session outcome visible in the admin panel. */
async function recordAvatarSessionStatus(ok: boolean, reason: string) {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("id, connection_status")
      .limit(1)
      .maybeSingle();
    if (!data) return;
    const current = (data.connection_status ?? {}) as Record<string, unknown>;
    await supabaseAdmin
      .from("app_settings")
      .update({
        connection_status: {
          ...current,
          avatar_session: { ok, reason, checked_at: new Date().toISOString() },
        },
      })
      .eq("id", data.id);
  } catch {
    /* status logging must never break the session */
  }
}

/**
 * Keys minted at app.liveavatar.com/developers are LiveAvatar keys and are
 * rejected by api.heygen.com. We probe LiveAvatar first (cheap credits call)
 * and fall back to classic HeyGen.
 */
const vendorCache = new Map<string, AvatarVendor>();

export async function detectAvatarVendor(key: string): Promise<AvatarVendor> {
  const cached = vendorCache.get(key);
  if (cached) return cached;

  let vendor: AvatarVendor = "heygen";
  try {
    const response = await fetch(`${LIVEAVATAR_BASE}/v1/users/credits`, {
      headers: { "X-API-KEY": key, accept: "application/json" },
    });
    if (response.ok) vendor = "liveavatar";
  } catch {
    /* fall through to heygen */
  }
  vendorCache.set(key, vendor);
  return vendor;
}

async function heygenGet<T>(path: string, key: string): Promise<T> {
  const response = await fetch(`${HEYGEN_BASE}${path}`, {
    headers: { "x-api-key": key, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HEYGEN_${response.status}`);
  return (await response.json()) as T;
}

async function liveAvatarGet<T>(path: string, key: string): Promise<T> {
  const response = await fetch(`${LIVEAVATAR_BASE}${path}`, {
    headers: { "X-API-KEY": key, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`LIVEAVATAR_${response.status}`);
  return (await response.json()) as T;
}

/** Panel selection wins over the environment defaults. */
async function selectedAvatar(): Promise<{
  avatarId: string | null;
  voiceId: string | null;
  avatarName: string | null;
  voiceName: string | null;
  previewUrl: string | null;
}> {
  const config = await providerConfig();
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select(
      "heygen_avatar_id, heygen_voice_id, heygen_avatar_name, heygen_voice_name, heygen_avatar_preview",
    )
    .limit(1)
    .maybeSingle();

  const row = (data ?? {}) as Record<string, string | null>;
  return {
    avatarId: row["heygen_avatar_id"] || config.heygenAvatarId,
    voiceId: row["heygen_voice_id"] || config.heygenVoiceId,
    avatarName: row["heygen_avatar_name"] || null,
    voiceName: row["heygen_voice_name"] || null,
    previewUrl: row["heygen_avatar_preview"] || null,
  };
}

const PERSIAN_LANGUAGE = /persian|farsi|iran|^fa([-_]|$)/i;

let voiceCache: { at: number; voices: HeygenVoiceOption[] } | null = null;

async function cachedVoices(): Promise<HeygenVoiceOption[]> {
  if (voiceCache && Date.now() - voiceCache.at < 10 * 60_000) return voiceCache.voices;
  const voices = await listHeygenVoices();
  voiceCache = { at: Date.now(), voices };
  return voices;
}

/**
 * Answers are always written in Persian, so a voice built for another language
 * reads them with a heavy foreign accent. If the stored selection is not a
 * Persian voice, a Persian one from the same account is used (and remembered)
 * instead — this is the single biggest factor in how natural the avatar sounds.
 */
async function withPersianVoice<T extends { voiceId: string | null; voiceName: string | null }>(
  selection: T,
): Promise<T> {
  try {
    const voices = await cachedVoices();
    if (voices.length === 0) return selection;
    const current = voices.find((voice) => voice.voiceId === selection.voiceId);
    if (current && PERSIAN_LANGUAGE.test(current.language ?? "")) return selection;

    const persian = voices.filter(
      (voice) => voice.interactive !== false && PERSIAN_LANGUAGE.test(voice.language ?? ""),
    );
    if (persian.length === 0) return selection;
    const preferred =
      persian.find((voice) => (voice.gender ?? "").toLowerCase() === (current?.gender ?? "").toLowerCase()) ??
      persian[0]!;

    await supabaseAdmin
      .from("app_settings")
      .update({ heygen_voice_id: preferred.voiceId, heygen_voice_name: preferred.name })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    return { ...selection, voiceId: preferred.voiceId, voiceName: preferred.name };
  } catch {
    return selection;
  }
}


/**
 * Mints a short-lived HeyGen streaming session token. The long-lived API key
 * never leaves the server. Returns a typed "not configured / unavailable"
 * result instead of throwing, so the UI falls back to the orb + browser voice.
 */
export async function createHeygenSessionToken(): Promise<AvatarSessionResult> {
  // The stored selection also feeds the still preview the stage shows while the
  // live stream connects, so it is loaded even on the unconfigured paths.
  const selection = await withPersianVoice(await selectedAvatar());
  const fallback = (reason: string): AvatarSessionResult => ({
    configured: false,
    reason,
    previewUrl: selection.previewUrl,
    avatarName: selection.avatarName,
  });

  const { heygenKey } = await providerConfig();
  if (!heygenKey) {
    await recordAvatarSessionStatus(false, "HEYGEN_NOT_CONFIGURED");
    return fallback("HEYGEN_NOT_CONFIGURED");
  }

  try {
    const vendor = await detectAvatarVendor(heygenKey);
    if (vendor === "liveavatar") {
      if (!selection.avatarId) {
        await recordAvatarSessionStatus(false, "LIVEAVATAR_AVATAR_NOT_SELECTED");
        return fallback("LIVEAVATAR_AVATAR_NOT_SELECTED");
      }
      const response = await fetch(`${LIVEAVATAR_BASE}/v1/sessions/token`, {
        method: "POST",
        headers: { "X-API-KEY": heygenKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "FULL",
          avatar_id: selection.avatarId,
          // LiveAvatar rejects language "fa" ("Language not supported"), and the
          // avatar only repeats text we already generate in Persian, so no
          // language is requested here.
          ...(selection.voiceId ? { avatar_persona: { voice_id: selection.voiceId } } : {}),
        }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        await recordAvatarSessionStatus(false, `LIVEAVATAR_TOKEN_FAILED_${response.status}: ${detail}`);
        return fallback(`LIVEAVATAR_TOKEN_FAILED_${response.status}`);
      }
      const json = (await response.json()) as { data?: { session_token?: string } };
      const sessionToken = json.data?.session_token;
      if (!sessionToken) {
        await recordAvatarSessionStatus(false, "LIVEAVATAR_TOKEN_EMPTY");
        return fallback("LIVEAVATAR_TOKEN_EMPTY");
      }
      await recordAvatarSessionStatus(true, "LIVEAVATAR_OK");
      return { configured: true, vendor: "liveavatar", token: sessionToken, ...selection };
    }

    const response = await fetch(`${HEYGEN_BASE}/v1/streaming.create_token`, {
      method: "POST",
      headers: { "x-api-key": heygenKey, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      await recordAvatarSessionStatus(false, `HEYGEN_TOKEN_FAILED_${response.status}: ${detail}`);
      return fallback(`HEYGEN_TOKEN_FAILED_${response.status}`);
    }

    const json = (await response.json()) as { data?: { token?: string } };
    const token = json.data?.token;
    if (!token) {
      await recordAvatarSessionStatus(false, "HEYGEN_TOKEN_EMPTY");
      return fallback("HEYGEN_TOKEN_EMPTY");
    }

    await recordAvatarSessionStatus(true, "HEYGEN_OK");
    return { configured: true, vendor: "heygen", token, ...selection };
  } catch {
    await recordAvatarSessionStatus(false, "HEYGEN_UNREACHABLE");
    return fallback("HEYGEN_UNREACHABLE");
  }
}

interface StreamingAvatarRow {
  avatar_id?: string;
  avatar_name?: string;
  pose_name?: string;
  normal_preview?: string;
  gender?: string;
  status?: string;
}

interface LiveAvatarRow {
  id?: string;
  name?: string;
  preview_url?: string;
}

interface LiveAvatarVoiceRow {
  id?: string;
  name?: string;
  language?: string;
  gender?: string;
}

/** Interactive (streaming) avatars available on the operator's HeyGen account. */
export async function listHeygenAvatars(): Promise<HeygenAvatarOption[]> {
  const { heygenKey } = await providerConfig();
  if (!heygenKey) throw new Error("HEYGEN_NOT_CONFIGURED");

  if ((await detectAvatarVendor(heygenKey)) === "liveavatar") {
    const rows: LiveAvatarRow[] = [];
    for (const path of ["/v1/avatars?page_size=100", "/v1/avatars/public?page_size=100"]) {
      try {
        const json = await liveAvatarGet<{ data?: { results?: LiveAvatarRow[] } }>(
          path,
          heygenKey,
        );
        rows.push(...(json.data?.results ?? []));
      } catch {
        /* one of the two lists may be unavailable on the plan */
      }
    }
    const seen = new Set<string>();
    return rows
      .filter((row) => Boolean(row.id) && !seen.has(row.id!) && seen.add(row.id!))
      .map((row) => ({
        avatarId: row.id!,
        name: row.name || row.id!,
        previewUrl: row.preview_url ?? null,
        gender: null,
        interactive: true,
      }));
  }

  const json = await heygenGet<{ data?: StreamingAvatarRow[] | { avatars?: StreamingAvatarRow[] } }>(
    "/v1/streaming/avatar.list",
    heygenKey,
  );
  const rows = Array.isArray(json.data) ? json.data : (json.data?.avatars ?? []);

  return rows
    .filter((row) => Boolean(row.avatar_id))
    .map((row) => ({
      avatarId: row.avatar_id!,
      name: row.pose_name || row.avatar_name || row.avatar_id!,
      previewUrl: row.normal_preview ?? null,
      gender: row.gender ?? null,
      interactive: true,
    }));
}

interface VoiceRow {
  voice_id?: string;
  name?: string;
  language?: string;
  gender?: string;
  preview_audio?: string;
  support_interactive_avatar?: boolean;
}

export async function listHeygenVoices(): Promise<HeygenVoiceOption[]> {
  const { heygenKey } = await providerConfig();
  if (!heygenKey) throw new Error("HEYGEN_NOT_CONFIGURED");

  if ((await detectAvatarVendor(heygenKey)) === "liveavatar") {
    const json = await liveAvatarGet<{ data?: { results?: LiveAvatarVoiceRow[] } }>(
      "/v1/voices?voice_type=public&page_size=100",
      heygenKey,
    );
    return (json.data?.results ?? [])
      .filter((row) => Boolean(row.id))
      .map((row) => ({
        voiceId: row.id!,
        name: row.name || row.id!,
        language: row.language ?? null,
        gender: row.gender ?? null,
        previewUrl: null,
        interactive: true,
      }));
  }

  const json = await heygenGet<{ data?: { voices?: VoiceRow[] } }>("/v2/voices", heygenKey);
  const rows = json.data?.voices ?? [];

  return rows
    .filter((row) => Boolean(row.voice_id))
    .slice(0, 400)
    .map((row) => ({
      voiceId: row.voice_id!,
      name: row.name || row.voice_id!,
      language: row.language ?? null,
      gender: row.gender ?? null,
      previewUrl: row.preview_audio ?? null,
      interactive: row.support_interactive_avatar !== false,
    }));
}
