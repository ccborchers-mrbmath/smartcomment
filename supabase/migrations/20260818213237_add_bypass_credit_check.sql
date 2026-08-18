-- Admin-only billing override, independent of the real school-verification
-- sponsorship flow (school_sponsored/school_email). 'billed' and 'exempt'
-- both bypass credit gating; unlike school_sponsored, usage stays fully
-- tracked (credits_used is NOT zeroed) so it can still be invoiced later.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_override text
    CHECK (billing_override IS NULL OR billing_override IN ('billed', 'exempt'));

-- Extend the privileged-column guard so users can't self-edit this admin override
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
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
$$;
