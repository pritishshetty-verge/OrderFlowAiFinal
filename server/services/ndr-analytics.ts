import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// NDR Analytics — read-only aggregations for the NDR dashboard.
//
// ░░ ACCURACY INVARIANT ░░
// An order can raise MANY ndr_events — one per failed delivery attempt
// on different days (the webhook dedup only blocks ±5-min re-fires, not
// genuine re-attempts). On real data that's ~9 events per order in the
// worst case, and wildly uneven (seen: 40 events on one order). So any
// metric that COUNTS events or SUMS order value across events would
// double-count multi-attempt orders by that factor.
//
// Therefore every rate and every revenue figure here is computed
// PER DISTINCT ORDER. We collapse an order's events into a single row
// with one outcome before counting or summing. Reason frequency is the
// only intentionally per-order-latest view (an order's most recent
// failure reason), so the category/NSL totals equal the distinct-order
// count — no inflation anywhere.
//
// Outcome per order (from its events' resolution, which closeStaleNDR
// stamps uniformly per AWB):
//   delivered  if any event resolution='delivered'
//   else returned  if any resolution='returned'
//   else cancelled if any resolution='cancelled'
//   else open      (nothing resolved yet)
//
// Cohorts:
//   • NDR cohort      = orders with ≥1 ndr_event whose ndr_date ∈ window
//                       (drives conversion / RTO / revenue / reasons /
//                        actionable / resolution-time). Matches the
//                        ndr_date bucketing payroll already uses.
//   • Shipped cohort  = orders with an AWB whose shopify_created_at ∈
//                       window (denominator for Total NDR Rate).
//
// Freshness: numbers are only as current as the last reconcile-cron
// sweep (it keeps ndr_events.resolution + orders.status canonical).
// ─────────────────────────────────────────────────────────────────────

function rows(r: any): any[] {
  return (r?.rows ?? r ?? []) as any[];
}
function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function pct(numer: number, denom: number): number | null {
  if (!denom) return null;
  return Math.round((numer / denom) * 10000) / 100;
}

export interface NdrAnalyticsWindow {
  storeId: string;
  start: Date; // inclusive
  end: Date; // exclusive
}

// Reusable per-order NDR summary for the NDR cohort (ndr_date ∈ window).
// One row per order, with a single derived outcome. Every downstream
// query builds on this so nothing double-counts.
function ndrOrdersCte(storeId: string, startIso: string, endIso: string) {
  return sql`
    ndr_orders AS (
      SELECT
        n.order_id,
        MIN(n.ndr_date)                                   AS first_ndr_date,
        MAX(n.ndr_date)                                   AS last_ndr_date,
        MAX(n.resolved_at)                                AS resolved_at,
        COUNT(*)                                          AS attempts,
        CASE
          WHEN bool_or(n.resolution = 'delivered') THEN 'delivered'
          WHEN bool_or(n.resolution = 'returned')  THEN 'returned'
          WHEN bool_or(n.resolution = 'cancelled') THEN 'cancelled'
          ELSE 'open'
        END                                               AS outcome
      FROM ndr_events n
      WHERE n.store_id = ${storeId}
        AND n.ndr_date >= ${startIso}::timestamptz
        AND n.ndr_date <  ${endIso}::timestamptz
      GROUP BY n.order_id
    )
  `;
}

// ── 1. Headline KPIs ────────────────────────────────────────────────
//
// Two cohorts, deliberately:
//   • Total NDR Rate uses the SHIP cohort — of orders shipped in the
//     window, how many ever hit an NDR. Numerator ⊆ denominator, so
//     the rate is always ≤ 100%. (Counting NDRs by ndr_date against
//     shipped-by-created_at mixes cohorts and can exceed 100% — an
//     order shipped in August can NDR in September.)
//   • NDR→Delivery / NDR→RTO use the EVENT cohort — of NDRs raised in
//     the window, how they resolved. Delivered/returned are subsets of
//     ndrOrders, so these are ≤ 100% too, and the basis matches the
//     payroll metric (getBrandNDRDeliveryRate).
export interface NdrKpis {
  ordersShipped: number; // ship cohort: AWB + created in window
  shippedThatNdrd: number; // ship cohort ∩ ever-NDR → Total NDR Rate numerator
  ndrOrders: number; // event cohort: distinct orders with ndr_date in window
  totalEvents: number; // raw attempt count across event cohort (informational)
  avgAttemptsPerOrder: number | null;
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  openOrders: number;
  totalNdrRatePct: number | null;
  ndrToDeliveryPct: number | null;
  ndrToRtoPct: number | null;
}

