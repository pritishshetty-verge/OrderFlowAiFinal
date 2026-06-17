import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { SHIPPING_STATUSES } from "@shared/schema";

/**
 * One-off backfill: normalize historical `orders.status` legacy string formats
 * (Title-case Shopify output like "Shipped"/"Delivered"/"Cancelled", plus older
 * aliases) into the strict canonical SHIPPING_STATUSES keys, so analytics never
 * has to special-case legacy formats again.
 *
 * Safety:
 *  - Only the explicit legacy values below are touched. Canonical shipping keys
 *    and the pre-ship workflow states (pending/assigned/confirmed/followup) are
 *    left untouched.
 *  - Every target is validated against SHIPPING_STATUSES.
 *  - Runs in a single transaction and is idempotent (re-running maps 0 rows).
 */

// Exact legacy value (as stored) → canonical key.
const LEGACY_MAP: Record<string, string> = {
  // Title-case Shopify mapper output (the bulk of historical data)
  Unfulfilled: "unfulfilled",
  Shipped: "awb_assigned", // Shopify "fulfilled" == AWB created / ready to ship
  Delivered: "delivered",
  Cancelled: "cancelled",
  // Defensive: older / mixed-case aliases that may exist in some rows
  shipped: "awb_assigned",
  Dispatched: "in_transit",
  dispatched: "in_transit",
  Canceled: "cancelled",
  canceled: "cancelled",
  ready_to_ship: "awb_assigned",
  RTO: "rto_initiated",
  rto: "rto_initiated",
  NDR: "ndr",
};

async function snapshot(label: string) {
  const r = await db.execute(sql`
    SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status ORDER BY n DESC`);
  console.log(`\n${label}:`);
  console.table((r as any).rows ?? r);
}

async function main() {
  // Guard: every mapping target must be a canonical shipping status.
  const valid = new Set<string>(SHIPPING_STATUSES);
  for (const [from, to] of Object.entries(LEGACY_MAP)) {
    if (!valid.has(to)) {
      throw new Error(`Mapping target "${to}" (from "${from}") is not a canonical SHIPPING_STATUSES value`);
    }
  }

  await snapshot("BEFORE");

  const updated: Record<string, number> = {};
  let total = 0;

  await db.transaction(async (tx) => {
    for (const [from, to] of Object.entries(LEGACY_MAP)) {
      const res: any = await tx.execute(sql`
        UPDATE orders SET status = ${to} WHERE status = ${from}`);
      const n = res.rowCount ?? 0;
      if (n > 0) {
        updated[`${from} → ${to}`] = n;
        total += n;
      }
    }
  });

  console.log("\n=== Backfill summary ===");
  if (total === 0) {
    console.log("No legacy rows found — orders.status already pristine.");
  } else {
    console.table(updated);
    console.log(`Total rows updated: ${total}`);
  }

  await snapshot("AFTER");
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed (transaction rolled back):", err);
  process.exit(1);
});
