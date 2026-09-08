import { createServerFn } from "@tanstack/react-start";
import { askSchema } from "./validators";
import { runAnswerPipeline } from "./pipeline.server";
import { startSession, endSession } from "./session.server";
import { createHeygenSessionToken } from "./heygen.server";
import { transcribeAudio } from "./providers.server";

export const beginSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => (typeof data === "string" ? data : null))
  .handler(async ({ data }) => ({ sessionId: await startSession(data) }));

export const closeSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => String(data))
  .handler(async ({ data }) => {
    await endSession(data);
    return { ok: true as const };
  });

export const askRavi = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => askSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      return await runAnswerPipeline(data);
    } catch (error) {
      // Surface a fluent Persian reason instead of an opaque provider trace.
      const detail = error instanceof Error ? error.message : "";
      console.error("ask pipeline failed", detail);
      throw new Error(
        /429/.test(detail)
          ? "درخواست‌ها زیاد است؛ چند لحظه بعد دوباره بپرسید."
          : "پاسخ‌گویی موقتاً ممکن نشد. لطفاً دوباره تلاش کنید.",
      );
    }
  });

export const requestAvatarSession = createServerFn({ method: "POST" }).handler(async () =>
  createHeygenSessionToken(),
);

export const transcribeSpeech = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("فایل صوتی ارسال نشد.");
    const file = data.get("audio");
    if (!(file instanceof File)) throw new Error("فایل صوتی معتبر نیست.");
    return file;
  })
  .handler(async ({ data }) => {
    try {
      return { text: await transcribeAudio(data, data.name || "speech.wav") };
    } catch (error) {
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
    const { synthesizePersian } = await import("./tts.server");
    return synthesizePersian(data.text, { previous: data.previous, next: data.next });
  });

