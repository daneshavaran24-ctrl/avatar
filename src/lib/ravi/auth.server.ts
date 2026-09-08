// Admin authentication.
//
// There is exactly one account type (admin) and exactly one way to create it:
// an operator running scripts/seed-admin.ts. No public signup, no ordinary-user
// login, no password-reset flow — those routes do not exist, so there is no
// reachable endpoint to attack. Visitors to the public front page are handled
// separately and anonymously by visitor.server.ts; they never get an account.
//
// Sessions are cookie-referenced database rows rather than stateless JWTs, so
// logging out (or changing a password) revokes access immediately.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { deleteCookie, getCookie, getRequestHeader, getRequestIP, setCookie } from "@tanstack/react-start/server";
import { sql } from "@/lib/db/client.server";

const COOKIE_NAME = "ravi_admin";
const SESSION_TTL_DAYS = 14;

export type AdminSession = { userId: string; email: string };

function sessionSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET تنظیم نشده است.");
  return secret;
}

function sign(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token).digest("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Splits `${token}.${hmac}` and verifies the signature, so a forged or tampered
 * cookie is rejected in memory before it ever costs a database round-trip.
 */
function readSignedCookie(value: string | undefined): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const token = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1), "utf8");
  const expected = Buffer.from(sign(token), "utf8");

  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? token : null;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Issues a session for an authenticated admin and sets the cookie. */
export async function createAdminSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await sql`
    INSERT INTO auth_sessions (user_id, token_hash, expires_at, user_agent, ip)
    VALUES (
      ${userId},
      ${hashToken(token)},
      ${expiresAt},
      ${getRequestHeader("user-agent")?.slice(0, 400) ?? null},
      ${clientIp()}
    )
  `;

  setCookie(COOKIE_NAME, `${token}.${sign(token)}`, cookieOptions(SESSION_TTL_DAYS * 24 * 60 * 60));
}

export async function destroyAdminSession(): Promise<void> {
  const token = readSignedCookie(getCookie(COOKIE_NAME));
  if (token) {
    await sql`DELETE FROM auth_sessions WHERE token_hash = ${hashToken(token)}`;
  }
  deleteCookie(COOKIE_NAME, { path: "/" });
}

/** Resolves the current admin, or null. Expired rows are cleaned up in passing. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = readSignedCookie(getCookie(COOKIE_NAME));
  if (!token) return null;

  const [row] = await sql<{ user_id: string; email: string }[]>`
    SELECT s.user_id, u.email
    FROM auth_sessions s
    JOIN admin_users u ON u.id = s.user_id
    JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()
    LIMIT 1
  `;

  if (!row) return null;
  return { userId: row.user_id, email: row.email };
}

/**
 * The single gate for the admin panel, settings, provider keys, knowledge
 * documents and conversation logs. Every admin server function goes through it.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new Error("دسترسی مدیریتی فعال نیست.");
  return session;
}

/** Client IP, preferring the proxy header Liara sets in front of the app. */
export function clientIp(): string {
  const forwarded = getRequestHeader("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return (getRequestIP() ?? "unknown").slice(0, 64);
}

/** Deletes expired sessions. Cheap enough to call opportunistically on login. */
export async function pruneExpiredSessions(): Promise<void> {
  await sql`DELETE FROM auth_sessions WHERE expires_at < now()`;
}
