// Flo (Ops Copilot) — read-only tool layer (v1). More tools in tools-ops.ts.
//
// Every tool here is READ-ONLY. It wraps existing OrderFlow services/queries and
// is always executed under a resolved store scope (ctx.storeId) + the requesting
// user. No tool mutates data. Write actions arrive in M2 behind confirmation.

import { sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { getDelhiveryClient } from "../delhivery";
import {
  getNdrAnalyticsBundle,
  getOpenNdrList,
} from "../ndr-analytics";
import {
  getConfirmationDeliveryRatePct,
  getDeliveredGMVForAgent,
  getBrandNDRDeliveryRate,
} from "../payroll-metrics";
import { OPS_TOOLS, OPS_TOOL_NAMES, runOpsTool } from "./tools-ops";
import { SQL_TOOLS, SQL_TOOL_NAMES, runSqlTool } from "./tools-sql";
import { ACTION_TOOLS, ACTION_TOOL_NAMES, runActionTool } from "./actions";
import { rowsOf, num, money, pct, clamp, escapeLike, resolveWindow, MONTH_PROPS } from "./util";

export interface CopilotToolContext {
  storeId: string;
  /** Display name of the store, for the prompt. */
  storeName?: string | null;
  userId: string;
  isAdmin: boolean;
}

/** Anthropic tool definitions (read-only). */
const CORE_TOOLS = [
  {
    name: "get_order",
    description:
      "Look up a single order by its order number (e.g. '15667' or '#15667'). Returns customer, address, status, payment, courier/AWB, and any NDR failure info from OrderFlow's own database.",
    input_schema: {
      type: "object",
      properties: {
        orderNumber: {
          type: "string",
          description: "The Shopify order number, with or without a leading '#'.",
        },
      },
      required: ["orderNumber"],
      additionalProperties: false,
    },
  },
  {
    name: "track_shipment",
    description:
      "Get live courier tracking for an order (by order number) or directly by AWB. Calls Delhivery for the current scan status and recent activity.",
    input_schema: {
      type: "object",
      properties: {
        orderNumber: { type: "string", description: "Order number to resolve the AWB from." },
        awb: { type: "string", description: "AWB / tracking number, if already known." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_orders",
    description:
      "Search recent orders in this store by free text (matches order number, customer name or phone) and/or filters. Returns a compact list. Use for questions like 'orders for 98xxxxxxx' or 'cancelled COD orders'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text: order number, customer name, or phone." },
        status: {
          type: "string",
          description:
            "Status filter (optional): unfulfilled, assigned, confirmed, awb_assigned, in_transit, out_for_delivery, ndr, delivered, rto (any RTO), rto_initiated, rto_delivered, cancelled.",
        },
        callStatus: {
          type: "string",
          description: "Call status filter: Pending, Confirmed, Cancelled, Follow Up (optional).",
        },
        paymentMethod: { type: "string", description: "'cod' or 'prepaid' (optional)." },
        limit: { type: "integer", description: "Max rows (default 20, max 50)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_ndr_summary",
    description:
      "Get aggregate NDR analytics for this store for a calendar month or trailing window (KPIs, revenue at risk, top reasons, reshipment stats). Use for 'how are NDRs doing' type questions.",
    input_schema: {
      type: "object",
      properties: {
        ...MONTH_PROPS,
        days: { type: "integer", description: "Trailing window in days, if no month given (default 30, max 180)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_open_ndrs",
    description:
      "List currently open (unresolved) NDR orders for this store, newest/most urgent first, with reason, AWB, days open and value.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Max rows (default 25, max 100)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "check_pincode",
    description: "Check whether a pincode is serviceable by Delhivery for this store.",
    input_schema: {
      type: "object",
      properties: {
        pincode: { type: "string", description: "6-digit Indian pincode." },
      },
      required: ["pincode"],
      additionalProperties: false,
    },
  },
  {
    name: "get_delivery_rate",
    description:
      "Store delivery rate for a calendar month or a trailing window, keyed on order PLACED date. Headline = Delivered ÷ Shipped (Shipped = placed − cancelled − never shipped). Also returns Delivered ÷ (Delivered + RTO), the full status breakdown, and whether the window is mature (recent windows still have parcels in transit, so the rate reads low).",
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
    name: "get_sales_summary",
    description:
      "Order volume and revenue for a calendar month or trailing window: orders placed, GMV, net GMV after cancellations, AOV, COD vs prepaid split, cancellations.",
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
    name: "get_payroll",
    description:
      "Payroll cycle for a month in this store: cycle status (draft/approved), total payout, and per-employee base pay, incentives, additions and final payout. Admin only.",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "Year (defaults to current)." },
        month: { type: "integer", description: "Month 1-12 (defaults to current)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_returns_summary",
    description:
      "Customer return requests (RMAs) created in a calendar month or trailing window: counts by status, top return reasons, total refund amount.",
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
    name: "get_abandoned_carts",
    description:
      "Abandoned checkouts in a calendar month or trailing window: count, cart value, how many converted/recovered, and the telecalling recovery-status split.",
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
    name: "get_employee_performance",
    description:
      "Get a team member's performance for a month (confirmation delivery rate and delivered GMV). Match by name. Defaults to the current month.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Employee name (full or partial)." },
        year: { type: "integer", description: "Year, e.g. 2026 (optional, defaults to current)." },
        month: { type: "integer", description: "Month 1-12 (optional, defaults to current)." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
] as const;

/** Every tool Flo can call: the core order/report tools plus the ops tools. */
// Order matters for prompt caching: keep it deterministic.
export const COPILOT_TOOLS = [...CORE_TOOLS, ...OPS_TOOLS, ...SQL_TOOLS, ...ACTION_TOOLS];

const normalizeOrderNumber = (s: string): string =>
  String(s ?? "").trim().replace(/^#/, "");

/** Dispatch a read-only tool call. Returns a plain JSON-serializable object. */
export async function runCopilotTool(
  name: string,
  input: any,
  ctx: CopilotToolContext,
): Promise<any> {
  switch (name) {
    case "get_order":
      return getOrder(input?.orderNumber, ctx);
    case "track_shipment":
      return trackShipment(input, ctx);
    case "search_orders":
      return searchOrders(input, ctx);
    case "get_ndr_summary":
      return ndrSummary(input, ctx);
    case "get_open_ndrs":
      return openNdrs(input, ctx);
    case "check_pincode":
      return checkPincode(input?.pincode, ctx);
    case "get_employee_performance":
      return employeePerformance(input, ctx);
    case "get_delivery_rate":
      return deliveryRate(input, ctx);
    case "get_sales_summary":
      return salesSummary(input, ctx);
    case "get_payroll":
      return payroll(input, ctx);
    case "get_returns_summary":
      return returnsSummary(input, ctx);
    case "get_abandoned_carts":
      return abandonedCarts(input, ctx);
    default:
      if (OPS_TOOL_NAMES.has(name)) return runOpsTool(name, input, ctx);
      if (SQL_TOOL_NAMES.has(name)) return runSqlTool(name, input, ctx);
      if (ACTION_TOOL_NAMES.has(name)) return runActionTool(name, input, ctx);
      return { error: `Unknown tool: ${name}` };
  }
}

async function getOrder(orderNumberRaw: string, ctx: CopilotToolContext) {
  const num = normalizeOrderNumber(orderNumberRaw);
  if (!num) return { error: "orderNumber is required" };
  const r = await db.execute(sql`
    SELECT shopify_order_number, customer_name, customer_phone, customer_email,
           shipping_city, shipping_state, shipping_pincode,
           status, call_status, financial_status, payment_method,
           total_price, currency, items_summary, items_count,
           courier_name, tracking_number, shipment_status,
           nsl_code, failure_reason, is_actionable, last_failed_at,
           assigned_to, shopify_created_at, created_at
    FROM orders
    WHERE store_id = ${ctx.storeId}
      AND replace(shopify_order_number, '#', '') = ${num}
    ORDER BY shopify_created_at DESC
    LIMIT 5
  `);
  const rows = rowsOf(r);
  if (rows.length === 0) return { found: false, orderNumber: num };
  return { found: true, count: rows.length, orders: rows };
}

async function trackShipment(input: any, ctx: CopilotToolContext) {
  let awb: string | null = input?.awb ? String(input.awb).trim() : null;
  let orderNumber: string | null = null;
  if (!awb && input?.orderNumber) {
    const num = normalizeOrderNumber(input.orderNumber);
    orderNumber = num;
    const r = await db.execute(sql`
      SELECT tracking_number, courier_name, shipment_status
      FROM orders
      WHERE store_id = ${ctx.storeId}
        AND replace(shopify_order_number, '#', '') = ${num}
      ORDER BY shopify_created_at DESC
      LIMIT 1
    `);
    const row = rowsOf(r)[0];
    if (!row) return { error: `No order found for #${num}` };
    awb = row.tracking_number ? String(row.tracking_number).trim() : null;
    if (!awb) {
      return {
        orderNumber: num,
        courier: row.courier_name ?? null,
        localStatus: row.shipment_status ?? null,
        tracking: null,
        note: "Order has no AWB yet (not shipped).",
      };
    }
  }
  if (!awb) return { error: "Provide an orderNumber or awb" };
  try {
    const client = await getDelhiveryClient(ctx.storeId);
    const t = await client.trackShipment(awb);
    return { orderNumber, awb, tracking: t };
  } catch (e: any) {
    return { orderNumber, awb, error: e?.message ?? "Tracking lookup failed" };
  }
}

async function searchOrders(input: any, ctx: CopilotToolContext) {
  const limit = clamp(input?.limit, 20, 1, 50);
  const q = input?.query ? String(input.query).trim() : "";
  const like = `%${escapeLike(q.replace(/^#/, ""))}%`;
  const conds: any[] = [sql`store_id = ${ctx.storeId}`];
  if (q) {
    conds.push(sql`(
      replace(shopify_order_number, '#', '') ILIKE ${like}
      OR customer_name ILIKE ${like}
      OR customer_phone ILIKE ${like}
    )`);
  }
  if (input?.status) {
    // Accept loose wording: "RTO" → any rto_* status, "in transit" → in_transit.
    const st = String(input.status).trim().toLowerCase().replace(/[\s-]+/g, "_");
    conds.push(st === "rto" ? sql`LOWER(status) LIKE 'rto%'` : sql`LOWER(status) = ${st}`);
  }
  if (input?.callStatus) conds.push(sql`LOWER(call_status) = ${String(input.callStatus).trim().toLowerCase()}`);
  // Stored values vary ("cod", "Cash on Delivery (COD)", "PayU", "manual (PayU)", ...).
  if (input?.paymentMethod) {
    const isCod = String(input.paymentMethod).toLowerCase().includes("cod");
    conds.push(isCod
      ? sql`LOWER(COALESCE(payment_method, '')) LIKE '%cod%'`
      : sql`LOWER(COALESCE(payment_method, '')) NOT LIKE '%cod%'`);
  }
  let where = conds[0];
  for (let i = 1; i < conds.length; i++) where = sql`${where} AND ${conds[i]}`;
  const r = await db.execute(sql`
    SELECT shopify_order_number, customer_name, customer_phone,
           shipping_city, status, call_status, payment_method,
           total_price, currency, courier_name, tracking_number,
           shipment_status, shopify_created_at
    FROM orders
    WHERE ${where}
    ORDER BY shopify_created_at DESC
    LIMIT ${limit}
  `);
  const rows = rowsOf(r);
  return { count: rows.length, orders: rows };
}

async function ndrSummary(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 30, 180);
  if ("error" in w) return w;
  const { start, end, label } = w;
  const bundle = await getNdrAnalyticsBundle({ storeId: ctx.storeId, start, end });
  // Trim to the fields that matter for a chat answer — the full bundle is large.
  return {
    window: { start: start.toISOString(), end: end.toISOString(), label },
    kpis: bundle.kpis,
    revenue: bundle.revenue,
    reshipments: bundle.reshipments,
    topReasons: bundle.reasons?.byCategory?.slice(0, 6) ?? [],
    reasonsNotCaptured: bundle.reasons?.notCaptured ?? null,
    noReattemptInstruction: bundle.reasons?.noReattemptInstruction ?? null,
    // Aging covers every open order; openList is capped for payload size.
    openNdrCount: bundle.openAging.reduce((s, a) => s + a.count, 0),
  };
}

async function openNdrs(input: any, ctx: CopilotToolContext) {
  const limit = clamp(input?.limit, 25, 1, 100);
  const rows = await getOpenNdrList(ctx.storeId, limit);
  return { count: rows.length, openNdrs: rows };
}

async function checkPincode(pincodeRaw: string, ctx: CopilotToolContext) {
  const pin = String(pincodeRaw ?? "").trim();
  if (!/^\d{6}$/.test(pin)) return { error: "pincode must be 6 digits" };
  try {
    const client = await getDelhiveryClient(ctx.storeId);
    const res = await client.checkPincodeServiceability(pin);
    return { pincode: pin, ...res };
  } catch (e: any) {
    return { pincode: pin, error: e?.message ?? "Serviceability check failed" };
  }
}

async function employeePerformance(input: any, ctx: CopilotToolContext) {
  const name = String(input?.name ?? "").trim().toLowerCase();
  if (!name) return { error: "name is required" };
  const now = new Date();
  const year = clamp(input?.year, now.getUTCFullYear(), 2020, 2100);
  const month = clamp(input?.month, now.getUTCMonth() + 1, 1, 12);

  // Prefer members of this store; fall back to everyone if none match.
  const memberIds = new Set(
    rowsOf(await db.execute(sql`SELECT user_id FROM user_stores WHERE store_id = ${ctx.storeId}`)).map((x) => x.user_id),
  );
  const allUsers = await storage.listUsers({ isActive: true });
  const inStore = allUsers.filter((u) => memberIds.has(u.id));
  const nameMatch = (u: (typeof allUsers)[number]) => {
    const full = (u.fullName ?? "").toLowerCase();
    const uname = (u.username ?? "").toLowerCase();
    return full.includes(name) || uname.includes(name);
  };
  const users = inStore.some(nameMatch) ? inStore : allUsers;
  const matches = users.filter((u) => {
    const full = (u.fullName ?? "").toLowerCase();
    const uname = (u.username ?? "").toLowerCase();
    return full.includes(name) || uname.includes(name);
  });
  if (matches.length === 0) return { found: false, name: input?.name };
  if (matches.length > 1) {
    return {
      found: false,
      ambiguous: true,
      candidates: matches.map((u) => ({ name: u.fullName, username: u.username, role: u.role })),
    };
  }
  const u = matches[0];
  const [confirmationRate, deliveredGmv, brandNdr] = await Promise.all([
    getConfirmationDeliveryRatePct(u.id, year, month).catch(() => null),
    getDeliveredGMVForAgent(u.id, ctx.storeId, year, month).catch(() => null),
    getBrandNDRDeliveryRate(ctx.storeId, year, month).catch(() => null),
  ]);
  return {
    found: true,
    employee: { name: u.fullName, username: u.username, role: u.role, compensationProfile: u.compensationProfile },
    period: { year, month },
    confirmationDeliveryRatePct: confirmationRate,
    deliveredGMV: deliveredGmv,
    brandNdrDeliveryRate: brandNdr,
  };
}

// Statuses that mean the parcel never left (no delivery attempt possible).
const NOT_SHIPPED_STATUSES = ["unfulfilled", "pending", "assigned", "confirmed"];

async function deliveryRate(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 30, 365);
  if ("error" in w) return w;
  const r = await db.execute(sql`
    SELECT LOWER(status) AS status, COUNT(*)::int4 AS n
    FROM orders
    WHERE store_id = ${ctx.storeId}
      AND shopify_created_at >= ${w.start.toISOString()}::timestamptz
      AND shopify_created_at <  ${w.end.toISOString()}::timestamptz
    GROUP BY 1 ORDER BY n DESC
  `);
  const byStatus: Record<string, number> = {};
  for (const row of rowsOf(r)) byStatus[String(row.status)] = num(row.n);
  const sum = (pred: (s: string) => boolean) =>
    Object.entries(byStatus).reduce((t, [s, n]) => (pred(s) ? t + n : t), 0);

  const placed = sum(() => true);
  const delivered = byStatus["delivered"] ?? 0;
  const rto = sum((s) => s.startsWith("rto"));
  const cancelled = byStatus["cancelled"] ?? 0;
  const notShipped = sum((s) => NOT_SHIPPED_STATUSES.includes(s));
  const shipped = placed - cancelled - notShipped;
  const inFlight = shipped - delivered - rto;
  // A window is "mature" once its newest orders have had ~3 weeks to settle.
  const mature = w.end.getTime() <= Date.now() - 21 * 24 * 3600 * 1000;

  return {
    window: { start: w.start.toISOString(), end: w.end.toISOString(), label: w.label, basis: "order placed date (UTC)" },
    mature,
    deliveryRatePct: pct(delivered, shipped), // headline: Delivered ÷ Shipped
    deliveredOverConcludedPct: pct(delivered, delivered + rto), // ceiling: ignores in-flight
    counts: { placed, cancelled, notShipped, shipped, delivered, rto, inFlight },
    byStatus,
    formula: "Delivered ÷ Shipped, where Shipped = placed − cancelled − never shipped",
  };
}

async function salesSummary(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 30, 365);
  if ("error" in w) return w;
  const r = await db.execute(sql`
    SELECT
      CASE WHEN LOWER(COALESCE(payment_method,'')) LIKE '%cod%' THEN 'cod' ELSE 'prepaid' END AS pay,
      COUNT(*)::int4                                                          AS orders,
      COALESCE(SUM(CAST(total_price AS numeric)), 0)                          AS gmv,
      COUNT(*) FILTER (WHERE LOWER(status) = 'cancelled')::int4               AS cancelled,
      COALESCE(SUM(CAST(total_price AS numeric)) FILTER (WHERE LOWER(status) = 'cancelled'), 0) AS cancelled_value
    FROM orders
    WHERE store_id = ${ctx.storeId}
      AND shopify_created_at >= ${w.start.toISOString()}::timestamptz
      AND shopify_created_at <  ${w.end.toISOString()}::timestamptz
    GROUP BY 1
  `);
  const split: Record<string, { orders: number; gmv: number; cancelled: number }> = {};
  let orders = 0, gmv = 0, cancelled = 0, cancelledValue = 0;
  for (const row of rowsOf(r)) {
    split[String(row.pay)] = { orders: num(row.orders), gmv: money(row.gmv), cancelled: num(row.cancelled) };
    orders += num(row.orders);
    gmv += num(row.gmv);
    cancelled += num(row.cancelled);
    cancelledValue += num(row.cancelled_value);
  }
  const netOrders = orders - cancelled;
  const netGmv = gmv - cancelledValue;
  return {
    window: { start: w.start.toISOString(), end: w.end.toISOString(), label: w.label },
    currency: "INR",
    orders,
    gmv: money(gmv),
    cancelled,
    cancelledValue: money(cancelledValue),
    netOrders,
    netGmv: money(netGmv),
    aov: netOrders ? money(netGmv / netOrders) : null,
    codSharePct: pct(split.cod?.orders ?? 0, orders),
    byPayment: split,
  };
}

async function payroll(input: any, ctx: CopilotToolContext) {
  if (!ctx.isAdmin) return { error: "Payroll is admin-only." };
  try {
    return await payrollInner(input, ctx);
  } catch (e: any) {
    if (/does not exist/i.test(String(e?.message))) {
      return { found: false, note: "Payroll isn't set up in this database yet (no payroll tables)." };
    }
    throw e;
  }
}

async function payrollInner(input: any, ctx: CopilotToolContext) {
  const now = new Date();
  const year = clamp(input?.year, now.getUTCFullYear(), 2020, 2100);
  const month = clamp(input?.month, now.getUTCMonth() + 1, 1, 12);
  const cycleRes = await db.execute(sql`
    SELECT id, status, employee_count, total_payout, generated_at, approved_at
    FROM payroll_cycles
    WHERE store_id = ${ctx.storeId} AND year = ${year} AND month = ${month}
    ORDER BY generated_at DESC LIMIT 1
  `);
  const cycle = rowsOf(cycleRes)[0];
  if (!cycle) return { found: false, period: { year, month }, note: "No payroll cycle generated for this month yet." };
  const ledgerRes = await db.execute(sql`
    SELECT u.full_name, l.compensation_profile,
           l.base_salary, l.days_present, l.paid_holidays_used, l.expected_working_days,
           l.base_pay_amount, l.delivery_rate_pct, l.team_delivery_rate_pct, l.recovery_rate_pct,
           l.reships_count, l.confirmation_bonus, l.team_delivery_bonus, l.recovery_bonus,
           l.reships_bonus, l.manager_bonus, l.total_incentives, l.reimbursement, l.line_items,
           l.final_payout
    FROM payroll_ledger l
    JOIN users u ON u.id = l.user_id
    WHERE l.cycle_id = ${cycle.id}
    ORDER BY u.full_name
  `);
  const employees = rowsOf(ledgerRes).map((l) => {
    const items = Array.isArray(l.line_items) ? l.line_items : [];
    const additions = num(l.reimbursement) + items.reduce((s: number, it: any) => s + num(it?.amount), 0);
    return {
      name: l.full_name,
      profile: l.compensation_profile,
      baseSalary: money(l.base_salary),
      attendance: `${num(l.days_present)} present + ${num(l.paid_holidays_used)} paid holidays / ${num(l.expected_working_days)} days`,
      basePay: money(l.base_pay_amount),
      rates: {
        deliveryRatePct: l.delivery_rate_pct == null ? null : num(l.delivery_rate_pct),
        teamDeliveryRatePct: l.team_delivery_rate_pct == null ? null : num(l.team_delivery_rate_pct),
        recoveryRatePct: l.recovery_rate_pct == null ? null : num(l.recovery_rate_pct),
        reships: num(l.reships_count),
      },
      incentives: {
        confirmation: money(l.confirmation_bonus),
        teamDelivery: money(l.team_delivery_bonus),
        recovery: money(l.recovery_bonus),
        reships: money(l.reships_bonus),
        manager: money(l.manager_bonus),
        total: money(l.total_incentives),
      },
      additions: money(additions),
      lineItems: items,
      finalPayout: money(l.final_payout),
    };
  });
  return {
    found: true,
    period: { year, month },
    cycle: {
      status: cycle.status,
      approved: !!cycle.approved_at,
      employeeCount: num(cycle.employee_count),
      totalPayout: money(cycle.total_payout),
      generatedAt: cycle.generated_at,
      approvedAt: cycle.approved_at,
    },
    employees,
  };
}

async function returnsSummary(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 30, 365);
  if ("error" in w) return w;
  const [statusRes, reasonRes] = await Promise.all([
    db.execute(sql`
      SELECT status, COUNT(*)::int4 AS n, COALESCE(SUM(CAST(refund_amount AS numeric)), 0) AS refund
      FROM returns
      WHERE store_id = ${ctx.storeId}
        AND created_at >= ${w.start.toISOString()}::timestamptz
        AND created_at <  ${w.end.toISOString()}::timestamptz
      GROUP BY 1 ORDER BY n DESC
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(TRIM(return_reason), ''), 'unspecified') AS reason, COUNT(*)::int4 AS n
      FROM returns
      WHERE store_id = ${ctx.storeId}
        AND created_at >= ${w.start.toISOString()}::timestamptz
        AND created_at <  ${w.end.toISOString()}::timestamptz
      GROUP BY 1 ORDER BY n DESC LIMIT 8
    `),
  ]);
  const byStatus = rowsOf(statusRes).map((r) => ({ status: r.status, count: num(r.n), refundAmount: money(r.refund) }));
  return {
    window: { start: w.start.toISOString(), end: w.end.toISOString(), label: w.label },
    total: byStatus.reduce((s, r) => s + r.count, 0),
    totalRefundAmount: money(byStatus.reduce((s, r) => s + r.refundAmount, 0)),
    byStatus,
    topReasons: rowsOf(reasonRes).map((r) => ({ reason: r.reason, count: num(r.n) })),
  };
}

async function abandonedCarts(input: any, ctx: CopilotToolContext) {
  const w = resolveWindow(input, 7, 90);
  if ("error" in w) return w;
  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                                        AS carts,
      COALESCE(SUM(CAST(cart_value AS numeric)), 0)                         AS value,
      COUNT(*) FILTER (WHERE converted_order_id IS NOT NULL)::int4          AS converted,
      COUNT(*) FILTER (WHERE is_recovered)::int4                            AS recovered,
      COUNT(*) FILTER (WHERE is_recovered OR converted_order_id IS NOT NULL)::int4 AS recovered_any,
      COALESCE(SUM(CAST(cart_value AS numeric)) FILTER (WHERE is_recovered OR converted_order_id IS NOT NULL), 0) AS recovered_value,
      COUNT(*) FILTER (WHERE recovery_status = 'PENDING')::int4             AS pending,
      COUNT(*) FILTER (WHERE recovery_status = 'CONTACTED')::int4           AS contacted,
      COUNT(*) FILTER (WHERE recovery_status = 'LOST')::int4                AS lost
    FROM abandoned_checkouts
    WHERE store_id = ${ctx.storeId}
      AND created_at >= ${w.start.toISOString()}::timestamptz
      AND created_at <  ${w.end.toISOString()}::timestamptz
  `);
  const x = rowsOf(r)[0] ?? {};
  const carts = num(x.carts);
  return {
    window: { start: w.start.toISOString(), end: w.end.toISOString(), label: w.label },
    carts,
    cartValue: money(x.value),
    convertedOrders: num(x.converted),
    recoveredByTeam: num(x.recovered),
    recoveredValue: money(x.recovered_value),
    recoveryRatePct: pct(num(x.recovered_any), carts),
    recoveryStatus: { pending: num(x.pending), contacted: num(x.contacted), lost: num(x.lost) },
  };
}
