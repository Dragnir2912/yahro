CREATE TYPE public.project_kind AS ENUM ('PROJECT', 'ACTIVITY');
CREATE TYPE public.project_status AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE public.payment_method AS ENUM ('CASH', 'BANK_TRANSFER', 'BANK_CARD', 'MOBILE_MONEY', 'DIGITAL_WALLET', 'DIRECT_DEBIT', 'CHECK', 'OTHER');
CREATE TYPE public.budget_frequency AS ENUM ('ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

ALTER TABLE public.transactions ADD COLUMN payment_method public.payment_method NOT NULL DEFAULT 'BANK_TRANSFER';
UPDATE public.transactions AS tx
SET payment_method = 'CASH'
FROM public.accounts AS account
WHERE tx.account_id = account.id AND account.type = 'CASH';

ALTER TABLE public.budgets ADD COLUMN frequency public.budget_frequency NOT NULL DEFAULT 'MONTHLY';

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind public.project_kind NOT NULL,
  name varchar(120) NOT NULL,
  description text,
  status public.project_status NOT NULL DEFAULT 'PLANNED',
  total_budget numeric(19, 4) NOT NULL,
  currency varchar(3) NOT NULL,
  budget_frequency public.budget_frequency NOT NULL DEFAULT 'ONE_TIME',
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  warning_threshold integer NOT NULL DEFAULT 80,
  color varchar(16) NOT NULL DEFAULT '#769450',
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_owner_membership_fk FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES public.memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT projects_budget_positive CHECK (total_budget > 0),
  CONSTRAINT projects_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT projects_warning_threshold CHECK (warning_threshold BETWEEN 1 AND 100),
  CONSTRAINT projects_date_order CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT projects_color_format CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT projects_tenant_id_owner_unique UNIQUE (tenant_id, id, owner_user_id)
);
CREATE INDEX projects_owner_status_idx ON public.projects (owner_user_id, status);
CREATE INDEX projects_tenant_archived_idx ON public.projects (tenant_id, archived_at);

CREATE TABLE public.project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  description varchar(160) NOT NULL,
  amount numeric(19, 4) NOT NULL,
  payment_method public.payment_method NOT NULL DEFAULT 'BANK_TRANSFER',
  spent_at timestamptz NOT NULL,
  notes text,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_expenses_project_owner_fk FOREIGN KEY (tenant_id, project_id, owner_user_id)
    REFERENCES public.projects(tenant_id, id, owner_user_id) ON DELETE CASCADE,
  CONSTRAINT project_expenses_amount_positive CHECK (amount > 0)
);
CREATE INDEX project_expenses_project_date_idx ON public.project_expenses (project_id, spent_at DESC);
CREATE INDEX project_expenses_owner_idx ON public.project_expenses (owner_user_id);

