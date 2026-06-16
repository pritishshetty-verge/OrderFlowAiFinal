import { Request, Response } from "express";
import { verifyShopifyHmac } from "./shopify";
import { storage } from "./storage";
import { OrderAssignmentEngine } from "./assignment";
import type { InsertOrder, InsertCustomer, InsertOrderItem } from "@shared/schema";
import { mapShopifyStatus, extractFulfillmentTracking } from "./utils/orderStatus";
import { triggerWebhooks } from "./services/webhooks";
import {
  resolveWebhookStore,
  type ResolvedWebhookStore,
} from "./webhookStoreResolver";

// ─────────────────────────────────────────────────────────────────────
// Phase 5 — Per-store Shopify webhook authentication & routing.
//
// The flow for every inbound webhook:
//   1. Resolve which `stores` row sent the webhook from
//      X-Shopify-Shop-Domain (canonical) or body fallbacks. If no
//      match exists, 404 the webhook — Shopify retries until the
//      admin provisions the row.
//   2. Verify HMAC against THAT store's webhook_secret. The HMAC
//      input is `req.rawBody` (the bytes Shopify signed), not
//      JSON.stringify(req.body) — Express's body parser normalises
//      whitespace/Unicode, so a re-stringified copy never byte-
//      matches the signature and the verify silently fails.
//   3. Return the resolved store to the handler so it can stamp
//      `storeId` on every order/customer insert and scope its
//      de-dup lookups by (storeId, shopify_id).
//
// n8n relay path is preserved: requests bearing X-Forwarded-By: n8n
// still skip HMAC (the relay re-signs with its own envelope), but
// they MUST still resolve to a known store via the body's shop
// domain — otherwise we can't know which tenant to write into.
// ─────────────────────────────────────────────────────────────────────

type VerifyResult =
  | { valid: true; resolved: ResolvedWebhookStore }
  | { valid: false; status: number; error: string };

async function verifyWebhookAuth(req: Request): Promise<VerifyResult> {
  // ── Resolve which store sent this webhook. Needed even on the
  // n8n path because we need the storeId to stamp on inserts.
  const resolved = await resolveWebhookStore(req);
  if (!resolved) {
    console.error(
      "[webhook] could not resolve store from request — no matching `stores` row",
      {
        domainHeader: req.get("X-Shopify-Shop-Domain"),
        bodyDomain: (req.body as any)?.myshopify_domain,
      },
    );
    // 404 (not 401) so Shopify retries — this is "we don't know
    // who sent this," not "you're unauthorized."
    return {
      valid: false,
      status: 404,
      error: "Store not provisioned for this shop domain.",
    };
  }

  const forwardedBy = req.get("X-Forwarded-By");
  if (forwardedBy === "n8n") {
    console.log(
      `✓ Webhook received from n8n relay for ${resolved.store.storeUrl} (HMAC verification skipped)`,
    );
    return { valid: true, resolved };
  }

  // Direct Shopify webhook — HMAC verify against the resolved
  // store's secret.
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  if (!hmac) {
    console.error("[webhook] missing X-Shopify-Hmac-Sha256 header");
    return { valid: false, status: 401, error: "Unauthorized: Missing signature" };
  }
  if (!resolved.webhookSecret) {
    console.error(
      `[webhook] store ${resolved.store.storeUrl} has no webhook_secret configured — cannot verify HMAC`,
    );
    return {
      valid: false,
      status: 401,
      error: "Unauthorized: Webhook secret not configured for this store",
    };
  }
  // Use the raw request body (Buffer) captured by the verify hook
  // in server/index.ts. JSON.stringify(req.body) does NOT byte-match
  // Shopify's signature because the parser normalises whitespace.
  const rawBody = req.rawBody as Buffer | undefined;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    console.error("[webhook] rawBody not captured — cannot verify HMAC");
    return {
      valid: false,
      status: 500,
      error: "Server misconfiguration: raw body unavailable",
    };
  }
  if (!verifyShopifyHmac(rawBody, hmac, resolved.webhookSecret)) {
    console.error(
      `[webhook] HMAC mismatch for ${resolved.store.storeUrl}`,
    );
    return { valid: false, status: 401, error: "Unauthorized: Invalid signature" };
  }
  console.log(
    `✓ Direct Shopify webhook verified for ${resolved.store.storeUrl}`,
  );
  return { valid: true, resolved };
}

