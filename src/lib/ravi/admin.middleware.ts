import { createMiddleware } from "@tanstack/react-start";

/**
 * The single gate in front of every administrative endpoint: the admin panel,
 * settings, provider keys, knowledge documents and conversation logs.
 *
 * It resolves the admin session cookie and the admin role in one query and
 * exposes `context.userId`, so handlers need no further authorisation check of
 * their own. An anonymous visitor of the public front page carries a different
 * cookie entirely and can never satisfy this.
 */
export const requireAdminSession = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { requireAdmin } = await import("./auth.server");
    const session = await requireAdmin();
    return next({ context: { userId: session.userId, email: session.email } });
  },
);
