-- ─────────────────────────────────────────────────────────────────────
-- Payroll cycles migration.
--
-- Adds:
--   1. payroll_cycles table (one row per store/year/month) — parent of
--      the per-employee ledger rows for that month
--   2. payroll_ledger.cycle_id  — nullable FK back to the parent
--   3. payroll_ledger.unpaid_leaves — int, pro-rata deducted from base
--   4. payroll_ledger.line_items   — JSONB [{label, amount}] for custom
--      Fixed-Pay components (reimbursement, bonus, etc.)
--
-- Idempotent: every ADD is guarded by NOT EXISTS. Safe to re-run.
-- Run in Neon SQL Editor before deploying the new /payroll page.
-- ─────────────────────────────────────────────────────────────────────

-- 1. payroll_cycles table
CREATE TABLE IF NOT EXISTS payroll_cycles (
  id              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        varchar NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  year            integer NOT NULL,
  month           integer NOT NULL,
  status          text    NOT NULL DEFAULT 'pending',
  employee_count  integer NOT NULL DEFAULT 0,
  total_payout    numeric(14, 2) NOT NULL DEFAULT 0,
  generated_at    timestamp NOT NULL DEFAULT now(),
  generated_by    varchar REFERENCES users(id) ON DELETE SET NULL,
  approved_at     timestamp,
  approved_by     varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_cycles_store_year_month_idx
  ON payroll_cycles (store_id, year, month);

-- 2-4. payroll_ledger extensions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_ledger' AND column_name = 'cycle_id'
  ) THEN
    ALTER TABLE payroll_ledger
      ADD COLUMN cycle_id varchar REFERENCES payroll_cycles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_ledger' AND column_name = 'unpaid_leaves'
  ) THEN
    ALTER TABLE payroll_ledger
      ADD COLUMN unpaid_leaves integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_ledger' AND column_name = 'line_items'
  ) THEN
    ALTER TABLE payroll_ledger
      ADD COLUMN line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Verify.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('payroll_cycles', 'payroll_ledger')
  AND column_name IN ('id', 'status', 'cycle_id', 'unpaid_leaves', 'line_items', 'employee_count', 'total_payout')
ORDER BY table_name, column_name;
