-- ────────────────────────────────────────────────────────────────────
-- Smart Presence: per-user monitoring exemption
-- ────────────────────────────────────────────────────────────────────
--
-- Adds a flag admins can toggle from the Team page to exclude a specific
-- user from auto clock-out (and the idle banner), regardless of role.
--
-- Idempotent (IF NOT EXISTS) and zero-downtime (pure ADD COLUMN with a
-- safe default). Existing rows default to FALSE = monitored, so behavior
-- is unchanged until an admin flips someone off.
--
-- DEPLOY ORDER:
--   1. Apply this migration
--   2. Deploy the server build that reads/writes monitoring_exempt
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monitoring_exempt BOOLEAN NOT NULL DEFAULT FALSE;
