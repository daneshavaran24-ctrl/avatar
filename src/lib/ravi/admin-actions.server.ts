import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadSettings } from "./pipeline.server";
import { deleteDocument, ingestPdf, reindexDocument } from "./ingest.server";
import { providerConfig, chatProviderName, sttProviderName } from "./providers.server";
import type { SettingsInput } from "./validators";

export async function readSettings() {
  const settings = await loadSettings();
  const config = await providerConfig();
  return {
    settings,
    providers: {
      chat: await chatProviderName(),
      stt: await sttProviderName(),
      avatarConfigured: Boolean(config.heygenKey),
    },
  };
}

export async function adminUpdateSettings(input: SettingsInput) {
  const current = await loadSettings();
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", current.id)
    .select("*")
    .single();
  if (error || !data) throw new Error("ذخیرهٔ تنظیمات ناموفق بود.");
  return data;
}

export async function adminListDocuments() {
  const { data, error } = await supabaseAdmin
    .from("knowledge_documents")
    .select("id, title, status, chunk_count, error_message, created_at, updated_at, version")
    .order("created_at", { ascending: false });
  if (error) throw new Error("دریافت فهرست اسناد ناموفق بود.");
  return data;
}

export async function adminIngestPdf(file: File, title: string) {
  return ingestPdf(file, title);
}

export async function adminDeleteDocument(documentId: string) {
  await deleteDocument(documentId);
  return { ok: true as const };
}

export async function adminReindexDocument(documentId: string) {
  return { chunks: await reindexDocument(documentId) };
}

export async function adminListSessions() {
  const { data, error } = await supabaseAdmin
    .from("conversation_sessions")
    .select("id, started_at, ended_at, status, client_label")
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("دریافت فهرست گفتگوها ناموفق بود.");
  return data;
}

export async function adminListConversation(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversation_messages")
    .select("id, role, content, source_type, input_mode, latency_ms, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("دریافت متن گفتگو ناموفق بود.");
  return data;
}

export async function adminOverview() {
  const [sessions, messages, documents, events] = await Promise.all([
    supabaseAdmin.from("conversation_sessions").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("conversation_messages")
      .select("source_type, latency_ms")
      .eq("role", "assistant")
      .limit(1000),
    supabaseAdmin.from("knowledge_documents").select("chunk_count, status"),
    supabaseAdmin
      .from("provider_events")
      .select("success")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const assistantMessages = messages.data ?? [];
  const latencies = assistantMessages
    .map((message) => message.latency_ms)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);

  const bySource = assistantMessages.reduce<Record<string, number>>((accumulator, message) => {
    const key = message.source_type ?? "UNKNOWN";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const providerEvents = events.data ?? [];
  const failures = providerEvents.filter((event) => !event.success).length;

  return {
    sessionCount: sessions.count ?? 0,
    answerCount: assistantMessages.length,
    medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    p95LatencyMs: latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : null,
    bySource,
    documentCount: documents.data?.length ?? 0,
    chunkCount: (documents.data ?? []).reduce((sum, doc) => sum + (doc.chunk_count ?? 0), 0),
    providerErrorRate: providerEvents.length
      ? Math.round((failures / providerEvents.length) * 100)
      : 0,
  };
}