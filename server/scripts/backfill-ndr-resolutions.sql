-- ─────────────────────────────────────────────────────────────────────
-- Backfill NDR resolutions from order status.
--
-- Run ONCE against production before turning on the NDR Delivery Rate
-- payroll metric. Every unresolved ndr_events row whose parent order
-- has already reached a terminal state gets closed with the correct
-- resolution — so the metric can look at historical months, not just
-- events created after the webhook fix landed.
--
-- Idempotent: WHERE resolved = false means a re-run is a no-op.
--
-- Expected impact: most historical ndr_events should close on the
-- first pass. The DRY-RUN preview below tells you how many rows will
-- be touched before you commit.
-- ─────────────────────────────────────────────────────────────────────

-- STEP 1 — DRY RUN. See what would change before running the UPDATE.
-- Paste this first, eyeball the counts, then move on to STEP 2.
SELECT
  o.status                                       AS order_status,
  COUNT(*)                                       AS ndr_events_to_close,
  COUNT(*) FILTER (WHERE s.delivered_at IS NULL) AS missing_delivered_at
FROM ndr_events e
JOIN orders o     ON o.id = e.order_id
LEFT JOIN shipments s ON s.order_id = o.id
WHERE e.resolved = false
  AND o.status IN (
    'delivered', 'rto_delivered', 'rto_initiated', 'rto_ofd', 'cancelled'
  )
GROUP BY o.status
ORDER BY o.status;


-- STEP 2 — THE ACTUAL UPDATE. Only run this after eyeballing STEP 1.
-- Wrap in a transaction so you can ROLLBACK if the numbers look wrong.
BEGIN;

UPDATE ndr_events e
SET
  resolved    = true,
  resolved_at = COALESCE(s.delivered_at, now()),
  resolution  = CASE
    WHEN o.status IN ('delivered', 'rto_delivered')     THEN 'delivered'
    WHEN o.status IN ('rto_initiated', 'rto_ofd')       THEN 'returned'
    WHEN o.status = 'cancelled'                         THEN 'cancelled'
  END,
  updated_at  = now()
FROM orders o
LEFT JOIN shipments s ON s.order_id = o.id
WHERE e.order_id     = o.id
  AND e.resolved     = false
  AND o.status IN (
    'delivered', 'rto_delivered', 'rto_initiated', 'rto_ofd', 'cancelled'
  );

-- Post-update summary — should match STEP 1's counts.
SELECT
  resolution,
  COUNT(*)                                                    AS rows_closed,
  MIN(resolved_at)                                            AS oldest_close,
  MAX(resolved_at)                                            AS newest_close
FROM ndr_events
WHERE resolved = true
  AND updated_at > now() - interval '1 minute'
GROUP BY resolution
ORDER BY resolution;

-- If the numbers look right:
--   COMMIT;
-- If they don't:
--   ROLLBACK;
