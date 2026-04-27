import { Request, Response } from "express";
import { shopifyClient } from "./shopify";
import { storage } from "./storage";
import { OrderAssignmentEngine } from "./assignment";
import type { InsertOrder, InsertCustomer, InsertOrderItem } from "@shared/schema";
import { mapShopifyStatus, extractFulfillmentTracking } from "./utils/orderStatus";
import { triggerWebhooks } from "./services/webhooks";

// Helper function to verify webhook authenticity
// Supports both direct Shopify webhooks and n8n relay
function verifyWebhookAuth(req: Request): { valid: boolean; error?: string } {
  const forwardedBy = req.get("X-Forwarded-By");
  
  // If request comes from n8n relay, skip HMAC verification
  if (forwardedBy === "n8n") {
    console.log("✓ Webhook received from n8n relay (HMAC verification skipped)");
    return { valid: true };
  }

  // Direct Shopify webhook - verify HMAC
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  const body = JSON.stringify(req.body);

  if (!hmac) {
    console.error("Webhook verification failed: Missing HMAC header");
    return { valid: false, error: "Unauthorized: Missing signature" };
  }

  try {
    if (!shopifyClient.verifyWebhook(body, hmac)) {
      console.error("Webhook verification failed: Invalid signature");
      return { valid: false, error: "Unauthorized: Invalid signature" };
    }
    console.log("✓ Direct Shopify webhook verified");
    return { valid: true };
  } catch (verifyError: any) {
    console.error("Webhook verification error:", verifyError.message);
    return { valid: false, error: "Unauthorized: Webhook secret not configured" };
  }
}

export async function handleOrderCreated(req: Request, res: Response) {
  try {
    // Verify webhook authenticity (supports both Shopify direct and n8n relay)
    const verification = verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

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
      topic: "orders/create",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder,
    });

    // Check if order already exists
    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
    );
    if (existingOrder) {
      console.log(`Order ${shopifyOrder.id} already exists, skipping`);
      return res.status(200).json({ message: "Order already exists" });
    }

    // Create or update customer
    let customer;
    if (shopifyOrder.customer) {
      const existingCustomer = await storage.getCustomerByShopifyId(
        shopifyOrder.customer.id.toString(),
      );

      const customerData: InsertCustomer = {
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

    // Detect and normalize payment method
    const rawPaymentMethod = shopifyOrder.payment_gateway_names?.[0] || "Unknown";
    const isCOD = rawPaymentMethod.toLowerCase() === "cash on delivery (cod)" || 
                  rawPaymentMethod.toLowerCase() === "cash on delivery";
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
    const prepaidMethods = await storage.getPrepaidPaymentMethods();
    const prepaidMethodsLower = prepaidMethods.map(m => m.toLowerCase());
    const isPrepaid = shopifyOrder.financial_status === "paid" && 
                      prepaidMethodsLower.includes(normalizedPaymentMethod.toLowerCase());
    const autoCallStatus = isPrepaid ? "Confirmed" : undefined;

    // Create order
    const orderData: InsertOrder = {
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
        
        // Try to look up product image from local products table
        if (!imageUrl && item.variant_id) {
          try {
            const localProduct = await storage.getProductByVariantId(item.variant_id.toString());
            if (localProduct?.imageUrl) {
              imageUrl = localProduct.imageUrl;
            }
          } catch (err) {
            console.log(`Could not look up product image for variant ${item.variant_id}:`, err);
          }
        }
        
        items.push({
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
          imageUrl: imageUrl,
        });
      }

      await storage.createOrderItems(items);
    }

    // Create initial status history
    await storage.createOrderStatus({
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
    const verification = verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

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
      topic: "orders/update",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder,
    });

    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
    );

    if (!existingOrder) {
      console.log(`Order ${shopifyOrder.id} not found, creating new order`);
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
    const verification = verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

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
      topic: "orders/cancelled",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder,
    });

    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
    );

    if (!existingOrder) {
      console.log(`Order ${shopifyOrder.id} not found`);
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
    const verification = verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

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
      topic: "fulfillments/update",
      shopifyOrderId: fulfillment.order_id?.toString() || null,
      payload: fulfillment,
    });

    // Find the order by Shopify order ID
    const existingOrder = await storage.getOrderByShopifyId(
      fulfillment.order_id.toString(),
    );

    if (!existingOrder) {
      console.log(`[Fulfillment Update] Order not found for Shopify ID: ${fulfillment.order_id}`);
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

