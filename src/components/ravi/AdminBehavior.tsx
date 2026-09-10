import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSettings, updateSettings } from "@/lib/ravi/admin.functions";
import { ANSWER_LENGTHS, TONE_PRESETS } from "@/lib/ravi/types";
import type { SettingsInput } from "@/lib/ravi/validators";

const TTS_VOICES = [
  { value: "alloy", label: "الوی — خنثی و رسمی" },
  { value: "verse", label: "ورس — گرم و روایتگر" },
  { value: "shimmer", label: "شیمر — زنانه و شفاف" },
  { value: "sage", label: "سیج — آرام و متین" },
  { value: "coral", label: "کورال — صمیمی" },
  { value: "ballad", label: "بلد — مردانه و آرام" },
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI (کلید سازمانی)",
  none: "تنظیم نشده",
};

export function AdminBehavior() {
  const queryClient = useQueryClient();
  const getFn = useServerFn(getSettings);
  const saveFn = useServerFn(updateSettings);
  const [form, setForm] = useState<SettingsInput | null>(null);
  const [saved, setSaved] = useState(false);

  const query = useQuery({ queryKey: ["admin", "settings"], queryFn: () => getFn() });

  useEffect(() => {
    if (!query.data) return;
    const settings = query.data.settings;
    setForm({
      tone_preset: settings.tone_preset,
      custom_persona: settings.custom_persona,
      humor_level: settings.humor_level,
      formality_level: settings.formality_level,
      answer_length: settings.answer_length as SettingsInput["answer_length"],
      political_block: settings.political_block,
      religious_block: settings.religious_block,
      refusal_text: settings.refusal_text,
      transcript_retention_days: settings.transcript_retention_days,
      tts_voice: (settings.tts_voice ?? "alloy") as SettingsInput["tts_voice"],
      tts_speed: Number(settings.tts_speed ?? 1),
    });
  }, [query.data]);

  const save = useMutation({
    mutationFn: async (input: SettingsInput) => saveFn({ data: input }),
    onSuccess: () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });

  if (!form) {
    return <p className="text-xs text-muted-foreground">در حال دریافت تنظیمات…</p>;
  }

  const patch = (values: Partial<SettingsInput>) => setForm({ ...form, ...values });

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(form);
      }}
    >
      <section className="rounded-2xl glass-panel p-5">
        <h3 className="text-sm font-semibold">شخصیت و لحن پاسخ</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          لحن فقط سبک بیان را تغییر می‌دهد؛ صحت اطلاعات، منبع پاسخ و سیاست‌های محدودکننده
          هرگز تحت تأثیر آن قرار نمی‌گیرند.
        </p>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>پیش‌تنظیم لحن</Label>
            <Select
              value={form.tone_preset}
              onValueChange={(value) => patch({ tone_preset: value })}
            >
              <SelectTrigger className="bg-surface-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>طول پاسخ</Label>
            <Select
              value={form.answer_length}
              onValueChange={(value) =>
                patch({ answer_length: value as SettingsInput["answer_length"] })
              }
            >
              <SelectTrigger className="bg-surface-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANSWER_LENGTHS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3">
            <Label>میزان شوخ‌طبعی: {form.humor_level}</Label>
            <Slider
              dir="rtl"
              value={[form.humor_level]}
              min={0}
              max={4}
              step={1}
              onValueChange={([value]) => patch({ humor_level: value ?? 0 })}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Label>میزان رسمیت: {form.formality_level}</Label>
            <Slider
              dir="rtl"
              value={[form.formality_level]}
              min={1}
              max={5}
              step={1}
              onValueChange={([value]) => patch({ formality_level: value ?? 3 })}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Label htmlFor="persona">دستور شخصیت سفارشی</Label>
          <Textarea
            id="persona"
            rows={4}
            value={form.custom_persona}
            onChange={(event) => patch({ custom_persona: event.target.value })}
            placeholder="مثلاً: خود را کارشناس ارشد امور استان‌ها معرفی کن و پاسخ‌ها را با ذکر مرجع بیان کن."
            className="bg-surface-2"
          />
        </div>
      </section>

      <section className="rounded-2xl glass-panel p-5">
        <h3 className="text-sm font-semibold">صدای فارسی پاسخ‌ها</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          وقتی آواتار زنده در دسترس نباشد، پاسخ‌ها با این صدا و سرعت خوانده می‌شود.
        </p>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>صدای گوینده</Label>
            <Select
              dir="rtl"
              value={form.tts_voice}
              onValueChange={(value) => patch({ tts_voice: value as SettingsInput["tts_voice"] })}
            >
              <SelectTrigger className="bg-surface-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TTS_VOICES.map((voice) => (
                  <SelectItem key={voice.value} value={voice.value}>
                    {voice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-3">
            <Label>سرعت گفتار: {form.tts_speed.toFixed(2)}</Label>
            <Slider
              dir="rtl"
              value={[form.tts_speed]}
              min={0.7}
              max={1.3}
              step={0.05}
              onValueChange={([value]) => patch({ tts_speed: value ?? 1 })}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl glass-panel p-5">
        <h3 className="text-sm font-semibold">سیاست‌های پاسخ‌گویی</h3>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">عدم ورود به موضوعات سیاسی</span>
            <Switch
              checked={form.political_block}
              onCheckedChange={(checked) => patch({ political_block: checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">عدم ورود به موضوعات مذهبی</span>
            <Switch
              checked={form.religious_block}
              onCheckedChange={(checked) => patch({ religious_block: checked })}
            />
          </label>
          <div className="flex flex-col gap-2">
            <Label htmlFor="refusal">متن پاسخ در موارد محدودشده</Label>
            <Textarea
              id="refusal"
              rows={2}
              value={form.refusal_text}
              onChange={(event) => patch({ refusal_text: event.target.value })}
              className="bg-surface-2"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl glass-panel p-5">
        <h3 className="text-sm font-semibold">سرویس‌دهنده‌های فعال</h3>
        <ul className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
          <li>مدل پاسخ‌گویی: {PROVIDER_LABELS[query.data?.providers.chat ?? "none"]}</li>
          <li>تبدیل گفتار به متن: {PROVIDER_LABELS[query.data?.providers.stt ?? "none"]}</li>
          <li>
            آواتار زنده:{" "}
            {query.data?.providers.avatarConfigured
              ? "پیکربندی‌شده"
              : "پیکربندی نشده — نمایش حالت گرافیکی و صدای مرورگر"}
          </li>
        </ul>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          ذخیرهٔ تنظیمات
        </Button>
        {saved && <span className="text-xs text-muted-foreground">تنظیمات ذخیره شد.</span>}
      </div>
    </form>
  );
}