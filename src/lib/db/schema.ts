// Row shapes for the tables the application reads, replacing the generated
// Supabase `Database` types. Keep in step with migrations/.

/** JSON that survives the server-function serialization boundary. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface AppSettings {
  id: string;

  political_block: boolean;
  religious_block: boolean;
  refusal_text: string;

  tone_preset: string;
  humor_level: number;
  formality_level: number;
  answer_length: string;
  custom_persona: string;

  transcript_retention_days: number;

  heygen_enabled: boolean;
  heygen_avatar_id: string;
  heygen_avatar_name: string;
  heygen_avatar_preview: string | null;
  heygen_voice_id: string;
  heygen_voice_name: string;
  avatar_chroma_key: string;

  openrouter_enabled: boolean;
  openrouter_model: string;
  groq_enabled: boolean;

  tts_provider: string;
  tts_voice: string;
  tts_speed: number;
  stt_provider: string;
  stt_autosend: boolean;
  elevenlabs_enabled: boolean;
  elevenlabs_voice_id: string;
  elevenlabs_voice_name: string;
  elevenlabs_model: string;
  elevenlabs_stability: number;
  elevenlabs_similarity: number;
  elevenlabs_style: number;

  connection_status: Record<string, JsonValue>;

  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  extracted_text: string;
  status: string;
  version: number;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationSession {
  id: string;
  visitor_id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  client_label: string | null;
}

export interface ConversationMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  source_type: string | null;
  input_mode: string | null;
  latency_ms: number | null;
  token_input: number | null;
  token_output: number | null;
  created_at: string;
}
