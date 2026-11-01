-- ─────────────────────────────────────────────────────────────────────
-- Add `manager_bonus` column to payroll_ledger.
--
-- The DEVELOPER profile's store-TDR manager bonus is a VARIABLE /
-- incentive component. It was previously booked as a fixed-pay
-- line item (so it never counted in total_incentives). This column
-- stores it as a proper incentive output alongside confirmation /
-- team-delivery / recovery / reships bonuses.
--
-- Default = 0 (safe — existing rows get 0, no historical payout
-- numbers change; total_incentives on old rows is unaffected).
--
-- Run ONCE in the Neon SQL Editor BEFORE deploying the code that
-- reads/writes this column. Idempotent: the NOT EXISTS guard makes a
-- re-run a no-op.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_ledger' AND column_name = 'manager_bonus'
  ) THEN
    ALTER TABLE payroll_ledger
      ADD COLUMN manager_bonus numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Verify.
SELECT column_name, data_type, numeric_precision, numeric_scale, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'payroll_ledger' AND column_name = 'manager_bonus';