export async function getNdrKpis(w: NdrAnalyticsWindow): Promise<NdrKpis> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();

  // Ship cohort + how many of those orders EVER raised an NDR. Both in
  // one query so the numerator is provably a subset of the denominator
  // (same shipped set, left-joined to any NDR for that order).
  const shippedRes: any = await db.execute(sql`
    WITH shipped AS (
      SELECT DISTINCT o.id
      FROM orders o
      JOIN shipments s ON s.order_id = o.id AND s.awb IS NOT NULL AND s.awb <> ''
      WHERE o.store_id = ${w.storeId}
        AND o.shopify_created_at >= ${startIso}::timestamptz
        AND o.shopify_created_at <  ${endIso}::timestamptz
    )
    SELECT
      COUNT(*)::int4 AS shipped,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM ndr_events n
        WHERE n.order_id = shipped.id AND n.store_id = ${w.storeId}
      ))::int4 AS shipped_ndrd
    FROM shipped
  `);
  const sr = rows(shippedRes)[0] ?? {};
  const ordersShipped = num(sr.shipped);
  const shippedThatNdrd = num(sr.shipped_ndrd);

  // Event cohort — per-order outcomes for NDRs raised in the window.
  const ndrRes: any = await db.execute(sql`
    WITH ${ndrOrdersCte(w.storeId, startIso, endIso)}
    SELECT
      COUNT(*)::int4                                        AS ndr_orders,
      COALESCE(SUM(attempts),0)::int4                       AS total_events,
      COUNT(*) FILTER (WHERE outcome = 'delivered')::int4   AS delivered,
      COUNT(*) FILTER (WHERE outcome = 'returned')::int4    AS returned,
      COUNT(*) FILTER (WHERE outcome = 'cancelled')::int4   AS cancelled,
      COUNT(*) FILTER (WHERE outcome = 'open')::int4        AS still_open
    FROM ndr_orders
  `);
  const r = rows(ndrRes)[0] ?? {};
  const ndrOrders = num(r.ndr_orders);
  const totalEvents = num(r.total_events);
  const deliveredOrders = num(r.delivered);
  const returnedOrders = num(r.returned);

  return {
    ordersShipped,
    shippedThatNdrd,
    ndrOrders,
    totalEvents,
    avgAttemptsPerOrder: ndrOrders ? Math.round((totalEvents / ndrOrders) * 10) / 10 : null,
    deliveredOrders,
    returnedOrders,
    cancelledOrders: num(r.cancelled),
    openOrders: num(r.still_open),
    totalNdrRatePct: pct(shippedThatNdrd, ordersShipped),
    ndrToDeliveryPct: pct(deliveredOrders, ndrOrders),
    ndrToRtoPct: pct(returnedOrders, ndrOrders),
  };
}

// ── 2. Revenue at Risk vs Saved vs Lost (per order, COD/prepaid) ────
export interface RevenueBand { atRisk: number; saved: number; lost: number; }
export interface RevenueAtRisk { cod: RevenueBand; prepaid: RevenueBand; total: RevenueBand; }

