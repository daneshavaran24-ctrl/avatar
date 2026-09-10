import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db/client.server";

export const MANAGED_KEYS = ["OPENAI_API_KEY", "HEYGEN_API_KEY"] as const;

export type ManagedKeyName = (typeof MANAGED_KEYS)[number];

function encryptionKey(): Buffer {
  const raw = process.env["RAVI_KEY_SECRET"];
  if (!raw) throw new Error("RAVI_KEY_SECRET تنظیم نشده است.");
  return createHash("sha256").update(raw).digest();
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function decrypt(stored: string): string | null {
  try {
    const buf = Buffer.from(stored, "base64");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Reads every stored key, decrypted. Values never leave the server. */
export async function loadStoredKeys(): Promise<Partial<Record<ManagedKeyName, string>>> {
  const out: Partial<Record<ManagedKeyName, string>> = {};
  try {
    const rows = await sql<{ name: string; value_ciphertext: string }[]>`
      SELECT name, value_ciphertext FROM provider_keys
    `;
    for (const row of rows) {
      if (!(MANAGED_KEYS as readonly string[]).includes(row.name)) continue;
      const value = decrypt(row.value_ciphertext);
      if (value) out[row.name as ManagedKeyName] = value;
    }
  } catch (error) {
    console.error("[KeyStore] loadStoredKeys failed:", error instanceof Error ? error.message : error);
    return out;
  }
  return out;
}

export async function saveStoredKey(name: ManagedKeyName, value: string) {
  try {
    await sql`
      INSERT INTO provider_keys (name, value_ciphertext, updated_at)
      VALUES (${name}, ${encrypt(value.trim())}, now())
      ON CONFLICT (name) DO UPDATE
        SET value_ciphertext = EXCLUDED.value_ciphertext, updated_at = now()
    `;
  } catch (error) {
    console.error("[KeyStore] saveStoredKey failed:", error instanceof Error ? error.message : error);
    throw new Error("ذخیرهٔ کلید ناموفق بود.");
  }
  return { ok: true as const };
}

export async function deleteStoredKey(name: ManagedKeyName) {
  try {
    await sql`DELETE FROM provider_keys WHERE name = ${name}`;
  } catch (error) {
    console.error("[KeyStore] deleteStoredKey failed:", error instanceof Error ? error.message : error);
    throw new Error("حذف کلید ناموفق بود.");
  }
  return { ok: true as const };
}

/** Boolean-only status plus a masked hint — the raw value is never returned. */
export async function storedKeyStatus() {
  const keys = await loadStoredKeys();
  return MANAGED_KEYS.map((name) => {
    const value = keys[name];
    return {
      name,
      stored: Boolean(value),
      masked: value ? `${value.slice(0, 3)}…${value.slice(-3)}` : null,
      fromEnv: Boolean(process.env[name]),
    };
  });
}