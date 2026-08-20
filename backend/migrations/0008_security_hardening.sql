ALTER TABLE public.users
  ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count BETWEEN 0 AND 1000),
  ADD COLUMN locked_until timestamptz;

ALTER TABLE public.refresh_sessions
  ADD COLUMN session_version integer,
  ADD COLUMN authenticated_at timestamptz;

UPDATE public.refresh_sessions s
SET session_version = u.session_version,
    authenticated_at = s.created_at
FROM public.users u
WHERE u.id = s.user_id;

ALTER TABLE public.refresh_sessions
  ALTER COLUMN session_version SET NOT NULL,
  ALTER COLUMN authenticated_at SET NOT NULL,
  ALTER COLUMN authenticated_at SET DEFAULT now(),
  ADD CONSTRAINT refresh_sessions_session_version_positive CHECK (session_version > 0);

DROP FUNCTION private.lookup_user_for_auth(text);

CREATE FUNCTION private.lookup_user_for_auth(p_email text)
RETURNS TABLE (
  id uuid,
  email varchar,
  password_hash text,
  nickname varchar,
  status public.user_status,
  email_verified_at timestamptz,
  session_version integer,
  failed_login_count integer,
  locked_until timestamptz,
  tenant_id uuid,
  role public.membership_role
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT u.id, u.email, u.password_hash, u.nickname, u.status, u.email_verified_at,
         u.session_version, u.failed_login_count, u.locked_until, m.tenant_id, m.role
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT tenant_id, role
    FROM public.memberships
    WHERE user_id = u.id
    ORDER BY CASE role WHEN 'OWNER' THEN 1 WHEN 'ADMIN' THEN 2 WHEN 'MEMBER' THEN 3 ELSE 4 END, joined_at
    LIMIT 1
  ) m ON true
  WHERE u.email = lower(trim(p_email)) AND u.deleted_at IS NULL
  LIMIT 1
$function$;

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
  SELECT s.id, s.family_id, s.user_id, s.tenant_id, s.token_hash, s.expires_at, s.revoked_at,
         s.session_version, u.session_version, s.authenticated_at, u.status, m.role
  FROM public.refresh_sessions s
  JOIN public.users u ON u.id = s.user_id
  JOIN public.memberships m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id
  WHERE s.id = p_id
  LIMIT 1
$function$;

CREATE FUNCTION private.revoke_all_current_user_sessions(p_reason text, p_keep_session_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  affected integer;
  actor_id uuid := private.current_user_id();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'security context is required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason !~ '^[A-Z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'invalid session revocation reason' USING ERRCODE = '22023';
  END IF;

  UPDATE public.refresh_sessions
  SET revoked_at = now(), revoke_reason = p_reason
  WHERE user_id = actor_id
    AND revoked_at IS NULL
    AND (p_keep_session_id IS NULL OR id <> p_keep_session_id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END
$function$;

CREATE FUNCTION private.revoke_current_user_session(p_session_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  affected integer;
  actor_id uuid := private.current_user_id();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'security context is required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason !~ '^[A-Z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'invalid session revocation reason' USING ERRCODE = '22023';
  END IF;

  UPDATE public.refresh_sessions
  SET revoked_at = now(), revoke_reason = p_reason
  WHERE id = p_session_id AND user_id = actor_id AND revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END
$function$;

CREATE FUNCTION private.list_current_user_sessions()
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  created_at timestamptz,
  last_used_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT s.id, s.tenant_id, s.created_at, s.last_used_at, s.expires_at
  FROM public.refresh_sessions s
  WHERE s.user_id = private.current_user_id() AND s.revoked_at IS NULL
  ORDER BY s.created_at DESC
$function$;

REVOKE ALL ON FUNCTION private.lookup_user_for_auth(text), private.lookup_refresh_session(uuid),
  private.revoke_all_current_user_sessions(text, uuid), private.revoke_current_user_session(uuid, text),
  private.list_current_user_sessions() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.lookup_user_for_auth(text), private.lookup_refresh_session(uuid),
  private.revoke_all_current_user_sessions(text, uuid), private.revoke_current_user_session(uuid, text),
  private.list_current_user_sessions() TO yahro_app;
