
-- Schools table
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  name text,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.school_admins (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id)
);
ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.email_domain(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(split_part(email, '@', 2)) FROM auth.users WHERE id = _uid;
$$;

CREATE OR REPLACE FUNCTION public.school_for_user(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM public.schools s WHERE s.domain = public.email_domain(_uid);
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(_uid uuid, _school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.school_admins WHERE user_id = _uid AND school_id = _school_id);
$$;

-- RLS: schools
CREATE POLICY "schools_select_own_domain" ON public.schools
  FOR SELECT TO authenticated
  USING (domain = public.email_domain(auth.uid()));

CREATE POLICY "schools_update_admin" ON public.schools
  FOR UPDATE TO authenticated
  USING (public.is_school_admin(auth.uid(), id))
  WITH CHECK (public.is_school_admin(auth.uid(), id));

-- Inserts go via edge function with service role; no insert policy.

-- RLS: school_admins
CREATE POLICY "school_admins_select_same_school" ON public.school_admins
  FOR SELECT TO authenticated
  USING (school_id = public.school_for_user(auth.uid()));

CREATE POLICY "school_admins_insert_admin" ON public.school_admins
  FOR INSERT TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school_admins_delete_admin" ON public.school_admins
  FOR DELETE TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id));

-- updated_at trigger
CREATE TRIGGER schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
