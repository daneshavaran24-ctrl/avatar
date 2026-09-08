/**
 * Applies migrations/*.sql in filename order, once each, inside a transaction.
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 *
 * There are no down-migrations: this system has one database and nothing to
 * roll back to.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL تنظیم نشده است.");
    process.exit(1);
  }

  const sql = postgres(url, {
    max: 1,
    ssl: process.env["DATABASE_SSL"] === "false" ? false : "prefer",
    // Migrations legitimately raise NOTICE (e.g. pgvector unavailable); show them.
    onnotice: (notice) => console.log(`  postgres: ${notice.message}`),
  });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const applied = new Set(
      (await sql<{ filename: string }[]>`SELECT filename FROM _migrations`).map((r) => r.filename),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    let count = 0;
    for (const filename of files) {
      if (applied.has(filename)) continue;

      const statements = await readFile(join(MIGRATIONS_DIR, filename), "utf8");
      console.log(`→ ${filename}`);

      await sql.begin(async (tx) => {
        await tx.unsafe(statements);
        await tx`INSERT INTO _migrations (filename) VALUES (${filename})`;
      });

      count += 1;
    }

    const [backend] = await sql<
      { value: string }[]
    >`SELECT value FROM system_meta WHERE key = 'vector_backend'`;

    console.log(
      count === 0
        ? "پایگاه داده به‌روز است؛ مهاجرت تازه‌ای اعمال نشد."
        : `${count} مهاجرت اعمال شد.`,
    );
    console.log(
      `جست‌وجوی برداری: ${backend?.value === "pgvector" ? "pgvector" : "محاسبه در برنامه (آرایه)"}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("مهاجرت ناموفق بود:", error instanceof Error ? error.message : error);
  process.exit(1);
});
