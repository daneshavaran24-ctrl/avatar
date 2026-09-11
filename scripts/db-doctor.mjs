/**
 * تشخیص لایه‌به‌لایهٔ اتصال دیتابیس، برای اجرا از داخل کانتینر:
 *
 *   liara shell -a aiavatar -c "node scripts/db-doctor.mjs"
 *
 * بنر پنل مدیریت فقط می‌گوید «وصل نشد». این اسکریپت می‌گوید کدام لایه شکسته:
 * نبودِ متغیر، DNS، پورت، احراز هویت، یا اسکیما — و در اولین شکست می‌ایستد،
 * چون لایه‌های بعدی بدون لایهٔ قبلی معنایی ندارند.
 *
 * دو قاعده که نباید شکسته شوند:
 *   ۱. رمز هرگز چاپ نمی‌شود — نه کامل، نه بخشی، نه طولش. متن خطاهای درایور هم
 *      پیش از چاپ پاک‌سازی می‌شوند، چون بعضی خطاها نشانی کامل اتصال را در خود دارند.
 *   ۲. همیشه exit 0 — یک ابزار تشخیص نباید باعث ری‌استارت کانتینر شود.
 */
import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";
import postgres from "postgres";

const TCP_TIMEOUT_MS = 10_000;

/** رمز را از هر متنی که ممکن است شامل نشانی اتصال باشد حذف می‌کند. */
function scrub(text, secret) {
  const message = String(text ?? "");
  return secret ? message.split(secret).join("***") : message;
}

function ok(label, detail) {
  console.log(`✅ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail, remedy) {
  console.log(`❌ ${label}${detail ? ` — ${detail}` : ""}`);
  if (remedy) console.log(`   ↳ ${remedy}`);
}

/** لایهٔ ۳: خودِ postgres در دسترس بودنِ پورت را گزارش نمی‌کند، پس جدا می‌سنجیم. */
function probeTcp(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once("connect", () => done({ ok: true }));
    socket.once("timeout", () =>
      done({ ok: false, error: `مهلت ${TCP_TIMEOUT_MS / 1000} ثانیه تمام شد` }),
    );
    socket.once("error", (error) => done({ ok: false, error: error.message }));
  });
}

async function main() {
  console.log("=== تشخیص اتصال دیتابیس ===\n");

  // لایهٔ ۱: متغیر محیطی
  const url = process.env["DATABASE_URL"];
  if (!url) {
    fail(
      "متغیر DATABASE_URL",
      "تنظیم نشده است",
      "در پنل لیارا → اپ → متغیرهای محیطی، DATABASE_URL را اضافه کنید.",
    );
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(
      "متغیر DATABASE_URL",
      "قابل پارس نیست",
      "قالب درست: postgres://user:pass@host:5432/dbname",
    );
    return;
  }

  const password = parsed.password || "";
  const host = parsed.hostname;
  const port = Number(parsed.port || 5432);
  const database = parsed.pathname.replace(/^\//, "") || "(پیش‌فرض)";
  const sslMode = process.env["DATABASE_SSL"] === "false" ? "خاموش" : "prefer";

  ok("متغیر DATABASE_URL", "تنظیم شده");
  console.log(`   میزبان: ${host}`);
  console.log(`   پورت: ${port}`);
  console.log(`   دیتابیس: ${database}`);
  console.log(`   کاربر: ${parsed.username || "(تعیین‌نشده)"}`);
  console.log(`   رمز: ${password ? "دارد (نمایش داده نمی‌شود)" : "ندارد"}`);
  console.log(`   SSL: ${sslMode}\n`);

  // لایهٔ ۲: DNS — همان جایی که ENOTFOUND ظاهر می‌شود
  try {
    const { address } = await lookup(host);
    ok("DNS", `${host} → ${address}`);
  } catch (error) {
    const code = error?.code ?? "";
    fail("DNS", scrub(error?.message, password));
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      console.log(
        "   ↳ نام میزبان دیتابیس شناخته نشد. در لیارا، اپ و دیتابیس باید در یک\n" +
          "     شبکهٔ خصوصی مشترک باشند. در پنل لیارا → اپ → تنظیمات → شبکه‌ها،\n" +
          "     همان شبکه‌ای که دیتابیس در آن است را اضافه و اپ را ری‌استارت کنید.",
      );
    }
    return;
  }

  // لایهٔ ۳: TCP
  const tcp = await probeTcp(host, port);
  if (!tcp.ok) {
    fail(
      "اتصال TCP",
      scrub(tcp.error, password),
      `میزبان پیدا شد ولی پورت ${port} پاسخ نداد — روشن‌بودن دیتابیس و درست‌بودن پورت را بررسی کنید.`,
    );
    return;
  }
  ok("اتصال TCP", `پورت ${port} باز است`);

  // لایهٔ ۴: خود Postgres — گزینه‌ها باید با src/lib/db/client.server.ts یکی باشند،
  // وگرنه این تشخیص چیزی را می‌سنجد که برنامه اجرا نمی‌کند.
  const sql = postgres(url, {
    max: 1,
    connect_timeout: 10,
    ssl: process.env["DATABASE_SSL"] === "false" ? false : "prefer",
    onnotice: () => {},
  });

  try {
    await sql`SELECT 1`;
    ok("احراز هویت Postgres", "اتصال برقرار شد");
  } catch (error) {
    const message = scrub(error?.message, password);
    fail("احراز هویت Postgres", message);
    if (/password|28P01|SASL/i.test(message)) {
      console.log("   ↳ نام کاربری یا رمز اشتباه است.");
    } else if (/does not exist|3D000/i.test(message)) {
      console.log(`   ↳ دیتابیس «${database}» وجود ندارد.`);
    }
    await sql.end({ timeout: 5 }).catch(() => {});
    return;
  }

  // اسکیما
  try {
    const [row] = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = '_migrations'
      ) AS exists
    `;
    if (!row?.exists) {
      fail(
        "اسکیما",
        "جدول _migrations وجود ندارد",
        "هیچ مهاجرتی اجرا نشده. اپ را ری‌استارت کنید تا entrypoint مهاجرت‌ها را اجرا کند.",
      );
    } else {
      const [{ count }] = await sql`SELECT count(*)::text AS count FROM _migrations`;
      ok("اسکیما", `${count} مهاجرت اعمال شده`);

      const [keys] = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_keys'
        ) AS exists
      `;
      if (keys?.exists) {
        const [{ count: keyCount }] = await sql`SELECT count(*)::text AS count FROM provider_keys`;
        ok("جدول provider_keys", `${keyCount} کلید ذخیره‌شده`);
      } else {
        fail("جدول provider_keys", "وجود ندارد", "مهاجرت‌ها ناقص اجرا شده‌اند.");
      }
    }
  } catch (error) {
    fail("اسکیما", scrub(error?.message, password));
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  // متغیرهای دیگر — فقط بله/خیر، هرگز مقدار
  console.log("\n=== متغیرهای محیطی سرویس‌ها ===");
  for (const name of ["OPENAI_API_KEY", "HEYGEN_API_KEY", "RAVI_KEY_SECRET"]) {
    console.log(`${process.env[name] ? "✅" : "❌"} ${name}`);
  }
}

// exit 0 حتی در شکست — این ابزار فقط گزارش می‌دهد.
main()
  .catch((error) => console.error("تشخیص با خطای پیش‌بینی‌نشده متوقف شد:", error?.message ?? error))
  .finally(() => process.exit(0));
