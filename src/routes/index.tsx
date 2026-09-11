import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";

import { LiveAvatarEmbed } from "@/components/ravi/LiveAvatarEmbed";
import { Button } from "@/components/ui/button";
import { requestAvatarSession } from "@/lib/ravi/api.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "راوی‌استان | دستیار هوشمند گفتگومحور سازمانی" },
      {
        name: "description",
        content:
          "راوی‌استان، دستیار هوشمند فارسی‌زبان با آواتار زنده که بر پایهٔ اسناد و دانش سازمان شما پاسخ می‌دهد.",
      },
      { property: "og:title", content: "راوی‌استان | دستیار هوشمند گفتگومحور سازمانی" },
      {
        property: "og:description",
        content:
          "گفتگوی زندهٔ صوتی و متنی با دستیار هوشمند سازمانی، متکی بر پایگاه دانش داخلی.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RaviStage,
});

function RaviStage() {
  const avatarSessionFn = useServerFn(requestAvatarSession);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void avatarSessionFn()
      .then((result) => {
        if (!active) return;
        if (result.configured) {
          setEmbedUrl(result.embedUrl);
          setSandbox(result.sandbox);
        } else {
          setError(reasonToMessage(result.reason));
        }
      })
      .catch(() => {
        if (active) setError("اتصال به سرویس آواتار برقرار نشد. لطفاً دوباره تلاش کنید.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [avatarSessionFn]);

  return (
    <main className="ambient-backdrop relative flex h-dvh flex-col overflow-hidden">
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 px-4 py-4 lg:px-8">
        <div className="rounded-2xl glass-panel-glow px-5 py-2.5">
          <h1 className="text-xl font-bold text-gradient-accent lg:text-2xl">راوی‌استان</h1>
          <p className="text-[11px] text-muted-foreground">دستیار هوشمند گفتگومحور سازمانی</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">
            <Settings2 className="size-4" />
            پنل مدیریت
          </Link>
        </Button>
      </header>

      <div className="relative z-0 flex min-h-0 flex-1 items-center justify-center px-4 pb-4 lg:px-8 lg:pb-8">
        {loading && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="text-sm">در حال آماده‌سازی آواتار…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl glass-panel-glow p-8 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              تلاش دوباره
            </Button>
          </div>
        )}

        {!loading && embedUrl && (
          <div className="flex h-full w-full max-w-5xl flex-col gap-2">
            {sandbox && (
              <p className="shrink-0 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-center text-xs text-yellow-100/80">
                حالت آزمایشی (sandbox) — این چهرهٔ دموی لایواواتار است، نه آواتار شما،
                و اعتباری مصرف نمی‌شود. برای دیدن آواتار خودتان متغیر
                <code dir="ltr" className="mx-1 font-mono">LIVEAVATAR_SANDBOX</code>
                را بردارید.
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl shadow-2xl shadow-primary/10">
              <LiveAvatarEmbed url={embedUrl} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function reasonToMessage(reason: string): string {
  if (/CONTEXT_NOT_CONFIGURED/.test(reason))
    return "شخصیت و صدای آواتار هنوز تنظیم نشده است. در داشبورد لایواواتار یک context با صدای فارسی بسازید و شناسهٔ آن را در تنظیمات ثبت کنید.";
  if (/NOT_CONFIGURED/.test(reason))
    return "کلید سرویس آواتار تنظیم نشده است. از پنل مدیریت کلید را وارد کنید.";
  if (/UNREACHABLE/.test(reason))
    return "اتصال به سرویس LiveAvatar برقرار نشد. لطفاً دوباره تلاش کنید.";
  if (/EMBED_FAILED/.test(reason))
    return "ساخت نشست آواتار ناموفق بود. اعتبار کلید و شناسه‌ها را بررسی کنید.";
  if (/EMBED_URL_EMPTY/.test(reason))
    return "سرویس آواتار پاسخ ناقص داد. لطفاً دوباره تلاش کنید.";
  return "سرویس آواتار در دسترس نیست. لطفاً تنظیمات را بررسی کنید.";
}
