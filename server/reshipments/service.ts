// ─────────────────────────────────────────────────────────────────────
//  RESHIPMENTS SERVICE  —  read/write for the reshipment_logs table +
//  the "create a duplicate order in Shopify" orchestration.
//
//  Splits cleanly from the payload builder (pure) so this file owns
//  DB access, Shopify I/O, and duplicate-guarding — the payload
//  builder stays deterministic and unit-testable.
// ─────────────────────────────────────────────────────────────────────
import { db } from "../db";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  reshipmentLogs,
  orders,
  users,
  type ReshipmentLog,
  type ReshipmentReason,
  type ReshipmentUrgency,
} from "@shared/schema";
import { getShopifyClient } from "../shopify";
import {
  buildReshipmentPayload,
  type ReshipmentShippingAddress,
} from "./payload";

export interface CreateReshipmentInput {
  storeId: string;
  /** OrderFlow row id of the original failed order. */
  originalOrderId: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: ReshipmentShippingAddress;
  reason: ReshipmentReason;
  urgency: ReshipmentUrgency;
  scheduledDate?: string | null;
  internalNotes?: string | null;
  createdBy?: string | null;
  /** Stored alongside the id so the audit survives a rename/delete. */
  createdByName?: string | null;
}

export class ReshipmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Live reshipment = anything not yet terminal. If one already exists
 * against this original order, we block the second request instead of
 * silently duplicating the parcel — the operator sees an explicit error
 * with the existing new-order id so they can chase that one instead.
 */
const LIVE_STATUSES = ["pending", "in_transit", "ndr"] as const;

export async function createReshipment(
  input: CreateReshipmentInput,
): Promise<ReshipmentLog> {
  // 1. Fetch the OrderFlow order row — must exist and belong to this store.
  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.id, input.originalOrderId), eq(orders.storeId, input.storeId)),
    )
    .limit(1);
  if (!order) {
    throw new ReshipmentError("Original order not found in this store.", 404);
  }
  if (!order.shopifyOrderId) {
    throw new ReshipmentError(
      "Original order has no Shopify id — cannot duplicate.",
      400,
    );
  }

  // 2. Duplicate guard — refuse a second live reshipment for the same order.
  const existing = await db
    .select()
    .from(reshipmentLogs)
    .where(
      and(
        eq(reshipmentLogs.storeId, input.storeId),
        eq(reshipmentLogs.originalOrderId, input.originalOrderId),
        or(...LIVE_STATUSES.map((s) => eq(reshipmentLogs.courierStatus, s))),
      ),
    )
    .limit(1);
  if (existing.length) {
    const dup = existing[0];
    throw new ReshipmentError(
      `A live reshipment already exists for this order (${dup.newShopifyOrderName ?? dup.id}, status: ${dup.courierStatus}). Chase that one instead.`,
      409,
    );
  }

  // 3. Fetch the full Shopify order — we need the line_items with
  //    variant_id, and the gateway string exactly as Shopify has it.
  const shop = await getShopifyClient(input.storeId);
  let rawOrder: any;
  try {
    rawOrder = await shop.fetchOrder(order.shopifyOrderId);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // Shopify returns 402 on frozen/closed stores (unpaid invoice or the
    // merchant paused the shop). Surfacing the raw status here is useless
    // to an operator — name the actual problem and the fix.
    if (/payment required|402/i.test(msg)) {
      throw new ReshipmentError(
        "This store's Shopify account is frozen or closed, so orders can't be created in it. Switch to an active store using the store switcher, or resolve the Shopify billing issue.",
        409,
      );
    }
    if (/not found|404/i.test(msg)) {
      throw new ReshipmentError(
        "That order no longer exists in Shopify (it may have been deleted). Pick a different order.",
        404,
      );
    }
    throw new ReshipmentError(`Couldn't read the original order from Shopify: ${msg}`, 502);
  }
  const shopifyOrder = rawOrder?.order ?? rawOrder;
  if (!shopifyOrder?.line_items?.length) {
    throw new ReshipmentError(
      "Shopify returned no line items for the original order.",
      502,
    );
  }

  // 4. Derive the payment_type from the original order.
  //    Same predicate the ingest layer uses: case-insensitive "cod".
  const paymentType: "cod" | "prepaid" =
    (order.paymentMethod ?? "").toLowerCase().includes("cod") ? "cod" : "prepaid";

  // 5. Build the exact JSON body and POST it. Any Shopify validation
  //    error surfaces with the response body attached.
  const payload = buildReshipmentPayload({
    original: {
      id: shopifyOrder.id,
      name: shopifyOrder.name,
      currency: shopifyOrder.currency,
      total_price: shopifyOrder.total_price,
      payment_gateway_names: shopifyOrder.payment_gateway_names,
      line_items: shopifyOrder.line_items,
    },
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: order.customerEmail ?? shopifyOrder.email ?? undefined,
    shippingAddress: input.shippingAddress,
    reason: input.reason,
    urgency: input.urgency,
    scheduledDate: input.scheduledDate,
    internalNotes: input.internalNotes,
    paymentType,
  });
  const created = await shop.createOrder(payload);

  // 6. Persist the log — DB write is last so a Shopify failure never
  //    leaves an orphan row (Shopify order created but not tracked).
  const [row] = await db
    .insert(reshipmentLogs)
    .values({
      storeId: input.storeId,
      originalOrderId: input.originalOrderId,
      originalShopifyOrderId: order.shopifyOrderId,
      originalShopifyOrderName: order.shopifyOrderNumber
        ? `#${order.shopifyOrderNumber}`
        : `#${order.shopifyOrderId}`,
      newShopifyOrderId: String(created.id),
      // Shopify silently reassigns `name` on non-Plus plans, so the
      // returned value can differ from what we requested. Prefer
      // Shopify's own name (it's what the merchant sees in admin);
      // fall back to our "#1234R" convention when absent.
      newShopifyOrderName:
        created.name ??
        `${order.shopifyOrderNumber ? `#${order.shopifyOrderNumber}` : `#${order.shopifyOrderId}`}R`,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      shippingAddress: input.shippingAddress as any,
      reason: input.reason,
      urgencyType: input.urgency,
      scheduledDate: input.scheduledDate ?? null,
      internalNotes: input.internalNotes ?? null,
      paymentType,
      courierStatus: "pending",
      createdBy: input.createdBy ?? null,
      createdByName: input.createdByName ?? null,
    })
    .returning();

  return row;
}

