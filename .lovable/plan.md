# Marksheet → AI comment integration

## What the teacher gets

On the **Review** screen (where comments are generated for a class), add a small panel:

```text
Include marksheet data
  [✓] Include assessment results when writing comments

  Terms to draw from:
   [✓] 2026 Term 1   [✓] 2026 Term 2
   [ ] 2026 Term 3   [ ] 2026 Term 4
```

- Defaults: checkbox **off**, all four terms ticked.
- Term checkboxes only appear when the include checkbox is on.
- The toggle and term selection are session-only (not persisted) — same lightweight pattern as the existing "instruction" field.
- Sent as `includeMarks: boolean` and `markTerms: string[]` in the existing `generate-comments` invoke body.

## What the AI receives (per student)

When `includeMarks` is true, the edge function loads `assessments` + `assessment_marks` for the class, filtered to `markTerms`, and appends a new block under each student's existing NOTES:

```text
ASSESSMENT SUMMARY:
- "Fractions quiz" (T1, fractions and equivalent forms): 17/20
- "Narrative essay" (T1, descriptive writing on a chosen memory): 42/50
- "Mid-term test" (T2, full term 1 content): 31/50
- "Speech" (T2, two-minute prepared talk): Absent
Student's own average across listed assessments: 78%
Per-assessment delta vs own average: Fractions quiz +7, Narrative essay +6, Mid-term test −16
```

- Absent / Exempt rows are listed as tags and excluded from the average and deltas.
- Deltas are computed in the edge function, not by the model — the model is bad at arithmetic and we want it to focus on language.
- Assessment **description** is included in parentheses so the AI can talk about *what was being assessed*, not just the score.

## Phrasing rules (added to system prompt)

A new dedicated block, high in the prompt, just below the naming rule:

```text
ASSESSMENT DATA RULES (HIGHEST PRIORITY when ASSESSMENT SUMMARY is present):
- NEVER state, imply, or hint at a raw mark, percentage, fraction, ranking, position, or "out of" number. Do not say "scored", "achieved X%", "got X out of Y", "top of the class", "above average", "below average", or similar.
- NEVER compare the student to other students. Comparisons are ONLY between this student's own assessments.
- Use the per-assessment deltas and descriptions to identify relative strengths and growth areas WITHIN the student's own record.
- Use comparative language only, e.g. "has shown a stronger performance in {topic from description A} than in {topic from description B}", "is finding {topic} more challenging than {other topic}", "progress in {topic} has lifted noticeably since {earlier assessment topic}".
- NEVER use "done well in…", "done poorly in…", "did badly", "failed", "excelled", or any qualitative judgement word without a comparative anchor.
- Refer to assessment content by its DESCRIPTION (e.g. "descriptive writing", "fractions"), NOT by its assessment name (e.g. not "Quiz 1", not "Mid-term test").
- Absent / Exempt assessments must not be commented on.
```

## Technical detail

**Frontend — `src/pages/ReviewExport.tsx`**
- Add state `includeMarks: boolean`, `markTerms: string[]` (init to all four 2026 terms).
- Render the panel above the existing instruction textarea.
- Pass `{ includeMarks, markTerms }` in the `supabase.functions.invoke("generate-comments", ...)` body.

**Edge function — `supabase/functions/generate-comments/index.ts`**
1. Read `includeMarks`, `markTerms` from request body.
2. If `includeMarks`, after loading students:
   - `select * from assessments where class_id = $classId and (markTerms is empty or term = any(markTerms)) order by position`
   - `select * from assessment_marks where assessment_id in (...) and student_id in (studentIds)`
   - Index marks by `(student_id, assessment_id)`.
3. Build per-student `ASSESSMENT SUMMARY` text:
   - For each assessment in order: `"{name}" ({term}, {description}): {raw}/{max} | Absent | Exempt`.
   - Compute student's own average % across graded marks only.
   - Compute `delta = round(pct_i - studentAvg)` for each graded assessment; format as `+7 / −16`.
   - If no graded marks for a student, append `(no marked assessments)` and skip averages/deltas.
4. Append this block to the `buildBlock(s)` output after NOTES.
5. Inject the ASSESSMENT DATA RULES block into `systemPrompt` (only when `includeMarks` is true, to keep the prompt lean otherwise).

**No schema changes.** Marksheet tables already exist with correct RLS; the edge function uses the user-scoped supabase client so existing RLS handles authorisation.

**Out of scope (next round)**
- Per-class average / peer context
- Showing the assembled marksheet snippet back to the teacher before generation
- Reading marksheet data into the spellcheck/rewrite flows
