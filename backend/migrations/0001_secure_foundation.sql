CREATE EXTENSION IF NOT EXISTS pgcrypto;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION yahro_owner;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TYPE public.user_status AS ENUM ('PENDING', 'ACTIVE', 'LOCKED', 'DELETED');
CREATE TYPE public.membership_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE public.account_type AS ENUM ('CHECKING', 'SAVINGS', 'CASH', 'MOBILE_MONEY', 'CREDIT_CARD', 'INVESTMENT', 'DEBT', 'OTHER');
CREATE TYPE public.category_type AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE public.transaction_type AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
CREATE TYPE public.import_status AS ENUM ('PREVIEW', 'COMMITTED', 'FAILED', 'REVERTED');
CREATE TYPE public.notification_type AS ENUM ('BUDGET_WARNING', 'BUDGET_EXCEEDED', 'LOW_BALANCE', 'UNUSUAL_TRANSACTION', 'GOAL_REACHED', 'SECURITY', 'SYSTEM');

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  password_hash text NOT NULL,
  display_name varchar(120) NOT NULL,
  status public.user_status NOT NULL DEFAULT 'PENDING',
  email_verified_at timestamptz,
  locale varchar(10) NOT NULL DEFAULT 'fr',
  timezone varchar(64) NOT NULL DEFAULT 'Africa/Abidjan',
  default_currency varchar(3) NOT NULL DEFAULT 'XOF',
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  last_login_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(trim(email)))
);
CREATE UNIQUE INDEX users_email_lower_unique ON public.users (lower(email));
CREATE INDEX users_status_idx ON public.users (status);

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE,
  base_currency varchar(3) NOT NULL DEFAULT 'XOF',
  locale varchar(10) NOT NULL DEFAULT 'fr',
  timezone varchar(64) NOT NULL DEFAULT 'Africa/Abidjan',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.memberships (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.membership_role NOT NULL DEFAULT 'MEMBER',
  invited_by_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_pk PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX memberships_user_idx ON public.memberships (user_id);

CREATE TABLE public.refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash varchar(128) NOT NULL UNIQUE,
  user_agent_hash varchar(128),
  ip_hash varchar(128),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason varchar(80),
  replaced_by_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_sessions_membership_fk FOREIGN KEY (tenant_id, user_id) REFERENCES public.memberships(tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX refresh_sessions_user_idx ON public.refresh_sessions (user_id);
CREATE INDEX refresh_sessions_family_idx ON public.refresh_sessions (family_id);

CREATE TABLE public.one_time_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose varchar(40) NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD', 'CHANGE_EMAIL')),
  token_hash varchar(128) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX one_time_tokens_user_idx ON public.one_time_tokens (user_id);

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  type public.account_type NOT NULL,
  currency varchar(3) NOT NULL,
  opening_balance numeric(19,4) NOT NULL DEFAULT 0,
  opening_balance_date timestamptz NOT NULL,
  color varchar(16),
  icon varchar(40),
  include_in_net_worth boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX accounts_tenant_idx ON public.accounts (tenant_id);
CREATE INDEX accounts_tenant_archived_idx ON public.accounts (tenant_id, archived_at);
CREATE UNIQUE INDEX accounts_tenant_id_unique ON public.accounts (tenant_id, id);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name varchar(80) NOT NULL,
  type public.category_type NOT NULL,
  color varchar(16),
  icon varchar(40),
  is_system boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_tenant_id_unique ON public.categories (tenant_id, id);
CREATE UNIQUE INDEX categories_tenant_name_type_unique ON public.categories (tenant_id, lower(name), type) WHERE archived_at IS NULL;
CREATE INDEX categories_tenant_idx ON public.categories (tenant_id);
ALTER TABLE public.categories ADD CONSTRAINT categories_tenant_parent_fk FOREIGN KEY (tenant_id, parent_id) REFERENCES public.categories(tenant_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  created_by_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status public.import_status NOT NULL DEFAULT 'PREVIEW',
  original_filename varchar(255) NOT NULL,
  file_hash varchar(128) NOT NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  accepted_count integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_jobs_tenant_account_fk FOREIGN KEY (tenant_id, account_id) REFERENCES public.accounts(tenant_id, id),
  CONSTRAINT import_jobs_creator_membership_fk FOREIGN KEY (tenant_id, created_by_id) REFERENCES public.memberships(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX import_jobs_tenant_hash_unique ON public.import_jobs (tenant_id, file_hash);
CREATE UNIQUE INDEX import_jobs_tenant_id_unique ON public.import_jobs (tenant_id, id);
CREATE INDEX import_jobs_tenant_idx ON public.import_jobs (tenant_id);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_by_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  type public.transaction_type NOT NULL,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL,
  transaction_date timestamptz NOT NULL,
  merchant varchar(160),
  description varchar(240) NOT NULL,
  notes text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  transfer_group_id uuid,
  import_job_id uuid,
  import_fingerprint varchar(128),
  is_verified boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transactions_tags_array CHECK (jsonb_typeof(tags) = 'array'),
  CONSTRAINT transactions_tenant_account_fk FOREIGN KEY (tenant_id, account_id) REFERENCES public.accounts(tenant_id, id),
  CONSTRAINT transactions_tenant_category_fk FOREIGN KEY (tenant_id, category_id) REFERENCES public.categories(tenant_id, id),
  CONSTRAINT transactions_tenant_import_job_fk FOREIGN KEY (tenant_id, import_job_id) REFERENCES public.import_jobs(tenant_id, id) ON DELETE SET NULL (import_job_id),
  CONSTRAINT transactions_creator_membership_fk FOREIGN KEY (tenant_id, created_by_id) REFERENCES public.memberships(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX transactions_tenant_date_idx ON public.transactions (tenant_id, transaction_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX transactions_account_date_idx ON public.transactions (account_id, transaction_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX transactions_category_date_idx ON public.transactions (category_id, transaction_date DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX transactions_import_fingerprint_unique ON public.transactions (tenant_id, import_fingerprint) WHERE import_fingerprint IS NOT NULL;

CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount numeric(19,4) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL,
  warning_threshold integer NOT NULL DEFAULT 80 CHECK (warning_threshold BETWEEN 1 AND 100),
  rollover_enabled boolean NOT NULL DEFAULT false,
  notes text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budgets_period_valid CHECK (period_end > period_start),
  CONSTRAINT budgets_tenant_category_fk FOREIGN KEY (tenant_id, category_id) REFERENCES public.categories(tenant_id, id)
);
CREATE UNIQUE INDEX budgets_tenant_category_period_unique ON public.budgets (tenant_id, category_id, period_start);
CREATE INDEX budgets_tenant_period_idx ON public.budgets (tenant_id, period_start);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title_key varchar(100) NOT NULL,
  body_key varchar(100) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_membership_fk FOREIGN KEY (tenant_id, user_id) REFERENCES public.memberships(tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_tenant_idx ON public.notifications (tenant_id);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action varchar(100) NOT NULL,
  entity_type varchar(80),
  entity_id uuid,
  request_id varchar(40) NOT NULL,
  ip_hash varchar(128),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_created_idx ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs (actor_user_id);

CREATE OR REPLACE FUNCTION private.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$function$;

CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER tenants_touch_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER accounts_touch_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER categories_touch_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER transactions_touch_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER budgets_touch_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

CREATE OR REPLACE FUNCTION private.prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION 'audit logs are immutable';
END
$function$;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_mutation();

CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog AS $function$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION private.current_user_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog AS $function$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION private.current_membership_role(p_tenant_id uuid)
RETURNS public.membership_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT role
  FROM public.memberships
  WHERE tenant_id = p_tenant_id AND user_id = private.current_user_id()
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION private.tenant_has_no_members(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT NOT EXISTS (SELECT 1 FROM public.memberships WHERE tenant_id = p_tenant_id)
$function$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_self ON public.users USING (id = private.current_user_id()) WITH CHECK (id = private.current_user_id());

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON public.tenants FOR SELECT
  USING (id = private.current_tenant_id() AND private.current_membership_role(id) IS NOT NULL);
CREATE POLICY tenants_insert ON public.tenants FOR INSERT
  WITH CHECK (id = private.current_tenant_id());
CREATE POLICY tenants_update ON public.tenants FOR UPDATE
  USING (id = private.current_tenant_id() AND private.current_membership_role(id) IN ('OWNER', 'ADMIN'))
  WITH CHECK (id = private.current_tenant_id());
CREATE POLICY tenants_delete ON public.tenants FOR DELETE
  USING (id = private.current_tenant_id() AND private.current_membership_role(id) = 'OWNER');

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_select ON public.memberships FOR SELECT
  USING (tenant_id = private.current_tenant_id() AND private.current_membership_role(tenant_id) IS NOT NULL);
CREATE POLICY memberships_insert ON public.memberships FOR INSERT
  WITH CHECK (
    tenant_id = private.current_tenant_id()
    AND (
      private.current_membership_role(tenant_id) IN ('OWNER', 'ADMIN')
      OR (
        user_id = private.current_user_id()
        AND role = 'OWNER'
        AND private.tenant_has_no_members(tenant_id)
      )
    )
  );
CREATE POLICY memberships_update ON public.memberships FOR UPDATE
  USING (tenant_id = private.current_tenant_id() AND private.current_membership_role(tenant_id) IN ('OWNER', 'ADMIN'))
  WITH CHECK (tenant_id = private.current_tenant_id() AND private.current_membership_role(tenant_id) IN ('OWNER', 'ADMIN'));
CREATE POLICY memberships_delete ON public.memberships FOR DELETE
  USING (tenant_id = private.current_tenant_id() AND private.current_membership_role(tenant_id) IN ('OWNER', 'ADMIN'));

ALTER TABLE public.refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_sessions_scope ON public.refresh_sessions
  USING (tenant_id = private.current_tenant_id() AND user_id = private.current_user_id() AND private.current_membership_role(tenant_id) IS NOT NULL)
  WITH CHECK (tenant_id = private.current_tenant_id() AND user_id = private.current_user_id() AND private.current_membership_role(tenant_id) IS NOT NULL);

ALTER TABLE public.one_time_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_time_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY one_time_tokens_scope ON public.one_time_tokens USING (user_id = private.current_user_id()) WITH CHECK (user_id = private.current_user_id());

DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['accounts', 'categories', 'transactions', 'budgets', 'import_jobs', 'notifications', 'audit_logs']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I USING (tenant_id = private.current_tenant_id() AND private.current_membership_role(tenant_id) IS NOT NULL) WITH CHECK (tenant_id = private.current_tenant_id() AND private.current_membership_role(tenant_id) IS NOT NULL)',
      table_name || '_scope',
      table_name
    );
  END LOOP;
END
$policies$;

CREATE OR REPLACE FUNCTION private.lookup_user_for_auth(p_email text)
RETURNS TABLE (
  id uuid,
  email varchar,
  password_hash text,
  display_name varchar,
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
  SELECT u.id, u.email, u.password_hash, u.display_name, u.status, u.email_verified_at, u.session_version, m.tenant_id, m.role
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

CREATE OR REPLACE FUNCTION private.lookup_refresh_session(p_id uuid)
RETURNS TABLE (
  id uuid,
  family_id uuid,
  user_id uuid,
  tenant_id uuid,
  token_hash varchar,
  expires_at timestamptz,
  revoked_at timestamptz,
  session_version integer,
  status public.user_status,
  role public.membership_role
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT s.id, s.family_id, s.user_id, s.tenant_id, s.token_hash, s.expires_at, s.revoked_at, u.session_version, u.status, m.role
  FROM public.refresh_sessions s
  JOIN public.users u ON u.id = s.user_id
  JOIN public.memberships m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id
  WHERE s.id = p_id
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION private.lookup_one_time_token(p_hash text, p_purpose text)
RETURNS TABLE (id uuid, user_id uuid, tenant_id uuid, expires_at timestamptz, consumed_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT t.id, t.user_id, m.tenant_id, t.expires_at, t.consumed_at
  FROM public.one_time_tokens t
  LEFT JOIN LATERAL (
    SELECT tenant_id FROM public.memberships WHERE user_id = t.user_id ORDER BY joined_at LIMIT 1
  ) m ON true
  WHERE t.token_hash = p_hash AND t.purpose = p_purpose
  LIMIT 1
$function$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA public, private TO yahro_app;
GRANT SELECT, INSERT, UPDATE ON public.users, public.tenants, public.memberships, public.refresh_sessions, public.one_time_tokens, public.accounts, public.categories, public.transactions, public.budgets, public.import_jobs, public.notifications TO yahro_app;
GRANT DELETE ON public.memberships, public.refresh_sessions, public.one_time_tokens, public.notifications TO yahro_app;
GRANT DELETE ON public.budgets TO yahro_app;
GRANT SELECT, INSERT ON public.audit_logs TO yahro_app;
GRANT EXECUTE ON FUNCTION private.current_tenant_id(), private.current_user_id(), private.current_membership_role(uuid), private.tenant_has_no_members(uuid), private.lookup_user_for_auth(text), private.lookup_refresh_session(uuid), private.lookup_one_time_token(text, text) TO yahro_app;

ALTER DEFAULT PRIVILEGES FOR ROLE yahro_owner IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE yahro_owner IN SCHEMA private REVOKE ALL ON FUNCTIONS FROM PUBLIC;
