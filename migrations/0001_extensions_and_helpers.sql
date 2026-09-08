-- Extensions, shared helpers, and the vector-backend decision.
--
-- pgvector may not be installable on every managed Postgres (Liara's included --
-- unverified at the time of writing). Attempting it inside an exception block
-- keeps the migration run alive on hosts that forbid CREATE EXTENSION, and the
-- outcome is recorded once in system_meta so both the schema (0005) and the
-- application (src/lib/ravi/vector.server.ts) agree on which path is active.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector unavailable (%), retrieval will use the array fallback', SQLERRM;
  END;
END $$;

CREATE TABLE IF NOT EXISTS system_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_meta (key, value)
SELECT
  'vector_backend',
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN 'pgvector'
    ELSE 'array'
  END
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
