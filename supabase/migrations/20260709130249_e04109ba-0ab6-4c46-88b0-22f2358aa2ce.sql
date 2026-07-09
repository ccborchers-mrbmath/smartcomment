
CREATE OR REPLACE FUNCTION public.spend_credits(
  _user_id uuid,
  _credits integer,
  _function_name text,
  _usage_event_id uuid,
  _amount_usd numeric,
  _metadata jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
  IF _credits IS NULL OR _credits <= 0 THEN
    RETURN true;
  END IF;

  -- Atomic decrement guarded by balance check. Row-level lock via UPDATE.
  UPDATE public.profiles
  SET credits_balance = credits_balance - _credits,
      updated_at = now()
  WHERE id = _user_id
    AND credits_balance >= _credits
  RETURNING credits_balance INTO _new_balance;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.credit_transactions
    (user_id, delta, reason, function_name, usage_event_id, amount_usd, metadata)
  VALUES
    (_user_id, -_credits, 'spend', _function_name, _usage_event_id, _amount_usd, COALESCE(_metadata, '{}'::jsonb));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, uuid, numeric, jsonb) TO service_role;
