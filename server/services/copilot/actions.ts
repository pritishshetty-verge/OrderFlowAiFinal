// Flo (Ops Copilot) — actions (v2). Flo NEVER executes writes itself.
//
// Each propose_* tool validates the request against live data (order in this
// store, right state, agent exists…) and returns a PROPOSAL: a human-readable
// card plus the exact API request(s) the app's own UI sends for that action.
// The panel shows the card; only when the user presses Confirm does the
// browser call those endpoints with the user's own session — so every
// existing permission check, Shopify write-back, status history row and
// notification still applies, exactly as if they'd clicked the button.
//
// Identity fields the endpoints read from the body (userId, assignedBy,
// actionBy, reviewedBy, currentUserId) are filled with the logged-in user.

import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { CopilotToolContext } from "./tools";
import { rowsOf, num, money, clamp, escapeLike } from "./util";

export type Risk = "low" | "medium" | "high";
export interface ActionRequest {
  method: "POST" | "PATCH" | "PUT";
  path: string;
  body?: Record<string, any>;
  /** Short label for this step (multi-step actions). */
  label?: string;
}
export interface ActionProposal {
  id: string;
  action: string;
  title: string;
  risk: Risk;
  details: { label: string; value: string }[];
  warning?: string;
  requests: ActionRequest[];
  expiresAt: string;
}

const PROPOSAL_TTL_MS = 15 * 60_000;
const SHIPPED = ["awb_assigned", "in_transit", "out_for_delivery", "ndr", "delivered", "rto_initiated", "rto_delivered", "shipped", "lost"];
const NOT_SHIPPED = ["unfulfilled", "pending", "assigned", "confirmed"];
export const CANCEL_REASONS = [
  "Customer changed mind", "Found better price elsewhere", "Wrong item/size/color", "Delivery time too long",
  "Family member disapproved", "Fake/test order", "Customer unreachable", "Address issues", "Other",
] as const;
const RETURN_STATUSES = ["PENDING_FEE", "PENDING_APPROVAL", "APPROVED", "PICKUP_SCHEDULED", "IN_TRANSIT", "RECEIVED", "INSPECTED", "REFUNDED", "REJECTED"];
const CART_STATUSES = ["PENDING", "CONTACTED", "RECOVERED", "LOST"];
const RESHIP_REASONS = ["courier_error", "customer_unavailable", "fake_delivery", "address_issue", "product_damaged", "other"];

