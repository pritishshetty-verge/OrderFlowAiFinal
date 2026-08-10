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
const LIVE_STATUSES = ["pending", "in_transit", "out_for_delivery", "ndr"] as const;

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
  const rawOrder = await shop.fetchOrder(order.shopifyOrderId);
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
      newShopifyOrderName: created.name ?? null,
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
    })
    .returning();

  return row;
}

/** Table rows for the dashboard, most-recent first. Optionally
 *  filtered to the Requires Attention set (§4B): reshipments whose
 *  NEW order is currently NDR/RTO, OR whose ORIGINAL was RTO'd. */
export async function listReshipments(
  storeId: string,
  filter: "all" | "attention" = "all",
): Promise<ReshipmentLog[]> {
  if (filter === "attention") {
    return db
      .select({
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
        createdAt: reshipmentLogs.createdAt,
        updatedAt: reshipmentLogs.updatedAt,
      })
      .from(reshipmentLogs)
      .leftJoin(orders, eq(orders.id, reshipmentLogs.originalOrderId))
      .where(
        and(
          eq(reshipmentLogs.storeId, storeId),
          or(
            eq(reshipmentLogs.courierStatus, "ndr"),
            eq(reshipmentLogs.courierStatus, "rto"),
            sql`${orders.status} IN ('rto_initiated','rto_ofd','rto_delivered')`,
          ),
        ),
      )
      .orderBy(desc(reshipmentLogs.createdAt)) as unknown as ReshipmentLog[];
  }

  return db
    .select()
    .from(reshipmentLogs)
    .where(eq(reshipmentLogs.storeId, storeId))
    .orderBy(desc(reshipmentLogs.createdAt));
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
    .where(eq(reshipmentLogs.trackingAwb, params.awb))
    .returning({ id: reshipmentLogs.id });
  return rows.length;
}
