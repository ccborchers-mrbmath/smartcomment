CREATE POLICY profiles_select_super_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY profiles_select_school_invoice_users
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usage_events ue
    JOIN public.school_admins sa ON sa.user_id = auth.uid()
    LEFT JOIN public.schools s ON s.id = sa.school_id
    WHERE ue.user_id = profiles.id
      AND (
        (ue.school_id IS NOT NULL AND ue.school_id = sa.school_id)
        OR s.domain = ue.attributed_domain
      )
  )
);