const inr = (v: any) => `₹${money(v).toLocaleString("en-IN")}`;
const orderNum = (s: any) => String(s ?? "").trim().replace(/^#/, "");
const err = (error: string) => ({ error });

function proposal(p: Omit<ActionProposal, "id" | "expiresAt">): { proposal: ActionProposal } {
  return {
    proposal: {
      ...p,
      id: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
    },
  };
}

async function findOrder(ctx: CopilotToolContext, raw: any) {
  const n = orderNum(raw);
  if (!n) return { error: "orderNumber is required" };
  const r = rowsOf(await db.execute(sql`
    SELECT id, shopify_order_number, customer_name, customer_phone, total_price, payment_method,
           LOWER(status) AS status, call_status, tracking_number, courier_name, assigned_to, tags,
           shipping_address, shipping_address_line1, shipping_address_line2, shipping_city,
           shipping_state, shipping_pincode
    FROM orders WHERE store_id = ${ctx.storeId} AND replace(shopify_order_number, '#', '') = ${n}
    ORDER BY shopify_created_at DESC LIMIT 2`));
  if (!r.length) return { error: `No order #${n} in this store.` };
  return { order: r[0] };
}

const orderLine = (o: any) => `#${orderNum(o.shopify_order_number)} · ${o.customer_name ?? "?"} · ${inr(o.total_price)} ${/cod/i.test(o.payment_method ?? "") ? "COD" : "prepaid"}`;

async function storeAgents(ctx: CopilotToolContext) {
  return rowsOf(await db.execute(sql`
    SELECT u.id, u.full_name, u.role FROM users u
    WHERE u.is_active = true AND u.role IN ('agent','manager')
      AND EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id = u.id AND us.store_id = ${ctx.storeId})
    ORDER BY u.full_name`));
}

// ─────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────

const orderProp = { orderNumber: { type: "string", description: "Shopify order number, e.g. 50141." } } as const;

export const ACTION_TOOLS = [
  {
    name: "propose_confirm_order",
    description: "Propose confirming an order's call (marks it Confirmed, tags it in Shopify). Shows the user a Confirm card; nothing happens until they press it.",
    input_schema: { type: "object", properties: { ...orderProp, notes: { type: "string" } }, required: ["orderNumber"], additionalProperties: false },
  },
  {
    name: "propose_cancel_order",
    description: "Propose cancelling an unshipped order. On confirm it cancels in Shopify, refunds/voids payment, restocks and emails the customer. Irreversible. Shows a Confirm card.",
    input_schema: {
      type: "object",
      properties: { ...orderProp, reason: { type: "string", enum: [...CANCEL_REASONS] }, notes: { type: "string" } },
      required: ["orderNumber", "reason"], additionalProperties: false,
    },
  },
  {
    name: "propose_schedule_followup",
    description: "Propose scheduling a follow-up call for an order. Give either inMinutes or at (IST, 'YYYY-MM-DD HH:mm').",
    input_schema: {
      type: "object",
      properties: { ...orderProp, inMinutes: { type: "integer" }, at: { type: "string" }, notes: { type: "string" } },
      required: ["orderNumber"], additionalProperties: false,
    },
  },
  {
    name: "propose_assign_orders",
    description: "Propose assigning orders to a calling agent (by name). Either list orderNumbers, or set unassignedPending=true to take the oldest unassigned orders awaiting confirmation (up to limit).",
    input_schema: {
      type: "object",
      properties: {
        agentName: { type: "string" },
        orderNumbers: { type: "array", items: { type: "string" }, description: "Up to 200 order numbers." },
        unassignedPending: { type: "boolean" },
        limit: { type: "integer", description: "With unassignedPending: how many (default 25, max 200)." },
        note: { type: "string" },
      },
      required: ["agentName"], additionalProperties: false,
    },
  },
  {
    name: "propose_unassign_order",
    description: "Propose removing the agent assignment from an order.",
    input_schema: { type: "object", properties: { ...orderProp }, required: ["orderNumber"], additionalProperties: false },
  },
  {
    name: "propose_ndr_action",
    description: "Propose a courier NDR instruction: reattempt delivery (one or many parcels), defer delivery to a date, or update the address/phone (single parcel). Identify parcels by orderNumbers or awbs.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["reattempt", "defer", "edit"] },
        orderNumbers: { type: "array", items: { type: "string" } },
        awbs: { type: "array", items: { type: "string" } },
        deferredDate: { type: "string", description: "YYYY-MM-DD, for defer." },
        address1: { type: "string" }, address2: { type: "string" }, phone: { type: "string" },
      },
      required: ["action"], additionalProperties: false,
    },
  },
  {
    name: "propose_resync_tracking",
    description: "Propose re-pulling live courier tracking for an order and updating its status.",
    input_schema: { type: "object", properties: { ...orderProp }, required: ["orderNumber"], additionalProperties: false },
  },
  {
    name: "propose_reconcile_statuses",
    description: "Propose running the 'reconcile stale statuses' sweep (re-checks courier status for parcels whose status looks stale, across all stores).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "propose_tag_order",
    description: "Propose adding and/or removing tags on an order.",
    input_schema: {
      type: "object",
      properties: { ...orderProp, add: { type: "array", items: { type: "string" } }, remove: { type: "array", items: { type: "string" } } },
      required: ["orderNumber"], additionalProperties: false,
    },
  },
  {
    name: "propose_call_customer",
    description: "Propose a click-to-call: rings your phone (your IVR extension) and connects you to the order's customer.",
    input_schema: { type: "object", properties: { ...orderProp }, required: ["orderNumber"], additionalProperties: false },
  },
  {
    name: "propose_create_reshipment",
    description: "Propose a reshipment: creates a replacement order in Shopify to the original order's address.",
    input_schema: {
      type: "object",
      properties: {
        ...orderProp,
        reason: { type: "string", enum: RESHIP_REASONS },
        urgency: { type: "string", enum: ["instant", "scheduled"] },
        scheduledDate: { type: "string", description: "YYYY-MM-DD when urgency=scheduled." },
        customerDriven: { type: "boolean", description: "true for customer-driven replacements (suffix C); default NDR-driven (R)." },
        notes: { type: "string" },
      },
      required: ["orderNumber", "reason"], additionalProperties: false,
    },
  },
  {
    name: "propose_update_cart_status",
    description: "Propose setting an abandoned checkout's recovery status.",
    input_schema: {
      type: "object",
      properties: { checkoutId: { type: "integer" }, status: { type: "string", enum: CART_STATUSES } },
      required: ["checkoutId", "status"], additionalProperties: false,
    },
  },
  {
    name: "propose_return_action",
    description: "Propose an action on a return (by RMA number): approve_pickup (schedules the courier reverse pickup) or set_status.",
    input_schema: {
      type: "object",
      properties: {
        rmaNumber: { type: "string" },
        action: { type: "string", enum: ["approve_pickup", "set_status"] },
        status: { type: "string", enum: RETURN_STATUSES },
      },
      required: ["rmaNumber", "action"], additionalProperties: false,
    },
  },
  {
    name: "propose_review_leave",
    description: "Propose approving or rejecting a pending leave request (identify by leaveRequestId, or by personName if they have exactly one pending request). Admin only.",
    input_schema: {
      type: "object",
      properties: {
        leaveRequestId: { type: "string" }, personName: { type: "string" },
        decision: { type: "string", enum: ["approve", "reject"] }, note: { type: "string" },
      },
      required: ["decision"], additionalProperties: false,
    },
  },
  {
    name: "propose_approve_payroll",
    description: "Propose approving a payroll cycle (locks it and emails payslips to every employee). Admin only.",
    input_schema: {
      type: "object",
      properties: { year: { type: "integer" }, month: { type: "integer" } },
      required: ["year", "month"], additionalProperties: false,
    },
  },
  {
    name: "propose_shopify_sync",
    description: "Propose pulling recent orders from Shopify into this store (backfill).",
    input_schema: { type: "object", properties: { daysBack: { type: "integer", description: "Default 7, max 365." } }, additionalProperties: false },
  },
  {
    name: "propose_send_recon_digest",
    description: "Propose emailing the payment reconciliation digest. test=true sends only to you; false sends to every admin. Admin only.",
    input_schema: {
      type: "object",
      properties: { digestType: { type: "string", enum: ["3-day", "bi-weekly"] }, test: { type: "boolean" } },
      additionalProperties: false,
    },
  },
] as const;

