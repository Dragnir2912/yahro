ALTER TABLE public.users RENAME COLUMN display_name TO nickname;

ALTER TABLE public.users
  ADD COLUMN first_name varchar(80),
  ADD COLUMN last_name varchar(80),
  ADD COLUMN country_code char(2),
  ADD COLUMN terms_accepted_at timestamptz,
  ADD COLUMN privacy_accepted_at timestamptz,
  ADD COLUMN terms_version varchar(32),
  ADD COLUMN privacy_version varchar(32),
  ADD COLUMN onboarding_completed_at timestamptz,
  ADD CONSTRAINT users_country_code_format CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

UPDATE public.users
SET first_name = nickname,
    last_name = nickname,
    country_code = CASE
      WHEN timezone = 'Africa/Abidjan' THEN 'CI'
      WHEN timezone = 'Europe/Paris' THEN 'FR'
      ELSE NULL
    END
WHERE first_name IS NULL OR last_name IS NULL;

ALTER TABLE public.users
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL;

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
  tenant_id uuid,
  role public.membership_role
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT u.id, u.email, u.password_hash, u.nickname, u.status, u.email_verified_at, u.session_version, m.tenant_id, m.role
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT tenant_id, role FROM public.memberships
    WHERE user_id = u.id
    ORDER BY CASE role WHEN 'OWNER' THEN 1 WHEN 'ADMIN' THEN 2 WHEN 'MEMBER' THEN 3 ELSE 4 END, joined_at
    LIMIT 1
  ) m ON true
  WHERE u.email = lower(trim(p_email)) AND u.deleted_at IS NULL
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION private.lookup_user_for_auth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lookup_user_for_auth(text) TO yahro_app;
