import { z } from "zod";

/**
 * No `history` field: conversation history is rebuilt server-side from
 * conversation_messages. Accepting it from a public caller made it both a cost
 * amplifier and a prompt-injection vector.
 */
export const askSchema = z.object({
  sessionId: z.string().uuid().nullable(),
  question: z.string().min(1).max(2000),
  inputMode: z.enum(["VOICE", "TEXT"]),
});

export const sessionIdSchema = z.string().uuid();

export const settingsSchema = z.object({
  tone_preset: z.string().min(1).max(40),
  custom_persona: z.string().max(2000),
  humor_level: z.number().int().min(0).max(4),
  formality_level: z.number().int().min(1).max(5),
  answer_length: z.enum(["SHORT", "CONCISE", "BALANCED", "DETAILED"]),
  political_block: z.boolean(),
  religious_block: z.boolean(),
  refusal_text: z.string().min(1).max(600),
  transcript_retention_days: z.number().int().min(1).max(3650),
  // Persian voice used when no live avatar speaks the answer.
  tts_voice: z.enum(["alloy", "verse", "shimmer", "sage", "coral", "ballad"]).default("alloy"),
  tts_speed: z.number().min(0.7).max(1.3).default(1),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export const avatarSelectionSchema = z.object({
  avatarId: z.string().max(200),
  voiceId: z.string().max(200),
  avatarName: z.string().max(200),
  voiceName: z.string().max(200).default(""),
  previewUrl: z.string().max(2000).default(""),
});

export const connectionKeySchema = z.enum([
  "openai",
  "heygen",
  "openrouter",
  "groq",
  "elevenlabs",
]);

export const toggleServiceSchema = z.object({
  key: z.enum(["heygen", "openrouter", "groq", "elevenlabs"]),
  enabled: z.boolean(),
});

export const openRouterModelSchema = z.string().min(1).max(120);

export const elevenVoiceSchema = z.object({
  voiceId: z.string().min(1).max(120),
  voiceName: z.string().max(200).default(""),
  model: z.string().min(1).max(80).default("eleven_multilingual_v2"),
  stability: z.number().min(0).max(1).default(0.5),
  similarity: z.number().min(0).max(1).default(0.75),
  style: z.number().min(0).max(1).default(0.3),
});

export const managedKeyNameSchema = z.enum([
  // Must stay in step with MANAGED_KEYS in keystore.server.ts, otherwise the
  // Keys tab cannot save a key the key store is willing to hold.
  "OPENAI_API_KEY",
  "HEYGEN_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "ELEVENLABS_API_KEY",
  "HEYGEN_AVATAR_ID",
  "HEYGEN_VOICE_ID",
]);

export const saveKeySchema = z.object({
  name: managedKeyNameSchema,
  value: z.string().trim().min(3).max(500),
});
export const persianVoicePreferenceSchema = z.object({
  prefer: z.enum(["male", "female"]).default("male"),
});

export const createAdminSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
  role: z.enum(["admin", "user"]).default("admin"),
});

export const deleteAdminSchema = z.object({
  userId: z.string().uuid(),
});