export const ACTION_TOOL_NAMES = new Set<string>(ACTION_TOOLS.map((t) => t.name));

export function summarizeActionTool(name: string, input: any): string | null {
  if (!ACTION_TOOL_NAMES.has(name)) return null;
  const n = input?.orderNumber ? ` #${orderNum(input.orderNumber)}` : "";
  return `Preparing: ${name.replace(/^propose_/, "").replace(/_/g, " ")}${n}`;
}

// ─────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────

export async function runActionTool(name: string, input: any, ctx: CopilotToolContext): Promise<any> {
  const r = await buildAction(name, input, ctx);
  // Every card says which store it acts on.
  if (r && typeof r === "object" && "proposal" in r && ctx.storeName) {
    (r as { proposal: ActionProposal }).proposal.details.unshift({ label: "Store", value: ctx.storeName });
  }
  return r;
}

async function buildAction(name: string, input: any, ctx: CopilotToolContext): Promise<any> {
  switch (name) {
    case "propose_confirm_order": return confirmOrder(input, ctx);
    case "propose_cancel_order": return cancelOrder(input, ctx);
    case "propose_schedule_followup": return followup(input, ctx);
    case "propose_assign_orders": return assignOrders(input, ctx);
    case "propose_unassign_order": return unassignOrder(input, ctx);
    case "propose_ndr_action": return ndrAction(input, ctx);
    case "propose_resync_tracking": return resyncTracking(input, ctx);
    case "propose_reconcile_statuses": return reconcileStatuses(ctx);
    case "propose_tag_order": return tagOrder(input, ctx);
    case "propose_call_customer": return callCustomer(input, ctx);
    case "propose_create_reshipment": return createReshipment(input, ctx);
    case "propose_update_cart_status": return cartStatus(input, ctx);
    case "propose_return_action": return returnAction(input, ctx);
    case "propose_review_leave": return reviewLeave(input, ctx);
    case "propose_approve_payroll": return approvePayroll(input, ctx);
    case "propose_shopify_sync": return shopifySync(input);
    case "propose_send_recon_digest": return reconDigest(input, ctx);
    default: return err(`Unknown action: ${name}`);
  }
}

async function confirmOrder(input: any, ctx: CopilotToolContext) {
  const f = await findOrder(ctx, input?.orderNumber);
  if ("error" in f) return f;
  const o = f.order;
  if (o.status === "cancelled" || o.call_status === "Cancelled") return err(`#${orderNum(o.shopify_order_number)} is cancelled.`);
  if (o.call_status === "Confirmed") return err(`#${orderNum(o.shopify_order_number)} is already confirmed.`);
  const notes = String(input?.notes ?? "").trim().slice(0, 500);
  return proposal({
    action: "confirm_order",
    title: `Confirm order #${orderNum(o.shopify_order_number)}`,
    risk: "low",
    details: [{ label: "Order", value: orderLine(o) }, { label: "Call status", value: `${o.call_status} → Confirmed` }, ...(notes ? [{ label: "Notes", value: notes }] : [])],
    requests: [{ method: "POST", path: `/api/orders/${o.id}/confirm`, body: { userId: ctx.userId, ...(notes ? { notes } : {}) } }],
  });
}

async function cancelOrder(input: any, ctx: CopilotToolContext) {
  const f = await findOrder(ctx, input?.orderNumber);
  if ("error" in f) return f;
  const o = f.order;
  const n = orderNum(o.shopify_order_number);
  if (!CANCEL_REASONS.includes(input?.reason)) return err(`reason must be one of: ${CANCEL_REASONS.join(", ")}`);
  if (o.status === "cancelled" || o.call_status === "Cancelled") return err(`#${n} is already cancelled.`);
  if (SHIPPED.includes(o.status) || o.tracking_number) return err(`#${n} has already shipped (${o.status}); it can't be cancelled — use an NDR/RTO flow instead.`);
  const notes = String(input?.notes ?? "").trim().slice(0, 500);
  return proposal({
    action: "cancel_order",
    title: `Cancel order #${n}`,
    risk: "high",
    details: [{ label: "Order", value: orderLine(o) }, { label: "Reason", value: input.reason }, ...(notes ? [{ label: "Notes", value: notes }] : [])],
    warning: "Cancels in Shopify, refunds/voids the payment, restocks items and emails the customer. This can't be undone.",
    requests: [{ method: "POST", path: `/api/orders/${o.id}/cancel`, body: { userId: ctx.userId, reason: input.reason, ...(notes ? { notes } : {}) } }],
  });
}

