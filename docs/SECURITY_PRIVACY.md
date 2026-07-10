# Security And Privacy Notes

Wallet Whisperer handles sensitive financial behavior data. The V1 design keeps trust by minimizing access.

## What V1 Does

- Stores user-owned data in Supabase with row-level security.
- Uses private storage buckets for goal photos and receipts.
- Sends transaction clues to OpenAI only from Supabase Edge Functions.
- Creates AI drafts, not final transactions.
- Lets users confirm, edit, or ignore every draft.
- Supports user-forwarded/pasted transaction emails rather than full mailbox scanning.

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

## Inbound Email Webhook

The `inbound-email` function is a public endpoint (`verify_jwt = false`) intended for an email provider such as Mailgun or SendGrid Inbound Parse. It is protected by two independent checks:

1. The request must carry the shared `INBOUND_EMAIL_SECRET`.
2. The email's `from` address must match a forwarding address the user registered on their own profile (`profiles.inbound_from_email`). The target account is derived from that match — the endpoint never trusts a caller-supplied `user_id`, so a leaked secret alone cannot be used to insert drafts into arbitrary accounts.

Users who have not registered a forwarding address cannot receive inbound email drafts at all. Every accepted draft still lands as `needs_review = true` and only becomes a transaction after the user confirms it.

Known residual risk: email `from` headers can be spoofed by whoever holds the secret, so a compromised secret plus knowledge of a victim's registered address could forge a draft (never a confirmed transaction). Production hardening would add provider signature verification (e.g. Mailgun HMAC) and rotate the secret.
