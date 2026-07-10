# Hackathon Demo Runbook

## Core Claim

Wallet Whisperer does not ask users to become budget planners. It captures transaction clues during the day, turns them into editable drafts, and anchors everything in one close-the-day ritual.

Use this phrase:

```text
Five possible transactions found today. Review tonight?
```

## 90 Second Flow

1. Open the app and show the Apple-style budget rings.
2. Paste a bank or wallet message into Smart Capture.
3. Create a draft and point out that AI did not finalize anything.
4. Open Nightly Review. The draft card shows the trade-off live: "NPR 250 = 1.0% of Pokhara Trip". Change necessity to fixed and show the trade-off disappear, because fixed costs never count against the Rival.
5. Tick "Skipped it" on one card and show the amount turn into protected money toward the goal.
6. Confirm the drafts. The summary repeats each trade-off using the backend-calculated percent.
7. Press Nightly Review to queue the nudge and show the in-app banner.
8. Close the day and show total spend, protected amount, streak, and the Rival insight.

Before the demo: pre-create and confirm the demo account. Signup on stage risks the auth email rate limit.

## Judge Narrative

Problem:

People do not remember spending clearly at night, and they do not open budget apps before buying.

V1 answer:

Smart Capture reduces memory load. The nightly ritual preserves the behavioral loop without nagging the user after every payment.

Why this is different:

It is not bank linking, and it is not YNAB. It is a low-friction reflection loop for people who avoid budget systems.

## Technical Proof Points

- Supabase Auth and Postgres RLS protect every user-owned finance table.
- OpenAI structured outputs parse transaction clues into drafts.
- Heuristic fallback keeps the demo working if the OpenAI key is missing or the API call fails.
- Confirmation writes final transactions only after user review.
- Duplicate draft confirmation is blocked by a unique transaction-per-draft index.
- Nightly review copy is backend-owned, so mobile push, email, and web can stay consistent.

## Fallbacks

If hosted deployment is not ready:

```powershell
node scripts\serve-web-demo.mjs
```

Open:

```text
http://localhost:4173
```

If OpenAI is unavailable, call `create-draft` with `force_heuristic: true`. The demo still proves the Smart Capture loop.

If email capture is not wired to a real provider, paste the transaction text into Quick Log. This keeps the demo honest without making the app look like an inbox.
