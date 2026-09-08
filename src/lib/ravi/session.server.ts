import { sql } from "@/lib/db/client.server";

/**
 * Opens a chat session owned by an anonymous visitor. Ownership is what keeps
 * the public front page safe: assertOwnSession() in visitor.server.ts checks
 * this column before any later call may touch the conversation.
 */
export async function startSession(
  clientLabel: string | null,
  visitorId: string,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO conversation_sessions (client_label, status, visitor_id)
    VALUES (${clientLabel}, 'ACTIVE', ${visitorId})
    RETURNING id
  `;
  if (!row) throw new Error("ایجاد نشست گفتگو ناموفق بود.");
  return row.id;
}

export async function endSession(sessionId: string): Promise<void> {
  await sql`
    UPDATE conversation_sessions
    SET status = 'ENDED', ended_at = now()
    WHERE id = ${sessionId}
  `;
}
