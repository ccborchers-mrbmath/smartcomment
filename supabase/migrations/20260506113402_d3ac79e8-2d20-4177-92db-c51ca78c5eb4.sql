
CREATE TABLE public.teacher_defaults (
  teacher_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teacher_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teacher_defaults_all_own" ON public.teacher_defaults
  USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);
CREATE TRIGGER teacher_defaults_set_updated_at
  BEFORE UPDATE ON public.teacher_defaults
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
