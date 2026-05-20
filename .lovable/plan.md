# Marksheet feature — build plan

Scope: investigate and build the marksheet itself. AI integration with generated comments is out of scope for this round.

## What the teacher gets

From the class page (Students tab), a new **"Marksheet"** button opens `/classes/:id/marksheet`.

The marksheet is a single spreadsheet-style table per class:

- Rows: students, sorted alphabetically with a toggle **By first name ▾ / By surname ▾**
- Columns per assessment:
  - Header cell with: assessment **name**, **term** dropdown (2026 Term 1–4), **out of** (max marks), **weight %**, short **description**, delete button
  - **Raw** mark input per student (number, or "Absent" / "Exempt" tag)
  - **%** column, auto-calculated, rounded to nearest percent, read-only
- **Add assessment** button appends a new column
- **Term total** column per term: weighted average of that term's assessments for each student (skips Absent/Exempt)
- **Download CSV** button exports the visible sheet

Empty cell = not yet marked. Absent and Exempt are explicit tags chosen from a small menu inside the cell; both exclude the assessment from the student's term total.

## Data model (new tables)

```text
assessments
  id, class_id, teacher_id
  name, description, term, max_marks (numeric), weight (numeric, default 1)
  position (int, for column order)
  created_at, updated_at

assessment_marks
  id, assessment_id, student_id, teacher_id
  raw_mark (numeric, nullable)
  status ('graded' | 'absent' | 'exempt', default 'graded')
  unique (assessment_id, student_id)
  created_at, updated_at
```

RLS: `teacher_id = auth.uid()` for both, mirroring the existing `classes` / `students` pattern. Indexes on `class_id`, `assessment_id`, `student_id`.

Percentage is **not** stored — computed in the UI as `round(raw / max * 100)`.

## Student name change

`students.name` is currently a single field. Add:

- `students.first_name text`
- `students.last_name text`

Migration backfill: split existing `name` on the **last space** — everything before = first_name, last word = last_name (single-word names get empty last_name). Keep `name` column as the canonical display (continue writing `first_name + ' ' + last_name` into it on edit) so the rest of the app (ClassView, StudentCard, generate-comments, exports) keeps working unchanged.

Update the student edit row in `ClassView.tsx` to show two inputs side-by-side instead of one.

## UI structure

New file `src/pages/ClassMarksheet.tsx`, routed in `App.tsx` as `/classes/:id/marksheet`.

Layout:

```text
[← Back to class]   Marksheet — {className}
Sort: (•) First name  ( ) Surname              [+ Add assessment]  [Download CSV]

┌──────────────┬─────────────────────┬─────────────────────┬───────────────┐
│ Student      │ Quiz 1   T1  /20 w1 │ Essay   T1 /50 w2  │ Term 1 total  │
│              │ "fractions"   [🗑]   │ "narrative"  [🗑]   │ (weighted %)  │
├──────────────┼──────┬──────────────┼──────┬──────────────┼───────────────┤
│ Abel, Sam    │  17  │  85%         │  42  │  84%         │  84%          │
│ Brown, Lee   │ Abs  │   —          │  38  │  76%         │  76%          │
└──────────────┴──────┴──────────────┴──────┴──────────────┴───────────────┘
```

- Sticky first column (student name) and sticky header row for horizontal scroll on phones.
- Each header field saves on blur / change with optimistic updates (same pattern as `ClassView`).
- Each mark cell saves on blur; small spinner / check indicator. Debounced.
- Cell menu (⋯ or right-click on mobile: long-press) for Absent / Exempt / Clear.
- Empty state when no assessments yet: a single "Add your first assessment" CTA.

## Term total formula

For each student and each term `T`:

```text
total% = round( Σ ( (raw_i / max_i) * weight_i )  /  Σ weight_i  * 100 )
        for assessments i in term T where status = 'graded' and raw_i is not null
```

Absent / exempt / blank rows are excluded from both numerator and denominator. If a student has no graded marks in the term, total shows `—`.

## CSV export

Client-side CSV (no edge function). Columns:

```text
Surname, First name, {Assessment 1 name} (/max, weight, term), {Assessment 1 %}, ..., Term 1 total %, Term 2 total %, ...
```

Absent → "Absent", Exempt → "Exempt", blank → empty. Filename: `{class name} marksheet.csv`.

## Files to touch

- new `src/pages/ClassMarksheet.tsx`
- new migration: create `assessments`, `assessment_marks`, RLS, indexes; add `first_name` / `last_name` to `students` and backfill
- `src/App.tsx` — register route
- `src/pages/ClassView.tsx` — add "Marksheet" button next to "Review comments"; swap single name input for first/last inputs in the student edit row
- `src/pages/NewClass.tsx` — capture first/last when adding students (small tweak; keep current single-line as well for paste-in lists, splitting on last space)

## Out of scope (next round)

- Letting the AI comment generator read marksheet data
- Per-class colour banding by score
- Importing marks from CSV
- Class average / distribution rows
