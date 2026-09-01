-- rls_auto_enable() is a SECURITY DEFINER function that no migration in this
-- repo creates — it arrived with the project scaffolding. PostgreSQL grants
-- EXECUTE to PUBLIC on every new function by default, and Supabase exposes the
-- public schema over PostgREST, so it sat callable at /rest/v1/rpc/rls_auto_enable
-- by anon and authenticated alike, running as its owner.
--
-- Its name says it is meant to fire from an event trigger when a table is
-- created. Event triggers invoke their function directly; nothing needs the
-- RPC grant, and nothing in this codebase calls it.
--
-- Guarded because a fresh database built from these migrations alone will not
-- have the function at all.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
  END IF;
END
$$;
