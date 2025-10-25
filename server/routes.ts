import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { handleOrderCreated, handleOrderUpdated, handleOrderCancelled } from "./webhooks";
import { shopifyClient } from "./shopify";
import { insertOrderSchema, insertLeaveRequestSchema, insertUserSchema, updateUserSchema, insertShopifyCredentialsSchema, insertInviteSchema, insertAttendanceSchema } from "@shared/schema";
import { ZodError } from "zod";
import { encrypt, decrypt } from "./encryption";
import { OrderAssignmentEngine } from "./assignment";
import {
  canAssignOrders,
  canBulkAssignOrders,
  canTriggerAutoAssignment,
  canEditProfiles,
  canManageShopify,
  canManageLeaveRequests,
  canInviteTeamMembers,
  canInviteAdmins,
  canAssignExtensions,
  canManageIVR,
  isFullControlAdmin,
} from "./permissions";

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

      if (!assignedBy) {
        return res.status(400).json({ error: "assignedBy is required" });
      }

      // Check permission
      const currentUser = await storage.getUser(assignedBy);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }

      if (!canAssignOrders(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to assign orders" });
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

  // Update order (e.g., tags, callStatus)
  app.patch("/api/orders/:id", async (req, res) => {
    try {
      const { tags, callStatus } = req.body;

      const existingOrder = await storage.getOrder(req.params.id);
      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Build update object with only provided fields
      const updateData: any = {};
      if (tags !== undefined) updateData.tags = tags;
      if (callStatus !== undefined) updateData.callStatus = callStatus;

      // Update order
      const order = await storage.updateOrder(req.params.id, updateData);

      res.json(order);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ error: "Failed to update order" });
    }
  });

  // ============================================================================
  // ORDER ASSIGNMENT API
  // ============================================================================

  // Auto-assign a COD order using round-robin algorithm
  app.post("/api/orders/:id/auto-assign", async (req, res) => {
    try {
      const { requestedBy } = req.body;

      if (!requestedBy) {
        return res.status(400).json({ error: "requestedBy is required" });
      }

      // Check permission
      const currentUser = await storage.getUser(requestedBy);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }

      if (!canTriggerAutoAssignment(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to trigger auto-assignment" });
      }

      const assignmentEngine = new OrderAssignmentEngine(storage);
      const success = await assignmentEngine.autoAssignOrder(req.params.id);

      if (success) {
        const order = await storage.getOrder(req.params.id);
        res.json({ success: true, order });
      } else {
        res.json({ 
          success: false, 
          message: "No eligible agents available or order not eligible for auto-assignment" 
        });
      }
    } catch (error) {
      console.error("Error auto-assigning order:", error);
      res.status(500).json({ error: "Failed to auto-assign order" });
    }
  });

  // Manually assign order to specific agent (admin override)
  app.post("/api/orders/:id/assign-manual", async (req, res) => {
    try {
      const { agentId, assignedBy, note } = req.body;

      if (!agentId || !assignedBy) {
        return res.status(400).json({ error: "agentId and assignedBy are required" });
      }

      // Check permission
      const currentUser = await storage.getUser(assignedBy);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }

      if (!canAssignOrders(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to assign orders" });
      }

      const assignmentEngine = new OrderAssignmentEngine(storage);
      await assignmentEngine.manualAssignOrder(
        req.params.id,
        agentId,
        assignedBy,
        note
      );

      const order = await storage.getOrder(req.params.id);
      res.json({ success: true, order });
    } catch (error: any) {
      console.error("Error manually assigning order:", error);
      res.status(500).json({ error: error.message || "Failed to manually assign order" });
    }
  });

  // Bulk assign multiple orders to agents
  app.post("/api/orders/bulk-assign", async (req, res) => {
    try {
      const { orderIds, agentId, assignedBy, note } = req.body;

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds array is required" });
      }

      if (!agentId || !assignedBy) {
        return res.status(400).json({ error: "agentId and assignedBy are required" });
      }

      // Check permission
      const currentUser = await storage.getUser(assignedBy);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }

      if (!canBulkAssignOrders(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to bulk assign orders" });
      }

      const assignmentEngine = new OrderAssignmentEngine(storage);
      const results = [];

      for (const orderId of orderIds) {
        try {
          await assignmentEngine.manualAssignOrder(orderId, agentId, assignedBy, note);
          results.push({ orderId, success: true });
        } catch (error: any) {
          results.push({ orderId, success: false, error: error.message });
        }
      }

      res.json({ results });
    } catch (error) {
      console.error("Error bulk assigning orders:", error);
      res.status(500).json({ error: "Failed to bulk assign orders" });
    }
  });

  // Get agent workload statistics
  app.get("/api/agents/workload", async (req, res) => {
    try {
      const assignmentEngine = new OrderAssignmentEngine(storage);
      const workloads = await assignmentEngine.getAgentWorkloads();
      res.json(workloads);
    } catch (error) {
      console.error("Error fetching agent workloads:", error);
      res.status(500).json({ error: "Failed to fetch agent workloads" });
    }
  });

  // ============================================================================
  // CALL STATUS ACTIONS API
  // ============================================================================

  // Confirm order (moves to Fulfil section)
  app.post("/api/orders/:id/confirm", async (req, res) => {
    try {
      const { userId, notes } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const order = await storage.confirmOrder(req.params.id, userId, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Create order status history entry
      await storage.createOrderStatus({
        orderId: req.params.id,
        status: 'confirmed',
        changedBy: userId,
        note: notes || `Order confirmed${notes ? ': ' + notes : ''}`,
      });

      res.json({ success: true, order });
    } catch (error) {
      console.error("Error confirming order:", error);
      res.status(500).json({ error: "Failed to confirm order" });
    }
  });

  // Cancel order with reason
  app.post("/api/orders/:id/cancel", async (req, res) => {
    try {
      const { userId, reason, notes } = req.body;

      if (!userId || !reason) {
        return res.status(400).json({ error: "userId and reason are required" });
      }

      const order = await storage.cancelOrder(req.params.id, userId, reason, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Create order status history entry
      await storage.createOrderStatus({
        orderId: req.params.id,
        status: 'cancelled',
        changedBy: userId,
        note: `Order cancelled: ${reason}${notes ? ' - ' + notes : ''}`,
      });

      res.json({ success: true, order });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ error: "Failed to cancel order" });
    }
  });

  // Schedule follow-up for order
  app.post("/api/orders/:id/followup", async (req, res) => {
    try {
      const { userId, followupAt, notes } = req.body;

      if (!userId || !followupAt) {
        return res.status(400).json({ error: "userId and followupAt are required" });
      }

      const followupDate = new Date(followupAt);
      const order = await storage.scheduleFollowup(req.params.id, userId, followupDate, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Create order status history entry
      await storage.createOrderStatus({
        orderId: req.params.id,
        status: 'followup_scheduled',
        changedBy: userId,
        note: `Follow-up scheduled for ${followupDate.toLocaleString()}${notes ? ': ' + notes : ''}`,
      });

      res.json({ success: true, order });
    } catch (error) {
      console.error("Error scheduling follow-up:", error);
      res.status(500).json({ error: "Failed to schedule follow-up" });
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
      // Check permission
      const { currentUserId } = req.body;
      if (!currentUserId) {
        return res.status(400).json({ error: "currentUserId is required" });
      }

      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }

      if (!canManageShopify(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to manage Shopify settings" });
      }

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

  // Get current authenticated user
  app.get("/api/me", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      res.json(req.user);
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch current user" });
    }
  });

  // Get user by email (public endpoint for login)
  app.get("/api/users/by-email/:email", async (req, res) => {
    try {
      const user = await storage.getUserByEmail(req.params.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Return only safe user info (no sensitive data)
      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
      });
    } catch (error) {
      console.error("Error fetching user by email:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

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

  // Create new user/team member
  app.post("/api/users", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      // Check if username or email already exists
      const existingUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(validatedData.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      
      const user = await storage.createUser(validatedData);
      res.json(user);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const { currentUserId } = req.body;
      
      if (!currentUserId) {
        return res.status(400).json({ error: "currentUserId is required" });
      }

      const validatedData = updateUserSchema.parse(req.body);
      
      // Get current user to check permissions
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }

      // Check if editing another user (not self)
      if (req.params.id !== currentUserId) {
        if (!canEditProfiles(currentUser)) {
          return res.status(403).json({ error: "You don't have permission to edit user profiles" });
        }
      }

      // If updating agentExtension, check permissions
      if (validatedData.agentExtension !== undefined) {
        if (!canAssignExtensions(currentUser) && req.params.id !== currentUserId) {
          return res.status(403).json({ error: "You don't have permission to assign extensions" });
        }
        
        // Check for uniqueness
        if (validatedData.agentExtension) {
          const existingUserWithExtension = await storage.getUserByAgentExtension(validatedData.agentExtension);
          if (existingUserWithExtension && existingUserWithExtension.id !== req.params.id) {
            return res.status(400).json({ error: "This extension is already assigned to another agent" });
          }
        }
      }

      // If updating permissions or adminType, only full control admins can do this
      if ((validatedData.permissions !== undefined || validatedData.adminType !== undefined) && req.params.id !== currentUserId) {
        if (!isFullControlAdmin(currentUser)) {
          return res.status(403).json({ error: "Only full control admins can edit admin permissions" });
        }
      }
      
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

  // Update user presence status
  app.patch("/api/users/:id/presence", async (req, res) => {
    try {
      const { presenceStatus } = req.body;

      if (!presenceStatus || !["present", "onleave", "inactive"].includes(presenceStatus)) {
        return res.status(400).json({ 
          error: "Invalid presence status. Must be: present, onleave, or inactive" 
        });
      }

      const user = await storage.updateUser(req.params.id, { presenceStatus });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, user });
    } catch (error) {
      console.error("Error updating presence status:", error);
      res.status(500).json({ error: "Failed to update presence status" });
    }
  });

  // Update user presence status (alternative endpoint for team presence component)
  app.post("/api/users/presence", async (req, res) => {
    try {
      const { userId, status } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      if (!status || !["present", "onleave", "inactive"].includes(status)) {
        return res.status(400).json({ 
          error: "Invalid presence status. Must be: present, onleave, or inactive" 
        });
      }

      const user = await storage.updateUser(userId, { presenceStatus: status });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, user });
    } catch (error) {
      console.error("Error updating presence status:", error);
      res.status(500).json({ error: "Failed to update presence status" });
    }
  });

  // Delete user
  app.delete("/api/users/:id", async (req, res) => {
    try {
      const userId = req.params.id;

      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete the user from database
      await storage.deleteUser(userId);

      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ============================================================================
  // ATTENDANCE API (HR/Payroll Tracking)
  // ============================================================================

  // Clock in
  app.post("/api/attendance/clock-in", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Check if already clocked in today
      const existing = await storage.getTodayAttendance(userId);
      if (existing && existing.clockInTime) {
        return res.status(400).json({ 
          error: "Already clocked in today",
          attendance: existing 
        });
      }

      // Create or update attendance record
      const attendance = await storage.clockIn(userId, now);
      res.json({ success: true, attendance });
    } catch (error) {
      console.error("Error clocking in:", error);
      res.status(500).json({ error: "Failed to clock in" });
    }
  });

  // Clock out
  app.post("/api/attendance/clock-out", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const now = new Date();

      // Get today's attendance
      const existing = await storage.getTodayAttendance(userId);
      if (!existing || !existing.clockInTime) {
        return res.status(400).json({ error: "Not clocked in today" });
      }

      if (existing.clockOutTime) {
        return res.status(400).json({ 
          error: "Already clocked out today",
          attendance: existing 
        });
      }

      // Calculate total hours
      const clockInTime = new Date(existing.clockInTime);
      const totalHours = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

      const attendance = await storage.clockOut(userId, now, totalHours);
      res.json({ success: true, attendance });
    } catch (error) {
      console.error("Error clocking out:", error);
      res.status(500).json({ error: "Failed to clock out" });
    }
  });

  // Get attendance records
  app.get("/api/attendance", async (req, res) => {
    try {
      const { userId, startDate, endDate } = req.query;

      const filters = {
        userId: userId as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      };

      const records = await storage.getAttendanceRecords(filters);
      res.json(records);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });

  // Get today's attendance for a user
  app.get("/api/attendance/today/:userId", async (req, res) => {
    try {
      const attendance = await storage.getTodayAttendance(req.params.userId);
      res.json(attendance || null);
    } catch (error) {
      console.error("Error fetching today's attendance:", error);
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });

  // ============================================================================
  // CALLS API (IVR Click-to-Call Integration)
  // ============================================================================

  // Initiate call to customer
  app.post("/api/calls/initiate", async (req, res) => {
    try {
      const { userId, orderId, customerPhone } = req.body;

      // Validate required fields
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }
      if (!customerPhone) {
        return res.status(400).json({ error: "customerPhone is required" });
      }

      // Look up user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user has agent extension configured
      if (!user.agentExtension) {
        return res.status(400).json({ 
          success: false, 
          error: "Agent extension not configured. Please contact admin." 
        });
      }

      // Validate IVR API credentials
      if (!process.env.IVR_API_TOKEN) {
        console.error("IVR_API_TOKEN not configured");
        return res.status(500).json({ 
          success: false, 
          error: "IVR service not configured. Please contact admin." 
        });
      }

      if (!process.env.IVR_DID_NUMBER) {
        console.error("IVR_DID_NUMBER not configured");
        return res.status(500).json({ 
          success: false, 
          error: "IVR service not configured. Please contact admin." 
        });
      }

      // Call IVR Solutions API
      const ivrApiUrl = "https://api.ivrsolutions.in/api/c2c_post";
      
      // Format request body as URL-encoded form data (required by IVR Solutions API)
      const formData = new URLSearchParams({
        did: process.env.IVR_DID_NUMBER!,
        ext_no: user.agentExtension,
        phone: customerPhone,
      });

      console.log("Initiating IVR call:", { 
        orderId, 
        agentExtension: user.agentExtension, 
        customerPhone,
        did: process.env.IVR_DID_NUMBER,
        url: ivrApiUrl,
        hasToken: !!process.env.IVR_API_TOKEN,
        tokenLength: process.env.IVR_API_TOKEN?.length || 0,
        contentType: "application/x-www-form-urlencoded"
      });

      const ivrResponse = await fetch(ivrApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Bearer ${process.env.IVR_API_TOKEN}`,
        },
        body: formData.toString(),
      });

      const ivrData = await ivrResponse.json();

      // Log detailed IVR API response for debugging
      console.log("📞 IVR API Response:", {
        status: ivrResponse.status,
        statusText: ivrResponse.statusText,
        data: ivrData,
        requestPayload: {
          did: process.env.IVR_DID_NUMBER,
          ext_no: user.agentExtension,
          phone: customerPhone
        },
        maskedToken: process.env.IVR_API_TOKEN?.substring(0, 8) + "...",
        headers: {
          contentType: ivrResponse.headers.get('content-type'),
          server: ivrResponse.headers.get('server')
        }
      });

      // Handle IVR API response with specific error codes
      if (ivrResponse.status === 200) {
        // Create call record in database
        const call = await storage.createCall({
          orderId,
          agentId: userId,
          customerPhone,
          callStatus: "initiated",
        });

        console.log("✓ Call initiated successfully:", { callId: call.id, orderId });

        return res.json({ 
          success: true, 
          message: "Call initiated successfully",
          call 
        });
      } else if (ivrResponse.status === 400) {
        // Invalid parameters
        console.error("IVR API validation error:", { status: 400, data: ivrData });
        return res.status(400).json({ 
          success: false, 
          error: ivrData.message || "Invalid call parameters. Please check phone number and extension." 
        });
      } else if (ivrResponse.status === 404) {
        // Extension not found - but auth worked
        console.log("IVR extension config issue:", { 
          status: 404, 
          message: "Extension may need configuration in IVR dashboard",
          data: ivrData,
          extension: user.agentExtension 
        });
        return res.status(400).json({ 
          success: false, 
          error: ivrData.message || `Extension ${user.agentExtension} may need to be configured in your IVR Solutions account. Please verify in IVR dashboard.` 
        });
      } else if (ivrResponse.status === 405) {
        // Access denied (authentication issue)
        console.error("IVR API access denied:", { 
          status: 405, 
          message: "Check Authorization header and API token",
          data: ivrData 
        });
        return res.status(400).json({ 
          success: false, 
          error: "IVR service authentication failed. Please contact admin." 
        });
      } else if (ivrResponse.status >= 500) {
        // Server error
        console.error("IVR API server error:", { status: ivrResponse.status, data: ivrData });
        return res.status(503).json({ 
          success: false, 
          error: "IVR service temporarily unavailable. Please try again later." 
        });
      } else {
        // Other errors
        console.error("IVR API error:", { status: ivrResponse.status, data: ivrData });
        return res.status(400).json({ 
          success: false, 
          error: ivrData.message || "Failed to initiate call. Please try again." 
        });
      }
    } catch (error: any) {
      console.error("Error initiating call:", error);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to initiate call. Please try again." 
      });
    }
  });

  // Get calls for an order
  app.get("/api/calls/order/:orderId", async (req, res) => {
    try {
      const calls = await storage.getCallsByOrderId(req.params.orderId);
      res.json(calls);
    } catch (error) {
      console.error("Error fetching calls:", error);
      res.status(500).json({ error: "Failed to fetch calls" });
    }
  });

  // Get calls for an agent
  app.get("/api/calls/agent/:agentId", async (req, res) => {
    try {
      const calls = await storage.getCallsByAgentId(req.params.agentId);
      res.json(calls);
    } catch (error) {
      console.error("Error fetching calls:", error);
      res.status(500).json({ error: "Failed to fetch calls" });
    }
  });

  // Test IVR credentials and connection
  app.get("/api/ivr/test-credentials", async (req, res) => {
    try {
      const token = process.env.IVR_API_TOKEN;
      const did = process.env.IVR_DID_NUMBER;

      // Check if credentials are configured
      if (!token || !did) {
        return res.status(500).json({
          success: false,
          configured: false,
          error: "IVR credentials not configured",
          details: {
            hasToken: !!token,
            hasDid: !!did,
          },
          nextSteps: [
            "Add IVR_API_TOKEN to Replit Secrets",
            "Add IVR_DID_NUMBER to Replit Secrets",
            "Restart the application"
          ]
        });
      }

      // Mask the token for security
      const maskedToken = token.substring(0, 8) + "..." + token.substring(token.length - 4);

      // Get a test agent extension
      const agents = await storage.listUsers({ role: 'agent' });
      const testAgent = agents.find(u => u.agentExtension);

      const credentialsInfo = {
        configured: true,
        credentials: {
          apiToken: maskedToken,
          tokenLength: token.length,
          didNumber: did,
          testExtension: testAgent?.agentExtension || "No agent extensions configured"
        }
      };

      // Make a test API call to validate credentials
      const ivrApiUrl = "https://api.ivrsolutions.in/api/c2c_post";
      
      // Format as URL-encoded form data (required by IVR Solutions API)
      const formData = new URLSearchParams({
        did: did,
        ext_no: testAgent?.agentExtension || "101",
        phone: "0000000000", // Invalid test number
      });

      console.log("🧪 Testing IVR credentials:", {
        url: ivrApiUrl,
        maskedToken,
        did,
        testExtension: testAgent?.agentExtension || "101",
        contentType: "application/x-www-form-urlencoded"
      });

      const ivrResponse = await fetch(ivrApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Bearer ${token}`,
        },
        body: formData.toString(),
      });

      const ivrData = await ivrResponse.json();

      console.log("🧪 IVR API test response:", {
        status: ivrResponse.status,
        data: ivrData
      });

      // Analyze the response
      if (ivrResponse.status === 200) {
        return res.json({
          success: true,
          ...credentialsInfo,
          connectionTest: {
            status: "success",
            message: "IVR credentials are valid and working!",
            statusCode: 200,
            response: ivrData
          }
        });
      } else if (ivrResponse.status === 400) {
        // This is actually good - means auth worked but params invalid
        return res.json({
          success: true,
          ...credentialsInfo,
          connectionTest: {
            status: "authenticated",
            message: "Credentials are valid! (Got 400 error as expected with test data)",
            statusCode: 400,
            response: ivrData,
            note: "400 error is expected when using test phone number. Your credentials are working correctly."
          }
        });
      } else if (ivrResponse.status === 404) {
        // Extension or resource not found - auth worked but config issue
        return res.json({
          success: true,  // Auth worked, just need config
          ...credentialsInfo,
          connectionTest: {
            status: "extension_invalid",
            message: "Authentication successful! Extension needs configuration",
            statusCode: 404,
            response: ivrData,
            note: "Your API credentials are working correctly. The extension may need to be configured in your IVR Solutions account.",
            possibleCauses: [
              "Extension not configured in IVR Solutions account",
              "DID number doesn't have this extension assigned",
              "Extension format mismatch (check IVR dashboard)"
            ],
            nextSteps: [
              "Log into IVR Solutions dashboard",
              "Verify extensions are configured for DID: " + did,
              "Test with a real customer call - it may work despite this message"
            ]
          }
        });
      } else if (ivrResponse.status === 405) {
        return res.json({
          success: false,
          ...credentialsInfo,
          connectionTest: {
            status: "access_denied",
            message: "Access Denied - Authentication failed",
            statusCode: 405,
            response: ivrData,
            possibleCauses: [
              "API token is incorrect or expired",
              "API token doesn't have permission for this DID number",
              "Authorization header format is wrong",
              "Account suspended or not activated"
            ],
            nextSteps: [
              "Verify API token in IVR Solutions dashboard",
              "Check if DID number matches your account",
              "Contact IVR Solutions support if issue persists"
            ]
          }
        });
      } else {
        return res.json({
          success: false,
          ...credentialsInfo,
          connectionTest: {
            status: "error",
            message: `Unexpected error: ${ivrResponse.status}`,
            statusCode: ivrResponse.status,
            response: ivrData
          }
        });
      }
    } catch (error: any) {
      console.error("Error testing IVR credentials:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to test IVR credentials",
        details: error.message
      });
    }
  });

  // ============================================================================
  // INVITES API
  // ============================================================================

  // Send user invite
  app.post("/api/invites", async (req, res) => {
    try {
      const { invitedBy } = req.body;
      
      if (!invitedBy) {
        return res.status(400).json({ error: "invitedBy is required" });
      }

      const validatedData = insertInviteSchema.parse(req.body);
      
      // Get current user to check permissions
      const currentUser = await storage.getUser(invitedBy);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }

      // Check if user has permission to invite team members
      if (!canInviteTeamMembers(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to invite team members" });
      }

      // If inviting an admin, only full control admins can do this
      if (validatedData.role === "admin" && !canInviteAdmins(currentUser)) {
        return res.status(403).json({ error: "Only full control admins can invite other admins" });
      }

      // Note: adminType and permissions are now configured in a separate step via the permissions modal
      // after the invite is created, so we don't validate them here
      
      // Check if email already has a pending invite
      const existingInvite = await storage.getInviteByEmail(validatedData.email);
      if (existingInvite && existingInvite.status === 'pending') {
        return res.status(400).json({ error: "An invite has already been sent to this email" });
      }
      
      // Check if user already exists with this email
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ error: "A user with this email already exists" });
      }
      
      // Generate unique invite token (simple random string for now)
      const token = Array.from({ length: 32 }, () => 
        Math.random().toString(36).charAt(2)
      ).join('');
      
      // Set expiration to 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      // Create invite
      const invite = await storage.createInvite({
        ...validatedData,
        token,
        expiresAt,
        invitedBy,
      });
      
      // TODO: Send email via SendGrid/Resend integration
      // For now, log the invite details to console
      const inviteUrl = `${req.protocol}://${req.get('host')}/accept-invite?token=${token}`;
      console.log('\n📧 USER INVITE EMAIL');
      console.log('===================');
      console.log(`To: ${validatedData.email}`);
      console.log(`Subject: You're invited to join OrderFlowAI`);
      console.log(`\nHi ${validatedData.firstName || 'there'},\n`);
      console.log(`You've been invited to join OrderFlowAI as a ${validatedData.role}.`);
      console.log(`\nClick the link below to accept your invitation and set up your account:`);
      console.log(inviteUrl);
      console.log(`\nThis invite expires in 7 days.`);
      console.log('===================\n');
      
      res.json({ 
        message: "Invite sent successfully",
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        }
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid invite data", details: error.errors });
      }
      console.error("Error creating invite:", error);
      res.status(500).json({ error: "Failed to send invite" });
    }
  });

  // Update invite permissions (admin type and permissions)
  app.patch("/api/invites/:inviteId/permissions", async (req, res) => {
    try {
      const { inviteId } = req.params;
      const { adminType, permissions } = req.body;

      if (!inviteId) {
        return res.status(400).json({ error: "Invite ID is required" });
      }

      // Validate admin type
      const validAdminTypes = ["full_control", "partial_control"];
      if (adminType && !validAdminTypes.includes(adminType)) {
        return res.status(400).json({ error: "Invalid admin type" });
      }

      // Get the invite
      const invite = await storage.getInvite(inviteId);
      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }

      // Only allow updating admin invites
      if (invite.role !== "admin") {
        return res.status(400).json({ error: "Can only set permissions for admin invites" });
      }

      // If setting partial control, ensure permissions are provided
      if (adminType === "partial_control" && !permissions) {
        return res.status(400).json({ error: "Permissions are required for partial control admins" });
      }

      // Update the invite
      const updatedInvite = await storage.updateInvitePermissions(
        inviteId,
        adminType,
        adminType === "partial_control" ? permissions : null
      );

      res.json({
        message: "Permissions updated successfully",
        invite: updatedInvite,
      });
    } catch (error) {
      console.error("Error updating invite permissions:", error);
      res.status(500).json({ error: "Failed to update invite permissions" });
    }
  });

  // List pending invites
  app.get("/api/invites", async (req, res) => {
    try {
      const invites = await storage.listPendingInvites();
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ error: "Failed to fetch invites" });
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

  // ============================================================================
  // NOTIFICATIONS API
  // ============================================================================

  // Get all notifications for the logged-in user
  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter is required" });
      }

      const unreadOnly = req.query.unreadOnly === "true";
      
      const notifications = await storage.getUserNotifications(userId, unreadOnly);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Get count of unread notifications
  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter is required" });
      }

      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread notification count:", error);
      res.status(500).json({ error: "Failed to fetch unread notification count" });
    }
  });

  // Mark a notification as read
  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {

      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Mark all user's notifications as read
  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      const userId = req.body.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId is required in request body" });
      }

      await storage.markAllNotificationsAsRead(userId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // ============================================================================
  // BACKGROUND TASKS
  // ============================================================================

  // Background checker for due follow-ups
  const notifiedFollowups = new Set<string>();

  async function checkDueFollowups() {
    try {
      const dueOrders = await storage.getDueFollowups();
      
      for (const order of dueOrders) {
        // Skip orders without an assignedTo value
        if (!order.assignedTo) {
          continue;
        }

        const followupKey = `${order.id}-${order.followupAt?.getTime()}`;
        
        if (!notifiedFollowups.has(followupKey)) {
          await storage.createNotification({
            userId: order.assignedTo,
            orderId: order.id,
            type: "followup_reminder",
            title: "Follow-up Reminder",
            message: `Order #${order.shopifyOrderId} follow-up is due`,
            actionUrl: "/orders",
            isRead: false,
          });
          
          notifiedFollowups.add(followupKey);
        }
      }
    } catch (error) {
      console.error("Error checking due follow-ups:", error);
    }
  }

  // Run follow-up checker every 60 seconds
  setInterval(checkDueFollowups, 60000);

  // Run immediately on startup
  checkDueFollowups();

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
