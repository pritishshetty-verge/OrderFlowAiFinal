import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { 
  orders, leaveRequests, orderStatusHistory, teamMessages, invites, 
  attendance, orderAssignments, calls, notifications, ndrEvents, 
  courses, resources, userLessonProgress, userOnboardingProgress, users,
  webhooks, insertWebhookSchema
} from "@shared/schema";
import { eq, or, sql, desc, gte, lte, and } from "drizzle-orm";
import { triggerWebhooks } from "./services/webhooks";
import { handleOrderCreated, handleOrderUpdated, handleOrderCancelled, handleFulfillmentUpdate } from "./webhooks";
import { shopifyClient } from "./shopify";
import { insertOrderSchema, insertLeaveRequestSchema, insertUserSchema, updateUserSchema, insertShopifyCredentialsSchema, insertInviteSchema, insertAttendanceSchema } from "@shared/schema";
import { ZodError } from "zod";
import { encrypt, decrypt } from "./encryption";
import { OrderAssignmentEngine } from "./assignment";
import axios from "axios";
import { sendInvitationEmail } from "./resend";
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
import { mapShopifyStatus, extractFulfillmentTracking } from "./utils/orderStatus";

interface NormalizedFastrrPayload {
  externalId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  checkoutUrl: string | null;
  cartValue: string | null;
  checkoutStage: string | null;
  address: string | null;
  items: any[] | null;
}

