-- The overall average printed on the MIS report, per term, exactly as shown.
--
-- Deliberately the school's own figure rather than one computed from the
-- subject marks. Two reasons. The school may exclude subjects from its total
-- (Ashton's IEB report leaves Life Orientation out, its Cambridge one has no
-- such subject), and reproducing those rules would mean guessing at them. And
-- the printed figure is rounded: a real 60.4 -> 64.7 prints as 60 -> 65, which
-- a reader sees as a five-point rise. A comment sits beside the report card, so
-- it has to agree with the number on the page rather than with the arithmetic
-- behind it.
--
-- Shape: {"2026 Term 1": 61, "2026 Term 2": 58, "2026 Term 3": 66}
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS term_averages jsonb NOT NULL DEFAULT '{}'::jsonb;
