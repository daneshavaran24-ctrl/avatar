#!/bin/bash
# اسکریپت دیپلوی خودکار راوی‌استان روی لیارا
# فقط اجرا کن: bash deploy-liara.sh

set -e

APP_NAME="aiavatar"
# اعتبارنامه هرگز داخل این فایل نوشته نمی‌شود — این فایل در گیت است.
# قبل از اجرا: export DB_URL='postgresql://user:pass@host:5432/dbname'
if [ -z "$DB_URL" ]; then
    echo "❌ متغیر DB_URL تنظیم نشده است."
    echo "   نشانی اتصال دیتابیس را از پنل لیارا بردارید و اجرا کنید:"
    echo "   export DB_URL='postgresql://user:pass@host:5432/dbname'"
    exit 1
fi

echo "=========================================="
echo "  دیپلوی راوی‌استان روی لیارا"
echo "=========================================="
echo ""

# ۱. چک کردن Liara CLI
if ! command -v liara &> /dev/null; then
    echo "⏳ نصب Liara CLI..."
    npm install -g @liara/cli
fi
echo "✅ Liara CLI: $(liara --version 2>/dev/null | head -1)"

# ۲. لاگین چک
echo ""
echo "📋 اگه لاگین نیستی، الان لاگین کن:"
echo "   liara login"
echo ""
read -p "آیا لاگین هستی؟ (y/n): " LOGGED_IN
if [ "$LOGGED_IN" != "y" ]; then
    liara login
fi

# ۳. ساختن secret ها — فقط اگر از قبل نداشته باشیم.
#
# RAVI_KEY_SECRET کلیدهای ذخیره‌شده را رمزنگاری می‌کند. ساختن مقدار تازه روی
# استقرار موجود، همهٔ آن کلیدها را برای همیشه غیرقابل‌رمزگشایی می‌کند. پس اگر
# قبلاً ست شده، همان حفظ می‌شود و این اسکریپت بی‌خطر قابل اجرای دوباره است.
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
RAVI_KEY_SECRET="${RAVI_KEY_SECRET:-$(openssl rand -hex 32)}"

echo ""
echo "⚠️  اگر این اپ قبلاً مستقر شده و کلیدی در پنل ذخیره کرده‌اید،"
echo "   مقدار فعلی RAVI_KEY_SECRET را از پنل لیارا بردارید و پیش از اجرا"
echo "   با export تنظیمش کنید، وگرنه کلیدهای ذخیره‌شده از دست می‌روند."
read -p "ادامه می‌دهید؟ (y/n): " CONFIRM_SECRETS
if [ "$CONFIRM_SECRETS" != "y" ]; then
    echo "لغو شد."
    exit 1
fi

# ۴. گرفتن OpenAI API Key
echo ""
read -p "🔑 OpenAI API Key رو وارد کن: " OPENAI_KEY
if [ -z "$OPENAI_KEY" ]; then
    echo "❌ OpenAI API Key لازمه!"
    exit 1
fi

# ۵. ست کردن env vars
echo ""
echo "⏳ تنظیم متغیرهای محیطی..."
liara env:set --app "$APP_NAME" \
    "DATABASE_URL=$DB_URL" \
    "SESSION_SECRET=$SESSION_SECRET" \
    "RAVI_KEY_SECRET=$RAVI_KEY_SECRET" \
    "OPENAI_API_KEY=$OPENAI_KEY" \
    "NODE_ENV=production"

echo "✅ متغیرهای محیطی ست شدند"

# ۶. دیپلوی
echo ""
echo "⏳ دیپلوی روی لیارا..."
liara deploy --app "$APP_NAME"

echo ""
echo "=========================================="
echo "  ✅ دیپلوی تمام شد!"
echo "=========================================="
echo ""
echo "مایگریشن‌ها خودکار هنگام بالا آمدن کانتینر اجرا می‌شوند (entrypoint.sh)."
echo "اگر شکست بخورند سرور بالا می‌آید، ولی بنر زرد تب «کلیدها و آواتار»"
echo "در پنل مدیریت علتش را نشان می‌دهد."
echo ""
echo "SESSION_SECRET=$SESSION_SECRET"
echo "RAVI_KEY_SECRET=$RAVI_KEY_SECRET"
echo "⚠️  این مقادیر رو جایی امن ذخیره کن — و RAVI_KEY_SECRET را"
echo "   هرگز بعد از ذخیرهٔ کلیدها عوض نکن."
