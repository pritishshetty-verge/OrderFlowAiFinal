import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

(async () => {
  // Existing status vocabulary in order_status_history (want the casing
  // convention — 'confirmed' lowercase? 'Confirmed' titlecase? etc.)
  const r: any = await db.execute(sql`
    SELECT status, COUNT(*)::int4 AS n
    FROM order_status_history
    GROUP BY status
    ORDER BY n DESC
    LIMIT 30
  `);
  console.log("── status vocabulary ──");
  console.log(((r as any).rows ?? r));

  // How many of the 9,312 backfilled orders already have ANY history row?
  const overlap: any = await db.execute(sql`
    SELECT COUNT(DISTINCT h.order_id)::int4 AS orders_with_any_history
    FROM order_status_history h
    JOIN orders o ON o.id = h.order_id
    WHERE o.confirmed_by IN (
      SELECT id FROM users WHERE email IN (
        'chandi@vergescales.com','tanisha@vergescales.com','shruti@vergescales.com'
      )
    )
  `);
  console.log("any-history overlap:", ((overlap as any).rows ?? overlap));

  // And specifically a confirmed/cancelled history row (would cause dupes).
  const dup: any = await db.execute(sql`
    SELECT COUNT(DISTINCT h.order_id)::int4 AS already_has_confirmed_history
    FROM order_status_history h
    JOIN orders o ON o.id = h.order_id
    WHERE LOWER(h.status) IN ('confirmed','cancelled')
      AND o.confirmed_by IN (
        SELECT id FROM users WHERE email IN (
          'chandi@vergescales.com','tanisha@vergescales.com','shruti@vergescales.com'
        )
      )
  `);
  console.log("already has confirmed/cancelled history:", ((dup as any).rows ?? dup));

  // Total backfilled orders (sanity check).
  const back: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                            AS total,
      COUNT(*) FILTER (WHERE confirmed_at IS NULL)::int4        AS missing_confirmed_at,
      COUNT(*) FILTER (WHERE call_status = 'Confirmed')::int4   AS confirmed,
      COUNT(*) FILTER (WHERE call_status = 'Cancelled')::int4   AS cancelled,
      COUNT(*) FILTER (WHERE call_status = 'Follow Up')::int4   AS follow_up
    FROM orders
    WHERE confirmed_by IN (
      SELECT id FROM users WHERE email IN (
        'chandi@vergescales.com','tanisha@vergescales.com','shruti@vergescales.com'
      )
    )
  `);
  console.log("backfilled cohort:", ((back as any).rows ?? back));

  process.exit(0);
})();