export async function getRevenueAtRisk(w: NdrAnalyticsWindow): Promise<RevenueAtRisk> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();
  // Join the PER-ORDER summary to orders exactly once, so each order's
  // total_price is counted a single time under its one outcome.
  const res: any = await db.execute(sql`
    WITH ${ndrOrdersCte(w.storeId, startIso, endIso)}
    SELECT
      CASE WHEN LOWER(COALESCE(o.payment_method,'')) LIKE '%cod%' THEN 'cod' ELSE 'prepaid' END AS pay_bucket,
      COALESCE(SUM(CAST(o.total_price AS numeric)) FILTER (WHERE no.outcome = 'open'), 0)       AS at_risk,
      COALESCE(SUM(CAST(o.total_price AS numeric)) FILTER (WHERE no.outcome = 'delivered'), 0)  AS saved,
      COALESCE(SUM(CAST(o.total_price AS numeric)) FILTER (WHERE no.outcome = 'returned'), 0)   AS lost
    FROM ndr_orders no
    JOIN orders o ON o.id = no.order_id
    GROUP BY 1
  `);
  const empty = (): RevenueBand => ({ atRisk: 0, saved: 0, lost: 0 });
  const out: RevenueAtRisk = { cod: empty(), prepaid: empty(), total: empty() };
  for (const row of rows(res)) {
    const band: RevenueBand = { atRisk: num(row.at_risk), saved: num(row.saved), lost: num(row.lost) };
    if (row.pay_bucket === "cod") out.cod = band;
    else out.prepaid = band;
  }
  out.total = {
    atRisk: out.cod.atRisk + out.prepaid.atRisk,
    saved: out.cod.saved + out.prepaid.saved,
    lost: out.cod.lost + out.prepaid.lost,
  };
  return out;
}

// ── 3. Reshipments (created vs delivered in window) ─────────────────
export interface ReshipmentStats { created: number; delivered: number; pending: number; cancelled: number; }

