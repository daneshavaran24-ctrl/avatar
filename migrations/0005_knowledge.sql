-- Knowledge base: uploaded PDFs and their embedded chunks.
--
-- knowledge_chunks.embedding has two possible shapes, decided in 0001 and
-- recorded in system_meta.vector_backend:
--   pgvector -> vector(1536), searched with the <=> cosine operator
--   array    -> double precision[], scored in application code
-- Both store the same 1536-dimension OpenAI text-embedding-3-small vector.
--
-- The match_knowledge_chunks() function from the Supabase schema is not
-- recreated: it existed to run SECURITY DEFINER under RLS, and it cannot serve
-- the array path anyway. Retrieval is a plain query in pipeline.server.ts.

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  extracted_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING',
  version integer NOT NULL DEFAULT 1,
  chunk_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER knowledge_documents_updated_at BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$
DECLARE
  backend text;
BEGIN
  SELECT value INTO backend FROM system_meta WHERE key = 'vector_backend';

  IF backend = 'pgvector' THEN
    EXECUTE $ddl$
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        chunk_index integer NOT NULL,
        content text NOT NULL,
        embedding vector(1536),
        metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    $ddl$;
    EXECUTE $ddl$
      CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx ON knowledge_chunks
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    $ddl$;
  ELSE
    EXECUTE $ddl$
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
        chunk_index integer NOT NULL,
        content text NOT NULL,
        embedding double precision[],
        metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    $ddl$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx ON knowledge_chunks(document_id);
