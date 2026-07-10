const SUPABASE_URL = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_ANON_KEY = requiredEnv("SUPABASE_ANON_KEY");
const TEST_EMAIL = process.env.TEST_EMAIL || `walletwhisperer.smoke.${Date.now()}@gmail.com`;
const TEST_PASSWORD = process.env.TEST_PASSWORD || "WalletSmoke123!";
const ALLOW_SIGNUP = process.env.SMOKE_ALLOW_SIGNUP !== "0";
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || "NPR";
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Katmandu";

let accessToken = "";
let user = null;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value;
}

function log(step, detail = "") {
  console.log(`OK: ${step}${detail ? ` - ${detail}` : ""}`);
}

function fail(message, detail = "") {
  console.error(`FAIL: ${message}${detail ? `\n${detail}` : ""}`);
  process.exit(1);
}

async function request(path, options = {}) {
  const method = options.method || "GET";
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    ...options.headers,
  };

  if (options.auth !== false && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body });
  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload ?? text)}`);
  }

  return payload;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

async function signIn() {
  try {
    const payload = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      auth: false,
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    accessToken = payload.access_token;
    user = payload.user;
    log("signed in", TEST_EMAIL);
    return;
  } catch (error) {
    if (!ALLOW_SIGNUP) throw error;
  }

  const payload = await request("/auth/v1/signup", {
    method: "POST",
    auth: false,
    body: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      data: { display_name: "Smoke Tester" },
    },
  });

  accessToken = payload.access_token;
  user = payload.user;

  if (!accessToken || !user) {
    fail(
      "signup needs confirmation before this script can continue",
      "Either disable email confirmation for the hackathon demo or provide TEST_EMAIL and TEST_PASSWORD for an already confirmed user.",
    );
  }

  log("created and signed in test user", TEST_EMAIL);
}

async function rest(path, options = {}) {
  return request(`/rest/v1${path}`, options);
}

async function fn(name, body) {
  return request(`/functions/v1/${name}`, {
    method: "POST",
    body,
  });
}

async function ensureProfile() {
  const result = await rest("/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: {
      id: user.id,
      display_name: "Smoke Tester",
      default_currency: DEFAULT_CURRENCY,
      timezone: DEFAULT_TIMEZONE,
    },
  });

  log("profile ready", result?.[0]?.id || user.id);
}

async function ensureGoal() {
  const existing = await rest("/goals?select=*&is_active=eq.true&limit=1");
  if (existing?.[0]) {
    const updated = await rest(`/goals?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: {
        name: "Pokhara Trip",
        target_amount: 25000,
        currency: DEFAULT_CURRENCY,
      },
    });
    log("goal updated", updated?.[0]?.name || "Pokhara Trip");
    return updated?.[0];
  }

  const inserted = await rest("/goals", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      user_id: user.id,
      name: "Pokhara Trip",
      target_amount: 25000,
      currency: DEFAULT_CURRENCY,
      current_saved_amount: 0,
      is_active: true,
    },
  });
  log("goal created", inserted?.[0]?.name || "Pokhara Trip");
  return inserted?.[0];
}

async function run() {
  const health = await request("/functions/v1/health", { auth: false });
  if (!health?.ok) fail("health function did not return ok");
  log("health function reachable");

  await signIn();
  await ensureProfile();
  await ensureGoal();

  const created = await fn("create-draft", {
    source: "manual",
    raw_text: process.env.SMOKE_TRANSACTION_TEXT || "Paid NPR 250 at Momo Ghar via wallet",
    default_currency: DEFAULT_CURRENCY,
    force_heuristic: process.env.SMOKE_FORCE_HEURISTIC === "1",
  });

  const draft = created?.draft;
  if (!draft?.id) fail("create-draft did not return a draft id");
  log("draft created", `${draft.parsed_currency || DEFAULT_CURRENCY} ${draft.parsed_amount || "?"} via ${draft.model || "unknown"}`);

  const review = await fn("nightly-review", {
    timezone: DEFAULT_TIMEZONE,
    queue_notification: true,
  });
  if (!review?.pending_count) fail("nightly-review did not see the draft");
  log("nightly review loaded", review.notification?.full_text || `${review.pending_count} pending`);

  const confirmed = await fn("confirm-drafts", {
    confirm_ids: [draft.id],
    edits: {
      [draft.id]: {
        amount: Number(draft.parsed_amount || 250),
        merchant: draft.parsed_merchant || "Momo Ghar",
        category: draft.parsed_category || "Food",
        necessity: "flexible",
        payment_method: "wallet",
      },
    },
  });

  if (!confirmed?.confirmed_transactions?.length) fail("confirm-drafts did not create a transaction");
  log("draft confirmed", confirmed.confirmed_transactions[0].id);

  const closed = await fn("close-day", {
    timezone: DEFAULT_TIMEZONE,
  });
  if (!closed?.report?.id) fail("close-day did not create a report");
  log("day closed", closed.report.insight);

  console.log("\nHosted smoke test passed.");
}

run().catch((error) => fail("hosted smoke test failed", error.message || String(error)));
