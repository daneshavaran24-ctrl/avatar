// Public endpoints. These are open to the internet: the front page needs no
// account, so every handler here is reachable by anyone.
//
// Three rules apply to all of them:
//   1. The caller is identified only by an anonymous visitor cookie, and may
//      touch nothing but their own conversation.
//   2. Every call that costs money is rate limited before the spend happens.
//   3. Inputs are capped, because "anyone" includes someone sending 500 MB of
//      audio or a forged conversation history.
//
// Administrative capability lives in admin.functions.ts behind requireAdmin and
// is unreachable from here.
import { createServerFn } from "@tanstack/react-start";
import { askSchema, sessionIdSchema } from "./validators";
import { runAnswerPipeline } from "./pipeline.server";
import { startSession, endSession } from "./session.server";
import { createEmbedUrl } from "./heygen.server";
import { transcribeAudio } from "./providers.server";
import { getOrCreateVisitorId, assertOwnSession } from "./visitor.server";
import { clientIp } from "./auth.server";
import { enforceLimit, enforceGlobalAvatarLimit, RateLimitError } from "./ratelimit.server";
import { MAX_AUDIO_UPLOAD_BYTES } from "./constants";

/** Maps an internal failure to a Persian message, without leaking provider detail. */
function publicError(error: unknown, fallback: string): Error {
  if (error instanceof RateLimitError) return new Error(error.message);
  const detail = error instanceof Error ? error.message : "";
  if (/429/.test(detail)) return new Error("درخواست‌ها زیاد است؛ چند لحظه بعد دوباره بپرسید.");
  return new Error(fallback);
}

export const beginSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => (typeof data === "string" ? data.slice(0, 200) : null))
  .handler(async ({ data }) => {
    const visitorId = getOrCreateVisitorId();
    await enforceLimit("ask", { visitorId, ip: clientIp() });
    return { sessionId: await startSession(data, visitorId) };
  });

export const closeSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionIdSchema.parse(data))
  .handler(async ({ data }) => {
    // Ending someone else's conversation is as much a violation as reading it.
    await assertOwnSession(data, getOrCreateVisitorId());
    await endSession(data);
    return { ok: true as const };
  });

export const askRavi = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => askSchema.parse(data))
  .handler(async ({ data }) => {
    const visitorId = getOrCreateVisitorId();

    try {
      await enforceLimit("ask", { visitorId, ip: clientIp() });
      await enforceLimit("askDaily", { visitorId, ip: clientIp() });

      if (data.sessionId) await assertOwnSession(data.sessionId, visitorId);

      // History is rebuilt from storage inside the pipeline, never taken from
      // the caller.
      return await runAnswerPipeline({
        sessionId: data.sessionId,
        question: data.question,
        inputMode: data.inputMode,
      });
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      console.error("ask pipeline failed", error instanceof Error ? error.message : error);
      throw publicError(error, "پاسخ‌گویی موقتاً ممکن نشد. لطفاً دوباره تلاش کنید.");
    }
  });

/**
 * Mints a live avatar session token. This is the most expensive public call in
 * the system — each one consumes HeyGen credits — so it carries both a
 * per-visitor limit and an account-wide daily ceiling, the latter being the only
 * thing that bounds a distributed flood.
 */
export const requestAvatarSession = createServerFn({ method: "POST" }).handler(async () => {
  const visitorId = getOrCreateVisitorId();
  await enforceLimit("avatar", { visitorId, ip: clientIp() });
  await enforceGlobalAvatarLimit();
  return createEmbedUrl();
});

export const transcribeSpeech = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("فایل صوتی ارسال نشد.");
    const file = data.get("audio");
    if (!(file instanceof File)) throw new Error("فایل صوتی معتبر نیست.");
    // Refuse oversized uploads here, before a byte reaches a paid provider.
    if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
      throw new Error("فایل صوتی بیش از حد بزرگ است؛ کوتاه‌تر صحبت کنید.");
    }
    return file;
  })
  .handler(async ({ data }) => {
    try {
      await enforceLimit("stt", { visitorId: getOrCreateVisitorId(), ip: clientIp() });
      return { text: await transcribeAudio(data, data.name || "speech.wav") };
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      const detail = error instanceof Error ? error.message : "";
      console.error("transcription failed", detail);
      throw new Error(
        /AUDIO_TOO_SHORT/.test(detail)
          ? "صدایی ضبط نشد؛ دکمهٔ میکروفون را نگه دارید و کمی واضح‌تر صحبت کنید."
          : /4\d\d/.test(detail)
            ? "فایل صوتی برای تبدیل به متن پذیرفته نشد؛ دوباره ضبط کنید."
            : "تبدیل گفتار به متن موقتاً ممکن نشد. لطفاً دوباره تلاش کنید.",
      );
    }
  });

/** Persian voice for the answer when no live avatar is speaking it. */
export const speakPersian = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const raw =
      typeof data === "string"
        ? { text: data }
        : (data as { text?: unknown; previous?: unknown; next?: unknown } | null) ?? {};
    const text = typeof raw.text === "string" ? raw.text : "";
    if (!text.trim()) throw new Error("متنی برای خواندن ارسال نشد.");
    return {
      text: text.slice(0, 1200),
      previous: typeof raw.previous === "string" ? raw.previous.slice(-400) : undefined,
      next: typeof raw.next === "string" ? raw.next.slice(0, 400) : undefined,
    };
  })
  .handler(async ({ data }) => {
    await enforceLimit("tts", { visitorId: getOrCreateVisitorId(), ip: clientIp() });
    const { synthesizePersian } = await import("./tts.server");
    return synthesizePersian(data.text, { previous: data.previous, next: data.next });
  });
