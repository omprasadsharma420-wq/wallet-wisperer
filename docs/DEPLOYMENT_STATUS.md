# Deployment Status

Last updated: 2026-07-10

## Live Supabase Project

```text
Project ref: lzbtttgggoxumbcjqqsu
Project URL: https://lzbtttgggoxumbcjqqsu.supabase.co
Frontend public key: sb_publishable_v5pAWpqrnyLyEMlNeaZPAg_4xah6LqS
```

The frontend public key is safe to use in Bolt, web, mobile, and desktop clients. Do not put access tokens, database passwords, service role keys, or secret keys in the frontend.

## Completed

- Project linked with Supabase CLI.
- Database migrations pushed.
- RLS/security policies applied.
- Private storage buckets created.
- Edge Function secrets set for `OPENAI_MODEL` and `OPENAI_API_KEY`.
- All Edge Functions deployed.
- Hosted health check passed.
- Hosted end-to-end smoke test passed.
- OpenAI API validation returned `401`, so the deployed backend is currently using heuristic fallback parsing/report copy.

## Deployed Functions

- `health` - public
- `parse-transaction` - authenticated
- `create-draft` - authenticated
- `confirm-drafts` - authenticated
- `close-day` - authenticated
- `generate-report` - authenticated
- `inbound-email` - authenticated import endpoint
- `nightly-review` - authenticated
- `generate-recurring-drafts` - authenticated

## Notifications And Scheduling

There is no APNs, FCM, or web-push delivery in V1. The live app should show an in-app nudge by calling `nightly-review` on sign-in, refresh, and app foreground.

There is no global cron job for recurring expenses yet. The frontend is responsible for calling `generate-recurring-drafts` on app open or during the demo's simulated evening flow.

## Still Needed

- Replace `OPENAI_API_KEY` with a valid OpenAI API key.
- Run hosted smoke test again and confirm draft model is `gpt-4.1-mini` instead of `heuristic-fallback-v1`.
- Build the production frontend in Bolt/mobile-responsive UI.

Until a valid `OPENAI_API_KEY` is set, the deployed backend still works using heuristic fallback parsing and fallback report copy.
