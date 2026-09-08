import { z } from "zod";

export const askSchema = z.object({
  sessionId: z.string().uuid().nullable(),
  question: z.string().min(1).max(2000),
  inputMode: z.enum(["VOICE", "TEXT"]),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .default([]),
});

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
  "lovable",
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
