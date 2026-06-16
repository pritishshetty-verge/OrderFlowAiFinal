import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { createServer, type Server } from "http";
import crypto from "node:crypto";
import { generatePayuHash, verifyPayuHash, getPayuKey, RETURN_FEE_AMOUNT } from "./services/payu";
import { storage } from "./storage";
import { db } from "./db";
import {
  orders, leaveRequests, orderStatusHistory, teamMessages, invites,
  attendance, orderAssignments, calls, notifications, ndrEvents,
  courses, resources, userLessonProgress, userOnboardingProgress, users,
  webhooks, insertWebhookSchema, stores, userStores,
  RETURN_STATUSES,
  type MetaAdAccountConfig,
  type InsertReturn,
  type InsertReturnItem,
} from "@shared/schema";
import { eq, or, sql, desc, gte, lte, and, asc } from "drizzle-orm";
import { triggerWebhooks } from "./services/webhooks";
import { handleOrderCreated, handleOrderUpdated, handleOrderCancelled, handleFulfillmentUpdate } from "./webhooks";
import { shopifyClient, getShopifyClient } from "./shopify";
import { requireStoreScope } from "./storeScope";
import { insertOrderSchema, insertLeaveRequestSchema, insertUserSchema, updateUserSchema, insertShopifyCredentialsSchema, insertInviteSchema, insertAttendanceSchema } from "@shared/schema";
import { ZodError } from "zod";
import { encrypt, decrypt } from "./encryption";
import { OrderAssignmentEngine } from "./assignment";
import axios from "axios";
import { sendInvitationEmail } from "./resend";
import { kycUpload, resolveKycFilePath, KYC_UPLOAD_DIR } from "./upload";
import { getPareMetrics } from "./services/analytics";
import { hashPassword, verifyPassword } from "./auth";
import fs from "fs";
import path from "path";
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
  isAdmin,
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

// ============================================================================
// SHOPIFY SYNC — LIVE STATE
// ============================================================================
// Module-level singleton that tracks the in-flight Shopify sync so the
// frontend can poll GET /api/shopify/sync/status and render real-time
// progress. This intentionally lives in process memory — on Vercel it
// resets per cold-start invocation, which is fine because the historical
// sync is a manual, local-dev operation.

type ShopifySyncError = { orderId: string; reason: string };
type ShopifySyncState = {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  syncedCount: number;
  skippedCount: number;
  failedCount: number;
  totalFetched: number;
  pagesFetched: number;
  lastSinceId: string | null;
  errors: ShopifySyncError[];
  errorsTruncated: boolean;
  lastError: string | null;
  reachedMaxPages: boolean;
};

// Cap errors to protect memory on long-running syncs. 5,000 rows × ~200
// bytes each ≈ 1 MB worst case.
const SHOPIFY_SYNC_ERROR_CAP = 5000;

const shopifySyncState: ShopifySyncState = {
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
  reachedMaxPages: false,
};