function parseIstDateTime(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 330 * 60_000);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function followup(input: any, ctx: CopilotToolContext) {
  const f = await findOrder(ctx, input?.orderNumber);
  if ("error" in f) return f;
  const o = f.order;
  const n = orderNum(o.shopify_order_number);
  if (!NOT_SHIPPED.includes(o.status) || o.call_status === "Cancelled") return err(`#${n} is ${o.status}/${o.call_status}; follow-ups are for unshipped orders.`);
  let when: Date | null = null;
  if (input?.at) when = parseIstDateTime(input.at);
  else if (input?.inMinutes != null) when = new Date(Date.now() + clamp(input.inMinutes, 30, 1, 60 * 24 * 14) * 60_000);
  if (!when) return err("Give inMinutes, or at as 'YYYY-MM-DD HH:mm' (IST).");
  if (when.getTime() < Date.now() - 60_000) return err("That time is in the past.");
  const notes = String(input?.notes ?? "").trim().slice(0, 500);
  const ist = when.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  return proposal({
    action: "schedule_followup",
    title: `Follow up #${n} at ${ist}`,
    risk: "low",
    details: [{ label: "Order", value: orderLine(o) }, { label: "When", value: `${ist} IST` }, ...(notes ? [{ label: "Notes", value: notes }] : [])],
    requests: [{ method: "POST", path: `/api/orders/${o.id}/followup`, body: { userId: ctx.userId, followupAt: when.toISOString(), ...(notes ? { notes } : {}) } }],
  });
}

async function resolveAgent(ctx: CopilotToolContext, name: any) {
  const q = String(name ?? "").trim().toLowerCase();
  if (!q) return { error: "agentName is required" };
  const agents = await storeAgents(ctx);
  const exact = agents.filter((a) => (a.full_name ?? "").toLowerCase() === q);
  const matches = exact.length ? exact : agents.filter((a) => (a.full_name ?? "").toLowerCase().includes(q));
  if (matches.length === 0) return { error: `No active agent/manager named "${name}" in this store. Agents: ${agents.map((a) => a.full_name).join(", ") || "none"}.` };
  if (matches.length > 1) return { error: `"${name}" matches several people: ${matches.map((a) => a.full_name).join(", ")}. Which one?` };
  return { agent: matches[0] };
}

