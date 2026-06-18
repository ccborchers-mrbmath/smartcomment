CREATE OR REPLACE FUNCTION public.email_domain(_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _uid = auth.uid() THEN lower(split_part(coalesce(auth.jwt() ->> 'email', current_setting('request.jwt.claim.email', true)), '@', 2))
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT _uid = auth.uid()
    AND lower(coalesce(auth.jwt() ->> 'email', current_setting('request.jwt.claim.email', true))) = 'ccborchers@gmail.com';
$$;

CREATE OR REPLACE FUNCTION public.school_for_user(_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.schools s
  WHERE s.domain = public.email_domain(_uid)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(_uid uuid, _school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_admins sa
    WHERE sa.user_id = _uid
      AND sa.school_id = _school_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.email_domain(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.school_for_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_school_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_domain(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS school_admins_select_same_school ON public.school_admins;
CREATE POLICY school_admins_select_same_school
ON public.school_admins
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR school_id = public.school_for_user(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS school_admins_insert_admin ON public.school_admins;
CREATE POLICY school_admins_insert_admin
ON public.school_admins
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS school_admins_delete_admin ON public.school_admins;
CREATE POLICY school_admins_delete_admin
ON public.school_admins
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS schools_update_admin ON public.schools;
CREATE POLICY schools_update_admin
ON public.schools
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.school_admins sa
    WHERE sa.user_id = auth.uid()
      AND sa.school_id = schools.id
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.school_admins sa
    WHERE sa.user_id = auth.uid()
      AND sa.school_id = schools.id
  )
);

DROP POLICY IF EXISTS usage_events_select_school_admin ON public.usage_events;
CREATE POLICY usage_events_select_school_admin
ON public.usage_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.school_admins sa
    LEFT JOIN public.schools s ON s.id = sa.school_id
    WHERE sa.user_id = auth.uid()
      AND (
        (usage_events.school_id IS NOT NULL AND sa.school_id = usage_events.school_id)
        OR s.domain = usage_events.attributed_domain
      )
  )
);