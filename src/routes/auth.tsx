import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود مدیران | راوی‌استان" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthRedirect,
});

function AuthRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/admin" });
  }, [navigate]);

  return (
    <main className="ambient-backdrop flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </main>
  );
}
