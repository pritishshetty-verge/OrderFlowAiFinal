import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, jsonb, serial, date, unique, primaryKey, index, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// SESSION STORE (managed by connect-pg-simple at runtime)
// ============================================================================
//
// connect-pg-simple auto-creates this table on first boot (see
// `createTableIfMissing: true` in server/index.ts). We declare it in
// Drizzle purely so `drizzle-kit push` recognises it as a managed
// table and doesn't propose to DROP it as schema drift — dropping it
// would invalidate every active session in production.
//
// Column shapes are pinned to connect-pg-simple's canonical schema
// (https://github.com/voxpelli/node-connect-pg-simple/blob/main/table.sql):
//   sid     varchar      PRIMARY KEY
//   sess    json         NOT NULL
//   expire  timestamp(6) NOT NULL
//   index   IDX_session_expire ON (expire)
//
// We deliberately use `json` (not `jsonb`) and a plain `timestamp`
// (no withTimezone) to match the library's CREATE TABLE statement
// byte-for-byte, so push doesn't see a type-drift either.
export const sessions = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  }),
);

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
  avatarImage: text("avatar_image"), // Avatar filename (e.g., "avatar_1.png")
  role: text("role").notNull().default("agent"), // admin, agent
  adminType: text("admin_type"), // full_control, partial_control (nullable, only for admins)
  permissions: jsonb("permissions"), // Custom permissions for partial_control admins
  department: text("department").default("Operations"),
  employeeId: text("employee_id").unique(),
  agentExtension: varchar("agent_extension", { length: 10 }), // IVR phone extension for agents
  presenceStatus: text("presence_status").notNull().default("present"), // present, onleave, inactive
  // Which city's holiday calendar this employee follows. Drives the
  // purple "holiday" markers on /api/holidays + attendance calendar.
  // One of: MUMBAI, DELHI, BENGALURU, HYDERABAD. Nullable — pre-payroll
  // hires haven't been assigned a state yet.
  holidayState: text("holiday_state"),
  // ── Payroll ─────────────────────────────────────────────────────
  // Monthly gross salary in INR (whole rupees + paise). Drives the
  // base-pay leg of /api/payroll/preview & /run. Nullable: roles that
  // don't pull payroll (e.g. external contractors) have no salary set.
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }),
  // Drives which incentive ladder applies on /api/payroll/preview.
  // One of: ORDER_CONFIRMATION (delivery-rate tier), NDR_RTO
  // (stackable team-delivery + personal-recovery + reships), or null
  // for staff that don't earn variable pay.
  compensationProfile: text("compensation_profile"),
  isActive: boolean("is_active").notNull().default(true),
  // KYC document: currently holds the local filename in uploads/kyc/.
  // Will be swapped for the S3 object key once migrated.
  kycDocumentUrl: text("kyc_document_url"),
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
  avatarImage: true,
  role: true,
  adminType: true,
  permissions: true,
  department: true,
  employeeId: true,
  agentExtension: true,
  presenceStatus: true,
  holidayState: true,
  baseSalary: true,
  compensationProfile: true,
  isActive: true,
  kycDocumentUrl: true,
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
  // Allowed roles. Order matters in the dropdown rendering on the
  // client. New roles must be added in BOTH this enum and the
  // matching frontend-side `inviteUserSchema` in
  // client/src/components/team-directory.tsx, otherwise the form
  // either refuses to submit or the server refuses to accept it.
  role: z
    .enum(["admin", "agent", "recovery_agent", "chat_support"])
    .default("agent"),
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

// ============================================================================
// PIN-CODE TIERS (for Pare Phase 5 · Geographic Risk Segmentation)
// ============================================================================

