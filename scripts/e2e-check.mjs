/**
 * End-to-end checks against a running server, exercising the real HTTP surface
 * rather than importing modules directly: admin-only access, anonymous visitor
 * isolation, and the public rate limits.
 *
 *   node scripts/e2e-check.mjs
 *
 * Requires the built server running on BASE and a migrated database with a
 * seeded admin whose credentials are passed in the environment.
 */
import { toJSON } from "seroval";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? ".output/server/_ssr";

/**
 * Server function ids are content hashes assigned at build time, so they are
 * read back out of the build rather than hard-coded.
 */
function serverFnIds(dir) {
  const ids = {};
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".mjs"))) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const m of text.matchAll(/id:\s*"([a-f0-9]{40,})",\s*\n?\s*name:\s*"([A-Za-z0-9_]+)"/g)) {
      ids[m[2]] ??= m[1];
    }
    for (const m of text.matchAll(/([A-Za-z0-9_]+)_createServerFn_handler = createSsrRpc\("([a-f0-9]{40,})"/g)) {
      ids[m[1]] ??= m[2];
    }
    for (const m of text.matchAll(/\b([A-Za-z0-9_]+) = createServerFn\([\s\S]{0,400}?createSsrRpc\("([a-f0-9]{40,})"/g)) {
      ids[m[1]] ??= m[2];
    }
  }
  return ids;
}

const IDS = serverFnIds(OUTPUT_DIR);

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** One server-function call, carrying an optional cookie jar. */
async function callFn(name, { data, method = "POST", jar } = {}) {
  const id = IDS[name];
  if (!id) throw new Error(`unknown server function: ${name}`);

  const headers = {
    Origin: BASE,
    "x-tsr-serverFn": "true",
    ...(jar?.cookie ? { Cookie: jar.cookie } : {}),
  };

  let url = `${BASE}/_serverFn/${id}`;
  let body;

  if (method === "GET") {
    const payload = encodeURIComponent(JSON.stringify(toJSON({ data })));
    url += `?payload=${payload}`;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(toJSON({ data }));
  }

  const response = await fetch(url, { method, headers, body });

  if (jar) {
    const setCookie = response.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookie) {
      const pair = cookie.split(";")[0];
      const [key] = pair.split("=");
      jar.jar.set(key, pair);
    }
    jar.cookie = [...jar.jar.values()].join("; ");
  }

  const text = await response.text();
  return { status: response.status, text };
}

/**
 * Responses are seroval envelopes. Decoding them properly needs the framework's
 * own plugin set, so these helpers read the two things the checks care about --
 * whether the call failed, and the odd scalar -- straight off the wire.
 */
function isError(response) {
  return response.status >= 400 || response.text.includes("$TSR/Error");
}

function errorMessage(response) {
  const match = response.text.match(/"message":\{"t":1,"s":"((?:[^"\\]|\\.)*)"/);
  return match ? JSON.parse(`"${match[1]}"`) : response.text.slice(0, 120);
}

/** The session id is the only UUID a beginSession response carries. */
function sessionIdOf(response) {
  return (response.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) ?? [])[0];
}

function newJar() {
  return { jar: new Map(), cookie: "" };
}

async function main() {
  console.log(`\nEnd-to-end checks against ${BASE}\n`);

  // --- Public front page needs no account -----------------------------------
  const home = await fetch(BASE);
  check("public front page loads anonymously", home.status === 200, `HTTP ${home.status}`);

  // --- Admin surface is closed without a session -----------------------------
  const anon = newJar();
  const whoamiAnon = await callFn("adminWhoami", { method: "GET", jar: anon });
  check(
    "adminWhoami returns no session when unauthenticated",
    !isError(whoamiAnon) && !whoamiAnon.text.includes("@"),
    errorMessage(whoamiAnon),
  );

  for (const fn of ["getSettings", "listDocuments", "listSessions", "getConnections"]) {
    const result = await callFn(fn, { method: "GET", jar: anon });
    check(`${fn} refuses an unauthenticated caller`, isError(result), `HTTP ${result.status}`);
  }

  // --- Login ---------------------------------------------------------------
  const badLogin = await callFn("adminLogin", {
    data: { email: EMAIL, password: "definitely-the-wrong-password" },
  });
  check("login rejects a wrong password", isError(badLogin));

  const admin = newJar();
  const goodLogin = await callFn("adminLogin", {
    data: { email: EMAIL, password: PASSWORD },
    jar: admin,
  });
  check("login accepts correct credentials", !isError(goodLogin), errorMessage(goodLogin));
  check("login sets an admin cookie", admin.jar.has("ravi_admin"), [...admin.jar.keys()].join(","));

  const whoamiAdmin = await callFn("adminWhoami", { method: "GET", jar: admin });
  check("adminWhoami resolves the session after login", whoamiAdmin.text.includes(EMAIL), errorMessage(whoamiAdmin));

  const settingsAdmin = await callFn("getSettings", { method: "GET", jar: admin });
  check("getSettings works for an admin", !isError(settingsAdmin), errorMessage(settingsAdmin));

  // --- A visitor cookie must not unlock the admin surface -------------------
  const visitor = newJar();
  const session = await callFn("beginSession", { data: "e2e-visitor", jar: visitor });
  check("public beginSession works with no account", !isError(session), errorMessage(session));
  check("beginSession sets a visitor cookie", visitor.jar.has("ravi_visitor"));

  const settingsVisitor = await callFn("getSettings", { method: "GET", jar: visitor });
  check("a visitor cookie cannot reach getSettings", isError(settingsVisitor));

  const sessionId = sessionIdOf(session);
  check("beginSession returned a session id", Boolean(sessionId), errorMessage(session));

  // --- Cross-visitor isolation (the IDOR fix) -------------------------------
  const other = newJar();
  await callFn("beginSession", { data: "e2e-other", jar: other });

  const stolenClose = await callFn("closeSession", { data: sessionId, jar: other });
  check("a second visitor cannot close the first visitor's session", isError(stolenClose));

  const stolenAsk = await callFn("askRavi", {
    data: { sessionId, question: "سلام", inputMode: "TEXT" },
    jar: other,
  });
  check("a second visitor cannot post into the first visitor's session", isError(stolenAsk));

  const ownClose = await callFn("closeSession", { data: sessionId, jar: visitor });
  check("the owning visitor can close their own session", !isError(ownClose), errorMessage(ownClose));

  // --- Rate limiting --------------------------------------------------------
  const flood = newJar();
  let limited = false;
  for (let i = 0; i < 40 && !limited; i += 1) {
    const result = await callFn("requestAvatarSession", { jar: flood });
    if (/درخواست‌ها زیاد است/.test(result.text)) limited = true;
  }
  check("requestAvatarSession is rate limited", limited);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
