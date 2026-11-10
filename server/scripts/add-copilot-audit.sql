-- Ops Copilot audit table (see shared/schema.ts → copilotAudit).
--
-- Run ONCE in the Neon SQL Editor before (or right after) deploying the
-- copilot. Idempotent — safe to re-run. The app degrades gracefully if the
-- table is missing (no audit rows, no daily cap), so order is not critical.

CREATE TABLE IF NOT EXISTS copilot_audit (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       varchar REFERENCES users(id) ON DELETE SET NULL,
  store_id      varchar REFERENCES stores(id) ON DELETE SET NULL,
  kind          text    NOT NULL,
  tool_name     text,
  input         jsonb,
  ok            boolean NOT NULL DEFAULT true,
  error         text,
  input_tokens  integer,
  output_tokens integer,
  duration_ms   integer,
  created_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copilot_audit_user_created_idx
  ON copilot_audit (user_id, created_at);
