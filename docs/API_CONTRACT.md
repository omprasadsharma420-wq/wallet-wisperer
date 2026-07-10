# Wallet Whisperer API Contract

The frontend should call Supabase Edge Functions through:

```text
POST {SUPABASE_URL}/functions/v1/{function-name}
Authorization: Bearer {supabase-session-access-token}
Content-Type: application/json
```

The `inbound-email` endpoint is the only public webhook. It uses `INBOUND_EMAIL_SECRET` instead of user auth.

## Data Model Summary

- `smart_capture_drafts`: possible transactions from manual input, pasted emails/messages, demo seeds, screenshots, or future notification adapters.
- `transactions`: confirmed user-reviewed money events.
- `goals`: one active Rival goal per user.
- `daily_reports`: close-the-day report records.
- `streaks`: active logging streak with one freeze mechanic.

AI never writes directly into `transactions`. It writes drafts only.

## Function: parse-transaction

Use when the UI wants a parse preview without saving.

```http
POST /functions/v1/parse-transaction
```

Request:

```json
{
  "raw_text": "Paid NPR 250 at Momo Ghar via wallet",
  "default_currency": "NPR",
  "force_heuristic": false
}
```

Response:

```json
{
  "parsed": {
    "amount": 250,
    "currency": "NPR",
    "merchant": "Momo Ghar",
    "category": "Food",
    "transaction_type": "expense",
    "necessity": "flexible",
    "payment_method": "wallet",
    "occurred_at": null,
    "confidence": 0.92,
    "needs_review": true,
    "notes": "Looks like a flexible food purchase."
  },
  "model": "gpt-4.1-mini"
}
```

## Function: create-draft

Use for manual quick-log, pasted transaction email, pasted bank message, screenshot OCR text, or simulated Smart Capture.

```http
POST /functions/v1/create-draft
```

Request:

```json
{
  "source": "paste",
  "raw_text": "Paid NPR 250 at Momo Ghar via wallet",
  "raw_subject": "Payment alert",
  "source_reference": "demo-message-001",
  "default_currency": "NPR"
}
```

Response:

```json
{
  "draft": {
    "id": "uuid",
    "source": "paste",
    "parsed_amount": 250,
    "parsed_currency": "NPR",
    "parsed_merchant": "Momo Ghar",
    "parsed_category": "Food",
    "parsed_kind": "expense",
    "parsed_necessity": "flexible",
    "parsed_payment_method": "wallet",
    "confidence": 0.92,
    "needs_review": true,
    "status": "draft"
  }
}
```

## Function: confirm-drafts

Use from the nightly Smart Capture Inbox. The user can confirm, edit, mark skipped, or ignore.

```http
POST /functions/v1/confirm-drafts
```

Request:

```json
{
  "confirm_ids": ["draft-uuid-1"],
  "ignore_ids": ["draft-uuid-2"],
  "edits": {
    "draft-uuid-1": {
      "amount": 250,
      "category": "Food",
      "necessity": "flexible",
      "is_skipped_opportunity": false
    }
  }
}
```

Response:

```json
{
  "confirmed_transactions": [
    {
      "id": "transaction-uuid",
      "amount": 250,
      "currency": "NPR",
      "goal_percent": 1
    }
  ],
  "ignored_ids": ["draft-uuid-2"]
}
```

## Function: close-day

Creates or updates the report for the selected day. This is the retention anchor.

```http
POST /functions/v1/close-day
```

Request:

```json
{
  "report_date": "2026-07-10",
  "timezone": "Asia/Katmandu"
}
```

Response:

```json
{
  "report": {
    "report_date": "2026-07-10",
    "total_spent": 950,
    "flexible_spent": 450,
    "needed_spent": 500,
    "protected_amount": 250,
    "insight": "Today you saw where NPR 450 of flexible spending touched Pokhara Trip.",
    "achievement": "4 day logging streak kept alive.",
    "mood": "encouraging"
  },
  "streak": {
    "current_count": 4,
    "longest_count": 5,
    "freezes_available": 1
  },
  "pending_drafts": 0
}
```

## Function: generate-report

Lower-level copy endpoint. The normal app should call `close-day` instead.

## Function: inbound-email

Webhook for a future inbound email provider or hackathon simulation. It is intentionally not Gmail/Outlook inbox scanning.

```http
POST /functions/v1/inbound-email
```

Request:

```json
{
  "secret": "shared-webhook-secret",
  "user_id": "auth-user-uuid",
  "from": "bank@example.com",
  "subject": "Payment alert",
  "text": "Paid NPR 250 at Momo Ghar via wallet",
  "default_currency": "NPR"
}
```

Response:

```json
{
  "draft": {
    "id": "uuid",
    "source": "forwarded_email",
    "status": "draft"
  },
  "notification_copy": "Possible transaction found. Review tonight?"
}
```

## Function: nightly-review

Returns the backend-owned review count, notification copy, active goal, and pending draft cards for the close-the-day screen.

```http
POST /functions/v1/nightly-review
```

Request:

```json
{
  "review_date": "2026-07-10",
  "timezone": "Asia/Katmandu",
  "queue_notification": true
}
```

Response:

```json
{
  "pending_count": 5,
  "notification": {
    "title": "5 possible transactions found today",
    "body": "Review tonight?",
    "full_text": "5 possible transactions found today. Review tonight?"
  },
  "goal": {
    "name": "Pokhara Trip",
    "target_amount": 25000
  },
  "drafts": []
}
```

## Function: generate-recurring-drafts

Creates draft cards for due recurring fixed expenses. These are fixed/needed logistics, not Rival pressure moments.

```http
POST /functions/v1/generate-recurring-drafts
```

Request:

```json
{
  "due_date": "2026-07-10",
  "timezone": "Asia/Katmandu"
}
```

Response:

```json
{
  "due_date": "2026-07-10",
  "created_count": 1,
  "skipped_existing_count": 0,
  "drafts": []
}
```

## Frontend Musts

- Show AI outputs as draft cards, never final records.
- Make fixed/needed/flexible easy to change.
- Do not Rival-shame fixed expenses.
- Use the nightly copy: `5 possible transactions found today. Review tonight?`
- Keep manual input available because Smart Capture will miss cash and platform-restricted payments.
