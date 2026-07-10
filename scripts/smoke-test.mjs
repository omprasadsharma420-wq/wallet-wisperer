import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${message}`);
  }
}

const schema = read("supabase/migrations/202607100001_wallet_whisperer_schema.sql");
const requiredTables = [
  "profiles",
  "goals",
  "income_sources",
  "recurring_expenses",
  "smart_capture_drafts",
  "transactions",
  "daily_reports",
  "streaks",
  "capture_events",
  "notification_queue",
];

for (const table of requiredTables) {
  assert(schema.includes(`create table public.${table}`), `table exists: ${table}`);
  assert(schema.includes(`alter table public.${table} enable row level security`), `RLS enabled: ${table}`);
}

assert(schema.includes("with (security_invoker = true)"), "views use security_invoker");
assert(schema.includes("goal-photos"), "goal photo storage bucket exists");
assert(schema.includes("receipt-uploads"), "receipt upload storage bucket exists");
assert(!schema.includes("create policy \"pending_draft_counts"), "no invalid policies on views");
assert(schema.includes("profiles_insert_own"), "profiles can be inserted by owning user");
assert(schema.includes("transactions_one_per_draft_idx"), "drafts cannot confirm into duplicate transactions");

const functionRoot = join(root, "supabase/functions");
const functions = readdirSync(functionRoot)
  .filter((name) => name !== "_shared")
  .filter((name) => statSync(join(functionRoot, name)).isDirectory());

for (const fn of [
  "health",
  "parse-transaction",
  "create-draft",
  "confirm-drafts",
  "close-day",
  "generate-report",
  "inbound-email",
  "nightly-review",
  "generate-recurring-drafts",
]) {
  assert(functions.includes(fn), `edge function exists: ${fn}`);
  assert(read(`supabase/functions/${fn}/index.ts`).includes("Deno.serve"), `edge function serves: ${fn}`);
}

const openai = read("supabase/functions/_shared/openai.ts");
assert(openai.includes("https://api.openai.com/v1/responses"), "OpenAI Responses API endpoint used");
assert(openai.includes("type: \"json_schema\""), "OpenAI structured outputs configured");
assert(openai.includes("parseTransactionHeuristically"), "heuristic fallback is available");
assert(read("supabase/functions/nightly-review/index.ts").includes("possible transactions found today"), "nightly notification copy exists");
assert(read("supabase/functions/generate-recurring-drafts/index.ts").includes("parsed_necessity: \"fixed\""), "recurring drafts are fixed necessity");
assert(/\[functions\.inbound-email\]\s+verify_jwt = true/.test(read("supabase/config.toml")), "inbound email requires JWT");
assert(read("supabase/functions/inbound-email/index.ts").includes("requireAuth(req)"), "inbound email uses authenticated user context");
assert(!read("supabase/functions/inbound-email/index.ts").includes("createServiceClient"), "inbound email does not use service role");
assert(read("web-demo/index.html").includes("<script type=\"module\" src=\"./app.js\"></script>"), "web demo loads app module");
assert(read("web-demo/app.js").includes("forwarded_email"), "web demo uses forwarded email source");
assert(read("web-demo/app.js").includes("data-field=\"payment_method\""), "web demo exposes payment method review");
assert(read("web-demo/app.js").includes("rivalTradeoffHtml"), "web demo shows Rival tradeoff before confirmation");
assert(read("web-demo/app.js").includes("generate-recurring-drafts"), "web demo calls recurring draft generation");
assert(read("web-demo/app.js").includes("visibilitychange"), "web demo refreshes in-app nudge on foreground");
assert(read("web-demo/index.html").includes("goalRing"), "web demo includes rings UI");
assert(read("web-demo/styles.css").includes("conic-gradient"), "web demo renders ring visuals");
assert(read("scripts/deployed-smoke-test.mjs").includes("Hosted smoke test passed"), "hosted smoke test script exists");
assert(read("scripts/deploy-all.cmd").includes("db push"), "deploy-all pushes migrations");
assert(read("scripts/serve-web-demo.mjs").includes("Wallet Whisperer demo"), "web demo server script exists");

const docs = [
  "docs/API_CONTRACT.md",
  "docs/BOLT_INTEGRATION.md",
  "docs/DEPLOYMENT.md",
  "docs/SECURITY_PRIVACY.md",
  "docs/PRODUCT_FOUNDATION.md",
  "docs/HACKATHON_DEMO_RUNBOOK.md",
  "docs/DEPLOYMENT_STATUS.md",
];

for (const doc of docs) {
  assert(read(doc).length > 1000, `doc has content: ${doc}`);
}

const fixtures = JSON.parse(read("test-fixtures/transaction-inputs.json"));
assert(fixtures.length >= 4, "transaction fixtures exist");

if (process.exitCode) {
  console.error("\nSmoke test failed.");
} else {
  console.log("\nSmoke test passed.");
}
