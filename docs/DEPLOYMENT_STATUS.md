# Deployment Status

Last updated: 2026-07-10 (post security-and-frontend audit)

## Live Supabase Project

```text
Project ref: lzbtttgggoxumbcjqqsu
Project URL: https://lzbtttgggoxumbcjqqsu.supabase.co
Frontend public key: sb_publishable_v5pAWpqrnyLyEMlNeaZPAg_4xah6LqS
```

The frontend public key is safe to use in Bolt, web, mobile, and desktop clients. Do not put access tokens, database passwords, service role keys, or secret keys in the frontend.

## Completed

- Project linked with Supabase CLI.
- Database migrations 0001 and 0002 pushed.
- RLS/security policies applied.
- Private storage buckets created.
- Edge Function secrets set for `OPENAI_MODEL`, `INBOUND_EMAIL_SECRET`, and `OPENAI_API_KEY`.
- Edge Functions deployed (pre-audit versions).
- Hosted health check passes (verified 2026-07-10).

## Changed In This Repo, NOT YET DEPLOYED

Run `scripts\deploy-all.cmd` (needs `supabase login` first) to push these:

- Migration `202607100003_inbound_email_verification.sql` adds `profiles.inbound_from_email`.
- `inbound-email` function now verifies the sender's registered forwarding address and derives the account from it. Until this is deployed, the LIVE function still trusts a caller-supplied `user_id`, which means anyone holding `INBOUND_EMAIL_SECRET` can insert drafts into any account. Deploy before demoing, or unset the secret to disable the endpoint.

## Notifications: What Is Real

There is NO push notification delivery (no APNs, no FCM, no web-push). `nightly-review` with `queue_notification: true` writes a row to `notification_queue`, and the web demo shows that row as an in-app banner when the app is opened or the Nightly Review button is pressed. That banner is the entire delivery mechanism. Nobody receives anything while the app is closed.

## Scheduling: What Is Real

`generate-recurring-drafts` and `nightly-review` have no cron. The web demo calls both automatically on app open and sign-in, so fixed expense cards appear without user action. There is no server-side sweep for users who never open the app.

## Known Issues (verified 2026-07-10)

- `OPENAI_API_KEY` returns `401` from OpenAI, so all parsing uses `heuristic-fallback-v1` (regex rules), not `gpt-4.1-mini`. Live demo parsing quality will be the simple heuristic until a valid key is set with `supabase secrets set OPENAI_API_KEY=...`.
- Auth email confirmation is enabled and the built-in mailer is rate limited (429 `over_email_send_rate_limit` observed). Fresh signups cannot complete quickly. For the demo either disable "Confirm email" in Supabase Auth settings or pre-create and confirm a demo user, then keep `TEST_EMAIL`/`TEST_PASSWORD` for smoke tests.
- `scripts/deployed-smoke-test.mjs` result on 2026-07-10: health check OK, then FAILED at signup with the 429 above. The earlier "hosted end-to-end smoke test passed" claim predates the current auth settings.

## Still Needed

- `supabase login` on this machine, then `scripts\deploy-all.cmd` to ship the migration and updated functions.
- Valid `OPENAI_API_KEY`, then re-run the hosted smoke test and confirm draft `model` is `gpt-4.1-mini` instead of `heuristic-fallback-v1`.
- A confirmed demo user for the stage demo and smoke tests.
