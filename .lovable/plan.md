## Goal

Right now the active-term dropdown changes which term new notes get tagged with, but nothing on screen reacts to it. This plan makes the active term the lens through which notes are viewed, while keeping all existing data intact.

## Data safety

No schema changes. No data migrations. Every existing note already has a `term` value (`2026 Term 2` after the previous backfill), so filtering and badges work immediately on existing data.

## Changes

### 1. Student notes page (`src/pages/StudentCard.tsx`)

- Load the `term` field on each note (currently `select("*")` already returns it; add it to the `Input` type).
- Show a small term badge on every note row (e.g. `2026 Term 2`) next to the existing type label and timestamp.
- Default the notes list to **only** notes whose `term` matches the class's `active_term`.
- Add a **"Show all terms"** toggle (switch or checkbox) above the notes list. When on, all notes are shown regardless of term, each still showing its term badge.
- Show a small "Recording for: 2026 Term X" hint above the input tabs so the teacher knows which term the next note will be stamped with.
- Show an empty state like "No notes for 2026 Term X yet" when the filtered list is empty but other terms have notes (with a hint to flip "Show all terms").

### 2. Class page coverage dots (`src/pages/ClassView.tsx`)

- Change the per-student coverage calculation to use **only notes whose `term` equals the class's `active_term`** (instead of the union of `included_terms`).
- The "Include notes from:" checkboxes keep their current job — they only control which terms feed the AI when generating comments. (Add a one-line helper text under that block making this clear, e.g. "Used when generating comments. Doesn't affect which notes are shown.")
- The card colour now answers: "Do I have enough notes for the term I'm currently working in?" — which matches how a teacher actually uses the page term-by-term.

### 3. No backend / edge-function changes

`generate-comments` already filters by `included_terms`, so generation behaviour is unchanged.

## Out of scope (for later)

- The bigger "learning journal" vision (richer input types, more report formats). Happy to plan that separately once this term-aware view feels right.
- Per-note term editing (changing a note's term after the fact). Can be added later if useful — for now the badge is read-only.
- Legacy `classes.term` column stays untouched.
