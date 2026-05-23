import { db } from "../db";
import { sql } from "drizzle-orm";
import { orders, pincodeTiers, marketingMetrics } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────
// Pare analytics service
//
// "Pare" strips away vanity metrics (Gross GMV) to surface True Net GMV
// after fulfillment leakage. See Pare-PRD-v3.pdf §1.
//
// Implementation: one SQL query GROUP BY date (IST). Each row = one
// calendar day. We derive the range totals by summing across days in
// JS, then pad out any missing days with zero-filled rows so the
// frontend can render a contiguous time-series without gap detection.
// ─────────────────────────────────────────────────────────────────────

export type DateRange = {
  startDate: Date;
  endDate: Date;
  // Phase 2: when set, the SQL aggregate restricts to a single store.
  // The route layer passes the storeId resolved from the storeScope
  // middleware, so multi-store users only ever see their active
  // store's funnel.
  storeId?: string;
};

export type Bucket = {
  count: number;
  value: number;
};

export type NullableBucket = {
  count: number | null;
  value: number | null;
  note?: string;
};

export type DailyBucket = {
  date: string; // YYYY-MM-DD in IST

  // ── Financial (Phase 1) ─────────────────────────────────────────
  // Waterfall: grossGmv (pre-discount) − discounts = orderRevenue
  // Order Revenue then flows into the logistics leakage rows and
  // ultimately Net GMV. Delivered/RTO/Cancelled GMV are all computed
  // from post-discount total_price so we don't overstate deductions.
  grossGmv: number; // SUM(total_price + total_discount) — list value
  discounts: number; // SUM(total_discount)
  orderRevenue: number; // SUM(total_price) — post-discount, pre-leakage
  deliveredGmv: number;
  rtoGmv: number;
  cancelledGmv: number;
  refundedAmount: number;
  leakage: number;
  netGmv: number; // orderRevenue − leakage

  // ── Order volume + payments (Phase 2) ───────────────────────────
  totalOrders: number;
  codOrders: number;
  paidOrders: number;
  // Exchange linkage (Shopify `source_order_id`) isn't captured in
  // the orders table yet. Keep the field shape so the frontend can
  // render em-dash today and we can populate it later without a
  // contract change.
  exchangeOrdersPaid: number | null;
  exchangeOrdersCod: number | null;

  // ── Logistics + fulfillment (Phase 3) ───────────────────────────
  cancelledOrders: number;
  fulfilledOrders: number;
  unfulfilledOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  refundedOrders: number;

  // ── Marketing (Phase 4) ─────────────────────────────────────────
  // Populated from marketing_metrics table — one row per calendar day
  // from the Meta sync. Null when there's no row yet for that day.
  fbSpend: number | null;
  fbRoas: number | null;
  fbGmv: number | null;
  fbOrders: number | null;

  // ── Support / CX (Phase 4) ──────────────────────────────────────
  cxConfirmedOrders: number; // Confirmed by a human agent
  cxConfirmationPending: number; // call_status='Pending'
  // COD→Prepaid conversions after a support call. Requires payment-
  // method change history which we don't track yet.
  c2pOrders: number | null;
  brandConfirmedOrders: number; // Auto-confirmed (no confirmed_by)

  // ── Geographic risk segmentation (Phase 5) ──────────────────────
  // City-tier lookup table isn't integrated. Per user spec: null the
  // tier slots and route everything to unknownTierOrders until the
  // lookup pipeline ships.
  tier1Orders: number | null;
  tier1Rto: number | null;
  tier2Orders: number | null;
  tier2Rto: number | null;
  tier3Orders: number | null;
  tier3Rto: number | null;
  unknownTierOrders: number;
};

export type PareMetrics = {
  dateRange: { startDate: string; endDate: string };
  grossGmv: number; // pre-discount total (list value)
  discounts: number;
  orderRevenue: number; // post-discount (= legacy grossGmv)
  leakage: number;
  netGmv: number;
  totalOrders: number;
  phases: {
    preShip: {
      unfulfilled: Bucket;
      cancelledBeforeDispatch: Bucket;
    };
    transit: {
      shipped: Bucket;
      outForDelivery: Bucket;
      rtoInitiated: Bucket;
      rtoDelivered: Bucket;
      totalEverShipped: number;
      rtoPct: number | null;
    };
    postDelivery: {
      delivered: Bucket;
      returnRequests: Bucket;
      partialRefunds: Bucket;
      exchanges: NullableBucket;
      netGmvExcludingExchanges: number;
    };
    settled: {
      settledAmount: number | null;
      note: string;
    };
  };
  daily: DailyBucket[];
  computedAt: string;
};

