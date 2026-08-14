-- Reshipments: cancellation support + status-model simplification.
-- Idempotent — safe to re-run.

-- Audit trail for cancellation (who/when), separate from created_by.
ALTER TABLE reshipment_logs ADD COLUMN IF NOT EXISTS cancelled_at timestamp;
ALTER TABLE reshipment_logs ADD COLUMN IF NOT EXISTS cancelled_by varchar
  REFERENCES users(id) ON DELETE SET NULL;

-- Denormalised creator name. The join to users still populates the live
-- value, but storing it means the audit record survives a user being
-- deleted or renamed — the PRD asks for created_by_user_name to be a
-- stored field, not only derived.
ALTER TABLE reshipment_logs ADD COLUMN IF NOT EXISTS created_by_name text;

UPDATE reshipment_logs r
SET created_by_name = u.full_name
FROM users u
WHERE r.created_by = u.id AND r.created_by_name IS NULL;

-- "Out for delivery" is no longer a user-facing reshipment status; the
-- product model tracks in_transit → delivered / ndr. Fold any existing
-- rows forward so no row holds a status the UI can't render.
UPDATE reshipment_logs
SET courier_status = 'in_transit'
WHERE courier_status = 'out_for_delivery';

-- The live-reshipment guard must also treat 'cancelled' as terminal, so
-- cancelling frees the original order for a fresh attempt. Recreate the
-- partial unique index without out_for_delivery.
DROP INDEX IF EXISTS reshipment_logs_live_original_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS reshipment_logs_live_original_uniq
  ON reshipment_logs (store_id, original_order_id)
  WHERE courier_status IN ('pending', 'in_transit', 'ndr');
