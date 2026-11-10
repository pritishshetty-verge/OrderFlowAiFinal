// Flo (Ops Copilot) — read-only ops tools: team, workload, calls, products,
// geography, stuck orders, system health, reshipments, reconciliation and
// learning. Same contract as tools.ts: READ-ONLY, always scoped to
// ctx.storeId, plain JSON out. Team/HR-ish tools are admin-only.
//
// Day boundaries for "today" are IST (Asia/Kolkata) — that's the team's
// working day. Reporting windows reuse the UTC month/trailing-days window
// from tools.ts so numbers line up with the other reports.

import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import type { CopilotToolContext } from "./tools";
import { rowsOf, num, money, pct, clamp, escapeLike, resolveWindow, windowHint, windowJson as winJson, MONTH_PROPS, humanAge } from "./util";

const isMissingTable = (e: any) => /does not exist/i.test(String(e?.message ?? e));

const NOT_SHIPPED = sql`('unfulfilled','pending','assigned','confirmed')`;
const IST_TODAY = sql`(now() AT TIME ZONE 'Asia/Kolkata')::date`;
// Timestamp columns are "timestamp without time zone" holding UTC wall time.
// Convert explicitly: `col AT TIME ZONE 'Asia/Kolkata'` alone would treat
// the UTC value as IST and shift it the wrong way.
const istDate = (col: SQL) => sql`((${col}) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date`;
/** Human IST timestamp text, independent of the Node process timezone. */
const istText = (col: SQL, fmt = "YYYY-MM-DD HH24:MI") =>
  sql`to_char((${col}) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', ${fmt})`;
/** Users who are members of this store. */
const storeMember = (ctx: CopilotToolContext, userCol: SQL) =>
  sql`EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id = ${userCol} AND us.store_id = ${ctx.storeId})`;

const adminOnly = (ctx: CopilotToolContext, what: string) =>
  ctx.isAdmin ? null : { error: `${what} is admin-only.` };

// ─────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────

