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
  /** Single-letter suffix for the new Shopify order name.
   *  "R" (default) for standard NDR-driven reshipments, "C" for
   *  customer-driven ones. Backend clamps to one A-Z char. */
  nameSuffix?: string | null;
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

  // 2. Duplicate guard — scoped by suffix so an "R" (NDR-driven) and a
  //    "C" (customer-driven) reshipment for the same original can coexist.
  //    They represent different intents, and blocking one because the
  //    other is live would force operators to cancel the R just to log a
  //    customer replacement.
  const wantedSuffix = (input.nameSuffix ?? "R").toUpperCase().trim() || "R";
  const existing = await db
    .select()
    .from(reshipmentLogs)
    .where(
      and(
        eq(reshipmentLogs.storeId, input.storeId),
        eq(reshipmentLogs.originalOrderId, input.originalOrderId),
        or(...LIVE_STATUSES.map((s) => eq(reshipmentLogs.courierStatus, s))),
      ),
    );
  const collision = existing.find((row) => {
    // newShopifyOrderName looks like "#1234R" or "#1234C" — pull the
    // trailing letter. Rows created before the suffix feature are all "R".
    const name = row.newShopifyOrderName ?? "";
    const suffix = (name.match(/([A-Z])\s*$/i)?.[1] ?? "R").toUpperCase();
    return suffix === wantedSuffix;
  });
  if (collision) {
    throw new ReshipmentError(
      `A live ${wantedSuffix === "C" ? "customer-driven" : "NDR-driven"} reshipment already exists for this order (${collision.newShopifyOrderName ?? collision.id}, status: ${collision.courierStatus}). Chase that one instead.`,
      409,
    );
  }

  // 3. Fetch the full Shopify order — we need the line_items with
  //    variant_id, and the gateway string exactly as Shopify has it.
  //    If Shopify 404s (the parent was deleted/archived — common on
  //    older orders), fall back to our local snapshot: orders +
  //    order_items carry everything the payload builder needs.
  const shop = await getShopifyClient(input.storeId);
  let shopifyOrder: any = null;
  let usedLocalFallback = false;
  try {
    const rawOrder = await shop.fetchOrder(order.shopifyOrderId);
    shopifyOrder = rawOrder?.order ?? rawOrder;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // 402 = frozen/closed shop. Not a per-order problem — tell the
    // operator to switch stores or resolve the billing issue upstream.
    if (/payment required|402/i.test(msg)) {
      throw new ReshipmentError(
        "This store's Shopify account is frozen or closed, so orders can't be created in it. Switch to an active store using the store switcher, or resolve the Shopify billing issue.",
        409,
      );
    }
    // 404 = the parent order isn't in Shopify any more. Could be
    // deleted, archived into a tier the API doesn't return, or a
    // store migration left a stale shopifyOrderId. Rebuild from the
    // local snapshot instead of forcing the operator to pick again.
    if (!/not found|404/i.test(msg)) {
      throw new ReshipmentError(`Couldn't read the original order from Shopify: ${msg}`, 502);
    }
    usedLocalFallback = true;
  }

  if (usedLocalFallback) {
    // Rebuild a Shopify-shaped order object from local tables. The
    // payload builder only reads a small subset (id, name, currency,
    // line_items, discount info) so the shim stays compact.
    const { orderItems } = await import("@shared/schema");
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    if (!items.length) {
      throw new ReshipmentError(
        "That order isn't in Shopify any more AND we have no local line items for it — nothing to duplicate. Pick a different order.",
        422,
      );
    }
    // local discountCodes is text[], but builder wants [{code, amount, type}].
    const codes: string[] = Array.isArray(order.discountCodes)
      ? (order.discountCodes as string[])
      : order.discountCode
        ? [order.discountCode]
        : [];
    // Look up the Shopify customer by phone BEFORE building the payload.
    // Without this, buildReshipmentPayload falls through to the
    // create-new-customer branch and Shopify 422s on phone-uniqueness
    // the moment the number is already on an existing profile — which
    // for a reshipment is essentially always. Linking by id avoids
    // the collision entirely.
    const customerPhone = input.customerPhone ?? order.customerPhone ?? null;
    let linkedCustomerId: string | null = null;
    if (customerPhone) {
      try {
        linkedCustomerId = await shop.findCustomerByPhone(customerPhone);
        if (linkedCustomerId) {
          console.log(
            `[reshipments] #${order.shopifyOrderNumber ?? order.shopifyOrderId}: linked to existing Shopify customer ${linkedCustomerId} by phone`,
          );
        }
      } catch (e: any) {
        // Lookup failure is non-fatal — payload builder will fall
        // back to create-new; this just makes a potential 422 louder
        // in the logs so ops knows what happened.
        console.warn(
          `[reshipments] customer-by-phone lookup failed: ${e?.message ?? e}`,
        );
      }
    }

    shopifyOrder = {
      id: order.shopifyOrderId,
      name: order.shopifyOrderNumber ? `#${order.shopifyOrderNumber}` : `#${order.shopifyOrderId}`,
      currency: "INR",
      total_price: order.totalPrice,
      total_discounts: 0, // we don't track parent-level discount totals locally
      payment_gateway_names: [], // builder defaults to COD/manual
      // Minimal discount-code block so attribution still fires.
      discount_codes: codes.map((code) => ({ code, amount: "0.00", type: "fixed_amount" })),
      // Link to the existing customer when we found one; otherwise
      // null forces the create-new branch (last-resort — rare).
      customer: linkedCustomerId ? { id: linkedCustomerId } : null,
      email: order.customerEmail ?? undefined,
      line_items: items.map((li) => ({
        variant_id: li.shopifyVariantId ?? undefined,
        product_id: li.shopifyProductId ?? undefined,
        title: li.productName,
        name: li.productName,
        quantity: li.quantity,
        price: li.price,
        sku: li.sku ?? undefined,
        taxable: true,
        requires_shipping: true,
      })),
    };
    console.log(
      `[reshipments] #${order.shopifyOrderNumber ?? order.shopifyOrderId}: Shopify 404 → rebuilt from local snapshot (${items.length} items)`,
    );
  }

  if (!shopifyOrder?.line_items?.length) {
    throw new ReshipmentError(
      "No line items found for the original order.",
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
      total_discounts: shopifyOrder.total_discounts,
      payment_gateway_names: shopifyOrder.payment_gateway_names,
      // Inherit the parent order's discount code(s) — e.g. TARA10 — so
      // the reshipment shows against the same coupon in Shopify Discounts
      // and gets credited by agent-attribution reports.
      discount_codes: shopifyOrder.discount_codes,
      // Reference the parent's Shopify customer directly. Without this
      // Shopify tries to CREATE a new customer from the phone/email we
      // send and 422s on the phone-uniqueness constraint the moment the
      // phone is already on another profile.
      customer: shopifyOrder.customer ? { id: shopifyOrder.customer.id } : null,
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
    nameSuffix: input.nameSuffix ?? undefined,
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