/** Row shape returned to the dashboard — same as ReshipmentLog plus
 *  a joined `createdByName` (for the admin "Created by" column). */
export type ReshipmentRow = ReshipmentLog & { createdByName: string | null };

const rowShape = {
  id: reshipmentLogs.id,
  storeId: reshipmentLogs.storeId,
  originalOrderId: reshipmentLogs.originalOrderId,
  originalShopifyOrderId: reshipmentLogs.originalShopifyOrderId,
  originalShopifyOrderName: reshipmentLogs.originalShopifyOrderName,
  newShopifyOrderId: reshipmentLogs.newShopifyOrderId,
  newShopifyOrderName: reshipmentLogs.newShopifyOrderName,
  customerName: reshipmentLogs.customerName,
  customerPhone: reshipmentLogs.customerPhone,
  shippingAddress: reshipmentLogs.shippingAddress,
  reason: reshipmentLogs.reason,
  urgencyType: reshipmentLogs.urgencyType,
  scheduledDate: reshipmentLogs.scheduledDate,
  internalNotes: reshipmentLogs.internalNotes,
  paymentType: reshipmentLogs.paymentType,
  trackingAwb: reshipmentLogs.trackingAwb,
  courierName: reshipmentLogs.courierName,
  courierStatus: reshipmentLogs.courierStatus,
  createdBy: reshipmentLogs.createdBy,
  // Live join wins for display; the stored column is the durable audit
  // record for when the user is later renamed or removed.
  createdByName: sql<string | null>`COALESCE(${users.fullName}, ${reshipmentLogs.createdByName})`,
  cancelledAt: reshipmentLogs.cancelledAt,
  cancelledBy: reshipmentLogs.cancelledBy,
  createdAt: reshipmentLogs.createdAt,
  updatedAt: reshipmentLogs.updatedAt,
};

/**
 * Table rows for the dashboard, most-recent first.
 *
 * Access model — this is what payroll incentives ride on so it MUST
 * be tight:
 *   • admin      → sees every reshipment in the store (createdByName
 *                  populated so they can see who did what)
 *   • non-admin  → sees only rows where they were the creator. The
 *                  server enforces this from the resolved-session user
 *                  id, NOT anything the client can pass, so the
 *                  incentive count can't be spoofed.
 *
 * Optional `filter=attention` scopes to NDR/RTO orders (§4B).
 */
export async function listReshipments(
  storeId: string,
  filter: "all" | "attention" = "all",
  opts: { createdByOnly?: string } = {},
): Promise<ReshipmentRow[]> {
  const scopeCreator = opts.createdByOnly
    ? eq(reshipmentLogs.createdBy, opts.createdByOnly)
    : sql`TRUE`;

  if (filter === "attention") {
    return db
      .select(rowShape)
      .from(reshipmentLogs)
      .leftJoin(orders, eq(orders.id, reshipmentLogs.originalOrderId))
      .leftJoin(users, eq(users.id, reshipmentLogs.createdBy))
      .where(
        and(
          eq(reshipmentLogs.storeId, storeId),
          scopeCreator,
          or(
            eq(reshipmentLogs.courierStatus, "ndr"),
            eq(reshipmentLogs.courierStatus, "rto"),
            sql`${orders.status} IN ('rto_initiated','rto_ofd','rto_delivered')`,
          ),
        ),
      )
      .orderBy(desc(reshipmentLogs.createdAt)) as unknown as ReshipmentRow[];
  }

  return db
    .select(rowShape)
    .from(reshipmentLogs)
    .leftJoin(users, eq(users.id, reshipmentLogs.createdBy))
    .where(and(eq(reshipmentLogs.storeId, storeId), scopeCreator))
    .orderBy(desc(reshipmentLogs.createdAt)) as unknown as Promise<ReshipmentRow[]>;
}

