import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Play, RefreshCw, Save, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  activatePersianVoiceFn,
  diagnoseElevenLabsFn,
  listElevenVoicesFn,
  selectElevenVoiceFn,
} from "@/lib/ravi/admin.functions";

interface ElevenSettings {
  enabled: boolean;
  voiceId: string;
  voiceName: string;
  model: string;
  stability: number;
  similarity: number;
  style: number;
}

const PERSIAN_MODEL = "eleven_multilingual_v2";

/** Voice gallery for ElevenLabs: preview, pick, and tune the Persian narrator. */
export function AdminElevenLabs({
  configured,
  current,
}: {
  configured: boolean;
  current: ElevenSettings | undefined;
}) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listElevenVoicesFn);
  const saveFn = useServerFn(selectElevenVoiceFn);
  const diagnoseFn = useServerFn(diagnoseElevenLabsFn);

  const persianVoiceFn = useServerFn(activatePersianVoiceFn);
  const persianVoice = useMutation({
    mutationFn: (prefer: "male" | "female") => persianVoiceFn({ data: { prefer } }),
    onSuccess: (result) => {
      if (result.ok) {
        void voices.refetch();
        void queryClient.invalidateQueries({ queryKey: ["admin"] });
      }
    },
  });

  const diagnose = useMutation({
    mutationFn: () => diagnoseFn(),
    onSuccess: (result) => {
      if (result.ok) void voices.refetch();
    },
  });

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ voiceId: string; voiceName: string } | null>(null);
  const model = PERSIAN_MODEL;
  const [stability, setStability] = useState(current?.stability ?? 0.38);
  const [similarity, setSimilarity] = useState(current?.similarity ?? 0.78);
  const [style, setStyle] = useState(current?.style ?? 0.18);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voices = useQuery({
    queryKey: ["admin", "eleven-voices"],
    queryFn: () => listFn(),
    enabled: configured,
  });

  const filtered = useMemo(() => {
    const list = voices.data?.voices ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (voice) =>
        voice.name.toLowerCase().includes(term) ||
        Object.values(voice.labels ?? {}).join(" ").toLowerCase().includes(term),
    );
  }, [voices.data, search]);


  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          voiceId: selected?.voiceId ?? current?.voiceId ?? "",
          voiceName: selected?.voiceName ?? current?.voiceName ?? "",
          model,
          stability,
          similarity,
          style,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "connections"] }),
  });

  const activeId = selected?.voiceId ?? current?.voiceId ?? "";

  return (
    <section className="rounded-3xl glass-panel p-5">
      <audio ref={audioRef} className="hidden" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">گالری صدای ElevenLabs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            صدایی را پیش‌نمایش و انتخاب کنید تا پاسخ‌های دستیار با همان صدا و با فارسی روان خوانده
            شود.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!configured || voices.isFetching}
          onClick={() => void voices.refetch()}
        >
          {voices.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          به‌روزرسانی فهرست
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => diagnose.mutate()}
          disabled={diagnose.isPending}
        >
          {diagnose.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          تست کلید ElevenLabs
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => persianVoice.mutate("male")}
          disabled={persianVoice.isPending}
        >
          {persianVoice.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          فعال‌سازی صدای بومی فارسی (مرد جوان تهرانی)
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => persianVoice.mutate("female")}
          disabled={persianVoice.isPending}
        >
          صدای بومی زن (نوشین)
        </Button>
      </div>

      {(persianVoice.data || persianVoice.isError) && (
        <p
          className={`mt-3 text-sm ${persianVoice.data?.ok ? "text-primary" : "text-destructive"}`}
        >
          {persianVoice.isError
            ? "فعال‌سازی صدای بومی فارسی انجام نشد؛ دوباره تلاش کنید."
            : persianVoice.data?.ok
              ? `صدای بومی «${persianVoice.data.voiceName}» فعال و ذخیره شد.`
              : persianVoice.data?.error}
        </p>
      )}



      {(diagnose.data || diagnose.isError) && (
        <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm">
          {diagnose.isError ? (
            <p className="text-destructive">اجرای تست ناموفق بود؛ دوباره تلاش کنید.</p>
          ) : (
            <>
              <p className={diagnose.data?.ok ? "text-primary" : "text-destructive"}>
                {diagnose.data?.ok
                  ? "کلید ElevenLabs سالم است و همهٔ دسترسی‌های لازم را دارد."
                  : "کلید ElevenLabs کامل کار نمی‌کند؛ جزئیات زیر را ببینید."}
              </p>
              {diagnose.data?.keyPreview && (
                <p className="mt-1 text-xs text-muted-foreground">
                  کلید بررسی‌شده: {diagnose.data.keyPreview}
                </p>
              )}
              <ul className="mt-3 space-y-2">
                {diagnose.data?.steps.map((step) => (
                  <li key={step.label} className="text-xs">
                    <span className={step.ok ? "text-primary" : "text-destructive"}>
                      {step.ok ? "✓" : "✕"} {step.label}
                    </span>
                    <span className="block text-muted-foreground">{step.detail}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}


      {!configured && (
        <p className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm text-muted-foreground">
          ابتدا کلید ElevenLabs را در بخش «کلیدهای سرویس‌ها» ذخیره کنید تا صداهای حساب شما این‌جا
          نمایش داده شود.
        </p>
      )}

      {configured && (
        <>
          <p className="mt-4 rounded-2xl bg-primary/10 p-3 text-xs text-primary">
            صدای فعال: {current?.voiceName || current?.voiceId || "Sarah"} · مدل فعال: چندزبانه نسخهٔ ۲
          </p>

          <div className="mt-4">
            <Label htmlFor="eleven-search">جستجوی صدا</Label>
            <Input
              id="eleven-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="نام صدا یا برچسب (مثلاً calm، female)…"
              className="mt-1"
            />
          </div>

          {(voices.isError || voices.data?.error) && (
            <p className="mt-3 text-xs text-destructive">
              {voices.data?.error ??
                "دریافت فهرست صداها ناموفق بود؛ اعتبار کلید ElevenLabs را بررسی کنید."}
            </p>
          )}


          <div className="mt-4 grid max-h-96 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            {filtered.map((voice) => {
              const isActive = voice.voiceId === activeId;
              return (
                <div
                  key={voice.voiceId}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${
                    isActive ? "border-primary bg-primary/10" : "border-border bg-surface-2"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{voice.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[voice.category, ...Object.values(voice.labels ?? {})]
                        .filter(Boolean)
                        .join(" · ") || "بدون برچسب"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {voice.previewUrl && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`پیش‌نمایش صدای ${voice.name}`}
                        onClick={() => {
                          if (!audioRef.current || !voice.previewUrl) return;
                          audioRef.current.src = voice.previewUrl;
                          void audioRef.current.play().catch(() => undefined);
                        }}
                      >
                        <Play className="size-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={isActive ? "default" : "secondary"}
                      onClick={() =>
                        setSelected({ voiceId: voice.voiceId, voiceName: voice.name })
                      }
                    >
                      {isActive ? <CheckCircle2 className="size-4" /> : "انتخاب"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {!voices.isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">صدایی با این جستجو یافت نشد.</p>
            )}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="eleven-model">مدل گویندگی</Label>
              <select
                id="eleven-model"
                value={model}
                disabled
                className="mt-1 h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm"
              >
                <option value={PERSIAN_MODEL}>چندزبانه نسخهٔ ۲ (بهترین کیفیت فارسی)</option>
              </select>
            </div>
            <Slider label="ثبات لحن" value={stability} onChange={setStability} />
            <Slider label="شباهت به صدای اصلی" value={similarity} onChange={setSimilarity} />
            <Slider label="شدت احساس" value={style} onChange={setStyle} />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={!activeId || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              ذخیرهٔ صدا
            </Button>
            {save.isSuccess && <span className="text-xs text-primary">صدا ذخیره شد.</span>}
            {save.isError && (
              <span className="text-xs text-destructive-foreground">ذخیرهٔ صدا ناموفق بود.</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label>
        {label}: {value.toFixed(2)}
      </Label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-primary"
      />
    </div>
  );
}
