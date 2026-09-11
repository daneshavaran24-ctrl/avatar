/**
 * مقادیر ثابت و پیکربندی‌های مشترک راوی‌استان
 *
 * این فایل شامل تمام magic numbers، threshold ها و تنظیمات ثابت است
 * که در سرتاسر برنامه استفاده می‌شوند.
 */

// ─────────────────────────────────────────────────────────────────────────────
// زبان و تنظیمات منطقه‌ای
// ─────────────────────────────────────────────────────────────────────────────

/** کد زبان فارسی ISO 639-1 */
export const PERSIAN_LANGUAGE_CODE = "fa" as const;

/** کد محلی فارسی ایران */
export const PERSIAN_LOCALE = "fa-IR" as const;

/** الگوی تشخیص زبان فارسی/فارسی */
export const PERSIAN_LANGUAGE_PATTERN = /persian|farsi|iran|^fa([-_]|$)/i;

// ─────────────────────────────────────────────────────────────────────────────
// محدودیت‌های صوتی (Audio)
// ─────────────────────────────────────────────────────────────────────────────

/** حداقل اندازه فایل صوتی برای transcription (بایت) */
export const MIN_AUDIO_SIZE_BYTES = 16000;

/** حداکثر طول هر chunk صوتی برای TTS (کاراکتر) */
export const MAX_SPEECH_CHUNK_CHARS = 340;

/** حداقل نرخ نمونه‌برداری صوتی (Hz) */
export const MIN_SAMPLE_RATE = 16000;

// ─────────────────────────────────────────────────────────────────────────────
// تنظیمات TTS (Text-to-Speech)
// ─────────────────────────────────────────────────────────────────────────────

/** حداقل سرعت TTS مجاز */
export const MIN_TTS_SPEED = 0.5;

/** حداکثر سرعت TTS مجاز */
export const MAX_TTS_SPEED = 2.0;

/** سرعت پیش‌فرض TTS */
export const DEFAULT_TTS_SPEED = 1.0;

/** صدای پیش‌فرض TTS */
export const DEFAULT_TTS_VOICE = "alloy";

// ─────────────────────────────────────────────────────────────────────────────
// امتیازدهی و آستانه‌های کیفیت
// ─────────────────────────────────────────────────────────────────────────────

/**
 * حداقل نسبت حروف فارسی برای قبول transcript
 * مقدار کمتر از این باعث کسر 40 امتیاز می‌شود
 */
export const MIN_PERSIAN_RATIO = 0.5;

/**
 * حداکثر تعداد کلمات که در امتیازدهی محاسبه می‌شود
 * (هر کلمه 1 امتیاز، حداکثر 25)
 */
export const MAX_WORD_SCORE = 25;

/**
 * امتیاز اضافی برای وجود علائم نگارشی
 * (نشان‌دهنده جمله‌های کامل)
 */
export const PUNCTUATION_BONUS = 5;

/**
 * جریمه امتیاز برای نسبت پایین حروف فارسی
 * (احتمالاً زبان اشتباه تشخیص داده شده)
 */
export const LOW_PERSIAN_PENALTY = -40;

/**
 * حداقل طول متن بدون فاصله برای قبول transcript
 */
export const MIN_TRANSCRIPT_LENGTH = 2;

// ─────────────────────────────────────────────────────────────────────────────
// تنظیمات Chroma Key (حذف پس‌زمینه)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * آستانه فاصله رنگ برای تشخیص کلید سبز
 * مقادیر کمتر = دقت بیشتر اما ممکن است لبه‌ها را از دست بدهد
 */
export const CHROMA_KEY_COLOR_DISTANCE_THRESHOLD = 90;

/**
 * اندازه نمونه‌گیری downscale برای تشخیص رنگ پس‌زمینه (پیکسل)
 */
export const CHROMA_KEY_SAMPLE_SIZE = 32;

/**
 * آستانه تفاوت کانال سبز برای تشخیص کلید کروما
 * سبز باید حداقل این مقدار بیشتر از قرمز و آبی باشد
 */
export const CHROMA_KEY_GREEN_THRESHOLD = 40;

// ─────────────────────────────────────────────────────────────────────────────
// تنظیمات زمان‌بندی و تأخیر
// ─────────────────────────────────────────────────────────────────────────────

/** تأخیر پیش از بستن LiveAvatar session (میلی‌ثانیه) */
export const LIVEAVATAR_SESSION_CLOSE_DELAY_MS = 1000;

/**
 * ضریب محاسبه timeout بر اساس طول متن (ms/char)
 * timeout = BASE_TIMEOUT + text.length * این ضریب
 */
export const TIMEOUT_PER_CHAR_MS = 120;

/** timeout پایه برای عملیات صوتی (میلی‌ثانیه) */
export const BASE_AUDIO_TIMEOUT_MS = 4000;

