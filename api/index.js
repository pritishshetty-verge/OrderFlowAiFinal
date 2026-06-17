import{createRequire as __cr}from'module';const require=__cr(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  DEFAULT_MANAGER_PERMISSIONS: () => DEFAULT_MANAGER_PERMISSIONS,
  REFUND_TYPES: () => REFUND_TYPES,
  RETURN_STATUSES: () => RETURN_STATUSES,
  SHIPPING_STATUSES: () => SHIPPING_STATUSES,
  SHIPPING_STATUS_LABELS: () => SHIPPING_STATUS_LABELS,
  abandonedCheckouts: () => abandonedCheckouts,
  appSettings: () => appSettings,
  attendance: () => attendance,
  attendanceBreaks: () => attendanceBreaks,
  calls: () => calls,
  catalogProducts: () => catalogProducts,
  courses: () => courses,
  customers: () => customers,
  holidays: () => holidays,
  inboundWebhookLogs: () => inboundWebhookLogs,
  insertAbandonedCheckoutSchema: () => insertAbandonedCheckoutSchema,
  insertAppSettingSchema: () => insertAppSettingSchema,
  insertAttendanceBreakSchema: () => insertAttendanceBreakSchema,
  insertAttendanceSchema: () => insertAttendanceSchema,
  insertCallSchema: () => insertCallSchema,
  insertCatalogProductSchema: () => insertCatalogProductSchema,
  insertCourseSchema: () => insertCourseSchema,
  insertCustomerSchema: () => insertCustomerSchema,
  insertHolidaySchema: () => insertHolidaySchema,
  insertInboundWebhookLogSchema: () => insertInboundWebhookLogSchema,
  insertInviteSchema: () => insertInviteSchema,
  insertLeaveRequestSchema: () => insertLeaveRequestSchema,
  insertLessonAnalyticsSchema: () => insertLessonAnalyticsSchema,
  insertLessonSchema: () => insertLessonSchema,
  insertNdrEventSchema: () => insertNdrEventSchema,
  insertNotificationSchema: () => insertNotificationSchema,
  insertOnboardingChecklistSchema: () => insertOnboardingChecklistSchema,
  insertOrderAssignmentSchema: () => insertOrderAssignmentSchema,
  insertOrderItemSchema: () => insertOrderItemSchema,
  insertOrderSchema: () => insertOrderSchema,
  insertOrderStatusHistorySchema: () => insertOrderStatusHistorySchema,
  insertPayrollLedgerSchema: () => insertPayrollLedgerSchema,
  insertProductSchema: () => insertProductSchema,
  insertResourceSchema: () => insertResourceSchema,
  insertReturnItemSchema: () => insertReturnItemSchema,
  insertReturnSchema: () => insertReturnSchema,
  insertShipmentSchema: () => insertShipmentSchema,
  insertShopifyCredentialsSchema: () => insertShopifyCredentialsSchema,
  insertShopifySyncLogSchema: () => insertShopifySyncLogSchema,
  insertStoreSchema: () => insertStoreSchema,
  insertTeamMessageSchema: () => insertTeamMessageSchema,
  insertUserLessonProgressSchema: () => insertUserLessonProgressSchema,
  insertUserOnboardingProgressSchema: () => insertUserOnboardingProgressSchema,
  insertUserSchema: () => insertUserSchema,
  insertUserStoreSchema: () => insertUserStoreSchema,
  insertWebhookLogSchema: () => insertWebhookLogSchema,
  insertWebhookSchema: () => insertWebhookSchema,
  invites: () => invites,
  leaveRequests: () => leaveRequests,
  lessonAnalytics: () => lessonAnalytics,
  lessons: () => lessons,
  marketingMetrics: () => marketingMetrics,
  ndrEvents: () => ndrEvents,
  notifications: () => notifications,
  onboardingChecklists: () => onboardingChecklists,
  orderAssignments: () => orderAssignments,
  orderItems: () => orderItems,
  orderStatusHistory: () => orderStatusHistory,
  orders: () => orders,
  payrollLedger: () => payrollLedger,
  pincodeTiers: () => pincodeTiers,
  products: () => products,
  resources: () => resources,
  returnItems: () => returnItems,
  returns: () => returns,
  sessions: () => sessions,
  shipments: () => shipments,
  shopifyCredentials: () => shopifyCredentials,
  shopifySyncLogs: () => shopifySyncLogs,
  stores: () => stores,
  teamMessages: () => teamMessages,
  updateUserSchema: () => updateUserSchema,
  userLessonProgress: () => userLessonProgress,
  userOnboardingProgress: () => userOnboardingProgress,
  userStores: () => userStores,
  users: () => users,
  webhookLogs: () => webhookLogs,
  webhooks: () => webhooks
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, jsonb, serial, date, unique, primaryKey, index, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var sessions, users, insertUserSchema, updateUserSchema, DEFAULT_MANAGER_PERMISSIONS, invites, insertInviteSchema, stores, insertStoreSchema, userStores, insertUserStoreSchema, marketingMetrics, pincodeTiers, customers, insertCustomerSchema, orders, insertOrderSchema, orderItems, insertOrderItemSchema, products, insertProductSchema, catalogProducts, insertCatalogProductSchema, orderAssignments, insertOrderAssignmentSchema, orderStatusHistory, insertOrderStatusHistorySchema, shopifySyncLogs, insertShopifySyncLogSchema, leaveRequests, insertLeaveRequestSchema, teamMessages, insertTeamMessageSchema, webhookLogs, insertWebhookLogSchema, shopifyCredentials, insertShopifyCredentialsSchema, attendance, insertAttendanceSchema, attendanceBreaks, insertAttendanceBreakSchema, holidays, insertHolidaySchema, payrollLedger, insertPayrollLedgerSchema, calls, insertCallSchema, notifications, insertNotificationSchema, courses, insertCourseSchema, lessons, insertLessonSchema, userLessonProgress, insertUserLessonProgressSchema, lessonAnalytics, insertLessonAnalyticsSchema, resources, insertResourceSchema, onboardingChecklists, insertOnboardingChecklistSchema, userOnboardingProgress, insertUserOnboardingProgressSchema, shipments, insertShipmentSchema, ndrEvents, insertNdrEventSchema, RETURN_STATUSES, REFUND_TYPES, SHIPPING_STATUSES, SHIPPING_STATUS_LABELS, returns, returnItems, insertReturnSchema, insertReturnItemSchema, appSettings, insertAppSettingSchema, abandonedCheckouts, insertAbandonedCheckoutSchema, webhooks, insertWebhookSchema, inboundWebhookLogs, insertInboundWebhookLogSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    sessions = pgTable(
      "session",
      {
        sid: varchar("sid").primaryKey(),
        sess: json("sess").notNull(),
        expire: timestamp("expire", { precision: 6 }).notNull()
      },
      (table) => ({
        expireIdx: index("IDX_session_expire").on(table.expire)
      })
    );
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      username: text("username").notNull().unique(),
      password: text("password").notNull(),
      email: text("email").notNull().unique(),
      fullName: text("full_name").notNull(),
      phone: text("phone"),
      avatarImage: text("avatar_image"),
      // Avatar filename (e.g., "avatar_1.png")
      role: text("role").notNull().default("agent"),
      // admin, agent
      adminType: text("admin_type"),
      // full_control, partial_control (nullable, only for admins)
      permissions: jsonb("permissions"),
      // Custom permissions for partial_control admins
      department: text("department").default("Operations"),
      employeeId: text("employee_id").unique(),
      agentExtension: varchar("agent_extension", { length: 10 }),
      // IVR phone extension for agents
      presenceStatus: text("presence_status").notNull().default("present"),
      // present, onleave, inactive
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
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertUserSchema = createInsertSchema(users).pick({
      username: true,
      password: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      adminType: true,
      permissions: true,
      department: true,
      agentExtension: true
    });
    updateUserSchema = createInsertSchema(users).pick({
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
      kycDocumentUrl: true
    }).partial();
    DEFAULT_MANAGER_PERMISSIONS = {
      teamManagement: {
        viewDirectory: true,
        editProfiles: true,
        assignExtensions: false,
        manageLeaveRequests: true
      },
      orderManagement: {
        viewAllOrders: true,
        assignOrders: true,
        bulkAssign: false,
        triggerAutoAssignment: true
      },
      analytics: {
        viewTeamPerformance: true,
        viewOrderAnalytics: true,
        exportReports: true
      },
      settings: {
        manageShopify: false,
        manageIVR: false,
        configureWebhooks: false
      }
    };
    invites = pgTable("invites", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      email: text("email").notNull().unique(),
      firstName: text("first_name"),
      lastName: text("last_name"),
      role: text("role").notNull().default("agent"),
      // admin, agent
      adminType: text("admin_type"),
      // full_control, partial_control (nullable, only for admins)
      permissions: jsonb("permissions"),
      // Custom permissions for partial_control admins
      token: text("token").notNull().unique(),
      // Unique token for invite link
      invitedBy: varchar("invited_by").references(() => users.id),
      status: text("status").notNull().default("pending"),
      // pending, accepted, expired
      expiresAt: timestamp("expires_at").notNull(),
      acceptedAt: timestamp("accepted_at"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertInviteSchema = createInsertSchema(invites).pick({
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      adminType: true,
      permissions: true
    }).extend({
      email: z.string().email("Invalid email address"),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      // Allowed roles. Order matters in the dropdown rendering on the
      // client. New roles must be added in BOTH this enum and the
      // matching frontend-side `inviteUserSchema` in
      // client/src/components/team-directory.tsx, otherwise the form
      // either refuses to submit or the server refuses to accept it.
      role: z.enum(["admin", "agent", "recovery_agent", "chat_support"]).default("agent"),
      adminType: z.enum(["full_control", "partial_control"]).optional(),
      permissions: z.record(z.any()).optional()
    });
    stores = pgTable("stores", {
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
      metaAccessToken: text("meta_access_token"),
      metaAdAccountsConfig: jsonb("meta_ad_accounts_config").$type(),
      // Per-store Delhivery credentials. Token is encrypted via
      // server/encryption.ts (same AES-256-GCM helper as the Shopify /
      // Meta secrets). Both stores currently share one Delhivery account
      // in a multi-channel setup, but the schema keeps independent values
      // so they can diverge later without a migration. Outbound calls are
      // store-scoped via getDelhiveryClient(storeId); inbound webhooks are
      // routed by AWB → shipment.storeId, not by these fields.
      delhiveryApiToken: text("delhivery_api_token"),
      delhiveryClientName: text("delhivery_client_name"),
      // Per-store Resend (transactional email) credentials. API key is
      // encrypted via server/encryption.ts; from-email is stored plain.
      resendApiKey: text("resend_api_key"),
      resendFromEmail: text("resend_from_email"),
      isActive: boolean("is_active").notNull().default(true),
      lastTestedAt: timestamp("last_tested_at"),
      testStatus: text("test_status"),
      // success | failed
      testMessage: text("test_message"),
      // Audit: which admin connected the store. Nullable so the Phase-1
      // backfill (which can't know the original connector) can leave it
      // empty for the legacy store.
      connectedBy: varchar("connected_by").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertStoreSchema = createInsertSchema(stores).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    userStores = pgTable(
      "user_stores",
      {
        id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
        userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        storeId: varchar("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        createdBy: varchar("created_by").references(() => users.id)
      },
      (table) => ({
        uniqUserStore: unique().on(table.userId, table.storeId)
      })
    );
    insertUserStoreSchema = createInsertSchema(userStores).omit({
      id: true,
      createdAt: true
    });
    marketingMetrics = pgTable(
      "marketing_metrics",
      {
        // No `.primaryKey()` on `date` anymore — the PK is composite,
        // declared in the table-config block below.
        date: date("date").notNull(),
        storeId: varchar("store_id").notNull().references(() => stores.id),
        fbSpend: decimal("fb_spend", { precision: 14, scale: 2 }).notNull().default("0"),
        // Blended ROAS = fbGmv / fbSpend. Stored null when spend = 0.
        fbRoas: decimal("fb_roas", { precision: 10, scale: 4 }),
        fbGmv: decimal("fb_gmv", { precision: 14, scale: 2 }).notNull().default("0"),
        fbOrders: integer("fb_orders").notNull().default(0),
        updatedAt: timestamp("updated_at").notNull().defaultNow()
      },
      (table) => ({
        pk: primaryKey({ columns: [table.date, table.storeId] })
      })
    );
    pincodeTiers = pgTable("pincode_tiers", {
      pincode: varchar("pincode", { length: 12 }).primaryKey(),
      city: varchar("city", { length: 128 }),
      state: varchar("state", { length: 64 }),
      // 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Unknown'
      tier: varchar("tier", { length: 16 }).notNull()
    });
    customers = pgTable(
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
        metadata: jsonb("metadata"),
        // Additional Shopify customer data
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow()
      },
      (table) => ({
        uniqStoreCustomer: unique("customers_store_shopify_customer_id_key").on(
          table.storeId,
          table.shopifyCustomerId
        )
      })
    );
    insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true });
    orders = pgTable("orders", {
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
      status: text("status").notNull().default("pending"),
      // pre-ship workflow: pending, assigned, confirmed | then a SHIPPING_STATUSES value (see unified list)
      callStatus: text("call_status").notNull().default("Pending"),
      // Pending, Confirmed, Cancelled, Follow Up
      fulfillmentStatus: text("fulfillment_status"),
      // Shopify fulfillment status
      fulfilledAt: timestamp("fulfilled_at"),
      financialStatus: text("financial_status"),
      // Shopify financial status
      paymentMethod: text("payment_method").notNull(),
      // prepaid, cod
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
      shippingAddress: jsonb("shipping_address"),
      // Full address object
      shippingAddressLine1: text("shipping_address_line1"),
      shippingAddressLine2: text("shipping_address_line2"),
      shippingCity: text("shipping_city"),
      shippingState: text("shipping_state"),
      shippingPincode: text("shipping_pincode"),
      shippingCountry: text("shipping_country"),
      // Items summary
      itemsCount: integer("items_count").default(1),
      itemsSummary: text("items_summary"),
      // e.g., "Product A, Product B"
      // Assignment
      assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
      assignedAt: timestamp("assigned_at"),
      // Tracking
      courierName: text("courier_name"),
      trackingNumber: text("tracking_number"),
      trackingUrl: text("tracking_url"),
      shipmentStatus: text("shipment_status"),
      // NDR (Non-Delivery Report) fields
      nslCode: text("nsl_code"),
      // Delhivery NDR code (e.g., "EOD-6", "EOD-74")
      failureReason: text("failure_reason"),
      // Human-readable failure reason
      lastFailedAt: timestamp("last_failed_at"),
      // Timestamp of last delivery failure
      isActionable: boolean("is_actionable").default(false),
      // Whether NDR requires customer action
      // Metadata
      tags: text("tags").array(),
      notes: text("notes"),
      // Shopify marks test orders (created via Bogus Gateway or test mode) with
      // order.test = true. Pare's analytics MUST exclude these from the
      // financial waterfall — they don't appear in Shopify's own sales reports.
      testOrder: boolean("test_order").notNull().default(false),
      rawShopifyData: jsonb("raw_shopify_data"),
      // Store full Shopify order data
      // Shopify Sync Tracking
      lastSyncedAt: timestamp("last_synced_at"),
      syncStatus: text("sync_status").notNull().default("not_synced"),
      // not_synced, synced, failed
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
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      // Phase 5 (Risk #4): composite uniqueness so two stores never
      // collide on a Shopify order id. The webhook handler in
      // server/webhooks.ts now scopes its `getOrderByShopifyId` lookup
      // by (storeId, shopifyOrderId) to match.
      uniqStoreOrder: unique("orders_store_shopify_order_id_key").on(
        table.storeId,
        table.shopifyOrderId
      )
    }));
    insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
    orderItems = pgTable("order_items", {
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
      // Line-item discount from Shopify (line_item.total_discount), across the
      // whole line's quantity. Used to compute the true refundable value —
      // e.g. a 100%-off free gift has price>0 but total_discount==price, so it
      // contributes ₹0 to a refund.
      totalDiscount: decimal("total_discount", { precision: 12, scale: 2 }).default("0"),
      imageUrl: text("image_url"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true, createdAt: true });
    products = pgTable(
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
        updatedAt: timestamp("updated_at").notNull().defaultNow()
      },
      (table) => ({
        uniqStoreVariant: unique("products_store_shopify_variant_id_key").on(
          table.storeId,
          table.shopifyVariantId
        )
      })
    );
    insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true, updatedAt: true });
    catalogProducts = pgTable(
      "catalog_products",
      {
        id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
        storeId: varchar("store_id").references(() => stores.id),
        shopifyProductId: text("shopify_product_id").notNull(),
        // ── Shopify-native fields (overwritten on every sync, never by the user) ──
        title: text("title").notNull(),
        imageUrl: text("image_url"),
        status: text("status").notNull().default("active"),
        totalInventory: integer("total_inventory").notNull().default(0),
        price: text("price"),
        compareAtPrice: text("compare_at_price"),
        productType: text("product_type"),
        vendor: text("vendor"),
        variantCount: integer("variant_count").notNull().default(1),
        sku: text("sku"),
        barcode: text("barcode"),
        weight: decimal("weight", { precision: 10, scale: 3 }),
        weightUnit: text("weight_unit"),
        // ── ERP financial fields (user-editable, NEVER touched by the sync engine) ──
        cogs: decimal("cogs", { precision: 12, scale: 2 }),
        packagingCost: decimal("packaging_cost", { precision: 12, scale: 2 }),
        gstRate: decimal("gst_rate", { precision: 5, scale: 2 }),
        hsnCode: text("hsn_code"),
        dimensionLength: decimal("dimension_length", { precision: 8, scale: 2 }),
        dimensionWidth: decimal("dimension_width", { precision: 8, scale: 2 }),
        dimensionHeight: decimal("dimension_height", { precision: 8, scale: 2 }),
        lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow()
      },
      (table) => ({
        uniqStoreProduct: unique("catalog_products_store_shopify_product_id_key").on(
          table.storeId,
          table.shopifyProductId
        )
      })
    );
    insertCatalogProductSchema = createInsertSchema(catalogProducts).omit({ id: true, createdAt: true, updatedAt: true });
    orderAssignments = pgTable("order_assignments", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Denormalised from parent order for direct store-scoped queries.
      storeId: varchar("store_id").references(() => stores.id),
      orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "set null" }),
      note: text("note"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertOrderAssignmentSchema = createInsertSchema(orderAssignments).omit({ id: true, createdAt: true });
    orderStatusHistory = pgTable("order_status_history", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Denormalised from parent order. Pare analytics reads this heavily;
      // having storeId on the row avoids a join on every analytics query.
      storeId: varchar("store_id").references(() => stores.id),
      orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      status: text("status").notNull(),
      previousStatus: text("previous_status"),
      changedBy: varchar("changed_by").references(() => users.id),
      note: text("note"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistory).omit({ id: true, createdAt: true });
    shopifySyncLogs = pgTable("shopify_sync_logs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Each sync attempt is per-store (outbound tag/note/metafield updates).
      storeId: varchar("store_id").references(() => stores.id),
      orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      shopifyOrderId: text("shopify_order_id").notNull(),
      syncType: text("sync_type").notNull(),
      // confirmed, cancelled, followup
      syncAction: text("sync_action").notNull(),
      // add_tag, add_note, cancel_order, update_metafield
      syncStatus: text("sync_status").notNull().default("pending"),
      // pending, success, failed
      requestPayload: jsonb("request_payload"),
      responseData: jsonb("response_data"),
      errorMessage: text("error_message"),
      retryCount: integer("retry_count").notNull().default(0),
      syncedAt: timestamp("synced_at"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertShopifySyncLogSchema = createInsertSchema(shopifySyncLogs).omit({ id: true, createdAt: true, updatedAt: true });
    leaveRequests = pgTable("leave_requests", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      leaveType: text("leave_type").notNull(),
      // sick, casual, vacation
      startDate: timestamp("start_date").notNull(),
      endDate: timestamp("end_date").notNull(),
      reason: text("reason"),
      status: text("status").notNull().default("pending"),
      // pending, approved, rejected
      reviewedBy: varchar("reviewed_by").references(() => users.id),
      reviewedAt: timestamp("reviewed_at"),
      reviewNote: text("review_note"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({ id: true, createdAt: true, updatedAt: true }).extend({
      startDate: z.union([z.date(), z.string().transform((str) => new Date(str))]),
      endDate: z.union([z.date(), z.string().transform((str) => new Date(str))])
    });
    teamMessages = pgTable("team_messages", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      fromUserId: varchar("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      toUserId: varchar("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      message: text("message").notNull(),
      isRead: boolean("is_read").notNull().default(false),
      readAt: timestamp("read_at"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertTeamMessageSchema = createInsertSchema(teamMessages).omit({ id: true, createdAt: true });
    webhookLogs = pgTable("webhook_logs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Which store this webhook payload was resolved to. Phase 5 reads
      // X-Shopify-Shop-Domain to populate this; until then, every row
      // inherits the single legacy store via backfill.
      storeId: varchar("store_id").references(() => stores.id),
      topic: text("topic").notNull(),
      // e.g., "orders/create"
      shopifyOrderId: text("shopify_order_id"),
      payload: jsonb("payload").notNull(),
      processed: boolean("processed").notNull().default(false),
      processedAt: timestamp("processed_at"),
      error: text("error"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertWebhookLogSchema = createInsertSchema(webhookLogs).omit({ id: true, createdAt: true });
    shopifyCredentials = pgTable("shopify_credentials", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      storeName: text("store_name"),
      // Display name fetched from Shopify on connect
      storeUrl: text("store_url").notNull(),
      // shopDomain — e.g. store.myshopify.com
      apiKey: text("api_key").notNull(),
      // clientId — Encrypted
      apiSecret: text("api_secret").notNull(),
      // clientSecret — Encrypted
      accessToken: text("access_token"),
      // Deprecated: no longer used (Client Credentials flow)
      webhookSecret: text("webhook_secret"),
      // Encrypted, optional
      isActive: boolean("is_active").notNull().default(true),
      lastTestedAt: timestamp("last_tested_at"),
      testStatus: text("test_status"),
      // success, failed
      testMessage: text("test_message"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertShopifyCredentialsSchema = createInsertSchema(shopifyCredentials).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      storeName: z.string().optional(),
      storeUrl: z.string().min(1, "Shop domain is required").regex(/\.myshopify\.com$/, "Shop domain must end with .myshopify.com"),
      apiKey: z.string().min(1, "Client ID is required"),
      apiSecret: z.string().min(1, "Client Secret is required"),
      accessToken: z.string().optional(),
      webhookSecret: z.string().optional()
    });
    attendance = pgTable("attendance", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      date: timestamp("date").notNull(),
      clockInTime: timestamp("clock_in_time"),
      clockOutTime: timestamp("clock_out_time"),
      status: text("status").notNull().default("present"),
      // present, absent, leave
      totalHours: decimal("total_hours", { precision: 5, scale: 2 }),
      // Calculated field
      notes: text("notes"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertAttendanceSchema = createInsertSchema(attendance).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    attendanceBreaks = pgTable("attendance_breaks", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      attendanceId: varchar("attendance_id").notNull().references(() => attendance.id, { onDelete: "cascade" }),
      breakStart: timestamp("break_start").notNull(),
      breakEnd: timestamp("break_end"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertAttendanceBreakSchema = createInsertSchema(attendanceBreaks).omit({
      id: true,
      createdAt: true
    });
    holidays = pgTable("holidays", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      date: date("date").notNull(),
      // YYYY-MM-DD; PG `date` type, not timestamptz
      name: text("name").notNull(),
      // "Diwali", "Republic Day", etc.
      state: text("state").notNull(),
      // MUMBAI | DELHI | BENGALURU | HYDERABAD
      type: text("type").notNull(),
      // Fixed | Optional
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertHolidaySchema = createInsertSchema(holidays).omit({
      id: true,
      createdAt: true
    });
    payrollLedger = pgTable("payroll_ledger", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      year: integer("year").notNull(),
      month: integer("month").notNull(),
      // 1–12
      // ── Base-pay inputs ─────────────────────────────────────────────
      baseSalary: decimal("base_salary", { precision: 12, scale: 2 }).notNull(),
      expectedWorkingDays: integer("expected_working_days").notNull(),
      daysPresent: integer("days_present").notNull(),
      paidHolidaysUsed: integer("paid_holidays_used").notNull().default(0),
      // Capped ratio ((daysPresent + paidHolidays) / expectedDays), max 1.0
      basePayRatio: decimal("base_pay_ratio", { precision: 5, scale: 4 }).notNull(),
      basePayAmount: decimal("base_pay_amount", { precision: 12, scale: 2 }).notNull(),
      // ── Incentive inputs (% values stored as 0–100, not 0–1) ────────
      compensationProfile: text("compensation_profile"),
      // mirrors users.compensationProfile at run time
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
      status: text("status").notNull().default("finalized"),
      // finalized | sent | failed
      pdfFilename: text("pdf_filename"),
      // relative to uploads/payslips/
      recipientEmail: text("recipient_email"),
      sentAt: timestamp("sent_at"),
      emailError: text("email_error"),
      // populated on failure for retry / debug
      // Free-text notes the admin attached on Run (override reasons, etc.)
      notes: text("notes"),
      createdBy: varchar("created_by").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertPayrollLedgerSchema = createInsertSchema(payrollLedger).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    calls = pgTable("calls", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Denormalised from parent order so call-log queries are
      // store-scoped without joining orders.
      storeId: varchar("store_id").references(() => stores.id),
      orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      agentId: varchar("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      customerPhone: text("customer_phone").notNull(),
      callStatus: text("call_status").notNull().default("initiated"),
      // initiated, connected, failed, completed
      calledAt: timestamp("called_at").notNull().defaultNow(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      // Webhook data fields (populated by IVR provider callback)
      callDuration: integer("call_duration"),
      // Duration in seconds
      recordingUrl: text("recording_url"),
      // URL to call recording
      callReference: text("call_reference"),
      // Unique reference from IVR provider
      recipientNumber: text("recipient_number"),
      // The actual number that was called
      ivrStatus: text("ivr_status"),
      // Status reported by IVR provider
      completedAt: timestamp("completed_at"),
      // When the call actually completed
      webhookData: jsonb("webhook_data"),
      // Full webhook payload for debugging
      // Future feature fields
      transcript: text("transcript"),
      // Call transcript (populated by speech-to-text service)
      aiAnalysis: jsonb("ai_analysis")
      // AI-powered insights and analysis
    });
    insertCallSchema = createInsertSchema(calls).omit({
      id: true,
      calledAt: true,
      createdAt: true
    });
    notifications = pgTable("notifications", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      orderId: varchar("order_id").references(() => orders.id, { onDelete: "cascade" }),
      type: text("type").notNull(),
      // followup_reminder, order_assigned, status_change
      title: text("title").notNull(),
      message: text("message").notNull(),
      isRead: boolean("is_read").notNull().default(false),
      readAt: timestamp("read_at"),
      actionUrl: text("action_url"),
      // URL to navigate when clicked
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertNotificationSchema = createInsertSchema(notifications).omit({
      id: true,
      createdAt: true
    });
    courses = pgTable("courses", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      title: text("title").notNull(),
      slug: text("slug").notNull().unique(),
      description: text("description").notNull(),
      thumbnail: text("thumbnail"),
      // URL to course thumbnail image
      category: text("category").notNull(),
      // Onboarding, Advanced Techniques, Policy & Compliance, Product Training, Soft Skills
      tags: text("tags").array().default(sql`ARRAY[]::text[]`),
      authorId: varchar("author_id").references(() => users.id),
      // Prerequisite system
      prerequisiteCourseIds: text("prerequisite_course_ids").array().default(sql`ARRAY[]::text[]`),
      // Course IDs that must be completed first
      // Metadata
      estimatedDuration: integer("estimated_duration"),
      // In minutes
      difficulty: text("difficulty").default("beginner"),
      // beginner, intermediate, advanced
      isPublished: boolean("is_published").notNull().default(false),
      order: integer("order").default(0),
      // Display order within category
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertCourseSchema = createInsertSchema(courses).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    lessons = pgTable("lessons", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      courseId: varchar("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
      title: text("title").notNull(),
      slug: text("slug").notNull().unique(),
      description: text("description"),
      // Content
      content: text("content"),
      // Rich text/markdown content (from WYSIWYG editor)
      videoUrl: text("video_url"),
      // YouTube/Vimeo embed URL
      videoDuration: integer("video_duration"),
      // In seconds
      // Prerequisite system
      prerequisiteLessonIds: text("prerequisite_lesson_ids").array().default(sql`ARRAY[]::text[]`),
      // Lesson IDs that must be completed first
      // Metadata
      order: integer("order").notNull().default(0),
      // Order within course
      estimatedDuration: integer("estimated_duration"),
      // In minutes
      isPublished: boolean("is_published").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertLessonSchema = createInsertSchema(lessons).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    userLessonProgress = pgTable("user_lesson_progress", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      lessonId: varchar("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
      // Progress tracking
      completionPercentage: integer("completion_percentage").notNull().default(0),
      // 0-100
      isCompleted: boolean("is_completed").notNull().default(false),
      completedAt: timestamp("completed_at"),
      // Engagement tracking
      timeSpent: integer("time_spent").default(0),
      // In seconds
      lastAccessedAt: timestamp("last_accessed_at"),
      isBookmarked: boolean("is_bookmarked").notNull().default(false),
      // Video progress
      videoProgress: integer("video_progress").default(0),
      // In seconds - how far into the video they watched
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertUserLessonProgressSchema = createInsertSchema(userLessonProgress).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    lessonAnalytics = pgTable("lesson_analytics", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      lessonId: varchar("lesson_id").notNull().unique().references(() => lessons.id, { onDelete: "cascade" }),
      // Aggregate metrics
      totalViews: integer("total_views").notNull().default(0),
      uniqueViews: integer("unique_views").notNull().default(0),
      totalCompletions: integer("total_completions").notNull().default(0),
      averageCompletionTime: integer("average_completion_time").default(0),
      // In seconds
      averageTimeSpent: integer("average_time_spent").default(0),
      // In seconds
      // Completion rate
      completionRate: decimal("completion_rate", { precision: 5, scale: 2 }).default("0"),
      // Percentage
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertLessonAnalyticsSchema = createInsertSchema(lessonAnalytics).omit({
      id: true,
      updatedAt: true
    });
    resources = pgTable("resources", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      title: text("title").notNull(),
      description: text("description"),
      type: text("type").notNull(),
      // video, pdf, template, sop, checklist
      category: text("category").notNull(),
      // Same as courses: Onboarding, Advanced Techniques, etc.
      // File details
      fileUrl: text("file_url").notNull(),
      // URL to the file (S3, local storage, etc.)
      fileSize: integer("file_size"),
      // In bytes
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
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertResourceSchema = createInsertSchema(resources).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    onboardingChecklists = pgTable("onboarding_checklists", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      title: text("title").notNull(),
      description: text("description"),
      role: text("role").notNull(),
      // admin, agent - role-specific checklists
      // Milestones (stored as JSONB array)
      // Each milestone: { id, title, description, type, resourceId, order, isRequired }
      milestones: jsonb("milestones").notNull(),
      isActive: boolean("is_active").notNull().default(true),
      order: integer("order").default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertOnboardingChecklistSchema = createInsertSchema(onboardingChecklists).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    userOnboardingProgress = pgTable("user_onboarding_progress", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      checklistId: varchar("checklist_id").notNull().references(() => onboardingChecklists.id, { onDelete: "cascade" }),
      // Progress tracking (stored as JSONB)
      // { milestoneId: { completed: boolean, completedAt: timestamp, signedOffBy: userId } }
      progress: jsonb("progress").notNull().default("{}"),
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
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertUserOnboardingProgressSchema = createInsertSchema(userOnboardingProgress).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    shipments = pgTable("shipments", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Denormalised from parent order.
      storeId: varchar("store_id").references(() => stores.id),
      orderId: varchar("order_id").notNull().unique().references(() => orders.id, { onDelete: "cascade" }),
      // One shipment per order
      shopifyOrderId: text("shopify_order_id").notNull(),
      // Shiprocket shipment data
      shiprocketOrderId: text("shiprocket_order_id").unique(),
      shiprocketShipmentId: text("shiprocket_shipment_id").unique(),
      awb: text("awb"),
      // Airway Bill Number (tracking number) - can be null/empty initially, assigned later by courier
      // Courier details
      courierName: text("courier_name"),
      courierId: text("courier_id"),
      // Shipment status
      status: text("status").notNull().default("created"),
      // created, pickup_scheduled, in_transit, out_for_delivery, delivered, ndr, rto, cancelled
      currentStatus: text("current_status"),
      // Latest status from courier
      statusUpdatedAt: timestamp("status_updated_at"),
      // Tracking
      trackingUrl: text("tracking_url"),
      estimatedDeliveryDate: timestamp("estimated_delivery_date"),
      // Shipping details
      pickupScheduledDate: timestamp("pickup_scheduled_date"),
      pickedUpAt: timestamp("picked_up_at"),
      deliveredAt: timestamp("delivered_at"),
      // Weight and dimensions
      weight: decimal("weight", { precision: 10, scale: 2 }),
      // in kg
      length: decimal("length", { precision: 10, scale: 2 }),
      // in cm
      breadth: decimal("breadth", { precision: 10, scale: 2 }),
      // in cm
      height: decimal("height", { precision: 10, scale: 2 }),
      // in cm
      // Printable shipping label / packing slip. For Delhivery this is the
      // packing-slip PDF link returned by /api/p/packing_slip; for
      // Shiprocket it's the label_url from the label-generation call.
      shippingLabelUrl: text("shipping_label_url"),
      // Metadata
      rawShiprocketData: jsonb("raw_shiprocket_data"),
      // Full response from Shiprocket
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertShipmentSchema = createInsertSchema(shipments).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    ndrEvents = pgTable("ndr_events", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Denormalised from parent order/shipment.
      storeId: varchar("store_id").references(() => stores.id),
      shipmentId: varchar("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
      orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
      awb: text("awb").notNull(),
      // NDR Details
      ndrStatus: text("ndr_status").notNull(),
      // customer_unavailable, address_issue, refused, other
      ndrReason: text("ndr_reason").notNull(),
      // Detailed reason from courier
      ndrDate: timestamp("ndr_date").notNull(),
      // Action taken
      actionTaken: text("action_taken"),
      // reattempt_scheduled, customer_contacted, rto_initiated, resolved
      actionBy: varchar("action_by").references(() => users.id),
      actionNotes: text("action_notes"),
      actionAt: timestamp("action_at"),
      // Reattempt details
      reattemptScheduled: boolean("reattempt_scheduled").notNull().default(false),
      reattemptDate: timestamp("reattempt_date"),
      reattemptAwb: text("reattempt_awb"),
      // New AWB if rescheduled
      // Updated delivery details (if customer provided new info)
      updatedPhone: text("updated_phone"),
      updatedAddress: jsonb("updated_address"),
      // Resolution
      resolved: boolean("resolved").notNull().default(false),
      resolvedAt: timestamp("resolved_at"),
      resolution: text("resolution"),
      // delivered, returned, cancelled
      // Metadata
      rawNdrData: jsonb("raw_ndr_data"),
      // Full NDR webhook payload
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertNdrEventSchema = createInsertSchema(ndrEvents).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    RETURN_STATUSES = [
      "PENDING_FEE",
      "PENDING_APPROVAL",
      "APPROVED",
      "PICKUP_SCHEDULED",
      "IN_TRANSIT",
      "RECEIVED",
      "INSPECTED",
      "REFUNDED",
      "REJECTED"
    ];
    REFUND_TYPES = ["STORE_CREDIT", "ORIGINAL_PAYMENT", "NO_REFUND"];
    SHIPPING_STATUSES = [
      "unfulfilled",
      "awb_assigned",
      // AWB Assigned / Ready To Ship
      "ready_for_pickup",
      "picked_up",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "ndr",
      // displayed as "Undelivered"
      "rto_initiated",
      // displayed as "RTO in Transit"
      "rto_ofd",
      // RTO Out for Delivery
      "rto_delivered",
      // RTO Delivered / Returned
      "cancelled",
      "lost"
    ];
    SHIPPING_STATUS_LABELS = {
      unfulfilled: "Unfulfilled",
      awb_assigned: "AWB Assigned",
      ready_for_pickup: "Ready for Pickup",
      picked_up: "Picked Up",
      in_transit: "In Transit",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      ndr: "Undelivered",
      rto_initiated: "RTO in Transit",
      rto_ofd: "RTO OFD",
      rto_delivered: "RTO Delivered",
      cancelled: "Cancelled",
      lost: "Lost"
    };
    returns = pgTable(
      "returns",
      {
        id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
        storeId: varchar("store_id").references(() => stores.id),
        orderId: varchar("order_id").references(() => orders.id, { onDelete: "cascade" }),
        rmaNumber: text("rma_number").notNull().unique(),
        status: text("status").notNull().default("PENDING_APPROVAL"),
        returnReason: text("return_reason"),
        customerNotes: text("customer_notes"),
        returnFeePaid: boolean("return_fee_paid").notNull().default(false),
        // PayU gateway transaction id (mihpayid) once the return fee is paid.
        payuTransactionId: text("payu_transaction_id"),
        refundAmount: decimal("refund_amount", { precision: 12, scale: 2 }),
        refundType: text("refund_type").notNull().default("STORE_CREDIT"),
        trackingAwb: text("tracking_awb"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow()
      }
    );
    returnItems = pgTable("return_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      returnId: varchar("return_id").notNull().references(() => returns.id, { onDelete: "cascade" }),
      orderItemId: varchar("order_item_id").references(() => orderItems.id),
      quantity: integer("quantity").notNull().default(1),
      // Why the customer is returning this specific line item. Distinct from
      // `condition`, which records the physical state on inspection.
      returnReason: text("return_reason"),
      condition: text("condition"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertReturnSchema = createInsertSchema(returns).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertReturnItemSchema = createInsertSchema(returnItems).omit({
      id: true,
      createdAt: true
    });
    appSettings = pgTable(
      "app_settings",
      {
        storeId: varchar("store_id").notNull().references(() => stores.id, {
          onDelete: "cascade"
        }),
        key: text("key").notNull(),
        value: jsonb("value").notNull(),
        updatedAt: timestamp("updated_at").notNull().defaultNow()
      },
      (table) => ({
        pk: primaryKey({ columns: [table.storeId, table.key] })
      })
    );
    insertAppSettingSchema = createInsertSchema(appSettings);
    abandonedCheckouts = pgTable("abandoned_checkouts", {
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
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertAbandonedCheckoutSchema = createInsertSchema(abandonedCheckouts).omit({
      id: true,
      createdAt: true
    });
    webhooks = pgTable("webhooks", {
      id: serial("id").primaryKey(),
      eventType: text("event_type").notNull(),
      url: text("url").notNull(),
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertWebhookSchema = createInsertSchema(webhooks).omit({
      id: true,
      createdAt: true
    });
    inboundWebhookLogs = pgTable("inbound_webhook_logs", {
      id: serial("id").primaryKey(),
      source: text("source").notNull().default("telecrm"),
      eventType: text("event_type"),
      payload: jsonb("payload"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertInboundWebhookLogSchema = createInsertSchema(inboundWebhookLogs).omit({
      id: true,
      createdAt: true
    });
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  pool: () => pool
});
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
var parseDatabaseUrl, connectionConfig, pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    delete process.env.PGHOST;
    delete process.env.PGPORT;
    delete process.env.PGUSER;
    delete process.env.PGPASSWORD;
    delete process.env.PGDATABASE;
    neonConfig.webSocketConstructor = ws;
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    parseDatabaseUrl = (url) => {
      const parsed = new URL(url);
      const config = {
        host: parsed.hostname,
        port: parseInt(parsed.port || "5432"),
        database: parsed.pathname.slice(1).split("?")[0],
        user: parsed.username,
        password: parsed.password,
        ssl: { rejectUnauthorized: false }
        // Neon requires SSL
      };
      console.log("Database connection config:", {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        passwordLength: config.password?.length || 0,
        ssl: config.ssl
      });
      return config;
    };
    connectionConfig = parseDatabaseUrl(process.env.DATABASE_URL);
    pool = new Pool({
      ...connectionConfig,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 1e4
    });
    pool.on("error", (err) => {
      console.error("Unexpected database pool error:", err.message);
      console.error("Error code:", err.code);
      if (err.code === "57P01") {
        console.log("Database admin shutdown detected (57P01). Pool will reconnect on next query.");
      }
    });
    db = drizzle({ client: pool, schema: schema_exports });
  }
});

// server/storage.ts
var storage_exports = {};
__export(storage_exports, {
  DbStorage: () => DbStorage,
  storage: () => storage
});
import { eq, and, desc, asc, or, count, gte, lte, sql as sql2, isNull, isNotNull, inArray } from "drizzle-orm";
function getRandomAvatar() {
  return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
}
function parsePostgresArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  const str = value.trim();
  if (!str.startsWith("{") || !str.endsWith("}")) return [];
  const inner = str.slice(1, -1);
  if (inner === "") return [];
  const result = [];
  let current = "";
  let inQuotes = false;
  let i = 0;
  while (i < inner.length) {
    const char = inner[i];
    if (inQuotes) {
      if (char === '"') {
        if (inner[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else if (char === "\\" && i + 1 < inner.length) {
        current += inner[i + 1];
        i += 2;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        result.push(current);
        current = "";
        i++;
        continue;
      }
    }
    current += char;
    i++;
  }
  result.push(current);
  return result;
}
var AVATAR_OPTIONS, DbStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_db();
    init_schema();
    AVATAR_OPTIONS = ["avatar_1.png", "avatar_2.png", "avatar_3.png", "avatar_4.png", "avatar_5.png", "avatar_6.png"];
    DbStorage = class {
      // ============================================================================
      // USERS
      // ============================================================================
      async getUser(id) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user;
      }
      async getUserByUsername(username) {
        const [user] = await db.select().from(users).where(eq(users.username, username));
        return user;
      }
      async getUserByEmail(email) {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        return user;
      }
      async getUserByAgentExtension(agentExtension) {
        const [user] = await db.select().from(users).where(eq(users.agentExtension, agentExtension));
        return user;
      }
      async createUser(insertUser) {
        const userWithAvatar = {
          ...insertUser,
          avatarImage: getRandomAvatar()
        };
        const [user] = await db.insert(users).values(userWithAvatar).returning();
        return user;
      }
      async updateUser(id, data) {
        const [user] = await db.update(users).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id)).returning();
        return user;
      }
      // Dedicated password-write path. Kept separate from updateUser()
      // because the public update schema deliberately excludes `password`
      // (no PATCH /api/users/:id should accept a password change without
      // going through the auth flow). The bcrypt-hashed value is the only
      // thing that should ever land in users.password — callers must hash
      // before invoking this.
      async setUserPassword(id, hashedPassword) {
        await db.update(users).set({ password: hashedPassword, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, id));
      }
      async deleteUser(id) {
        await db.delete(users).where(eq(users.id, id));
      }
      async listUsers(filters) {
        const conditions = [];
        if (filters?.role) conditions.push(eq(users.role, filters.role));
        if (filters?.isActive !== void 0)
          conditions.push(eq(users.isActive, filters.isActive));
        if (conditions.length > 0) {
          return await db.select().from(users).where(and(...conditions));
        }
        return await db.select().from(users);
      }
      // ============================================================================
      // INVITES
      // ============================================================================
      async createInvite(inviteData) {
        const [invite] = await db.insert(invites).values(inviteData).returning();
        return invite;
      }
      async getInviteByToken(token) {
        const [invite] = await db.select().from(invites).where(eq(invites.token, token));
        return invite;
      }
      async getInviteByEmail(email) {
        const [invite] = await db.select().from(invites).where(eq(invites.email, email));
        return invite;
      }
      async getInvite(id) {
        const [invite] = await db.select().from(invites).where(eq(invites.id, id));
        return invite;
      }
      async updateInviteStatus(id, status) {
        await db.update(invites).set({
          status,
          acceptedAt: status === "accepted" ? /* @__PURE__ */ new Date() : void 0
        }).where(eq(invites.id, id));
      }
      async resetInviteForResend(email, data) {
        const [invite] = await db.update(invites).set({
          token: data.token,
          expiresAt: data.expiresAt,
          status: "pending",
          role: data.role,
          invitedBy: data.invitedBy,
          firstName: data.firstName || null,
          lastName: data.lastName || null,
          acceptedAt: null
        }).where(eq(invites.email, email)).returning();
        return invite;
      }
      async reactivateUser(id, updates) {
        const [user] = await db.update(users).set({
          isActive: true,
          role: updates.role,
          adminType: updates.adminType,
          permissions: updates.permissions,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(users.id, id)).returning();
        return user;
      }
      async updateInvitePermissions(id, adminType, permissions) {
        const [invite] = await db.update(invites).set({
          adminType,
          permissions
        }).where(eq(invites.id, id)).returning();
        return invite;
      }
      async listPendingInvites() {
        return await db.select().from(invites).where(eq(invites.status, "pending"));
      }
      // ============================================================================
      // CUSTOMERS
      // ============================================================================
      async getCustomer(id) {
        const [customer] = await db.select().from(customers).where(eq(customers.id, id));
        return customer;
      }
      /**
       * Look up a customer by (storeId, shopifyCustomerId). Phase 5
       * (Risk #4): the bare-id lookup is no longer safe — two stores
       * with overlapping Shopify customer ids would collide. Every
       * caller now MUST supply the storeId resolved upstream (from
       * `req.storeScope` for HTTP routes, or `resolveWebhookStore` for
       * webhook handlers).
       */
      async getCustomerByShopifyId(shopifyId, storeId) {
        const [customer] = await db.select().from(customers).where(
          and(
            eq(customers.shopifyCustomerId, shopifyId),
            eq(customers.storeId, storeId)
          )
        );
        return customer;
      }
      async createCustomer(insertCustomer) {
        const [customer] = await db.insert(customers).values(insertCustomer).returning();
        return customer;
      }
      /**
       * Batched customer lookup, scoped to a single store. Used by the
       * historical sync's batch path. Phase 5 (Risk #4): without the
       * storeId predicate, a shopify_customer_id that exists in two
       * tenants would resolve ambiguously and the later sync would
       * link a new order to the wrong tenant's customer row.
       */
      async getCustomersByShopifyIds(shopifyIds, storeId) {
        if (shopifyIds.length === 0) return [];
        return await db.select().from(customers).where(
          and(
            eq(customers.storeId, storeId),
            inArray(customers.shopifyCustomerId, shopifyIds)
          )
        );
      }
      async createCustomersBatch(insertCustomers) {
        if (insertCustomers.length === 0) return [];
        return await db.insert(customers).values(insertCustomers).returning();
      }
      async updateCustomer(id, data) {
        const [customer] = await db.update(customers).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(customers.id, id)).returning();
        return customer;
      }
      // ============================================================================
      // ORDERS
      // ============================================================================
      async getOrder(id) {
        const [order] = await db.select().from(orders).where(eq(orders.id, id));
        return order;
      }
      /**
       * Look up an order by (storeId, shopifyOrderId). Phase 5 (Risk #4):
       * Shopify order ids are globally-monotone integers, so high-volume
       * tenants WILL collide eventually. The composite UNIQUE on
       * (storeId, shopifyOrderId) + this scoped lookup are what make
       * multi-tenant safe.
       */
      async getOrderByShopifyId(shopifyId, storeId) {
        const [order] = await db.select().from(orders).where(
          and(
            eq(orders.shopifyOrderId, shopifyId),
            eq(orders.storeId, storeId)
          )
        );
        return order;
      }
      /**
       * Look up an order by Shopify's human-readable `name` field (the
       * "#1234" you see in the Shopify admin). Accepts an optional
       * storeId — strongly preferred. When omitted, the lookup is
       * global and returns the most recent match by createdAt; today
       * only the TeleCRM webhook calls it without a storeId because
       * the CRM payload doesn't yet carry a shop hint. Tracked as
       * Risk #2 in the multi-store audit — once IVR/TeleCRM moves to
       * per-store credentials, that caller will pass a storeId and we
       * can make this parameter required.
       */
      async getOrderByShopifyOrderNumber(orderNumber, storeId) {
        const conds = [eq(orders.shopifyOrderNumber, orderNumber)];
        if (storeId) conds.push(eq(orders.storeId, storeId));
        const [order] = await db.select().from(orders).where(and(...conds)).orderBy(desc(orders.createdAt)).limit(1);
        return order;
      }
      async getOrderByTrackingNumber(trackingNumber) {
        const [order] = await db.select().from(orders).where(eq(orders.trackingNumber, trackingNumber));
        return order;
      }
      async createOrder(insertOrder) {
        const [order] = await db.insert(orders).values(insertOrder).returning();
        return order;
      }
      async createOrdersBatch(insertOrders) {
        if (insertOrders.length === 0) return [];
        return await db.insert(orders).values(insertOrders).returning();
      }
      /**
       * Returns the subset of `shopifyIds` already present in this store's
       * orders. Required storeId — Phase 5 (Risk #4) made
       * `shopify_order_id` no longer globally unique, so the historical
       * sync needs per-store dedup or it will treat a coincidentally-
       * matching id from another tenant as "already imported" and skip
       * a real new order.
       */
      async getExistingShopifyOrderIds(shopifyIds, storeId) {
        if (shopifyIds.length === 0) return /* @__PURE__ */ new Set();
        const rows = await db.select({ shopifyOrderId: orders.shopifyOrderId }).from(orders).where(
          and(
            eq(orders.storeId, storeId),
            inArray(orders.shopifyOrderId, shopifyIds)
          )
        );
        return new Set(
          rows.map((r) => r.shopifyOrderId).filter((v) => v !== null && v !== void 0)
        );
      }
      /**
       * Highest `shopify_order_id` already imported FOR THIS STORE. The
       * historical sync uses this as the `since_id` cursor so each store
       * resumes from its own high-water mark.
       *
       * Why required storeId: without it, calling Sync on a brand-new
       * store with zero local rows returned the OLDER store's max id
       * (Shopify ids are globally-monotonic integers shared across all
       * tenants), making the next Shopify page fetch ask for orders
       * `id > <very-large-number>`. The new store's orders all sit below
       * that bound and the sync returned 0 orders — the bug the user
       * reported on Glow & Me. Per-store cursor closes the trap.
       */
      async getMaxShopifyOrderId(storeId) {
        const rows = await db.execute(
          sql2`
        SELECT MAX(CAST(${orders.shopifyOrderId} AS BIGINT))::text AS max_id
        FROM ${orders}
        WHERE ${orders.storeId} = ${storeId}
      `
        );
        const first = rows.rows?.[0] ?? rows[0];
        return first?.max_id ?? null;
      }
      async updateOrder(id, data) {
        const [order] = await db.update(orders).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(orders.id, id)).returning();
        return order;
      }
      async listOrders(filters) {
        const conditions = [];
        if (filters?.storeId)
          conditions.push(eq(orders.storeId, filters.storeId));
        if (filters?.status) conditions.push(eq(orders.status, filters.status));
        if (filters?.callStatus) {
          if (filters.callStatus === "Pending") {
            conditions.push(sql2`(${orders.callStatus} IS NULL OR ${orders.callStatus} = 'Pending')`);
          } else {
            conditions.push(eq(orders.callStatus, filters.callStatus));
          }
        }
        if (filters?.paymentMethod) {
          const pm = filters.paymentMethod.toLowerCase();
          if (pm === "cod") {
            conditions.push(
              sql2`LOWER(${orders.paymentMethod}) LIKE '%cod%'`
            );
          } else if (pm === "prepaid") {
            conditions.push(
              sql2`${orders.paymentMethod} IS NOT NULL AND LOWER(${orders.paymentMethod}) NOT LIKE '%cod%'`
            );
          } else {
            conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
          }
        }
        if (filters?.assignedTo)
          conditions.push(eq(orders.assignedTo, filters.assignedTo));
        if (filters?.agentId) {
          if (filters.agentId === "unassigned") {
            conditions.push(sql2`${orders.assignedTo} IS NULL`);
          } else {
            conditions.push(eq(orders.assignedTo, filters.agentId));
          }
        }
        if (filters?.search && filters.search.trim()) {
          const searchPattern = `%${filters.search.trim()}%`;
          conditions.push(sql2`(
        ${orders.shopifyOrderNumber} ILIKE ${searchPattern} OR
        ${orders.customerName} ILIKE ${searchPattern} OR
        ${orders.customerPhone} ILIKE ${searchPattern} OR
        ${orders.customerEmail} ILIKE ${searchPattern} OR
        ${orders.shippingCity} ILIKE ${searchPattern}
      )`);
        }
        if (filters?.startDate) {
          conditions.push(gte(orders.shopifyCreatedAt, filters.startDate));
        }
        if (filters?.endDate) {
          const endOfDay = new Date(filters.endDate);
          endOfDay.setHours(23, 59, 59, 999);
          conditions.push(lte(orders.shopifyCreatedAt, endOfDay));
        }
        if (filters?.tag && filters.tag.trim()) {
          conditions.push(sql2`${orders.tags} @> ARRAY[${filters.tag.trim()}]::text[]`);
        }
        const whereClause = conditions.length > 0 ? and(...conditions) : void 0;
        let countQuery = db.select({ value: count() }).from(orders);
        if (whereClause) {
          countQuery = countQuery.where(whereClause);
        }
        const [{ value: total }] = await countQuery;
        const statsConditions = [];
        if (filters?.storeId) statsConditions.push(eq(orders.storeId, filters.storeId));
        if (filters?.assignedTo) statsConditions.push(eq(orders.assignedTo, filters.assignedTo));
        const statsWhereClause = statsConditions.length > 0 ? and(...statsConditions) : void 0;
        let totalCountQuery = db.select({ value: count() }).from(orders);
        if (statsWhereClause) {
          totalCountQuery = totalCountQuery.where(statsWhereClause);
        }
        const [{ value: statsTotal }] = await totalCountQuery;
        let pendingQuery = db.select({ value: count() }).from(orders);
        const pendingConditions = [...statsConditions];
        pendingConditions.push(sql2`(${orders.callStatus} IS NULL OR ${orders.callStatus} = 'Pending')`);
        pendingQuery = pendingQuery.where(and(...pendingConditions));
        const [{ value: pendingCount }] = await pendingQuery;
        let confirmedQuery = db.select({ value: count() }).from(orders);
        const confirmedConditions = [...statsConditions, eq(orders.callStatus, "Confirmed")];
        confirmedQuery = confirmedQuery.where(and(...confirmedConditions));
        const [{ value: confirmedCount }] = await confirmedQuery;
        let followUpQuery = db.select({ value: count() }).from(orders);
        const followUpConditions = [...statsConditions, eq(orders.callStatus, "Follow Up")];
        followUpQuery = followUpQuery.where(and(...followUpConditions));
        const [{ value: followUpCount }] = await followUpQuery;
        let cancelledQuery = db.select({ value: count() }).from(orders);
        const cancelledConditions = [...statsConditions, eq(orders.callStatus, "Cancelled")];
        cancelledQuery = cancelledQuery.where(and(...cancelledConditions));
        const [{ value: cancelledCount }] = await cancelledQuery;
        const ordersWithAgent = await db.select({
          order: orders,
          assignedToUser: {
            id: users.id,
            username: users.username,
            fullName: users.fullName
          }
        }).from(orders).leftJoin(users, eq(orders.assignedTo, users.id)).where(whereClause).orderBy(filters?.sortOrder === "asc" ? asc(orders.shopifyCreatedAt) : desc(orders.shopifyCreatedAt)).limit(filters?.limit ?? 50).offset(filters?.offset ?? 0);
        const ordersList = ordersWithAgent.map((row) => ({
          ...row.order,
          shipmentStatus: row.order.shipmentStatus || null,
          // Explicitly include for frontend
          tags: parsePostgresArray(row.order.tags),
          assignedToUser: row.assignedToUser?.id ? row.assignedToUser : null
        }));
        return {
          orders: ordersList,
          total,
          stats: {
            total: statsTotal,
            pending: pendingCount,
            confirmed: confirmedCount,
            followUp: followUpCount,
            cancelled: cancelledCount
          }
        };
      }
      async exportOrders(filters) {
        const conditions = [];
        if (filters?.storeId) conditions.push(eq(orders.storeId, filters.storeId));
        if (filters?.status) conditions.push(eq(orders.status, filters.status));
        if (filters?.callStatus) {
          if (filters.callStatus === "Pending") {
            conditions.push(sql2`(${orders.callStatus} IS NULL OR ${orders.callStatus} = 'Pending')`);
          } else {
            conditions.push(eq(orders.callStatus, filters.callStatus));
          }
        }
        if (filters?.paymentMethod) conditions.push(eq(orders.paymentMethod, filters.paymentMethod));
        if (filters?.assignedTo) conditions.push(eq(orders.assignedTo, filters.assignedTo));
        if (filters?.agentId) {
          if (filters.agentId === "unassigned") {
            conditions.push(sql2`${orders.assignedTo} IS NULL`);
          } else {
            conditions.push(eq(orders.assignedTo, filters.agentId));
          }
        }
        if (filters?.search && filters.search.trim()) {
          const searchPattern = `%${filters.search.trim()}%`;
          conditions.push(sql2`(
        ${orders.shopifyOrderNumber} ILIKE ${searchPattern} OR
        ${orders.customerName} ILIKE ${searchPattern} OR
        ${orders.customerPhone} ILIKE ${searchPattern} OR
        ${orders.customerEmail} ILIKE ${searchPattern} OR
        ${orders.shippingCity} ILIKE ${searchPattern}
      )`);
        }
        if (filters?.startDate) {
          conditions.push(gte(orders.shopifyCreatedAt, filters.startDate));
        }
        if (filters?.endDate) {
          const endOfDay = new Date(filters.endDate);
          endOfDay.setHours(23, 59, 59, 999);
          conditions.push(lte(orders.shopifyCreatedAt, endOfDay));
        }
        if (filters?.tag && filters.tag.trim()) {
          conditions.push(sql2`${orders.tags} @> ARRAY[${filters.tag.trim()}]::text[]`);
        }
        const whereClause = conditions.length > 0 ? and(...conditions) : void 0;
        let query = db.select({
          id: orders.id,
          shopifyOrderNumber: orders.shopifyOrderNumber,
          shopifyCreatedAt: orders.shopifyCreatedAt,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          totalPrice: orders.totalPrice,
          customerName: orders.customerName,
          customerPhone: orders.customerPhone,
          shippingCity: orders.shippingCity,
          shippingState: orders.shippingState,
          shippingPincode: orders.shippingPincode,
          assignedTo: orders.assignedTo,
          assignedAt: orders.assignedAt,
          confirmedAt: orders.confirmedAt,
          callStatus: orders.callStatus,
          followUpAttempts: orders.followUpAttempts,
          tags: orders.tags,
          agentName: users.fullName
        }).from(orders).leftJoin(users, eq(orders.assignedTo, users.id)).orderBy(desc(orders.shopifyCreatedAt));
        if (whereClause) {
          query = query.where(whereClause);
        }
        const ordersData = await query;
        const orderIds = ordersData.map((o) => o.id);
        let itemsMap = {};
        if (orderIds.length > 0) {
          const allItems = await db.select({
            orderId: orderItems.orderId,
            productName: orderItems.productName,
            quantity: orderItems.quantity
          }).from(orderItems).where(sql2`${orderItems.orderId} IN (${sql2.join(orderIds.map((id) => sql2`${id}`), sql2`, `)})`);
          const itemsByOrder = {};
          for (const item of allItems) {
            if (!itemsByOrder[item.orderId]) {
              itemsByOrder[item.orderId] = [];
            }
            itemsByOrder[item.orderId].push(`${item.productName || "Unknown"} x${item.quantity || 1}`);
          }
          for (const orderId of Object.keys(itemsByOrder)) {
            itemsMap[orderId] = itemsByOrder[orderId].join(", ");
          }
        }
        return ordersData.map((order) => ({
          shopifyOrderNumber: order.shopifyOrderNumber,
          shopifyCreatedAt: order.shopifyCreatedAt,
          status: order.status,
          paymentMethod: order.paymentMethod,
          totalPrice: order.totalPrice ? Number(order.totalPrice) : null,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          shippingCity: order.shippingCity,
          shippingState: order.shippingState,
          shippingPincode: order.shippingPincode,
          agentName: order.agentName,
          assignedAt: order.assignedAt,
          confirmedAt: order.confirmedAt,
          callStatus: order.callStatus,
          followUpAttempts: order.followUpAttempts,
          tags: parsePostgresArray(order.tags),
          lineItems: itemsMap[order.id] || null
        }));
      }
      async assignOrder(orderId, userId) {
        const currentOrder = await this.getOrder(orderId);
        if (!currentOrder) return void 0;
        const updateData = {
          assignedTo: userId,
          assignedAt: userId === null ? null : /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        };
        if (userId !== null && currentOrder.status === "pending") {
          updateData.status = "assigned";
        }
        const [order] = await db.update(orders).set(updateData).where(eq(orders.id, orderId)).returning();
        return order;
      }
      // Call Status Actions
      async confirmOrder(orderId, userId, notes) {
        const [order] = await db.update(orders).set({
          callStatus: "Confirmed",
          confirmedAt: /* @__PURE__ */ new Date(),
          confirmedBy: userId,
          confirmedNotes: notes,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(orders.id, orderId)).returning();
        return order;
      }
      async cancelOrder(orderId, userId, reason, notes) {
        const [order] = await db.update(orders).set({
          callStatus: "Cancelled",
          cancelledAt: /* @__PURE__ */ new Date(),
          cancelledBy: userId,
          cancelledReason: reason,
          cancelledNotes: notes,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(orders.id, orderId)).returning();
        return order;
      }
      async scheduleFollowup(orderId, userId, followupAt, notes) {
        const currentOrder = await this.getOrder(orderId);
        const currentAttempts = currentOrder?.followUpAttempts || 0;
        const [order] = await db.update(orders).set({
          callStatus: "Follow Up",
          followupAt,
          followupNotes: notes,
          followUpAttempts: currentAttempts + 1,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(orders.id, orderId)).returning();
        return order;
      }
      // ============================================================================
      // ORDER ITEMS
      // ============================================================================
      async getOrderItems(orderId) {
        return await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      }
      async createOrderItem(item) {
        const [orderItem] = await db.insert(orderItems).values(item).returning();
        return orderItem;
      }
      async createOrderItems(items) {
        if (items.length === 0) return [];
        return await db.insert(orderItems).values(items).returning();
      }
      async updateOrderItemImage(itemId, imageUrl) {
        const [item] = await db.update(orderItems).set({ imageUrl }).where(eq(orderItems.id, itemId)).returning();
        return item;
      }
      /**
       * Retroactively populate `order_items.image_url` for orders that
       * were imported BEFORE the product catalog was synced (so the
       * webhook/sync-time variant lookup returned no match and left
       * image_url NULL).
       *
       * Implementation: one atomic SQL UPDATE with a JOIN onto products
       * for the active store. Touches only rows where (a) image_url is
       * currently NULL, (b) we have a shopify_variant_id, and (c) the
       * products catalog has a matching row WITH an image_url. No N+1,
       * no transaction window where rows are partially updated.
       *
       * Returns the rows we managed to fix and a count of variants that
       * appear in order_items but are absent from the products catalog
       * (so the admin knows to re-sync products if it's non-zero).
       */
      async backfillOrderItemImages(storeId) {
        const updateResult = await db.execute(sql2`
      WITH updated AS (
        UPDATE order_items oi
        SET    image_url = p.image_url
        FROM   products p
        WHERE  oi.store_id           = ${storeId}
          AND  p.store_id            = ${storeId}
          AND  oi.shopify_variant_id = p.shopify_variant_id
          AND  oi.image_url IS NULL
          AND  p.image_url IS NOT NULL
        RETURNING 1
      )
      SELECT COUNT(*)::int4 AS n FROM updated
    `);
        const updated = (updateResult.rows ?? updateResult)[0]?.n ?? 0;
        const missingResult = await db.execute(sql2`
      SELECT COUNT(DISTINCT oi.shopify_variant_id)::int4 AS n
      FROM   order_items oi
      WHERE  oi.store_id = ${storeId}
        AND  oi.image_url IS NULL
        AND  oi.shopify_variant_id IS NOT NULL
        AND  NOT EXISTS (
          SELECT 1 FROM products p
          WHERE p.store_id            = oi.store_id
            AND p.shopify_variant_id  = oi.shopify_variant_id
        )
    `);
        const missingVariantsInCatalog = (missingResult.rows ?? missingResult)[0]?.n ?? 0;
        return { updated, missingVariantsInCatalog };
      }
      // ============================================================================
      // ORDER ASSIGNMENTS
      // ============================================================================
      async getOrderAssignments(orderId) {
        return await db.select().from(orderAssignments).where(eq(orderAssignments.orderId, orderId)).orderBy(desc(orderAssignments.createdAt));
      }
      async createOrderAssignment(assignment) {
        const [newAssignment] = await db.insert(orderAssignments).values(assignment).returning();
        return newAssignment;
      }
      async getCurrentAssignment(orderId) {
        const [assignment] = await db.select().from(orderAssignments).where(eq(orderAssignments.orderId, orderId)).orderBy(desc(orderAssignments.createdAt)).limit(1);
        return assignment;
      }
      // ============================================================================
      // ORDER STATUS HISTORY
      // ============================================================================
      async getOrderHistory(orderId) {
        return await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)).orderBy(desc(orderStatusHistory.createdAt));
      }
      async createOrderStatus(status) {
        const [history] = await db.insert(orderStatusHistory).values(status).returning();
        return history;
      }
      async createOrderStatusBatch(statuses) {
        if (statuses.length === 0) return [];
        return await db.insert(orderStatusHistory).values(statuses).returning();
      }
      // ============================================================================
      // LEAVE REQUESTS
      // ============================================================================
      async getLeaveRequest(id) {
        const [request] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
        return request;
      }
      async createLeaveRequest(insertRequest) {
        const [request] = await db.insert(leaveRequests).values(insertRequest).returning();
        return request;
      }
      async updateLeaveRequest(id, data) {
        const [request] = await db.update(leaveRequests).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(leaveRequests.id, id)).returning();
        return request;
      }
      async listLeaveRequests(filters) {
        const conditions = [];
        if (filters?.userId)
          conditions.push(eq(leaveRequests.userId, filters.userId));
        if (filters?.status)
          conditions.push(eq(leaveRequests.status, filters.status));
        if (conditions.length > 0) {
          return await db.select().from(leaveRequests).where(and(...conditions)).orderBy(desc(leaveRequests.createdAt));
        }
        return await db.select().from(leaveRequests).orderBy(desc(leaveRequests.createdAt));
      }
      async deleteLeaveRequest(id) {
        await db.delete(leaveRequests).where(eq(leaveRequests.id, id));
      }
      // ============================================================================
      // TEAM MESSAGES
      // ============================================================================
      async getConversation(user1Id, user2Id) {
        return await db.select().from(teamMessages).where(
          or(
            and(
              eq(teamMessages.fromUserId, user1Id),
              eq(teamMessages.toUserId, user2Id)
            ),
            and(
              eq(teamMessages.fromUserId, user2Id),
              eq(teamMessages.toUserId, user1Id)
            )
          )
        ).orderBy(asc(teamMessages.createdAt));
      }
      async createMessage(message) {
        const [newMessage] = await db.insert(teamMessages).values(message).returning();
        return newMessage;
      }
      async markMessageAsRead(messageId) {
        await db.update(teamMessages).set({ isRead: true, readAt: /* @__PURE__ */ new Date() }).where(eq(teamMessages.id, messageId));
      }
      async getUnreadCount(userId) {
        const [{ value }] = await db.select({ value: count() }).from(teamMessages).where(
          and(
            eq(teamMessages.toUserId, userId),
            eq(teamMessages.isRead, false)
          )
        );
        return value;
      }
      // ============================================================================
      // WEBHOOK LOGS
      // ============================================================================
      async createWebhookLog(log2) {
        const [webhookLog] = await db.insert(webhookLogs).values(log2).returning();
        return webhookLog;
      }
      async markWebhookProcessed(id, error) {
        await db.update(webhookLogs).set({
          processed: true,
          processedAt: /* @__PURE__ */ new Date(),
          error: error || null
        }).where(eq(webhookLogs.id, id));
      }
      // ============================================================================
      // SHOPIFY CREDENTIALS
      // ============================================================================
      async getShopifyCredentials() {
        const [credentials] = await db.select().from(shopifyCredentials).where(eq(shopifyCredentials.isActive, true)).orderBy(desc(shopifyCredentials.createdAt)).limit(1);
        return credentials;
      }
      async saveShopifyCredentials(credentials) {
        await db.update(shopifyCredentials).set({ isActive: false, updatedAt: /* @__PURE__ */ new Date() });
        const [newCredentials] = await db.insert(shopifyCredentials).values(credentials).returning();
        return newCredentials;
      }
      async updateShopifyCredentials(id, data) {
        const [updated] = await db.update(shopifyCredentials).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(shopifyCredentials.id, id)).returning();
        return updated;
      }
      async deleteShopifyCredentials(id) {
        await db.delete(shopifyCredentials).where(eq(shopifyCredentials.id, id));
      }
      async updateCredentialTestStatus(id, status, message) {
        await db.update(shopifyCredentials).set({
          testStatus: status,
          testMessage: message || null,
          lastTestedAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(shopifyCredentials.id, id));
      }
      // ============================================================================
      // ATTENDANCE
      // ============================================================================
      // Auto-close any ghost sessions (unclosed sessions from previous days)
      // Uses SQL DATE comparison to avoid timezone issues
      async autoCloseGhostSessions(userId, currentDateStr) {
        const ghostSessions = await db.select().from(attendance).where(
          and(
            eq(attendance.userId, userId),
            isNull(attendance.clockOutTime),
            isNotNull(attendance.clockInTime),
            sql2`DATE(${attendance.date}) < DATE(${currentDateStr})`
          )
        );
        for (const session2 of ghostSessions) {
          if (session2.clockInTime && session2.date) {
            const sessionDate = new Date(session2.date);
            const year = sessionDate.getFullYear();
            const month = sessionDate.getMonth();
            const day = sessionDate.getDate();
            const endOfDay = new Date(year, month, day, 23, 59, 59, 0);
            await this.closeOpenBreaksForAttendance(session2.id, endOfDay);
            const breaks = await this.getBreaksByAttendanceId(session2.id);
            let totalBreakMs = 0;
            for (const brk of breaks) {
              if (brk.breakStart && brk.breakEnd) {
                totalBreakMs += new Date(brk.breakEnd).getTime() - new Date(brk.breakStart).getTime();
              }
            }
            const totalBreakHours = totalBreakMs / (1e3 * 60 * 60);
            const clockInTime = new Date(session2.clockInTime);
            const rawMs = endOfDay.getTime() - clockInTime.getTime();
            const totalHours = Math.max(0, rawMs / (1e3 * 60 * 60) - totalBreakHours);
            await db.update(attendance).set({
              clockOutTime: endOfDay,
              totalHours: totalHours.toFixed(2),
              status: "present",
              // Reset status from 'break' if applicable
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq(attendance.id, session2.id));
          }
        }
      }
      // Get attendance for a specific date (client-driven, timezone-safe)
      // Uses SQL DATE comparison to match just the date portion
      async getAttendanceByDate(userId, dateStr) {
        const [record] = await db.select().from(attendance).where(
          and(
            eq(attendance.userId, userId),
            sql2`DATE(${attendance.date}) = DATE(${dateStr})`
          )
        );
        return record;
      }
      // Legacy method - uses server time (kept for backward compatibility)
      async getTodayAttendance(userId) {
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const [record] = await db.select().from(attendance).where(
          and(
            eq(attendance.userId, userId),
            gte(attendance.date, today),
            lte(attendance.date, tomorrow)
          )
        );
        return record;
      }
      async getTeamTodayAttendance() {
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const records = await db.select().from(attendance).where(
          and(
            gte(attendance.date, today),
            lte(attendance.date, tomorrow)
          )
        );
        return records;
      }
      async clockIn(userId, time) {
        const today = /* @__PURE__ */ new Date();
        today.setHours(0, 0, 0, 0);
        const existing = await this.getTodayAttendance(userId);
        if (existing) {
          const [updated] = await db.update(attendance).set({
            clockInTime: time,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq(attendance.id, existing.id)).returning();
          return updated;
        }
        const [record] = await db.insert(attendance).values({
          userId,
          date: today,
          clockInTime: time
        }).returning();
        return record;
      }
      // Clock in with explicit date (timezone-safe)
      async clockInWithDate(userId, time, dateForRecord) {
        const [record] = await db.insert(attendance).values({
          userId,
          date: dateForRecord,
          clockInTime: time,
          status: "present"
        }).returning();
        return record;
      }
      async clockOut(userId, time, totalHours) {
        const existing = await this.getTodayAttendance(userId);
        if (!existing) {
          return void 0;
        }
        const [updated] = await db.update(attendance).set({
          clockOutTime: time,
          totalHours: totalHours.toFixed(2),
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(attendance.id, existing.id)).returning();
        return updated;
      }
      // Clock out by attendance ID (timezone-safe)
      async clockOutById(attendanceId, time, totalHours) {
        const [updated] = await db.update(attendance).set({
          clockOutTime: time,
          totalHours: totalHours.toFixed(2),
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(attendance.id, attendanceId)).returning();
        return updated;
      }
      async getAttendanceRecords(filters) {
        const conditions = [];
        if (filters?.userId) {
          conditions.push(eq(attendance.userId, filters.userId));
        }
        if (filters?.startDate) {
          conditions.push(gte(attendance.date, filters.startDate));
        }
        if (filters?.endDate) {
          conditions.push(lte(attendance.date, filters.endDate));
        }
        const query = db.select().from(attendance).orderBy(desc(attendance.date));
        if (conditions.length > 0) {
          return await query.where(and(...conditions));
        }
        return await query;
      }
      // ============================================================================
      // HOLIDAYS
      // ============================================================================
      async listHolidaysByState(state, year) {
        const conditions = [eq(holidays.state, state)];
        if (year !== void 0) {
          conditions.push(gte(holidays.date, `${year}-01-01`));
          conditions.push(lte(holidays.date, `${year}-12-31`));
        }
        return await db.select().from(holidays).where(and(...conditions)).orderBy(asc(holidays.date));
      }
      // ============================================================================
      // PAYROLL LEDGER
      // ============================================================================
      async upsertPayrollLedger(entry) {
        const existing = await this.getPayrollLedgerByPeriod(entry.userId, entry.year, entry.month);
        if (existing) {
          const [updated] = await db.update(payrollLedger).set({ ...entry, updatedAt: /* @__PURE__ */ new Date() }).where(eq(payrollLedger.id, existing.id)).returning();
          return updated;
        }
        const [created] = await db.insert(payrollLedger).values(entry).returning();
        return created;
      }
      async getPayrollLedgerByPeriod(userId, year, month) {
        const [row] = await db.select().from(payrollLedger).where(
          and(
            eq(payrollLedger.userId, userId),
            eq(payrollLedger.year, year),
            eq(payrollLedger.month, month)
          )
        ).limit(1);
        return row;
      }
      async getPayrollLedgerById(id) {
        const [row] = await db.select().from(payrollLedger).where(eq(payrollLedger.id, id)).limit(1);
        return row;
      }
      async listPayrollLedger(year, month) {
        return await db.select().from(payrollLedger).where(and(eq(payrollLedger.year, year), eq(payrollLedger.month, month))).orderBy(desc(payrollLedger.createdAt));
      }
      async updatePayrollLedgerDispatch(id, data) {
        await db.update(payrollLedger).set({
          status: data.status,
          ...data.pdfFilename !== void 0 ? { pdfFilename: data.pdfFilename } : {},
          ...data.sentAt !== void 0 ? { sentAt: data.sentAt } : {},
          ...data.emailError !== void 0 ? { emailError: data.emailError } : {},
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(payrollLedger.id, id));
      }
      // ============================================================================
      // ATTENDANCE BREAKS
      // ============================================================================
      async startBreak(attendanceId) {
        const [breakRecord] = await db.insert(attendanceBreaks).values({
          attendanceId,
          breakStart: /* @__PURE__ */ new Date()
        }).returning();
        return breakRecord;
      }
      async endBreak(breakId, endTime) {
        const [updated] = await db.update(attendanceBreaks).set({ breakEnd: endTime }).where(eq(attendanceBreaks.id, breakId)).returning();
        return updated;
      }
      async getActiveBreak(attendanceId) {
        const [activeBreak] = await db.select().from(attendanceBreaks).where(
          and(
            eq(attendanceBreaks.attendanceId, attendanceId),
            isNull(attendanceBreaks.breakEnd)
          )
        ).limit(1);
        return activeBreak;
      }
      async getBreaksByAttendanceId(attendanceId) {
        return await db.select().from(attendanceBreaks).where(eq(attendanceBreaks.attendanceId, attendanceId)).orderBy(asc(attendanceBreaks.breakStart));
      }
      async closeOpenBreaksForAttendance(attendanceId, endTime) {
        await db.update(attendanceBreaks).set({ breakEnd: endTime }).where(
          and(
            eq(attendanceBreaks.attendanceId, attendanceId),
            isNull(attendanceBreaks.breakEnd)
          )
        );
      }
      // ============================================================================
      // CALLS
      // ============================================================================
      async createCall(call) {
        const [createdCall] = await db.insert(calls).values(call).returning();
        return createdCall;
      }
      async getCallById(id) {
        const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
        return call;
      }
      async getCallsByOrderId(orderId) {
        return await db.select().from(calls).where(eq(calls.orderId, orderId)).orderBy(desc(calls.calledAt));
      }
      async getCallsWithAgentByOrderId(orderId) {
        const result = await db.select({
          call: calls,
          agent: {
            fullName: users.fullName,
            email: users.email
          }
        }).from(calls).leftJoin(users, eq(calls.agentId, users.id)).where(eq(calls.orderId, orderId)).orderBy(desc(calls.calledAt));
        return result.map((row) => ({
          ...row.call,
          agent: row.agent || null
        }));
      }
      async getCallsByAgentId(agentId) {
        return await db.select().from(calls).where(eq(calls.agentId, agentId)).orderBy(desc(calls.calledAt));
      }
      async getCallByReference(callReference) {
        const [call] = await db.select().from(calls).where(eq(calls.callReference, callReference)).limit(1);
        return call;
      }
      async getRecentCallByPhone(customerPhone, minutesAgo = 10) {
        const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1e3);
        const [call] = await db.select().from(calls).where(
          and(
            eq(calls.customerPhone, customerPhone),
            gte(calls.calledAt, cutoffTime)
          )
        ).orderBy(desc(calls.calledAt)).limit(1);
        return call;
      }
      async updateCallFromWebhook(id, data) {
        const [updated] = await db.update(calls).set(data).where(eq(calls.id, id)).returning();
        return updated;
      }
      async getAllCallsWithDetails(options) {
        const page = options?.page || 1;
        const limit = options?.limit || 25;
        const offset = (page - 1) * limit;
        const agentId = options?.agentId;
        const whereCondition = agentId ? eq(calls.agentId, agentId) : void 0;
        const countQuery = db.select({ count: sql2`count(*)::int` }).from(calls);
        const [countResult] = agentId ? await countQuery.where(whereCondition) : await countQuery;
        const total = countResult.count;
        const baseQuery = db.select({
          call: calls,
          agent: {
            fullName: users.fullName,
            email: users.email
          },
          order: {
            shopifyOrderNumber: orders.shopifyOrderNumber,
            customerName: orders.customerName
          }
        }).from(calls).leftJoin(users, eq(calls.agentId, users.id)).leftJoin(orders, eq(calls.orderId, orders.id));
        const result = agentId ? await baseQuery.where(whereCondition).orderBy(desc(calls.calledAt)).limit(limit).offset(offset) : await baseQuery.orderBy(desc(calls.calledAt)).limit(limit).offset(offset);
        const callsData = result.map((row) => ({
          ...row.call,
          agent: row.agent && row.agent.fullName ? row.agent : null,
          order: row.order && row.order.shopifyOrderNumber ? row.order : null
        }));
        return {
          calls: callsData,
          total,
          page,
          totalPages: Math.ceil(total / limit)
        };
      }
      // ============================================================================
      // NOTIFICATIONS
      // ============================================================================
      async createNotification(notification) {
        const [created] = await db.insert(notifications).values(notification).returning();
        return created;
      }
      async getUserNotifications(userId, unreadOnly = false) {
        const conditions = [eq(notifications.userId, userId)];
        if (unreadOnly) {
          conditions.push(eq(notifications.isRead, false));
        }
        return await db.select().from(notifications).where(and(...conditions)).orderBy(desc(notifications.createdAt));
      }
      async markNotificationAsRead(id) {
        const [updated] = await db.update(notifications).set({ isRead: true, readAt: /* @__PURE__ */ new Date() }).where(eq(notifications.id, id)).returning();
        return updated;
      }
      async markAllNotificationsAsRead(userId) {
        await db.update(notifications).set({ isRead: true, readAt: /* @__PURE__ */ new Date() }).where(and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        ));
      }
      async getUnreadNotificationCount(userId) {
        const result = await db.select({ count: count() }).from(notifications).where(and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        ));
        return result[0]?.count || 0;
      }
      async getDueFollowups() {
        const now = /* @__PURE__ */ new Date();
        return await db.select().from(orders).where(and(
          lte(orders.followupAt, now),
          eq(orders.callStatus, "Follow Up")
        ));
      }
      // ============================================================================
      // SHOPIFY SYNC LOGS
      // ============================================================================
      async createSyncLog(log2) {
        const [syncLog] = await db.insert(shopifySyncLogs).values(log2).returning();
        return syncLog;
      }
      async updateSyncLog(id, updates) {
        const [updated] = await db.update(shopifySyncLogs).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(shopifySyncLogs.id, id)).returning();
        return updated;
      }
      async getSyncLog(id) {
        const [log2] = await db.select().from(shopifySyncLogs).where(eq(shopifySyncLogs.id, id));
        return log2;
      }
      async getSyncLogsByOrder(orderId) {
        return await db.select().from(shopifySyncLogs).where(eq(shopifySyncLogs.orderId, orderId)).orderBy(desc(shopifySyncLogs.createdAt));
      }
      async getFailedSyncs() {
        return await db.select().from(shopifySyncLogs).where(eq(shopifySyncLogs.syncStatus, "failed")).orderBy(desc(shopifySyncLogs.createdAt));
      }
      async updateOrderSyncStatus(orderId, syncStatus, lastSyncedAt) {
        const updateData = { syncStatus };
        if (lastSyncedAt) {
          updateData.lastSyncedAt = lastSyncedAt;
        }
        const [updated] = await db.update(orders).set(updateData).where(eq(orders.id, orderId)).returning();
        return updated;
      }
      // ============================================================================
      // SHIPMENTS
      // ============================================================================
      async createShipment(insertShipment) {
        const [shipment] = await db.insert(shipments).values(insertShipment).returning();
        return shipment;
      }
      async getShipment(id) {
        const [shipment] = await db.select().from(shipments).where(eq(shipments.id, id));
        return shipment;
      }
      async getShipmentByAWB(awb) {
        const [shipment] = await db.select().from(shipments).where(eq(shipments.awb, awb));
        return shipment;
      }
      async getShipmentByOrderId(orderId) {
        const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, orderId));
        return shipment;
      }
      async getShipmentByShiprocketShipmentId(shiprocketShipmentId) {
        const [shipment] = await db.select().from(shipments).where(eq(shipments.shiprocketShipmentId, shiprocketShipmentId));
        return shipment;
      }
      async updateShipment(id, data) {
        const [updated] = await db.update(shipments).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(shipments.id, id)).returning();
        return updated;
      }
      async listShipments(filters) {
        let query = db.select().from(shipments).orderBy(desc(shipments.createdAt));
        if (filters?.status) {
          query = query.where(eq(shipments.status, filters.status));
        }
        if (filters?.limit) {
          query = query.limit(filters.limit);
        }
        return await query;
      }
      // ============================================================================
      // NDR EVENTS
      // ============================================================================
      async createNDREvent(insertNdrEvent) {
        const [ndrEvent] = await db.insert(ndrEvents).values(insertNdrEvent).returning();
        return ndrEvent;
      }
      async getNDREvent(id) {
        const [ndrEvent] = await db.select().from(ndrEvents).where(eq(ndrEvents.id, id));
        return ndrEvent;
      }
      async getNDREventsByShipmentId(shipmentId) {
        return await db.select().from(ndrEvents).where(eq(ndrEvents.shipmentId, shipmentId)).orderBy(desc(ndrEvents.createdAt));
      }
      async getNDREventsByOrderId(orderId) {
        return await db.select().from(ndrEvents).where(eq(ndrEvents.orderId, orderId)).orderBy(desc(ndrEvents.createdAt));
      }
      async updateNDREvent(id, data) {
        const [updated] = await db.update(ndrEvents).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(ndrEvents.id, id)).returning();
        return updated;
      }
      async listUnresolvedNDREvents(filters) {
        const baseConds = [eq(ndrEvents.resolved, false)];
        if (filters?.storeId) baseConds.push(eq(ndrEvents.storeId, filters.storeId));
        if (filters?.assignedTo) {
          const conds = [
            ...baseConds,
            eq(orders.assignedTo, filters.assignedTo)
          ];
          let query2 = db.select({ ndrEvent: ndrEvents }).from(ndrEvents).innerJoin(orders, eq(ndrEvents.orderId, orders.id)).where(and(...conds)).orderBy(desc(ndrEvents.createdAt));
          if (filters?.limit) {
            query2 = query2.limit(filters.limit);
          }
          if (filters?.offset) {
            query2 = query2.offset(filters.offset);
          }
          const results = await query2;
          const events2 = results.map((r) => r.ndrEvent);
          const countResult2 = await db.select({ count: count() }).from(ndrEvents).innerJoin(orders, eq(ndrEvents.orderId, orders.id)).where(and(...conds));
          return {
            events: events2,
            total: countResult2[0]?.count || 0
          };
        }
        const baseQuery = db.select().from(ndrEvents).where(and(...baseConds));
        let query = baseQuery.orderBy(desc(ndrEvents.createdAt));
        if (filters?.limit) {
          query = query.limit(filters.limit);
        }
        if (filters?.offset) {
          query = query.offset(filters.offset);
        }
        const events = await query;
        const countResult = await db.select({ count: count() }).from(ndrEvents).where(and(...baseConds));
        return {
          events,
          total: countResult[0]?.count || 0
        };
      }
      // ============================================================================
      // LEARNING CENTER - COURSES
      // ============================================================================
      async getCourse(id) {
        const [course] = await db.select().from(courses).where(eq(courses.id, id));
        return course;
      }
      async getCourseBySlug(slug) {
        const [course] = await db.select().from(courses).where(eq(courses.slug, slug));
        return course;
      }
      async createCourse(course) {
        const [newCourse] = await db.insert(courses).values(course).returning();
        return newCourse;
      }
      async updateCourse(id, data) {
        const [updated] = await db.update(courses).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(courses.id, id)).returning();
        return updated;
      }
      async deleteCourse(id) {
        await db.delete(courses).where(eq(courses.id, id));
      }
      async listCourses(filters) {
        let query = db.select().from(courses).orderBy(asc(courses.order), asc(courses.createdAt));
        const conditions = [];
        if (filters?.category) {
          conditions.push(eq(courses.category, filters.category));
        }
        if (filters?.isPublished !== void 0) {
          conditions.push(eq(courses.isPublished, filters.isPublished));
        }
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        return await query;
      }
      // ============================================================================
      // LEARNING CENTER - LESSONS
      // ============================================================================
      async getLesson(id) {
        const [lesson] = await db.select().from(lessons).where(eq(lessons.id, id));
        return lesson;
      }
      async getLessonBySlug(slug) {
        const [lesson] = await db.select().from(lessons).where(eq(lessons.slug, slug));
        return lesson;
      }
      async createLesson(lesson) {
        let finalSlug = lesson.slug;
        let suffix = 1;
        while (true) {
          const existing = await this.getLessonBySlug(finalSlug);
          if (!existing) break;
          suffix++;
          finalSlug = `${lesson.slug}-${suffix}`;
        }
        const [newLesson] = await db.insert(lessons).values({ ...lesson, slug: finalSlug }).returning();
        await db.insert(lessonAnalytics).values({
          lessonId: newLesson.id,
          totalViews: 0,
          uniqueViews: 0,
          totalCompletions: 0
        }).onConflictDoNothing();
        return newLesson;
      }
      async updateLesson(id, data) {
        const [updated] = await db.update(lessons).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(lessons.id, id)).returning();
        return updated;
      }
      async deleteLesson(id) {
        await db.delete(lessons).where(eq(lessons.id, id));
      }
      async getLessonsByCourse(courseId, isPublished) {
        const conditions = [eq(lessons.courseId, courseId)];
        if (isPublished !== void 0) {
          conditions.push(eq(lessons.isPublished, isPublished));
        }
        return await db.select().from(lessons).where(and(...conditions)).orderBy(asc(lessons.order));
      }
      // ============================================================================
      // LEARNING CENTER - USER PROGRESS
      // ============================================================================
      async getUserLessonProgress(userId, lessonId) {
        const [progress] = await db.select().from(userLessonProgress).where(and(eq(userLessonProgress.userId, userId), eq(userLessonProgress.lessonId, lessonId)));
        return progress;
      }
      async createOrUpdateLessonProgress(progress) {
        const existing = await this.getUserLessonProgress(progress.userId, progress.lessonId);
        if (existing) {
          const [updated] = await db.update(userLessonProgress).set({ ...progress, updatedAt: /* @__PURE__ */ new Date() }).where(eq(userLessonProgress.id, existing.id)).returning();
          return updated;
        } else {
          const [newProgress] = await db.insert(userLessonProgress).values(progress).returning();
          return newProgress;
        }
      }
      async getUserCourseProgress(userId, courseId) {
        const courseLessons = await this.getLessonsByCourse(courseId, true);
        const totalLessons = courseLessons.length;
        if (totalLessons === 0) {
          return { completedLessons: 0, totalLessons: 0, percentage: 0 };
        }
        const lessonIds = courseLessons.map((l) => l.id);
        const progressRecords = await db.select().from(userLessonProgress).where(
          and(
            eq(userLessonProgress.userId, userId),
            eq(userLessonProgress.isCompleted, true)
          )
        );
        const completedLessons = progressRecords.filter((p) => lessonIds.includes(p.lessonId)).length;
        const percentage = Math.round(completedLessons / totalLessons * 100);
        return { completedLessons, totalLessons, percentage };
      }
      async getUserCompletedCourses(userId) {
        const completedLessons = await db.select().from(userLessonProgress).where(and(eq(userLessonProgress.userId, userId), eq(userLessonProgress.isCompleted, true)));
        const allCourses = await this.listCourses({ isPublished: true });
        const completedCourseIds = [];
        for (const course of allCourses) {
          const courseLessons = await this.getLessonsByCourse(course.id);
          const courseLessonIds = courseLessons.map((l) => l.id);
          const allCompleted = courseLessonIds.every(
            (lessonId) => completedLessons.some((cl) => cl.lessonId === lessonId)
          );
          if (allCompleted && courseLessonIds.length > 0) {
            completedCourseIds.push(course.id);
          }
        }
        return completedCourseIds;
      }
      async toggleBookmark(userId, lessonId) {
        const existing = await this.getUserLessonProgress(userId, lessonId);
        if (existing) {
          const [updated] = await db.update(userLessonProgress).set({ isBookmarked: !existing.isBookmarked, updatedAt: /* @__PURE__ */ new Date() }).where(eq(userLessonProgress.id, existing.id)).returning();
          return updated;
        } else {
          const [newProgress] = await db.insert(userLessonProgress).values({ userId, lessonId, isBookmarked: true, completionPercentage: 0 }).returning();
          return newProgress;
        }
      }
      // ============================================================================
      // LEARNING CENTER - ANALYTICS
      // ============================================================================
      async getLessonAnalytics(lessonId) {
        const [analytics] = await db.select().from(lessonAnalytics).where(eq(lessonAnalytics.lessonId, lessonId));
        return analytics;
      }
      async updateLessonAnalytics(lessonId, data) {
        const existing = await this.getLessonAnalytics(lessonId);
        if (existing) {
          const [updated] = await db.update(lessonAnalytics).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(lessonAnalytics.lessonId, lessonId)).returning();
          return updated;
        } else {
          const [newAnalytics] = await db.insert(lessonAnalytics).values({ lessonId, ...data }).returning();
          return newAnalytics;
        }
      }
      async incrementLessonView(lessonId, userId) {
        const analytics = await this.getLessonAnalytics(lessonId);
        if (analytics) {
          const existingProgress = await this.getUserLessonProgress(userId, lessonId);
          const isUniqueView = !existingProgress;
          await db.update(lessonAnalytics).set({
            totalViews: analytics.totalViews + 1,
            uniqueViews: isUniqueView ? analytics.uniqueViews + 1 : analytics.uniqueViews,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq(lessonAnalytics.lessonId, lessonId));
        } else {
          await db.insert(lessonAnalytics).values({
            lessonId,
            totalViews: 1,
            uniqueViews: 1
          });
        }
        await this.createOrUpdateLessonProgress({
          userId,
          lessonId,
          lastAccessedAt: /* @__PURE__ */ new Date(),
          completionPercentage: 0
        });
      }
      // ============================================================================
      // LEARNING CENTER - RESOURCES
      // ============================================================================
      async getResource(id) {
        const [resource] = await db.select().from(resources).where(eq(resources.id, id));
        return resource;
      }
      async createResource(resource) {
        const [newResource] = await db.insert(resources).values(resource).returning();
        return newResource;
      }
      async updateResource(id, data) {
        const [updated] = await db.update(resources).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(resources.id, id)).returning();
        return updated;
      }
      async deleteResource(id) {
        await db.delete(resources).where(eq(resources.id, id));
      }
      async listResources(filters) {
        const conditions = [eq(resources.isPublished, true)];
        if (filters?.type) {
          conditions.push(eq(resources.type, filters.type));
        }
        if (filters?.category) {
          conditions.push(eq(resources.category, filters.category));
        }
        return await db.select().from(resources).where(and(...conditions)).orderBy(desc(resources.createdAt));
      }
      async incrementResourceDownload(id) {
        const resource = await this.getResource(id);
        if (resource) {
          await db.update(resources).set({ downloadCount: resource.downloadCount + 1 }).where(eq(resources.id, id));
        }
      }
      // ============================================================================
      // LEARNING CENTER - ONBOARDING
      // ============================================================================
      async getOnboardingChecklist(id) {
        const [checklist] = await db.select().from(onboardingChecklists).where(eq(onboardingChecklists.id, id));
        return checklist;
      }
      async getOnboardingChecklistByRole(role) {
        const [checklist] = await db.select().from(onboardingChecklists).where(and(eq(onboardingChecklists.role, role), eq(onboardingChecklists.isActive, true))).orderBy(asc(onboardingChecklists.order)).limit(1);
        return checklist;
      }
      async createOnboardingChecklist(checklist) {
        const [newChecklist] = await db.insert(onboardingChecklists).values(checklist).returning();
        return newChecklist;
      }
      async updateOnboardingChecklist(id, data) {
        const [updated] = await db.update(onboardingChecklists).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(onboardingChecklists.id, id)).returning();
        return updated;
      }
      async getUserOnboardingProgress(userId) {
        const [progress] = await db.select().from(userOnboardingProgress).where(eq(userOnboardingProgress.userId, userId));
        return progress;
      }
      async createUserOnboardingProgress(progress) {
        const [newProgress] = await db.insert(userOnboardingProgress).values(progress).returning();
        return newProgress;
      }
      async updateUserOnboardingProgress(id, data) {
        const [updated] = await db.update(userOnboardingProgress).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(userOnboardingProgress.id, id)).returning();
        return updated;
      }
      // ============================================================================
      // PRODUCTS (Shopify Product Cache)
      // ============================================================================
      async upsertProduct(product) {
        const [result] = await db.insert(products).values(product).onConflictDoUpdate({
          target: [products.storeId, products.shopifyVariantId],
          set: {
            shopifyProductId: product.shopifyProductId,
            title: product.title,
            variantTitle: product.variantTitle,
            sku: product.sku,
            imageUrl: product.imageUrl,
            lastSyncedAt: /* @__PURE__ */ new Date(),
            updatedAt: /* @__PURE__ */ new Date()
          }
        }).returning();
        return result;
      }
      async upsertProducts(productList) {
        if (productList.length === 0) return [];
        const results = [];
        for (const product of productList) {
          const result = await this.upsertProduct(product);
          results.push(result);
        }
        return results;
      }
      /**
       * Look up a product by (storeId, shopifyVariantId). Phase 5
       * (Risk #4): two stores can legitimately cache the same supplier's
       * variant id, so the lookup must be scoped. Every caller now
       * supplies the storeId resolved upstream from `req.storeScope`
       * (HTTP routes) or `resolveWebhookStore` (webhook handlers).
       */
      async getProductByVariantId(shopifyVariantId, storeId) {
        const [product] = await db.select().from(products).where(
          and(
            eq(products.shopifyVariantId, shopifyVariantId),
            eq(products.storeId, storeId)
          )
        );
        return product;
      }
      async getProductByProductId(shopifyProductId) {
        const [product] = await db.select().from(products).where(eq(products.shopifyProductId, shopifyProductId));
        return product;
      }
      async listProducts() {
        return await db.select().from(products).orderBy(asc(products.title));
      }
      /**
       * Phase 5 (Risk #2): both helpers now require a storeId so the
       * Settings → Product Catalog card displays counts for the active
       * store rather than the global catalog. Routes pass
       * `req.storeScope?.storeId` from the storeScope middleware.
       */
      async getProductCount(storeId) {
        const [result] = await db.select({ count: count() }).from(products).where(eq(products.storeId, storeId));
        return result?.count || 0;
      }
      async getLastProductSync(storeId) {
        const [product] = await db.select({ lastSyncedAt: products.lastSyncedAt }).from(products).where(eq(products.storeId, storeId)).orderBy(desc(products.lastSyncedAt)).limit(1);
        return product?.lastSyncedAt || null;
      }
      // ============================================================================
      // CATALOG PRODUCTS (product-level cache for the Products page UI)
      // ============================================================================
      async upsertCatalogProduct(product) {
        const [result] = await db.insert(catalogProducts).values(product).onConflictDoUpdate({
          target: [catalogProducts.storeId, catalogProducts.shopifyProductId],
          // ERP fields (cogs, packagingCost, gstRate, hsnCode, dimension*)
          // are intentionally excluded here. The sync engine only refreshes
          // Shopify-native data; user-entered ERP values survive every sync.
          set: {
            title: product.title,
            imageUrl: product.imageUrl,
            status: product.status,
            totalInventory: product.totalInventory,
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            productType: product.productType,
            vendor: product.vendor,
            variantCount: product.variantCount,
            sku: product.sku,
            barcode: product.barcode,
            weight: product.weight,
            weightUnit: product.weightUnit,
            lastSyncedAt: /* @__PURE__ */ new Date(),
            updatedAt: /* @__PURE__ */ new Date()
          }
        }).returning();
        return result;
      }
      async listCatalogProducts(storeId) {
        return await db.select().from(catalogProducts).where(eq(catalogProducts.storeId, storeId)).orderBy(asc(catalogProducts.title));
      }
      async getCatalogProduct(id) {
        const [row] = await db.select().from(catalogProducts).where(eq(catalogProducts.id, id));
        return row;
      }
      async updateCatalogProductErp(id, erp) {
        const [row] = await db.update(catalogProducts).set({ ...erp, updatedAt: /* @__PURE__ */ new Date() }).where(eq(catalogProducts.id, id)).returning();
        return row;
      }
      // ============================================================================
      // RETURNS (RMA dashboard)
      // ============================================================================
      async listReturns(storeId) {
        return await db.select({
          id: returns.id,
          storeId: returns.storeId,
          orderId: returns.orderId,
          rmaNumber: returns.rmaNumber,
          status: returns.status,
          returnReason: returns.returnReason,
          customerNotes: returns.customerNotes,
          returnFeePaid: returns.returnFeePaid,
          refundAmount: returns.refundAmount,
          refundType: returns.refundType,
          trackingAwb: returns.trackingAwb,
          createdAt: returns.createdAt,
          updatedAt: returns.updatedAt,
          orderNumber: orders.shopifyOrderNumber,
          customerName: orders.customerName,
          customerEmail: orders.customerEmail,
          orderTotal: orders.totalPrice
        }).from(returns).leftJoin(orders, eq(returns.orderId, orders.id)).where(eq(returns.storeId, storeId)).orderBy(desc(returns.createdAt));
      }
      async getReturn(id) {
        const [row] = await db.select().from(returns).where(eq(returns.id, id));
        return row;
      }
      async getReturnByRmaNumber(rmaNumber) {
        const [row] = await db.select().from(returns).where(eq(returns.rmaNumber, rmaNumber));
        return row;
      }
      async updateReturnStatus(id, status) {
        const [row] = await db.update(returns).set({ status, updatedAt: /* @__PURE__ */ new Date() }).where(eq(returns.id, id)).returning();
        return row;
      }
      async updateReturn(id, data) {
        const [row] = await db.update(returns).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(returns.id, id)).returning();
        return row;
      }
      /**
       * Insert a parent RMA and its line items atomically. The return row
       * and all return_items are committed together (or not at all) so a
       * customer-facing create can never leave an orphaned header.
       */
      async createReturnWithItems(returnData, items) {
        return await db.transaction(async (tx) => {
          const [created] = await tx.insert(returns).values(returnData).returning();
          if (items.length > 0) {
            await tx.insert(returnItems).values(
              items.map((i) => ({ ...i, returnId: created.id }))
            );
          }
          return created;
        });
      }
      // ============================================================================
      // DASHBOARD METRICS
      // ============================================================================
      /**
       * Dashboard metrics aggregator. Each sub-query below filters by
       * `storeId` (when supplied) so the Overview tab shows numbers
       * scoped to the active store rather than cross-tenant totals.
       * The `storeId` arrives from the route handler via
       * `req.storeScope?.storeId`, which is resolved upstream by the
       * `attachStoreScope` middleware reading the `X-Active-Store-Id`
       * header attached by the frontend's apiRequest interceptor.
       *
       * Why storeId is optional in the signature: the (rare) callers
       * without a request context (e.g. background metric jobs we may
       * add later) can omit it and get cross-store numbers. The route
       * handler always supplies it today.
       */
      async getDashboardMetrics(userId, startDate, endDate, storeId) {
        const buildAttributionCondition = (userIdParam) => or(
          eq(orderStatusHistory.changedBy, userIdParam),
          and(
            sql2`${orderStatusHistory.changedBy} IS NULL`,
            eq(orderAssignments.userId, userIdParam)
          )
        );
        const assignmentConditions = [];
        if (storeId) {
          assignmentConditions.push(eq(orderAssignments.storeId, storeId));
        }
        if (userId) {
          assignmentConditions.push(eq(orderAssignments.userId, userId));
        }
        if (startDate) {
          assignmentConditions.push(gte(orderAssignments.createdAt, startDate));
        }
        if (endDate) {
          assignmentConditions.push(lte(orderAssignments.createdAt, endDate));
        }
        const assignedOrderIds = await db.selectDistinct({ orderId: orderAssignments.orderId }).from(orderAssignments).where(assignmentConditions.length > 0 ? and(...assignmentConditions) : void 0);
        const confirmedInRangeConditions = [sql2`LOWER(${orderStatusHistory.status}) = 'confirmed'`];
        if (storeId) confirmedInRangeConditions.push(eq(orderStatusHistory.storeId, storeId));
        if (startDate) confirmedInRangeConditions.push(gte(orderStatusHistory.createdAt, startDate));
        if (endDate) confirmedInRangeConditions.push(lte(orderStatusHistory.createdAt, endDate));
        if (userId) confirmedInRangeConditions.push(buildAttributionCondition(userId));
        const confirmedOrderIds = await db.selectDistinct({ orderId: orderStatusHistory.orderId }).from(orderStatusHistory).leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId)).where(and(...confirmedInRangeConditions));
        const allAssignedIds = /* @__PURE__ */ new Set([
          ...assignedOrderIds.map((r) => r.orderId),
          ...confirmedOrderIds.map((r) => r.orderId)
        ]);
        const assignedCount = allAssignedIds.size;
        const confirmedConditions = [sql2`LOWER(${orderStatusHistory.status}) = 'confirmed'`];
        if (storeId) confirmedConditions.push(eq(orderStatusHistory.storeId, storeId));
        if (startDate) confirmedConditions.push(gte(orderStatusHistory.createdAt, startDate));
        if (endDate) confirmedConditions.push(lte(orderStatusHistory.createdAt, endDate));
        if (userId) confirmedConditions.push(buildAttributionCondition(userId));
        const [confirmedResult] = await db.select({ count: sql2`COUNT(DISTINCT ${orderStatusHistory.orderId})` }).from(orderStatusHistory).leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId)).where(and(...confirmedConditions));
        const cancelledConditions = [sql2`LOWER(${orderStatusHistory.status}) = 'cancelled'`];
        if (storeId) cancelledConditions.push(eq(orderStatusHistory.storeId, storeId));
        if (startDate) cancelledConditions.push(gte(orderStatusHistory.createdAt, startDate));
        if (endDate) cancelledConditions.push(lte(orderStatusHistory.createdAt, endDate));
        if (userId) cancelledConditions.push(buildAttributionCondition(userId));
        const [cancelledResult] = await db.select({ count: sql2`COUNT(DISTINCT ${orderStatusHistory.orderId})` }).from(orderStatusHistory).leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId)).where(and(...cancelledConditions));
        const shippedConditions = [sql2`LOWER(${orderStatusHistory.status}) IN ('shipped', 'fulfilled')`];
        if (storeId) shippedConditions.push(eq(orderStatusHistory.storeId, storeId));
        if (startDate) shippedConditions.push(gte(orderStatusHistory.createdAt, startDate));
        if (endDate) shippedConditions.push(lte(orderStatusHistory.createdAt, endDate));
        if (userId) shippedConditions.push(buildAttributionCondition(userId));
        const [shippedResult] = await db.select({ count: sql2`COUNT(DISTINCT ${orderStatusHistory.orderId})` }).from(orderStatusHistory).leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId)).where(and(...shippedConditions));
        const deliveredConditions = [sql2`LOWER(${orderStatusHistory.status}) = 'delivered'`];
        if (storeId) deliveredConditions.push(eq(orderStatusHistory.storeId, storeId));
        if (startDate) deliveredConditions.push(gte(orderStatusHistory.createdAt, startDate));
        if (endDate) deliveredConditions.push(lte(orderStatusHistory.createdAt, endDate));
        if (userId) deliveredConditions.push(buildAttributionCondition(userId));
        const [deliveredResult] = await db.select({ count: sql2`COUNT(DISTINCT ${orderStatusHistory.orderId})` }).from(orderStatusHistory).leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId)).where(and(...deliveredConditions));
        const rtoStatusCondition = sql2`(LOWER(${orders.shipmentStatus}) = 'rto' OR ${orders.status} IN ('rto_initiated', 'rto_delivered'))`;
        const rtoConditions = [rtoStatusCondition];
        if (storeId) rtoConditions.push(eq(orders.storeId, storeId));
        if (userId) rtoConditions.push(eq(orderAssignments.userId, userId));
        if (startDate) rtoConditions.push(gte(orders.updatedAt, startDate));
        if (endDate) rtoConditions.push(lte(orders.updatedAt, endDate));
        const [rtoResult] = await db.select({ count: sql2`COUNT(DISTINCT ${orders.id})` }).from(orders).leftJoin(orderAssignments, eq(orders.id, orderAssignments.orderId)).where(and(...rtoConditions));
        const followUpConditions = [eq(orders.callStatus, "Follow Up")];
        if (storeId) followUpConditions.push(eq(orders.storeId, storeId));
        if (userId) followUpConditions.push(eq(orderAssignments.userId, userId));
        const [followUpResult] = await db.select({ count: sql2`COUNT(DISTINCT ${orders.id})` }).from(orders).leftJoin(orderAssignments, eq(orders.id, orderAssignments.orderId)).where(and(...followUpConditions));
        const aiConfirmedConditions = [
          sql2`${orderStatusHistory.note} = 'Auto-confirmed by Scalysis AI'`,
          sql2`${orderStatusHistory.changedBy} IS NULL`
        ];
        if (storeId) aiConfirmedConditions.push(eq(orderStatusHistory.storeId, storeId));
        if (startDate) aiConfirmedConditions.push(gte(orderStatusHistory.createdAt, startDate));
        if (endDate) aiConfirmedConditions.push(lte(orderStatusHistory.createdAt, endDate));
        const [aiConfirmedResult] = await db.select({ count: sql2`COUNT(DISTINCT ${orderStatusHistory.orderId})` }).from(orderStatusHistory).where(and(...aiConfirmedConditions));
        return {
          assignedOrders: assignedCount,
          confirmedOrders: Number(confirmedResult?.count) || 0,
          cancelledOrders: Number(cancelledResult?.count) || 0,
          followUpOrders: Number(followUpResult?.count) || 0,
          fulfilledOrders: Number(shippedResult?.count) || 0,
          deliveredOrders: Number(deliveredResult?.count) || 0,
          rtoOrders: Number(rtoResult?.count) || 0,
          aiConfirmedOrders: Number(aiConfirmedResult?.count) || 0
        };
      }
      // ============================================================================
      // HOURLY ACTIVITY CHART
      // ============================================================================
      /**
       * Hourly activity chart aggregator. Scoped to the active store
       * via the optional storeId so multi-store dashboards don't blend
       * confirmations across tenants.
       */
      async getHourlyActivity(userId, startDate, endDate, timezone, storeId) {
        const safeTimezone = timezone || "UTC";
        const buildAttributionCondition = (userIdParam) => or(
          eq(orderStatusHistory.changedBy, userIdParam),
          and(
            sql2`${orderStatusHistory.changedBy} IS NULL`,
            eq(orderAssignments.userId, userIdParam)
          )
        );
        const conditions = [];
        if (storeId) conditions.push(eq(orderStatusHistory.storeId, storeId));
        if (startDate) conditions.push(gte(orderStatusHistory.createdAt, startDate));
        if (endDate) conditions.push(lte(orderStatusHistory.createdAt, endDate));
        if (userId) conditions.push(buildAttributionCondition(userId));
        conditions.push(sql2`LOWER(${orderStatusHistory.status}) IN ('confirmed', 'cancelled', 'follow up', 'follow_up')`);
        const results = await db.select({
          orderId: orderStatusHistory.orderId,
          status: sql2`LOWER(${orderStatusHistory.status})`,
          createdAt: orderStatusHistory.createdAt
        }).from(orderStatusHistory).leftJoin(orderAssignments, eq(orderStatusHistory.orderId, orderAssignments.orderId)).where(conditions.length > 0 ? and(...conditions) : void 0);
        const hourlyData = /* @__PURE__ */ new Map();
        for (let h = 0; h < 24; h++) {
          hourlyData.set(h, { confirmed: /* @__PURE__ */ new Set(), cancelled: /* @__PURE__ */ new Set(), followUp: /* @__PURE__ */ new Set() });
        }
        for (const row of results) {
          if (!row.createdAt) continue;
          const localHour = parseInt(
            new Date(row.createdAt).toLocaleString("en-US", {
              timeZone: safeTimezone,
              hour: "numeric",
              hour12: false
            }),
            10
          );
          const hourData = hourlyData.get(localHour);
          if (hourData && row.orderId) {
            const status = row.status.toLowerCase().replace(" ", "_");
            if (status === "confirmed") {
              hourData.confirmed.add(row.orderId);
            } else if (status === "cancelled") {
              hourData.cancelled.add(row.orderId);
            } else if (status === "follow_up" || status === "follow up") {
              hourData.followUp.add(row.orderId);
            }
          }
        }
        const formatHour = (h) => {
          if (h === 0) return "12 AM";
          if (h === 12) return "12 PM";
          if (h < 12) return `${h} AM`;
          return `${h - 12} PM`;
        };
        const formattedData = [];
        for (let h = 0; h < 24; h++) {
          const data = hourlyData.get(h) || { confirmed: /* @__PURE__ */ new Set(), cancelled: /* @__PURE__ */ new Set(), followUp: /* @__PURE__ */ new Set() };
          formattedData.push({
            hour: formatHour(h),
            confirmed: data.confirmed.size,
            cancelled: data.cancelled.size,
            followUp: data.followUp.size
          });
        }
        return formattedData;
      }
      // ============================================================================
      // APP SETTINGS METHODS
      // ============================================================================
      /**
       * Phase 5 (Risk #3): all three helpers now require a storeId.
       * The `app_settings` table's PK is composite (storeId, key), so a
       * lookup without storeId is ambiguous and a write without storeId
       * would silently target the wrong tenant. Every caller resolves
       * the storeId from `req.storeScope?.storeId` (HTTP routes) or
       * `resolveWebhookStore` (webhook handlers).
       */
      async getAppSetting(storeId, key) {
        const [setting] = await db.select().from(appSettings).where(
          and(eq(appSettings.storeId, storeId), eq(appSettings.key, key))
        );
        return setting;
      }
      async setAppSetting(storeId, key, value) {
        const [setting] = await db.insert(appSettings).values({ storeId, key, value, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
          // Composite PK target so the upsert keys off (store_id, key)
          // rather than the legacy single-column target.
          target: [appSettings.storeId, appSettings.key],
          set: { value, updatedAt: /* @__PURE__ */ new Date() }
        }).returning();
        return setting;
      }
      async getPrepaidPaymentMethods(storeId) {
        const setting = await this.getAppSetting(storeId, "prepaid_payment_methods");
        if (!setting || !Array.isArray(setting.value)) {
          return [];
        }
        return setting.value;
      }
      async getDistinctPaymentMethods(storeId) {
        const results = await db.selectDistinct({ paymentMethod: orders.paymentMethod }).from(orders).where(
          and(eq(orders.storeId, storeId), isNotNull(orders.paymentMethod))
        );
        return results.map((r) => r.paymentMethod).filter((m) => m !== null && m !== "");
      }
      async getDistinctTags() {
        const result = await db.execute(
          sql2`SELECT DISTINCT UNNEST(tags) AS tag FROM orders WHERE tags IS NOT NULL ORDER BY tag`
        );
        return result.rows.map((r) => r.tag).filter((t) => t !== null && t !== "");
      }
      /**
       * Boot-time seed: every connected store should have a default
       * prepaid_payment_methods mapping so the order-create webhook
       * can auto-confirm prepaid orders out of the box. Iterates over
       * `stores` so newly-connected tenants pick up the default on
       * the next server boot without manual intervention.
       */
      async seedDefaultSettings() {
        const allStores = await db.select({ id: stores.id }).from(stores);
        if (allStores.length === 0) {
          return;
        }
        for (const s of allStores) {
          const existing = await this.getAppSetting(s.id, "prepaid_payment_methods");
          if (!existing) {
            console.log(`Seeding prepaid_payment_methods for store ${s.id}\u2026`);
            await this.setAppSetting(s.id, "prepaid_payment_methods", [
              "PayU",
              "Cards, UPI, NB by PayU India"
            ]);
          }
        }
      }
      async createAbandonedCheckout(data) {
        const [checkout] = await db.insert(abandonedCheckouts).values(data).returning();
        return checkout;
      }
      async getAbandonedCheckouts() {
        const results = await db.select({
          id: abandonedCheckouts.id,
          // storeId added in Phase 1 (multi-store schema). Nullable
          // until backfill flips it NOT NULL.
          storeId: abandonedCheckouts.storeId,
          externalId: abandonedCheckouts.externalId,
          customerName: abandonedCheckouts.customerName,
          customerPhone: abandonedCheckouts.customerPhone,
          customerEmail: abandonedCheckouts.customerEmail,
          items: abandonedCheckouts.items,
          cartValue: abandonedCheckouts.cartValue,
          checkoutUrl: abandonedCheckouts.checkoutUrl,
          checkoutStage: abandonedCheckouts.checkoutStage,
          address: abandonedCheckouts.address,
          assignedTo: abandonedCheckouts.assignedTo,
          isRecovered: abandonedCheckouts.isRecovered,
          createdAt: abandonedCheckouts.createdAt,
          assignedAgentName: users.fullName
        }).from(abandonedCheckouts).leftJoin(users, eq(abandonedCheckouts.assignedTo, users.id)).orderBy(desc(abandonedCheckouts.createdAt));
        return results;
      }
      async createInboundWebhookLog(data) {
        const [log2] = await db.insert(inboundWebhookLogs).values(data).returning();
        return log2;
      }
      async getInboundWebhookLogs(limit = 50) {
        return await db.select().from(inboundWebhookLogs).orderBy(desc(inboundWebhookLogs.createdAt)).limit(limit);
      }
    };
    storage = new DbStorage();
  }
});

// server/encryption.ts
var encryption_exports = {};
__export(encryption_exports, {
  decrypt: () => decrypt,
  encrypt: () => encrypt,
  maskSecret: () => maskSecret
});
import crypto2 from "crypto";
function getEncryptionKey() {
  return crypto2.createHash("sha256").update(ENCRYPTION_KEY).digest();
}
function encrypt(text2) {
  if (!text2) return text2;
  const iv = crypto2.randomBytes(16);
  const cipher = crypto2.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  let encrypted = cipher.update(text2, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}
function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText;
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }
    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const encrypted = parts[2];
    const decipher = crypto2.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
}
function maskSecret(secret) {
  if (!secret || secret.length <= 4) return "****";
  return "*".repeat(secret.length - 4) + secret.slice(-4);
}
var ENCRYPTION_KEY;
var init_encryption = __esm({
  "server/encryption.ts"() {
    "use strict";
    ENCRYPTION_KEY = process.env.SESSION_SECRET || "default-encryption-key-change-in-prod";
  }
});

// server/shopify.ts
var shopify_exports = {};
__export(shopify_exports, {
  ShopifyClient: () => ShopifyClient,
  getLegacyStoreShopifyClient: () => getLegacyStoreShopifyClient,
  getShopifyClient: () => getShopifyClient,
  invalidateShopifyClient: () => invalidateShopifyClient,
  shopifyClient: () => shopifyClient,
  updateShopifyClient: () => updateShopifyClient,
  verifyShopifyHmac: () => verifyShopifyHmac
});
import crypto3 from "crypto";
async function loadShopifyCredentials() {
  try {
    const { storage: storage3 } = await Promise.resolve().then(() => (init_storage(), storage_exports));
    const { decrypt: decrypt2 } = await Promise.resolve().then(() => (init_encryption(), encryption_exports));
    const credentials = await storage3.getShopifyCredentials();
    if (credentials && credentials.isActive) {
      return {
        storeUrl: credentials.storeUrl,
        apiKey: decrypt2(credentials.apiKey),
        // clientId
        apiSecret: decrypt2(credentials.apiSecret),
        // clientSecret
        webhookSecret: credentials.webhookSecret ? decrypt2(credentials.webhookSecret) : void 0,
        useClientCredentials: true
      };
    }
  } catch {
    console.log(
      "No database credentials found, falling back to environment variables"
    );
  }
  const shopDomain2 = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_URL;
  return {
    storeUrl: shopDomain2,
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
    useClientCredentials: true
  };
}
function verifyShopifyHmac(rawBody, hmacHeader, secret) {
  if (!secret) return false;
  if (typeof hmacHeader !== "string" || hmacHeader.length === 0) return false;
  const computed = crypto3.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false;
  return crypto3.timingSafeEqual(a, b);
}
async function updateShopifyClient() {
  const config = await loadShopifyCredentials();
  const cleanDomain = config.storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  console.log(
    `[Shopify] updateShopifyClient: reloading credentials \u2192 domain=${cleanDomain}, useClientCredentials=${config.useClientCredentials}`
  );
  shopifyClient.config = config;
  shopifyClient.baseUrl = `https://${cleanDomain}/admin/api/2024-01`;
  shopifyClient.tokenCache = null;
  return shopifyClient;
}
async function loadShopifyConfigForStore(storeId) {
  const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  const { stores: stores2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
  const { eq: eq8 } = await import("drizzle-orm");
  const { decrypt: decrypt2 } = await Promise.resolve().then(() => (init_encryption(), encryption_exports));
  const [row] = await db2.select().from(stores2).where(eq8(stores2.id, storeId)).limit(1);
  if (!row) {
    throw new Error(
      `[Shopify] getShopifyClient: no stores row for id ${storeId}`
    );
  }
  return {
    storeUrl: row.storeUrl,
    apiKey: row.apiKey ? decrypt2(row.apiKey) : "",
    apiSecret: row.apiSecret ? decrypt2(row.apiSecret) : "",
    webhookSecret: row.webhookSecret ? decrypt2(row.webhookSecret) : void 0,
    useClientCredentials: true
  };
}
async function getShopifyClient(storeId) {
  const cached = clientCache.get(storeId);
  if (cached) return cached.client;
  const inFlight = inFlightLoads.get(storeId);
  if (inFlight) return inFlight;
  const promise = (async () => {
    const config = await loadShopifyConfigForStore(storeId);
    const client = new ShopifyClient(config);
    clientCache.set(storeId, { client, loadedAt: Date.now() });
    return client;
  })();
  inFlightLoads.set(storeId, promise);
  try {
    return await promise;
  } finally {
    inFlightLoads.delete(storeId);
  }
}
function invalidateShopifyClient(storeId) {
  if (storeId) {
    clientCache.delete(storeId);
  } else {
    clientCache.clear();
  }
}
async function getLegacyStoreShopifyClient() {
  const { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  const { stores: stores2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
  const { asc: asc4 } = await import("drizzle-orm");
  const [row] = await db2.select({ id: stores2.id }).from(stores2).orderBy(asc4(stores2.createdAt)).limit(1);
  if (!row) {
    return shopifyClient;
  }
  return getShopifyClient(row.id);
}
var TOKEN_REFRESH_BUFFER_MS, ShopifyClient, shopDomain, initialConfig, shopifyClient, clientCache, inFlightLoads;
var init_shopify = __esm({
  "server/shopify.ts"() {
    "use strict";
    TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1e3;
    ShopifyClient = class _ShopifyClient {
      config;
      baseUrl;
      tokenCache = null;
      constructor(config) {
        this.config = config;
        this.baseUrl = `https://${this.sanitizeStoreUrl(config.storeUrl)}/admin/api/2024-01`;
      }
      sanitizeStoreUrl(url) {
        return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      }
      async fetchClientCredentialsToken() {
        const domain = this.sanitizeStoreUrl(this.config.storeUrl);
        const url = `https://${domain}/admin/oauth/access_token`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: this.config.apiKey,
            client_secret: this.config.apiSecret,
            grant_type: "client_credentials"
          })
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `Shopify OAuth token fetch failed: ${response.status} ${response.statusText} - ${body}`
          );
        }
        const data = await response.json();
        const expiresIn = data.expires_in ?? 86400;
        const cache = {
          accessToken: data.access_token,
          expiresAt: Date.now() + expiresIn * 1e3
        };
        console.log(
          `[Shopify] Client credentials token fetched, expires in ${expiresIn}s`
        );
        return cache;
      }
      async getAccessToken() {
        if (!this.config.useClientCredentials) {
          return this.config.apiKey;
        }
        const now = Date.now();
        if (this.tokenCache && this.tokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS > now) {
          return this.tokenCache.accessToken;
        }
        this.tokenCache = await this.fetchClientCredentialsToken();
        return this.tokenCache.accessToken;
      }
      async getHeaders() {
        const token = await this.getAccessToken();
        return {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token
        };
      }
      async fetchOrders(params) {
        const queryParams = new URLSearchParams();
        if (params?.status) queryParams.set("status", params.status);
        if (params?.limit) queryParams.set("limit", params.limit.toString());
        if (params?.sinceId) queryParams.set("since_id", params.sinceId);
        const url = `${this.baseUrl}/orders.json?${queryParams.toString()}`;
        const response = await fetch(url, {
          method: "GET",
          headers: await this.getHeaders()
        });
        if (!response.ok) {
          const errorBody = await response.text();
          console.error("Shopify API error details:", {
            status: response.status,
            statusText: response.statusText,
            body: errorBody,
            hasApiKey: !!this.config.apiKey
          });
          throw new Error(
            `Shopify API error: ${response.statusText} (${response.status})`
          );
        }
        return await response.json();
      }
      async fetchOrder(orderId) {
        const url = `${this.baseUrl}/orders/${orderId}.json`;
        const response = await fetch(url, {
          method: "GET",
          headers: await this.getHeaders()
        });
        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.statusText}`);
        }
        return await response.json();
      }
      async fetchCustomer(customerId) {
        const url = `${this.baseUrl}/customers/${customerId}.json`;
        const response = await fetch(url, {
          method: "GET",
          headers: await this.getHeaders()
        });
        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.statusText}`);
        }
        return await response.json();
      }
      async getShopInfo(customConfig) {
        const storeUrl = customConfig?.storeUrl || this.config.storeUrl;
        const domain = this.sanitizeStoreUrl(storeUrl);
        const url = `https://${domain}/admin/api/2024-01/shop.json`;
        let token;
        if (customConfig?.accessToken) {
          token = customConfig.accessToken;
        } else if (customConfig) {
          const tempClient = new _ShopifyClient({
            storeUrl: customConfig.storeUrl,
            apiKey: customConfig.apiKey,
            apiSecret: customConfig.apiSecret,
            useClientCredentials: customConfig.useClientCredentials
          });
          token = await tempClient.getAccessToken();
        } else {
          token = await this.getAccessToken();
        }
        const headers = {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token
        };
        const response = await fetch(url, { method: "GET", headers });
        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Shopify API error: ${response.statusText} - ${errorBody}`
          );
        }
        const data = await response.json();
        return data.shop;
      }
      // Fetch every test-mode order (Shopify's `test=true` flag) across the
      // whole store, paginated. Uses the same Link-header cursor pattern as
      // fetchAllProducts. Shopify's REST filter `test=true` is accepted as
      // a query param; we also filter client-side as a defence-in-depth in
      // case the param is ever silently ignored.
      async fetchAllTestOrders() {
        const out = [];
        let pageInfo = null;
        let hasNextPage = true;
        while (hasNextPage) {
          const params = new URLSearchParams();
          params.set("limit", "250");
          params.set("status", "any");
          params.set("fields", "id,name,test");
          if (pageInfo) {
            params.set("page_info", pageInfo);
          } else {
            params.set("test", "true");
          }
          const url = `${this.baseUrl}/orders.json?${params.toString()}`;
          const response = await fetch(url, {
            method: "GET",
            headers: await this.getHeaders()
          });
          if (!response.ok) {
            const errorBody = await response.text();
            console.error("Shopify test-orders API error:", {
              status: response.status,
              statusText: response.statusText,
              body: errorBody
            });
            throw new Error(
              `Shopify API error: ${response.statusText} (${response.status})`
            );
          }
          const data = await response.json();
          for (const o of data.orders || []) {
            if (o.test === true) {
              out.push({ id: Number(o.id), name: String(o.name ?? ""), test: true });
            }
          }
          const linkHeader = response.headers.get("Link");
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const match = linkHeader.match(
              /<[^>]*page_info=([^>&>]+)[^>]*>;\s*rel="next"/
            );
            pageInfo = match ? match[1] : null;
            hasNextPage = !!pageInfo;
          } else {
            hasNextPage = false;
          }
        }
        return out;
      }
      async fetchAllProducts() {
        const allProducts = [];
        let pageInfo = null;
        let hasNextPage = true;
        while (hasNextPage) {
          const queryParams = new URLSearchParams();
          queryParams.set("limit", "250");
          if (pageInfo) queryParams.set("page_info", pageInfo);
          const url = `${this.baseUrl}/products.json?${queryParams.toString()}`;
          const response = await fetch(url, {
            method: "GET",
            headers: await this.getHeaders()
          });
          if (!response.ok) {
            const errorBody = await response.text();
            console.error("Shopify products API error:", {
              status: response.status,
              statusText: response.statusText,
              body: errorBody
            });
            throw new Error(
              `Shopify API error: ${response.statusText} (${response.status})`
            );
          }
          const data = await response.json();
          allProducts.push(...data.products || []);
          const linkHeader = response.headers.get("Link");
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const match = linkHeader.match(
              /<[^>]*page_info=([^>&>]+)[^>]*>;\s*rel="next"/
            );
            pageInfo = match ? match[1] : null;
            hasNextPage = !!pageInfo;
          } else {
            hasNextPage = false;
          }
        }
        return allProducts;
      }
      /**
       * Verify a Shopify webhook against this client's configured
       * webhook_secret. Accepts the raw request body as a Buffer — NOT
       * a stringified JSON object. Shopify signs the bytes it sent, so
       * `JSON.stringify(req.body)` (which re-encodes after Express
       * parsed the JSON) produces a different byte sequence whenever
       * the payload contains non-ASCII characters or whitespace
       * variations, and the HMAC silently fails. Use `req.rawBody`
       * (captured by the `verify` hook in server/index.ts) instead.
       *
       * Most call sites should prefer the standalone `verifyShopifyHmac`
       * helper exported below — that one takes an explicit secret so
       * webhooks can be verified against per-store keys looked up via
       * server/webhookStoreResolver.ts. This instance method only
       * exists for legacy callers still anchored to the singleton.
       */
      verifyWebhook(rawBody, hmacHeader) {
        if (!this.config.webhookSecret) {
          throw new Error(
            "Webhook secret not configured - refusing to process unverified webhooks"
          );
        }
        return verifyShopifyHmac(rawBody, hmacHeader, this.config.webhookSecret);
      }
      // ── Webhook registration ──────────────────────────────────────────
      // Idempotent by design so it's safe to call on every server boot:
      //   • "unchanged" — same topic+address already registered, no-op
      //   • "updated"   — topic exists but at a different address (e.g.
      //                   ngrok tunnel rotated), we PUT the new address
      //   • "created"   — topic wasn't registered, we POST a new one
      //
      // Callers pass in a pre-fetched `existing` list to avoid re-listing
      // once per registration. See `registerAllWebhooks()` for usage.
      async registerWebhook(topic, address, existing) {
        const list = existing ?? (await this.listWebhooks()).webhooks ?? [];
        const match = list.find((w) => w.topic === topic);
        if (match && match.address === address) {
          return { action: "unchanged", webhook: match };
        }
        if (match && match.address !== address) {
          const url2 = `${this.baseUrl}/webhooks/${match.id}.json`;
          const response2 = await fetch(url2, {
            method: "PUT",
            headers: await this.getHeaders(),
            body: JSON.stringify({ webhook: { id: match.id, address } })
          });
          if (!response2.ok) {
            const body = await response2.text();
            throw new Error(
              `Failed to update webhook ${match.id} (${topic}): ${response2.status} ${response2.statusText} \u2014 ${body}`
            );
          }
          const json3 = await response2.json();
          return { action: "updated", webhook: json3.webhook };
        }
        const url = `${this.baseUrl}/webhooks.json`;
        const response = await fetch(url, {
          method: "POST",
          headers: await this.getHeaders(),
          body: JSON.stringify({ webhook: { topic, address, format: "json" } })
        });
        if (response.status === 422) {
          const fresh = (await this.listWebhooks()).webhooks ?? [];
          const now = fresh.find((w) => w.topic === topic);
          if (now) return { action: "unchanged", webhook: now };
        }
        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `Failed to register webhook (${topic} \u2192 ${address}): ${response.status} ${response.statusText} \u2014 ${body}`
          );
        }
        const json2 = await response.json();
        return { action: "created", webhook: json2.webhook };
      }
      async listWebhooks() {
        const url = `${this.baseUrl}/webhooks.json`;
        const response = await fetch(url, {
          method: "GET",
          headers: await this.getHeaders()
        });
        if (!response.ok) {
          throw new Error(`Failed to list webhooks: ${response.statusText}`);
        }
        return await response.json();
      }
      // Register the full set of webhooks Pare needs. Topic → subpath
      // mapping matches the handlers wired in server/routes.ts. One
      // listWebhooks() call is reused for all four registrations so we
      // don't hammer Shopify on every boot.
      async registerAllWebhooks(appUrl) {
        const base = appUrl.replace(/\/+$/, "");
        const TOPIC_MAP = [
          { topic: "orders/create", subpath: "/api/webhooks/orders/create" },
          { topic: "orders/updated", subpath: "/api/webhooks/orders/update" },
          { topic: "orders/cancelled", subpath: "/api/webhooks/orders/cancelled" },
          { topic: "fulfillments/update", subpath: "/api/webhooks/fulfillments/update" }
        ];
        let existing = [];
        try {
          const res = await this.listWebhooks();
          existing = res.webhooks ?? [];
        } catch (err) {
          const msg = err?.message ?? String(err);
          return {
            topics: TOPIC_MAP.map((t) => ({
              topic: t.topic,
              address: `${base}${t.subpath}`,
              action: "failed",
              error: `listWebhooks() failed: ${msg}`
            }))
          };
        }
        const results = [];
        for (const { topic, subpath } of TOPIC_MAP) {
          const address = `${base}${subpath}`;
          try {
            const { action } = await this.registerWebhook(topic, address, existing);
            results.push({ topic, address, action });
          } catch (err) {
            results.push({
              topic,
              address,
              action: "failed",
              error: err?.message ?? String(err)
            });
          }
        }
        return { topics: results };
      }
      // ============================================================================
      // GRAPHQL MUTATIONS FOR SHOPIFY SYNC
      // ============================================================================
      async graphqlRequest(query, variables) {
        const domain = this.sanitizeStoreUrl(this.config.storeUrl);
        const url = `https://${domain}/admin/api/2025-01/graphql.json`;
        const token = await this.getAccessToken();
        const tokenPrefix = token ? token.substring(0, 10) + "..." : "MISSING";
        const mutationMatch = query.match(/mutation\s+(\w+)/);
        const mutationName = mutationMatch?.[1] ?? "unknown";
        console.log(
          `[Shopify GraphQL] \u2192 ${mutationName}  url=${url}  token=${tokenPrefix}`
        );
        console.log(
          `[Shopify GraphQL]   variables=${JSON.stringify(variables)}`
        );
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token
          },
          body: JSON.stringify({ query, variables })
        });
        if (!response.ok) {
          const errorBody = await response.text();
          console.error(
            `[Shopify GraphQL] \u2717 HTTP ${response.status} ${response.statusText}  mutation=${mutationName}  url=${url}`
          );
          console.error(`[Shopify GraphQL]   response body: ${errorBody}`);
          throw new Error(
            `Shopify GraphQL HTTP ${response.status} (${response.statusText}) for ${mutationName}: ${errorBody}`
          );
        }
        const result = await response.json();
        if (result.errors) {
          console.error(
            `[Shopify GraphQL] \u2717 GraphQL errors for ${mutationName}:`,
            JSON.stringify(result.errors, null, 2)
          );
          throw new Error(
            `GraphQL errors in ${mutationName}: ${JSON.stringify(result.errors)}`
          );
        }
        const mutationKey = Object.keys(result.data || {})[0];
        if (mutationKey && result.data[mutationKey]?.userErrors?.length > 0) {
          const userErrors = result.data[mutationKey].userErrors;
          console.error(
            `[Shopify GraphQL] \u2717 userErrors in ${mutationName}:`,
            JSON.stringify(userErrors, null, 2)
          );
        } else {
          console.log(
            `[Shopify GraphQL] \u2713 ${mutationName} succeeded  HTTP ${response.status}`
          );
        }
        return result.data;
      }
      async updateOrderTags(shopifyOrderId, tags) {
        const query = `
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
        const variables = {
          input: {
            id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
            tags
          }
        };
        const data = await this.graphqlRequest(query, variables);
        if (data.orderUpdate.userErrors.length > 0) {
          throw new Error(
            `Order update failed: ${JSON.stringify(data.orderUpdate.userErrors)}`
          );
        }
        return data.orderUpdate.order;
      }
      async addOrderNote(shopifyOrderId, note) {
        const query = `
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            note
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
        const variables = {
          input: {
            id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
            note
          }
        };
        const data = await this.graphqlRequest(query, variables);
        if (data.orderUpdate.userErrors.length > 0) {
          throw new Error(
            `Order note update failed: ${JSON.stringify(data.orderUpdate.userErrors)}`
          );
        }
        return data.orderUpdate.order;
      }
      async updateOrderShippingAddress(shopifyOrderId, shippingAddress) {
        const query = `
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              provinceCode
              zip
              country
              countryCodeV2
              phone
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
        const variables = {
          input: {
            id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
            shippingAddress: {
              firstName: shippingAddress.firstName,
              lastName: shippingAddress.lastName,
              address1: shippingAddress.address1,
              address2: shippingAddress.address2,
              city: shippingAddress.city,
              province: shippingAddress.province,
              zip: shippingAddress.zip,
              country: shippingAddress.country || "India",
              phone: shippingAddress.phone
            }
          }
        };
        const data = await this.graphqlRequest(query, variables);
        if (data.orderUpdate.userErrors.length > 0) {
          throw new Error(
            `Shipping address update failed: ${JSON.stringify(data.orderUpdate.userErrors)}`
          );
        }
        return data.orderUpdate.order;
      }
      async cancelOrder(shopifyOrderId, reason, notifyCustomer = true, restock = true) {
        const orderState = await this.getOrderState(shopifyOrderId);
        if (orderState.cancelledAt !== null) {
          throw new Error("Order already cancelled");
        }
        if (orderState.displayFinancialStatus === "VOIDED" || orderState.displayFinancialStatus === "REFUNDED") {
          throw new Error("Order already cancelled/refunded");
        }
        if (orderState.displayFulfillmentStatus === "FULFILLED" || orderState.displayFulfillmentStatus === "PARTIALLY_FULFILLED") {
          throw new Error("Cannot cancel fulfilled orders");
        }
        if (orderState.closed === true) {
          throw new Error("Cannot cancel archived orders");
        }
        const query = `
      mutation orderCancel($orderId: ID!, $reason: OrderCancelReason!, $notifyCustomer: Boolean!, $restock: Boolean!, $refund: Boolean!) {
        orderCancel(
          orderId: $orderId
          notifyCustomer: $notifyCustomer
          restock: $restock
          reason: $reason
          refund: $refund
        ) {
          job {
            id
            done
          }
          orderCancelUserErrors {
            field
            message
            code
          }
        }
      }
    `;
        const shopifyReasonMap = {
          "Customer changed mind": "CUSTOMER",
          "Found better price elsewhere": "CUSTOMER",
          "Wrong item/size/color": "INVENTORY",
          "Delivery time too long": "CUSTOMER",
          "Family member disapproved": "CUSTOMER",
          "Fake/test order": "FRAUD",
          "Customer unreachable": "CUSTOMER",
          "Address issues": "CUSTOMER",
          Other: "OTHER"
        };
        const shopifyReason = shopifyReasonMap[reason] || "OTHER";
        const variables = {
          orderId: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
          reason: shopifyReason,
          notifyCustomer,
          restock,
          refund: true
        };
        const data = await this.graphqlRequest(query, variables);
        if (data.orderCancel.orderCancelUserErrors && data.orderCancel.orderCancelUserErrors.length > 0) {
          throw new Error(
            `Order cancellation failed: ${JSON.stringify(data.orderCancel.orderCancelUserErrors)}`
          );
        }
        return data.orderCancel.job;
      }
      async updateMetafield(shopifyOrderId, key, value, type = "single_line_text_field") {
        const query = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
        const variables = {
          metafields: [
            {
              ownerId: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
              namespace: "orderflowai",
              key,
              value,
              type
            }
          ]
        };
        const data = await this.graphqlRequest(query, variables);
        if (data.metafieldsSet.userErrors.length > 0) {
          throw new Error(
            `Metafield update failed: ${JSON.stringify(data.metafieldsSet.userErrors)}`
          );
        }
        return data.metafieldsSet.metafields;
      }
      async getOrderState(shopifyOrderId) {
        const query = `
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          closed
        }
      }
    `;
        const variables = {
          id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`
        };
        const data = await this.graphqlRequest(query, variables);
        if (!data.order) {
          throw new Error(`Order not found: ${shopifyOrderId}`);
        }
        return {
          cancelledAt: data.order.cancelledAt,
          displayFinancialStatus: data.order.displayFinancialStatus,
          displayFulfillmentStatus: data.order.displayFulfillmentStatus,
          closed: data.order.closed
        };
      }
    };
    shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_URL || "placeholder.myshopify.com";
    initialConfig = {
      storeUrl: shopDomain,
      apiKey: process.env.SHOPIFY_API_KEY || "",
      apiSecret: process.env.SHOPIFY_API_SECRET || "",
      webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
      useClientCredentials: true
    };
    console.log("Shopify configuration status:", {
      hasStoreUrl: !!initialConfig.storeUrl,
      hasClientId: !!initialConfig.apiKey,
      hasClientSecret: !!initialConfig.apiSecret,
      hasWebhookSecret: !!initialConfig.webhookSecret,
      storeUrlFormat: initialConfig.storeUrl?.includes(".myshopify.com") ? "valid" : "invalid",
      authMode: "client_credentials_grant"
    });
    shopifyClient = new ShopifyClient(initialConfig);
    clientCache = /* @__PURE__ */ new Map();
    inFlightLoads = /* @__PURE__ */ new Map();
  }
});

// server/logic/unifiedStatus.ts
function safeFallback(raw, source) {
  const lower = (raw || "").toLowerCase();
  const fallback = lower.includes("rto") || lower.includes("return") || lower.includes("rtnd") ? "rto_initiated" : "in_transit";
  console.warn(
    `[unifiedStatus] Unknown ${source} status "${raw}" \u2014 falling back to "${fallback}". Add an explicit mapping if this status is expected.`
  );
  return fallback;
}
function mapDelhivery(rawStatus) {
  const key = (rawStatus || "").toLowerCase().trim();
  return DELHIVERY_TO_UNIFIED[key] ?? safeFallback(rawStatus, "delhivery");
}
function mapShiprocket(rawStatus) {
  const key = (rawStatus || "").toLowerCase().trim();
  if (!key) {
    console.warn('[unifiedStatus] Empty shiprocket status \u2014 defaulting to "in_transit".');
    return "in_transit";
  }
  if (SHIPROCKET_TO_UNIFIED[key]) return SHIPROCKET_TO_UNIFIED[key];
  if (key.includes("out for delivery")) return key.includes("rto") ? "rto_ofd" : "out_for_delivery";
  if (key.includes("rto") && (key.includes("deliver") || key.includes("return"))) return "rto_delivered";
  if (key.includes("rto")) return "rto_initiated";
  if (key.includes("deliver")) return "delivered";
  if (key.includes("picked")) return "picked_up";
  if (key.includes("pickup")) return "ready_for_pickup";
  if (key.includes("transit")) return "in_transit";
  if (key.includes("lost") || key.includes("damaged")) return "lost";
  if (key.includes("cancel")) return "cancelled";
  if (key.includes("undeliver") || key.includes("ndr")) return "ndr";
  return safeFallback(rawStatus ?? "", "shiprocket");
}
function mapShopify(input) {
  if (input.cancelledAt) return "cancelled";
  if (input.shipmentStatus === "delivered") return "delivered";
  if (input.fulfillmentStatus === "fulfilled" || input.fulfillmentStatus === "partial") {
    return "awb_assigned";
  }
  return "unfulfilled";
}
function mapShopifyFulfillment(rawStatus) {
  const key = (rawStatus || "").toLowerCase().trim();
  if (!key) {
    return "awb_assigned";
  }
  return SHOPIFY_FULFILLMENT_TO_UNIFIED[key] ?? safeFallback(rawStatus ?? "", "shopify_fulfillment");
}
function toUnifiedStatus(input) {
  switch (input.source) {
    case "delhivery":
      return mapDelhivery(input.rawStatus);
    case "shiprocket":
      return mapShiprocket(input.rawStatus);
    case "shopify_fulfillment":
      return mapShopifyFulfillment(input.rawStatus);
    case "shopify":
      return mapShopify(input);
    default: {
      const _exhaustive = input;
      console.warn("[unifiedStatus] Unknown source \u2014 defaulting to in_transit.", _exhaustive);
      return "in_transit";
    }
  }
}
var VALID_STATUSES, DELHIVERY_TO_UNIFIED, SHIPROCKET_TO_UNIFIED, SHOPIFY_FULFILLMENT_TO_UNIFIED;
var init_unifiedStatus = __esm({
  "server/logic/unifiedStatus.ts"() {
    "use strict";
    init_schema();
    VALID_STATUSES = new Set(SHIPPING_STATUSES);
    DELHIVERY_TO_UNIFIED = {
      unfulfilled: "unfulfilled",
      awb_assigned: "awb_assigned",
      ready_to_ship: "awb_assigned",
      // legacy alias
      ready_for_pickup: "ready_for_pickup",
      picked_up: "picked_up",
      in_transit: "in_transit",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
      ndr: "ndr",
      rto_initiated: "rto_initiated",
      rto_ofd: "rto_ofd",
      rto_delivered: "rto_delivered",
      cancelled: "cancelled",
      lost: "lost"
    };
    SHIPROCKET_TO_UNIFIED = {
      // pre-pickup
      "manifest generated": "awb_assigned",
      "awb assigned": "awb_assigned",
      "label generated": "awb_assigned",
      "ready to ship": "awb_assigned",
      "pickup scheduled": "ready_for_pickup",
      "pickup generated": "ready_for_pickup",
      "pickup queued": "ready_for_pickup",
      "out for pickup": "ready_for_pickup",
      "pickup rescheduled": "ready_for_pickup",
      // in motion
      "picked up": "picked_up",
      "pickup done": "picked_up",
      "in transit": "in_transit",
      shipped: "in_transit",
      "reached at destination hub": "in_transit",
      "misrouted": "in_transit",
      "out for delivery": "out_for_delivery",
      // terminal (forward)
      delivered: "delivered",
      // failed delivery
      undelivered: "ndr",
      ndr: "ndr",
      "ndr raised": "ndr",
      "delivery attempted": "ndr",
      // RTO lifecycle
      "rto initiated": "rto_initiated",
      "rto acknowledged": "rto_initiated",
      "rto in transit": "rto_initiated",
      rto: "rto_initiated",
      "rto out for delivery": "rto_ofd",
      "rto ofd": "rto_ofd",
      "rto delivered": "rto_delivered",
      "rto returned": "rto_delivered",
      returned: "rto_delivered",
      // exceptions
      cancelled: "cancelled",
      canceled: "cancelled",
      lost: "lost",
      "lost in transit": "lost",
      damaged: "lost",
      "damaged in transit": "lost"
    };
    SHOPIFY_FULFILLMENT_TO_UNIFIED = {
      confirmed: "awb_assigned",
      ready_for_pickup: "ready_for_pickup",
      picked_up: "picked_up",
      in_transit: "in_transit",
      out_for_delivery: "out_for_delivery",
      delivered: "delivered",
      attempted_delivery: "ndr",
      failure: "ndr"
    };
  }
});

// server/resend.ts
import { Resend } from "resend";
function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL environment variable is not set");
  }
  return { apiKey, fromEmail };
}
async function getUncachableResendClient() {
  const { apiKey, fromEmail } = getResendConfig();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}
async function sendInvitationEmail(params) {
  const { client, fromEmail } = await getUncachableResendClient();
  const envBase = typeof process.env.APP_BASE_URL === "string" ? process.env.APP_BASE_URL.trim() : "";
  const isUsableEnvBase = envBase.length > 0 && !/placeholder/i.test(envBase);
  const baseUrl = isUsableEnvBase ? envBase : process.env.NODE_ENV === "production" ? "https://www.orderflow.sbs" : "http://localhost:5001";
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const inviteUrl = `${cleanBase}/signup?token=${params.inviteToken}`;
  const expiryDate = new Date(params.expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  const roleDisplay = params.role === "admin" ? "Administrator" : "Agent";
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to OrderFlowAI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px 40px; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111827;">
                You're invited to join OrderFlowAI
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #374151;">
                Hello,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #374151;">
                <strong>${params.inviterName}</strong> has invited you to join their team on <strong>OrderFlowAI</strong> as a <strong>${roleDisplay}</strong>.
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 24px; color: #374151;">
                OrderFlowAI is a powerful order management platform designed to help Indian e-commerce brands reduce COD/RTO rates and streamline multi-courier logistics.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 20px 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 30px 0; font-size: 14px; line-height: 20px; color: #3b82f6; word-break: break-all;">
                ${inviteUrl}
              </p>
              
              <!-- Info Box -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 30px 0;">
                <p style="margin: 0; font-size: 14px; line-height: 20px; color: #92400e;">
                  <strong>Note:</strong> This invitation expires on ${expiryDate}. Please accept it before then.
                </p>
              </div>
              
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #e5e7eb; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #6b7280; text-align: center;">
                \xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} OrderFlowAI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
  const textContent = `
You're invited to join OrderFlowAI

Hello,

${params.inviterName} has invited you to join their team on OrderFlowAI as a ${roleDisplay}.

OrderFlowAI is a powerful order management platform designed to help Indian e-commerce brands reduce COD/RTO rates and streamline multi-courier logistics.

To accept this invitation, click the link below or copy and paste it into your browser:
${inviteUrl}

Note: This invitation expires on ${expiryDate}. Please accept it before then.

If you didn't expect this invitation, you can safely ignore this email.

\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} OrderFlowAI. All rights reserved.
  `.trim();
  const { data, error } = await client.emails.send({
    from: fromEmail,
    to: params.toEmail,
    subject: `You're invited to join OrderFlowAI`,
    html: htmlContent,
    text: textContent
  });
  if (error) {
    console.error("Resend error:", error);
    throw new Error(`Failed to send invitation email: ${error.message}`);
  }
  return data;
}
var init_resend = __esm({
  "server/resend.ts"() {
    "use strict";
  }
});

// server/shiprocketWebhook.ts
var shiprocketWebhook_exports = {};
__export(shiprocketWebhook_exports, {
  handleShiprocketWebhook: () => handleShiprocketWebhook
});
import crypto5 from "crypto";
function verifyShiprocketSignature(payload, signature, secret) {
  if (!signature) {
    console.error("[Shiprocket Webhook] No signature provided");
    return false;
  }
  try {
    const hmac = crypto5.createHmac("sha256", secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");
    return crypto5.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("[Shiprocket Webhook] Signature verification error:", error);
    return false;
  }
}
async function handleShiprocketWebhook(req, res) {
  try {
    console.log("[Shiprocket Webhook] Received webhook:", {
      headers: req.headers,
      body: req.body
    });
    const shiprocketWebhookSecret = process.env.SHIPROCKET_WEBHOOK_SECRET;
    if (!shiprocketWebhookSecret) {
      console.error("[Shiprocket Webhook] SHIPROCKET_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }
    const signature = req.headers["x-shiprocket-signature"];
    const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
    if (!verifyShiprocketSignature(rawBody, signature, shiprocketWebhookSecret)) {
      console.error("[Shiprocket Webhook] Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
    console.log("[Shiprocket Webhook] Signature verified successfully");
    const payload = req.body;
    if (!payload.awb || !payload.current_status) {
      console.error("[Shiprocket Webhook] Missing required fields");
      return res.status(400).json({ error: "Missing required fields" });
    }
    const shipment = await storage.getShipmentByAWB(payload.awb);
    if (!shipment) {
      console.error("[Shiprocket Webhook] Shipment not found:", payload.awb);
      return res.status(404).json({ error: "Shipment not found" });
    }
    await storage.updateShipment(shipment.id, {
      currentStatus: payload.current_status,
      statusUpdatedAt: /* @__PURE__ */ new Date(),
      courierName: payload.courier_name || shipment.courierName
    });
    const unifiedStatus = payload.ndr_status ? "ndr" : toUnifiedStatus({ source: "shiprocket", rawStatus: payload.current_status });
    const isNDR = unifiedStatus === "ndr";
    const isDelivered = unifiedStatus === "delivered";
    const isRTO = unifiedStatus === "rto_initiated" || unifiedStatus === "rto_ofd" || unifiedStatus === "rto_delivered";
    await storage.updateOrder(shipment.orderId, {
      status: unifiedStatus,
      shipmentStatus: SHIPPING_STATUS_LABELS[unifiedStatus] || payload.current_status
    });
    if (isNDR) {
      console.log("[Shiprocket Webhook] NDR event detected:", {
        awb: payload.awb,
        status: payload.current_status,
        ndrStatus: payload.ndr_status
      });
      let ndrStatus = "other";
      const statusLower = (payload.current_status || "").toLowerCase();
      if (statusLower.includes("customer unavailable") || statusLower.includes("not available")) {
        ndrStatus = "customer_unavailable";
      } else if (statusLower.includes("address") || statusLower.includes("incomplete")) {
        ndrStatus = "address_issue";
      } else if (statusLower.includes("refused") || statusLower.includes("reject")) {
        ndrStatus = "refused";
      }
      await storage.createNDREvent({
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        awb: payload.awb,
        ndrStatus,
        ndrReason: payload.comment || payload.current_status,
        ndrDate: /* @__PURE__ */ new Date(),
        rawNdrData: payload
      });
      const order = await storage.getOrder(shipment.orderId);
      if (order && order.assignedTo) {
        await storage.createNotification({
          userId: order.assignedTo,
          orderId: shipment.orderId,
          type: "ndr_alert",
          title: "NDR Alert: Failed Delivery",
          message: `Order #${order.shopifyOrderNumber} has a delivery issue: ${payload.comment || payload.current_status}. AWB: ${payload.awb}`,
          actionUrl: `/orders?orderId=${shipment.orderId}`
        });
        console.log("[Shiprocket Webhook] NDR notification created for agent:", order.assignedTo);
      }
      await storage.updateShipment(shipment.id, {
        status: "ndr"
      });
    }
    if (isDelivered) {
      console.log("[Shiprocket Webhook] Delivery completed:", payload.awb);
      await storage.updateShipment(shipment.id, {
        status: "delivered",
        deliveredAt: /* @__PURE__ */ new Date()
      });
    }
    if (isRTO) {
      console.log("[Shiprocket Webhook] RTO detected:", payload.awb, unifiedStatus);
      await storage.updateShipment(shipment.id, {
        status: "rto",
        ...unifiedStatus === "rto_delivered" ? { deliveredAt: /* @__PURE__ */ new Date() } : {}
      });
    }
    console.log("[Shiprocket Webhook] Webhook processed successfully:", {
      awb: payload.awb,
      status: payload.current_status,
      unifiedStatus,
      isNDR,
      isDelivered,
      isRTO
    });
    res.json({ success: true, message: "Webhook processed successfully" });
  } catch (error) {
    console.error("[Shiprocket Webhook] Error processing webhook:", error);
    res.status(500).json({ error: "Failed to process webhook" });
  }
}
var init_shiprocketWebhook = __esm({
  "server/shiprocketWebhook.ts"() {
    "use strict";
    init_storage();
    init_unifiedStatus();
    init_schema();
  }
});

// server/logic/rules/delhivery.ts
function normalizeDelhivery(payload) {
  const type = (payload.Shipment?.Status?.StatusType || "").toUpperCase();
  const statusText = payload.Shipment?.Status?.Status || "";
  const statusLower = statusText.toLowerCase();
  const instr = (payload.Shipment?.Status?.Instructions || "").toLowerCase();
  const nsl = payload.Shipment?.Status?.NSLCode || payload.Shipment?.NSLCode || "";
  const looksLost = (s) => s.includes("lost") || s.includes("untraceable") || s.includes("damaged");
  if (looksLost(statusLower) || looksLost(instr)) {
    return { status: "lost", isActionable: false };
  }
  if (type === "DL") {
    if (statusLower.includes("rto") || instr.includes("return")) {
      return { status: "rto_delivered", isActionable: false };
    }
    return { status: "delivered", isActionable: false };
  }
  if (type === "RT") {
    if (instr.includes("out for delivery") || statusLower.includes("out for delivery")) {
      return { status: "rto_ofd", isActionable: false };
    }
    return { status: "rto_initiated", isActionable: false };
  }
  if (type === "PU") {
    return { status: "picked_up", isActionable: false };
  }
  if (type === "PP" || type === "MN" || statusLower.includes("manifest")) {
    if (statusLower.includes("pickup") || instr.includes("pickup")) {
      return { status: "ready_for_pickup", isActionable: false };
    }
    return { status: "awb_assigned", isActionable: false };
  }
  if (type === "CN" || statusLower.includes("cancel")) {
    return { status: "cancelled", isActionable: false };
  }
  if (type === "UD") {
    if (instr.includes("out for delivery")) {
      return { status: "out_for_delivery", isActionable: false };
    }
    if (ACTIONABLE_CODES.includes(nsl)) {
      return { status: "ndr", isActionable: true };
    }
    return { status: "in_transit", isActionable: false };
  }
  return { status: "in_transit", isActionable: false };
}
var ACTIONABLE_CODES;
var init_delhivery = __esm({
  "server/logic/rules/delhivery.ts"() {
    "use strict";
    ACTIONABLE_CODES = [
      "EOD-74",
      // Customer Unavailable
      "EOD-15",
      // Address Issue
      "EOD-104",
      // Customer Requested Reschedule
      "EOD-43",
      // Customer Not Reachable
      "EOD-86",
      // Incomplete Address
      "EOD-11",
      // Customer Refused
      "EOD-69",
      // COD Amount Not Ready
      "EOD-6"
      // Out of Delivery Area
    ];
  }
});

// server/services/delhivery.ts
var delhivery_exports = {};
__export(delhivery_exports, {
  DelhiveryClient: () => DelhiveryClient,
  getDelhiveryClient: () => getDelhiveryClient,
  invalidateDelhiveryClient: () => invalidateDelhiveryClient,
  isNDRStatus: () => isNDRStatus,
  mapNDRStatus: () => mapNDRStatus
});
import axios from "axios";
import { eq as eq5 } from "drizzle-orm";
function mapNDRStatus(statusCode) {
  const ndrStatusMap = {
    "EOD-74": "customer_unavailable",
    "EOD-15": "address_issue",
    "EOD-11": "refused",
    "EOD-3": "customer_unavailable",
    "EOD-16": "address_issue",
    "EOD-6": "other",
    "ST-108": "other",
    "EOD-104": "address_issue",
    "EOD-43": "refused",
    "EOD-86": "other",
    "EOD-69": "other"
  };
  return ndrStatusMap[statusCode] || "other";
}
function isNDRStatus(statusCode) {
  const ndrCodes = [
    "EOD-74",
    "EOD-15",
    "EOD-11",
    "EOD-3",
    "EOD-16",
    "EOD-6",
    "ST-108",
    "EOD-104",
    "EOD-43",
    "EOD-86",
    "EOD-69"
  ];
  return ndrCodes.includes(statusCode);
}
async function getDelhiveryClient(storeId) {
  if (!storeId) {
    throw new Error("storeId is required to build a Delhivery client");
  }
  const cached = clientCache2.get(storeId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.client;
  }
  const [row] = await db.select({
    delhiveryApiToken: stores.delhiveryApiToken,
    delhiveryClientName: stores.delhiveryClientName
  }).from(stores).where(eq5(stores.id, storeId)).limit(1);
  if (!row) {
    throw new Error(`Store not found: ${storeId}`);
  }
  if (!row.delhiveryApiToken) {
    throw new Error("Delhivery is not configured for this store");
  }
  const token = decrypt(row.delhiveryApiToken);
  if (!token) {
    throw new Error("Delhivery token failed to decrypt for this store");
  }
  const client = new DelhiveryClient({
    token,
    clientName: row.delhiveryClientName
  });
  clientCache2.set(storeId, { client, loadedAt: Date.now() });
  return client;
}
function invalidateDelhiveryClient(storeId) {
  if (storeId) {
    clientCache2.delete(storeId);
  } else {
    clientCache2.clear();
  }
}
var DELHIVERY_BASE_URL, DelhiveryClient, clientCache2, CACHE_TTL_MS;
var init_delhivery2 = __esm({
  "server/services/delhivery.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_encryption();
    DELHIVERY_BASE_URL = process.env.NODE_ENV === "production" ? "https://track.delhivery.com" : "https://staging-express.delhivery.com";
    DelhiveryClient = class {
      client;
      token;
      clientName;
      constructor(config) {
        this.token = config.token;
        this.clientName = config.clientName ?? null;
        this.client = axios.create({
          baseURL: DELHIVERY_BASE_URL,
          timeout: 3e4,
          headers: {
            "Content-Type": "application/json"
          }
        });
        this.client.interceptors.request.use((config2) => {
          config2.headers.Authorization = `Token ${this.token}`;
          return config2;
        });
      }
      async createShipment(orderData) {
        try {
          const shipmentPayload = {
            name: orderData.customerName,
            add: [orderData.shippingAddressLine1, orderData.shippingAddressLine2].filter(Boolean).join(", "),
            pin: orderData.shippingPincode,
            city: orderData.shippingCity,
            state: orderData.shippingState,
            country: orderData.shippingCountry || "India",
            phone: orderData.customerPhone,
            order: orderData.orderId,
            payment_mode: orderData.paymentMethod.toLowerCase() === "cod" ? "COD" : "Prepaid",
            products_desc: orderData.itemsSummary || "General merchandise",
            weight: orderData.weight?.toString() || "0.5",
            pickup_location: { name: orderData.pickupLocationName || this.clientName || "Default" }
          };
          if (shipmentPayload.payment_mode === "COD") {
            shipmentPayload.cod_amount = orderData.totalPrice;
          }
          const payload = `format=json&data=${encodeURIComponent(JSON.stringify({ shipments: [shipmentPayload] }))}`;
          const response = await this.client.post(
            "/api/cmu/create.json",
            payload,
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded"
              }
            }
          );
          const awb = response.data.waybill || response.data.packages?.find((p) => p.waybill)?.waybill;
          if (response.data.success && awb) {
            return { success: true, awb };
          }
          return {
            success: false,
            error: response.data.packages?.[0]?.remarks?.join(", ") || response.data.rmk || response.data.error || "Unknown error creating shipment"
          };
        } catch (error) {
          console.error("Delhivery createShipment error:", error.response?.data || error.message);
          return {
            success: false,
            error: error.response?.data?.error || error.message || "Failed to create Delhivery shipment"
          };
        }
      }
      /**
       * Schedule a REVERSE pickup (RMA return). The logistics are inverted
       * vs. a forward shipment: the consignee fields carry the CUSTOMER's
       * address (Delhivery picks the parcel up there) and `payment_mode`
       * is "Pickup" — Delhivery's convention that flags a reverse leg. The
       * registered `pickup_location` (this store's warehouse, keyed by the
       * client name) becomes the return destination. Returns the generated
       * reverse AWB on success.
       */
      async createReversePickup(params) {
        try {
          const shipmentPayload = {
            // Consignee = customer: on a reverse leg this is where Delhivery
            // collects the parcel FROM.
            name: params.customerName,
            add: [params.pickupAddressLine1, params.pickupAddressLine2].filter(Boolean).join(", "),
            pin: params.pickupPincode,
            city: params.pickupCity,
            state: params.pickupState,
            country: params.pickupCountry || "India",
            phone: params.customerPhone,
            order: params.rmaNumber,
            // "Pickup" payment mode marks this as a reverse pickup.
            payment_mode: "Pickup",
            products_desc: params.productsDesc || "Return item",
            weight: params.weight?.toString() || "0.5",
            // Registered warehouse = where the return is delivered back to.
            pickup_location: { name: this.clientName || "Default" }
          };
          const payload = `format=json&data=${encodeURIComponent(
            JSON.stringify({ shipments: [shipmentPayload] })
          )}`;
          const response = await this.client.post(
            "/api/cmu/create.json",
            payload,
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded"
              }
            }
          );
          const awb = response.data.waybill || response.data.packages?.find((p) => p.waybill)?.waybill;
          if (response.data.success && awb) {
            return { success: true, awb };
          }
          return {
            success: false,
            error: response.data.packages?.[0]?.remarks?.join(", ") || response.data.rmk || response.data.error || "Unknown error scheduling reverse pickup"
          };
        } catch (error) {
          console.error(
            "Delhivery createReversePickup error:",
            error.response?.data || error.message
          );
          return {
            success: false,
            error: error.response?.data?.error || error.message || "Failed to schedule reverse pickup"
          };
        }
      }
      async trackShipment(awb) {
        try {
          const response = await this.client.get(
            `/api/v1/packages/json/?waybill=${awb}`
          );
          const shipmentData = response.data.ShipmentData?.[0]?.Shipment;
          if (!shipmentData) {
            return { success: false, error: "Shipment not found" };
          }
          const activities = shipmentData.Scans?.map((scan) => ({
            status: scan.ScanDetail.Scan,
            datetime: scan.ScanDetail.ScanDateTime,
            location: scan.ScanDetail.ScannedLocation,
            instructions: scan.ScanDetail.Instructions
          })) || [];
          return {
            success: true,
            status: shipmentData.Status.Status,
            statusCode: shipmentData.Status.StatusCode,
            location: shipmentData.Status.StatusLocation,
            activities
          };
        } catch (error) {
          console.error("Delhivery trackShipment error:", error.response?.data || error.message);
          return {
            success: false,
            error: error.response?.data?.Error || error.message || "Failed to track shipment"
          };
        }
      }
      /**
       * Retrieve the printable packing slip / shipping label for an AWB.
       * Delhivery returns a JSON envelope with a pdf_download_link (and/or
       * base64 PDF) per package.
       */
      async getShippingLabel(awb) {
        try {
          const response = await this.client.get(
            `/api/p/packing_slip?wbns=${encodeURIComponent(awb)}&pdf=true`
          );
          const pkg = response.data.packages?.[0];
          const labelUrl = pkg?.pdf_download_link || pkg?.pdf;
          if (labelUrl) {
            return { success: true, labelUrl };
          }
          return { success: false, error: "No packing slip available for this AWB yet" };
        } catch (error) {
          console.error("Delhivery getShippingLabel error:", error.response?.data || error.message);
          return {
            success: false,
            error: error.response?.data?.Error || error.message || "Failed to fetch shipping label"
          };
        }
      }
      async actionNDR(awb, action, actionData) {
        const actionMap = {
          reattempt: "RE-ATTEMPT",
          rto: "RTO",
          defer: "DEFER_DLV",
          edit: "EDIT_DETAILS"
        };
        try {
          const payload = {
            waybill: awb,
            act: actionMap[action]
          };
          if (action === "defer" && actionData?.deferredDate) {
            payload.action_data = { deferred_date: actionData.deferredDate };
          }
          if (action === "edit" && actionData) {
            payload.action_data = {
              name: actionData.name,
              add: actionData.address,
              phone: actionData.phone
            };
          }
          const response = await this.client.post(
            "/api/p/update",
            { data: [payload] }
          );
          if (response.data.success || response.data.upload_id) {
            return {
              success: true,
              uploadId: response.data.upload_id
            };
          }
          return {
            success: false,
            error: response.data.error || "Unknown error processing NDR action"
          };
        } catch (error) {
          console.error("Delhivery actionNDR error:", error.response?.data || error.message);
          return {
            success: false,
            error: error.response?.data?.error || error.message || "Failed to process NDR action"
          };
        }
      }
    };
    clientCache2 = /* @__PURE__ */ new Map();
    CACHE_TTL_MS = 5 * 60 * 1e3;
  }
});

// server/delhiveryWebhook.ts
var delhiveryWebhook_exports = {};
__export(delhiveryWebhook_exports, {
  handleDelhiveryWebhook: () => handleDelhiveryWebhook
});
import crypto6 from "crypto";
function verifyDelhiveryToken(token, secret) {
  if (!token) {
    console.warn("[Delhivery Webhook] No token provided in x-delhivery-token header");
    return false;
  }
  const tokenHash = crypto6.createHash("sha256").update(token).digest();
  const secretHash = crypto6.createHash("sha256").update(secret).digest();
  return crypto6.timingSafeEqual(tokenHash, secretHash);
}
function extractPayloadFields(body) {
  const isGenericStatus = (val) => {
    if (!val) return true;
    const generic = ["ud", "rto", "ndr", "return accepted", "undelivered", "in transit"];
    return generic.some((g) => val.toLowerCase().trim() === g || val.toLowerCase().includes("return accepted"));
  };
  let extractedRemarks = "";
  if (body.scans && Array.isArray(body.scans) && body.scans.length > 0) {
    const firstScan = body.scans[0];
    const scanRemark = firstScan.Instructions || firstScan.instructions || firstScan.remark || firstScan.Remark || "";
    if (scanRemark && !isGenericStatus(scanRemark)) {
      extractedRemarks = scanRemark;
    }
  }
  if (body.Shipment && body.Shipment.AWB) {
    const statusInstructions = body.Shipment.Status?.Instructions;
    const statusRemarks = body.Shipment.Status?.Remarks;
    const shipmentRemarks = body.Shipment.Remarks;
    let finalRemarks = "";
    if (statusInstructions && !isGenericStatus(statusInstructions)) {
      finalRemarks = statusInstructions;
    } else if (statusRemarks && !isGenericStatus(statusRemarks)) {
      finalRemarks = statusRemarks;
    } else if (shipmentRemarks && !isGenericStatus(shipmentRemarks)) {
      finalRemarks = shipmentRemarks;
    } else if (extractedRemarks) {
      finalRemarks = extractedRemarks;
    } else {
      finalRemarks = body.Shipment.Status?.Status || "";
    }
    return {
      awb: body.Shipment.AWB,
      status: body.Shipment.Status?.Status,
      statusCode: void 0,
      remarks: finalRemarks,
      statusDateTime: body.Shipment.Status?.StatusDateTime,
      nslCode: body.Shipment.Status?.NSLCode,
      statusType: body.Shipment.Status?.StatusType
    };
  }
  const instructionsField = body.Instructions || body.instructions;
  const remarksField = body.Remarks || body.remarks;
  const ndrReason = body.ndr_reason || body.NDRReason;
  let legacyRemarks = "";
  if (instructionsField && !isGenericStatus(instructionsField)) {
    legacyRemarks = instructionsField;
  } else if (remarksField && !isGenericStatus(remarksField)) {
    legacyRemarks = remarksField;
  } else if (ndrReason && !isGenericStatus(ndrReason)) {
    legacyRemarks = ndrReason;
  } else if (extractedRemarks) {
    legacyRemarks = extractedRemarks;
  } else {
    legacyRemarks = body.Scan || body.Status || body.status || "";
  }
  return {
    awb: body.Awb || body.waybill || body.awb,
    status: body.Scan || body.Status || body.status,
    statusCode: body.ScanCode || body.StatusCode || body.status_code,
    remarks: legacyRemarks,
    statusDateTime: body.ScanDateTime || body.StatusDateTime || body.scan_datetime,
    nslCode: body.NSLCode || body.nslCode || body.nsl_code,
    statusType: body.StatusType || body.status_type
  };
}
async function handleDelhiveryWebhook(req, res) {
  const startTime = Date.now();
  try {
    console.log("[Delhivery Webhook] Received webhook:", {
      headers: {
        "x-delhivery-token": req.headers["x-delhivery-token"] ? "[PRESENT]" : "[MISSING]",
        "content-type": req.headers["content-type"]
      },
      body: JSON.stringify(req.body).substring(0, 500)
    });
    const delhiveryWebhookSecret = process.env.DELHIVERY_WEBHOOK_SECRET || process.env.DELHIVERY_API_TOKEN;
    if (!delhiveryWebhookSecret) {
      console.error("[Delhivery Webhook] No webhook secret configured (DELHIVERY_WEBHOOK_SECRET or DELHIVERY_API_TOKEN)");
      return res.status(200).json({ success: false, error: "Webhook secret not configured" });
    }
    const token = req.headers["x-delhivery-token"];
    if (!verifyDelhiveryToken(token, delhiveryWebhookSecret)) {
      console.error("[Delhivery Webhook] Invalid or missing token");
      return res.status(200).json({ success: false, error: "Invalid token" });
    }
    console.log("[Delhivery Webhook] Token verified successfully");
    const { awb, status, statusCode, remarks, statusDateTime, nslCode, statusType } = extractPayloadFields(req.body);
    if (!awb) {
      console.error("[Delhivery Webhook] No AWB found in payload");
      return res.status(200).json({ success: false, error: "No AWB found in payload" });
    }
    const rawInstructions = req.body.Shipment?.Status?.Instructions || req.body.Instructions || req.body.instructions || "";
    const isOFDByInstructions = rawInstructions.toLowerCase().includes("out for delivery");
    let effectiveStatus = status || statusCode || "";
    if (isOFDByInstructions && effectiveStatus.toLowerCase() === "dispatched") {
      console.log(`[Delhivery Webhook] Overriding "Dispatched" \u2192 "Out for Delivery" based on Instructions field`);
      effectiveStatus = "Out for Delivery";
    }
    if (!effectiveStatus) {
      console.log(`[Delhivery Webhook] Ignoring event with no status for AWB ${awb}`);
      return res.status(200).json({ success: true, message: "No status to process" });
    }
    let order = await storage.getOrderByTrackingNumber(awb);
    let shipment = null;
    if (!order) {
      shipment = await storage.getShipmentByAWB(awb);
      if (shipment) {
        order = await storage.getOrder(shipment.orderId);
      }
    }
    if (!order) {
      console.warn(`[Delhivery Webhook] Order not found for AWB: ${awb}`);
      return res.status(200).json({ success: false, error: "Order not found for AWB" });
    }
    const storeId = order.storeId ?? shipment?.storeId ?? null;
    const previousStatus = order.status ?? null;
    console.log(
      `[Delhivery Webhook] Found order ${order.id} (store=${storeId ?? "unknown"}) for AWB ${awb}`
    );
    const allInstructions = rawInstructions || req.body.Shipment?.Status?.Instructions || req.body.Instructions || req.body.instructions || "";
    const delhiveryPayload = {
      Shipment: {
        Status: {
          StatusType: statusType || "",
          Status: effectiveStatus,
          Instructions: allInstructions,
          NSLCode: nslCode || statusCode || ""
        },
        NSLCode: nslCode || statusCode || ""
      }
    };
    const normalized = normalizeDelhivery(delhiveryPayload);
    const unifiedStatus = toUnifiedStatus({ source: "delhivery", rawStatus: normalized.status });
    console.log(`[Delhivery Webhook] Normalized status:`, {
      awb,
      statusType,
      effectiveStatus,
      nslCode,
      normalizedStatus: normalized.status,
      unifiedStatus,
      isActionable: normalized.isActionable
    });
    const isRTO = unifiedStatus === "rto_initiated" || unifiedStatus === "rto_ofd" || unifiedStatus === "rto_delivered";
    const isNDR = unifiedStatus === "ndr";
    const isDelivered = unifiedStatus === "delivered";
    const isOutForDelivery = unifiedStatus === "out_for_delivery";
    const isInTransit = unifiedStatus === "in_transit";
    const isActionable = normalized.isActionable;
    const isNDRByCode = statusCode && isNDRStatus(statusCode);
    const isRTOByStatusType = statusType?.toUpperCase() === "RT";
    const determineShipmentStatus = () => {
      return unifiedStatus;
    };
    if (!shipment) {
      shipment = await storage.getShipmentByOrderId(order.id);
    }
    let shipmentJustCreated = false;
    if (!shipment) {
      console.log(`[Delhivery Webhook] No shipment record found for order ${order.id}, creating one on the fly`);
      const initialStatus = determineShipmentStatus();
      shipment = await storage.createShipment({
        storeId: storeId ?? void 0,
        orderId: order.id,
        shopifyOrderId: order.shopifyOrderId,
        awb,
        courierName: "Delhivery",
        status: initialStatus,
        currentStatus: effectiveStatus,
        statusUpdatedAt: /* @__PURE__ */ new Date(),
        trackingUrl: order.trackingUrl || `https://www.delhivery.com/track/package/${awb}`,
        deliveredAt: isDelivered ? /* @__PURE__ */ new Date() : void 0
      });
      shipmentJustCreated = true;
      console.log(`[Delhivery Webhook] Created shipment ${shipment.id} for order ${order.id} with AWB ${awb}, status: ${initialStatus}`);
    } else {
      await storage.updateShipment(shipment.id, {
        currentStatus: effectiveStatus,
        statusUpdatedAt: /* @__PURE__ */ new Date()
      });
    }
    const orderUpdate = {
      shipmentStatus: SHIPPING_STATUS_LABELS[unifiedStatus] || effectiveStatus,
      status: unifiedStatus,
      isActionable
    };
    console.log(`[Delhivery Webhook] Updating order ${order.id} status to ${unifiedStatus} (isActionable: ${isActionable})`);
    await storage.updateOrder(order.id, orderUpdate);
    if (previousStatus !== unifiedStatus) {
      try {
        await storage.createOrderStatus({
          storeId: storeId ?? void 0,
          orderId: order.id,
          status: unifiedStatus,
          previousStatus: previousStatus ?? void 0,
          note: `Delhivery: ${effectiveStatus}${remarks ? ` \u2014 ${remarks}` : ""} (AWB ${awb})`
        });
      } catch (histErr) {
        console.warn("[Delhivery Webhook] Failed to write status history:", histErr);
      }
    }
    if (isNDR || isRTO) {
      console.log("[Delhivery Webhook] NDR/RTO event detected:", {
        awb,
        status: effectiveStatus,
        statusType,
        isNDR,
        isRTO,
        isRTOByStatusType,
        isNDRByCode
      });
      let ndrStatusValue = "other";
      if (statusCode && isNDRStatus(statusCode)) {
        ndrStatusValue = mapNDRStatus(statusCode);
      } else {
        const statusLower = effectiveStatus.toLowerCase();
        if (statusLower.includes("customer unavailable") || statusLower.includes("not available")) {
          ndrStatusValue = "customer_unavailable";
        } else if (statusLower.includes("address") || statusLower.includes("incomplete")) {
          ndrStatusValue = "address_issue";
        } else if (statusLower.includes("refused") || statusLower.includes("reject")) {
          ndrStatusValue = "refused";
        } else if (isRTO) {
          ndrStatusValue = "rto";
        }
      }
      await storage.createNDREvent({
        storeId: storeId ?? void 0,
        shipmentId: shipment.id,
        orderId: order.id,
        awb,
        ndrStatus: ndrStatusValue,
        ndrReason: remarks || effectiveStatus,
        ndrDate: statusDateTime ? new Date(statusDateTime) : /* @__PURE__ */ new Date(),
        rawNdrData: req.body
      });
      console.log(`[Delhivery Webhook] NDR event created for AWB ${awb}`);
      const shipmentStatusLabel = SHIPPING_STATUS_LABELS[unifiedStatus] || (isRTO ? "RTO" : "NDR");
      await storage.updateOrder(order.id, {
        status: unifiedStatus,
        shipmentStatus: shipmentStatusLabel,
        nslCode: nslCode || statusCode || null,
        failureReason: remarks || effectiveStatus,
        lastFailedAt: statusDateTime ? new Date(statusDateTime) : /* @__PURE__ */ new Date(),
        isActionable
      });
      await storage.updateShipment(shipment.id, {
        status: isRTO ? "rto" : "ndr"
      });
      if (order.assignedTo) {
        await storage.createNotification({
          userId: order.assignedTo,
          orderId: order.id,
          type: "ndr_alert",
          title: isRTO ? "RTO Alert: Return to Origin" : "NDR Alert: Failed Delivery",
          message: `Order #${order.shopifyOrderNumber} has a delivery issue: ${remarks || effectiveStatus}. AWB: ${awb}`,
          actionUrl: `/orders?orderId=${order.id}`
        });
        console.log("[Delhivery Webhook] NDR notification created for agent:", order.assignedTo);
      }
    }
    const isDeliveryComplete = isDelivered || unifiedStatus === "rto_delivered";
    if (isDeliveryComplete && !shipmentJustCreated) {
      console.log("[Delhivery Webhook] Delivery completed:", awb, "status:", unifiedStatus);
      await storage.updateShipment(shipment.id, {
        status: unifiedStatus,
        deliveredAt: statusDateTime ? new Date(statusDateTime) : /* @__PURE__ */ new Date()
      });
      await storage.updateOrder(order.id, {
        status: unifiedStatus,
        shipmentStatus: SHIPPING_STATUS_LABELS[unifiedStatus] || (isRTO ? "RTO" : "Delivered")
      });
    } else if (isDeliveryComplete && shipmentJustCreated) {
      await storage.updateOrder(order.id, {
        status: unifiedStatus,
        shipmentStatus: SHIPPING_STATUS_LABELS[unifiedStatus] || (isRTO ? "RTO" : "Delivered")
      });
    }
    if ((isInTransit || isOutForDelivery) && !isNDR && !isRTO && !isDelivered && !shipmentJustCreated) {
      await storage.updateShipment(shipment.id, {
        status: isOutForDelivery ? "out_for_delivery" : "in_transit"
      });
    }
    const elapsedTime = Date.now() - startTime;
    console.log("[Delhivery Webhook] Webhook processed successfully:", {
      awb,
      status: effectiveStatus,
      isNDR,
      isRTO,
      isDelivered,
      isOutForDelivery,
      isInTransit,
      elapsedMs: elapsedTime
    });
    res.status(200).json({ success: true, message: "Webhook processed successfully" });
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error("[Delhivery Webhook] Error processing webhook:", error, { elapsedMs: elapsedTime });
    res.status(200).json({ success: false, error: "Failed to process webhook" });
  }
}
var init_delhiveryWebhook = __esm({
  "server/delhiveryWebhook.ts"() {
    "use strict";
    init_storage();
    init_delhivery();
    init_unifiedStatus();
    init_schema();
    init_delhivery2();
  }
});

// server/services/shopifySync.ts
var shopifySync_exports = {};
__export(shopifySync_exports, {
  ShopifySyncService: () => ShopifySyncService,
  shopifySyncService: () => shopifySyncService
});
var ShopifySyncService, shopifySyncService;
var init_shopifySync = __esm({
  "server/services/shopifySync.ts"() {
    "use strict";
    init_storage();
    init_shopify();
    ShopifySyncService = class {
      /**
       * Syncs order status changes from our app to Shopify.
       * This is async/non-blocking - errors are logged but don't throw.
       * 
       * @param orderId - Internal order ID
       * @param syncType - Type of sync: 'confirmed', 'cancelled', 'followup'
       * @param context - Additional context data (agent info, notes, etc.)
       */
      async syncToShopify(orderId, syncType, context) {
        const syncId = `sync-${Date.now()}-${orderId.slice(0, 8)}`;
        try {
          const order = await storage.getOrder(orderId);
          if (!order) {
            console.error(`[Shopify Sync][${syncId}] ABORT \u2014 order not found in DB: ${orderId}`);
            return;
          }
          if (!order.shopifyOrderId) {
            console.error(`[Shopify Sync][${syncId}] ABORT \u2014 order ${orderId} has no shopifyOrderId`);
            return;
          }
          let user;
          if (context.userId) {
            user = await storage.getUser(context.userId);
          }
          const agentName = context.agentName || user?.fullName || "Agent";
          let client;
          if (order.storeId) {
            client = await getShopifyClient(order.storeId);
          } else {
            console.warn(
              `[Shopify Sync][${syncId}] order ${orderId} has no storeId \u2014 falling back to legacy store`
            );
            client = await getLegacyStoreShopifyClient();
          }
          const clientConfig = client.config;
          const targetDomain = clientConfig.storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
          const graphqlEndpoint = `https://${targetDomain}/admin/api/2025-01/graphql.json`;
          const restBase = `https://${targetDomain}/admin/api/2024-01`;
          const credentialMode = clientConfig.useClientCredentials ? "client_credentials_grant" : "static_access_token";
          console.log(
            `
[Shopify Sync][${syncId}] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`
          );
          console.log(
            `[Shopify Sync][${syncId}]  ORDER     : #${order.shopifyOrderNumber} (internal: ${orderId})`
          );
          console.log(
            `[Shopify Sync][${syncId}]  SHOPIFY ID: ${order.shopifyOrderId}`
          );
          console.log(
            `[Shopify Sync][${syncId}]  GID       : gid://shopify/Order/${order.shopifyOrderId}`
          );
          console.log(
            `[Shopify Sync][${syncId}]  SYNC TYPE : ${syncType}`
          );
          console.log(
            `[Shopify Sync][${syncId}]  AGENT     : ${agentName}`
          );
          console.log(
            `[Shopify Sync][${syncId}]  TARGET    : ${graphqlEndpoint}  (REST base: ${restBase})`
          );
          console.log(
            `[Shopify Sync][${syncId}]  AUTH MODE : ${credentialMode}`
          );
          console.log(
            `[Shopify Sync][${syncId}] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`
          );
          switch (syncType) {
            case "confirmed":
              await this.syncConfirmed(client, order, agentName, context.notes);
              break;
            case "cancelled":
              await this.syncCancelled(client, order, agentName, context.reason || "Other", context.notes);
              break;
            case "followup":
              await this.syncFollowup(client, order, agentName, context.followupDate, context.notes);
              break;
          }
          await storage.updateOrderSyncStatus(orderId, "synced", /* @__PURE__ */ new Date());
          console.log(
            `[Shopify Sync][${syncId}] \u2713 SUCCESS \u2014 order #${order.shopifyOrderNumber} synced (${syncType})`
          );
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error(
            `
[Shopify Sync][${syncId}] \u2717 FAILURE \u2014 orderId=${orderId} syncType=${syncType}`
          );
          console.error(`[Shopify Sync][${syncId}]   Error: ${errMsg}`);
          if (error instanceof Error && error.stack) {
            console.error(`[Shopify Sync][${syncId}]   Stack: ${error.stack.split("\n").slice(1, 4).join(" | ")}`);
          }
          try {
            const order = await storage.getOrder(orderId);
            if (order) {
              await storage.createSyncLog({
                orderId,
                shopifyOrderId: order.shopifyOrderId,
                syncType,
                syncAction: "batch_update",
                syncStatus: "failed",
                errorMessage: errMsg,
                retryCount: 0
              });
              await storage.updateOrderSyncStatus(orderId, "failed");
            }
          } catch (logError) {
            console.error(`[Shopify Sync][${syncId}] Failed to persist sync error to DB:`, logError);
          }
        }
      }
      /**
       * Sync confirmed order status to Shopify
       */
      async syncConfirmed(client, order, agentName, notes) {
        const shopifyOrderId = order.shopifyOrderId;
        const actions = [];
        const syncLog = await storage.createSyncLog({
          orderId: order.id,
          shopifyOrderId,
          syncType: "confirmed",
          syncAction: "add_tag",
          syncStatus: "pending"
        });
        try {
          const existingTags = order.tags || [];
          const newTags = Array.from(/* @__PURE__ */ new Set([...existingTags, "OF:confirmed"]));
          actions.push(
            client.updateOrderTags(shopifyOrderId, newTags).then(() => console.log(`[Shopify Sync] Added 'OF:confirmed' tag`))
          );
          const timestamp2 = (/* @__PURE__ */ new Date()).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
          const noteText = notes ? `Confirmed by ${agentName} \u2022 ${timestamp2}
${notes}` : `Confirmed by ${agentName} \u2022 ${timestamp2}`;
          actions.push(
            client.addOrderNote(shopifyOrderId, noteText).then(() => console.log(`[Shopify Sync] Added verification note`))
          );
          actions.push(
            client.updateMetafield(
              shopifyOrderId,
              "verification_status",
              "confirmed",
              "single_line_text_field"
            ).then(() => console.log(`[Shopify Sync] Set verification metafield`))
          );
          actions.push(
            client.updateMetafield(
              shopifyOrderId,
              "verified_by",
              agentName,
              "single_line_text_field"
            ).then(() => console.log(`[Shopify Sync] Set verified_by metafield`))
          );
          actions.push(
            client.updateMetafield(
              shopifyOrderId,
              "verified_at",
              (/* @__PURE__ */ new Date()).toISOString(),
              "date_time"
            ).then(() => console.log(`[Shopify Sync] Set verified_at metafield`))
          );
          await Promise.all(actions);
          await storage.updateSyncLog(syncLog.id, {
            syncStatus: "success",
            syncedAt: /* @__PURE__ */ new Date()
          });
        } catch (error) {
          await storage.updateSyncLog(syncLog.id, {
            syncStatus: "failed",
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }
      /**
       * Retry helper with exponential backoff
       */
      async retryWithBackoff(fn, actionName, maxRetries = 3) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[Shopify Sync] ${actionName} - Attempt ${attempt}/${maxRetries}`);
            const result = await fn();
            console.log(`[Shopify Sync] \u2713 ${actionName} succeeded on attempt ${attempt}`);
            return result;
          } catch (error) {
            lastError = error;
            const errorDetails = error instanceof Error ? error.message : JSON.stringify(error);
            console.error(`[Shopify Sync] \u2717 ${actionName} failed on attempt ${attempt}:`, errorDetails);
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 1e3;
              console.log(`[Shopify Sync] Retrying ${actionName} in ${backoffMs}ms...`);
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
          }
        }
        throw lastError;
      }
      /**
       * Sync cancelled order status to Shopify
       * NOTE: Order is already cancelled via route handler, this only adds tags/notes
       */
      async syncCancelled(client, order, agentName, reason, notes) {
        const shopifyOrderId = order.shopifyOrderId;
        const orderNumber = order.shopifyOrderNumber;
        console.log(`[Shopify Sync] ========================================`);
        console.log(`[Shopify Sync] Starting cancellation sync for order #${orderNumber}`);
        console.log(`[Shopify Sync] Order ID: ${order.id}`);
        console.log(`[Shopify Sync] Shopify Order ID: ${shopifyOrderId}`);
        console.log(`[Shopify Sync] Agent: ${agentName}`);
        console.log(`[Shopify Sync] Reason: ${reason}`);
        console.log(`[Shopify Sync] ========================================`);
        const syncLog = await storage.createSyncLog({
          orderId: order.id,
          shopifyOrderId,
          syncType: "cancelled",
          syncAction: "add_tags_notes",
          syncStatus: "pending"
        });
        let retryCount = 0;
        const errors = [];
        try {
          try {
            const existingTags = order.tags || [];
            const newTags = Array.from(/* @__PURE__ */ new Set([...existingTags, "OF:cancelled"]));
            console.log(`[Shopify Sync] Current tags:`, existingTags);
            console.log(`[Shopify Sync] New tags to set:`, newTags);
            await this.retryWithBackoff(
              async () => {
                const result = await client.updateOrderTags(shopifyOrderId, newTags);
                console.log(`[Shopify Sync] Tag update response:`, JSON.stringify(result, null, 2));
                return result;
              },
              `Adding 'OF:cancelled' tag to order #${orderNumber}`
            );
          } catch (tagError) {
            const errorMsg = `Failed to add tag after 3 retries: ${tagError instanceof Error ? tagError.message : JSON.stringify(tagError)}`;
            console.error(`[Shopify Sync] \u2717\u2717\u2717 ${errorMsg}`);
            errors.push(errorMsg);
            retryCount++;
          }
          try {
            const timestamp2 = (/* @__PURE__ */ new Date()).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            });
            const noteText = notes ? `Cancelled by ${agentName} \u2022 ${timestamp2}
Reason: ${reason}
${notes}` : `Cancelled by ${agentName} \u2022 ${timestamp2}
Reason: ${reason}`;
            console.log(`[Shopify Sync] Note to add:`, noteText);
            await this.retryWithBackoff(
              async () => {
                const result = await client.addOrderNote(shopifyOrderId, noteText);
                console.log(`[Shopify Sync] Note update response:`, JSON.stringify(result, null, 2));
                return result;
              },
              `Adding cancellation note to order #${orderNumber}`
            );
          } catch (noteError) {
            const errorMsg = `Failed to add note after 3 retries: ${noteError instanceof Error ? noteError.message : JSON.stringify(noteError)}`;
            console.error(`[Shopify Sync] \u2717\u2717\u2717 ${errorMsg}`);
            errors.push(errorMsg);
            retryCount++;
          }
          try {
            await this.retryWithBackoff(
              async () => {
                const result = await client.updateMetafield(
                  shopifyOrderId,
                  "verification_status",
                  "cancelled",
                  "single_line_text_field"
                );
                console.log(`[Shopify Sync] Verification metafield response:`, JSON.stringify(result, null, 2));
                return result;
              },
              `Setting verification_status metafield for order #${orderNumber}`
            );
          } catch (metaError) {
            const errorMsg = `Failed to set verification metafield: ${metaError instanceof Error ? metaError.message : JSON.stringify(metaError)}`;
            console.error(`[Shopify Sync] \u2717 ${errorMsg}`);
            errors.push(errorMsg);
          }
          try {
            await this.retryWithBackoff(
              async () => {
                const result = await client.updateMetafield(
                  shopifyOrderId,
                  "cancellation_reason",
                  reason,
                  "single_line_text_field"
                );
                console.log(`[Shopify Sync] Cancellation reason metafield response:`, JSON.stringify(result, null, 2));
                return result;
              },
              `Setting cancellation_reason metafield for order #${orderNumber}`
            );
          } catch (metaError) {
            const errorMsg = `Failed to set cancellation_reason metafield: ${metaError instanceof Error ? metaError.message : JSON.stringify(metaError)}`;
            console.error(`[Shopify Sync] \u2717 ${errorMsg}`);
            errors.push(errorMsg);
          }
          if (errors.length === 0) {
            console.log(`[Shopify Sync] \u2713\u2713\u2713 Sync completed successfully for order #${orderNumber}`);
            await storage.updateSyncLog(syncLog.id, {
              syncStatus: "success",
              syncedAt: /* @__PURE__ */ new Date()
            });
          } else {
            const errorMessage = `Partial sync failure (${errors.length} errors):
${errors.join("\n")}`;
            console.error(`[Shopify Sync] \u2717\u2717\u2717 ${errorMessage}`);
            await storage.updateSyncLog(syncLog.id, {
              syncStatus: "failed",
              errorMessage,
              retryCount
            });
            throw new Error(errorMessage);
          }
          console.log(`[Shopify Sync] ======================================== END`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[Shopify Sync] \u2717\u2717\u2717 FATAL ERROR during cancellation sync for order #${orderNumber}:`, errorMessage);
          console.error(`[Shopify Sync] Full error object:`, error);
          await storage.updateSyncLog(syncLog.id, {
            syncStatus: "failed",
            errorMessage,
            retryCount
          });
          throw error;
        }
      }
      /**
       * Sync follow-up schedule to Shopify
       */
      async syncFollowup(client, order, agentName, followupDate, notes) {
        const shopifyOrderId = order.shopifyOrderId;
        const actions = [];
        const syncLog = await storage.createSyncLog({
          orderId: order.id,
          shopifyOrderId,
          syncType: "followup",
          syncAction: "add_tag",
          syncStatus: "pending"
        });
        try {
          const existingTags = order.tags || [];
          const newTags = Array.from(/* @__PURE__ */ new Set([...existingTags, "OF:followup"]));
          actions.push(
            client.updateOrderTags(shopifyOrderId, newTags).then(() => console.log(`[Shopify Sync] Added 'OF:followup' tag`))
          );
          const followupDateObj = followupDate || order.followupAt || /* @__PURE__ */ new Date();
          const followupTime = followupDateObj.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
          const noteText = notes ? `Follow-up by ${agentName} \u2022 ${followupTime}
${notes}` : `Follow-up by ${agentName} \u2022 ${followupTime}`;
          actions.push(
            client.addOrderNote(shopifyOrderId, noteText).then(() => console.log(`[Shopify Sync] Added follow-up note`))
          );
          actions.push(
            client.updateMetafield(
              shopifyOrderId,
              "verification_status",
              "followup_scheduled",
              "single_line_text_field"
            ).then(() => console.log(`[Shopify Sync] Set verification metafield`))
          );
          actions.push(
            client.updateMetafield(
              shopifyOrderId,
              "followup_date",
              followupDateObj.toISOString(),
              "date_time"
            ).then(() => console.log(`[Shopify Sync] Set followup_date metafield`))
          );
          await Promise.all(actions);
          await storage.updateSyncLog(syncLog.id, {
            syncStatus: "success",
            syncedAt: /* @__PURE__ */ new Date()
          });
        } catch (error) {
          await storage.updateSyncLog(syncLog.id, {
            syncStatus: "failed",
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }
    };
    shopifySyncService = new ShopifySyncService();
  }
});

// server/services/meta.ts
var meta_exports = {};
__export(meta_exports, {
  syncMetaInsights: () => syncMetaInsights
});
import { eq as eq6, sql as sql4 } from "drizzle-orm";
function sumAction(list, type = PURCHASE_ACTION_TYPE) {
  if (!list) return 0;
  const row = list.find((a) => a.action_type === type);
  return row ? Number(row.value) || 0 : 0;
}
async function fetchAccountCampaignInsights(accountId, accessToken, startDate, endDate) {
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    fields: "campaign_id,spend,actions,action_values",
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    limit: "500"
  });
  let url = `${META_API_HOST}/${META_API_VERSION}/${accountId}/insights?${params.toString()}`;
  const rows = [];
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      const msg = body.error?.message || `HTTP ${res.status}`;
      throw new Error(`Meta API error for ${accountId}: ${msg}`);
    }
    rows.push(...body.data ?? []);
    url = body.paging?.next ?? null;
  }
  return rows;
}
async function syncMetaInsights(storeId, startDate, endDate) {
  const [storeRow] = await db.select({
    id: stores.id,
    metaAccessToken: stores.metaAccessToken,
    metaAdAccountsConfig: stores.metaAdAccountsConfig
  }).from(stores).where(eq6(stores.id, storeId)).limit(1);
  if (!storeRow) {
    throw new Error(`Store not found: ${storeId}`);
  }
  if (!storeRow.metaAccessToken) {
    throw new Error("Meta token not configured for this store");
  }
  const accessToken = decrypt(storeRow.metaAccessToken);
  if (!accessToken) {
    throw new Error("Meta token failed to decrypt for this store");
  }
  const config = Array.isArray(
    storeRow.metaAdAccountsConfig
  ) ? storeRow.metaAdAccountsConfig : [];
  if (config.length === 0) {
    throw new Error("No Meta ad accounts linked for this store");
  }
  console.log(
    `[meta] store=${storeId} syncing ${config.length} account(s) for ${startDate} \u2192 ${endDate}`
  );
  const perAccount = await Promise.all(
    config.map(async (entry) => {
      try {
        const rows = await fetchAccountCampaignInsights(
          entry.adAccountId,
          accessToken,
          startDate,
          endDate
        );
        const filtered = entry.syncAll ? rows : rows.filter(
          (r) => r.campaign_id != null && entry.linkedCampaignIds.includes(r.campaign_id)
        );
        console.log(
          `[meta] ${entry.adAccountId}: ${rows.length} campaign-day rows fetched, ${filtered.length} after link filter`
        );
        return {
          id: entry.adAccountId,
          rows: filtered,
          error: null
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[meta] ${entry.adAccountId} failed: ${message}`);
        return {
          id: entry.adAccountId,
          rows: [],
          error: message
        };
      }
    })
  );
  const byDate = /* @__PURE__ */ new Map();
  for (const acct of perAccount) {
    for (const row of acct.rows) {
      const dateKey = row.date_start;
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { fbSpend: 0, fbGmv: 0, fbOrders: 0 });
      }
      const agg = byDate.get(dateKey);
      agg.fbSpend += Number(row.spend) || 0;
      agg.fbOrders += sumAction(row.actions);
      agg.fbGmv += sumAction(row.action_values);
    }
  }
  const upsertRows = [];
  const totals = { fbSpend: 0, fbGmv: 0, fbOrders: 0 };
  for (const [date2, agg] of Array.from(byDate.entries())) {
    totals.fbSpend += agg.fbSpend;
    totals.fbGmv += agg.fbGmv;
    totals.fbOrders += agg.fbOrders;
    upsertRows.push({
      date: date2,
      storeId,
      fbSpend: agg.fbSpend.toFixed(2),
      fbGmv: agg.fbGmv.toFixed(2),
      fbOrders: Math.round(agg.fbOrders),
      fbRoas: agg.fbSpend > 0 ? (agg.fbGmv / agg.fbSpend).toFixed(4) : null
    });
  }
  if (upsertRows.length > 0) {
    await db.insert(marketingMetrics).values(upsertRows).onConflictDoUpdate({
      target: [marketingMetrics.date, marketingMetrics.storeId],
      set: {
        fbSpend: sql4`excluded.fb_spend`,
        fbGmv: sql4`excluded.fb_gmv`,
        fbOrders: sql4`excluded.fb_orders`,
        fbRoas: sql4`excluded.fb_roas`,
        updatedAt: sql4`now()`
      }
    });
  }
  const accountErrors = perAccount.filter((a) => a.error).map((a) => ({ accountId: a.id, message: a.error }));
  return {
    storeId,
    startDate,
    endDate,
    accountsAttempted: config.length,
    accountsSucceeded: config.length - accountErrors.length,
    accountErrors,
    daysUpserted: upsertRows.length,
    totals
  };
}
var META_API_VERSION, META_API_HOST, PURCHASE_ACTION_TYPE;
var init_meta = __esm({
  "server/services/meta.ts"() {
    "use strict";
    init_db();
    init_schema();
    init_encryption();
    META_API_VERSION = "v19.0";
    META_API_HOST = "https://graph.facebook.com";
    PURCHASE_ACTION_TYPE = "purchase";
  }
});

// server/services/payroll.ts
var payroll_exports = {};
__export(payroll_exports, {
  ANNUAL_PAID_HOLIDAY_CAP: () => ANNUAL_PAID_HOLIDAY_CAP,
  ORDER_CONFIRMATION_TIERS: () => ORDER_CONFIRMATION_TIERS,
  PERSONAL_RECOVERY_TIERS: () => PERSONAL_RECOVERY_TIERS,
  RESHIP_BONUS_PER_UNIT: () => RESHIP_BONUS_PER_UNIT,
  TEAM_DELIVERY_TIERS: () => TEAM_DELIVERY_TIERS,
  calculateBasePay: () => calculateBasePay,
  calculateConfirmationBonus: () => calculateConfirmationBonus,
  calculateNdrRtoBonus: () => calculateNdrRtoBonus,
  expectedWorkingDays: () => expectedWorkingDays,
  formatINR: () => formatINR,
  runPayrollMath: () => runPayrollMath
});
function expectedWorkingDays(year, month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  const lastDay = new Date(year, month, 0).getDate();
  let count2 = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count2++;
  }
  return count2;
}
function calculateBasePay(input) {
  const { daysPresent, paidHolidaysUsed, expectedWorkingDays: expectedWorkingDays2, baseSalary } = input;
  if (expectedWorkingDays2 <= 0) {
    return { ratio: 0, amount: 0, capped: false };
  }
  const rawRatio = (daysPresent + paidHolidaysUsed) / expectedWorkingDays2;
  const capped = rawRatio > 1;
  const ratio = capped ? 1 : Math.max(0, rawRatio);
  const amount = round2(ratio * baseSalary);
  return { ratio, amount, capped };
}
function calculateConfirmationBonus(deliveryRatePct) {
  if (deliveryRatePct == null || !Number.isFinite(deliveryRatePct)) return 0;
  for (const tier of ORDER_CONFIRMATION_TIERS) {
    if (deliveryRatePct >= tier.minPct && deliveryRatePct < tier.maxPct) {
      return tier.bonus;
    }
  }
  return 0;
}
function calculateNdrRtoBonus(input) {
  const teamDeliveryBonus = pickTier(input.teamDeliveryRatePct, TEAM_DELIVERY_TIERS);
  const recoveryBonus = pickTier(input.personalRecoveryRatePct, PERSONAL_RECOVERY_TIERS);
  const reshipsBonus = typeof input.reshipsCount === "number" && Number.isFinite(input.reshipsCount) ? Math.max(0, Math.floor(input.reshipsCount)) * RESHIP_BONUS_PER_UNIT : 0;
  return {
    teamDeliveryBonus,
    recoveryBonus,
    reshipsBonus,
    total: teamDeliveryBonus + recoveryBonus + reshipsBonus
  };
}
function runPayrollMath(input) {
  const base = calculateBasePay({
    baseSalary: input.baseSalary,
    expectedWorkingDays: input.expectedWorkingDays,
    daysPresent: input.daysPresent,
    paidHolidaysUsed: input.paidHolidaysUsed
  });
  let confirmationBonus = 0;
  let teamDeliveryBonus = 0;
  let recoveryBonus = 0;
  let reshipsBonus = 0;
  if (input.compensationProfile === "ORDER_CONFIRMATION") {
    confirmationBonus = calculateConfirmationBonus(input.deliveryRatePct);
  } else if (input.compensationProfile === "NDR_RTO") {
    const ndr = calculateNdrRtoBonus({
      teamDeliveryRatePct: input.teamDeliveryRatePct,
      personalRecoveryRatePct: input.personalRecoveryRatePct,
      reshipsCount: input.reshipsCount
    });
    teamDeliveryBonus = ndr.teamDeliveryBonus;
    recoveryBonus = ndr.recoveryBonus;
    reshipsBonus = ndr.reshipsBonus;
  }
  const total = confirmationBonus + teamDeliveryBonus + recoveryBonus + reshipsBonus;
  const finalPayout = round2(base.amount + total);
  return {
    base,
    incentives: {
      confirmationBonus,
      teamDeliveryBonus,
      recoveryBonus,
      reshipsBonus,
      total
    },
    finalPayout
  };
}
function pickTier(value, tiers) {
  if (value == null || !Number.isFinite(value)) return 0;
  for (const tier of tiers) {
    if (value >= tier.minPct && value < tier.maxPct) return tier.bonus;
  }
  return 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function formatINR(n) {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
var ANNUAL_PAID_HOLIDAY_CAP, RESHIP_BONUS_PER_UNIT, ORDER_CONFIRMATION_TIERS, TEAM_DELIVERY_TIERS, PERSONAL_RECOVERY_TIERS;
var init_payroll = __esm({
  "server/services/payroll.ts"() {
    "use strict";
    ANNUAL_PAID_HOLIDAY_CAP = 11;
    RESHIP_BONUS_PER_UNIT = 50;
    ORDER_CONFIRMATION_TIERS = [
      { minPct: 90, maxPct: Infinity, bonus: 1e4 },
      { minPct: 85, maxPct: 90, bonus: 7500 },
      { minPct: 75, maxPct: 85, bonus: 5e3 }
    ];
    TEAM_DELIVERY_TIERS = [
      { minPct: 90, maxPct: Infinity, bonus: 5e3 },
      { minPct: 80, maxPct: 90, bonus: 2e3 }
    ];
    PERSONAL_RECOVERY_TIERS = [
      { minPct: 50, maxPct: Infinity, bonus: 1e4 },
      { minPct: 40, maxPct: 50, bonus: 6e3 },
      { minPct: 30, maxPct: 40, bonus: 3e3 }
    ];
  }
});

// server/services/payroll-metrics.ts
var payroll_metrics_exports = {};
__export(payroll_metrics_exports, {
  getAttendanceMetrics: () => getAttendanceMetrics,
  getAutoPaidHolidaysCount: () => getAutoPaidHolidaysCount,
  getConfirmationDeliveryRatePct: () => getConfirmationDeliveryRatePct,
  getTeamDeliveryRatePct: () => getTeamDeliveryRatePct,
  getYtdPaidHolidaysUsed: () => getYtdPaidHolidaysUsed,
  monthRangeUtc: () => monthRangeUtc
});
import { sql as sql5 } from "drizzle-orm";
function monthRangeUtc(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}
async function getAttendanceMetrics(userId, year, month) {
  const { start, end } = monthRangeUtc(year, month);
  const r = await db.execute(sql5`
    SELECT
      COUNT(DISTINCT DATE(date)) FILTER (WHERE clock_in_time IS NOT NULL)::int4 AS days_present,
      COUNT(DISTINCT DATE(date)) FILTER (WHERE status = 'leave')::int4         AS days_leave
    FROM attendance
    WHERE user_id = ${userId}
      AND date >= ${start.toISOString()}::timestamptz
      AND date <  ${end.toISOString()}::timestamptz
  `);
  const row = (r.rows ?? r)[0] ?? { days_present: 0, days_leave: 0 };
  return {
    daysPresent: row.days_present ?? 0,
    daysLeave: row.days_leave ?? 0
  };
}
async function getAutoPaidHolidaysCount(state, year, month) {
  const r = await db.execute(sql5`
    SELECT COUNT(*)::int4 AS n
    FROM holidays
    WHERE state = ${state}
      AND type  = 'Fixed'
      AND EXTRACT(YEAR  FROM date) = ${year}
      AND EXTRACT(MONTH FROM date) = ${month}
      -- Only weekdays; weekends are already non-working so they don't
      -- contribute to the paid-holiday count.
      AND EXTRACT(DOW   FROM date) NOT IN (0, 6)
  `);
  return (r.rows ?? r)[0]?.n ?? 0;
}
async function getYtdPaidHolidaysUsed(userId, year, upToMonthExclusive) {
  const r = await db.execute(sql5`
    SELECT COALESCE(SUM(paid_holidays_used), 0)::int4 AS n
    FROM payroll_ledger
    WHERE user_id = ${userId}
      AND year   = ${year}
      AND month  < ${upToMonthExclusive}
  `);
  return (r.rows ?? r)[0]?.n ?? 0;
}
async function getConfirmationDeliveryRatePct(userId, year, month) {
  const { start, end } = monthRangeUtc(year, month);
  const r = await db.execute(sql5`
    SELECT
      COUNT(*)::int4                                              AS confirmed,
      COUNT(*) FILTER (WHERE status = 'delivered')::int4          AS delivered
    FROM orders
    WHERE confirmed_by = ${userId}
      AND confirmed_at >= ${start.toISOString()}::timestamptz
      AND confirmed_at <  ${end.toISOString()}::timestamptz
  `);
  const row = (r.rows ?? r)[0] ?? { confirmed: 0, delivered: 0 };
  if (!row.confirmed || row.confirmed === 0) return null;
  return round22(row.delivered / row.confirmed * 100);
}
async function getTeamDeliveryRatePct(year, month) {
  const { start, end } = monthRangeUtc(year, month);
  const r = await db.execute(sql5`
    SELECT
      COUNT(*)::int4                                       AS total,
      COUNT(*) FILTER (WHERE status = 'delivered')::int4   AS delivered
    FROM orders
    WHERE shopify_created_at >= ${start.toISOString()}::timestamptz
      AND shopify_created_at <  ${end.toISOString()}::timestamptz
  `);
  const row = (r.rows ?? r)[0] ?? { total: 0, delivered: 0 };
  if (!row.total || row.total === 0) return null;
  return round22(row.delivered / row.total * 100);
}
function round22(n) {
  return Math.round(n * 100) / 100;
}
var init_payroll_metrics = __esm({
  "server/services/payroll-metrics.ts"() {
    "use strict";
    init_db();
  }
});

// server/services/payslip-pdf.ts
var payslip_pdf_exports = {};
__export(payslip_pdf_exports, {
  renderPayslipPdf: () => renderPayslipPdf,
  renderPayslipPdfBuffer: () => renderPayslipPdfBuffer
});
import PDFDocument from "pdfkit";
import fs2 from "fs";
import os2 from "os";
import path2 from "path";
async function renderPayslipPdfBuffer(data) {
  let logoPath = null;
  try {
    logoPath = await ensureLogoCached();
  } catch (err) {
    console.warn(
      `[payslip-pdf] logo fetch failed (${err?.message ?? err}); continuing text-only`
    );
  }
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawHeaderBand(doc, data, logoPath);
    drawPeriodStrip(doc, data);
    drawDetailsTwoColumn(doc, data);
    drawEarningsTable(doc, data);
    drawTotal(doc, data);
    drawFooter(doc, data);
    doc.end();
  });
}
async function renderPayslipPdf(data) {
  ensureDir(PAYSLIPS_DIR);
  const period = `${data.period.year}-${String(data.period.month).padStart(2, "0")}`;
  const safeName = data.employee.fullName.replace(/[^a-z0-9]/gi, "_");
  const filename = `${safeName}__${period}.pdf`;
  const absPath = path2.join(PAYSLIPS_DIR, filename);
  const buf = await renderPayslipPdfBuffer(data);
  fs2.writeFileSync(absPath, buf);
  return { absPath, filename, byteLength: buf.byteLength };
}
function drawHeaderBand(doc, data, logoPath) {
  const bandHeight = 110;
  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, bandHeight).fill(C.navyHeader);
  doc.restore();
  const padX = 40;
  const padY = 28;
  if (logoPath && fs2.existsSync(logoPath)) {
    try {
      doc.image(logoPath, padX, padY, { fit: [55, 55] });
    } catch {
      try {
        fs2.unlinkSync(logoPath);
      } catch {
      }
    }
  }
  const textX = padX + 70;
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18).text(COMPANY_NAME, textX, padY, {
    width: CONTENT_WIDTH - 80
  });
  doc.fillColor("#cbd5e1").font("Helvetica").fontSize(9).text("Payroll \xB7 Confidential", textX, padY + 24);
  const period = `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}`;
  doc.fillColor("#94a3b8").font("Helvetica-Bold").fontSize(10).text("PAYSLIP", PAGE_WIDTH - 120, padY, {
    width: 80 - 8,
    align: "right",
    characterSpacing: 2
  });
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text(period, PAGE_WIDTH - 120, padY + 16, {
    width: 80 - 8,
    align: "right"
  });
  doc.x = CONTENT_LEFT;
  doc.y = bandHeight + 18;
}
function drawPeriodStrip(doc, _data) {
  const stripTop = doc.y;
  const stripHeight = 38;
  doc.save().rect(CONTENT_LEFT, stripTop, CONTENT_WIDTH, stripHeight).fill(C.band).restore();
  doc.fillColor(C.mute).font("Helvetica-Bold").fontSize(8).text("REGISTERED OFFICE", CONTENT_LEFT + 12, stripTop + 8, {
    characterSpacing: 1.5
  });
  doc.fillColor(C.body).font("Helvetica").fontSize(9).text(COMPANY_ADDRESS, CONTENT_LEFT + 12, stripTop + 20, {
    width: CONTENT_WIDTH - 24,
    lineBreak: false,
    ellipsis: true
  });
  doc.x = CONTENT_LEFT;
  doc.y = stripTop + stripHeight + 18;
}
function drawDetailsTwoColumn(doc, data) {
  const colTop = doc.y;
  const colGap = 24;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  const leftX = CONTENT_LEFT;
  const rightX = CONTENT_LEFT + colWidth + colGap;
  const period = `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}`;
  drawSectionLabel(doc, "EMPLOYEE DETAILS", leftX, colTop);
  drawSectionLabel(doc, "PAY PERIOD", rightX, colTop);
  const rowTop = colTop + 14;
  drawKeyValue(doc, "Name", data.employee.fullName, leftX, rowTop, colWidth);
  drawKeyValue(doc, "Email", data.employee.email, leftX, rowTop + 16, colWidth);
  if (data.employee.department) {
    drawKeyValue(doc, "Department", data.employee.department, leftX, rowTop + 32, colWidth);
  }
  if (data.employee.employeeId) {
    drawKeyValue(doc, "Employee ID", data.employee.employeeId, leftX, rowTop + 48, colWidth);
  }
  if (data.employee.holidayState) {
    drawKeyValue(
      doc,
      "Holiday calendar",
      capitalizeFirst(data.employee.holidayState),
      leftX,
      rowTop + 64,
      colWidth
    );
  }
  drawKeyValue(doc, "Period", period, rightX, rowTop, colWidth);
  drawKeyValue(
    doc,
    "Working days (M\u2013F)",
    String(data.base.expectedWorkingDays),
    rightX,
    rowTop + 16,
    colWidth
  );
  drawKeyValue(
    doc,
    "Days present",
    String(data.base.daysPresent),
    rightX,
    rowTop + 32,
    colWidth
  );
  drawKeyValue(
    doc,
    "Paid holidays used",
    String(data.base.paidHolidaysUsed),
    rightX,
    rowTop + 48,
    colWidth
  );
  drawKeyValue(
    doc,
    "Base salary",
    `Rs. ${formatINR(data.base.baseSalary)}`,
    rightX,
    rowTop + 64,
    colWidth
  );
  doc.x = CONTENT_LEFT;
  doc.y = rowTop + 64 + 18 + 8;
}
function drawSectionLabel(doc, label, x, y) {
  doc.fillColor(C.mute).font("Helvetica-Bold").fontSize(8).text(label, x, y, { characterSpacing: 1.5 });
  doc.strokeColor(C.hairline).lineWidth(1).moveTo(x, y + 11).lineTo(x + 100, y + 11).stroke();
}
function drawKeyValue(doc, key, value, x, y, width) {
  const keyWidth = 110;
  doc.fillColor(C.mute).font("Helvetica").fontSize(9).text(key, x, y, { width: keyWidth });
  doc.fillColor(C.body).font("Helvetica-Bold").fontSize(9.5).text(value, x + keyWidth, y, {
    width: width - keyWidth,
    lineBreak: false,
    ellipsis: true
  });
}
function drawEarningsTable(doc, data) {
  drawSectionLabel(doc, "EARNINGS", CONTENT_LEFT, doc.y);
  doc.y += 16;
  const headerTop = doc.y;
  const headerHeight = 24;
  doc.save().rect(CONTENT_LEFT, headerTop, CONTENT_WIDTH, headerHeight).fill(C.navyHeader).restore();
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9.5).text("Component", COL_LABEL_X, headerTop + 7, {
    characterSpacing: 1
  });
  doc.text("Amount (Rs.)", COL_AMOUNT_X, headerTop + 7, {
    width: COL_AMOUNT_WIDTH,
    align: "right",
    characterSpacing: 1
  });
  doc.y = headerTop + headerHeight;
  const ratioPct = (data.base.ratio * 100).toFixed(2);
  const cappedNote = data.base.capped ? " (capped at 100%)" : "";
  drawTableRow(
    doc,
    "Base pay",
    `Calculation: (${data.base.daysPresent} present + ${data.base.paidHolidaysUsed} paid holidays) \xF7 ${data.base.expectedWorkingDays} working days \xD7 Rs. ${formatINR(data.base.baseSalary)} = ${ratioPct}%${cappedNote}`,
    formatINR(data.base.amount)
  );
  const showIncentives = data.incentives.profile === "ORDER_CONFIRMATION" || data.incentives.profile === "NDR_RTO";
  if (showIncentives) {
    if (data.incentives.profile === "ORDER_CONFIRMATION") {
      drawTableRow(
        doc,
        "Confirmation bonus",
        data.incentives.deliveryRatePct == null ? "No delivery rate recorded for this period" : `Delivery rate ${data.incentives.deliveryRatePct.toFixed(2)}% -> tier bonus per Order Confirmation ladder`,
        formatINR(data.incentives.confirmationBonus)
      );
    } else if (data.incentives.profile === "NDR_RTO") {
      drawTableRow(
        doc,
        "Team delivery bonus",
        data.incentives.teamDeliveryRatePct == null ? "No team delivery rate recorded" : `Team delivery ${data.incentives.teamDeliveryRatePct.toFixed(2)}% -> tier bonus per NDR/RTO ladder`,
        formatINR(data.incentives.teamDeliveryBonus)
      );
      drawTableRow(
        doc,
        "Personal recovery bonus",
        data.incentives.recoveryRatePct == null ? "No personal recovery rate recorded" : `Recovery rate ${data.incentives.recoveryRatePct.toFixed(2)}% -> tier bonus per NDR/RTO ladder`,
        formatINR(data.incentives.recoveryBonus)
      );
      const reships = data.incentives.reshipsCount ?? 0;
      drawTableRow(
        doc,
        "Reships bonus",
        `${reships} reships \xD7 Rs. 50 = Rs. ${formatINR(reships * 50)}`,
        formatINR(data.incentives.reshipsBonus)
      );
    }
  }
}
function drawTableRow(doc, label, mathNote, amount) {
  const rowTop = doc.y;
  const rowPadding = 6;
  doc.fillColor(C.body).font("Helvetica-Bold").fontSize(11).text(label, COL_LABEL_X, rowTop + rowPadding, {
    width: COL_AMOUNT_X - COL_LABEL_X - 12,
    lineBreak: false,
    ellipsis: true
  });
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(11).text(amount, COL_AMOUNT_X, rowTop + rowPadding, {
    width: COL_AMOUNT_WIDTH,
    align: "right",
    features: ["tnum"]
    // tabular nums keep decimals lined up
  });
  const noteY = rowTop + rowPadding + 14;
  doc.fillColor(C.mute).font("Helvetica").fontSize(8.5).text(mathNote, COL_LABEL_X, noteY, {
    width: COL_AMOUNT_X - COL_LABEL_X - 12
  });
  const rowEnd = doc.y + 4;
  doc.strokeColor(C.hairline).lineWidth(0.5).moveTo(CONTENT_LEFT, rowEnd).lineTo(CONTENT_RIGHT, rowEnd).stroke();
  doc.x = CONTENT_LEFT;
  doc.y = rowEnd + 4;
}
function drawTotal(doc, data) {
  doc.y += 4;
  const bandTop = doc.y;
  const bandHeight = 36;
  doc.save().rect(CONTENT_LEFT, bandTop, CONTENT_WIDTH, bandHeight).fill(C.band).restore();
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(13).text("TOTAL EARNINGS", COL_LABEL_X, bandTop + 11, {
    characterSpacing: 1
  });
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(14).text(`Rs. ${formatINR(data.finalPayout)}`, COL_AMOUNT_X, bandTop + 10, {
    width: COL_AMOUNT_WIDTH,
    align: "right",
    features: ["tnum"]
  });
  const ruleY1 = bandTop + bandHeight + 1;
  const ruleY2 = ruleY1 + 3;
  doc.strokeColor(C.totalRule).lineWidth(0.8).moveTo(CONTENT_LEFT, ruleY1).lineTo(CONTENT_RIGHT, ruleY1).stroke();
  doc.strokeColor(C.totalRule).lineWidth(0.8).moveTo(CONTENT_LEFT, ruleY2).lineTo(CONTENT_RIGHT, ruleY2).stroke();
  doc.x = CONTENT_LEFT;
  doc.y = ruleY2 + 16;
}
function drawFooter(doc, data) {
  const footerY = PAGE_HEIGHT - 85;
  doc.strokeColor(C.hairline).lineWidth(0.5).moveTo(CONTENT_LEFT, footerY - 10).lineTo(CONTENT_RIGHT, footerY - 10).stroke();
  doc.fillColor(C.amber).font("Helvetica-Bold").fontSize(9).text("CONFIDENTIAL", CONTENT_LEFT, footerY, {
    characterSpacing: 2,
    width: 130,
    lineBreak: false
  });
  doc.fillColor(C.mute).font("Helvetica").fontSize(8.5).text(
    "System Generated \xB7 No Signature Required",
    CONTENT_LEFT + 130,
    footerY + 1,
    { width: 280, lineBreak: false }
  );
  doc.fillColor(C.mute).font("Helvetica").fontSize(7.5).text(
    `Ledger ${data.ledgerId.slice(0, 8)} \xB7 Generated ${data.generatedAt.toISOString()}`,
    CONTENT_LEFT,
    footerY + 16,
    { width: CONTENT_WIDTH, align: "left", lineBreak: false }
  );
}
async function ensureLogoCached() {
  if (fs2.existsSync(LOGO_CACHED_PATH)) return LOGO_CACHED_PATH;
  if (!logoFetchPromise) {
    logoFetchPromise = downloadLogo().catch((err) => {
      logoFetchPromise = null;
      throw err;
    });
  }
  return logoFetchPromise;
}
async function downloadLogo() {
  ensureDir(BRANDING_DIR);
  const res = await fetch(LOGO_URL);
  if (!res.ok) {
    throw new Error(`logo HTTP ${res.status} ${res.statusText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  fs2.writeFileSync(LOGO_CACHED_PATH, Buffer.from(arrayBuf));
  return LOGO_CACHED_PATH;
}
function ensureDir(p) {
  if (!fs2.existsSync(p)) fs2.mkdirSync(p, { recursive: true });
}
function capitalizeFirst(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
var COMPANY_NAME, COMPANY_ADDRESS, LOGO_URL, C, PAYSLIPS_DIR, BRANDING_DIR, LOGO_CACHED_PATH, MONTH_NAMES, PAGE_WIDTH, PAGE_HEIGHT, MARGIN, CONTENT_LEFT, CONTENT_RIGHT, CONTENT_WIDTH, COL_LABEL_X, COL_AMOUNT_RIGHT, COL_AMOUNT_WIDTH, COL_AMOUNT_X, logoFetchPromise;
var init_payslip_pdf = __esm({
  "server/services/payslip-pdf.ts"() {
    "use strict";
    init_payroll();
    COMPANY_NAME = "Verge Scales Pvt Ltd";
    COMPANY_ADDRESS = "4th Floor, Innov8 R City North wing, LBS Marg, Sahakar Bhawan Sub Post Office, Ghatkopar West, Mumbai 400086";
    LOGO_URL = "https://cdn.shopify.com/s/files/1/0974/4616/6844/files/logo.png?v=1777270936";
    C = {
      navyDark: "#0f172a",
      navyHeader: "#0b1220",
      // slightly darker so white logo pops
      ink: "#0f172a",
      body: "#1e293b",
      mute: "#64748b",
      hairline: "#e2e8f0",
      band: "#f8fafc",
      amber: "#b45309",
      totalRule: "#0f172a"
    };
    PAYSLIPS_DIR = path2.join(os2.tmpdir(), "orderflow-payslips");
    BRANDING_DIR = path2.join(os2.tmpdir(), "orderflow-branding");
    LOGO_CACHED_PATH = path2.join(BRANDING_DIR, "verge-scales-logo.png");
    MONTH_NAMES = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    PAGE_WIDTH = 595.28;
    PAGE_HEIGHT = 841.89;
    MARGIN = 50;
    CONTENT_LEFT = MARGIN;
    CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
    CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
    COL_LABEL_X = CONTENT_LEFT + 12;
    COL_AMOUNT_RIGHT = CONTENT_RIGHT - 12;
    COL_AMOUNT_WIDTH = 120;
    COL_AMOUNT_X = COL_AMOUNT_RIGHT - COL_AMOUNT_WIDTH;
    logoFetchPromise = null;
  }
});

// server/services/payslip-email.ts
var payslip_email_exports = {};
__export(payslip_email_exports, {
  sendPayslipEmail: () => sendPayslipEmail
});
import fs3 from "fs";
async function sendPayslipEmail(data, pdf) {
  const { client, fromEmail } = await getUncachableResendClient();
  const period = `${MONTH_NAMES2[data.period.month - 1]} ${data.period.year}`;
  const subject = `Your ${period} payslip \u2014 ${COMPANY_NAME2}`;
  const html = buildPayslipHtml(data, period);
  const text2 = buildPayslipText(data, period);
  const pdfBytes = fs3.readFileSync(pdf.absPath);
  const pdfBase64 = pdfBytes.toString("base64");
  const { data: result, error } = await client.emails.send({
    from: fromEmail,
    to: data.employee.email,
    subject,
    html,
    text: text2,
    attachments: [
      {
        filename: pdf.filename,
        content: pdfBase64,
        contentType: "application/pdf"
      }
    ]
  });
  if (error) {
    throw new Error(`Resend dispatch failed: ${error.message}`);
  }
  return { id: result?.id ?? null };
}
function buildPayslipHtml(d, period) {
  const rows = [];
  const ratioPct = (d.base.ratio * 100).toFixed(2);
  const cappedNote = d.base.capped ? ` <span style="color:#b45309;">(capped at 100%)</span>` : "";
  rows.push(
    earningsRow(
      "Base pay",
      `(${d.base.daysPresent} present + ${d.base.paidHolidaysUsed} paid holidays) \xF7 ${d.base.expectedWorkingDays} working days \xD7 \u20B9${formatINR(d.base.baseSalary)} = ${ratioPct}%${cappedNote}`,
      `\u20B9${formatINR(d.base.amount)}`
    )
  );
  if (d.incentives.profile === "ORDER_CONFIRMATION") {
    rows.push(
      earningsRow(
        "Confirmation bonus",
        d.incentives.deliveryRatePct == null ? "No delivery rate recorded" : `Delivery rate ${d.incentives.deliveryRatePct.toFixed(2)}% \u2192 tier bonus`,
        `\u20B9${formatINR(d.incentives.confirmationBonus)}`
      )
    );
  } else if (d.incentives.profile === "NDR_RTO") {
    rows.push(
      earningsRow(
        "Team delivery bonus",
        d.incentives.teamDeliveryRatePct == null ? "No team rate recorded" : `Team delivery ${d.incentives.teamDeliveryRatePct.toFixed(2)}% \u2192 tier bonus`,
        `\u20B9${formatINR(d.incentives.teamDeliveryBonus)}`
      )
    );
    rows.push(
      earningsRow(
        "Personal recovery bonus",
        d.incentives.recoveryRatePct == null ? "No recovery rate recorded" : `Recovery rate ${d.incentives.recoveryRatePct.toFixed(2)}% \u2192 tier bonus`,
        `\u20B9${formatINR(d.incentives.recoveryBonus)}`
      )
    );
    const reships = d.incentives.reshipsCount ?? 0;
    rows.push(
      earningsRow(
        "Reships bonus",
        `${reships} reships \xD7 \u20B950 = \u20B9${formatINR(reships * 50)}`,
        `\u20B9${formatINR(d.incentives.reshipsBonus)}`
      )
    );
  }
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(15,23,42,0.08);overflow:hidden;">
          <tr><td style="background:#0b1220;padding:24px 32px;color:#ffffff;">
            <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.2px;">${escapeHtml(COMPANY_NAME2)}</h1>
            <p style="margin:4px 0 0 0;font-size:11px;color:#cbd5e1;letter-spacing:1.5px;">PAYSLIP \xB7 ${escapeHtml(period.toUpperCase())}</p>
          </td></tr>
          <tr><td style="padding:24px 32px 8px 32px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;color:#64748b;font-size:11.5px;">Pay period: <strong style="color:#0f172a;">${period}</strong></p>
          </td></tr>
          <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0 0 4px 0;color:#0f172a;font-weight:600;font-size:14px;">${escapeHtml(d.employee.fullName)}</p>
            <p style="margin:0;color:#64748b;font-size:12.5px;">${escapeHtml(d.employee.email)}</p>
            ${d.employee.holidayState ? `<p style="margin:6px 0 0 0;color:#64748b;font-size:12px;">Holiday calendar: ${capitalizeFirst2(d.employee.holidayState)}</p>` : ""}
          </td></tr>

          <tr><td style="padding:20px 32px 8px 32px;">
            <p style="margin:0 0 8px 0;color:#0f172a;font-weight:700;font-size:13px;">Earnings</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${rows.join("")}
            </table>
          </td></tr>

          <tr><td style="padding:8px 32px 24px 32px;border-top:2px solid #0f172a;border-bottom:2px solid #0f172a;">
            <table width="100%"><tr>
              <td style="font-weight:700;font-size:15px;color:#0f172a;padding:10px 0;">Final payout</td>
              <td style="font-weight:700;font-size:15px;color:#0f172a;text-align:right;padding:10px 0;">\u20B9${formatINR(d.finalPayout)}</td>
            </tr></table>
          </td></tr>

          <tr><td style="padding:18px 32px;color:#94a3b8;font-size:11px;line-height:1.55;">
            <p style="margin:0;color:#b45309;font-weight:700;letter-spacing:1.5px;">CONFIDENTIAL</p>
            <p style="margin:4px 0 0 0;">System Generated \xB7 No Signature Required</p>
            <p style="margin:8px 0 0 0;color:#cbd5e1;font-size:10.5px;">${escapeHtml(COMPANY_ADDRESS2)}</p>
            <p style="margin:6px 0 0 0;font-size:10px;color:#cbd5e1;">Full PDF copy attached. Generated ${d.generatedAt.toUTCString()} \xB7 Ledger ${d.ledgerId.slice(0, 8)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
function earningsRow(label, detail, amount) {
  return `<tr>
    <td style="padding:6px 0;vertical-align:top;">
      <div style="color:#0f172a;font-weight:600;font-size:13px;">${escapeHtml(label)}</div>
      ${detail ? `<div style="color:#64748b;font-size:11.5px;margin-top:2px;">${detail}</div>` : ""}
    </td>
    <td style="padding:6px 0;color:#0f172a;font-weight:600;font-size:13px;text-align:right;vertical-align:top;white-space:nowrap;">${amount}</td>
  </tr>`;
}
function buildPayslipText(d, period) {
  const lines = [];
  lines.push(`${COMPANY_NAME2} payslip \u2014 ${period}`);
  lines.push("");
  lines.push(`Employee: ${d.employee.fullName} <${d.employee.email}>`);
  if (d.employee.holidayState) lines.push(`Calendar: ${d.employee.holidayState}`);
  lines.push("");
  lines.push("Earnings");
  lines.push("--------");
  lines.push(
    `Base pay: (${d.base.daysPresent} present + ${d.base.paidHolidaysUsed} paid holidays) / ${d.base.expectedWorkingDays} working days \xD7 \u20B9${formatINR(d.base.baseSalary)} = \u20B9${formatINR(d.base.amount)}${d.base.capped ? " (capped at 100%)" : ""}`
  );
  if (d.incentives.profile === "ORDER_CONFIRMATION") {
    lines.push(`Confirmation bonus: \u20B9${formatINR(d.incentives.confirmationBonus)}`);
  } else if (d.incentives.profile === "NDR_RTO") {
    lines.push(`Team delivery bonus: \u20B9${formatINR(d.incentives.teamDeliveryBonus)}`);
    lines.push(`Personal recovery bonus: \u20B9${formatINR(d.incentives.recoveryBonus)}`);
    const reships = d.incentives.reshipsCount ?? 0;
    lines.push(`Reships bonus: ${reships} \xD7 \u20B950 = \u20B9${formatINR(d.incentives.reshipsBonus)}`);
  }
  lines.push("");
  lines.push(`Final payout: \u20B9${formatINR(d.finalPayout)}`);
  lines.push("");
  lines.push(`Ledger ${d.ledgerId} \xB7 Generated ${d.generatedAt.toUTCString()}`);
  return lines.join("\n");
}
function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}
function capitalizeFirst2(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
var MONTH_NAMES2, COMPANY_NAME2, COMPANY_ADDRESS2;
var init_payslip_email = __esm({
  "server/services/payslip-email.ts"() {
    "use strict";
    init_resend();
    init_payroll();
    MONTH_NAMES2 = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    COMPANY_NAME2 = "Verge Scales Pvt Ltd";
    COMPANY_ADDRESS2 = "4th Floor, Innov8 R City North wing, LBS Marg, Sahakar Bhawan Sub Post Office, Ghatkopar West, Mumbai 400086";
  }
});

// server/shiprocket.ts
var shiprocket_exports = {};
__export(shiprocket_exports, {
  shiprocketService: () => shiprocketService
});
import axios2 from "axios";
var QUALITY_RATING_THRESHOLD, ShiprocketService, shiprocketService;
var init_shiprocket = __esm({
  "server/shiprocket.ts"() {
    "use strict";
    QUALITY_RATING_THRESHOLD = 3.8;
    ShiprocketService = class {
      baseUrl = "https://apiv2.shiprocket.in/v1/external";
      token = null;
      tokenExpiresAt = null;
      axiosInstance;
      constructor() {
        this.axiosInstance = axios2.create({
          baseURL: this.baseUrl,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      async authenticate() {
        if (this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
          return this.token;
        }
        const email = process.env.SHIPROCKET_API_EMAIL;
        const password = process.env.SHIPROCKET_API_PASSWORD;
        if (!email || !password) {
          throw new Error("Shiprocket credentials not configured. Please set SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD environment variables.");
        }
        try {
          const response = await axios2.post(
            `${this.baseUrl}/auth/login`,
            { email, password }
          );
          this.token = response.data.token;
          this.tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1e3;
          console.log("[Shiprocket] Authentication successful, token cached");
          return this.token;
        } catch (error) {
          console.error("[Shiprocket] Authentication failed:", error.response?.data || error.message);
          throw new Error("Failed to authenticate with Shiprocket API");
        }
      }
      async getAuthHeaders() {
        const token = await this.authenticate();
        return { Authorization: `Bearer ${token}` };
      }
      async createShipment(payload) {
        try {
          const headers = await this.getAuthHeaders();
          const response = await this.axiosInstance.post(
            "/orders/create/adhoc",
            payload,
            { headers }
          );
          console.log("[Shiprocket] Shipment created:", {
            orderId: response.data.order_id,
            shipmentId: response.data.shipment_id,
            awb: response.data.awb_code
          });
          return response.data;
        } catch (error) {
          console.error("[Shiprocket] Create shipment failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to create shipment in Shiprocket");
        }
      }
      async trackShipment(awb) {
        try {
          const headers = await this.getAuthHeaders();
          const response = await this.axiosInstance.get(
            `/courier/track/awb/${awb}`,
            { headers }
          );
          console.log("[Shiprocket] Shipment tracked:", { awb, status: response.data.tracking_data.shipment_status });
          return response.data;
        } catch (error) {
          console.error("[Shiprocket] Track shipment failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to track shipment");
        }
      }
      async getNDRShipments() {
        try {
          const headers = await this.getAuthHeaders();
          const response = await this.axiosInstance.get(
            "/ndr/all",
            { headers }
          );
          console.log("[Shiprocket] NDR shipments fetched:", response.data.data.length);
          return response.data.data;
        } catch (error) {
          console.error("[Shiprocket] Get NDR shipments failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to fetch NDR shipments");
        }
      }
      async getSpecificNDR(awb) {
        try {
          const headers = await this.getAuthHeaders();
          const response = await this.axiosInstance.get(
            `/ndr/${awb}`,
            { headers }
          );
          console.log("[Shiprocket] Specific NDR fetched:", { awb });
          return response.data.data;
        } catch (error) {
          console.error("[Shiprocket] Get specific NDR failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to fetch NDR details");
        }
      }
      async reattemptDelivery(payload) {
        try {
          const headers = await this.getAuthHeaders();
          const response = await this.axiosInstance.post(
            "/ndr/reattempt",
            payload,
            { headers }
          );
          console.log("[Shiprocket] Reattempt scheduled:", { awb: payload.awb });
          return {
            success: true,
            message: "Reattempt scheduled successfully"
          };
        } catch (error) {
          console.error("[Shiprocket] Reattempt delivery failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to schedule reattempt");
        }
      }
      async getAvailableCouriers(payload) {
        try {
          const headers = await this.getAuthHeaders();
          const response = await this.axiosInstance.get(
            "/courier/serviceability",
            {
              headers,
              params: payload
            }
          );
          console.log("[Shiprocket] Available couriers fetched:", response.data.data.available_courier_companies.length);
          const recommendedId = response.data.data.shiprocket_recommended_courier_id || response.data.data.recommended_courier_company_id;
          const couriers = response.data.data.available_courier_companies.map((courier) => ({
            ...courier,
            is_recommended: courier.courier_company_id === recommendedId
          }));
          return couriers;
        } catch (error) {
          console.error("[Shiprocket] Get available couriers failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to fetch available couriers");
        }
      }
      async assignCourierAndShip(payload) {
        try {
          const headers = await this.getAuthHeaders();
          console.log("[Shiprocket] Assigning courier with payload:", payload);
          const response = await this.axiosInstance.post(
            "/courier/assign/awb",
            payload,
            { headers }
          );
          console.log(
            "[Shiprocket] FULL AWB Assignment Response:",
            JSON.stringify(response.data, null, 2)
          );
          console.log("[Shiprocket] Courier assignment result:", {
            shipmentId: payload.shipment_id,
            courierId: payload.courier_id,
            awbAssignStatus: response.data.awb_assign_status,
            awbCode: response.data.response?.data?.awb_code,
            courierName: response.data.response?.data?.courier_name,
            pickupDate: response.data.response?.data?.pickup_scheduled_date,
            hasResponseData: !!response.data.response?.data
          });
          return response.data;
        } catch (error) {
          console.error("[Shiprocket] Assign courier failed:", {
            error: error.response?.data || error.message,
            payload,
            statusCode: error.response?.status
          });
          throw new Error(error.response?.data?.message || "Failed to assign courier");
        }
      }
      async getOrderDetails(shopifyOrderNumber) {
        try {
          const headers = await this.getAuthHeaders();
          console.log("[Shiprocket] Querying order by channel_order_id:", shopifyOrderNumber);
          const response = await this.axiosInstance.get(
            "/orders",
            {
              headers,
              params: {
                channel_order_id: shopifyOrderNumber
              }
            }
          );
          console.log("[Shiprocket] API Response:", {
            totalResults: response.data.data?.length || 0,
            meta: response.data.meta,
            searchedFor: shopifyOrderNumber
          });
          if (response.data.data && response.data.data.length > 0) {
            console.log("[Shiprocket] Returned orders:", response.data.data.map((o) => ({
              shiprocketOrderId: o.id,
              channelOrderId: o.channel_order_id,
              orderNumber: o.order_number,
              shipmentCount: o.shipments?.length || 0
            })));
            const matchingOrder = response.data.data.find(
              (o) => o.channel_order_id === shopifyOrderNumber || o.order_number === shopifyOrderNumber
            );
            if (!matchingOrder) {
              console.error("[Shiprocket] No exact match found for order:", shopifyOrderNumber);
              console.error("[Shiprocket] Available orders:", response.data.data.map((o) => o.channel_order_id));
              return null;
            }
            console.log("[Shiprocket] Exact order match found:", {
              shiprocketOrderId: matchingOrder.id,
              channelOrderId: matchingOrder.channel_order_id,
              shipmentId: matchingOrder.shipments?.[0]?.id,
              shipmentCount: matchingOrder.shipments?.length || 0,
              requestedOrderNumber: shopifyOrderNumber
            });
            if (matchingOrder.shipments && matchingOrder.shipments.length > 0) {
              return {
                shipment_id: matchingOrder.shipments[0].id,
                order_id: matchingOrder.id
              };
            } else {
              console.warn("[Shiprocket] Order found but has no shipments:", {
                orderId: matchingOrder.id,
                channelOrderId: matchingOrder.channel_order_id
              });
              return null;
            }
          }
          console.log("[Shiprocket] No orders returned from API for:", shopifyOrderNumber);
          return null;
        } catch (error) {
          console.error("[Shiprocket] Get order details failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to get order details");
        }
      }
      async getShipmentDetails(shipmentId) {
        try {
          const headers = await this.getAuthHeaders();
          const response = await this.axiosInstance.get(
            `/shipments/${shipmentId}`,
            { headers }
          );
          const shipment = response.data.data;
          console.log("[Shiprocket] Shipment details fetched:", {
            shipmentId,
            weight: shipment.weight,
            dimensions: `${shipment.length}x${shipment.breadth}x${shipment.height}`
          });
          return shipment;
        } catch (error) {
          console.error("[Shiprocket] Get shipment details failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to get shipment details");
        }
      }
      async getCouriersForShipment(shipmentId, orderId) {
        try {
          if (orderId) {
            const headers = await this.getAuthHeaders();
            console.log("[Shiprocket] Fetching couriers for shipment:", { shipmentId, orderId });
            const response = await this.axiosInstance.get(
              "/courier/serviceability",
              {
                headers,
                params: {
                  order_id: orderId
                }
              }
            );
            console.log("[Shiprocket] RAW Courier API Response:", {
              orderId,
              totalCouriers: response.data.data.available_courier_companies?.length || 0,
              recommendedCourierId: response.data.data.shiprocket_recommended_courier_id || response.data.data.recommended_courier_company_id,
              responseKeys: Object.keys(response.data.data)
            });
            console.log("\n========== COMPLETE RAW SHIPROCKET COURIER DATA ==========");
            console.log(JSON.stringify(response.data.data.available_courier_companies, null, 2));
            console.log("========== END RAW COURIER DATA ==========\n");
            console.log("\n========== COURIER COMPARISON TABLE ==========");
            console.log("Columns: Name | Total | Freight | COD | Rating | Score | Blocked | Suppress | QC | Surface");
            console.log("\u2500".repeat(120));
            response.data.data.available_courier_companies.forEach((courier) => {
              const blockedDates = courier.suppression_dates?.blocked_fm || courier.suppression_dates?.blocked_lm ? `FM:${courier.suppression_dates.blocked_fm || "N"} LM:${courier.suppression_dates.blocked_lm || "N"}` : "NONE";
              const totalCharge = courier.rate != null ? `\u20B9${Number(courier.rate).toFixed(2)}` : "N/A";
              const freightCharge = courier.freight_charge != null ? `\u20B9${Number(courier.freight_charge).toFixed(2)}` : "N/A";
              const codCharges = courier.cod_charges != null ? `\u20B9${Number(courier.cod_charges).toFixed(2)}` : "N/A";
              console.log([
                courier.courier_name.padEnd(35),
                totalCharge.padEnd(12),
                freightCharge.padEnd(12),
                codCharges.padEnd(12),
                String(courier.rating || "N/A").padEnd(8),
                String(courier.recommendation_score || "N/A").padEnd(8),
                String(courier.blocked || 0).padEnd(8),
                (courier.suppress_text?.substring(0, 20) || "NONE").padEnd(22),
                String(courier.qc_courier || 0).padEnd(6),
                String(courier.is_surface).padEnd(8)
              ].join(" | "));
              if (courier.suppression_dates) {
                console.log(`    \u2514\u2500 Suppression: ${blockedDates}, Delay: ${courier.suppression_dates.delay_remark || "NONE"}`);
              }
            });
            console.log("\u2500".repeat(120));
            console.log("========== END COMPARISON TABLE ==========\n");
            const recommendedId = response.data.data.shiprocket_recommended_courier_id || response.data.data.recommended_courier_company_id;
            const rawCouriers = response.data.data.available_courier_companies;
            console.log("[Shiprocket] All couriers before processing:", rawCouriers.map((c) => ({
              id: c.courier_company_id,
              name: c.courier_name,
              freight: c.freight_charge,
              cod: c.cod_charges,
              rate: c.rate,
              qc_courier: c.qc_courier,
              blocked: c.blocked,
              suppress_text: c.suppress_text,
              suppression_dates: c.suppression_dates,
              rating: c.rating
            })));
            const processedCouriers = rawCouriers.map((courier) => {
              const total_charge = courier.rate;
              const rating = parseFloat(courier.rating) || 0;
              let courierLogoUrl;
              try {
                if (courier.others && typeof courier.others === "string") {
                  const othersData = JSON.parse(courier.others);
                  courierLogoUrl = othersData.courier_logo_url;
                }
              } catch (e) {
              }
              let category = "serviceable";
              let nonServiceableReason = "";
              let hasWarning = false;
              let warningMessage = "";
              if (courier.blocked === 1) {
                category = "non_serviceable";
                nonServiceableReason = courier.suppress_text || "Courier services are currently unavailable for this location";
                console.log(`[Shiprocket] Non-serviceable ${courier.courier_name}: blocked=1, reason="${nonServiceableReason}"`);
              } else if (courier.suppression_dates && (courier.suppression_dates.blocked_fm || courier.suppression_dates.blocked_lm)) {
                category = "non_serviceable";
                nonServiceableReason = courier.suppress_text || `Courier services to the requested pin code are currently suspended${courier.suppression_dates.delay_remark ? " due to " + courier.suppression_dates.delay_remark.toLowerCase() : ""}`;
                console.log(`[Shiprocket] Non-serviceable ${courier.courier_name}: has blocking dates, reason="${nonServiceableReason}"`);
              } else if (courier.suppress_text && courier.suppress_text.trim() !== "") {
                category = "non_serviceable";
                nonServiceableReason = courier.suppress_text;
                console.log(`[Shiprocket] Non-serviceable ${courier.courier_name}: suppress_text="${nonServiceableReason}"`);
              } else if (rating > 0 && rating < QUALITY_RATING_THRESHOLD) {
                category = "low_rated";
                console.log(`[Shiprocket] Low rated ${courier.courier_name}: rating=${rating}`);
              } else {
                category = "serviceable";
                console.log(`[Shiprocket] Serviceable ${courier.courier_name}: rating=${rating}`);
              }
              if (category !== "non_serviceable") {
                if (courier.suppression_dates?.delay_remark && !courier.suppression_dates.blocked_fm && !courier.suppression_dates.blocked_lm) {
                  hasWarning = true;
                  warningMessage = `Delivery may be delayed due to ${courier.suppression_dates.delay_remark.toLowerCase()}`;
                  console.log(`[Shiprocket] Warning for ${courier.courier_name}: ${warningMessage}`);
                }
              }
              return {
                ...courier,
                total_charge,
                // Add total_charge for backward compatibility with frontend
                courier_logo_url: courierLogoUrl,
                // Add extracted logo URL
                is_recommended: courier.courier_company_id === recommendedId,
                category,
                non_serviceable_reason: nonServiceableReason,
                has_warning: hasWarning,
                warning_message: warningMessage
              };
            });
            const serviceable = processedCouriers.filter((c) => c.category === "serviceable").sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
            const lowRated = processedCouriers.filter((c) => c.category === "low_rated").sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
            const nonServiceable = processedCouriers.filter((c) => c.category === "non_serviceable");
            console.log("[Shiprocket] Courier categorization:", {
              total: processedCouriers.length,
              serviceable: serviceable.length,
              lowRated: lowRated.length,
              nonServiceable: nonServiceable.length,
              serviceableList: serviceable.map((c) => `${c.courier_name} (${c.rating})`),
              lowRatedList: lowRated.map((c) => `${c.courier_name} (${c.rating})`),
              nonServiceableList: nonServiceable.map((c) => ({
                name: c.courier_name,
                reason: c.non_serviceable_reason
              }))
            });
            return {
              serviceable,
              lowRated,
              nonServiceable,
              qualityRatingThreshold: QUALITY_RATING_THRESHOLD
            };
          }
          const shipment = await this.getShipmentDetails(shipmentId);
          const serviceabilityPayload = {
            pickup_postcode: shipment.pickup_postcode,
            delivery_postcode: shipment.delivery_postcode || shipment.customer_pincode,
            cod: shipment.cod,
            weight: shipment.applied_weight || parseFloat(shipment.weight),
            declared_value: shipment.total
          };
          const couriers = await this.getAvailableCouriers(serviceabilityPayload);
          const categorizedFallback = {
            serviceable: couriers.filter((c) => {
              const rating = parseFloat(c.rating) || 0;
              return c.is_serviceable && rating >= QUALITY_RATING_THRESHOLD;
            }).sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)),
            lowRated: couriers.filter((c) => {
              const rating = parseFloat(c.rating) || 0;
              return c.is_serviceable && rating > 0 && rating < QUALITY_RATING_THRESHOLD;
            }).sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)),
            nonServiceable: couriers.filter((c) => !c.is_serviceable),
            qualityRatingThreshold: QUALITY_RATING_THRESHOLD
          };
          return categorizedFallback;
        } catch (error) {
          console.error("[Shiprocket] Get couriers for shipment failed:", error.response?.data || error.message);
          throw new Error(error.response?.data?.message || "Failed to fetch couriers for shipment");
        }
      }
      async testConnection() {
        try {
          await this.authenticate();
          return {
            success: true,
            message: "Successfully connected to Shiprocket API"
          };
        } catch (error) {
          return {
            success: false,
            message: error.message || "Failed to connect to Shiprocket API"
          };
        }
      }
    };
    shiprocketService = new ShiprocketService();
  }
});

// server/index.ts
import "dotenv/config";
import express3 from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

// server/routes.ts
import express from "express";
import { createServer } from "http";
import crypto7 from "node:crypto";

// server/services/payu.ts
import crypto from "node:crypto";
function getCreds() {
  const key = process.env.PAYU_MERCHANT_KEY;
  const salt = process.env.PAYU_MERCHANT_SALT;
  if (!key || !salt) {
    throw new Error(
      "PayU is not configured (PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT missing)"
    );
  }
  return { key, salt };
}
function getPayuKey() {
  return getCreds().key;
}
function generatePayuHash(txnid, amount, productinfo, firstname, email) {
  const { key, salt } = getCreds();
  const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
  return crypto.createHash("sha512").update(hashString).digest("hex");
}
function verifyPayuHash(payload) {
  const { salt } = getCreds();
  const status = payload.status ?? "";
  const email = payload.email ?? "";
  const firstname = payload.firstname ?? "";
  const productinfo = payload.productinfo ?? "";
  const amount = payload.amount ?? "";
  const txnid = payload.txnid ?? "";
  const key = payload.key ?? "";
  const provided = (payload.hash ?? "").toLowerCase();
  if (!provided) return false;
  const reverseString = `${salt}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  const computed = crypto.createHash("sha512").update(reverseString).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
var RETURN_FEE_AMOUNT = "150.00";

// server/routes.ts
init_storage();
init_db();
init_schema();
import { eq as eq7, or as or2, sql as sql6, desc as desc2, gte as gte2, lte as lte2, and as and4, asc as asc3 } from "drizzle-orm";

// server/services/webhooks.ts
init_db();
init_schema();
import { eq as eq2, and as and2 } from "drizzle-orm";
async function triggerWebhooks(eventType, payload) {
  try {
    const activeWebhooks = await db.select().from(webhooks).where(and2(eq2(webhooks.eventType, eventType), eq2(webhooks.isActive, true)));
    if (activeWebhooks.length === 0) return;
    console.log(`[Webhooks] Firing ${activeWebhooks.length} webhook(s) for event: ${eventType}`);
    const results = await Promise.allSettled(
      activeWebhooks.map(async (webhook) => {
        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: eventType,
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              data: payload
            })
          });
          console.log(`[Webhooks] Sent to ${webhook.url} \u2014 status ${response.status}`);
        } catch (error) {
          console.error(`[Webhooks] Failed to send to ${webhook.url}:`, error.message);
        }
      })
    );
  } catch (error) {
    console.error("[Webhooks] Engine Error:", error);
  }
}

// server/webhooks.ts
init_shopify();
init_storage();

// server/assignment.ts
var OrderAssignmentEngine = class {
  constructor(storage3) {
    this.storage = storage3;
  }
  /**
   * Find the best agent to assign an order to using round-robin logic
   * 
   * Algorithm:
   * 1. Get all eligible agents (role: agent/manager, presenceStatus: present, isActive: true)
   * 2. Count current assigned orders for each agent (status: assigned, confirmed, pending)
   * 3. Select agent with fewest assigned orders
   * 4. Break ties by last assignment time (least recently assigned)
   * 
   * @returns User ID of selected agent, or null if no eligible agents
   */
  async findBestAgent() {
    const allUsers = await this.storage.listUsers();
    const eligibleAgents = allUsers.filter(
      (user) => (user.role === "agent" || user.role === "manager") && user.presenceStatus === "present" && user.isActive === true
    );
    if (eligibleAgents.length === 0) {
      console.log("\u26A0\uFE0F  No eligible agents available for assignment");
      return null;
    }
    const agentWorkloads = await Promise.all(
      eligibleAgents.map(async (agent) => {
        const assignedOrders = await this.storage.listOrders({
          assignedTo: agent.id,
          // Count orders that are still active (not completed/cancelled/delivered)
          status: void 0
          // We'll filter in memory
        });
        const activeOrders = assignedOrders.orders.filter((order) => {
          const callStatus = ((order.callStatus || "") + "").trim().toLowerCase();
          const fulfillmentStatus = ((order.fulfillmentStatus || "") + "").trim().toLowerCase();
          const agentFinished = callStatus === "confirmed" || callStatus === "cancelled";
          const warehouseFinished = fulfillmentStatus === "fulfilled" || fulfillmentStatus === "partial";
          return !agentFinished && !warehouseFinished;
        });
        const lastAssignmentTime = assignedOrders.orders.length > 0 ? Math.max(...assignedOrders.orders.map((o) => new Date(o.assignedAt || 0).getTime())) : 0;
        return {
          agentId: agent.id,
          agentName: agent.fullName,
          workload: activeOrders.length,
          lastAssignmentTime
        };
      })
    );
    agentWorkloads.sort((a, b) => {
      if (a.workload !== b.workload) {
        return a.workload - b.workload;
      }
      return a.lastAssignmentTime - b.lastAssignmentTime;
    });
    const selectedAgent = agentWorkloads[0];
    console.log(`\u{1F4CB} Assignment decision:`, {
      selected: selectedAgent.agentName,
      workload: selectedAgent.workload,
      allAgentWorkloads: agentWorkloads.map((a) => ({
        name: a.agentName,
        workload: a.workload
      }))
    });
    return selectedAgent.agentId;
  }
  /**
   * Automatically assign a COD order to an agent
   * 
   * @param orderId - Order ID to assign
   * @returns true if assigned successfully, false if no eligible agents
   */
  async autoAssignOrder(orderId) {
    const order = await this.storage.getOrder(orderId);
    if (!order) {
      console.error(`\u274C Order ${orderId} not found`);
      return false;
    }
    if (order.paymentMethod !== "cod") {
      console.log(`\u23ED\uFE0F  Skipping auto-assignment for prepaid order ${orderId}`);
      return false;
    }
    if (order.assignedTo) {
      console.log(`\u23ED\uFE0F  Order ${orderId} already assigned to ${order.assignedTo}`);
      return false;
    }
    const agentId = await this.findBestAgent();
    if (!agentId) {
      console.warn(`\u26A0\uFE0F  No eligible agents for order ${orderId}, leaving unassigned`);
      return false;
    }
    await this.storage.updateOrder(orderId, {
      assignedTo: agentId,
      assignedAt: /* @__PURE__ */ new Date(),
      status: "assigned"
    });
    await this.storage.createOrderAssignment({
      orderId,
      userId: agentId,
      assignedBy: null,
      // System auto-assignment
      note: "Auto-assigned via round-robin algorithm",
      storeId: order.storeId ?? void 0
    });
    console.log(`\u2705 Order ${order.shopifyOrderNumber} assigned to agent ${agentId}`);
    return true;
  }
  /**
   * Manually assign an order to a specific agent (admin override)
   * 
   * @param orderId - Order ID to assign
   * @param agentId - Agent user ID
   * @param assignedBy - Admin user ID who made the assignment
   * @param note - Optional note about the assignment
   */
  async manualAssignOrder(orderId, agentId, assignedBy, note, storeId) {
    const agent = await this.storage.getUser(agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }
    if (agent.role !== "agent" && agent.role !== "manager") {
      throw new Error("User is not an agent or manager");
    }
    await this.storage.updateOrder(orderId, {
      assignedTo: agentId,
      assignedAt: /* @__PURE__ */ new Date(),
      status: "assigned"
    });
    await this.storage.createOrderAssignment({
      orderId,
      userId: agentId,
      assignedBy,
      note: note || "Manually assigned by admin",
      storeId: storeId ?? void 0
    });
    console.log(`\u2705 Order ${orderId} manually assigned to ${agent.fullName} by ${assignedBy}`);
  }
  /**
   * Get workload statistics for all agents with LIVE attendance status
   */
  async getAgentWorkloads() {
    const allUsers = await this.storage.listUsers();
    const agents = allUsers.filter(
      (user) => (user.role === "agent" || user.role === "manager") && user.isActive
    );
    const teamAttendance = await this.storage.getTeamTodayAttendance();
    const attendanceMap = /* @__PURE__ */ new Map();
    teamAttendance.forEach((record) => {
      attendanceMap.set(record.userId, {
        clockOutTime: record.clockOutTime,
        status: record.status
      });
    });
    const getLiveStatus = (userId, accountStatus) => {
      if (accountStatus === "onleave" || accountStatus === "inactive") {
        return "offline";
      }
      const attendance2 = attendanceMap.get(userId);
      if (!attendance2) return "offline";
      if (attendance2.clockOutTime) return "offline";
      if (attendance2.status === "break") return "break";
      return "online";
    };
    const workloads = await Promise.all(
      agents.map(async (agent) => {
        const assignedOrders = await this.storage.listOrders({
          assignedTo: agent.id
        });
        const activeOrders = assignedOrders.orders.filter((order) => {
          const callStatus = ((order.callStatus || "") + "").trim().toLowerCase();
          const fulfillmentStatus = ((order.fulfillmentStatus || "") + "").trim().toLowerCase();
          const agentFinished = callStatus === "confirmed" || callStatus === "cancelled";
          const warehouseFinished = fulfillmentStatus === "fulfilled" || fulfillmentStatus === "partial";
          return !agentFinished && !warehouseFinished;
        });
        const accountStatus = agent.presenceStatus || "present";
        const liveStatus = getLiveStatus(agent.id, accountStatus);
        return {
          agentId: agent.id,
          agentName: agent.fullName,
          role: agent.role,
          presenceStatus: accountStatus,
          liveStatus,
          assignedOrders: assignedOrders.total,
          activeOrders: activeOrders.length
        };
      })
    );
    return workloads;
  }
};

// server/webhooks.ts
init_schema();

// server/utils/orderStatus.ts
init_unifiedStatus();
function mapShopifyStatus(financialStatus, fulfillmentStatus, shipmentStatus, cancelledAt) {
  return toUnifiedStatus({
    source: "shopify",
    fulfillmentStatus,
    shipmentStatus,
    cancelledAt
  });
}
function extractFulfillmentTracking(fulfillments) {
  const firstFulfillment = fulfillments?.[0];
  if (!firstFulfillment) {
    return {
      trackingNumber: null,
      trackingUrl: null,
      trackingCompany: null,
      shipmentStatus: null
    };
  }
  return {
    trackingNumber: firstFulfillment.tracking_number || null,
    trackingUrl: firstFulfillment.tracking_url || null,
    trackingCompany: firstFulfillment.tracking_company || null,
    shipmentStatus: firstFulfillment.shipment_status || null
  };
}

// server/webhooks.ts
init_unifiedStatus();

// server/webhookStoreResolver.ts
init_db();
init_schema();
init_encryption();
import { eq as eq3 } from "drizzle-orm";
async function resolveWebhookStore(req) {
  const candidate = pickShopDomainCandidate(req);
  if (!candidate) return null;
  const normalized = normalizeShopDomain(candidate);
  const [row] = await db.select({
    id: stores.id,
    storeName: stores.storeName,
    storeUrl: stores.storeUrl,
    webhookSecret: stores.webhookSecret
  }).from(stores).where(eq3(stores.storeUrl, normalized)).limit(1);
  if (!row) return null;
  return {
    store: row,
    webhookSecret: row.webhookSecret ? safeDecrypt(row.webhookSecret) : null
  };
}
function pickShopDomainCandidate(req) {
  const headerVal = req.get("X-Shopify-Shop-Domain");
  if (headerVal && headerVal.trim().length > 0) return headerVal;
  const body = req.body ?? {};
  if (typeof body.myshopify_domain === "string" && body.myshopify_domain.trim()) {
    return body.myshopify_domain;
  }
  if (typeof body.order_status_url === "string") {
    const m = body.order_status_url.match(
      /^https?:\/\/([^/]+\.myshopify\.com)/i
    );
    if (m) return m[1];
  }
  return null;
}
function normalizeShopDomain(raw) {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
}
function safeDecrypt(blob) {
  try {
    return decrypt(blob);
  } catch (err) {
    console.warn(
      "[webhook-resolver] failed to decrypt webhook_secret:",
      err.message
    );
    return null;
  }
}

// server/webhooks.ts
async function verifyWebhookAuth(req) {
  const resolved = await resolveWebhookStore(req);
  if (!resolved) {
    console.error(
      "[webhook] could not resolve store from request \u2014 no matching `stores` row",
      {
        domainHeader: req.get("X-Shopify-Shop-Domain"),
        bodyDomain: req.body?.myshopify_domain
      }
    );
    return {
      valid: false,
      status: 404,
      error: "Store not provisioned for this shop domain."
    };
  }
  const forwardedBy = req.get("X-Forwarded-By");
  if (forwardedBy === "n8n") {
    console.log(
      `\u2713 Webhook received from n8n relay for ${resolved.store.storeUrl} (HMAC verification skipped)`
    );
    return { valid: true, resolved };
  }
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  if (!hmac) {
    console.error("[webhook] missing X-Shopify-Hmac-Sha256 header");
    return { valid: false, status: 401, error: "Unauthorized: Missing signature" };
  }
  if (!resolved.webhookSecret) {
    console.error(
      `[webhook] store ${resolved.store.storeUrl} has no webhook_secret configured \u2014 cannot verify HMAC`
    );
    return {
      valid: false,
      status: 401,
      error: "Unauthorized: Webhook secret not configured for this store"
    };
  }
  const rawBody = req.rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    console.error("[webhook] rawBody not captured \u2014 cannot verify HMAC");
    return {
      valid: false,
      status: 500,
      error: "Server misconfiguration: raw body unavailable"
    };
  }
  if (!verifyShopifyHmac(rawBody, hmac, resolved.webhookSecret)) {
    console.error(
      `[webhook] HMAC mismatch for ${resolved.store.storeUrl}`
    );
    return { valid: false, status: 401, error: "Unauthorized: Invalid signature" };
  }
  console.log(
    `\u2713 Direct Shopify webhook verified for ${resolved.store.storeUrl}`
  );
  return { valid: true, resolved };
}
async function handleOrderCreated(req, res) {
  try {
    const verification = await verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(verification.status).json({ error: verification.error });
    }
    const { store } = verification.resolved;
    const shopifyOrder = req.body;
    console.log("Incoming webhook payload:", JSON.stringify(shopifyOrder, null, 2));
    if (!shopifyOrder || !shopifyOrder.id) {
      console.error("Invalid webhook payload: missing order ID");
      console.error("Payload structure:", Object.keys(shopifyOrder || {}));
      return res.status(400).json({
        error: "Invalid payload: missing order ID",
        receivedKeys: Object.keys(shopifyOrder || {})
      });
    }
    await storage.createWebhookLog({
      storeId: store.id,
      topic: "orders/create",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder
    });
    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
      store.id
    );
    if (existingOrder) {
      console.log(
        `Order ${shopifyOrder.id} already exists in ${store.storeUrl}, skipping`
      );
      return res.status(200).json({ message: "Order already exists" });
    }
    let customer;
    if (shopifyOrder.customer) {
      const existingCustomer = await storage.getCustomerByShopifyId(
        shopifyOrder.customer.id.toString(),
        store.id
      );
      const customerData = {
        storeId: store.id,
        shopifyCustomerId: shopifyOrder.customer.id.toString(),
        email: shopifyOrder.customer.email || shopifyOrder.email,
        firstName: shopifyOrder.customer.first_name || null,
        lastName: shopifyOrder.customer.last_name || null,
        phone: shopifyOrder.customer.phone || shopifyOrder.phone || null
      };
      if (existingCustomer) {
        customer = await storage.updateCustomer(existingCustomer.id, customerData);
      } else {
        customer = await storage.createCustomer(customerData);
      }
    }
    const rawPaymentMethod = shopifyOrder.payment_gateway_names?.[0] || "Unknown";
    const isCOD = rawPaymentMethod.toLowerCase().includes("cod");
    const normalizedPaymentMethod = isCOD ? "cod" : rawPaymentMethod;
    const fulfillmentTracking = extractFulfillmentTracking(shopifyOrder.fulfillments);
    const tags = shopifyOrder.tags ? shopifyOrder.tags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0) : [];
    const prepaidMethods = await storage.getPrepaidPaymentMethods(store.id);
    const prepaidMethodsLower = prepaidMethods.map((m) => m.toLowerCase());
    const isPrepaid = shopifyOrder.financial_status === "paid" && prepaidMethodsLower.includes(normalizedPaymentMethod.toLowerCase());
    const autoCallStatus = isPrepaid ? "Confirmed" : void 0;
    const orderData = {
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
      itemsSummary: shopifyOrder.line_items?.map((item) => item.name).join(", ") || null,
      assignedTo: null,
      assignedAt: null,
      shipmentStatus: fulfillmentTracking.shipmentStatus,
      trackingNumber: fulfillmentTracking.trackingNumber,
      trackingUrl: fulfillmentTracking.trackingUrl,
      courierName: fulfillmentTracking.trackingCompany,
      tags,
      rawShopifyData: shopifyOrder,
      shopifyCreatedAt: new Date(shopifyOrder.created_at),
      shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
      // processed_at is the canonical financial timestamp Shopify's
      // sales reports bucket on — and what Pare's Phase 1 waterfall
      // uses. Fall back to created_at if absent so the column is
      // never NULL (matches server/routes.ts historical sync).
      processedAt: shopifyOrder.processed_at ?? shopifyOrder.created_at
    };
    const order = await storage.createOrder(orderData);
    if (shopifyOrder.line_items && shopifyOrder.line_items.length > 0) {
      const items = [];
      for (const item of shopifyOrder.line_items) {
        let imageUrl = item.image_url || null;
        if (!imageUrl && item.variant_id) {
          try {
            const localProduct = await storage.getProductByVariantId(
              item.variant_id.toString(),
              store.id
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
          imageUrl
        });
      }
      await storage.createOrderItems(items);
    }
    await storage.createOrderStatus({
      storeId: store.id,
      orderId: order.id,
      status: orderData.status || "Pending",
      previousStatus: null,
      changedBy: null,
      note: "Order created from Shopify"
    });
    if (isCOD) {
      try {
        console.log(`Attempting auto-assignment for COD order ${order.shopifyOrderNumber}`);
        const assignmentEngine = new OrderAssignmentEngine(storage);
        const wasAssigned = await assignmentEngine.autoAssignOrder(order.id);
        if (wasAssigned) {
          console.log(`\u2713 COD order ${order.shopifyOrderNumber} auto-assigned successfully`);
        } else {
          console.log(`\u26A0 No agents available for auto-assignment of order ${order.shopifyOrderNumber}`);
        }
      } catch (assignError) {
        console.error(`Error during auto-assignment for order ${order.shopifyOrderNumber}:`, assignError);
      }
    }
    const finalOrder = await storage.getOrder(order.id);
    let assignedAgentEmail = null;
    if (finalOrder?.assignedTo) {
      const agent = await storage.getUser(finalOrder.assignedTo);
      if (agent) assignedAgentEmail = agent.email;
    }
    triggerWebhooks("order.created", { order: finalOrder || order, shopifyOrderId: shopifyOrder.id, assignedAgentEmail });
    console.log(`Successfully created order ${order.shopifyOrderNumber}`);
    res.status(200).json({ message: "Order created successfully" });
  } catch (error) {
    console.error("Error processing order creation webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
async function handleOrderUpdated(req, res) {
  try {
    const verification = await verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(verification.status).json({ error: verification.error });
    }
    const { store } = verification.resolved;
    const shopifyOrder = req.body;
    console.log("Incoming order update webhook:", JSON.stringify(shopifyOrder, null, 2));
    if (!shopifyOrder || !shopifyOrder.id) {
      console.error("Invalid webhook payload: missing order ID");
      return res.status(400).json({
        error: "Invalid payload: missing order ID",
        receivedKeys: Object.keys(shopifyOrder || {})
      });
    }
    await storage.createWebhookLog({
      storeId: store.id,
      topic: "orders/update",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder
    });
    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
      store.id
    );
    if (!existingOrder) {
      console.log(`Order ${shopifyOrder.id} not found in ${store.storeUrl}, creating new order`);
      return handleOrderCreated(req, res);
    }
    if (shopifyOrder.customer && existingOrder.customerId) {
      const customerData = {
        email: shopifyOrder.customer.email || shopifyOrder.email,
        firstName: shopifyOrder.customer.first_name || null,
        lastName: shopifyOrder.customer.last_name || null,
        phone: shopifyOrder.customer.phone || shopifyOrder.phone || null
      };
      await storage.updateCustomer(existingOrder.customerId, customerData);
    }
    const fulfillmentTracking = extractFulfillmentTracking(shopifyOrder.fulfillments);
    const tags = shopifyOrder.tags ? shopifyOrder.tags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0) : [];
    const newStatus = mapShopifyStatus(
      shopifyOrder.financial_status,
      shopifyOrder.fulfillment_status,
      fulfillmentTracking.shipmentStatus,
      shopifyOrder.cancelled_at
    );
    const SCALYSIS_TAG = "Scalysis: Order Confirmed \u2705";
    const isScalysisConfirmed = tags.includes(SCALYSIS_TAG);
    const alreadyConfirmed = existingOrder.callStatus === "Confirmed";
    const orderData = {
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
      tags,
      rawShopifyData: shopifyOrder,
      shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
      // Keep processed_at in sync on updates. Shopify mutates this
      // field when payment captures late (e.g., authorize-then-capture
      // flows), so we refresh it here to keep Pare's Phase 1 daily
      // bucketing aligned with Shopify's own sales reports.
      processedAt: shopifyOrder.processed_at ?? shopifyOrder.created_at
    };
    if (isScalysisConfirmed && !alreadyConfirmed) {
      console.log(`[Scalysis] Auto-confirming order ${existingOrder.shopifyOrderNumber} via AI tag`);
      orderData.callStatus = "Confirmed";
      orderData.confirmedAt = /* @__PURE__ */ new Date();
      orderData.confirmedBy = null;
      orderData.confirmedNotes = "Auto-confirmed by Scalysis AI";
    }
    await storage.updateOrder(existingOrder.id, orderData);
    if (newStatus !== existingOrder.status) {
      await storage.createOrderStatus({
        storeId: store.id,
        orderId: existingOrder.id,
        status: newStatus,
        previousStatus: existingOrder.status,
        changedBy: null,
        note: "Status updated from Shopify"
      });
    }
    if (isScalysisConfirmed && !alreadyConfirmed) {
      await storage.createOrderStatus({
        storeId: store.id,
        orderId: existingOrder.id,
        status: "confirmed",
        previousStatus: existingOrder.callStatus || "Pending",
        changedBy: null,
        note: "Auto-confirmed by Scalysis AI"
      });
    }
    console.log(`Successfully updated order ${existingOrder.shopifyOrderNumber}`);
    res.status(200).json({ message: "Order updated successfully" });
  } catch (error) {
    console.error("Error processing order update webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
async function handleOrderCancelled(req, res) {
  try {
    const verification = await verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(verification.status).json({ error: verification.error });
    }
    const { store } = verification.resolved;
    const shopifyOrder = req.body;
    console.log("Incoming order cancellation webhook:", JSON.stringify(shopifyOrder, null, 2));
    if (!shopifyOrder || !shopifyOrder.id) {
      console.error("Invalid webhook payload: missing order ID");
      return res.status(400).json({
        error: "Invalid payload: missing order ID",
        receivedKeys: Object.keys(shopifyOrder || {})
      });
    }
    await storage.createWebhookLog({
      storeId: store.id,
      topic: "orders/cancelled",
      shopifyOrderId: shopifyOrder.id?.toString() || null,
      payload: shopifyOrder
    });
    const existingOrder = await storage.getOrderByShopifyId(
      shopifyOrder.id.toString(),
      store.id
    );
    if (!existingOrder) {
      console.log(`Order ${shopifyOrder.id} not found in ${store.storeUrl}`);
      return res.status(404).json({ error: "Order not found" });
    }
    await storage.updateOrder(existingOrder.id, {
      status: "cancelled"
    });
    await storage.createOrderStatus({
      storeId: store.id,
      orderId: existingOrder.id,
      status: "cancelled",
      previousStatus: existingOrder.status,
      changedBy: null,
      note: shopifyOrder.cancel_reason ? `Cancelled: ${shopifyOrder.cancel_reason}` : "Cancelled from Shopify"
    });
    console.log(`Successfully cancelled order ${existingOrder.shopifyOrderNumber}`);
    res.status(200).json({ message: "Order cancelled successfully" });
  } catch (error) {
    console.error("Error processing order cancellation webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
async function handleFulfillmentUpdate(req, res) {
  try {
    const verification = await verifyWebhookAuth(req);
    if (!verification.valid) {
      return res.status(verification.status).json({ error: verification.error });
    }
    const { store } = verification.resolved;
    const fulfillment = req.body;
    console.log("[Fulfillment Update] Incoming webhook:", JSON.stringify(fulfillment, null, 2));
    if (!fulfillment || !fulfillment.order_id) {
      console.error("[Fulfillment Update] Invalid payload: missing order_id");
      return res.status(400).json({
        error: "Invalid payload: missing order_id",
        receivedKeys: Object.keys(fulfillment || {})
      });
    }
    await storage.createWebhookLog({
      storeId: store.id,
      topic: "fulfillments/update",
      shopifyOrderId: fulfillment.order_id?.toString() || null,
      payload: fulfillment
    });
    const existingOrder = await storage.getOrderByShopifyId(
      fulfillment.order_id.toString(),
      store.id
    );
    if (!existingOrder) {
      console.log(
        `[Fulfillment Update] Order not found for Shopify ID ${fulfillment.order_id} in ${store.storeUrl}`
      );
      return res.status(200).json({ message: "Order not found, ignoring" });
    }
    const shopifyShipmentStatus = fulfillment.shipment_status || null;
    const trackingNumber = fulfillment.tracking_number || existingOrder.trackingNumber;
    const trackingUrl = fulfillment.tracking_url || existingOrder.trackingUrl;
    const trackingCompany = fulfillment.tracking_company || existingOrder.courierName;
    console.log(`[Fulfillment Update] Order ${existingOrder.shopifyOrderNumber}: shipment_status = "${shopifyShipmentStatus}"`);
    const newOrderStatus = shopifyShipmentStatus ? toUnifiedStatus({ source: "shopify_fulfillment", rawStatus: shopifyShipmentStatus }) : void 0;
    const mappedShipmentStatus = newOrderStatus ? SHIPPING_STATUS_LABELS[newOrderStatus] : null;
    const updateData = {
      shipmentStatus: mappedShipmentStatus,
      trackingNumber,
      trackingUrl,
      courierName: trackingCompany
    };
    if (newOrderStatus) {
      updateData.status = newOrderStatus;
    }
    await storage.updateOrder(existingOrder.id, updateData);
    if (newOrderStatus && newOrderStatus !== existingOrder.status) {
      await storage.createOrderStatus({
        storeId: store.id,
        orderId: existingOrder.id,
        status: newOrderStatus,
        previousStatus: existingOrder.status,
        changedBy: null,
        note: `Shipment status updated: ${mappedShipmentStatus}`
      });
    }
    console.log(`[Fulfillment Update] Successfully updated order ${existingOrder.shopifyOrderNumber} - shipmentStatus: ${mappedShipmentStatus}, status: ${newOrderStatus || "(unchanged)"}`);
    res.status(200).json({ message: "Fulfillment update processed successfully" });
  } catch (error) {
    console.error("[Fulfillment Update] Error processing webhook:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// server/storeScope.ts
init_db();
init_schema();
import { eq as eq4, and as and3, asc as asc2 } from "drizzle-orm";

// server/permissions.ts
function isFullControlAdmin(user) {
  return user.role === "admin" && user.adminType === "full_control";
}
function isAdmin(user) {
  return user.role === "admin";
}
function isAgent(user) {
  return user.role === "agent";
}
function getUserPermissions(user) {
  if (!user.permissions) {
    return {};
  }
  return user.permissions;
}
function hasPermission(user, category, permission) {
  if (isAgent(user)) {
    return false;
  }
  if (isFullControlAdmin(user)) {
    return true;
  }
  const permissions = getUserPermissions(user);
  const categoryPerms = permissions[category];
  if (!categoryPerms || typeof categoryPerms !== "object") {
    return false;
  }
  return categoryPerms[permission] === true;
}
function canAssignOrders(user) {
  return isAdmin(user) && (isFullControlAdmin(user) || hasPermission(user, "orderManagement", "assignOrders"));
}
function canBulkAssignOrders(user) {
  return isAdmin(user) && (isFullControlAdmin(user) || hasPermission(user, "orderManagement", "bulkAssign"));
}
function canTriggerAutoAssignment(user) {
  return isAdmin(user) && (isFullControlAdmin(user) || hasPermission(user, "orderManagement", "triggerAutoAssignment"));
}
function canEditProfiles(user) {
  return isAdmin(user) && (isFullControlAdmin(user) || hasPermission(user, "teamManagement", "editProfiles"));
}
function canAssignExtensions(user) {
  return isAdmin(user) && (isFullControlAdmin(user) || hasPermission(user, "teamManagement", "assignExtensions"));
}
function canManageShopify(user) {
  return isAdmin(user) && (isFullControlAdmin(user) || hasPermission(user, "settings", "manageShopify"));
}
function canInviteTeamMembers(user) {
  return isAdmin(user);
}
function canInviteAdmins(user) {
  return isFullControlAdmin(user);
}

// server/storeScope.ts
var STORE_HEADER_NAME = "x-active-store-id";
var StoreScopeError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "StoreScopeError";
  }
};
async function resolveStoreScope(req) {
  const sessionUserId = req.session?.userId;
  if (!sessionUserId) {
    return null;
  }
  const [user] = await db.select().from(users).where(eq4(users.id, sessionUserId)).limit(1);
  if (!user) {
    return null;
  }
  const requestedHeader = readHeader(req);
  if (isAdmin(user)) {
    if (requestedHeader) {
      const [row] = await db.select({ id: stores.id }).from(stores).where(eq4(stores.id, requestedHeader)).limit(1);
      if (!row) {
        throw new StoreScopeError(
          404,
          `Store ${requestedHeader} not found`
        );
      }
      return { storeId: row.id, isAdmin: true, isFallback: false };
    }
    const [fallback] = await db.select({ id: stores.id }).from(stores).orderBy(asc2(stores.createdAt)).limit(1);
    if (!fallback) {
      return null;
    }
    return { storeId: fallback.id, isAdmin: true, isFallback: true };
  }
  if (requestedHeader) {
    const [membership] = await db.select({ storeId: userStores.storeId }).from(userStores).where(
      and3(
        eq4(userStores.userId, user.id),
        eq4(userStores.storeId, requestedHeader)
      )
    ).limit(1);
    if (!membership) {
      throw new StoreScopeError(
        403,
        "You do not have access to this store"
      );
    }
    return {
      storeId: membership.storeId,
      isAdmin: false,
      isFallback: false
    };
  }
  const [first] = await db.select({ storeId: userStores.storeId }).from(userStores).where(eq4(userStores.userId, user.id)).orderBy(asc2(userStores.createdAt)).limit(1);
  if (!first) {
    throw new StoreScopeError(
      403,
      "Your account is not attached to any store. Ask an administrator to grant access."
    );
  }
  return { storeId: first.storeId, isAdmin: false, isFallback: true };
}
async function attachStoreScope(req, _res, next) {
  if (req.path.startsWith("/api/webhooks/")) {
    return next();
  }
  try {
    const scope = await resolveStoreScope(req);
    if (scope) req.storeScope = scope;
    next();
  } catch (err) {
    if (err instanceof StoreScopeError) {
      req.storeScopeError = err;
      return next();
    }
    next(err);
  }
}
function requireStoreScope(req, res) {
  const stashed = req.storeScopeError;
  if (stashed) {
    res.status(stashed.status).json({ error: stashed.message });
    return null;
  }
  if (!req.storeScope) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.storeScope;
}
function readHeader(req) {
  const raw = req.headers[STORE_HEADER_NAME];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// server/routes.ts
init_schema();
init_encryption();
import { ZodError } from "zod";
init_resend();
import axios3 from "axios";

// server/upload.ts
import fs from "fs";
import os from "os";
import path from "path";
import crypto4 from "crypto";
import multer from "multer";
var KYC_UPLOAD_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "orderflow-kyc") : path.resolve(import.meta.dirname, "..", "uploads", "kyc");
try {
  fs.mkdirSync(KYC_UPLOAD_DIR, { recursive: true });
} catch (err) {
  if (err?.code !== "EEXIST") {
    console.warn(
      `[kyc-upload] could not pre-create ${KYC_UPLOAD_DIR}: ${err?.message ?? err}`
    );
  }
}
var ALLOWED_EXTENSIONS = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".pdf"]);
var ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/pdf"
]);
var storage2 = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, KYC_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = (req.params.id ?? "unknown").replace(/[^a-zA-Z0-9-]/g, "");
    const token = crypto4.randomBytes(12).toString("hex");
    cb(null, `${userId}-${token}${ext}`);
  }
});
var kycUpload = multer({
  storage: storage2,
  limits: {
    fileSize: 5 * 1024 * 1024,
    // 5 MB — generous for a passport/Aadhaar scan.
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(
        new Error(
          `Unsupported file extension (${ext}). Allowed: .jpg, .jpeg, .png, .pdf`
        )
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new Error(
          `Unsupported mime type (${file.mimetype}). Allowed: image/jpeg, image/png, application/pdf`
        )
      );
    }
    cb(null, true);
  }
});
function resolveKycFilePath(filename) {
  const resolved = path.resolve(KYC_UPLOAD_DIR, filename);
  if (!resolved.startsWith(KYC_UPLOAD_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

// server/services/analytics.ts
init_db();
init_schema();
import { sql as sql3 } from "drizzle-orm";
function computeTierRtoPct(rtoRaw, totalRaw) {
  const n = Number(rtoRaw) || 0;
  const d = Number(totalRaw) || 0;
  if (d <= 0) return null;
  return Number((n / d * 100).toFixed(2));
}
function istDateKey(d) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
  return parts;
}
function enumerateDays(startDate, endDate) {
  const out = [];
  const startKey = istDateKey(startDate);
  const endKey = istDateKey(endDate);
  const cursor = /* @__PURE__ */ new Date(`${startKey}T00:00:00+05:30`);
  const end = /* @__PURE__ */ new Date(`${endKey}T00:00:00+05:30`);
  while (cursor.getTime() <= end.getTime()) {
    out.push(istDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
async function getPareMetrics(dateRange) {
  const { startDate, endDate, storeId } = dateRange;
  const storeFilter = storeId ? sql3`AND ${orders}.store_id = ${storeId}` : sql3``;
  const mmStoreFilter = storeId ? sql3`AND mm.store_id = ${storeId}` : sql3``;
  const query = sql3`
    SELECT
      (DATE_TRUNC('day', processed_at AT TIME ZONE 'Asia/Kolkata'))::date::text AS day,

      -- ── Waterfall top: Gross GMV → Discounts → Order Revenue ───
      -- Shopify-aligned definitions:
      --   Gross GMV     = pre-discount line-items value
      --                 = subtotal (which is post-line-item-discount
      --                   but pre-tax/shipping) + total_discount
      --   Discounts     = total_discount
      --   Order Revenue = total_price (the amount actually charged —
      --                   matches Shopify's "Total Sales" line in the
      --                   sales-over-time report)
      COALESCE(SUM(subtotal::numeric + COALESCE(total_discount::numeric, 0)), 0)::float8 AS gross_gmv,
      COALESCE(SUM(COALESCE(total_discount::numeric, 0)), 0)::float8 AS discounts,
      COALESCE(SUM(total_price::numeric), 0)::float8 AS order_revenue,

      -- ── Strict exclusivity hierarchy (Pare v0.5) ───────────────
      -- An order can land in EXACTLY ONE of these leakage buckets,
      -- ordered by lifecycle stage:
      --   Warehouse → Transit → Customer
      -- A prepaid order cancelled mid-transit used to be counted as
      -- BOTH Refunded (financial) AND RTO (logistics), double-counting
      -- the loss. The filters below prevent that overlap so the
      -- waterfall sums cleanly to Net GMV.

      -- Warehouse stage: cancelled BEFORE any fulfillment occurred.
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE status = 'Cancelled' AND fulfillment_status IS NULL
      ), 0)::float8 AS cancelled_gmv,

      -- Transit stage: logistics says RTO. Claimed here regardless of
      -- financial_status so a mid-transit refund is NOT also counted
      -- as a customer-side refund below.
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE UPPER(shipment_status) LIKE '%RTO%'
           OR status IN ('rto_initiated', 'rto_delivered')
      ), 0)::float8 AS rto_gmv,

      -- Customer stage: refund AFTER successful delivery. Requires the
      -- order to have actually reached the customer AND not be RTO.
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE financial_status IN ('refunded', 'partially_refunded')
          AND (shipment_status ILIKE 'delivered' OR status = 'Delivered')
          AND UPPER(shipment_status) NOT LIKE '%RTO%'
      ), 0)::float8 AS refunded_amount,

      -- Delivered is a PERFORMANCE metric, not leakage. Excluded from
      -- Net GMV subtraction. Scoped to genuinely-delivered (not RTO)
      -- so it stays disjoint from rto_gmv.
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE (shipment_status ILIKE 'delivered' OR status = 'Delivered')
          AND UPPER(shipment_status) NOT LIKE '%RTO%'
      ), 0)::float8 AS delivered_gmv,

      -- Phase-level counts (same filters as the old single-row query).
      COUNT(*)::int4 AS total_orders,
      COUNT(*) FILTER (WHERE fulfillment_status IS NULL AND status <> 'Cancelled')::int4 AS unfulfilled_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE fulfillment_status IS NULL AND status <> 'Cancelled'), 0)::float8 AS unfulfilled_value,
      COUNT(*) FILTER (WHERE status = 'Cancelled' AND fulfillment_status IS NULL)::int4 AS cancelled_preship_count,
      COUNT(*) FILTER (
        WHERE status = 'Shipped'
          AND (shipment_status IS NULL OR shipment_status NOT IN ('out_for_delivery', 'delivered'))
      )::int4 AS shipped_count,
      COALESCE(SUM(total_price::numeric) FILTER (
        WHERE status = 'Shipped'
          AND (shipment_status IS NULL OR shipment_status NOT IN ('out_for_delivery', 'delivered'))
      ), 0)::float8 AS shipped_value,
      COUNT(*) FILTER (WHERE shipment_status = 'out_for_delivery')::int4 AS ofd_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE shipment_status = 'out_for_delivery'), 0)::float8 AS ofd_value,
      COUNT(*) FILTER (WHERE status = 'rto_initiated')::int4 AS rto_initiated_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE status = 'rto_initiated'), 0)::float8 AS rto_initiated_value,
      COUNT(*) FILTER (WHERE status = 'rto_delivered' OR UPPER(shipment_status) = 'RTO')::int4 AS rto_delivered_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE status = 'rto_delivered' OR UPPER(shipment_status) = 'RTO'), 0)::float8 AS rto_delivered_value,
      COUNT(*) FILTER (WHERE fulfillment_status IN ('fulfilled', 'partial'))::int4 AS total_ever_shipped,
      COUNT(*) FILTER (WHERE status = 'Delivered')::int4 AS delivered_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE status = 'Delivered'), 0)::float8 AS delivered_value,
      COUNT(*) FILTER (WHERE financial_status = 'refunded')::int4 AS refunded_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE financial_status = 'refunded'), 0)::float8 AS refunded_value,
      COUNT(*) FILTER (WHERE financial_status = 'partially_refunded')::int4 AS partial_refund_count,
      COALESCE(SUM(total_price::numeric) FILTER (WHERE financial_status = 'partially_refunded'), 0)::float8 AS partial_refund_value,
      COUNT(*) FILTER (WHERE status = 'Cancelled')::int4 AS cancelled_orders_all,
      COUNT(*) FILTER (
        WHERE status IN ('rto_initiated', 'rto_delivered') OR UPPER(shipment_status) = 'RTO'
      )::int4 AS rto_orders_all,
      COUNT(*) FILTER (WHERE financial_status IN ('refunded', 'partially_refunded'))::int4 AS refunded_orders_all,

      -- ── Payment method split ───────────────────────────────────
      -- payment_method is freeform Shopify gateway text ("cod",
      -- "razorpay", "Shopify Payments", …). A case-insensitive
      -- substring match catches "COD", "Cash on Delivery" variants
      -- without requiring a settings lookup. Non-COD, non-null is
      -- treated as paid/prepaid.
      COUNT(*) FILTER (WHERE LOWER(payment_method) LIKE '%cod%')::int4 AS cod_orders,
      COUNT(*) FILTER (
        WHERE payment_method IS NOT NULL
          AND LOWER(payment_method) NOT LIKE '%cod%'
      )::int4 AS paid_orders,

      -- ── CX breakdown ───────────────────────────────────────────
      -- Heuristic: orders confirmed with a confirmed_by user are CX-
      -- confirmed (a human on the ops team); orders confirmed without
      -- confirmed_by are brand/auto-confirmed (prepaid auto-confirm).
      COUNT(*) FILTER (
        WHERE call_status = 'Confirmed' AND confirmed_by IS NOT NULL
      )::int4 AS cx_confirmed_orders,
      COUNT(*) FILTER (WHERE call_status = 'Pending')::int4 AS cx_confirmation_pending,
      COUNT(*) FILTER (
        WHERE call_status = 'Confirmed' AND confirmed_by IS NULL
      )::int4 AS brand_confirmed_orders,

      -- ── Phase 5 · Geographic Risk Segmentation ──────────────────
      -- LEFT JOIN on pincode_tiers lets us bucket each order into the
      -- city tier of its shipping pincode. Orders whose pincode is
      -- NULL or absent from the lookup fall into unknown.
      COUNT(*) FILTER (WHERE pt.tier = 'Tier 1')::int4 AS tier_1_orders,
      COUNT(*) FILTER (
        WHERE pt.tier = 'Tier 1'
          AND (status IN ('rto_initiated', 'rto_delivered') OR UPPER(shipment_status) = 'RTO')
      )::int4 AS tier_1_rto_count,
      COUNT(*) FILTER (WHERE pt.tier = 'Tier 2')::int4 AS tier_2_orders,
      COUNT(*) FILTER (
        WHERE pt.tier = 'Tier 2'
          AND (status IN ('rto_initiated', 'rto_delivered') OR UPPER(shipment_status) = 'RTO')
      )::int4 AS tier_2_rto_count,
      COUNT(*) FILTER (WHERE pt.tier = 'Tier 3')::int4 AS tier_3_orders,
      COUNT(*) FILTER (
        WHERE pt.tier = 'Tier 3'
          AND (status IN ('rto_initiated', 'rto_delivered') OR UPPER(shipment_status) = 'RTO')
      )::int4 AS tier_3_rto_count,
      COUNT(*) FILTER (WHERE pt.tier IS NULL OR pt.tier = 'Unknown')::int4 AS unknown_tier_orders,

      -- ── Phase 4 · Marketing (Meta/FB) ──────────────────────────
      -- marketing_metrics has at most one row per date, so every
      -- orders row on a given day joins to the same mm row.
      -- Using MAX() (not SUM) returns the correct per-day value
      -- without inflating by the order count.
      MAX(mm.fb_spend)::float8 AS fb_spend,
      MAX(mm.fb_roas)::float8 AS fb_roas,
      MAX(mm.fb_gmv)::float8 AS fb_gmv,
      MAX(mm.fb_orders)::int4 AS fb_orders
    FROM ${orders}
    LEFT JOIN ${pincodeTiers} pt ON pt.pincode = ${orders}.shipping_pincode
    LEFT JOIN ${marketingMetrics} mm
      ON mm.date = DATE_TRUNC('day', processed_at AT TIME ZONE 'Asia/Kolkata')::date
      ${mmStoreFilter}
    -- Bucket + filter on processed_at (the financial timestamp Shopify
    -- uses in its sales reports), not shopify_created_at. COD orders
    -- and delayed-capture payments routinely drift a day between the
    -- two — this matches Shopifys own numbers 1:1.
    WHERE processed_at >= ${startDate}
      AND processed_at <= ${endDate}
      -- Phase 2: scope to a single store when the caller asks.
      ${storeFilter}
      -- Exclude test-mode orders (Shopifys test boolean). Populated
      -- by the historical backfill script at server/scripts/flag-test-orders.ts
      -- and by the regular sync going forward (see buildOrderInsert).
      AND test_order = false
      -- Exclude voided orders (Shopify treats these as never-happened).
      AND (financial_status IS NULL OR financial_status <> 'voided')
      -- NOTE: status = Cancelled is intentionally NOT filtered here.
      -- Phase 3 Cancelled Orders row depends on counting them, and
      -- the Phase 1 leakage rows already scope by status internally.
    GROUP BY DATE_TRUNC('day', processed_at AT TIME ZONE 'Asia/Kolkata')
    ORDER BY day ASC
  `;
  const result = await db.execute(query);
  const rows = result.rows ?? result ?? [];
  const byDay = /* @__PURE__ */ new Map();
  for (const r of rows) byDay.set(r.day, r);
  const daily = enumerateDays(startDate, endDate).map((day) => {
    const r = byDay.get(day);
    if (!r) {
      return {
        date: day,
        grossGmv: 0,
        discounts: 0,
        orderRevenue: 0,
        deliveredGmv: 0,
        rtoGmv: 0,
        cancelledGmv: 0,
        refundedAmount: 0,
        leakage: 0,
        netGmv: 0,
        totalOrders: 0,
        codOrders: 0,
        paidOrders: 0,
        exchangeOrdersPaid: null,
        exchangeOrdersCod: null,
        cancelledOrders: 0,
        fulfilledOrders: 0,
        unfulfilledOrders: 0,
        deliveredOrders: 0,
        rtoOrders: 0,
        refundedOrders: 0,
        fbSpend: null,
        fbRoas: null,
        fbGmv: null,
        fbOrders: null,
        cxConfirmedOrders: 0,
        cxConfirmationPending: 0,
        c2pOrders: null,
        brandConfirmedOrders: 0,
        tier1Orders: null,
        tier1Rto: null,
        tier2Orders: null,
        tier2Rto: null,
        tier3Orders: null,
        tier3Rto: null,
        unknownTierOrders: 0
      };
    }
    const grossGmv2 = Number(r.gross_gmv) || 0;
    const discounts2 = Number(r.discounts) || 0;
    const orderRevenue2 = Number(r.order_revenue) || 0;
    const cancelledGmv = Number(r.cancelled_gmv) || 0;
    const rtoGmv = Number(r.rto_gmv) || 0;
    const refundedAmount = Number(r.refunded_amount) || 0;
    const leakage2 = cancelledGmv + rtoGmv + refundedAmount;
    const totalOrders = Number(r.total_orders) || 0;
    return {
      date: day,
      grossGmv: grossGmv2,
      discounts: discounts2,
      orderRevenue: orderRevenue2,
      deliveredGmv: Number(r.delivered_gmv) || 0,
      rtoGmv,
      cancelledGmv,
      refundedAmount,
      leakage: leakage2,
      // Post-discount: Net GMV is derived from orderRevenue, NOT the
      // pre-discount grossGmv — otherwise we'd understate leakage as
      // a share of the actual money in.
      netGmv: orderRevenue2 - leakage2,
      totalOrders,
      codOrders: Number(r.cod_orders) || 0,
      paidOrders: Number(r.paid_orders) || 0,
      exchangeOrdersPaid: null,
      exchangeOrdersCod: null,
      cancelledOrders: Number(r.cancelled_orders_all) || 0,
      fulfilledOrders: Number(r.total_ever_shipped) || 0,
      unfulfilledOrders: Number(r.unfulfilled_count) || 0,
      deliveredOrders: Number(r.delivered_count) || 0,
      rtoOrders: Number(r.rto_orders_all) || 0,
      refundedOrders: Number(r.refunded_orders_all) || 0,
      fbSpend: r.fb_spend == null ? null : Number(r.fb_spend),
      fbRoas: r.fb_roas == null ? null : Number(r.fb_roas),
      fbGmv: r.fb_gmv == null ? null : Number(r.fb_gmv),
      fbOrders: r.fb_orders == null ? null : Number(r.fb_orders),
      cxConfirmedOrders: Number(r.cx_confirmed_orders) || 0,
      cxConfirmationPending: Number(r.cx_confirmation_pending) || 0,
      c2pOrders: null,
      brandConfirmedOrders: Number(r.brand_confirmed_orders) || 0,
      // ── Phase 5 · live tier data from pincode_tiers join. ────────
      tier1Orders: Number(r.tier_1_orders) || 0,
      tier1Rto: computeTierRtoPct(r.tier_1_rto_count, r.tier_1_orders),
      tier2Orders: Number(r.tier_2_orders) || 0,
      tier2Rto: computeTierRtoPct(r.tier_2_rto_count, r.tier_2_orders),
      tier3Orders: Number(r.tier_3_orders) || 0,
      tier3Rto: computeTierRtoPct(r.tier_3_rto_count, r.tier_3_orders),
      unknownTierOrders: Number(r.unknown_tier_orders) || 0
    };
  });
  const sum = (k) => rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
  const sumInt = (k) => rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
  const grossGmv = sum("gross_gmv");
  const discounts = sum("discounts");
  const orderRevenue = sum("order_revenue");
  const cancelledGmvTotal = sum("cancelled_gmv");
  const rtoGmvTotal = sum("rto_gmv");
  const refundedAmountTotal = sum("refunded_amount");
  const leakage = cancelledGmvTotal + rtoGmvTotal + refundedAmountTotal;
  const netGmv = orderRevenue - leakage;
  const totalEverShipped = sumInt("total_ever_shipped");
  const rtoInitiatedCount = sumInt("rto_initiated_count");
  const rtoDeliveredCount = sumInt("rto_delivered_count");
  const rtoPct = totalEverShipped > 0 ? Number(
    ((rtoInitiatedCount + rtoDeliveredCount) / totalEverShipped * 100).toFixed(2)
  ) : null;
  return {
    dateRange: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    },
    grossGmv,
    discounts,
    orderRevenue,
    leakage,
    netGmv,
    totalOrders: sumInt("total_orders"),
    phases: {
      preShip: {
        unfulfilled: {
          count: sumInt("unfulfilled_count"),
          value: sum("unfulfilled_value")
        },
        cancelledBeforeDispatch: {
          count: sumInt("cancelled_preship_count"),
          value: sum("cancelled_gmv")
        }
      },
      transit: {
        shipped: {
          count: sumInt("shipped_count"),
          value: sum("shipped_value")
        },
        outForDelivery: {
          count: sumInt("ofd_count"),
          value: sum("ofd_value")
        },
        rtoInitiated: {
          count: rtoInitiatedCount,
          value: sum("rto_initiated_value")
        },
        rtoDelivered: {
          count: rtoDeliveredCount,
          value: sum("rto_delivered_value")
        },
        totalEverShipped,
        rtoPct
      },
      postDelivery: {
        delivered: {
          count: sumInt("delivered_count"),
          value: sum("delivered_value")
        },
        returnRequests: {
          count: sumInt("refunded_count"),
          value: sum("refunded_value")
        },
        partialRefunds: {
          count: sumInt("partial_refund_count"),
          value: sum("partial_refund_value")
        },
        exchanges: {
          count: null,
          value: null,
          note: "Exchange linkage not captured in current schema. Adding a shopify_source_order_id column is needed to populate this signal."
        },
        netGmvExcludingExchanges: netGmv
      },
      settled: {
        settledAmount: null,
        note: "Payment-gateway settlement data not yet integrated. Placeholder until a settlements table is wired up."
      }
    },
    daily,
    computedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/auth.ts
import bcrypt from "bcryptjs";
var BCRYPT_COST = 12;
async function hashPassword(plaintext) {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("hashPassword: empty or non-string input");
  }
  return bcrypt.hash(plaintext, BCRYPT_COST);
}
function isBcryptHash(stored) {
  if (!stored) return false;
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}
async function verifyPassword(plaintext, stored) {
  if (!stored || typeof plaintext !== "string" || plaintext.length === 0) {
    return { ok: false, needsRehash: false };
  }
  if (isBcryptHash(stored)) {
    const ok2 = await bcrypt.compare(plaintext, stored);
    return { ok: ok2, needsRehash: false };
  }
  const ok = plaintext === stored;
  return { ok, needsRehash: ok };
}

// server/routes.ts
import fs4 from "fs";
import path3 from "path";
function normalizeFastrrPayload(raw) {
  const payload = raw?.data || raw?.checkout || raw || {};
  const pick = (...keys) => {
    for (const k of keys) {
      const val = payload[k];
      if (val !== void 0 && val !== null && val !== "") return val;
    }
    return null;
  };
  const nested = (obj, ...keys) => {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys) {
      if (obj[k] !== void 0 && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return null;
  };
  const externalId = pick("cartId", "cart_id", "id", "cart_token")?.toString() || null;
  let customerName = pick("custName", "customer_name", "name");
  if (!customerName) {
    const firstName = pick("first_name", "firstName") || nested(payload.shipping_address, "first_name", "firstName") || nested(payload.customer, "first_name", "firstName");
    const lastName = pick("last_name", "lastName") || nested(payload.shipping_address, "last_name", "lastName") || nested(payload.customer, "last_name", "lastName");
    if (firstName || lastName) {
      customerName = [firstName, lastName].filter(Boolean).join(" ");
    }
  }
  let customerPhone = pick("custPhone", "customer_phone", "phone", "phone_number", "mobile") || nested(payload.shipping_address, "phone", "phone_number") || nested(payload.customer, "phone", "phone_number");
  if (typeof customerPhone === "string") {
    customerPhone = customerPhone.replace(/\s+/g, "");
  }
  const customerEmail = pick("custEmail", "customer_email", "email") || nested(payload.customer, "email");
  const checkoutUrl = pick("abandonLink", "url", "checkout_url", "abandon_link");
  const cartValue = pick("cartTotal", "cart_total", "total_price")?.toString() || null;
  const checkoutStage = pick("latest_stage", "checkoutStage", "checkout_stage", "stage");
  let address = null;
  if (typeof payload.address === "string" && payload.address.trim()) {
    address = payload.address.trim();
  } else {
    const source = payload.shipping_address && typeof payload.shipping_address === "object" ? payload.shipping_address : payload;
    const parts = [
      source.address1 || source.address_1,
      source.address2 || source.address_2,
      source.city,
      source.province || source.state,
      source.zip || source.postal_code || source.pincode,
      source.country
    ].filter((p) => p && typeof p === "string" && p.trim());
    address = parts.length > 0 ? parts.join(", ") : null;
  }
  let items = null;
  if (Array.isArray(payload.items) && payload.items.length > 0) {
    items = payload.items;
  } else if (payload.productName || payload.product_name) {
    items = [{
      name: payload.productName || payload.product_name,
      price: payload.productPrice || payload.product_price,
      quantity: payload.productQuantity || payload.product_quantity,
      variant: payload.productVariant || payload.product_variant
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
    items
  };
}
var SHOPIFY_SYNC_ERROR_CAP = 5e3;
var shopifySyncState = {
  isRunning: false,
  startedAt: null,
  finishedAt: null,
  syncedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  totalFetched: 0,
  pagesFetched: 0,
  lastSinceId: null,
  errors: [],
  errorsTruncated: false,
  lastError: null,
  reachedMaxPages: false
};
function resetShopifySyncState() {
  shopifySyncState.isRunning = true;
  shopifySyncState.startedAt = (/* @__PURE__ */ new Date()).toISOString();
  shopifySyncState.finishedAt = null;
  shopifySyncState.syncedCount = 0;
  shopifySyncState.skippedCount = 0;
  shopifySyncState.failedCount = 0;
  shopifySyncState.totalFetched = 0;
  shopifySyncState.pagesFetched = 0;
  shopifySyncState.lastSinceId = null;
  shopifySyncState.errors = [];
  shopifySyncState.errorsTruncated = false;
  shopifySyncState.lastError = null;
  shopifySyncState.reachedMaxPages = false;
}
function recordShopifySyncError(orderId, reason) {
  if (shopifySyncState.errors.length < SHOPIFY_SYNC_ERROR_CAP) {
    shopifySyncState.errors.push({ orderId, reason });
  } else {
    shopifySyncState.errorsTruncated = true;
  }
}
function stripPassword(user) {
  if (!user) return user;
  const { password: _password, ...rest } = user;
  return rest;
}
function redactPayrollForAgent(user) {
  if (!user) return user;
  const cleaned = stripPassword(user);
  delete cleaned.baseSalary;
  delete cleaned.compensationProfile;
  delete cleaned.holidayState;
  return cleaned;
}
async function resolveUserScrub(req) {
  const currentUserId = typeof req.query?.currentUserId === "string" ? req.query.currentUserId : typeof req.body?.currentUserId === "string" ? req.body.currentUserId : null;
  if (!currentUserId) {
    return { isAdmin: false, scrub: redactPayrollForAgent };
  }
  const requester = await storage.getUser(currentUserId);
  if (requester && isAdmin(requester)) {
    return { isAdmin: true, scrub: stripPassword };
  }
  return { isAdmin: false, scrub: redactPayrollForAgent };
}
async function registerRoutes(app2) {
  app2.get("/api/health", async (_req, res) => {
    try {
      const r = await db.execute(sql6`SELECT 1 AS ok`);
      const ok = (r.rows ?? r)[0]?.ok === 1;
      res.status(ok ? 200 : 503).json({
        status: ok ? "ok" : "degraded",
        db: ok ? "reachable" : "unexpected-response",
        ts: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      res.status(503).json({
        status: "degraded",
        db: "unreachable",
        error: err?.message ?? String(err),
        ts: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  });
  const ORDER_FULL_READ_ROLES = /* @__PURE__ */ new Set([
    "admin",
    "chat_support"
  ]);
  const hasFullOrderReadAccess = (user) => !!user && typeof user.role === "string" && ORDER_FULL_READ_ROLES.has(user.role);
  async function buildOrderReadScope(requestingUserId, requestedScope, requestedAssignedTo, storeId) {
    if (!requestingUserId) {
      return {
        assignedTo: "__UNAUTHORIZED__",
        storeId,
        isAdmin: false,
        unauthorized: true,
        reason: "currentUserId is required for authorization"
      };
    }
    const user = await storage.getUser(requestingUserId);
    if (!user) {
      return {
        assignedTo: "__UNAUTHORIZED__",
        storeId,
        isAdmin: false,
        unauthorized: true,
        reason: "User not found"
      };
    }
    if (hasFullOrderReadAccess(user)) {
      return {
        assignedTo: requestedAssignedTo,
        storeId,
        isAdmin: user.role === "admin",
        unauthorized: false
      };
    }
    if (requestedScope === "global") {
      return { assignedTo: void 0, storeId, isAdmin: false, unauthorized: false };
    }
    return { assignedTo: requestingUserId, storeId, isAdmin: false, unauthorized: false };
  }
  async function enforceAgentReadFilter(requestingUserId, requestedAssignedTo, storeId) {
    return buildOrderReadScope(requestingUserId, "assigned", requestedAssignedTo, storeId);
  }
  async function canUserAccessOrder(userId, orderId) {
    if (!userId) {
      return { authorized: false, reason: "User ID is required for authorization", isAdmin: false };
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return { authorized: false, reason: "User not found", isAdmin: false };
    }
    if (user.role === "admin") {
      return { authorized: true, isAdmin: true };
    }
    const order = await storage.getOrder(orderId);
    if (!order) {
      return { authorized: false, reason: "Order not found", isAdmin: false };
    }
    if (order.assignedTo !== userId) {
      return { authorized: false, reason: "You are not authorized to access this order", isAdmin: false };
    }
    return { authorized: true, isAdmin: false };
  }
  const canUserModifyOrder = canUserAccessOrder;
  async function canUserReadOrder(userId, orderId, scope, activeStoreId) {
    if (!userId) {
      return { authorized: false, reason: "User ID is required for authorization", isAdmin: false };
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return { authorized: false, reason: "User not found", isAdmin: false };
    }
    const order = await storage.getOrder(orderId);
    if (!order) {
      return { authorized: false, reason: "Order not found", isAdmin: false };
    }
    if (activeStoreId && order.storeId && order.storeId !== activeStoreId) {
      return {
        authorized: false,
        reason: "Order does not belong to the active store",
        isAdmin: user.role === "admin"
      };
    }
    if (hasFullOrderReadAccess(user)) {
      return { authorized: true, isAdmin: user.role === "admin" };
    }
    if (scope === "global") {
      return { authorized: true, isAdmin: false };
    }
    if (order.assignedTo !== userId) {
      return { authorized: false, reason: "You are not authorized to access this order", isAdmin: false };
    }
    return { authorized: true, isAdmin: false };
  }
  app2.post("/api/webhooks/orders/create", handleOrderCreated);
  app2.post("/api/webhooks/orders/update", handleOrderUpdated);
  app2.post("/api/webhooks/orders/cancelled", handleOrderCancelled);
  app2.post("/api/webhooks/fulfillments/update", handleFulfillmentUpdate);
  app2.post("/api/shopify/webhooks/register-all", async (req, res) => {
    try {
      const sessionUserId = req.session?.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const requester = await storage.getUser(sessionUserId);
      if (!requester) {
        req.session.destroy(() => {
        });
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      if (!isAdmin(requester)) {
        return res.status(403).json({ error: "Admin role required to register webhooks." });
      }
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const overrideUrl = typeof req.body?.appUrl === "string" ? req.body.appUrl : void 0;
      const appUrl = overrideUrl || process.env.APP_URL;
      if (!appUrl) {
        return res.status(400).json({
          error: "APP_URL not set",
          hint: "Set APP_URL in your .env (e.g. an ngrok HTTPS URL) or pass { appUrl } in the request body."
        });
      }
      if (!/^https:\/\//i.test(appUrl)) {
        return res.status(400).json({
          error: "APP_URL must be HTTPS",
          received: appUrl,
          hint: "Shopify requires HTTPS for webhook endpoints."
        });
      }
      const { getShopifyClient: getShopifyClient2 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      const client = await getShopifyClient2(scope.storeId);
      const result = await client.registerAllWebhooks(appUrl);
      const failed = result.topics.filter((t) => t.action === "failed");
      res.status(failed.length > 0 ? 207 : 200).json({
        storeId: scope.storeId,
        appUrl,
        topics: result.topics,
        summary: {
          created: result.topics.filter((t) => t.action === "created").length,
          updated: result.topics.filter((t) => t.action === "updated").length,
          unchanged: result.topics.filter((t) => t.action === "unchanged").length,
          failed: failed.length
        }
      });
    } catch (err) {
      console.error("[register-all webhooks] failed:", err);
      res.status(500).json({ error: err?.message ?? "Unknown error" });
    }
  });
  app2.get("/api/shopify/webhooks", async (_req, res) => {
    try {
      const { shopifyClient: shopifyClient3 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      const result = await shopifyClient3.listWebhooks();
      res.json(result);
    } catch (err) {
      console.error("[list webhooks] failed:", err);
      res.status(500).json({ error: err?.message ?? "Unknown error" });
    }
  });
  const { handleShiprocketWebhook: handleShiprocketWebhook2 } = await Promise.resolve().then(() => (init_shiprocketWebhook(), shiprocketWebhook_exports));
  app2.post("/api/webhooks/courier-events", handleShiprocketWebhook2);
  const { handleDelhiveryWebhook: handleDelhiveryWebhook2 } = await Promise.resolve().then(() => (init_delhiveryWebhook(), delhiveryWebhook_exports));
  app2.post("/api/webhooks/delhivery", handleDelhiveryWebhook2);
  app2.post("/api/webhooks/fastrr-abandoned", async (req, res) => {
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
        console.warn("[Fastrr Webhook] Skipped \u2014 no external ID found in payload");
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
        isRecovered: false
      });
      console.log(`[Fastrr Webhook] Saved cart ${checkout.id} for: ${normalized.customerName || normalized.customerPhone || "Unknown"}`);
      res.status(200).json({ success: true, id: checkout.id });
    } catch (error) {
      console.error("[Fastrr Webhook] Processing error:", error);
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });
  app2.get("/api/abandoned-checkouts", async (req, res) => {
    try {
      const checkouts = await storage.getAbandonedCheckouts();
      res.json(checkouts);
    } catch (error) {
      console.error("Error fetching abandoned checkouts:", error);
      res.status(500).json({ error: "Failed to fetch abandoned checkouts" });
    }
  });
  app2.get("/api/orders", async (req, res) => {
    try {
      const { status, paymentMethod, assignedTo, callStatus, agentId, limit, page, search, startDate, endDate, sortOrder, tag, currentUserId, scope } = req.query;
      const parsedLimit = limit ? parseInt(limit) : 50;
      const parsedPage = page ? parseInt(page) : 1;
      const calculatedOffset = (parsedPage - 1) * parsedLimit;
      let parsedStartDate;
      let parsedEndDate;
      if (startDate) {
        const d = new Date(startDate);
        if (!Number.isNaN(d.getTime())) parsedStartDate = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!Number.isNaN(d.getTime())) parsedEndDate = d;
      }
      const activeStoreId = req.storeScope?.storeId;
      const parsedScope = scope === "global" ? "global" : void 0;
      const authResult = await buildOrderReadScope(
        currentUserId,
        parsedScope,
        assignedTo,
        activeStoreId
      );
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }
      const filters = {
        storeId: authResult.storeId,
        // Phase 2: scope reads to the active store
        status,
        paymentMethod,
        assignedTo: authResult.assignedTo,
        // Use enforced value instead of raw request value
        callStatus,
        agentId,
        // 'unassigned' for NULL, or agent UUID
        search,
        // Server-side search across orderId, customerName, phone, email, city
        sortOrder: sortOrder === "asc" ? "asc" : "desc",
        // Default to 'desc' (Newest First)
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        tag,
        // Filter by tag (exact match in tags array)
        limit: parsedLimit,
        offset: calculatedOffset
      };
      const result = await storage.listOrders(filters);
      res.json(result);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });
  app2.get("/api/orders/export", async (req, res) => {
    try {
      const { status, paymentMethod, assignedTo, callStatus, agentId, search, startDate, endDate, tag, currentUserId } = req.query;
      let parsedStartDate;
      let parsedEndDate;
      if (startDate) {
        const d = new Date(startDate);
        if (!Number.isNaN(d.getTime())) parsedStartDate = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!Number.isNaN(d.getTime())) parsedEndDate = d;
      }
      const authResult = await enforceAgentReadFilter(
        currentUserId,
        assignedTo,
        req.storeScope?.storeId
      );
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }
      const filters = {
        storeId: authResult.storeId,
        // Phase 2: scope export to active store
        status,
        paymentMethod,
        assignedTo: authResult.assignedTo,
        // Use enforced value
        callStatus,
        agentId,
        search,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        tag
      };
      const exportData = await storage.exportOrders(filters);
      const headers = [
        "Order ID",
        "Order Date",
        "Order Status",
        "Payment Method",
        "Total Amount",
        "Customer Name",
        "Customer Phone",
        "City",
        "State",
        "Zip Code",
        "Assigned Agent",
        "Assigned Date",
        "Confirmed Date",
        "Call Status",
        "Attempts Count",
        "Tags",
        "Line Items"
      ];
      const formatDate = (date2) => {
        if (!date2) return "";
        const d = new Date(date2);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        return `${year}-${month}-${day} ${hours}:${minutes}`;
      };
      const escapeCSV = (value) => {
        if (value === null || value === void 0) return "";
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      const rows = exportData.map((order) => [
        escapeCSV(order.shopifyOrderNumber),
        formatDate(order.shopifyCreatedAt),
        escapeCSV(order.status),
        escapeCSV(order.paymentMethod),
        order.totalPrice?.toString() || "0",
        escapeCSV(order.customerName),
        escapeCSV(order.customerPhone),
        escapeCSV(order.shippingCity),
        escapeCSV(order.shippingState),
        escapeCSV(order.shippingPincode),
        escapeCSV(order.agentName),
        formatDate(order.assignedAt),
        formatDate(order.confirmedAt),
        escapeCSV(order.callStatus),
        order.followUpAttempts?.toString() || "0",
        escapeCSV(order.tags?.join(", ")),
        escapeCSV(order.lineItems)
      ].join(","));
      const csvContent = [headers.join(","), ...rows].join("\n");
      const now = /* @__PURE__ */ new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const filename = `orders_export_${dateStr}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting orders:", error);
      res.status(500).json({ error: "Failed to export orders" });
    }
  });
  app2.get("/api/orders/ofd", async (req, res) => {
    try {
      const { currentUserId } = req.query;
      const authResult = await enforceAgentReadFilter(
        currentUserId,
        void 0,
        req.storeScope?.storeId
      );
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }
      const agentFilter = authResult.assignedTo ? sql6`AND ${orders.assignedTo} = ${authResult.assignedTo}` : sql6``;
      const storeFilter = authResult.storeId ? sql6`AND ${orders.storeId} = ${authResult.storeId}` : sql6``;
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
        createdAt: orders.createdAt
      }).from(orders).where(
        sql6`(
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
        ${agentFilter}
        ${storeFilter}`
      ).orderBy(desc2(orders.createdAt)).limit(100);
      res.json({ orders: result, total: result.length });
    } catch (error) {
      console.error("Error fetching OFD orders:", error);
      res.status(500).json({ error: error.message || "Failed to fetch OFD orders" });
    }
  });
  app2.get("/api/dashboard/metrics", async (req, res) => {
    try {
      const userId = req.query.userId;
      const { startDate, endDate } = req.query;
      let parsedStartDate;
      let parsedEndDate;
      if (startDate) {
        const d = new Date(startDate);
        if (!Number.isNaN(d.getTime())) parsedStartDate = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!Number.isNaN(d.getTime())) parsedEndDate = d;
      }
      const metrics = await storage.getDashboardMetrics(
        userId,
        parsedStartDate,
        parsedEndDate,
        req.storeScope?.storeId
      );
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({ error: "Failed to fetch dashboard metrics" });
    }
  });
  app2.get("/api/dashboard/hourly-activity", async (req, res) => {
    try {
      const userId = req.query.userId;
      const timezone = req.query.timezone;
      const { startDate, endDate } = req.query;
      let parsedStartDate;
      let parsedEndDate;
      if (startDate) {
        const d = new Date(startDate);
        if (!Number.isNaN(d.getTime())) parsedStartDate = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!Number.isNaN(d.getTime())) parsedEndDate = d;
      }
      const data = await storage.getHourlyActivity(
        userId,
        parsedStartDate,
        parsedEndDate,
        timezone,
        req.storeScope?.storeId
      );
      res.json({ data });
    } catch (error) {
      console.error("Error fetching hourly activity:", error);
      res.status(500).json({ error: "Failed to fetch hourly activity" });
    }
  });
  app2.get("/api/analytics/pare", async (req, res) => {
    try {
      const requesterId = typeof req.query.userId === "string" ? req.query.userId : null;
      if (!requesterId) {
        return res.status(401).json({ error: "Unauthorized: userId query parameter required." });
      }
      const requester = await storage.getUser(requesterId);
      if (!requester) {
        return res.status(401).json({ error: "Unauthorized: user not found." });
      }
      if (!isAdmin(requester)) {
        return res.status(403).json({ error: "Forbidden: admin role required to view Pare." });
      }
      const now = /* @__PURE__ */ new Date();
      let endDate = now;
      let startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3);
      if (typeof req.query.endDate === "string" && req.query.endDate) {
        const parsed = new Date(req.query.endDate);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "Invalid endDate. Expected ISO date string." });
        }
        endDate = parsed;
      }
      if (typeof req.query.startDate === "string" && req.query.startDate) {
        const parsed = new Date(req.query.startDate);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "Invalid startDate. Expected ISO date string." });
        }
        startDate = parsed;
      }
      if (startDate > endDate) {
        return res.status(400).json({ error: "startDate must be on or before endDate." });
      }
      const metrics = await getPareMetrics({
        startDate,
        endDate,
        storeId: req.storeScope?.storeId
      });
      res.json(metrics);
    } catch (error) {
      console.error("Error computing Pare metrics:", error);
      res.status(500).json({ error: "Failed to compute Pare metrics" });
    }
  });
  app2.get("/api/orders/:id", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      const authCheck = await canUserReadOrder(
        currentUserId,
        req.params.id,
        scope,
        req.storeScope?.storeId
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
  app2.get("/api/orders/:id/items", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      const authCheck = await canUserReadOrder(
        currentUserId,
        req.params.id,
        scope,
        req.storeScope?.storeId
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
  app2.get("/api/orders/:id/history", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      const authCheck = await canUserReadOrder(
        currentUserId,
        req.params.id,
        scope,
        req.storeScope?.storeId
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
  app2.get("/api/orders/:id/assignments", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      const authCheck = await canUserReadOrder(
        currentUserId,
        req.params.id,
        scope,
        req.storeScope?.storeId
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
  app2.get("/api/orders/:id/shipment", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      const authCheck = await canUserReadOrder(
        currentUserId,
        req.params.id,
        scope,
        req.storeScope?.storeId
      );
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to access this order" });
      }
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const shipment = await storage.getShipmentByOrderId(req.params.id);
      let ndrEvents2 = [];
      if (shipment) {
        ndrEvents2 = await storage.getNDREventsByShipmentId(shipment.id);
      }
      res.json({ shipment, ndrEvents: ndrEvents2 });
    } catch (error) {
      console.error("Error fetching shipment data:", error);
      res.status(500).json({ error: "Failed to fetch shipment data" });
    }
  });
  app2.get("/api/orders/:id/calls", async (req, res) => {
    try {
      const { currentUserId, scope } = req.query;
      const authCheck = await canUserReadOrder(
        currentUserId,
        req.params.id,
        scope,
        req.storeScope?.storeId
      );
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to access this order" });
      }
      const calls2 = await storage.getCallsWithAgentByOrderId(req.params.id);
      res.json(calls2);
    } catch (error) {
      console.error("Error fetching call history:", error);
      res.status(500).json({ error: "Failed to fetch call history" });
    }
  });
  app2.put("/api/orders/:id/address", async (req, res) => {
    try {
      const orderId = req.params.id;
      const {
        firstName,
        lastName,
        address1,
        address2,
        city,
        province,
        zip,
        country,
        phone,
        email,
        userId
      } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required for authorization" });
      }
      const authCheck = await canUserModifyOrder(userId, orderId);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      try {
        const credentials = await storage.getShopifyCredentials();
        if (credentials) {
          const { decrypt: decrypt2 } = await Promise.resolve().then(() => (init_encryption(), encryption_exports));
          const decryptedClientId = decrypt2(credentials.apiKey);
          const decryptedClientSecret = decrypt2(credentials.apiSecret);
          const { ShopifyClient: ShopifyClient2 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
          const client = new ShopifyClient2({
            storeUrl: credentials.storeUrl,
            apiKey: decryptedClientId,
            apiSecret: decryptedClientSecret,
            useClientCredentials: true
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
            phone
          });
        }
      } catch (shopifyError) {
        console.error("Shopify address update failed:", shopifyError);
        return res.status(400).json({
          error: "Failed to update address in Shopify",
          details: shopifyError.message
        });
      }
      const addressParts = [
        address1,
        address2,
        city,
        province,
        zip,
        country || "India"
      ].filter(Boolean);
      const formattedAddress = addressParts.join(", ");
      const shippingAddressObject = {
        first_name: firstName,
        last_name: lastName,
        address1,
        address2,
        city,
        province,
        zip,
        country: country || "India",
        phone
      };
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
        shippingCountry: country || "India"
      });
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating shipping address:", error);
      res.status(500).json({ error: "Failed to update shipping address" });
    }
  });
  app2.post("/api/orders/:id/assign", async (req, res) => {
    try {
      const { userId, assignedBy, note } = req.body;
      const isUnassign = userId === null;
      if (!isUnassign && (typeof userId !== "string" || userId.length === 0)) {
        return res.status(400).json({
          error: "userId is required (string to assign, explicit null to unassign)."
        });
      }
      if (!assignedBy) {
        return res.status(400).json({ error: "assignedBy is required" });
      }
      const currentUser = await storage.getUser(assignedBy);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }
      if (!canAssignOrders(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to assign orders" });
      }
      if (isUnassign) {
        const order2 = await storage.assignOrder(req.params.id, null);
        if (!order2) {
          return res.status(404).json({ error: "Order not found" });
        }
        return res.json({ order: order2, action: "unassigned" });
      }
      const order = await storage.assignOrder(req.params.id, userId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      await storage.createOrderAssignment({
        orderId: req.params.id,
        userId,
        assignedBy: assignedBy || null,
        note: note || null,
        storeId: req.storeScope?.storeId ?? void 0
      });
      res.json(order);
    } catch (error) {
      console.error("Error assigning order:", error);
      res.status(500).json({ error: "Failed to assign order" });
    }
  });
  app2.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const { status, changedBy, note } = req.body;
      if (!status) {
        return res.status(400).json({ error: "status is required" });
      }
      if (!changedBy) {
        return res.status(400).json({ error: "changedBy is required for authorization" });
      }
      const authCheck = await canUserModifyOrder(changedBy, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }
      const existingOrder = await storage.getOrder(req.params.id);
      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }
      const order = await storage.updateOrder(req.params.id, { status });
      await storage.createOrderStatus({
        storeId: existingOrder.storeId ?? void 0,
        orderId: req.params.id,
        status,
        previousStatus: existingOrder.status,
        changedBy: changedBy || null,
        note: note || null
      });
      res.json(order);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ error: "Failed to update order status" });
    }
  });
  app2.patch("/api/orders/:id", async (req, res) => {
    try {
      const { tags, callStatus, userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required for authorization" });
      }
      const authCheck = await canUserModifyOrder(userId, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }
      const existingOrder = await storage.getOrder(req.params.id);
      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }
      const updateData = {};
      if (tags !== void 0) updateData.tags = tags;
      if (callStatus !== void 0) updateData.callStatus = callStatus;
      const order = await storage.updateOrder(req.params.id, updateData);
      res.json(order);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ error: "Failed to update order" });
    }
  });
  app2.post("/api/orders/:id/auto-assign", async (req, res) => {
    try {
      const { requestedBy } = req.body;
      if (!requestedBy) {
        return res.status(400).json({ error: "requestedBy is required" });
      }
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
  app2.post("/api/orders/:id/assign-manual", async (req, res) => {
    try {
      const { agentId, assignedBy, note } = req.body;
      if (!agentId || !assignedBy) {
        return res.status(400).json({ error: "agentId and assignedBy are required" });
      }
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
        note,
        req.storeScope?.storeId
      );
      const order = await storage.getOrder(req.params.id);
      res.json({ success: true, order });
    } catch (error) {
      console.error("Error manually assigning order:", error);
      res.status(500).json({ error: error.message || "Failed to manually assign order" });
    }
  });
  app2.post("/api/orders/bulk-assign", async (req, res) => {
    try {
      const { orderIds, agentId, assignedBy, note } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds array is required" });
      }
      if (!agentId || !assignedBy) {
        return res.status(400).json({ error: "agentId and assignedBy are required" });
      }
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
          await assignmentEngine.manualAssignOrder(orderId, agentId, assignedBy, note, req.storeScope?.storeId);
          results.push({ orderId, success: true });
        } catch (error) {
          results.push({ orderId, success: false, error: error.message });
        }
      }
      res.json({ results });
    } catch (error) {
      console.error("Error bulk assigning orders:", error);
      res.status(500).json({ error: "Failed to bulk assign orders" });
    }
  });
  app2.get("/api/agents/workload", async (req, res) => {
    try {
      const assignmentEngine = new OrderAssignmentEngine(storage);
      const workloads = await assignmentEngine.getAgentWorkloads();
      res.json(workloads);
    } catch (error) {
      console.error("Error fetching agent workloads:", error);
      res.status(500).json({ error: "Failed to fetch agent workloads" });
    }
  });
  app2.post("/api/orders/:id/confirm", async (req, res) => {
    try {
      const { userId, notes } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const authCheck = await canUserModifyOrder(userId, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }
      const order = await storage.confirmOrder(req.params.id, userId, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      await storage.createOrderStatus({
        storeId: order.storeId ?? void 0,
        orderId: req.params.id,
        status: "confirmed",
        changedBy: userId,
        note: notes || `Order confirmed${notes ? ": " + notes : ""}`
      });
      const { shopifySyncService: shopifySyncService2 } = await Promise.resolve().then(() => (init_shopifySync(), shopifySync_exports));
      shopifySyncService2.syncToShopify(req.params.id, "confirmed", { userId, notes }).catch((err) => console.error("[Shopify Sync] Background sync failed:", err));
      res.json({ success: true, order });
    } catch (error) {
      console.error("Error confirming order:", error);
      res.status(500).json({ error: "Failed to confirm order" });
    }
  });
  app2.post("/api/orders/:id/cancel", async (req, res) => {
    try {
      const { userId, reason, notes } = req.body;
      if (!userId || !reason) {
        return res.status(400).json({ error: "userId and reason are required" });
      }
      const authCheck = await canUserModifyOrder(userId, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }
      const existingOrder = await storage.getOrder(req.params.id);
      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (!existingOrder.shopifyOrderId) {
        return res.status(400).json({ error: "Order has no Shopify ID" });
      }
      try {
        const { getShopifyClient: getShopifyClient2, getLegacyStoreShopifyClient: getLegacyStoreShopifyClient2 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
        const client = existingOrder.storeId ? await getShopifyClient2(existingOrder.storeId) : await getLegacyStoreShopifyClient2();
        await client.cancelOrder(
          existingOrder.shopifyOrderId,
          reason,
          true,
          // notifyCustomer
          true
          // restock
        );
      } catch (shopifyError) {
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
        console.error("Shopify cancellation error:", shopifyError);
        return res.status(400).json({ error: `Shopify error: ${errorMessage}` });
      }
      const order = await storage.cancelOrder(req.params.id, userId, reason, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      await storage.createOrderStatus({
        storeId: order.storeId ?? void 0,
        orderId: req.params.id,
        status: "cancelled",
        changedBy: userId,
        note: `Order cancelled: ${reason}${notes ? " - " + notes : ""}`
      });
      const { shopifySyncService: shopifySyncService2 } = await Promise.resolve().then(() => (init_shopifySync(), shopifySync_exports));
      shopifySyncService2.syncToShopify(req.params.id, "cancelled", { userId, reason, notes }).catch((err) => console.error("[Shopify Sync] Background sync failed:", err));
      res.json({ success: true, order });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ error: "Failed to cancel order" });
    }
  });
  app2.post("/api/orders/:id/followup", async (req, res) => {
    try {
      const { userId, followupAt, notes } = req.body;
      if (!userId || !followupAt) {
        return res.status(400).json({ error: "userId and followupAt are required" });
      }
      const authCheck = await canUserModifyOrder(userId, req.params.id);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }
      const followupDate = new Date(followupAt);
      const order = await storage.scheduleFollowup(req.params.id, userId, followupDate, notes);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      await storage.createOrderStatus({
        storeId: order.storeId ?? void 0,
        orderId: req.params.id,
        status: "followup_scheduled",
        changedBy: userId,
        note: `Follow-up scheduled for ${followupDate.toLocaleString()}${notes ? ": " + notes : ""}`
      });
      const { shopifySyncService: shopifySyncService2 } = await Promise.resolve().then(() => (init_shopifySync(), shopifySync_exports));
      shopifySyncService2.syncToShopify(req.params.id, "followup", { userId, followupDate, notes }).catch((err) => console.error("[Shopify Sync] Background sync failed:", err));
      res.json({ success: true, order });
    } catch (error) {
      console.error("Error scheduling follow-up:", error);
      res.status(500).json({ error: "Failed to schedule follow-up" });
    }
  });
  app2.get("/api/shopify/sync/status", (_req, res) => {
    res.json(shopifySyncState);
  });
  app2.post("/api/meta/sync", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const { syncMetaInsights: syncMetaInsights2 } = await Promise.resolve().then(() => (init_meta(), meta_exports));
      let startDate;
      let endDate;
      if (req.body?.startDate && req.body?.endDate) {
        startDate = String(req.body.startDate);
        endDate = String(req.body.endDate);
      } else {
        const days = Math.max(1, Math.min(Number(req.body?.days) || 30, 365));
        const end = /* @__PURE__ */ new Date();
        const start = new Date(end.getTime() - (days - 1) * 864e5);
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
      }
      const result = await syncMetaInsights2(storeId, startDate, endDate);
      res.json(result);
    } catch (err) {
      console.error("Error syncing Meta insights:", err);
      res.status(500).json({ error: err?.message || "Failed to sync Meta insights" });
    }
  });
  app2.get("/api/meta/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [store] = await db.select({
        metaAccessToken: stores.metaAccessToken,
        metaAdAccountsConfig: stores.metaAdAccountsConfig
      }).from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!store) {
        return res.status(404).json({ error: "Store not found." });
      }
      res.json({
        hasToken: !!store.metaAccessToken,
        adAccountsConfig: store.metaAdAccountsConfig ?? []
      });
    } catch (err) {
      console.error("Error in GET /api/meta/config:", err);
      res.status(500).json({ error: err?.message || "Failed to load Meta config" });
    }
  });
  app2.put("/api/meta/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [existing] = await db.select().from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Store not found." });
      }
      const patch = {};
      const { accessToken, adAccountsConfig } = req.body ?? {};
      if (typeof accessToken === "string" && accessToken.trim().length > 0) {
        patch.metaAccessToken = encrypt(accessToken.trim());
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "adAccountsConfig")) {
        if (!Array.isArray(adAccountsConfig)) {
          return res.status(400).json({ error: "adAccountsConfig must be an array." });
        }
        for (const entry of adAccountsConfig) {
          if (!entry || typeof entry !== "object" || typeof entry.adAccountId !== "string" || !Array.isArray(entry.linkedCampaignIds) || typeof entry.syncAll !== "boolean") {
            return res.status(400).json({
              error: "Each adAccountsConfig entry needs { adAccountId, linkedCampaignIds[], syncAll }."
            });
          }
        }
        patch.metaAdAccountsConfig = adAccountsConfig;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nothing to update. Provide accessToken and/or adAccountsConfig." });
      }
      patch.updatedAt = /* @__PURE__ */ new Date();
      await db.update(stores).set(patch).where(eq7(stores.id, storeId));
      const [updated] = await db.select({
        metaAccessToken: stores.metaAccessToken,
        metaAdAccountsConfig: stores.metaAdAccountsConfig
      }).from(stores).where(eq7(stores.id, storeId)).limit(1);
      res.json({
        hasToken: !!updated?.metaAccessToken,
        adAccountsConfig: updated?.metaAdAccountsConfig ?? []
      });
    } catch (err) {
      console.error("Error in PUT /api/meta/config:", err);
      res.status(500).json({ error: err?.message || "Failed to update Meta config" });
    }
  });
  app2.get("/api/delhivery/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [row] = await db.select({
        delhiveryApiToken: stores.delhiveryApiToken,
        delhiveryClientName: stores.delhiveryClientName
      }).from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!row) {
        return res.status(404).json({ error: "Store not found" });
      }
      res.json({
        hasToken: !!row.delhiveryApiToken,
        clientName: row.delhiveryClientName ?? null
      });
    } catch (err) {
      console.error("Error in GET /api/delhivery/config:", err);
      res.status(500).json({ error: err?.message || "Failed to read Delhivery config" });
    }
  });
  app2.put("/api/delhivery/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [existing] = await db.select().from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Store not found." });
      }
      const patch = {};
      const { apiToken, clientName } = req.body ?? {};
      if (typeof apiToken === "string" && apiToken.trim().length > 0) {
        patch.delhiveryApiToken = encrypt(apiToken.trim());
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "clientName")) {
        patch.delhiveryClientName = typeof clientName === "string" && clientName.trim().length > 0 ? clientName.trim() : null;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nothing to update. Provide apiToken and/or clientName." });
      }
      patch.updatedAt = /* @__PURE__ */ new Date();
      await db.update(stores).set(patch).where(eq7(stores.id, storeId));
      const { invalidateDelhiveryClient: invalidateDelhiveryClient2 } = await Promise.resolve().then(() => (init_delhivery2(), delhivery_exports));
      invalidateDelhiveryClient2(storeId);
      const [updated] = await db.select({
        delhiveryApiToken: stores.delhiveryApiToken,
        delhiveryClientName: stores.delhiveryClientName
      }).from(stores).where(eq7(stores.id, storeId)).limit(1);
      res.json({
        hasToken: !!updated?.delhiveryApiToken,
        clientName: updated?.delhiveryClientName ?? null
      });
    } catch (err) {
      console.error("Error in PUT /api/delhivery/config:", err);
      res.status(500).json({ error: err?.message || "Failed to update Delhivery config" });
    }
  });
  app2.get("/api/delhivery/shipments/:awb/label", async (req, res) => {
    try {
      const { awb } = req.params;
      const shipment = await storage.getShipmentByAWB(awb);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (!shipment.storeId) {
        return res.status(400).json({ error: "Shipment is missing store context" });
      }
      const { getDelhiveryClient: getDelhiveryClient2 } = await Promise.resolve().then(() => (init_delhivery2(), delhivery_exports));
      let client;
      try {
        client = await getDelhiveryClient2(shipment.storeId);
      } catch (e) {
        return res.status(400).json({ error: e?.message || "Delhivery not configured for this store" });
      }
      const result = await client.getShippingLabel(awb);
      if (!result.success || !result.labelUrl) {
        return res.status(502).json({ error: result.error || "Label not available" });
      }
      await storage.updateShipment(shipment.id, { shippingLabelUrl: result.labelUrl });
      res.json({ success: true, labelUrl: result.labelUrl });
    } catch (err) {
      console.error("Error fetching Delhivery label:", err);
      res.status(500).json({ error: err?.message || "Failed to fetch shipping label" });
    }
  });
  app2.get("/api/resend/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [row] = await db.select({
        resendApiKey: stores.resendApiKey,
        resendFromEmail: stores.resendFromEmail
      }).from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!row) {
        return res.status(404).json({ error: "Store not found" });
      }
      res.json({
        hasToken: !!row.resendApiKey,
        fromEmail: row.resendFromEmail ?? null
      });
    } catch (err) {
      console.error("Error in GET /api/resend/config:", err);
      res.status(500).json({ error: err?.message || "Failed to read Resend config" });
    }
  });
  app2.put("/api/resend/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [existing] = await db.select().from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Store not found." });
      }
      const patch = {};
      const { apiKey, fromEmail } = req.body ?? {};
      if (typeof apiKey === "string" && apiKey.trim().length > 0) {
        patch.resendApiKey = encrypt(apiKey.trim());
      }
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "fromEmail")) {
        patch.resendFromEmail = typeof fromEmail === "string" && fromEmail.trim().length > 0 ? fromEmail.trim() : null;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nothing to update. Provide apiKey and/or fromEmail." });
      }
      patch.updatedAt = /* @__PURE__ */ new Date();
      await db.update(stores).set(patch).where(eq7(stores.id, storeId));
      const [updated] = await db.select({
        resendApiKey: stores.resendApiKey,
        resendFromEmail: stores.resendFromEmail
      }).from(stores).where(eq7(stores.id, storeId)).limit(1);
      res.json({
        hasToken: !!updated?.resendApiKey,
        fromEmail: updated?.resendFromEmail ?? null
      });
    } catch (err) {
      console.error("Error in PUT /api/resend/config:", err);
      res.status(500).json({ error: err?.message || "Failed to update Resend config" });
    }
  });
  app2.get("/api/meta/ad-accounts", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [store] = await db.select({ metaAccessToken: stores.metaAccessToken }).from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!store) {
        return res.status(404).json({ error: "Store not found." });
      }
      if (!store.metaAccessToken) {
        return res.status(400).json({ error: "No Meta access token configured for this store." });
      }
      const token = decrypt(store.metaAccessToken);
      const url = "https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status,currency,business_name&limit=200";
      const response = await axios3.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });
      if (response.status >= 400) {
        const upstream = response.data?.error?.message || `Meta API error (status ${response.status})`;
        return res.status(502).json({ error: upstream });
      }
      res.json({ adAccounts: response.data?.data ?? [] });
    } catch (err) {
      console.error("Error in GET /api/meta/ad-accounts:", err);
      res.status(502).json({ error: err?.message || "Failed to fetch ad accounts" });
    }
  });
  app2.get("/api/meta/campaigns", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const adAccountId = String(req.query.adAccountId ?? "").trim();
      if (!adAccountId) {
        return res.status(400).json({ error: "adAccountId query param is required." });
      }
      const [store] = await db.select({ metaAccessToken: stores.metaAccessToken }).from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!store) {
        return res.status(404).json({ error: "Store not found." });
      }
      if (!store.metaAccessToken) {
        return res.status(400).json({ error: "No Meta access token configured for this store." });
      }
      const token = decrypt(store.metaAccessToken);
      const MAX_CAMPAIGNS = 1e3;
      const campaigns = [];
      let nextUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(adAccountId)}/campaigns?fields=id,name,status,objective,effective_status&limit=500`;
      while (nextUrl && campaigns.length < MAX_CAMPAIGNS) {
        const response = await axios3.get(nextUrl, {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true
        });
        if (response.status >= 400) {
          const upstream = response.data?.error?.message || `Meta API error (status ${response.status})`;
          return res.status(502).json({ error: upstream });
        }
        const batch = response.data?.data ?? [];
        for (const c of batch) {
          if (campaigns.length >= MAX_CAMPAIGNS) break;
          campaigns.push(c);
        }
        nextUrl = response.data?.paging?.next ?? null;
      }
      res.json({ campaigns });
    } catch (err) {
      console.error("Error in GET /api/meta/campaigns:", err);
      res.status(502).json({ error: err?.message || "Failed to fetch campaigns" });
    }
  });
  app2.post("/api/shopify/sync", async (req, res) => {
    if (shopifySyncState.isRunning) {
      return res.status(409).json({
        error: "A Shopify sync is already in progress.",
        state: shopifySyncState
      });
    }
    resetShopifySyncState();
    try {
      const rawLimit = parseInt(String(req.body.limit ?? 250), 10);
      const pageLimit = Math.min(Math.max(isNaN(rawLimit) ? 250 : rawLimit, 1), 250);
      const syncStoreId = req.storeScope?.storeId;
      if (!syncStoreId) {
        return res.status(400).json({
          error: "Active store scope is required to run a historical sync."
        });
      }
      let sinceId;
      if (req.body.sinceId) {
        sinceId = String(req.body.sinceId);
      } else {
        const maxLocal = await storage.getMaxShopifyOrderId(syncStoreId);
        sinceId = maxLocal ?? "0";
      }
      console.log(
        `[shopify-sync] storeId=${syncStoreId} starting with sinceId=${sinceId}`
      );
      const maxPages = typeof req.body.maxPages === "number" ? req.body.maxPages : 500;
      const { getShopifyClient: getShopifyClient2, updateShopifyClient: updateShopifyClient2 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      const client = await getShopifyClient2(syncStoreId);
      void updateShopifyClient2().catch(() => {
      });
      const allProducts = await storage.listProducts();
      const productByVariant = /* @__PURE__ */ new Map();
      const productByProduct = /* @__PURE__ */ new Map();
      for (const p of allProducts) {
        if (p.shopifyVariantId) productByVariant.set(p.shopifyVariantId, p);
        if (p.shopifyProductId) productByProduct.set(p.shopifyProductId, p);
      }
      console.log(
        `[shopify-sync] preloaded ${allProducts.length} products (${productByVariant.size} variants, ${productByProduct.size} parents)`
      );
      const activeOrderCreatedWebhooks = await db.select().from(webhooks).where(
        and4(eq7(webhooks.eventType, "order.created"), eq7(webhooks.isActive, true))
      );
      const shouldFireWebhooks = activeOrderCreatedWebhooks.length > 0;
      if (!shouldFireWebhooks) {
        console.log(
          `[shopify-sync] no active order.created webhooks \u2014 skipping webhook fan-out`
        );
      }
      let syncedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let totalFetched = 0;
      let pagesFetched = 0;
      let lastSinceId = sinceId;
      const resolveImage = (variantId, productId) => {
        if (variantId != null) {
          const p = productByVariant.get(variantId.toString());
          if (p?.imageUrl) return p.imageUrl;
        }
        if (productId != null) {
          const p = productByProduct.get(productId.toString());
          if (p?.imageUrl) return p.imageUrl;
        }
        return null;
      };
      const buildOrderInsert = (shopifyOrder, customerId) => {
        const fulfillmentTracking = extractFulfillmentTracking(
          shopifyOrder.fulfillments
        );
        return {
          storeId: syncStoreId,
          shopifyOrderId: shopifyOrder.id.toString(),
          shopifyOrderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name,
          customerId,
          customerName: `${shopifyOrder.customer?.first_name || ""} ${shopifyOrder.customer?.last_name || ""}`.trim() || shopifyOrder.billing_address?.name || "Guest",
          customerEmail: shopifyOrder.email || null,
          customerPhone: shopifyOrder.phone || shopifyOrder.shipping_address?.phone || "",
          status: mapShopifyStatus(
            shopifyOrder.financial_status,
            shopifyOrder.fulfillment_status,
            fulfillmentTracking.shipmentStatus,
            shopifyOrder.cancelled_at || null
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
          itemsSummary: shopifyOrder.line_items?.map((item) => item.name).join(", ") || null,
          assignedTo: null,
          assignedAt: null,
          shipmentStatus: fulfillmentTracking.shipmentStatus,
          trackingNumber: fulfillmentTracking.trackingNumber,
          trackingUrl: fulfillmentTracking.trackingUrl,
          courierName: fulfillmentTracking.trackingCompany,
          // Shopify's `test` boolean marks orders created in test mode
          // (Bogus Gateway, manual test orders). Pare's Phase 1 filters
          // these out to match Shopify's own sales reports.
          testOrder: shopifyOrder.test === true,
          rawShopifyData: shopifyOrder,
          shopifyCreatedAt: new Date(shopifyOrder.created_at),
          shopifyUpdatedAt: new Date(shopifyOrder.updated_at),
          // processed_at is the financial timestamp Shopify's own sales
          // reports bucket on. Fall back to created_at if absent so the
          // column never has a NULL.
          processedAt: shopifyOrder.processed_at ?? shopifyOrder.created_at
        };
      };
      while (pagesFetched < maxPages) {
        const response = await client.fetchOrders({
          status: "any",
          limit: pageLimit,
          sinceId
        });
        const orders2 = response.orders || [];
        pagesFetched++;
        totalFetched += orders2.length;
        shopifySyncState.pagesFetched = pagesFetched;
        shopifySyncState.totalFetched = totalFetched;
        console.log(
          `[shopify-sync] page ${pagesFetched}: fetched ${orders2.length} orders (sinceId=${sinceId})`
        );
        if (orders2.length === 0) break;
        const pageShopifyIds = orders2.map((o) => o.id.toString());
        const alreadyImported = await storage.getExistingShopifyOrderIds(pageShopifyIds, syncStoreId);
        const newOrders = orders2.filter(
          (o) => !alreadyImported.has(o.id.toString())
        );
        skippedCount += orders2.length - newOrders.length;
        shopifySyncState.skippedCount = skippedCount;
        if (newOrders.length > 0) {
          let batchSucceeded = false;
          try {
            const uniqueShopifyCustomerIds = Array.from(
              new Set(
                newOrders.filter((o) => o.customer?.id).map((o) => o.customer.id.toString())
              )
            );
            const existingCustomers = await storage.getCustomersByShopifyIds(uniqueShopifyCustomerIds, syncStoreId);
            const customerByShopifyId = new Map(
              existingCustomers.map((c) => [c.shopifyCustomerId, c])
            );
            const customersToInsert = [];
            const seenCustomer = /* @__PURE__ */ new Set();
            for (const o of newOrders) {
              const sid = o.customer?.id?.toString();
              if (!sid) continue;
              if (seenCustomer.has(sid) || customerByShopifyId.has(sid)) continue;
              seenCustomer.add(sid);
              customersToInsert.push({
                // Stamp storeId on every bulk-inserted row so the
                // composite UNIQUE (storeId, shopifyCustomerId)
                // namespaces correctly and downstream tenant reads
                // see the customer under the right scope.
                storeId: syncStoreId,
                shopifyCustomerId: sid,
                email: o.customer.email || o.email || null,
                firstName: o.customer.first_name || null,
                lastName: o.customer.last_name || null,
                phone: o.customer.phone || o.phone || null
              });
            }
            if (customersToInsert.length > 0) {
              const inserted = await storage.createCustomersBatch(customersToInsert);
              for (const c of inserted) {
                if (c.shopifyCustomerId)
                  customerByShopifyId.set(c.shopifyCustomerId, c);
              }
            }
            const orderInserts = newOrders.map((o) => {
              const sid = o.customer?.id?.toString();
              const customerId = sid ? customerByShopifyId.get(sid)?.id ?? null : null;
              return buildOrderInsert(o, customerId);
            });
            const insertedOrders = await storage.createOrdersBatch(orderInserts);
            const orderIdByShopifyId = new Map(
              insertedOrders.map((o) => [o.shopifyOrderId, o])
            );
            const orderItemInserts = [];
            for (const o of newOrders) {
              const dbOrder = orderIdByShopifyId.get(o.id.toString());
              if (!dbOrder) continue;
              for (const item of o.line_items || []) {
                orderItemInserts.push({
                  // Denormalised storeId on order_items keeps catalog
                  // and analytics queries from having to join orders
                  // just to filter by tenant.
                  storeId: syncStoreId,
                  orderId: dbOrder.id,
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
                  imageUrl: resolveImage(item.variant_id, item.product_id)
                });
              }
            }
            if (orderItemInserts.length > 0) {
              await storage.createOrderItems(orderItemInserts);
            }
            const statusInserts = insertedOrders.map((o) => ({
              storeId: syncStoreId,
              orderId: o.id,
              status: o.status,
              previousStatus: null,
              changedBy: null,
              note: "Imported from Shopify"
            }));
            if (statusInserts.length > 0) {
              await storage.createOrderStatusBatch(statusInserts);
            }
            if (shouldFireWebhooks) {
              for (const o of insertedOrders) {
                triggerWebhooks("order.created", {
                  order: o,
                  shopifyOrderId: o.shopifyOrderId,
                  assignedAgentEmail: null
                });
              }
            }
            syncedCount += insertedOrders.length;
            shopifySyncState.syncedCount = syncedCount;
            batchSucceeded = true;
            console.log(
              `[shopify-sync] page ${pagesFetched}: batch-inserted ${insertedOrders.length} orders (skipped ${orders2.length - newOrders.length})`
            );
          } catch (batchErr) {
            const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
            console.warn(
              `[shopify-sync] page ${pagesFetched} batch path failed (${msg}); falling back to per-order sequential insert`
            );
          }
          if (!batchSucceeded) {
            for (const shopifyOrder of newOrders) {
              try {
                let customer;
                if (shopifyOrder.customer) {
                  const existingCustomer = await storage.getCustomerByShopifyId(
                    shopifyOrder.customer.id.toString(),
                    syncStoreId
                  );
                  const customerData = {
                    // Per-order fallback path needs the same storeId
                    // stamping as the bulk path above — without it
                    // the customer row would land with storeId=NULL
                    // and never appear in any tenant's dashboard.
                    storeId: syncStoreId,
                    shopifyCustomerId: shopifyOrder.customer.id.toString(),
                    email: shopifyOrder.customer.email || shopifyOrder.email || null,
                    firstName: shopifyOrder.customer.first_name || null,
                    lastName: shopifyOrder.customer.last_name || null,
                    phone: shopifyOrder.customer.phone || shopifyOrder.phone || null
                  };
                  customer = existingCustomer ? await storage.updateCustomer(
                    existingCustomer.id,
                    customerData
                  ) : await storage.createCustomer(customerData);
                }
                const orderData = buildOrderInsert(
                  shopifyOrder,
                  customer?.id || null
                );
                const order = await storage.createOrder(orderData);
                if (shopifyOrder.line_items?.length > 0) {
                  const items = shopifyOrder.line_items.map((item) => ({
                    storeId: syncStoreId,
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
                    imageUrl: resolveImage(item.variant_id, item.product_id)
                  }));
                  await storage.createOrderItems(items);
                }
                await storage.createOrderStatus({
                  storeId: syncStoreId,
                  orderId: order.id,
                  status: orderData.status,
                  previousStatus: null,
                  changedBy: null,
                  note: "Imported from Shopify"
                });
                if (shouldFireWebhooks) {
                  triggerWebhooks("order.created", {
                    order,
                    shopifyOrderId: shopifyOrder.id,
                    assignedAgentEmail: null
                  });
                }
                syncedCount++;
                shopifySyncState.syncedCount = syncedCount;
              } catch (err) {
                const orderId = String(shopifyOrder?.id ?? "<unknown>");
                const orderName = shopifyOrder?.name ?? "";
                const message = err instanceof Error ? err.message : String(err);
                console.warn(
                  `[shopify-sync] failed to import order ${orderId} ${orderName}: ${message}`
                );
                failedCount++;
                shopifySyncState.failedCount = failedCount;
                recordShopifySyncError(
                  orderName ? `${orderId} (${orderName})` : orderId,
                  message
                );
              }
            }
          }
        }
        const lastOrder = orders2[orders2.length - 1];
        sinceId = lastOrder.id.toString();
        lastSinceId = sinceId;
        shopifySyncState.lastSinceId = lastSinceId;
        if (orders2.length < pageLimit) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      shopifySyncState.reachedMaxPages = pagesFetched >= maxPages;
      res.json({
        message: "Sync completed",
        syncedCount,
        skippedCount,
        failedCount,
        totalFetched,
        pagesFetched,
        lastSinceId,
        reachedMaxPages: pagesFetched >= maxPages
      });
    } catch (error) {
      console.error("Error syncing orders:", error);
      shopifySyncState.lastError = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to sync orders" });
    } finally {
      shopifySyncState.isRunning = false;
      shopifySyncState.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
  });
  app2.get("/api/shopify/credentials/status", async (req, res) => {
    try {
      const credentials = await storage.getShopifyCredentials();
      if (!credentials) {
        return res.json({
          configured: false,
          storeUrl: null,
          storeName: null,
          lastTested: null,
          testStatus: null
        });
      }
      const storeName = credentials.storeName || credentials.storeUrl.split(".")[0] || null;
      res.json({
        configured: true,
        storeUrl: credentials.storeUrl,
        storeName,
        lastTested: credentials.lastTestedAt,
        testStatus: credentials.testStatus,
        testMessage: credentials.testMessage
      });
    } catch (error) {
      console.error("Error getting credentials status:", error);
      res.status(500).json({ error: "Failed to get credentials status" });
    }
  });
  app2.post("/api/shopify/credentials", async (req, res) => {
    console.log("\n=== CREDENTIAL SAVE REQUEST STARTED ===");
    console.log("Timestamp:", (/* @__PURE__ */ new Date()).toISOString());
    try {
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
      console.log("Step 1: Received request body fields:", Object.keys(req.body));
      console.log("Shop Domain:", req.body.storeUrl);
      console.log("Client ID length:", req.body.apiKey?.length || 0);
      console.log("Client Secret length:", req.body.apiSecret?.length || 0);
      console.log("Webhook Secret provided:", !!req.body.webhookSecret);
      console.log("\nStep 2: Starting validation...");
      const validatedData = insertShopifyCredentialsSchema.parse(req.body);
      console.log("\u2713 Validation successful");
      console.log("\nStep 3: Testing connection via Client Credentials Grant...");
      const { ShopifyClient: TempClient } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      const tempClient = new TempClient({
        storeUrl: validatedData.storeUrl,
        apiKey: validatedData.apiKey,
        apiSecret: validatedData.apiSecret,
        useClientCredentials: true
      });
      let shopInfo = null;
      let testPassed = false;
      let testErrorMessage = "";
      try {
        shopInfo = await tempClient.getShopInfo();
        testPassed = true;
        console.log("\u2713 Connection test passed. Shop:", shopInfo?.name);
      } catch (testErr) {
        testErrorMessage = testErr.message || "Connection test failed";
        console.log("\u26A0 Connection test failed:", testErrorMessage);
      }
      console.log("\nStep 4: Starting encryption...");
      const encryptedApiKey = encrypt(validatedData.apiKey);
      const encryptedApiSecret = encrypt(validatedData.apiSecret);
      console.log("\u2713 Encryption complete");
      const encryptedCredentials = {
        storeName: testPassed && shopInfo?.name ? shopInfo.name : void 0,
        storeUrl: validatedData.storeUrl,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        webhookSecret: validatedData.webhookSecret ? encrypt(validatedData.webhookSecret) : void 0,
        isActive: true
      };
      console.log("\nStep 5: Saving to database...");
      const savedCredentials = await storage.saveShopifyCredentials(encryptedCredentials);
      console.log("\u2713 Database save successful, ID:", savedCredentials.id);
      await storage.updateCredentialTestStatus(
        savedCredentials.id,
        testPassed ? "success" : "failed",
        testPassed ? `Connected to ${shopInfo?.name || savedCredentials.storeUrl}` : testErrorMessage
      );
      const { updateShopifyClient: updateShopifyClient2 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      await updateShopifyClient2();
      if (testPassed) {
        console.log("\n=== SUCCESS: Sending 200 response ===\n");
        res.json({
          success: true,
          message: "Credentials saved and tested successfully",
          storeUrl: savedCredentials.storeUrl,
          shopName: shopInfo?.name
        });
      } else {
        console.log("\n=== PARTIAL SUCCESS: Saved but test failed ===\n");
        res.json({
          success: true,
          message: "Credentials saved but connection test failed",
          storeUrl: savedCredentials.storeUrl,
          testError: testErrorMessage
        });
      }
    } catch (error) {
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
  app2.post("/api/shopify/credentials/test", async (req, res) => {
    try {
      const credentials = await storage.getShopifyCredentials();
      if (!credentials) {
        return res.status(404).json({ error: "No credentials found" });
      }
      const decryptedKey = decrypt(credentials.apiKey);
      const decryptedSecret = decrypt(credentials.apiSecret);
      const { ShopifyClient: TestClient } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      const testClient = new TestClient({
        storeUrl: credentials.storeUrl,
        apiKey: decryptedKey,
        apiSecret: decryptedSecret,
        useClientCredentials: true
      });
      const shopInfo = await testClient.getShopInfo();
      await storage.updateCredentialTestStatus(
        credentials.id,
        "success",
        `Connected to ${shopInfo.name || credentials.storeUrl}`
      );
      res.json({
        success: true,
        message: "Connection successful",
        shopName: shopInfo.name,
        shopDomain: shopInfo.domain,
        storeUrl: credentials.storeUrl
      });
    } catch (error) {
      console.error("Connection test failed:", error);
      const credentials = await storage.getShopifyCredentials();
      if (credentials) {
        await storage.updateCredentialTestStatus(
          credentials.id,
          "failed",
          error.message || "Connection test failed"
        );
      }
      res.status(400).json({
        success: false,
        error: error.message || "Connection test failed"
      });
    }
  });
  app2.delete("/api/shopify/credentials", async (req, res) => {
    try {
      const credentials = await storage.getShopifyCredentials();
      if (!credentials) {
        return res.json({ success: true, message: "Credentials already cleared" });
      }
      await storage.deleteShopifyCredentials(credentials.id);
      res.json({ success: true, message: "Credentials deleted successfully" });
    } catch (error) {
      console.error("Error deleting credentials:", error);
      res.status(500).json({ error: "Failed to delete credentials" });
    }
  });
  app2.get("/api/tags", async (req, res) => {
    try {
      const tags = await storage.getDistinctTags();
      res.json({ tags });
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ error: error.message || "Failed to fetch tags" });
    }
  });
  app2.get("/api/orders/payment-methods", async (req, res) => {
    try {
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const methods = await storage.getDistinctPaymentMethods(scope.storeId);
      res.json({ methods });
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: error.message || "Failed to fetch payment methods" });
    }
  });
  app2.get("/api/settings/payments", async (req, res) => {
    try {
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const methods = await storage.getPrepaidPaymentMethods(scope.storeId);
      res.json({ prepaidMethods: methods });
    } catch (error) {
      console.error("Error fetching payment settings:", error);
      res.status(500).json({ error: error.message || "Failed to fetch payment settings" });
    }
  });
  app2.post("/api/settings/payments", async (req, res) => {
    try {
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const { prepaidMethods } = req.body;
      if (!Array.isArray(prepaidMethods)) {
        return res.status(400).json({ error: "prepaidMethods must be an array" });
      }
      const setting = await storage.setAppSetting(
        scope.storeId,
        "prepaid_payment_methods",
        prepaidMethods
      );
      res.json({
        success: true,
        prepaidMethods: setting.value,
        message: "Payment settings updated successfully"
      });
    } catch (error) {
      console.error("Error updating payment settings:", error);
      res.status(500).json({ error: error.message || "Failed to update payment settings" });
    }
  });
  app2.post("/api/admin/sync-products", async (req, res) => {
    const syncStoreId = req.storeScope?.storeId;
    if (!syncStoreId) {
      return res.status(400).json({
        error: "Active store scope is required to sync products."
      });
    }
    try {
      const { getShopifyClient: getShopifyClient2 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      const client = await getShopifyClient2(syncStoreId);
      console.log(`[product-sync] storeId=${syncStoreId} starting`);
      const shopifyProducts = await client.fetchAllProducts();
      console.log(
        `[product-sync] storeId=${syncStoreId} fetched ${shopifyProducts.length} products`
      );
      let syncedCount = 0;
      let variantCount = 0;
      for (const product of shopifyProducts) {
        const productImage = product.image?.src || product.images?.[0]?.src || null;
        for (const variant of product.variants || []) {
          const variantImageId = variant.image_id;
          let variantImage = productImage;
          if (variantImageId && product.images) {
            const matchingImage = product.images.find((img) => img.id === variantImageId);
            if (matchingImage) {
              variantImage = matchingImage.src;
            }
          }
          await storage.upsertProduct({
            storeId: syncStoreId,
            shopifyProductId: String(product.id),
            shopifyVariantId: String(variant.id),
            title: product.title,
            variantTitle: variant.title !== "Default Title" ? variant.title : null,
            sku: variant.sku || null,
            imageUrl: variantImage,
            lastSyncedAt: /* @__PURE__ */ new Date()
          });
          variantCount++;
        }
        const variants = product.variants || [];
        const totalInventory = variants.reduce(
          (sum, v) => sum + (Number(v.inventory_quantity) || 0),
          0
        );
        const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
        const minPrice = prices.length > 0 ? Math.min(...prices).toFixed(2) : null;
        const firstVariant = variants[0];
        const compareAtPrices = variants.map((v) => parseFloat(v.compare_at_price)).filter((p) => !isNaN(p) && p > 0);
        const minCompareAt = compareAtPrices.length > 0 ? Math.min(...compareAtPrices).toFixed(2) : null;
        await storage.upsertCatalogProduct({
          storeId: syncStoreId,
          shopifyProductId: String(product.id),
          title: product.title,
          imageUrl: productImage,
          status: product.status || "active",
          totalInventory,
          price: minPrice,
          compareAtPrice: minCompareAt,
          productType: product.product_type || null,
          vendor: product.vendor || null,
          variantCount: variants.length,
          sku: firstVariant?.sku || null,
          barcode: firstVariant?.barcode || null,
          weight: firstVariant?.weight != null ? String(firstVariant.weight) : null,
          weightUnit: firstVariant?.weight_unit || null,
          lastSyncedAt: /* @__PURE__ */ new Date()
        });
        syncedCount++;
      }
      console.log(
        `[product-sync] storeId=${syncStoreId} done: ${syncedCount} products / ${variantCount} variants`
      );
      res.json({
        success: true,
        message: `Synced ${syncedCount} products with ${variantCount} variants`,
        productsCount: syncedCount,
        variantsCount: variantCount
      });
    } catch (error) {
      const message = error?.message ?? String(error);
      console.error(
        `[product-sync] storeId=${syncStoreId} FAILED: ${message}`
      );
      if (/Payment Required \(402\)/i.test(message) || /\b402\b/.test(message)) {
        return res.status(402).json({
          error: "Shopify subscription paused for this store",
          details: "Shopify returned 402 Payment Required. Reactivate the store's subscription in the Shopify admin and retry."
        });
      }
      res.status(500).json({
        error: "Failed to sync products",
        details: message
      });
    }
  });
  app2.get("/api/products", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Active store scope required" });
      }
      const items = await storage.listCatalogProducts(storeId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching catalog products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });
  app2.patch("/api/products/:id", async (req, res) => {
    try {
      const { cogs, packagingCost, gstRate, hsnCode, dimensionLength, dimensionWidth, dimensionHeight } = req.body;
      const updated = await storage.updateCatalogProductErp(req.params.id, {
        cogs: cogs != null ? String(cogs) : null,
        packagingCost: packagingCost != null ? String(packagingCost) : null,
        gstRate: gstRate != null ? String(gstRate) : null,
        hsnCode: hsnCode ?? null,
        dimensionLength: dimensionLength != null ? String(dimensionLength) : null,
        dimensionWidth: dimensionWidth != null ? String(dimensionWidth) : null,
        dimensionHeight: dimensionHeight != null ? String(dimensionHeight) : null
      });
      if (!updated) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating product ERP data:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });
  app2.get("/api/returns", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Active store scope required" });
      }
      const items = await storage.listReturns(storeId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching returns:", error);
      res.status(500).json({ error: "Failed to fetch returns" });
    }
  });
  app2.patch("/api/returns/:id/status", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Active store scope required" });
      }
      const { status } = req.body ?? {};
      if (!status || !RETURN_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${RETURN_STATUSES.join(", ")}`
        });
      }
      const existing = await storage.getReturn(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Return not found" });
      }
      if (existing.storeId !== storeId) {
        return res.status(403).json({ error: "Return belongs to a different store" });
      }
      const updated = await storage.updateReturnStatus(req.params.id, status);
      res.json(updated);
    } catch (error) {
      console.error("Error updating return status:", error);
      res.status(500).json({ error: "Failed to update return status" });
    }
  });
  app2.get("/api/returns/:id", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Active store scope required" });
      }
      const ret = await storage.getReturn(req.params.id);
      if (!ret) {
        return res.status(404).json({ error: "Return not found" });
      }
      if (ret.storeId !== storeId) {
        return res.status(403).json({ error: "Return belongs to a different store" });
      }
      const order = ret.orderId ? await storage.getOrder(ret.orderId) : void 0;
      const items = ret.orderId ? await storage.getOrderItems(ret.orderId) : [];
      res.json({ return: ret, order: order ?? null, items });
    } catch (error) {
      console.error("Error fetching return detail:", error);
      res.status(500).json({ error: "Failed to fetch return detail" });
    }
  });
  app2.post("/api/returns/:id/approve-pickup", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Active store scope required" });
      }
      const ret = await storage.getReturn(req.params.id);
      if (!ret) {
        return res.status(404).json({ error: "Return not found" });
      }
      if (ret.storeId !== storeId) {
        return res.status(403).json({ error: "Return belongs to a different store" });
      }
      if (ret.status !== "PENDING_APPROVAL" && ret.status !== "PENDING_FEE") {
        return res.status(400).json({
          error: `Return is not in a pending state (current: ${ret.status})`
        });
      }
      if (!ret.orderId) {
        return res.status(400).json({ error: "Return has no linked order to pick up from" });
      }
      const order = await storage.getOrder(ret.orderId);
      if (!order) {
        return res.status(404).json({ error: "Linked order not found" });
      }
      if (!order.shippingAddressLine1 || !order.shippingPincode) {
        return res.status(400).json({
          error: "Order is missing a shipping address; cannot schedule a pickup"
        });
      }
      let delhiveryClient;
      try {
        const { getDelhiveryClient: getDelhiveryClient2 } = await Promise.resolve().then(() => (init_delhivery2(), delhivery_exports));
        delhiveryClient = await getDelhiveryClient2(storeId);
      } catch (e) {
        return res.status(400).json({
          error: e?.message || "Delhivery is not configured for this store"
        });
      }
      const result = await delhiveryClient.createReversePickup({
        rmaNumber: ret.rmaNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        pickupAddressLine1: order.shippingAddressLine1,
        pickupAddressLine2: order.shippingAddressLine2 ?? void 0,
        pickupCity: order.shippingCity ?? "",
        pickupState: order.shippingState ?? "",
        pickupPincode: order.shippingPincode,
        pickupCountry: order.shippingCountry ?? void 0
      });
      if (!result.success || !result.awb) {
        return res.status(502).json({
          error: result.error || "Delhivery did not return a reverse AWB"
        });
      }
      const updated = await storage.updateReturn(ret.id, {
        status: "PICKUP_SCHEDULED",
        trackingAwb: result.awb
      });
      console.log(
        `[returns] storeId=${storeId} RMA=${ret.rmaNumber} reverse pickup scheduled, AWB=${result.awb}`
      );
      res.json({ success: true, awb: result.awb, return: updated });
    } catch (error) {
      console.error("Error scheduling reverse pickup:", error);
      res.status(500).json({ error: error?.message || "Failed to schedule pickup" });
    }
  });
  const allowedOrigins = (process.env.STOREFRONT_DOMAIN ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
  if (allowedOrigins.length === 0) {
    console.warn(
      "[public-cors] STOREFRONT_DOMAIN is not set \u2014 browser calls to /api/public will be blocked by CORS until it is configured."
    );
  }
  app2.use("/api/public", (req, res, next) => {
    const origin = req.headers.origin;
    const allowed = !!origin && allowedOrigins.includes(origin);
    if (allowed) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(allowed ? 204 : 403);
    }
    next();
  });
  app2.post("/api/public/returns/lookup", async (req, res) => {
    try {
      const { orderNumber, customerEmailOrPhone, storeId } = req.body ?? {};
      if (!orderNumber || !customerEmailOrPhone) {
        return res.status(400).json({ error: "orderNumber and customerEmailOrPhone are required" });
      }
      const normalizedNumber = String(orderNumber).trim().replace(/^#/, "");
      const order = await storage.getOrderByShopifyOrderNumber(
        normalizedNumber,
        storeId || void 0
      ) || await storage.getOrderByShopifyOrderNumber(
        `#${normalizedNumber}`,
        storeId || void 0
      );
      const fail = () => res.status(404).json({
        error: "No matching order found. Check the order number and email/phone."
      });
      if (!order) return fail();
      const probe = String(customerEmailOrPhone).trim().toLowerCase();
      const probeDigits = probe.replace(/\D/g, "");
      const emailMatch = !!order.customerEmail && order.customerEmail.toLowerCase() === probe;
      const orderPhoneDigits = (order.customerPhone || "").replace(/\D/g, "");
      const phoneMatch = probeDigits.length >= 6 && orderPhoneDigits.length >= 6 && orderPhoneDigits.slice(-10) === probeDigits.slice(-10);
      if (!emailMatch && !phoneMatch) return fail();
      const items = await storage.getOrderItems(order.id);
      const cleanNumber = order.shopifyOrderNumber ? String(order.shopifyOrderNumber).replace(/^#/, "") : null;
      const itemsMapped = items.map((it) => ({
        // identifiers — `id` mirrors orderItemId so the storefront can send
        // either back to /create (which accepts both).
        id: it.id,
        orderItemId: it.id,
        // title aliases for productName
        title: it.productName,
        name: it.productName,
        productName: it.productName,
        variantTitle: it.variantTitle,
        sku: it.sku,
        quantity: it.quantity,
        price: it.price,
        imageUrl: it.imageUrl,
        image: it.imageUrl
      }));
      const responseOrder = {
        orderId: order.id,
        storeId: order.storeId,
        // order number aliases
        orderNumber: order.shopifyOrderNumber,
        order_number: cleanNumber,
        name: cleanNumber ? `#${cleanNumber}` : null,
        // date aliases (storefront parses created_at)
        orderDate: order.shopifyCreatedAt,
        created_at: order.shopifyCreatedAt,
        customerName: order.customerName,
        totalPrice: order.totalPrice,
        // nested items so `order.items` works on the frontend
        items: itemsMapped
      };
      console.log(
        "Sending lookup response:",
        JSON.stringify(responseOrder, null, 2)
      );
      res.json({ order: responseOrder, items: itemsMapped });
    } catch (error) {
      console.error("Error in public returns lookup:", error);
      res.status(500).json({ error: "Lookup failed" });
    }
  });
  app2.post("/api/public/returns/create", async (req, res) => {
    try {
      const { orderId, items, customerNotes } = req.body ?? {};
      if (!orderId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "orderId and a non-empty items array are required" });
      }
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const storeId = order.storeId;
      if (!storeId) {
        return res.status(404).json({ error: "Order not found" });
      }
      const orderItems2 = await storage.getOrderItems(orderId);
      const itemById = new Map(orderItems2.map((it) => [it.id, it]));
      const catalog = await storage.listCatalogProducts(storeId);
      const freeGiftProductIds = new Set(
        catalog.filter((p) => (p.productType || "").toLowerCase() === "free_gift").map((p) => p.shopifyProductId)
      );
      let refundTotal = 0;
      const reasons = [];
      const returnItemsToInsert = [];
      for (const sel of items) {
        const selId = sel?.orderItemId ?? sel?.id;
        const oi = itemById.get(selId);
        if (!oi) {
          return res.status(400).json({ error: `Item ${selId} is not part of this order` });
        }
        const qty = Math.max(1, Math.min(Number(sel.quantity) || 1, oi.quantity));
        const isFreeGift = !!oi.shopifyProductId && freeGiftProductIds.has(oi.shopifyProductId);
        const lineRefund = isFreeGift ? 0 : (parseFloat(oi.price) || 0) * qty;
        refundTotal += lineRefund;
        if (sel.returnReason) reasons.push(String(sel.returnReason));
        returnItemsToInsert.push({
          returnId: "",
          // overwritten inside createReturnWithItems
          orderItemId: oi.id,
          quantity: qty,
          // First-class per-item reason; `condition` stays null until
          // the item is physically inspected on receipt.
          returnReason: sel.returnReason ? String(sel.returnReason) : null,
          condition: null
        });
      }
      const refundAmount = refundTotal.toFixed(2);
      const orderNum = (order.shopifyOrderNumber || "").replace(/^#/, "") || "ORD";
      const rand = crypto7.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
      const rmaNumber = `RMA-${orderNum}-${rand}`;
      const summaryReason = Array.from(new Set(reasons)).join("; ") || null;
      const created = await storage.createReturnWithItems(
        {
          storeId,
          orderId,
          rmaNumber,
          status: "PENDING_FEE",
          returnReason: summaryReason,
          customerNotes: customerNotes ? String(customerNotes) : null,
          refundAmount
          // refundType defaults to STORE_CREDIT in the schema
        },
        returnItemsToInsert
      );
      let payu = null;
      try {
        const txnid = created.rmaNumber;
        const amount = RETURN_FEE_AMOUNT;
        const productinfo = `Return fee ${created.rmaNumber}`;
        const firstname = (order.customerName || "Customer").split(" ")[0];
        const email = order.customerEmail || "";
        const hash = generatePayuHash(txnid, amount, productinfo, firstname, email);
        payu = {
          key: getPayuKey(),
          txnid,
          amount,
          productinfo,
          firstname,
          email,
          hash
        };
      } catch (e) {
        console.warn(
          `[payu] could not build hash for ${created.rmaNumber}: ${e?.message}`
        );
      }
      res.status(201).json({
        rmaNumber: created.rmaNumber,
        refundAmount,
        status: created.status,
        payu
      });
    } catch (error) {
      console.error("Error in public returns create:", error);
      res.status(500).json({ error: "Failed to create return" });
    }
  });
  app2.post(
    "/api/public/webhooks/payu",
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const payload = req.body ?? {};
        const { txnid, status, mihpayid } = payload;
        if (!verifyPayuHash(payload)) {
          console.warn(
            `[payu-webhook] invalid hash for txnid=${txnid ?? "?"}`
          );
          return res.status(200).json({ received: true, verified: false });
        }
        if (status !== "success") {
          console.log(
            `[payu-webhook] txnid=${txnid} status=${status} \u2014 no state change`
          );
          return res.status(200).json({ received: true, verified: true });
        }
        const ret = await storage.getReturnByRmaNumber(String(txnid));
        if (!ret) {
          console.warn(`[payu-webhook] no return for txnid=${txnid}`);
          return res.status(200).json({ received: true, found: false });
        }
        if (ret.status === "PENDING_FEE") {
          await storage.updateReturn(ret.id, {
            status: "PENDING_APPROVAL",
            returnFeePaid: true,
            payuTransactionId: mihpayid ? String(mihpayid) : null
          });
          console.log(
            `[payu-webhook] RMA ${ret.rmaNumber} fee paid (mihpayid=${mihpayid}); \u2192 PENDING_APPROVAL`
          );
        }
        res.status(200).json({ received: true, verified: true });
      } catch (error) {
        console.error("Error in PayU webhook:", error);
        res.status(200).json({ received: true });
      }
    }
  );
  app2.post("/api/admin/backfill-order-item-images", async (req, res) => {
    try {
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const result = await storage.backfillOrderItemImages(scope.storeId);
      console.log(
        `[image-backfill] storeId=${scope.storeId} updated=${result.updated} missingInCatalog=${result.missingVariantsInCatalog}`
      );
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error backfilling order-item images:", error);
      res.status(500).json({
        error: "Failed to backfill images",
        details: error?.message
      });
    }
  });
  app2.get("/api/admin/products/status", async (req, res) => {
    try {
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const count2 = await storage.getProductCount(scope.storeId);
      const lastSync = await storage.getLastProductSync(scope.storeId);
      res.json({
        productCount: count2,
        lastSyncedAt: lastSync
      });
    } catch (error) {
      console.error("Error getting product status:", error);
      res.status(500).json({ error: "Failed to get product status" });
    }
  });
  app2.get("/api/products/variant/:variantId", async (req, res) => {
    try {
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const product = await storage.getProductByVariantId(
        req.params.variantId,
        scope.storeId
      );
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });
  app2.get("/api/users/by-email/:email", async (req, res) => {
    try {
      const user = await storage.getUserByEmail(req.params.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
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
        avatarImage: user.avatarImage
      });
    } catch (error) {
      console.error("Error fetching user by email:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });
  app2.get("/api/users", async (req, res) => {
    try {
      const { role, isActive } = req.query;
      const filters = {
        role,
        isActive: isActive === "true" ? true : isActive === "false" ? false : void 0
      };
      const users2 = await storage.listUsers(filters);
      const { scrub } = await resolveUserScrub(req);
      res.json(users2.map(scrub));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  app2.get("/api/users/agents", async (req, res) => {
    try {
      const agents = await storage.listUsers({ role: "agent", isActive: true });
      res.json(agents.map((agent) => ({
        id: agent.id,
        fullName: agent.fullName,
        email: agent.email
      })));
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ error: "Failed to fetch agents" });
    }
  });
  app2.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { isAdmin: requesterIsAdmin, scrub } = await resolveUserScrub(req);
      const isSelf = typeof req.query.currentUserId === "string" && req.query.currentUserId === req.params.id;
      const finalScrub = requesterIsAdmin || isSelf ? stripPassword : scrub;
      res.json(finalScrub(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required." });
      }
      const user = await storage.getUserByEmail(email);
      const TIMING_DECOY = "$2b$12$0000000000000000000000000000000000000000000000000000Q";
      if (!user) {
        await verifyPassword(password, TIMING_DECOY);
        return res.status(401).json({ error: "Invalid email or password." });
      }
      const { ok, needsRehash } = await verifyPassword(password, user.password);
      if (!ok) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      if (!user.isActive) {
        return res.status(403).json({ error: "This account has been deactivated. Contact your admin." });
      }
      if (needsRehash) {
        hashPassword(password).then((hashed) => storage.setUserPassword(user.id, hashed)).catch((err) => console.warn(`[auth] background rehash failed for ${email}: ${err?.message}`));
      }
      req.session.userId = user.id;
      await new Promise(
        (resolve, reject) => req.session.save((err) => err ? reject(err) : resolve())
      );
      const { password: _pw, ...safe } = user;
      res.json(safe);
    } catch (error) {
      console.error("Error in /api/auth/login:", error);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });
  app2.get("/api/stores/me", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        req.session.destroy(() => {
        });
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      const projection = {
        id: stores.id,
        storeName: stores.storeName,
        storeUrl: stores.storeUrl,
        logoUrl: stores.logoUrl,
        isActive: stores.isActive,
        createdAt: stores.createdAt
      };
      let rows;
      if (isAdmin(user)) {
        rows = await db.select(projection).from(stores).orderBy(asc3(stores.createdAt));
      } else {
        rows = await db.select(projection).from(stores).innerJoin(userStores, eq7(userStores.storeId, stores.id)).where(eq7(userStores.userId, userId)).orderBy(asc3(stores.createdAt));
      }
      res.json({ stores: rows });
    } catch (error) {
      console.error("Error in /api/stores/me:", error);
      res.status(500).json({ error: "Failed to load stores." });
    }
  });
  app2.post("/api/stores", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const requester = await storage.getUser(userId);
      if (!requester) {
        req.session.destroy(() => {
        });
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      if (!isAdmin(requester)) {
        return res.status(403).json({ error: "Only admins can connect new stores." });
      }
      const {
        storeName,
        storeUrl,
        apiKey,
        apiSecret,
        webhookSecret
      } = req.body ?? {};
      const trimmedUrl = typeof storeUrl === "string" ? storeUrl.trim() : "";
      if (!trimmedUrl) {
        return res.status(400).json({ error: "storeUrl is required." });
      }
      if (typeof apiKey !== "string" || !apiKey.trim()) {
        return res.status(400).json({ error: "apiKey is required." });
      }
      if (typeof apiSecret !== "string" || !apiSecret.trim()) {
        return res.status(400).json({ error: "apiSecret is required." });
      }
      const normalizedUrl = trimmedUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
      const [existing] = await db.select({ id: stores.id, storeName: stores.storeName }).from(stores).where(eq7(stores.storeUrl, normalizedUrl)).limit(1);
      if (existing) {
        return res.status(409).json({
          error: "A store with this URL is already connected.",
          existing
        });
      }
      const { ShopifyClient: TempClient } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      const tempClient = new TempClient({
        storeUrl: normalizedUrl,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        useClientCredentials: true
      });
      let shopInfo = null;
      try {
        shopInfo = await tempClient.getShopInfo();
      } catch (testErr) {
        const message = testErr?.message || "Connection test failed";
        return res.status(400).json({
          error: `Could not connect to ${normalizedUrl}: ${message}`
        });
      }
      const finalStoreName = typeof storeName === "string" && storeName.trim() || shopInfo?.name || normalizedUrl;
      const [inserted] = await db.insert(stores).values({
        storeName: finalStoreName,
        storeUrl: normalizedUrl,
        apiKey: encrypt(apiKey.trim()),
        apiSecret: encrypt(apiSecret.trim()),
        webhookSecret: typeof webhookSecret === "string" && webhookSecret.trim() ? encrypt(webhookSecret.trim()) : null,
        isActive: true,
        lastTestedAt: /* @__PURE__ */ new Date(),
        testStatus: "success",
        testMessage: `Connected to ${shopInfo?.name || normalizedUrl}`,
        connectedBy: requester.id
      }).returning({
        id: stores.id,
        storeName: stores.storeName,
        storeUrl: stores.storeUrl,
        logoUrl: stores.logoUrl,
        isActive: stores.isActive,
        createdAt: stores.createdAt
      });
      await db.insert(userStores).values({ userId: requester.id, storeId: inserted.id, createdBy: requester.id }).onConflictDoNothing();
      let webhookReport = null;
      const appUrl = process.env.APP_URL;
      if (appUrl && /^https:\/\//i.test(appUrl)) {
        try {
          const { getShopifyClient: getShopifyClient2 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
          const client = await getShopifyClient2(inserted.id);
          webhookReport = await client.registerAllWebhooks(appUrl);
        } catch (err) {
          console.warn(
            `[stores] webhook registration for ${inserted.id} failed:`,
            err?.message ?? err
          );
        }
      } else {
        console.warn(
          `[stores] APP_URL not set or not https \u2014 skipping webhook registration for ${inserted.id}`
        );
      }
      res.status(201).json({
        store: inserted,
        shopName: shopInfo?.name ?? null,
        webhooks: webhookReport
      });
    } catch (error) {
      console.error("Error in POST /api/stores:", error);
      res.status(500).json({ error: "Failed to connect store." });
    }
  });
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;
  app2.patch("/api/stores/:id", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const requester = await storage.getUser(userId);
      if (!requester) {
        req.session.destroy(() => {
        });
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      if (!isAdmin(requester)) {
        return res.status(403).json({ error: "Only admins can update store details." });
      }
      const storeId = req.params.id;
      const [existing] = await db.select().from(stores).where(eq7(stores.id, storeId)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Store not found." });
      }
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body, "storeName")) {
        const v = req.body.storeName;
        if (v === null || v === "") {
          patch.storeName = null;
        } else if (typeof v === "string" && v.trim().length <= 120) {
          patch.storeName = v.trim();
        } else {
          return res.status(400).json({ error: "storeName must be a string up to 120 characters." });
        }
      }
      if (Object.prototype.hasOwnProperty.call(req.body, "logoUrl")) {
        const v = req.body.logoUrl;
        if (v === null || v === "") {
          patch.logoUrl = null;
        } else if (typeof v !== "string") {
          return res.status(400).json({ error: "logoUrl must be a string." });
        } else {
          const trimmed = v.trim();
          const isHttp = /^https?:\/\//i.test(trimmed);
          const dataUriMatch = trimmed.match(
            /^data:image\/(png|jpe?g|webp|svg\+xml|gif);base64,([A-Za-z0-9+/=]+)$/i
          );
          if (!isHttp && !dataUriMatch) {
            return res.status(400).json({
              error: "logoUrl must be an http(s) URL or a base64 data URI for png/jpeg/webp/svg/gif."
            });
          }
          if (dataUriMatch) {
            if (Buffer.byteLength(trimmed, "utf8") > MAX_LOGO_BYTES) {
              return res.status(413).json({
                error: `Logo data URI exceeds ${MAX_LOGO_BYTES} bytes. Compress the image or host it on a URL.`
              });
            }
          }
          patch.logoUrl = trimmed;
        }
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "No supported fields supplied. Allowed: storeName, logoUrl." });
      }
      const [updated] = await db.update(stores).set({ ...patch, updatedAt: /* @__PURE__ */ new Date() }).where(eq7(stores.id, storeId)).returning({
        id: stores.id,
        storeName: stores.storeName,
        storeUrl: stores.storeUrl,
        logoUrl: stores.logoUrl,
        isActive: stores.isActive,
        createdAt: stores.createdAt,
        updatedAt: stores.updatedAt
      });
      const { invalidateShopifyClient: invalidateShopifyClient2 } = await Promise.resolve().then(() => (init_shopify(), shopify_exports));
      invalidateShopifyClient2(storeId);
      res.json({ store: updated });
    } catch (error) {
      console.error("Error in PATCH /api/stores/:id:", error);
      res.status(500).json({ error: "Failed to update store." });
    }
  });
  app2.get("/api/users/:userId/stores", async (req, res) => {
    try {
      const sessionUserId = req.session?.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const requester = await storage.getUser(sessionUserId);
      if (!requester || !isAdmin(requester)) {
        return res.status(403).json({ error: "Admin access required." });
      }
      const targetId = req.params.userId;
      const target = await storage.getUser(targetId);
      if (!target) {
        return res.status(404).json({ error: "User not found." });
      }
      const rows = await db.select({ storeId: userStores.storeId }).from(userStores).where(eq7(userStores.userId, targetId));
      res.json({ storeIds: rows.map((r) => r.storeId) });
    } catch (error) {
      console.error("Error in GET /api/users/:userId/stores:", error);
      res.status(500).json({ error: "Failed to load user store access." });
    }
  });
  app2.put("/api/users/:userId/stores", async (req, res) => {
    try {
      const sessionUserId = req.session?.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const requester = await storage.getUser(sessionUserId);
      if (!requester || !isAdmin(requester)) {
        return res.status(403).json({ error: "Admin access required." });
      }
      const targetId = req.params.userId;
      const target = await storage.getUser(targetId);
      if (!target) {
        return res.status(404).json({ error: "User not found." });
      }
      const requested = req.body?.storeIds;
      if (!Array.isArray(requested) || requested.some((s) => typeof s !== "string")) {
        return res.status(400).json({
          error: "storeIds must be an array of store id strings."
        });
      }
      const requestedSet = new Set(requested);
      const requestedIds = Array.from(requestedSet);
      if (requestedIds.length > 0) {
        const existingStores = await db.select({ id: stores.id }).from(stores);
        const knownIds = new Set(existingStores.map((s) => s.id));
        const unknown = requestedIds.filter((id) => !knownIds.has(id));
        if (unknown.length > 0) {
          return res.status(400).json({
            error: "Unknown store id(s) in storeIds.",
            unknown
          });
        }
      }
      const current = await db.select({ storeId: userStores.storeId }).from(userStores).where(eq7(userStores.userId, targetId));
      const currentSet = new Set(current.map((r) => r.storeId));
      const currentIds = Array.from(currentSet);
      const toInsert = requestedIds.filter((id) => !currentSet.has(id));
      const toDelete = currentIds.filter((id) => !requestedSet.has(id));
      if (toInsert.length > 0) {
        await db.insert(userStores).values(
          toInsert.map((storeId) => ({
            userId: targetId,
            storeId,
            createdBy: requester.id
          }))
        ).onConflictDoNothing();
      }
      if (toDelete.length > 0) {
        await db.delete(userStores).where(
          and4(
            eq7(userStores.userId, targetId),
            or2(...toDelete.map((id) => eq7(userStores.storeId, id)))
          )
        );
      }
      res.json({
        storeIds: requestedIds,
        added: toInsert,
        removed: toDelete
      });
    } catch (error) {
      console.error("Error in PUT /api/users/:userId/stores:", error);
      res.status(500).json({ error: "Failed to update user store access." });
    }
  });
  app2.get("/api/auth/me", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        req.session.destroy(() => {
        });
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      if (!user.isActive) {
        req.session.destroy(() => {
        });
        return res.status(403).json({ error: "This account has been deactivated." });
      }
      const { password: _pw, ...safe } = user;
      res.json(safe);
    } catch (error) {
      console.error("Error in /api/auth/me:", error);
      res.status(500).json({ error: "Failed to load session." });
    }
  });
  app2.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
      }
      res.clearCookie("orderflow.sid");
      res.json({ ok: true });
    });
  });
  app2.get("/api/auth/can-register-admin", async (_req, res) => {
    try {
      const existing = await storage.listUsers({});
      res.json({ canRegister: existing.length === 0 });
    } catch (error) {
      console.error("Error checking bootstrap state:", error);
      res.status(500).json({ error: "Failed to check bootstrap state" });
    }
  });
  app2.post("/api/auth/register-admin", async (req, res) => {
    try {
      const existing = await storage.listUsers({});
      if (existing.length > 0) {
        return res.status(403).json({
          error: "Registration is closed. This workspace already has administrators \u2014 ask one of them to send you an invite."
        });
      }
      const payload = {
        ...req.body,
        role: "admin",
        adminType: "full_control",
        permissions: null
      };
      const validatedData = insertUserSchema.parse(payload);
      const existingUsername = await storage.getUserByUsername(
        validatedData.username
      );
      if (existingUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
      const existingEmail = await storage.getUserByEmail(validatedData.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      const hashedPassword = await hashPassword(validatedData.password);
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword
      });
      req.session.userId = user.id;
      await new Promise(
        (resolve, reject) => req.session.save((err) => err ? reject(err) : resolve())
      );
      const { password: _password, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      console.error("Error registering first admin:", error);
      res.status(500).json({ error: "Failed to register first admin" });
    }
  });
  app2.patch("/api/users/:id", async (req, res) => {
    try {
      const currentUserId = req.body.currentUserId || req.params.id;
      const { currentUserId: _, ...updateData } = req.body;
      const validatedData = updateUserSchema.parse(updateData);
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }
      if (req.params.id !== currentUserId) {
        if (!canEditProfiles(currentUser)) {
          return res.status(403).json({ error: "You don't have permission to edit user profiles" });
        }
      }
      if (validatedData.agentExtension !== void 0) {
        if (!canAssignExtensions(currentUser) && req.params.id !== currentUserId) {
          return res.status(403).json({ error: "You don't have permission to assign extensions" });
        }
        if (validatedData.agentExtension) {
          const existingUserWithExtension = await storage.getUserByAgentExtension(validatedData.agentExtension);
          if (existingUserWithExtension && existingUserWithExtension.id !== req.params.id) {
            return res.status(400).json({ error: "This extension is already assigned to another agent" });
          }
        }
      }
      if ((validatedData.permissions !== void 0 || validatedData.adminType !== void 0) && req.params.id !== currentUserId) {
        if (!isFullControlAdmin(currentUser)) {
          return res.status(403).json({ error: "Only full control admins can edit admin permissions" });
        }
      }
      const user = await storage.updateUser(req.params.id, validatedData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(stripPassword(user));
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  app2.post(
    "/api/users/:id/kyc-upload",
    (req, res, next) => {
      kycUpload.single("document")(req, res, (err) => {
        if (err) {
          const message = err?.code === "LIMIT_FILE_SIZE" ? "File too large. Max 5 MB." : err?.message || "Invalid file";
          return res.status(400).json({ error: message });
        }
        next();
      });
    },
    async (req, res) => {
      const file = req.file;
      try {
        const targetUserId = req.params.id;
        const currentUserId = req.body?.currentUserId || req.query?.currentUserId || targetUserId;
        const currentUser = await storage.getUser(currentUserId);
        if (!currentUser) {
          return res.status(404).json({ error: "Current user not found" });
        }
        if (targetUserId !== currentUserId && !canEditProfiles(currentUser)) {
          return res.status(403).json({ error: "You don't have permission to upload for this user" });
        }
        if (!file) {
          return res.status(400).json({ error: "No file uploaded" });
        }
        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
          try {
            fs4.unlinkSync(file.path);
          } catch {
          }
          return res.status(404).json({ error: "User not found" });
        }
        if (targetUser.kycDocumentUrl) {
          const prior = resolveKycFilePath(targetUser.kycDocumentUrl);
          if (prior) {
            try {
              fs4.unlinkSync(prior);
            } catch (e) {
              console.warn("[kyc] failed to remove prior file:", e);
            }
          }
        }
        const updated = await storage.updateUser(targetUserId, {
          kycDocumentUrl: file.filename
        });
        if (!updated) {
          return res.status(404).json({ error: "User not found" });
        }
        res.json({
          message: "KYC document uploaded",
          kycDocumentUrl: updated.kycDocumentUrl,
          originalName: file.originalname,
          size: file.size
        });
      } catch (err) {
        if (file?.path) {
          try {
            fs4.unlinkSync(file.path);
          } catch {
          }
        }
        console.error("Error uploading KYC document:", err);
        res.status(500).json({ error: "Failed to upload KYC document" });
      }
    }
  );
  app2.get("/api/users/:id/kyc-document", async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const currentUserId = req.query?.currentUserId || targetUserId;
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (targetUserId !== currentUserId && !canEditProfiles(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to view this document" });
      }
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser?.kycDocumentUrl) {
        return res.status(404).json({ error: "No KYC document on file" });
      }
      const filePath = resolveKycFilePath(targetUser.kycDocumentUrl);
      if (!filePath) {
        return res.status(404).json({ error: "KYC document file missing on disk" });
      }
      const ext = path3.extname(filePath).toLowerCase();
      const contentType = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="kyc-${targetUserId}${ext}"`
      );
      res.sendFile(filePath);
    } catch (err) {
      console.error("Error serving KYC document:", err);
      res.status(500).json({ error: "Failed to serve KYC document" });
    }
  });
  app2.patch("/api/users/:id/presence", async (req, res) => {
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
      res.json({ success: true, user: stripPassword(user) });
    } catch (error) {
      console.error("Error updating presence status:", error);
      res.status(500).json({ error: "Failed to update presence status" });
    }
  });
  app2.post("/api/users/presence", async (req, res) => {
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
      res.json({ success: true, user: stripPassword(user) });
    } catch (error) {
      console.error("Error updating presence status:", error);
      res.status(500).json({ error: "Failed to update presence status" });
    }
  });
  app2.delete("/api/users/:id", async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      console.log(`Starting cleanup for user ${userId} (${user.email})`);
      await db.update(orders).set({ assignedTo: null }).where(eq7(orders.assignedTo, userId));
      await db.update(orders).set({ confirmedBy: null }).where(eq7(orders.confirmedBy, userId));
      await db.update(orders).set({ cancelledBy: null }).where(eq7(orders.cancelledBy, userId));
      console.log("  - Orders unassigned");
      await db.delete(orderAssignments).where(
        or2(eq7(orderAssignments.userId, userId), eq7(orderAssignments.assignedBy, userId))
      );
      console.log("  - Order assignments deleted");
      await db.delete(teamMessages).where(
        or2(eq7(teamMessages.fromUserId, userId), eq7(teamMessages.toUserId, userId))
      );
      console.log("  - Team messages deleted");
      await db.delete(leaveRequests).where(eq7(leaveRequests.userId, userId));
      await db.update(leaveRequests).set({ reviewedBy: null }).where(eq7(leaveRequests.reviewedBy, userId));
      console.log("  - Leave requests deleted/updated");
      await db.delete(notifications).where(eq7(notifications.userId, userId));
      console.log("  - Notifications deleted");
      await db.delete(attendance).where(eq7(attendance.userId, userId));
      console.log("  - Attendance records deleted");
      await db.delete(calls).where(eq7(calls.agentId, userId));
      console.log("  - Call records deleted");
      await db.update(orderStatusHistory).set({ changedBy: null }).where(eq7(orderStatusHistory.changedBy, userId));
      console.log("  - Order status history updated");
      await db.update(invites).set({ invitedBy: null }).where(eq7(invites.invitedBy, userId));
      console.log("  - Invites updated");
      await db.update(ndrEvents).set({ actionBy: null }).where(eq7(ndrEvents.actionBy, userId));
      console.log("  - NDR events updated");
      await db.update(courses).set({ authorId: null }).where(eq7(courses.authorId, userId));
      console.log("  - Courses updated");
      await db.update(resources).set({ authorId: null }).where(eq7(resources.authorId, userId));
      console.log("  - Resources updated");
      await db.delete(userLessonProgress).where(eq7(userLessonProgress.userId, userId));
      console.log("  - User lesson progress deleted");
      await db.delete(userOnboardingProgress).where(eq7(userOnboardingProgress.userId, userId));
      console.log("  - User onboarding progress deleted");
      await storage.deleteUser(userId);
      console.log(`User ${userId} deleted successfully`);
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  app2.post("/api/attendance/clock-in", async (req, res) => {
    try {
      const { userId, localDate } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const now = /* @__PURE__ */ new Date();
      let dateForRecord;
      if (localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        const [year, month, day] = localDate.split("-").map(Number);
        dateForRecord = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      } else {
        dateForRecord = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
      }
      const dateStr = localDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const existing = await storage.getAttendanceByDate(userId, dateStr);
      if (existing && existing.clockInTime) {
        return res.status(400).json({
          error: "Already clocked in today",
          attendance: existing
        });
      }
      const attendance2 = await storage.clockInWithDate(userId, now, dateForRecord);
      res.json({ success: true, attendance: attendance2 });
    } catch (error) {
      console.error("Error clocking in:", error);
      res.status(500).json({ error: "Failed to clock in" });
    }
  });
  app2.post("/api/attendance/clock-out", async (req, res) => {
    try {
      const { userId, localDate } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const now = /* @__PURE__ */ new Date();
      const dateStr = localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate) ? localDate : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
      await storage.closeOpenBreaksForAttendance(existing.id, now);
      const breaks = await storage.getBreaksByAttendanceId(existing.id);
      let totalBreakMs = 0;
      for (const brk of breaks) {
        if (brk.breakStart && brk.breakEnd) {
          totalBreakMs += new Date(brk.breakEnd).getTime() - new Date(brk.breakStart).getTime();
        }
      }
      const totalBreakHours = totalBreakMs / (1e3 * 60 * 60);
      const clockInTime = new Date(existing.clockInTime);
      const rawHours = (now.getTime() - clockInTime.getTime()) / (1e3 * 60 * 60);
      const totalHours = Math.max(0, rawHours - totalBreakHours);
      const attendance2 = await storage.clockOutById(existing.id, now, totalHours);
      res.json({ success: true, attendance: attendance2, breakDeducted: totalBreakHours.toFixed(2) });
    } catch (error) {
      console.error("Error clocking out:", error);
      res.status(500).json({ error: "Failed to clock out" });
    }
  });
  app2.get("/api/holidays", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : null;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter required" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.holidayState) {
        return res.json([]);
      }
      const yearParam = typeof req.query.year === "string" ? req.query.year : null;
      const year = yearParam ? parseInt(yearParam, 10) : (/* @__PURE__ */ new Date()).getFullYear();
      const rows = await storage.listHolidaysByState(
        user.holidayState,
        Number.isFinite(year) ? year : void 0
      );
      res.json(rows);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  });
  async function requireAdmin(req, res) {
    const requesterId = typeof req.query.currentUserId === "string" ? req.query.currentUserId : typeof req.body?.currentUserId === "string" ? req.body.currentUserId : null;
    if (!requesterId) {
      res.status(401).json({ error: "Unauthorized: currentUserId required." });
      return { ok: false };
    }
    const requester = await storage.getUser(requesterId);
    if (!requester) {
      res.status(401).json({ error: "Unauthorized: user not found." });
      return { ok: false };
    }
    if (!isAdmin(requester)) {
      res.status(403).json({ error: "Forbidden: admin role required." });
      return { ok: false };
    }
    return { ok: true };
  }
  app2.get("/api/payroll/preview", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth.ok) return;
    try {
      const userId = String(req.query.userId ?? "");
      const year = parseInt(String(req.query.year ?? ""), 10);
      const month = parseInt(String(req.query.month ?? ""), 10);
      if (!userId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "userId, year, month required (month 1-12)" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const [
        { expectedWorkingDays: expectedWorkingDays2, runPayrollMath: runPayrollMath2, ANNUAL_PAID_HOLIDAY_CAP: ANNUAL_PAID_HOLIDAY_CAP2 },
        metrics
      ] = await Promise.all([
        Promise.resolve().then(() => (init_payroll(), payroll_exports)),
        Promise.resolve().then(() => (init_payroll_metrics(), payroll_metrics_exports))
      ]);
      const expectedDays = expectedWorkingDays2(year, month);
      const [att, autoHolidays, deliveryRate, teamRate, ytdHolidays, existing] = await Promise.all([
        metrics.getAttendanceMetrics(userId, year, month),
        user.holidayState ? metrics.getAutoPaidHolidaysCount(user.holidayState, year, month) : 0,
        metrics.getConfirmationDeliveryRatePct(userId, year, month),
        metrics.getTeamDeliveryRatePct(year, month),
        metrics.getYtdPaidHolidaysUsed(userId, year, month),
        storage.getPayrollLedgerByPeriod(userId, year, month)
      ]);
      const remainingQuota = Math.max(0, ANNUAL_PAID_HOLIDAY_CAP2 - ytdHolidays);
      const paidHolidaysAuto = Math.min(autoHolidays, remainingQuota);
      const baseSalary = user.baseSalary != null ? Number(user.baseSalary) : 0;
      const result = runPayrollMath2({
        baseSalary,
        expectedWorkingDays: expectedDays,
        daysPresent: att.daysPresent,
        paidHolidaysUsed: paidHolidaysAuto,
        compensationProfile: user.compensationProfile ?? null,
        deliveryRatePct: deliveryRate,
        teamDeliveryRatePct: teamRate,
        personalRecoveryRatePct: null,
        // admin enters
        reshipsCount: null
        // admin enters
      });
      res.json({
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          holidayState: user.holidayState,
          compensationProfile: user.compensationProfile,
          baseSalary,
          employeeId: user.employeeId,
          department: user.department
        },
        period: { year, month },
        attendance: { ...att, expectedWorkingDays: expectedDays },
        holidayQuota: {
          annualCap: ANNUAL_PAID_HOLIDAY_CAP2,
          ytdUsed: ytdHolidays,
          remaining: remainingQuota,
          autoCountFromCalendar: autoHolidays,
          autoCountAfterQuota: paidHolidaysAuto
        },
        autoMetrics: {
          deliveryRatePct: deliveryRate,
          teamDeliveryRatePct: teamRate,
          personalRecoveryRatePct: null,
          reshipsCount: null
        },
        math: result,
        existingLedger: existing ? {
          id: existing.id,
          status: existing.status,
          sentAt: existing.sentAt,
          finalPayout: existing.finalPayout
        } : null
      });
    } catch (error) {
      console.error("Error in /api/payroll/preview:", error);
      res.status(500).json({ error: "Failed to compute payroll preview" });
    }
  });
  app2.post("/api/payroll/run", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth.ok) return;
    try {
      const body = req.body ?? {};
      const userId = String(body.userId ?? "");
      const year = parseInt(String(body.year ?? ""), 10);
      const month = parseInt(String(body.month ?? ""), 10);
      if (!userId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "userId, year, month required (month 1-12)" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.baseSalary == null) {
        return res.status(400).json({ error: "User has no base salary set." });
      }
      const payroll = await Promise.resolve().then(() => (init_payroll(), payroll_exports));
      const expectedDays = payroll.expectedWorkingDays(year, month);
      const daysPresent = parseIntOr(body.daysPresent, 0);
      const paidHolidaysUsed = parseIntOr(body.paidHolidaysUsed, 0);
      const deliveryRatePct = parseFloatOrNull(body.deliveryRatePct);
      const teamDeliveryRatePct = parseFloatOrNull(body.teamDeliveryRatePct);
      const personalRecoveryRatePct = parseFloatOrNull(body.personalRecoveryRatePct);
      const reshipsCount = parseIntOr(body.reshipsCount, 0);
      const notes = typeof body.notes === "string" ? body.notes : null;
      const baseSalary = Number(user.baseSalary);
      const profile = user.compensationProfile ?? null;
      const math = payroll.runPayrollMath({
        baseSalary,
        expectedWorkingDays: expectedDays,
        daysPresent,
        paidHolidaysUsed,
        compensationProfile: profile,
        deliveryRatePct,
        teamDeliveryRatePct,
        personalRecoveryRatePct,
        reshipsCount
      });
      const created = await storage.upsertPayrollLedger({
        userId,
        year,
        month,
        baseSalary: String(baseSalary),
        expectedWorkingDays: expectedDays,
        daysPresent,
        paidHolidaysUsed,
        basePayRatio: String(round4(math.base.ratio)),
        basePayAmount: String(math.base.amount),
        compensationProfile: profile,
        deliveryRatePct: deliveryRatePct != null ? String(deliveryRatePct) : null,
        teamDeliveryRatePct: teamDeliveryRatePct != null ? String(teamDeliveryRatePct) : null,
        recoveryRatePct: personalRecoveryRatePct != null ? String(personalRecoveryRatePct) : null,
        reshipsCount,
        confirmationBonus: String(math.incentives.confirmationBonus),
        teamDeliveryBonus: String(math.incentives.teamDeliveryBonus),
        recoveryBonus: String(math.incentives.recoveryBonus),
        reshipsBonus: String(math.incentives.reshipsBonus),
        totalIncentives: String(math.incentives.total),
        finalPayout: String(math.finalPayout),
        currency: "INR",
        status: "finalized",
        recipientEmail: user.email,
        notes,
        createdBy: req.body?.currentUserId ?? null
      });
      const { renderPayslipPdf: renderPayslipPdf2 } = await Promise.resolve().then(() => (init_payslip_pdf(), payslip_pdf_exports));
      const { sendPayslipEmail: sendPayslipEmail2 } = await Promise.resolve().then(() => (init_payslip_email(), payslip_email_exports));
      const data = {
        employee: {
          fullName: user.fullName,
          email: user.email,
          employeeId: user.employeeId ?? null,
          holidayState: user.holidayState ?? null,
          department: user.department ?? null
        },
        period: { year, month },
        base: {
          baseSalary,
          expectedWorkingDays: expectedDays,
          daysPresent,
          paidHolidaysUsed,
          ratio: math.base.ratio,
          amount: math.base.amount,
          capped: math.base.capped
        },
        incentives: {
          profile,
          deliveryRatePct,
          teamDeliveryRatePct,
          recoveryRatePct: personalRecoveryRatePct,
          reshipsCount,
          confirmationBonus: math.incentives.confirmationBonus,
          teamDeliveryBonus: math.incentives.teamDeliveryBonus,
          recoveryBonus: math.incentives.recoveryBonus,
          reshipsBonus: math.incentives.reshipsBonus,
          total: math.incentives.total
        },
        finalPayout: math.finalPayout,
        ledgerId: created.id,
        generatedAt: /* @__PURE__ */ new Date()
      };
      let pdfFile;
      try {
        pdfFile = await renderPayslipPdf2(data);
      } catch (pdfErr) {
        await storage.updatePayrollLedgerDispatch(created.id, {
          status: "failed",
          emailError: `PDF render failed: ${pdfErr?.message ?? String(pdfErr)}`
        });
        return res.status(500).json({ error: "Payroll persisted but PDF render failed", ledgerId: created.id });
      }
      let dispatchOk = true;
      let dispatchErr = null;
      try {
        await sendPayslipEmail2(data, pdfFile);
      } catch (emailErr) {
        dispatchOk = false;
        dispatchErr = emailErr?.message ?? String(emailErr);
      }
      await storage.updatePayrollLedgerDispatch(created.id, {
        status: dispatchOk ? "sent" : "failed",
        pdfFilename: pdfFile.filename,
        sentAt: dispatchOk ? /* @__PURE__ */ new Date() : null,
        emailError: dispatchErr
      });
      const fresh = await storage.getPayrollLedgerById(created.id);
      res.json({
        ledger: fresh,
        math,
        pdf: { filename: pdfFile.filename, byteLength: pdfFile.byteLength },
        emailSent: dispatchOk,
        emailError: dispatchErr
      });
    } catch (error) {
      console.error("Error in /api/payroll/run:", error);
      res.status(500).json({ error: error?.message ?? "Failed to run payroll" });
    }
  });
  app2.get("/api/payroll/ledger", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth.ok) return;
    try {
      const year = parseInt(String(req.query.year ?? ""), 10);
      const month = parseInt(String(req.query.month ?? ""), 10);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "year, month required (month 1-12)" });
      }
      const rows = await storage.listPayrollLedger(year, month);
      res.json(rows);
    } catch (error) {
      console.error("Error in /api/payroll/ledger:", error);
      res.status(500).json({ error: "Failed to list payroll ledger" });
    }
  });
  app2.get("/api/payroll/ledger/:id/pdf", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth.ok) return;
    try {
      const row = await storage.getPayrollLedgerById(req.params.id);
      if (!row) return res.status(404).json({ error: "Ledger entry not found" });
      const user = await storage.getUser(row.userId);
      if (!user) return res.status(404).json({ error: "Employee record missing" });
      const { renderPayslipPdfBuffer: renderPayslipPdfBuffer2 } = await Promise.resolve().then(() => (init_payslip_pdf(), payslip_pdf_exports));
      const period = `${row.year}-${String(row.month).padStart(2, "0")}`;
      const safeName = user.fullName.replace(/[^a-z0-9]/gi, "_");
      const filename = `${safeName}__${period}.pdf`;
      const buf = await renderPayslipPdfBuffer2({
        employee: {
          fullName: user.fullName,
          email: user.email,
          employeeId: user.employeeId ?? null,
          holidayState: user.holidayState ?? null,
          department: user.department ?? null
        },
        period: { year: row.year, month: row.month },
        base: {
          baseSalary: Number(row.baseSalary),
          expectedWorkingDays: row.expectedWorkingDays,
          daysPresent: row.daysPresent,
          paidHolidaysUsed: row.paidHolidaysUsed,
          ratio: Number(row.basePayRatio),
          amount: Number(row.basePayAmount),
          // capped is derivable from ratio == 1 AND
          // (daysPresent + paidHolidays) > expectedWorkingDays
          capped: Number(row.basePayRatio) >= 1 && row.daysPresent + row.paidHolidaysUsed > row.expectedWorkingDays
        },
        incentives: {
          profile: row.compensationProfile ?? null,
          deliveryRatePct: row.deliveryRatePct != null ? Number(row.deliveryRatePct) : null,
          teamDeliveryRatePct: row.teamDeliveryRatePct != null ? Number(row.teamDeliveryRatePct) : null,
          recoveryRatePct: row.recoveryRatePct != null ? Number(row.recoveryRatePct) : null,
          reshipsCount: row.reshipsCount ?? 0,
          confirmationBonus: Number(row.confirmationBonus),
          teamDeliveryBonus: Number(row.teamDeliveryBonus),
          recoveryBonus: Number(row.recoveryBonus),
          reshipsBonus: Number(row.reshipsBonus),
          total: Number(row.totalIncentives)
        },
        finalPayout: Number(row.finalPayout),
        ledgerId: row.id,
        generatedAt: /* @__PURE__ */ new Date()
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", String(buf.byteLength));
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.end(buf);
    } catch (error) {
      console.error("Error rendering payslip PDF:", error);
      res.status(500).json({ error: error?.message ?? "Failed to render payslip PDF" });
    }
  });
  function parseIntOr(v, fallback) {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : fallback;
  }
  function parseFloatOrNull(v) {
    if (v == null || v === "") return null;
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  }
  function round4(n) {
    return Math.round(n * 1e4) / 1e4;
  }
  app2.get("/api/attendance", async (req, res) => {
    try {
      const { userId, startDate, endDate } = req.query;
      const filters = {
        userId,
        startDate: startDate ? new Date(startDate) : void 0,
        endDate: endDate ? new Date(endDate) : void 0
      };
      const records = await storage.getAttendanceRecords(filters);
      res.json(records);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });
  app2.get("/api/attendance/today/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const dateParam = req.query.date;
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        await storage.autoCloseGhostSessions(userId, dateParam);
        const attendance3 = await storage.getAttendanceByDate(userId, dateParam);
        return res.json(attendance3 || null);
      }
      const attendance2 = await storage.getTodayAttendance(req.params.userId);
      res.json(attendance2 || null);
    } catch (error) {
      console.error("Error fetching today's attendance:", error);
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });
  app2.get("/api/attendance/team-today", async (req, res) => {
    try {
      const attendanceRecords = await storage.getTeamTodayAttendance();
      res.json(attendanceRecords);
    } catch (error) {
      console.error("Error fetching team attendance:", error);
      res.status(500).json({ error: "Failed to fetch team attendance" });
    }
  });
  app2.post("/api/attendance/break/start", async (req, res) => {
    try {
      const { userId, localDate } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const now = /* @__PURE__ */ new Date();
      const dateStr = localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate) ? localDate : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const attendance2 = await storage.getAttendanceByDate(userId, dateStr);
      if (!attendance2 || !attendance2.clockInTime) {
        return res.status(400).json({ error: "Not clocked in today" });
      }
      if (attendance2.clockOutTime) {
        return res.status(400).json({ error: "Already clocked out today" });
      }
      const activeBreak = await storage.getActiveBreak(attendance2.id);
      if (activeBreak) {
        return res.status(400).json({ error: "Already on break", activeBreak });
      }
      const breakRecord = await storage.startBreak(attendance2.id);
      const { attendance: attendanceSchema } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      await db.update(attendanceSchema).set({ status: "break", updatedAt: /* @__PURE__ */ new Date() }).where(eq7(attendanceSchema.id, attendance2.id));
      res.json({ success: true, breakRecord });
    } catch (error) {
      console.error("Error starting break:", error);
      res.status(500).json({ error: "Failed to start break" });
    }
  });
  app2.post("/api/attendance/break/end", async (req, res) => {
    try {
      const { userId, localDate } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const now = /* @__PURE__ */ new Date();
      const dateStr = localDate && /^\d{4}-\d{2}-\d{2}$/.test(localDate) ? localDate : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const attendance2 = await storage.getAttendanceByDate(userId, dateStr);
      if (!attendance2) {
        return res.status(400).json({ error: "No attendance record found" });
      }
      const activeBreak = await storage.getActiveBreak(attendance2.id);
      if (!activeBreak) {
        return res.status(400).json({ error: "Not currently on break" });
      }
      const breakRecord = await storage.endBreak(activeBreak.id, now);
      const { attendance: attendanceSchema } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      await db.update(attendanceSchema).set({ status: "present", updatedAt: /* @__PURE__ */ new Date() }).where(eq7(attendanceSchema.id, attendance2.id));
      res.json({ success: true, breakRecord });
    } catch (error) {
      console.error("Error ending break:", error);
      res.status(500).json({ error: "Failed to end break" });
    }
  });
  app2.get("/api/attendance/break/active/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      const dateParam = req.query.date;
      const now = /* @__PURE__ */ new Date();
      const dateStr = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const attendance2 = await storage.getAttendanceByDate(userId, dateStr);
      if (!attendance2) {
        return res.json(null);
      }
      const activeBreak = await storage.getActiveBreak(attendance2.id);
      res.json(activeBreak || null);
    } catch (error) {
      console.error("Error fetching active break:", error);
      res.status(500).json({ error: "Failed to fetch active break" });
    }
  });
  app2.get("/api/attendance/:attendanceId/breaks", async (req, res) => {
    try {
      const { attendanceId } = req.params;
      const breaks = await storage.getBreaksByAttendanceId(attendanceId);
      res.json(breaks);
    } catch (error) {
      console.error("Error fetching breaks:", error);
      res.status(500).json({ error: "Failed to fetch breaks" });
    }
  });
  app2.post("/api/calls/initiate", async (req, res) => {
    try {
      const { userId, orderId, customerPhone } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }
      if (!customerPhone) {
        return res.status(400).json({ error: "customerPhone is required" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.agentExtension) {
        return res.status(400).json({
          success: false,
          error: "Agent extension not configured. Please contact admin."
        });
      }
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
      const ivrApiUrl = "https://api.ivrsolutions.in/api/c2c_post";
      const formData = new URLSearchParams({
        did: process.env.IVR_DID_NUMBER,
        ext_no: user.agentExtension,
        phone: customerPhone
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
          "Authorization": `Bearer ${process.env.IVR_API_TOKEN}`
        },
        body: formData.toString()
      });
      const ivrData = await ivrResponse.json();
      console.log("\u{1F4DE} IVR API Response:", {
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
          contentType: ivrResponse.headers.get("content-type"),
          server: ivrResponse.headers.get("server")
        }
      });
      if (ivrResponse.status === 200) {
        const callReference = ivrData.recordid || ivrData.call_id || ivrData.callId || ivrData.reference || ivrData.id;
        const call = await storage.createCall({
          orderId,
          agentId: userId,
          customerPhone,
          callStatus: "initiated",
          callReference: callReference || void 0,
          recipientNumber: customerPhone
        });
        console.log("\u2713 Call initiated successfully:", {
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
        console.error("IVR API validation error:", { status: 400, data: ivrData });
        return res.status(400).json({
          success: false,
          error: ivrData.message || "Invalid call parameters. Please check phone number and extension."
        });
      } else if (ivrResponse.status === 404) {
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
        console.error("IVR API server error:", { status: ivrResponse.status, data: ivrData });
        return res.status(503).json({
          success: false,
          error: "IVR service temporarily unavailable. Please try again later."
        });
      } else {
        console.error("IVR API error:", { status: ivrResponse.status, data: ivrData });
        return res.status(400).json({
          success: false,
          error: ivrData.message || "Failed to initiate call. Please try again."
        });
      }
    } catch (error) {
      console.error("Error initiating call:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to initiate call. Please try again."
      });
    }
  });
  app2.get("/api/calls/order/:orderId", async (req, res) => {
    try {
      const calls2 = await storage.getCallsByOrderId(req.params.orderId);
      res.json(calls2);
    } catch (error) {
      console.error("Error fetching calls:", error);
      res.status(500).json({ error: "Failed to fetch calls" });
    }
  });
  app2.get("/api/calls/agent/:agentId", async (req, res) => {
    try {
      const calls2 = await storage.getCallsByAgentId(req.params.agentId);
      res.json(calls2);
    } catch (error) {
      console.error("Error fetching calls:", error);
      res.status(500).json({ error: "Failed to fetch calls" });
    }
  });
  app2.get("/api/admin/calls", async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 25;
      const userId = req.query.userId;
      const userRole = req.query.userRole;
      const agentId = userRole === "agent" && userId ? userId : void 0;
      const result = await storage.getAllCallsWithDetails({ page, limit, agentId });
      res.json(result);
    } catch (error) {
      console.error("Error fetching all calls:", error);
      res.status(500).json({ error: "Failed to fetch calls" });
    }
  });
  app2.get("/api/calls/download/:callId", async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getCallById(callId);
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      if (!call.recordingUrl) {
        return res.status(404).json({ error: "No recording available for this call" });
      }
      const recordingResponse = await axios3.get(call.recordingUrl, {
        responseType: "stream"
      });
      const filename = `Call_${call.callReference || call.id}.wav`;
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      recordingResponse.data.pipe(res);
    } catch (error) {
      console.error("Error downloading recording:", error);
      res.status(500).json({ error: "Failed to download recording" });
    }
  });
  app2.post("/api/integrations/analyze-call", async (req, res) => {
    try {
      const { callId, recordingUrl } = req.body;
      if (!callId || !recordingUrl) {
        return res.status(400).json({ error: "callId and recordingUrl are required" });
      }
      const call = await storage.getCallById(callId);
      if (!call) {
        return res.status(404).json({ error: "Call not found" });
      }
      const agent = await storage.getUser(call.agentId);
      const staffMember = agent ? agent.fullName || agent.email : "Unknown Agent";
      console.log(`\u{1F916} Starting AI analysis for call ${callId}`);
      console.log(`\u{1F4CB} Context: Order ${call.orderId}, Agent: ${staffMember}, Duration: ${call.callDuration || 0}s`);
      const n8nWebhookUrl = process.env.N8N_ANALYZE_CALL_URL;
      if (!n8nWebhookUrl) {
        console.error("\u274C N8N_ANALYZE_CALL_URL environment variable not set");
        return res.status(500).json({ error: "AI analysis service not configured" });
      }
      const n8nPayload = {
        callId,
        recordingUrl,
        orderId: call.orderId,
        staffMember,
        callDate: call.calledAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
        callDuration: call.callDuration || 0
      };
      const n8nResponse = await axios3.post(n8nWebhookUrl, n8nPayload, {
        timeout: 12e4,
        // 2 minute timeout for AI processing
        headers: {
          "Content-Type": "application/json"
        },
        validateStatus: (status) => status < 500
        // Accept any non-5xx response
      });
      if (n8nResponse.status >= 400) {
        console.error(`\u274C n8n returned error status ${n8nResponse.status}:`, n8nResponse.data);
        return res.status(502).json({
          error: "AI service returned an error",
          details: n8nResponse.data?.message || `Status ${n8nResponse.status}`
        });
      }
      console.log(`\u2705 n8n response received for call ${callId}:`, JSON.stringify(n8nResponse.data).substring(0, 500));
      const {
        overallScore,
        executiveSummary,
        rawMarkdownReport,
        riskFlag,
        coachingRecommendation,
        transcript
        // Also capture transcript if provided
      } = n8nResponse.data || {};
      const aiAnalysis = {
        overallScore: overallScore ?? null,
        executiveSummary: executiveSummary || null,
        rawMarkdownReport: rawMarkdownReport || null,
        riskFlag: riskFlag || null,
        coachingRecommendation: coachingRecommendation || null,
        analyzedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      console.log(`\u{1F4CA} Analysis extracted - Score: ${overallScore}, Risk: ${riskFlag}`);
      const updatedCall = await storage.updateCallFromWebhook(callId, {
        transcript: transcript || null,
        aiAnalysis
      });
      if (!updatedCall) {
        return res.status(500).json({ error: "Failed to update call record" });
      }
      console.log(`\u{1F4BE} Call ${callId} updated with AI analysis`);
      res.json({
        success: true,
        call: updatedCall,
        aiAnalysis
      });
    } catch (error) {
      console.error("Error generating AI analysis:", error);
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        return res.status(504).json({ error: "AI analysis request timed out. Please try again." });
      }
      res.status(500).json({
        error: "Failed to generate AI analysis",
        details: error.message
      });
    }
  });
  app2.post("/api/webhooks/ivr-call-events", async (req, res) => {
    try {
      console.log("========================================");
      console.log("IVR WEBHOOK RECEIVED AT:", (/* @__PURE__ */ new Date()).toISOString());
      console.log("Raw payload:", JSON.stringify(req.body, null, 2));
      console.log("========================================");
      const webhookSecret = process.env.IVR_WEBHOOK_SECRET;
      if (webhookSecret) {
        const providedSecret = req.headers["x-webhook-secret"] || req.body.secret || req.body.secret_key;
        if (providedSecret !== webhookSecret) {
          console.error("\u274C IVR webhook authentication failed");
          return res.status(401).json({ error: "Unauthorized" });
        }
      }
      const {
        recordid,
        // IVR Solutions uses this field name
        call_reference,
        callReference,
        call_status,
        callStatus,
        status,
        call_duration,
        // Duration in seconds
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
        customerPhone
      } = req.body;
      let parsedDuration = call_duration || callDuration || duration;
      if (typeof parsedDuration === "string") {
        parsedDuration = parseInt(parsedDuration, 10);
      }
      const normalizedData = {
        callReference: recordid || call_reference || callReference,
        ivrStatus: call_status || callStatus || status,
        callDuration: parsedDuration,
        recordingUrl: recording_url || recordingUrl,
        recipientNumber: recipient_number || recipientNumber || phone || customer_phone || customerPhone,
        completedAt: /* @__PURE__ */ new Date(),
        webhookData: req.body
        // Store full payload for debugging
      };
      console.log("\u{1F4CB} Normalized webhook data:", JSON.stringify(normalizedData, null, 2));
      let call;
      let lookupMethod = "none";
      if (normalizedData.callReference) {
        console.log(`\u{1F50D} Looking up call by reference: ${normalizedData.callReference}`);
        call = await storage.getCallByReference(normalizedData.callReference);
        if (call) {
          lookupMethod = "reference";
          console.log(`\u2705 Found call by reference: ${call.id}`);
        } else {
          console.log(`\u26A0\uFE0F  No call found with reference: ${normalizedData.callReference}`);
        }
      }
      if (!call && normalizedData.recipientNumber) {
        console.log(`\u{1F50D} Fallback: Looking up recent call by phone: ${normalizedData.recipientNumber}`);
        call = await storage.getRecentCallByPhone(normalizedData.recipientNumber, 10);
        if (call) {
          lookupMethod = "phone";
          console.log(`\u2705 Found recent call by phone: ${call.id}`);
        } else {
          console.log(`\u26A0\uFE0F  No recent call found for phone: ${normalizedData.recipientNumber}`);
        }
      }
      if (call) {
        const updateData = {
          callDuration: normalizedData.callDuration,
          recordingUrl: normalizedData.recordingUrl,
          callReference: normalizedData.callReference,
          recipientNumber: normalizedData.recipientNumber,
          ivrStatus: normalizedData.ivrStatus,
          completedAt: normalizedData.completedAt,
          webhookData: normalizedData.webhookData
        };
        if (normalizedData.ivrStatus) {
          const statusMap = {
            "completed": "completed",
            "answered": "completed",
            "success": "completed",
            "failed": "failed",
            "no-answer": "failed",
            "busy": "failed",
            "rejected": "failed"
          };
          const mappedStatus = statusMap[normalizedData.ivrStatus.toLowerCase()];
          if (mappedStatus) {
            updateData.callStatus = mappedStatus;
          }
        }
        console.log(`\u{1F4BE} Updating call ${call.id} with data:`, JSON.stringify(updateData, null, 2));
        const updatedCall = await storage.updateCallFromWebhook(call.id, updateData);
        if (updatedCall) {
          console.log("\u2705 Successfully updated call record:", call.id);
          console.log(`   - Recording URL: ${updatedCall.recordingUrl || "N/A"}`);
          console.log(`   - Duration: ${updatedCall.callDuration ? updatedCall.callDuration + "s" : "N/A"}`);
          console.log(`   - Status: ${updatedCall.callStatus}`);
          console.log(`   - IVR Status: ${updatedCall.ivrStatus || "N/A"}`);
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
          console.error("\u274C Failed to update call record - update returned null");
          console.log("========================================");
          return res.status(500).json({
            success: false,
            error: "Database update failed",
            callId: call.id
          });
        }
      } else {
        console.error("\u274C CALL NOT FOUND");
        console.log(`   - Attempted reference lookup: ${normalizedData.callReference || "N/A"}`);
        console.log(`   - Attempted phone lookup: ${normalizedData.recipientNumber || "N/A"}`);
        console.log(`   - Recording URL in payload: ${normalizedData.recordingUrl || "N/A"}`);
        console.log(`   - Duration in payload: ${normalizedData.callDuration || "N/A"}`);
        console.log("   - This call data will NOT be saved");
        console.log("========================================");
        return res.json({
          success: true,
          message: "Webhook received but call record not found",
          note: "Call may not have been initiated through this system",
          searchedReference: normalizedData.callReference,
          searchedPhone: normalizedData.recipientNumber
        });
      }
    } catch (error) {
      console.error("Error processing IVR webhook:", error);
      return res.status(200).json({
        success: false,
        error: "Internal error processing webhook",
        message: error.message
      });
    }
  });
  app2.get("/api/ivr/test-credentials", async (req, res) => {
    try {
      const token = process.env.IVR_API_TOKEN;
      const did = process.env.IVR_DID_NUMBER;
      if (!token || !did) {
        return res.status(500).json({
          success: false,
          configured: false,
          error: "IVR credentials not configured",
          details: {
            hasToken: !!token,
            hasDid: !!did
          },
          nextSteps: [
            "Add IVR_API_TOKEN to Replit Secrets",
            "Add IVR_DID_NUMBER to Replit Secrets",
            "Restart the application"
          ]
        });
      }
      const maskedToken = token.substring(0, 8) + "..." + token.substring(token.length - 4);
      const agents = await storage.listUsers({ role: "agent" });
      const testAgent = agents.find((u) => u.agentExtension);
      const credentialsInfo = {
        configured: true,
        credentials: {
          apiToken: maskedToken,
          tokenLength: token.length,
          didNumber: did,
          testExtension: testAgent?.agentExtension || "No agent extensions configured"
        }
      };
      const ivrApiUrl = "https://api.ivrsolutions.in/api/c2c_post";
      const formData = new URLSearchParams({
        did,
        ext_no: testAgent?.agentExtension || "101",
        phone: "0000000000"
        // Invalid test number
      });
      console.log("\u{1F9EA} Testing IVR credentials:", {
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
          "Authorization": `Bearer ${token}`
        },
        body: formData.toString()
      });
      const ivrData = await ivrResponse.json();
      console.log("\u{1F9EA} IVR API test response:", {
        status: ivrResponse.status,
        data: ivrData
      });
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
        return res.json({
          success: true,
          // Auth worked, just need config
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
    } catch (error) {
      console.error("Error testing IVR credentials:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to test IVR credentials",
        details: error.message
      });
    }
  });
  const { shiprocketService: shiprocketService2 } = await Promise.resolve().then(() => (init_shiprocket(), shiprocket_exports));
  app2.post("/api/shiprocket/orders/:id/create-shipment", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { weight, length, breadth, height, pickupLocation } = req.body;
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (!order.confirmedAt) {
        return res.status(400).json({ error: "Order must be confirmed before creating shipment" });
      }
      const existingShipment = await storage.getShipmentByOrderId(orderId);
      if (existingShipment) {
        return res.status(400).json({ error: "Shipment already exists for this order" });
      }
      const orderItems2 = await storage.getOrderItems(orderId);
      const shipmentPayload = {
        order_id: order.shopifyOrderNumber,
        order_date: order.shopifyCreatedAt.toISOString().split("T")[0],
        pickup_location: pickupLocation || "Primary",
        billing_customer_name: order.customerName.split(" ")[0] || order.customerName,
        billing_last_name: order.customerName.split(" ").slice(1).join(" ") || "",
        billing_address: order.shippingAddressLine1 || "",
        billing_address_2: order.shippingAddressLine2 || "",
        billing_city: order.shippingCity || "",
        billing_pincode: order.shippingPincode || "",
        billing_state: order.shippingState || "",
        billing_country: order.shippingCountry || "India",
        billing_email: order.customerEmail || "",
        billing_phone: order.customerPhone,
        shipping_is_billing: true,
        order_items: orderItems2.map((item) => ({
          name: item.productName,
          sku: item.sku || `SKU-${item.id}`,
          units: item.quantity,
          selling_price: item.price.toString(),
          discount: "0",
          tax: "0"
        })),
        payment_method: order.paymentMethod.toLowerCase() === "cod" ? "COD" : "Prepaid",
        sub_total: parseFloat(order.subtotal.toString()),
        length: length || 10,
        breadth: breadth || 10,
        height: height || 10,
        weight: weight || 0.5
      };
      const shiprocketResponse = await shiprocketService2.createShipment(shipmentPayload);
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
        rawShiprocketData: shiprocketResponse
      });
      await storage.updateOrder(orderId, {
        status: "shipped",
        courierName: shiprocketResponse.courier_name,
        trackingNumber: shiprocketResponse.awb_code
      });
      res.json({ success: true, shipment });
    } catch (error) {
      console.error("Error creating shipment:", error);
      res.status(500).json({ error: error.message || "Failed to create shipment" });
    }
  });
  app2.get("/api/shiprocket/shipments/:awb/track", async (req, res) => {
    try {
      const { awb } = req.params;
      const trackingData = await shiprocketService2.trackShipment(awb);
      const shipment = await storage.getShipmentByAWB(awb);
      if (shipment && trackingData.tracking_data.shipment_track[0]) {
        const latestTrack = trackingData.tracking_data.shipment_track[0];
        await storage.updateShipment(shipment.id, {
          currentStatus: latestTrack.current_status,
          statusUpdatedAt: /* @__PURE__ */ new Date(),
          deliveredAt: latestTrack.delivered_date ? new Date(latestTrack.delivered_date) : void 0
        });
      }
      res.json({ success: true, trackingData });
    } catch (error) {
      console.error("Error tracking shipment:", error);
      res.status(500).json({ error: error.message || "Failed to track shipment" });
    }
  });
  app2.get("/api/ndr", async (req, res) => {
    try {
      const { limit, offset, currentUserId } = req.query;
      const authResult = await enforceAgentReadFilter(
        currentUserId,
        void 0,
        req.storeScope?.storeId
      );
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }
      const result = await storage.listUnresolvedNDREvents({
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
        assignedTo: authResult.assignedTo,
        // Filter by agent if not admin
        storeId: authResult.storeId
        // Phase 2: scope to active store
      });
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
            customerPhone: order?.customerPhone
          };
        })
      );
      res.json({
        events: enrichedEvents,
        total: result.total
      });
    } catch (error) {
      console.error("Error fetching NDR events:", error);
      res.status(500).json({ error: error.message || "Failed to fetch NDR events" });
    }
  });
  app2.get("/api/shiprocket/ndr", async (req, res) => {
    try {
      const { limit, offset } = req.query;
      const result = await storage.listUnresolvedNDREvents({
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0
      });
      res.json(result);
    } catch (error) {
      console.error("Error fetching NDR events:", error);
      res.status(500).json({ error: error.message || "Failed to fetch NDR events" });
    }
  });
  app2.post("/api/ndr/:awb/reattempt", async (req, res) => {
    try {
      const { awb } = req.params;
      const { address1, address2, phone, deferredDate, actionBy, notes } = req.body;
      const shipment = await storage.getShipmentByAWB(awb);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      const courierName = shipment.courierName?.toLowerCase() || "";
      if (courierName.includes("delhivery")) {
        if (!shipment.storeId) {
          return res.status(400).json({ error: "Shipment is missing store context; cannot route Delhivery call" });
        }
        const { getDelhiveryClient: getDelhiveryClient2 } = await Promise.resolve().then(() => (init_delhivery2(), delhivery_exports));
        let delhiveryClient;
        try {
          delhiveryClient = await getDelhiveryClient2(shipment.storeId);
        } catch (e) {
          return res.status(400).json({ error: e?.message || "Delhivery not configured for this store" });
        }
        const hasAddress = Boolean(address1 || address2);
        const hasPhone = Boolean(phone);
        const hasDate = Boolean(deferredDate);
        let actionType = "reattempt";
        const actionData = {};
        if (hasAddress || hasPhone) {
          actionType = "edit";
          if (hasAddress) {
            actionData.address = [address1, address2].filter(Boolean).join(", ");
          }
          if (hasPhone) {
            actionData.phone = phone;
          }
        } else if (hasDate) {
          actionType = "defer";
          actionData.deferredDate = deferredDate;
        }
        console.log(`[NDR Reattempt] AWB: ${awb}, store: ${shipment.storeId}, Action: ${actionType}, Data:`, actionData);
        const result = await delhiveryClient.actionNDR(awb, actionType, actionData);
        if (!result.success) {
          return res.status(500).json({ error: result.error || "Delhivery reattempt failed" });
        }
      } else {
        const shiprocketData = { awb };
        if (address1) shiprocketData.address1 = address1;
        if (address2) shiprocketData.address2 = address2;
        if (phone) shiprocketData.phone = phone;
        if (deferredDate) shiprocketData.deferred_date = deferredDate;
        const result = await shiprocketService2.reattemptDelivery(shiprocketData);
      }
      const ndrEvents2 = await storage.getNDREventsByShipmentId(shipment.id);
      const latestNdr = ndrEvents2[0];
      if (latestNdr) {
        await storage.updateNDREvent(latestNdr.id, {
          actionTaken: "reattempt_scheduled",
          actionBy,
          actionNotes: notes,
          actionAt: /* @__PURE__ */ new Date(),
          reattemptScheduled: true,
          reattemptDate: deferredDate ? new Date(deferredDate) : /* @__PURE__ */ new Date(),
          updatedPhone: phone,
          updatedAddress: { address1, address2 }
        });
      }
      res.json({ success: true, message: "Reattempt scheduled successfully" });
    } catch (error) {
      console.error("Error scheduling reattempt:", error);
      res.status(500).json({ error: error.message || "Failed to schedule reattempt" });
    }
  });
  app2.post("/api/shiprocket/ndr/:awb/reattempt", async (req, res) => {
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
      const result = await shiprocketService2.reattemptDelivery({
        awb,
        address1,
        address2,
        phone,
        deferred_date: deferredDate
      });
      const ndrEvents2 = await storage.getNDREventsByShipmentId(shipment.id);
      const latestNdr = ndrEvents2[0];
      if (latestNdr) {
        await storage.updateNDREvent(latestNdr.id, {
          actionTaken: "reattempt_scheduled",
          actionBy,
          actionNotes: notes,
          actionAt: /* @__PURE__ */ new Date(),
          reattemptScheduled: true,
          reattemptDate: deferredDate ? new Date(deferredDate) : /* @__PURE__ */ new Date(),
          updatedPhone: phone,
          updatedAddress: { address1, address2 }
        });
      }
      res.json({ success: true, message: "Reattempt scheduled successfully" });
    } catch (error) {
      console.error("Error scheduling reattempt:", error);
      res.status(500).json({ error: error.message || "Failed to schedule reattempt" });
    }
  });
  app2.get("/api/shiprocket/test-connection", async (req, res) => {
    try {
      const result = await shiprocketService2.testConnection();
      res.json(result);
    } catch (error) {
      console.error("Error testing Shiprocket connection:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to test connection"
      });
    }
  });
  app2.get("/api/orders/:id/couriers", async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      let shipment = await storage.getShipmentByOrderId(orderId);
      let shiprocketShipmentId = null;
      let shiprocketOrderId = null;
      if (shipment && shipment.shiprocketShipmentId) {
        shiprocketShipmentId = parseInt(shipment.shiprocketShipmentId);
        shiprocketOrderId = shipment.shiprocketOrderId ? parseInt(shipment.shiprocketOrderId) : null;
      }
      if (!shiprocketShipmentId || !shiprocketOrderId) {
        const shiprocketOrder = await shiprocketService2.getOrderDetails(order.shopifyOrderNumber);
        if (!shiprocketOrder) {
          return res.status(404).json({
            error: "Order not found in Shiprocket. Please ensure the order has been synced from Shopify."
          });
        }
        shiprocketShipmentId = shiprocketOrder.shipment_id;
        shiprocketOrderId = shiprocketOrder.order_id;
        const existingShipmentByShiprocketId = await storage.getShipmentByShiprocketShipmentId(shiprocketShipmentId.toString());
        if (existingShipmentByShiprocketId) {
          shipment = existingShipmentByShiprocketId;
          if (!existingShipmentByShiprocketId.shiprocketOrderId) {
            await storage.updateShipment(existingShipmentByShiprocketId.id, {
              shiprocketOrderId: shiprocketOrderId.toString()
            });
          }
        } else if (shipment) {
          await storage.updateShipment(shipment.id, {
            shiprocketShipmentId: shiprocketShipmentId.toString(),
            shiprocketOrderId: shiprocketOrderId.toString()
          });
        } else {
          shipment = await storage.createShipment({
            orderId,
            shopifyOrderId: order.shopifyOrderNumber,
            shiprocketShipmentId: shiprocketShipmentId.toString(),
            shiprocketOrderId: shiprocketOrderId.toString(),
            status: "created",
            weight: "0.5"
            // Default weight (will be overridden by Shiprocket data)
          });
        }
      }
      const couriers = await shiprocketService2.getCouriersForShipment(shiprocketShipmentId, shiprocketOrderId || void 0);
      res.json({ couriers, shipmentId: shiprocketShipmentId });
    } catch (error) {
      console.error("Error fetching available couriers:", error);
      res.status(500).json({ error: error.message || "Failed to fetch available couriers" });
    }
  });
  app2.post("/api/orders/:id/ship", async (req, res) => {
    try {
      const orderId = req.params.id;
      const { courierId, userId } = req.body;
      if (!courierId) {
        return res.status(400).json({ error: "Courier ID is required" });
      }
      if (!userId) {
        return res.status(400).json({ error: "userId is required for authorization" });
      }
      const authCheck = await canUserModifyOrder(userId, orderId);
      if (!authCheck.authorized) {
        return res.status(403).json({ error: authCheck.reason || "You are not authorized to process this order" });
      }
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      let shipment = await storage.getShipmentByOrderId(orderId);
      let shiprocketShipmentId = null;
      let shiprocketOrderId = null;
      if (shipment && shipment.shiprocketShipmentId) {
        shiprocketShipmentId = parseInt(shipment.shiprocketShipmentId);
        shiprocketOrderId = shipment.shiprocketOrderId ? parseInt(shipment.shiprocketOrderId) : null;
      }
      if (!shiprocketShipmentId || !shiprocketOrderId) {
        const shiprocketOrder = await shiprocketService2.getOrderDetails(order.shopifyOrderNumber);
        if (!shiprocketOrder) {
          return res.status(404).json({
            error: "Order not found in Shiprocket. Please ensure the order has been synced from Shopify."
          });
        }
        shiprocketShipmentId = shiprocketOrder.shipment_id;
        shiprocketOrderId = shiprocketOrder.order_id;
        const existingShipmentByShiprocketId = await storage.getShipmentByShiprocketShipmentId(shiprocketShipmentId.toString());
        if (existingShipmentByShiprocketId) {
          shipment = existingShipmentByShiprocketId;
          if (!existingShipmentByShiprocketId.shiprocketOrderId) {
            await storage.updateShipment(existingShipmentByShiprocketId.id, {
              shiprocketOrderId: shiprocketOrderId.toString()
            });
          }
        } else if (shipment) {
          await storage.updateShipment(shipment.id, {
            shiprocketShipmentId: shiprocketShipmentId.toString(),
            shiprocketOrderId: shiprocketOrderId.toString()
          });
        } else {
          shipment = await storage.createShipment({
            orderId,
            shopifyOrderId: order.shopifyOrderNumber,
            shiprocketShipmentId: shiprocketShipmentId.toString(),
            shiprocketOrderId: shiprocketOrderId.toString(),
            status: "created",
            weight: "0.5"
            // Default weight (will be overridden by Shiprocket data)
          });
        }
      }
      if (!shipment) {
        return res.status(500).json({ error: "Failed to create or retrieve shipment record" });
      }
      if (shipment.awb) {
        return res.status(400).json({ error: "This shipment already has an AWB assigned" });
      }
      const assignmentResult = await shiprocketService2.assignCourierAndShip({
        shipment_id: shiprocketShipmentId,
        courier_id: parseInt(courierId)
      });
      if (assignmentResult.message) {
        throw new Error(assignmentResult.message);
      }
      if (!assignmentResult.response?.data) {
        const errorMessage = assignmentResult.errors || assignmentResult.error || "Invalid response from Shiprocket";
        throw new Error(typeof errorMessage === "string" ? errorMessage : JSON.stringify(errorMessage));
      }
      const awbCode = assignmentResult.response.data.awb_code;
      const courierName = assignmentResult.response.data.courier_name;
      const pickupDate = assignmentResult.response.data.pickup_scheduled_date;
      if (!awbCode) {
        const errorMessage = assignmentResult.message || assignmentResult.error || "AWB code not received from Shiprocket";
        throw new Error(typeof errorMessage === "string" ? errorMessage : JSON.stringify(errorMessage));
      }
      await storage.updateShipment(shipment.id, {
        awb: awbCode,
        courierName,
        courierId: assignmentResult.response.data.courier_company_id.toString(),
        pickupScheduledDate: new Date(pickupDate),
        status: "pickup_scheduled"
      });
      res.json({
        success: true,
        awb: awbCode,
        courierName,
        pickupScheduledDate: pickupDate
      });
    } catch (error) {
      console.error("Error assigning courier:", error);
      res.status(500).json({ error: error.message || "Failed to assign courier" });
    }
  });
  app2.post("/api/invites", async (req, res) => {
    try {
      const { invitedBy } = req.body;
      if (!invitedBy) {
        return res.status(400).json({ error: "invitedBy is required" });
      }
      const validatedData = insertInviteSchema.parse(req.body);
      const currentUser = await storage.getUser(invitedBy);
      if (!currentUser) {
        return res.status(404).json({ error: "Current user not found" });
      }
      if (!canInviteTeamMembers(currentUser)) {
        return res.status(403).json({ error: "You don't have permission to invite team members" });
      }
      if (validatedData.role === "admin" && !canInviteAdmins(currentUser)) {
        return res.status(403).json({ error: "Only full control admins can invite other admins" });
      }
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        if (existingUser.isActive) {
          return res.status(409).json({ error: "This user is already active in the system" });
        } else {
          const reactivatedUser = await storage.reactivateUser(existingUser.id, {
            role: validatedData.role,
            adminType: null,
            permissions: null
          });
          console.log(`\u2705 Reactivated user ${validatedData.email}`);
          return res.json({
            message: "User reactivated successfully",
            reactivated: true,
            user: {
              id: reactivatedUser.id,
              email: reactivatedUser.email,
              role: reactivatedUser.role
            }
          });
        }
      }
      const token = crypto7.randomBytes(32).toString("hex");
      const expiresAt = /* @__PURE__ */ new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      const existingInvite = await storage.getInviteByEmail(validatedData.email);
      let invite;
      if (existingInvite) {
        invite = await storage.resetInviteForResend(validatedData.email, {
          token,
          expiresAt,
          role: validatedData.role,
          invitedBy,
          firstName: validatedData.firstName,
          lastName: validatedData.lastName
        });
        console.log(`\u267B\uFE0F Reset existing invite for ${validatedData.email}`);
      } else {
        invite = await storage.createInvite({
          ...validatedData,
          token,
          expiresAt,
          invitedBy
        });
        console.log(`\u{1F4E7} Created new invite for ${validatedData.email}`);
      }
      try {
        await sendInvitationEmail({
          toEmail: validatedData.email,
          inviterName: currentUser.fullName || currentUser.email,
          role: validatedData.role,
          inviteToken: token,
          expiresAt
        });
        console.log(`\u2705 Invitation email sent to ${validatedData.email}`);
      } catch (emailError) {
        console.error("Error sending invitation email:", emailError);
      }
      res.json({
        message: "Invite sent successfully",
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt
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
  app2.patch("/api/invites/:inviteId/permissions", async (req, res) => {
    try {
      const { inviteId } = req.params;
      const { adminType, permissions } = req.body;
      if (!inviteId) {
        return res.status(400).json({ error: "Invite ID is required" });
      }
      const validAdminTypes = ["full_control", "partial_control"];
      if (adminType && !validAdminTypes.includes(adminType)) {
        return res.status(400).json({ error: "Invalid admin type" });
      }
      const invite = await storage.getInvite(inviteId);
      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }
      if (invite.role !== "admin") {
        return res.status(400).json({ error: "Can only set permissions for admin invites" });
      }
      if (adminType === "partial_control" && !permissions) {
        return res.status(400).json({ error: "Permissions are required for partial control admins" });
      }
      const updatedInvite = await storage.updateInvitePermissions(
        inviteId,
        adminType,
        adminType === "partial_control" ? permissions : null
      );
      res.json({
        message: "Permissions updated successfully",
        invite: updatedInvite
      });
    } catch (error) {
      console.error("Error updating invite permissions:", error);
      res.status(500).json({ error: "Failed to update invite permissions" });
    }
  });
  app2.get("/api/invites", async (req, res) => {
    try {
      const invites2 = await storage.listPendingInvites();
      res.json(invites2);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ error: "Failed to fetch invites" });
    }
  });
  app2.post("/api/test-resend", async (req, res) => {
    try {
      const { toEmail } = req.body;
      if (!toEmail) {
        return res.status(400).json({ error: "toEmail is required" });
      }
      console.log(`\u{1F9EA} Testing Resend connection, sending to: ${toEmail}`);
      await sendInvitationEmail({
        toEmail,
        inviterName: "Test User",
        role: "agent",
        inviteToken: "test-token-12345",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3)
      });
      console.log(`\u2705 Test email sent successfully to ${toEmail}`);
      res.json({ success: true, message: "Test email sent successfully" });
    } catch (error) {
      console.error("\u274C Test email failed:", error);
      res.status(500).json({
        error: "Failed to send test email",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  app2.get("/api/invites/verify/:token", async (req, res) => {
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
      if (/* @__PURE__ */ new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({ error: "This invitation has expired" });
      }
      res.json({
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        role: invite.role,
        adminType: invite.adminType,
        permissions: invite.permissions
      });
    } catch (error) {
      console.error("Error verifying invite:", error);
      res.status(500).json({ error: "Failed to verify invite" });
    }
  });
  app2.post("/api/invites/accept", async (req, res) => {
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
      if (/* @__PURE__ */ new Date() > new Date(invite.expiresAt)) {
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
      const hashedPassword = await hashPassword(password);
      const newUser = await storage.createUser({
        email: invite.email,
        username,
        password: hashedPassword,
        fullName,
        phone: phone || null,
        role: invite.role,
        adminType: invite.adminType || null,
        permissions: invite.permissions || null,
        department: null
      });
      await storage.updateInviteStatus(invite.id, "accepted");
      req.session.userId = newUser.id;
      await new Promise(
        (resolve, reject) => req.session.save((err) => err ? reject(err) : resolve())
      );
      res.json({
        message: "Account created successfully",
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          fullName: newUser.fullName,
          role: newUser.role
        }
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });
  app2.get("/api/leave-requests", async (req, res) => {
    try {
      const { userId, status } = req.query;
      const filters = {
        userId,
        status
      };
      const requests = await storage.listLeaveRequests(filters);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching leave requests:", error);
      res.status(500).json({ error: "Failed to fetch leave requests" });
    }
  });
  app2.post("/api/leave-requests", async (req, res) => {
    try {
      const validatedData = insertLeaveRequestSchema.parse(req.body);
      const request = await storage.createLeaveRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error creating leave request:", error);
      res.status(500).json({ error: "Failed to create leave request" });
    }
  });
  app2.patch("/api/leave-requests/:id", async (req, res) => {
    try {
      const { status, reviewedBy, reviewNote } = req.body;
      const request = await storage.updateLeaveRequest(req.params.id, {
        status,
        reviewedBy,
        reviewNote
      });
      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }
      res.json(request);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating leave request:", error);
      res.status(500).json({ error: "Failed to update leave request" });
    }
  });
  app2.delete("/api/leave-requests/:id", async (req, res) => {
    try {
      const request = await storage.getLeaveRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Leave request not found" });
      }
      await storage.deleteLeaveRequest(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting leave request:", error);
      res.status(500).json({ error: "Failed to delete leave request" });
    }
  });
  app2.get("/api/messages/:userId/:otherUserId", async (req, res) => {
    try {
      const messages = await storage.getConversation(
        req.params.userId,
        req.params.otherUserId
      );
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });
  app2.post("/api/messages", async (req, res) => {
    try {
      const { fromUserId, toUserId, message } = req.body;
      const newMessage = await storage.createMessage({
        fromUserId,
        toUserId,
        message
      });
      res.status(201).json(newMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
  app2.patch("/api/messages/:id/read", async (req, res) => {
    try {
      await storage.markMessageAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking message as read:", error);
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  });
  app2.get("/api/messages/unread/:userId", async (req, res) => {
    try {
      const count2 = await storage.getUnreadCount(req.params.userId);
      res.json({ count: count2 });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });
  app2.get("/api/notifications", async (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter is required" });
      }
      const unreadOnly = req.query.unreadOnly === "true";
      const notifications2 = await storage.getUserNotifications(userId, unreadOnly);
      res.json(notifications2);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });
  app2.get("/api/notifications/unread-count", async (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter is required" });
      }
      const count2 = await storage.getUnreadNotificationCount(userId);
      res.json({ count: count2 });
    } catch (error) {
      console.error("Error fetching unread notification count:", error);
      res.status(500).json({ error: "Failed to fetch unread notification count" });
    }
  });
  app2.patch("/api/notifications/:id/read", async (req, res) => {
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
  app2.patch("/api/notifications/read-all", async (req, res) => {
    try {
      const userId = req.body.userId;
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
  app2.get("/api/learning/courses", async (req, res) => {
    try {
      const { category, isPublished } = req.query;
      let publishedFilter;
      if (isPublished === "all") {
        publishedFilter = void 0;
      } else if (isPublished === "false") {
        publishedFilter = false;
      } else if (isPublished === "true") {
        publishedFilter = true;
      } else {
        publishedFilter = true;
      }
      const courses2 = await storage.listCourses({
        category,
        isPublished: publishedFilter
      });
      const userId = req.query.userId;
      const coursesWithProgress = await Promise.all(
        courses2.map(async (course) => {
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
  app2.get("/api/learning/courses/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const userId = req.query.userId;
      const course = await storage.getCourseBySlug(slug);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }
      const lessons2 = await storage.getLessonsByCourse(course.id, true);
      let userProgress = null;
      let lessonProgress = [];
      if (userId) {
        userProgress = await storage.getUserCourseProgress(userId, course.id);
        lessonProgress = await Promise.all(
          lessons2.map(async (lesson) => {
            const progress = await storage.getUserLessonProgress(userId, lesson.id);
            return progress || null;
          })
        );
      }
      res.json({
        course,
        lessons: lessons2,
        userProgress,
        lessonProgress
      });
    } catch (error) {
      console.error("Error fetching course:", error);
      res.status(500).json({ error: "Failed to fetch course" });
    }
  });
  app2.get("/api/learning/lessons/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const userId = req.query.userId;
      const lesson = await storage.getLessonBySlug(slug);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }
      const course = await storage.getCourse(lesson.courseId);
      let userProgress = null;
      if (userId) {
        userProgress = await storage.getUserLessonProgress(userId, lesson.id);
        await storage.incrementLessonView(lesson.id, userId);
      }
      const analytics = await storage.getLessonAnalytics(lesson.id);
      res.json({
        lesson,
        course,
        userProgress,
        analytics
      });
    } catch (error) {
      console.error("Error fetching lesson:", error);
      res.status(500).json({ error: "Failed to fetch lesson" });
    }
  });
  app2.post("/api/learning/lessons/:lessonId/progress", async (req, res) => {
    try {
      const { lessonId } = req.params;
      const { userId, completionPercentage, timeSpent, videoProgress, isCompleted } = req.body;
      if (!userId || !lessonId) {
        return res.status(400).json({ error: "userId and lessonId are required" });
      }
      const updateData = {
        userId,
        lessonId,
        lastAccessedAt: /* @__PURE__ */ new Date()
      };
      if (completionPercentage !== void 0) {
        updateData.completionPercentage = completionPercentage;
      }
      if (timeSpent !== void 0) {
        updateData.timeSpent = timeSpent;
      }
      if (videoProgress !== void 0) {
        updateData.videoProgress = videoProgress;
      }
      if (isCompleted !== void 0) {
        updateData.isCompleted = isCompleted;
        if (isCompleted) {
          updateData.completedAt = /* @__PURE__ */ new Date();
        }
      }
      const progress = await storage.createOrUpdateLessonProgress(updateData);
      res.json({ progress });
    } catch (error) {
      console.error("Error updating progress:", error);
      res.status(500).json({ error: "Failed to update progress" });
    }
  });
  app2.post("/api/learning/lessons/:lessonId/bookmark", async (req, res) => {
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
  app2.get("/api/learning/resources", async (req, res) => {
    try {
      const { type, category } = req.query;
      const resources2 = await storage.listResources({
        type,
        category
      });
      res.json({ resources: resources2 });
    } catch (error) {
      console.error("Error listing resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });
  app2.post("/api/learning/resources/:resourceId/download", async (req, res) => {
    try {
      const { resourceId } = req.params;
      await storage.incrementResourceDownload(resourceId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking download:", error);
      res.status(500).json({ error: "Failed to track download" });
    }
  });
  app2.get("/api/learning/onboarding/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const progress = await storage.getUserOnboardingProgress(userId);
      if (!progress) {
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        const checklist2 = await storage.getOnboardingChecklistByRole(user.role);
        if (checklist2) {
          const newProgress = await storage.createUserOnboardingProgress({
            userId,
            checklistId: checklist2.id,
            progress: {},
            completionPercentage: 0
          });
          return res.json({ progress: newProgress, checklist: checklist2 });
        }
        return res.json({ progress: null, checklist: null });
      }
      const checklist = await storage.getOnboardingChecklist(progress.checklistId);
      res.json({ progress, checklist });
    } catch (error) {
      console.error("Error fetching onboarding progress:", error);
      res.status(500).json({ error: "Failed to fetch onboarding progress" });
    }
  });
  app2.get("/api/admin/learning/courses/:courseId", async (req, res) => {
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
  app2.get("/api/admin/learning/courses/:courseId/lessons", async (req, res) => {
    try {
      const { courseId } = req.params;
      const lessons2 = await storage.getLessonsByCourse(courseId);
      res.json({ lessons: lessons2 });
    } catch (error) {
      console.error("Error fetching lessons:", error);
      res.status(500).json({ error: "Failed to fetch lessons" });
    }
  });
  app2.post("/api/admin/learning/courses", async (req, res) => {
    try {
      const course = await storage.createCourse(req.body);
      res.json({ course });
    } catch (error) {
      console.error("Error creating course:", error);
      res.status(500).json({ error: "Failed to create course" });
    }
  });
  app2.patch("/api/admin/learning/courses/:courseId", async (req, res) => {
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
  app2.delete("/api/admin/learning/courses/:courseId", async (req, res) => {
    try {
      const { courseId } = req.params;
      await storage.deleteCourse(courseId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting course:", error);
      res.status(500).json({ error: "Failed to delete course" });
    }
  });
  app2.get("/api/admin/learning/lessons/:lessonId", async (req, res) => {
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
  app2.post("/api/admin/learning/lessons", async (req, res) => {
    try {
      const lesson = await storage.createLesson(req.body);
      res.json({ lesson });
    } catch (error) {
      console.error("Error creating lesson:", error);
      res.status(500).json({ error: "Failed to create lesson" });
    }
  });
  app2.patch("/api/admin/learning/lessons/:lessonId", async (req, res) => {
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
  app2.post("/api/admin/learning/resources", async (req, res) => {
    try {
      const resource = await storage.createResource(req.body);
      res.json({ resource });
    } catch (error) {
      console.error("Error creating resource:", error);
      res.status(500).json({ error: "Failed to create resource" });
    }
  });
  app2.get("/api/analytics/rto-insights", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const startDateParsed = startDate && typeof startDate === "string" && startDate.trim() ? new Date(startDate) : null;
      const endDateParsed = endDate && typeof endDate === "string" && endDate.trim() ? new Date(endDate) : null;
      const conditions = [];
      if (req.storeScope?.storeId) {
        conditions.push(eq7(orders.storeId, req.storeScope.storeId));
      }
      if (startDateParsed && !isNaN(startDateParsed.getTime())) {
        conditions.push(gte2(orders.createdAt, startDateParsed));
      }
      if (endDateParsed && !isNaN(endDateParsed.getTime())) {
        conditions.push(lte2(orders.createdAt, endDateParsed));
      }
      const baseSelect = db.select({
        id: orders.id,
        status: orders.status,
        shipmentStatus: orders.shipmentStatus,
        totalPrice: orders.totalPrice,
        shippingCity: orders.shippingCity,
        courierName: orders.courierName,
        assignedTo: orders.assignedTo,
        createdAt: orders.createdAt,
        fulfillmentStatus: orders.fulfillmentStatus
      }).from(orders);
      const allOrders = conditions.length > 0 ? await baseSelect.where(and4(...conditions)) : await baseSelect;
      const shippedOrders = allOrders.filter(
        (o) => o.fulfillmentStatus === "fulfilled" || o.fulfillmentStatus === "partial" || o.shipmentStatus
      );
      const rtoOrders = allOrders.filter(
        (o) => o.status === "rto_initiated" || o.status === "rto_delivered" || o.shipmentStatus?.toUpperCase() === "RTO"
      );
      const rtoInTransit = rtoOrders.filter(
        (o) => o.status === "rto_initiated"
      );
      const rtoDelivered = rtoOrders.filter(
        (o) => o.status === "rto_delivered"
      );
      const totalShipped = shippedOrders.length;
      const totalRtoCount = rtoOrders.length;
      const overallRtoRate = totalShipped > 0 ? Math.round(totalRtoCount / totalShipped * 1e4) / 100 : 0;
      const rtoRevenueLoss = rtoOrders.reduce((sum, o) => {
        const price = parseFloat(o.totalPrice?.toString() || "0");
        return sum + price;
      }, 0);
      const weekCohorts = {};
      rtoOrders.forEach((o) => {
        if (!o.createdAt) return;
        const date2 = new Date(o.createdAt);
        const year = date2.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const weekNumber = Math.ceil(
          ((date2.getTime() - startOfYear.getTime()) / 864e5 + startOfYear.getDay() + 1) / 7
        );
        const weekKey = `${year} W${weekNumber}`;
        const sortKey = year * 100 + weekNumber;
        if (!weekCohorts[weekKey]) {
          weekCohorts[weekKey] = { in_transit_count: 0, delivered_count: 0, sortKey };
        }
        const isDelivered = o.status?.toUpperCase() === "RTO" || o.status?.toLowerCase() === "returned";
        if (isDelivered) {
          weekCohorts[weekKey].delivered_count++;
        } else {
          weekCohorts[weekKey].in_transit_count++;
        }
      });
      const weeklyCohorts = Object.entries(weekCohorts).map(([week, { in_transit_count, delivered_count, sortKey }]) => ({
        week,
        in_transit_count,
        delivered_count
      })).sort((a, b) => {
        const [yearA, weekA] = a.week.split(" W").map(Number);
        const [yearB, weekB] = b.week.split(" W").map(Number);
        return yearA * 100 + weekA - (yearB * 100 + weekB);
      });
      const cityCounts = {};
      rtoOrders.forEach((o) => {
        const city = o.shippingCity || "Unknown";
        cityCounts[city] = (cityCounts[city] || 0) + 1;
      });
      const topCities = Object.entries(cityCounts).map(([city, count2]) => ({ city, count: count2 })).sort((a, b) => b.count - a.count).slice(0, 5);
      const courierCounts = {};
      rtoOrders.forEach((o) => {
        const courier = o.courierName || "Unknown";
        courierCounts[courier] = (courierCounts[courier] || 0) + 1;
      });
      const topCouriers = Object.entries(courierCounts).map(([courier, count2]) => ({ courier, count: count2 })).sort((a, b) => b.count - a.count).slice(0, 5);
      const agentCounts = {};
      rtoOrders.forEach((o) => {
        if (o.assignedTo) {
          agentCounts[o.assignedTo] = (agentCounts[o.assignedTo] || 0) + 1;
        }
      });
      const agentIds = Object.keys(agentCounts);
      const agentUsers = agentIds.length > 0 ? await db.select({ id: users.id, name: users.fullName }).from(users).where(sql6`${users.id} = ANY(${agentIds})`) : [];
      const agentNameMap = new Map(agentUsers.map((u) => [u.id, u.name]));
      const topAgents = Object.entries(agentCounts).map(([agentId, count2]) => ({
        agent_id: agentId,
        agent_name: agentNameMap.get(agentId) || "Unknown Agent",
        count: count2
      })).sort((a, b) => b.count - a.count).slice(0, 5);
      res.json({
        kpis: {
          overall_rto_rate: overallRtoRate,
          total_rto_count: totalRtoCount,
          rto_in_transit_count: rtoInTransit.length,
          rto_delivered_count: rtoDelivered.length,
          rto_revenue_loss: Math.round(rtoRevenueLoss * 100) / 100,
          total_shipped: totalShipped
        },
        weekly_cohorts: weeklyCohorts,
        top_offenders: {
          top_cities: topCities,
          top_couriers: topCouriers,
          top_agents: topAgents
        }
      });
    } catch (error) {
      console.error("Error fetching RTO insights:", error);
      res.status(500).json({ error: "Failed to fetch RTO insights" });
    }
  });
  const notifiedFollowups = /* @__PURE__ */ new Set();
  async function checkDueFollowups() {
    try {
      const dueOrders = await storage.getDueFollowups();
      for (const order of dueOrders) {
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
            isRead: false
          });
          notifiedFollowups.add(followupKey);
        }
      }
    } catch (error) {
      console.error("Error checking due follow-ups:", error);
    }
  }
  setInterval(checkDueFollowups, 6e4);
  checkDueFollowups();
  app2.get("/api/webhooks-config", async (_req, res) => {
    try {
      const allWebhooks = await db.select().from(webhooks).orderBy(desc2(webhooks.createdAt));
      res.json(allWebhooks);
    } catch (error) {
      console.error("Error fetching webhooks:", error);
      res.status(500).json({ error: "Failed to fetch webhooks" });
    }
  });
  app2.post("/api/webhooks-config", async (req, res) => {
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
  app2.delete("/api/webhooks-config/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid webhook ID" });
      await db.delete(webhooks).where(eq7(webhooks.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting webhook:", error);
      res.status(500).json({ error: "Failed to delete webhook" });
    }
  });
  app2.post("/api/webhooks/telecrm", async (req, res) => {
    try {
      const payload = req.body;
      const eventType = payload?.event || payload?.type || payload?.event_type || null;
      await storage.createInboundWebhookLog({
        source: "telecrm",
        eventType: typeof eventType === "string" ? eventType : null,
        payload
      });
      console.log("TeleCRM webhook received and logged:", eventType || "unknown event");
      const rawOrderId = payload["lead.order_id"];
      if (!rawOrderId) {
        return res.status(200).json({ success: true, updated: false });
      }
      const order = await storage.getOrderByShopifyOrderNumber(String(rawOrderId));
      if (!order) {
        return res.status(200).json({ success: true, updated: false });
      }
      const updateData = {};
      const incomingStatus = payload["lead.call_status"];
      if (incomingStatus) {
        const mappedStatus = incomingStatus === "Followup" ? "Follow Up" : incomingStatus;
        if (mappedStatus !== order.callStatus) {
          updateData.callStatus = mappedStatus;
        }
      }
      const incomingNotes = payload["notes"];
      if (typeof incomingNotes === "string" && incomingNotes.trim() !== "") {
        const existingNotes = order.notes ?? "";
        if (!existingNotes.includes(incomingNotes.trim())) {
          updateData.notes = existingNotes + `
TeleCRM: ${incomingNotes.trim()}`;
        }
      }
      const incomingAddress = payload["address"];
      if (typeof incomingAddress === "string" && incomingAddress.trim() !== "") {
        if (incomingAddress.trim() !== order.shippingAddressLine1) {
          updateData.shippingAddressLine1 = incomingAddress.trim();
          updateData.shippingAddressLine2 = null;
        }
      }
      if (Object.keys(updateData).length === 0) {
        return res.status(200).json({ success: true, updated: false });
      }
      await storage.updateOrder(order.id, updateData);
      return res.status(200).json({ success: true, updated: true });
    } catch (err) {
      console.error("Error processing TeleCRM webhook:", err);
    }
    res.status(200).json({ success: true });
  });
  app2.get("/api/webhook-logs", async (_req, res) => {
    try {
      const logs = await storage.getInboundWebhookLogs(50);
      res.json(logs);
    } catch (err) {
      console.error("Error fetching webhook logs:", err);
      res.status(500).json({ error: "Failed to fetch webhook logs" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express2 from "express";
import fs5 from "fs";
import path4 from "path";
import { nanoid } from "nanoid";
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteLogger = createLogger();
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path4.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs5.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path4.resolve(import.meta.dirname, "public");
  if (!fs5.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express2.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path4.resolve(distPath, "index.html"));
  });
}

// server/index.ts
init_storage();
init_db();
init_shopify();
var NEON_WS_FINGERPRINT = "Cannot set property message of #<ErrorEvent>";
process.on("uncaughtException", (err) => {
  if (err?.message?.includes(NEON_WS_FINGERPRINT)) {
    console.warn(
      "[neon-ws] transient WebSocket flicker (pool will reconnect on next query)"
    );
    return;
  }
  console.error("Uncaught exception (server staying alive):", err.message);
  console.error("Stack:", err.stack);
});
process.on("unhandledRejection", (reason) => {
  const msg = reason?.message ?? String(reason);
  if (typeof msg === "string" && msg.includes(NEON_WS_FINGERPRINT)) {
    console.warn(
      "[neon-ws] transient WebSocket flicker (rejected; pool will reconnect)"
    );
    return;
  }
  console.error("Unhandled rejection (server staying alive):", reason);
});
var app = express3();
app.set("trust proxy", 1);
app.use(
  express3.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express3.urlencoded({ extended: false }));
var PgSession = connectPgSimple(session);
var sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error(
    "SESSION_SECRET must be set. Generate a long random string and add it to your .env."
  );
}
app.use(
  session({
    store: new PgSession({
      pool,
      // neon-serverless Pool is node-postgres compatible
      tableName: "session",
      createTableIfMissing: true
    }),
    name: "orderflow.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1e3 * 60 * 60 * 24 * 7
      // 7 days
    }
  })
);
app.use((req, _res, next) => {
  const sessionUserId = req.session?.userId;
  if (sessionUserId) {
    req.query.currentUserId = sessionUserId;
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      req.body.currentUserId = sessionUserId;
    }
  }
  next();
});
app.use(attachStoreScope);
app.use((req, res, next) => {
  const start = Date.now();
  const path5 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path5.startsWith("/api")) {
      let logLine = `${req.method} ${path5} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
async function registerAllWebhooks() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.warn(
      "\u26A0 [webhook-register] APP_URL not set \u2014 skipping Shopify webhook auto-registration."
    );
    console.warn(
      "  Set APP_URL in .env to the publicly-reachable URL Shopify should call"
    );
    console.warn(
      "  (e.g. APP_URL=https://abc123.ngrok.io for local dev, or your Vercel"
    );
    console.warn(
      "  domain in prod). Without this, you must register webhooks manually"
    );
    console.warn("  or rely on the n8n relay documented in /settings/shopify/webhooks.");
    return;
  }
  if (!/^https:\/\//i.test(appUrl)) {
    console.warn(
      `\u26A0 [webhook-register] APP_URL must be HTTPS (got: ${appUrl}). Skipping.`
    );
    console.warn(
      "  Shopify requires HTTPS for webhook endpoints. Use ngrok locally."
    );
    return;
  }
  console.log(`[webhook-register] Registering Shopify webhooks for ${appUrl}\u2026`);
  try {
    const client = await getLegacyStoreShopifyClient();
    const { topics } = await client.registerAllWebhooks(appUrl);
    const summary = topics.map((t) => `  ${t.action.padEnd(9)} ${t.topic.padEnd(22)} \u2192 ${t.address}${t.error ? `  (${t.error})` : ""}`).join("\n");
    console.log(`[webhook-register] Done.
${summary}`);
    const failed = topics.filter((t) => t.action === "failed");
    if (failed.length > 0) {
      console.warn(
        `\u26A0 [webhook-register] ${failed.length} topic(s) failed \u2014 check Shopify credentials and webhook scopes.`
      );
    }
  } catch (err) {
    console.error(
      "\u2717 [webhook-register] Unexpected failure:",
      err?.message ?? err
    );
    console.warn("  Server continuing; webhooks can be re-registered via the UI.");
  }
}
var ready = (async () => {
  await storage.seedDefaultSettings();
  registerAllWebhooks().catch((err) => {
    console.error("[webhook-register] uncaught:", err);
  });
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error("Express error:", err.message || err);
  });
  if (app.get("env") === "development" && !process.env.VERCEL) {
    await setupVite(app, server);
  } else if (!process.env.VERCEL) {
    serveStatic(app);
  }
  if (!process.env.VERCEL) {
    const port = parseInt(process.env.PORT || "5000", 10);
    const listenOptions = {
      port,
      host: "0.0.0.0"
    };
    if (process.platform === "linux") {
      listenOptions.reusePort = true;
    }
    server.listen(listenOptions, () => {
      log(`serving on port ${port}`);
    });
    let shuttingDown = false;
    const shutdown = async (signal) => {
      if (shuttingDown) {
        console.warn(`[${signal}] received twice; forcing exit`);
        process.exit(1);
      }
      shuttingDown = true;
      console.log(`[${signal}] graceful shutdown started`);
      const closePromise = new Promise((resolve) => {
        server.close((err) => {
          if (err) console.warn(`[${signal}] server.close error:`, err.message);
          else console.log(`[${signal}] http listener closed`);
          resolve();
        });
      });
      const ceiling = new Promise(
        (resolve) => setTimeout(() => {
          console.warn(`[${signal}] http close timed out (5s); proceeding`);
          resolve();
        }, 5e3)
      );
      await Promise.race([closePromise, ceiling]);
      try {
        await pool.end();
        console.log(`[${signal}] db pool drained`);
      } catch (err) {
        console.warn(`[${signal}] pool.end error:`, err?.message ?? err);
      }
      console.log(`[${signal}] shutdown complete`);
      process.exit(0);
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  }
  return app;
})();
var index_default = app;

// server/api-handler.ts
async function handler(req, res) {
  await ready;
  return index_default(req, res);
}
export {
  handler as default
};
