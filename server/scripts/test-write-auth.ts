/**
 * Integration check for the write-endpoint hardening: every route that
 * used to trust a body/query-supplied actor id must now answer
 * 401 (no session) / 403 (wrong user, wrong role, wrong store), and
 * spoofing an admin id in the body must not help.
 *
 * Run against a LOCAL dev server pointed at the DEV database:
 *
 *   PORT=5099 npm run dev                      # in one terminal
 *   BASE_URL=http://localhost:5099 npx tsx server/scripts/test-write-auth.ts
 *
 * Safety:
 *   • Refuses to run when DATABASE_URL points at the production Neon host.
 *   • Every request is one that must be REJECTED before the handler
 *     writes anything (401/403/404). The only DB writes are throwaway
 *     rows in the `session` table for the minted test sessions, which
 *     are deleted in `finally`.
 *   • Fixtures (users, orders, …) are read-only lookups; no ids or PII
 *     are printed.
 */
import "dotenv/config";
import crypto from "crypto";
import { and, eq, ne, isNotNull, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  users,
  userStores,
  orders,
  notifications,
  abandonedCheckouts,
  shipments,
  stores,
} from "@shared/schema";

const PROD_DB_HOST = "ep-proud-glitter-an7s76qz";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5099";
const COOKIE_NAME = "orderflow.sid";

if ((process.env.DATABASE_URL ?? "").includes(PROD_DB_HOST)) {
  console.error("Refusing to run: DATABASE_URL points at PRODUCTION.");
  process.exit(2);
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL)) {
  console.error(`Refusing to run: BASE_URL must be a local server (got ${BASE_URL}).`);
  process.exit(2);
}
const SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  console.error("SESSION_SECRET must be set (same .env as the dev server).");
  process.exit(2);
}

// ── session minting (express-session + connect-pg-simple format) ─────
const mintedSids: string[] = [];
async function mintSession(userId: string): Promise<string> {
  const sid = crypto.randomUUID();
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  const sess = {
    cookie: { originalMaxAge: 3_600_000, expires: expires.toISOString(), httpOnly: true, path: "/" },
    userId,
  };
  await pool.query(`INSERT INTO "session" (sid, sess, expire) VALUES ($1, $2, $3)`, [
    sid,
    JSON.stringify(sess),
    expires,
  ]);
  mintedSids.push(sid);
  const sig = crypto.createHmac("sha256", SECRET!).update(sid).digest("base64").replace(/=+$/, "");
  return `${COOKIE_NAME}=${encodeURIComponent(`s:${sid}.${sig}`)}`;
}

// ── tiny test harness ────────────────────────────────────────────────
type Ctx = { cookie?: string; storeId?: string };
let passed = 0;
let failed = 0;
let skipped = 0;

async function call(method: string, path: string, ctx: Ctx, body?: unknown) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (ctx.cookie) headers["Cookie"] = ctx.cookie;
  if (ctx.storeId) headers["X-Active-Store-Id"] = ctx.storeId;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json };
}

async function expectStatus(
  label: string,
  method: string,
  path: string,
  ctx: Ctx,
  body: unknown,
  expected: number,
  errorIncludes?: string,
) {
  const { status, json } = await call(method, path, ctx, body);
  const msgOk = !errorIncludes || String(json?.error ?? "").includes(errorIncludes);
  if (status === expected && msgOk) {
    passed++;
    console.log(`  ok   ${expected}  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}: expected ${expected}, got ${status} ${JSON.stringify(json)?.slice(0, 160)}`);
  }
}

