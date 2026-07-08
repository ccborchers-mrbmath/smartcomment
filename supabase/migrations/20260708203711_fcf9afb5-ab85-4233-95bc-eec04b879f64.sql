
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paddle_subscription_id text,
  ADD COLUMN IF NOT EXISTS paddle_customer_id text,
  ADD COLUMN IF NOT EXISTS subscription_price_id text,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_credit_allowance integer NOT NULL DEFAULT 0;

-- Extend the privileged-column guard so users can't self-edit subscription fields
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
  RETURN NEW;
END;
$$;

-- Idempotent subscription cycle credit grant with 2x rollover cap
CREATE OR REPLACE FUNCTION public.apply_subscription_cycle(
  _user_id uuid,
  _credits integer,
  _allowance integer,
  _paddle_transaction_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current integer;
  _cap integer;
  _new_balance integer;
  _delta integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE paddle_transaction_id = _paddle_transaction_id
  ) THEN
    RETURN;
  END IF;

  SELECT credits_balance INTO _current FROM public.profiles WHERE id = _user_id;
  IF _current IS NULL THEN
    RETURN;
  END IF;

  _cap := _allowance * 2;
  _new_balance := LEAST(_current + _credits, _cap);
  -- If already above cap (e.g. bought a top-up), don't reduce balance
  IF _new_balance < _current THEN
    _new_balance := _current;
  END IF;
  _delta := _new_balance - _current;

  INSERT INTO public.credit_transactions
    (user_id, delta, reason, paddle_transaction_id, pack_key, amount_usd, metadata)
  VALUES
    (_user_id, _delta, 'subscription_cycle', _paddle_transaction_id, NULL, NULL,
     jsonb_build_object('granted', _credits, 'allowance', _allowance, 'cap', _cap, 'applied', _delta));

  UPDATE public.profiles
  SET credits_balance = _new_balance,
      updated_at = now()
  WHERE id = _user_id;
END;
$$;
