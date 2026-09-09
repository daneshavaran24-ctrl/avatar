import { createMiddleware } from "@tanstack/react-start";

export const requireAdminSession = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    return next({ context: { userId: "admin", email: "admin@local" } });
  },
);
