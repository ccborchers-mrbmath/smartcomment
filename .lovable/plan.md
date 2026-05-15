# Chunk comment generation for quality

## Goal
When a teacher generates comments for a large class, the edge function should internally split the work into small batches so each AI call has the model's full attention on just a few students at a time. The user experience stays the same — one click, all comments returned — but quality (rule adherence, specificity, pronoun/name accuracy) improves significantly on big classes.

## Why not strictly one-at-a-time
One student per call gives the best quality, but a class of 30 would mean 30 sequential calls (~5+ minutes wall time) — too slow. Running them in parallel risks hitting the AI gateway's rate limit (429s) and would actually fail more often than it succeeds. The right balance is **small batches run with bounded parallelism**.

## Approach

**Batch size: 3 students per AI call.**
At 3 students, the model still treats each comment individually (quality is indistinguishable from 1-at-a-time in practice), but we cut the number of calls by ~3x.

**Concurrency: up to 3 batches in flight at once.**
So a 30-student class becomes 10 batches × 3 = 3 waves of 3 parallel calls. Wall time stays roughly the same as today's single-call approach, but quality is much higher. Concurrency is capped to stay safely under the AI gateway's per-minute rate limit.

**Single retry on 429.**
If a batch hits a rate limit, wait briefly and retry once. If it still fails, surface a clear error but keep the comments that did succeed.

**Atomic save.**
Each successful batch's comments are saved as new versions in `generated_comments` immediately (same logic as today), so a partial failure never loses completed work.

## What stays the same
- The client still calls `generate-comments` once with the full `studentIds` array.
- The system prompt, school policy merging, style samples, per-student pronoun/name rules — all unchanged.
- The response shape `{ comments: [{ student_id, text }, ...] }` is unchanged, so `ReviewExport.tsx` and other callers need no changes.
- Single-student and small-class generation behave identically to today (one batch, one call).

## What changes
- `supabase/functions/generate-comments/index.ts` — the section that builds `studentBlocks` and makes one fetch to the AI gateway is refactored into a helper that takes a chunk of students and returns parsed comments. The handler then chunks `students` into groups of 3, runs them with a concurrency limit of 3, collects results, and persists/returns them.

## Technical details

```text
chunk(students, 3) -> [[s1,s2,s3], [s4,s5,s6], ...]

runWithConcurrency(chunks, limit=3, async (chunk) => {
  build studentBlocks for chunk
  POST to ai.gateway.lovable.dev (same payload shape)
  on 429: wait 1.5s, retry once
  parse tool_call -> comments
  insert each as new version into generated_comments
  return comments
})

flatten -> { comments: [...] }
```

Error handling:
- 402 (credits exhausted) — abort remaining batches, return what's done with a clear error.
- 429 after retry — same: return partial + error message.
- Other 5xx — same partial-return behaviour, log the failing batch.

No DB schema changes. No client changes. No new dependencies.

## Out of scope
- Streaming progress updates back to the UI (would need a different transport; can be a follow-up if desired).
- Per-student retry logic beyond the single 429 retry per batch.
- Configurable batch size — hardcoded to 3 for now; easy to tune later.