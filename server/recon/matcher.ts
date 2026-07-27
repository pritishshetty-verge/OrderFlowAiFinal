// =============================================================================
// PG SETTLEMENT MATCHER
// =============================================================================
//
// Forward pass: walk every `pending` pg_settlement and resolve it to a
// Shopify order via the bridge:
//
//     pg_settlements.pgPaymentId == orders.note_attribute.PayU_txn_id
//
// Once resolved, classify by amount drift:
//   - within tolerance              → status = 'settled'
//   - drift > tolerance              → status = 'mismatch'
//   - no Shopify order found at all  → leave 'pending' (orphan)
//
// Orphan rows are RARE (settlement received but no matching order in
// our DB). They stay 'pending' so the next matcher run picks them up
// if the order eventually syncs in. They never escalate to 'overdue';
// 'overdue' is reserved for the OTHER direction — Shopify-side query
// for paid orders past T+2 with NO matching pg_settlement. That query
// is in `getOverdueOrders()` below; it's computed live, not stored.
//
// Performance note: V1 loops one row at a time (53 rows = ~few seconds
// against Neon). At 5k+ pending rows the round-trip count starts to
// hurt; in that regime we'd switch to a single SQL with `UPDATE ...
// FROM (subquery)`. For V1 the simplicity is worth more than the speed.
// =============================================================================

import { db } from "../db";
import { pgSettlements } from "@shared/schema";
import { and, eq, sql, isNotNull } from "drizzle-orm";
import { getPgAdapter } from "../pgs";
import { storage } from "../storage";
import type { PgName, PgRateCardRules } from "@shared/schema";

export interface MatchResult {
  scanned: number;
  /** Resolved to a Shopify order via the bridge. */
  matched: number;
  /** Breakdown of `matched` by what we classified them as. */
  classified: { settled: number; mismatch: number };
  /** PG row had no corresponding Shopify order. Stays pending. */
  orphan: number;
  errors: Array<{ pgPaymentId: string; reason: string }>;
}

export interface MatchOpts {
  storeId: string;
  pgName?: PgName;
  /**
   * Rupees of drift we'll forgive before flagging mismatch. Set
   * generously by default — PayU's MDR + GST always means the
   * settled amount is ~1.5% less than the order amount, so the
   * "expected" deduction already accounts for that. Tolerance
   * here is for rounding (₹0.01 differences from PG batch math).
   */
  toleranceRupees?: number;
}

/**
 * Process every pending settlement for this (store, PG). Idempotent
 * within a single run — running it twice on the same data just
 * re-classifies what's there.
 */
