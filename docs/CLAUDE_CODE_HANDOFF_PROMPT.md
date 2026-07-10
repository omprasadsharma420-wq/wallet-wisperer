# Claude Code Handoff Prompt

Copy this prompt into Claude Code when transferring Wallet Whisperer.

```text
You are taking over a hackathon MVP called Wallet Whisperer. Work directly in this repository:

C:\Users\ompra\OneDrive\Documents\New project\wallet-whisperer

GitHub remote:
https://github.com/omprasadsharma420-wq/wallet-wisperer

Current date: July 10, 2026.

You have full permission to inspect, modify, validate, commit, and push the project. Please read the repo before making changes, especially `README.md`, `docs/PRODUCT_FOUNDATION.md`, `docs/API_CONTRACT.md`, `docs/SECURITY_PRIVACY.md`, `docs/DEPLOYMENT_STATUS.md`, `docs/HACKATHON_DEMO_RUNBOOK.md`, and the `web-demo` files.

Important safety rule: do not print, commit, expose, or ask me to paste secret keys unless absolutely necessary. The frontend may use the Supabase public publishable key, but never put the Supabase service role key, Supabase CLI access token, database password, or OpenAI API key in frontend code. The OpenAI API key belongs only in Supabase Edge Function secrets.

Product Summary

Wallet Whisperer is not trying to become a full YNAB clone. It is a close-the-day behavioral finance ritual for people who do not open budgeting apps before they spend and often cannot remember their spending at night.

The core loop is:

1. Smart Capture collects transaction clues from sources the user chooses.
2. AI or heuristics turn the clue into an editable draft.
3. The user reviews drafts at night.
4. Only confirmed drafts become final transactions.
5. Flexible spending is translated into a tradeoff against one active Rival goal.
6. The user closes the day and sees a short report, protected amount, streak, and reflection.

Product Rules

- AI creates drafts only. AI must never finalize a transaction without user review.
- Keep one active Rival goal in V1.
- Flexible spending competes with the Rival goal.
- Fixed and needed expenses must not be shamed or counted as Rival pressure.
- Skipped purchases count as protected money.
- Cash must remain first-class because bank-linked products miss it.
- Do not claim automatic capture is universal.
- Do not build bank linking in V1.
- Do not scan Gmail/Outlook inboxes in V1.
- Do not read SMS in V1.
- Do not read iOS notifications. iOS does not allow this through public APIs.
- Android notification capture can be future V2, not required now.
- Smart Capture should reduce memory load, but the stable habit loop remains the nightly review.

Current Backend

The backend is Supabase-first:

- Supabase Auth.
- Postgres tables with row-level security.
- Private Storage buckets for goal photos and optional receipt uploads.
- Edge Functions for Smart Capture, parsing, review, confirmation, recurring fixed drafts, close-day reports, health checks, and authenticated inbound email import.
- OpenAI structured outputs are implemented, with heuristic fallback if the OpenAI key is missing or invalid.

Important Supabase project info:

- Project ref: `lzbtttgggoxumbcjqqsu`
- Project URL: `https://lzbtttgggoxumbcjqqsu.supabase.co`
- Frontend public key is already used in `web-demo/app.js`.
- A valid `OPENAI_API_KEY` was set in Supabase Edge Function secrets on July 11, 2026, and hosted smoke validation confirmed draft creation via `gpt-4.1-mini`. Heuristic fallback remains available if OpenAI calls fail.

Key backend files:

- `supabase/migrations/202607100001_wallet_whisperer_schema.sql`
- `supabase/migrations/202607100003_inbound_email_verification.sql`
- `supabase/functions/_shared/openai.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/create-draft/index.ts`
- `supabase/functions/confirm-drafts/index.ts`
- `supabase/functions/nightly-review/index.ts`
- `supabase/functions/close-day/index.ts`
- `supabase/functions/generate-recurring-drafts/index.ts`
- `supabase/functions/inbound-email/index.ts`

Security Notes

The `inbound-email` function is intentionally authenticated. It is not a public Mailgun/SendGrid webhook and must not be changed back into a public service-role endpoint that accepts arbitrary `user_id`. In V1, it imports text for the signed-in user only.

There is no APNs, FCM, or web push delivery in V1. The app shows an in-app nudge by calling `generate-recurring-drafts` and `nightly-review` when the user opens, refreshes, or foregrounds the app.

There is no global cron job yet. Recurring fixed expense drafts are pull-based and created when an authenticated client calls `generate-recurring-drafts`.

Current Frontend

The active frontend is the `web-demo` folder. Do not assume Bolt is still part of the plan. The old Bolt integration doc was removed because the team now has a working frontend/demo that should be refined or ported into the final frontend.

The app has four tabs:

