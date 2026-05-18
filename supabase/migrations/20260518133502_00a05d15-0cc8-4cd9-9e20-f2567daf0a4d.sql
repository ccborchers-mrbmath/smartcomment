
-- Attribution helper: returns (domain, school_id) for a user
CREATE OR REPLACE FUNCTION public.attribute_usage(_uid uuid)
RETURNS TABLE(domain text, school_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p.school_sponsored AND p.school_email IS NOT NULL
        THEN lower(split_part(p.school_email, '@', 2))
      ELSE lower(split_part(u.email, '@', 2))
    END AS domain,
    CASE
      WHEN p.school_sponsored AND p.school_email IS NOT NULL
        THEN (SELECT s.id FROM public.schools s WHERE s.domain = lower(split_part(p.school_email, '@', 2)))
      ELSE NULL
    END AS school_id
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = _uid;
$$;

-- Usage events ledger
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  units integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  cost_usd_estimate numeric(12,6) NOT NULL DEFAULT 0,
  attributed_domain text,
  school_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_created_at_brin ON public.usage_events USING BRIN (created_at);
CREATE INDEX idx_usage_events_user_id ON public.usage_events (user_id, created_at DESC);
CREATE INDEX idx_usage_events_school_id ON public.usage_events (school_id, created_at DESC) WHERE school_id IS NOT NULL;
CREATE INDEX idx_usage_events_domain ON public.usage_events (attributed_domain, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_events_select_own
ON public.usage_events FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY usage_events_select_school_admin
ON public.usage_events FOR SELECT
TO authenticated
USING (school_id IS NOT NULL AND public.is_school_admin(auth.uid(), school_id));

CREATE POLICY usage_events_select_super_admin
ON public.usage_events FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- No insert/update/delete policies: only service_role (edge functions) can write.

-- Rollup views
CREATE OR REPLACE VIEW public.usage_by_domain_daily AS
SELECT
  attributed_domain AS domain,
  date_trunc('day', created_at) AS day,
  count(*) AS events,
  sum(units) AS units,
  sum(credits_used) AS credits,
  sum(cost_usd_estimate) AS cost_usd
FROM public.usage_events
GROUP BY attributed_domain, date_trunc('day', created_at);

CREATE OR REPLACE VIEW public.usage_by_school_monthly AS
SELECT
  school_id,
  date_trunc('month', created_at) AS month,
  count(*) AS events,
  count(DISTINCT user_id) AS active_users,
  sum(units) AS units,
  sum(credits_used) AS credits,
  sum(cost_usd_estimate) AS cost_usd
FROM public.usage_events
WHERE school_id IS NOT NULL
GROUP BY school_id, date_trunc('month', created_at);
