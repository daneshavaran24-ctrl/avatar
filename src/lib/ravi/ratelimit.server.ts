// Rate limiting for the public endpoints.
//
// The front page is open to the internet and every endpoint behind it spends
// real money: OpenAI tokens, Whisper/Deepgram minutes, ElevenLabs characters,
// and — most expensively — HeyGen streaming sessions. Limits are keyed on both
// the visitor cookie and the client IP so clearing cookies does not reset the
// budget, and avatar sessions additionally carry a global daily ceiling, which
// is the only thing that bounds a distributed flood.
//
// Counters live in Postgres rather than process memory so they survive restarts
// and stay correct if more than one instance ever runs.
import { sql } from "@/lib/db/client.server";

export type LimitName = "ask" | "askDaily" | "stt" | "tts" | "avatar" | "avatarGlobal" | "login";

type Limit = { max: number; windowSeconds: number };

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const MINUTE = 60;
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

function limits(): Record<LimitName, Limit> {
  return {
    ask: { max: envInt("RL_ASK_PER_MIN", 20), windowSeconds: MINUTE },
    askDaily: { max: envInt("RL_ASK_PER_DAY", 300), windowSeconds: DAY },
    stt: { max: envInt("RL_STT_PER_MIN", 20), windowSeconds: MINUTE },
    tts: { max: envInt("RL_TTS_PER_MIN", 40), windowSeconds: MINUTE },
    avatar: { max: envInt("RL_AVATAR_PER_HOUR", 3), windowSeconds: HOUR },
    avatarGlobal: { max: envInt("RL_AVATAR_GLOBAL_PER_DAY", 200), windowSeconds: DAY },
    login: { max: envInt("RL_LOGIN_PER_15MIN", 10), windowSeconds: 15 * MINUTE },
  };
}

/** Thrown when a caller is over budget. Carries 429 so callers can map it. */
export class RateLimitError extends Error {
  readonly status = 429;
  constructor(message = "درخواست‌ها زیاد است؛ چند لحظه بعد دوباره تلاش کنید.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/** Start of the fixed window a timestamp falls into. */
function windowStart(windowSeconds: number): Date {
  const size = windowSeconds * 1000;
  return new Date(Math.floor(Date.now() / size) * size);
}

async function hit(bucketKey: string, limit: Limit): Promise<void> {
  const [row] = await sql<{ count: number }[]>`
    INSERT INTO rate_limit_counters (bucket_key, window_start, count)
    VALUES (${bucketKey}, ${windowStart(limit.windowSeconds)}, 1)
    ON CONFLICT (bucket_key, window_start)
      DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count
  `;

  if (row && row.count > limit.max) throw new RateLimitError();
}

/**
 * How much more an IP may do than a single visitor.
 *
 * The per-IP bucket exists so clearing cookies does not reset the budget, but
 * it must not punish people who share an address. Carrier-grade NAT is the norm
 * for much of this audience, so an office or a mobile network can legitimately
 * be dozens of distinct visitors behind one IP. Applying the per-visitor number
 * to the IP would lock all of them out because of one heavy user.
 */
const IP_ALLOWANCE_MULTIPLIER = Number(process.env["RL_IP_MULTIPLIER"] ?? 15);

/**
 * Records one use of `name` against this visitor and IP, throwing once either
 * is over budget. Call before doing the expensive work, not after.
 */
export async function enforceLimit(
  name: Exclude<LimitName, "avatarGlobal">,
  subject: { visitorId?: string; ip: string },
): Promise<void> {
  const limit = limits()[name];

  // Login is keyed only by IP — there is no visitor identity to fall back on,
  // and a shared address is an acceptable cost for brute-force protection.
  const ipLimit =
    name === "login"
      ? limit
      : { ...limit, max: limit.max * IP_ALLOWANCE_MULTIPLIER };

  await hit(`${name}:ip:${subject.ip}`, ipLimit);
  if (subject.visitorId) await hit(`${name}:visitor:${subject.visitorId}`, limit);
}

/** The account-wide ceiling on paid avatar sessions, independent of caller. */
export async function enforceGlobalAvatarLimit(): Promise<void> {
  await hit("avatar:global", limits().avatarGlobal);
}

/** Drops windows that can no longer be current. Safe to call opportunistically. */
export async function pruneRateLimits(): Promise<void> {
  await sql`DELETE FROM rate_limit_counters WHERE window_start < now() - interval '2 days'`;
}
