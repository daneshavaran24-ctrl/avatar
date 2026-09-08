/**
 * Creates or updates the admin account. This is the only way an account comes
 * into existence — there is no public signup — and, because there is no
 * password-reset email, re-running it with the same address is also how a
 * forgotten password is recovered.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run db:seed-admin
 */
import bcrypt from "bcryptjs";
import postgres from "postgres";

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const url = process.env["DATABASE_URL"];
  const email = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
  const password = process.env["ADMIN_PASSWORD"];

  if (!url) {
    console.error("DATABASE_URL تنظیم نشده است.");
    process.exit(1);
  }
  if (!email || !password) {
    console.error("ADMIN_EMAIL و ADMIN_PASSWORD را تنظیم کنید.");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`گذرواژه باید دست‌کم ${MIN_PASSWORD_LENGTH} نویسه باشد.`);
    process.exit(1);
  }

  const sql = postgres(url, {
    max: 1,
    ssl: process.env["DATABASE_SSL"] === "false" ? false : "prefer",
    onnotice: () => {},
  });

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await sql<{ id: string }[]>`
      INSERT INTO admin_users (email, password_hash)
      VALUES (${email}, ${passwordHash})
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `;

    await sql`
      INSERT INTO user_roles (user_id, role)
      VALUES (${user.id}, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING
    `;

    // A password change should not leave old logins alive.
    await sql`DELETE FROM auth_sessions WHERE user_id = ${user.id}`;

    console.log(`مدیر آماده است: ${email}`);
    console.log("نشست‌های قبلی این حساب باطل شدند؛ دوباره وارد شوید.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("ساخت مدیر ناموفق بود:", error instanceof Error ? error.message : error);
  process.exit(1);
});
