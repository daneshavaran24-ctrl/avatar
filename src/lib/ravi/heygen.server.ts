import { providerConfig } from "./providers.server";

export type AvatarVendor = "heygen" | "liveavatar";

export type EmbedResult =
  | { configured: true; embedUrl: string }
  | { configured: false; reason: string };

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

/**
 * Mints a LiveAvatar embed URL via the v2/embeddings endpoint.
 * The embed URL is loaded in an iframe — LiveAvatar handles ASR, LLM, TTS,
 * and avatar rendering internally. No SDK, WebRTC, or chroma-key needed.
 */
export async function createEmbedUrl(): Promise<EmbedResult> {
  const config = await providerConfig();
  const key = config.heygenKey;
  if (!key) return { configured: false, reason: "HEYGEN_NOT_CONFIGURED" };

  const avatarId = config.liveAvatarAvatarId;
  const contextId = config.liveAvatarContextId;
  if (!avatarId) return { configured: false, reason: "LIVEAVATAR_AVATAR_ID_MISSING" };

  try {
    const response = await fetch(`${LIVEAVATAR_BASE}/v2/embeddings`, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        avatar_id: avatarId,
        ...(contextId ? { context_id: contextId } : {}),
        is_sandbox: !contextId,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      console.error("[Embed] LiveAvatar embed failed:", response.status, detail);
      return { configured: false, reason: `LIVEAVATAR_EMBED_FAILED_${response.status}` };
    }

    const json = (await response.json()) as { data?: { url?: string } };
    const embedUrl = json.data?.url;
    if (!embedUrl) return { configured: false, reason: "LIVEAVATAR_EMBED_URL_EMPTY" };

    return { configured: true, embedUrl };
  } catch {
    return { configured: false, reason: "LIVEAVATAR_UNREACHABLE" };
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
