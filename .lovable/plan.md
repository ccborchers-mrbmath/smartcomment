
# Teacher Subscription — R49/month

Adds a monthly subscription tier on top of the existing one-time credit packs. Sponsored school users and one-time top-ups keep working unchanged.

## Decisions locked in
- **Price**: R49/month → 2,000 credits granted each billing cycle
- **Rollover**: unused credits roll over, capped at **4,000** (2× monthly allowance)
- **Out-of-credits**: hard stop, opens existing `BuyCreditsDialog` (already built)
- **Off-season**: flat monthly with a self-serve **Pause** button

## What's built already vs. new
| Piece | Status |
|---|---|
| `credits_balance` + `credit_transactions` ledger | ✅ built |
| Paddle one-time packs + `BuyCreditsDialog` | ✅ built |
| `subscription_status` column on `profiles` | ✅ built (unused) |
| Entitlement gate (`can_use_ai`) | ✅ built |
| Paddle webhook handler | ✅ built (top-ups only) |
| Sponsorship bypass | ✅ built (unchanged) |
| **Paddle subscription product + price** | 🆕 create |
| **Webhook: subscription.created / .updated / .canceled** | 🆕 add |
| **Cycle top-up with rollover cap** | 🆕 add |
| **Pause/resume via customer portal** | 🆕 add |
| **Subscribe & Manage UI on `/billing`** | 🆕 add |
| **`/pricing` page: show subscription tier** | 🆕 update |

## Implementation

### 1. Paddle catalog
- `create_product` → `teacher_monthly_plan`
- `create_price` → `teacher_monthly` at 49 ZAR (4900 cents), recurring monthly, quantity 1–1

### 2. Database migration
Add columns to `profiles`:
- `paddle_subscription_id text` — Paddle sub id (for cancel/portal)
- `paddle_customer_id text`
- `subscription_price_id text` — human-readable, e.g. `teacher_monthly`
- `subscription_current_period_end timestamptz`
- `subscription_cancel_at_period_end boolean default false`
- `monthly_credit_allowance int default 0` — set on subscribe, used for rollover cap
- (existing `subscription_status` already used: `active` | `trialing` | `past_due` | `paused` | `canceled`)

New SQL function `apply_subscription_cycle(_user_id, _credits, _allowance, _paddle_transaction_id)`:
- Idempotent by `paddle_transaction_id`
- `new_balance = LEAST(current_balance + _credits, 2 * _allowance)`
- Insert ledger row `reason='subscription_cycle'`

### 3. Webhook handler (`payments-webhook`)
Add three event handlers alongside the existing `transaction.completed`:
- `subscription.created` → set profile fields, grant first cycle credits via `apply_subscription_cycle`
- `subscription.updated` → update period end, status, `cancel_at_period_end`, handle paused/resumed. On new billing period (period start advanced), grant next cycle credits.
- `subscription.canceled` → set `subscription_status='canceled'`, keep credits until period end

Skip if `price.importMeta.externalId !== 'teacher_monthly'` — this handler only cares about that price.

Sponsored users: if user is `school_sponsored`, still record subscription but skip credit grant (they already have unlimited).

### 4. Frontend
- `usePaddleCheckout` already handles subscription checkout (Paddle detects recurring price automatically) — no code change needed
- **`src/pages/Billing.tsx`**:
  - Show current subscription status + next billing date + credits granted this cycle
  - "Subscribe – R49/month" button (opens Paddle checkout with `teacher_monthly` price)
  - "Manage subscription" button → opens Paddle customer portal (new edge function `paddle-portal-url` that returns portal URL)
  - "Pause" and "Cancel" are done via the Paddle customer portal (no custom UI)
- **`src/pages/Pricing.tsx`**: add a subscription card above the top-up packs
- **`AppShell.tsx` badge**: extend to show "Subscribed" when `subscription_status='active'` on `teacher_monthly`

### 5. New edge function `paddle-portal-url`
Uses `getPaddleClient(env).customerPortalSessions.create(customerId, [subscriptionId])`, returns overview URL. Frontend opens in new tab.

## Not in scope (deliberately)
- **School-pooled subscriptions** — sponsorship model unchanged for now
- **Soft overdraft** — hard stop is the current behaviour
- **Report-season pass** — flat monthly only
- **Proration on upgrade/downgrade** — single tier, no upgrades yet
- **Trial period on the subscription itself** — the existing 200-credit signup bonus is the trial
