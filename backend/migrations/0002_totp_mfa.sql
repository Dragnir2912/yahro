ALTER TABLE public.users
  ADD COLUMN mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN totp_secret_encrypted text,
  ADD COLUMN totp_last_used_step bigint,
  ADD COLUMN mfa_enabled_at timestamptz,
  ADD CONSTRAINT users_mfa_secret_required CHECK (NOT mfa_enabled OR totp_secret_encrypted IS NOT NULL);

CREATE TABLE public.mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_challenges_membership_fk FOREIGN KEY (tenant_id, user_id) REFERENCES public.memberships(tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX mfa_challenges_user_created_idx ON public.mfa_challenges (user_id, created_at DESC);

CREATE TABLE public.mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash varchar(128) NOT NULL UNIQUE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_codes_user_idx ON public.mfa_recovery_codes (user_id) WHERE used_at IS NULL;

ALTER TABLE public.mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY mfa_challenges_self ON public.mfa_challenges
  USING (
    user_id = private.current_user_id()
    AND tenant_id = private.current_tenant_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    user_id = private.current_user_id()
    AND tenant_id = private.current_tenant_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  );

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_recovery_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY mfa_recovery_codes_self ON public.mfa_recovery_codes
  USING (user_id = private.current_user_id())
  WITH CHECK (user_id = private.current_user_id());

CREATE OR REPLACE FUNCTION private.lookup_mfa_challenge(p_hash text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  tenant_id uuid,
  attempts integer,
  expires_at timestamptz,
  consumed_at timestamptz,
  totp_secret_encrypted text,
  totp_last_used_step bigint,
  session_version integer,
  role public.membership_role
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT c.id, c.user_id, c.tenant_id, c.attempts, c.expires_at, c.consumed_at,
         u.totp_secret_encrypted, u.totp_last_used_step, u.session_version, m.role
  FROM public.mfa_challenges c
  JOIN public.users u ON u.id = c.user_id AND u.status = 'ACTIVE' AND u.mfa_enabled
  JOIN public.memberships m ON m.user_id = c.user_id AND m.tenant_id = c.tenant_id
  WHERE c.token_hash = p_hash
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION private.user_mfa_enabled(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT coalesce((SELECT mfa_enabled FROM public.users WHERE id = p_user_id AND status = 'ACTIVE'), false)
$function$;

REVOKE ALL ON public.mfa_challenges, public.mfa_recovery_codes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mfa_challenges, public.mfa_recovery_codes TO yahro_app;
REVOKE ALL ON FUNCTION private.lookup_mfa_challenge(text), private.user_mfa_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lookup_mfa_challenge(text), private.user_mfa_enabled(uuid) TO yahro_app;
