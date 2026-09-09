/**
 * Production entry point: runs pending database migrations, then starts the
 * Nitro server.  Written in plain JS so it works without tsx in production.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[start] DATABASE_URL not set — skipping migration.");
    return;
  }

  let postgres;
  try {
    postgres = (await import("postgres")).default;
  } catch {
    console.log("[start] postgres driver not found — skipping migration.");
    return;
  }

  const sql = postgres(url, {
    max: 1,
    connect_timeout: 10,
    ssl: process.env.DATABASE_SSL === "false" ? false : "prefer",
    onnotice: (n) => console.log(`  postgres: ${n.message}`),
  });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const applied = new Set(
      (await sql`SELECT filename FROM _migrations`).map((r) => r.filename),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const filename of files) {
      if (applied.has(filename)) continue;
      const statements = await readFile(join(MIGRATIONS_DIR, filename), "utf8");
      console.log(`[migrate] → ${filename}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(statements);
        await tx`INSERT INTO _migrations (filename) VALUES (${filename})`;
      });
      count += 1;
    }

    console.log(
      count === 0
        ? "[migrate] Database is up to date."
        : `[migrate] Applied ${count} migration(s).`,
    );
  } catch (err) {
    console.error("[migrate] Migration failed (non-fatal):", err?.message ?? err);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await migrate();

// Start the Nitro server.
await import("../.output/server/index.mjs");
