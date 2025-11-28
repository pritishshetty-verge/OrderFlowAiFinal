import { Request, Response } from "express";
import { shopifyClient } from "./shopify";
import { storage } from "./storage";
import { OrderAssignmentEngine } from "./assignment";
import type { InsertOrder, InsertCustomer, InsertOrderItem } from "@shared/schema";

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

    // Extract shipment status from fulfillments
    const shipmentStatus = shopifyOrder.fulfillments?.[0]?.shipment_status || null;

    // Create order
    const orderData: InsertOrder = {
      shopifyOrderId: shopifyOrder.id.toString(),
      shopifyOrderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name,
      customerId: customer?.id || null,
      customerName: `${shopifyOrder.customer?.first_name || ""} ${shopifyOrder.customer?.last_name || ""}`.trim() || shopifyOrder.billing_address?.name || "Guest",
      customerEmail: shopifyOrder.email || null,
      customerPhone: shopifyOrder.phone || shopifyOrder.shipping_address?.phone || "",
      status: mapShopifyStatus(shopifyOrder.financial_status, shopifyOrder.fulfillment_status, shipmentStatus),
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
      shipmentStatus: shipmentStatus,
      rawShopifyData: shopifyOrder,
      shopifyCreatedAt: new Date(shopifyOrder.created_at),
      shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
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

    // Extract shipment status from fulfillments
    const shipmentStatus = shopifyOrder.fulfillments?.[0]?.shipment_status || null;

    // Update order
    const newStatus = mapShopifyStatus(
      shopifyOrder.financial_status,
      shopifyOrder.fulfillment_status,
      shipmentStatus,
    );

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
      shipmentStatus: shipmentStatus,
      rawShopifyData: shopifyOrder,
      shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
    };

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

    // Update order status to cancelled
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

// Helper function to map Shopify statuses to our system
function mapShopifyStatus(
  financialStatus?: string,
  fulfillmentStatus?: string,
  shipmentStatus?: string | null,
): string {
  // Cancelled is highest priority
  if (financialStatus === "refunded" || financialStatus === "voided") {
    return "Cancelled";
  }

  // Only mark as Delivered if shipment is actually delivered
  if (shipmentStatus === "delivered") {
    return "Delivered";
  }

  // Check fulfillment status
  if (fulfillmentStatus === "fulfilled") {
    return "Shipped";
  }
  if (fulfillmentStatus === "partial") {
    return "Shipped";
  }
  if (fulfillmentStatus === "unfulfilled" || fulfillmentStatus === null) {
    // Check payment status
    if (financialStatus === "paid") {
      return "Processing";
    }
    if (financialStatus === "pending" || financialStatus === "authorized") {
      return "Pending";
    }
  }

  // Default
  return "Pending";
}