function resetShopifySyncState() {
  shopifySyncState.isRunning = true;
  shopifySyncState.startedAt = new Date().toISOString();
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

function recordShopifySyncError(orderId: string, reason: string) {
  if (shopifySyncState.errors.length < SHOPIFY_SYNC_ERROR_CAP) {
    shopifySyncState.errors.push({ orderId, reason });
  } else {
    shopifySyncState.errorsTruncated = true;
  }
}

// ─────────────────────────────────────────────────────────────────────
// User-object response sanitizers
//
// Two layers of protection on every endpoint that returns a `User`:
//
//   1. stripPassword(): drops `users.password` unconditionally. Even
//      admins should never receive this field over the wire — there is
//      no legitimate UI that needs it, and once it's on the client
//      it's leaked into devtools / network tabs / browser caches.
//      (Reminder: passwords are still stored as plaintext in the DB
//      until a bcrypt migration lands. Once they're hashed, the API
//      contract here doesn't change — we still drop the field.)
//
//   2. redactPayrollForAgent(): when the requester is NOT an admin,
//      additionally drops `baseSalary`, `compensationProfile`, and
//      `holidayState`. These were leaking through the team-directory
//      list endpoint and exposing teammates' compensation. The
//      team-directory UI was patched in the previous commit; this
//      adds the matching server-side scrub so a curious agent can't
//      pull the data via devtools.
//
// Both helpers accept either a single user or a list. Callers that
// already do an explicit allowlist projection (e.g. /api/users/agents)
// don't need these helpers but stay consistent if they migrate later.
// ─────────────────────────────────────────────────────────────────────

type UserRecord = Record<string, any>;

function stripPassword<T extends UserRecord | undefined | null>(user: T): T {
  if (!user) return user;
  // Avoid mutating the row object in case it's referenced elsewhere
  // (e.g. cached by storage). Return a shallow copy without password.
  const { password: _password, ...rest } = user as UserRecord;
  return rest as T;
}

function redactPayrollForAgent<T extends UserRecord | undefined | null>(
  user: T,
): T {
  if (!user) return user;
  const cleaned = stripPassword(user) as UserRecord;
  delete cleaned.baseSalary;
  delete cleaned.compensationProfile;
  delete cleaned.holidayState;
  return cleaned as T;
}

/**
 * Resolve the `currentUserId` query parameter to a User and decide
 * whether the requester should see admin-scoped fields. We treat any
 * absent / unresolvable / non-admin requester as "agent" so the safe
 * default is redaction. This intentionally never throws — callers
 * apply the returned scrub function blindly to the response payload.
 */
async function resolveUserScrub(req: any): Promise<{
  isAdmin: boolean;
  scrub: <T extends UserRecord | undefined | null>(u: T) => T;
}> {
  const currentUserId =
    typeof req.query?.currentUserId === "string"
      ? req.query.currentUserId
      : typeof req.body?.currentUserId === "string"
        ? req.body.currentUserId
        : null;
  if (!currentUserId) {
    return { isAdmin: false, scrub: redactPayrollForAgent };
  }
  const requester = await storage.getUser(currentUserId);
  if (requester && isAdmin(requester)) {
    return { isAdmin: true, scrub: stripPassword };
  }
  return { isAdmin: false, scrub: redactPayrollForAgent };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // HEALTH CHECK
  // ============================================================================
  //
  // Lightweight liveness + DB reachability probe. Hits `SELECT 1` so a
  // 200 here means both the Node process is up *and* the Neon
  // connection pool is producing fresh rows. Anything else returns a
  // 503 with a brief reason so it's safe to wire to a load-balancer
  // healthcheck or a status-page monitor.
  app.get("/api/health", async (_req, res) => {
    try {
      const r: any = await db.execute(sql`SELECT 1 AS ok`);
      const ok = ((r as any).rows ?? r)[0]?.ok === 1;
      res.status(ok ? 200 : 503).json({
        status: ok ? "ok" : "degraded",
        db: ok ? "reachable" : "unexpected-response",
        ts: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(503).json({
        status: "degraded",
        db: "unreachable",
        error: err?.message ?? String(err),
        ts: new Date().toISOString(),
      });
    }
  });

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
  // Roles with admin-equivalent READ access on the order surface.
  // Listed users see every order regardless of assignment, the same
  // way an admin does. They do NOT inherit modify privileges —
  // canUserAccessOrder (the modify gate) still requires assignment
  // ownership for these roles.
  //
  //   admin         — full read + write
  //   chat_support  — full read only (per role-brief: "view ALL
  //                    orders, exactly like an Admin")
  //
  // Add a new role here when it should have org-wide read scope on
  // /api/orders and /api/orders/:id without needing the Global View
  // scope=global toggle.
  const ORDER_FULL_READ_ROLES: ReadonlySet<string> = new Set([
    "admin",
    "chat_support",
  ]);
  const hasFullOrderReadAccess = (user: { role?: string } | null | undefined) =>
    !!user && typeof user.role === "string" && ORDER_FULL_READ_ROLES.has(user.role);

  async function buildOrderReadScope(
    requestingUserId: string | undefined,
    requestedScope: OrderReadScope,
    requestedAssignedTo: string | undefined,
    storeId?: string,
  ): Promise<{ assignedTo: string | undefined; storeId: string | undefined; isAdmin: boolean; unauthorized: boolean; reason?: string }> {
    // SECURITY: currentUserId is REQUIRED - never allow access without verified user identity
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
      // Unknown user - reject access
      return {
        assignedTo: "__UNAUTHORIZED__",
        storeId,
        isAdmin: false,
        unauthorized: true,
        reason: "User not found"
      };
    }

    // Roles with admin-equivalent read scope. The `isAdmin` flag in
    // the return value preserves its original meaning (true ONLY for
    // role==='admin') because downstream callers use it for write-
    // path decisions where chat_support must NOT be elevated.
    // Read-side filters use the bypassed-assignedTo result, which is
    // what gives chat_support the full list.
    if (hasFullOrderReadAccess(user)) {
      return {
        assignedTo: requestedAssignedTo,
        storeId,
        isAdmin: user.role === "admin",
        unauthorized: false,
      };
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
    //
    // The `storeId` filter is orthogonal to the assignedTo decision —
    // it's always applied when present, so the agent's "Global View"
    // is still scoped to their active store.
    // =========================================================================

    if (requestedScope === 'global') {
      // Agent requested Global View - allow seeing all orders (in their store)
      // Note: They still cannot MODIFY orders they don't own (canUserAccessOrder blocks that)
      return { assignedTo: undefined, storeId, isAdmin: false, unauthorized: false };
    }

    // Default: Personal view - only show agent's assigned orders
    // This is the safe default that fixes the Resume bug
    return { assignedTo: requestingUserId, storeId, isAdmin: false, unauthorized: false };
  }
  
  /**
   * Legacy wrapper for enforceAgentReadFilter - calls buildOrderReadScope with default scope.
   * Used by endpoints that don't support Global View (like NDR, OFD).
   */
  async function enforceAgentReadFilter(
    requestingUserId: string | undefined,
    requestedAssignedTo: string | undefined,
    storeId?: string,
  ): Promise<{ assignedTo: string | undefined; storeId: string | undefined; isAdmin: boolean; unauthorized: boolean; reason?: string }> {
    // For legacy callers, always use 'assigned' scope (no global view)
    return buildOrderReadScope(requestingUserId, 'assigned', requestedAssignedTo, storeId);
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
    scope: string | undefined,
    activeStoreId?: string,
  ): Promise<{ authorized: boolean; reason?: string; isAdmin: boolean }> {
    if (!userId) {
      return { authorized: false, reason: "User ID is required for authorization", isAdmin: false };
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return { authorized: false, reason: "User not found", isAdmin: false };
    }

    // Phase 2: cross-store containment.
    //
    // When the caller has an active store scope, we fetch the order
    // up front and reject if it belongs to a different store — even
    // for admins, who still must point their store-switcher at the
    // right shop to see the data. This is the cheapest place to
    // enforce "your URL says order X but X lives in a different
    // tenant" without re-doing the check at every callsite.
    //
    // Orders whose storeId is still NULL (pre-backfill rows that
    // somehow slipped through) are allowed through — the legacy
    // single-store contract is preserved.
    const order = await storage.getOrder(orderId);
    if (!order) {
      return { authorized: false, reason: "Order not found", isAdmin: false };
    }
    if (activeStoreId && order.storeId && order.storeId !== activeStoreId) {
      return {
        authorized: false,
        reason: "Order does not belong to the active store",
        isAdmin: user.role === "admin",
      };
    }

    // Admin-equivalent read: admins AND chat_support can read any
    // order within the current store scope without needing
    // scope=global. The `isAdmin` field in the return value still
    // reflects the literal role check so write-path decisions
    // downstream don't accidentally elevate chat_support. Modify
    // gates (canUserAccessOrder) still block chat_support from
    // changing anything.
    if (hasFullOrderReadAccess(user)) {
      return { authorized: true, isAdmin: user.role === "admin" };
    }

    // GLOBAL VIEW: Agent explicitly requested global scope - allow reading any order
    // Note: Write protection (canUserModifyOrder) still blocks modifications
    if (scope === 'global') {
      return { authorized: true, isAdmin: false };
    }

    // DEFAULT: Personal view - verify agent owns this order
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

  // ── Admin: force re-registration of Shopify webhooks ──────────────
  // Reuses the same idempotent path as the boot-time hook. Safe to
  // call repeatedly — topics already registered at the same address
  // report back as "unchanged".
  //
  // Phase 5 hardening:
  //   • Requires a session (was previously unauthenticated — the
  //     stale TODO that said "tighten when JWT/session auth lands"
  //     pre-dates Phase 0's session middleware).
  //   • Requires admin role.
  //   • Requires an active store scope. The legacy implementation
  //     used the env-var-derived `shopifyClient` singleton and so
  //     would register webhooks against OLB regardless of which
  //     store the admin was viewing — exactly the same defect we
  //     fixed for /api/admin/sync-products. Now uses
  //     getShopifyClient(scope.storeId) and reports the storeId on
  //     the response so the UI toast is unambiguous.
  app.post("/api/shopify/webhooks/register-all", async (req, res) => {
    try {
      const sessionUserId = req.session?.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const requester = await storage.getUser(sessionUserId);
      if (!requester) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      if (!isAdmin(requester)) {
        return res
          .status(403)
          .json({ error: "Admin role required to register webhooks." });
      }
      const scope = requireStoreScope(req, res);
      if (!scope) return;

      const overrideUrl = typeof req.body?.appUrl === "string" ? req.body.appUrl : undefined;
      const appUrl = overrideUrl || process.env.APP_URL;
      if (!appUrl) {
        return res.status(400).json({
          error: "APP_URL not set",
          hint: "Set APP_URL in your .env (e.g. an ngrok HTTPS URL) or pass { appUrl } in the request body.",
        });
      }
      if (!/^https:\/\//i.test(appUrl)) {
        return res.status(400).json({
          error: "APP_URL must be HTTPS",
          received: appUrl,
          hint: "Shopify requires HTTPS for webhook endpoints.",
        });
      }
      const { getShopifyClient } = await import("./shopify");
      const client = await getShopifyClient(scope.storeId);
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
          failed: failed.length,
        },
      });
    } catch (err: any) {
      console.error("[register-all webhooks] failed:", err);
      res.status(500).json({ error: err?.message ?? "Unknown error" });
    }
  });

  // GET companion so the UI can display the current state without
  // triggering a re-registration.
  app.get("/api/shopify/webhooks", async (_req, res) => {
    try {
      const { shopifyClient } = await import("./shopify");
      const result = await shopifyClient.listWebhooks();
      res.json(result);
    } catch (err: any) {
      console.error("[list webhooks] failed:", err);
      res.status(500).json({ error: err?.message ?? "Unknown error" });
    }
  });
  
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
      // Phase 2: also restrict to the active store id resolved by the
      // storeScope middleware. `req.storeScope` is set whenever there
      // is a valid session — webhooks/login don't reach here.
      const activeStoreId = req.storeScope?.storeId;
      const parsedScope = scope === 'global' ? 'global' : undefined;
      const authResult = await buildOrderReadScope(
        currentUserId as string | undefined,
        parsedScope,
        assignedTo as string | undefined,
        activeStoreId,
      );

      // SECURITY: Reject requests without valid user context
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }

      const filters = {
        storeId: authResult.storeId, // Phase 2: scope reads to the active store
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
      // Phase 2: thread the active store id so a CSV export never
      // includes orders from a store the user is not currently in.
      const authResult = await enforceAgentReadFilter(
        currentUserId as string | undefined,
        assignedTo as string | undefined,
        req.storeScope?.storeId,
      );

      // SECURITY: Reject requests without valid user context
      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }

      const filters = {
        storeId: authResult.storeId, // Phase 2: scope export to active store
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
      // Phase 2: also restrict by active store id so an OFD board
      // never lists shipments belonging to a different shop.
      const authResult = await enforceAgentReadFilter(
        currentUserId as string | undefined,
        undefined,
        req.storeScope?.storeId,
      );

      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }

      // Build agent + store filter conditions for the OFD query
      const agentFilter = authResult.assignedTo
        ? sql`AND ${orders.assignedTo} = ${authResult.assignedTo}`
        : sql``;
      const storeFilter = authResult.storeId
        ? sql`AND ${orders.storeId} = ${authResult.storeId}`
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
        ${agentFilter}
        ${storeFilter}`
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
      
      // Active store scope from the storeScope middleware. The
      // /api/dashboard/metrics dashboard had been blending numbers
      // across tenants until this commit — getDashboardMetrics now
      // filters each sub-query by storeId so the Overview cards
      // show only the active store's data.
      const metrics = await storage.getDashboardMetrics(
        userId,
        parsedStartDate,
        parsedEndDate,
        req.storeScope?.storeId,
      );
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
      
      const data = await storage.getHourlyActivity(
        userId,
        parsedStartDate,
        parsedEndDate,
        timezone,
        req.storeScope?.storeId,
      );
      res.json({ data });
    } catch (error) {
      console.error("Error fetching hourly activity:", error);
      res.status(500).json({ error: "Failed to fetch hourly activity" });
    }
  });

  // ============================================================================
  // PARE ANALYTICS — Clean Revenue diagnostic
  // ============================================================================
  //
  // Strips vanity GMV down to True Net Revenue by accounting for fulfillment
  // leakage (cancellations, RTOs, refunds). See Pare-PRD-v3.pdf §1.
  //
  // Query params:
  //   ?startDate=YYYY-MM-DD   (optional; default: 30 days ago)
  //   ?endDate=YYYY-MM-DD     (optional; default: now)
  //
  // All aggregations run in a single Postgres query using FILTER (WHERE …).
  //
  // Access control: admin-only. The client sends ?userId=<uuid> (same
  // pattern as /api/dashboard/metrics); we resolve the user and reject
  // any non-admin with 403. Missing/unknown userId is treated as
  // "not signed in" and rejected with 401 so the client can redirect
  // to /login instead of getting a cryptic 403.
  //
  // TODO(auth): replace this userId-query-param shim with real
  // session auth once it lands, and gate behind canViewAnalytics.
  app.get("/api/analytics/pare", async (req, res) => {
    try {
      const requesterId =
        typeof req.query.userId === "string" ? req.query.userId : null;
      if (!requesterId) {
        return res
          .status(401)
          .json({ error: "Unauthorized: userId query parameter required." });
      }
      const requester = await storage.getUser(requesterId);
      if (!requester) {
        return res.status(401).json({ error: "Unauthorized: user not found." });
      }
      if (!isAdmin(requester)) {
        return res
          .status(403)
          .json({ error: "Forbidden: admin role required to view Pare." });
      }

      const now = new Date();
      let endDate = now;
      let startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (typeof req.query.endDate === "string" && req.query.endDate) {
        const parsed = new Date(req.query.endDate);
        if (Number.isNaN(parsed.getTime())) {
          return res
            .status(400)
            .json({ error: "Invalid endDate. Expected ISO date string." });
        }
        endDate = parsed;
      }
      if (typeof req.query.startDate === "string" && req.query.startDate) {
        const parsed = new Date(req.query.startDate);
        if (Number.isNaN(parsed.getTime())) {
          return res
            .status(400)
            .json({ error: "Invalid startDate. Expected ISO date string." });
        }
        startDate = parsed;
      }

      if (startDate > endDate) {
        return res
          .status(400)
          .json({ error: "startDate must be on or before endDate." });
      }

      // Phase 2: scope the Pare aggregate to the active store. The
      // storeScope middleware resolves this from the X-Active-Store-Id
      // header or the user's first membership, so a multi-store user
      // never sees blended numbers across shops.
      const metrics = await getPareMetrics({
        startDate,
        endDate,
        storeId: req.storeScope?.storeId,
      });
      res.json(metrics);
    } catch (error) {
      console.error("Error computing Pare metrics:", error);
      res.status(500).json({ error: "Failed to compute Pare metrics" });
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
      // Phase 2: also pass the active store id so cross-store URL
      // tampering surfaces as 403 ("Order does not belong to the
      // active store") instead of a silent leak.
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined,
        req.params.id,
        scope as string | undefined,
        req.storeScope?.storeId,
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
      // Phase 2: also pass the active store id so cross-store URL
      // tampering surfaces as 403 ("Order does not belong to the
      // active store") instead of a silent leak.
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined,
        req.params.id,
        scope as string | undefined,
        req.storeScope?.storeId,
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
      // Phase 2: also pass the active store id so cross-store URL
      // tampering surfaces as 403 ("Order does not belong to the
      // active store") instead of a silent leak.
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined,
        req.params.id,
        scope as string | undefined,
        req.storeScope?.storeId,
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
      // Phase 2: also pass the active store id so cross-store URL
      // tampering surfaces as 403 ("Order does not belong to the
      // active store") instead of a silent leak.
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined,
        req.params.id,
        scope as string | undefined,
        req.storeScope?.storeId,
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
      // Phase 2: also pass the active store id so cross-store URL
      // tampering surfaces as 403 ("Order does not belong to the
      // active store") instead of a silent leak.
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined,
        req.params.id,
        scope as string | undefined,
        req.storeScope?.storeId,
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
      // Phase 2: also pass the active store id so cross-store URL
      // tampering surfaces as 403 ("Order does not belong to the
      // active store") instead of a silent leak.
      const authCheck = await canUserReadOrder(
        currentUserId as string | undefined,
        req.params.id,
        scope as string | undefined,
        req.storeScope?.storeId,
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
          const decryptedClientId = decrypt(credentials.apiKey);
          const decryptedClientSecret = decrypt(credentials.apiSecret);
          
          const { ShopifyClient } = await import("./shopify");
          const client = new ShopifyClient({
            storeUrl: credentials.storeUrl,
            apiKey: decryptedClientId,
            apiSecret: decryptedClientSecret,
            useClientCredentials: true,
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

      // Body contract:
      //   • userId: string  → assign / re-assign to that agent
      //   • userId: null    → unassign (explicit null only — `undefined`
      //                       or missing field is still a 400 because
      //                       we want "I forgot to send it" to be loud)
      //   • userId: missing → 400
      //
      // The explicit-null check uses `=== null` so a missing key
      // (undefined) still fails the validation guard below.
      const isUnassign = userId === null;
      if (!isUnassign && (typeof userId !== "string" || userId.length === 0)) {
        return res.status(400).json({
          error: "userId is required (string to assign, explicit null to unassign).",
        });
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

      // Unassign path: skip the assignmentEngine entirely — that
      // expects a target agent + writes order_assignments history.
      // Unassign is just "clear the current owner on the order
      // row." Forward-only history stays history; we don't add a
      // synthetic "unassigned" row to order_assignments today.
      if (isUnassign) {
        const order = await storage.assignOrder(req.params.id, null);
        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }
        return res.json({ order, action: "unassigned" });
      }

      // Update order assignment
      const order = await storage.assignOrder(req.params.id, userId);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Create assignment history record — include storeId so the
      // dashboard metrics query (which filters order_assignments by
      // storeId) correctly counts this agent's assigned orders.
      await storage.createOrderAssignment({
        orderId: req.params.id,
        userId,
        assignedBy: assignedBy || null,
        note: note || null,
        storeId: req.storeScope?.storeId ?? undefined,
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

      // Create status history — stamp storeId from the order so the
      // store-scoped dashboard metrics count this change correctly.
      await storage.createOrderStatus({
        storeId: existingOrder.storeId ?? undefined,
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
        note,
        req.storeScope?.storeId,
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
          await assignmentEngine.manualAssignOrder(orderId, agentId, assignedBy, note, req.storeScope?.storeId);
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

      // Create order status history entry — storeId from the order
      // so the store-scoped dashboard "Confirmed" card counts it.
      await storage.createOrderStatus({
        storeId: order.storeId ?? undefined,
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
        // Phase 2: route through the per-store factory keyed by the
        // order's own storeId, falling back to the legacy/env client
        // for pre-backfill rows.
        const { getShopifyClient, getLegacyStoreShopifyClient } = await import("./shopify");
        const client = existingOrder.storeId
          ? await getShopifyClient(existingOrder.storeId)
          : await getLegacyStoreShopifyClient();

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

      // STEP 4: Create order status history entry — storeId from the
      // order so the store-scoped dashboard "Cancelled" card counts it.
      await storage.createOrderStatus({
        storeId: order.storeId ?? undefined,
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

      // Create order status history entry — storeId from the order so
      // the store-scoped dashboard "Follow-up" card counts it.
      await storage.createOrderStatus({
        storeId: order.storeId ?? undefined,
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
  // Lightweight polling endpoint for live sync progress.
  app.get("/api/shopify/sync/status", (_req, res) => {
    res.json(shopifySyncState);
  });

  // ============================================================================
  // META / FB ADS SYNC
  // ============================================================================
  // Fetches daily spend + purchases across all configured ad accounts and
  // upserts into marketing_metrics. Intended to be triggered manually or via
  // a scheduled cron — NOT on every page load.
  //
  // All Meta routes below are strictly per-store: they require an active
  // store scope (req.storeScope?.storeId) and read/write only that store's
  // row in `stores`. Per-store isolation matches how marketing_metrics is
  // keyed (storeId, date) downstream in services/analytics.ts.
  app.post("/api/meta/sync", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const { syncMetaInsights } = await import("./services/meta");

      // Allow either { days } (default 30) or explicit { startDate, endDate }
      // (YYYY-MM-DD). When both are provided, explicit dates win.
      let startDate: string;
      let endDate: string;
      if (req.body?.startDate && req.body?.endDate) {
        startDate = String(req.body.startDate);
        endDate = String(req.body.endDate);
      } else {
        const days = Math.max(1, Math.min(Number(req.body?.days) || 30, 365));
        const end = new Date();
        const start = new Date(end.getTime() - (days - 1) * 864e5);
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
      }

      const result = await syncMetaInsights(storeId, startDate, endDate);
      res.json(result);
    } catch (err: any) {
      console.error("Error syncing Meta insights:", err);
      res
        .status(500)
        .json({ error: err?.message || "Failed to sync Meta insights" });
    }
  });

  // GET /api/meta/config — report whether a token is configured for the
  // active store and return the ad-account/campaign linkage. The raw
  // access token is NEVER sent to the client; we only expose a boolean.
  app.get("/api/meta/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [store] = await db
        .select({
          metaAccessToken: stores.metaAccessToken,
          metaAdAccountsConfig: stores.metaAdAccountsConfig,
        })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!store) {
        return res.status(404).json({ error: "Store not found." });
      }
      res.json({
        hasToken: !!store.metaAccessToken,
        adAccountsConfig: store.metaAdAccountsConfig ?? [],
      });
    } catch (err: any) {
      console.error("Error in GET /api/meta/config:", err);
      res.status(500).json({ error: err?.message || "Failed to load Meta config" });
    }
  });

  // PUT /api/meta/config — partial update.
  //   - accessToken: when a non-empty string is supplied, encrypt() and
  //     persist; when omitted/empty, leave the existing token untouched.
  //   - adAccountsConfig: when provided (even []), always replace.
  // Mirrors how PATCH /api/stores/:id persists rows: db.update(stores)
  // with a built-up patch object so untouched columns aren't clobbered.
  app.put("/api/meta/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }

      const [existing] = await db
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Store not found." });
      }

      const patch: {
        metaAccessToken?: string;
        metaAdAccountsConfig?: MetaAdAccountConfig[];
        updatedAt?: Date;
      } = {};

      const { accessToken, adAccountsConfig } = req.body ?? {};

      if (typeof accessToken === "string" && accessToken.trim().length > 0) {
        patch.metaAccessToken = encrypt(accessToken.trim());
      }

      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "adAccountsConfig")) {
        if (!Array.isArray(adAccountsConfig)) {
          return res
            .status(400)
            .json({ error: "adAccountsConfig must be an array." });
        }
        // Lightweight validation — each entry must match the JSON shape
        // documented in shared/schema.ts (MetaAdAccountConfig).
        for (const entry of adAccountsConfig) {
          if (
            !entry ||
            typeof entry !== "object" ||
            typeof entry.adAccountId !== "string" ||
            !Array.isArray(entry.linkedCampaignIds) ||
            typeof entry.syncAll !== "boolean"
          ) {
            return res.status(400).json({
              error:
                "Each adAccountsConfig entry needs { adAccountId, linkedCampaignIds[], syncAll }.",
            });
          }
        }
        patch.metaAdAccountsConfig = adAccountsConfig as MetaAdAccountConfig[];
      }

      if (Object.keys(patch).length === 0) {
        return res
          .status(400)
          .json({ error: "Nothing to update. Provide accessToken and/or adAccountsConfig." });
      }
      patch.updatedAt = new Date();

      await db.update(stores).set(patch).where(eq(stores.id, storeId));

      // Re-read just the fields the GET shape needs so the client and the
      // server stay in lockstep without leaking the token.
      const [updated] = await db
        .select({
          metaAccessToken: stores.metaAccessToken,
          metaAdAccountsConfig: stores.metaAdAccountsConfig,
        })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);

      res.json({
        hasToken: !!updated?.metaAccessToken,
        adAccountsConfig: updated?.metaAdAccountsConfig ?? [],
      });
    } catch (err: any) {
      console.error("Error in PUT /api/meta/config:", err);
      res.status(500).json({ error: err?.message || "Failed to update Meta config" });
    }
  });

  // ============================================================================
  // DELHIVERY CONFIG (per-store credentials)
  // ============================================================================

  // GET /api/delhivery/config — report whether Delhivery is configured
  // for the active store, plus the (non-secret) client name. Never
  // returns the token itself.
  app.get("/api/delhivery/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [row] = await db
        .select({
          delhiveryApiToken: stores.delhiveryApiToken,
          delhiveryClientName: stores.delhiveryClientName,
        })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!row) {
        return res.status(404).json({ error: "Store not found" });
      }
      res.json({
        hasToken: !!row.delhiveryApiToken,
        clientName: row.delhiveryClientName ?? null,
      });
    } catch (err: any) {
      console.error("Error in GET /api/delhivery/config:", err);
      res.status(500).json({ error: err?.message || "Failed to read Delhivery config" });
    }
  });

  // PUT /api/delhivery/config — securely save/update per-store Delhivery
  // credentials. Token is encrypted at rest (server/encryption.ts).
  //   - apiToken: when a non-empty string, encrypt() + persist; when
  //     omitted/empty, leave the existing token untouched (so the UI
  //     can update just the client name without re-sending the secret).
  //   - clientName: when the key is present, always replace (incl. "").
  app.put("/api/delhivery/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }

      const [existing] = await db
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Store not found." });
      }

      const patch: {
        delhiveryApiToken?: string;
        delhiveryClientName?: string | null;
        updatedAt?: Date;
      } = {};

      const { apiToken, clientName } = req.body ?? {};

      if (typeof apiToken === "string" && apiToken.trim().length > 0) {
        patch.delhiveryApiToken = encrypt(apiToken.trim());
      }

      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "clientName")) {
        patch.delhiveryClientName =
          typeof clientName === "string" && clientName.trim().length > 0
            ? clientName.trim()
            : null;
      }

      if (Object.keys(patch).length === 0) {
        return res
          .status(400)
          .json({ error: "Nothing to update. Provide apiToken and/or clientName." });
      }
      patch.updatedAt = new Date();

      await db.update(stores).set(patch).where(eq(stores.id, storeId));

      // Bust the cached Delhivery client so the next outbound call picks
      // up the new credentials immediately.
      const { invalidateDelhiveryClient } = await import("./services/delhivery");
      invalidateDelhiveryClient(storeId);

      const [updated] = await db
        .select({
          delhiveryApiToken: stores.delhiveryApiToken,
          delhiveryClientName: stores.delhiveryClientName,
        })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);

      res.json({
        hasToken: !!updated?.delhiveryApiToken,
        clientName: updated?.delhiveryClientName ?? null,
      });
    } catch (err: any) {
      console.error("Error in PUT /api/delhivery/config:", err);
      res.status(500).json({ error: err?.message || "Failed to update Delhivery config" });
    }
  });

  // GET /api/delhivery/shipments/:awb/label — fetch the printable
  // packing-slip / label URL for an AWB, scoped to the shipment's store,
  // and cache it on the shipment row.
  app.get("/api/delhivery/shipments/:awb/label", async (req, res) => {
    try {
      const { awb } = req.params;
      const shipment = await storage.getShipmentByAWB(awb);
      if (!shipment) {
        return res.status(404).json({ error: "Shipment not found" });
      }
      if (!shipment.storeId) {
        return res.status(400).json({ error: "Shipment is missing store context" });
      }

      const { getDelhiveryClient } = await import("./services/delhivery");
      let client;
      try {
        client = await getDelhiveryClient(shipment.storeId);
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || "Delhivery not configured for this store" });
      }

      const result = await client.getShippingLabel(awb);
      if (!result.success || !result.labelUrl) {
        return res.status(502).json({ error: result.error || "Label not available" });
      }

      await storage.updateShipment(shipment.id, { shippingLabelUrl: result.labelUrl });
      res.json({ success: true, labelUrl: result.labelUrl });
    } catch (err: any) {
      console.error("Error fetching Delhivery label:", err);
      res.status(500).json({ error: err?.message || "Failed to fetch shipping label" });
    }
  });

  // ============================================================================
  // RESEND CONFIG (per-store transactional email credentials)
  // ============================================================================

  // GET /api/resend/config — report whether Resend is configured for the
  // active store, plus the (non-secret) from-email. Never returns the key.
  app.get("/api/resend/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [row] = await db
        .select({
          resendApiKey: stores.resendApiKey,
          resendFromEmail: stores.resendFromEmail,
        })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!row) {
        return res.status(404).json({ error: "Store not found" });
      }
      res.json({
        hasToken: !!row.resendApiKey,
        fromEmail: row.resendFromEmail ?? null,
      });
    } catch (err: any) {
      console.error("Error in GET /api/resend/config:", err);
      res.status(500).json({ error: err?.message || "Failed to read Resend config" });
    }
  });

  // PUT /api/resend/config — securely save/update per-store Resend
  // credentials. Key is encrypted at rest (server/encryption.ts).
  //   - apiKey: when a non-empty string, encrypt() + persist; when
  //     omitted/empty, leave the existing key untouched (so the UI can
  //     update just the from-email without re-sending the secret).
  //   - fromEmail: when the key is present, always replace (incl. "").
  app.put("/api/resend/config", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }

      const [existing] = await db
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Store not found." });
      }

      const patch: {
        resendApiKey?: string;
        resendFromEmail?: string | null;
        updatedAt?: Date;
      } = {};

      const { apiKey, fromEmail } = req.body ?? {};

      if (typeof apiKey === "string" && apiKey.trim().length > 0) {
        patch.resendApiKey = encrypt(apiKey.trim());
      }

      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "fromEmail")) {
        patch.resendFromEmail =
          typeof fromEmail === "string" && fromEmail.trim().length > 0
            ? fromEmail.trim()
            : null;
      }

      if (Object.keys(patch).length === 0) {
        return res
          .status(400)
          .json({ error: "Nothing to update. Provide apiKey and/or fromEmail." });
      }
      patch.updatedAt = new Date();

      await db.update(stores).set(patch).where(eq(stores.id, storeId));

      const [updated] = await db
        .select({
          resendApiKey: stores.resendApiKey,
          resendFromEmail: stores.resendFromEmail,
        })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);

      res.json({
        hasToken: !!updated?.resendApiKey,
        fromEmail: updated?.resendFromEmail ?? null,
      });
    } catch (err: any) {
      console.error("Error in PUT /api/resend/config:", err);
      res.status(500).json({ error: err?.message || "Failed to update Resend config" });
    }
  });

  // GET /api/meta/ad-accounts — server-side proxy to Meta's Graph API
  // /me/adaccounts using the store's decrypted token. We proxy (vs
  // letting the browser talk to Meta directly) so the access token
  // never leaves the server.
  app.get("/api/meta/ad-accounts", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const [store] = await db
        .select({ metaAccessToken: stores.metaAccessToken })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!store) {
        return res.status(404).json({ error: "Store not found." });
      }
      if (!store.metaAccessToken) {
        return res.status(400).json({ error: "No Meta access token configured for this store." });
      }
      const token = decrypt(store.metaAccessToken);

      const url =
        "https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status,currency,business_name&limit=200";
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        const upstream = response.data?.error?.message || `Meta API error (status ${response.status})`;
        return res.status(502).json({ error: upstream });
      }
      res.json({ adAccounts: response.data?.data ?? [] });
    } catch (err: any) {
      console.error("Error in GET /api/meta/ad-accounts:", err);
      res.status(502).json({ error: err?.message || "Failed to fetch ad accounts" });
    }
  });

  // GET /api/meta/campaigns?adAccountId=act_xxx — proxy to
  // /{adAccountId}/campaigns. Follows Meta's paging.next cursor up to a
  // 1000-campaign safety cap so we don't loop forever on a malformed
  // response.
  app.get("/api/meta/campaigns", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Store scope required" });
      }
      const adAccountId = String(req.query.adAccountId ?? "").trim();
      if (!adAccountId) {
        return res.status(400).json({ error: "adAccountId query param is required." });
      }
      const [store] = await db
        .select({ metaAccessToken: stores.metaAccessToken })
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!store) {
        return res.status(404).json({ error: "Store not found." });
      }
      if (!store.metaAccessToken) {
        return res.status(400).json({ error: "No Meta access token configured for this store." });
      }
      const token = decrypt(store.metaAccessToken);

      const MAX_CAMPAIGNS = 1000;
      const campaigns: any[] = [];
      let nextUrl: string | null =
        `https://graph.facebook.com/v19.0/${encodeURIComponent(adAccountId)}/campaigns?fields=id,name,status,objective,effective_status&limit=500`;

      while (nextUrl && campaigns.length < MAX_CAMPAIGNS) {
        const response: any = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
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
    } catch (err: any) {
      console.error("Error in GET /api/meta/campaigns:", err);
      res.status(502).json({ error: err?.message || "Failed to fetch campaigns" });
    }
  });

  app.post("/api/shopify/sync", async (req, res) => {
    // Only one sync may run at a time. Concurrent POSTs get 409.
    if (shopifySyncState.isRunning) {
      return res.status(409).json({
        error: "A Shopify sync is already in progress.",
        state: shopifySyncState,
      });
    }
    resetShopifySyncState();
    try {
      // Page size: Shopify REST caps `limit` at 250. Default to 250 to
      // minimize round-trips for historical backfills.
      const rawLimit = parseInt(String(req.body.limit ?? 250), 10);
      const pageLimit = Math.min(Math.max(isNaN(rawLimit) ? 250 : rawLimit, 1), 250);

      // Cursor — when `since_id` is set, Shopify returns orders with
      // `id > sinceId` in ascending id order.
      //
      // ────────────────────────────────────────────────────────────────
      // Active store scope — resolved upstream by the storeScope
      // middleware from the X-Active-Store-Id header. The entire
      // historical sync below is now per-store: cursor, dedup,
      // inserts. This is the fix for "Sync Orders for Glow & Me
      // returns 0 orders" — previously the cursor `since_id`
      // came from the unscoped max(shopify_order_id), which was
      // always OLB's max, so Shopify's REST returned nothing for
      // any newer store.
      //
      // We require a resolved store scope here. Without it (e.g.
      // a stale session with no membership) we'd fall back to the
      // legacy global cursor + insert into NULL storeId, which is
      // what created the bug in the first place. 400 instead.
      // ────────────────────────────────────────────────────────────────
      const syncStoreId = req.storeScope?.storeId;
      if (!syncStoreId) {
        return res.status(400).json({
          error: "Active store scope is required to run a historical sync.",
        });
      }

      // Smart resume: if the caller didn't pass an explicit cursor,
      // pick up from the highest shopify_order_id already in our DB
      // FOR THIS STORE. After Phase 5 (Risk #4) shopify_order_id is
      // no longer globally unique — order ids are globally-monotone
      // integers, so the legacy unscoped max was always OLB's, which
      // made every new store's sync start past Shopify's latest id
      // and return 0 orders. Per-store cursor closes the trap.
      let sinceId: string;
      if (req.body.sinceId) {
        sinceId = String(req.body.sinceId);
      } else {
        const maxLocal = await storage.getMaxShopifyOrderId(syncStoreId);
        sinceId = maxLocal ?? "0";
      }
      console.log(
        `[shopify-sync] storeId=${syncStoreId} starting with sinceId=${sinceId}`,
      );

      // Safety cap: 500 pages × 250 = 125,000 orders. Prevents a runaway
      // loop if Shopify ever returns a full page indefinitely.
      const maxPages = typeof req.body.maxPages === "number" ? req.body.maxPages : 500;

      // Phase 2: route the bulk historical sync through the per-
      // store factory. The admin who triggered the sync has an
      // active store scope, so we pull credentials for THAT store —
      // not the env-var fallback. updateShopifyClient() is still
      // invoked alongside so the legacy `shopifyClient` singleton
      // stays warm for any non-store-aware caller in the same boot.
      const { getShopifyClient, updateShopifyClient } = await import("./shopify");
      const client = await getShopifyClient(syncStoreId);
      void updateShopifyClient().catch(() => {});

      // ────────────────────────────────────────────────────────────────
      // Preload: build in-memory lookups used on every iteration.
      // Without this, we'd hit the DB 2× per line item for image lookups
      // (≈270k queries for a 45k-order import). With this, it's zero.
      // ────────────────────────────────────────────────────────────────
      const allProducts = await storage.listProducts();
      const productByVariant = new Map<string, typeof allProducts[number]>();
      const productByProduct = new Map<string, typeof allProducts[number]>();
      for (const p of allProducts) {
        if (p.shopifyVariantId) productByVariant.set(p.shopifyVariantId, p);
        if (p.shopifyProductId) productByProduct.set(p.shopifyProductId, p);
      }
      console.log(
        `[shopify-sync] preloaded ${allProducts.length} products (${productByVariant.size} variants, ${productByProduct.size} parents)`,
      );

      // Webhook bypass: if no `order.created` webhooks are active, skip
      // triggerWebhooks entirely during the import (avoids one SELECT per
      // order against the webhooks table).
      const activeOrderCreatedWebhooks = await db
        .select()
        .from(webhooks)
        .where(
          and(eq(webhooks.eventType, "order.created"), eq(webhooks.isActive, true)),
        );
      const shouldFireWebhooks = activeOrderCreatedWebhooks.length > 0;
      if (!shouldFireWebhooks) {
        console.log(
          `[shopify-sync] no active order.created webhooks — skipping webhook fan-out`,
        );
      }

      let syncedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let totalFetched = 0;
      let pagesFetched = 0;
      let lastSinceId = sinceId;

      // Image-resolver closure used by both batch and sequential paths.
      const resolveImage = (
        variantId?: string | number | null,
        productId?: string | number | null,
      ): string | null => {
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

      // Build an order insert record from a Shopify order payload.
      // The closure captures `syncStoreId` so every order produced
      // here is stamped with the resolved active store — required
      // so downstream reads (Pare, dashboards, NDR) see the row
      // under the right tenant.
      const buildOrderInsert = (
        shopifyOrder: any,
        customerId: string | null,
      ) => {
        const fulfillmentTracking = extractFulfillmentTracking(
          shopifyOrder.fulfillments,
        );
        return {
          storeId: syncStoreId,
          shopifyOrderId: shopifyOrder.id.toString(),
          shopifyOrderNumber:
            shopifyOrder.order_number?.toString() || shopifyOrder.name,
          customerId,
          customerName:
            `${shopifyOrder.customer?.first_name || ""} ${shopifyOrder.customer?.last_name || ""}`.trim() ||
            shopifyOrder.billing_address?.name ||
            "Guest",
          customerEmail: shopifyOrder.email || null,
          customerPhone:
            shopifyOrder.phone || shopifyOrder.shipping_address?.phone || "",
          status: mapShopifyStatus(
            shopifyOrder.financial_status,
            shopifyOrder.fulfillment_status,
            fulfillmentTracking.shipmentStatus,
            shopifyOrder.cancelled_at || null,
          ),
          fulfillmentStatus: shopifyOrder.fulfillment_status || null,
          fulfilledAt: shopifyOrder.fulfilled_at
            ? new Date(shopifyOrder.fulfilled_at)
            : null,
          financialStatus: shopifyOrder.financial_status || null,
          totalPrice: shopifyOrder.total_price || "0",
          subtotal: shopifyOrder.subtotal_price || "0",
          totalTax: shopifyOrder.total_tax || "0",
          totalDiscount: shopifyOrder.total_discounts || "0",
          discountCode: shopifyOrder.discount_codes?.[0]?.code || null,
          shippingPrice:
            shopifyOrder.total_shipping_price_set?.shop_money?.amount || "0",
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
          itemsSummary:
            shopifyOrder.line_items?.map((item: any) => item.name).join(", ") ||
            null,
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
          processedAt: (shopifyOrder.processed_at ?? shopifyOrder.created_at) as string,
        };
      };

      while (pagesFetched < maxPages) {
        const response = await client.fetchOrders({
          status: "any",
          limit: pageLimit,
          sinceId,
        });

        const orders = response.orders || [];
        pagesFetched++;
        totalFetched += orders.length;
        shopifySyncState.pagesFetched = pagesFetched;
        shopifySyncState.totalFetched = totalFetched;
        console.log(
          `[shopify-sync] page ${pagesFetched}: fetched ${orders.length} orders (sinceId=${sinceId})`,
        );

        if (orders.length === 0) break;

        // ──────────────────────────────────────────────────────────────
        // Batch dedupe: one SELECT against our orders table instead of
        // 250 sequential SELECTs. Anything already imported is skipped.
        // ──────────────────────────────────────────────────────────────
        const pageShopifyIds = orders.map((o: any) => o.id.toString());
        // Dedup scoped to syncStoreId — required after Phase 5
        // composite-uniques, otherwise an id that happens to exist
        // in another tenant's history gets falsely flagged as
        // "already imported" and the real new order is skipped.
        const alreadyImported =
          await storage.getExistingShopifyOrderIds(pageShopifyIds, syncStoreId);
        const newOrders = orders.filter(
          (o: any) => !alreadyImported.has(o.id.toString()),
        );
        skippedCount += orders.length - newOrders.length;
        shopifySyncState.skippedCount = skippedCount;

        if (newOrders.length > 0) {
          let batchSucceeded = false;
          try {
            // ──────────────────────────────────────────────────────────
            // Customers: dedupe within the page and batch-fetch existing.
            // ──────────────────────────────────────────────────────────
            const uniqueShopifyCustomerIds: string[] = Array.from(
              new Set<string>(
                newOrders
                  .filter((o: any) => o.customer?.id)
                  .map((o: any) => o.customer.id.toString() as string),
              ),
            );
            const existingCustomers =
              await storage.getCustomersByShopifyIds(uniqueShopifyCustomerIds, syncStoreId);
            const customerByShopifyId = new Map(
              existingCustomers.map((c) => [c.shopifyCustomerId!, c] as const),
            );

            const customersToInsert: any[] = [];
            const seenCustomer = new Set<string>();
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
                phone: o.customer.phone || o.phone || null,
              });
            }
            if (customersToInsert.length > 0) {
              const inserted =
                await storage.createCustomersBatch(customersToInsert);
              for (const c of inserted) {
                if (c.shopifyCustomerId)
                  customerByShopifyId.set(c.shopifyCustomerId, c);
              }
            }

            // ──────────────────────────────────────────────────────────
            // Orders: one INSERT … VALUES (…),(…) for the whole page.
            // ──────────────────────────────────────────────────────────
            const orderInserts = newOrders.map((o: any) => {
              const sid = o.customer?.id?.toString();
              const customerId = sid
                ? customerByShopifyId.get(sid)?.id ?? null
                : null;
              return buildOrderInsert(o, customerId);
            });
            const insertedOrders =
              await storage.createOrdersBatch(orderInserts);
            const orderIdByShopifyId = new Map(
              insertedOrders.map((o) => [o.shopifyOrderId!, o] as const),
            );

            // ──────────────────────────────────────────────────────────
            // Order items: flatten every line item across the page into
            // one INSERT. Image lookup is now a Map get — zero queries.
            // ──────────────────────────────────────────────────────────
            const orderItemInserts: any[] = [];
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
                  totalPrice: (
                    parseFloat(item.price || "0") * item.quantity
                  ).toString(),
                  imageUrl: resolveImage(item.variant_id, item.product_id),
                });
              }
            }
            if (orderItemInserts.length > 0) {
              await storage.createOrderItems(orderItemInserts);
            }

            // ──────────────────────────────────────────────────────────
            // Order status history: one INSERT for the whole page.
            // ──────────────────────────────────────────────────────────
            const statusInserts = insertedOrders.map((o) => ({
              storeId: syncStoreId,
              orderId: o.id,
              status: o.status,
              previousStatus: null,
              changedBy: null,
              note: "Imported from Shopify",
            }));
            if (statusInserts.length > 0) {
              await storage.createOrderStatusBatch(statusInserts);
            }

            // Webhook fan-out: only when there's something listening.
            if (shouldFireWebhooks) {
              for (const o of insertedOrders) {
                triggerWebhooks("order.created", {
                  order: o,
                  shopifyOrderId: o.shopifyOrderId,
                  assignedAgentEmail: null,
                });
              }
            }

            syncedCount += insertedOrders.length;
            shopifySyncState.syncedCount = syncedCount;
            batchSucceeded = true;
            console.log(
              `[shopify-sync] page ${pagesFetched}: batch-inserted ${insertedOrders.length} orders (skipped ${orders.length - newOrders.length})`,
            );
          } catch (batchErr) {
            const msg =
              batchErr instanceof Error ? batchErr.message : String(batchErr);
            console.warn(
              `[shopify-sync] page ${pagesFetched} batch path failed (${msg}); falling back to per-order sequential insert`,
            );
          }

          // ──────────────────────────────────────────────────────────────
          // Fallback: if the batch path threw (e.g. one row violated a
          // constraint and the whole transaction aborted), re-process
          // this page one order at a time so the bad rows are isolated
          // and every good row still lands.
          // ──────────────────────────────────────────────────────────────
          if (!batchSucceeded) {
            for (const shopifyOrder of newOrders) {
              try {
                let customer;
                if (shopifyOrder.customer) {
                  // Customer lookup scoped to the active store —
                  // syncStoreId is guaranteed defined by the early
                  // 400 at the top of this route, so two stores
                  // with overlapping Shopify customer ids don't
                  // clobber each other on lookup.
                  const existingCustomer = await storage.getCustomerByShopifyId(
                    shopifyOrder.customer.id.toString(),
                    syncStoreId,
                  );
                  const customerData = {
                    // Per-order fallback path needs the same storeId
                    // stamping as the bulk path above — without it
                    // the customer row would land with storeId=NULL
                    // and never appear in any tenant's dashboard.
                    storeId: syncStoreId,
                    shopifyCustomerId: shopifyOrder.customer.id.toString(),
                    email:
                      shopifyOrder.customer.email || shopifyOrder.email || null,
                    firstName: shopifyOrder.customer.first_name || null,
                    lastName: shopifyOrder.customer.last_name || null,
                    phone:
                      shopifyOrder.customer.phone || shopifyOrder.phone || null,
                  };
                  customer = existingCustomer
                    ? await storage.updateCustomer(
                        existingCustomer.id,
                        customerData,
                      )
                    : await storage.createCustomer(customerData);
                }

                const orderData = buildOrderInsert(
                  shopifyOrder,
                  customer?.id || null,
                );
                const order = await storage.createOrder(orderData);

                if (shopifyOrder.line_items?.length > 0) {
                  const items = shopifyOrder.line_items.map((item: any) => ({
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
                    totalPrice: (
                      parseFloat(item.price || "0") * item.quantity
                    ).toString(),
                    imageUrl: resolveImage(item.variant_id, item.product_id),
                  }));
                  await storage.createOrderItems(items);
                }

                await storage.createOrderStatus({
                  storeId: syncStoreId,
                  orderId: order.id,
                  status: orderData.status,
                  previousStatus: null,
                  changedBy: null,
                  note: "Imported from Shopify",
                });

                if (shouldFireWebhooks) {
                  triggerWebhooks("order.created", {
                    order,
                    shopifyOrderId: shopifyOrder.id,
                    assignedAgentEmail: null,
                  });
                }

                syncedCount++;
                shopifySyncState.syncedCount = syncedCount;
              } catch (err) {
                const orderId = String(shopifyOrder?.id ?? "<unknown>");
                const orderName = shopifyOrder?.name ?? "";
                const message =
                  err instanceof Error ? err.message : String(err);
                console.warn(
                  `[shopify-sync] failed to import order ${orderId} ${orderName}: ${message}`,
                );
                failedCount++;
                shopifySyncState.failedCount = failedCount;
                recordShopifySyncError(
                  orderName ? `${orderId} (${orderName})` : orderId,
                  message,
                );
              }
            }
          }
        }

        // Advance the cursor. Shopify returns ASC by id when `since_id`
        // is set, so the last order of the batch has the highest id.
        const lastOrder = orders[orders.length - 1];
        sinceId = lastOrder.id.toString();
        lastSinceId = sinceId;
        shopifySyncState.lastSinceId = lastSinceId;

        // If we got a short page, there are no more orders to fetch.
        if (orders.length < pageLimit) break;

        // Pause briefly to stay under Shopify's 2 req/s REST limit.
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
        reachedMaxPages: pagesFetched >= maxPages,
      });
    } catch (error) {
      console.error("Error syncing orders:", error);
      shopifySyncState.lastError =
        error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to sync orders" });
    } finally {
      shopifySyncState.isRunning = false;
      shopifySyncState.finishedAt = new Date().toISOString();
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

      // Use saved store name if available, fall back to extracting from domain
      const storeName = credentials.storeName || credentials.storeUrl.split('.')[0] || null;

      res.json({
        configured: true,
        storeUrl: credentials.storeUrl,
        storeName,
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
      console.log("Shop Domain:", req.body.storeUrl);
      console.log("Client ID length:", req.body.apiKey?.length || 0);
      console.log("Client Secret length:", req.body.apiSecret?.length || 0);
      console.log("Webhook Secret provided:", !!req.body.webhookSecret);

      // Validate with Zod
      console.log("\nStep 2: Starting validation...");
      const validatedData = insertShopifyCredentialsSchema.parse(req.body);
      console.log("✓ Validation successful");

      // Test connection FIRST via Client Credentials Grant before saving
      console.log("\nStep 3: Testing connection via Client Credentials Grant...");
      const { ShopifyClient: TempClient } = await import("./shopify");
      const tempClient = new TempClient({
        storeUrl: validatedData.storeUrl,
        apiKey: validatedData.apiKey,
        apiSecret: validatedData.apiSecret,
        useClientCredentials: true,
      });

      let shopInfo: any = null;
      let testPassed = false;
      let testErrorMessage = "";

      try {
        shopInfo = await tempClient.getShopInfo();
        testPassed = true;
        console.log("✓ Connection test passed. Shop:", shopInfo?.name);
      } catch (testErr: any) {
        testErrorMessage = testErr.message || "Connection test failed";
        console.log("⚠ Connection test failed:", testErrorMessage);
      }

      // Encrypt sensitive fields
      console.log("\nStep 4: Starting encryption...");
      const encryptedApiKey = encrypt(validatedData.apiKey);
      const encryptedApiSecret = encrypt(validatedData.apiSecret);
      console.log("✓ Encryption complete");

      const encryptedCredentials = {
        storeName: testPassed && shopInfo?.name ? shopInfo.name : undefined,
        storeUrl: validatedData.storeUrl,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        webhookSecret: validatedData.webhookSecret ? encrypt(validatedData.webhookSecret) : undefined,
        isActive: true,
      };

      // Save to database
      console.log("\nStep 5: Saving to database...");
      const savedCredentials = await storage.saveShopifyCredentials(encryptedCredentials);
      console.log("✓ Database save successful, ID:", savedCredentials.id);

      // Update test status
      await storage.updateCredentialTestStatus(
        savedCredentials.id,
        testPassed ? 'success' : 'failed',
        testPassed
          ? `Connected to ${shopInfo?.name || savedCredentials.storeUrl}`
          : testErrorMessage,
      );

      // Also clear the in-memory token cache on the singleton so it re-fetches with new creds
      const { updateShopifyClient } = await import("./shopify");
      await updateShopifyClient();

      if (testPassed) {
        console.log("\n=== SUCCESS: Sending 200 response ===\n");
        res.json({
          success: true,
          message: "Credentials saved and tested successfully",
          storeUrl: savedCredentials.storeUrl,
          shopName: shopInfo?.name,
        });
      } else {
        console.log("\n=== PARTIAL SUCCESS: Saved but test failed ===\n");
        res.json({
          success: true,
          message: "Credentials saved but connection test failed",
          storeUrl: savedCredentials.storeUrl,
          testError: testErrorMessage,
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

      const { ShopifyClient: TestClient } = await import("./shopify");
      const testClient = new TestClient({
        storeUrl: credentials.storeUrl,
        apiKey: decryptedKey,
        apiSecret: decryptedSecret,
        useClientCredentials: true,
      });

      const shopInfo = await testClient.getShopInfo();

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
      // Per-store: the Payment Mapping settings card only suggests
      // gateway names that actually show up in THIS store's order
      // history, so admins don't see OLB's gateways when configuring
      // Glow & Me's prepaid mapping.
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const methods = await storage.getDistinctPaymentMethods(scope.storeId);
      res.json({ methods });
    } catch (error: any) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: error.message || "Failed to fetch payment methods" });
    }
  });

  // Get configured prepaid payment methods
  app.get("/api/settings/payments", async (req, res) => {
    try {
      // Per-store: each tenant owns its own prepaid_payment_methods
      // row in app_settings (composite PK on storeId, key).
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const methods = await storage.getPrepaidPaymentMethods(scope.storeId);
      res.json({ prepaidMethods: methods });
    } catch (error: any) {
      console.error("Error fetching payment settings:", error);
      res.status(500).json({ error: error.message || "Failed to fetch payment settings" });
    }
  });

  // Update prepaid payment methods configuration
  app.post("/api/settings/payments", async (req, res) => {
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
        prepaidMethods,
      );
      res.json({
        success: true,
        prepaidMethods: setting.value,
        message: "Payment settings updated successfully",
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
    // Phase 5 (Risk #1+2): the product sync must run against the
    // active store, not the legacy `shopify_credentials` row. Until
    // this fix, every sync hit OLB's shop — when OLB went into a
    // frozen/paused subscription state, Shopify returned 402
    // Payment Required and the UI surfaced "Failed to sync
    // products" with no indication of which store was actually
    // being targeted.
    const syncStoreId = req.storeScope?.storeId;
    if (!syncStoreId) {
      return res.status(400).json({
        error: "Active store scope is required to sync products.",
      });
    }
    try {
      const { getShopifyClient } = await import("./shopify");
      const client = await getShopifyClient(syncStoreId);

      console.log(`[product-sync] storeId=${syncStoreId} starting`);

      // Fetch all products from Shopify
      const shopifyProducts = await client.fetchAllProducts();
      console.log(
        `[product-sync] storeId=${syncStoreId} fetched ${shopifyProducts.length} products`,
      );

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
            storeId: syncStoreId,
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

        // Also upsert product-level catalog row (one per product, not per variant).
        // Aggregates total inventory across all variants; picks the lowest price.
        const variants = product.variants || [];
        const totalInventory = variants.reduce(
          (sum: number, v: any) => sum + (Number(v.inventory_quantity) || 0),
          0,
        );
        const prices = variants
          .map((v: any) => parseFloat(v.price))
          .filter((p: number) => !isNaN(p));
        const minPrice = prices.length > 0 ? Math.min(...prices).toFixed(2) : null;

        // First variant drives SKU / barcode / weight for the product row.
        const firstVariant = variants[0] as any | undefined;
        const compareAtPrices = variants
          .map((v: any) => parseFloat(v.compare_at_price))
          .filter((p: number) => !isNaN(p) && p > 0);
        const minCompareAt =
          compareAtPrices.length > 0
            ? Math.min(...compareAtPrices).toFixed(2)
            : null;

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
          lastSyncedAt: new Date(),
        });

        syncedCount++;
      }

      console.log(
        `[product-sync] storeId=${syncStoreId} done: ${syncedCount} products / ${variantCount} variants`,
      );

      res.json({
        success: true,
        message: `Synced ${syncedCount} products with ${variantCount} variants`,
        productsCount: syncedCount,
        variantsCount: variantCount,
      });
    } catch (error: any) {
      const message: string = error?.message ?? String(error);
      console.error(
        `[product-sync] storeId=${syncStoreId} FAILED: ${message}`,
      );
      // Translate Shopify's 402 into a clear, actionable response so
      // the UI can tell the admin "your store's subscription is
      // paused" instead of the generic "Failed to sync products."
      // The legacy ShopifyClient bubbles the HTTP status text into
      // the message; we pattern-match on it.
      if (/Payment Required \(402\)/i.test(message) || /\b402\b/.test(message)) {
        return res.status(402).json({
          error: "Shopify subscription paused for this store",
          details:
            "Shopify returned 402 Payment Required. Reactivate the store's subscription in the Shopify admin and retry.",
        });
      }
      res.status(500).json({
        error: "Failed to sync products",
        details: message,
      });
    }
  });

  // List catalog products for the active store
  app.get("/api/products", async (req, res) => {
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

  // Update ERP financial / logistics fields for one product.
  // Only the seven user-editable fields are accepted — Shopify-native
  // fields (title, status, price, sku, etc.) are ignored here and
  // managed exclusively by the sync engine.
  app.patch("/api/products/:id", async (req, res) => {
    try {
      const { cogs, packagingCost, gstRate, hsnCode, dimensionLength, dimensionWidth, dimensionHeight } = req.body;
      const updated = await storage.updateCatalogProductErp(req.params.id, {
        cogs: cogs != null ? String(cogs) : null,
        packagingCost: packagingCost != null ? String(packagingCost) : null,
        gstRate: gstRate != null ? String(gstRate) : null,
        hsnCode: hsnCode ?? null,
        dimensionLength: dimensionLength != null ? String(dimensionLength) : null,
        dimensionWidth: dimensionWidth != null ? String(dimensionWidth) : null,
        dimensionHeight: dimensionHeight != null ? String(dimensionHeight) : null,
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

  // ============================================================================
  // RETURNS (RMA dashboard)
  // ============================================================================

  // List all returns for the active store, with joined order/customer details.
  app.get("/api/returns", async (req, res) => {
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

  // Update the RMA status. Validates against the allowed status set and
  // verifies the return belongs to the active store before writing.
  app.patch("/api/returns/:id/status", async (req, res) => {
    try {
      const storeId = req.storeScope?.storeId;
      if (!storeId) {
        return res.status(400).json({ error: "Active store scope required" });
      }
      const { status } = req.body ?? {};
      if (!status || !RETURN_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${RETURN_STATUSES.join(", ")}`,
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

  // Full RMA detail: the return record + its parent order + line items,
  // composed for the slide-over detail view. Store-scoped.
  app.get("/api/returns/:id", async (req, res) => {
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
      const order = ret.orderId ? await storage.getOrder(ret.orderId) : undefined;
      const items = ret.orderId ? await storage.getOrderItems(ret.orderId) : [];
      res.json({ return: ret, order: order ?? null, items });
    } catch (error) {
      console.error("Error fetching return detail:", error);
      res.status(500).json({ error: "Failed to fetch return detail" });
    }
  });

  // Approve a pending return and schedule a reverse pickup with Delhivery.
  // Inverts the shipping logic (customer address = pickup point, store
  // warehouse = destination) via the store-scoped Delhivery client, then
  // persists the generated reverse AWB and flips status to PICKUP_SCHEDULED.
  app.post("/api/returns/:id/approve-pickup", async (req, res) => {
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
      // Only pending returns can be approved into a pickup.
      if (ret.status !== "PENDING_APPROVAL" && ret.status !== "PENDING_FEE") {
        return res.status(400).json({
          error: `Return is not in a pending state (current: ${ret.status})`,
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
          error: "Order is missing a shipping address; cannot schedule a pickup",
        });
      }

      // Store-scoped Delhivery client (decrypts this store's token).
      let delhiveryClient;
      try {
        const { getDelhiveryClient } = await import("./services/delhivery");
        delhiveryClient = await getDelhiveryClient(storeId);
      } catch (e: any) {
        return res.status(400).json({
          error: e?.message || "Delhivery is not configured for this store",
        });
      }

      const result = await delhiveryClient.createReversePickup({
        rmaNumber: ret.rmaNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        pickupAddressLine1: order.shippingAddressLine1,
        pickupAddressLine2: order.shippingAddressLine2 ?? undefined,
        pickupCity: order.shippingCity ?? "",
        pickupState: order.shippingState ?? "",
        pickupPincode: order.shippingPincode,
        pickupCountry: order.shippingCountry ?? undefined,
      });

      if (!result.success || !result.awb) {
        return res.status(502).json({
          error: result.error || "Delhivery did not return a reverse AWB",
        });
      }

      const updated = await storage.updateReturn(ret.id, {
        status: "PICKUP_SCHEDULED",
        trackingAwb: result.awb,
      });

      console.log(
        `[returns] storeId=${storeId} RMA=${ret.rmaNumber} reverse pickup scheduled, AWB=${result.awb}`,
      );

      res.json({ success: true, awb: result.awb, return: updated });
    } catch (error: any) {
      console.error("Error scheduling reverse pickup:", error);
      res.status(500).json({ error: error?.message || "Failed to schedule pickup" });
    }
  });

  // ============================================================================
  // PUBLIC RETURNS API (Shopify storefront — direct browser fetch)
  //
  // The returns UI is deployed directly into the Shopify theme (no App
  // Proxy), so these routes are called straight from the customer's
  // browser. Security model:
  //   • Strict CORS: only the configured STOREFRONT_DOMAIN origin is
  //     allowed (reflected, not "*"); preflight from any other origin 403s.
  //   • Identity gate: lookup requires BOTH a valid order number AND a
  //     matching customer email/phone before any order data is returned.
  //   • Whitelisted payloads: only customer-facing fields are returned — no
  //     internal storeId costs, margins, or backend tracking IDs leak out.
  //   • Authoritative store scoping: create derives storeId from the order
  //     itself, never trusting a client-supplied value.
  //   • Generic 404s on the lookup so attackers can't probe which half
  //     (order number vs. contact) was wrong.
  // Server-to-server callers (e.g. the PayU webhook) send no Origin header,
  // so they bypass CORS untouched — CORS is a browser-enforced control.
  // ============================================================================

  const storefrontOrigin = process.env.STOREFRONT_DOMAIN?.trim().replace(
    /\/+$/,
    "",
  );
  if (!storefrontOrigin) {
    console.warn(
      "[public-cors] STOREFRONT_DOMAIN is not set — browser calls to /api/public will be blocked by CORS until it is configured.",
    );
  }

  app.use("/api/public", (req, res, next) => {
    const origin = req.headers.origin;
    const allowed = !!storefrontOrigin && origin === storefrontOrigin;

    if (allowed) {
      res.header("Access-Control-Allow-Origin", storefrontOrigin!);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    }

    // Preflight: 204 for the allowed storefront origin, 403 otherwise.
    if (req.method === "OPTIONS") {
      return res.sendStatus(allowed ? 204 : 403);
    }

    next();
  });

  // Look up an order for the returns flow. Requires order number + a
  // matching email/phone; returns only customer-facing order + item data.
  app.post("/api/public/returns/lookup", async (req, res) => {
    try {
      const { orderNumber, customerEmailOrPhone, storeId } = req.body ?? {};
      if (!orderNumber || !customerEmailOrPhone) {
        return res
          .status(400)
          .json({ error: "orderNumber and customerEmailOrPhone are required" });
      }

      const normalizedNumber = String(orderNumber).trim().replace(/^#/, "");
      // Try the bare number, then the #-prefixed variant Shopify sometimes stores.
      const order =
        (await storage.getOrderByShopifyOrderNumber(
          normalizedNumber,
          storeId || undefined,
        )) ||
        (await storage.getOrderByShopifyOrderNumber(
          `#${normalizedNumber}`,
          storeId || undefined,
        ));

      // Generic failure — never reveal whether the order exists until the
      // contact detail is also verified.
      const fail = () =>
        res.status(404).json({
          error:
            "No matching order found. Check the order number and email/phone.",
        });
      if (!order) return fail();

      // Identity check: email (case-insensitive) OR phone (last 10 digits).
      const probe = String(customerEmailOrPhone).trim().toLowerCase();
      const probeDigits = probe.replace(/\D/g, "");
      const emailMatch =
        !!order.customerEmail && order.customerEmail.toLowerCase() === probe;
      const orderPhoneDigits = (order.customerPhone || "").replace(/\D/g, "");
      const phoneMatch =
        probeDigits.length >= 6 &&
        orderPhoneDigits.length >= 6 &&
        orderPhoneDigits.slice(-10) === probeDigits.slice(-10);
      if (!emailMatch && !phoneMatch) return fail();

      const items = await storage.getOrderItems(order.id);

      // Whitelist only what the customer needs to pick items to return.
      res.json({
        order: {
          orderId: order.id,
          storeId: order.storeId,
          orderNumber: order.shopifyOrderNumber,
          orderDate: order.shopifyCreatedAt,
          customerName: order.customerName,
          totalPrice: order.totalPrice,
        },
        items: items.map((it) => ({
          orderItemId: it.id,
          productName: it.productName,
          variantTitle: it.variantTitle,
          sku: it.sku,
          quantity: it.quantity,
          price: it.price,
          imageUrl: it.imageUrl,
        })),
      });
    } catch (error) {
      console.error("Error in public returns lookup:", error);
      res.status(500).json({ error: "Lookup failed" });
    }
  });

  // Create a return request from the storefront. Validates selected items
  // against the order, computes the expected refund, and inserts the RMA
  // + return_items atomically with status PENDING_FEE.
  app.post("/api/public/returns/create", async (req, res) => {
    try {
      const { orderId, items, customerNotes } = req.body ?? {};
      if (!orderId || !Array.isArray(items) || items.length === 0) {
        return res
          .status(400)
          .json({ error: "orderId and a non-empty items array are required" });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      // Authoritative store scope — derived from the order, never the client.
      const storeId = order.storeId;

      // Validate every selected orderItemId actually belongs to this order.
      const orderItems = await storage.getOrderItems(orderId);
      const itemById = new Map(orderItems.map((it) => [it.id, it]));

      let refundTotal = 0;
      const reasons: string[] = [];
      const returnItemsToInsert: InsertReturnItem[] = [];
      for (const sel of items) {
        const oi = itemById.get(sel?.orderItemId);
        if (!oi) {
          return res
            .status(400)
            .json({ error: `Item ${sel?.orderItemId} is not part of this order` });
        }
        const qty = Math.max(1, Math.min(Number(sel.quantity) || 1, oi.quantity));
        refundTotal += (parseFloat(oi.price) || 0) * qty;
        if (sel.returnReason) reasons.push(String(sel.returnReason));
        returnItemsToInsert.push({
          returnId: "", // overwritten inside createReturnWithItems
          orderItemId: oi.id,
          quantity: qty,
          // First-class per-item reason; `condition` stays null until
          // the item is physically inspected on receipt.
          returnReason: sel.returnReason ? String(sel.returnReason) : null,
          condition: null,
        } as InsertReturnItem);
      }

      const refundAmount = refundTotal.toFixed(2);
      const orderNum = (order.shopifyOrderNumber || "").replace(/^#/, "") || "ORD";
      const rand = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
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
          refundAmount,
          // refundType defaults to STORE_CREDIT in the schema
        } as InsertReturn,
        returnItemsToInsert,
      );

      // Build the PayU hosted-checkout payload for the ₹150 return fee.
      // txnid IS the rmaNumber (unique) so the webhook can find the return.
      // If PayU isn't configured we still return the created RMA so the
      // storefront can surface a graceful "fee setup pending" state.
      let payu:
        | {
            key: string;
            txnid: string;
            amount: string;
            productinfo: string;
            firstname: string;
            email: string;
            hash: string;
          }
        | null = null;
      try {
        const txnid = created.rmaNumber;
        const amount = RETURN_FEE_AMOUNT; // "150.00"
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
          hash,
        };
      } catch (e: any) {
        console.warn(
          `[payu] could not build hash for ${created.rmaNumber}: ${e?.message}`,
        );
      }

      res.status(201).json({
        rmaNumber: created.rmaNumber,
        refundAmount,
        status: created.status,
        payu,
      });
    } catch (error: any) {
      console.error("Error in public returns create:", error);
      res.status(500).json({ error: "Failed to create return" });
    }
  });

  // PayU server-to-server payment callback. PayU POSTs form-urlencoded
  // data (not JSON), so we attach express.urlencoded explicitly. NOT under
  // /api/public/returns, so the Shopify App-Proxy HMAC doesn't apply —
  // this endpoint authenticates via PayU's own reverse hash instead.
  app.post(
    "/api/public/webhooks/payu",
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const payload = (req.body ?? {}) as Record<string, any>;
        const { txnid, status, mihpayid } = payload;

        // Authenticate the callback via PayU's reverse hash.
        if (!verifyPayuHash(payload)) {
          console.warn(
            `[payu-webhook] invalid hash for txnid=${txnid ?? "?"}`,
          );
          // 200 so PayU doesn't hammer retries on a rejected payload.
          return res.status(200).json({ received: true, verified: false });
        }

        if (status !== "success") {
          console.log(
            `[payu-webhook] txnid=${txnid} status=${status} — no state change`,
          );
          return res.status(200).json({ received: true, verified: true });
        }

        // txnid is the rmaNumber we generated at create time.
        const ret = await storage.getReturnByRmaNumber(String(txnid));
        if (!ret) {
          console.warn(`[payu-webhook] no return for txnid=${txnid}`);
          return res.status(200).json({ received: true, found: false });
        }

        // Idempotent: only advance a still-pending-fee return.
        if (ret.status === "PENDING_FEE") {
          await storage.updateReturn(ret.id, {
            status: "PENDING_APPROVAL",
            returnFeePaid: true,
            payuTransactionId: mihpayid ? String(mihpayid) : null,
          });
          console.log(
            `[payu-webhook] RMA ${ret.rmaNumber} fee paid (mihpayid=${mihpayid}); → PENDING_APPROVAL`,
          );
        }

        res.status(200).json({ received: true, verified: true });
      } catch (error) {
        console.error("Error in PayU webhook:", error);
        // Still 200 — PayU treats non-200 as failure and retries.
        res.status(200).json({ received: true });
      }
    },
  );

  // ── Admin: retroactive order-item image backfill ────────────────
  //
  // After a store has been historically synced and THEN the product
  // catalog is synced, the order_items rows from the historical
  // sync are stuck with image_url=NULL because the per-variant
  // image lookup ran while the products table was empty for that
  // store. This route fixes them in one atomic UPDATE.
  //
  // Idempotent: re-running matches nothing because every fixable
  // row is no longer NULL.
  //
  // Returns:
  //   updated                    — number of order_items rows just patched
  //   missingVariantsInCatalog   — variants that still have NULL images
  //                                because no products row exists for
  //                                them (admin should re-sync products
  //                                if this is non-zero).
  app.post("/api/admin/backfill-order-item-images", async (req, res) => {
    try {
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const result = await storage.backfillOrderItemImages(scope.storeId);
      console.log(
        `[image-backfill] storeId=${scope.storeId} updated=${result.updated} missingInCatalog=${result.missingVariantsInCatalog}`,
      );
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("Error backfilling order-item images:", error);
      res.status(500).json({
        error: "Failed to backfill images",
        details: error?.message,
      });
    }
  });

  // Get product sync status — scoped to the active store so the
  // Settings card shows counts for whichever tenant the switcher
  // is on.
  app.get("/api/admin/products/status", async (req, res) => {
    try {
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const count = await storage.getProductCount(scope.storeId);
      const lastSync = await storage.getLastProductSync(scope.storeId);

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
      // Phase 5 (Risk #4): scope the lookup to the active store so
      // a variant id that happens to exist in two stores returns
      // the row belonging to the requester's tenant. The storeScope
      // middleware resolves req.storeScope from the
      // X-Active-Store-Id header on every authenticated request.
      const scope = requireStoreScope(req, res);
      if (!scope) return;
      const product = await storage.getProductByVariantId(
        req.params.variantId,
        scope.storeId,
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
      // Always strip password; additionally strip payroll fields when
      // the requester is not an admin (or when no currentUserId is
      // supplied, which we treat as the safe default).
      const { scrub } = await resolveUserScrub(req);
      res.json(users.map(scrub));
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
      // Self-fetches return full payroll fields; cross-user fetches
      // are scrubbed for non-admins. resolveUserScrub treats a missing
      // currentUserId as agent-level (safe default).
      const { isAdmin: requesterIsAdmin, scrub } = await resolveUserScrub(req);
      const isSelf =
        typeof req.query.currentUserId === "string" &&
        req.query.currentUserId === req.params.id;
      const finalScrub = requesterIsAdmin || isSelf ? stripPassword : scrub;
      res.json(finalScrub(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // POST /api/users — DELETED (security patch).
  //
  // Previously this endpoint accepted an unauthenticated payload and
  // wrote it straight to the users table, including a client-supplied
  // `role`. An anonymous attacker could register themselves as a
  // full-control admin with one curl request. No frontend code called
  // this route; it was an orphaned vulnerability.
  //
  // All legitimate user-creation paths now go through:
  //   - POST /api/invites           (admin invites teammate)
  //   - POST /api/invites/accept    (invitee creates their account)
  //   - POST /api/auth/register-admin (one-time bootstrap when users
  //                                   table is empty)
  //
  // Anything hitting POST /api/users now falls through Express's
  // default handler and returns 404 — intentional.

  // ============================================================================
  // BOOTSTRAP: FIRST-ADMIN SELF-SIGNUP
  // ============================================================================
  //
  // This endpoint lets the very first user register themselves as a
  // full-control admin. It is ONLY accessible when the users table is empty.
  // Every subsequent attempt returns 403 and directs the caller to the
  // invite flow. This is how a freshly provisioned database bootstraps the
  // first administrator without needing an out-of-band invite.

  // Lightweight probe for the frontend to decide whether to show the
  // "Create admin account" tab on the login page.
  // ============================================================================
  // POST /api/auth/login
  //
  // Server-authoritative password verification. Replaces the previous
  // client-side compare (which fetched /api/users/by-email and string-
  // compared the plaintext password in the browser — a security
  // disaster).
  //
  // Behaviour:
  //   1. Look up user by email.
  //   2. Verify password via bcryptjs (handles both bcrypt-shaped
  //      hashes and legacy plaintext rows during the cutover — see
  //      server/auth.ts verifyPassword for the migration logic).
  //   3. If the row is still plaintext, silently re-hash and write
  //      back so the next login takes the secure path.
  //   4. Return the user (password stripped) for the client's
  //      transitional localStorage shim. Phase 2 will replace this
  //      with a real signed session cookie.
  //
  // Errors are intentionally generic ("Invalid email or password") to
  // avoid leaking which half of the credential pair was wrong.
  // ============================================================================
  app.post("/api/auth/login", async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required." });
      }

      const user = await storage.getUserByEmail(email);
      // Always run a bcrypt compare — even on miss — to keep response
      // timing roughly constant and avoid an email-enumeration oracle.
      // We feed a known-bad hash so the path is real work, not a stub.
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

      // Transitional rehash: the row was plaintext; write the bcrypt
      // form back so the next login takes the secure path. Don't
      // block the response on this — fire and forget.
      if (needsRehash) {
        hashPassword(password)
          .then((hashed) => storage.setUserPassword(user.id, hashed))
          .catch((err) => console.warn(`[auth] background rehash failed for ${email}: ${err?.message}`));
      }

      // Establish a real server-side session. After this line the
      // identity middleware (server/index.ts) will inject this userId
      // into every subsequent request, overriding anything the client
      // tries to claim via ?currentUserId=.
      req.session.userId = user.id;
      // Force a save so the Set-Cookie header is committed before the
      // response goes out (saveUninitialized: false means we have to
      // mutate the session to trigger persistence, which we just did).
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

      // Strip password (and password-shaped fields) before responding.
      // Returns the same shape the legacy /api/users/by-email endpoint
      // does so the client's transitional localStorage shim keeps
      // working without changes elsewhere.
      const { password: _pw, ...safe } = user as any;
      res.json(safe);
    } catch (error: any) {
      console.error("Error in /api/auth/login:", error);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // ============================================================================
  // GET /api/auth/me
  //
  // Returns the current session-authenticated user. Used by the
  // frontend's useAuth() hook on app boot to rehydrate identity from
  // the cookie (and, in Phase 3+, to populate the active-store list).
  //
  // 200 → user object (password stripped)
  // 401 → no valid session
  // ============================================================================
  // ============================================================================
  // GET /api/stores/me — stores the signed-in user can switch between
  //
  // Backs the Phase 3 store-switcher in the sidebar. Returns a small,
  // safely-scrubbed shape (no encrypted credential blobs) so the
  // frontend has everything it needs to render the dropdown and
  // attach `X-Active-Store-Id` on subsequent requests.
  //
  // Visibility rules mirror server/storeScope.ts:
  //   • Admins              → every row from `stores`, ordered by
  //                            createdAt asc so the legacy single
  //                            store stays the default.
  //   • Non-admin users     → just the rows joined via `user_stores`
  //                            (their explicit memberships), ordered
  //                            the same way.
  //
  // Returns 401 when no session, 200 with [] when the user has zero
  // memberships (the UI then renders a banner asking the admin to
  // grant access — never silently fall back to a store they shouldn't
  // see).
  // ============================================================================
  app.get("/api/stores/me", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        // Stale session — same handling as /api/auth/me.
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Session user no longer exists." });
      }

      // Common projection: the fields the frontend needs to render
      // the switcher dropdown. We deliberately omit api_key /
      // api_secret / access_token / webhook_secret — those are
      // encrypted blobs the client never has any reason to see.
      const projection = {
        id: stores.id,
        storeName: stores.storeName,
        storeUrl: stores.storeUrl,
        logoUrl: stores.logoUrl,
        isActive: stores.isActive,
        createdAt: stores.createdAt,
      };

      let rows: Array<{
        id: string;
        storeName: string | null;
        storeUrl: string;
        logoUrl: string | null;
        isActive: boolean | null;
        createdAt: Date | null;
      }>;

      if (isAdmin(user)) {
        rows = await db
          .select(projection)
          .from(stores)
          .orderBy(asc(stores.createdAt));
      } else {
        rows = await db
          .select(projection)
          .from(stores)
          .innerJoin(userStores, eq(userStores.storeId, stores.id))
          .where(eq(userStores.userId, userId))
          .orderBy(asc(stores.createdAt));
      }

      res.json({ stores: rows });
    } catch (error: any) {
      console.error("Error in /api/stores/me:", error);
      res.status(500).json({ error: "Failed to load stores." });
    }
  });

  // ============================================================================
  // POST /api/stores — admin connects a brand-new Shopify store
  //
  // Phase 4: multi-store onboarding. This is the multi-store equivalent of
  // the legacy POST /api/shopify/credentials route (which writes to the
  // single-row `shopify_credentials` table). It:
  //
  //   1. Validates the request body (storeUrl + apiKey + apiSecret are
  //      required; storeName + webhookSecret optional).
  //   2. Rejects duplicate storeUrls before issuing the test call —
  //      catches the "I already added Acme, why didn't it work" case
  //      with a clear 409 instead of a Postgres unique-violation.
  //   3. Live-tests the credentials with a one-off ShopifyClient
  //      (client_credentials grant). A failed test still returns 200
  //      but skips the INSERT and surfaces the error so the form can
  //      show it. We refuse to commit creds we can't verify.
  //   4. Encrypts the secret material and INSERTs the stores row.
  //   5. Auto-grants the creating admin a user_stores row so the
  //      switcher sees the new store on next /api/stores/me refresh
  //      (admins technically have cross-store visibility but the
  //      explicit row keeps audit trails clean).
  //   6. If APP_URL is set, registers Shopify webhooks for this store
  //      via the per-store factory — same idempotent path the boot
  //      hook uses. Failures here don't block the create; the admin
  //      can re-trigger from /api/shopify/webhooks/register-all later.
  //
  // Returns the safe summary shape (no encrypted blobs) plus a
  // webhook registration report so the UI can show "3 of 4 topics
  // registered" if there were partial failures.
  // ============================================================================
  app.post("/api/stores", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const requester = await storage.getUser(userId);
      if (!requester) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      if (!isAdmin(requester)) {
        return res.status(403).json({ error: "Only admins can connect new stores." });
      }

      // Validate input. We deliberately do NOT use
      // insertShopifyCredentialsSchema here — that schema is for the
      // legacy single-store table and includes fields we don't accept
      // (e.g. is_active toggling). Inline validation keeps the
      // contract narrow.
      const {
        storeName,
        storeUrl,
        apiKey,
        apiSecret,
        webhookSecret,
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
      // Normalize the URL the same way the ShopifyClient does so a
      // copy-paste from the address bar (with https:// or a trailing
      // slash) doesn't create a second row that diverges by trivia.
      const normalizedUrl = trimmedUrl
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .toLowerCase();

      // Duplicate guard. Returns 409 with the existing store id so
      // the UI can offer a "switch to it" CTA.
      const [existing] = await db
        .select({ id: stores.id, storeName: stores.storeName })
        .from(stores)
        .where(eq(stores.storeUrl, normalizedUrl))
        .limit(1);
      if (existing) {
        return res.status(409).json({
          error: "A store with this URL is already connected.",
          existing,
        });
      }

      // Test the credentials before committing them.
      const { ShopifyClient: TempClient } = await import("./shopify");
      const tempClient = new TempClient({
        storeUrl: normalizedUrl,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        useClientCredentials: true,
      });

      let shopInfo: any = null;
      try {
        shopInfo = await tempClient.getShopInfo();
      } catch (testErr: any) {
        const message = testErr?.message || "Connection test failed";
        return res.status(400).json({
          error: `Could not connect to ${normalizedUrl}: ${message}`,
        });
      }

      // Persist. The displayed storeName falls back to whatever the
      // shop returns (`shop.name`) so users don't have to type it
      // twice — they can override later via PATCH /api/stores/:id.
      const finalStoreName =
        (typeof storeName === "string" && storeName.trim()) ||
        shopInfo?.name ||
        normalizedUrl;

      const [inserted] = await db
        .insert(stores)
        .values({
          storeName: finalStoreName,
          storeUrl: normalizedUrl,
          apiKey: encrypt(apiKey.trim()),
          apiSecret: encrypt(apiSecret.trim()),
          webhookSecret:
            typeof webhookSecret === "string" && webhookSecret.trim()
              ? encrypt(webhookSecret.trim())
              : null,
          isActive: true,
          lastTestedAt: new Date(),
          testStatus: "success",
          testMessage: `Connected to ${shopInfo?.name || normalizedUrl}`,
          connectedBy: requester.id,
        })
        .returning({
          id: stores.id,
          storeName: stores.storeName,
          storeUrl: stores.storeUrl,
          logoUrl: stores.logoUrl,
          isActive: stores.isActive,
          createdAt: stores.createdAt,
        });

      // Auto-grant the creating admin. Admins implicitly see every
      // store via the storeScope middleware (isAdmin bypass), but
      // having the user_stores row keeps a clean record of who
      // connected what — and means a future "demote admin → agent"
      // change doesn't silently strip them off this store.
      await db
        .insert(userStores)
        .values({ userId: requester.id, storeId: inserted.id, createdBy: requester.id })
        .onConflictDoNothing();

      // Best-effort webhook registration. Failures here are non-fatal
      // — the store is already saved, and the admin can re-trigger
      // from the Webhook Status card. We collect the per-topic
      // result so the UI can render it.
      let webhookReport:
        | { topics: Array<{ topic: string; address: string; action: string; error?: string }> }
        | null = null;
      const appUrl = process.env.APP_URL;
      if (appUrl && /^https:\/\//i.test(appUrl)) {
        try {
          const { getShopifyClient } = await import("./shopify");
          const client = await getShopifyClient(inserted.id);
          webhookReport = await client.registerAllWebhooks(appUrl);
        } catch (err: any) {
          console.warn(
            `[stores] webhook registration for ${inserted.id} failed:`,
            err?.message ?? err,
          );
        }
      } else {
        console.warn(
          `[stores] APP_URL not set or not https — skipping webhook registration for ${inserted.id}`,
        );
      }

      res.status(201).json({
        store: inserted,
        shopName: shopInfo?.name ?? null,
        webhooks: webhookReport,
      });
    } catch (error: any) {
      console.error("Error in POST /api/stores:", error);
      res.status(500).json({ error: "Failed to connect store." });
    }
  });

  // ============================================================================
  // PATCH /api/stores/:id — admin updates a store's display metadata
  //
  // Today this only touches storeName and logoUrl — fields the team
  // wants to control without going back into the Shopify admin. Auth
  // headers, webhook secrets, and the rest of the credential block
  // are deliberately NOT mutable through this route; those still
  // flow through the dedicated /api/settings/shopify connect/test
  // path.
  //
  // Authorization: admin role only. Non-admins (agents, chat_support,
  // recovery_agent) can't reach this even for stores they have
  // user_stores membership for — branding is a tenant-admin concern,
  // not an agent task. The route returns 403 with a clear message
  // so the UI knows to hide the editor for those roles.
  //
  // logoUrl shapes accepted:
  //   • data:image/(png|jpeg|jpg|webp|svg+xml);base64,<…>
  //   • http://… or https://… URLs
  //   • null / empty string → clears the logo, switcher falls back
  //     to the deterministic gradient avatar.
  //
  // Size cap: 2 MB after base64 expansion. 2 MB of base64 is ~1.5 MB
  // of real image bytes; well above what a sensible workspace logo
  // needs. We reject larger uploads here so the orders/users rows
  // beside this in pg don't get noisy with 5+ MB blobs.
  // ============================================================================
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;
  app.patch("/api/stores/:id", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const requester = await storage.getUser(userId);
      if (!requester) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      if (!isAdmin(requester)) {
        return res
          .status(403)
          .json({ error: "Only admins can update store details." });
      }

      const storeId = req.params.id;
      const [existing] = await db
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Store not found." });
      }

      // Validate logoUrl if present in the body. We treat "field
      // omitted entirely" as "don't touch this column", while explicit
      // null or "" clears it. That distinction matters when the UI
      // wants to update just storeName without re-sending the logo.
      const patch: Partial<{ storeName: string | null; logoUrl: string | null }> = {};

      if (Object.prototype.hasOwnProperty.call(req.body, "storeName")) {
        const v = req.body.storeName;
        if (v === null || v === "") {
          patch.storeName = null;
        } else if (typeof v === "string" && v.trim().length <= 120) {
          patch.storeName = v.trim();
        } else {
          return res
            .status(400)
            .json({ error: "storeName must be a string up to 120 characters." });
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
            /^data:image\/(png|jpe?g|webp|svg\+xml|gif);base64,([A-Za-z0-9+/=]+)$/i,
          );
          if (!isHttp && !dataUriMatch) {
            return res.status(400).json({
              error:
                "logoUrl must be an http(s) URL or a base64 data URI for png/jpeg/webp/svg/gif.",
            });
          }
          // Soft size cap on data URIs — http URLs we trust (we're
          // not fetching them server-side here).
          if (dataUriMatch) {
            // Bytes of the encoded source (the data URI string),
            // since that's what Postgres will store. Cheaper to
            // check than decoding the base64.
            if (Buffer.byteLength(trimmed, "utf8") > MAX_LOGO_BYTES) {
              return res.status(413).json({
                error: `Logo data URI exceeds ${MAX_LOGO_BYTES} bytes. Compress the image or host it on a URL.`,
              });
            }
          }
          patch.logoUrl = trimmed;
        }
      }

      if (Object.keys(patch).length === 0) {
        return res
          .status(400)
          .json({ error: "No supported fields supplied. Allowed: storeName, logoUrl." });
      }

      const [updated] = await db
        .update(stores)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(stores.id, storeId))
        .returning({
          id: stores.id,
          storeName: stores.storeName,
          storeUrl: stores.storeUrl,
          logoUrl: stores.logoUrl,
          isActive: stores.isActive,
          createdAt: stores.createdAt,
          updatedAt: stores.updatedAt,
        });

      // Defensive: drop the cached ShopifyClient for this store so
      // any subsequent outbound call re-reads the row. logoUrl
      // itself isn't in the ShopifyConfig, but keeping cache and
      // DB perfectly in lock-step is cheap and avoids a "why didn't
      // my rename take?" debug spiral later.
      const { invalidateShopifyClient } = await import("./shopify");
      invalidateShopifyClient(storeId);

      res.json({ store: updated });
    } catch (error: any) {
      console.error("Error in PATCH /api/stores/:id:", error);
      res.status(500).json({ error: "Failed to update store." });
    }
  });

  // ============================================================================
  // GET  /api/users/:userId/stores  — list a user's store memberships
  // PUT  /api/users/:userId/stores  — reconcile to { storeIds: [] }
  //
  // Phase 4 RBAC endpoints, used by the "Manage Access" modal in the
  // Team Directory. Admin-only (both routes). The PUT performs a
  // full set-reconcile rather than expecting incremental
  // ADD/REMOVE operations: the modal renders a checkbox list, the
  // user clicks Save, and we sync the DB to whatever's currently
  // checked. Simpler model than incremental diffs and avoids race
  // conditions when two admins manage the same user at once
  // (last-write-wins on the full set).
  //
  // Admin-level memberships are stored too — admins implicitly see
  // every store via the isAdmin bypass in storeScope.ts, but the
  // explicit user_stores row keeps audit trails clean. The PUT
  // happily accepts and removes admin memberships as well.
  // ============================================================================
  app.get("/api/users/:userId/stores", async (req, res) => {
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
      const rows = await db
        .select({ storeId: userStores.storeId })
        .from(userStores)
        .where(eq(userStores.userId, targetId));
      res.json({ storeIds: rows.map((r) => r.storeId) });
    } catch (error: any) {
      console.error("Error in GET /api/users/:userId/stores:", error);
      res.status(500).json({ error: "Failed to load user store access." });
    }
  });

  app.put("/api/users/:userId/stores", async (req, res) => {
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
      // Body shape: { storeIds: string[] }. Coerce to a Set for the
      // diff so duplicate entries in the payload don't cause spurious
      // conflict errors.
      const requested = req.body?.storeIds;
      if (!Array.isArray(requested) || requested.some((s) => typeof s !== "string")) {
        return res.status(400).json({
          error: "storeIds must be an array of store id strings.",
        });
      }
      const requestedSet = new Set<string>(requested);

      // Validate every requested id corresponds to a real store. We
      // could rely on FK constraints, but the explicit check yields
      // a clearer error (which id is invalid) without partial writes.
      const requestedIds = Array.from(requestedSet);
      if (requestedIds.length > 0) {
        const existingStores = await db
          .select({ id: stores.id })
          .from(stores);
        const knownIds = new Set(existingStores.map((s) => s.id));
        const unknown = requestedIds.filter((id) => !knownIds.has(id));
        if (unknown.length > 0) {
          return res.status(400).json({
            error: "Unknown store id(s) in storeIds.",
            unknown,
          });
        }
      }

      // Current memberships → diff against requested set.
      const current = await db
        .select({ storeId: userStores.storeId })
        .from(userStores)
        .where(eq(userStores.userId, targetId));
      const currentSet = new Set(current.map((r) => r.storeId));
      const currentIds = Array.from(currentSet);

      const toInsert = requestedIds.filter((id) => !currentSet.has(id));
      const toDelete = currentIds.filter((id) => !requestedSet.has(id));

      // Apply. Neon-serverless driver doesn't support multi-statement
      // BEGIN/COMMIT over a single websocket round-trip in the same
      // shape Postgres clients usually expect, so we do these as two
      // independent statements. The window between insert and delete
      // is tiny and the final state is correct even if a delete is
      // observed mid-flight (the data plane just sees a partial
      // grant — never an over-grant).
      if (toInsert.length > 0) {
        await db
          .insert(userStores)
          .values(
            toInsert.map((storeId) => ({
              userId: targetId,
              storeId,
              createdBy: requester.id,
            })),
          )
          .onConflictDoNothing();
      }
      if (toDelete.length > 0) {
        // Drizzle's `inArray` operator import isn't already pulled in
        // up top; build the OR-chain inline.
        await db.delete(userStores).where(
          and(
            eq(userStores.userId, targetId),
            or(...toDelete.map((id) => eq(userStores.storeId, id))),
          ),
        );
      }

      res.json({
        storeIds: requestedIds,
        added: toInsert,
        removed: toDelete,
      });
    } catch (error: any) {
      console.error("Error in PUT /api/users/:userId/stores:", error);
      res.status(500).json({ error: "Failed to update user store access." });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated." });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        // Session points at a user that no longer exists (deleted).
        // Clear the session and 401 — the client will redirect to login.
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Session user no longer exists." });
      }
      if (!user.isActive) {
        req.session.destroy(() => {});
        return res.status(403).json({ error: "This account has been deactivated." });
      }
      const { password: _pw, ...safe } = user as any;
      res.json(safe);
    } catch (error: any) {
      console.error("Error in /api/auth/me:", error);
      res.status(500).json({ error: "Failed to load session." });
    }
  });

  // ============================================================================
  // POST /api/auth/logout
  //
  // Destroys the server-side session row and clears the cookie. The
  // client should also clear its localStorage shim after this returns
  // 200 (handled by the frontend logout handler — see profile-dropdown).
  // ============================================================================
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        // Even on error, clear the cookie on the client. The orphan
        // session row in the DB will TTL out via connect-pg-simple's
        // pruner — not a security risk because the cookie is gone.
      }
      res.clearCookie("orderflow.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/can-register-admin", async (_req, res) => {
    try {
      const existing = await storage.listUsers({});
      res.json({ canRegister: existing.length === 0 });
    } catch (error) {
      console.error("Error checking bootstrap state:", error);
      res.status(500).json({ error: "Failed to check bootstrap state" });
    }
  });

  app.post("/api/auth/register-admin", async (req, res) => {
    try {
      // Gate: only allowed on a completely empty users table.
      const existing = await storage.listUsers({});
      if (existing.length > 0) {
        return res.status(403).json({
          error:
            "Registration is closed. This workspace already has administrators — ask one of them to send you an invite.",
        });
      }

      // Force admin role regardless of what the client sends.
      const payload = {
        ...req.body,
        role: "admin" as const,
        adminType: "full_control" as const,
        permissions: null,
      };

      const validatedData = insertUserSchema.parse(payload);

      // Double-check uniqueness (defensive — the table should be empty).
      const existingUsername = await storage.getUserByUsername(
        validatedData.username,
      );
      if (existingUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
      const existingEmail = await storage.getUserByEmail(validatedData.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Bcrypt-hash the password BEFORE inserting. This is the
      // bootstrap/first-admin path so there's no existing row to
      // collide with, but the security invariant is the same as
      // every other write path: plaintext never reaches users.password.
      const hashedPassword = await hashPassword(validatedData.password);
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
      });

      // Bootstrap admins are logged in immediately — same session
      // contract as /api/auth/login so the redirect to / works.
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

      const { password: _password, ...safeUser } = user as any;
      res.status(201).json(safeUser);
    } catch (error) {
      if (error instanceof ZodError) {
        return res
          .status(400)
          .json({ error: "Invalid user data", details: error.errors });
      }
      console.error("Error registering first admin:", error);
      res.status(500).json({ error: "Failed to register first admin" });
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
      // PATCH is admin-only at the auth layer above; safe to leave
      // payroll fields. Always strip password.
      res.json(stripPassword(user));
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // ============================================================================
  // KYC DOCUMENT UPLOAD
  // ============================================================================
  //
  // Local-disk foundation. When we move to S3:
  //  - swap `kycUpload` in server/upload.ts for a `multer-s3` storage engine
  //  - change the stored value to the S3 object key
  //  - replace the download route with a 302 to a pre-signed S3 URL
  // The frontend contract stays identical.

  app.post(
    "/api/users/:id/kyc-upload",
    (req, res, next) => {
      // Multer throws for size/mime/ext issues — translate to a clean 400.
      kycUpload.single("document")(req, res, (err: any) => {
        if (err) {
          const message =
            err?.code === "LIMIT_FILE_SIZE"
              ? "File too large. Max 5 MB."
              : err?.message || "Invalid file";
          return res.status(400).json({ error: message });
        }
        next();
      });
    },
    async (req, res) => {
      const file = (req as any).file as Express.Multer.File | undefined;
      try {
        const targetUserId = req.params.id;
        const currentUserId =
          (req.body?.currentUserId as string) ||
          (req.query?.currentUserId as string) ||
          targetUserId;

        // Same auth pattern as PATCH /api/users/:id: self-edit is allowed;
        // editing someone else's profile requires canEditProfiles.
        const currentUser = await storage.getUser(currentUserId);
        if (!currentUser) {
          return res.status(404).json({ error: "Current user not found" });
        }
        if (targetUserId !== currentUserId && !canEditProfiles(currentUser)) {
          return res
            .status(403)
            .json({ error: "You don't have permission to upload for this user" });
        }

        if (!file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        // Verify the target user exists, and remove the previous KYC file
        // (if any) so we don't leave orphaned documents on disk.
        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
          // Best-effort cleanup of the just-uploaded file before erroring.
          try {
            fs.unlinkSync(file.path);
          } catch {}
          return res.status(404).json({ error: "User not found" });
        }
        if (targetUser.kycDocumentUrl) {
          const prior = resolveKycFilePath(targetUser.kycDocumentUrl);
          if (prior) {
            try {
              fs.unlinkSync(prior);
            } catch (e) {
              console.warn("[kyc] failed to remove prior file:", e);
            }
          }
        }

        const updated = await storage.updateUser(targetUserId, {
          kycDocumentUrl: file.filename,
        });
        if (!updated) {
          return res.status(404).json({ error: "User not found" });
        }
        res.json({
          message: "KYC document uploaded",
          kycDocumentUrl: updated.kycDocumentUrl,
          originalName: file.originalname,
          size: file.size,
        });
      } catch (err: any) {
        // If anything failed after the file landed on disk, remove it so
        // we don't accumulate orphaned uploads.
        if (file?.path) {
          try {
            fs.unlinkSync(file.path);
          } catch {}
        }
        console.error("Error uploading KYC document:", err);
        res.status(500).json({ error: "Failed to upload KYC document" });
      }
    },
  );

  // Gated download — in production on S3, this would 302 to a pre-signed
  // URL instead of streaming the file.
  app.get("/api/users/:id/kyc-document", async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const currentUserId =
        (req.query?.currentUserId as string) || targetUserId;

      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (targetUserId !== currentUserId && !canEditProfiles(currentUser)) {
        return res
          .status(403)
          .json({ error: "You don't have permission to view this document" });
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser?.kycDocumentUrl) {
        return res.status(404).json({ error: "No KYC document on file" });
      }

      const filePath = resolveKycFilePath(targetUser.kycDocumentUrl);
      if (!filePath) {
        return res
          .status(404)
          .json({ error: "KYC document file missing on disk" });
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
            ? "image/png"
            : "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="kyc-${targetUserId}${ext}"`,
      );
      res.sendFile(filePath);
    } catch (err) {
      console.error("Error serving KYC document:", err);
      res.status(500).json({ error: "Failed to serve KYC document" });
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

      res.json({ success: true, user: stripPassword(user) });
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

      res.json({ success: true, user: stripPassword(user) });
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

  // ============================================================================
  // HOLIDAYS
  // ============================================================================
  //
  // GET /api/holidays?userId=<id>&year=<yyyy>
  //
  // Returns the holiday calendar for the requesting user's
  // `users.holidayState` (MUMBAI / DELHI / BENGALURU / HYDERABAD). If
  // no state is assigned yet, returns []. The frontend attendance
  // calendar uses this to paint purple holiday markers — it doesn't
  // need to know which state to query.
  //
  // `year` defaults to the current calendar year (server clock) so a
  // request from January gets January-onwards correctly.
  //
  // Auth: same lightweight `userId` query-string convention as
  // /api/attendance et al.
  app.get("/api/holidays", async (req, res) => {
    try {
      const userId = typeof req.query.userId === "string" ? req.query.userId : null;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter required" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // No state assigned yet: return [] rather than 4-state-mashup
      // so the calendar simply shows zero holidays for unassigned
      // employees (matches the seed plan).
      if (!user.holidayState) {
        return res.json([]);
      }
      const yearParam = typeof req.query.year === "string" ? req.query.year : null;
      const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
      const rows = await storage.listHolidaysByState(
        user.holidayState,
        Number.isFinite(year) ? year : undefined,
      );
      res.json(rows);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  });

  // ============================================================================
  // PAYROLL
  // ============================================================================
  //
  // Three admin-only endpoints powering the Payroll dashboard:
  //   GET  /api/payroll/preview   — auto-fetch metrics + dry-run math
  //   POST /api/payroll/run       — finalize, render PDF, email, write ledger
  //   GET  /api/payroll/ledger    — list past runs for a (year, month)
  //   GET  /api/payroll/ledger/:id/pdf — download a previously generated PDF
  //
  // Auth: every endpoint demands `currentUserId` and rejects non-admins
  // with 403. Same convention as /api/analytics/pare.

  async function requireAdmin(req: any, res: any): Promise<{ ok: true } | { ok: false }> {
    const requesterId = typeof req.query.currentUserId === "string"
      ? req.query.currentUserId
      : typeof req.body?.currentUserId === "string"
        ? req.body.currentUserId
        : null;
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

  app.get("/api/payroll/preview", async (req, res) => {
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
        { expectedWorkingDays, runPayrollMath, ANNUAL_PAID_HOLIDAY_CAP },
        metrics,
      ] = await Promise.all([
        import("./services/payroll"),
        import("./services/payroll-metrics"),
      ]);

      const expectedDays = expectedWorkingDays(year, month);
      const [att, autoHolidays, deliveryRate, teamRate, ytdHolidays, existing] = await Promise.all([
        metrics.getAttendanceMetrics(userId, year, month),
        user.holidayState ? metrics.getAutoPaidHolidaysCount(user.holidayState, year, month) : 0,
        metrics.getConfirmationDeliveryRatePct(userId, year, month),
        metrics.getTeamDeliveryRatePct(year, month),
        metrics.getYtdPaidHolidaysUsed(userId, year, month),
        storage.getPayrollLedgerByPeriod(userId, year, month),
      ]);

      // Clip auto-holiday count to the remaining annual quota (cap = 11).
      // The admin can still override on the dashboard.
      const remainingQuota = Math.max(0, ANNUAL_PAID_HOLIDAY_CAP - ytdHolidays);
      const paidHolidaysAuto = Math.min(autoHolidays, remainingQuota);

      const baseSalary = user.baseSalary != null ? Number(user.baseSalary) : 0;
      const result = runPayrollMath({
        baseSalary,
        expectedWorkingDays: expectedDays,
        daysPresent: att.daysPresent,
        paidHolidaysUsed: paidHolidaysAuto,
        compensationProfile: (user.compensationProfile as any) ?? null,
        deliveryRatePct: deliveryRate,
        teamDeliveryRatePct: teamRate,
        personalRecoveryRatePct: null, // admin enters
        reshipsCount: null, // admin enters
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
          department: user.department,
        },
        period: { year, month },
        attendance: { ...att, expectedWorkingDays: expectedDays },
        holidayQuota: {
          annualCap: ANNUAL_PAID_HOLIDAY_CAP,
          ytdUsed: ytdHolidays,
          remaining: remainingQuota,
          autoCountFromCalendar: autoHolidays,
          autoCountAfterQuota: paidHolidaysAuto,
        },
        autoMetrics: {
          deliveryRatePct: deliveryRate,
          teamDeliveryRatePct: teamRate,
          personalRecoveryRatePct: null,
          reshipsCount: null,
        },
        math: result,
        existingLedger: existing
          ? {
              id: existing.id,
              status: existing.status,
              sentAt: existing.sentAt,
              finalPayout: existing.finalPayout,
            }
          : null,
      });
    } catch (error) {
      console.error("Error in /api/payroll/preview:", error);
      res.status(500).json({ error: "Failed to compute payroll preview" });
    }
  });

  app.post("/api/payroll/run", async (req, res) => {
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

      const payroll = await import("./services/payroll");
      const expectedDays = payroll.expectedWorkingDays(year, month);

      // Caller-supplied numbers (admin overrides). If a field is
      // missing/null we leave it unset; the engine treats null as zero
      // for incentive components.
      const daysPresent = parseIntOr(body.daysPresent, 0);
      const paidHolidaysUsed = parseIntOr(body.paidHolidaysUsed, 0);
      const deliveryRatePct = parseFloatOrNull(body.deliveryRatePct);
      const teamDeliveryRatePct = parseFloatOrNull(body.teamDeliveryRatePct);
      const personalRecoveryRatePct = parseFloatOrNull(body.personalRecoveryRatePct);
      const reshipsCount = parseIntOr(body.reshipsCount, 0);
      const notes = typeof body.notes === "string" ? body.notes : null;

      const baseSalary = Number(user.baseSalary);
      const profile =
        (user.compensationProfile as
          | "ORDER_CONFIRMATION"
          | "NDR_RTO"
          | "CHAT_SUPPORT"
          | null) ?? null;

      const math = payroll.runPayrollMath({
        baseSalary,
        expectedWorkingDays: expectedDays,
        daysPresent,
        paidHolidaysUsed,
        compensationProfile: profile,
        deliveryRatePct,
        teamDeliveryRatePct,
        personalRecoveryRatePct,
        reshipsCount,
      });

      // Persist (or update existing) ledger row before email — that
      // way a Resend failure doesn't lose the calculation; the route
      // patches dispatch fields after the email attempt.
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
        createdBy: req.body?.currentUserId ?? null,
      });

      // ── Render PDF + email ──────────────────────────────────────
      const { renderPayslipPdf } = await import("./services/payslip-pdf");
      const { sendPayslipEmail } = await import("./services/payslip-email");
      const data = {
        employee: {
          fullName: user.fullName,
          email: user.email,
          employeeId: user.employeeId ?? null,
          holidayState: user.holidayState ?? null,
          department: user.department ?? null,
        },
        period: { year, month },
        base: {
          baseSalary,
          expectedWorkingDays: expectedDays,
          daysPresent,
          paidHolidaysUsed,
          ratio: math.base.ratio,
          amount: math.base.amount,
          capped: math.base.capped,
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
          total: math.incentives.total,
        },
        finalPayout: math.finalPayout,
        ledgerId: created.id,
        generatedAt: new Date(),
      };

      let pdfFile: Awaited<ReturnType<typeof renderPayslipPdf>>;
      try {
        pdfFile = await renderPayslipPdf(data);
      } catch (pdfErr: any) {
        await storage.updatePayrollLedgerDispatch(created.id, {
          status: "failed",
          emailError: `PDF render failed: ${pdfErr?.message ?? String(pdfErr)}`,
        });
        return res.status(500).json({ error: "Payroll persisted but PDF render failed", ledgerId: created.id });
      }

      let dispatchOk = true;
      let dispatchErr: string | null = null;
      try {
        await sendPayslipEmail(data, pdfFile);
      } catch (emailErr: any) {
        dispatchOk = false;
        dispatchErr = emailErr?.message ?? String(emailErr);
      }

      await storage.updatePayrollLedgerDispatch(created.id, {
        status: dispatchOk ? "sent" : "failed",
        pdfFilename: pdfFile.filename,
        sentAt: dispatchOk ? new Date() : null,
        emailError: dispatchErr,
      });

      const fresh = await storage.getPayrollLedgerById(created.id);
      res.json({
        ledger: fresh,
        math,
        pdf: { filename: pdfFile.filename, byteLength: pdfFile.byteLength },
        emailSent: dispatchOk,
        emailError: dispatchErr,
      });
    } catch (error: any) {
      console.error("Error in /api/payroll/run:", error);
      res.status(500).json({ error: error?.message ?? "Failed to run payroll" });
    }
  });

  app.get("/api/payroll/ledger", async (req, res) => {
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

  // Re-render the PDF on demand from the persisted ledger row. This is
  // Vercel-safe: the previous implementation read from
  // `uploads/payslips/`, which is ephemeral on serverless (the file
  // from the original Run is gone the moment that invocation ends).
  // The ledger row carries every input the engine needs, and the PDF
  // template is a deterministic function of those inputs, so a fresh
  // render reproduces the original byte-for-byte (modulo
  // `generatedAt`, which intentionally reflects the download time).
  app.get("/api/payroll/ledger/:id/pdf", async (req, res) => {
    const auth = await requireAdmin(req, res);
    if (!auth.ok) return;
    try {
      const row = await storage.getPayrollLedgerById(req.params.id);
      if (!row) return res.status(404).json({ error: "Ledger entry not found" });

      const user = await storage.getUser(row.userId);
      if (!user) return res.status(404).json({ error: "Employee record missing" });

      const { renderPayslipPdfBuffer } = await import("./services/payslip-pdf");
      const period = `${row.year}-${String(row.month).padStart(2, "0")}`;
      const safeName = user.fullName.replace(/[^a-z0-9]/gi, "_");
      const filename = `${safeName}__${period}.pdf`;

      const buf = await renderPayslipPdfBuffer({
        employee: {
          fullName: user.fullName,
          email: user.email,
          employeeId: user.employeeId ?? null,
          holidayState: user.holidayState ?? null,
          department: user.department ?? null,
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
          capped:
            Number(row.basePayRatio) >= 1 &&
            row.daysPresent + row.paidHolidaysUsed > row.expectedWorkingDays,
        },
        incentives: {
          profile:
            (row.compensationProfile as
              | "ORDER_CONFIRMATION"
              | "NDR_RTO"
              | "CHAT_SUPPORT"
              | null) ?? null,
          deliveryRatePct: row.deliveryRatePct != null ? Number(row.deliveryRatePct) : null,
          teamDeliveryRatePct:
            row.teamDeliveryRatePct != null ? Number(row.teamDeliveryRatePct) : null,
          recoveryRatePct: row.recoveryRatePct != null ? Number(row.recoveryRatePct) : null,
          reshipsCount: row.reshipsCount ?? 0,
          confirmationBonus: Number(row.confirmationBonus),
          teamDeliveryBonus: Number(row.teamDeliveryBonus),
          recoveryBonus: Number(row.recoveryBonus),
          reshipsBonus: Number(row.reshipsBonus),
          total: Number(row.totalIncentives),
        },
        finalPayout: Number(row.finalPayout),
        ledgerId: row.id,
        generatedAt: new Date(),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", String(buf.byteLength));
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.end(buf);
    } catch (error: any) {
      console.error("Error rendering payslip PDF:", error);
      res.status(500).json({ error: error?.message ?? "Failed to render payslip PDF" });
    }
  });

  // Helpers used by the payroll routes (kept local to avoid leaking
  // into the global module surface).
  function parseIntOr(v: any, fallback: number): number {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : fallback;
  }
  function parseFloatOrNull(v: any): number | null {
    if (v == null || v === "") return null;
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  }
  function round4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

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
      // Phase 2: thread the active store id through so an agent's
      // NDR feed never includes events from a store they're not
      // currently looking at.
      const authResult = await enforceAgentReadFilter(
        currentUserId as string | undefined,
        undefined,
        req.storeScope?.storeId,
      );

      if (authResult.unauthorized) {
        return res.status(401).json({ error: authResult.reason || "Authorization required" });
      }

      // Get NDR events from database (all couriers) - filtered by agent if needed
      const result = await storage.listUnresolvedNDREvents({
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
        assignedTo: authResult.assignedTo, // Filter by agent if not admin
        storeId: authResult.storeId, // Phase 2: scope to active store
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
        // Use Delhivery API - select correct action based on what's provided.
        // Outbound calls run in the shipment's store context: resolve the
        // store-scoped client from shipment.storeId so the right account's
        // credentials are used (both stores share one account today, but
        // the factory keeps this correct if they diverge).
        if (!shipment.storeId) {
          return res.status(400).json({ error: "Shipment is missing store context; cannot route Delhivery call" });
        }
        const { getDelhiveryClient } = await import("./services/delhivery");
        let delhiveryClient;
        try {
          delhiveryClient = await getDelhiveryClient(shipment.storeId);
        } catch (e: any) {
          return res.status(400).json({ error: e?.message || "Delhivery not configured for this store" });
        }

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
        
        console.log(`[NDR Reattempt] AWB: ${awb}, store: ${shipment.storeId}, Action: ${actionType}, Data:`, actionData);

        const result = await delhiveryClient.actionNDR(awb, actionType, actionData);

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
      
      // Generate a cryptographically secure 64-char hex token (32
      // random bytes). Replaces the previous Math.random()-based token
      // which was predictable from a known seed and not safe for an
      // auth primitive — anyone who could observe a few tokens could
      // recover the PRNG state and forge new ones for arbitrary
      // emails. crypto.randomBytes draws from the OS CSPRNG.
      const token = crypto.randomBytes(32).toString("hex");
      
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

      // Bcrypt-hash the password BEFORE inserting. The invitee just
      // typed it in plaintext on the signup form; from this row's
      // creation onward, only the hash exists.
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
        department: null,
      });

      await storage.updateInviteStatus(invite.id, 'accepted');

      // Log the new user in immediately — they just proved ownership
      // of the invite token + chose a password, so a session is
      // appropriate. Avoids forcing them through the login form they
      // just finished setting credentials for.
      req.session.userId = newUser.id;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

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

  app.delete("/api/leave-requests/:id", async (req, res) => {
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
      
      // Build query conditions. Phase 5: scope by active store so
      // RTO Insights doesn't bleed between tenants. Date filter and
      // store filter compose into a single WHERE; both are
      // collapsed into the same conditions array so the SELECT
      // always carries the active-store predicate when present.
      const conditions = [];
      if (req.storeScope?.storeId) {
        conditions.push(eq(orders.storeId, req.storeScope.storeId));
      }
      if (startDateParsed && !isNaN(startDateParsed.getTime())) {
        conditions.push(gte(orders.createdAt, startDateParsed));
      }
      if (endDateParsed && !isNaN(endDateParsed.getTime())) {
        conditions.push(lte(orders.createdAt, endDateParsed));
      }

      // Query orders (with optional date + store filter)
      const baseSelect = db.select({
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
      const allOrders = conditions.length > 0
        ? await baseSelect.where(and(...conditions))
        : await baseSelect;

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

      const rawOrderId = payload["lead.order_id"];
      if (!rawOrderId) {
        return res.status(200).json({ success: true, updated: false });
      }

      const order = await storage.getOrderByShopifyOrderNumber(String(rawOrderId));
      if (!order) {
        return res.status(200).json({ success: true, updated: false });
      }

      const updateData: Record<string, unknown> = {};

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
          updateData.notes = existingNotes + `\nTeleCRM: ${incomingNotes.trim()}`;
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

      await storage.updateOrder(order.id, updateData as any);
      return res.status(200).json({ success: true, updated: true });
    } catch (err) {
      console.error("Error processing TeleCRM webhook:", err);
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

