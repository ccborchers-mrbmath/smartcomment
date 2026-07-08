
REVOKE EXECUTE ON FUNCTION public.apply_subscription_cycle(uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_cycle(uuid, integer, integer, text) TO service_role;
