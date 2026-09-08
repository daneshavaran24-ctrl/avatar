// Admin authentication endpoints.
//
// Login, logout, whoami — and deliberately nothing else. There is no signup and
// no password reset: accounts come from scripts/seed-admin.ts only, which is
// also how a forgotten password is recovered.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
