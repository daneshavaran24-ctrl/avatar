import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth_/reset")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تعیین گذرواژهٔ جدید | راوی‌استان" },
      {
        name: "description",
        content: "تعیین گذرواژهٔ تازه برای حساب مدیریتی دستیار هوشمند راوی‌استان.",
      },
      { property: "og:title", content: "تعیین گذرواژهٔ جدید | راوی‌استان" },
      {
        property: "og:description",
        content: "بازیابی امن دسترسی مدیران به پنل مدیریت راوی‌استان.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The recovery link puts a session in place before this screen renders.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session));
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("گذرواژه و تکرار آن یکسان نیستند.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError("تغییر گذرواژه ناموفق بود. پیوند بازیابی ممکن است منقضی شده باشد.");
      return;
    }
    setDone(true);
    window.setTimeout(() => void navigate({ to: "/admin" }), 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl glass-panel p-8">
        <h1 className="text-2xl font-bold text-gradient-main">تعیین گذرواژهٔ جدید</h1>

        {!ready && (
          <p className="mt-4 text-sm text-muted-foreground">
            برای تغییر گذرواژه باید از پیوند بازیابی ارسال‌شده به ایمیل خود وارد شوید.
          </p>
        )}

        {ready && !done && (
          <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">گذرواژهٔ جدید</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={show ? "text" : "password"}
                  dir="ltr"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="bg-surface-2 pl-10 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  aria-label={show ? "پنهان‌کردن گذرواژه" : "نمایش گذرواژه"}
                  className="absolute inset-y-0 left-2 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">تکرار گذرواژه</Label>
              <Input
                id="confirm-password"
                type={show ? "text" : "password"}
                dir="ltr"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="bg-surface-2 text-left"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-destructive/15 px-4 py-2 text-sm text-destructive-foreground">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              ذخیرهٔ گذرواژه
            </Button>
          </form>
        )}

        {done && (
          <p className="mt-4 rounded-xl bg-surface-2 px-4 py-2 text-sm text-muted-foreground">
            گذرواژه تغییر کرد. در حال انتقال به پنل مدیریت…
          </p>
        )}
      </div>
    </main>
  );
}