export const OPS_TOOLS = [
  {
    name: "get_team_today",
    description:
      "Who in this store's team is working today (IST): clocked in/out times, on break now, auto-logged-out, not clocked in, on approved leave, plus any holiday today. Admin only.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_attendance_report",
    description:
      "Monthly attendance rollup per team member of this store: days present, auto-closed days, clocked hours, break minutes, idle minutes deducted, average hours/day. Defaults to the current month. Admin only.",
    input_schema: {
      type: "object",
      properties: { ...MONTH_PROPS },
      additionalProperties: false,
    },
  },
  {
    name: "get_leave_requests",
    description:
      "Leave requests for this store's team: pending ones awaiting review by default, or filter by status. Includes who's on leave in the coming days. Admin only.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "rejected", "all"], description: "Default pending." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_agent_workload",
    description:
      "Calling-team workload right now: per agent, orders awaiting confirmation, follow-ups due/overdue, and today's confirmations and cancellations (IST); plus how many orders are unassigned.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_followups_due",
    description:
      "Orders whose follow-up call is due today or overdue (IST), oldest first, with the agent, follow-up notes and attempt count. Optionally for one agent by name.",
    input_schema: {
      type: "object",
      properties: {
        agentName: { type: "string", description: "Optional agent name to filter by (partial match)." },
        limit: { type: "integer", description: "Max rows (default 20, max 50)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_call_stats",
    description:
      "IVR call activity in a calendar month or trailing window: calls by status, connect rate, average duration, and per-agent counts.",
    input_schema: {
      type: "object",
      properties: {
        ...MONTH_PROPS,
        days: { type: "integer", description: "Trailing window in days, if no month given (default 7, max 90)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_product_performance",
    description:
      "Product/SKU performance for orders placed in a calendar month or trailing window: units, revenue, orders, and per-product RTO and cancellation rates. Sort by units, revenue or rto_rate.",
    input_schema: {
      type: "object",
      properties: {
        ...MONTH_PROPS,
        days: { type: "integer", description: "Trailing window in days, if no month given (default 30, max 365)." },
        sortBy: { type: "string", enum: ["units", "revenue", "rto_rate"], description: "Default units." },
        limit: { type: "integer", description: "Max products (default 10, max 30)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_geo_performance",
    description:
      "Delivery performance by state, city or pincode for orders placed in a window: shipped, delivered, RTO, RTO rate, delivery rate, COD share. Use for 'where do we get the most RTO' questions.",
    input_schema: {
      type: "object",
      properties: {
        ...MONTH_PROPS,
        days: { type: "integer", description: "Trailing window in days, if no month given (default 60, max 365)." },
        groupBy: { type: "string", enum: ["state", "city", "pincode"], description: "Default state." },
        sortBy: { type: "string", enum: ["rto_rate", "volume"], description: "Default rto_rate." },
        minShipped: { type: "integer", description: "Ignore places with fewer shipped orders (default 20)." },
        limit: { type: "integer", description: "Max rows (default 10, max 30)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_stuck_orders",
    description:
      "Find orders that look stuck: unconfirmed for too long, confirmed but never shipped, label created (awb_assigned) but not picked up, and in transit / out for delivery / NDR with no courier update for days. Returns counts per bucket and the oldest examples.",
    input_schema: {
      type: "object",
      properties: {
        staleDays: { type: "integer", description: "Days without progress to count as stuck (default 3, max 60)." },
        lookbackDays: { type: "integer", description: "Only consider orders placed in the last N days (default 90, max 365)." },
        samplesPerBucket: { type: "integer", description: "Example orders per bucket (default 5, max 15)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_system_health",
    description:
      "Integration health: when the last order/courier event arrived, Shopify write-back sync failures, webhook errors, and the last payroll sync run. Use for 'is sync working' / 'why aren't orders coming in'. Admin only.",
    input_schema: {
      type: "object",
      properties: {
        hours: { type: "integer", description: "Look-back for error counts in hours (default 24, max 336)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_reshipments",
    description:
      "Reshipments (replacement orders) created in a calendar month or trailing window: counts by reason, urgency and courier status, and the most recent ones.",
    input_schema: {
      type: "object",
      properties: {
        ...MONTH_PROPS,
        days: { type: "integer", description: "Trailing window in days, if no month given (default 30, max 365)." },
        limit: { type: "integer", description: "Recent rows to list (default 10, max 30)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_reconciliation",
    description:
      "Prepaid payment reconciliation for orders placed in a window: prepaid orders vs payment-gateway settlements matched, settled amount, gateway fees, unmatched orders and unmatched settlement rows, last settlement file upload. Admin only.",
    input_schema: {
      type: "object",
      properties: {
        ...MONTH_PROPS,
        days: { type: "integer", description: "Trailing window in days, if no month given (default 30, max 365)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_learning_progress",
    description:
      "Learning Center and onboarding progress for this store's team: lessons completed out of published lessons, last activity, and onboarding checklist completion. Admin only.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Optional team member name (partial match)." },
      },
      additionalProperties: false,
    },
  },
] as const;

export const OPS_TOOL_NAMES = new Set<string>(OPS_TOOLS.map((t) => t.name));

export async function runOpsTool(name: string, input: any, ctx: CopilotToolContext): Promise<any> {
  switch (name) {
    case "get_team_today":
      return teamToday(ctx);
    case "get_attendance_report":
      return attendanceReport(input, ctx);
    case "get_leave_requests":
      return leaveRequests(input, ctx);
    case "get_agent_workload":
      return agentWorkload(ctx);
    case "get_followups_due":
      return followupsDue(input, ctx);
    case "get_call_stats":
      return callStats(input, ctx);
    case "get_product_performance":
      return productPerformance(input, ctx);
    case "get_geo_performance":
      return geoPerformance(input, ctx);
    case "get_stuck_orders":
      return stuckOrders(input, ctx);
    case "get_system_health":
      return systemHealth(input, ctx);
    case "get_reshipments":
      return reshipments(input, ctx);
    case "get_reconciliation":
      return reconciliation(input, ctx);
    case "get_learning_progress":
      return learningProgress(input, ctx);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/** Short status-line text for the panel while a tool runs. */
export function summarizeOpsTool(name: string, input: any): string | null {
  const win = input?.from || input?.month ? windowHint(input, 30) : null;
  switch (name) {
    case "get_team_today": return "Checking who's in today";
    case "get_attendance_report": return `Pulling attendance${win ? ` (${win})` : ""}`;
    case "get_leave_requests": return "Reading leave requests";
    case "get_agent_workload": return "Checking team workload";
    case "get_followups_due": return input?.agentName ? `Finding follow-ups for ${input.agentName}` : "Finding due follow-ups";
    case "get_call_stats": return `Pulling call stats (${win ?? `${input?.days ?? 7}d`})`;
    case "get_product_performance": return `Ranking products (${win ?? `${input?.days ?? 30}d`})`;
    case "get_geo_performance": return `Comparing ${input?.groupBy ?? "state"}s (${win ?? `${input?.days ?? 60}d`})`;
    case "get_stuck_orders": return "Looking for stuck orders";
    case "get_system_health": return "Checking integrations";
    case "get_reshipments": return `Reading reshipments (${win ?? `${input?.days ?? 30}d`})`;
    case "get_reconciliation": return `Reconciling payments (${win ?? `${input?.days ?? 30}d`})`;
    case "get_learning_progress": return "Checking learning progress";
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Team & attendance
// ─────────────────────────────────────────────────────────────────────

async function teamToday(ctx: CopilotToolContext) {
  const denied = adminOnly(ctx, "Team attendance");
  if (denied) return denied;
  const r = await db.execute(sql`
    SELECT u.full_name, u.role, u.presence_status, u.holiday_state,
           ${istText(sql`a.clock_in_time`, "HH12:MI AM")} AS clock_in_time,
           ${istText(sql`a.clock_out_time`, "HH12:MI AM")} AS clock_out_time,
           ${istText(sql`a.auto_closed_at`, "HH12:MI AM")} AS auto_closed_at, a.total_hours,
           EXISTS (SELECT 1 FROM attendance_breaks b
                   WHERE b.attendance_id = a.id AND b.break_start IS NOT NULL AND b.break_end IS NULL) AS on_break,
           EXISTS (SELECT 1 FROM leave_requests l
                   WHERE l.user_id = u.id AND l.status = 'approved'
                     AND ${IST_TODAY} BETWEEN ${istDate(sql`l.start_date`)} AND ${istDate(sql`l.end_date`)}) AS on_leave
    FROM users u
    LEFT JOIN attendance a ON a.user_id = u.id AND ${istDate(sql`a.date`)} = ${IST_TODAY}
    WHERE u.is_active = true AND ${storeMember(ctx, sql`u.id`)}
    ORDER BY u.full_name
  `);
  const hol = rowsOf(await db.execute(sql`
    SELECT name, state, type FROM holidays WHERE date = ${IST_TODAY}
  `).catch(() => ({ rows: [] })));

  const fmt = (t: any) => (t ? `${t} IST` : null);
  const working: any[] = [], onBreak: any[] = [], clockedOut: any[] = [], autoLoggedOut: any[] = [],
    notIn: any[] = [], onLeave: any[] = [];
  for (const u of rowsOf(r)) {
    const who = { name: u.full_name, role: u.role };
    if (u.on_leave) onLeave.push(who);
    else if (!u.clock_in_time) notIn.push(who);
    else if (u.auto_closed_at) autoLoggedOut.push({ ...who, in: fmt(u.clock_in_time), autoClosedAt: fmt(u.auto_closed_at) });
    else if (u.clock_out_time) clockedOut.push({ ...who, in: fmt(u.clock_in_time), out: fmt(u.clock_out_time), hours: num(u.total_hours) });
    else if (u.on_break) onBreak.push({ ...who, in: fmt(u.clock_in_time) });
    else working.push({ ...who, in: fmt(u.clock_in_time) });
  }
  return {
    date: "today (IST)",
    counts: {
      team: rowsOf(r).length, working: working.length, onBreak: onBreak.length, clockedOut: clockedOut.length,
      autoLoggedOut: autoLoggedOut.length, notClockedIn: notIn.length, onLeave: onLeave.length,
    },
    working, onBreak, clockedOut, autoLoggedOut, notClockedIn: notIn, onLeave,
    holidaysToday: hol,
    note: "Auto-logged-out = clocked out by the idle monitor, not signed out.",
  };
}

async function attendanceReport(input: any, ctx: CopilotToolContext) {
  const denied = adminOnly(ctx, "Attendance");
  if (denied) return denied;
  const now = new Date();
  const year = clamp(input?.year, now.getUTCFullYear(), 2020, 2100);
  const month = clamp(input?.month, now.getUTCMonth() + 1, 1, 12);
  const members = new Set(
    rowsOf(await db.execute(sql`SELECT user_id FROM user_stores WHERE store_id = ${ctx.storeId}`)).map((x) => x.user_id),
  );
  const report = await storage.getMonthlyAttendanceReport(year, month);
  const rows = report
    .filter((r) => members.has(r.userId))
    .map((r) => ({
      name: r.fullName,
      role: r.role,
      daysPresent: r.daysPresent,
      daysAutoClosed: r.daysAutoClosed,
      clockedHours: r.clockedHours,
      avgHoursPerDay: r.avgHoursPerDay,
      breakMinutes: r.breakMinutes,
      idleMinutesDeducted: r.idleMinutesDeducted,
    }));
  return { period: { year, month, basis: "IST days" }, count: rows.length, members: rows };
}

async function leaveRequests(input: any, ctx: CopilotToolContext) {
  const denied = adminOnly(ctx, "Leave requests");
  if (denied) return denied;
  const status = ["pending", "approved", "rejected", "all"].includes(input?.status) ? input.status : "pending";
  const statusCond = status === "all" ? sql`true` : sql`l.status = ${status}`;
  const r = await db.execute(sql`
    SELECT u.full_name, l.leave_type, l.status, l.reason,
           ${istDate(sql`l.start_date`)} AS start_date, ${istDate(sql`l.end_date`)} AS end_date,
           (${istDate(sql`l.end_date`)} - ${istDate(sql`l.start_date`)} + 1)::int4 AS days,
           ${istText(sql`l.created_at`)} AS requested_at, rv.full_name AS reviewed_by, l.review_note
    FROM leave_requests l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN users rv ON rv.id = l.reviewed_by
    WHERE ${statusCond} AND ${storeMember(ctx, sql`l.user_id`)}
      ${status === "pending" ? sql`` : sql`AND l.end_date >= now() - interval '60 days'`}
    ORDER BY l.start_date
    LIMIT 40
  `);
  const upcoming = rowsOf(await db.execute(sql`
    SELECT u.full_name, ${istDate(sql`l.start_date`)} AS start_date, ${istDate(sql`l.end_date`)} AS end_date, l.leave_type
    FROM leave_requests l JOIN users u ON u.id = l.user_id
    WHERE l.status = 'approved' AND ${storeMember(ctx, sql`l.user_id`)}
      AND ${istDate(sql`l.end_date`)} >= ${IST_TODAY} AND ${istDate(sql`l.start_date`)} <= ${IST_TODAY} + 14
    ORDER BY l.start_date
  `));
  return { filter: status, count: rowsOf(r).length, requests: rowsOf(r), approvedLeaveNext14Days: upcoming };
}

// ─────────────────────────────────────────────────────────────────────
// Calling team
// ─────────────────────────────────────────────────────────────────────

async function agentWorkload(ctx: CopilotToolContext) {
  const r = await db.execute(sql`
    SELECT u.full_name AS agent,
      COUNT(*) FILTER (WHERE o.status IN ${NOT_SHIPPED} AND o.call_status IN ('Pending','Follow Up'))::int4 AS awaiting_confirmation,
      COUNT(*) FILTER (WHERE o.call_status = 'Follow Up' AND o.followup_at IS NOT NULL
                         AND ${istDate(sql`o.followup_at`)} <= ${IST_TODAY}
                         AND o.status IN ${NOT_SHIPPED})::int4 AS followups_due,
      COUNT(*) FILTER (WHERE o.confirmed_at IS NOT NULL
                         AND ${istDate(sql`o.confirmed_at`)} = ${IST_TODAY})::int4 AS confirmed_today,
      COUNT(*) FILTER (WHERE o.cancelled_at IS NOT NULL
                         AND ${istDate(sql`o.cancelled_at`)} = ${IST_TODAY})::int4 AS cancelled_today
    FROM orders o
    JOIN users u ON u.id = o.assigned_to
    WHERE o.store_id = ${ctx.storeId} AND o.test_order = false
      AND o.shopify_created_at >= now() - interval '120 days'
    GROUP BY u.full_name
    HAVING COUNT(*) FILTER (WHERE o.status IN ${NOT_SHIPPED} AND o.call_status IN ('Pending','Follow Up')) > 0
        OR COUNT(*) FILTER (WHERE o.confirmed_at IS NOT NULL AND ${istDate(sql`o.confirmed_at`)} = ${IST_TODAY}) > 0
        OR COUNT(*) FILTER (WHERE o.cancelled_at IS NOT NULL AND ${istDate(sql`o.cancelled_at`)} = ${IST_TODAY}) > 0
    ORDER BY awaiting_confirmation DESC
  `);
  const un = rowsOf(await db.execute(sql`
    SELECT COUNT(*)::int4 AS n, ${istText(sql`MIN(shopify_created_at)`)} AS oldest
    FROM orders
    WHERE store_id = ${ctx.storeId} AND test_order = false AND assigned_to IS NULL
      AND status IN ${NOT_SHIPPED} AND call_status IN ('Pending','Follow Up')
      AND shopify_created_at >= now() - interval '120 days'
  `))[0];
  return {
    asOf: "now; 'today' = IST",
    unassignedAwaitingConfirmation: num(un?.n),
    oldestUnassigned: un?.oldest ?? null,
    agents: rowsOf(r),
    scope: "orders placed in the last 120 days that haven't shipped",
  };
}

async function followupsDue(input: any, ctx: CopilotToolContext) {
  const limit = clamp(input?.limit, 20, 1, 50);
  const agent = String(input?.agentName ?? "").trim();
  const agentCond = agent ? sql`AND u.full_name ILIKE ${"%" + escapeLike(agent) + "%"}` : sql``;
  const base = sql`
    FROM orders o
    LEFT JOIN users u ON u.id = o.assigned_to
    WHERE o.store_id = ${ctx.storeId} AND o.test_order = false
      AND o.call_status = 'Follow Up' AND o.status IN ${NOT_SHIPPED}
      AND o.followup_at IS NOT NULL
      AND ${istDate(sql`o.followup_at`)} <= ${IST_TODAY}
      ${agentCond}`;
  const [list, count] = await Promise.all([
    db.execute(sql`
      SELECT o.shopify_order_number AS order_number, o.customer_name, o.total_price, o.payment_method,
             ${istText(sql`o.followup_at`)} AS followup_at_ist, o.followup_notes, o.follow_up_attempts, u.full_name AS agent,
             (${IST_TODAY} - ${istDate(sql`o.followup_at`)})::int4 AS days_overdue
      ${base}
      ORDER BY o.followup_at ASC
      LIMIT ${limit}`),
    db.execute(sql`SELECT COUNT(*)::int4 AS n, COUNT(*) FILTER (WHERE u.id IS NULL)::int4 AS unassigned ${base}`),
  ]);
  const c = rowsOf(count)[0];
  return { totalDue: num(c?.n), unassigned: num(c?.unassigned), agentFilter: agent || null, followups: rowsOf(list) };
}

async function callStats(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 7, 90);
  if ("error" in w) return w;
  const range = sql`c.store_id = ${ctx.storeId}
    AND c.called_at >= ${w.start.toISOString()}::timestamptz AND c.called_at < ${w.end.toISOString()}::timestamptz`;
  const [byStatus, byAgent] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(c.call_status, 'unknown') AS status, COUNT(*)::int4 AS n,
             ROUND(AVG(NULLIF(c.call_duration, 0)))::int4 AS avg_duration_sec
      FROM calls c WHERE ${range} GROUP BY 1 ORDER BY n DESC`),
    db.execute(sql`
      SELECT COALESCE(u.full_name, 'unknown') AS agent, COUNT(*)::int4 AS calls,
             COUNT(*) FILTER (WHERE c.call_status IN ('connected','completed'))::int4 AS connected,
             COALESCE(SUM(c.call_duration), 0)::int4 AS talk_seconds,
             COUNT(DISTINCT c.order_id)::int4 AS orders_called
      FROM calls c LEFT JOIN users u ON u.id = c.agent_id
      WHERE ${range} GROUP BY 1 ORDER BY calls DESC LIMIT 20`),
  ]);
  const statuses = rowsOf(byStatus);
  const total = statuses.reduce((s, x) => s + num(x.n), 0);
  const connected = statuses.filter((x) => ["connected", "completed"].includes(x.status)).reduce((s, x) => s + num(x.n), 0);
  return {
    window: winJson(w),
    totalCalls: total,
    connectRatePct: pct(connected, total),
    byStatus: statuses,
    byAgent: rowsOf(byAgent),
    note: total === 0 ? "No IVR calls logged in this window (calls may be made outside the IVR integration)." : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Products & geography
// ─────────────────────────────────────────────────────────────────────

async function productPerformance(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 30, 365);
  if ("error" in w) return w;
  const limit = clamp(input?.limit, 10, 1, 30);
  const sortBy = ["units", "revenue", "rto_rate"].includes(input?.sortBy) ? input.sortBy : "units";
  const order =
    sortBy === "revenue" ? sql`revenue DESC` :
    sortBy === "rto_rate" ? sql`rto_rate DESC NULLS LAST, shipped_orders DESC` :
    sql`units DESC`;
  const r = await db.execute(sql`
    WITH items AS (
      SELECT COALESCE(NULLIF(oi.sku, ''), oi.product_name) AS product_key,
             MAX(oi.product_name) AS product_name, MAX(oi.sku) AS sku,
             oi.order_id, SUM(oi.quantity)::int4 AS qty,
             SUM(CAST(oi.total_price AS numeric) - COALESCE(CAST(oi.total_discount AS numeric), 0)) AS revenue,
             LOWER(MAX(o.status)) AS status
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.store_id = ${ctx.storeId} AND o.test_order = false
        AND o.shopify_created_at >= ${w.start.toISOString()}::timestamptz
        AND o.shopify_created_at <  ${w.end.toISOString()}::timestamptz
      GROUP BY 1, oi.order_id
    ), agg AS (
      SELECT product_key, MAX(product_name) AS product_name, MAX(sku) AS sku,
             SUM(qty) FILTER (WHERE status <> 'cancelled')::int4 AS units,
             ROUND(SUM(revenue) FILTER (WHERE status <> 'cancelled'), 2) AS revenue,
             COUNT(*)::int4 AS orders,
             COUNT(*) FILTER (WHERE status = 'cancelled')::int4 AS cancelled_orders,
             COUNT(*) FILTER (WHERE status NOT IN ('cancelled','unfulfilled','pending','assigned','confirmed'))::int4 AS shipped_orders,
             COUNT(*) FILTER (WHERE status = 'delivered')::int4 AS delivered_orders,
             COUNT(*) FILTER (WHERE status LIKE 'rto%')::int4 AS rto_orders
      FROM items GROUP BY product_key
    )
    SELECT *,
      CASE WHEN shipped_orders >= 10 THEN ROUND(rto_orders * 100.0 / shipped_orders, 2) END AS rto_rate,
      CASE WHEN orders > 0 THEN ROUND(cancelled_orders * 100.0 / orders, 2) END AS cancel_rate
    FROM agg
    ORDER BY ${order}
    LIMIT ${limit}
  `);
  return {
    window: winJson(w),
    sortBy,
    products: rowsOf(r),
    notes: "Revenue = line total minus line-level discount, excluding cancelled orders; order-level discounts and shipping are not allocated to products, so product revenue can exceed GMV. Free gifts show ₹0. rto_rate = RTO ÷ shipped orders containing the product, only shown with ≥10 shipped. Recent windows have parcels still in transit.",
  };
}

async function geoPerformance(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 60, 365);
  if ("error" in w) return w;
  const groupBy = ["state", "city", "pincode"].includes(input?.groupBy) ? input.groupBy : "state";
  const sortBy = input?.sortBy === "volume" ? "volume" : "rto_rate";
  const minShipped = clamp(input?.minShipped, 20, 1, 100000);
  const limit = clamp(input?.limit, 10, 1, 30);
  const col =
    groupBy === "pincode" ? sql`NULLIF(TRIM(o.shipping_pincode), '')` :
    groupBy === "city" ? sql`INITCAP(NULLIF(TRIM(o.shipping_city), ''))` :
    sql`INITCAP(NULLIF(TRIM(o.shipping_state), ''))`;
  const order = sortBy === "volume" ? sql`shipped DESC` : sql`rto_rate DESC NULLS LAST, shipped DESC`;
  const r = await db.execute(sql`
    WITH g AS (
      SELECT ${col} AS place, LOWER(o.status) AS status,
             (LOWER(COALESCE(o.payment_method, '')) LIKE '%cod%') AS is_cod
      FROM orders o
      WHERE o.store_id = ${ctx.storeId} AND o.test_order = false
        AND o.shopify_created_at >= ${w.start.toISOString()}::timestamptz
        AND o.shopify_created_at <  ${w.end.toISOString()}::timestamptz
    ), agg AS (
      SELECT place,
        COUNT(*) FILTER (WHERE status NOT IN ('cancelled','unfulfilled','pending','assigned','confirmed'))::int4 AS shipped,
        COUNT(*) FILTER (WHERE status = 'delivered')::int4 AS delivered,
        COUNT(*) FILTER (WHERE status LIKE 'rto%')::int4 AS rto,
        COUNT(*) FILTER (WHERE is_cod)::int4 AS cod_orders,
        COUNT(*)::int4 AS placed
      FROM g WHERE place IS NOT NULL GROUP BY place
    )
    SELECT place, placed, shipped, delivered, rto,
      ROUND(rto * 100.0 / NULLIF(shipped, 0), 2) AS rto_rate,
      ROUND(delivered * 100.0 / NULLIF(shipped, 0), 2) AS delivery_rate,
      ROUND(cod_orders * 100.0 / NULLIF(placed, 0), 2) AS cod_share
    FROM agg WHERE shipped >= ${minShipped}
    ORDER BY ${order}
    LIMIT ${limit}
  `);
  return {
    window: winJson(w),
    groupBy,
    sortBy,
    minShipped,
    rows: rowsOf(r),
    notes: "Rates are over shipped orders (placed − cancelled − never shipped). Recent windows understate delivery and RTO while parcels are in transit.",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Stuck orders & system health
// ─────────────────────────────────────────────────────────────────────

async function stuckOrders(input: any, ctx: CopilotToolContext) {
  const stale = clamp(input?.staleDays, 3, 1, 60);
  const lookback = clamp(input?.lookbackDays, 90, 7, 365);
  const samples = clamp(input?.samplesPerBucket, 5, 1, 15);
  const r = await db.execute(sql`
    WITH o AS (
      SELECT o.id, o.shopify_order_number, o.customer_name, o.total_price, o.payment_method,
             LOWER(o.status) AS status, o.call_status, o.courier_name, o.tracking_number,
             o.shopify_created_at, o.confirmed_at,
             COALESCE(s.status_updated_at, s.updated_at, o.updated_at) AS last_update
      FROM orders o
      LEFT JOIN shipments s ON s.order_id = o.id
      WHERE o.store_id = ${ctx.storeId} AND o.test_order = false
        AND o.shopify_created_at >= now() - make_interval(days => ${lookback})
    ), b AS (
      SELECT *,
        CASE
          WHEN status IN ('unfulfilled','pending','assigned') AND call_status IN ('Pending','Follow Up')
               AND shopify_created_at < now() - make_interval(days => ${stale}) THEN 'unconfirmed'
          WHEN status IN ('unfulfilled','pending','assigned','confirmed') AND call_status = 'Confirmed'
               AND COALESCE(confirmed_at, shopify_created_at) < now() - make_interval(days => ${stale}) THEN 'confirmed_not_shipped'
          WHEN status = 'awb_assigned' AND last_update < now() - make_interval(days => ${stale}) THEN 'label_not_picked_up'
          WHEN status IN ('in_transit','out_for_delivery','ndr','rto_initiated','shipped')
               AND last_update < now() - make_interval(days => ${stale}) THEN 'no_courier_update'
        END AS bucket
      FROM o
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY COALESCE(last_update, shopify_created_at)) AS rn,
             COUNT(*) OVER (PARTITION BY bucket) AS bucket_count,
             SUM(CAST(total_price AS numeric)) OVER (PARTITION BY bucket) AS bucket_value
      FROM b WHERE bucket IS NOT NULL
    )
    SELECT bucket, bucket_count, bucket_value, shopify_order_number, customer_name, total_price, payment_method,
           status, courier_name, tracking_number,
           ${istText(sql`shopify_created_at`)} AS placed_ist, ${istText(sql`last_update`)} AS last_update_ist,
           EXTRACT(DAY FROM now() - COALESCE(last_update, shopify_created_at))::int4 AS days_stale
    FROM ranked WHERE rn <= ${samples}
    ORDER BY bucket, rn
  `);
  const buckets: Record<string, any> = {};
  for (const row of rowsOf(r)) {
    const b = (buckets[row.bucket] ??= { count: num(row.bucket_count), value: money(row.bucket_value), oldest: [] });
    b.oldest.push({
      order: row.shopify_order_number, customer: row.customer_name, total: money(row.total_price),
      payment: row.payment_method, status: row.status, courier: row.courier_name, awb: row.tracking_number,
      placedIst: row.placed_ist, lastUpdateIst: row.last_update_ist, daysStale: num(row.days_stale),
    });
  }
  return {
    criteria: { staleDays: stale, lookbackDays: lookback },
    buckets,
    meaning: {
      unconfirmed: "not yet confirmed by a call and older than staleDays",
      confirmed_not_shipped: "confirmed but no AWB/shipment after staleDays",
      label_not_picked_up: "AWB assigned but no courier movement for staleDays (pickup missed, or status not syncing)",
      no_courier_update: "in transit / OFD / NDR with no tracking update for staleDays",
    },
    tip: "A large label_not_picked_up bucket usually means statuses aren't syncing; the 'Reconcile stale statuses' button on All Orders re-checks them.",
  };
}

async function systemHealth(input: any, ctx: CopilotToolContext) {
  const denied = adminOnly(ctx, "System health");
  if (denied) return denied;
  const hours = clamp(input?.hours, 24, 1, 336);
  const since = sql`now() - make_interval(hours => ${hours})`;
  const safe = async (q: SQL) => rowsOf(await db.execute(q).catch(() => ({ rows: [] })));

  const [lastOrder, sync, syncErrors, webhooks, inbound, payrollRun] = await Promise.all([
    safe(sql`SELECT ${istText(sql`MAX(created_at)`)} AS last_created_ist,
                    EXTRACT(EPOCH FROM (now() - (MAX(created_at) AT TIME ZONE 'UTC')))::int8 AS secs_since_last,
                    COUNT(*) FILTER (WHERE created_at >= ${since})::int4 AS received
             FROM orders WHERE store_id = ${ctx.storeId}`),
    safe(sql`SELECT sync_status, COUNT(*)::int4 AS n FROM shopify_sync_logs
             WHERE store_id = ${ctx.storeId} AND created_at >= ${since} GROUP BY 1`),
    safe(sql`SELECT sync_type, sync_action, LEFT(error_message, 300) AS error_message, retry_count, ${istText(sql`created_at`)} AS at_ist FROM shopify_sync_logs
             WHERE store_id = ${ctx.storeId} AND sync_status = 'failed' AND created_at >= ${since}
             ORDER BY created_at DESC LIMIT 5`),
    safe(sql`SELECT COUNT(*)::int4 AS n, COUNT(*) FILTER (WHERE error IS NOT NULL)::int4 AS errors,
                    ${istText(sql`MAX(created_at)`)} AS last_at_ist
             FROM webhook_logs WHERE store_id = ${ctx.storeId} AND created_at >= ${since}`),
    safe(sql`SELECT source, ${istText(sql`MAX(created_at)`)} AS last_at_ist,
                    EXTRACT(EPOCH FROM (now() - (MAX(created_at) AT TIME ZONE 'UTC')))::int8 AS secs_since_last,
                    COUNT(*) FILTER (WHERE created_at >= ${since})::int4 AS n
             FROM inbound_webhook_logs WHERE created_at >= now() - interval '30 days' GROUP BY 1`),
    safe(sql`SELECT year, month, mode, ok_count, failed_count, skipped_count, ${istText(sql`created_at`)} AS ran_at_ist
             FROM payroll_sync_runs ORDER BY created_at DESC LIMIT 1`),
  ]);
  const lo = lastOrder[0] ?? {};
  return {
    lookbackHours: hours,
    orders: {
      receivedInWindow: num(lo.received),
      lastOrderReceivedIst: lo.last_created_ist ?? null,
      lastOrderAge: lo.secs_since_last == null ? null : humanAge(num(lo.secs_since_last) / 60),
    },
    shopifyWriteBack: { byStatus: sync, recentFailures: syncErrors },
    shopifyWebhooks: webhooks[0] ?? null,
    courierEvents: inbound.map(({ secs_since_last, ...x }) => ({ ...x, lastEventAge: humanAge(num(secs_since_last) / 60) })),
    lastPayrollSyncRun: payrollRun[0] ?? null,
    note: "A long gap since the last order or courier event during business hours usually means a webhook or sync problem.",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Reshipments, reconciliation, learning
// ─────────────────────────────────────────────────────────────────────

async function reshipments(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 30, 365);
  if ("error" in w) return w;
  const limit = clamp(input?.limit, 10, 1, 30);
  const range = sql`store_id = ${ctx.storeId}
    AND created_at >= ${w.start.toISOString()}::timestamptz AND created_at < ${w.end.toISOString()}::timestamptz`;
  try {
    const [byReason, byStatus, recent] = await Promise.all([
      db.execute(sql`SELECT COALESCE(reason, 'unspecified') AS reason, COUNT(*)::int4 AS n,
                            COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL)::int4 AS cancelled
                     FROM reshipment_logs WHERE ${range} GROUP BY 1 ORDER BY n DESC`),
      db.execute(sql`SELECT COALESCE(courier_status, 'unknown') AS courier_status, urgency_type, COUNT(*)::int4 AS n
                     FROM reshipment_logs WHERE ${range} AND cancelled_at IS NULL GROUP BY 1, 2 ORDER BY n DESC`),
      db.execute(sql`SELECT original_shopify_order_name AS original_order, new_shopify_order_name AS new_order,
                            customer_name, reason, urgency_type, scheduled_date, payment_type,
                            courier_name, tracking_awb, courier_status, created_by_name, ${istText(sql`created_at`)} AS created_ist,
                            (cancelled_at IS NOT NULL) AS cancelled
                     FROM reshipment_logs WHERE ${range} ORDER BY created_at DESC LIMIT ${limit}`),
    ]);
    const reasons = rowsOf(byReason);
    return {
      window: winJson(w),
      total: reasons.reduce((s, x) => s + num(x.n), 0),
      byReason: reasons,
      byCourierStatus: rowsOf(byStatus),
      recent: rowsOf(recent),
    };
  } catch (e) {
    if (isMissingTable(e)) return { window: winJson(w), total: 0, note: "Reshipments aren't set up in this database yet." };
    throw e;
  }
}

async function reconciliation(input: any, ctx: CopilotToolContext) {
  const denied = adminOnly(ctx, "Reconciliation");
  if (denied) return denied;
  const w = resolveWindow(input, 30, 365);
  if ("error" in w) return w;
  try {
    const [orders, settle, unmatched, lastUpload] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int4 AS prepaid_orders,
               COALESCE(SUM(CAST(o.total_price AS numeric)), 0) AS prepaid_value,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM pg_settlements p WHERE p.order_id = o.id))::int4 AS matched_orders,
               COALESCE(SUM(CAST(o.total_price AS numeric)) FILTER (
                 WHERE NOT EXISTS (SELECT 1 FROM pg_settlements p WHERE p.order_id = o.id)), 0) AS unmatched_value
        FROM orders o
        WHERE o.store_id = ${ctx.storeId} AND o.test_order = false
          AND LOWER(COALESCE(o.payment_method, '')) NOT LIKE '%cod%' AND LOWER(o.status) <> 'cancelled'
          AND o.shopify_created_at >= ${w.start.toISOString()}::timestamptz
          AND o.shopify_created_at <  ${w.end.toISOString()}::timestamptz`),
      db.execute(sql`
        SELECT p.pg_name, COUNT(*)::int4 AS rows,
               COALESCE(SUM(CAST(p.settled_amount AS numeric)), 0) AS settled,
               COALESCE(SUM(CAST(p.fee_deducted AS numeric)), 0) AS fees,
               COALESCE(SUM(CAST(p.tax_on_fee AS numeric)), 0) AS tax_on_fees
        FROM pg_settlements p JOIN orders o ON o.id = p.order_id
        WHERE p.store_id = ${ctx.storeId}
          AND o.shopify_created_at >= ${w.start.toISOString()}::timestamptz
          AND o.shopify_created_at <  ${w.end.toISOString()}::timestamptz
        GROUP BY 1`),
      db.execute(sql`
        SELECT pg_name, COUNT(*)::int4 AS n, COALESCE(SUM(CAST(settled_amount AS numeric)), 0) AS amount
        FROM pg_settlements
        WHERE store_id = ${ctx.storeId} AND order_id IS NULL
          AND created_at >= ${w.start.toISOString()}::timestamptz
        GROUP BY 1`),
      db.execute(sql`
        SELECT pg_name, file_name, status, parsed_rows, rows_inserted, error_count, ${istText(sql`created_at`)} AS uploaded_ist
        FROM recon_uploads WHERE store_id = ${ctx.storeId} ORDER BY created_at DESC LIMIT 1`),
    ]);
    const o = rowsOf(orders)[0] ?? {};
    return {
      window: winJson(w),
      prepaidOrders: num(o.prepaid_orders),
      prepaidValue: money(o.prepaid_value),
      matchedOrders: num(o.matched_orders),
      matchedPct: pct(num(o.matched_orders), num(o.prepaid_orders)),
      unmatchedOrderValue: money(o.unmatched_value),
      settlementsByGateway: rowsOf(settle).map((x) => ({
        gateway: x.pg_name, rows: num(x.rows), settled: money(x.settled), fees: money(x.fees), taxOnFees: money(x.tax_on_fees),
      })),
      unmatchedSettlementRows: rowsOf(unmatched),
      lastUpload: rowsOf(lastUpload)[0] ?? null,
      notes: "Covers prepaid (gateway) orders only. COD remittance isn't tracked in OrderFlow. Unmatched usually means the settlement file for that period hasn't been uploaded yet.",
    };
  } catch (e) {
    if (isMissingTable(e)) return { window: winJson(w), note: "Payment reconciliation isn't set up in this database yet (no settlement tables)." };
    throw e;
  }
}

async function learningProgress(input: any, ctx: CopilotToolContext) {
  const denied = adminOnly(ctx, "Learning progress");
  if (denied) return denied;
  const name = String(input?.name ?? "").trim();
  const nameCond = name ? sql`AND u.full_name ILIKE ${"%" + escapeLike(name) + "%"}` : sql``;
  const r = await db.execute(sql`
    WITH published AS (
      SELECT l.id FROM lessons l JOIN courses c ON c.id = l.course_id
      WHERE l.is_published = true AND c.is_published = true
    )
    SELECT u.full_name, u.role,
      (SELECT COUNT(*) FROM published)::int4 AS lessons_published,
      COUNT(p.id) FILTER (WHERE p.is_completed AND p.lesson_id IN (SELECT id FROM published))::int4 AS lessons_completed,
      COALESCE(SUM(p.time_spent), 0)::int4 AS seconds_spent,
      ${istText(sql`MAX(p.last_accessed_at)`, "YYYY-MM-DD")} AS last_activity,
      (SELECT ROUND(AVG(op.completion_percentage)) FROM user_onboarding_progress op WHERE op.user_id = u.id)::int4 AS onboarding_pct,
      (SELECT bool_and(op.is_completed) FROM user_onboarding_progress op WHERE op.user_id = u.id) AS onboarding_done
    FROM users u
    LEFT JOIN user_lesson_progress p ON p.user_id = u.id
    WHERE u.is_active = true AND ${storeMember(ctx, sql`u.id`)} ${nameCond}
    GROUP BY u.id, u.full_name, u.role
    ORDER BY lessons_completed ASC, u.full_name
  `);
  return {
    members: rowsOf(r).map((x) => ({
      name: x.full_name,
      role: x.role,
      lessonsCompleted: num(x.lessons_completed),
      lessonsPublished: num(x.lessons_published),
      completionPct: pct(num(x.lessons_completed), num(x.lessons_published)),
      minutesSpent: Math.round(num(x.seconds_spent) / 60),
      lastActivity: x.last_activity,
      onboardingPct: x.onboarding_pct,
      onboardingDone: x.onboarding_done,
    })),
  };
}
