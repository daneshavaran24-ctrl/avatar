import { sql } from "@/lib/db/client.server";
import { loadSettings } from "./pipeline.server";
import { deleteDocument, ingestPdf, reindexDocument } from "./ingest.server";
import { providerConfig, chatProviderName, sttProviderName } from "./providers.server";
import type { SettingsInput } from "./validators";
import type { AppSettings } from "@/lib/db/schema";

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
  // Columns come from settingsSchema, so the spread cannot reach a column the
  // validator does not already allow.
  const columns = Object.keys(input) as (keyof SettingsInput)[];
  const [data] = await sql<AppSettings[]>`
    UPDATE app_settings
    SET ${sql(input, ...columns)}, updated_at = now()
    WHERE id = ${current.id}
    RETURNING *
  `;
  if (!data) throw new Error("ذخیرهٔ تنظیمات ناموفق بود.");
  return data;
}

export async function adminListDocuments() {
  try {
    return await sql<
      {
        id: string;
        title: string;
        status: string;
        chunk_count: number;
        error_message: string | null;
        created_at: string;
        updated_at: string;
        version: number;
      }[]
    >`
      SELECT id, title, status, chunk_count, error_message, created_at, updated_at, version
      FROM knowledge_documents
      ORDER BY created_at DESC
    `;
  } catch {
    throw new Error("دریافت فهرست اسناد ناموفق بود.");
  }
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
  try {
    return await sql<
      {
        id: string;
        started_at: string;
        ended_at: string | null;
        status: string;
        client_label: string | null;
      }[]
    >`
      SELECT id, started_at, ended_at, status, client_label
      FROM conversation_sessions
      ORDER BY started_at DESC
      LIMIT 100
    `;
  } catch {
    throw new Error("دریافت فهرست گفتگوها ناموفق بود.");
  }
}

export async function adminListConversation(sessionId: string) {
  try {
    return await sql<
      {
        id: string;
        role: string;
        content: string;
        source_type: string | null;
        input_mode: string | null;
        latency_ms: number | null;
        created_at: string;
      }[]
    >`
      SELECT id, role, content, source_type, input_mode, latency_ms, created_at
      FROM conversation_messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC
    `;
  } catch {
    throw new Error("دریافت متن گفتگو ناموفق بود.");
  }
}

export async function adminOverview() {
  // Stats are nice to have; an unreachable database must not fail the whole
  // panel. But a zero we invented must not pass for a zero we measured, so the
  // outage is reported and the caller renders "—" rather than counts.
  let dbAvailable = true;
  const orEmpty = async <T>(query: Promise<T[]>): Promise<T[]> => {
    try {
      return await query;
    } catch (error) {
      console.error("[Admin] overview query failed:", error instanceof Error ? error.message : error);
      dbAvailable = false;
      return [];
    }
  };

  const [sessionCounts, assistantMessages, documents, providerEvents] = await Promise.all([
    orEmpty(sql<{ count: string }[]>`SELECT count(*)::text AS count FROM conversation_sessions`),
    orEmpty(sql<{ source_type: string | null; latency_ms: number | null }[]>`
      SELECT source_type, latency_ms
      FROM conversation_messages
      WHERE role = 'assistant'
      LIMIT 1000
    `),
    orEmpty(sql<{ chunk_count: number; status: string }[]>`
      SELECT chunk_count, status FROM knowledge_documents
    `),
    orEmpty(sql<{ success: boolean }[]>`
      SELECT success FROM provider_events ORDER BY created_at DESC LIMIT 200
    `),
  ]);
  const latencies = assistantMessages
    .map((message) => message.latency_ms)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);

  const bySource = assistantMessages.reduce<Record<string, number>>((accumulator, message) => {
    const key = message.source_type ?? "UNKNOWN";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const failures = providerEvents.filter((event) => !event.success).length;

  return {
    dbAvailable,
    sessionCount: Number(sessionCounts[0]?.count ?? 0),
    answerCount: assistantMessages.length,
    medianLatencyMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : null,
    p95LatencyMs: latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : null,
    bySource,
    documentCount: documents.length,
    chunkCount: documents.reduce((sum, doc) => sum + (doc.chunk_count ?? 0), 0),
    providerErrorRate: providerEvents.length
      ? Math.round((failures / providerEvents.length) * 100)
      : 0,
  };
}