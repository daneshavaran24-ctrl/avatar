import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "./admin.middleware";
import { createAdminSchema, deleteAdminSchema } from "./validators";

const credentialsSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => credentialsSchema.parse(data))
  .handler(async ({ data }) => {
    const [{ sql }, auth, rateLimit] = await Promise.all([
      import("@/lib/db/client.server"),
      import("./auth.server"),
      import("./ratelimit.server"),
    ]);

    // The one remaining credential endpoint; throttle it by IP so it cannot be
    // brute-forced.
    await rateLimit.enforceLimit("login", { ip: auth.clientIp() });

    const email = data.email.trim().toLowerCase();
    const [user] = await sql<{ id: string; password_hash: string }[]>`
      SELECT u.id, u.password_hash
      FROM admin_users u
      JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
      WHERE u.email = ${email}
      LIMIT 1
    `;

    // One generic message for every failure: never reveal whether the address
    // exists.
    const invalid = new Error("ایمیل یا گذرواژه درست نیست.");
    if (!user) throw invalid;
    if (!(await auth.verifyPassword(data.password, user.password_hash))) throw invalid;

    await auth.createAdminSession(user.id);
    await auth.pruneExpiredSessions();

    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { destroyAdminSession } = await import("./auth.server");
  await destroyAdminSession();
  return { ok: true as const };
});

/** Used by the admin panel to decide whether to render or redirect to /auth. */
export const adminWhoami = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminSession } = await import("./auth.server");
  const session = await getAdminSession();
  return session ? { email: session.email } : null;
});

const setupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
});

/** True when the system has no admin yet (first-time setup). */
export const hasNoAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { sql } = await import("@/lib/db/client.server");
  const [row] = await sql<{ count: string }[]>`
    SELECT count(*)::text FROM user_roles WHERE role = 'admin'
  `;
  return { empty: row.count === "0" };
});

/** Register the very first admin. Refuses if any admin already exists. */
export const setupFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => setupSchema.parse(data))
  .handler(async ({ data }) => {
    const [{ sql }, auth, bcrypt, rateLimit] = await Promise.all([
      import("@/lib/db/client.server"),
      import("./auth.server"),
      import("bcryptjs"),
      import("./ratelimit.server"),
    ]);

    await rateLimit.enforceLimit("login", { ip: auth.clientIp() });

    const [existing] = await sql<{ count: string }[]>`
      SELECT count(*)::text FROM user_roles WHERE role = 'admin'
    `;
    if (existing.count !== "0") {
      throw new Error("مدیر قبلاً ثبت شده. از فرم ورود استفاده کنید.");
    }

    const email = data.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(data.password, 12);

    const [user] = await sql<{ id: string }[]>`
      INSERT INTO admin_users (email, password_hash)
      VALUES (${email}, ${passwordHash})
      RETURNING id
    `;

    await sql`
      INSERT INTO user_roles (user_id, role)
      VALUES (${user.id}, 'admin')
    `;

    await auth.createAdminSession(user.id);
    return { ok: true as const };
  });

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireAdminSession])
  .handler(async () => {
    const { sql } = await import("@/lib/db/client.server");
    const rows = await sql<{ id: string; email: string; role: string; created_at: string }[]>`
      SELECT u.id, u.email, r.role::text, u.created_at::text
      FROM admin_users u
      JOIN user_roles r ON r.user_id = u.id
      ORDER BY u.created_at ASC
    `;
    return rows;
  });

export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => createAdminSchema.parse(data))
  .handler(async ({ data }) => {
    const { sql } = await import("@/lib/db/client.server");
    const bcrypt = await import("bcryptjs");

    const email = data.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(data.password, 12);

    try {
      const [user] = await sql<{ id: string }[]>`
        INSERT INTO admin_users (email, password_hash)
        VALUES (${email}, ${passwordHash})
        RETURNING id
      `;

      await sql`
        INSERT INTO user_roles (user_id, role)
        VALUES (${user.id}, ${data.role})
        ON CONFLICT (user_id, role) DO NOTHING
      `;

      return { ok: true as const, id: user.id };
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("unique")) {
        throw new Error("این ایمیل قبلاً ثبت شده است.");
      }
      throw err;
    }
  });

export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .inputValidator((data: unknown) => deleteAdminSchema.parse(data))
  .handler(async ({ data }) => {
    const { sql } = await import("@/lib/db/client.server");
    const [deleted] = await sql<{ id: string }[]>`
      DELETE FROM admin_users WHERE id = ${data.userId} RETURNING id
    `;

    if (!deleted) throw new Error("کاربر یافت نشد.");
    return { ok: true as const };
  });
