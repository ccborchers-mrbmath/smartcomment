CREATE TABLE public.student_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  title TEXT,
  synthesis TEXT NOT NULL,
  interventions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.student_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_reports_all_own" ON public.student_reports
  FOR ALL USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

CREATE INDEX student_reports_student_id_idx ON public.student_reports(student_id, created_at DESC);

CREATE TRIGGER student_reports_set_updated_at
  BEFORE UPDATE ON public.student_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();