import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import {
  adminLogin,
  adminWhoami,
  hasNoAdmin,
  setupFirstAdmin,
} from "@/lib/ravi/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ورود مدیران | راوی‌استان" },
      {
        name: "description",
        content: "ورود مدیران سازمان به پنل مدیریت دستیار هوشمند راوی‌استان.",
      },
      { property: "og:title", content: "ورود مدیران | راوی‌استان" },
      {
        property: "og:description",
        content: "دسترسی امن به پنل مدیریت پایگاه دانش و رفتار دستیار راوی‌استان.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const login = useServerFn(adminLogin);
  const whoami = useServerFn(adminWhoami);
  const checkNoAdmin = useServerFn(hasNoAdmin);
  const setupFn = useServerFn(setupFirstAdmin);

  const [mode, setMode] = useState<"loading" | "login" | "setup">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const session = await whoami();
        if (session) {
          void navigate({ to: "/admin" });
          return;
        }
      } catch {
        // Session check failed — continue to login/setup form.
      }

      try {
        const result = await checkNoAdmin();
        setMode(result.empty ? "setup" : "login");
      } catch {
        setMode("login");
        setError("اتصال به سرور برقرار نشد. لطفاً تنظیمات دیتابیس را بررسی کنید.");
      }
    })();
  }, [navigate, whoami, checkNoAdmin]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ data: { email, password } });
      void navigate({ to: "/admin" });
    } catch (loginError) {
      setError(
        loginError instanceof Error && loginError.message
          ? loginError.message
          : "ورود ناموفق بود. دوباره تلاش کنید.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSetup(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await setupFn({ data: { email, password } });
      void navigate({ to: "/admin" });
    } catch (setupError) {
      setError(
        setupError instanceof Error && setupError.message
          ? setupError.message
          : "ثبت‌نام ناموفق بود. دوباره تلاش کنید.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (mode === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">در حال بررسی…</p>
      </main>
    );
  }

  const isSetup = mode === "setup";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl glass-panel p-8">
        <h1 className="text-2xl font-bold text-gradient-main">
          {isSetup ? "راه‌اندازی اولیه" : "ورود به پنل مدیریت"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isSetup
            ? "هنوز هیچ مدیری ثبت نشده. اولین حساب مدیریتی را بسازید."
            : (
                <>
                  این صفحه ویژهٔ مدیران سازمان است. برای گفتگو با راوی‌استان نیازی به حساب کاربری
                  نیست؛ کافی است به{" "}
                  <a className="underline hover:text-foreground" href="/">
                    صفحهٔ اصلی
                  </a>{" "}
                  بروید.
                </>
              )}
        </p>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={isSetup ? handleSetup : handleLogin}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">نشانی ایمیل{isSetup ? "" : " سازمانی"}</Label>
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">
              گذرواژه{isSetup ? " (حداقل ۱۲ کاراکتر)" : ""}
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                dir="ltr"
                required
                autoComplete={isSetup ? "new-password" : "current-password"}
                minLength={isSetup ? 12 : undefined}
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

          {error && (
            <p className="rounded-xl bg-destructive/15 px-4 py-2 text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {isSetup ? "ساخت حساب مدیر" : "ورود"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {isSetup
            ? "این فرم فقط یک بار نمایش داده می‌شود. پس از ساخت اولین مدیر، ثبت‌نام جدید فقط از پنل مدیریت ممکن است."
            : "حساب مدیریتی تنها توسط مدیر سامانه ساخته می‌شود. اگر گذرواژه را فراموش کرده‌اید، با مدیر سامانه تماس بگیرید."}
        </p>
      </div>
    </main>
  );
}
