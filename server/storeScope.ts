import type { Request, Response, NextFunction } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db } from "./db";
import { stores, userStores, users } from "@shared/schema";
import { isAdmin } from "./permissions";

// ─────────────────────────────────────────────────────────────────────
// Phase 2 — Backend store scoping.
//
// Every authenticated request is associated with exactly ONE active
// store. The store id flows through the rest of the request:
//
//   • As a `WHERE store_id = $1` clause on every store-scoped read
//     (orders, analytics, NDR, etc.) so a user never sees data from a
//     store they don't have access to.
//   • As the key for the per-store Shopify client factory so outbound
//     calls (tag updates, fulfillment events, syncs) target the right
//     shop domain.
//
// Resolution order:
//   1. `X-Active-Store-Id` request header — what the frontend will
//      start sending in Phase 3 (a store-switcher in the sidebar
//      writes the id into localStorage and an axios interceptor
//      attaches the header on every request).
//   2. Fallback: the user's first available `user_stores` row
//      (oldest by createdAt). Admins fall back to the oldest `stores`
//      row regardless of membership.
//
// The fallback is the load-bearing piece during the transition window
// between Phase 2 (this commit) and Phase 3 (frontend store-switcher).
// Today no client sends the header — the fallback path is what keeps
// production behaving exactly like single-store while we wire the
// header end-to-end.
//
// Authorization rules:
//   • Admin              → may target any store. Falls back to oldest
//                          stores row when no header is sent.
//   • Non-admin user     → may target only stores they have a
//                          `user_stores` row for. Falls back to their
//                          oldest such row. Header pointing at a store
//                          they don't have access to → 403.
//   • Unauthenticated    → no scope. `req.storeScope` stays undefined;
//                          handlers that need a store can short-circuit
//                          on that.
// ─────────────────────────────────────────────────────────────────────

export const STORE_HEADER_NAME = "x-active-store-id";

export interface StoreScope {
  /** The store id this request is targeting. */
  storeId: string;
  /** True if the requester is a platform admin (cross-store visibility). */
  isAdmin: boolean;
  /**
   * True when the storeId came from the user_stores / stores fallback
   * rather than an explicit `X-Active-Store-Id` header. Useful for
   * telemetry — when this flips to mostly-false we know the frontend
   * has finished rolling out the store switcher and the fallback can
   * be tightened (e.g. to 400 instead of resolving).
   */
  isFallback: boolean;
}

// Augment Express's Request type so handlers and middleware can read
// `req.storeScope` without an `as any` cast. Mirrors the pattern used
// for express-session's SessionData in server/index.ts.
declare module "express-serve-static-core" {
  interface Request {
    storeScope?: StoreScope;
  }
}

/**
 * Look up the store id for the current request.
 *
 * Returns `null` when the request has no session (webhooks,
 * unauthenticated endpoints, etc.) — callers can decide whether that's
 * a hard 401 or a no-op. Returns the resolved scope on success.
 *
 * Throws on hard authorization failures (user requested a store they
 * have no membership for) — the caller should map that to 403. We
 * encode the failure as a thrown `StoreScopeError` so middleware can
 * differentiate between "no scope available" (null) and "scope was
 * requested but denied" (throw).
 */
export class StoreScopeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "StoreScopeError";
  }
}

export async function resolveStoreScope(
  req: Request,
): Promise<StoreScope | null> {
  const sessionUserId = req.session?.userId;
  if (!sessionUserId) {
    return null;
  }

  // Load the user once — we need both the role (for admin bypass) and
  // the membership lookup below.
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUserId))
    .limit(1);
  if (!user) {
    // Session points at a deleted user. Treat as no scope; the auth
    // middleware will end up bouncing them anyway.
    return null;
  }

  const requestedHeader = readHeader(req);

  if (isAdmin(user)) {
    // Admins can target any store. If they sent a header, verify the
    // store exists (so a typo'd id surfaces as 404, not silent success
    // on the fallback store). If no header, fall back to the oldest
    // stores row.
    if (requestedHeader) {
      const [row] = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, requestedHeader))
        .limit(1);
      if (!row) {
        throw new StoreScopeError(
          404,
          `Store ${requestedHeader} not found`,
        );
      }
      return { storeId: row.id, isAdmin: true, isFallback: false };
    }
    const [fallback] = await db
      .select({ id: stores.id })
      .from(stores)
      .orderBy(asc(stores.createdAt))
      .limit(1);
    if (!fallback) {
      // No stores at all — the platform isn't fully provisioned.
      // Don't surface a hard error here; just signal "no scope".
      return null;
    }
    return { storeId: fallback.id, isAdmin: true, isFallback: true };
  }

  // Non-admin path: every accessible store must be backed by a
  // user_stores row. Header → verify; no header → fallback to oldest
  // membership.
  if (requestedHeader) {
    const [membership] = await db
      .select({ storeId: userStores.storeId })
      .from(userStores)
      .where(
        and(
          eq(userStores.userId, user.id),
          eq(userStores.storeId, requestedHeader),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new StoreScopeError(
        403,
        "You do not have access to this store",
      );
    }
    return {
      storeId: membership.storeId,
      isAdmin: false,
      isFallback: false,
    };
  }

  const [first] = await db
    .select({ storeId: userStores.storeId })
    .from(userStores)
    .where(eq(userStores.userId, user.id))
    .orderBy(asc(userStores.createdAt))
    .limit(1);
  if (!first) {
    // Non-admin with no memberships — they've been invited but not
    // attached to any store. Surface as 403 so the UI can prompt the
    // admin to grant access.
    throw new StoreScopeError(
      403,
      "Your account is not attached to any store. Ask an administrator to grant access.",
    );
  }
  return { storeId: first.storeId, isAdmin: false, isFallback: true };
}

/**
 * Express middleware: attach `req.storeScope` to every request. Never
 * blocks — on a hard authorization failure the middleware writes the
 * StoreScopeError onto `req` so individual route handlers can use
 * `requireStoreScope(req, res)` to short-circuit with the right
 * status. Webhooks and unauthenticated endpoints pass through with
 * `req.storeScope === undefined`.
 */
export async function attachStoreScope(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // Webhooks have their own auth — they don't and shouldn't go through
  // the user-store resolver. Skip the work entirely.
  if (req.path.startsWith("/api/webhooks/")) {
    return next();
  }
  try {
    const scope = await resolveStoreScope(req);
    if (scope) req.storeScope = scope;
    next();
  } catch (err) {
    if (err instanceof StoreScopeError) {
      // Stash the error so the route can decide whether to surface it
      // (most reads do) or ignore it (e.g. /api/auth/me, which still
      // needs to return the user even if they have no memberships).
      (req as any).storeScopeError = err;
      return next();
    }
    next(err);
  }
}

/**
 * Helper used inside route handlers when a store scope is required.
 * Returns the resolved scope or sends the appropriate HTTP status and
 * returns null. Callers should `return` after a null result.
 *
 *   const scope = requireStoreScope(req, res);
 *   if (!scope) return;
 *   // ... use scope.storeId
 */
export function requireStoreScope(
  req: Request,
  res: Response,
): StoreScope | null {
  const stashed = (req as any).storeScopeError as
    | StoreScopeError
    | undefined;
  if (stashed) {
    res.status(stashed.status).json({ error: stashed.message });
    return null;
  }
  if (!req.storeScope) {
    // No session, no scope — same shape the existing auth helpers
    // return when `currentUserId` is missing.
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.storeScope;
}

function readHeader(req: Request): string | null {
  const raw = req.headers[STORE_HEADER_NAME];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
