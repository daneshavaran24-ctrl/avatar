-- Application settings: one row, edited from the admin panel.
--
-- The Supabase schema built this up across five migrations; the columns are
-- merged here into a single definition since this is a fresh database.

CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Policy gate
  political_block boolean NOT NULL DEFAULT false,
  religious_block boolean NOT NULL DEFAULT false,
  refusal_text text NOT NULL DEFAULT 'در این موضوع امکان پاسخ‌گویی ندارم. اگر سؤال دیگری دارید، با کمال میل کمک می‌کنم.',

  -- Persona
  tone_preset text NOT NULL DEFAULT 'PROFESSIONAL_FRIENDLY',
  humor_level smallint NOT NULL DEFAULT 1,
  formality_level smallint NOT NULL DEFAULT 3,
  answer_length text NOT NULL DEFAULT 'CONCISE',
  custom_persona text NOT NULL DEFAULT '',

  -- Retention
  transcript_retention_days integer NOT NULL DEFAULT 90,

  -- Avatar (HeyGen / LiveAvatar)
  heygen_enabled boolean NOT NULL DEFAULT true,
  heygen_avatar_id text NOT NULL DEFAULT '',
  heygen_avatar_name text NOT NULL DEFAULT '',
  heygen_avatar_preview text,
  heygen_voice_id text NOT NULL DEFAULT '',
  heygen_voice_name text NOT NULL DEFAULT '',
  avatar_chroma_key text NOT NULL DEFAULT 'off',

  -- Answer provider
  openrouter_enabled boolean NOT NULL DEFAULT true,
  openrouter_model text NOT NULL DEFAULT '',
  groq_enabled boolean NOT NULL DEFAULT true,

  -- Speech
  tts_provider text NOT NULL DEFAULT 'auto',
  tts_voice text NOT NULL DEFAULT 'alloy',
  tts_speed numeric NOT NULL DEFAULT 1.0,
  stt_provider text NOT NULL DEFAULT 'auto',
  stt_autosend boolean NOT NULL DEFAULT false,
  elevenlabs_enabled boolean NOT NULL DEFAULT true,
  elevenlabs_voice_id text NOT NULL DEFAULT '',
  elevenlabs_voice_name text NOT NULL DEFAULT '',
  elevenlabs_model text NOT NULL DEFAULT 'eleven_multilingual_v2',
  elevenlabs_stability numeric NOT NULL DEFAULT 0.5,
  elevenlabs_similarity numeric NOT NULL DEFAULT 0.75,
  elevenlabs_style numeric NOT NULL DEFAULT 0.3,

  -- Connection test results, keyed by provider
  connection_status jsonb NOT NULL DEFAULT '{}'::jsonb,

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- The application always reads the first row; seed it.
INSERT INTO app_settings DEFAULT VALUES;
