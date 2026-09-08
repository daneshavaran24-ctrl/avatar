# راهنمای استقرار (Deployment) راوی‌استان

این راهنما مراحل استقرار برنامه راوی‌استان را در محیط‌های مختلف توضیح می‌دهد.

## 🔧 رفع خطای 502 Bad Gateway

اگر با خطای 502 مواجه شدید، این تنظیمات را بررسی کنید:

### ⭐ راه‌حل اصلی: Override کردن Nitro Preset

**مشکل**: `@lovable.dev/vite-tanstack-config` به صورت پیش‌فرض از `preset: "cloudflare"` استفاده می‌کند که با Node.js server سازگار نیست.

**راه‌حل**: در `vite.config.ts` باید تنظیمات Nitro را override کنید:

```typescript
// vite.config.ts
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // ⭐ کلیدی: Override کردن Nitro preset
  nitro: {
    preset: "node-server", // تغییر از cloudflare به node-server
    devServer: {
      host: "0.0.0.0",
      port: 5173,
    },
    runtimeConfig: {
      nitro: {
        port: process.env.PORT || 3000,
        host: "0.0.0.0", // ⚠️ بسیار مهم!
      },
    },
  },

  tanstackStart: {
    server: { entry: "server" },
  },

  vite: {
    // ... باقی تنظیمات
  },
});
```

### چرا 0.0.0.0 مهم است؟

```typescript
host: "0.0.0.0"      // ✅ صحیح - قابل دسترسی از همه شبکه‌ها
// host: "localhost"  // ❌ اشتباه - فقط داخل container
// host: "127.0.0.1"  // ❌ اشتباه - فقط loopback
```

### 3. متغیرهای محیطی

اطمینان حاصل کنید که تمام متغیرهای محیطی لازم تنظیم شده‌اند:

**الزامی**:
```env
PORT=3000                              # پورت (معمولاً توسط platform تنظیم می‌شود)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
LOVABLE_API_KEY=your-lovable-api-key
RAVI_KEY_SECRET=your-encryption-secret-32chars
```

**اختیاری (برای قابلیت‌های پیشرفته)**:
```env
HEYGEN_API_KEY=your-heygen-key
ELEVENLABS_API_KEY=your-elevenlabs-key
OPENROUTER_API_KEY=your-openrouter-key
GROQ_API_KEY=your-groq-key
DEEPGRAM_API_KEY=your-deepgram-key
OPENAI_API_KEY=your-openai-key
```

---

## 📦 استقرار در Lovable Cloud

### مرحله 1: Build

```bash
npm run build
```

یا

```bash
bun run build
```

### مرحله 2: بررسی خروجی Build

پوشه `.output/` باید ایجاد شده باشد:

```
.output/
├── public/        # فایل‌های استاتیک
└── server/
    └── index.mjs  # سرور Node.js
```

### مرحله 3: تنظیم متغیرهای محیطی

در پنل Lovable Cloud:

1. به **Settings** > **Environment Variables** بروید
2. تمام متغیرهای بالا را اضافه کنید
3. **مهم**: `PORT` را تنظیم نکنید (platform خودکار تنظیم می‌کند)

### مرحله 4: Deploy

Lovable Cloud به صورت خودکار:
- Repository را clone می‌کند
- `npm run build` یا `bun run build` را اجرا می‌کند
- `npm start` یا `bun start` را اجرا می‌کند
- پورت را به صورت خودکار تنظیم می‌کند

### عیب‌یابی در Lovable

اگر 502 دریافت کردید:

1. **لاگ‌ها را بررسی کنید**:
   - به صفحه **Events** یا **Logs** بروید
   - دنبال پیام‌های خطا بگردید

2. **Health Check**:
   ```
   GET https://your-app.lovable.app/
   ```
   باید status 200 برگرداند

3. **متغیرهای محیطی**:
   - `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` را بررسی کنید
   - `LOVABLE_API_KEY` را بررسی کنید

4. **زمان راه‌اندازی**:
   - اولین deploy ممکن است 1-2 دقیقه طول بکشد
   - صبر کنید تا status به `Running` تغییر کند

---

