#!/bin/bash
# اسکریپت دیپلوی خودکار راوی‌استان روی لیارا
# فقط اجرا کن: bash deploy-liara.sh

set -e

APP_NAME="aiavatar"
DB_URL="postgresql://root:16gtx3tTGcMTftu6oSoYdkJH@wonderful-booth-b1-utnz3-db:5432/postgres"

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

# ۳. ساختن secret ها
SESSION_SECRET=$(openssl rand -hex 32)
RAVI_KEY_SECRET=$(openssl rand -hex 32)

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
echo "حالا migration رو اجرا کن:"
echo "  liara shell --app $APP_NAME"
echo "  node scripts/migrate.mjs"
echo ""
echo "SESSION_SECRET=$SESSION_SECRET"
echo "RAVI_KEY_SECRET=$RAVI_KEY_SECRET"
echo "⚠️  این مقادیر رو جایی امن ذخیره کن!"
