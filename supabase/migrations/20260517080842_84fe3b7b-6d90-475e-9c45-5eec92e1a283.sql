
REVOKE EXECUTE ON FUNCTION public.is_school_domain_allowed(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_active_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_privileged_columns() FROM PUBLIC, anon, authenticated;