async function assignOrders(input: any, ctx: CopilotToolContext) {
  const a = await resolveAgent(ctx, input?.agentName);
  if ("error" in a) return a;
  let orders: any[] = [];
  if (input?.unassignedPending) {
    const limit = clamp(input?.limit, 25, 1, 200);
    orders = rowsOf(await db.execute(sql`
      SELECT id, shopify_order_number, total_price FROM orders
      WHERE store_id = ${ctx.storeId} AND test_order = false AND assigned_to IS NULL
        AND LOWER(status) IN ('unfulfilled','pending','assigned','confirmed') AND call_status IN ('Pending','Follow Up')
        AND shopify_created_at >= now() - interval '120 days'
      ORDER BY shopify_created_at ASC LIMIT ${limit}`));
    if (!orders.length) return err("There are no unassigned orders awaiting confirmation.");
  } else {
    const nums = Array.from(new Set((Array.isArray(input?.orderNumbers) ? input.orderNumbers : []).map(orderNum).filter(Boolean))).slice(0, 200) as string[];
    if (!nums.length) return err("Give orderNumbers, or set unassignedPending=true.");
    orders = rowsOf(await db.execute(sql`
      SELECT DISTINCT ON (replace(shopify_order_number,'#','')) id, shopify_order_number, total_price, LOWER(status) AS status
      FROM orders WHERE store_id = ${ctx.storeId}
        AND replace(shopify_order_number, '#', '') IN (${sql.join(nums.map((n) => sql`${n}`), sql`, `)})
      ORDER BY replace(shopify_order_number,'#',''), shopify_created_at DESC`));
    const found = new Set(orders.map((o) => orderNum(o.shopify_order_number)));
    const missing = nums.filter((n) => !found.has(n));
    if (missing.length) return err(`Not found in this store: ${missing.map((n) => `#${n}`).join(", ")}`);
    // The assignment engine forces status → "assigned", which would wipe the
    // real status of a shipped/cancelled order. Only unshipped orders.
    const blocked = orders.filter((o) => !NOT_SHIPPED.includes(o.status));
    if (blocked.length) {
      return err(`Only unshipped orders can be assigned. Not eligible: ${blocked.slice(0, 10).map((o) => `#${orderNum(o.shopify_order_number)} (${o.status})`).join(", ")}`);
    }
  }
  const value = orders.reduce((s, o) => s + num(o.total_price), 0);
  const list = orders.slice(0, 12).map((o) => `#${orderNum(o.shopify_order_number)}`).join(", ") + (orders.length > 12 ? ` +${orders.length - 12} more` : "");
  const note = String(input?.note ?? "").trim().slice(0, 300);
  return proposal({
    action: "assign_orders",
    title: `Assign ${orders.length} order${orders.length === 1 ? "" : "s"} to ${a.agent.full_name}`,
    risk: orders.length > 50 ? "medium" : "low",
    details: [
      { label: "Agent", value: `${a.agent.full_name} (${a.agent.role})` },
      { label: "Orders", value: list },
      { label: "Value", value: inr(value) },
      ...(note ? [{ label: "Note", value: note }] : []),
    ],
    requests: [{
      method: "POST", path: "/api/orders/bulk-assign",
      body: { orderIds: orders.map((o) => o.id), agentId: a.agent.id, assignedBy: ctx.userId, ...(note ? { note } : {}) },
    }],
  });
}

async function unassignOrder(input: any, ctx: CopilotToolContext) {
  const f = await findOrder(ctx, input?.orderNumber);
  if ("error" in f) return f;
  const o = f.order;
  if (!o.assigned_to) return err(`#${orderNum(o.shopify_order_number)} isn't assigned to anyone.`);
  const who = rowsOf(await db.execute(sql`SELECT full_name FROM users WHERE id = ${o.assigned_to}`))[0]?.full_name ?? "unknown";
  return proposal({
    action: "unassign_order",
    title: `Unassign #${orderNum(o.shopify_order_number)} from ${who}`,
    risk: "low",
    details: [{ label: "Order", value: orderLine(o) }, { label: "Currently", value: who }],
    requests: [{ method: "POST", path: `/api/orders/${o.id}/assign`, body: { userId: null, assignedBy: ctx.userId } }],
  });
}

async function ndrAction(input: any, ctx: CopilotToolContext) {
  const action = input?.action;
  if (!["reattempt", "defer", "edit"].includes(action)) return err("action must be reattempt, defer or edit");
  const nums = (Array.isArray(input?.orderNumbers) ? input.orderNumbers : []).map(orderNum).filter(Boolean);
  const awbsIn = (Array.isArray(input?.awbs) ? input.awbs : []).map((s: any) => String(s).trim()).filter(Boolean);
  if (!nums.length && !awbsIn.length) return err("Give orderNumbers or awbs.");
  if (nums.length + awbsIn.length > 25) return err("At most 25 parcels per action.");
  if (action !== "reattempt" && nums.length + awbsIn.length > 1) return err(`${action} works on one parcel at a time.`);

  const rows = rowsOf(await db.execute(sql`
    SELECT o.shopify_order_number, o.customer_name, o.total_price, o.payment_method, LOWER(o.status) AS status,
           COALESCE(NULLIF(s.awb, ''), o.tracking_number) AS awb, COALESCE(s.courier_name, o.courier_name) AS courier
    FROM orders o LEFT JOIN shipments s ON s.order_id = o.id
    WHERE o.store_id = ${ctx.storeId} AND (
      ${nums.length ? sql`replace(o.shopify_order_number, '#', '') IN (${sql.join(nums.map((n: string) => sql`${n}`), sql`, `)})` : sql`false`}
      OR ${awbsIn.length ? sql`COALESCE(NULLIF(s.awb, ''), o.tracking_number) IN (${sql.join(awbsIn.map((a: string) => sql`${a}`), sql`, `)})` : sql`false`})`));
  const byKey = new Map<string, any>();
  for (const r of rows) if (r.awb) byKey.set(String(r.awb), r);
  const parcels = Array.from(byKey.values());
  const wanted = nums.length + awbsIn.length;
  if (parcels.length < wanted) {
    const got = new Set(parcels.flatMap((p) => [orderNum(p.shopify_order_number), String(p.awb)]));
    const missing = [...nums, ...awbsIn].filter((k) => !got.has(k));
    return err(`No shipped parcel found in this store for: ${missing.join(", ")}`);
  }
  const done = parcels.filter((p) => ["delivered", "rto_delivered", "cancelled"].includes(p.status));
  if (done.length) return err(`Already final: ${done.map((p) => `#${orderNum(p.shopify_order_number)} (${p.status})`).join(", ")}`);
  if (action !== "reattempt" && !/delhivery/i.test(parcels[0].courier ?? "")) return err(`${action} is only supported for Delhivery parcels.`);

  const body: Record<string, any> = { actionBy: ctx.userId };
  const extra: { label: string; value: string }[] = [];
  if (action === "defer") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input?.deferredDate ?? ""))) return err("deferredDate must be YYYY-MM-DD");
    body.deferredDate = input.deferredDate;
    extra.push({ label: "Deliver on", value: input.deferredDate });
  }
  if (action === "edit") {
    if (!input?.address1 && !input?.phone) return err("edit needs address1 and/or phone");
    if (input?.phone && !/^\+?\d[\d\s-]{8,14}$/.test(String(input.phone))) return err("phone looks invalid");
    if (input?.address1) { body.address1 = String(input.address1).slice(0, 200); extra.push({ label: "New address", value: [input.address1, input.address2].filter(Boolean).join(", ") }); }
    if (input?.address2) body.address2 = String(input.address2).slice(0, 200);
    if (input?.phone) { body.phone = String(input.phone); extra.push({ label: "New phone", value: String(input.phone) }); }
  }
  const verb = action === "reattempt" ? "Re-attempt delivery" : action === "defer" ? "Defer delivery" : "Update delivery details";
  return proposal({
    action: `ndr_${action}`,
    title: `${verb}: ${parcels.length} parcel${parcels.length === 1 ? "" : "s"}`,
    risk: "medium",
    details: [
      { label: "Parcels", value: parcels.slice(0, 10).map((p) => `#${orderNum(p.shopify_order_number)} (${p.awb}, ${p.status})`).join("; ") + (parcels.length > 10 ? ` +${parcels.length - 10} more` : "") },
      ...extra,
    ],
    warning: "Sends the instruction to the courier.",
    requests: parcels.map((p) => ({
      method: "POST" as const,
      path: `/api/ndr/${encodeURIComponent(String(p.awb))}/reattempt`,
      body,
      label: `#${orderNum(p.shopify_order_number)}`,
    })),
  });
}

