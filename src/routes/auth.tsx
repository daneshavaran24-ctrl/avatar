import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود و ثبت‌نام مدیران | راوی‌استان" },
      {
        name: "description",
        content:
          "ورود، ثبت‌نام و بازیابی گذرواژهٔ مدیران سازمان برای پنل مدیریت دستیار هوشمند راوی‌استان.",
      },
      { property: "og:title", content: "ورود و ثبت‌نام مدیران | راوی‌استان" },
      {
        property: "og:description",
        content: "دسترسی امن به پنل مدیریت پایگاه دانش و رفتار دستیار راوی‌استان.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

const TITLES: Record<Mode, string> = {
  signin: "ورود به پنل مدیریت",
  signup: "ایجاد حساب کاربری",
  forgot: "بازیابی گذرواژه",
};

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/admin" });
    });
  }, [navigate]);

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (mode === "signup" && password !== confirm) {
      setError("گذرواژه و تکرار آن یکسان نیستند.");
      return;
    }

    setBusy(true);

    if (mode === "forgot") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      setBusy(false);
      if (resetError) {
        setError("ارسال پیوند بازیابی ناموفق بود. نشانی ایمیل را بررسی کنید.");
        return;
      }
      setMessage("اگر این ایمیل در سامانه ثبت شده باشد، پیوند بازیابی برای آن ارسال می‌شود.");
      return;
    }

    const { error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/admin` },
          });

    setBusy(false);
    if (authError) {
      setError(
        mode === "signin"
          ? "ورود ناموفق بود. نشانی ایمیل یا گذرواژه را بررسی کنید."
          : "ثبت‌نام ناموفق بود. ممکن است این ایمیل قبلاً ثبت شده باشد.",
      );
      return;
    }
    if (mode === "signup") {
      setMessage(
        "حساب ساخته شد. پس از تأیید ایمیل، دسترسی مدیریتی باید توسط مدیر سامانه فعال شود.",
      );
      return;
    }
    void navigate({ to: "/admin" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl glass-panel p-8">
        <h1 className="text-2xl font-bold text-gradient-main">{TITLES[mode]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          دسترسی به پنل مدیریت تنها برای مدیران تأییدشدهٔ سازمان امکان‌پذیر است.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">نشانی ایمیل سازمانی</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="bg-surface-2 text-left"
            />
          </div>

          {mode !== "forgot" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">گذرواژه</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="bg-surface-2 pl-10 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "پنهان‌کردن گذرواژه" : "نمایش گذرواژه"}
                  className="absolute inset-y-0 left-2 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm">تکرار گذرواژه</Label>
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="bg-surface-2 text-left"
              />
            </div>
          )}

          {message && (
            <p className="rounded-xl bg-surface-2 px-4 py-2 text-sm text-muted-foreground">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-destructive/15 px-4 py-2 text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "signin" ? "ورود" : mode === "signup" ? "ایجاد حساب" : "ارسال پیوند بازیابی"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-center text-xs text-muted-foreground">
          {mode !== "signin" && (
            <button type="button" className="hover:underline" onClick={() => switchMode("signin")}>
              بازگشت به صفحهٔ ورود
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" className="hover:underline" onClick={() => switchMode("signup")}>
              ایجاد حساب کاربری جدید
            </button>
          )}
          {mode !== "forgot" && (
            <button type="button" className="hover:underline" onClick={() => switchMode("forgot")}>
              گذرواژه را فراموش کرده‌اید؟
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
