-- ────────────────────────────────────────────────────────────────────
-- RazorpayX Payroll: per-user payroll email mapping
-- ────────────────────────────────────────────────────────────────────
--
-- Most agents are registered in RazorpayX under a personal email that
-- differs from their OrderFlow work email. This column stores that
-- RazorpayX email per user so the payroll sync resolves the right
-- employee. NULL = fall back to the work email.
--
-- Idempotent + additive (nullable). Safe on prod.
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payroll_email TEXT;
