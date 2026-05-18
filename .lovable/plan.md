## Goal

Make every AI action attributable to a user **and** a domain, so that at month-end you can produce an accurate invoice for any sponsoring school (e.g. "stmarys.edu used 12,430 credits across 18 teachers in May — $X").

This slots in front of the Stripe/credits work: the ledger is the foundation both for credit-burning *and* for school invoicing.

## What gets built

### 1. Usage ledger table

New table `usage_events`:
- `id`, `user_id`, `created_at`
- `function_name` (e.g. `generate-comments`, `transcribe-audio`)
- `units` (int — tokens, seconds of audio, comments generated, etc.)
- `credits_used` (int — what we'd charge a paying user)
- `cost_usd_estimate` (numeric — our actual cost, from the AI gateway)
- `attributed_domain` (text — snapshot at time of event; see rule below)
- `school_id` (uuid, nullable — snapshot of which school, if sponsored)
- `metadata` (jsonb — model used, request id, etc.)

RLS: user can read own rows; school admins can read rows where `school_id` matches their school; super-admin reads all.

**Domain attribution rule** (computed once, stored on the row, never recalculated):
- If `profiles.school_sponsored = true` → use `profiles.school_email` domain + `school_id`
- Else → use login email domain from `auth.users.email`

Storing it on the row matters: if a teacher later leaves a school, historical invoices stay correct.

### 2. Wrap every AI edge function

A small shared helper `logUsage({ user, function_name, units, credits, cost_usd, metadata })` that:
- Looks up the user's current attribution (sponsored school vs personal domain)
- Inserts one `usage_events` row
- (Later) decrements `profiles.credits_balance` if non-sponsored

Wired into: `generate-comments`, `rewrite-selection`, `transcribe-audio`, `ocr-handwriting`, `extract-policy`, `extract-roster`, `spellcheck-comment`.

Cost numbers come from a small in-code price table per model (e.g. Gemini 2.5 Pro input/output per 1M tokens). We log the *estimated* cost — close enough for invoicing and matches what the Lovable AI gateway actually charges.

### 3. Rollup views

Two SQL views for fast reporting:
- `usage_by_domain_daily` — domain × day × sums of credits/cost/events
- `usage_by_school_monthly` — school_id × month × sums + user count

### 4. School admin invoice page

New `/school/invoice` route (visible to users who are a `school_admin`):
- Month selector (default: previous month)
- Header: school name, period, total cost
- Table: each sponsored teacher in the school with rows used, credits, cost
- Breakdown by AI feature (comments generated, minutes transcribed, etc.)
- "Download PDF" and "Download CSV" buttons
- Super-admin (you) sees the same page but with a school picker

### 5. Super-admin overview (your view)

Extend whatever admin surface you use today with a "Domains" tab:
- All domains sorted by cost this month
- Click a domain → see the per-user breakdown
- Filter sponsored vs paying
- Export CSV

## Why fold it in *now*, before Stripe

The ledger is needed either way — credit-burning reads from it, invoicing reads from it. Building it first means:
- Sponsored-school invoicing works from day one (your immediate need for the partner school)
- When Stripe arrives, credits just become "ledger rows where domain isn't sponsored, sum credits, reconcile to balance"
- No retroactive backfill of usage data

## What this plan does NOT include (still next pass)

- Stripe integration itself (subscriptions, checkout, webhooks)
- Credit pricing decisions (how many credits per comment, $/credit, monthly grant size)
- Hard gating of AI features when out of credits / out of trial
- Automated monthly email of invoice to school admins (manual download first; auto-email can come later)

## Technical details

- `cost_usd_estimate` uses a per-model price map kept in a shared file in `supabase/functions/_shared/pricing.ts`. Update when Lovable AI gateway prices change.
- `units` is feature-specific: tokens for text models, seconds for audio, page count for OCR. Stored raw so we can re-derive anything later.
- Attribution is snapshotted at insert time using a SQL function `attribute_usage(_uid)` returning `(domain text, school_id uuid)` — single source of truth.
- PDF generation: client-side via `@react-pdf/renderer` or simple print stylesheet — no new edge function needed for v1.
- The `usage_events` table will get large; partition by month or add a `created_at` BRIN index from the start.
- Realtime not needed — invoice page can refetch on month change.

## Order of work in the next pass

1. `usage_events` table + RLS + attribution function
2. Shared `logUsage` helper + price map
3. Wire into all 7 AI edge functions
4. Rollup views
5. `/school/invoice` page + CSV/PDF export
6. Super-admin Domains tab
7. *Then* Stripe + credit-burn gating (separate plan)

Approve and I'll build steps 1–6 in this pass.