export async function getReshipmentStats(w: NdrAnalyticsWindow): Promise<ReshipmentStats> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();
  const createdRes: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                              AS created,
      COUNT(*) FILTER (WHERE courier_status = 'pending')::int4    AS pending,
      COUNT(*) FILTER (WHERE courier_status = 'cancelled')::int4  AS cancelled
    FROM reshipment_logs
    WHERE store_id = ${w.storeId}
      AND created_at >= ${startIso}::timestamptz
      AND created_at <  ${endIso}::timestamptz
  `);
  // Delivered keyed on the courier's real delivered_at via AWB so a
  // later admin touch can't shift the month bucket.
  const deliveredRes: any = await db.execute(sql`
    SELECT COUNT(DISTINCT rl.id)::int4 AS delivered
    FROM reshipment_logs rl
    JOIN shipments s ON s.awb = rl.tracking_awb
    WHERE rl.store_id = ${w.storeId}
      AND rl.courier_status = 'delivered'
      AND s.delivered_at >= ${startIso}::timestamptz
      AND s.delivered_at <  ${endIso}::timestamptz
  `);
  const c = rows(createdRes)[0] ?? {};
  return {
    created: num(c.created),
    pending: num(c.pending),
    cancelled: num(c.cancelled),
    delivered: num(rows(deliveredRes)[0]?.delivered),
  };
}

// ── 4. Geography — NDR rate by city / pincode (per order) ───────────
export interface GeoRow { key: string; ordersShipped: number; ndrs: number; ndrRatePct: number | null; }

async function getNdrByGeo(
  w: NdrAnalyticsWindow,
  column: "shipping_city" | "shipping_pincode",
  minOrders: number,
  limit: number,
): Promise<GeoRow[]> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();
  // Denominator: distinct shipped orders per geo (shipped cohort).
  // Numerator: of those, the distinct ones that raised ≥1 NDR in window.
  // Both are per distinct order — a multi-attempt order counts once.
  const res: any = await db.execute(sql`
    WITH shipped AS (
      SELECT DISTINCT o.id, NULLIF(TRIM(o.${sql.raw(column)}), '') AS geo
      FROM orders o
      JOIN shipments s ON s.order_id = o.id AND s.awb IS NOT NULL AND s.awb <> ''
      WHERE o.store_id = ${w.storeId}
        AND o.shopify_created_at >= ${startIso}::timestamptz
        AND o.shopify_created_at <  ${endIso}::timestamptz
    ),
    ndr_orders AS (
      SELECT DISTINCT n.order_id
      FROM ndr_events n
      WHERE n.store_id = ${w.storeId}
        AND n.ndr_date >= ${startIso}::timestamptz
        AND n.ndr_date <  ${endIso}::timestamptz
    )
    SELECT
      shipped.geo                                           AS key,
      COUNT(*)::int4                                        AS orders_shipped,
      COUNT(*) FILTER (WHERE no.order_id IS NOT NULL)::int4 AS ndrs
    FROM shipped
    LEFT JOIN ndr_orders no ON no.order_id = shipped.id
    WHERE shipped.geo IS NOT NULL
    GROUP BY shipped.geo
    HAVING COUNT(*) >= ${minOrders}
    ORDER BY
      (COUNT(*) FILTER (WHERE no.order_id IS NOT NULL))::numeric / NULLIF(COUNT(*),0) DESC,
      ndrs DESC
    LIMIT ${limit}
  `);
  return rows(res).map((r) => ({
    key: String(r.key),
    ordersShipped: num(r.orders_shipped),
    ndrs: num(r.ndrs),
    ndrRatePct: pct(num(r.ndrs), num(r.orders_shipped)),
  }));
}

export async function getNdrGeography(w: NdrAnalyticsWindow): Promise<{ byCity: GeoRow[]; byPincode: GeoRow[] }> {
  const [byCity, byPincode] = await Promise.all([
    getNdrByGeo(w, "shipping_city", 5, 15),
    getNdrByGeo(w, "shipping_pincode", 3, 15),
  ]);
  return { byCity, byPincode };
}

// ── 5. Reasons breakdown (per order, latest reason) ─────────────────
//
// One reason PER ORDER — the most recent failure reason on that order —
// so the category/NSL totals equal the distinct-order count instead of
// summing every attempt. (A parcel that failed "customer unavailable"
// 20 times is one order with that reason, not 20.)
export interface ReasonRow { key: string; count: number; sharePct: number | null; }

export async function getNdrReasons(w: NdrAnalyticsWindow): Promise<{ byCategory: ReasonRow[]; byNslCode: ReasonRow[] }> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();

  // Latest ndr_status per order via DISTINCT ON.
  const catRes: any = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (order_id)
             order_id,
             COALESCE(NULLIF(TRIM(ndr_status), ''), 'other') AS reason
      FROM ndr_events
      WHERE store_id = ${w.storeId}
        AND ndr_date >= ${startIso}::timestamptz
        AND ndr_date <  ${endIso}::timestamptz
      ORDER BY order_id, ndr_date DESC
    )
    SELECT reason AS key, COUNT(*)::int4 AS n
    FROM latest GROUP BY reason ORDER BY n DESC
  `);

  // NSL code: one per order (orders.nsl_code holds the latest), scoped
  // to orders that had an NDR in window.
  const nslRes: any = await db.execute(sql`
    WITH ndr_order_ids AS (
      SELECT DISTINCT order_id FROM ndr_events
      WHERE store_id = ${w.storeId}
        AND ndr_date >= ${startIso}::timestamptz
        AND ndr_date <  ${endIso}::timestamptz
    )
    SELECT COALESCE(NULLIF(TRIM(o.nsl_code), ''), 'unknown') AS key, COUNT(*)::int4 AS n
    FROM ndr_order_ids i
    JOIN orders o ON o.id = i.order_id
    GROUP BY 1 ORDER BY n DESC LIMIT 20
  `);

  const total = (list: any[]) => list.reduce((s, x) => s + num(x.n), 0);
  const toRows = (list: any[]): ReasonRow[] => {
    const t = total(list);
    return list.map((x) => ({ key: String(x.key), count: num(x.n), sharePct: pct(num(x.n), t) }));
  };
  return { byCategory: toRows(rows(catRes)), byNslCode: toRows(rows(nslRes)) };
}

// ── 6. Avg resolution time (per order) ──────────────────────────────
//
// Per order: resolved_at − FIRST ndr_date (total time from first
// failure to settlement), averaged. Not per-event, so a 20-attempt
// order contributes one data point, not 20.
// CAVEAT: for orders closed by the stale-cron/backfill, resolved_at may
// read as the sweep time rather than the true scan — exact going
// forward, directional for old backfilled rows.
export interface ResolutionTime {
  overallHours: number | null;
  deliveredHours: number | null;
  returnedHours: number | null;
  resolvedCount: number;
}

