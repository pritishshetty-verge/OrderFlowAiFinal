import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { handleOrderCreated, handleOrderUpdated, handleOrderCancelled } from "./webhooks";
import { shopifyClient } from "./shopify";
import { insertOrderSchema, insertLeaveRequestSchema, updateUserSchema, insertShopifyCredentialsSchema } from "@shared/schema";
import { ZodError } from "zod";
import { encrypt, decrypt } from "./encryption";

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // WEBHOOK ENDPOINTS
  // ============================================================================

  app.post("/api/webhooks/orders/create", handleOrderCreated);
  app.post("/api/webhooks/orders/update", handleOrderUpdated);
  app.post("/api/webhooks/orders/cancelled", handleOrderCancelled);

  // ============================================================================
  // ORDERS API
  // ============================================================================

  // Get all orders with optional filters
  app.get("/api/orders", async (req, res) => {
    try {
      const { status, paymentMethod, assignedTo, limit, offset } = req.query;

      const filters = {
        status: status as string | undefined,
        paymentMethod: paymentMethod as string | undefined,
        assignedTo: assignedTo as string | undefined,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      };

      const result = await storage.listOrders(filters);
      res.json(result);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Get single order by ID
  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Get order items for a specific order
  app.get("/api/orders/:id/items", async (req, res) => {
    try {
      const items = await storage.getOrderItems(req.params.id);
      res.json(items);
    } catch (error) {
      console.error("Error fetching order items:", error);
      res.status(500).json({ error: "Failed to fetch order items" });
    }
  });

  // Get order status history
  app.get("/api/orders/:id/history", async (req, res) => {
    try {
      const history = await storage.getOrderHistory(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching order history:", error);
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // Get order assignment history
  app.get("/api/orders/:id/assignments", async (req, res) => {
    try {
      const assignments = await storage.getOrderAssignments(req.params.id);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching order assignments:", error);
      res.status(500).json({ error: "Failed to fetch order assignments" });
    }
  });

  // Assign order to user
  app.post("/api/orders/:id/assign", async (req, res) => {
    try {
      const { userId, assignedBy, note } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Update order assignment
      const order = await storage.assignOrder(req.params.id, userId);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Create assignment history record
      await storage.createOrderAssignment({
        orderId: req.params.id,
        userId,
        assignedBy: assignedBy || null,
        note: note || null,
      });

      res.json(order);
    } catch (error) {
      console.error("Error assigning order:", error);
      res.status(500).json({ error: "Failed to assign order" });
    }
  });

  // Update order status
  app.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const { status, changedBy, note } = req.body;

      if (!status) {
        return res.status(400).json({ error: "status is required" });
      }

      const existingOrder = await storage.getOrder(req.params.id);
      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Update order
      const order = await storage.updateOrder(req.params.id, { status });

      // Create status history
      await storage.createOrderStatus({
        orderId: req.params.id,
        status,
        previousStatus: existingOrder.status,
        changedBy: changedBy || null,
        note: note || null,
      });

      res.json(order);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // ============================================================================
  // SHOPIFY SYNC API
  // ============================================================================

  // Trigger manual sync of orders from Shopify
  app.post("/api/shopify/sync", async (req, res) => {
    try {
      const { limit = 50 } = req.body;

      // Update client with latest credentials from DB or env vars
      const { updateShopifyClient } = await import("./shopify");
      const client = await updateShopifyClient();

      const response = await client.fetchOrders({
        status: "any",
        limit,
      });

      let syncedCount = 0;
      let skippedCount = 0;

      for (const shopifyOrder of response.orders || []) {
        const existingOrder = await storage.getOrderByShopifyId(
          shopifyOrder.id.toString(),
        );

        if (existingOrder) {
          skippedCount++;
          continue;
        }

        // Create customer if needed
        let customer;
        if (shopifyOrder.customer) {
          const existingCustomer = await storage.getCustomerByShopifyId(
            shopifyOrder.customer.id.toString(),
          );

          const customerData = {
            shopifyCustomerId: shopifyOrder.customer.id.toString(),
            email: shopifyOrder.customer.email || shopifyOrder.email || null,
            firstName: shopifyOrder.customer.first_name || null,
            lastName: shopifyOrder.customer.last_name || null,
            phone: shopifyOrder.customer.phone || shopifyOrder.phone || null,
          };

          if (existingCustomer) {
            customer = await storage.updateCustomer(
              existingCustomer.id,
              customerData,
            );
          } else {
            customer = await storage.createCustomer(customerData);
          }
        }

        // Create order
        const orderData = {
          shopifyOrderId: shopifyOrder.id.toString(),
          shopifyOrderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name,
          customerId: customer?.id || null,
          customerName: `${shopifyOrder.customer?.first_name || ""} ${shopifyOrder.customer?.last_name || ""}`.trim() || shopifyOrder.billing_address?.name || "Guest",
          customerEmail: shopifyOrder.email || null,
          customerPhone: shopifyOrder.phone || shopifyOrder.shipping_address?.phone || "",
          status: mapShopifyStatus(
            shopifyOrder.financial_status,
            shopifyOrder.fulfillment_status,
          ),
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
          paymentMethod: shopifyOrder.payment_gateway_names?.[0] || "Unknown",
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
          shipmentStatus: shopifyOrder.fulfillments?.[0]?.shipment_status || null,
          rawShopifyData: shopifyOrder,
          shopifyCreatedAt: new Date(shopifyOrder.created_at),
          shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
        };

        const order = await storage.createOrder(orderData);

        // Create order items
        if (shopifyOrder.line_items?.length > 0) {
          const items = shopifyOrder.line_items.map((item: any) => ({
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
            imageUrl: item.image_url || null,
          }));

          await storage.createOrderItems(items);
        }

        // Create initial status history
        await storage.createOrderStatus({
          orderId: order.id,
          status: orderData.status,
          previousStatus: null,
          changedBy: null,
          note: "Imported from Shopify",
        });

        syncedCount++;
      }

      res.json({
        message: "Sync completed",
        syncedCount: syncedCount,
        skippedCount: skippedCount,
        totalOrders: (response.orders || []).length,
      });
    } catch (error) {
      console.error("Error syncing orders:", error);
      res.status(500).json({ error: "Failed to sync orders" });
    }
  });

  // NOTE: Webhook registration via API removed - now using n8n relay for stability
  // See Settings > Shopify > Real-Time Webhook Setup for n8n configuration guide

  // ============================================================================
  // SHOPIFY CREDENTIALS API
  // ============================================================================

  // Get Shopify credentials status (without exposing secrets)
  app.get("/api/shopify/credentials/status", async (req, res) => {
    try {
      const credentials = await storage.getShopifyCredentials();
      
      if (!credentials) {
        return res.json({
          configured: false,
          storeUrl: null,
          lastTested: null,
          testStatus: null,
        });
      }

      res.json({
        configured: true,
        storeUrl: credentials.storeUrl,
        lastTested: credentials.lastTestedAt,
        testStatus: credentials.testStatus,
        testMessage: credentials.testMessage,
      });
    } catch (error) {
      console.error("Error getting credentials status:", error);
      res.status(500).json({ error: "Failed to get credentials status" });
    }
  });

  // Save Shopify credentials (encrypted)
  app.post("/api/shopify/credentials", async (req, res) => {
    console.log("\n=== CREDENTIAL SAVE REQUEST STARTED ===");
    console.log("Timestamp:", new Date().toISOString());
    
    try {
      // Log incoming data (without sensitive values)
      console.log("Step 1: Received request body fields:", Object.keys(req.body));
      console.log("Store URL:", req.body.storeUrl);
      console.log("Access Token length:", req.body.accessToken?.length || 0);
      console.log("API Key length:", req.body.apiKey?.length || 0);
      console.log("API Secret length:", req.body.apiSecret?.length || 0);
      console.log("Webhook Secret provided:", !!req.body.webhookSecret);

      // Validate with Zod
      console.log("\nStep 2: Starting validation...");
      const validatedData = insertShopifyCredentialsSchema.parse(req.body);
      console.log("✓ Validation successful");

      // Encrypt sensitive fields
      console.log("\nStep 3: Starting encryption...");
      console.log("Encrypting API Key...");
      const encryptedApiKey = encrypt(validatedData.apiKey);
      console.log("✓ API Key encrypted, length:", encryptedApiKey.length);

      console.log("Encrypting API Secret...");
      const encryptedApiSecret = encrypt(validatedData.apiSecret);
      console.log("✓ API Secret encrypted, length:", encryptedApiSecret.length);

      console.log("Encrypting Access Token...");
      const encryptedAccessToken = encrypt(validatedData.accessToken);
      console.log("✓ Access Token encrypted, length:", encryptedAccessToken.length);

      const encryptedCredentials = {
        storeUrl: validatedData.storeUrl,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        accessToken: encryptedAccessToken,
        webhookSecret: validatedData.webhookSecret ? encrypt(validatedData.webhookSecret) : undefined,
        isActive: true,
      };
      console.log("✓ All encryption complete");

      // Save to database
      console.log("\nStep 4: Saving to database...");
      const savedCredentials = await storage.saveShopifyCredentials(encryptedCredentials);
      console.log("✓ Database save successful, ID:", savedCredentials.id);

      // Test the connection immediately
      console.log("\nStep 5: Testing Shopify connection...");
      try {
        console.log("Decrypting credentials for test...");
        const decryptedKey = decrypt(savedCredentials.apiKey);
        const decryptedSecret = decrypt(savedCredentials.apiSecret);
        const decryptedToken = decrypt(savedCredentials.accessToken);
        console.log("✓ Decryption successful");

        console.log("Calling shopifyClient.getShopInfo...");
        const shopInfo = await shopifyClient.getShopInfo({
          storeUrl: savedCredentials.storeUrl,
          apiKey: decryptedKey,
          apiSecret: decryptedSecret,
          accessToken: decryptedToken,
        });
        console.log("✓ Shopify connection successful!");
        console.log("Shop name:", shopInfo.name);

        console.log("Updating test status to 'success'...");
        await storage.updateCredentialTestStatus(
          savedCredentials.id,
          'success',
          `Connected to ${shopInfo.name || savedCredentials.storeUrl}`,
        );
        console.log("✓ Test status updated");

        console.log("\n=== SUCCESS: Sending 200 response ===\n");
        res.json({
          success: true,
          message: "Credentials saved and tested successfully",
          storeUrl: savedCredentials.storeUrl,
          shopName: shopInfo.name,
        });
      } catch (testError: any) {
        console.log("⚠ Shopify connection test failed");
        console.log("Test Error:", testError.message);
        
        console.log("Updating test status to 'failed'...");
        await storage.updateCredentialTestStatus(
          savedCredentials.id,
          'failed',
          testError.message || "Connection test failed",
        );
        console.log("✓ Test status updated");

        console.log("\n=== PARTIAL SUCCESS: Sending 200 response with test failure ===\n");
        res.json({
          success: true,
          message: "Credentials saved but connection test failed",
          storeUrl: savedCredentials.storeUrl,
          testError: testError.message,
        });
      }
    } catch (error: any) {
      console.error("\n=== CREDENTIAL SAVE ERROR ===");
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      
      if (error instanceof ZodError) {
        console.error("Validation errors:", JSON.stringify(error.errors, null, 2));
        console.log("\n=== Sending 400 validation error response ===\n");
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      
      console.error("Full error object:", error);
      console.log("\n=== Sending 500 error response ===\n");
      res.status(500).json({ 
        error: "Failed to save credentials",
        details: error.message 
      });
    }
  });

  // Test Shopify connection
  app.post("/api/shopify/credentials/test", async (req, res) => {
    try {
      const credentials = await storage.getShopifyCredentials();
      
      if (!credentials) {
        return res.status(404).json({ error: "No credentials found" });
      }

      const decryptedKey = decrypt(credentials.apiKey);
      const decryptedSecret = decrypt(credentials.apiSecret);
      const decryptedToken = decrypt(credentials.accessToken);

      const shopInfo = await shopifyClient.getShopInfo({
        storeUrl: credentials.storeUrl,
        apiKey: decryptedKey,
        apiSecret: decryptedSecret,
        accessToken: decryptedToken,
      });

      await storage.updateCredentialTestStatus(
        credentials.id,
        'success',
        `Connected to ${shopInfo.name || credentials.storeUrl}`,
      );

      res.json({
        success: true,
        message: "Connection successful",
        shopName: shopInfo.name,
        shopDomain: shopInfo.domain,
        storeUrl: credentials.storeUrl,
      });
    } catch (error: any) {
      console.error("Connection test failed:", error);
      
      const credentials = await storage.getShopifyCredentials();
      if (credentials) {
        await storage.updateCredentialTestStatus(
          credentials.id,
          'failed',
          error.message || "Connection test failed",
        );
      }

      res.status(400).json({
        success: false,
        error: error.message || "Connection test failed",
      });
    }
  });

  // Delete Shopify credentials
  app.delete("/api/shopify/credentials", async (req, res) => {
    try {
      const credentials = await storage.getShopifyCredentials();
      
      if (!credentials) {
        return res.status(404).json({ error: "No credentials found" });
      }

      await storage.deleteShopifyCredentials(credentials.id);
      
      res.json({ success: true, message: "Credentials deleted successfully" });
    } catch (error) {
      console.error("Error deleting credentials:", error);
      res.status(500).json({ error: "Failed to delete credentials" });
    }
  });

  // ============================================================================
  // USERS API
  // ============================================================================

  app.get("/api/users", async (req, res) => {
    try {
      const { role, isActive } = req.query;
      const filters = {
        role: role as string | undefined,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      };
      const users = await storage.listUsers(filters);
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const validatedData = updateUserSchema.parse(req.body);
      const user = await storage.updateUser(req.params.id, validatedData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // ============================================================================
  // LEAVE REQUESTS API
  // ============================================================================

  app.get("/api/leave-requests", async (req, res) => {
    try {
      const { userId, status } = req.query;
      const filters = {
        userId: userId as string | undefined,
        status: status as string | undefined,
      };
      const requests = await storage.listLeaveRequests(filters);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching leave requests:", error);
      res.status(500).json({ error: "Failed to fetch leave requests" });
    }
  });

  app.post("/api/leave-requests", async (req, res) => {
    try {
      const validatedData = insertLeaveRequestSchema.parse(req.body);
      const request = await storage.createLeaveRequest(validatedData);
      res.status(201).json(request);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating leave request:", error);
      res.status(500).json({ error: "Failed to create leave request" });
    }
  });

  app.patch("/api/leave-requests/:id", async (req, res) => {
    try {
      const { status, reviewedBy, reviewNote } = req.body;
      const request = await storage.updateLeaveRequest(req.params.id, {
        status,
        reviewedBy,
        reviewNote,
      });
      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }
      res.json(request);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating leave request:", error);
      res.status(500).json({ error: "Failed to update leave request" });
    }
  });

  // ============================================================================
  // TEAM MESSAGES API
  // ============================================================================

  app.get("/api/messages/:userId/:otherUserId", async (req, res) => {
    try {
      const messages = await storage.getConversation(
        req.params.userId,
        req.params.otherUserId,
      );
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { fromUserId, toUserId, message } = req.body;
      const newMessage = await storage.createMessage({
        fromUserId,
        toUserId,
        message,
      });
      res.status(201).json(newMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.patch("/api/messages/:id/read", async (req, res) => {
    try {
      await storage.markMessageAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking message as read:", error);
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  });

  app.get("/api/messages/unread/:userId", async (req, res) => {
    try {
      const count = await storage.getUnreadCount(req.params.userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

// Helper function to map Shopify statuses
function mapShopifyStatus(
  financialStatus?: string,
  fulfillmentStatus?: string,
): string {
  if (financialStatus === "refunded" || financialStatus === "voided") {
    return "Cancelled";
  }

  if (fulfillmentStatus === "fulfilled") {
    return "Delivered";
  }
  if (fulfillmentStatus === "partial") {
    return "Shipped";
  }
  if (fulfillmentStatus === "unfulfilled" || fulfillmentStatus === null) {
    if (financialStatus === "paid") {
      return "Processing";
    }
    if (financialStatus === "pending" || financialStatus === "authorized") {
      return "Pending";
    }
  }

  return "Pending";
}