/**
 * My-numbers strip for the top of the dashboard. For agents this
 * counts THEIR own reshipments (payroll incentive visibility);
 * for admins it counts everything in the store.
 */
export async function getReshipmentStats(
  storeId: string,
  opts: { createdByOnly?: string } = {},
): Promise<{
  total: number;
  delivered: number;
  inTransit: number;
  ndr: number;
  rto: number;
  pending: number;
  cancelled: number;
}> {
  const scopeCreator = opts.createdByOnly
    ? eq(reshipmentLogs.createdBy, opts.createdByOnly)
    : sql`TRUE`;
  const res: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4 AS total,
      COUNT(*) FILTER (WHERE courier_status = 'delivered')::int4 AS delivered,
      COUNT(*) FILTER (WHERE courier_status = 'in_transit')::int4 AS in_transit,
      COUNT(*) FILTER (WHERE courier_status = 'ndr')::int4 AS ndr,
      COUNT(*) FILTER (WHERE courier_status = 'rto')::int4 AS rto,
      COUNT(*) FILTER (WHERE courier_status = 'pending')::int4 AS pending,
      COUNT(*) FILTER (WHERE courier_status = 'cancelled')::int4 AS cancelled
    FROM reshipment_logs
    WHERE store_id = ${storeId}
      ${opts.createdByOnly ? sql`AND created_by = ${opts.createdByOnly}` : sql``}
  `);
  const r = (res.rows ?? res)[0] ?? {};
  return {
    total: Number(r.total ?? 0),
    delivered: Number(r.delivered ?? 0),
    inTransit: Number(r.in_transit ?? 0),
    ndr: Number(r.ndr ?? 0),
    rto: Number(r.rto ?? 0),
    pending: Number(r.pending ?? 0),
    cancelled: Number(r.cancelled ?? 0),
  };
}

/** Fetch one row scoped to the store (and to the creator for agents). */
async function getReshipmentOr404(
  storeId: string,
  id: string,
  createdByOnly?: string,
): Promise<ReshipmentLog> {
  const [row] = await db
    .select()
    .from(reshipmentLogs)
    .where(
      and(
        eq(reshipmentLogs.id, id),
        eq(reshipmentLogs.storeId, storeId),
        createdByOnly ? eq(reshipmentLogs.createdBy, createdByOnly) : sql`TRUE`,
      ),
    )
    .limit(1);
  if (!row) throw new ReshipmentError("Reshipment not found.", 404);
  return row;
}

/** Guard: edit/cancel are only legal while pending. */
function assertMutable(row: ReshipmentLog, action: string): void {
  if (row.courierStatus !== "pending") {
    throw new ReshipmentError(
      row.courierStatus === "cancelled"
        ? `This reshipment is already cancelled, so it can't be ${action}.`
        : `This reshipment has already entered the courier lifecycle (${row.courierStatus.replace(/_/g, " ")}), so it can't be ${action}. Only pending reshipments are editable.`,
      409,
    );
  }
}

export interface UpdateReshipmentInput {
  customerPhone?: string;
  shippingAddress?: ReshipmentShippingAddress;
  reason?: ReshipmentReason;
  urgency?: ReshipmentUrgency;
  scheduledDate?: string | null;
  internalNotes?: string | null;
}

/**
 * Edit a pending reshipment. Address/phone changes are pushed to the
 * Shopify duplicate too — otherwise the courier still ships to the old
 * address and the edit would be cosmetic.
 *
 * Shopify goes FIRST: if it rejects the change we surface the error and
 * leave our record untouched, so the two systems can't diverge.
 */
