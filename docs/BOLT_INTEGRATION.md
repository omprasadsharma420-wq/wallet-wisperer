# Bolt Integration Notes

Bolt should focus on the product surfaces. Supabase owns data, auth, AI, and report generation.

## Required Environment Values In Bolt

```text
VITE_SUPABASE_URL=https://lzbtttgggoxumbcjqqsu.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_v5pAWpqrnyLyEMlNeaZPAg_4xah6LqS
```

Do not put `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in Bolt/frontend.

## Recommended Screens

1. Onboarding
   - Sign up/sign in.
   - Create one active goal: name, target amount, currency, optional photo.

2. Log
   - One text box for manual quick capture.
   - Paste transaction email/message.
   - Calls `create-draft`.
   - Shows draft card immediately.

3. Smart Capture Inbox
   - Call `nightly-review`.
   - Cards show amount, merchant, category, confidence, source.
   - User can edit amount/category/necessity/payment method.
   - Confirm calls `confirm-drafts`.

4. Report
   - Calls `close-day`.
   - Shows total spend, protected amount, streak, Rival insight.

5. Dashboard
   - Use `dashboard_summary`.
   - Keep it minimal; do not make a budget-remaining permission-to-spend bar.

## Supabase Client Snippets

Create draft:

```ts
const { data, error } = await supabase.functions.invoke("create-draft", {
  body: {
    source: "manual",
    raw_text: input,
    default_currency: "NPR"
  }
});
```

Confirm drafts:

```ts
const { data, error } = await supabase.functions.invoke("confirm-drafts", {
  body: {
    confirm_ids: selectedIds,
    ignore_ids: ignoredIds,
    edits
  }
});
```

Close day:

```ts
const { data, error } = await supabase.functions.invoke("close-day", {
  body: {
    report_date: new Date().toISOString().slice(0, 10),
    timezone: "Asia/Katmandu"
  }
});
```

Nightly review:

```ts
const { data, error } = await supabase.functions.invoke("nightly-review", {
  body: {
    review_date: new Date().toISOString().slice(0, 10),
    timezone: "Asia/Katmandu"
  }
});
```

Generate fixed-expense cards:

```ts
const { data, error } = await supabase.functions.invoke("generate-recurring-drafts", {
  body: {
    due_date: new Date().toISOString().slice(0, 10),
    timezone: "Asia/Katmandu"
  }
});
```

## Query Pending Draft Count

```ts
const { data } = await supabase
  .from("pending_draft_counts")
  .select("pending_count")
  .eq("draft_date", today)
  .maybeSingle();
```

Use it for:

```text
5 possible transactions found today. Review tonight?
```

## Goal Photos

Upload to the private `goal-photos` bucket under:

```text
{userId}/{goalId}/cover.webp
```

Then store that path in `goals.photo_path`.

## Kit Usage

Use Kit only for:

- auth scaffold
- route/layout scaffold
- Supabase client wiring
- reusable UI primitives

Do not use Kit to define the product flow. The source of truth is:

- Smart Capture Drafts
- nightly review
- confirmed transactions
- Rival report