function normalizeFastrrPayload(raw: any): NormalizedFastrrPayload {
  const payload = raw?.data || raw?.checkout || raw || {};

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const val = payload[k];
      if (val !== undefined && val !== null && val !== "") return val;
    }
    return null;
  };

  const nested = (obj: any, ...keys: string[]) => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return null;
  };

  const externalId = pick("cartId", "cart_id", "id", "cart_token")?.toString() || null;

  let customerName = pick("custName", "customer_name", "name");
  if (!customerName) {
    const firstName = pick("first_name", "firstName")
      || nested(payload.shipping_address, "first_name", "firstName")
      || nested(payload.customer, "first_name", "firstName");
    const lastName = pick("last_name", "lastName")
      || nested(payload.shipping_address, "last_name", "lastName")
      || nested(payload.customer, "last_name", "lastName");
    if (firstName || lastName) {
      customerName = [firstName, lastName].filter(Boolean).join(" ");
    }
  }

  let customerPhone = pick("custPhone", "customer_phone", "phone", "phone_number", "mobile")
    || nested(payload.shipping_address, "phone", "phone_number")
    || nested(payload.customer, "phone", "phone_number");
  if (typeof customerPhone === "string") {
    customerPhone = customerPhone.replace(/\s+/g, "");
  }

  const customerEmail = pick("custEmail", "customer_email", "email")
    || nested(payload.customer, "email");

  const checkoutUrl = pick("abandonLink", "url", "checkout_url", "abandon_link");
  const cartValue = pick("cartTotal", "cart_total", "total_price")?.toString() || null;
  const checkoutStage = pick("latest_stage", "checkoutStage", "checkout_stage", "stage");

  let address: string | null = null;
  if (typeof payload.address === "string" && payload.address.trim()) {
    address = payload.address.trim();
  } else {
    const source = (payload.shipping_address && typeof payload.shipping_address === "object")
      ? payload.shipping_address
      : payload;
    const parts = [
      source.address1 || source.address_1,
      source.address2 || source.address_2,
      source.city,
      source.province || source.state,
      source.zip || source.postal_code || source.pincode,
      source.country,
    ].filter((p) => p && typeof p === "string" && p.trim());
    address = parts.length > 0 ? parts.join(", ") : null;
  }

  let items: any[] | null = null;
  if (Array.isArray(payload.items) && payload.items.length > 0) {
    items = payload.items;
  } else if (payload.productName || payload.product_name) {
    items = [{
      name: payload.productName || payload.product_name,
      price: payload.productPrice || payload.product_price,
      quantity: payload.productQuantity || payload.product_quantity,
      variant: payload.productVariant || payload.product_variant,
    }];
  }

  return {
    externalId,
    customerName: customerName || null,
    customerPhone: customerPhone || null,
    customerEmail: customerEmail || null,
    checkoutUrl: checkoutUrl || null,
    cartValue,
    checkoutStage: checkoutStage || null,
    address,
    items,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // AUTHORIZATION HELPERS
  // ============================================================================
  
  /**
   * Read Scope Types for Order Queries
   * - 'assigned': Agent sees only their assigned orders (DEFAULT for agents)
   * - 'global': Agent can see ALL orders (for Global View toggle)
   * - undefined: Let the function decide based on context
   */
  type OrderReadScope = 'assigned' | 'global' | undefined;
  
  /**
   * Builds the correct assignedTo filter for order READ queries.
   * 
   * SAFE GLOBAL VIEW PATTERN:
   * -------------------------
   * - Agents CAN view all orders when scope='global' (Global View toggle)
   * - Agents DEFAULT to seeing only assigned orders when scope is not specified
   * - This allows the "All Orders" toggle to work while fixing the Resume bug
   * 
   * IMPORTANT: This is READ-ONLY permission. Write protection is handled separately
   * by canUserAccessOrder() which ALWAYS requires order ownership for agents.
   * 
   * Even if an agent CAN SEE another agent's order (via Global View), they CANNOT
   * modify it (confirm, cancel, follow-up, etc.) - those actions return 403 Forbidden.
   * 
   * @param requestingUserId - The ID of the user making the request (REQUIRED)
   * @param requestedScope - 'global' for all orders, 'assigned' or undefined for agent's orders
   * @param requestedAssignedTo - Optional filter by specific agent (admin only)
   */
  async function buildOrderReadScope(
    requestingUserId: string | undefined,
    requestedScope: OrderReadScope,
    requestedAssignedTo: string | undefined
  ): Promise<{ assignedTo: string | undefined; isAdmin: boolean; unauthorized: boolean; reason?: string }> {
    // SECURITY: currentUserId is REQUIRED - never allow access without verified user identity
    if (!requestingUserId) {
      return { 
        assignedTo: "__UNAUTHORIZED__", 
        isAdmin: false, 
        unauthorized: true, 
        reason: "currentUserId is required for authorization" 
      };
    }
    
    const user = await storage.getUser(requestingUserId);
    if (!user) {
      // Unknown user - reject access
      return { 
        assignedTo: "__UNAUTHORIZED__", 
        isAdmin: false, 
        unauthorized: true, 
        reason: "User not found" 
      };
    }
    
    // Admins can see all orders or filter as requested
    if (user.role === "admin") {
      return { assignedTo: requestedAssignedTo, isAdmin: true, unauthorized: false };
    }
    
    // =========================================================================
    // AGENT READ SCOPE LOGIC
    // =========================================================================
    // 
    // GLOBAL VIEW (scope='global'):
    //   - Agent explicitly requested to see all orders via "All Orders" toggle
    //   - Allow read access to ALL orders (no assignedTo filter)
    //   - Write protection still blocks modifications to unassigned orders
    //
    // PERSONAL VIEW (scope='assigned' or undefined):
    //   - Default behavior, or explicit personal view request
    //   - Only show orders assigned to this agent
    //   - This is the safe default for Resume action (no scope sent)
    // =========================================================================
    
    if (requestedScope === 'global') {
      // Agent requested Global View - allow seeing all orders
      // Note: They still cannot MODIFY orders they don't own (canUserAccessOrder blocks that)
      return { assignedTo: undefined, isAdmin: false, unauthorized: false };
    }
    
    // Default: Personal view - only show agent's assigned orders
    // This is the safe default that fixes the Resume bug
    return { assignedTo: requestingUserId, isAdmin: false, unauthorized: false };
  }
  
  /**
   * Legacy wrapper for enforceAgentReadFilter - calls buildOrderReadScope with default scope.
   * Used by endpoints that don't support Global View (like NDR, OFD).
   */
  async function enforceAgentReadFilter(
    requestingUserId: string | undefined,
    requestedAssignedTo: string | undefined
  ): Promise<{ assignedTo: string | undefined; isAdmin: boolean; unauthorized: boolean; reason?: string }> {
    // For legacy callers, always use 'assigned' scope (no global view)
    return buildOrderReadScope(requestingUserId, 'assigned', requestedAssignedTo);
  }
  
  /**
   * Checks if a user can access/modify an order.
   * Returns true if user is Admin OR user is assigned to the order.
   * Used for both read and write protection on single-order endpoints.
   */
  async function canUserAccessOrder(
    userId: string | undefined,
    orderId: string
  ): Promise<{ authorized: boolean; reason?: string; isAdmin: boolean }> {
    if (!userId) {
      return { authorized: false, reason: "User ID is required for authorization", isAdmin: false };
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return { authorized: false, reason: "User not found", isAdmin: false };
    }
    
    // Admins can access any order
    if (user.role === "admin") {
      return { authorized: true, isAdmin: true };
    }
    
    // For agents, verify they own the order
    const order = await storage.getOrder(orderId);
    if (!order) {
      return { authorized: false, reason: "Order not found", isAdmin: false };
    }
    
    if (order.assignedTo !== userId) {
      return { authorized: false, reason: "You are not authorized to access this order", isAdmin: false };
    }
    
    return { authorized: true, isAdmin: false };
  }
  
  // Alias for backward compatibility - same function, different name for clarity
  const canUserModifyOrder = canUserAccessOrder;
  
  /**
   * canUserReadOrder - READ permission check for individual order detail endpoints.
   * 
   * SAFE GLOBAL VIEW PATTERN:
   * -------------------------
   * This function mirrors the buildOrderReadScope() logic for individual orders.
   * When an agent has scope='global' (Global View toggle active), they can READ
   * any order's details - but canUserModifyOrder() still blocks WRITE operations.
   * 
   * @param userId - The ID of the user making the request
   * @param orderId - The order ID being accessed
   * @param scope - 'global' allows reading any order, undefined/other requires ownership
   */
  async function canUserReadOrder(
    userId: string | undefined,
    orderId: string,
    scope: string | undefined
  ): Promise<{ authorized: boolean; reason?: string; isAdmin: boolean }> {
    if (!userId) {
      return { authorized: false, reason: "User ID is required for authorization", isAdmin: false };
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return { authorized: false, reason: "User not found", isAdmin: false };
    }
    
    // Admins can read any order
    if (user.role === "admin") {
      return { authorized: true, isAdmin: true };
    }
    
    // GLOBAL VIEW: Agent explicitly requested global scope - allow reading any order
    // Note: Write protection (canUserModifyOrder) still blocks modifications
    if (scope === 'global') {
      return { authorized: true, isAdmin: false };
    }
    
    // DEFAULT: Personal view - verify agent owns this order
    const order = await storage.getOrder(orderId);
    if (!order) {
      return { authorized: false, reason: "Order not found", isAdmin: false };
    }
    
    if (order.assignedTo !== userId) {
      return { authorized: false, reason: "You are not authorized to access this order", isAdmin: false };
    }
    
    return { authorized: true, isAdmin: false };
  }
  
  // ============================================================================
  // WEBHOOK ENDPOINTS
  // ============================================================================

  app.post("/api/webhooks/orders/create", handleOrderCreated);
  app.post("/api/webhooks/orders/update", handleOrderUpdated);
  app.post("/api/webhooks/orders/cancelled", handleOrderCancelled);
  app.post("/api/webhooks/fulfillments/update", handleFulfillmentUpdate);
  
  // Courier webhook (Shiprocket)
  // Note: Renamed from /api/webhooks/shiprocket to /api/webhooks/courier-events
  // because Shiprocket prohibits keywords "shiprocket", "kartrocket", "sr", "kr" in webhook URLs
  const { handleShiprocketWebhook } = await import("./shiprocketWebhook");
  app.post("/api/webhooks/courier-events", handleShiprocketWebhook);

  // Delhivery webhook handler for NDR events
  // Supports both Default Payload format (Shipment.AWB) and legacy formats
  const { handleDelhiveryWebhook } = await import("./delhiveryWebhook");
  app.post("/api/webhooks/delhivery", handleDelhiveryWebhook);

  // Fastrr Abandoned Cart webhook
  app.post("/api/webhooks/fastrr-abandoned", async (req, res) => {
    try {
      const secret = req.headers["x-api-secret"];
      const expectedSecret = process.env.FASTRR_WEBHOOK_SECRET;
      if (!expectedSecret) {
        console.error("[Fastrr Webhook] FASTRR_WEBHOOK_SECRET is not configured");
        return res.status(500).json({ error: "Webhook not configured" });
      }
      if (secret !== expectedSecret) {
        console.warn("[Fastrr Webhook] Authentication failed");
        return res.status(403).json({ error: "Forbidden" });
      }

      const normalized = normalizeFastrrPayload(req.body);

      if (!normalized.externalId) {
        console.warn("[Fastrr Webhook] Skipped — no external ID found in payload");
        return res.status(422).json({ error: "Missing cart identifier" });
      }

      const checkout = await storage.createAbandonedCheckout({
        externalId: normalized.externalId,
        customerName: normalized.customerName,
        customerPhone: normalized.customerPhone,
        customerEmail: normalized.customerEmail,
        items: normalized.items,
        cartValue: normalized.cartValue,
        checkoutUrl: normalized.checkoutUrl,
        checkoutStage: normalized.checkoutStage,
        address: normalized.address,
        isRecovered: false,
      });

      console.log(`[Fastrr Webhook] Saved cart ${checkout.id} for: ${normalized.customerName || normalized.customerPhone || "Unknown"}`);
      res.status(200).json({ success: true, id: checkout.id });
    } catch (error) {
      console.error("[Fastrr Webhook] Processing error:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });

  // GET abandoned checkouts with assigned agent name
  app.get("/api/abandoned-checkouts", async (req, res) => {
    try {
      const checkouts = await storage.getAbandonedCheckouts();
      res.json(checkouts);
    } catch (error) {
      console.error("Error fetching abandoned checkouts:", error);
      res.status(500).json({ error: "Failed to fetch abandoned checkouts" });
    }
  });

  // ============================================================================
  // ORDERS API
  // ============================================================================

  // Get all orders with optional filters
  // SECURITY: Uses buildOrderReadScope for Safe Global View pattern
  // - Agents can view all orders when scope='global' (for "All Orders" toggle)
  // - Agents default to seeing only assigned orders when scope is not specified
  // - Write protection (canUserAccessOrder) still blocks modifications to unassigned orders
  app.get("/api/orders", async (req, res) => {
    try {
      const { status, paymentMethod, assignedTo, callStatus, agentId, limit, page, search, startDate, endDate, sortOrder, tag, currentUserId, scope } = req.query;

      // Parse pagination parameters
      const parsedLimit = limit ? parseInt(limit as string) : 50;
      const parsedPage = page ? parseInt(page as string) : 1;
      // Calculate offset from page number: page 1 = offset 0, page 2 = offset 50, etc.
      const calculatedOffset = (parsedPage - 1) * parsedLimit;
      
      // Parse date filters (ISO strings from frontend) - validate to avoid Invalid Date
      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;
      
      if (startDate) {
        const d = new Date(startDate as string);
        if (!Number.isNaN(d.getTime())) parsedStartDate = d;
      }
      if (endDate) {
        const d = new Date(endDate as string);
        if (!Number.isNaN(d.getTime())) parsedEndDate = d;
      }

      // SECURITY: Build order read scope using Safe Global View pattern
      // - scope='global': Agent can see all orders (for "All Orders" toggle)
      // - scope=undefined: Agent sees only assigned orders (default, fixes Resume bug)
      // - Admins always see all orders (with optional assignedTo filter)
      const parsedScope = scope === 'global' ? 'global' : undefined;
      const authResult = await buildOrderReadScope(
        currentUserId as string | undefined,
        parsedScope,
        assignedTo as string | undefined
      );
      
      // SECURITY: Reject requests without valid user context
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }

      const filters = {
        status: status as string | undefined,
        paymentMethod: paymentMethod as string | undefined,
        assignedTo: authResult.assignedTo, // Use enforced value instead of raw request value
        callStatus: callStatus as string | undefined,
        agentId: agentId as string | undefined, // 'unassigned' for NULL, or agent UUID
        search: search as string | undefined, // Server-side search across orderId, customerName, phone, email, city
        sortOrder: (sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc', // Default to 'desc' (Newest First)
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        tag: tag as string | undefined, // Filter by tag (exact match in tags array)
        limit: parsedLimit,
        offset: calculatedOffset,
      };

      const result = await storage.listOrders(filters);
      res.json(result);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Export orders to CSV with all matching filters (no pagination)
  // Returns downloadable CSV file with agent names and line items
  // SECURITY: Enforces agent-level read protection for CSV exports
  app.get("/api/orders/export", async (req, res) => {
    try {
      const { status, paymentMethod, assignedTo, callStatus, agentId, search, startDate, endDate, tag, currentUserId } = req.query;

      // Parse date filters
      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;
      
      if (startDate) {
        const d = new Date(startDate as string);
        if (!Number.isNaN(d.getTime())) parsedStartDate = d;
      }
      if (endDate) {
        const d = new Date(endDate as string);
        if (!Number.isNaN(d.getTime())) parsedEndDate = d;
      }

      // SECURITY: Enforce agent-level read filter for exports
      const authResult = await enforceAgentReadFilter(
        currentUserId as string | undefined,
        assignedTo as string | undefined
      );
      
      // SECURITY: Reject requests without valid user context
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }

      const filters = {
        status: status as string | undefined,
        paymentMethod: paymentMethod as string | undefined,
        assignedTo: authResult.assignedTo, // Use enforced value
        callStatus: callStatus as string | undefined,
        agentId: agentId as string | undefined,
        search: search as string | undefined,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        tag: tag as string | undefined,
      };

      // Fetch all matching orders (no limit/offset for export)
      const exportData = await storage.exportOrders(filters);
      
      // Generate CSV content
      const headers = [
        'Order ID',
        'Order Date',
        'Order Status',
        'Payment Method',
        'Total Amount',
        'Customer Name',
        'Customer Phone',
        'City',
        'State',
        'Zip Code',
        'Assigned Agent',
        'Assigned Date',
        'Confirmed Date',
        'Call Status',
        'Attempts Count',
        'Tags',
        'Line Items'
      ];

      const formatDate = (date: Date | null | undefined): string => {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      };

      const escapeCSV = (value: string | null | undefined): string => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = exportData.map(order => [
        escapeCSV(order.shopifyOrderNumber),
        formatDate(order.shopifyCreatedAt),
        escapeCSV(order.status),
        escapeCSV(order.paymentMethod),
        order.totalPrice?.toString() || '0',
        escapeCSV(order.customerName),
        escapeCSV(order.customerPhone),
        escapeCSV(order.shippingCity),
        escapeCSV(order.shippingState),
        escapeCSV(order.shippingPincode),
        escapeCSV(order.agentName),
        formatDate(order.assignedAt),
        formatDate(order.confirmedAt),
        escapeCSV(order.callStatus),
        order.followUpAttempts?.toString() || '0',
        escapeCSV(order.tags?.join(', ')),
        escapeCSV(order.lineItems)
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');

      // Generate filename with current date
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const filename = `orders_export_${dateStr}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting orders:", error);
      res.status(500).json({ error: "Failed to export orders" });
    }
  });

  // Get orders that are Out for Delivery (OFD) - STRICT MODE
  // This is a CALL LIST for agents to confirm "delivery TODAY" with customers
  // ONLY show orders where the package is physically with the rider
  // IMPORTANT: Must be defined BEFORE /api/orders/:id to avoid route conflict
  // SECURITY: Enforces agent-level read protection
  app.get("/api/orders/ofd", async (req, res) => {
    try {
      const { currentUserId } = req.query;
      
      // SECURITY: Enforce agent-level read filter
      const authResult = await enforceAgentReadFilter(
        currentUserId as string | undefined,
        undefined
      );
      
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }
      
      // Build agent filter condition for OFD query
      const agentFilter = authResult.assignedTo 
        ? sql`AND ${orders.assignedTo} = ${authResult.assignedTo}`
        : sql``;
      
      const result = await db.select({
        id: orders.id,
        shopifyOrderNumber: orders.shopifyOrderNumber,
        customerName: orders.customerName,
        customerEmail: orders.customerEmail,
        customerPhone: orders.customerPhone,
        shippingAddress: orders.shippingAddress,
        trackingNumber: orders.trackingNumber,
        trackingUrl: orders.trackingUrl,
        courierName: orders.courierName,
        shipmentStatus: orders.shipmentStatus,
        status: orders.status,
        assignedTo: orders.assignedTo,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        sql`(
          -- STRICT MODE: Only match Out for Delivery statuses
          -- Package must be physically with the rider for delivery TODAY
          LOWER(${orders.shipmentStatus}) LIKE '%out for delivery%'
          OR LOWER(${orders.shipmentStatus}) = 'dispatched'
          OR LOWER(${orders.shipmentStatus}) LIKE '%ofd%'
          OR ${orders.shipmentStatus} = 'OT'
          -- Fallback: Match main order status
          OR LOWER(${orders.status}) = 'out_for_delivery'
        )
        -- Exclude delivered, cancelled, NDR, RTO, and In Transit orders
        AND LOWER(COALESCE(${orders.status}, '')) NOT IN ('delivered', 'cancelled', 'ndr', 'in_transit')
        AND LOWER(COALESCE(${orders.shipmentStatus}, '')) NOT LIKE '%delivered%'
        AND LOWER(COALESCE(${orders.shipmentStatus}, '')) NOT LIKE '%rto%'
        AND LOWER(COALESCE(${orders.shipmentStatus}, '')) NOT LIKE '%in transit%'
        AND LOWER(COALESCE(${orders.shipmentStatus}, '')) NOT LIKE '%in-transit%'
        AND ${orders.shipmentStatus} != 'IT'
        ${agentFilter}`
      )
      .orderBy(desc(orders.createdAt))
      .limit(100);

      res.json({ orders: result, total: result.length });
    } catch (error: any) {
      console.error("Error fetching OFD orders:", error);
      res.status(500).json({ error: error.message || "Failed to fetch OFD orders" });
    }
  });

  // Dashboard metrics - aggregated counts for overview
  // Pass userId query param to filter metrics by agent's assigned orders
  // Pass startDate/endDate to filter by order_assignments.created_at (cohort analysis)
  app.get("/api/dashboard/metrics", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const { startDate, endDate } = req.query;
      
      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;
      
      if (startDate) {
        const d = new Date(startDate as string);
        if (!Number.isNaN(d.getTime())) parsedStartDate = d;
      }
      if (endDate) {
        const d = new Date(endDate as string);
        if (!Number.isNaN(d.getTime())) parsedEndDate = d;
      }
      
      const metrics = await storage.getDashboardMetrics(userId, parsedStartDate, parsedEndDate);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({ error: "Failed to fetch dashboard metrics" });
    }
  });

  // Get hourly activity for dashboard chart (from order_status_history)
  app.get("/api/dashboard/hourly-activity", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const timezone = req.query.timezone as string | undefined;
      const { startDate, endDate } = req.query;
      
      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;
      
      if (startDate) {
        const d = new Date(startDate as string);
        if (!Number.isNaN(d.getTime())) parsedStartDate = d;
      }
      if (endDate) {
        const d = new Date(endDate as string);
        if (!Number.isNaN(d.getTime())) parsedEndDate = d;
      }
      
      const data = await storage.getHourlyActivity(userId, parsedStartDate, parsedEndDate, timezone);
      res.json({ data });
    } catch (error) {
      console.error("Error fetching hourly activity:", error);
      res.status(500).json({ error: "Failed to fetch hourly activity" });
    }
  });

  // Get single order by ID
  // SECURITY: Read protection with Safe Global View pattern
  // - Agents with scope='global' can read any order details
  // - Agents without scope can only read their assigned orders
  // - Write protection (canUserModifyOrder) still enforces ownership for modifications
  app.get("/api/orders/:id", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      
      // SECURITY: Use canUserReadOrder which respects Global View scope
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined, 
        req.params.id,
        scope as string | undefined
      );
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to access this order" });
      }
      
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
  // SECURITY: Read protection with Safe Global View pattern
  // - Agents with scope='global' can read items for any order
  // - Agents without scope can only read items for their assigned orders
  app.get("/api/orders/:id/items", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      
      // SECURITY: Use canUserReadOrder which respects Global View scope
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined, 
        req.params.id,
        scope as string | undefined
      );
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to access this order" });
      }
      
      const items = await storage.getOrderItems(req.params.id);
      res.json(items);
    } catch (error) {
      console.error("Error fetching order items:", error);
      res.status(500).json({ error: "Failed to fetch order items" });
    }
  });

  // Get order status history
  // SECURITY: Read protection with Safe Global View pattern
  // - Agents with scope='global' can read history for any order
  // - Agents without scope can only read history for their assigned orders
  app.get("/api/orders/:id/history", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      
      // SECURITY: Use canUserReadOrder which respects Global View scope
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined, 
        req.params.id,
        scope as string | undefined
      );
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to access this order" });
      }
      
      const history = await storage.getOrderHistory(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching order history:", error);
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // Get order assignment history
  // SECURITY: Read protection with Safe Global View pattern
  // - Agents with scope='global' can read assignments for any order
  // - Agents without scope can only read assignments for their assigned orders
  app.get("/api/orders/:id/assignments", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      
      // SECURITY: Use canUserReadOrder which respects Global View scope
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined, 
        req.params.id,
        scope as string | undefined
      );
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to access this order" });
      }
      
      const assignments = await storage.getOrderAssignments(req.params.id);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching order assignments:", error);
      res.status(500).json({ error: "Failed to fetch order assignments" });
    }
  });

  // Get shipment and NDR data for an order
  // SECURITY: Read protection with Safe Global View pattern
  // - Agents with scope='global' can read shipment data for any order
  // - Agents without scope can only read shipment for their assigned orders
  app.get("/api/orders/:id/shipment", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      
      // SECURITY: Use canUserReadOrder which respects Global View scope
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined, 
        req.params.id,
        scope as string | undefined
      );
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to access this order" });
      }
      
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const shipment = await storage.getShipmentByOrderId(req.params.id);
      let ndrEvents: any[] = [];
      
      if (shipment) {
        ndrEvents = await storage.getNDREventsByShipmentId(shipment.id);
      }

      res.json({ shipment, ndrEvents });
    } catch (error) {
      console.error("Error fetching shipment data:", error);
      res.status(500).json({ error: "Failed to fetch shipment data" });
    }
  });

  // Get call history for an order with agent details
  // SECURITY: Read protection with Safe Global View pattern
  // - Agents with scope='global' can read calls for any order
  // - Agents without scope can only read calls for their assigned orders
  app.get("/api/orders/:id/calls", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      
      // SECURITY: Use canUserReadOrder which respects Global View scope
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined, 
        req.params.id,
        scope as string | undefined
      );
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to access this order" });
      }
      
      const calls = await storage.getCallsWithAgentByOrderId(req.params.id);
      res.json(calls);
    } catch (error) {
      console.error("Error fetching call history:", error);
      res.status(500).json({ error: "Failed to fetch call history" });
    }
  });

  // Update order shipping address (syncs to Shopify first, then updates local DB)
  // SECURITY: Write protection - agents can only update addresses on their assigned orders
  app.put("/api/orders/:id/address", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { 
        firstName, lastName, address1, address2, 
        city, province, zip, country, phone, email,
        userId
      } = req.body;

      // SECURITY: userId is REQUIRED for authorization
      if (!userId) {
        return res.status(400).json({ error: "userId is required for authorization" });
      }
      
      // SECURITY: Verify user can modify this order (admin or assigned agent)
      const authCheck = await canUserModifyOrder(userId, orderId);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }

      // Get the order to find its Shopify ID
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Sync to Shopify first
      try {
        const credentials = await storage.getShopifyCredentials();
        if (credentials) {
          const { decrypt } = await import("./encryption");
          const decryptedToken = decrypt(credentials.accessToken);
          
          const { ShopifyClient } = await import("./shopify");
          const client = new ShopifyClient({
            storeUrl: credentials.storeUrl,
            apiKey: decryptedToken,
            apiSecret: credentials.apiSecret || "",
          });

          await client.updateOrderShippingAddress(order.shopifyOrderId, {
            firstName,
            lastName,
            address1,
            address2,
            city,
            province,
            zip,
            country: country || "India",
            phone,
          });
        }
      } catch (shopifyError: any) {
        console.error("Shopify address update failed:", shopifyError);
        return res.status(400).json({ 
          error: "Failed to update address in Shopify",
          details: shopifyError.message 
        });
      }

      // Build formatted address string
      const addressParts = [
        address1,
        address2,
        city,
        province,
        zip,
        country || "India"
      ].filter(Boolean);
      const formattedAddress = addressParts.join(", ");

      // Build the full address object for JSONB storage
      const shippingAddressObject = {
        first_name: firstName,
        last_name: lastName,
        address1,
        address2,
        city,
        province,
        zip,
        country: country || "India",
        phone,
      };

      // Update local database
      const updatedOrder = await storage.updateOrder(orderId, {
        customerName: `${firstName} ${lastName}`.trim(),
        customerPhone: phone || order.customerPhone,
        customerEmail: email || order.customerEmail,
        shippingAddress: shippingAddressObject,
        shippingAddressLine1: address1,
        shippingAddressLine2: address2,
        shippingCity: city,
        shippingState: province,
        shippingPincode: zip,
        shippingCountry: country || "India",
      });

      res.json(updatedOrder);
    } catch (error: any) {
      console.error("Error updating shipping address:", error);
      res.status(500).json({ error: "Failed to update shipping address" });
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
  // SECURITY: Write protection - agents can only update status on their assigned orders
  app.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const { status, changedBy, note } = req.body;

      if (!status) {
        return res.status(400).json({ error: "status is required" });
      }

      // SECURITY: changedBy is REQUIRED for authorization
      if (!changedBy) {
        return res.status(400).json({ error: "changedBy is required for authorization" });
      }
      
      // SECURITY: Verify user can modify this order (admin or assigned agent)
      const authCheck = await canUserModifyOrder(changedBy, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
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

  // Update order tags/callStatus
  // SECURITY: Write protection - agents can only update their assigned orders
  app.patch("/api/orders/:id", async (req, res) => {
    try {
      const { tags, callStatus, userId } = req.body;

      // SECURITY: userId is REQUIRED for authorization
      if (!userId) {
        return res.status(400).json({ error: "userId is required for authorization" });
      }
      
      // SECURITY: Verify user can modify this order (admin or assigned agent)
      const authCheck = await canUserModifyOrder(userId, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }

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
  // 
  // SAFE GLOBAL VIEW PATTERN - WRITE PROTECTION:
  // ============================================
  // These endpoints allow agents to modify order status (confirm, cancel, follow-up).
  // 
  // CRITICAL: Even though agents CAN VIEW all orders when scope='global' is set
  // (via the "All Orders" toggle), they CANNOT MODIFY orders they are not assigned to.
  // 
  // canUserModifyOrder() enforces this protection:
  // - Admins: Can modify any order
  // - Agents: Can ONLY modify orders where assignedTo = their userId
  // 
  // If an agent tries to confirm/cancel/followup an order they don't own,
  // they receive 403 Forbidden - even if they can see it in Global View.
  // ============================================================================

  // Confirm order (moves to Fulfil section)
  // SECURITY: Write protection - agents can only confirm their assigned orders
  app.post("/api/orders/:id/confirm", async (req, res) => {
    try {
      const { userId, notes } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // SECURITY: Verify user can modify this order (admin or assigned agent)
      const authCheck = await canUserModifyOrder(userId, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
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

      // Sync to Shopify (non-blocking)
      const { shopifySyncService } = await import("./services/shopifySync");
      shopifySyncService.syncToShopify(req.params.id, 'confirmed', { userId, notes })
        .catch((err) => console.error('[Shopify Sync] Background sync failed:', err));

      res.json({ success: true, order });
    } catch (error) {
      console.error("Error confirming order:", error);
      res.status(500).json({ error: "Failed to confirm order" });
    }
  });

  // Cancel order with reason
  // SECURITY: Write protection - agents can only cancel their assigned orders
  app.post("/api/orders/:id/cancel", async (req, res) => {
    try {
      const { userId, reason, notes } = req.body;

      if (!userId || !reason) {
        return res.status(400).json({ error: "userId and reason are required" });
      }

      // SECURITY: Verify user can modify this order (admin or assigned agent)
      const authCheck = await canUserModifyOrder(userId, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }

      // STEP 1: Get order from DB to retrieve shopifyOrderId
      const existingOrder = await storage.getOrder(req.params.id);
      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (!existingOrder.shopifyOrderId) {
        return res.status(400).json({ error: "Order has no Shopify ID" });
      }

      // STEP 2: Validate and cancel in Shopify FIRST (this includes all validation checks)
      try {
        const { updateShopifyClient } = await import("./shopify");
        const client = await updateShopifyClient();
        
        // This method validates order state and cancels in Shopify (with refund, email, restock)
        await client.cancelOrder(
          existingOrder.shopifyOrderId,
          reason,
          true,  // notifyCustomer
          true   // restock
        );
      } catch (shopifyError: any) {
        // Return user-friendly error messages for validation failures
        const errorMessage = shopifyError.message || String(shopifyError);
        
        if (errorMessage.includes("already cancelled")) {
          return res.status(400).json({ error: "Order already cancelled" });
        }
        if (errorMessage.includes("fulfilled") || errorMessage.includes("FULFILLED")) {
          return res.status(400).json({ error: "Cannot cancel fulfilled or partially fulfilled orders" });
        }
        if (errorMessage.includes("closed") || errorMessage.includes("archived")) {
          return res.status(400).json({ error: "Cannot cancel closed orders" });
        }
        if (errorMessage.includes("VOIDED") || errorMessage.includes("REFUNDED")) {
          return res.status(400).json({ error: "Cannot cancel already refunded orders" });
        }
        
        // Generic Shopify error
        console.error("Shopify cancellation error:", shopifyError);
        return res.status(400).json({ error: `Shopify error: ${errorMessage}` });
      }

      // STEP 3: Update local DB only after Shopify validation passes
      const order = await storage.cancelOrder(req.params.id, userId, reason, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // STEP 4: Create order status history entry
      await storage.createOrderStatus({
        orderId: req.params.id,
        status: 'cancelled',
        changedBy: userId,
        note: `Order cancelled: ${reason}${notes ? ' - ' + notes : ''}`,
      });

      // STEP 5: Sync tags and notes to Shopify (non-blocking)
      const { shopifySyncService } = await import("./services/shopifySync");
      shopifySyncService.syncToShopify(req.params.id, 'cancelled', { userId, reason, notes })
        .catch((err) => console.error('[Shopify Sync] Background sync failed:', err));

      res.json({ success: true, order });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ error: "Failed to cancel order" });
    }
  });

  // Schedule follow-up for order
  // SECURITY: Write protection - agents can only set follow-up on their assigned orders
  app.post("/api/orders/:id/followup", async (req, res) => {
    try {
      const { userId, followupAt, notes } = req.body;

      if (!userId || !followupAt) {
        return res.status(400).json({ error: "userId and followupAt are required" });
      }

      // SECURITY: Verify user can modify this order (admin or assigned agent)
      const authCheck = await canUserModifyOrder(userId, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
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

      // Sync to Shopify (non-blocking)
      const { shopifySyncService } = await import("./services/shopifySync");
      shopifySyncService.syncToShopify(req.params.id, 'followup', { userId, followupDate, notes })
        .catch((err) => console.error('[Shopify Sync] Background sync failed:', err));

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
          // Still update order items with images from local products cache
          if (shopifyOrder.line_items?.length > 0) {
            const existingItems = await storage.getOrderItems(existingOrder.id);
            
            for (const item of existingItems) {
              // Skip if already has an image
              if (item.imageUrl) continue;
              
              // Look up product image from our local products cache
              let imageUrl: string | null = null;
              
              if (item.shopifyVariantId) {
                const productByVariant = await storage.getProductByVariantId(item.shopifyVariantId);
                if (productByVariant?.imageUrl) {
                  imageUrl = productByVariant.imageUrl;
                }
              }
              
              if (!imageUrl && item.shopifyProductId) {
                const productByProduct = await storage.getProductByProductId(item.shopifyProductId);
                if (productByProduct?.imageUrl) {
                  imageUrl = productByProduct.imageUrl;
                }
              }
              
              // Update the order item with the image
              if (imageUrl) {
                await storage.updateOrderItemImage(item.id, imageUrl);
              }
            }
          }
          
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

        // Extract fulfillment tracking info
        const fulfillmentTracking = extractFulfillmentTracking(shopifyOrder.fulfillments);

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
            fulfillmentTracking.shipmentStatus,
            shopifyOrder.cancelled_at || null,
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
          shipmentStatus: fulfillmentTracking.shipmentStatus,
          trackingNumber: fulfillmentTracking.trackingNumber,
          trackingUrl: fulfillmentTracking.trackingUrl,
          courierName: fulfillmentTracking.trackingCompany,
          rawShopifyData: shopifyOrder,
          shopifyCreatedAt: new Date(shopifyOrder.created_at),
          shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
        };

        const order = await storage.createOrder(orderData);

        // Create order items with product image lookup from local products table
        if (shopifyOrder.line_items?.length > 0) {
          const items = await Promise.all(
            shopifyOrder.line_items.map(async (item: any) => {
              // Look up product image from our local products cache
              let imageUrl: string | null = null;
              
              // Try by variant ID first (more specific)
              if (item.variant_id) {
                const productByVariant = await storage.getProductByVariantId(item.variant_id.toString());
                if (productByVariant?.imageUrl) {
                  imageUrl = productByVariant.imageUrl;
                }
              }
              
              // Fall back to product ID if no variant match
              if (!imageUrl && item.product_id) {
                const productByProduct = await storage.getProductByProductId(item.product_id.toString());
                if (productByProduct?.imageUrl) {
                  imageUrl = productByProduct.imageUrl;
                }
              }
              
              return {
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
              };
            })
          );

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

        const finalOrder = await storage.getOrder(order.id);
        let assignedAgentEmail: string | null = null;
        if (finalOrder?.assignedTo) {
          const agent = await storage.getUser(finalOrder.assignedTo);
          if (agent) assignedAgentEmail = agent.email;
        }
        triggerWebhooks('order.created', { order: finalOrder || order, shopifyOrderId: shopifyOrder.id, assignedAgentEmail });

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
          storeName: null,
          lastTested: null,
          testStatus: null,
        });
      }

      // Extract store name from URL (e.g., "gripherstore" from "gripherstore.myshopify.com")
      const storeName = credentials.storeUrl.split('.')[0] || null;

      res.json({
        configured: true,
        storeUrl: credentials.storeUrl,
        storeName: storeName,
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

  // Delete Shopify credentials (idempotent - returns 200 even if already deleted)
  app.delete("/api/shopify/credentials", async (req, res) => {
    try {
      const credentials = await storage.getShopifyCredentials();
      
      if (!credentials) {
        // Idempotent: If the goal is "no credentials exist" and none exist, that's success
        return res.json({ success: true, message: "Credentials already cleared" });
      }

      await storage.deleteShopifyCredentials(credentials.id);
      
      res.json({ success: true, message: "Credentials deleted successfully" });
    } catch (error) {
      console.error("Error deleting credentials:", error);
      res.status(500).json({ error: "Failed to delete credentials" });
    }
  });

  // ============================================================================
  // TAGS API
  // ============================================================================

  // Get all distinct tags from orders (for filter dropdown)
  app.get("/api/tags", async (req, res) => {
    try {
      const tags = await storage.getDistinctTags();
      res.json({ tags });
    } catch (error: any) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ error: error.message || "Failed to fetch tags" });
    }
  });

  // ============================================================================
  // PAYMENT SETTINGS API
  // ============================================================================

  // Get all distinct payment methods from orders (for auto-detect feature)
  app.get("/api/orders/payment-methods", async (req, res) => {
    try {
      const methods = await storage.getDistinctPaymentMethods();
      res.json({ methods });
    } catch (error: any) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: error.message || "Failed to fetch payment methods" });
    }
  });

  // Get configured prepaid payment methods
  app.get("/api/settings/payments", async (req, res) => {
    try {
      const methods = await storage.getPrepaidPaymentMethods();
      res.json({ prepaidMethods: methods });
    } catch (error: any) {
      console.error("Error fetching payment settings:", error);
      res.status(500).json({ error: error.message || "Failed to fetch payment settings" });
    }
  });

  // Update prepaid payment methods configuration
  app.post("/api/settings/payments", async (req, res) => {
    try {
      const { prepaidMethods } = req.body;
      
      if (!Array.isArray(prepaidMethods)) {
        return res.status(400).json({ error: "prepaidMethods must be an array" });
      }

      const setting = await storage.setAppSetting('prepaid_payment_methods', prepaidMethods);
      res.json({ 
        success: true, 
        prepaidMethods: setting.value,
        message: "Payment settings updated successfully" 
      });
    } catch (error: any) {
      console.error("Error updating payment settings:", error);
      res.status(500).json({ error: error.message || "Failed to update payment settings" });
    }
  });

  // ============================================================================
  // PRODUCTS SYNC API
  // ============================================================================

  // Sync products from Shopify to local database
  app.post("/api/admin/sync-products", async (req, res) => {
    try {
      const credentials = await storage.getShopifyCredentials();
      
      if (!credentials) {
        return res.status(400).json({ error: "Shopify credentials not configured" });
      }

      // Use accessToken (same as syncOrders pattern)
      const decryptedToken = decrypt(credentials.accessToken);
      const decryptedSecret = decrypt(credentials.apiSecret);
      
      // Debug log: show token prefix to verify we're using the right credential
      console.log("Sync Products using Token:", decryptedToken ? decryptedToken.slice(0, 5) + "..." : "UNDEFINED");
      
      // Create a new ShopifyClient instance with decrypted credentials
      const { ShopifyClient } = await import("./shopify");
      const client = new ShopifyClient({
        storeUrl: credentials.storeUrl,
        apiKey: decryptedToken,  // accessToken is used as apiKey for Shopify API requests
        apiSecret: decryptedSecret,
      });

      console.log("Starting Shopify product sync...");
      
      // Fetch all products from Shopify
      const shopifyProducts = await client.fetchAllProducts();
      console.log(`Fetched ${shopifyProducts.length} products from Shopify`);

      // Transform and upsert each product variant
      let syncedCount = 0;
      let variantCount = 0;

      for (const product of shopifyProducts) {
        const productImage = product.image?.src || product.images?.[0]?.src || null;

        for (const variant of product.variants || []) {
          // Find variant-specific image or fall back to product image
          const variantImageId = variant.image_id;
          let variantImage = productImage;
          
          if (variantImageId && product.images) {
            const matchingImage = product.images.find((img: any) => img.id === variantImageId);
            if (matchingImage) {
              variantImage = matchingImage.src;
            }
          }

          await storage.upsertProduct({
            shopifyProductId: String(product.id),
            shopifyVariantId: String(variant.id),
            title: product.title,
            variantTitle: variant.title !== "Default Title" ? variant.title : null,
            sku: variant.sku || null,
            imageUrl: variantImage,
            lastSyncedAt: new Date(),
          });
          
          variantCount++;
        }
        syncedCount++;
      }

      console.log(`Synced ${syncedCount} products with ${variantCount} variants`);

      res.json({
        success: true,
        message: `Synced ${syncedCount} products with ${variantCount} variants`,
        productsCount: syncedCount,
        variantsCount: variantCount,
      });
    } catch (error: any) {
      console.error("Error syncing products:", error);
      res.status(500).json({ 
        error: "Failed to sync products", 
        details: error.message 
      });
    }
  });

  // Get product sync status
  app.get("/api/admin/products/status", async (req, res) => {
    try {
      const count = await storage.getProductCount();
      const lastSync = await storage.getLastProductSync();
      
      res.json({
        productCount: count,
        lastSyncedAt: lastSync,
      });
    } catch (error) {
      console.error("Error getting product status:", error);
      res.status(500).json({ error: "Failed to get product status" });
    }
  });

  // Get product by variant ID (for order item lookup)
  app.get("/api/products/variant/:variantId", async (req, res) => {
    try {
      const product = await storage.getProductByVariantId(req.params.variantId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  // ============================================================================
  // USERS API
  // ============================================================================

  // Get current authenticated user (disabled - using localStorage auth temporarily)
  // TODO: Re-enable when proper JWT/session auth is implemented
  // app.get("/api/me", async (req, res) => {
  //   try {
  //     if (!req.user) {
  //       return res.status(401).json({ error: "Not authenticated" });
  //     }
  //     res.json(req.user);
  //   } catch (error) {
  //     console.error("Error fetching current user:", error);
  //     res.status(500).json({ error: "Failed to fetch current user" });
  //   }
  // });

  // Get user by email (public endpoint for login and profile)
  app.get("/api/users/by-email/:email", async (req, res) => {
    try {
      const user = await storage.getUserByEmail(req.params.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Return user info for profile (exclude password only)
      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        adminType: user.adminType,
        department: user.department,
        employeeId: user.employeeId,
        agentExtension: user.agentExtension,
        presenceStatus: user.presenceStatus,
        isActive: user.isActive,
        createdAt: user.createdAt,
        avatarImage: user.avatarImage,
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

  // Get all agents (for admin order filtering dropdown)
  app.get("/api/users/agents", async (req, res) => {
    try {
      const agents = await storage.listUsers({ role: "agent", isActive: true });
      // Return minimal data needed for dropdown
      res.json(agents.map(agent => ({
        id: agent.id,
        fullName: agent.fullName,
        email: agent.email,
      })));
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ error: "Failed to fetch agents" });
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
      // Get currentUserId from body (for admin edits) or default to target user (self-edit)
      const currentUserId = req.body.currentUserId || req.params.id;
      
      // Remove currentUserId from body before validation (it's not part of updateUserSchema)
      const { currentUserId: _, ...updateData } = req.body;

      const validatedData = updateUserSchema.parse(updateData);
      
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

  // Delete user with full cleanup of all foreign key dependencies
  app.delete("/api/users/:id", async (req, res) => {
    try {
      const userId = req.params.id;

      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      console.log(`Starting cleanup for user ${userId} (${user.email})`);

      // Sequential cleanup of all foreign key dependencies
      // 1. Unassign orders
      await db.update(orders).set({ assignedTo: null }).where(eq(orders.assignedTo, userId));
      await db.update(orders).set({ confirmedBy: null }).where(eq(orders.confirmedBy, userId));
      await db.update(orders).set({ cancelledBy: null }).where(eq(orders.cancelledBy, userId));
      console.log("  - Orders unassigned");

      // 2. Delete order assignments
      await db.delete(orderAssignments).where(
        or(eq(orderAssignments.userId, userId), eq(orderAssignments.assignedBy, userId))
      );
      console.log("  - Order assignments deleted");

      // 3. Delete team messages (sent or received)
      await db.delete(teamMessages).where(
        or(eq(teamMessages.fromUserId, userId), eq(teamMessages.toUserId, userId))
      );
      console.log("  - Team messages deleted");

      // 4. Delete leave requests
      await db.delete(leaveRequests).where(eq(leaveRequests.userId, userId));
      // Set reviewedBy to null for requests reviewed by this user
      await db.update(leaveRequests).set({ reviewedBy: null }).where(eq(leaveRequests.reviewedBy, userId));
      console.log("  - Leave requests deleted/updated");

      // 5. Delete notifications
      await db.delete(notifications).where(eq(notifications.userId, userId));
      console.log("  - Notifications deleted");

      // 6. Delete attendance records
      await db.delete(attendance).where(eq(attendance.userId, userId));
      console.log("  - Attendance records deleted");

      // 7. Delete call records
      await db.delete(calls).where(eq(calls.agentId, userId));
      console.log("  - Call records deleted");

      // 8. Unlink order status history (set changedBy to null)
      await db.update(orderStatusHistory).set({ changedBy: null }).where(eq(orderStatusHistory.changedBy, userId));
      console.log("  - Order status history updated");

      // 9. Unlink invites (set invitedBy to null)
      await db.update(invites).set({ invitedBy: null }).where(eq(invites.invitedBy, userId));
      console.log("  - Invites updated");

      // 10. Unlink NDR events (set actionBy to null)
      await db.update(ndrEvents).set({ actionBy: null }).where(eq(ndrEvents.actionBy, userId));
      console.log("  - NDR events updated");

      // 11. Unlink courses (set authorId to null)
      await db.update(courses).set({ authorId: null }).where(eq(courses.authorId, userId));
      console.log("  - Courses updated");

      // 12. Unlink resources (set authorId to null)
      await db.update(resources).set({ authorId: null }).where(eq(resources.authorId, userId));
      console.log("  - Resources updated");

      // 13. Delete user lesson progress
      await db.delete(userLessonProgress).where(eq(userLessonProgress.userId, userId));
      console.log("  - User lesson progress deleted");

      // 14. Delete user onboarding progress
      await db.delete(userOnboardingProgress).where(eq(userOnboardingProgress.userId, userId));
      console.log("  - User onboarding progress deleted");

      // 15. Finally, delete the user
      await storage.deleteUser(userId);
      console.log(`User ${userId} deleted successfully`);

      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ============================================================================
  // ATTENDANCE API (HR/Payroll Tracking)
  // ============================================================================

  // Clock in (accepts client's local date for timezone safety)
  app.post("/api/attendance/clock-in", async (req, res) => {
    try {
      const { userId, localDate } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const now = new Date();
      
      // Use client's local date if provided (YYYY-MM-DD format)
      // Store as noon UTC to avoid timezone truncation issues
      let dateForRecord: Date;
      if (localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        // Parse YYYY-MM-DD and create a UTC noon timestamp for that date
        const [year, month, day] = localDate.split('-').map(Number);
        dateForRecord = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      } else {
        // Fallback to server time
        dateForRecord = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
      }

      // Check if already clocked in for this date
      const dateStr = localDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const existing = await storage.getAttendanceByDate(userId, dateStr);
      if (existing && existing.clockInTime) {
        return res.status(400).json({ 
          error: "Already clocked in today",
          attendance: existing 
        });
      }

      // Create or update attendance record with client's local date
      const attendance = await storage.clockInWithDate(userId, now, dateForRecord);
      res.json({ success: true, attendance });
    } catch (error) {
      console.error("Error clocking in:", error);
      res.status(500).json({ error: "Failed to clock in" });
    }
  });

  // Clock out (accepts client's local date for timezone safety)
  app.post("/api/attendance/clock-out", async (req, res) => {
    try {
      const { userId, localDate } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const now = new Date();
      
      // Use client's local date if provided
      const dateStr = localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate) 
        ? localDate 
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Get attendance for the specific date
      const existing = await storage.getAttendanceByDate(userId, dateStr);
      if (!existing || !existing.clockInTime) {
        return res.status(400).json({ error: "Not clocked in today" });
      }

      if (existing.clockOutTime) {
        return res.status(400).json({ 
          error: "Already clocked out today",
          attendance: existing 
        });
      }

      // Close any open breaks before clocking out
      await storage.closeOpenBreaksForAttendance(existing.id, now);

      // Get all breaks and calculate total break duration
      const breaks = await storage.getBreaksByAttendanceId(existing.id);
      let totalBreakMs = 0;
      for (const brk of breaks) {
        if (brk.breakStart && brk.breakEnd) {
          totalBreakMs += new Date(brk.breakEnd).getTime() - new Date(brk.breakStart).getTime();
        }
      }
      const totalBreakHours = totalBreakMs / (1000 * 60 * 60);

      // Calculate total hours: (ClockOut - ClockIn) - BreakDuration
      const clockInTime = new Date(existing.clockInTime);
      const rawHours = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
      const totalHours = Math.max(0, rawHours - totalBreakHours);

      const attendance = await storage.clockOutById(existing.id, now, totalHours);
      res.json({ success: true, attendance, breakDeducted: totalBreakHours.toFixed(2) });
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

  // Get today's attendance for a user (client-driven date for timezone safety)
  app.get("/api/attendance/today/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const dateParam = req.query.date as string | undefined;
      
      // If client provides a date (YYYY-MM-DD), use timezone-safe lookup
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        // First, auto-close any ghost sessions from previous days
        await storage.autoCloseGhostSessions(userId, dateParam);
        
        // Then get attendance for the specific date
        const attendance = await storage.getAttendanceByDate(userId, dateParam);
        return res.json(attendance || null);
      }
      
      // Fallback to legacy server-time based lookup
      const attendance = await storage.getTodayAttendance(req.params.userId);
      res.json(attendance || null);
    } catch (error) {
      console.error("Error fetching today's attendance:", error);
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });

  // Get today's attendance for all team members (bulk endpoint for Team Management)
  app.get("/api/attendance/team-today", async (req, res) => {
    try {
      const attendanceRecords = await storage.getTeamTodayAttendance();
      res.json(attendanceRecords);
    } catch (error) {
      console.error("Error fetching team attendance:", error);
      res.status(500).json({ error: "Failed to fetch team attendance" });
    }
  });

  // Start a break (sets status to 'break')
  app.post("/api/attendance/break/start", async (req, res) => {
    try {
      const { userId, localDate } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Get attendance for the date
      const now = new Date();
      const dateStr = localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate) 
        ? localDate 
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const attendance = await storage.getAttendanceByDate(userId, dateStr);
      if (!attendance || !attendance.clockInTime) {
        return res.status(400).json({ error: "Not clocked in today" });
      }

      if (attendance.clockOutTime) {
        return res.status(400).json({ error: "Already clocked out today" });
      }

      // Check if already on break
      const activeBreak = await storage.getActiveBreak(attendance.id);
      if (activeBreak) {
        return res.status(400).json({ error: "Already on break", activeBreak });
      }

      // Start the break
      const breakRecord = await storage.startBreak(attendance.id);

      // Update attendance status to 'break'
      const { attendance: attendanceSchema } = await import("@shared/schema");
      await db
        .update(attendanceSchema)
        .set({ status: 'break', updatedAt: new Date() })
        .where(eq(attendanceSchema.id, attendance.id));

      res.json({ success: true, breakRecord });
    } catch (error) {
      console.error("Error starting break:", error);
      res.status(500).json({ error: "Failed to start break" });
    }
  });

  // End a break (sets status back to 'present')
  app.post("/api/attendance/break/end", async (req, res) => {
    try {
      const { userId, localDate } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const now = new Date();
      const dateStr = localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate) 
        ? localDate 
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const attendance = await storage.getAttendanceByDate(userId, dateStr);
      if (!attendance) {
        return res.status(400).json({ error: "No attendance record found" });
      }

      // Find the active break
      const activeBreak = await storage.getActiveBreak(attendance.id);
      if (!activeBreak) {
        return res.status(400).json({ error: "Not currently on break" });
      }

      // End the break
      const breakRecord = await storage.endBreak(activeBreak.id, now);

      // Update attendance status back to 'present'
      const { attendance: attendanceSchema } = await import("@shared/schema");
      await db
        .update(attendanceSchema)
        .set({ status: 'present', updatedAt: new Date() })
        .where(eq(attendanceSchema.id, attendance.id));

      res.json({ success: true, breakRecord });
    } catch (error) {
      console.error("Error ending break:", error);
      res.status(500).json({ error: "Failed to end break" });
    }
  });

  // Get active break for a user's today attendance
  app.get("/api/attendance/break/active/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const dateParam = req.query.date as string | undefined;

      const now = new Date();
      const dateStr = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) 
        ? dateParam 
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const attendance = await storage.getAttendanceByDate(userId, dateStr);
      if (!attendance) {
        return res.json(null);
      }

      const activeBreak = await storage.getActiveBreak(attendance.id);
      res.json(activeBreak || null);
    } catch (error) {
      console.error("Error fetching active break:", error);
      res.status(500).json({ error: "Failed to fetch active break" });
    }
  });

  // Get all breaks for a specific attendance record
  app.get("/api/attendance/:attendanceId/breaks", async (req, res) => {
    try {
      const { attendanceId } = req.params;
      const breaks = await storage.getBreaksByAttendanceId(attendanceId);
      res.json(breaks);
    } catch (error) {
      console.error("Error fetching breaks:", error);
      res.status(500).json({ error: "Failed to fetch breaks" });
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
        // Extract call reference from IVR response (adjust field name based on your provider)
        const callReference = ivrData.recordid || ivrData.call_id || ivrData.callId || ivrData.reference || ivrData.id;
        
        // Create call record in database
        const call = await storage.createCall({
          orderId,
          agentId: userId,
          customerPhone,
          callStatus: "initiated",
          callReference: callReference || undefined,
          recipientNumber: customerPhone,
        });

        console.log("✓ Call initiated successfully:", { 
          callId: call.id, 
          orderId, 
          callReference 
        });

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

  // Get all calls with details (admins see all, agents see only their own)
  app.get("/api/admin/calls", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      
      // Get user info from query params (passed from frontend)
      const userId = req.query.userId as string | undefined;
      const userRole = req.query.userRole as string | undefined;
      
      // If user is an agent, force filter to only their calls
      const agentId = userRole === 'agent' && userId ? userId : undefined;
      
      const result = await storage.getAllCallsWithDetails({ page, limit, agentId });
      res.json(result);
    } catch (error) {
      console.error("Error fetching all calls:", error);
      res.status(500).json({ error: "Failed to fetch calls" });
    }
  });

  // Download call recording (proxy endpoint for cross-origin downloads)
  app.get("/api/calls/download/:callId", async (req, res) => {
    try {
      const { callId } = req.params;
      
      // Fetch call record to get recording URL
      const call = await storage.getCallById(callId);
      
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      
      if (!call.recordingUrl) {
        return res.status(404).json({ error: "No recording available for this call" });
      }
      
      // Fetch the recording from IVR server
      const recordingResponse = await axios.get(call.recordingUrl, {
        responseType: 'stream'
      });
      
      // Set headers for download
      const filename = `Call_${call.callReference || call.id}.wav`;
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Stream the file to the client
      recordingResponse.data.pipe(res);
      
    } catch (error: any) {
      console.error("Error downloading recording:", error);
      res.status(500).json({ error: "Failed to download recording" });
    }
  });

  // AI Analysis - Proxy to n8n workflow for call transcription and analysis
  app.post("/api/integrations/analyze-call", async (req, res) => {
    try {
      const { callId, recordingUrl } = req.body;
      
      if (!callId || !recordingUrl) {
        return res.status(400).json({ error: "callId and recordingUrl are required" });
      }
      
      // Verify call exists
      const call = await storage.getCallById(callId);
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      
      // Fetch agent details for context
      const agent = await storage.getUser(call.agentId);
      const staffMember = agent ? (agent.fullName || agent.email) : "Unknown Agent";
      
      console.log(`🤖 Starting AI analysis for call ${callId}`);
      console.log(`📋 Context: Order ${call.orderId}, Agent: ${staffMember}, Duration: ${call.callDuration || 0}s`);
      
      // Call n8n webhook - uses environment variable for configurability
      const n8nWebhookUrl = process.env.N8N_ANALYZE_CALL_URL;
      
      if (!n8nWebhookUrl) {
        console.error("❌ N8N_ANALYZE_CALL_URL environment variable not set");
        return res.status(500).json({ error: "AI analysis service not configured" });
      }
      
      // Build enriched payload with order and agent context
      const n8nPayload = {
        callId,
        recordingUrl,
        orderId: call.orderId,
        staffMember,
        callDate: call.calledAt?.toISOString() || new Date().toISOString(),
        callDuration: call.callDuration || 0
      };
      
      const n8nResponse = await axios.post(n8nWebhookUrl, n8nPayload, {
        timeout: 120000, // 2 minute timeout for AI processing
        headers: {
          'Content-Type': 'application/json'
        },
        validateStatus: (status) => status < 500 // Accept any non-5xx response
      });
      
      // Check for non-2xx responses
      if (n8nResponse.status >= 400) {
        console.error(`❌ n8n returned error status ${n8nResponse.status}:`, n8nResponse.data);
        return res.status(502).json({ 
          error: "AI service returned an error",
          details: n8nResponse.data?.message || `Status ${n8nResponse.status}`
        });
      }
      
      console.log(`✅ n8n response received for call ${callId}:`, JSON.stringify(n8nResponse.data).substring(0, 500));
      
      // Extract all 5 structured fields from n8n response
      const {
        overallScore,
        executiveSummary,
        rawMarkdownReport,
        riskFlag,
        coachingRecommendation,
        transcript // Also capture transcript if provided
      } = n8nResponse.data || {};
      
      // Build structured AI analysis object with all fields
      const aiAnalysis = {
        overallScore: overallScore ?? null,
        executiveSummary: executiveSummary || null,
        rawMarkdownReport: rawMarkdownReport || null,
        riskFlag: riskFlag || null,
        coachingRecommendation: coachingRecommendation || null,
        analyzedAt: new Date().toISOString()
      };
      
      console.log(`📊 Analysis extracted - Score: ${overallScore}, Risk: ${riskFlag}`);
      
      // Update call record with transcript and structured AI analysis
      const updatedCall = await storage.updateCallFromWebhook(callId, {
        transcript: transcript || null,
        aiAnalysis
      });
      
      if (!updatedCall) {
        return res.status(500).json({ error: "Failed to update call record" });
      }
      
      console.log(`💾 Call ${callId} updated with AI analysis`);
      
      res.json({
        success: true,
        call: updatedCall,
        aiAnalysis
      });
      
    } catch (error: any) {
      console.error("Error generating AI analysis:", error);
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return res.status(504).json({ error: "AI analysis request timed out. Please try again." });
      }
      
      res.status(500).json({ 
        error: "Failed to generate AI analysis",
        details: error.message 
      });
    }
  });

  // IVR Webhook - Receive call completion events
  app.post("/api/webhooks/ivr-call-events", async (req, res) => {
    try {
      console.log("========================================");
      console.log("IVR WEBHOOK RECEIVED AT:", new Date().toISOString());
      console.log("Raw payload:", JSON.stringify(req.body, null, 2));
      console.log("========================================");

      // Verify webhook secret if configured
      const webhookSecret = process.env.IVR_WEBHOOK_SECRET;
      if (webhookSecret) {
        const providedSecret = req.headers['x-webhook-secret'] || req.body.secret || req.body.secret_key;
        
        if (providedSecret !== webhookSecret) {
          console.error("❌ IVR webhook authentication failed");
          return res.status(401).json({ error: "Unauthorized" });
        }
      }

      // Parse webhook payload - handle all possible field name variations
      const {
        recordid,            // IVR Solutions uses this field name
        call_reference,      
        callReference,       
        call_status,         
        callStatus,
        status,
        call_duration,       // Duration in seconds
        callDuration,
        duration,
        recording_url,       
        recordingUrl,
        caller_number,       
        callerNumber,
        recipient_number,    
        recipientNumber,
        phone,
        customer_phone,
        customerPhone,
      } = req.body;

      // Normalize field names (support multiple formats)
      // Parse duration as integer if it's a string
      let parsedDuration = call_duration || callDuration || duration;
      if (typeof parsedDuration === 'string') {
        parsedDuration = parseInt(parsedDuration, 10);
      }

      const normalizedData = {
        callReference: recordid || call_reference || callReference,
        ivrStatus: call_status || callStatus || status,
        callDuration: parsedDuration,
        recordingUrl: recording_url || recordingUrl,
        recipientNumber: recipient_number || recipientNumber || phone || customer_phone || customerPhone,
        completedAt: new Date(),
        webhookData: req.body, // Store full payload for debugging
      };

      console.log("📋 Normalized webhook data:", JSON.stringify(normalizedData, null, 2));

      // Find the call record by reference
      let call;
      let lookupMethod = "none";
      
      if (normalizedData.callReference) {
        console.log(`🔍 Looking up call by reference: ${normalizedData.callReference}`);
        call = await storage.getCallByReference(normalizedData.callReference);
        
        if (call) {
          lookupMethod = "reference";
          console.log(`✅ Found call by reference: ${call.id}`);
        } else {
          console.log(`⚠️  No call found with reference: ${normalizedData.callReference}`);
        }
      }

      // Fallback: If not found by reference, try to find by customer phone (recent calls in last 10 minutes)
      if (!call && normalizedData.recipientNumber) {
        console.log(`🔍 Fallback: Looking up recent call by phone: ${normalizedData.recipientNumber}`);
        call = await storage.getRecentCallByPhone(normalizedData.recipientNumber, 10);
        
        if (call) {
          lookupMethod = "phone";
          console.log(`✅ Found recent call by phone: ${call.id}`);
        } else {
          console.log(`⚠️  No recent call found for phone: ${normalizedData.recipientNumber}`);
        }
      }

      if (call) {
        // Update the existing call record with webhook data
        const updateData: any = {
          callDuration: normalizedData.callDuration,
          recordingUrl: normalizedData.recordingUrl,
          callReference: normalizedData.callReference,
          recipientNumber: normalizedData.recipientNumber,
          ivrStatus: normalizedData.ivrStatus,
          completedAt: normalizedData.completedAt,
          webhookData: normalizedData.webhookData,
        };

        // Update call status based on IVR status
        if (normalizedData.ivrStatus) {
          const statusMap: Record<string, string> = {
            'completed': 'completed',
            'answered': 'completed',
            'success': 'completed',
            'failed': 'failed',
            'no-answer': 'failed',
            'busy': 'failed',
            'rejected': 'failed',
          };
          
          const mappedStatus = statusMap[normalizedData.ivrStatus.toLowerCase()];
          if (mappedStatus) {
            updateData.callStatus = mappedStatus;
          }
        }

        console.log(`💾 Updating call ${call.id} with data:`, JSON.stringify(updateData, null, 2));
        
        const updatedCall = await storage.updateCallFromWebhook(call.id, updateData);
        
        if (updatedCall) {
          console.log("✅ Successfully updated call record:", call.id);
          console.log(`   - Recording URL: ${updatedCall.recordingUrl || 'N/A'}`);
          console.log(`   - Duration: ${updatedCall.callDuration ? updatedCall.callDuration + 's' : 'N/A'}`);
          console.log(`   - Status: ${updatedCall.callStatus}`);
          console.log(`   - IVR Status: ${updatedCall.ivrStatus || 'N/A'}`);
          console.log(`   - Lookup method: ${lookupMethod}`);
          console.log("========================================");
          
          return res.json({ 
            success: true, 
            message: "Call event processed successfully",
            callId: call.id,
            lookupMethod,
            updated: {
              recordingUrl: !!updatedCall.recordingUrl,
              duration: !!updatedCall.callDuration,
              status: updatedCall.callStatus
            }
          });
        } else {
          console.error("❌ Failed to update call record - update returned null");
          console.log("========================================");
          
          return res.status(500).json({
            success: false,
            error: "Database update failed",
            callId: call.id
          });
        }
      } else {
        // Call not found - log for debugging
        console.error("❌ CALL NOT FOUND");
        console.log(`   - Attempted reference lookup: ${normalizedData.callReference || 'N/A'}`);
        console.log(`   - Attempted phone lookup: ${normalizedData.recipientNumber || 'N/A'}`);
        console.log(`   - Recording URL in payload: ${normalizedData.recordingUrl || 'N/A'}`);
        console.log(`   - Duration in payload: ${normalizedData.callDuration || 'N/A'}`);
        console.log("   - This call data will NOT be saved");
        console.log("========================================");
        
        // Still return success to prevent IVR provider from retrying
        return res.json({ 
          success: true, 
          message: "Webhook received but call record not found",
          note: "Call may not have been initiated through this system",
          searchedReference: normalizedData.callReference,
          searchedPhone: normalizedData.recipientNumber
        });
      }

    } catch (error: any) {
      console.error("Error processing IVR webhook:", error);
      
      // Still return 200 to prevent IVR provider from retrying
      // but log the error for debugging
      return res.status(200).json({ 
        success: false, 
        error: "Internal error processing webhook",
        message: error.message 
      });
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
  // SHIPROCKET API
  // ============================================================================

  // Import Shiprocket service (we'll add this at the top later)
  const { shiprocketService } = await import("./shiprocket");

  // Create shipment for confirmed order
  app.post("/api/shiprocket/orders/:id/create-shipment", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { weight, length, breadth, height, pickupLocation } = req.body;

      // Get order details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Check if order is confirmed
      if (!order.confirmedAt) {
        return res.status(400).json({ error: "Order must be confirmed before creating shipment" });
      }

      // Check if shipment already exists
      const existingShipment = await storage.getShipmentByOrderId(orderId);
      if (existingShipment) {
        return res.status(400).json({ error: "Shipment already exists for this order" });
      }

      // Get order items for shipment
      const orderItems = await storage.getOrderItems(orderId);

      // Prepare Shiprocket payload
      const shipmentPayload = {
        order_id: order.shopifyOrderNumber,
        order_date: order.shopifyCreatedAt.toISOString().split('T')[0],
        pickup_location: pickupLocation || "Primary",
        billing_customer_name: order.customerName.split(' ')[0] || order.customerName,
        billing_last_name: order.customerName.split(' ').slice(1).join(' ') || "",
        billing_address: order.shippingAddressLine1 || "",
        billing_address_2: order.shippingAddressLine2 || "",
        billing_city: order.shippingCity || "",
        billing_pincode: order.shippingPincode || "",
        billing_state: order.shippingState || "",
        billing_country: order.shippingCountry || "India",
        billing_email: order.customerEmail || "",
        billing_phone: order.customerPhone,
        shipping_is_billing: true,
        order_items: orderItems.map(item => ({
          name: item.productName,
          sku: item.sku || `SKU-${item.id}`,
          units: item.quantity,
          selling_price: item.price.toString(),
          discount: "0",
          tax: "0",
        })),
        payment_method: (order.paymentMethod.toLowerCase() === 'cod' ? 'COD' : 'Prepaid') as 'COD' | 'Prepaid',
        sub_total: parseFloat(order.subtotal.toString()),
        length: length || 10,
        breadth: breadth || 10,
        height: height || 10,
        weight: weight || 0.5,
      };

      // Create shipment in Shiprocket
      const shiprocketResponse = await shiprocketService.createShipment(shipmentPayload);

      // Store shipment in database
      const shipment = await storage.createShipment({
        orderId,
        shopifyOrderId: order.shopifyOrderId,
        shiprocketOrderId: shiprocketResponse.order_id?.toString(),
        shiprocketShipmentId: shiprocketResponse.shipment_id?.toString(),
        awb: shiprocketResponse.awb_code,
        courierName: shiprocketResponse.courier_name,
        courierId: shiprocketResponse.courier_company_id?.toString(),
        status: "created",
        weight: weight?.toString(),
        length: length?.toString(),
        breadth: breadth?.toString(),
        height: height?.toString(),
        rawShiprocketData: shiprocketResponse,
      });

      // Update order with shipment info
      await storage.updateOrder(orderId, {
        status: "shipped",
        courierName: shiprocketResponse.courier_name,
        trackingNumber: shiprocketResponse.awb_code,
      });

      res.json({ success: true, shipment });
    } catch (error: any) {
      console.error("Error creating shipment:", error);
      res.status(500).json({ error: error.message || "Failed to create shipment" });
    }
  });

  // Track shipment by AWB
  app.get("/api/shiprocket/shipments/:awb/track", async (req, res) => {
    try {
      const { awb } = req.params;

      // Get tracking data from Shiprocket
      const trackingData = await shiprocketService.trackShipment(awb);

      // Update shipment in database
      const shipment = await storage.getShipmentByAWB(awb);
      if (shipment && trackingData.tracking_data.shipment_track[0]) {
        const latestTrack = trackingData.tracking_data.shipment_track[0];
        await storage.updateShipment(shipment.id, {
          currentStatus: latestTrack.current_status,
          statusUpdatedAt: new Date(),
          deliveredAt: latestTrack.delivered_date ? new Date(latestTrack.delivered_date) : undefined,
        });
      }

      res.json({ success: true, trackingData });
    } catch (error: any) {
      console.error("Error tracking shipment:", error);
      res.status(500).json({ error: error.message || "Failed to track shipment" });
    }
  });

  // Get all NDR events (generic endpoint - supports both Shiprocket and Delhivery)
  // Enriches NDR events with order-level fields (nslCode, failureReason, lastFailedAt)
  // Get NDR events
  // SECURITY: Enforces agent-level read protection
  app.get("/api/ndr", async (req, res) => {
    try {
      const { limit, offset, currentUserId } = req.query;
      
      // SECURITY: Enforce agent-level read filter
      const authResult = await enforceAgentReadFilter(
        currentUserId as string | undefined,
        undefined
      );
      
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }

      // Get NDR events from database (all couriers) - filtered by agent if needed
      const result = await storage.listUnresolvedNDREvents({
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
        assignedTo: authResult.assignedTo, // Filter by agent if not admin
      });

      // Enrich each NDR event with order-level NDR fields
      const enrichedEvents = await Promise.all(
        result.events.map(async (event) => {
          const order = await storage.getOrder(event.orderId);
          return {
            ...event,
            // Order-level NDR fields from Delhivery webhook
            nslCode: order?.nslCode || null,
            failureReason: order?.failureReason || event.ndrReason,
            lastFailedAt: order?.lastFailedAt || event.ndrDate,
            // Additional order context for display
            shopifyOrderNumber: order?.shopifyOrderNumber,
            customerName: order?.customerName,
            customerPhone: order?.customerPhone,
          };
        })
      );

      res.json({ 
        events: enrichedEvents, 
        total: result.total 
      });
    } catch (error: any) {
      console.error("Error fetching NDR events:", error);
      res.status(500).json({ error: error.message || "Failed to fetch NDR events" });
    }
  });

  // Legacy route for backward compatibility
  app.get("/api/shiprocket/ndr", async (req, res) => {
    try {
      const { limit, offset } = req.query;
      const result = await storage.listUnresolvedNDREvents({
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching NDR events:", error);
      res.status(500).json({ error: error.message || "Failed to fetch NDR events" });
    }
  });

  // Reattempt delivery for NDR shipment (generic with courier switchboard)
  app.post("/api/ndr/:awb/reattempt", async (req, res) => {
    try {
      const { awb } = req.params;
      const { address1, address2, phone, deferredDate, actionBy, notes } = req.body;

      // Address and phone are now OPTIONAL - one-click reattempt support
      // If not provided, courier will use existing details on file

      // Get shipment to determine courier
      const shipment = await storage.getShipmentByAWB(awb);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Courier switchboard - route to appropriate service
      const courierName = shipment.courierName?.toLowerCase() || "";

      if (courierName.includes("delhivery")) {
        // Use Delhivery API - select correct action based on what's provided
        const { delhiveryService } = await import("./services/delhivery");
        
        const hasAddress = Boolean(address1 || address2);
        const hasPhone = Boolean(phone);
        const hasDate = Boolean(deferredDate);
        
        // Determine the correct action type:
        // - EDIT_DETAILS: Only when address or phone is provided
        // - DEFER_DLV: Only when date is provided (without address/phone changes)
        // - RE-ATTEMPT: Default when nothing is changed (one-click reattempt)
        let actionType: 'reattempt' | 'defer' | 'edit' = 'reattempt';
        const actionData: any = {};
        
        if (hasAddress || hasPhone) {
          // User wants to update delivery details
          actionType = 'edit';
          if (hasAddress) {
            actionData.address = [address1, address2].filter(Boolean).join(", ");
          }
          if (hasPhone) {
            actionData.phone = phone;
          }
        } else if (hasDate) {
          // User wants to defer delivery to a specific date
          actionType = 'defer';
          actionData.deferredDate = deferredDate;
        }
        // else: Use 'reattempt' (RE-ATTEMPT) - no action_data needed
        
        console.log(`[NDR Reattempt] AWB: ${awb}, Action: ${actionType}, Data:`, actionData);
        
        const result = await delhiveryService.actionNDR(awb, actionType, actionData);

        if (!result.success) {
          return res.status(500).json({ error: result.error || "Delhivery reattempt failed" });
        }
      } else {
        // Default to Shiprocket - only include fields if provided
        const shiprocketData: any = { awb };
        if (address1) shiprocketData.address1 = address1;
        if (address2) shiprocketData.address2 = address2;
        if (phone) shiprocketData.phone = phone;
        if (deferredDate) shiprocketData.deferred_date = deferredDate;
        
        const result = await shiprocketService.reattemptDelivery(shiprocketData);
      }

      // Get NDR events for this shipment
      const ndrEvents = await storage.getNDREventsByShipmentId(shipment.id);
      const latestNdr = ndrEvents[0];

      if (latestNdr) {
        // Update NDR event with reattempt info
        await storage.updateNDREvent(latestNdr.id, {
          actionTaken: "reattempt_scheduled",
          actionBy,
          actionNotes: notes,
          actionAt: new Date(),
          reattemptScheduled: true,
          reattemptDate: deferredDate ? new Date(deferredDate) : new Date(),
          updatedPhone: phone,
          updatedAddress: { address1, address2 },
        });
      }

      res.json({ success: true, message: "Reattempt scheduled successfully" });
    } catch (error: any) {
      console.error("Error scheduling reattempt:", error);
      res.status(500).json({ error: error.message || "Failed to schedule reattempt" });
    }
  });

  // Legacy route for backward compatibility
  app.post("/api/shiprocket/ndr/:awb/reattempt", async (req, res) => {
    try {
      const { awb } = req.params;
      const { address1, address2, phone, deferredDate, actionBy, notes } = req.body;

      if (!address1 || !phone) {
        return res.status(400).json({ error: "Address and phone are required" });
      }

      const shipment = await storage.getShipmentByAWB(awb);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }

      // Legacy route always uses Shiprocket
      const result = await shiprocketService.reattemptDelivery({
        awb,
        address1,
        address2,
        phone,
        deferred_date: deferredDate,
      });

      const ndrEvents = await storage.getNDREventsByShipmentId(shipment.id);
      const latestNdr = ndrEvents[0];

      if (latestNdr) {
        await storage.updateNDREvent(latestNdr.id, {
          actionTaken: "reattempt_scheduled",
          actionBy,
          actionNotes: notes,
          actionAt: new Date(),
          reattemptScheduled: true,
          reattemptDate: deferredDate ? new Date(deferredDate) : new Date(),
          updatedPhone: phone,
          updatedAddress: { address1, address2 },
        });
      }

      res.json({ success: true, message: "Reattempt scheduled successfully" });
    } catch (error: any) {
      console.error("Error scheduling reattempt:", error);
      res.status(500).json({ error: error.message || "Failed to schedule reattempt" });
    }
  });

  // Test Shiprocket connection
  app.get("/api/shiprocket/test-connection", async (req, res) => {
    try {
      const result = await shiprocketService.testConnection();
      res.json(result);
    } catch (error: any) {
      console.error("Error testing Shiprocket connection:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to test connection" 
      });
    }
  });

  // Get available courier partners for an order
  app.get("/api/orders/:id/couriers", async (req, res) => {
    try {
      const orderId = req.params.id;

      // Get order details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Try to get existing shipment from local DB by orderId
      let shipment = await storage.getShipmentByOrderId(orderId);
      let shiprocketShipmentId: number | null = null;
      let shiprocketOrderId: number | null = null;

      if (shipment && shipment.shiprocketShipmentId) {
        // We have local shipment record with Shiprocket ID
        shiprocketShipmentId = parseInt(shipment.shiprocketShipmentId);
        shiprocketOrderId = shipment.shiprocketOrderId ? parseInt(shipment.shiprocketOrderId) : null;
      }
      
      // If we don't have both IDs, fetch from Shiprocket
      if (!shiprocketShipmentId || !shiprocketOrderId) {
        const shiprocketOrder = await shiprocketService.getOrderDetails(order.shopifyOrderNumber);
        
        if (!shiprocketOrder) {
          return res.status(404).json({ 
            error: "Order not found in Shiprocket. Please ensure the order has been synced from Shopify." 
          });
        }

        shiprocketShipmentId = shiprocketOrder.shipment_id;
        shiprocketOrderId = shiprocketOrder.order_id;

        // CRITICAL: Check if ANY shipment with this Shiprocket ID already exists (from any order)
        const existingShipmentByShiprocketId = await storage.getShipmentByShiprocketShipmentId(shiprocketShipmentId.toString());
        
        if (existingShipmentByShiprocketId) {
          // Reuse the existing shipment record (prevents duplicate key error)
          shipment = existingShipmentByShiprocketId;
          // Update with Shiprocket IDs if missing
          if (!existingShipmentByShiprocketId.shiprocketOrderId) {
            await storage.updateShipment(existingShipmentByShiprocketId.id, {
              shiprocketOrderId: shiprocketOrderId.toString(),
            });
          }
        } else if (shipment) {
          // We have a shipment by orderId but no Shiprocket IDs yet - update it
          await storage.updateShipment(shipment.id, {
            shiprocketShipmentId: shiprocketShipmentId.toString(),
            shiprocketOrderId: shiprocketOrderId.toString(),
          });
        } else {
          // No existing shipment at all - create new one
          shipment = await storage.createShipment({
            orderId,
            shopifyOrderId: order.shopifyOrderNumber,
            shiprocketShipmentId: shiprocketShipmentId.toString(),
            shiprocketOrderId: shiprocketOrderId.toString(),
            status: "created",
            weight: "0.5", // Default weight (will be overridden by Shiprocket data)
          });
        }
      }

      // Use shipment-specific courier fetching with actual Shiprocket data
      // Pass the Shiprocket order_id to get exact courier recommendations
      const couriers = await shiprocketService.getCouriersForShipment(shiprocketShipmentId, shiprocketOrderId || undefined);

      res.json({ couriers, shipmentId: shiprocketShipmentId });
    } catch (error: any) {
      console.error("Error fetching available couriers:", error);
      res.status(500).json({ error: error.message || "Failed to fetch available couriers" });
    }
  });

  // Ship order via Shiprocket
  // SECURITY: Write protection - agents can only ship their assigned orders
  app.post("/api/orders/:id/ship", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { courierId, userId } = req.body;

      if (!courierId) {
        return res.status(400).json({ error: "Courier ID is required" });
      }
      
      // SECURITY: userId is REQUIRED for authorization
      if (!userId) {
        return res.status(400).json({ error: "userId is required for authorization" });
      }
      
      // SECURITY: Verify user can modify this order (admin or assigned agent)
      const authCheck = await canUserModifyOrder(userId, orderId);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }

      // Get order
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Try to get existing shipment from local DB by orderId
      let shipment = await storage.getShipmentByOrderId(orderId);
      let shiprocketShipmentId: number | null = null;
      let shiprocketOrderId: number | null = null;

      if (shipment && shipment.shiprocketShipmentId) {
        // We have local shipment record with Shiprocket ID
        shiprocketShipmentId = parseInt(shipment.shiprocketShipmentId);
        shiprocketOrderId = shipment.shiprocketOrderId ? parseInt(shipment.shiprocketOrderId) : null;
      }
      
      // If we don't have both IDs, fetch from Shiprocket
      if (!shiprocketShipmentId || !shiprocketOrderId) {
        const shiprocketOrder = await shiprocketService.getOrderDetails(order.shopifyOrderNumber);
        
        if (!shiprocketOrder) {
          return res.status(404).json({ 
            error: "Order not found in Shiprocket. Please ensure the order has been synced from Shopify." 
          });
        }

        shiprocketShipmentId = shiprocketOrder.shipment_id;
        shiprocketOrderId = shiprocketOrder.order_id;

        // CRITICAL: Check if ANY shipment with this Shiprocket ID already exists (from any order)
        const existingShipmentByShiprocketId = await storage.getShipmentByShiprocketShipmentId(shiprocketShipmentId.toString());
        
        if (existingShipmentByShiprocketId) {
          // Reuse the existing shipment record (prevents duplicate key error)
          shipment = existingShipmentByShiprocketId;
          // Update with Shiprocket IDs if missing
          if (!existingShipmentByShiprocketId.shiprocketOrderId) {
            await storage.updateShipment(existingShipmentByShiprocketId.id, {
              shiprocketOrderId: shiprocketOrderId.toString(),
            });
          }
        } else if (shipment) {
          // We have a shipment by orderId but no Shiprocket IDs yet - update it
          await storage.updateShipment(shipment.id, {
            shiprocketShipmentId: shiprocketShipmentId.toString(),
            shiprocketOrderId: shiprocketOrderId.toString(),
          });
        } else {
          // No existing shipment at all - create new one
          shipment = await storage.createShipment({
            orderId,
            shopifyOrderId: order.shopifyOrderNumber,
            shiprocketShipmentId: shiprocketShipmentId.toString(),
            shiprocketOrderId: shiprocketOrderId.toString(),
            status: "created",
            weight: "0.5", // Default weight (will be overridden by Shiprocket data)
          });
        }
      }

      // Ensure we have a shipment record
      if (!shipment) {
        return res.status(500).json({ error: "Failed to create or retrieve shipment record" });
      }

      // Check if AWB is already assigned
      if (shipment.awb) {
        return res.status(400).json({ error: "This shipment already has an AWB assigned" });
      }

      // Assign courier and get AWB from Shiprocket
      const assignmentResult = await shiprocketService.assignCourierAndShip({
        shipment_id: shiprocketShipmentId!,
        courier_id: parseInt(courierId),
      });

      // Check for Shiprocket error response (they sometimes return errors with HTTP 200)
      if ((assignmentResult as any).message) {
        throw new Error((assignmentResult as any).message);
      }

      // Validate response data
      if (!assignmentResult.response?.data) {
        // Check if there's an error message in the response
        const errorMessage = (assignmentResult as any).errors || (assignmentResult as any).error || "Invalid response from Shiprocket";
        throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      }

      const awbCode = assignmentResult.response.data.awb_code;
      const courierName = assignmentResult.response.data.courier_name;
      const pickupDate = assignmentResult.response.data.pickup_scheduled_date;

      if (!awbCode) {
        // Check for error message in response before using generic fallback
        const errorMessage = (assignmentResult as any).message || (assignmentResult as any).error || "AWB code not received from Shiprocket";
        throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      }

      // Update local shipment with AWB and courier info
      await storage.updateShipment(shipment.id, {
        awb: awbCode,
        courierName: courierName,
        courierId: assignmentResult.response.data.courier_company_id.toString(),
        pickupScheduledDate: new Date(pickupDate),
        status: "pickup_scheduled",
      });

      res.json({
        success: true,
        awb: awbCode,
        courierName: courierName,
        pickupScheduledDate: pickupDate,
      });
    } catch (error: any) {
      console.error("Error assigning courier:", error);
      res.status(500).json({ error: error.message || "Failed to assign courier" });
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
      
      // Check if user already exists with this email
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        if (existingUser.isActive) {
          // User is active - return clear error
          return res.status(409).json({ error: "This user is already active in the system" });
        } else {
          // User exists but is inactive - reactivate them
          const reactivatedUser = await storage.reactivateUser(existingUser.id, {
            role: validatedData.role,
            adminType: null,
            permissions: null,
          });
          
          console.log(`✅ Reactivated user ${validatedData.email}`);
          return res.json({
            message: "User reactivated successfully",
            reactivated: true,
            user: {
              id: reactivatedUser.id,
              email: reactivatedUser.email,
              role: reactivatedUser.role,
            }
          });
        }
      }
      
      // Generate unique invite token
      const token = Array.from({ length: 32 }, () => 
        Math.random().toString(36).charAt(2)
      ).join('');
      
      // Set expiration to 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      
      // Check if an invite already exists for this email (any status)
      const existingInvite = await storage.getInviteByEmail(validatedData.email);
      let invite;
      
      if (existingInvite) {
        // Reset the existing invite instead of creating a new one
        invite = await storage.resetInviteForResend(validatedData.email, {
          token,
          expiresAt,
          role: validatedData.role,
          invitedBy,
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
        });
        console.log(`♻️ Reset existing invite for ${validatedData.email}`);
      } else {
        // Create new invite
        invite = await storage.createInvite({
          ...validatedData,
          token,
          expiresAt,
          invitedBy,
        });
        console.log(`📧 Created new invite for ${validatedData.email}`);
      }
      
      // Send invitation email via Resend
      try {
        await sendInvitationEmail({
          toEmail: validatedData.email,
          inviterName: currentUser.fullName || currentUser.email,
          role: validatedData.role,
          inviteToken: token,
          expiresAt,
        });
        console.log(`✅ Invitation email sent to ${validatedData.email}`);
      } catch (emailError) {
        console.error("Error sending invitation email:", emailError);
        // Don't fail the invite creation if email fails - just log it
      }
      
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

  // Test Resend connection
  app.post("/api/test-resend", async (req, res) => {
    try {
      const { toEmail } = req.body;
      
      if (!toEmail) {
        return res.status(400).json({ error: "toEmail is required" });
      }

      console.log(`🧪 Testing Resend connection, sending to: ${toEmail}`);
      
      await sendInvitationEmail({
        toEmail,
        inviterName: "Test User",
        role: "agent",
        inviteToken: "test-token-12345",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      console.log(`✅ Test email sent successfully to ${toEmail}`);
      res.json({ success: true, message: "Test email sent successfully" });
    } catch (error) {
      console.error("❌ Test email failed:", error);
      res.status(500).json({ 
        error: "Failed to send test email", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Verify invite token (used by signup page)
  app.get("/api/invites/verify/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      const invite = await storage.getInviteByToken(token);

      if (!invite) {
        return res.status(404).json({ error: "Invalid invite token" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ 
          error: "This invitation has already been used",
          status: invite.status 
        });
      }

      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ error: "This invitation has expired" });
      }

      res.json({
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        role: invite.role,
        adminType: invite.adminType,
        permissions: invite.permissions,
      });
    } catch (error) {
      console.error("Error verifying invite:", error);
      res.status(500).json({ error: "Failed to verify invite" });
    }
  });

  // Accept invite and create user account
  app.post("/api/invites/accept", async (req, res) => {
    try {
      const { token, username, password, fullName, phone } = req.body;

      if (!token || !username || !password || !fullName) {
        return res.status(400).json({ 
          error: "Token, username, password, and full name are required" 
        });
      }

      const invite = await storage.getInviteByToken(token);

      if (!invite) {
        return res.status(404).json({ error: "Invalid invite token" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ 
          error: "This invitation has already been used",
          status: invite.status 
        });
      }

      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ error: "This invitation has expired" });
      }

      const existingUser = await storage.getUserByEmail(invite.email);
      if (existingUser) {
        return res.status(400).json({ error: "A user with this email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ error: "This username is already taken" });
      }

      const newUser = await storage.createUser({
        email: invite.email,
        username,
        password,
        fullName,
        phone: phone || null,
        role: invite.role,
        adminType: invite.adminType || null,
        permissions: invite.permissions || null,
        department: null,
      });

      await storage.updateInviteStatus(invite.id, 'accepted');

      res.json({
        message: "Account created successfully",
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          fullName: newUser.fullName,
          role: newUser.role,
        },
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ error: "Failed to create account" });
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
  // LEARNING CENTER API
  // ============================================================================

  // List all courses (with optional filters)
  app.get("/api/learning/courses", async (req, res) => {
    try {
      const { category, isPublished } = req.query;
      
      // If isPublished is not specified, default to showing only published courses
      // Admins can pass isPublished=all to see all courses
      let publishedFilter: boolean | undefined;
      if (isPublished === 'all') {
        publishedFilter = undefined; // Show all
      } else if (isPublished === 'false') {
        publishedFilter = false;
      } else if (isPublished === 'true') {
        publishedFilter = true;
      } else {
        publishedFilter = true; // Default: only published
      }
      
      const courses = await storage.listCourses({
        category: category as string | undefined,
        isPublished: publishedFilter,
      });

      // Get user's progress for each course (if user is logged in)
      const userId = req.query.userId as string;
      const coursesWithProgress = await Promise.all(
        courses.map(async (course) => {
          if (!userId) return course;
          
          const progress = await storage.getUserCourseProgress(userId, course.id);
          return { ...course, progress };
        })
      );

      res.json({ courses: coursesWithProgress });
    } catch (error) {
      console.error("Error listing courses:", error);
      res.status(500).json({ error: "Failed to fetch courses" });
    }
  });

  // Get course by slug
  app.get("/api/learning/courses/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const userId = req.query.userId as string;
      
      const course = await storage.getCourseBySlug(slug);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Get lessons for this course (only published lessons for students)
      const lessons = await storage.getLessonsByCourse(course.id, true);

      // Get user's progress if logged in
      let userProgress = null;
      let lessonProgress: any[] = [];
      
      if (userId) {
        userProgress = await storage.getUserCourseProgress(userId, course.id);
        
        // Get progress for each lesson
        lessonProgress = await Promise.all(
          lessons.map(async (lesson) => {
            const progress = await storage.getUserLessonProgress(userId, lesson.id);
            return progress || null;
          })
        );
      }

      res.json({
        course,
        lessons,
        userProgress,
        lessonProgress,
      });
    } catch (error) {
      console.error("Error fetching course:", error);
      res.status(500).json({ error: "Failed to fetch course" });
    }
  });

  // Get lesson by slug
  app.get("/api/learning/lessons/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const userId = req.query.userId as string;
      
      const lesson = await storage.getLessonBySlug(slug);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Get course info
      const course = await storage.getCourse(lesson.courseId);

      // Get user's progress if logged in
      let userProgress = null;
      if (userId) {
        userProgress = await storage.getUserLessonProgress(userId, lesson.id);
        
        // Increment view count
        await storage.incrementLessonView(lesson.id, userId);
      }

      // Get lesson analytics
      const analytics = await storage.getLessonAnalytics(lesson.id);

      res.json({
        lesson,
        course,
        userProgress,
        analytics,
      });
    } catch (error) {
      console.error("Error fetching lesson:", error);
      res.status(500).json({ error: "Failed to fetch lesson" });
    }
  });

  // Update lesson progress
  app.post("/api/learning/lessons/:lessonId/progress", async (req, res) => {
    try {
      const { lessonId } = req.params;
      const { userId, completionPercentage, timeSpent, videoProgress, isCompleted } = req.body;

      if (!userId || !lessonId) {
        return res.status(400).json({ error: "userId and lessonId are required" });
      }

      // Only include fields that are actually provided in the request
      const updateData: any = {
        userId,
        lessonId,
        lastAccessedAt: new Date(),
      };

      if (completionPercentage !== undefined) {
        updateData.completionPercentage = completionPercentage;
      }
      if (timeSpent !== undefined) {
        updateData.timeSpent = timeSpent;
      }
      if (videoProgress !== undefined) {
        updateData.videoProgress = videoProgress;
      }
      if (isCompleted !== undefined) {
        updateData.isCompleted = isCompleted;
        if (isCompleted) {
          updateData.completedAt = new Date();
        }
      }

      const progress = await storage.createOrUpdateLessonProgress(updateData);

      res.json({ progress });
    } catch (error) {
      console.error("Error updating progress:", error);
      res.status(500).json({ error: "Failed to update progress" });
    }
  });

  // Toggle bookmark
  app.post("/api/learning/lessons/:lessonId/bookmark", async (req, res) => {
    try {
      const { lessonId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const progress = await storage.toggleBookmark(userId, lessonId);
      res.json({ progress });
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      res.status(500).json({ error: "Failed to toggle bookmark" });
    }
  });

  // List resources
  app.get("/api/learning/resources", async (req, res) => {
    try {
      const { type, category } = req.query;
      
      const resources = await storage.listResources({
        type: type as string | undefined,
        category: category as string | undefined,
      });

      res.json({ resources });
    } catch (error) {
      console.error("Error listing resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  // Download resource (increment download count)
  app.post("/api/learning/resources/:resourceId/download", async (req, res) => {
    try {
      const { resourceId } = req.params;
      
      await storage.incrementResourceDownload(resourceId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking download:", error);
      res.status(500).json({ error: "Failed to track download" });
    }
  });

  // Get user's onboarding progress
  app.get("/api/learning/onboarding/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      
      const progress = await storage.getUserOnboardingProgress(userId);
      
      if (!progress) {
        // Auto-assign checklist based on user role
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const checklist = await storage.getOnboardingChecklistByRole(user.role);
        if (checklist) {
          const newProgress = await storage.createUserOnboardingProgress({
            userId,
            checklistId: checklist.id,
            progress: {},
            completionPercentage: 0,
          });

          return res.json({ progress: newProgress, checklist });
        }

        return res.json({ progress: null, checklist: null });
      }

      // Get checklist details
      const checklist = await storage.getOnboardingChecklist(progress.checklistId);

      res.json({ progress, checklist });
    } catch (error) {
      console.error("Error fetching onboarding progress:", error);
      res.status(500).json({ error: "Failed to fetch onboarding progress" });
    }
  });

  // Admin: Get course by ID
  app.get("/api/admin/learning/courses/:courseId", async (req, res) => {
    try {
      const { courseId } = req.params;
      const course = await storage.getCourse(courseId);
      
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json({ course });
    } catch (error) {
      console.error("Error fetching course:", error);
      res.status(500).json({ error: "Failed to fetch course" });
    }
  });

  // Admin: Get lessons in a course
  app.get("/api/admin/learning/courses/:courseId/lessons", async (req, res) => {
    try {
      const { courseId } = req.params;
      const lessons = await storage.getLessonsByCourse(courseId);
      res.json({ lessons });
    } catch (error) {
      console.error("Error fetching lessons:", error);
      res.status(500).json({ error: "Failed to fetch lessons" });
    }
  });

  // Admin: Create course
  app.post("/api/admin/learning/courses", async (req, res) => {
    try {
      const course = await storage.createCourse(req.body);
      res.json({ course });
    } catch (error) {
      console.error("Error creating course:", error);
      res.status(500).json({ error: "Failed to create course" });
    }
  });

  // Admin: Update course
  app.patch("/api/admin/learning/courses/:courseId", async (req, res) => {
    try {
      const { courseId } = req.params;
      const course = await storage.updateCourse(courseId, req.body);
      
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json({ course });
    } catch (error) {
      console.error("Error updating course:", error);
      res.status(500).json({ error: "Failed to update course" });
    }
  });

  // Admin: Delete course
  app.delete("/api/admin/learning/courses/:courseId", async (req, res) => {
    try {
      const { courseId } = req.params;
      await storage.deleteCourse(courseId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting course:", error);
      res.status(500).json({ error: "Failed to delete course" });
    }
  });

  // Admin: Get lesson by ID
  app.get("/api/admin/learning/lessons/:lessonId", async (req, res) => {
    try {
      const { lessonId } = req.params;
      const lesson = await storage.getLesson(lessonId);
      
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      res.json({ lesson });
    } catch (error) {
      console.error("Error fetching lesson:", error);
      res.status(500).json({ error: "Failed to fetch lesson" });
    }
  });

  // Admin: Create lesson
  app.post("/api/admin/learning/lessons", async (req, res) => {
    try {
      const lesson = await storage.createLesson(req.body);
      res.json({ lesson });
    } catch (error) {
      console.error("Error creating lesson:", error);
      res.status(500).json({ error: "Failed to create lesson" });
    }
  });

  // Admin: Update lesson
  app.patch("/api/admin/learning/lessons/:lessonId", async (req, res) => {
    try {
      const { lessonId } = req.params;
      const lesson = await storage.updateLesson(lessonId, req.body);
      
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      res.json({ lesson });
    } catch (error) {
      console.error("Error updating lesson:", error);
      res.status(500).json({ error: "Failed to update lesson" });
    }
  });

  // Admin: Create resource
  app.post("/api/admin/learning/resources", async (req, res) => {
    try {
      const resource = await storage.createResource(req.body);
      res.json({ resource });
    } catch (error) {
      console.error("Error creating resource:", error);
      res.status(500).json({ error: "Failed to create resource" });
    }
  });

  // ============================================================================
  // ANALYTICS API
  // ============================================================================

  // RTO Insights Dashboard
  // GET /api/analytics/rto-insights
  // Returns KPIs, weekly cohorts, and top offenders for RTO analysis
  // Accepts optional startDate and endDate query params (ISO strings)
  // If dates are missing/empty, returns ALL orders (All Time)
  app.get("/api/analytics/rto-insights", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      // Parse dates if provided (null/empty = All Time)
      const startDateParsed = startDate && typeof startDate === 'string' && startDate.trim() 
        ? new Date(startDate) 
        : null;
      const endDateParsed = endDate && typeof endDate === 'string' && endDate.trim() 
        ? new Date(endDate) 
        : null;
      
      // Build query conditions
      const conditions = [];
      if (startDateParsed && !isNaN(startDateParsed.getTime())) {
        conditions.push(gte(orders.createdAt, startDateParsed));
      }
      if (endDateParsed && !isNaN(endDateParsed.getTime())) {
        conditions.push(lte(orders.createdAt, endDateParsed));
      }
      
      // Query orders (with optional date filter)
      const allOrders = conditions.length > 0
        ? await db.select({
            id: orders.id,
            status: orders.status,
            shipmentStatus: orders.shipmentStatus,
            totalPrice: orders.totalPrice,
            shippingCity: orders.shippingCity,
            courierName: orders.courierName,
            assignedTo: orders.assignedTo,
            createdAt: orders.createdAt,
            fulfillmentStatus: orders.fulfillmentStatus,
          }).from(orders).where(and(...conditions))
        : await db.select({
            id: orders.id,
            status: orders.status,
            shipmentStatus: orders.shipmentStatus,
            totalPrice: orders.totalPrice,
            shippingCity: orders.shippingCity,
            courierName: orders.courierName,
            assignedTo: orders.assignedTo,
            createdAt: orders.createdAt,
            fulfillmentStatus: orders.fulfillmentStatus,
          }).from(orders);

      // Filter for shipped orders (has tracking info or fulfillment status indicates shipped)
      const shippedOrders = allOrders.filter(o => 
        o.fulfillmentStatus === 'fulfilled' || 
        o.fulfillmentStatus === 'partial' ||
        o.shipmentStatus
      );

      // Master flag: Order is RTO using the normalized status values
      // status = 'rto_initiated' or 'rto_delivered' (from normalizeDelhivery)
      // OR shipmentStatus = 'RTO' (legacy / display value)
      const rtoOrders = allOrders.filter(o => 
        o.status === 'rto_initiated' || 
        o.status === 'rto_delivered' ||
        o.shipmentStatus?.toUpperCase() === 'RTO'
      );

      // Stage 1: RTO In-Transit (Returning) - status = 'rto_initiated'
      const rtoInTransit = rtoOrders.filter(o => 
        o.status === 'rto_initiated'
      );

      // Stage 2: RTO Delivered (Returned) - status = 'rto_delivered'
      const rtoDelivered = rtoOrders.filter(o => 
        o.status === 'rto_delivered'
      );

      // KPI Calculations
      const totalShipped = shippedOrders.length;
      const totalRtoCount = rtoOrders.length;
      const overallRtoRate = totalShipped > 0 
        ? Math.round((totalRtoCount / totalShipped) * 10000) / 100 
        : 0;

      // Revenue loss calculation - sum of ALL RTO orders (not just delivered)
      const rtoRevenueLoss = rtoOrders.reduce((sum, o) => {
        const price = parseFloat(o.totalPrice?.toString() || '0');
        return sum + price;
      }, 0);

      // Weekly Cohorts - Group by creation week (Year-Week format for clarity)
      const weekCohorts: Record<string, { in_transit_count: number; delivered_count: number; sortKey: number }> = {};
      
      rtoOrders.forEach(o => {
        if (!o.createdAt) return;
        
        const date = new Date(o.createdAt);
        const year = date.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const weekNumber = Math.ceil(
          ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
        );
        const weekKey = `${year} W${weekNumber}`;
        const sortKey = year * 100 + weekNumber; // For proper sorting
        
        if (!weekCohorts[weekKey]) {
          weekCohorts[weekKey] = { in_transit_count: 0, delivered_count: 0, sortKey };
        }
        
        // Stage 2 (Delivered): status = 'RTO' or 'Returned'
        const isDelivered = o.status?.toUpperCase() === 'RTO' || o.status?.toLowerCase() === 'returned';
        if (isDelivered) {
          weekCohorts[weekKey].delivered_count++;
        } else {
          // Stage 1 (In-Transit): status is NOT 'RTO'
          weekCohorts[weekKey].in_transit_count++;
        }
      });

      const weeklyCohorts = Object.entries(weekCohorts)
        .map(([week, { in_transit_count, delivered_count, sortKey }]) => ({ 
          week, 
          in_transit_count, 
          delivered_count 
        }))
        .sort((a, b) => {
          // Extract sortKey from week format "YYYY WX"
          const [yearA, weekA] = a.week.split(' W').map(Number);
          const [yearB, weekB] = b.week.split(' W').map(Number);
          return (yearA * 100 + weekA) - (yearB * 100 + weekB);
        });

      // Top Offenders - Cities
      const cityCounts: Record<string, number> = {};
      rtoOrders.forEach(o => {
        const city = o.shippingCity || 'Unknown';
        cityCounts[city] = (cityCounts[city] || 0) + 1;
      });
      const topCities = Object.entries(cityCounts)
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top Offenders - Couriers
      const courierCounts: Record<string, number> = {};
      rtoOrders.forEach(o => {
        const courier = o.courierName || 'Unknown';
        courierCounts[courier] = (courierCounts[courier] || 0) + 1;
      });
      const topCouriers = Object.entries(courierCounts)
        .map(([courier, count]) => ({ courier, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top Offenders - Agents (need to join with users for names)
      const agentCounts: Record<string, number> = {};
      rtoOrders.forEach(o => {
        if (o.assignedTo) {
          agentCounts[o.assignedTo] = (agentCounts[o.assignedTo] || 0) + 1;
        }
      });
      
      // Get agent names
      const agentIds = Object.keys(agentCounts);
      const agentUsers = agentIds.length > 0 
        ? await db.select({ id: users.id, name: users.fullName })
            .from(users)
            .where(sql`${users.id} = ANY(${agentIds})`)
        : [];
      
      const agentNameMap = new Map(agentUsers.map(u => [u.id, u.name]));
      
      const topAgents = Object.entries(agentCounts)
        .map(([agentId, count]) => ({ 
          agent_id: agentId,
          agent_name: agentNameMap.get(agentId) || 'Unknown Agent',
          count 
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      res.json({
        kpis: {
          overall_rto_rate: overallRtoRate,
          total_rto_count: totalRtoCount,
          rto_in_transit_count: rtoInTransit.length,
          rto_delivered_count: rtoDelivered.length,
          rto_revenue_loss: Math.round(rtoRevenueLoss * 100) / 100,
          total_shipped: totalShipped,
        },
        weekly_cohorts: weeklyCohorts,
        top_offenders: {
          top_cities: topCities,
          top_couriers: topCouriers,
          top_agents: topAgents,
        },
      });
    } catch (error) {
      console.error("Error fetching RTO insights:", error);
      res.status(500).json({ error: "Failed to fetch RTO insights" });
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
            message: `Order #${order.shopifyOrderNumber} follow-up is due`,
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

  // ============================================================================
  // WEBHOOK ENGINE CRUD
  // ============================================================================

  app.get("/api/webhooks-config", async (_req, res) => {
    try {
      const allWebhooks = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
      res.json(allWebhooks);
    } catch (error) {
      console.error("Error fetching webhooks:", error);
      res.status(500).json({ error: "Failed to fetch webhooks" });
    }
  });

  app.post("/api/webhooks-config", async (req, res) => {
    try {
      const data = insertWebhookSchema.parse(req.body);
      const [webhook] = await db.insert(webhooks).values(data).returning();
      res.status(201).json(webhook);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating webhook:", error);
      res.status(500).json({ error: "Failed to create webhook" });
    }
  });

  app.delete("/api/webhooks-config/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid webhook ID" });
      await db.delete(webhooks).where(eq(webhooks.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting webhook:", error);
      res.status(500).json({ error: "Failed to delete webhook" });
    }
  });

  // ============================================================================
  // TELECRM WEBHOOK LISTENER
  // ============================================================================

  app.post("/api/webhooks/telecrm", async (req, res) => {
    try {
      const payload = req.body;
      const eventType = payload?.event || payload?.type || payload?.event_type || null;
      await storage.createInboundWebhookLog({
        source: "telecrm",
        eventType: typeof eventType === "string" ? eventType : null,
        payload,
      });
      console.log("TeleCRM webhook received and logged:", eventType || "unknown event");
    } catch (err) {
      console.error("Error saving TeleCRM webhook log:", err);
    }
    res.status(200).json({ success: true });
  });

  app.get("/api/webhook-logs", async (_req, res) => {
    try {
      const logs = await storage.getInboundWebhookLogs(50);
      res.json(logs);
    } catch (err) {
      console.error("Error fetching webhook logs:", err);
      res.status(500).json({ error: "Failed to fetch webhook logs" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

