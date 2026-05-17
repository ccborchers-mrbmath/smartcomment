## Goal

Let any user — regardless of how they signed up (Gmail, school Google, email/password) — prove ownership of a school email address. If that email's domain is on an allow-list, their account is permanently marked "school-sponsored" and bypasses billing forever. Everyone else gets a 1-month trial from signup, then must subscribe to buy credits that are burned by AI features.

No account merging, no second login, no duplicate accounts. One user, one account, optional verified school email attached.

## User experience

1. New user signs up with anything (Gmail, personal email). Trial clock starts at signup. They see "Trial: 27 days left" in the header.
2. In a new **Billing** page (and as a banner during trial), they see: *"Teacher at a partner school? Verify your school email for free access."*
3. They enter `jane@school.edu`. We send a verification link to that address.
4. They click the link (while signed in, or sign in after). Domain is checked against the allow-list. If it matches → their account is flagged `school_sponsored = true` and the school email is stored. Free forever.
5. If domain not on allow-list → friendly "We don't have your school yet — ask your admin to claim the domain" message, link to existing school-claim flow.
6. Non-sponsored users after trial: gated from AI features until they subscribe; subscription buys monthly credits.

## Scope of this plan

This plan covers the **account-linking + entitlement model only** — the foundation. Actual Stripe/Paddle wiring, credit prices, and AI-feature gating are a follow-up once you confirm the model below works.

## Data model changes

New columns on `profiles`:
- `school_email text` — verified school address (nullable)
- `school_email_verified_at timestamptz`
- `school_sponsored boolean default false` — the entitlement flag
- `trial_started_at timestamptz default now()`
- `credits_balance int default 0`
- `subscription_status text` — `trialing | active | past_due | canceled | sponsored`

New table `school_email_verifications`:
- `id`, `user_id`, `email`, `token_hash`, `expires_at`, `consumed_at`, `created_at`
- RLS: user can only see their own rows

Reuse existing `schools` table as the allow-list — a domain is "allow-listed" if a row exists in `schools` for that domain (which is already how `school_admins` / `claim-school-admin` work). No new table needed.

New SQL helper `public.has_active_access(uid)` → returns true if `school_sponsored` OR `subscription_status = 'active'` OR within trial window. Used later by edge functions that burn credits.

## Backend (edge functions)

Two new functions:

1. **`request-school-verification`** — input: `{ email }`. Validates format, checks the domain exists in `schools`, generates a token, stores the hash, emails the user a link `https://app/verify-school?token=...`. Uses the existing Lovable email setup. Rate-limit per user (e.g. 5/hour).

2. **`confirm-school-verification`** — input: `{ token }`. Requires auth. Looks up unconsumed token, confirms it belongs to current user, marks consumed, updates `profiles.school_email`, `school_email_verified_at`, `school_sponsored = true`, `subscription_status = 'sponsored'`. Returns success.

Both functions use the service role for the profile update (since the user updates their own sponsorship flag and we don't want client-side tampering).

## Frontend changes

- **`/billing`** page (new): shows trial countdown, subscribe CTA (placeholder for now), and a "Link school email" card with input + submit.
- **`/verify-school`** page (new): reads token from URL, calls `confirm-school-verification`, shows success/error, redirects to `/billing`.
- **`AppShell`**: header pill showing trial days remaining or "School account" badge if sponsored. Link to `/billing`.
- Small trial banner on `Dashboard` when <7 days remain.

## Why this is painless for the user

- No merging, no second account, no re-signin with Google — they keep using Gmail.
- One email click is the entire link step.
- Works identically whether they originally signed up with Google or email/password.
- If their school later gets added to the allow-list, they can re-run the link in 10 seconds.

## Open items (will handle in the follow-up payments plan)

- Choice of provider (Stripe vs Paddle — your project is eligible for Lovable's built-in Stripe Payments, no account needed up front).
- Credit price per AI action, monthly credit grant, top-up packs.
- Gating logic inside `generate-comments`, `rewrite-selection`, `transcribe-audio`, `ocr-handwriting`, `extract-policy`, `extract-roster`, `spellcheck-comment` — each will call `has_active_access` and decrement credits.

## Technical details

- Token: 32-byte random, store `sha256(token)` in DB, send raw token in URL. Expire after 24h.
- Single-use enforced by `consumed_at IS NULL` check in the confirm function (inside a transaction).
- Email: uses the existing Lovable transactional email infra; no new secrets needed.
- RLS on `profiles`: keep existing own-row policies. The sponsorship flag can only be set via service-role edge function, never from the client (achieved by simply not exposing it in any client-side update; existing `profiles_update_own` policy allows the column technically but we'll add a column-level guard or a trigger that resets `school_sponsored` to its prior value unless changed by service role).
- Allow-list check: `select 1 from schools where domain = lower(split_part(email,'@',2))`.

Approve this and I'll build it; then we tackle the Stripe/credits layer as a clean second pass.