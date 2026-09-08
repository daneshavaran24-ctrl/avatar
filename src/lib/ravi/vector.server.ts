// Similarity search over knowledge_chunks, in two flavours.
//
// pgvector is not installable on every managed Postgres. Migration 0001 records
// which backend this database ended up with, and everything downstream branches
// on that one flag:
//
//   pgvector -> embeddings are vector(1536), ranked by the <=> cosine operator
//   array    -> embeddings are double precision[], ranked in this process
//
// The array path is exact rather than approximate (it scores every candidate),
// so it returns at least as good results as the ivfflat index — it just costs
// more per query, which is why it is capped.
import { sql } from "@/lib/db/client.server";

export type VectorBackend = "pgvector" | "array";

/**
 * Upper bound on rows pulled into memory for the array path. Beyond this the
 * fallback stops being cheap and the database deserves pgvector instead.
 */
export const ARRAY_SCAN_LIMIT = 2000;

let cached: VectorBackend | undefined;

export async function getVectorBackend(): Promise<VectorBackend> {
  if (cached) return cached;
  try {
    const [row] = await sql<{ value: string }[]>`
      SELECT value FROM system_meta WHERE key = 'vector_backend' LIMIT 1
    `;
    cached = row?.value === "pgvector" ? "pgvector" : "array";
  } catch {
    // Assume the cheaper-to-satisfy shape rather than failing retrieval outright.
    cached = "array";
  }
  return cached;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface MatchedChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  content: string;
  similarity: number;
}

/** Top `limit` chunks from READY documents, most similar first. */
export async function matchKnowledgeChunks(
  embedding: number[],
  limit: number,
): Promise<MatchedChunk[]> {
  if ((await getVectorBackend()) === "pgvector") {
    const literal = JSON.stringify(embedding);
    return sql<MatchedChunk[]>`
      SELECT c.id AS chunk_id,
             c.document_id,
             d.title AS document_title,
             c.content,
             1 - (c.embedding <=> ${literal}::vector) AS similarity
      FROM knowledge_chunks c
      JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.embedding IS NOT NULL AND d.status = 'READY'
      ORDER BY c.embedding <=> ${literal}::vector
      LIMIT ${limit}
    `;
  }

  const rows = await sql<
    {
      chunk_id: string;
      document_id: string;
      document_title: string;
      content: string;
      embedding: number[] | null;
    }[]
  >`
    SELECT c.id AS chunk_id,
           c.document_id,
           d.title AS document_title,
           c.content,
           c.embedding
    FROM knowledge_chunks c
    JOIN knowledge_documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL AND d.status = 'READY'
    LIMIT ${ARRAY_SCAN_LIMIT}
  `;

  return rows
    .map(({ embedding: stored, ...chunk }) => ({
      ...chunk,
      similarity: stored ? cosineSimilarity(embedding, stored) : 0,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Serialises an embedding for insertion, matching the active backend's column type. */
export async function embeddingForInsert(embedding: number[]): Promise<unknown> {
  return (await getVectorBackend()) === "pgvector"
    ? sql`${JSON.stringify(embedding)}::vector`
    : embedding;
}