## 🐳 استقرار با Docker

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lockb* ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start server
CMD ["node", ".output/server/index.mjs"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  ravi-stan:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - LOVABLE_API_KEY=${LOVABLE_API_KEY}
      - RAVI_KEY_SECRET=${RAVI_KEY_SECRET}
    restart: unless-stopped
```

### اجرا

```bash
# Build image
docker build -t ravi-stan .

# Run container
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e SUPABASE_URL=your-url \
  -e SUPABASE_SERVICE_ROLE_KEY=your-key \
  -e LOVABLE_API_KEY=your-key \
  -e RAVI_KEY_SECRET=your-secret \
  ravi-stan

# یا با docker-compose
docker-compose up -d
```

---

## ☁️ استقرار در Vercel

### vercel.json

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": ".output/server/index.mjs"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### دستورات

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### تنظیم Environment Variables در Vercel

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add LOVABLE_API_KEY
vercel env add RAVI_KEY_SECRET
```

---

## 🚀 استقرار در Railway

### railway.json

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### دستورات

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize
railway init

# Add environment variables
railway variables set SUPABASE_URL=your-url
railway variables set SUPABASE_SERVICE_ROLE_KEY=your-key
railway variables set LOVABLE_API_KEY=your-key
railway variables set RAVI_KEY_SECRET=your-secret

# Deploy
railway up
```

---

## 🔍 عیب‌یابی عمومی

### خطای "Cannot find module"

```bash
# پاک کردن و نصب مجدد dependencies
rm -rf node_modules
npm install
npm run build
```

### خطای "Port already in use"

```bash
# پیدا کردن process روی پورت 3000
lsof -i :3000

# کشتن process
kill -9 <PID>

# یا استفاده از پورت دیگر
PORT=3001 npm start
```

### خطای "ECONNREFUSED Supabase"

- URL و API Key را بررسی کنید
- اینترنت را چک کنید
- Supabase project را در داشبورد بررسی کنید

### خطای "RAVI_KEY_SECRET not set"

```bash
# ایجاد secret تصادفی 32 کاراکتری
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# اضافه کردن به .env
echo "RAVI_KEY_SECRET=<generated-secret>" >> .env
```

### لاگ‌های سرور

```bash
# Development
npm run dev

# Production logs
NODE_ENV=production npm start 2>&1 | tee server.log
```

---

## 📊 Health Check Endpoint

برنامه باید یک endpoint برای health check داشته باشد:

```typescript
// src/routes/__root.tsx یا مسیر مشابه
export async function loader() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
  };
}
```

تست:

```bash
curl http://localhost:3000/
# باید JSON با status: "ok" برگرداند
```

---

## 🔐 امنیت

### متغیرهای محیطی

- ✅ **هرگز** `.env` را commit نکنید
- ✅ از `.env.example` برای template استفاده کنید
- ✅ `SUPABASE_SERVICE_ROLE_KEY` را فقط سمت سرور استفاده کنید
- ✅ `RAVI_KEY_SECRET` را secret نگه دارید

### CORS

اگر به CORS نیاز دارید:

```typescript
// app.config.ts
export default defineConfig({
  server: {
    cors: {
      origin: ["https://yourdomain.com"],
      credentials: true,
    },
  },
});
```

---

## 📝 Checklist قبل از Deploy

- [ ] `npm run build` موفق است
- [ ] تمام متغیرهای محیطی تنظیم شده‌اند
- [ ] `app.config.ts` با `hostname: "0.0.0.0"` موجود است
- [ ] `package.json` دارای script `"start"` است
- [ ] Supabase connection تست شده است
- [ ] `.env` در `.gitignore` است
- [ ] Health check endpoint کار می‌کند

---

## 🆘 پشتیبانی

اگر همچنان مشکل دارید:

1. لاگ‌های کامل را بررسی کنید
2. به [CODE_QUALITY_IMPROVEMENTS.md](CODE_QUALITY_IMPROVEMENTS.md) مراجعه کنید
3. به [TEST_CHECKLIST.md](TEST_CHECKLIST.md) مراجعه کنید
4. Issue در GitHub ایجاد کنید با:
   - پیام خطای کامل
   - محیط deployment (Lovable/Vercel/Railway/etc.)
   - لاگ‌های build و runtime

---

**تاریخ ایجاد**: 2026-09-06
**نسخه**: 1.0.0
**وضعیت**: ✅ آماده برای Production
