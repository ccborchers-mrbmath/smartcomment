GRANT EXECUTE ON FUNCTION public.email_domain(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

CREATE POLICY "schools_select_super_admin"
ON public.schools
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "school_admins_select_super_admin"
ON public.school_admins
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS usage_events_select_school_admin ON public.usage_events;

CREATE POLICY usage_events_select_school_admin
ON public.usage_events
FOR SELECT
TO authenticated
USING (
  (school_id IS NOT NULL AND public.is_school_admin(auth.uid(), school_id))
  OR EXISTS (
    SELECT 1
    FROM public.schools s
    WHERE s.domain = usage_events.attributed_domain
      AND public.is_school_admin(auth.uid(), s.id)
  )
);