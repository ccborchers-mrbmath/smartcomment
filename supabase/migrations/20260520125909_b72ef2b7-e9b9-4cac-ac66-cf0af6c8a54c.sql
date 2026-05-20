
-- 1) Students: first_name / last_name
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Backfill: split on last space
UPDATE public.students
SET
  first_name = COALESCE(first_name,
    CASE WHEN position(' ' in name) > 0
      THEN regexp_replace(name, '\s+\S+$', '')
      ELSE name END),
  last_name = COALESCE(last_name,
    CASE WHEN position(' ' in name) > 0
      THEN regexp_replace(name, '^.*\s+', '')
      ELSE '' END)
WHERE first_name IS NULL OR last_name IS NULL;

-- Trigger: keep first/last in sync with name when not explicitly provided
CREATE OR REPLACE FUNCTION public.students_sync_name_parts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- If first/last are blank, derive from name
  IF (NEW.first_name IS NULL OR NEW.first_name = '') AND NEW.name IS NOT NULL THEN
    IF position(' ' in NEW.name) > 0 THEN
      NEW.first_name := regexp_replace(NEW.name, '\s+\S+$', '');
      NEW.last_name  := COALESCE(NULLIF(NEW.last_name,''), regexp_replace(NEW.name, '^.*\s+', ''));
    ELSE
      NEW.first_name := NEW.name;
      NEW.last_name  := COALESCE(NEW.last_name, '');
    END IF;
  END IF;
  -- If first/last explicitly set but name missing, build name
  IF (NEW.name IS NULL OR NEW.name = '') AND NEW.first_name IS NOT NULL THEN
    NEW.name := trim(both ' ' from coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS students_sync_name_parts_trg ON public.students;
CREATE TRIGGER students_sync_name_parts_trg
BEFORE INSERT OR UPDATE OF name, first_name, last_name ON public.students
FOR EACH ROW EXECUTE FUNCTION public.students_sync_name_parts();

-- 2) Assessments
CREATE TABLE IF NOT EXISTS public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  term text,
  max_marks numeric NOT NULL DEFAULT 100,
  weight numeric NOT NULL DEFAULT 1,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessments_class_idx ON public.assessments(class_id);
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessments_all_own ON public.assessments;
CREATE POLICY assessments_all_own ON public.assessments
  FOR ALL USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
DROP TRIGGER IF EXISTS assessments_updated_at ON public.assessments;
CREATE TRIGGER assessments_updated_at BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Assessment marks
CREATE TABLE IF NOT EXISTS public.assessment_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  raw_mark numeric,
  status text NOT NULL DEFAULT 'graded' CHECK (status IN ('graded','absent','exempt')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_id)
);
CREATE INDEX IF NOT EXISTS assessment_marks_assessment_idx ON public.assessment_marks(assessment_id);
CREATE INDEX IF NOT EXISTS assessment_marks_student_idx ON public.assessment_marks(student_id);
ALTER TABLE public.assessment_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_marks_all_own ON public.assessment_marks;
CREATE POLICY assessment_marks_all_own ON public.assessment_marks
  FOR ALL USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
DROP TRIGGER IF EXISTS assessment_marks_updated_at ON public.assessment_marks;
CREATE TRIGGER assessment_marks_updated_at BEFORE UPDATE ON public.assessment_marks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
