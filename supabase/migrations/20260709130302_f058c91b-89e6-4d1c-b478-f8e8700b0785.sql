
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, uuid, numeric, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, uuid, numeric, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, uuid, numeric, jsonb) FROM authenticated;
