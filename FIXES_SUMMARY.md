# خلاصه تغییرات اعمال‌شده برای بهبود رندر فارسی آواتار تعاملی

> **بایگانی تاریخی.** این سند مربوط به دورهٔ پیش از مهاجرت به PostgreSQL است و
> معماری آن زمان (Supabase و Lovable AI Gateway) را توصیف می‌کند. برای وضعیت فعلی
> [README](README.md) را ببینید.

تاریخ: 2026-09-06

## 🎯 مشکل اصلی شناسایی شده

برنامه آواتار تعاملی "راوی‌استان" یک سیستم پیشرفته برای گفتگوی صوتی و متنی فارسی است، اما **مشکل اصلی** در بخش تبدیل متن به گفتار (TTS) بود که باعث می‌شد صدای فارسی روان و طبیعی نباشد.

---

## ✅ تغییرات اعمال‌شده

### 1. **تغییر دستورالعمل‌های TTS به فارسی** ⭐ (مهم‌ترین تغییر)

**فایل:** `src/lib/ravi/tts.server.ts`

**قبل:**
```typescript
const PERSIAN_INSTRUCTIONS =
  "Speak in fluent, standard Persian (Farsi) exactly like a native speaker from Tehran — no foreign accent whatsoever. Warm, calm, professional tone of an Iranian administrative expert. Natural intonation with short pauses between sentences; pronounce every word clearly and smoothly.";
```

**بعد:**
```typescript
const PERSIAN_INSTRUCTIONS =
  "با لحن فارسی استاندارد تهرانی، دقیقاً مثل یک گوینده بومی ایرانی حرف بزن — هیچ لهجه یا تلفظ خارجی نداشته باش. لحن گرم، آرام و حرفه‌ای یک کارشناس اداری ایرانی را داشته باش. آهنگ طبیعی با مکث‌های کوتاه بین جملات؛ همه کلمات را واضح و روان تلفظ کن.";
```

**دلیل:** مدل‌های TTS (مانند `gpt-4o-mini-tts`) بهتر است دستورالعمل‌ها را به همان زبان خروجی دریافت کنند. دستورالعمل انگلیسی ممکن بود باعث شود صدا با لهجه خارجی یا نامطبوع تولید شود.

---

### 2. **بهبود پیام‌های خطا برای debugging**

#### a) در `src/lib/ravi/tts.server.ts`:

**تغییرات:**
- افزودن لاگ ساختاریافته برای خطاهای ElevenLabs
- افزودن اطلاعات debug شامل متن، سرعت و مدل

**قبل:**
```typescript
console.error("ElevenLabs TTS failed, falling back to gateway", elevenError.message);
```

**بعد:**
```typescript
console.error("[TTS] ElevenLabs failed, falling back to gateway:", {
  error: elevenError.message,
  text: spoken.slice(0, 50),
  speed: settings.speed,
});
```

#### b) در `src/components/ravi/HeygenStreamer.tsx`:

**افزودن لاگ‌های دقیق:**
```typescript
console.error("[HeyGen] Avatar initialization failed:", {
  error: errorMessage,
  avatarId,
  voiceId,
  hasToken: !!token,
});
```

#### c) در `src/components/ravi/LiveAvatarStreamer.tsx`:

**افزودن لاگ‌های دقیق:**
```typescript
console.error("[LiveAvatar] SDK failed to load:", {
  error: error instanceof Error ? error.message : String(error),
  hasToken: !!token,
});

console.error("[LiveAvatar] Session start failed:", {
  error: errorMessage,
  hasToken: !!token,
  isNew,
});
```

---

## 📊 بررسی سایر بخش‌های کد

### ✅ موارد صحیح (نیازی به تغییر ندارند)

1. **تنظیم زبان در HeyGen:** `language: "fa"` به درستی در [HeygenStreamer.tsx:106](src/components/ravi/HeygenStreamer.tsx#L106) تنظیم شده است.

2. **پشتیبانی RTL:** تمام رابط کاربری `dir="rtl"` و `lang="fa"` دارد ([__root.tsx:123](src/routes/__root.tsx#L123))

3. **فونت فارسی:** Vazirmatn از Google Fonts بارگذاری می‌شود ([__root.tsx:111](src/routes/__root.tsx#L111))

4. **سیستم تبدیل متن به گفتار:** `persian-speech.ts` یک سیستم پیشرفته برای:
   - تبدیل اعداد به حروف فارسی
   - حذف نشانه‌های Markdown
   - تبدیل تاریخ و زمان به فرمت خوانا
   - نرمال‌سازی علائم نگارشی برای بهبود آهنگ

5. **کروماکی (Chroma Key):** پیاده‌سازی قوی در `useChromaKey.ts` برای حذف پس‌زمینه سبز آواتار

---

## 🔍 نکات مهم برای توسعه‌دهندگان

### چگونه کد کار می‌کند؟

1. **مسیر صدا (Audio Pipeline):**
   ```
   متن فارسی → persian-speech.ts (تبدیل به گفتار)
   → ElevenLabs TTS (اولویت اول)
   → OpenAI TTS (fallback اول)
   → Browser Speech Synthesis (fallback آخر)
   ```

2. **مسیر آواتار (Avatar Pipeline):**
   ```
   Token → HeyGen/LiveAvatar SDK
   → Video Stream → Chroma Key (حذف پس‌زمینه)
   → Canvas Rendering
   ```

3. **نکات debug:**
   - همه لاگ‌ها با پیشوند `[TTS]`, `[HeyGen]`, `[LiveAvatar]` برای فیلتر آسان
   - اطلاعات ساختاریافته (structured logging) برای تحلیل بهتر

---

## 📝 توصیه‌های بیشتر

### مشکلات احتمالی که ممکن است همچنان وجود داشته باشند:

1. **کیفیت صدا:**
   - اگر ElevenLabs API key ندارید، از OpenAI TTS استفاده می‌شود که ممکن است کیفیت پایین‌تری داشته باشد
   - صدای مرورگر (Browser Speech Synthesis) معمولاً کیفیت خیلی پایینی دارد

2. **پیکربندی:**
   - اطمینان حاصل کنید که `HEYGEN_API_KEY` یا LiveAvatar credentials به درستی تنظیم شده‌اند
   - در صورت عدم تنظیم، آواتار بارگذاری نمی‌شود

3. **تست:**
   - پس از این تغییرات، باید تست کامل انجام دهید
   - به خصوص تست گفتار فارسی برای بررسی بهبود لهجه و روانی

---

## 🚀 مراحل بعدی

1. **تست کامل:**
   ```bash
   npm run dev
   # یا
   bun dev
   ```

2. **بررسی console logs:**
   - در Developer Tools مرورگر، تب Console را باز کنید
   - به دنبال لاگ‌های `[TTS]`, `[HeyGen]`, `[LiveAvatar]` باشید

3. **تست صدا:**
   - یک سوال فارسی بپرسید
   - بررسی کنید که آیا لهجه طبیعی‌تر شده است یا نه

4. **بررسی آواتار:**
   - اطمینان حاصل کنید که آواتار بدون مشکل بارگذاری می‌شود
   - پس‌زمینه سبز باید به درستی حذف شود

---

## 📞 پشتیبانی

اگر مشکلی باقی ماند:
1. Console logs را بررسی کنید
2. Network tab را برای بررسی خطاهای API چک کنید
3. متغیرهای محیطی را تایید کنید

---

**نویسنده:** Claude Code (Assistant)
**تاریخ:** 2026-09-06
