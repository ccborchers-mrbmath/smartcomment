## Goal

Confirm and enforce that linked `@ashtonballito.co.za` (any `school_sponsored=true`) teachers are **fully free**: no balance decrement, no spend rows, no misleading Billing UI. AI access is already correctly bypassed — only the usage-accounting side needs fixing.

## What's already correct (no change)

- `supabase/functions/_shared/entitlement.ts` — returns `ok` for sponsored users without looking at balance. They are never blocked.
- `payments-webhook` / Paddle — never invoked for sponsored users; they cannot accidentally be charged.
- `profiles_guard_privileged_columns` trigger — clients can't flip `school_sponsored` themselves.

## What to change

### 1. `supabase/functions/_shared/usage.ts`
Before writing anything, look up the user's `school_sponsored` flag (single `profiles` read). If `true`:
- Still insert the `usage_events` row (we want the analytics + school invoice attribution — that's how `SchoolInvoice.tsx` bills the school).
- **Skip** the `credit_transactions` insert.
- **Skip** the `profiles.credits_balance` decrement.

If `false`: behave exactly as today (ledger + decrement, clamped at 0).

This keeps per-school usage reporting intact (school admins still see what their teachers used) while making the teacher's personal balance and activity feed reflect reality: sponsored = unlimited, no debits.

### 2. `src/pages/Billing.tsx` (minor copy/UX)
For sponsored users, hide the "Credits balance" card entirely (or show "Unlimited" instead of a number) and hide the "Recent activity" list's spend rows — they have none anyway after fix #1, so this is just defensive. The "Buy credits" and "Teacher at a partner school?" sections are already correctly hidden for sponsored users.

### 3. `src/components/AppShell.tsx` and `src/components/BuyCreditsDialog.tsx`
No change needed. The dialog only opens on a 402 from an edge function, which sponsored users never receive.

## What I'm NOT doing

- **Auto-renewing credits on expiry** — not needed. Sponsorship is a hard bypass, not a credit grant, so there's nothing to "renew". Sponsored teachers never consume credits after this fix.
- **Refunding the 200 signup bonus** for already-sponsored users — harmless; balance just sits unused. If you'd rather zero it out for sponsored accounts, say the word and I'll add a one-line migration.
- **Touching the unlink flow** — when a teacher unlinks, `school_sponsored` flips to false and they immediately fall back to balance-based gating (still have their original 200-credit bonus, minus anything spent pre-link). That's the behavior you confirmed last round.

## Test plan (in preview)

1. As a sponsored `@ashtonballito.co.za` teacher: generate a comment → balance stays unchanged, no new row in `credit_transactions`, but a row *does* appear in `usage_events` with `school_id` set.
2. As a non-sponsored teacher with 200 credits: generate a comment → balance drops, a `spend` row appears in activity feed (unchanged behavior).
3. As a non-sponsored teacher at 0 credits: AI call returns 402, `BuyCreditsDialog` opens (unchanged).
4. As a school admin viewing `SchoolInvoice.tsx`: sponsored teachers' usage still aggregates correctly per-school.
