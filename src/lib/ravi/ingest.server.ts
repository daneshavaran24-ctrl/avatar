import { sql } from "@/lib/db/client.server";
import { chunkPersianText, normalizePersian } from "./persian";
import { embedBatch } from "./providers.server";
import { getVectorBackend } from "./vector.server";

/**
 * Stores chunk rows with the embedding shaped for whichever backend this
 * database has: a pgvector literal, or a plain float array.
 */
async function insertChunks(
  documentId: string,
  title: string,
  chunks: string[],
  embeddings: number[][],
): Promise<void> {
  const pgvector = (await getVectorBackend()) === "pgvector";

  for (let index = 0; index < chunks.length; index += 1) {
    const embedding = embeddings[index];
    const metadata = { title, chunk_index: index };
    const value = embedding
      ? pgvector
        ? sql`${JSON.stringify(embedding)}::vector`
        : sql`${embedding}::double precision[]`
      : sql`NULL`;

    await sql`
      INSERT INTO knowledge_chunks (document_id, chunk_index, content, embedding, metadata_json)
      VALUES (${documentId}, ${index}, ${chunks[index]!}, ${value}, ${sql.json(metadata)})
    `;
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return normalizePersian(Array.isArray(text) ? text.join("\n\n") : text);
}

/**
 * Ingests one PDF end to end: extract, chunk, embed, store. The document row is
 * created first so the admin panel can show PROCESSING/FAILED states.
 */
export async function ingestPdf(file: File, title: string): Promise<{ documentId: string; chunks: number }> {
  const [created] = await sql<{ id: string }[]>`
    INSERT INTO knowledge_documents (title, status)
    VALUES (${title}, 'PROCESSING')
    RETURNING id
  `;

  if (!created) {
    throw new Error("ثبت سند در پایگاه دانش ناموفق بود.");
  }

  const documentId = created.id;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await extractPdfText(bytes);
    if (text.replace(/\s/g, "").length < 50) {
      throw new Error("متنی از این فایل استخراج نشد. احتمالاً PDF تصویری است.");
    }

    const chunks = chunkPersianText(text);
    if (chunks.length === 0) throw new Error("محتوای قابل استفاده‌ای در سند یافت نشد.");

    const embeddings = await embedBatch(chunks);

    await insertChunks(documentId, title, chunks, embeddings);

    await sql`
      UPDATE knowledge_documents
      SET status = 'READY',
          chunk_count = ${chunks.length},
          extracted_text = ${text.slice(0, 200000)},
          error_message = NULL,
          updated_at = now()
      WHERE id = ${documentId}
    `;

    return { documentId, chunks: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای نامشخص در پردازش سند";
    await sql`
      UPDATE knowledge_documents
      SET status = 'FAILED', error_message = ${message.slice(0, 500)}
      WHERE id = ${documentId}
    `;
    throw new Error(message);
  }
}

export async function deleteDocument(documentId: string): Promise<void> {
  // knowledge_chunks cascades on document delete, but drop them explicitly so
  // the intent survives any future schema change.
  await sql`DELETE FROM knowledge_chunks WHERE document_id = ${documentId}`;
  await sql`DELETE FROM knowledge_documents WHERE id = ${documentId}`;
}

export async function reindexDocument(documentId: string): Promise<number> {
  const [document] = await sql<{ id: string; title: string; extracted_text: string }[]>`
    SELECT id, title, extracted_text FROM knowledge_documents WHERE id = ${documentId} LIMIT 1
  `;
  if (!document) throw new Error("سند یافت نشد.");

  const chunks = chunkPersianText(document.extracted_text);
  if (chunks.length === 0) throw new Error("متن ذخیره‌شده‌ای برای این سند وجود ندارد.");

  const embeddings = await embedBatch(chunks);
  await sql`DELETE FROM knowledge_chunks WHERE document_id = ${documentId}`;
  await insertChunks(documentId, document.title, chunks, embeddings);
  await sql`
    UPDATE knowledge_documents
    SET status = 'READY',
        chunk_count = ${chunks.length},
        error_message = NULL,
        updated_at = now()
    WHERE id = ${documentId}
  `;

  return chunks.length;
}