export async function matchPendingSettlements(
  opts: MatchOpts,
): Promise<MatchResult> {
  const { storeId, pgName = "payu", toleranceRupees = 1.0 } = opts;
  const adapter = getPgAdapter(pgName);
  if (!adapter) {
    throw new Error(`No PG adapter registered for "${pgName}"`);
  }

  // Load the merchant's contracted rate card. The adapter falls back
  // to its hardcoded defaults if no card is configured (V1 behavior).
  const activeCard = await storage.getActivePgRateCard(storeId, pgName);
  const rules = activeCard?.rules as PgRateCardRules | undefined;

  const pending = await db
    .select()
    .from(pgSettlements)
    .where(
      and(
        eq(pgSettlements.storeId, storeId),
        eq(pgSettlements.pgName, pgName),
        eq(pgSettlements.status, "pending"),
      ),
    );

  const result: MatchResult = {
    scanned: pending.length,
    matched: 0,
    classified: { settled: 0, mismatch: 0 },
    orphan: 0,
    errors: [],
  };

  for (const s of pending) {
    try {
      // Bridge query — narrow by storeId so we don't cross tenants.
      // The LATERAL join unpacks the note_attributes JSON array per
      // order; the WHERE clauses filter to the PayU_txn_id entry
      // that matches our pgPaymentId. LIMIT 1 because each (store,
      // PayU_txn_id) pair should be unique on the Shopify side.
      const found = await db.execute(sql`
        SELECT o.id, o.total_price, o.shopify_order_number
        FROM orders o
        CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(o.raw_shopify_data->'note_attributes', '[]'::jsonb)
        ) attr
        WHERE attr->>'name' = 'PayU_txn_id'
          AND attr->>'value' = ${s.pgPaymentId}
          AND o.store_id = ${storeId}
        LIMIT 1
      `);

      if (found.rows.length === 0) {
        result.orphan++;
        continue;
      }

      const order = found.rows[0] as {
        id: string;
        total_price: string;
        shopify_order_number: string;
      };
      const orderAmount = parseFloat(order.total_price);
      const settledAmount = parseFloat(s.settledAmount);

      // Compare ACTUAL settled vs EXPECTED-after-fee. Mismatch is
      // ONE-SIDED: only flag when PayU took MORE than the contracted
      // fee (we received less than expected). PayU taking LESS than
      // expected — or charging zero fee on certain payment modes —
      // is good for the merchant and counts as settled.
      //
      // The rate card (when present) makes expectations accurate per
      // payment mode: e.g., UPI might be 0% MDR while credit cards
      // are 2%. Without a card, we use the adapter's hardcoded fallback.
      const paymentMode = (s.rawPayload as any)?.["payment type"]
        ?? (s.rawPayload as any)?.["payment_type"]
        ?? undefined;
      const expected = adapter.expectedFee(orderAmount, {
        rules,
        paymentMode,
      });
      const expectedSettled = orderAmount - expected.totalDeduction;
      const drift = settledAmount - expectedSettled;
      const status: "settled" | "mismatch" =
        drift >= -toleranceRupees ? "settled" : "mismatch";

      await db
        .update(pgSettlements)
        .set({
          status,
          orderId: order.id,
          orderAmount: orderAmount.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(pgSettlements.id, s.id));

      result.matched++;
      if (status === "settled") result.classified.settled++;
      else result.classified.mismatch++;
    } catch (err: any) {
      result.errors.push({
        pgPaymentId: s.pgPaymentId,
        reason: err?.message ?? String(err),
      });
    }
  }

  return result;
}

// =============================================================================
// OVERDUE / UNMATCHED ORDERS (computed live, not stored)
// =============================================================================
//
// The other half of reconciliation: Shopify-paid PayU orders for which
// no settlement record exists past the T+2 + buffer window. These are
// the "we haven't been paid yet" cases the boss actually cares about.
//
// We compute these live rather than materialising into pg_settlements,
// because (a) the universe of "ought-to-have-settled" rows is exactly
// the set of paid orders, and (b) an order can transition out of
// overdue at any time when a new settlement file arrives. Storing
// would mean keeping a phantom row in sync; a query is simpler.
// =============================================================================

export interface OverdueOrder {
  id: string;
  shopifyOrderNumber: string;
  customerEmail: string | null;
  totalPrice: string;
  shopifyCreatedAt: string;
  payUTxnId: string;
  ageDays: number;
}

export interface OverdueOpts {
  storeId: string;
  graceDays?: number;
  limit?: number;
}

export interface OverdueResult {
  rows: OverdueOrder[];
  /**
   * The window we computed overdue against — derived from
   * MIN/MAX(settled_at) in pg_settlements for this store.
   * NULL when no settlements exist (then `rows` is empty too).
   */
  window: { fromDate: string; toDate: string } | null;
  /**
   * Diagnostic copy the UI shows on a banner. "Computed against
   * May 30 – Jun 6 (5 days of settlement data loaded)" etc.
   */
  windowNote: string | null;
}

/**
 * "Overdue" only makes sense within the window we actually have
 * settlement data for. If you've only uploaded CSVs for Jun 5–9,
 * every paid order from before that window will look "overdue"
 * just because we have no settlement records to match it against —
 * even though PayU probably settled it on time.
 *
 * Approach: auto-detect the date window from
 * MIN(settled_at) … MAX(settled_at) − graceDays. Anything older
 * than the earliest settled date is excluded ("we have no data for
 * that period"); anything newer than `latest - graceDays` is
 * excluded ("still in the T+2 settlement window, not overdue
 * yet"). Result: overdue == real money missing, not just absent
 * historical CSV data.
 */
export async function getOverdueOrders(
  opts: OverdueOpts,
): Promise<OverdueResult> {
  const { storeId, graceDays = 3, limit = 200 } = opts;

  // 1) Detect the window from settlement data we have.
  const windowQuery = await db.execute(sql`
    SELECT
      MIN(settled_at)::timestamptz AS min_settled,
      MAX(settled_at)::timestamptz AS max_settled,
      COUNT(*)::int AS total
    FROM pg_settlements
    WHERE store_id = ${storeId}
      AND settled_at IS NOT NULL
  `);
  const winRow = windowQuery.rows[0] as any;

  // No settlement data at all → no meaningful overdue computation.
  if (!winRow || !winRow.min_settled || Number(winRow.total) === 0) {
    return {
      rows: [],
      window: null,
      windowNote:
        "No settlement data loaded yet. Upload a PayU settlement CSV to compute overdue orders.",
    };
  }

  const minSettled: Date = new Date(winRow.min_settled);
  const maxSettled: Date = new Date(winRow.max_settled);

  // The "we should have seen a settlement by now" cutoff. Orders
  // newer than this are still within their T+2 window — pending,
  // not overdue.
  const cutoff = new Date(maxSettled.getTime() - graceDays * 86400_000);

  // We back off the "from" edge by graceDays too so we don't flag
  // orders whose expected-settlement date predates our oldest CSV.
  const windowStart = new Date(minSettled.getTime() - graceDays * 86400_000);

  // 2) Run the actual overdue query against the windowed range.
  const result = await db.execute(sql`
    SELECT
      o.id,
      o.shopify_order_number,
      o.customer_email,
      o.total_price,
      o.shopify_created_at,
      attr->>'value' AS payu_txn_id,
      EXTRACT(EPOCH FROM (NOW() - o.shopify_created_at)) / 86400 AS age_days
    FROM orders o
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(o.raw_shopify_data->'note_attributes', '[]'::jsonb)
    ) attr
    LEFT JOIN pg_settlements p
      ON p.pg_name = 'payu'
      AND p.store_id = o.store_id
      AND p.pg_payment_id = attr->>'value'
    WHERE attr->>'name' = 'PayU_txn_id'
      AND o.store_id = ${storeId}
      AND o.financial_status = 'paid'
      AND o.shopify_created_at >= ${windowStart.toISOString()}
      AND o.shopify_created_at < ${cutoff.toISOString()}
      AND p.id IS NULL
    ORDER BY o.shopify_created_at ASC
    LIMIT ${limit}
  `);

  const rows: OverdueOrder[] = result.rows.map((r) => {
    const row = r as any;
    return {
      id: row.id,
      shopifyOrderNumber: row.shopify_order_number,
      customerEmail: row.customer_email,
      totalPrice: row.total_price,
      shopifyCreatedAt: row.shopify_created_at,
      payUTxnId: row.payu_txn_id,
      ageDays: Math.floor(Number(row.age_days)),
    };
  });

  // Human-readable window for the banner.
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
  const windowDays = Math.max(
    1,
    Math.round(
      (maxSettled.getTime() - minSettled.getTime()) / 86400_000,
    ),
  );

  return {
    rows,
    window: {
      fromDate: windowStart.toISOString(),
      toDate: cutoff.toISOString(),
    },
    windowNote: `Computed against orders from ${fmt(windowStart)} – ${fmt(cutoff)} (${windowDays} ${windowDays === 1 ? "day" : "days"} of settlement data loaded). Older orders aren't flagged — upload more CSVs to extend coverage.`,
  };
}
