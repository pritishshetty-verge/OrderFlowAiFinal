import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// USERS & AUTHENTICATION
// ============================================================================

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("agent"), // admin, agent
  adminType: text("admin_type"), // full_control, partial_control (nullable, only for admins)
  permissions: jsonb("permissions"), // Custom permissions for partial_control admins
  department: text("department").default("Operations"),
  employeeId: text("employee_id").unique(),
  agentExtension: varchar("agent_extension", { length: 10 }), // IVR phone extension for agents
  presenceStatus: text("presence_status").notNull().default("present"), // present, onleave, inactive
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  adminType: true,
  permissions: true,
  department: true,
  agentExtension: true,
});

export const updateUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  adminType: true,
  permissions: true,
  department: true,
  employeeId: true,
  agentExtension: true,
  presenceStatus: true,
  isActive: true,
}).partial();

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================================================
// PERMISSION TYPES
// ============================================================================

export type AdminPermissions = {
  teamManagement?: {
    viewDirectory?: boolean;
    editProfiles?: boolean;
    assignExtensions?: boolean;
    manageLeaveRequests?: boolean;
  };
  orderManagement?: {
    viewAllOrders?: boolean;
    assignOrders?: boolean;
    bulkAssign?: boolean;
    triggerAutoAssignment?: boolean;
  };
  analytics?: {
    viewTeamPerformance?: boolean;
    viewOrderAnalytics?: boolean;
    exportReports?: boolean;
  };
  settings?: {
    manageShopify?: boolean;
    manageIVR?: boolean;
    configureWebhooks?: boolean;
  };
};

export const DEFAULT_MANAGER_PERMISSIONS: AdminPermissions = {
  teamManagement: {
    viewDirectory: true,
    editProfiles: true,
    assignExtensions: false,
    manageLeaveRequests: true,
  },
  orderManagement: {
    viewAllOrders: true,
    assignOrders: true,
    bulkAssign: false,
    triggerAutoAssignment: true,
  },
  analytics: {
    viewTeamPerformance: true,
    viewOrderAnalytics: true,
    exportReports: true,
  },
  settings: {
    manageShopify: false,
    manageIVR: false,
    configureWebhooks: false,
  },
};

// ============================================================================
// USER INVITATIONS
// ============================================================================

export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default("agent"), // admin, agent
  adminType: text("admin_type"), // full_control, partial_control (nullable, only for admins)
  permissions: jsonb("permissions"), // Custom permissions for partial_control admins
  token: text("token").notNull().unique(), // Unique token for invite link
  invitedBy: varchar("invited_by").references(() => users.id),
  status: text("status").notNull().default("pending"), // pending, accepted, expired
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInviteSchema = createInsertSchema(invites).pick({
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  adminType: true,
  permissions: true,
}).extend({
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["admin", "agent"]).default("agent"),
  adminType: z.enum(["full_control", "partial_control"]).optional(),
  permissions: z.record(z.any()).optional(),
});

// Note: adminType and permissions are now configured in a separate step via PATCH /api/invites/:id/permissions
// This allows for a cleaner two-modal invite flow where permissions are configured after the invite is sent

export type InsertInvite = z.infer<typeof insertInviteSchema>;
export type Invite = typeof invites.$inferSelect;