export async function getAvgResolutionTime(w: NdrAnalyticsWindow): Promise<ResolutionTime> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();
  const res: any = await db.execute(sql`
    WITH ${ndrOrdersCte(w.storeId, startIso, endIso)}
    SELECT
      COUNT(*) FILTER (WHERE outcome IN ('delivered','returned') AND resolved_at IS NOT NULL AND resolved_at >= first_ndr_date)::int4 AS resolved_count,
      AVG(EXTRACT(EPOCH FROM (resolved_at - first_ndr_date))/3600.0)
        FILTER (WHERE outcome IN ('delivered','returned') AND resolved_at IS NOT NULL AND resolved_at >= first_ndr_date)            AS overall_hours,
      AVG(EXTRACT(EPOCH FROM (resolved_at - first_ndr_date))/3600.0)
        FILTER (WHERE outcome = 'delivered' AND resolved_at IS NOT NULL AND resolved_at >= first_ndr_date)                          AS delivered_hours,
      AVG(EXTRACT(EPOCH FROM (resolved_at - first_ndr_date))/3600.0)
        FILTER (WHERE outcome = 'returned' AND resolved_at IS NOT NULL AND resolved_at >= first_ndr_date)                           AS returned_hours
    FROM ndr_orders
  `);
  const r = rows(res)[0] ?? {};
  const round1 = (v: any) => (v == null ? null : Math.round(num(v) * 10) / 10);
  return {
    resolvedCount: num(r.resolved_count),
    overallHours: round1(r.overall_hours),
    deliveredHours: round1(r.delivered_hours),
    returnedHours: round1(r.returned_hours),
  };
}

// ── 7. Actionable vs non-actionable (per order) ─────────────────────
export interface ActionableSplit {
  actionable: number;
  nonActionable: number;
  actionablePct: number | null;
  actionableRescued: number;
  actionableRescuePct: number | null;
}

export async function getActionableSplit(w: NdrAnalyticsWindow): Promise<ActionableSplit> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();
  const res: any = await db.execute(sql`
    WITH ${ndrOrdersCte(w.storeId, startIso, endIso)}
    SELECT
      COUNT(*) FILTER (WHERE o.is_actionable = true)::int4                                   AS actionable,
      COUNT(*) FILTER (WHERE o.is_actionable IS NOT TRUE)::int4                              AS non_actionable,
      COUNT(*) FILTER (WHERE o.is_actionable = true AND no.outcome = 'delivered')::int4      AS actionable_rescued
    FROM ndr_orders no
    JOIN orders o ON o.id = no.order_id
  `);
  const r = rows(res)[0] ?? {};
  const actionable = num(r.actionable);
  const nonActionable = num(r.non_actionable);
  const rescued = num(r.actionable_rescued);
  return {
    actionable,
    nonActionable,
    actionablePct: pct(actionable, actionable + nonActionable),
    actionableRescued: rescued,
    actionableRescuePct: pct(rescued, actionable),
  };
}

// ── 8. Open-NDR aging (per order, not window-scoped) ────────────────
//
// "What's on fire right now." One row per currently-open order; age is
// measured from its LAST attempt (days since we last tried), value
// counted once. Not window-scoped — it's live ops state.
export interface AgingBucket { bucket: string; count: number; valueAtRisk: number; }

