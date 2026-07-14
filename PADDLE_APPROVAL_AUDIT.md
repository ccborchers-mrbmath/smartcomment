# Paddle Domain Approval Audit — smartcomment.co.za

Read-only audit. No code was changed. All findings cite exact file paths and line numbers
as of the current `main` branch (commit `fe70288` at time of writing, confirmed identical
to the working tree audited).

---

## A. EXECUTIVE SUMMARY (ranked by probability)

1. **Most likely cause: the live site's Paddle client token may currently resolve to
   Sandbox, not Live.** `getPaddleEnvironment()` (`src/lib/paddle.ts:11-13`) decides
   sandbox-vs-live purely by checking whether `VITE_PAYMENTS_CLIENT_TOKEN` starts with
   `test_` — and if the site is running in Sandbox, **every logged-in page renders a
   banner reading "All payments made in the preview are in test mode" with a link to
   `docs.lovable.dev`** (`src/components/PaymentTestModeBanner.tsx` + rendered globally
   via `src/components/AppShell.tsx:52`). If a Paddle reviewer attempted an actual
   checkout, this is exactly the kind of thing that produces "pricing doesn't match /
   site doesn't look independently operated" rejections. **This cannot be confirmed or
   ruled out from code — it depends entirely on what's set in Netlify's env vars.**
2. **Second most likely: literal Lovable branding is still present in the page `<head>`**
   served on smartcomment.co.za — `author=Lovable`, `twitter:site=@Lovable`, and social
   preview images hosted on Lovable's own storage bucket (`index.html:9,25,28,29`).
   Anyone viewing page source, or any tool generating a social/link preview, sees this.
3. **Third: no physical/registered business address anywhere on the site** — Terms,
   Privacy, and the footer all give an operator name and email but no address. Some
   Merchant-of-Record reviews expect this for full seller verification.
