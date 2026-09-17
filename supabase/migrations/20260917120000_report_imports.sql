-- Reading a form's report PDF cannot be done inside one HTTP request.
--
-- The gateway hangs up at 150s, which forced the work into a handful of
-- large, highly parallel Gemini calls; those then hit the API's per-minute
-- quota and came back 429. A 21-student form lost nine pages that way, and a
-- teacher was shown a class quietly missing nine children.
--
-- So the upload now returns immediately with a job id and the extraction runs
-- as a background task, where a Pro project allows 400s of wall clock. That is
-- enough to take the pages a couple at a time over several minutes, which is
-- both under the quota and never near a timeout.
--
-- The client polls this row for progress. It is deliberately not a queue: one
-- row per upload, read only by the teacher who made it.
CREATE TABLE IF NOT EXISTS public.report_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  total_pages int NOT NULL DEFAULT 0,
  done_pages int NOT NULL DEFAULT 0,
  -- The whole extraction, written once on success. Never written partially:
  -- a marksheet missing students is worse than no marksheet, so a run that
  -- could not read every page fails outright rather than handing back what it
  -- managed to get.
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_imports_own" ON public.report_imports;
CREATE POLICY "report_imports_own" ON public.report_imports FOR ALL
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

CREATE INDEX IF NOT EXISTS report_imports_teacher_idx
  ON public.report_imports(teacher_id, created_at DESC);
