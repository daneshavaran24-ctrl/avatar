import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  checkConnection,
  diagnoseDatabaseHealth,
  getConnections,
  listAvatarLooks,
  listSettingsHistory,
  removeProviderKey,
  restoreSettingsHistory,
  saveProviderKey,
  selectAvatar,
  setServiceEnabled,
} from "@/lib/ravi/admin.functions";

type ManagedKeyName =
  | "OPENAI_API_KEY"
  | "HEYGEN_API_KEY"
  | "LIVEAVATAR_AVATAR_ID"
  | "LIVEAVATAR_CONTEXT_ID";

interface KeyStatus {
  name: string;
  stored: boolean;
  masked: string | null;
  fromEnv: boolean;
}

type ConnectionKey = "openai" | "heygen";
type ToggleableKey = "heygen";

interface LastCheck {
  ok: boolean;
  message: string;
  latencyMs: number | null;
  at: string;
}

/** Server errors arrive as opaque Error objects; surface their text to the operator. */
function errorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message || message === "[object Object]") return fallback;
  if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
    return "حساب شما دسترسی مدیریت ندارد یا نشست منقضی شده است. دوباره وارد شوید.";
  }
  return message;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const SERVICES: {
  key: ConnectionKey;
  title: string;
  description: string;
  secrets: ManagedKeyName[];
  docs: string | null;
}[] = [
  {
    key: "openai",
    title: "OpenAI (کلید اصلی و الزامی)",
    description:
      "موتور تولید پاسخ، بردارسازی اسناد، تبدیل گفتار به متن و تولید صدای فارسی. بدون این کلید سامانه پاسخ نمی‌دهد.",
    secrets: ["OPENAI_API_KEY"],
    docs: "https://platform.openai.com/api-keys",
  },
  {
    key: "heygen",
    title: "LiveAvatar (آواتار زنده)",
    description:
      "کلید را از app.liveavatar.com/developers بگیرید. یک شناسهٔ آواتار پیش‌فرض از قبل فعال است و فقط برای تغییر آواتار لازم است چیزی وارد کنید؛ بدون شناسهٔ context حالت sandbox فعال می‌شود.",
    secrets: ["HEYGEN_API_KEY", "LIVEAVATAR_AVATAR_ID", "LIVEAVATAR_CONTEXT_ID"],
    docs: "https://app.liveavatar.com/developers",
  },
];

