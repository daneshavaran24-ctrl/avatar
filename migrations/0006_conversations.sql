-- Conversations, plus the analytics events the admin panel reads.
--
-- conversation_sessions.visitor_id is new: the front page is public and
-- anonymous, so a session belongs to a visitor cookie rather than an account.
-- It is what makes "you can only touch your own conversation" enforceable --
-- see requireOwnSession() in src/lib/ravi/visitor.server.ts.

CREATE TABLE IF NOT EXISTS conversation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE',
  client_label text
);

CREATE INDEX IF NOT EXISTS conversation_sessions_visitor_idx ON conversation_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS conversation_sessions_started_idx ON conversation_sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  source_type text,
  input_mode text,
  latency_ms integer,
  token_input integer,
  token_output integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_messages_session_idx ON conversation_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS retrieval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES conversation_messages(id) ON DELETE CASCADE,
  document_id uuid,
  chunk_id uuid,
  score double precision,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  provider text NOT NULL,
  operation text NOT NULL,
  latency_ms integer,
  success boolean NOT NULL DEFAULT true,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_events_created_idx ON provider_events(created_at DESC);
