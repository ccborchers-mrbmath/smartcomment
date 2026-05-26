
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  function_name text,
  usage_event_id uuid,
  paddle_transaction_id text,
  pack_key text,
  amount_usd numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_transactions_user ON public.credit_transactions(user_id, created_at DESC);
CREATE UNIQUE INDEX credit_transactions_paddle_tx_unique
  ON public.credit_transactions(paddle_transaction_id)
  WHERE paddle_transaction_id IS NOT NULL;

GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_tx_select_own" ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Helper used by the payments webhook to atomically apply a purchase.
CREATE OR REPLACE FUNCTION public.apply_credit_purchase(
  _user_id uuid,
  _credits integer,
  _pack_key text,
  _amount_usd numeric,
  _paddle_transaction_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Idempotent: if this Paddle transaction was already applied, do nothing.
  IF EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE paddle_transaction_id = _paddle_transaction_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.credit_transactions
    (user_id, delta, reason, paddle_transaction_id, pack_key, amount_usd)
  VALUES
    (_user_id, _credits, 'purchase', _paddle_transaction_id, _pack_key, _amount_usd);

  UPDATE public.profiles
  SET credits_balance = credits_balance + _credits,
      updated_at = now()
  WHERE id = _user_id;
END;
$$;
