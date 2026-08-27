import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Payroll metric fetchers
//
// Used by GET /api/payroll/preview to pre-fill the payroll dashboard.
// Each function returns null/0 gracefully when the underlying data
// isn't available yet, leaving the admin to enter the value manually.
//
// Date convention: the caller passes (year, month, 1-indexed). We
// translate to half-open [startUtc, endUtc) bounds for SQL. Attendance
// `date` is stored as a UTC timestamp; orders carry IST-leaning fields
// (`processed_at`, `confirmed_at`). For orders we use IST bucketing
// to match the rest of the analytics surface (Pare convention).
// ─────────────────────────────────────────────────────────────────────

export type MonthRange = {
  start: Date; // inclusive
  end: Date; // exclusive (start of next month)
};

export function monthRangeUtc(year: number, month: number): MonthRange {
  // month is 1-indexed; Date constructor expects 0-indexed.
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

// ── Attendance ──────────────────────────────────────────────────────

export interface AttendanceMetrics {
  daysPresent: number; // distinct calendar days with a clock-in
  // Distinct calendar days where status is 'leave' (used for context;
  // not subtracted from base-pay denominator today).
  daysLeave: number;
}

export async function getAttendanceMetrics(
  userId: string,
  year: number,
  month: number,
): Promise<AttendanceMetrics> {
  const { start, end } = monthRangeUtc(year, month);
  const r: any = await db.execute(sql`
    SELECT
      COUNT(DISTINCT DATE(date)) FILTER (WHERE clock_in_time IS NOT NULL)::int4 AS days_present,
      COUNT(DISTINCT DATE(date)) FILTER (WHERE status = 'leave')::int4         AS days_leave
    FROM attendance
    WHERE user_id = ${userId}
      AND date >= ${start.toISOString()}::timestamptz
      AND date <  ${end.toISOString()}::timestamptz
  `);
  const row = ((r as any).rows ?? r)[0] ?? { days_present: 0, days_leave: 0 };
  return {
    daysPresent: row.days_present ?? 0,
    daysLeave: row.days_leave ?? 0,
  };
}

// ── Holidays (auto count of Fixed holidays in user's state) ──────────

/**
 * Count of Fixed holidays for the given state that fall on a Mon–Fri
 * within the month. Optional holidays are NOT auto-counted — admin
 * fills those in via override (employees self-elect up to 2/year per
 * the calendar PDF instructions).
 */
export async function getAutoPaidHolidaysCount(
  state: string,
  year: number,
  month: number,
): Promise<number> {
  const r: any = await db.execute(sql`
    SELECT COUNT(*)::int4 AS n
    FROM holidays
    WHERE state = ${state}
      AND type  = 'Fixed'
      AND EXTRACT(YEAR  FROM date) = ${year}
      AND EXTRACT(MONTH FROM date) = ${month}
      -- Only weekdays; weekends are already non-working so they don't
      -- contribute to the paid-holiday count.
      AND EXTRACT(DOW   FROM date) NOT IN (0, 6)
  `);
  return ((r as any).rows ?? r)[0]?.n ?? 0;
}

/**
 * Year-to-date count of paid holidays already claimed for this user
 * (sum of `paid_holidays_used` across prior months in the same year).
 * The caller uses this to enforce ANNUAL_PAID_HOLIDAY_CAP.
 */
export async function getYtdPaidHolidaysUsed(
  userId: string,
  year: number,
  upToMonthExclusive: number,
): Promise<number> {
  const r: any = await db.execute(sql`
    SELECT COALESCE(SUM(paid_holidays_used), 0)::int4 AS n
    FROM payroll_ledger
    WHERE user_id = ${userId}
      AND year   = ${year}
      AND month  < ${upToMonthExclusive}
  `);
  return ((r as any).rows ?? r)[0]?.n ?? 0;
}

// ── Confirmation delivery rate (per-agent) ───────────────────────────

/**
 * Personal delivery-rate percentage for an order-confirmation agent in
 * the given month. Definition:
 *
 *   numerator   = orders confirmed by this agent in `month` AND
 *                 final status = 'delivered'
 *   denominator = orders confirmed by this agent in `month`
 *
 * Returns null when the agent confirmed zero orders (avoids 0/0 making
 * a false "0% performance" reading on the dashboard).
 */
export async function getConfirmationDeliveryRatePct(
  userId: string,
  year: number,
  month: number,
): Promise<number | null> {
  const { start, end } = monthRangeUtc(year, month);
  const r: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                              AS confirmed,
      COUNT(*) FILTER (WHERE status = 'delivered')::int4          AS delivered
    FROM orders
    WHERE confirmed_by = ${userId}
      AND confirmed_at >= ${start.toISOString()}::timestamptz
      AND confirmed_at <  ${end.toISOString()}::timestamptz
  `);
  const row = ((r as any).rows ?? r)[0] ?? { confirmed: 0, delivered: 0 };
  if (!row.confirmed || row.confirmed === 0) return null;
  return round2((row.delivered / row.confirmed) * 100);
}

// ── Team delivery rate (global) ─────────────────────────────────────

/**
 * Store-wide delivery-rate percentage for the month. Definition:
 *
 *   numerator   = orders shopify_created_at in month AND status='delivered'
 *   denominator = orders shopify_created_at in month
 *
 * Used as the baseline for the NDR/RTO team-delivery bonus. Mirrors
 * Pare's "delivery rate" indicator at the team level.
 */
export async function getTeamDeliveryRatePct(
  year: number,
  month: number,
): Promise<number | null> {
  const { start, end } = monthRangeUtc(year, month);
  const r: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                       AS total,
      COUNT(*) FILTER (WHERE status = 'delivered')::int4   AS delivered
    FROM orders
    WHERE shopify_created_at >= ${start.toISOString()}::timestamptz
      AND shopify_created_at <  ${end.toISOString()}::timestamptz
  `);
  const row = ((r as any).rows ?? r)[0] ?? { total: 0, delivered: 0 };
  if (!row.total || row.total === 0) return null;
  return round2((row.delivered / row.total) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Brand-wide TDR — for store-level payroll bonus (Chandi) ─────────
//
// Total Delivery Rate for a store in a month. Same math as
// getTeamDeliveryRatePct above but store-scoped, because Chandi's
// bonus is per-store (the Compensation Breakdown PDF says "Total
// Delivery Rate of the Brand"). Returns null when the store had zero
// orders in the month so the tier logic sees "no data" instead of "0%".
export async function getBrandTDRPct(
  storeId: string,
  year: number,
  month: number,
): Promise<number | null> {
  const { start, end } = monthRangeUtc(year, month);
  const r: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                     AS total,
      COUNT(*) FILTER (WHERE status = 'delivered')::int4 AS delivered
    FROM orders
    WHERE store_id = ${storeId}
      AND shopify_created_at >= ${start.toISOString()}::timestamptz
      AND shopify_created_at <  ${end.toISOString()}::timestamptz
  `);
  const row = ((r as any).rows ?? r)[0] ?? { total: 0, delivered: 0 };
  if (!row.total) return null;
  return round2((row.delivered / row.total) * 100);
}

// ── Brand-wide NDR Delivery Rate — the headline payroll metric ──────
//
// From the Compensation Breakdown PDF:
//   NDR Delivery Rate = NDR Delivered Orders ÷ Total NDR Cases
//
// Concretely: of every ndr_events row created in the month, how many
// were later resolved as delivered (either the reattempt worked or
// the RTO wound up delivered anyway). Denominator = ndr_events created
// in that month for the store, numerator = the subset with
// resolution='delivered'. `resolved=false` rows count in the
// denominator with resolution=null in the numerator — the metric is
// forward-looking, so an in-flight NDR is neither a win nor a loss.
//
// The webhooks (delhiveryWebhook.ts / shiprocketWebhook.ts) write the
// resolved/resolution fields when a shipment reaches a terminal state.
// The nightly cron (server/cron/close-stale-ndr.ts) catches dropped
// webhooks. The one-shot backfill SQL closes historical rows so this
// query works for prior months too.
//
// Returns null when the store had zero NDR events in the month so
// the tier logic can distinguish "no work" from "worked, missed
// every one".
export interface BrandNDRDeliveryRate {
  ratePct: number | null;
  totalNdrs: number;
  deliveredNdrs: number;
  returnedNdrs: number;
  cancelledNdrs: number;
  openNdrs: number;
}

export async function getBrandNDRDeliveryRate(
  storeId: string,
  year: number,
  month: number,
): Promise<BrandNDRDeliveryRate> {
  const { start, end } = monthRangeUtc(year, month);
  const r: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                                     AS total,
      COUNT(*) FILTER (WHERE resolution = 'delivered')::int4             AS delivered,
      COUNT(*) FILTER (WHERE resolution = 'returned')::int4              AS returned,
      COUNT(*) FILTER (WHERE resolution = 'cancelled')::int4             AS cancelled,
      COUNT(*) FILTER (WHERE resolved = false)::int4                     AS still_open
    FROM ndr_events
    WHERE store_id = ${storeId}
      AND ndr_date >= ${start.toISOString()}::timestamptz
      AND ndr_date <  ${end.toISOString()}::timestamptz
  `);
  const row = ((r as any).rows ?? r)[0] ?? {
    total: 0, delivered: 0, returned: 0, cancelled: 0, still_open: 0,
  };
  const total = row.total ?? 0;
  return {
    ratePct: total ? round2((row.delivered / total) * 100) : null,
    totalNdrs: total,
    deliveredNdrs: row.delivered ?? 0,
    returnedNdrs: row.returned ?? 0,
    cancelledNdrs: row.cancelled ?? 0,
    openNdrs: row.still_open ?? 0,
  };
}

// ── Delivered GMV — for the Earned Commission (10%) profile ─────────
//
// Per the Compensation Breakdown PDF, Tanisha (ORDER_CONFIRMATION
// profile) earns 10% of Delivered GMV. GMV here = the sum of
// `total_price` on orders this agent CONFIRMED that eventually
// delivered — regardless of who fulfilled or handled the return
// downstream. Confirmed_at drives the month bucket (matches the
// existing getConfirmationDeliveryRatePct query).
export async function getDeliveredGMVForAgent(
  userId: string,
  storeId: string,
  year: number,
  month: number,
): Promise<number> {
  const { start, end } = monthRangeUtc(year, month);
  const r: any = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(total_price AS numeric)), 0)::numeric AS gmv
    FROM orders
    WHERE store_id     = ${storeId}
      AND confirmed_by = ${userId}
      AND status       = 'delivered'
      AND confirmed_at >= ${start.toISOString()}::timestamptz
      AND confirmed_at <  ${end.toISOString()}::timestamptz
  `);
  const row = ((r as any).rows ?? r)[0] ?? { gmv: 0 };
  return Number(row.gmv ?? 0);
}

// ── Reshipments delivered — for Chandi's per-reship bonus ───────────
//
// Count of reshipments whose courier_status reached 'delivered' in the
// month. Uses updated_at as the "when delivered" proxy because
// reshipment_logs doesn't store a dedicated delivered_at column and
// the delivered-status write always updates updated_at. Exclusive of
// cancelled reshipments (those never dispatched).
export async function getReshipmentsDeliveredCount(
  storeId: string,
  year: number,
  month: number,
): Promise<number> {
  const { start, end } = monthRangeUtc(year, month);
  const r: any = await db.execute(sql`
    SELECT COUNT(*)::int4 AS n
    FROM reshipment_logs
    WHERE store_id = ${storeId}
      AND courier_status = 'delivered'
      AND updated_at >= ${start.toISOString()}::timestamptz
      AND updated_at <  ${end.toISOString()}::timestamptz
  `);
  return ((r as any).rows ?? r)[0]?.n ?? 0;
}

// Tier calculators live in server/services/payroll.ts (TEAM_DELIVERY_TIERS,
// PERSONAL_RECOVERY_TIERS, RESHIP_BONUS_PER_UNIT) — they already match the
// Compensation Breakdown PDF exactly, so this module intentionally does not
// duplicate them. runPayrollMath() over there consumes the rates + counts
// this module returns.
