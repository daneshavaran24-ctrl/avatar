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

export const connectionKeySchema = z.enum(["openai", "heygen"]);

export const toggleServiceSchema = z.object({
  key: z.enum(["heygen"]),
  enabled: z.boolean(),
});

export const managedKeyNameSchema = z.enum([
  // Must stay in step with MANAGED_KEYS in keystore.server.ts, otherwise the
  // Keys tab cannot save a key the key store is willing to hold.
  "OPENAI_API_KEY",
  "HEYGEN_API_KEY",
]);

export const saveKeySchema = z.object({
  name: managedKeyNameSchema,
  value: z.string().trim().min(3).max(500),
});

export const createAdminSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
  role: z.enum(["admin", "user"]).default("admin"),
});

export const deleteAdminSchema = z.object({
  userId: z.string().uuid(),
});