export function AdminConnections() {
  const queryClient = useQueryClient();
  const connectionsFn = useServerFn(getConnections);
  const checkFn = useServerFn(checkConnection);
  const toggleFn = useServerFn(setServiceEnabled);
  const diagnoseFn = useServerFn(diagnoseDatabaseHealth);

  const diagnosis = useQuery({
    queryKey: ["admin", "db-health"],
    queryFn: () => diagnoseFn(),
  });

  const overview = useQuery({
    queryKey: ["admin", "connections"],
    queryFn: () => connectionsFn(),
  });

  const [results, setResults] = useState<
    Record<string, { ok: boolean; message: string; latencyMs?: number }>
  >({});
  const [testing, setTesting] = useState<ConnectionKey | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (input: { key: ToggleableKey; enabled: boolean }) => toggleFn({ data: input }),
    onSuccess: () => {
      setToggleError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "connections"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings-history"] });
    },
    onError: (error) => setToggleError(errorText(error, "تغییر وضعیت سرویس ناموفق بود.")),
  });

  async function runTest(key: ConnectionKey) {
    setTesting(key);
    try {
      const result = await checkFn({ data: key });
      setResults((current) => ({ ...current, [key]: result }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [key]: { ok: false, message: errorText(error, "بررسی اتصال انجام نشد.") },
      }));
    } finally {
      setTesting(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "connections"] });
    }
  }

  const data = overview.data;
  const accessDenied = overview.isError;

  const db = diagnosis.data;
  const dbProblem = db && (!db.dbConnected || !db.providerKeysTableExists || !db.hasKeySecret);

  return (
    <div className="flex flex-col gap-6">
      {dbProblem && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
          <p className="font-semibold text-yellow-200">تشخیص مشکل پایگاه داده</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-yellow-100/80">
            {!db.dbConnected && (
              <li>
                اتصال به دیتابیس برقرار نشد
                {db.dbError && <span className="text-xs opacity-70"> — {db.dbError}</span>}
              </li>
            )}
            {db.dbConnected && !db.providerKeysTableExists && (
              <li>جدول <code dir="ltr">provider_keys</code> وجود ندارد — مایگریشن اجرا نشده است. اپ را ری‌استارت کنید.</li>
            )}
            {!db.hasKeySecret && (
              <li>متغیر محیطی <code dir="ltr">RAVI_KEY_SECRET</code> تنظیم نشده — بدون آن ذخیره و خوانش کلیدها ممکن نیست.</li>
            )}
            {db.dbConnected && db.providerKeysTableExists && db.hasKeySecret && db.storedKeyCount === 0 && (
              <li>هیچ کلیدی در دیتابیس ذخیره نشده است.</li>
            )}
          </ul>
          {!db.dbConnected && (
            <div className="mt-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
              <p className="font-medium text-yellow-200">راه‌حل جایگزین: متغیرهای محیطی</p>
              <p className="mt-1 text-xs text-yellow-100/70">
                تا زمانی که دیتابیس در دسترس نیست، می‌توانید کلیدهای سرویس‌ها را مستقیماً به‌عنوان متغیر محیطی در پنل لیارا (بخش «متغیرهای محیطی» اپلیکیشن) تنظیم کنید. سرویس‌ها بدون دیتابیس هم با این متغیرها کار می‌کنند:
              </p>
              <ul className="mt-2 space-y-1 text-xs" dir="ltr">
                <li className="font-mono text-yellow-200">OPENAI_API_KEY <span className="text-yellow-100/50">(الزامی — موتور پاسخ)</span></li>
                <li className="font-mono text-yellow-200">HEYGEN_API_KEY <span className="text-yellow-100/50">(الزامی — کلید LiveAvatar)</span></li>
                <li className="font-mono text-yellow-200">LIVEAVATAR_AVATAR_ID <span className="text-yellow-100/50">(اختیاری — مقدار پیش‌فرض از قبل فعال است)</span></li>
                <li className="font-mono text-yellow-200">LIVEAVATAR_CONTEXT_ID <span className="text-yellow-100/50">(اختیاری — بدون آن حالت sandbox)</span></li>
              </ul>
              <p className="mt-2 text-xs text-yellow-100/70">
                پس از تنظیم متغیرها، اپ را ری‌استارت کنید. وضعیت هر کلید در کارت‌های زیر نشان داده می‌شود.
              </p>
            </div>
          )}
        </div>
      )}
      {accessDenied && (
        <p className="rounded-2xl bg-destructive/15 p-4 text-sm text-destructive-foreground">
          {errorText(overview.error, "دریافت وضعیت سرویس‌ها ناموفق بود.")}
        </p>
      )}
      {data?.avatarSession && (
        <p
          className={`rounded-2xl p-4 text-sm ${
            data.avatarSession.ok
              ? "bg-primary/10 text-primary"
              : "bg-destructive/15 text-destructive-foreground"
          }`}
        >
          آخرین تلاش برای ساخت نشست آواتار:{" "}
          {data.avatarSession.ok ? "موفق" : "ناموفق"}
          {data.avatarSession.reason ? ` — ${data.avatarSession.reason}` : ""}
        </p>
      )}
      <section className="rounded-3xl glass-panel p-5">
        <h2 className="text-base font-semibold">کلیدهای سرویس‌ها</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          کلید هر سرویس را همین‌جا وارد و ذخیره کنید. مقدار کلید به‌صورت رمزنگاری‌شده روی سرور
          نگهداری می‌شود، هرگز به مرورگر بازگردانده نمی‌شود و فقط نشانهٔ کوتاه آن نمایش داده
          می‌شود.
        </p>
        {toggleError && (
          <p className="mt-3 text-xs text-destructive-foreground">{toggleError}</p>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {SERVICES.map((service) => {
            const status = data?.connections.find((item) => item.key === service.key);
            const result = results[service.key];
            const lastCheck = (status?.lastCheck ?? null) as LastCheck | null;
            const primaryKey = data?.keys?.find((k) => k.name === service.secrets[0]);
            return (
              <div key={service.key} className="rounded-2xl bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{service.title}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">
                      {service.description}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                      status?.configured
                        ? "bg-primary/15 text-primary"
                        : "bg-destructive/15 text-destructive-foreground"
                    }`}
                  >
                    {status?.configured
                      ? primaryKey?.fromEnv && !primaryKey?.stored
                        ? "از متغیر محیطی"
                        : "ثبت‌شده"
                      : "ثبت‌نشده"}
                  </span>
                </div>

                {service.key === "heygen" && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-background/40 px-3 py-2">
                    <Label htmlFor={`toggle-${service.key}`} className="text-xs">
                      {status?.enabled === false ? "غیرفعال" : "فعال"}
                    </Label>
                    <Switch
                      id={`toggle-${service.key}`}
                      checked={status?.enabled !== false}
                      disabled={!data || toggle.isPending}
                      onCheckedChange={(checked) =>
                        toggle.mutate({ key: service.key as ToggleableKey, enabled: checked })
                      }
                    />
                  </div>
                )}

                {service.secrets.map((secret) => (
                  <KeyField
                    key={secret}
                    name={secret}
                    status={data?.keys?.find((item) => item.name === secret)}
                  />
                ))}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={testing === service.key}
                    onClick={() => void runTest(service.key)}
                  >
                    {testing === service.key ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    بررسی اتصال
                  </Button>
                  {service.docs && (
                    <a
                      href={service.docs}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      دریافت کلید
                    </a>
                  )}
                </div>

                {result && (
                  <p
                    className={`mt-2 flex items-center gap-2 text-xs ${
                      result.ok ? "text-primary" : "text-destructive-foreground"
                    }`}
                  >
                    {result.ok ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <XCircle className="size-3.5" />
                    )}
                    {result.message}
                    {typeof result.latencyMs === "number" && ` — ${result.latencyMs} میلی‌ثانیه`}
                  </p>
                )}
                {!result && lastCheck && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    آخرین بررسی ({formatDate(lastCheck.at)}): {lastCheck.ok ? "موفق" : "ناموفق"} —{" "}
                    {lastCheck.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {data && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-surface-2 px-3 py-1">موتور پاسخ فعال: OpenAI</span>
            <span className="rounded-full bg-surface-2 px-3 py-1">گفتار به متن فعال: OpenAI</span>
            <span className="rounded-full bg-surface-2 px-3 py-1">
              صحنهٔ آواتار: {data.avatarActive ? "LiveAvatar زنده" : "پیکربندی نشده"}
            </span>
          </div>
        )}
      </section>

      <AvatarGallery
        heygenReady={Boolean(data?.avatarActive)}
        current={data?.avatar}
        vendor={data?.avatarVendor ?? null}
      />

      <SettingsHistory />
    </div>
  );
}

function KeyField({ name, status }: { name: ManagedKeyName; status: KeyStatus | undefined }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveProviderKey);
  const removeFn = useServerFn(removeProviderKey);
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "connections"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "avatar-looks"] });
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: { name, value: value.trim() } }),
    onSuccess: () => {
      setValue("");
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: () => removeFn({ data: name }),
    onSuccess: invalidate,
  });

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Label htmlFor={`key-${name}`} className="text-[11px] text-muted-foreground" dir="ltr">
        {name}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`key-${name}`}
          dir="ltr"
          type={visible ? "text" : "password"}
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={status?.masked ?? "کلید را وارد کنید…"}
          className="h-9 bg-surface-2 text-left"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 shrink-0"
          aria-label={visible ? "پنهان‌سازی کلید" : "نمایش کلید"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          className="size-9 shrink-0"
          aria-label="ذخیرهٔ کلید"
          disabled={save.isPending || value.trim().length < 3}
          onClick={() => save.mutate()}
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
        </Button>
        {status?.stored && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0 text-destructive-foreground"
            aria-label="حذف کلید"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      {save.isError || remove.isError ? (
        <p className="text-[11px] text-destructive-foreground">
          {errorText(save.error ?? remove.error, "عملیات روی کلید ناموفق بود.")}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {save.isSuccess
            ? "کلید با موفقیت ذخیره شد."
            : status?.stored
              ? `کلید ذخیره‌شده: ${status.masked}`
              : status?.fromEnv
                ? "از مخزن امن سرور خوانده می‌شود."
                : "هنوز کلیدی ثبت نشده است."}
        </p>
      )}
    </div>
  );
}

function AvatarGallery({
  heygenReady,
  current,
  vendor,
}: {
  heygenReady: boolean;
  vendor: "heygen" | "liveavatar" | null;
  current:
    | { avatarId: string; voiceId: string; avatarName: string; voiceName: string }
    | undefined;
}) {
  const queryClient = useQueryClient();
  const looksFn = useServerFn(listAvatarLooks);
  const selectFn = useServerFn(selectAvatar);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const looks = useQuery({
    queryKey: ["admin", "avatar-looks"],
    queryFn: () => looksFn(),
    enabled: heygenReady,
  });

  const [avatarId, setAvatarId] = useState(current?.avatarId ?? "");
  const [voiceId, setVoiceId] = useState(current?.voiceId ?? "");
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState("all");
  const [voiceQuery, setVoiceQuery] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState("all");
  const [voiceGender, setVoiceGender] = useState("all");
  const [interactiveOnly, setInteractiveOnly] = useState(true);

  useEffect(() => {
    setAvatarId(current?.avatarId ?? "");
    setVoiceId(current?.voiceId ?? "");
  }, [current?.avatarId, current?.voiceId]);

  const save = useMutation({
    mutationFn: (input: { avatarName: string; voiceName: string }) =>
      selectFn({
        data: {
          avatarId,
          voiceId,
          ...input,
          previewUrl:
            allAvatars.find((avatar) => avatar.avatarId === avatarId)?.previewUrl ?? "",
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "connections"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings-history"] });
    },
  });

  if (!heygenReady) {
    return (
      <section className="rounded-3xl glass-panel p-5">
        <h2 className="text-base font-semibold">گالری چهره‌های LiveAvatar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          پس از ثبت کلید LiveAvatar و فعال بودن این سرویس، فهرست چهره‌های حساب شما همین‌جا
          نمایش داده می‌شود تا شناسهٔ آواتار را پیدا کرده و در فیلد LIVEAVATAR_AVATAR_ID بگذارید.
        </p>
      </section>
    );
  }

  const allAvatars = looks.data?.avatars ?? [];
  const allVoices = looks.data?.voices ?? [];

  const avatars = allAvatars.filter((avatar) => {
    const matchesQuery = query ? avatar.name.toLowerCase().includes(query.toLowerCase()) : true;
    const matchesGender =
      gender === "all" || (avatar.gender ?? "").toLowerCase() === gender.toLowerCase();
    return matchesQuery && matchesGender;
  });

  const languages = Array.from(
    new Set(allVoices.map((voice) => voice.language).filter(Boolean) as string[]),
  ).sort();

  const voices = allVoices.filter((voice) => {
    const matchesQuery = voiceQuery
      ? voice.name.toLowerCase().includes(voiceQuery.toLowerCase())
      : true;
    const matchesLanguage = voiceLanguage === "all" || voice.language === voiceLanguage;
    const matchesGender =
      voiceGender === "all" || (voice.gender ?? "").toLowerCase() === voiceGender.toLowerCase();
    const matchesInteractive = !interactiveOnly || voice.interactive;
    return matchesQuery && matchesLanguage && matchesGender && matchesInteractive;
  });

  const selectedAvatarName =
    allAvatars.find((avatar) => avatar.avatarId === avatarId)?.name || current?.avatarName || "";
  const selectedVoiceName =
    allVoices.find((voice) => voice.voiceId === voiceId)?.name || current?.voiceName || "";
  const activeAvatar = allAvatars.find((avatar) => avatar.avatarId === current?.avatarId);
  const portraitSelection = /portrait|close[ -]?up|پرتره/i.test(current?.avatarName ?? "");

  function playPreview(url: string) {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    void audio.play().catch(() => undefined);
  }

  return (
    <section className="rounded-3xl glass-panel p-5">
      <div className="mb-5 grid gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:grid-cols-[7rem_1fr]">
        <div className="aspect-3/4 overflow-hidden rounded-lg bg-background/50">
          {activeAvatar?.previewUrl ? (
            <img
              src={activeAvatar.previewUrl}
              alt={`پیش‌نمایش انتخاب فعال ${current?.avatarName || current?.avatarId}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
              پیش‌نمایش در دسترس نیست
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">انتخاب فعال روی استیج</h2>
            <span className="rounded-full bg-primary/15 px-2 py-1 text-[11px] text-primary">
              {vendor === "liveavatar" ? "LiveAvatar" : vendor === "heygen" ? "HeyGen" : "نامشخص"}
            </span>
          </div>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div><dt className="text-muted-foreground">چهره</dt><dd className="mt-1 font-medium">{current?.avatarName || "بدون نام"}</dd></div>
            <div><dt className="text-muted-foreground">صدا</dt><dd className="mt-1 font-medium">{current?.voiceName || "صدای پیش‌فرض چهره"}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">شناسهٔ چهره</dt><dd dir="ltr" className="mt-1 break-all font-mono">{current?.avatarId || "—"}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">شناسهٔ صدا</dt><dd dir="ltr" className="mt-1 break-all font-mono">{current?.voiceId || "default"}</dd></div>
          </dl>
          {portraitSelection && (
            <p className="mt-3 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground">
              این Look از نوع پرتره است و تصویر منبع بدن کامل ندارد. برای نمای واقعاً تمام‌قد، یک Look تمام‌قد انتخاب کنید.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">گالری چهره‌های LiveAvatar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            چهرهٔ فعلی: {current?.avatarName || current?.avatarId || "انتخاب نشده"}
            {current?.voiceName ? ` — صدا: ${current.voiceName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جستجوی نام چهره…"
            className="w-56 bg-surface-2"
          />
          <select
            aria-label="فیلتر جنسیت چهره"
            value={gender}
            onChange={(event) => setGender(event.target.value)}
            className="h-10 rounded-md border border-border bg-surface-2 px-3 text-sm"
          >
            <option value="all">همهٔ جنسیت‌ها</option>
            <option value="female">زن</option>
            <option value="male">مرد</option>
          </select>
        </div>
      </div>

      {looks.isLoading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          در حال دریافت فهرست چهره‌ها…
        </p>
      )}
      {looks.isError && (
        <p className="mt-4 text-sm text-destructive-foreground">
          دریافت فهرست چهره‌ها ناموفق بود. اعتبار کلید LiveAvatar را بررسی کنید.
        </p>
      )}

      <div className="mt-4 grid max-h-96 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {avatars.map((avatar) => (
          <button
            key={avatar.avatarId}
            type="button"
            onClick={() => setAvatarId(avatar.avatarId)}
            className={`overflow-hidden rounded-2xl border text-right transition ${
              avatarId === avatar.avatarId
                ? "border-primary ring-2 ring-primary/40"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="aspect-3/4 w-full bg-surface-2">
              {avatar.previewUrl ? (
                <img
                  src={avatar.previewUrl}
                  alt={`پیش‌نمایش چهرهٔ ${avatar.name}`}
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  بدون پیش‌نمایش
                </div>
              )}
            </div>
            <p className="truncate px-3 py-2 text-xs">{avatar.name}</p>
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-surface-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-sm">صدای گوینده</Label>
          <Input
            value={voiceQuery}
            onChange={(event) => setVoiceQuery(event.target.value)}
            placeholder="جستجوی نام صدا…"
            className="h-9 w-48 bg-background/40"
          />
          <select
            aria-label="فیلتر زبان صدا"
            value={voiceLanguage}
            onChange={(event) => setVoiceLanguage(event.target.value)}
            className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
          >
            <option value="all">همهٔ زبان‌ها</option>
            {languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
          <select
            aria-label="فیلتر جنسیت صدا"
            value={voiceGender}
            onChange={(event) => setVoiceGender(event.target.value)}
            className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
          >
            <option value="all">همهٔ جنسیت‌ها</option>
            <option value="female">زن</option>
            <option value="male">مرد</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={interactiveOnly}
              onCheckedChange={setInteractiveOnly}
              aria-label="فقط صداهای سازگار با آواتار تعاملی"
            />
            فقط سازگار با آواتار تعاملی
          </label>
        </div>

        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl">
          <button
            type="button"
            onClick={() => setVoiceId("")}
            className={`flex w-full items-center justify-between px-3 py-2 text-sm ${
              voiceId === "" ? "bg-primary/15 text-primary" : "hover:bg-background/40"
            }`}
          >
            صدای پیش‌فرض چهره
          </button>
          {voices.map((voice) => (
            <div
              key={voice.voiceId}
              className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                voiceId === voice.voiceId ? "bg-primary/15" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setVoiceId(voice.voiceId)}
                className="flex-1 text-right"
              >
                <span className="block truncate">{voice.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {[voice.language, voice.gender].filter(Boolean).join(" — ")}
                </span>
              </button>
              {voice.previewUrl && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  aria-label={`پخش پیش‌نمایش صدای ${voice.name}`}
                  onClick={() => playPreview(voice.previewUrl!)}
                >
                  <Play className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          انتخاب جدید: {selectedAvatarName || "—"} / {selectedVoiceName || "صدای پیش‌فرض"}
          <span dir="ltr" className="block">
            {avatarId || "—"} · {voiceId || "default"}
          </span>
        </p>
        <Button
          type="button"
          disabled={save.isPending || !avatarId}
          onClick={() =>
            save.mutate({ avatarName: selectedAvatarName, voiceName: selectedVoiceName })
          }
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          ذخیرهٔ چهره و صدا
        </Button>
      </div>
      {save.isError && (
        <p className="mt-2 text-xs text-destructive-foreground">
          {errorText(save.error, "ذخیرهٔ انتخاب ناموفق بود.")}
        </p>
      )}
      {save.isSuccess && (
        <p className="mt-2 text-xs text-primary">
          انتخاب ذخیره شد. صفحهٔ دستیار را تازه‌سازی کنید تا چهرهٔ جدید بارگذاری شود.
        </p>
      )}
    </section>
  );
}

function SettingsHistory() {
  const queryClient = useQueryClient();
  const historyFn = useServerFn(listSettingsHistory);
  const restoreFn = useServerFn(restoreSettingsHistory);

  const history = useQuery({
    queryKey: ["admin", "settings-history"],
    queryFn: () => historyFn(),
  });

  const restore = useMutation({
    mutationFn: (id: string) => restoreFn({ data: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings-history"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "connections"] });
    },
  });

  const rows = useMemo(() => history.data ?? [], [history.data]);

  return (
    <section className="rounded-3xl glass-panel p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <History className="size-4" />
        تاریخچهٔ تغییرات تنظیمات
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        هر تغییر چهره، صدا، مدل یا وضعیت سرویس یک نسخهٔ جدید ثبت می‌کند و قابل بازگردانی است.
      </p>

      {history.isLoading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          در حال دریافت تاریخچه…
        </p>
      )}
      {history.isError && (
        <p className="mt-4 text-sm text-destructive-foreground">
          {errorText(history.error, "دریافت تاریخچه ناموفق بود.")}
        </p>
      )}
      {!history.isLoading && rows.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">هنوز نسخه‌ای ثبت نشده است.</p>
      )}

      <div className="mt-4 flex max-h-80 flex-col gap-2 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-3"
          >
            <div>
              <p className="text-sm">
                نسخهٔ {row.version} — {row.label || "بدون توضیح"}
              </p>
              <p className="text-[11px] text-muted-foreground">{formatDate(row.created_at)}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={restore.isPending}
              onClick={() => restore.mutate(row.id)}
            >
              <RotateCcw className="size-4" />
              بازگردانی
            </Button>
          </div>
        ))}
      </div>
      {restore.isError && (
        <p className="mt-2 text-xs text-destructive-foreground">
          {errorText(restore.error, "بازگردانی نسخه ناموفق بود.")}
        </p>
      )}
      {restore.isSuccess && <p className="mt-2 text-xs text-primary">نسخه بازگردانی شد.</p>}
    </section>
  );
}
