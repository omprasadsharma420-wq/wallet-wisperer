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

The `inbound-email` function requires `INBOUND_EMAIL_SECRET`. This is for a future provider such as Mailgun, SendGrid Inbound Parse, or a hackathon simulation. It is not open to the public.