async function resyncTracking(input: any, ctx: CopilotToolContext) {
  if (!ctx.isAdmin) return err("Admin only.");
  const f = await findOrder(ctx, input?.orderNumber);
  if ("error" in f) return f;
  const o = f.order;
  if (!o.tracking_number) return err(`#${orderNum(o.shopify_order_number)} has no AWB yet.`);
  return proposal({
    action: "resync_tracking",
    title: `Re-sync tracking for #${orderNum(o.shopify_order_number)}`,
    risk: "low",
    details: [{ label: "Order", value: orderLine(o) }, { label: "AWB", value: `${o.tracking_number} (${o.courier_name ?? "courier"})` }, { label: "Current status", value: o.status }],
    requests: [{ method: "POST", path: `/api/admin/orders/${o.id}/resync-tracking?currentUserId=${encodeURIComponent(ctx.userId)}`, body: { currentUserId: ctx.userId } }],
  });
}

async function reconcileStatuses(ctx: CopilotToolContext) {
  if (!ctx.isAdmin) return err("Admin only.");
  return proposal({
    action: "reconcile_statuses",
    title: "Reconcile stale shipment statuses",
    risk: "low",
    details: [{ label: "Scope", value: "All stores — same sweep as the nightly job" }],
    requests: [{ method: "POST", path: `/api/admin/reconcile-shipment-status?currentUserId=${encodeURIComponent(ctx.userId)}`, body: { currentUserId: ctx.userId } }],
  });
}

async function tagOrder(input: any, ctx: CopilotToolContext) {
  const f = await findOrder(ctx, input?.orderNumber);
  if ("error" in f) return f;
  const o = f.order;
  const clean = (a: any) => (Array.isArray(a) ? a : []).map((t: any) => String(t).trim()).filter((t: string) => t && t.length <= 40).slice(0, 10);
  const add = clean(input?.add), remove = clean(input?.remove).map((t: string) => t.toLowerCase());
  if (!add.length && !remove.length) return err("Give tags to add and/or remove.");
  const current: string[] = Array.isArray(o.tags) ? o.tags : [];
  const next = Array.from(new Set([...current.filter((t) => !remove.includes(t.toLowerCase())), ...add]));
  return proposal({
    action: "tag_order",
    title: `Update tags on #${orderNum(o.shopify_order_number)}`,
    risk: "low",
    details: [{ label: "Order", value: orderLine(o) }, { label: "Before", value: current.join(", ") || "—" }, { label: "After", value: next.join(", ") || "—" }],
    requests: [{ method: "PATCH", path: `/api/orders/${o.id}`, body: { userId: ctx.userId, tags: next } }],
  });
}

async function callCustomer(input: any, ctx: CopilotToolContext) {
  const f = await findOrder(ctx, input?.orderNumber);
  if ("error" in f) return f;
  const o = f.order;
  if (!o.customer_phone) return err("This order has no customer phone.");
  const me = rowsOf(await db.execute(sql`SELECT agent_extension FROM users WHERE id = ${ctx.userId}`))[0];
  if (!me?.agent_extension) return err("You don't have an IVR extension set up, so click-to-call can't ring you. Ask an admin to add one in Team.");
  return proposal({
    action: "call_customer",
    title: `Call ${o.customer_name ?? "customer"} (#${orderNum(o.shopify_order_number)})`,
    risk: "medium",
    details: [{ label: "Order", value: orderLine(o) }, { label: "Your extension", value: String(me.agent_extension) }],
    warning: "Your phone will ring first, then the customer's.",
    requests: [{ method: "POST", path: "/api/calls/initiate", body: { userId: ctx.userId, orderId: o.id, customerPhone: o.customer_phone } }],
  });
}

