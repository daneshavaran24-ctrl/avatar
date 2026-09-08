// Anonymous visitor identity for the public front page.
//
// The front page needs no account: anyone can open it and talk to the avatar.
// But "no account" must not mean "no boundary" — a visitor may only touch their
// own conversation. Each browser therefore carries a signed cookie holding a
// random id, and conversation_sessions.visitor_id records which visitor owns a
// session.
//
// This id is not an account and grants nothing else: it never reaches the admin
// panel, settings, provider keys, knowledge documents, or anyone else's chat.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { sql } from "@/lib/db/client.server";

const COOKIE_NAME = "ravi_visitor";
const COOKIE_TTL_SECONDS = 365 * 24 * 60 * 60;

function sign(value: string): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET تنظیم نشده است.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

function readSigned(raw: string | undefined): string | null {
  if (!raw) return null;
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;

  const id = raw.slice(0, separator);
  const provided = Buffer.from(raw.slice(separator + 1), "utf8");
  const expected = Buffer.from(sign(id), "utf8");

  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? id : null;
}

/** Returns this browser's visitor id, minting and setting one when absent. */
export function getOrCreateVisitorId(): string {
  const existing = readSigned(getCookie(COOKIE_NAME));
  if (existing) return existing;

  const id = randomUUID();
  setCookie(COOKIE_NAME, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: COOKIE_TTL_SECONDS,
  });
  return id;
}

/**
 * Confirms a conversation session belongs to this visitor.
 *
 * Without this check any caller could pass someone else's session id and append
 * to — or end — their conversation. The error deliberately does not distinguish
 * "no such session" from "not yours", so it cannot be used to probe for valid
 * session ids.
 */
export async function assertOwnSession(sessionId: string, visitorId: string): Promise<void> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM conversation_sessions
    WHERE id = ${sessionId} AND visitor_id = ${visitorId}
    LIMIT 1
  `;
  if (!row) throw new Error("این گفتگو در دسترس نیست.");
}