// ============================================================================
// STORES (Multi-tenant Phase 1: one row per connected Shopify store)
// ============================================================================
//
// This is the canonical store registry. In the single-store world we
// kept the connected store's data in `shopify_credentials`; that table
// stays intact (existing code still reads it) but new code should use
// `stores`. The Phase-1 backfill copies the single active credentials
// row into a `stores` row and links every existing order/customer/etc.
// to it via the nullable `storeId` columns added below.
//
// Migration path forward (Phase 4/5): the read-paths flip over to
// stores → getShopifyClient(storeId) factory; shopify_credentials gets
// deprecated and eventually dropped.
export const stores = pgTable("stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Display name fetched from Shopify on connect.
  storeName: text("store_name"),
  // .myshopify.com domain — globally unique because it IS Shopify's
  // tenant identifier. We use this to route inbound webhooks via the
  // X-Shopify-Shop-Domain header (Phase 5).
  storeUrl: text("store_url").notNull().unique(),
  // Optional workspace logo. Two accepted shapes (the route layer
  // validates):
  //   • base64 data URI ("data:image/png;base64,…") — what the
  //     in-product upload writes today. No S3 round-trip needed at
  //     small org sizes; <= ~1 MB after client-side downscaling.
  //   • plain http(s) URL — for orgs that prefer to host the asset
  //     on their own CDN. Useful once we expose a "logo URL" field
  //     alongside the file picker.
  // Falls back to the deterministic gradient avatar (see
  // client/src/components/store-switcher.tsx) when null.
  logoUrl: text("logo_url"),
  // Encrypted via server/encryption.ts. Optional during the
  // transition because the existing credentials still live in
  // shopify_credentials; the Phase-5 migration moves them in.
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  accessToken: text("access_token"),
  webhookSecret: text("webhook_secret"),
  isActive: boolean("is_active").notNull().default(true),
  lastTestedAt: timestamp("last_tested_at"),
  testStatus: text("test_status"), // success | failed
  testMessage: text("test_message"),
  // Audit: which admin connected the store. Nullable so the Phase-1
  // backfill (which can't know the original connector) can leave it
  // empty for the legacy store.
  connectedBy: varchar("connected_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStoreSchema = createInsertSchema(stores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof stores.$inferSelect;

// ============================================================================
// USER ↔ STORE membership (RBAC mapping)
// ============================================================================
//
// Which non-admin users can see which stores. Admins implicitly get
// every store (no row needed). Agents / recovery_agent / chat_support
// see exactly the stores they have rows for.
//
// (userId, storeId) is unique — one membership per pair. ON DELETE
// CASCADE on both sides cleans up automatically when a user or store
// is removed.
export const userStores = pgTable(
  "user_stores",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: varchar("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    createdBy: varchar("created_by").references(() => users.id),
  },
  (table) => ({
    uniqUserStore: unique().on(table.userId, table.storeId),
  }),
);

export const insertUserStoreSchema = createInsertSchema(userStores).omit({
  id: true,
  createdAt: true,
});
export type InsertUserStore = z.infer<typeof insertUserStoreSchema>;
export type UserStore = typeof userStores.$inferSelect;

// ============================================================================
// MARKETING METRICS (for Pare Phase 4 · Meta/FB ad data, aggregated per day)
// ============================================================================
//
// Multi-store PK: (date, storeId). A single date row can exist per
// store, so two stores aggregating Meta spend on the same day no
// longer collide. The Phase-1 backfill populated storeId on every
// existing row, so the NOT NULL + composite-PK constraints below
// apply cleanly without rejecting any existing data.
export const marketingMetrics = pgTable(
  "marketing_metrics",
  {
    // No `.primaryKey()` on `date` anymore — the PK is composite,
    // declared in the table-config block below.
    date: date("date").notNull(),
    storeId: varchar("store_id")
      .notNull()
      .references(() => stores.id),
    fbSpend: decimal("fb_spend", { precision: 14, scale: 2 }).notNull().default("0"),
    // Blended ROAS = fbGmv / fbSpend. Stored null when spend = 0.
    fbRoas: decimal("fb_roas", { precision: 10, scale: 4 }),
    fbGmv: decimal("fb_gmv", { precision: 14, scale: 2 }).notNull().default("0"),
    fbOrders: integer("fb_orders").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.date, table.storeId] }),
  }),
);

export type MarketingMetric = typeof marketingMetrics.$inferSelect;
export type InsertMarketingMetric = typeof marketingMetrics.$inferInsert;

export const pincodeTiers = pgTable("pincode_tiers", {
  pincode: varchar("pincode", { length: 12 }).primaryKey(),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  // 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Unknown'
  tier: varchar("tier", { length: 16 }).notNull(),
});