async function createReshipment(input: any, ctx: CopilotToolContext) {
  const f = await findOrder(ctx, input?.orderNumber);
  if ("error" in f) return f;
  const o = f.order;
  if (!RESHIP_REASONS.includes(input?.reason)) return err(`reason must be one of: ${RESHIP_REASONS.join(", ")}`);
  const urgency = input?.urgency === "scheduled" ? "scheduled" : "instant";
  if (urgency === "scheduled" && !/^\d{4}-\d{2}-\d{2}$/.test(String(input?.scheduledDate ?? ""))) return err("scheduledDate (YYYY-MM-DD) is required for scheduled reshipments.");
  const sa = (o.shipping_address && typeof o.shipping_address === "object") ? o.shipping_address : {};
  const address1 = sa.address1 ?? o.shipping_address_line1;
  const zip = sa.zip ?? o.shipping_pincode;
  if (!address1 || !zip) return err("The original order has no usable address; create this reshipment from the Reshipments page.");
  const phone = sa.phone ?? o.customer_phone;
  const name = o.customer_name ?? sa.name ?? "";
  const shippingAddress = {
    first_name: name.split(" ")[0] ?? "", last_name: name.split(" ").slice(1).join(" "), name, phone,
    address1, address2: sa.address2 ?? o.shipping_address_line2 ?? undefined,
    city: sa.city ?? o.shipping_city, province: sa.province ?? o.shipping_state, zip, country: "India", country_code: "IN",
  };
  const notes = String(input?.notes ?? "").trim().slice(0, 500);
  const suffix = input?.customerDriven ? "C" : "R";
  return proposal({
    action: "create_reshipment",
    title: `Reship #${orderNum(o.shopify_order_number)} (${suffix})`,
    risk: "high",
    details: [
      { label: "Original", value: orderLine(o) },
      { label: "Ship to", value: [shippingAddress.address1, shippingAddress.address2, shippingAddress.city, shippingAddress.province, shippingAddress.zip].filter(Boolean).join(", ") },
      { label: "Reason", value: input.reason },
      { label: "When", value: urgency === "scheduled" ? `scheduled ${input.scheduledDate}` : "now" },
      ...(notes ? [{ label: "Notes", value: notes }] : []),
    ],
    warning: "Creates a new replacement order in Shopify.",
    requests: [{
      method: "POST", path: `/api/reshipments?userId=${encodeURIComponent(ctx.userId)}`,
      body: {
        originalOrderId: o.id, customerName: name, customerPhone: phone, shippingAddress,
        reason: input.reason, urgency, scheduledDate: urgency === "scheduled" ? input.scheduledDate : null,
        internalNotes: notes || null, nameSuffix: suffix,
      },
    }],
  });
}

async function cartStatus(input: any, ctx: CopilotToolContext) {
  if (!CART_STATUSES.includes(input?.status)) return err(`status must be one of ${CART_STATUSES.join(", ")}`);
  const id = Number(input?.checkoutId);
  if (!Number.isInteger(id)) return err("checkoutId must be an integer");
  const c = rowsOf(await db.execute(sql`SELECT id, customer_name, cart_value, recovery_status FROM abandoned_checkouts
    WHERE id = ${id} AND store_id = ${ctx.storeId}`))[0];
  if (!c) return err(`No abandoned checkout ${id} in this store.`);
  return proposal({
    action: "update_cart_status",
    title: `Mark cart ${id} as ${input.status}`,
    risk: "low",
    details: [{ label: "Customer", value: `${c.customer_name ?? "?"} · ${inr(c.cart_value)}` }, { label: "Status", value: `${c.recovery_status} → ${input.status}` }],
    requests: [{ method: "PATCH", path: `/api/abandoned-checkouts/${id}/status`, body: { status: input.status } }],
  });
}

async function returnAction(input: any, ctx: CopilotToolContext) {
  const rma = String(input?.rmaNumber ?? "").trim();
  if (!rma) return err("rmaNumber is required");
  const r = rowsOf(await db.execute(sql`SELECT r.id, r.rma_number, r.status, r.return_fee_paid, r.return_reason, o.shopify_order_number, o.customer_name
    FROM returns r LEFT JOIN orders o ON o.id = r.order_id
    WHERE r.store_id = ${ctx.storeId} AND r.rma_number ILIKE ${escapeLike(rma)}`))[0];
  if (!r) return err(`No return ${rma} in this store.`);
  const base = [{ label: "Return", value: `${r.rma_number} · #${orderNum(r.shopify_order_number)} · ${r.customer_name ?? "?"}` }, { label: "Current status", value: r.status }];
  if (input?.action === "approve_pickup") {
    if (r.status !== "PENDING_APPROVAL") return err(`${r.rma_number} is ${r.status}; pickup can only be approved from PENDING_APPROVAL.`);
    if (!r.return_fee_paid) return err(`${r.rma_number}'s return fee isn't paid yet.`);
    return proposal({
      action: "approve_return_pickup", title: `Approve pickup for ${r.rma_number}`, risk: "medium", details: base,
      warning: "Books a reverse pickup with the courier.",
      requests: [{ method: "POST", path: `/api/returns/${r.id}/approve-pickup`, body: {} }],
    });
  }
  if (input?.action === "set_status") {
    if (!RETURN_STATUSES.includes(input?.status)) return err(`status must be one of ${RETURN_STATUSES.join(", ")}`);
    if (r.status === "PENDING_FEE" && input.status !== "REJECTED") return err("From PENDING_FEE the only allowed change is REJECTED (fee unpaid).");
    return proposal({
      action: "update_return_status", title: `Set ${r.rma_number} to ${input.status}`, risk: input.status === "REFUNDED" ? "medium" : "low",
      details: [...base, { label: "New status", value: input.status }],
      requests: [{ method: "PATCH", path: `/api/returns/${r.id}/status`, body: { status: input.status } }],
    });
  }
  return err("action must be approve_pickup or set_status");
}

