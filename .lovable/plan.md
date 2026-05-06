
# SmartComment — Plan

A web app that helps teachers gather multimodal input about each student across a term and generate polished end-of-term report comments in their own voice, matching school requirements.

## Core flow

```text
Sign in → Create class (upload roster → AI extracts → confirm)
   → Open student card → add voice / photo / typed notes / files
   → Configure school requirements + upload style bank
   → Generate comments → review/edit → copy or export
```

## Features

### 1. Authentication
- Email + password and Google sign-in.
- Each teacher's classes, students, notes, style bank, and requirements are private to them.

### 2. Classes & roster ingestion
- Create a class (name, year/grade, subject, term).
- Upload a roster as **screenshot/photo, Excel, CSV, or Word**.
- AI extracts the list of student names; teacher sees an editable table to add/remove/rename before saving.
- Manual add/edit of students any time.

### 3. Student cards (multimodal capture)
Each student has a card that accepts ongoing input throughout the term:
- **Voice notes** — record in-browser; auto-transcribed; original audio retained.
- **Handwritten note photos** — upload/snap; AI OCR to text; original image retained.
- **Typed draft comments** — free text, multiple entries with timestamps.
- **File uploads** — PDFs/docs attached as supporting context.
- All entries timestamped, editable, deletable; visible as a chronological feed.

### 4. Style bank (teacher's voice)
- Per-teacher upload of previous comments (paste text, CSV, or Word/PDF).
- Used as few-shot style reference when generating.
- Can be edited/extended; toggled on/off per generation.

### 5. School requirements profile
- Per-class settings: tone (formal/warm/etc.), required structure (e.g. strengths → growth areas → next steps), banned phrases, must-include items, **word and character limits** (min/max), pronoun preferences, third/second person, etc.
- Per-student override (tone/length) when needed.

### 6. Generation
- "Generate all" for the class, or generate per student.
- Combines: student's notes (typed + transcribed voice + OCR'd handwriting + file context) + style bank + class requirements + per-student overrides.
- Produces a draft comment per student that respects limits.
- Inline editor with live word/char count and limit warnings.
- Regenerate with a quick instruction ("shorter", "warmer", "mention the science project").
- **Copy** per student, **Copy all**, and **export to CSV / Word**.

## Screens

1. **Auth** — sign in / sign up (email, Google).
2. **Dashboard** — list of classes, "New class" button, link to Style Bank and Account.
3. **New Class wizard** — name + upload roster + AI extract + confirm names.
4. **Class view** — student grid/list + class requirements panel + "Generate all".
5. **Student card** — tabs/sections for Voice, Handwriting, Typed notes, Files; chronological feed; "Generate comment".
6. **Style bank** — manage past-comment samples.
7. **Requirements editor** — per-class profile.
8. **Review & export** — generated comments table with edit, regenerate, copy, export.

## Data model (high level)

- `profiles` (linked to auth user)
- `classes` (teacher_id, name, term, requirements jsonb)
- `students` (class_id, name)
- `student_inputs` (student_id, type: voice|handwriting|typed|file, text, media_url, transcript, created_at)
- `style_samples` (teacher_id, text, source)
- `generated_comments` (student_id, version, text, model, created_at)
- `user_roles` (separate table, for future admin)

Storage buckets: `audio-notes`, `handwriting`, `attachments`, `style-uploads` (private, per-user RLS).

## Technical notes

- **Stack**: React + Vite + Tailwind + shadcn/ui (existing), Lovable Cloud for auth, DB, storage; Lovable AI Gateway for all AI calls.
- **AI tasks** (each via an edge function):
  - Roster extraction from image/CSV/XLSX/DOCX (vision + parsing) → JSON list of names.
  - Voice transcription (browser MediaRecorder → edge function → STT).
  - Handwriting OCR (vision model on uploaded image).
  - Comment generation (text model assembling notes + style bank + requirements; tool-calling for structured per-student output respecting limits).
- **Defaults**: `google/gemini-3-flash-preview` for text/vision; can switch to a stronger model for final generation.
- **Privacy**: RLS on every table so teachers only see their own data; signed URLs for storage.
- **Exports**: CSV via browser; Word via a simple `.docx` generator in an edge function.

After approval I'll scaffold auth + dashboard + class creation with roster extraction first, then student cards, then style bank + requirements, then generation + export — so you can try each piece as it lands.
