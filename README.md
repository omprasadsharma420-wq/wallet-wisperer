# Wallet Whisperer

Wallet Whisperer is a hackathon MVP for a budget-tracking product built around a close-the-day ritual, not a complex budgeting methodology.

The backend is Supabase-first:

- Auth for users.
- Postgres tables with row-level security.
- Private Storage for goal photos and optional receipt uploads.
- Edge Functions for Smart Capture, AI transaction parsing, draft review, confirmation, Rival calculations, streaks, and daily reports.
- OpenAI structured outputs for reliable parsing and insight generation.

## Product Loop

```text
manual/pasted/email transaction clue
-> Smart Capture Draft
-> AI parse + confidence
-> nightly review
-> confirmed transactions
-> Rival reflection
-> daily report
```

## Project Structure

```text
supabase/
  migrations/               Database schema, RLS, seed helpers
  functions/                Supabase Edge Functions
docs/
  API_CONTRACT.md           Frontend/Bolt integration contract
  DEPLOYMENT.md             Setup and deployment steps
  SECURITY_PRIVACY.md       Privacy and platform boundaries
scripts/
  smoke-test.mjs            Static validation for schema/functions/docs
  deployed-smoke-test.mjs   Hosted end-to-end smoke test
  serve-web-demo.mjs        Local web-demo server
web-demo/
  index.html                Minimal local UI harness for demo/testing
```

## What Needs Credentials Later

The codebase is ready to wire to a real Supabase project, but deployment requires:

1. Supabase CLI access token or `SUPABASE_ACCESS_TOKEN`.
2. Supabase database password if `supabase link` asks for it.
3. Supabase project URL and anon public key for Bolt and smoke tests.
4. OpenAI API key for AI parsing/report copy.
5. Inbound email secret for the simulated forwarded-email webhook.

The OpenAI key and inbound email secret must be stored only as Supabase Edge Function secrets. The frontend should only receive the Supabase URL and anon public key.

## Local Validation

Use the bundled Node runtime or your local Node:

```powershell
node scripts/smoke-test.mjs
```

The smoke test validates the presence of the core tables, RLS policies, Edge Functions, OpenAI schema usage, and docs. It does not deploy Supabase or call OpenAI.

Run the local demo shell:

```powershell
node scripts/serve-web-demo.mjs
```

Then open `http://localhost:4173`.

After deployment, run:

```powershell
node scripts/deployed-smoke-test.mjs
```

with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and either an already confirmed `TEST_EMAIL`/`TEST_PASSWORD` or email confirmation disabled for the demo project.
