ALTER TABLE public.budgets ADD COLUMN archived_at timestamptz;

DROP INDEX public.budgets_tenant_category_period_unique;
CREATE UNIQUE INDEX budgets_tenant_category_period_unique
  ON public.budgets (tenant_id, category_id, period_start)
  WHERE archived_at IS NULL;
CREATE INDEX budgets_tenant_active_period_idx
  ON public.budgets (tenant_id, period_start)
  WHERE archived_at IS NULL;

-- The runtime role remains subject to RLS. Only the table owner used for migrations
-- and tightly scoped SECURITY DEFINER functions may bypass it. FORCE RLS made those
-- functions recurse on memberships and incorrectly required a PostgreSQL superuser.
DO $tables$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'tenants', 'memberships', 'refresh_sessions', 'one_time_tokens',
    'accounts', 'categories', 'transactions', 'budgets', 'import_jobs',
    'notifications', 'audit_logs', 'mfa_challenges', 'mfa_recovery_codes',
    'projects', 'project_expenses', 'custom_exchange_rates',
    'personal_category_details'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$tables$;

DROP FUNCTION private.lookup_refresh_session(uuid);
CREATE FUNCTION private.lookup_refresh_session(p_id uuid)
RETURNS TABLE (
  id uuid,
  family_id uuid,
  user_id uuid,
  tenant_id uuid,
  token_hash varchar,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason varchar,
  issued_session_version integer,
  current_session_version integer,
  authenticated_at timestamptz,
  status public.user_status,
  role public.membership_role
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT s.id, s.family_id, s.user_id, s.tenant_id, s.token_hash, s.expires_at,
         s.revoked_at, s.revoke_reason, s.session_version, u.session_version,
         s.authenticated_at, u.status, m.role
  FROM public.refresh_sessions s
  JOIN public.users u ON u.id = s.user_id
  JOIN public.memberships m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id
  WHERE s.id = p_id
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION private.lookup_refresh_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lookup_refresh_session(uuid) TO yahro_app;