export type PincodeTier = typeof pincodeTiers.$inferSelect;
export type InsertPincodeTier = typeof pincodeTiers.$inferInsert;

export const customers = pgTable(
  "customers",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    // Multi-store: which store this customer belongs to. Nullable in
    // Phase 1; backfilled to the single existing store; will be flipped
    // NOT NULL after the production backfill runs.
    storeId: varchar("store_id").references(() => stores.id),
    // Phase 5 (Risk #4): the legacy bare `.unique()` on this column
    // broke as soon as a second store synced — Shopify customer ids
    // are per-shop and the same numeric id can legitimately exist in
    // two tenants. Relaxed to a composite UNIQUE on (storeId,
    // shopifyCustomerId) so each store namespaces its own customers
    // cleanly. The de-dup helpers in server/storage.ts were updated
    // in the same commit to filter by storeId.
    shopifyCustomerId: text("shopify_customer_id"),
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
  },
  (table) => ({
    uniqStoreCustomer: unique("customers_store_shopify_customer_id_key").on(
      table.storeId,
      table.shopifyCustomerId,
    ),
  }),
);

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// ============================================================================
// ORDERS
// ============================================================================

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Multi-store FK. Nullable in Phase 1; backfilled in production
  // before being flipped NOT NULL.
  storeId: varchar("store_id").references(() => stores.id),
  // Phase 5 (Risk #4): bare `.unique()` removed because Shopify order
  // ids are globally-monotone integers — two stores at high volume
  // can hit the same id by coincidence, which used to crash the
  // webhook insert with a unique_violation. Now uniqueness lives in
  // the composite at the bottom of the table, scoped per-store. The
  // legacy single-store de-dup helpers also took a storeId in the
  // same commit.
  shopifyOrderId: text("shopify_order_id").notNull(),
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
  
  // NDR (Non-Delivery Report) fields
  nslCode: text("nsl_code"), // Delhivery NDR code (e.g., "EOD-6", "EOD-74")
  failureReason: text("failure_reason"), // Human-readable failure reason
  lastFailedAt: timestamp("last_failed_at"), // Timestamp of last delivery failure
  isActionable: boolean("is_actionable").default(false), // Whether NDR requires customer action
  
  // Metadata
  tags: text("tags").array(),
  notes: text("notes"),
  // Shopify marks test orders (created via Bogus Gateway or test mode) with
  // order.test = true. Pare's analytics MUST exclude these from the
  // financial waterfall — they don't appear in Shopify's own sales reports.
  testOrder: boolean("test_order").notNull().default(false),
  rawShopifyData: jsonb("raw_shopify_data"), // Store full Shopify order data
  
  // Shopify Sync Tracking
  lastSyncedAt: timestamp("last_synced_at"),
  syncStatus: text("sync_status").notNull().default("not_synced"), // not_synced, synced, failed
  
  // Timestamps
  shopifyCreatedAt: timestamp("shopify_created_at").notNull(),
  // Shopify's processed_at is the canonical "financial" timestamp —
  // what Shopify's own sales reports bucket on. Stored as timestamptz
  // so IST bucketing math is correct without ambiguous plain-ts casts.
  // Nullable initially so the backfill can populate historic rows; the
  // sync writes it on every new order going forward.
  processedAt: timestamp("processed_at", { mode: "string", withTimezone: true }),
  shopifyUpdatedAt: timestamp("shopify_updated_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // Phase 5 (Risk #4): composite uniqueness so two stores never
  // collide on a Shopify order id. The webhook handler in
  // server/webhooks.ts now scopes its `getOrderByShopifyId` lookup
  // by (storeId, shopifyOrderId) to match.
  uniqStoreOrder: unique("orders_store_shopify_order_id_key").on(
    table.storeId,
    table.shopifyOrderId,
  ),
}));

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ============================================================================
// ORDER ITEMS
// ============================================================================

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Denormalised from parent order. Saves a join on catalog/analytics
  // queries that already filter by store. Nullable in Phase 1.
  storeId: varchar("store_id").references(() => stores.id),
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
// PRODUCTS (Local Cache of Shopify Products)
// ============================================================================

