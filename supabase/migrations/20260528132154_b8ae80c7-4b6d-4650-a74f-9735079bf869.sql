
-- 1. Revoke UPDATE on sensitive profile columns from clients.
--    A guard trigger already resets these, but column-level revoke is defense in depth.
REVOKE UPDATE (
  subscription_status,
  credits_balance,
  school_sponsored,
  school_email_verified_at,
  trial_started_at,
  school_email
) ON public.profiles FROM authenticated;

REVOKE UPDATE ON public.profiles FROM anon;

-- 2. Lock down SECURITY DEFINER functions that clients should never call directly.
REVOKE EXECUTE ON FUNCTION public.apply_credit_purchase(uuid, integer, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.attribute_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_privileged_columns() FROM PUBLIC, anon, authenticated;