export async function getOpenNdrAging(storeId: string): Promise<AgingBucket[]> {
  const res: any = await db.execute(sql`
    WITH open_orders AS (
      SELECT
        n.order_id,
        MAX(n.ndr_date) AS last_ndr_date
      FROM ndr_events n
      WHERE n.store_id = ${storeId}
      GROUP BY n.order_id
      -- order is open iff NONE of its events resolved
      HAVING bool_and(n.resolved = false)
    )
    SELECT
      CASE
        WHEN NOW() - oo.last_ndr_date < INTERVAL '1 day'  THEN '0-1d'
        WHEN NOW() - oo.last_ndr_date < INTERVAL '3 days' THEN '1-3d'
        WHEN NOW() - oo.last_ndr_date < INTERVAL '7 days' THEN '3-7d'
        WHEN NOW() - oo.last_ndr_date < INTERVAL '14 days' THEN '7-14d'
        ELSE '14d+'
      END AS bucket,
      COUNT(*)::int4 AS n,
      COALESCE(SUM(CAST(o.total_price AS numeric)), 0) AS value_at_risk
    FROM open_orders oo
    JOIN orders o ON o.id = oo.order_id
    GROUP BY 1
  `);
  const order = ["0-1d", "1-3d", "3-7d", "7-14d", "14d+"];
  const byBucket = new Map<string, AgingBucket>();
  for (const r of rows(res)) {
    byBucket.set(String(r.bucket), {
      bucket: String(r.bucket),
      count: num(r.n),
      valueAtRisk: num(r.value_at_risk),
    });
  }
  return order.map((b) => byBucket.get(b) ?? { bucket: b, count: 0, valueAtRisk: 0 });
}

// ── 9. NDR rate split by payment type (COD vs Prepaid) ──────────────
//
// COD is the dominant NDR driver in Indian D2C — customers refuse/ghost
// cash orders far more than prepaid. Ship cohort, per distinct order,
// same guarantee as Total NDR Rate (numerator ⊆ denominator).
export interface PaymentSplitRow { shipped: number; ndrd: number; ratePct: number | null; }
export interface PaymentSplit { cod: PaymentSplitRow; prepaid: PaymentSplitRow; }

export async function getNdrByPaymentType(w: NdrAnalyticsWindow): Promise<PaymentSplit> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();
  const res: any = await db.execute(sql`
    WITH shipped AS (
      SELECT DISTINCT o.id,
        CASE WHEN LOWER(COALESCE(o.payment_method,'')) LIKE '%cod%' THEN 'cod' ELSE 'prepaid' END AS pay
      FROM orders o
      JOIN shipments s ON s.order_id = o.id AND s.awb IS NOT NULL AND s.awb <> ''
      WHERE o.store_id = ${w.storeId}
        AND o.shopify_created_at >= ${startIso}::timestamptz
        AND o.shopify_created_at <  ${endIso}::timestamptz
    )
    SELECT
      pay,
      COUNT(*)::int4 AS shipped,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM ndr_events n WHERE n.order_id = shipped.id AND n.store_id = ${w.storeId}
      ))::int4 AS ndrd
    FROM shipped GROUP BY pay
  `);
  const mk = (): PaymentSplitRow => ({ shipped: 0, ndrd: 0, ratePct: null });
  const out: PaymentSplit = { cod: mk(), prepaid: mk() };
  for (const r of rows(res)) {
    const row: PaymentSplitRow = { shipped: num(r.shipped), ndrd: num(r.ndrd), ratePct: pct(num(r.ndrd), num(r.shipped)) };
    if (r.pay === "cod") out.cod = row; else out.prepaid = row;
  }
  return out;
}

// ── 10. Reattempt effectiveness ─────────────────────────────────────
//
// The NDR team's core action is scheduling reattempts. Of NDR orders
// where a reattempt was scheduled (any event), what fraction delivered.
// CAVEAT: only as reliable as how consistently the reattempt flow
// writes reattempt_scheduled today — if sparse, withReattempt will be
// low and the % noisy. Surfaced so you can also judge data coverage.
export interface Reattempt {
  withReattempt: number;
  reattemptDelivered: number;
  effectivenessPct: number | null;
  ndrOrders: number; // for coverage context
}

