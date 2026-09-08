export type AvatarState =
  | "IDLE"
  | "CONNECTING"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "ERROR";

export type SourceType = "KNOWLEDGE_BASE" | "HYBRID" | "GENERAL_AI" | "POLICY_BLOCK";

export type InputMode = "VOICE" | "TEXT";

export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  sourceType?: SourceType;
}

export interface AnswerResult {
  answer: string;
  sourceType: SourceType;
  latencyMs: number;
  messageId: string | null;
}

export const TONE_PRESETS = [
  { value: "PROFESSIONAL_FRIENDLY", label: "حرفه‌ای و صمیمی" },
  { value: "FRIENDLY", label: "دوستانه" },
  { value: "WITTY", label: "شوخ‌طبع" },
  { value: "FORMAL", label: "رسمی" },
  { value: "DRY_FORMAL", label: "رسمی خشک" },
  { value: "EDUCATIONAL", label: "آموزشی" },
  { value: "CONCISE", label: "کوتاه و مستقیم" },
  { value: "CUSTOM", label: "سفارشی" },
] as const;

export const ANSWER_LENGTHS = [
  { value: "SHORT", label: "خیلی کوتاه" },
  { value: "CONCISE", label: "کوتاه" },
  { value: "BALANCED", label: "متعادل" },
  { value: "DETAILED", label: "مفصل" },
] as const;

export const SOURCE_LABELS: Record<SourceType, string> = {
  KNOWLEDGE_BASE: "پایگاه دانش",
  HYBRID: "ترکیبی",
  GENERAL_AI: "هوش مصنوعی عمومی",
  POLICY_BLOCK: "محدودیت سیاستی",
};

export const AVATAR_STATE_LABELS: Record<AvatarState, string> = {
  IDLE: "آماده",
  CONNECTING: "در حال اتصال",
  LISTENING: "در حال شنیدن",
  THINKING: "در حال پردازش",
  SPEAKING: "در حال پاسخ",
  ERROR: "خطا در ارتباط",
};

export const GENERIC_ERROR_FA =
  "ارتباط موقتاً برقرار نیست. لطفاً دوباره تلاش کنید.";