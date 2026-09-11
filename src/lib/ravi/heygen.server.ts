import { providerConfig } from "./providers.server";

export type AvatarVendor = "heygen" | "liveavatar";

export type EmbedResult =
  | { configured: true; embedUrl: string }
  | { configured: false; reason: string };

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

/**
 * Mints a LiveAvatar embed URL via the v2/embeddings endpoint.
 * The embed URL is loaded in an iframe — LiveAvatar handles ASR, LLM, TTS,
 * and avatar rendering internally. No SDK, WebRTC, or chroma-key needed.
 *
 * Both avatar_id and context_id are required. The context is where the voice,
 * language, persona and knowledge live, so omitting it does not merely lose
 * personality — LiveAvatar falls back to its own demo avatar, which answers in
 * the wrong language and lip-syncs to it.
 */
export async function createEmbedUrl(): Promise<EmbedResult> {
  const config = await providerConfig();
  const key = config.heygenKey;
  if (!key) return { configured: false, reason: "HEYGEN_NOT_CONFIGURED" };

  const avatarId = config.liveAvatarAvatarId;
  const contextId = config.liveAvatarContextId;
  if (!contextId) return { configured: false, reason: "LIVEAVATAR_CONTEXT_NOT_CONFIGURED" };

  try {
    const response = await fetch(`${LIVEAVATAR_BASE}/v2/embeddings`, {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        avatar_id: avatarId,
        context_id: contextId,
        is_sandbox: false,
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