4. **Fourth (already fixed, but worth confirming it's actually deployed where it matters):**
   the Paddle integration used to proxy through Lovable's own gateway with a
   `LOVABLE_API_KEY` — this was real, and would very plausibly have caused exactly this
   kind of rejection, but it was already rewritten to call Paddle's API directly
   (`supabase/functions/_shared/paddle.ts`). The open question is only whether that fix
   is deployed to the actual project/functions currently serving `smartcomment.co.za` —
   unverifiable from code, needs a dashboard check.
5. **Fifth, lower probability but cheap to rule out:** the webhook's environment
   selection defaults to `sandbox` if the `?env=` query param is ever missing from a
   Paddle notification destination URL (`supabase/functions/payments-webhook/index.ts:195`).
   Worth a 30-second re-check that both destinations still have the correct query param.

---

## B. BLOCKERS (would definitely or very plausibly cause rejection)

### B1. Lovable branding live in page `<head>` on smartcomment.co.za
- **File:** `index.html`
- **Lines:**
  - `9`: `<meta name="author" content="Lovable" />`
  - `25`: `<meta property="og:image" content="https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/0096acdb-c685-4543-a324-b7eb72d4bf37">`
  - `28`: `<meta name="twitter:site" content="@Lovable" />`
  - `29`: `<meta name="twitter:image" content="https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/0096acdb-c685-4543-a324-b7eb72d4bf37">`
- **Evidence:** these are served as-is in every page load's raw HTML on the production
  domain — visible via "View Source", and used by any tool that generates a social/link
  preview card (including possibly automated review tooling).
- **Fix:** replace `author` with your own name/company, remove or replace
  `twitter:site`, and replace both image URLs with an image hosted on your own domain
  or Supabase storage instead of Lovable's `gpt-engineer-file-uploads` bucket.

### B2. Frontend Paddle environment is controlled by a single client-side env var whose
production value cannot be verified from code
- **File:** `src/lib/paddle.ts:3, 11-13, 17-42`
- **Mechanism:** `VITE_PAYMENTS_CLIENT_TOKEN` is read at build time; if it starts with
  `test_`, the entire site (checkout, price resolution via `get-paddle-price`, the
  test-mode banner) runs in Sandbox. If it's a `live_...` token, it runs in Live. If the
  var is **missing entirely**, `initializePaddle()` throws immediately
  (`src/lib/paddle.ts:19`) and checkout is completely broken on click.
- **Compounding factor:** `src/components/PaymentTestModeBanner.tsx:1-19`, rendered on
  every authenticated page via `src/components/AppShell.tsx:52`. If the token above
  resolves to sandbox, this banner — with a `docs.lovable.dev` link — is live on
  production for every signed-in user, including anyone reviewing the checkout flow.
- **Fix:** Confirm in Netlify's site settings → Environment variables that
  `VITE_PAYMENTS_CLIENT_TOKEN` is set to your **live** Paddle client-side token (starts
  with something other than `test_`), then trigger a fresh deploy (env var changes
  require a rebuild to take effect, since Vite inlines them at build time).

---

## C. LIKELY CONTRIBUTORS (plausible but not certain)

### C1. No physical/registered business address disclosed anywhere
- **Files checked:** `src/pages/legal/Terms.tsx` (full file), `src/pages/legal/Privacy.tsx`
  (full file), `src/pages/legal/Refund.tsx` (full file), `src/components/PublicLayout.tsx:35-53`
  (footer)
- **Finding:** all three legal pages and the footer identify the operator as
  "Christopher Charles Borchers" with a contact email, but none give a street address or
  business registration number.
- **Fix (if Paddle actually requires it):** add a line with a postal/registered address
  to the Terms page and/or footer. Can't confirm from code whether this specific
  rejection requires it — see Section E.

### C2. Webhook environment silently defaults to `sandbox` if the URL param is ever
missing or mistyped
- **File:** `supabase/functions/payments-webhook/index.ts:195`
- **Code:** `const env = (url.searchParams.get('env') || 'sandbox') as PaddleEnv;`
- **Risk:** if the Live notification destination in Paddle was ever saved without
  `?env=live` on the end of the URL (this exact mistake happened once already this
  session with the Sandbox destination), events would silently attempt Live-mode
  processing with the Sandbox webhook secret and fail signature verification — not
  visible anywhere except Supabase function logs.
- **Fix:** not a code fix — just re-open both destinations in Paddle (Sandbox and Live)
  and re-confirm the URL query string ends in exactly `?env=sandbox` / `?env=live`.

### C3. `supabase/config.toml` still points at the old Lovable-managed project
- **File:** `supabase/config.toml:1` — `project_id = "xcopweerypulnrzdawtx"`
- **Impact:** does not affect the deployed frontend (Netlify uses its own
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_PROJECT_ID` env vars, not this file), but any
  `supabase` CLI command run from this repo without an explicit `--project-ref` targets
  the wrong (old) project. Pure hygiene/consistency issue, not a live-site cause.
- **Fix:** update to the new project ref (`phiqxoajuknrcyetkvlc`) for consistency.

---

## D. VERIFIED CLEAN

- **Pricing consistency across the codebase:** `SUBSCRIPTION`/`PACKS` constants are
  defined identically in `src/pages/Pricing.tsx:10-21`, `src/components/BuyCreditsDialog.tsx:12-14`,
  and `src/pages/Billing.tsx:40-50` (R49/month, R29/500, R99/2000, R449/10000 — all ZAR).
  `src/pages/legal/Terms.tsx:79` also states "R49 per month" consistently. No hardcoded
  price appears more than once with a different value anywhere in `src/`.
- **These exact ZAR amounts were independently confirmed against Paddle's own Catalog
  earlier this session** (Products → Prices for `teacher_monthly`, `credits_starter_onetime`,
  `credits_standard_onetime`, `credits_bulk_onetime` all showed identical ZAR amounts, no
  Trial, no country-specific override) — **however, see Section E: which Paddle
  environment (Sandbox/Live) those screenshots were taken in was not explicitly
  re-confirmed, and matters given the B2 finding above.**
- **Currency and tax disclosure:** `src/pages/Pricing.tsx:49-55` states prices are in
  ZAR and that "taxes may apply and will be calculated at checkout," positioned above the
  fold so it applies to the whole page, not just one section.
- **Legal pages are substantive, not stubs:** `Terms.tsx` (14 numbered sections
  including payment/billing, liability, governing law, contact), `Privacy.tsx` (11
  sections including data collected, sharing, retention, rights, cookies), `Refund.tsx`
  (30-day money-back guarantee, how to request, processing time, contact) — all real
  content, no lorem ipsum or placeholders.
- **Legal pages are public and NOT gated:** confirmed in `src/App.tsx:49-51`, all three
  routes are top-level (not wrapped in `<ProtectedRoute>`).
- **The `<MaintenanceGate>` component that previously blocked all anonymous visitors —
  including these very pages — has been fully removed from the codebase.** Verified via
  repository-wide search: zero remaining references to `MaintenanceGate` anywhere in
  `src/`. This was a real, confirmed historical cause of exactly this class of rejection
  (a reviewer hitting a maintenance wall on `/`, `/pricing`, and all `/legal/*` routes),
  fixed and merged to `main` earlier in this same effort.
- **Legal pages are linked and discoverable:** `src/components/PublicLayout.tsx:43-49`
  — footer present on every public page (homepage, pricing, all legal pages) with links
  to Pricing, Terms, Privacy, Refunds, and a direct `mailto:` Contact link.
- **Working contact method exists and is reachable from the homepage:**
  `PublicLayout.tsx:48` — footer `mailto:ccborchers@gmail.com` link, present on every
  public page including the homepage.
- **Webhook signature verification is real and correctly wired:**
  `supabase/functions/_shared/paddle.ts:49-59` — verifies `paddle-signature` header
  against the correct secret (`PAYMENTS_SANDBOX_WEBHOOK_SECRET` /
  `PAYMENTS_LIVE_WEBHOOK_SECRET`) via the official Paddle SDK's `webhooks.unmarshal`.
  Both destinations were live-tested this session (Sandbox and Live simulate-event
  tests both returned `{"received": true}`).
- **Webhook handling is idempotent:** confirmed in the underlying Postgres functions —
  `apply_credit_purchase` (migration `20260526133811_...sql:44-50`) and
  `apply_subscription_cycle` (migration `20260708203711_...sql:56-61`) both check for an
  existing row with the same `paddle_transaction_id` before granting any credit, so a
  replayed Paddle event cannot double-grant.
- **Webhook handles all the event types you'd expect:**
  `supabase/functions/payments-webhook/index.ts:170-186` — `transaction.completed`,
  `transaction.payment_failed`, `subscription.created`, `subscription.updated`,
  `subscription.canceled`. Unknown event types are logged and still return `200`, so
  Paddle's test pings against extra event types won't fail.
- **The historical Lovable-gateway coupling in the Paddle integration is already
  fixed in code:** `supabase/functions/_shared/paddle.ts:13-41` now calls
  `https://api.paddle.com` / `https://sandbox-api.paddle.com` directly with a plain
  Bearer token — no `connector-gateway.lovable.dev`, no `LOVABLE_API_KEY` anywhere in
  this file or any file importing it (`payments-webhook`, `get-paddle-price`,
  `paddle-portal-url` all checked — none reference `LOVABLE_API_KEY`).
- **`lovable-tagger` is dev-only, not shipped to production:**
  `vite.config.ts:15` — `mode === "development" && componentTagger()` — excluded from
  any production build.
- **`src/pages/Index.tsx`** (a leftover Lovable-scaffold placeholder page) and
  **`src/integrations/lovable/index.ts`** (an unused Lovable Cloud Auth integration,
  imported nowhere else in the codebase) are both dead code — not routed, not rendered,
  don't affect the live site. Confirmed via repo-wide search for their usages.
- **`remotion/` directory is a fully separate, self-contained project** (own
  `package.json`), not referenced by `vite.config.ts` or `index.html`, not part of the
  deployed site.
- **The `smartcomment.lovable.app` → `smartcomment.co.za` redirect** (`src/main.tsx:5-8`)
  only fires for visitors on the `.lovable.app` hostname; it doesn't affect
  `smartcomment.co.za` itself.

---

## E. UNVERIFIABLE FROM CODE — checklist for the Paddle / Netlify / Supabase dashboards

- [ ] **Netlify → Site settings → Environment variables:** what is `VITE_PAYMENTS_CLIENT_TOKEN`
      actually set to? Confirm it starts with something other than `test_` (i.e. it's a
      **live** token), and confirm a deploy has run *since* it was last set (Vite bakes
      env vars in at build time — changing the var alone does nothing until rebuilt).
- [ ] **Netlify → Environment variables:** confirm `VITE_SUPABASE_URL` and
      `VITE_SUPABASE_PROJECT_ID` point at the **new** independent Supabase project
      (`phiqxoajuknrcyetkvlc`), not the old Lovable-managed one.
- [ ] **Paddle dashboard, both Sandbox and Live modes → Catalog → Products:** re-confirm
      the exact ZAR amounts for `teacher_monthly`, `credits_starter_onetime`,
      `credits_standard_onetime`, and `credits_bulk_onetime` in **whichever mode
      corresponds to your live `VITE_PAYMENTS_CLIENT_TOKEN`** — the earlier check this
      session may have been done in a different mode than what's actually live.
- [ ] **Paddle dashboard → Checkout → Website Approval:** does the specific rejection
      reason (once you ask support, see Section F) mention a business address, company
      registration, or anything not covered by "pricing" / "terms of service"?
- [ ] **Supabase dashboard (new project) → Edge Functions → `payments-webhook` and
      `get-paddle-price`:** confirm "Enforce JWT verification" is OFF for both (this was
      set via `--no-verify-jwt` on deploy earlier this session — confirm it's still off
      on whichever project is actually live).
- [ ] **Supabase dashboard (new project) → Edge Functions → Secrets:** confirm
      `PADDLE_SANDBOX_API_KEY`, `PADDLE_LIVE_API_KEY`, `PAYMENTS_SANDBOX_WEBHOOK_SECRET`,
      `PAYMENTS_LIVE_WEBHOOK_SECRET` are all set and are NOT the same value copy-pasted
      into the wrong slot (this exact mistake happened once already this session).
- [ ] **Paddle dashboard, Live mode → Notifications:** open your Live destination and
      confirm the URL ends in exactly `...payments-webhook?env=live` (no typos, no
      trailing characters).
- [ ] **Load `smartcomment.co.za` in an actual browser, logged in:** do you see the
      orange "All payments made in the preview are in test mode" banner anywhere? If
      yes, that confirms the site is currently serving Sandbox mode in production.

---

## F. DRAFT MESSAGE TO PADDLE SUPPORT

> Subject: Domain approval for smartcomment.co.za — request for specific rejection reason
>
> Hi,
>
> We received a rejection on domain approval for smartcomment.co.za citing pricing
> consistency and terms-of-service visibility. We've since completed a thorough audit
> and verified the following on our side:
>
> - Terms of Service, Privacy Notice, and Refund Policy are all live, public,
>   substantive, and linked from the site footer on every page (including the
>   homepage): https://smartcomment.co.za/legal/terms,
>   https://smartcomment.co.za/legal/privacy, https://smartcomment.co.za/legal/refunds
> - A previous maintenance-mode gate that blocked anonymous visitors from reaching
>   these pages (and the homepage/pricing page) has been fully removed.
> - Pricing shown on our site (R49/month subscription; R29/R99/R449 one-time credit
>   packs) matches our Paddle Catalog prices exactly, including currency (ZAR).
> - A tax disclosure ("taxes may apply and will be calculated at checkout") and a
>   working contact email are both visible on the pricing page and site footer.
>
> Given all of the above checks out on our end, could you tell us specifically which
> criterion is still failing for smartcomment.co.za? In particular: is there a
> requirement for a physical/registered business address that we're missing, or is
> there something specific about the checkout/price-matching check that's failing when
> your review process actually exercises the checkout flow? Any specifics would help us
> resolve this quickly rather than guessing.
>
> Thanks,
> Christopher

---

*End of audit. No files were modified as part of this task.*
