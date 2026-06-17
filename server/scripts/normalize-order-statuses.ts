import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { SHIPPING_STATUSES } from "@shared/schema";

/**
 * One-off backfill: normalize historical legacy shipping-status strings
 * (Title-case Shopify output like "Shipped"/"Delivered"/"Cancelled", plus older
 * aliases) into the strict canonical SHIPPING_STATUSES keys, so analytics never
 * has to special-case legacy formats again.
 *
 * Applies to `orders.status` and BOTH status columns of
 * `order_status_history` (status + previous_status).
 *
 * Safety:
 *  - Only the explicit legacy values below are touched. Canonical shipping keys
 *    and the pre-ship workflow states (pending/assigned/confirmed/follow up/…)
 *    are left untouched — their casing is owned by the call-centre flow, not
 *    this shipping refactor.
 *  - Every target is validated against SHIPPING_STATUSES.
 *  - Runs in a single transaction and is idempotent (re-running maps 0 rows).
 */

// (table, column) pairs to normalize, in order.
const TARGETS: Array<{ table: string; column: string }> = [
  { table: "orders", column: "status" },
  { table: "order_status_history", column: "status" },
  { table: "order_status_history", column: "previous_status" },
];

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

async function snapshot(table: string, column: string, label: string) {
  // table/column are hardcoded constants from TARGETS — safe to inline.
  const r = await db.execute(
    sql.raw(
      `SELECT ${column} AS value, COUNT(*)::int AS n FROM ${table} GROUP BY ${column} ORDER BY n DESC`,
    ),
  );
  console.log(`\n${label} — ${table}.${column}:`);
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

  for (const { table, column } of TARGETS) {
    await snapshot(table, column, "BEFORE");
  }

  const updated: Record<string, number> = {};
  let total = 0;

  await db.transaction(async (tx) => {
    for (const { table, column } of TARGETS) {
      for (const [from, to] of Object.entries(LEGACY_MAP)) {
        const res: any = await tx.execute(
          sql`UPDATE ${sql.raw(table)} SET ${sql.raw(column)} = ${to} WHERE ${sql.raw(column)} = ${from}`,
        );
        const n = res.rowCount ?? 0;
        if (n > 0) {
          updated[`${table}.${column}: ${from} → ${to}`] = n;
          total += n;
        }
      }
    }
  });

  console.log("\n=== Backfill summary ===");
  if (total === 0) {
    console.log("No legacy rows found — already pristine.");
  } else {
    console.table(updated);
    console.log(`Total rows updated: ${total}`);
  }

  for (const { table, column } of TARGETS) {
    await snapshot(table, column, "AFTER");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed (transaction rolled back):", err);
  process.exit(1);
});