export async function getReattemptEffectiveness(w: NdrAnalyticsWindow): Promise<Reattempt> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();
  const res: any = await db.execute(sql`
    WITH ndr_orders AS (
      SELECT
        order_id,
        bool_or(reattempt_scheduled) AS had_reattempt,
        CASE
          WHEN bool_or(resolution = 'delivered') THEN 'delivered'
          WHEN bool_or(resolution = 'returned')  THEN 'returned'
          WHEN bool_or(resolution = 'cancelled') THEN 'cancelled'
          ELSE 'open'
        END AS outcome
      FROM ndr_events
      WHERE store_id = ${w.storeId}
        AND ndr_date >= ${startIso}::timestamptz
        AND ndr_date <  ${endIso}::timestamptz
      GROUP BY order_id
    )
    SELECT
      COUNT(*)::int4                                                          AS ndr_orders,
      COUNT(*) FILTER (WHERE had_reattempt)::int4                             AS with_reattempt,
      COUNT(*) FILTER (WHERE had_reattempt AND outcome = 'delivered')::int4   AS reattempt_delivered
    FROM ndr_orders
  `);
  const r = rows(res)[0] ?? {};
  const withReattempt = num(r.with_reattempt);
  const delivered = num(r.reattempt_delivered);
  return {
    withReattempt,
    reattemptDelivered: delivered,
    effectivenessPct: pct(delivered, withReattempt),
    ndrOrders: num(r.ndr_orders),
  };
}

// ── 11. Open-NDR drill-down list (actionable queue) ─────────────────
//
// The orders behind the aggregates — oldest-open first — so the team
// can actually chase them. Live (not window-scoped): these are the
// parcels on fire right now.
export interface OpenNdrRow {
  orderNumber: string | null;
  awb: string | null;
  customerName: string | null;
  customerPhone: string | null;
  city: string | null;
  reason: string | null;
  nslCode: string | null;
  isActionable: boolean;
  paymentType: string;
  value: number;
  attempts: number;
  daysOpen: number;
}

export async function getOpenNdrList(storeId: string, limit = 50): Promise<OpenNdrRow[]> {
  const res: any = await db.execute(sql`
    WITH open_orders AS (
      SELECT order_id, MAX(ndr_date) AS last_ndr, COUNT(*) AS attempts
      FROM ndr_events
      WHERE store_id = ${storeId}
      GROUP BY order_id
      HAVING bool_and(resolved = false)
    )
    SELECT
      o.shopify_order_number                                   AS order_number,
      s.awb                                                    AS awb,
      o.customer_name                                          AS customer_name,
      o.customer_phone                                         AS customer_phone,
      o.shipping_city                                          AS city,
      COALESCE(NULLIF(o.failure_reason,''), '')                AS reason,
      o.nsl_code                                               AS nsl_code,
      COALESCE(o.is_actionable, false)                         AS is_actionable,
      CASE WHEN LOWER(COALESCE(o.payment_method,'')) LIKE '%cod%' THEN 'COD' ELSE 'Prepaid' END AS payment_type,
      CAST(o.total_price AS numeric)                           AS value,
      oo.attempts                                              AS attempts,
      EXTRACT(EPOCH FROM (NOW() - oo.last_ndr)) / 86400.0      AS days_open
    FROM open_orders oo
    JOIN orders o ON o.id = oo.order_id
    LEFT JOIN shipments s ON s.order_id = o.id
    ORDER BY oo.last_ndr ASC
    LIMIT ${limit}
  `);
  return rows(res).map((r) => ({
    orderNumber: r.order_number ?? null,
    awb: r.awb ?? null,
    customerName: r.customer_name ?? null,
    customerPhone: r.customer_phone ?? null,
    city: r.city ?? null,
    reason: r.reason || null,
    nslCode: r.nsl_code ?? null,
    isActionable: !!r.is_actionable,
    paymentType: String(r.payment_type),
    value: num(r.value),
    attempts: num(r.attempts),
    daysOpen: Math.floor(num(r.days_open)),
  }));
}

// ── 12. Daily trend (for the hero area chart + KPI sparklines) ──────
//
// Per calendar day in the window: NEW NDR orders (first_ndr_date on
// that day — the inflow), plus how many orders FIRST-NDR'd that day
// eventually delivered vs went RTO (outcome of that day's cohort).
// Zero-filled across the whole window so the line has no gaps.
export interface TrendPoint { date: string; ndrs: number; delivered: number; rto: number; }

