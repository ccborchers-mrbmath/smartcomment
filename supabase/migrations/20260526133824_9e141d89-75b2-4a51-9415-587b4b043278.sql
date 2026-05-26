
REVOKE EXECUTE ON FUNCTION public.apply_credit_purchase(uuid, integer, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_purchase(uuid, integer, text, numeric, text) TO service_role;
