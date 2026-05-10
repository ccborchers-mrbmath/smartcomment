## Goal

Make a class reusable across school terms. Move the term selector into the class page itself, tag every note with the term it was written in, and let the teacher choose which terms' notes feed each student's report comment.

## Data safety

Migration is additive and backfills existing rows so current behaviour is preserved:

- `classes.term` (the free-text field set on creation) stays untouched — just hidden from the New class form.
- New `classes.active_term` — backfilled to **`2026 Term 2`** for every existing class.
- New `student_inputs.term` — backfilled to **`2026 Term 2`** for every existing note.
- New `students.included_terms` — defaults to **all four terms ticked**, so existing classes generate comments from the same notes as before.

Nothing is deleted, dropped, or rewritten destructively.

## Changes

### 1. Database (additive migration)

- `classes`: add `active_term text`. Backfill existing rows to `'2026 Term 2'`.
- `student_inputs`: add `term text`. Backfill every existing row to `'2026 Term 2'`.
- `students`: add `included_terms text[] not null default array['2026 Term 1','2026 Term 2','2026 Term 3','2026 Term 4']`. Backfill existing rows to the same default.
- Keep legacy `classes.term` column.

### 2. New class form (`src/pages/NewClass.tsx`)

- Remove the "Term" input. Stop sending `term` on insert. Teacher picks the term inside the class.

### 3. Class page (`src/pages/ClassView.tsx`)

- Replace the static "Term X 2026" text in the header with a `Select` dropdown: `2026 Term 1` … `2026 Term 4`. Selection writes to `classes.active_term`.
- The active term is the term stamped on any new note created while it is selected.
- On each student card add a small block:
  - Heading: **"Include notes from:"**
  - Four checkboxes bound to `students.included_terms`. Persists on toggle.
- Coverage colour (red/amber/green) recomputed using only notes whose `term` is in `included_terms`.

### 4. Note entry (`src/pages/StudentCard.tsx`)

- When inserting a `student_inputs` row (text, audio transcript, handwriting), include `term: <class.active_term>` (fallback `'2026 Term 2'` if unset).

### 5. Comment generation (`supabase/functions/generate-comments/index.ts`)

- When loading a student's `student_inputs`, filter by `term in (student.included_terms)`.

## Out of scope

- Legacy `classes.term` column stays in the database for safety; UI just stops reading/writing it.
- No changes to auth, RLS, or global-rules behaviour.