// ─────────────────────────────────────────────────────────────────────────────
// تنظیمات Batch Processing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * اندازه دسته برای embedding متن‌ها
 * دسته‌های کوچک‌تر = خطای کمتر در هر دسته، اما درخواست‌های بیشتر
 */
export const EMBEDDING_BATCH_SIZE = 16;

// ─────────────────────────────────────────────────────────────────────────────
// حداکثر تعداد تلاش‌ها
// ─────────────────────────────────────────────────────────────────────────────

/** تعداد مدل‌های Deepgram برای امتحان */
export const DEEPGRAM_MODEL_ATTEMPTS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// کدهای وضعیت HTTP
// ─────────────────────────────────────────────────────────────────────────────

/** کد وضعیت: غیرمجاز (کلید نامعتبر) */
export const HTTP_UNAUTHORIZED = 401;

/** کد وضعیت: نیاز به پرداخت (اعتبار تمام شده) */
export const HTTP_PAYMENT_REQUIRED = 402;

/** کد وضعیت: ممنوع (دسترسی مسدود) */
export const HTTP_FORBIDDEN = 403;

/** کد وضعیت: درخواست‌های زیاد (rate limit) */
export const HTTP_TOO_MANY_REQUESTS = 429;

/** کد وضعیت: خطای داخلی سرور */
export const HTTP_INTERNAL_ERROR = 500;

/** کد وضعیت: سرویس در دسترس نیست */
export const HTTP_BAD_GATEWAY = 502;

// ─────────────────────────────────────────────────────────────────────────────
// پیام‌های خطا
// ─────────────────────────────────────────────────────────────────────────────

/** خطا: فایل صوتی خیلی کوتاه است */
export const ERROR_AUDIO_TOO_SHORT = "AUDIO_TOO_SHORT";

/** خطا: transcription خالی است */
export const ERROR_TRANSCRIPTION_EMPTY = "TRANSCRIPTION_EMPTY";

/** خطا: TTS شکست خورد */
export const ERROR_TTS_FAILED = "TTS_FAILED";

/** خطا: Avatar SDK بارگذاری نشد */
export const ERROR_AVATAR_SDK_LOAD_FAILED = "AVATAR_SDK_LOAD_FAILED";

/** خطا: شروع Avatar شکست خورد */
export const ERROR_AVATAR_START_FAILED = "AVATAR_START_FAILED";

/** خطا: Avatar انتخاب نشده */
export const ERROR_LIVEAVATAR_NOT_SELECTED = "LIVEAVATAR_AVATAR_NOT_SELECTED";

// ─────────────────────────────────────────────────────────────────────────────
// نام‌های Provider
// ─────────────────────────────────────────────────────────────────────────────

/** Largest audio upload accepted for transcription (~10 MB). */
export const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * شناسهٔ آواتار پیش‌فرض. embed بدون avatar_id ساخته نمی‌شود، و چون دیتابیس
 * ممکن است در دسترس نباشد، این مقدار تضمین می‌کند صفحهٔ اصلی فقط با
 * HEYGEN_API_KEY کار کند. متغیر محیطی LIVEAVATAR_AVATAR_ID بر آن اولویت دارد.
 */
export const DEFAULT_LIVEAVATAR_AVATAR_ID = "6879c60d-3633-459e-ba76-9b0c585e3f1b";

/**
 * شناسهٔ context پیش‌فرض — صدا، زبان، شخصیت و دانش آواتار همگی از اینجا
 * می‌آیند، نه از بدنهٔ درخواست embed. بدون آن لایواواتار آواتار دموی خودش را
 * با صدای غیرفارسی برمی‌گرداند. متغیر محیطی LIVEAVATAR_CONTEXT_ID اولویت دارد.
 */
export const DEFAULT_LIVEAVATAR_CONTEXT_ID = "ebab7549-6b94-45a3-9ec2-36194bfc3688";

/**
 * آواتار sandbox متعلق به خود لایواواتار است، نه حساب ما. در حالت sandbox
 * باید همین فرستاده شود (شناسهٔ آواتار خودمان پذیرفته نیست) — پس چهره‌ای که
 * دیده می‌شود دموی آن‌هاست و اعتباری مصرف نمی‌کند.
 */
export const LIVEAVATAR_SANDBOX_AVATAR_ID = "65f9e3c9-d48b-4118-b73a-4ae2e3cbb8f0";

export type ChatProvider = "openai" | "none";
export type SttProvider = "openai" | "none";
export type TtsProvider = "openai" | "browser";
export type AvatarProvider = "heygen" | "liveavatar";

// ─────────────────────────────────────────────────────────────────────────────
// رنگ‌ها (برای Chroma Key)
// ─────────────────────────────────────────────────────────────────────────────

export interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** رنگ سبز استاندارد Chroma Key */
export const CHROMA_KEY_GREEN: RGB = {
  r: 0,
  g: 177,
  b: 64,
} as const;
