-- ────────────────────────────────────────────────────────────────────
-- RazorpayX Payroll: sync audit log
-- ────────────────────────────────────────────────────────────────────
-- One row per sync run (preview or live) — history of what was pushed to
-- RazorpayX, when, by whom, and per-record outcomes. Additive, safe.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_sync_runs (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL,
  mode             TEXT    NOT NULL,
  attendance_days  INTEGER NOT NULL DEFAULT 0,
  leave_days       INTEGER NOT NULL DEFAULT 0,
  ok_count         INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  skipped_count    INTEGER NOT NULL DEFAULT 0,
  triggered_by     VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  details          JSONB,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_sync_runs_created ON payroll_sync_runs(created_at DESC);
