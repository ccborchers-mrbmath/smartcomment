# School-wide requirements by email domain

Let teachers who share a school email domain (e.g. `@ashtonballito.co.za`) inherit a single set of report requirements set by a school admin. Individual teachers and classes can still override fields, but the school policy always wins where the admin marks it as locked.

## How it will work for users

- **School admin** (a designated user for a domain like `ashtonballito.co.za`) sees a new **"School requirements"** page. They upload the school's policy document and fill in tone/structure/word limits/etc — exactly like the existing global requirements page, plus a "lock this field" toggle per field.
- **Teachers** at that school automatically inherit those settings. On their own *Default requirements* page they see a read-only "School policy" panel at the top showing what's locked by the school, and they can only edit fields the school hasn't locked.
- **Classes** continue to override per-field as today, but locked school fields cannot be overridden.
- First user with a given school email domain who is granted admin (see below) becomes the school admin.

## Admin assignment

Two options for bootstrapping the first admin per domain — I'll go with option A unless you prefer otherwise:

- **A. Self-claim**: the first signed-in user from a domain can click "Claim school admin for ashtonballito.co.za". Once claimed, future claims are blocked; existing admin can promote/demote others from their domain.
- B. Manual: only you (super-admin) can assign school admins.

## Data model

New tables:

- `schools` — `id`, `domain` (unique, e.g. `ashtonballito.co.za`), `name`, `requirements` jsonb, `locked_fields` text[], `created_at`, `updated_at`.
- `school_admins` — `school_id`, `user_id`, unique `(school_id, user_id)`. Used for "is this user an admin of this school?" checks.
- `user_roles` + `app_role` enum (`super_admin`, `school_admin`) — standard separate-table pattern, with a `has_role(uid, role)` SECURITY DEFINER function. Required for safe RLS without recursion.

Helper SECURITY DEFINER functions:
- `school_for_user(uid)` → returns `schools.id` matched by the email domain of `auth.users.email`.
- `is_school_admin(uid, school_id)` → boolean.

RLS:
- `schools`: any authenticated user can `SELECT` the row matching their own domain (so teachers can read their school's policy). Only school admins of that row can `UPDATE`. Insert restricted to super-admin / self-claim flow.
- `school_admins`: members of a school can read; only existing admins (or super-admin) can insert/delete.

## Requirement merge order (used by `generate-comments`)

1. Start with school requirements (locked + unlocked).
2. Overlay teacher's `teacher_defaults` — but skip any field listed in `schools.locked_fields`.
3. Overlay class `requirements` — same lock rule.
4. Overlay per-student `overrides` — same lock rule.

The school's `policy` text is always concatenated into the system prompt as the highest-priority block, even if the teacher also has their own policy.

## Screens

1. **`/school`** (admins only) — School requirements editor. Same form as `/requirements` plus per-field 🔒 lock toggle, plus a "School admins" mini-panel to add/remove admins by email (must match domain).
2. **`/requirements`** (existing) — gains a read-only "Inherited from your school" banner at top listing locked fields; locked fields are disabled in the form.
3. **Header / Dashboard** — new "School" link visible only to school admins; "Claim school admin" CTA shown to the first user from a domain that has no admin yet.

## Edge function changes

- `generate-comments`: load `schools` row by user's email domain, merge per the order above, prepend school policy in the system prompt.
- New `claim-school-admin` function: validates the caller's email domain, creates the `schools` row if missing, inserts the caller into `school_admins`, refuses if an admin already exists.

## Files to add / change

- DB migration: `schools`, `school_admins`, `user_roles`, `app_role`, helper functions, RLS.
- New: `src/pages/SchoolRequirements.tsx`, `supabase/functions/claim-school-admin/index.ts`.
- Edit: `src/pages/Requirements.tsx` (inherited banner + locks), `src/App.tsx` (route), `src/components/AppShell.tsx` (nav link), `supabase/functions/generate-comments/index.ts` (merge + policy).

## Open questions

1. **Admin bootstrap**: option A (self-claim) or B (manual) above?
2. **Locks**: should locking a field also lock it for class-level overrides, or only for the teacher's personal defaults?
3. **Policy stacking**: if both school AND teacher upload a policy doc, should we (a) use only the school's, (b) include both with school first, or (c) let the school admin choose?
