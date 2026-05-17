
-- 1. Profiles: add billing/sponsorship columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS school_email text,
  ADD COLUMN IF NOT EXISTS school_email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS school_sponsored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS credits_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing';

-- 2. Verification tokens table
CREATE TABLE IF NOT EXISTS public.school_email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sev_user ON public.school_email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_sev_token ON public.school_email_verifications(token_hash);

ALTER TABLE public.school_email_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY sev_select_own ON public.school_email_verifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- No insert/update/delete policies — only service role writes.

-- 3. Helper: is a domain on the allow-list (= a row exists in public.schools)
CREATE OR REPLACE FUNCTION public.is_school_domain_allowed(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schools
    WHERE domain = lower(split_part(_email, '@', 2))
  );
$$;

-- 4. Helper: does this user have active access right now?
CREATE OR REPLACE FUNCTION public.has_active_access(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid
      AND (
        p.school_sponsored = true
        OR p.subscription_status = 'active'
        OR (p.subscription_status = 'trialing' AND p.trial_started_at > now() - interval '30 days')
      )
  );
$$;

-- 5. Guard: prevent users from setting their own sponsorship/trial/credits via direct update
-- These columns may only be changed by service role.
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the call is from the service_role, allow anything.
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Otherwise, force privileged columns to their old values.
  NEW.school_email := OLD.school_email;
  NEW.school_email_verified_at := OLD.school_email_verified_at;
  NEW.school_sponsored := OLD.school_sponsored;
  NEW.trial_started_at := OLD.trial_started_at;
  NEW.credits_balance := OLD.credits_balance;
  NEW.subscription_status := OLD.subscription_status;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard ON public.profiles;
CREATE TRIGGER trg_profiles_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_columns();
