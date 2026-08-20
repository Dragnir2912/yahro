CREATE TABLE public.project_budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  planned_amount numeric(19, 4) NOT NULL,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_budget_lines_project_owner_fk FOREIGN KEY (tenant_id, project_id, owner_user_id)
    REFERENCES public.projects(tenant_id, id, owner_user_id) ON DELETE CASCADE,
  CONSTRAINT project_budget_lines_amount_positive CHECK (planned_amount > 0),
  CONSTRAINT project_budget_lines_sort_nonnegative CHECK (sort_order >= 0)
);

CREATE INDEX project_budget_lines_project_sort_idx
  ON public.project_budget_lines (project_id, sort_order, created_at);
CREATE INDEX project_budget_lines_tenant_active_idx
  ON public.project_budget_lines (tenant_id, archived_at);

ALTER TABLE public.project_expenses
  ADD COLUMN budget_line_id uuid REFERENCES public.project_budget_lines(id) ON DELETE SET NULL;

CREATE INDEX project_expenses_budget_line_idx
  ON public.project_expenses (budget_line_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER project_budget_lines_touch_updated_at BEFORE UPDATE ON public.project_budget_lines
  FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.project_budget_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_budget_lines_private_scope ON public.project_budget_lines
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

REVOKE ALL ON public.project_budget_lines FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.project_budget_lines TO yahro_app;
