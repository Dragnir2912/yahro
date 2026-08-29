ALTER TABLE public.transactions
  DROP CONSTRAINT transactions_amount_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_amount_and_transfer_valid CHECK (
    (
      type IN ('INCOME', 'EXPENSE')
      AND amount > 0
      AND transfer_group_id IS NULL
    )
    OR
    (
      type = 'TRANSFER'
      AND amount <> 0
      AND transfer_group_id IS NOT NULL
      AND category_id IS NULL
      AND personal_detail_id IS NULL
    )
  );

CREATE UNIQUE INDEX transactions_active_transfer_account_unique
  ON public.transactions (tenant_id, transfer_group_id, account_id)
  WHERE type = 'TRANSFER' AND deleted_at IS NULL;

CREATE INDEX transactions_transfer_group_idx
  ON public.transactions (tenant_id, transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;