export async function updateReshipment(
  storeId: string,
  id: string,
  input: UpdateReshipmentInput,
  opts: { createdByOnly?: string } = {},
): Promise<ReshipmentLog> {
  const row = await getReshipmentOr404(storeId, id, opts.createdByOnly);
  assertMutable(row, "edited");

  const addressChanged =
    !!input.shippingAddress || (!!input.customerPhone && input.customerPhone !== row.customerPhone);

  if (addressChanged && row.newShopifyOrderId) {
    const nextAddress = {
      ...((row.shippingAddress as any) ?? {}),
      ...(input.shippingAddress ?? {}),
      phone: input.customerPhone ?? row.customerPhone,
    };
    const shop = await getShopifyClient(storeId);
    try {
      await shop.updateOrderShippingAddress(row.newShopifyOrderId, {
        firstName: nextAddress.first_name,
        lastName: nextAddress.last_name,
        address1: nextAddress.address1,
        address2: nextAddress.address2,
        city: nextAddress.city,
        province: nextAddress.province,
        zip: nextAddress.zip,
        country: nextAddress.country ?? "India",
        phone: input.customerPhone ?? row.customerPhone,
      });
    } catch (e: any) {
      throw new ReshipmentError(
        `Couldn't update the address on the Shopify order, so nothing was changed here either: ${e?.message ?? e}`,
        502,
      );
    }
  }

  const [updated] = await db
    .update(reshipmentLogs)
    .set({
      customerPhone: input.customerPhone ?? row.customerPhone,
      shippingAddress: (input.shippingAddress ?? row.shippingAddress) as any,
      reason: input.reason ?? row.reason,
      urgencyType: input.urgency ?? row.urgencyType,
      // Clearing the date is meaningful when switching back to instant.
      scheduledDate:
        input.urgency === "instant" ? null : (input.scheduledDate ?? row.scheduledDate),
      internalNotes:
        input.internalNotes !== undefined ? input.internalNotes : row.internalNotes,
      updatedAt: new Date(),
    })
    .where(eq(reshipmentLogs.id, id))
    .returning();
  return updated;
}

/**
 * Cancel a pending reshipment and the Shopify duplicate behind it.
 *
 * Order matters: Shopify is cancelled FIRST. If that call fails we throw
 * and leave the row pending — the PRD is explicit that we must never
 * silently mark something cancelled here while a live order still sits
 * in Shopify ready to ship.
 */
export async function cancelReshipment(
  storeId: string,
  id: string,
  cancelledBy: string | null,
  opts: { createdByOnly?: string } = {},
): Promise<ReshipmentLog> {
  const row = await getReshipmentOr404(storeId, id, opts.createdByOnly);
  assertMutable(row, "cancelled");

  if (row.newShopifyOrderId) {
    const shop = await getShopifyClient(storeId);
    try {
      // notifyCustomer=false: the customer never knew about this
      // internal duplicate, so emailing them a cancellation would be
      // confusing. restock=false: the order was created with
      // inventory_behaviour "bypass", so no stock was ever decremented —
      // restocking here would inflate inventory.
      await shop.cancelOrder(row.newShopifyOrderId, "other", false, false);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      // Already-fulfilled orders can't be cancelled in Shopify. That's a
      // real-world state, not a bug — tell the operator plainly.
      if (/fulfilled/i.test(msg)) {
        throw new ReshipmentError(
          "This order has already been fulfilled in Shopify, so it can't be cancelled. The parcel is with the courier — track it instead.",
          409,
        );
      }
      throw new ReshipmentError(
        `Shopify wouldn't cancel the duplicate order, so the reshipment was left untouched: ${msg}`,
        502,
      );
    }
  }

  const [updated] = await db
    .update(reshipmentLogs)
    .set({
      courierStatus: "cancelled",
      cancelledAt: new Date(),
      cancelledBy,
      updatedAt: new Date(),
    })
    .where(eq(reshipmentLogs.id, id))
    .returning();
  return updated;
}

/**
 * Webhook-driven updates — called from the Shopify fulfillment webhook
 * (to capture AWB when Delhivery attaches one) and from the Delhivery
 * webhook (to bump status). Matched by new_shopify_order_id or by AWB.
 */
export async function updateFromFulfillment(params: {
  storeId: string;
  newShopifyOrderId: string;
  trackingAwb?: string | null;
  courierName?: string | null;
}): Promise<void> {
  await db
    .update(reshipmentLogs)
    .set({
      trackingAwb: params.trackingAwb ?? undefined,
      courierName: params.courierName ?? undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reshipmentLogs.storeId, params.storeId),
        eq(reshipmentLogs.newShopifyOrderId, params.newShopifyOrderId),
      ),
    );
}

export async function updateStatusByAwb(params: {
  awb: string;
  courierStatus: ReshipmentLog["courierStatus"];
  courierName?: string | null;
}): Promise<number> {
  const rows = await db
    .update(reshipmentLogs)
    .set({
      courierStatus: params.courierStatus,
      courierName: params.courierName ?? undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reshipmentLogs.trackingAwb, params.awb),
        // Cancelled is terminal — a late courier scan must not resurrect
        // a reshipment the operator already called off.
        sql`${reshipmentLogs.courierStatus} <> 'cancelled'`,
      ),
    )
    .returning({ id: reshipmentLogs.id });
  return rows.length;
}