CREATE TABLE public.official_exchange_rates (
  base_currency varchar(3) NOT NULL,
  quote_currency varchar(3) NOT NULL,
  rate numeric(24, 10) NOT NULL,
  rate_date timestamptz NOT NULL,
  source varchar(40) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT official_exchange_rates_pk PRIMARY KEY (base_currency, quote_currency, rate_date, source),
  CONSTRAINT official_exchange_rates_currency_format CHECK (base_currency ~ '^[A-Z]{3}$' AND quote_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT official_exchange_rates_rate_positive CHECK (rate > 0)
);
CREATE INDEX official_exchange_rates_latest_idx ON public.official_exchange_rates (quote_currency, rate_date DESC);

CREATE TABLE public.custom_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  base_currency varchar(3) NOT NULL,
  quote_currency varchar(3) NOT NULL,
  rate numeric(24, 10) NOT NULL,
  label varchar(120),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_exchange_rates_owner_membership_fk FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES public.memberships(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT custom_exchange_rates_currency_format CHECK (base_currency ~ '^[A-Z]{3}$' AND quote_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT custom_exchange_rates_distinct_pair CHECK (base_currency <> quote_currency),
  CONSTRAINT custom_exchange_rates_rate_positive CHECK (rate > 0),
  CONSTRAINT custom_exchange_rates_validity CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX custom_exchange_rates_owner_pair_idx ON public.custom_exchange_rates (owner_user_id, base_currency, quote_currency);
CREATE INDEX custom_exchange_rates_tenant_idx ON public.custom_exchange_rates (tenant_id);
CREATE UNIQUE INDEX custom_exchange_rates_one_active_pair ON public.custom_exchange_rates (owner_user_id, base_currency, quote_currency)
  WHERE active AND archived_at IS NULL;

CREATE FUNCTION private.project_budget_period_start(
  p_frequency public.budget_frequency,
  p_project_start timestamptz,
  p_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  period_start timestamptz := p_project_start;
  step interval;
BEGIN
  IF p_frequency = 'ONE_TIME' OR p_at <= p_project_start THEN
    RETURN p_project_start;
  END IF;

  step := CASE p_frequency
    WHEN 'WEEKLY' THEN interval '7 days'
    WHEN 'BIWEEKLY' THEN interval '14 days'
    WHEN 'MONTHLY' THEN interval '1 month'
    WHEN 'QUARTERLY' THEN interval '3 months'
    WHEN 'SEMIANNUAL' THEN interval '6 months'
    WHEN 'ANNUAL' THEN interval '1 year'
    ELSE interval '100 years'
  END;

  WHILE period_start + step <= p_at LOOP
    period_start := period_start + step;
  END LOOP;
  RETURN period_start;
END
$function$;

CREATE FUNCTION private.project_budget_period_end(
  p_frequency public.budget_frequency,
  p_project_start timestamptz,
  p_project_end timestamptz,
  p_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, private
AS $function$
DECLARE
  period_start timestamptz;
  calculated_end timestamptz;
BEGIN
  IF p_frequency = 'ONE_TIME' THEN
    RETURN COALESCE(p_project_end, 'infinity'::timestamptz);
  END IF;

  period_start := private.project_budget_period_start(p_frequency, p_project_start, p_at);
  calculated_end := period_start + CASE p_frequency
    WHEN 'WEEKLY' THEN interval '7 days'
    WHEN 'BIWEEKLY' THEN interval '14 days'
    WHEN 'MONTHLY' THEN interval '1 month'
    WHEN 'QUARTERLY' THEN interval '3 months'
    WHEN 'SEMIANNUAL' THEN interval '6 months'
    WHEN 'ANNUAL' THEN interval '1 year'
    ELSE interval '100 years'
  END;
  RETURN CASE WHEN p_project_end IS NULL THEN calculated_end ELSE LEAST(calculated_end, p_project_end) END;
END
$function$;

CREATE TRIGGER projects_touch_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER project_expenses_touch_updated_at BEFORE UPDATE ON public.project_expenses
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER custom_exchange_rates_touch_updated_at BEFORE UPDATE ON public.custom_exchange_rates
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_private_scope ON public.projects
  USING (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  );

ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY project_expenses_private_scope ON public.project_expenses
  USING (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  );

ALTER TABLE public.custom_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_exchange_rates FORCE ROW LEVEL SECURITY;
CREATE POLICY custom_exchange_rates_private_scope ON public.custom_exchange_rates
  USING (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    tenant_id = private.current_tenant_id()
    AND owner_user_id = private.current_user_id()
    AND private.current_membership_role(tenant_id) IS NOT NULL
  );

REVOKE ALL ON public.projects, public.project_expenses, public.official_exchange_rates, public.custom_exchange_rates FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.projects, public.project_expenses, public.custom_exchange_rates TO yahro_app;
GRANT SELECT, INSERT, UPDATE ON public.official_exchange_rates TO yahro_app;
GRANT EXECUTE ON FUNCTION private.project_budget_period_start(public.budget_frequency, timestamptz, timestamptz) TO yahro_app;
GRANT EXECUTE ON FUNCTION private.project_budget_period_end(public.budget_frequency, timestamptz, timestamptz, timestamptz) TO yahro_app;