// ============================================================================
// CUSTOMERS
// ============================================================================

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyCustomerId: text("shopify_customer_id").unique(),
  email: text("email"),
  phone: text("phone"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  totalOrders: integer("total_orders").default(0),
  totalSpent: decimal("total_spent", { precision: 12, scale: 2 }).default("0"),
  tags: text("tags").array(),
  metadata: jsonb("metadata"), // Additional Shopify customer data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// ============================================================================
// ORDERS
// ============================================================================

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyOrderId: text("shopify_order_id").notNull().unique(),
  shopifyOrderNumber: text("shopify_order_number").notNull(),
  customerId: varchar("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone").notNull(),
  
  // Order details
  status: text("status").notNull().default("pending"), // pending, assigned, confirmed, shipped, delivered, cancelled, ndr
  callStatus: text("call_status").notNull().default("Pending"), // Pending, Confirmed, Cancelled, Follow Up
  fulfillmentStatus: text("fulfillment_status"), // Shopify fulfillment status
  fulfilledAt: timestamp("fulfilled_at"),
  financialStatus: text("financial_status"), // Shopify financial status
  paymentMethod: text("payment_method").notNull(), // prepaid, cod
  
  // Call status tracking
  confirmedAt: timestamp("confirmed_at"),
  confirmedBy: varchar("confirmed_by").references(() => users.id),
  confirmedNotes: text("confirmed_notes"),
  
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by").references(() => users.id),
  cancelledReason: text("cancelled_reason"),
  cancelledNotes: text("cancelled_notes"),
  
  followupAt: timestamp("followup_at"),
  followupNotes: text("followup_notes"),
  followUpAttempts: integer("follow_up_attempts").default(0),
  
  // Amounts
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  totalTax: decimal("total_tax", { precision: 12, scale: 2 }).default("0"),
  totalDiscount: decimal("total_discount", { precision: 12, scale: 2 }).default("0"),
  discountCode: text("discount_code"),
  shippingPrice: decimal("shipping_price", { precision: 12, scale: 2 }).default("0"),
  currency: text("currency").notNull().default("INR"),
  
  // Shipping address
  shippingAddress: jsonb("shipping_address"), // Full address object
  shippingAddressLine1: text("shipping_address_line1"),
  shippingAddressLine2: text("shipping_address_line2"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingPincode: text("shipping_pincode"),
  shippingCountry: text("shipping_country"),
  
  // Items summary
  itemsCount: integer("items_count").default(1),
  itemsSummary: text("items_summary"), // e.g., "Product A, Product B"
  
  // Assignment
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at"),
  
  // Tracking
  courierName: text("courier_name"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  shipmentStatus: text("shipment_status"),
  
  // Metadata
  tags: text("tags").array(),
  notes: text("notes"),
  rawShopifyData: jsonb("raw_shopify_data"), // Store full Shopify order data
  
  // Shopify Sync Tracking
  lastSyncedAt: timestamp("last_synced_at"),
  syncStatus: text("sync_status").notNull().default("not_synced"), // not_synced, synced, failed
  
  // Timestamps
  shopifyCreatedAt: timestamp("shopify_created_at").notNull(),
  shopifyUpdatedAt: timestamp("shopify_updated_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ============================================================================
// ORDER ITEMS
// ============================================================================

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  shopifyLineItemId: text("shopify_line_item_id"),
  shopifyProductId: text("shopify_product_id"),
  shopifyVariantId: text("shopify_variant_id"),
  
  productName: text("product_name").notNull(),
  variantTitle: text("variant_title"),
  sku: text("sku"),
  
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 12, scale: 2 }).notNull(),
  
  imageUrl: text("image_url"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true, createdAt: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// ============================================================================
// ORDER ASSIGNMENTS
// ============================================================================

export const orderAssignments = pgTable("order_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderAssignmentSchema = createInsertSchema(orderAssignments).omit({ id: true, createdAt: true });
export type InsertOrderAssignment = z.infer<typeof insertOrderAssignmentSchema>;
export type OrderAssignment = typeof orderAssignments.$inferSelect;

// ============================================================================
// ORDER STATUS HISTORY
// ============================================================================

export const orderStatusHistory = pgTable("order_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  previousStatus: text("previous_status"),
  changedBy: varchar("changed_by").references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistory).omit({ id: true, createdAt: true });
export type InsertOrderStatusHistory = z.infer<typeof insertOrderStatusHistorySchema>;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;

// ============================================================================
// SHOPIFY SYNC LOGS
// ============================================================================

export const shopifySyncLogs = pgTable("shopify_sync_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  shopifyOrderId: text("shopify_order_id").notNull(),
  syncType: text("sync_type").notNull(), // confirmed, cancelled, followup
  syncAction: text("sync_action").notNull(), // add_tag, add_note, cancel_order, update_metafield
  syncStatus: text("sync_status").notNull().default("pending"), // pending, success, failed
  requestPayload: jsonb("request_payload"),
  responseData: jsonb("response_data"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShopifySyncLogSchema = createInsertSchema(shopifySyncLogs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShopifySyncLog = z.infer<typeof insertShopifySyncLogSchema>;
export type ShopifySyncLog = typeof shopifySyncLogs.$inferSelect;

// ============================================================================
// LEAVE REQUESTS
// ============================================================================

export const leaveRequests = pgTable("leave_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leaveType: text("leave_type").notNull(), // sick, casual, vacation
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    startDate: z.union([z.date(), z.string().transform((str) => new Date(str))]),
    endDate: z.union([z.date(), z.string().transform((str) => new Date(str))]),
  });
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;

// ============================================================================
// TEAM MESSAGES
// ============================================================================

export const teamMessages = pgTable("team_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toUserId: varchar("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTeamMessageSchema = createInsertSchema(teamMessages).omit({ id: true, createdAt: true });
export type InsertTeamMessage = z.infer<typeof insertTeamMessageSchema>;
export type TeamMessage = typeof teamMessages.$inferSelect;

// ============================================================================
// SHOPIFY WEBHOOKS LOG
// ============================================================================

export const webhookLogs = pgTable("webhook_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topic: text("topic").notNull(), // e.g., "orders/create"
  shopifyOrderId: text("shopify_order_id"),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebhookLogSchema = createInsertSchema(webhookLogs).omit({ id: true, createdAt: true });
export type InsertWebhookLog = z.infer<typeof insertWebhookLogSchema>;
export type WebhookLog = typeof webhookLogs.$inferSelect;

// ============================================================================
// SHOPIFY CREDENTIALS
// ============================================================================

export const shopifyCredentials = pgTable("shopify_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeUrl: text("store_url").notNull(),
  apiKey: text("api_key").notNull(), // Encrypted
  apiSecret: text("api_secret").notNull(), // Encrypted
  accessToken: text("access_token").notNull(), // Encrypted
  webhookSecret: text("webhook_secret"), // Encrypted, optional
  isActive: boolean("is_active").notNull().default(true),
  lastTestedAt: timestamp("last_tested_at"),
  testStatus: text("test_status"), // success, failed
  testMessage: text("test_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShopifyCredentialsSchema = createInsertSchema(shopifyCredentials).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
}).extend({
  storeUrl: z.string().min(1, "Store URL is required").regex(/\.myshopify\.com$/, "Store URL must end with .myshopify.com"),
  apiKey: z.string().min(1, "Admin API access token is required"),
  apiSecret: z.string().min(1, "API secret key is required"),
  accessToken: z.string().min(1, "Access token is required"),
  webhookSecret: z.string().optional(),
});

export type InsertShopifyCredentials = z.infer<typeof insertShopifyCredentialsSchema>;
export type ShopifyCredentials = typeof shopifyCredentials.$inferSelect;

// ============================================================================
// ATTENDANCE (HR/Payroll Tracking)
// ============================================================================

export const attendance = pgTable("attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  clockInTime: timestamp("clock_in_time"),
  clockOutTime: timestamp("clock_out_time"),
  totalHours: decimal("total_hours", { precision: 5, scale: 2 }), // Calculated field
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAttendanceSchema = createInsertSchema(attendance).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;

// ============================================================================
// CALLS (IVR Click-to-Call Tracking)
// ============================================================================

export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerPhone: text("customer_phone").notNull(),
  callStatus: text("call_status").notNull().default("initiated"), // initiated, connected, failed, completed
  calledAt: timestamp("called_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCallSchema = createInsertSchema(calls).omit({ 
  id: true, 
  calledAt: true,
  createdAt: true 
});

export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;

// ============================================================================
// NOTIFICATIONS (In-app notifications for follow-ups and alerts)
// ============================================================================

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").references(() => orders.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // followup_reminder, order_assigned, status_change
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  actionUrl: text("action_url"), // URL to navigate when clicked
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ 
  id: true, 
  createdAt: true 
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ============================================================================
// SHIPMENTS (Shiprocket Integration)
// ============================================================================

export const shipments = pgTable("shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  shopifyOrderId: text("shopify_order_id").notNull(),
  
  // Shiprocket shipment data
  shiprocketOrderId: text("shiprocket_order_id").unique(),
  shiprocketShipmentId: text("shiprocket_shipment_id").unique(),
  awb: text("awb").unique(), // Airway Bill Number (tracking number)
  
  // Courier details
  courierName: text("courier_name"),
  courierId: text("courier_id"),
  
  // Shipment status
  status: text("status").notNull().default("created"), // created, pickup_scheduled, in_transit, out_for_delivery, delivered, ndr, rto, cancelled
  currentStatus: text("current_status"), // Latest status from courier
  statusUpdatedAt: timestamp("status_updated_at"),
  
  // Tracking
  trackingUrl: text("tracking_url"),
  estimatedDeliveryDate: timestamp("estimated_delivery_date"),
  
  // Shipping details
  pickupScheduledDate: timestamp("pickup_scheduled_date"),
  pickedUpAt: timestamp("picked_up_at"),
  deliveredAt: timestamp("delivered_at"),
  
  // Weight and dimensions
  weight: decimal("weight", { precision: 10, scale: 2 }), // in kg
  length: decimal("length", { precision: 10, scale: 2 }), // in cm
  breadth: decimal("breadth", { precision: 10, scale: 2 }), // in cm
  height: decimal("height", { precision: 10, scale: 2 }), // in cm
  
  // Metadata
  rawShiprocketData: jsonb("raw_shiprocket_data"), // Full response from Shiprocket
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShipmentSchema = createInsertSchema(shipments).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;

// ============================================================================
// NDR EVENTS (Non-Delivery Report Events)
// ============================================================================

export const ndrEvents = pgTable("ndr_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shipmentId: varchar("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  awb: text("awb").notNull(),
  
  // NDR Details
  ndrStatus: text("ndr_status").notNull(), // customer_unavailable, address_issue, refused, other
  ndrReason: text("ndr_reason").notNull(), // Detailed reason from courier
  ndrDate: timestamp("ndr_date").notNull(),
  
  // Action taken
  actionTaken: text("action_taken"), // reattempt_scheduled, customer_contacted, rto_initiated, resolved
  actionBy: varchar("action_by").references(() => users.id),
  actionNotes: text("action_notes"),
  actionAt: timestamp("action_at"),
  
  // Reattempt details
  reattemptScheduled: boolean("reattempt_scheduled").notNull().default(false),
  reattemptDate: timestamp("reattempt_date"),
  reattemptAwb: text("reattempt_awb"), // New AWB if rescheduled
  
  // Updated delivery details (if customer provided new info)
  updatedPhone: text("updated_phone"),
  updatedAddress: jsonb("updated_address"),
  
  // Resolution
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"), // delivered, returned, cancelled
  
  // Metadata
  rawNdrData: jsonb("raw_ndr_data"), // Full NDR webhook payload
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNdrEventSchema = createInsertSchema(ndrEvents).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export type InsertNdrEvent = z.infer<typeof insertNdrEventSchema>;
export type NdrEvent = typeof ndrEvents.$inferSelect;