1. `Capture`
2. `Expense and Income`
3. `Review`
4. `Stats`

Do not reintroduce the old `Setup` and `Report` tabs as primary navigation. Setup functions now live inside `Expense and Income`; reporting lives in `Stats`.

Current UI Direction: Apple DNA

The user explicitly wants the app to feel minimal, polished, gentle, and Apple-like. The app should not look like an email client. It should look like a finance tool with a calm, product-ready surface.

The Apple-style rings are a core visual identity:

- Outer pink ring = budget.
- Middle neon green ring = expense.
- Inner cyan/blue ring = remaining budget.
- The ring stage uses a black background, close to the reference image the user supplied.
- The rings must be integrated into the UI, not treated as tiny status cards.

The UI should be:

- Minimal and easy to read.
- Responsive on mobile and desktop.
- Free of overlapping text.
- Stable in layout: controls should not jump around.
- Apple-inspired, but implemented honestly with web CSS, not by pretending to use Apple-native APIs.
- Finance-first, not inbox-first.

Codex Changes Already Made

Recent UI/frontend changes:

- Replaced the old small ring cards with Apple-style concentric budget rings.
- Removed the entire Forwarded Email panel from Capture.
- Kept Quick Log as the manual/pasted transaction input.
- Added a location reminder chip on Capture, based on the user/profile timezone.
- Reworked navigation to `Capture`, `Expense and Income`, `Review`, `Stats`.
- Created a new `Expense and Income` tab.
- Copied the YNAB-inspired category group structure:
  - Bills: Rent/Mortgage, Phone & Internet, Utilities.
  - Needs: Groceries, Transportation, Medical expenses, Emergency fund.
  - Wants: Dining out, Entertainment, Vacation.
- Added range sliders for category target amounts.
- Added a selected-category target panel with amount, spent, left, and progress.
- Moved close-day reporting into `Stats`.
- Added Stats category breakdown rows.
- Kept the Review tab for nightly draft confirmation only.
- Updated desktop and mobile styling.
- Verified mobile has no horizontal overflow at 390px width.

Recent cleanup changes:

- Removed `docs/BOLT_INTEGRATION.md`.
- Updated `README.md`, `docs/DEPLOYMENT.md`, and `docs/DEPLOYMENT_STATUS.md` to remove Bolt as the frontend path.
- Updated `scripts/smoke-test.mjs` to validate the current frontend shape and this Claude handoff prompt.

Important frontend files:

- `web-demo/index.html`
- `web-demo/styles.css`
- `web-demo/app.js`

The category sliders currently store target amounts in localStorage via `ww_category_targets`. This is acceptable for the hackathon demo, but a production version should persist category budgets in Supabase with RLS.

Things To Preserve

- The Apple rings on Capture and Stats.
- The current tab model.
- The no-forwarded-email-panel decision.
- Quick Log as the paste/manual fallback.
- The nightly review ritual.
- Draft-before-confirmation behavior.
- Rival tradeoff shown before confirmation.
- Security-first backend with RLS.
- No service keys or OpenAI keys in frontend.

Recommended Next Work

Start by running:

```powershell
git status -sb
node scripts\smoke-test.mjs
node scripts\serve-web-demo.mjs
```

If `node` is not available in PATH inside Codex, the bundled path used previously was:

```powershell
C:\Users\ompra\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
```

Then open:

```text
http://localhost:4173
```

Next useful improvements:

1. Make category budget targets persistent in Supabase instead of localStorage.
2. Improve the mobile `Expense and Income` flow if the slider list feels too long.
3. Add a real category-budget table and RLS migration if persistence is required.
4. Improve Stats with clean, Apple-like charts without making it visually noisy.
5. Keep the demo fast: avoid adding broad features that weaken the nightly loop.
6. Rerun hosted smoke tests after any secret, schema, or Edge Function change.

Validation Already Passed Before Handoff

- `node --check web-demo/app.js`
- `node scripts/smoke-test.mjs`
- Desktop browser check for Capture.
- Mobile browser check for Capture at 390px width.
- Mobile `Expense and Income` DOM/layout check: 10 rows, 10 sliders, no horizontal overflow.
- Local demo server responded `200` at `http://localhost:4173`.
- Hosted smoke test after OpenAI secret replacement confirmed draft model `gpt-4.1-mini`.

Before finishing any change, run at least:

```powershell
node scripts\smoke-test.mjs
```

For UI work, also visually verify desktop and mobile. The first thing users and judges will see is the UI, so do not ship rough layouts.

Please continue from the current repo state. Do not restart the project. Do not reintroduce Bolt as a required tool. Do not create a second frontend unless explicitly asked. Treat `web-demo` as the current frontend of record until the team decides to port it.
```
