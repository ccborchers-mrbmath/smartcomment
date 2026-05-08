
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = _uid AND lower(email) = 'ccborchers@gmail.com');
$$;

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  email text,
  category text NOT NULL DEFAULT 'other',
  message text NOT NULL,
  page text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_insert_authed ON public.feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY feedback_select_own ON public.feedback
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY feedback_select_super_admin ON public.feedback
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE POLICY feedback_delete_super_admin ON public.feedback
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));
