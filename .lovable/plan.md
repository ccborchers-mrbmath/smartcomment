# Credit Packs + Comprehensive Report Warning

Two pieces of work, shipped together:

1. A warning dialog teachers see the first time they generate a comprehensive student report, so they understand it consumes more credits than a regular comment.
2. A credit-pack purchase flow so teachers can top up their balance via Stripe (Lovable Payments, seamless).

---

## Part 1 — Comprehensive report warning dialog

**Where:** `src/pages/StudentCard.tsx`, on the "Generate comprehensive report" button.

**Behavior:**
- First click opens a confirmation dialog (shadcn `AlertDialog`).
- Dialog explains: comprehensive reports analyze every note, mark and prior comment for the student, so they cost roughly **20× a single report comment** (~25 credits vs ~1–2). It pulls the live per-action credit cost from `supabase/functions/_shared/usage.ts` so the number stays honest.
- Shows current balance and what will remain after.
- "Don't show this again" checkbox → stored in `localStorage` (`scc.hideCompReportWarning = "1"`).
- Buttons: **Cancel** / **Generate report**.
- If balance < estimated cost: replace the confirm button with a **Buy credits** button that routes to `/billing`.

No backend changes for this part.

---

## Part 2 — Credit packs (Stripe seamless payments)

### Pricing (initial — easy to change later)
| Pack | Credits | Price | Per-credit |
|---|---|---|---|
| Starter | 500 | $5 | $0.010 |
| Standard | 2,000 | $18 | $0.009 |
| Bulk | 10,000 | $80 | $0.008 |

Roughly 10× our AI cost at the smallest pack with mild volume discounts. All packs are one-time purchases; credits never expire.

### Provider
Use **Lovable seamless Stripe payments** (`enable_stripe_payments`). Will run `recommend_payment_provider` first to confirm fit. Reasons: digital service, subscription-style top-ups optional later, full per-session tax flexibility, no need for Paddle MoR on a small SaaS yet. Requires Pro plan (already on it) and Lovable Cloud (already enabled).

### Schema changes (one migration)
```sql
-- Ledger of every balance change (top-up, spend, refund, admin adjust)
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  delta integer not null,            -- +credits for purchases, -credits for spend
  reason text not null,              -- 'purchase' | 'spend' | 'refund' | 'admin_adjust' | 'signup_bonus'
  function_name text,                -- when reason='spend'
  usage_event_id uuid,               -- link to usage_events
  stripe_session_id text,            -- when reason='purchase'
  pack_key text,                     -- 'starter' | 'standard' | 'bulk'
  amount_usd numeric,                -- when reason='purchase'
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- RLS: select own; no insert/update/delete from client (service role only)

-- Idempotency guard for webhook
create unique index credit_transactions_stripe_session_unique
  on public.credit_transactions(stripe_session_id) where stripe_session_id is not null;
```

`profiles.credits_balance` stays the source of truth for the UI; the webhook and the spend path both update it inside an RPC that also writes a `credit_transactions` row.

### Edge functions
1. **`create-checkout`** (verify_jwt = true) — input: `{ packKey }`. Looks up price, creates Stripe Checkout Session (`mode: 'payment'`), stashes `user_id` + `packKey` + `credits` in `metadata`, returns `{ url }`.
2. **`stripe-webhook`** (verify_jwt = false) — handles `checkout.session.completed`: verifies signature, idempotently inserts a `credit_transactions` row with reason `'purchase'`, increments `profiles.credits_balance`.
3. **Update `_shared/usage.ts`** so the existing `recordUsage` helper also writes a matching `credit_transactions` row with reason `'spend'` (no behavior change for callers).

### UI changes
- **`src/pages/Billing.tsx`** — add a "Buy credits" section above the existing content:
  - Current balance (large), recent transactions table (last 20 from `credit_transactions`).
  - Three pack cards with "Buy" buttons → call `create-checkout` → redirect to Stripe URL.
  - Return URLs: `?purchase=success` shows a toast + refetches balance; `?purchase=cancelled` shows a soft toast.
- **`AppShell` credit pill** (if present) — link to `/billing`.
- StudentCard warning dialog's "Buy credits" CTA → `/billing`.

### Secrets needed
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` — both provisioned automatically by `enable_stripe_payments`; we don't ask the user.

### What we are NOT doing in this pass
- No subscriptions, no auto-refill, no storage quotas, no price-tier grandfathering logic. Credits purchased simply sit on the account forever. Future price changes only affect new purchases — that promise costs us nothing to keep since each transaction is recorded at the price paid.

---

## Order of execution once approved
1. `recommend_payment_provider` → `enable_stripe_payments`.
2. Create the three products/prices via the batch product tool surfaced after enabling.
3. Migration for `credit_transactions` + RLS.
4. Edge functions `create-checkout` and `stripe-webhook`; update `_shared/usage.ts`.
5. Billing page UI + warning dialog on StudentCard.
6. Smoke test in Stripe test mode end-to-end.

Confirm and I'll switch to build mode and start at step 1.
