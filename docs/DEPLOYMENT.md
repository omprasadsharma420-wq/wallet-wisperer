# Deployment Checklist

## 1. Create Supabase Project

Create a Supabase project in the dashboard. Copy:

- Project URL
- anon public key
- service role key

The service role key is for local deployment/admin only. Never expose it in Bolt/frontend.

## 2. Install Supabase CLI

If Node/npm is available:

```powershell
npm install -g supabase
supabase --version
```

If using the Supabase standalone installer, install it from the official Supabase CLI docs.

On this Codex desktop workspace, a no-install wrapper is included:

```powershell
.\scripts\supabase.cmd --version
```

PowerShell scripts are also included, but `.cmd` avoids Windows execution-policy friction.

## 3. Login And Link

```powershell
.\scripts\supabase.cmd login
.\scripts\supabase.cmd link --project-ref YOUR_PROJECT_REF
```

In non-interactive shells, use an access token:

```powershell
.\scripts\supabase.cmd login --token YOUR_SUPABASE_ACCESS_TOKEN
.\scripts\supabase.cmd link --project-ref lzbtttgggoxumbcjqqsu
```

## 4. Apply Database Migrations

```powershell
.\scripts\supabase.cmd db push
```

If the optional demo seed is used, create a real auth user first and replace the demo UUID in:

```text
supabase/migrations/202607100002_demo_seed.sql
```

## 5. Set Function Secrets

```powershell
.\scripts\supabase.cmd secrets set OPENAI_API_KEY=sk-your-key
.\scripts\supabase.cmd secrets set OPENAI_MODEL=gpt-4.1-mini
```

Supabase documents function secrets as environment variables for Edge Functions.

## 6. Deploy Edge Functions

```powershell
.\scripts\deploy-functions.cmd
```

This deploys:

- `health`
- `parse-transaction`
- `create-draft`
- `confirm-drafts`
- `close-day`
- `generate-report`
- `inbound-email`
- `nightly-review`
- `generate-recurring-drafts`

## Fast Path

After the CLI is logged in and these environment variables are set, one wrapper can do the normal deploy sequence:

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp-your-cli-token"
$env:SUPABASE_PROJECT_REF="lzbtttgggoxumbcjqqsu"
$env:SUPABASE_DB_PASSWORD="your-remote-database-password-if-link-prompts"
$env:OPENAI_API_KEY="sk-your-key"
$env:OPENAI_MODEL="gpt-4.1-mini"
.\scripts\deploy-all.cmd
```

The wrapper links the project, pushes migrations, sets available secrets, and deploys all Edge Functions.

## 7. Wire Bolt

In Bolt or the frontend host, set:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 8. Smoke Test

Local static smoke test:

```powershell
.\scripts\supabase.cmd --version
C:\Users\ompra\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\smoke-test.mjs
```

Hosted smoke test after deployment:

```powershell
$env:SUPABASE_URL="https://lzbtttgggoxumbcjqqsu.supabase.co"
$env:SUPABASE_ANON_KEY="your-anon-public-key"
$env:TEST_EMAIL="confirmed-demo-user@example.com"
$env:TEST_PASSWORD="demo-user-password"
C:\Users\ompra\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\deployed-smoke-test.mjs
```

If email confirmation is disabled for the demo project, `TEST_EMAIL` can be omitted and the script will create a temporary test user.

Manual demo path:

1. Create a user.
2. Create an active goal.
3. Call `create-draft` with `Paid NPR 250 at Momo Ghar via wallet`.
4. Confirm the draft.
5. Call `close-day`.
6. Verify the report and streak rows were created.

## Current Credential Blockers

Deployment cannot be completed until you provide or configure:

- Supabase access token for CLI deployment.
- Supabase database password if `supabase link` prompts for it.
- Supabase anon public key for frontend and hosted smoke tests.
- OpenAI API key.

The local codebase can still be reviewed and handed to the frontend teammate before those credentials exist.
