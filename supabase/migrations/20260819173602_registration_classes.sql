-- Registration (form / home group) classes.
-- A registration teacher writes one holistic comment per student covering every
-- subject, rather than a single-subject comment. The marksheet for such a class
-- is imported wholesale from the school MIS term report (e.g. EdAdmin), which
-- carries one page per student listing each subject's mark alongside the form
-- average for that subject.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS is_registration boolean NOT NULL DEFAULT false;

-- Form/class average for the subject in that term, as printed on the MIS report.
-- Used only to judge relative subject difficulty when generating comments; the
-- generated text may never state marks, averages, rankings, or peer comparisons.
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS class_average numeric;

-- Per-student report metadata carried by the MIS report.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS days_absent integer,
  ADD COLUMN IF NOT EXISTS extracurricular text;
