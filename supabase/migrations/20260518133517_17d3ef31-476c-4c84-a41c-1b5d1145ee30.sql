
ALTER VIEW public.usage_by_domain_daily SET (security_invoker = true);
ALTER VIEW public.usage_by_school_monthly SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.attribute_usage(uuid) FROM PUBLIC, anon;