async function reviewLeave(input: any, ctx: CopilotToolContext) {
  if (!ctx.isAdmin) return err("Admin only.");
  if (!["approve", "reject"].includes(input?.decision)) return err("decision must be approve or reject");
  const istDate = (c: string) => sql.raw(`((${c}) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date`);
  const cond = input?.leaveRequestId
    ? sql`l.id = ${String(input.leaveRequestId)}`
    : input?.personName ? sql`u.full_name ILIKE ${"%" + escapeLike(String(input.personName)) + "%"}` : null;
  if (!cond) return err("Give leaveRequestId or personName.");
  const rows = rowsOf(await db.execute(sql`
    SELECT l.id, u.full_name, l.leave_type, l.reason, l.status,
           ${istDate("l.start_date")} AS start_date, ${istDate("l.end_date")} AS end_date
    FROM leave_requests l JOIN users u ON u.id = l.user_id
    WHERE ${cond} AND l.status = 'pending'
      AND EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id = l.user_id AND us.store_id = ${ctx.storeId})`));
  if (!rows.length) return err("No matching pending leave request in this store.");
  if (rows.length > 1) return err(`Several pending requests match: ${rows.map((r) => `${r.full_name} ${r.start_date}→${r.end_date} (id ${r.id})`).join("; ")}. Which one?`);
  const l = rows[0];
  const note = String(input?.note ?? "").trim().slice(0, 300);
  const status = input.decision === "approve" ? "approved" : "rejected";
  return proposal({
    action: "review_leave",
    title: `${input.decision === "approve" ? "Approve" : "Reject"} ${l.full_name}'s leave`,
    risk: "low",
    details: [
      { label: "Who", value: l.full_name }, { label: "Dates", value: `${l.start_date} → ${l.end_date} (${l.leave_type})` },
      ...(l.reason ? [{ label: "Reason", value: l.reason }] : []), ...(note ? [{ label: "Note", value: note }] : []),
    ],
    requests: [{ method: "PATCH", path: `/api/leave-requests/${l.id}`, body: { status, reviewedBy: ctx.userId, ...(note ? { reviewNote: note } : {}) } }],
  });
}

async function approvePayroll(input: any, ctx: CopilotToolContext) {
  if (!ctx.isAdmin) return err("Admin only.");
  const y = Number(input?.year), m = Number(input?.month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return err("year and month (1-12) are required");
  let c: any;
  try {
    c = rowsOf(await db.execute(sql`SELECT id, status, employee_count, total_payout FROM payroll_cycles
      WHERE store_id = ${ctx.storeId} AND year = ${y} AND month = ${m}`))[0];
  } catch (e: any) {
    if (/does not exist/i.test(String(e?.message))) return err("Payroll isn't set up in this database.");
    throw e;
  }
  if (!c) return err(`No payroll cycle for ${y}-${String(m).padStart(2, "0")} in this store. Generate it on the Payroll page first.`);
  if (c.status === "approved") return err("That cycle is already approved.");
  return proposal({
    action: "approve_payroll",
    title: `Approve payroll ${y}-${String(m).padStart(2, "0")}`,
    risk: "high",
    details: [{ label: "Employees", value: String(c.employee_count) }, { label: "Total payout", value: inr(c.total_payout) }, { label: "Status", value: `${c.status} → approved` }],
    warning: `Locks the cycle and emails payslips to ${c.employee_count} employee${c.employee_count === 1 ? "" : "s"}.`,
    requests: [{ method: "POST", path: `/api/payroll/cycles/${c.id}/approve`, body: { currentUserId: ctx.userId } }],
  });
}

function shopifySync(input: any) {
  const daysBack = clamp(input?.daysBack, 7, 1, 365);
  return proposal({
    action: "shopify_sync",
    title: `Pull the last ${daysBack} day${daysBack === 1 ? "" : "s"} of orders from Shopify`,
    risk: "low",
    details: [{ label: "Window", value: `last ${daysBack} days` }, { label: "Duplicates", value: "skipped automatically" }],
    requests: [{ method: "POST", path: "/api/shopify/sync", body: { limit: 250, daysBack } }],
  });
}

function reconDigest(input: any, ctx: CopilotToolContext) {
  if (!ctx.isAdmin) return err("Admin only.");
  const digestType = input?.digestType === "bi-weekly" ? "bi-weekly" : "3-day";
  const test = input?.test !== false;
  return proposal({
    action: "send_recon_digest",
    title: `Email the ${digestType} reconciliation digest${test ? " (test, to you)" : " to all admins"}`,
    risk: test ? "low" : "medium",
    details: [{ label: "Recipients", value: test ? "Only you" : "Every active admin" }],
    requests: [{ method: "POST", path: "/api/recon/send-digest", body: { storeId: ctx.storeId, digestType, test } }],
  });
}
