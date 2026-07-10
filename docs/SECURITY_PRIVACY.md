# Security And Privacy Notes

Wallet Whisperer handles sensitive financial behavior data. The V1 design keeps trust by minimizing access.

## What V1 Does

- Stores user-owned data in Supabase with row-level security.
- Uses private storage buckets for goal photos and receipts.
- Sends transaction clues to OpenAI only from Supabase Edge Functions.
- Creates AI drafts, not final transactions.
- Lets users confirm, edit, or ignore every draft.
- Supports user-forwarded/pasted transaction emails rather than full mailbox scanning.
- Uses an authenticated `inbound-email` import endpoint for demo email text. It does not accept arbitrary `user_id` values.

## What V1 Does Not Do

- No bank account linking.
- No Gmail or Outlook inbox scanning.
- No SMS reading.
- No iOS notification reading.
- No guarantee of capturing every transaction.
- No public leaderboard or shame mechanics.

## Correct Product Claim

Use:

```text
Wallet Whisperer collects transaction clues from sources you choose, prepares draft entries, and helps you close the day in seconds.
```

Avoid:

```text
Wallet Whisperer automatically logs every transaction.
```

## OpenAI Data Boundary

Send only the text needed to parse a transaction clue. Do not send unnecessary mailbox context, unrelated email content, or hidden app data.

## RLS Rule

Every finance table is protected by:

```text
auth.uid() = user_id
```

The one exception is `profiles.id`, where the primary key is the user id.

## Inbound Email Import

The `inbound-email` function is not a public provider webhook in V1. It requires a signed-in Supabase user JWT and inserts drafts only for that authenticated user through RLS.

A future provider webhook such as Mailgun or SendGrid Inbound Parse needs a separate design before launch: per-user forwarding addresses or aliases, sender verification, replay protection, and provider signature verification. Do not change `inbound-email` back to a public service-role endpoint that accepts `user_id` from the request body.

## Notifications And Scheduling

V1 does not deliver native push notifications through APNs, FCM, or web push. The app uses an in-app nudge: when the user opens or foregrounds the app, the frontend calls `generate-recurring-drafts` and `nightly-review`, then shows the backend-owned copy such as `5 possible transactions found today. Review tonight?`

The `notification_queue` table is a future delivery queue, not proof that push delivery has happened.

Recurring fixed-expense draft generation and nightly review are pull-based in V1. They run when an authenticated client calls the Edge Functions, not from a global cron job.
