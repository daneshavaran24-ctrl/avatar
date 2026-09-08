import { sql } from "@/lib/db/client.server";

/**
 * Confirms a user still holds the admin role.
 *
 * requireAdmin() in auth.server.ts already establishes the session and the role
 * in one query, so admin server functions do not need to call this as well.
 * It remains for callers that hold only a user id.
 */
export async function assertAdmin(userId: string): Promise<void> {
  const [row] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM user_roles WHERE user_id = ${userId} AND role = 'admin' LIMIT 1
  `;
  if (!row) {
    throw new Error("دسترسی مدیریتی برای این حساب کاربری فعال نیست.");
  }
}