export const products = pgTable(
  "products",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    // Multi-store: catalog cache is per-store. Nullable in Phase 1.
    // The bare `.unique()` on `shopifyVariantId` was the long-standing
    // Phase-5 TODO: two stores sharing a private-label or dropship
    // supplier hit identical variant ids and the second store's sync
    // crashed with unique_violation. Composite UNIQUE below restores
    // tenant independence; helpers in server/storage.ts now look up
    // `(storeId, shopifyVariantId)`.
    storeId: varchar("store_id").references(() => stores.id),
    shopifyProductId: text("shopify_product_id").notNull(),
    shopifyVariantId: text("shopify_variant_id").notNull(),

    title: text("title").notNull(),
    variantTitle: text("variant_title"),
    sku: text("sku"),

    imageUrl: text("image_url"),

    // Sync metadata
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqStoreVariant: unique("products_store_shopify_variant_id_key").on(
      table.storeId,
      table.shopifyVariantId,
    ),
  }),
);

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// ============================================================================
// ORDER ASSIGNMENTS
// ============================================================================

export const orderAssignments = pgTable("order_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Denormalised from parent order for direct store-scoped queries.
  storeId: varchar("store_id").references(() => stores.id),
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
  // Denormalised from parent order. Pare analytics reads this heavily;
  // having storeId on the row avoids a join on every analytics query.
  storeId: varchar("store_id").references(() => stores.id),
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
  // Each sync attempt is per-store (outbound tag/note/metafield updates).
  storeId: varchar("store_id").references(() => stores.id),
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
  // Which store this webhook payload was resolved to. Phase 5 reads
  // X-Shopify-Shop-Domain to populate this; until then, every row
  // inherits the single legacy store via backfill.
  storeId: varchar("store_id").references(() => stores.id),
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
  storeName: text("store_name"),              // Display name fetched from Shopify on connect
  storeUrl: text("store_url").notNull(),      // shopDomain — e.g. store.myshopify.com
  apiKey: text("api_key").notNull(),          // clientId — Encrypted
  apiSecret: text("api_secret").notNull(),    // clientSecret — Encrypted
  accessToken: text("access_token"),          // Deprecated: no longer used (Client Credentials flow)
  webhookSecret: text("webhook_secret"),      // Encrypted, optional
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
  storeName: z.string().optional(),
  storeUrl: z.string().min(1, "Shop domain is required").regex(/\.myshopify\.com$/, "Shop domain must end with .myshopify.com"),
  apiKey: z.string().min(1, "Client ID is required"),
  apiSecret: z.string().min(1, "Client Secret is required"),
  accessToken: z.string().optional(),
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
  status: text("status").notNull().default("present"), // present, absent, leave
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
// ATTENDANCE BREAKS (Break Tracking for Payroll)
// ============================================================================

export const attendanceBreaks = pgTable("attendance_breaks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attendanceId: varchar("attendance_id").notNull().references(() => attendance.id, { onDelete: "cascade" }),
  breakStart: timestamp("break_start").notNull(),
  breakEnd: timestamp("break_end"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAttendanceBreakSchema = createInsertSchema(attendanceBreaks).omit({ 
  id: true, 
  createdAt: true 
});

export type InsertAttendanceBreak = z.infer<typeof insertAttendanceBreakSchema>;
export type AttendanceBreak = typeof attendanceBreaks.$inferSelect;

// ============================================================================
// HOLIDAYS (Payroll: per-state holiday calendar)
// ============================================================================
//
// One row per (state, date). Seeded annually from the official Verge
// Scales calendar PDF — see `server/scripts/seed-holidays.ts`. The
// frontend attendance calendar consults this table via GET /api/holidays
// to render purple holiday markers, scoped to the logged-in user's
// `users.holidayState`.

export const holidays = pgTable("holidays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(), // YYYY-MM-DD; PG `date` type, not timestamptz
  name: text("name").notNull(), // "Diwali", "Republic Day", etc.
  state: text("state").notNull(), // MUMBAI | DELHI | BENGALURU | HYDERABAD
  type: text("type").notNull(), // Fixed | Optional
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHolidaySchema = createInsertSchema(holidays).omit({
  id: true,
  createdAt: true,
});

export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type Holiday = typeof holidays.$inferSelect;

// ============================================================================
// PAYROLL LEDGER (Monthly payroll runs, one row per (user, year, month))
// ============================================================================
//
// Persisted result of a payroll run. The values stored here are the
// numbers actually disbursed — including any admin overrides — and the
// pay components are denormalised out of the math service so a future
// audit doesn't depend on re-running the engine. The PDF generated at
// run time is also referenced by filename for re-download.

export const payrollLedger = pgTable("payroll_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1–12

  // ── Base-pay inputs ─────────────────────────────────────────────
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }).notNull(),
  expectedWorkingDays: integer("expected_working_days").notNull(),
  daysPresent: integer("days_present").notNull(),
  paidHolidaysUsed: integer("paid_holidays_used").notNull().default(0),
  // Capped ratio ((daysPresent + paidHolidays) / expectedDays), max 1.0
  basePayRatio: decimal("base_pay_ratio", { precision: 5, scale: 4 }).notNull(),
  basePayAmount: decimal("base_pay_amount", { precision: 12, scale: 2 }).notNull(),

  // ── Incentive inputs (% values stored as 0–100, not 0–1) ────────
  compensationProfile: text("compensation_profile"), // mirrors users.compensationProfile at run time
  deliveryRatePct: decimal("delivery_rate_pct", { precision: 5, scale: 2 }),
  teamDeliveryRatePct: decimal("team_delivery_rate_pct", { precision: 5, scale: 2 }),
  recoveryRatePct: decimal("recovery_rate_pct", { precision: 5, scale: 2 }),
  reshipsCount: integer("reships_count").default(0),

  // ── Incentive outputs ───────────────────────────────────────────
  confirmationBonus: decimal("confirmation_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  teamDeliveryBonus: decimal("team_delivery_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  recoveryBonus: decimal("recovery_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  reshipsBonus: decimal("reships_bonus", { precision: 12, scale: 2 }).notNull().default("0"),
  totalIncentives: decimal("total_incentives", { precision: 12, scale: 2 }).notNull().default("0"),

  // ── Final payout ────────────────────────────────────────────────
  finalPayout: decimal("final_payout", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("INR"),

  // ── Lifecycle ───────────────────────────────────────────────────
  status: text("status").notNull().default("finalized"), // finalized | sent | failed
  pdfFilename: text("pdf_filename"), // relative to uploads/payslips/
  recipientEmail: text("recipient_email"),
  sentAt: timestamp("sent_at"),
  emailError: text("email_error"), // populated on failure for retry / debug

  // Free-text notes the admin attached on Run (override reasons, etc.)
  notes: text("notes"),

  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPayrollLedgerSchema = createInsertSchema(payrollLedger).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayrollLedger = z.infer<typeof insertPayrollLedgerSchema>;
export type PayrollLedger = typeof payrollLedger.$inferSelect;

// ============================================================================
// CALLS (IVR Click-to-Call Tracking)
// ============================================================================

export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Denormalised from parent order so call-log queries are
  // store-scoped without joining orders.
  storeId: varchar("store_id").references(() => stores.id),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  customerPhone: text("customer_phone").notNull(),
  callStatus: text("call_status").notNull().default("initiated"), // initiated, connected, failed, completed
  calledAt: timestamp("called_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  
  // Webhook data fields (populated by IVR provider callback)
  callDuration: integer("call_duration"), // Duration in seconds
  recordingUrl: text("recording_url"), // URL to call recording
  callReference: text("call_reference"), // Unique reference from IVR provider
  recipientNumber: text("recipient_number"), // The actual number that was called
  ivrStatus: text("ivr_status"), // Status reported by IVR provider
  completedAt: timestamp("completed_at"), // When the call actually completed
  webhookData: jsonb("webhook_data"), // Full webhook payload for debugging
  
  // Future feature fields
  transcript: text("transcript"), // Call transcript (populated by speech-to-text service)
  aiAnalysis: jsonb("ai_analysis"), // AI-powered insights and analysis
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
// LEARNING CENTER - COURSES
// ============================================================================

export const courses = pgTable("courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  thumbnail: text("thumbnail"), // URL to course thumbnail image
  category: text("category").notNull(), // Onboarding, Advanced Techniques, Policy & Compliance, Product Training, Soft Skills
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  authorId: varchar("author_id").references(() => users.id),
  
  // Prerequisite system
  prerequisiteCourseIds: text("prerequisite_course_ids").array().default(sql`ARRAY[]::text[]`), // Course IDs that must be completed first
  
  // Metadata
  estimatedDuration: integer("estimated_duration"), // In minutes
  difficulty: text("difficulty").default("beginner"), // beginner, intermediate, advanced
  isPublished: boolean("is_published").notNull().default(false),
  order: integer("order").default(0), // Display order within category
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCourseSchema = createInsertSchema(courses).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;

// ============================================================================
// LEARNING CENTER - LESSONS
// ============================================================================

export const lessons = pgTable("lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  
  // Content
  content: text("content"), // Rich text/markdown content (from WYSIWYG editor)
  videoUrl: text("video_url"), // YouTube/Vimeo embed URL
  videoDuration: integer("video_duration"), // In seconds
  
  // Prerequisite system
  prerequisiteLessonIds: text("prerequisite_lesson_ids").array().default(sql`ARRAY[]::text[]`), // Lesson IDs that must be completed first
  
  // Metadata
  order: integer("order").notNull().default(0), // Order within course
  estimatedDuration: integer("estimated_duration"), // In minutes
  isPublished: boolean("is_published").notNull().default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLessonSchema = createInsertSchema(lessons).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessons.$inferSelect;

// ============================================================================
// LEARNING CENTER - USER LESSON PROGRESS
// ============================================================================

export const userLessonProgress = pgTable("user_lesson_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: varchar("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  
  // Progress tracking
  completionPercentage: integer("completion_percentage").notNull().default(0), // 0-100
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  
  // Engagement tracking
  timeSpent: integer("time_spent").default(0), // In seconds
  lastAccessedAt: timestamp("last_accessed_at"),
  isBookmarked: boolean("is_bookmarked").notNull().default(false),
  
  // Video progress
  videoProgress: integer("video_progress").default(0), // In seconds - how far into the video they watched
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserLessonProgressSchema = createInsertSchema(userLessonProgress).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertUserLessonProgress = z.infer<typeof insertUserLessonProgressSchema>;
export type UserLessonProgress = typeof userLessonProgress.$inferSelect;

// ============================================================================
// LEARNING CENTER - LESSON ANALYTICS
// ============================================================================

export const lessonAnalytics = pgTable("lesson_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lessonId: varchar("lesson_id").notNull().unique().references(() => lessons.id, { onDelete: "cascade" }),
  
  // Aggregate metrics
  totalViews: integer("total_views").notNull().default(0),
  uniqueViews: integer("unique_views").notNull().default(0),
  totalCompletions: integer("total_completions").notNull().default(0),
  averageCompletionTime: integer("average_completion_time").default(0), // In seconds
  averageTimeSpent: integer("average_time_spent").default(0), // In seconds
  
  // Completion rate
  completionRate: decimal("completion_rate", { precision: 5, scale: 2 }).default("0"), // Percentage
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertLessonAnalyticsSchema = createInsertSchema(lessonAnalytics).omit({ 
  id: true, 
  updatedAt: true 
});
export type InsertLessonAnalytics = z.infer<typeof insertLessonAnalyticsSchema>;
export type LessonAnalytics = typeof lessonAnalytics.$inferSelect;

// ============================================================================
// LEARNING CENTER - RESOURCES
// ============================================================================

export const resources = pgTable("resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(), // video, pdf, template, sop, checklist
  category: text("category").notNull(), // Same as courses: Onboarding, Advanced Techniques, etc.
  
  // File details
  fileUrl: text("file_url").notNull(), // URL to the file (S3, local storage, etc.)
  fileSize: integer("file_size"), // In bytes
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  
  // Optional lesson association
  lessonId: varchar("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  
  // Metadata
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  authorId: varchar("author_id").references(() => users.id),
  downloadCount: integer("download_count").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertResourceSchema = createInsertSchema(resources).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resources.$inferSelect;

// ============================================================================
// LEARNING CENTER - ONBOARDING CHECKLISTS
// ============================================================================

export const onboardingChecklists = pgTable("onboarding_checklists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  role: text("role").notNull(), // admin, agent - role-specific checklists
  
  // Milestones (stored as JSONB array)
  // Each milestone: { id, title, description, type, resourceId, order, isRequired }
  milestones: jsonb("milestones").notNull(),
  
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOnboardingChecklistSchema = createInsertSchema(onboardingChecklists).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertOnboardingChecklist = z.infer<typeof insertOnboardingChecklistSchema>;
export type OnboardingChecklist = typeof onboardingChecklists.$inferSelect;

// ============================================================================
// LEARNING CENTER - USER ONBOARDING PROGRESS
// ============================================================================

export const userOnboardingProgress = pgTable("user_onboarding_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  checklistId: varchar("checklist_id").notNull().references(() => onboardingChecklists.id, { onDelete: "cascade" }),
  
  // Progress tracking (stored as JSONB)
  // { milestoneId: { completed: boolean, completedAt: timestamp, signedOffBy: userId } }
  progress: jsonb("progress").notNull().default('{}'),
  
  // Aggregate metrics
  completionPercentage: integer("completion_percentage").notNull().default(0),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  
  // Manager sign-off
  signedOffBy: varchar("signed_off_by").references(() => users.id),
  signedOffAt: timestamp("signed_off_at"),
  
  // Time tracking
  startedAt: timestamp("started_at").notNull().defaultNow(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserOnboardingProgressSchema = createInsertSchema(userOnboardingProgress).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertUserOnboardingProgress = z.infer<typeof insertUserOnboardingProgressSchema>;
export type UserOnboardingProgress = typeof userOnboardingProgress.$inferSelect;

// ============================================================================
// SHIPMENTS (Shiprocket Integration)
// ============================================================================

export const shipments = pgTable("shipments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Denormalised from parent order.
  storeId: varchar("store_id").references(() => stores.id),
  orderId: varchar("order_id").notNull().unique().references(() => orders.id, { onDelete: "cascade" }), // One shipment per order
  shopifyOrderId: text("shopify_order_id").notNull(),
  
  // Shiprocket shipment data
  shiprocketOrderId: text("shiprocket_order_id").unique(),
  shiprocketShipmentId: text("shiprocket_shipment_id").unique(),
  awb: text("awb"), // Airway Bill Number (tracking number) - can be null/empty initially, assigned later by courier
  
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
  // Denormalised from parent order/shipment.
  storeId: varchar("store_id").references(() => stores.id),
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

// ============================================================================
// APP SETTINGS (Global Configuration)
// ============================================================================

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppSettingSchema = createInsertSchema(appSettings);

export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type AppSetting = typeof appSettings.$inferSelect;

// ============================================================================
// ABANDONED CHECKOUTS (Fastrr / Shiprocket Abandoned Cart)
// ============================================================================

export const abandonedCheckouts = pgTable("abandoned_checkouts", {
  id: serial("id").primaryKey(),
  // Multi-store: the Fastrr/Shopify checkout that produced this
  // abandoned cart belongs to one store. Nullable in Phase 1.
  storeId: varchar("store_id").references(() => stores.id),
  externalId: text("external_id"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  items: jsonb("items"),
  cartValue: decimal("cart_value", { precision: 10, scale: 2 }),
  checkoutUrl: text("checkout_url"),
  checkoutStage: text("checkout_stage"),
  address: text("address"),
  assignedTo: text("assigned_to"),
  isRecovered: boolean("is_recovered").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAbandonedCheckoutSchema = createInsertSchema(abandonedCheckouts).omit({
  id: true,
  createdAt: true,
});

export type InsertAbandonedCheckout = z.infer<typeof insertAbandonedCheckoutSchema>;
export type AbandonedCheckout = typeof abandonedCheckouts.$inferSelect;

// ============================================================================
// WEBHOOKS ENGINE
// ============================================================================

export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  url: text("url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
});

export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;

// ============================================================================
// INBOUND WEBHOOK LOGS (External CRM/API payload storage)
// ============================================================================

export const inboundWebhookLogs = pgTable("inbound_webhook_logs", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().default("telecrm"),
  eventType: text("event_type"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInboundWebhookLogSchema = createInsertSchema(inboundWebhookLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertInboundWebhookLog = z.infer<typeof insertInboundWebhookLogSchema>;
export type InboundWebhookLog = typeof inboundWebhookLogs.$inferSelect;