export async function handleOrderCreated(req: Request, res: Response) {
  try {
    // Verify webhook authenticity (supports both Shopify direct and n8n relay)
    const verification = await verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(verification.status).json({ error: verification.error });
    }
    // The store this webhook belongs to. Stamped on every row this
    // handler writes so cross-tenant queries stay scoped.
    const { store } = verification.resolved;

    const shopifyOrder = req.body;

    // Log incoming payload for debugging
    console.log("Incoming webhook payload:", JSON.stringify(shopifyOrder, null, 2));

    // Validate required fields
    if (!shopifyOrder || !shopifyOrder.id) {
      console.error("Invalid webhook payload: missing order ID");
      console.error("Payload structure:", Object.keys(shopifyOrder || {}));
      return res.status(400).json({
        error: "Invalid payload: missing order ID",
        receivedKeys: Object.keys(shopifyOrder || {})
      });
    }

    // Log webhook receipt
    await storage.createWebhookLog({
      storeId: store.id,
      topic: "orders/create",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder,
    });

    // Check if order already exists — scoped to THIS store so a
    // coincidental shopify_order_id collision with another tenant
    // doesn't make us drop a legitimate order.
    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
      store.id,
    );
    if (existingOrder) {
      console.log(
        `Order ${shopifyOrder.id} already exists in ${store.storeUrl}, skipping`,
      );
      return res.status(200).json({ message: "Order already exists" });
    }

    // Create or update customer — same scoping rationale as orders.
    let customer;
    if (shopifyOrder.customer) {
      const existingCustomer = await storage.getCustomerByShopifyId(
        shopifyOrder.customer.id.toString(),
        store.id,
      );

      const customerData: InsertCustomer = {
        storeId: store.id,
        shopifyCustomerId: shopifyOrder.customer.id.toString(),
        email: shopifyOrder.customer.email || shopifyOrder.email,
        firstName: shopifyOrder.customer.first_name || null,
        lastName: shopifyOrder.customer.last_name || null,
        phone: shopifyOrder.customer.phone || shopifyOrder.phone || null,
      };

      if (existingCustomer) {
        customer = await storage.updateCustomer(existingCustomer.id, customerData);
      } else {
        customer = await storage.createCustomer(customerData);
      }
    }

    // Detect and normalize payment method.
    //
    // The previous two-string exact-match missed every merchant
    // gateway whose name wasn't exactly "Cash on Delivery" /
    // "Cash on Delivery (COD)" — e.g. "COD", "cash_on_delivery",
    // "Razorpay - COD". Those landed in the DB as raw gateway
    // strings, then the frontend's strict-equality transform
    // mis-labeled them as Prepaid (audit Bug #2). Case-insensitive
    // substring match catches every COD variant a merchant might
    // configure. Same predicate shape the backend filter + the
    // frontend transform now use, so all three layers agree.
    const rawPaymentMethod = shopifyOrder.payment_gateway_names?.[0] || "Unknown";
    const isCOD = rawPaymentMethod.toLowerCase().includes("cod");
    const normalizedPaymentMethod = isCOD ? "cod" : rawPaymentMethod;

    // Extract shipment status and tracking info from fulfillments
    const fulfillmentTracking = extractFulfillmentTracking(shopifyOrder.fulfillments);

    // Extract and parse tags (Shopify sends as comma-separated string)
    const tags = shopifyOrder.tags 
      ? shopifyOrder.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0)
      : [];

    // Auto-confirm prepaid orders - they skip the call verification queue
    // CRITICAL FIX: Only auto-confirm if payment method is in the prepaid list
    // This prevents COD orders that become "paid" after delivery from being auto-confirmed
    // Per-store: pull this store's prepaid_payment_methods setting
    // so auto-confirmation thresholds don't leak across tenants.
    const prepaidMethods = await storage.getPrepaidPaymentMethods(store.id);
    const prepaidMethodsLower = prepaidMethods.map(m => m.toLowerCase());
    const isPrepaid = shopifyOrder.financial_status === "paid" && 
                      prepaidMethodsLower.includes(normalizedPaymentMethod.toLowerCase());
    const autoCallStatus = isPrepaid ? "Confirmed" : undefined;

    // Create order — storeId stamped from the resolved webhook
    // origin so every downstream read (Pare, dashboard, NDR) sees
    // it under the right tenant.
    const orderData: InsertOrder = {
      storeId: store.id,
      shopifyOrderId: shopifyOrder.id.toString(),
      shopifyOrderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name,
      customerId: customer?.id || null,
      customerName: `${shopifyOrder.customer?.first_name || ""} ${shopifyOrder.customer?.last_name || ""}`.trim() || shopifyOrder.billing_address?.name || "Guest",
      customerEmail: shopifyOrder.email || null,
      customerPhone: shopifyOrder.phone || shopifyOrder.shipping_address?.phone || "",
      status: mapShopifyStatus(shopifyOrder.financial_status, shopifyOrder.fulfillment_status, fulfillmentTracking.shipmentStatus, shopifyOrder.cancelled_at),
      callStatus: autoCallStatus,
      fulfillmentStatus: shopifyOrder.fulfillment_status || null,
      fulfilledAt: shopifyOrder.fulfilled_at ? new Date(shopifyOrder.fulfilled_at) : null,
      financialStatus: shopifyOrder.financial_status || null,
      totalPrice: shopifyOrder.total_price || "0",
      subtotal: shopifyOrder.subtotal_price || "0",
      totalTax: shopifyOrder.total_tax || "0",
      totalDiscount: shopifyOrder.total_discounts || "0",
      discountCode: shopifyOrder.discount_codes?.[0]?.code || null,
      shippingPrice: shopifyOrder.total_shipping_price_set?.shop_money?.amount || "0",
      currency: shopifyOrder.currency || "INR",
      paymentMethod: normalizedPaymentMethod,
      shippingAddress: shopifyOrder.shipping_address || null,
      shippingAddressLine1: shopifyOrder.shipping_address?.address1 || null,
      shippingAddressLine2: shopifyOrder.shipping_address?.address2 || null,
      shippingCity: shopifyOrder.shipping_address?.city || null,
      shippingState: shopifyOrder.shipping_address?.province || null,
      shippingPincode: shopifyOrder.shipping_address?.zip || null,
      shippingCountry: shopifyOrder.shipping_address?.country || null,
      itemsCount: shopifyOrder.line_items?.length || 1,
      itemsSummary: shopifyOrder.line_items?.map((item: any) => item.name).join(", ") || null,
      assignedTo: null,
      assignedAt: null,
      shipmentStatus: fulfillmentTracking.shipmentStatus,
      trackingNumber: fulfillmentTracking.trackingNumber,
      trackingUrl: fulfillmentTracking.trackingUrl,
      courierName: fulfillmentTracking.trackingCompany,
      tags: tags,
      rawShopifyData: shopifyOrder,
      shopifyCreatedAt: new Date(shopifyOrder.created_at),
      shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
      // processed_at is the canonical financial timestamp Shopify's
      // sales reports bucket on — and what Pare's Phase 1 waterfall
      // uses. Fall back to created_at if absent so the column is
      // never NULL (matches server/routes.ts historical sync).
      processedAt: (shopifyOrder.processed_at ?? shopifyOrder.created_at) as string,
    };

    const order = await storage.createOrder(orderData);

    // Create order items with product image lookup from local database
    if (shopifyOrder.line_items && shopifyOrder.line_items.length > 0) {
      const items: InsertOrderItem[] = [];
      
      for (const item of shopifyOrder.line_items) {
        let imageUrl = item.image_url || null;
        
        // Try to look up product image from local products table.
        // Scoped to this store so cross-tenant variant id reuse
        // (private-label SKUs etc.) doesn't pull the wrong image.
        if (!imageUrl && item.variant_id) {
          try {
            const localProduct = await storage.getProductByVariantId(
              item.variant_id.toString(),
              store.id,
            );
            if (localProduct?.imageUrl) {
              imageUrl = localProduct.imageUrl;
            }
          } catch (err) {
            console.log(`Could not look up product image for variant ${item.variant_id}:`, err);
          }
        }

        items.push({
          storeId: store.id,
          orderId: order.id,
          shopifyLineItemId: item.id?.toString() || null,
          shopifyProductId: item.product_id?.toString() || null,
          shopifyVariantId: item.variant_id?.toString() || null,
          productName: item.name || "Unknown Product",
          variantTitle: item.variant_title || null,
          sku: item.sku || null,
          quantity: item.quantity,
          price: item.price || "0",
          totalPrice: (parseFloat(item.price || "0") * item.quantity).toString(),
          totalDiscount: item.total_discount || "0",
          imageUrl: imageUrl,
        });
      }

      await storage.createOrderItems(items);
    }

    // Create initial status history
    await storage.createOrderStatus({
      storeId: store.id,
      orderId: order.id,
      status: orderData.status || "Pending",
      previousStatus: null,
      changedBy: null,
      note: "Order created from Shopify",
    });

    // Auto-assign COD orders to available agents
    if (isCOD) {
      try {
        console.log(`Attempting auto-assignment for COD order ${order.shopifyOrderNumber}`);
        const assignmentEngine = new OrderAssignmentEngine(storage);
        const wasAssigned = await assignmentEngine.autoAssignOrder(order.id);
        
        if (wasAssigned) {
          console.log(`✓ COD order ${order.shopifyOrderNumber} auto-assigned successfully`);
        } else {
          console.log(`⚠ No agents available for auto-assignment of order ${order.shopifyOrderNumber}`);
        }
      } catch (assignError) {
        // Log error but don't fail the webhook
        console.error(`Error during auto-assignment for order ${order.shopifyOrderNumber}:`, assignError);
      }
    }

    const finalOrder = await storage.getOrder(order.id);
    let assignedAgentEmail: string | null = null;
    if (finalOrder?.assignedTo) {
      const agent = await storage.getUser(finalOrder.assignedTo);
      if (agent) assignedAgentEmail = agent.email;
    }
    triggerWebhooks('order.created', { order: finalOrder || order, shopifyOrderId: shopifyOrder.id, assignedAgentEmail });

    console.log(`Successfully created order ${order.shopifyOrderNumber}`);
    res.status(200).json({ message: "Order created successfully" });
  } catch (error) {
    console.error("Error processing order creation webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function handleOrderUpdated(req: Request, res: Response) {
  try {
    // Verify webhook authenticity (supports both Shopify direct and n8n relay)
    const verification = await verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(verification.status).json({ error: verification.error });
    }
    const { store } = verification.resolved;

    const shopifyOrder = req.body;

    // Log incoming payload for debugging
    console.log("Incoming order update webhook:", JSON.stringify(shopifyOrder, null, 2));

    // Validate required fields
    if (!shopifyOrder || !shopifyOrder.id) {
      console.error("Invalid webhook payload: missing order ID");
      return res.status(400).json({
        error: "Invalid payload: missing order ID",
        receivedKeys: Object.keys(shopifyOrder || {})
      });
    }

    // Log webhook receipt
    await storage.createWebhookLog({
      storeId: store.id,
      topic: "orders/update",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder,
    });

    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
      store.id,
    );

    if (!existingOrder) {
      console.log(`Order ${shopifyOrder.id} not found in ${store.storeUrl}, creating new order`);
      return handleOrderCreated(req, res);
    }

    // Update customer if needed
    if (shopifyOrder.customer && existingOrder.customerId) {
      const customerData: Partial<InsertCustomer> = {
        email: shopifyOrder.customer.email || shopifyOrder.email,
        firstName: shopifyOrder.customer.first_name || null,
        lastName: shopifyOrder.customer.last_name || null,
        phone: shopifyOrder.customer.phone || shopifyOrder.phone || null,
      };

      await storage.updateCustomer(existingOrder.customerId, customerData);
    }

    // Extract shipment status and tracking info from fulfillments
    const fulfillmentTracking = extractFulfillmentTracking(shopifyOrder.fulfillments);

    // Extract and parse tags (Shopify sends as comma-separated string)
    const tags = shopifyOrder.tags 
      ? shopifyOrder.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0)
      : [];

    // Update order
    const newStatus = mapShopifyStatus(
      shopifyOrder.financial_status,
      shopifyOrder.fulfillment_status,
      fulfillmentTracking.shipmentStatus,
      shopifyOrder.cancelled_at,
    );

    // Detect Scalysis AI auto-confirmation tag
    const SCALYSIS_TAG = "Scalysis: Order Confirmed ✅";
    const isScalysisConfirmed = tags.includes(SCALYSIS_TAG);
    const alreadyConfirmed = existingOrder.callStatus === "Confirmed";

    const orderData: Partial<InsertOrder> = {
      status: newStatus,
      fulfillmentStatus: shopifyOrder.fulfillment_status || null,
      fulfilledAt: shopifyOrder.fulfilled_at ? new Date(shopifyOrder.fulfilled_at) : null,
      financialStatus: shopifyOrder.financial_status || null,
      totalPrice: shopifyOrder.total_price || "0",
      subtotal: shopifyOrder.subtotal_price || "0",
      totalDiscount: shopifyOrder.total_discounts || "0",
      discountCode: shopifyOrder.discount_codes?.[0]?.code || null,
      shippingAddress: shopifyOrder.shipping_address || null,
      shippingAddressLine1: shopifyOrder.shipping_address?.address1 || null,
      shippingAddressLine2: shopifyOrder.shipping_address?.address2 || null,
      shipmentStatus: fulfillmentTracking.shipmentStatus,
      trackingNumber: fulfillmentTracking.trackingNumber,
      trackingUrl: fulfillmentTracking.trackingUrl,
      courierName: fulfillmentTracking.trackingCompany,
      tags: tags,
      rawShopifyData: shopifyOrder,
      shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
      // Keep processed_at in sync on updates. Shopify mutates this
      // field when payment captures late (e.g., authorize-then-capture
      // flows), so we refresh it here to keep Pare's Phase 1 daily
      // bucketing aligned with Shopify's own sales reports.
      processedAt: (shopifyOrder.processed_at ?? shopifyOrder.created_at) as string,
    };

    // Apply Scalysis AI confirmation (only if not already confirmed to avoid overwriting)
    if (isScalysisConfirmed && !alreadyConfirmed) {
      console.log(`[Scalysis] Auto-confirming order ${existingOrder.shopifyOrderNumber} via AI tag`);
      orderData.callStatus = "Confirmed";
      orderData.confirmedAt = new Date();
      orderData.confirmedBy = null;
      orderData.confirmedNotes = "Auto-confirmed by Scalysis AI";
    }

    await storage.updateOrder(existingOrder.id, orderData);

    // Create status history if status changed
    if (newStatus !== existingOrder.status) {
      await storage.createOrderStatus({
        storeId: store.id,
        orderId: existingOrder.id,
        status: newStatus,
        previousStatus: existingOrder.status,
        changedBy: null,
        note: "Status updated from Shopify",
      });
    }

    // Create Scalysis AI confirmation history entry
    if (isScalysisConfirmed && !alreadyConfirmed) {
      await storage.createOrderStatus({
        storeId: store.id,
        orderId: existingOrder.id,
        status: "confirmed",
        previousStatus: existingOrder.callStatus || "Pending",
        changedBy: null,
        note: "Auto-confirmed by Scalysis AI",
      });
    }

    console.log(`Successfully updated order ${existingOrder.shopifyOrderNumber}`);
    res.status(200).json({ message: "Order updated successfully" });
  } catch (error) {
    console.error("Error processing order update webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function handleOrderCancelled(req: Request, res: Response) {
  try {
    // Verify webhook authenticity (supports both Shopify direct and n8n relay)
    const verification = await verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(verification.status).json({ error: verification.error });
    }
    const { store } = verification.resolved;

    const shopifyOrder = req.body;

    // Log incoming payload for debugging
    console.log("Incoming order cancellation webhook:", JSON.stringify(shopifyOrder, null, 2));

    // Validate required fields
    if (!shopifyOrder || !shopifyOrder.id) {
      console.error("Invalid webhook payload: missing order ID");
      return res.status(400).json({
        error: "Invalid payload: missing order ID",
        receivedKeys: Object.keys(shopifyOrder || {})
      });
    }

    // Log webhook receipt
    await storage.createWebhookLog({
      storeId: store.id,
      topic: "orders/cancelled",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder,
    });

    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
      store.id,
    );

    if (!existingOrder) {
      console.log(`Order ${shopifyOrder.id} not found in ${store.storeUrl}`);
      return res.status(404).json({ error: "Order not found" });
    }

    // Update order status to cancelled.
    // Intentionally a targeted patch: we do NOT re-send processed_at
    // here, so the original financial timestamp is preserved. That
    // keeps the order in the SAME daily bucket in Pare's Phase 1
    // waterfall — it just shifts from Order Revenue into Canceled GMV
    // on the day the purchase actually happened, not the day it was
    // cancelled. This is the behaviour Shopify's own sales report has.
    await storage.updateOrder(existingOrder.id, {
      status: "Cancelled",
    });

    // Create status history
    await storage.createOrderStatus({
      storeId: store.id,
      orderId: existingOrder.id,
      status: "Cancelled",
      previousStatus: existingOrder.status,
      changedBy: null,
      note: shopifyOrder.cancel_reason
        ? `Cancelled: ${shopifyOrder.cancel_reason}`
        : "Cancelled from Shopify",
    });

    console.log(`Successfully cancelled order ${existingOrder.shopifyOrderNumber}`);
    res.status(200).json({ message: "Order cancelled successfully" });
  } catch (error) {
    console.error("Error processing order cancellation webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Handle Shopify fulfillments/update webhook
 * 
 * IMPORTANT: The payload is a Fulfillment object, NOT an Order object.
 * This webhook fires when shipment status changes (e.g., "out_for_delivery", "in_transit", "delivered").
 * 
 * Payload structure:
 * {
 *   id: number,
 *   order_id: number,
 *   status: string,           // "pending", "open", "success", "cancelled", "error", "failure"
 *   shipment_status: string,  // "confirmed", "in_transit", "out_for_delivery", "delivered", etc.
 *   tracking_number: string,
 *   tracking_url: string,
 *   tracking_company: string,
 *   ...
 * }
 */
export async function handleFulfillmentUpdate(req: Request, res: Response) {
  try {
    // Verify webhook authenticity (supports both Shopify direct and n8n relay)
    const verification = await verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(verification.status).json({ error: verification.error });
    }
    const { store } = verification.resolved;

    const fulfillment = req.body;

    // Log incoming payload for debugging
    console.log("[Fulfillment Update] Incoming webhook:", JSON.stringify(fulfillment, null, 2));

    // Validate required fields - this is a Fulfillment object, not an Order
    if (!fulfillment || !fulfillment.order_id) {
      console.error("[Fulfillment Update] Invalid payload: missing order_id");
      return res.status(400).json({
        error: "Invalid payload: missing order_id",
        receivedKeys: Object.keys(fulfillment || {})
      });
    }

    // Log webhook receipt
    await storage.createWebhookLog({
      storeId: store.id,
      topic: "fulfillments/update",
      shopifyOrderId: fulfillment.order_id?.toString() || null,
      payload: fulfillment,
    });

    // Find the order by Shopify order ID — scoped to the resolved
    // store so we don't update another tenant's order with the same
    // Shopify id.
    const existingOrder = await storage.getOrderByShopifyId(
      fulfillment.order_id.toString(),
      store.id,
    );

    if (!existingOrder) {
      console.log(
        `[Fulfillment Update] Order not found for Shopify ID ${fulfillment.order_id} in ${store.storeUrl}`,
      );
      return res.status(200).json({ message: "Order not found, ignoring" });
    }

    // Extract shipment status from fulfillment
    const shopifyShipmentStatus = fulfillment.shipment_status || null;
    const trackingNumber = fulfillment.tracking_number || existingOrder.trackingNumber;
    const trackingUrl = fulfillment.tracking_url || existingOrder.trackingUrl;
    const trackingCompany = fulfillment.tracking_company || existingOrder.courierName;

    console.log(`[Fulfillment Update] Order ${existingOrder.shopifyOrderNumber}: shipment_status = "${shopifyShipmentStatus}"`);

    // Map Shopify shipment_status to our internal status
    // Shopify values: "confirmed", "in_transit", "out_for_delivery", "delivered", "failure", etc.
    const mapShipmentStatusToInternal = (status: string | null): string | null => {
      if (!status) return null;
      
      const statusLower = status.toLowerCase();
      
      // Map to user-friendly display values
      const statusMap: Record<string, string> = {
        "confirmed": "Confirmed",
        "in_transit": "In Transit",
        "out_for_delivery": "Out for Delivery",
        "delivered": "Delivered",
        "attempted_delivery": "Attempted Delivery",
        "failure": "Delivery Failed",
        "ready_for_pickup": "Ready for Pickup",
        "picked_up": "Picked Up",
      };
      
      return statusMap[statusLower] || status;
    };

    const mappedShipmentStatus = mapShipmentStatusToInternal(shopifyShipmentStatus);

    // Determine if we should also update the main order status
    // For "out_for_delivery" and "in_transit", we want the order to appear in the OFD tab
    let newOrderStatus: string | undefined = undefined;
    
    if (shopifyShipmentStatus) {
      const statusLower = shopifyShipmentStatus.toLowerCase();
      
      if (statusLower === "out_for_delivery") {
        newOrderStatus = "out_for_delivery";
      } else if (statusLower === "in_transit") {
        newOrderStatus = "in_transit";
      } else if (statusLower === "delivered") {
        newOrderStatus = "Delivered";
      }
    }

    // Build update object
    const updateData: any = {
      shipmentStatus: mappedShipmentStatus,
      trackingNumber: trackingNumber,
      trackingUrl: trackingUrl,
      courierName: trackingCompany,
    };

    // Only update main status if we have a mapped value
    if (newOrderStatus) {
      updateData.status = newOrderStatus;
    }

    await storage.updateOrder(existingOrder.id, updateData);

    // Create status history if main status changed
    if (newOrderStatus && newOrderStatus !== existingOrder.status) {
      await storage.createOrderStatus({
        storeId: store.id,
        orderId: existingOrder.id,
        status: newOrderStatus,
        previousStatus: existingOrder.status,
        changedBy: null,
        note: `Shipment status updated: ${mappedShipmentStatus}`,
      });
    }

    console.log(`[Fulfillment Update] Successfully updated order ${existingOrder.shopifyOrderNumber} - shipmentStatus: ${mappedShipmentStatus}, status: ${newOrderStatus || '(unchanged)'}`);
    res.status(200).json({ message: "Fulfillment update processed successfully" });
  } catch (error) {
    console.error("[Fulfillment Update] Error processing webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

