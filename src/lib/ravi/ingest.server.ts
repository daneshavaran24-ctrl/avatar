import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chunkPersianText, normalizePersian } from "./persian";
import { embedBatch } from "./providers.server";

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
  const { data: created, error: createError } = await supabaseAdmin
    .from("knowledge_documents")
    .insert({ title, status: "PROCESSING" })
    .select("id")
    .single();

  if (createError || !created) {
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

    const { error: insertError } = await supabaseAdmin.from("knowledge_chunks").insert(
      chunks.map((content, index) => ({
        document_id: documentId,
        chunk_index: index,
        content,
        embedding: JSON.stringify(embeddings[index]),
        metadata_json: { title, chunk_index: index },
      })),
    );
    if (insertError) throw new Error(insertError.message);

    await supabaseAdmin
      .from("knowledge_documents")
      .update({
        status: "READY",
        chunk_count: chunks.length,
        extracted_text: text.slice(0, 200000),
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return { documentId, chunks: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای نامشخص در پردازش سند";
    await supabaseAdmin
      .from("knowledge_documents")
      .update({ status: "FAILED", error_message: message.slice(0, 500) })
      .eq("id", documentId);
    throw new Error(message);
  }
}

export async function deleteDocument(documentId: string): Promise<void> {
  await supabaseAdmin.from("knowledge_chunks").delete().eq("document_id", documentId);
  await supabaseAdmin.from("knowledge_documents").delete().eq("id", documentId);
}

export async function reindexDocument(documentId: string): Promise<number> {
  const { data: document, error } = await supabaseAdmin
    .from("knowledge_documents")
    .select("id, title, extracted_text")
    .eq("id", documentId)
    .single();
  if (error || !document) throw new Error("سند یافت نشد.");

  const chunks = chunkPersianText(document.extracted_text);
  if (chunks.length === 0) throw new Error("متن ذخیره‌شده‌ای برای این سند وجود ندارد.");

  const embeddings = await embedBatch(chunks);
  await supabaseAdmin.from("knowledge_chunks").delete().eq("document_id", documentId);
  await supabaseAdmin.from("knowledge_chunks").insert(
    chunks.map((content, index) => ({
      document_id: documentId,
      chunk_index: index,
      content,
      embedding: JSON.stringify(embeddings[index]),
      metadata_json: { title: document.title, chunk_index: index },
    })),
  );
  await supabaseAdmin
    .from("knowledge_documents")
    .update({
      status: "READY",
      chunk_count: chunks.length,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return chunks.length;
}