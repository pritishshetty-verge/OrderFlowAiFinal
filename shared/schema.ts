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
  role: text("role").notNull().default("agent"), // admin, manager, agent
  department: text("department").default("Operations"),
  employeeId: text("employee_id").unique(),
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
  department: true,
});

export const updateUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  department: true,
  employeeId: true,
  presenceStatus: true,
  isActive: true,
}).partial();

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================================================
// USER INVITATIONS
// ============================================================================

export const invites = pgTable("invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default("agent"), // admin, manager, agent
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
}).extend({
  email: z.string().email("Invalid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["admin", "manager", "agent"]).default("agent"),
});

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