export async function getNdrDailyTrend(w: NdrAnalyticsWindow): Promise<TrendPoint[]> {
  const startIso = w.start.toISOString();
  const endIso = w.end.toISOString();
  const res: any = await db.execute(sql`
    WITH ${ndrOrdersCte(w.storeId, startIso, endIso)}
    SELECT
      to_char(date_trunc('day', first_ndr_date), 'YYYY-MM-DD')   AS day,
      COUNT(*)::int4                                             AS ndrs,
      COUNT(*) FILTER (WHERE outcome = 'delivered')::int4        AS delivered,
      COUNT(*) FILTER (WHERE outcome = 'returned')::int4         AS rto
    FROM ndr_orders
    GROUP BY 1
    ORDER BY 1
  `);
  const byDay = new Map<string, TrendPoint>();
  for (const r of rows(res)) {
    byDay.set(String(r.day), { date: String(r.day), ndrs: num(r.ndrs), delivered: num(r.delivered), rto: num(r.rto) });
  }
  // Zero-fill every day in [start, end). Cap at 180 points so a huge
  // range can't bloat the payload / choke the chart.
  const out: TrendPoint[] = [];
  const cur = new Date(Date.UTC(w.start.getUTCFullYear(), w.start.getUTCMonth(), w.start.getUTCDate()));
  const endDay = new Date(w.end);
  let guard = 0;
  while (cur < endDay && guard < 180) {
    const key = cur.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? { date: key, ndrs: 0, delivered: 0, rto: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard++;
  }
  return out;
}

// ── Previous-period comparison (for trend chips) ────────────────────
export interface PrevComparison {
  totalNdrRatePct: number | null;
  ndrToDeliveryPct: number | null;
  ndrToRtoPct: number | null;
  atRisk: number;
}

// ── Bundle ──────────────────────────────────────────────────────────
export interface NdrAnalyticsBundle {
  window: { start: string; end: string };
  kpis: NdrKpis;
  revenue: RevenueAtRisk;
  reshipments: ReshipmentStats;
  geography: { byCity: GeoRow[]; byPincode: GeoRow[] };
  reasons: { byCategory: ReasonRow[]; byNslCode: ReasonRow[] };
  resolutionTime: ResolutionTime;
  actionable: ActionableSplit;
  openAging: AgingBucket[];
  trend: TrendPoint[];
  prev: PrevComparison;
  paymentSplit: PaymentSplit;
  reattempt: Reattempt;
  openList: OpenNdrRow[];
}

export async function getNdrAnalyticsBundle(w: NdrAnalyticsWindow): Promise<NdrAnalyticsBundle> {
  // Preceding equal-length window, for period-over-period deltas.
  const spanMs = w.end.getTime() - w.start.getTime();
  const prevWindow: NdrAnalyticsWindow = {
    storeId: w.storeId,
    start: new Date(w.start.getTime() - spanMs),
    end: new Date(w.start.getTime()),
  };

  const [
    kpis, revenue, reshipments, geography, reasons, resolutionTime,
    actionable, openAging, trend, paymentSplit, reattempt, openList,
    prevKpis, prevRevenue,
  ] = await Promise.all([
    getNdrKpis(w),
    getRevenueAtRisk(w),
    getReshipmentStats(w),
    getNdrGeography(w),
    getNdrReasons(w),
    getAvgResolutionTime(w),
    getActionableSplit(w),
    getOpenNdrAging(w.storeId),
    getNdrDailyTrend(w),
    getNdrByPaymentType(w),
    getReattemptEffectiveness(w),
    getOpenNdrList(w.storeId, 50),
    getNdrKpis(prevWindow),
    getRevenueAtRisk(prevWindow),
  ]);

  return {
    window: { start: w.start.toISOString(), end: w.end.toISOString() },
    kpis,
    revenue,
    reshipments,
    geography,
    reasons,
    resolutionTime,
    actionable,
    openAging,
    trend,
    paymentSplit,
    reattempt,
    openList,
    prev: {
      totalNdrRatePct: prevKpis.totalNdrRatePct,
      ndrToDeliveryPct: prevKpis.ndrToDeliveryPct,
      ndrToRtoPct: prevKpis.ndrToRtoPct,
      atRisk: prevRevenue.total.atRisk,
    },
  };
}