function skip(label: string, why: string) {
  skipped++;
  console.log(`  skip      ${label} (${why})`);
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  // Fixtures (read-only)
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  const [agent] = await db.select().from(users).where(eq(users.role, "agent")).limit(1);
  if (!admin || !agent) throw new Error("Need at least one admin and one agent in the dev DB.");

  const [agentMembership] = await db
    .select({ storeId: userStores.storeId })
    .from(userStores)
    .where(eq(userStores.userId, agent.id))
    .orderBy(userStores.createdAt)
    .limit(1);
  const agentStoreId = agentMembership?.storeId;

  const allStores = await db.select({ id: stores.id }).from(stores);
  // Admin acts in the agent's store (or any store) and is pointed at an
  // order from a DIFFERENT store for the cross-store checks.
  const adminStoreId = agentStoreId ?? allStores[0]?.id;
  const otherStoreId = allStores.find((s) => s.id !== adminStoreId)?.id;

  const [unassignedOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        sql`${orders.assignedTo} IS DISTINCT FROM ${agent.id}`,
        agentStoreId ? eq(orders.storeId, agentStoreId) : sql`true`,
      ),
    )
    .limit(1);
  const [otherStoreOrder] = otherStoreId
    ? await db.select({ id: orders.id }).from(orders).where(eq(orders.storeId, otherStoreId)).limit(1)
    : [];
  const [othersNotification] = await db
    .select({ id: notifications.id, isRead: notifications.isRead, readAt: notifications.readAt })
    .from(notifications)
    .where(ne(notifications.userId, agent.id))
    .limit(1);
  const [otherStoreCart] = otherStoreId
    ? await db
        .select({ id: abandonedCheckouts.id })
        .from(abandonedCheckouts)
        .where(eq(abandonedCheckouts.storeId, otherStoreId))
        .limit(1)
    : [];
  const [otherStoreShipment] = otherStoreId
    ? await db
        .select({ awb: shipments.awb })
        .from(shipments)
        .where(and(eq(shipments.storeId, otherStoreId), isNotNull(shipments.awb)))
        .limit(1)
    : [];

  const orderId = unassignedOrder?.id ?? crypto.randomUUID();
  const fakeId = crypto.randomUUID();
  const A = admin.id; // the id an attacker would spoof

  // ── 1. No session: everything is 401, even with admin ids spoofed ──
  console.log("\n[no session — spoofed admin ids in body/query → 401]");
  const anon: Ctx = {};
  const noSession: Array<[string, string, string, unknown]> = [
    ["confirm", "POST", `/api/orders/${orderId}/confirm`, { userId: A }],
    ["cancel", "POST", `/api/orders/${orderId}/cancel`, { userId: A, reason: "other" }],
    ["followup", "POST", `/api/orders/${orderId}/followup`, { userId: A, followupAt: new Date().toISOString() }],
    ["address", "PUT", `/api/orders/${orderId}/address`, { userId: A, address1: "x" }],
    ["status", "PATCH", `/api/orders/${orderId}/status`, { changedBy: A, status: "confirmed" }],
    ["order patch", "PATCH", `/api/orders/${orderId}`, { userId: A, callStatus: "x" }],
    ["ship", "POST", `/api/orders/${orderId}/ship`, { userId: A, courierId: 1 }],
    ["calls/initiate", "POST", "/api/calls/initiate", { userId: A, orderId, customerPhone: "0" }],
    ["assign", "POST", `/api/orders/${orderId}/assign`, { userId: agent.id, assignedBy: A }],
    ["assign-manual", "POST", `/api/orders/${orderId}/assign-manual`, { agentId: agent.id, assignedBy: A }],
    ["auto-assign", "POST", `/api/orders/${orderId}/auto-assign`, { requestedBy: A }],
    ["bulk-assign", "POST", "/api/orders/bulk-assign", { orderIds: [orderId], agentId: agent.id, assignedBy: A }],
    ["ndr reattempt", "POST", `/api/ndr/AWBTEST/reattempt`, { actionBy: A }],
    ["reshipment create", "POST", `/api/reshipments?userId=${A}`, { userId: A }],
    ["reshipment edit", "PATCH", `/api/reshipments/${fakeId}?userId=${A}`, { userId: A }],
    ["reshipment cancel", "POST", `/api/reshipments/${fakeId}/cancel?userId=${A}`, { userId: A }],
    ["leave review", "PATCH", `/api/leave-requests/${fakeId}`, { status: "approved", reviewedBy: A }],
    ["leave delete", "DELETE", `/api/leave-requests/${fakeId}`, undefined],
    ["abandoned status", "PATCH", `/api/abandoned-checkouts/1/status`, { status: "CONTACTED" }],
    ["notification read", "PATCH", `/api/notifications/${fakeId}/read`, undefined],
    ["notifications read-all", "PATCH", "/api/notifications/read-all", { userId: A }],
    ["shiprocket create-shipment", "POST", `/api/shiprocket/orders/${orderId}/create-shipment`, {}],
    ["shiprocket ndr reattempt", "POST", `/api/shiprocket/ndr/AWBTEST/reattempt`, { actionBy: A, address1: "x", phone: "0" }],
    // Legacy fallback: requireAdmin() used to accept ?currentUserId with no session.
    ["requireAdmin via ?currentUserId", "GET", `/api/payroll-sync/status?currentUserId=${A}`, undefined],
  ];
  for (const [label, method, path, body] of noSession) {
    await expectStatus(label, method, path, anon, body, 401);
  }

  // ── 2. Agent session, admin id spoofed in body → 403 ───────────────
  console.log("\n[agent session — spoofed admin ids → 403]");
  const agentCtx: Ctx = { cookie: await mintSession(agent.id) };
  if (unassignedOrder) {
    const writes: Array<[string, string, string, unknown]> = [
      ["confirm unassigned order", "POST", `/api/orders/${orderId}/confirm`, { userId: A }],
      ["cancel unassigned order", "POST", `/api/orders/${orderId}/cancel`, { userId: A, reason: "other" }],
      ["followup unassigned order", "POST", `/api/orders/${orderId}/followup`, { userId: A, followupAt: new Date().toISOString() }],
      ["address unassigned order", "PUT", `/api/orders/${orderId}/address`, { userId: A, address1: "x" }],
      ["status unassigned order", "PATCH", `/api/orders/${orderId}/status`, { changedBy: A, status: "confirmed" }],
      ["patch unassigned order", "PATCH", `/api/orders/${orderId}`, { userId: A, callStatus: "x" }],
      ["ship unassigned order", "POST", `/api/orders/${orderId}/ship`, { userId: A, courierId: 1 }],
    ];
    for (const [label, method, path, body] of writes) {
      await expectStatus(label, method, path, agentCtx, body, 403, "not authorized");
    }
  } else {
    skip("agent order writes", "no order in the agent's store that is unassigned from them");
  }
  const agentForbidden: Array<[string, string, string, unknown]> = [
    ["assign (agent lacks permission)", "POST", `/api/orders/${orderId}/assign`, { userId: agent.id, assignedBy: A }],
    ["assign-manual", "POST", `/api/orders/${orderId}/assign-manual`, { agentId: agent.id, assignedBy: A }],
    ["auto-assign", "POST", `/api/orders/${orderId}/auto-assign`, { requestedBy: A }],
    ["bulk-assign", "POST", "/api/orders/bulk-assign", { orderIds: [orderId], agentId: agent.id, assignedBy: A }],
    ["leave review", "PATCH", `/api/leave-requests/${fakeId}`, { status: "approved", reviewedBy: A }],
    ["leave delete", "DELETE", `/api/leave-requests/${fakeId}`, undefined],
    ["shiprocket create-shipment", "POST", `/api/shiprocket/orders/${orderId}/create-shipment`, {}],
    ["shiprocket ndr reattempt", "POST", `/api/shiprocket/ndr/AWBTEST/reattempt`, { actionBy: A, address1: "x", phone: "0" }],
  ];
  for (const [label, method, path, body] of agentForbidden) {
    await expectStatus(label, method, path, agentCtx, body, 403);
  }

  if (othersNotification) {
    await expectStatus(
      "mark someone else's notification read → 404",
      "PATCH",
      `/api/notifications/${othersNotification.id}/read`,
      agentCtx,
      undefined,
      404,
    );
    const [after] = await db
      .select({ isRead: notifications.isRead, readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, othersNotification.id));
    const unchanged =
      after?.isRead === othersNotification.isRead &&
      String(after?.readAt) === String(othersNotification.readAt);
    if (unchanged) {
      passed++;
      console.log("  ok        other user's notification left untouched");
    } else {
      failed++;
      console.log("  FAIL other user's notification was modified");
    }
  } else {
    skip("notification ownership", "no notification owned by another user");
  }

  if (otherStoreCart) {
    await expectStatus(
      "abandoned cart in another store → 403",
      "PATCH",
      `/api/abandoned-checkouts/${otherStoreCart.id}/status`,
      agentCtx,
      { status: "CONTACTED" },
      403,
      "active store",
    );
  } else {
    skip("abandoned cart store scope", "no cart in a second store");
  }

  // ── 3. Admin session: store containment + guard passes ─────────────
  console.log("\n[admin session — store containment]");
  const adminCtx: Ctx = { cookie: await mintSession(admin.id), storeId: adminStoreId };
  if (otherStoreOrder) {
    const cross: Array<[string, string, string, unknown]> = [
      ["confirm order from another store", "POST", `/api/orders/${otherStoreOrder.id}/confirm`, {}],
      ["cancel order from another store", "POST", `/api/orders/${otherStoreOrder.id}/cancel`, { reason: "other" }],
      ["address order from another store", "PUT", `/api/orders/${otherStoreOrder.id}/address`, { address1: "x" }],
      ["status order from another store", "PATCH", `/api/orders/${otherStoreOrder.id}/status`, { status: "confirmed" }],
      ["assign order from another store", "POST", `/api/orders/${otherStoreOrder.id}/assign`, { userId: agent.id }],
      ["call for order from another store", "POST", "/api/calls/initiate", { orderId: otherStoreOrder.id, customerPhone: "0" }],
    ];
    for (const [label, method, path, body] of cross) {
      await expectStatus(label, method, path, adminCtx, body, 403, "active store");
    }
  } else {
    skip("admin cross-store orders", "no order in a second store");
  }
  if (otherStoreShipment?.awb) {
    await expectStatus(
      "NDR reattempt on another store's shipment",
      "POST",
      `/api/ndr/${encodeURIComponent(otherStoreShipment.awb)}/reattempt`,
      adminCtx,
      {},
      403,
      "active store",
    );
  } else {
    skip("NDR store scope", "no shipment with AWB in a second store");
  }
  // Guard passes for an admin → falls through to the not-found path (no writes).
  await expectStatus("admin leave review of unknown id → 404", "PATCH", `/api/leave-requests/${fakeId}`, adminCtx, { status: "approved" }, 404);
  await expectStatus("admin confirm of unknown order → 404", "POST", `/api/orders/${fakeId}/confirm`, adminCtx, {}, 404);
  await expectStatus("admin requireAdmin route with session → 200", "GET", "/api/payroll-sync/status", adminCtx, undefined, 200);
}

main()
  .catch((err) => {
    failed++;
    console.error("Error:", err?.message ?? err);
  })
  .finally(async () => {
    if (mintedSids.length) {
      await pool.query(`DELETE FROM "session" WHERE sid = ANY($1)`, [mintedSids]);
    }
    console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
    await pool.end().catch(() => {});
    process.exit(failed ? 1 : 0);
  });
