-- ─────────────────────────────────────────────────────────────────────
-- Add `reimbursement` column to payroll_ledger.
--
-- Default = 0 (safe — existing rows get 0 reimbursement, no historical
-- payout numbers change). The Compensation payroll UI defaults new
-- payslips to ₹349 for eligible employees; the admin can edit per row.
--
-- Run ONCE in Neon SQL Editor before deploying the compensation UI.
-- Idempotent: NOT EXISTS guard means a re-run is a no-op.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_ledger' AND column_name = 'reimbursement'
  ) THEN
    ALTER TABLE payroll_ledger
      ADD COLUMN reimbursement numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Verify.
SELECT column_name, data_type, numeric_precision, numeric_scale, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'payroll_ledger' AND column_name = 'reimbursement';