// Compute an RTO% from a (count, denominator) pair. Returns null if
// there were zero orders (percentage is undefined, not 0) so the UI
// can render an em-dash.
function computeTierRtoPct(rtoRaw: unknown, totalRaw: unknown): number | null {
  const n = Number(rtoRaw) || 0;
  const d = Number(totalRaw) || 0;
  if (d <= 0) return null;
  return Number(((n / d) * 100).toFixed(2));
}

// Build a YYYY-MM-DD string for a Date *without* tripping over UTC.
// We key each day on IST because Indian e-comm runs on IST calendar.
function istDateKey(d: Date): string {
  // Get the IST components. Node's `toLocaleString('en-IN', { timeZone })`
  // reliably yields IST regardless of server TZ.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  // en-CA gives YYYY-MM-DD.
  return parts;
}

// Enumerate every IST calendar day in [startDate, endDate], inclusive.
function enumerateDays(startDate: Date, endDate: Date): string[] {
  const out: string[] = [];
  const startKey = istDateKey(startDate);
  const endKey = istDateKey(endDate);
  // Walk in 24h increments from start, reading the key each time.
  // Use a cursor at IST midnight of startKey to avoid DST edge cases.
  const cursor = new Date(`${startKey}T00:00:00+05:30`);
  const end = new Date(`${endKey}T00:00:00+05:30`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(istDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export async function getPareMetrics(
  dateRange: DateRange,
): Promise<PareMetrics> {
  const { startDate, endDate, storeId } = dateRange;
  // Phase 2: optional store scope. When `storeId` is provided we add
  // a single equality predicate to the WHERE clause; the per-day
  // GROUP BY, FILTER predicates, and JOINs are otherwise unchanged.
  // We also restrict the marketing_metrics join the same way so a
  // store's ad spend doesn't bleed across the rest of the funnel.
  const storeFilter = storeId
    ? sql`AND store_id = ${storeId}`
    : sql``;
  const mmStoreFilter = storeId
    ? sql`AND mm.store_id = ${storeId}`
    : sql``;

  // Single query. Everything filters against the same date window and
  // gets bucketed by IST calendar day.
  const query = sql`
    SELECT
      (DATE_TRUNC('day', processed_at AT TIME ZONE 'Asia/Kolkata'))::date::text AS day,

      -- ── Waterfall top: Gross GMV → Discounts → Order Revenue ───
      -- Shopify-aligned definitions:
      --   Gross GMV     = pre-discount line-items value
      --                 = subtotal (which is post-line-item-discount
      --                   but pre-tax/shipping) + total_discount
      --   Discounts     = total_discount
      --   Order Revenue = total_price (the amount actually charged —
      --                   matches Shopify's "Total Sales" line in the
      --                   sales-over-time report)
      COALESCE(SUM(subtotal::numeric + COALESCE(total_discount::numeric, 0)), 0)::float8 AS gross_gmv,
      COALESCE(SUM(COALESCE(total_discount::numeric, 0)), 0)::float8 AS discounts,
      COALESCE(SUM(total_price::numeric), 0)::float8 AS order_revenue,

      -- ── Strict exclusivity hierarchy (Pare v0.5) ───────────────
      -- An order can land in EXACTLY ONE of these leakage buckets,
      -- ordered by lifecycle stage:
      --   Warehouse → Transit → Customer
      -- A prepaid order cancelled mid-transit used to be counted as
      -- BOTH Refunded (financial) AND RTO (logistics), double-counting
      -- the loss. The filters below prevent that overlap so the
      -- waterfall sums cleanly to Net GMV.

      -- Warehouse stage: cancelled BEFORE any fulfillment occurred.
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE status = 'Cancelled' AND fulfillment_status IS NULL
      ), 0)::float8 AS cancelled_gmv,

      -- Transit stage: logistics says RTO. Claimed here regardless of
      -- financial_status so a mid-transit refund is NOT also counted
      -- as a customer-side refund below.
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE UPPER(shipment_status) LIKE '%RTO%'
           OR status IN ('rto_initiated', 'rto_delivered')
      ), 0)::float8 AS rto_gmv,

      -- Customer stage: refund AFTER successful delivery. Requires the
      -- order to have actually reached the customer AND not be RTO.
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE financial_status IN ('refunded', 'partially_refunded')
          AND (shipment_status ILIKE 'delivered' OR status = 'Delivered')
          AND UPPER(shipment_status) NOT LIKE '%RTO%'
      ), 0)::float8 AS refunded_amount,

      -- Delivered is a PERFORMANCE metric, not leakage. Excluded from
      -- Net GMV subtraction. Scoped to genuinely-delivered (not RTO)
      -- so it stays disjoint from rto_gmv.
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE (shipment_status ILIKE 'delivered' OR status = 'Delivered')
          AND UPPER(shipment_status) NOT LIKE '%RTO%'
      ), 0)::float8 AS delivered_gmv,

      -- Phase-level counts (same filters as the old single-row query).
      COUNT(*)::int4 AS total_orders,
      COUNT(*) FILTER (WHERE fulfillment_status IS NULL AND status <> 'Cancelled')::int4 AS unfulfilled_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE fulfillment_status IS NULL AND status <> 'Cancelled'), 0)::float8 AS unfulfilled_value,
      COUNT(*) FILTER (WHERE status = 'Cancelled' AND fulfillment_status IS NULL)::int4 AS cancelled_preship_count,
      COUNT(*) FILTER (
        WHERE status = 'Shipped'
          AND (shipment_status IS NULL OR shipment_status NOT IN ('out_for_delivery', 'delivered'))
      )::int4 AS shipped_count,
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE status = 'Shipped'
          AND (shipment_status IS NULL OR shipment_status NOT IN ('out_for_delivery', 'delivered'))
      ), 0)::float8 AS shipped_value,
      COUNT(*) FILTER (WHERE shipment_status = 'out_for_delivery')::int4 AS ofd_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE shipment_status = 'out_for_delivery'), 0)::float8 AS ofd_value,
      COUNT(*) FILTER (WHERE status = 'rto_initiated')::int4 AS rto_initiated_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE status = 'rto_initiated'), 0)::float8 AS rto_initiated_value,
      COUNT(*) FILTER (WHERE status = 'rto_delivered' OR UPPER(shipment_status) = 'RTO')::int4 AS rto_delivered_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE status = 'rto_delivered' OR UPPER(shipment_status) = 'RTO'), 0)::float8 AS rto_delivered_value,
      COUNT(*) FILTER (WHERE fulfillment_status IN ('fulfilled', 'partial'))::int4 AS total_ever_shipped,
      COUNT(*) FILTER (WHERE status = 'Delivered')::int4 AS delivered_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE status = 'Delivered'), 0)::float8 AS delivered_value,
      COUNT(*) FILTER (WHERE financial_status = 'refunded')::int4 AS refunded_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE financial_status = 'refunded'), 0)::float8 AS refunded_value,
      COUNT(*) FILTER (WHERE financial_status = 'partially_refunded')::int4 AS partial_refund_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE financial_status = 'partially_refunded'), 0)::float8 AS partial_refund_value,
      COUNT(*) FILTER (WHERE status = 'Cancelled')::int4 AS cancelled_orders_all,
      COUNT(*) FILTER (
        WHERE status IN ('rto_initiated', 'rto_delivered') OR UPPER(shipment_status) = 'RTO'
      )::int4 AS rto_orders_all,
      COUNT(*) FILTER (WHERE financial_status IN ('refunded', 'partially_refunded'))::int4 AS refunded_orders_all,

      -- ── Payment method split ───────────────────────────────────
      -- payment_method is freeform Shopify gateway text ("cod",
      -- "razorpay", "Shopify Payments", …). A case-insensitive
      -- substring match catches "COD", "Cash on Delivery" variants
      -- without requiring a settings lookup. Non-COD, non-null is
      -- treated as paid/prepaid.
      COUNT(*) FILTER (WHERE LOWER(payment_method) LIKE '%cod%')::int4 AS cod_orders,
      COUNT(*) FILTER (
        WHERE payment_method IS NOT NULL
          AND LOWER(payment_method) NOT LIKE '%cod%'
      )::int4 AS paid_orders,

      -- ── CX breakdown ───────────────────────────────────────────
      -- Heuristic: orders confirmed with a confirmed_by user are CX-
      -- confirmed (a human on the ops team); orders confirmed without
      -- confirmed_by are brand/auto-confirmed (prepaid auto-confirm).
      COUNT(*) FILTER (
        WHERE call_status = 'Confirmed' AND confirmed_by IS NOT NULL
      )::int4 AS cx_confirmed_orders,
      COUNT(*) FILTER (WHERE call_status = 'Pending')::int4 AS cx_confirmation_pending,
      COUNT(*) FILTER (
        WHERE call_status = 'Confirmed' AND confirmed_by IS NULL
      )::int4 AS brand_confirmed_orders,

      -- ── Phase 5 · Geographic Risk Segmentation ──────────────────
      -- LEFT JOIN on pincode_tiers lets us bucket each order into the
      -- city tier of its shipping pincode. Orders whose pincode is
      -- NULL or absent from the lookup fall into unknown.
      COUNT(*) FILTER (WHERE pt.tier = 'Tier 1')::int4 AS tier_1_orders,
      COUNT(*) FILTER (
        WHERE pt.tier = 'Tier 1'
          AND (status IN ('rto_initiated', 'rto_delivered') OR UPPER(shipment_status) = 'RTO')
      )::int4 AS tier_1_rto_count,
      COUNT(*) FILTER (WHERE pt.tier = 'Tier 2')::int4 AS tier_2_orders,
      COUNT(*) FILTER (
        WHERE pt.tier = 'Tier 2'
          AND (status IN ('rto_initiated', 'rto_delivered') OR UPPER(shipment_status) = 'RTO')
      )::int4 AS tier_2_rto_count,
      COUNT(*) FILTER (WHERE pt.tier = 'Tier 3')::int4 AS tier_3_orders,
      COUNT(*) FILTER (
        WHERE pt.tier = 'Tier 3'
          AND (status IN ('rto_initiated', 'rto_delivered') OR UPPER(shipment_status) = 'RTO')
      )::int4 AS tier_3_rto_count,
      COUNT(*) FILTER (WHERE pt.tier IS NULL OR pt.tier = 'Unknown')::int4 AS unknown_tier_orders,

      -- ── Phase 4 · Marketing (Meta/FB) ──────────────────────────
      -- marketing_metrics has at most one row per date, so every
      -- orders row on a given day joins to the same mm row.
      -- Using MAX() (not SUM) returns the correct per-day value
      -- without inflating by the order count.
      MAX(mm.fb_spend)::float8 AS fb_spend,
      MAX(mm.fb_roas)::float8 AS fb_roas,
      MAX(mm.fb_gmv)::float8 AS fb_gmv,
      MAX(mm.fb_orders)::int4 AS fb_orders
    FROM ${orders}
    LEFT JOIN ${pincodeTiers} pt ON pt.pincode = ${orders}.shipping_pincode
    LEFT JOIN ${marketingMetrics} mm
      ON mm.date = DATE_TRUNC('day', processed_at AT TIME ZONE 'Asia/Kolkata')::date
      ${mmStoreFilter}
    -- Bucket + filter on processed_at (the financial timestamp Shopify
    -- uses in its sales reports), not shopify_created_at. COD orders
    -- and delayed-capture payments routinely drift a day between the
    -- two — this matches Shopifys own numbers 1:1.
    WHERE processed_at >= ${startDate}
      AND processed_at <= ${endDate}
      -- Phase 2: scope to a single store when the caller asks.
      ${storeFilter}
      -- Exclude test-mode orders (Shopifys test boolean). Populated
      -- by the historical backfill script at server/scripts/flag-test-orders.ts
      -- and by the regular sync going forward (see buildOrderInsert).
      AND test_order = false
      -- Exclude voided orders (Shopify treats these as never-happened).
      AND (financial_status IS NULL OR financial_status <> 'voided')
      -- NOTE: status = Cancelled is intentionally NOT filtered here.
      -- Phase 3 Cancelled Orders row depends on counting them, and
      -- the Phase 1 leakage rows already scope by status internally.
    GROUP BY DATE_TRUNC('day', processed_at AT TIME ZONE 'Asia/Kolkata')
    ORDER BY day ASC
  `;

  const result = await db.execute(query);
  const rows: any[] =
    (result as any).rows ?? (result as any) ?? [];

  // Index fetched rows by date key for zero-fill.
  const byDay = new Map<string, any>();
  for (const r of rows) byDay.set(r.day, r);

  // Zero-filled contiguous time-series so the frontend doesn't need
  // calendar-gap logic.
  const daily: DailyBucket[] = enumerateDays(startDate, endDate).map((day) => {
    const r = byDay.get(day);
    if (!r) {
      return {
        date: day,
        grossGmv: 0,
        discounts: 0,
        orderRevenue: 0,
        deliveredGmv: 0,
        rtoGmv: 0,
        cancelledGmv: 0,
        refundedAmount: 0,
        leakage: 0,
        netGmv: 0,
        totalOrders: 0,
        codOrders: 0,
        paidOrders: 0,
        exchangeOrdersPaid: null,
        exchangeOrdersCod: null,
        cancelledOrders: 0,
        fulfilledOrders: 0,
        unfulfilledOrders: 0,
        deliveredOrders: 0,
        rtoOrders: 0,
        refundedOrders: 0,
        fbSpend: null,
        fbRoas: null,
        fbGmv: null,
        fbOrders: null,
        cxConfirmedOrders: 0,
        cxConfirmationPending: 0,
        c2pOrders: null,
        brandConfirmedOrders: 0,
        tier1Orders: null,
        tier1Rto: null,
        tier2Orders: null,
        tier2Rto: null,
        tier3Orders: null,
        tier3Rto: null,
        unknownTierOrders: 0,
      };
    }
    const grossGmv = Number(r.gross_gmv) || 0;
    const discounts = Number(r.discounts) || 0;
    const orderRevenue = Number(r.order_revenue) || 0;
    const cancelledGmv = Number(r.cancelled_gmv) || 0;
    const rtoGmv = Number(r.rto_gmv) || 0;
    const refundedAmount = Number(r.refunded_amount) || 0;
    // Leakage = the three mutually-exclusive lifecycle buckets.
    // Delivered GMV is informational and NOT included here.
    const leakage = cancelledGmv + rtoGmv + refundedAmount;
    const totalOrders = Number(r.total_orders) || 0;
    return {
      date: day,
      grossGmv,
      discounts,
      orderRevenue,
      deliveredGmv: Number(r.delivered_gmv) || 0,
      rtoGmv,
      cancelledGmv,
      refundedAmount,
      leakage,
      // Post-discount: Net GMV is derived from orderRevenue, NOT the
      // pre-discount grossGmv — otherwise we'd understate leakage as
      // a share of the actual money in.
      netGmv: orderRevenue - leakage,
      totalOrders,
      codOrders: Number(r.cod_orders) || 0,
      paidOrders: Number(r.paid_orders) || 0,
      exchangeOrdersPaid: null,
      exchangeOrdersCod: null,
      cancelledOrders: Number(r.cancelled_orders_all) || 0,
      fulfilledOrders: Number(r.total_ever_shipped) || 0,
      unfulfilledOrders: Number(r.unfulfilled_count) || 0,
      deliveredOrders: Number(r.delivered_count) || 0,
      rtoOrders: Number(r.rto_orders_all) || 0,
      refundedOrders: Number(r.refunded_orders_all) || 0,
      fbSpend: r.fb_spend == null ? null : Number(r.fb_spend),
      fbRoas: r.fb_roas == null ? null : Number(r.fb_roas),
      fbGmv: r.fb_gmv == null ? null : Number(r.fb_gmv),
      fbOrders: r.fb_orders == null ? null : Number(r.fb_orders),
      cxConfirmedOrders: Number(r.cx_confirmed_orders) || 0,
      cxConfirmationPending: Number(r.cx_confirmation_pending) || 0,
      c2pOrders: null,
      brandConfirmedOrders: Number(r.brand_confirmed_orders) || 0,
      // ── Phase 5 · live tier data from pincode_tiers join. ────────
      tier1Orders: Number(r.tier_1_orders) || 0,
      tier1Rto: computeTierRtoPct(r.tier_1_rto_count, r.tier_1_orders),
      tier2Orders: Number(r.tier_2_orders) || 0,
      tier2Rto: computeTierRtoPct(r.tier_2_rto_count, r.tier_2_orders),
      tier3Orders: Number(r.tier_3_orders) || 0,
      tier3Rto: computeTierRtoPct(r.tier_3_rto_count, r.tier_3_orders),
      unknownTierOrders: Number(r.unknown_tier_orders) || 0,
    };
  });

  // Range totals — sum each column across the (unpadded) rows. The
  // zero-padded daily[] is cosmetic for the UI; for totals we use the
  // real rows so the numbers match the previous endpoint exactly.
  const sum = (k: keyof (typeof rows)[number]) =>
    rows.reduce((acc, r) => acc + (Number((r as any)[k]) || 0), 0);
  const sumInt = (k: keyof (typeof rows)[number]) =>
    rows.reduce((acc, r) => acc + (Number((r as any)[k]) || 0), 0);

  const grossGmv = sum("gross_gmv");
  const discounts = sum("discounts");
  const orderRevenue = sum("order_revenue");
  // Leakage follows the strict exclusivity hierarchy:
  //   Warehouse (cancelled_gmv) + Transit (rto_gmv) + Customer (refunded_amount)
  // Delivered GMV is a performance metric, NOT leakage.
  const cancelledGmvTotal = sum("cancelled_gmv");
  const rtoGmvTotal = sum("rto_gmv");
  const refundedAmountTotal = sum("refunded_amount");
  const leakage = cancelledGmvTotal + rtoGmvTotal + refundedAmountTotal;
  // Net GMV flows from orderRevenue (post-discount), matching the
  // per-day calculation above.
  const netGmv = orderRevenue - leakage;
  const totalEverShipped = sumInt("total_ever_shipped");
  const rtoInitiatedCount = sumInt("rto_initiated_count");
  const rtoDeliveredCount = sumInt("rto_delivered_count");
  const rtoPct =
    totalEverShipped > 0
      ? Number(
          (
            ((rtoInitiatedCount + rtoDeliveredCount) / totalEverShipped) *
            100
          ).toFixed(2),
        )
      : null;

  return {
    dateRange: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    grossGmv,
    discounts,
    orderRevenue,
    leakage,
    netGmv,
    totalOrders: sumInt("total_orders"),
    phases: {
      preShip: {
        unfulfilled: {
          count: sumInt("unfulfilled_count"),
          value: sum("unfulfilled_value"),
        },
        cancelledBeforeDispatch: {
          count: sumInt("cancelled_preship_count"),
          value: sum("cancelled_gmv"),
        },
      },
      transit: {
        shipped: {
          count: sumInt("shipped_count"),
          value: sum("shipped_value"),
        },
        outForDelivery: {
          count: sumInt("ofd_count"),
          value: sum("ofd_value"),
        },
        rtoInitiated: {
          count: rtoInitiatedCount,
          value: sum("rto_initiated_value"),
        },
        rtoDelivered: {
          count: rtoDeliveredCount,
          value: sum("rto_delivered_value"),
        },
        totalEverShipped,
        rtoPct,
      },
      postDelivery: {
        delivered: {
          count: sumInt("delivered_count"),
          value: sum("delivered_value"),
        },
        returnRequests: {
          count: sumInt("refunded_count"),
          value: sum("refunded_value"),
        },
        partialRefunds: {
          count: sumInt("partial_refund_count"),
          value: sum("partial_refund_value"),
        },
        exchanges: {
          count: null,
          value: null,
          note: "Exchange linkage not captured in current schema. Adding a shopify_source_order_id column is needed to populate this signal.",
        },
        netGmvExcludingExchanges: netGmv,
      },
      settled: {
        settledAmount: null,
        note: "Payment-gateway settlement data not yet integrated. Placeholder until a settlements table is wired up.",
      },
    },
    daily,
    computedAt: new Date().toISOString(),
  };
}
