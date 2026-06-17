-- ────────────────────────────────────────────────────────────────────
-- Smart Presence: auto clock-out for inactive agents
-- ────────────────────────────────────────────────────────────────────
--
-- Adds heartbeat + auto-close columns and the supporting indexes for
-- the hot read paths (auto-logout worker, GET /api/presence/me).
--
-- Idempotent — re-running this on a branch where `db:push` already
-- created the columns is safe (`IF NOT EXISTS` everywhere).
--
-- DEPLOY ORDER:
--   1. Apply this migration (zero-downtime — pure ADD COLUMN + CREATE INDEX)
--   2. Deploy server build that uses the columns
--   3. (Vercel) verify the `attendance-auto-logout` cron is firing every minute
-- ────────────────────────────────────────────────────────────────────

-- Per-user activity heartbeat. NULL until first authenticated request.
-- Bumped by client-side mouse/key events via POST /api/presence/heartbeat,
-- throttled to one write per 30s per user at the storage layer.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP;

-- Audit trail for auto-closures. Set in pairs:
--   auto_closed_at + auto_close_reason  → worker closed the shift
--   reactivated_at + reactivated_by     → admin override later
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS auto_closed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS auto_close_reason TEXT,
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reactivated_by VARCHAR
    REFERENCES users(id) ON DELETE SET NULL;

-- Worker hot path: finds open shifts in today's IST date with no
-- recent activity. Partial index keeps it tiny — only rows where the
-- shift is currently open are candidates.
CREATE INDEX IF NOT EXISTS idx_attendance_open_today
  ON attendance(date, auto_closed_at)
  WHERE clock_out_time IS NULL;

-- Read path for /api/presence/me and the team-directory live status
-- derivation. Skips the NULL rows (users who've never been authed)
-- which can be a large fraction on fresh deployments.
CREATE INDEX IF NOT EXISTS idx_users_last_active_at
  ON users(last_active_at)
  WHERE last_active_at IS NOT NULL;
