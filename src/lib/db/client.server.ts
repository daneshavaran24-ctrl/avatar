// Postgres access for the whole server. Replaces the Supabase service-role
// client: only the server ever holds database credentials, and no browser
// talks to Postgres directly, which is why the schema carries no RLS.
//
// Load inside server handlers: const { sql } = await import("@/lib/db/client.server");
// Top-level import is safe only in other .server.ts modules — route files and
// *.functions.ts ship to the client bundle.
import postgres from "postgres";

function createSql() {
  const DATABASE_URL = process.env["DATABASE_URL"];

  if (!DATABASE_URL) {
    const message = "DATABASE_URL تنظیم نشده است؛ اتصال به پایگاه داده ممکن نیست.";
    console.error(`[DB] ${message}`);
    throw new Error(message);
  }

  return postgres(DATABASE_URL, {
    // A single Liara instance does not need a large pool, and managed Postgres
    // plans cap connections tightly. Raise alongside instance count.
    max: Number(process.env["DATABASE_POOL_MAX"] ?? 5),
    idle_timeout: 30,
    connect_timeout: 10,
    // Managed providers terminate TLS with their own CA; require encryption
    // without pinning a certificate chain we cannot ship.
    ssl: process.env["DATABASE_SSL"] === "false" ? false : "prefer",
    onnotice: () => {},
  });
}

type Sql = ReturnType<typeof createSql>;

let _sql: Sql | undefined;

function instance(): Sql {
  if (!_sql) _sql = createSql();
  return _sql;
}

// The proxy target must itself be callable: `sql` is used as a tagged template
// (sql`select ...`) as well as an object (sql.begin, sql.end, sql.unsafe).
export const sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (instance() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop, receiver) {
    return Reflect.get(instance(), prop, receiver);
  },
}) as Sql;

/** Closes the pool. Used by the migration and seed scripts, not by the app. */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = undefined;
  }
}
