import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  Loader2,
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
  listSettingsHistory,
  removeProviderKey,
  restoreSettingsHistory,
  saveProviderKey,
  setServiceEnabled,
} from "@/lib/ravi/admin.functions";

type ManagedKeyName = "OPENAI_API_KEY" | "HEYGEN_API_KEY";

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

interface ServiceField {
  name: ManagedKeyName;
  label: string;
  /** Only a real credential is masked; identifiers are plain text. */
  secret: boolean;
  hint: string;
}

const SERVICES: {
  key: ConnectionKey;
  title: string;
  description: string;
  fields: ServiceField[];
  docs: string | null;
}[] = [
  {
    key: "openai",
    title: "OpenAI (کلید اصلی و الزامی)",
    description:
      "موتور تولید پاسخ، بردارسازی اسناد، تبدیل گفتار به متن و تولید صدای فارسی. بدون این کلید سامانه پاسخ نمی‌دهد.",
    fields: [
      {
        name: "OPENAI_API_KEY",
        label: "کلید API",
        secret: true,
        hint: "الزامی",
      },
    ],
    docs: "https://platform.openai.com/api-keys",
  },
  {
    key: "heygen",
    title: "LiveAvatar (آواتار زنده)",
    description:
      "آواتار زندهٔ صفحهٔ اصلی. فقط همین یک کلید لازم است؛ چهرهٔ آواتار از قبل تنظیم شده است.",
    fields: [
      {
        name: "HEYGEN_API_KEY",
        label: "کلید API لایواواتار",
        secret: true,
        hint: "الزامی — از app.liveavatar.com/developers",
      },
    ],
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
  // Keys live in Postgres, so with it unreachable the save button cannot ever
  // succeed. Disabling it up front beats letting the operator discover that
  // one failed attempt at a time.
  const keyStorageDown = Boolean(db && !db.dbConnected);

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
                <li className="font-mono text-yellow-200">LIVEAVATAR_CONTEXT_ID <span className="text-yellow-100/50">(الزامی — شناسه است نه کلید؛ صدا و شخصیت آواتار)</span></li>
                <li className="font-mono text-yellow-200">LIVEAVATAR_SANDBOX <span className="text-yellow-100/50">(اختیاری — مقدار true: تست بدون مصرف اعتبار، با چهرهٔ دمو)</span></li>
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
            const primaryKey = data?.keys?.find((k) => k.name === service.fields[0]?.name);
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

                {service.fields.map((field) => (
                  <KeyField
                    key={field.name}
                    field={field}
                    status={data?.keys?.find((item) => item.name === field.name)}
                    storageDown={keyStorageDown}
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

      <SettingsHistory />
    </div>
  );
}

function KeyField({
  field,
  status,
  storageDown,
}: {
  field: ServiceField;
  status: KeyStatus | undefined;
  storageDown: boolean;
}) {
  const { name, label, secret, hint } = field;
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
      <Label htmlFor={`key-${name}`} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
        <span className="font-medium text-foreground">{label}</span>
        <span dir="ltr" className="font-mono text-muted-foreground/70">{name}</span>
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`key-${name}`}
          dir="ltr"
          type={secret && !visible ? "password" : "text"}
          autoComplete="off"
          value={value}
          disabled={storageDown}
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            storageDown
              ? "ذخیره در پنل ممکن نیست"
              : (status?.masked ?? (secret ? "کلید را وارد کنید…" : "شناسه را وارد کنید…"))
          }
          className="h-9 bg-surface-2 text-left"
        />
        {secret && (
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
        )}
        <Button
          type="button"
          size="icon"
          className="size-9 shrink-0"
          aria-label="ذخیرهٔ کلید"
          disabled={storageDown || save.isPending || value.trim().length < 3}
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
            disabled={storageDown || remove.isPending}
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
        <p className={`text-[11px] ${storageDown ? "text-yellow-100/70" : "text-muted-foreground"}`}>
          {storageDown ? (
            <>
              تا وصل‌شدن دیتابیس، ذخیره در پنل ممکن نیست. این مقدار را به‌عنوان
              متغیر محیطی <code dir="ltr" className="font-mono">{name}</code> در پنل لیارا
              تنظیم و اپ را ری‌استارت کنید.
            </>
          ) : save.isSuccess ? (
            "ذخیره شد."
          ) : status?.stored ? (
            `ذخیره‌شده: ${status.masked}`
          ) : status?.fromEnv ? (
            "از متغیر محیطی سرور خوانده می‌شود."
          ) : (
            hint
          )}
        </p>
      )}
    </div>
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
