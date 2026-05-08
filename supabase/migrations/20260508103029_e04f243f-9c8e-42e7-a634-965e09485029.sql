
REVOKE EXECUTE ON FUNCTION public.email_domain(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.school_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_school_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
