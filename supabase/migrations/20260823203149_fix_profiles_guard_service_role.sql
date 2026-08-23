-- The guard protects privileged profile columns from being edited by end users,
-- and is meant to step aside for the service role. It never did: it read
-- request.jwt.claim.role, a per-claim GUC PostgREST dropped in favour of a
-- single JSON blob (request.jwt.claims). That lookup always returned NULL, so
-- the guard reverted service-role writes too -- including the admin billing
-- toggle, which reported success while the value silently snapped back.
--
-- Read the current claim name, fall back to the legacy one, and also accept the
-- database role directly. End users still arrive as authenticated/anon and are
-- unaffected, so the protection this guard exists for is unchanged.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  jwt_role text;
BEGIN
  BEGIN
    jwt_role := coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      nullif(current_setting('request.jwt.claim.role', true), '')
    );
  EXCEPTION WHEN others THEN
    jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  END;

  IF jwt_role = 'service_role'
     OR current_user IN ('service_role', 'postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  NEW.school_email := OLD.school_email;
  NEW.school_email_verified_at := OLD.school_email_verified_at;
  NEW.school_sponsored := OLD.school_sponsored;
  NEW.trial_started_at := OLD.trial_started_at;
  NEW.credits_balance := OLD.credits_balance;
  NEW.subscription_status := OLD.subscription_status;
  NEW.paddle_subscription_id := OLD.paddle_subscription_id;
  NEW.paddle_customer_id := OLD.paddle_customer_id;
  NEW.subscription_price_id := OLD.subscription_price_id;
  NEW.subscription_current_period_end := OLD.subscription_current_period_end;
  NEW.subscription_cancel_at_period_end := OLD.subscription_cancel_at_period_end;
  NEW.monthly_credit_allowance := OLD.monthly_credit_allowance;
  NEW.billing_override := OLD.billing_override;
  RETURN NEW;
END;
$function$;
