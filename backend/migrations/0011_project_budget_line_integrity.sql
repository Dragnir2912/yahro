ALTER TABLE public.project_budget_lines
  ADD CONSTRAINT project_budget_lines_scope_id_unique
  UNIQUE (tenant_id, project_id, owner_user_id, id);

ALTER TABLE public.project_expenses
  DROP CONSTRAINT project_expenses_budget_line_id_fkey,
  ADD CONSTRAINT project_expenses_budget_line_scope_fk
    FOREIGN KEY (tenant_id, project_id, owner_user_id, budget_line_id)
    REFERENCES public.project_budget_lines(tenant_id, project_id, owner_user_id, id)
    ON DELETE CASCADE;
