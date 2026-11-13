// Flo action-proposal tests against the DEV database.
//   npx tsx server/scripts/test-flo-actions.ts
//
// Part A — every propose_* tool: valid inputs produce a well-formed proposal
// whose requests pass the client allow-list and carry the logged-in user as
// actor; invalid / unsafe inputs are refused with a clear error. No writes.
// Part B — executes the DB-only actions (tags, assign/unassign, cart status)
// through the REAL endpoints in-process (test-only session shim), checks the
// effect, and restores the original rows. Actions that call Shopify, couriers,
// IVR or email are NOT executed here.
import "dotenv/config";
import express from "express";
import type { AddressInfo } from "net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { attachStoreScope } from "../storeScope";
import { registerRoutes } from "../routes";
import { runCopilotTool, type CopilotToolContext } from "../services/copilot/tools";
import { isAllowed, isProposal } from "../../client/src/components/copilot/actions";

const rows = (r: any): any[] => (r?.rows ?? r ?? []) as any[];
const one = async (q: any) => rows(await db.execute(q))[0] ?? {};
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const isErr = (r: any) => r && typeof r === "object" && "error" in r;

async function main() {
  const store = await one(sql`SELECT s.id, s.store_name FROM stores s JOIN orders o ON o.store_id = s.id GROUP BY s.id ORDER BY COUNT(*) DESC LIMIT 1`);
  const admin = await one(sql`SELECT id FROM users WHERE role IN ('admin','developer') AND is_active LIMIT 1`);
  const A: CopilotToolContext = { storeId: store.id, storeName: store.store_name, userId: admin.id, isAdmin: true };
  const AGENT: CopilotToolContext = { ...A, isAdmin: false };
  const run = (n: string, i: any, ctx = A) => runCopilotTool(n, i, ctx).catch((e) => ({ __threw: String(e?.message ?? e) }));

  const unshipped = await one(sql`SELECT replace(shopify_order_number,'#','') AS n, id, tags, assigned_to, assigned_at, status, call_status
    FROM orders WHERE store_id = ${store.id} AND LOWER(status) IN ('unfulfilled','assigned') AND call_status IN ('Pending','Follow Up')
      AND COALESCE(tracking_number,'') = '' ORDER BY shopify_created_at DESC LIMIT 1`);
  const confirmedUnshipped = await one(sql`SELECT replace(shopify_order_number,'#','') AS n FROM orders WHERE store_id = ${store.id}
    AND call_status = 'Confirmed' AND LOWER(status) IN ('unfulfilled','assigned','confirmed') LIMIT 1`);
  const shipped = await one(sql`SELECT replace(o.shopify_order_number,'#','') AS n, o.tracking_number AS awb FROM orders o
    WHERE o.store_id = ${store.id} AND LOWER(o.status) IN ('in_transit','ndr','out_for_delivery','awb_assigned') AND COALESCE(o.tracking_number,'') <> ''
      AND LOWER(COALESCE(o.courier_name,'')) LIKE '%delhivery%' ORDER BY o.shopify_created_at DESC LIMIT 1`);
  const delivered = await one(sql`SELECT replace(shopify_order_number,'#','') AS n FROM orders WHERE store_id = ${store.id} AND LOWER(status) = 'delivered' LIMIT 1`);
  const agent = await one(sql`SELECT u.id, u.full_name FROM users u JOIN user_stores us ON us.user_id = u.id
    WHERE us.store_id = ${store.id} AND u.role IN ('agent','manager') AND u.is_active ORDER BY u.full_name LIMIT 1`);
  console.log(`store=${store.store_name} agent=${agent.full_name ?? "-"}\n`);

  const props: any[] = [];
  const expectProposal = (name: string, r: any, extra?: (p: any) => boolean | string) => {
    const p = r?.proposal;
    let ok = !!p && isProposal(p) && p.requests.every(isAllowed);
    let detail = JSON.stringify(r).slice(0, 220);
    if (ok && extra) { const v = extra(p); if (v !== true) { ok = false; detail = String(v); } }
    if (p) props.push(p);
    check(name, ok, detail);
    return p;
  };
  const expectError = (name: string, r: any, re?: RegExp) =>
    check(name, isErr(r) && (!re || re.test(r.error)), JSON.stringify(r).slice(0, 200));
  const actorIs = (p: any, field: string) =>
    p.requests.every((q: any) => q.body?.[field] === admin.id || q.path.includes(admin.id)) || `${field} isn't the logged-in user`;

  // ── Part A: proposals ─────────────────────────────────────────────────
  let r: any;
  r = await run("propose_confirm_order", { orderNumber: `#${unshipped.n}`, notes: "ok by phone" });
  expectProposal("confirm: proposal + allow-listed + actor", r, (p) => actorIs(p, "userId"));
  r = await run("propose_confirm_order", { orderNumber: "99999999999" });
  expectError("confirm: unknown order refused", r, /No order/);
  if (confirmedUnshipped.n) expectError("confirm: already confirmed refused", await run("propose_confirm_order", { orderNumber: confirmedUnshipped.n }), /already confirmed/);

  r = await run("propose_cancel_order", { orderNumber: unshipped.n, reason: "Customer changed mind" });
  expectProposal("cancel: high-risk proposal with warning", r, (p) => (p.risk === "high" && /refund/i.test(p.warning ?? "")) || "not high risk/warning");
  expectError("cancel: bad reason refused", await run("propose_cancel_order", { orderNumber: unshipped.n, reason: "because" }), /reason/);
  if (shipped.n) expectError("cancel: shipped order refused", await run("propose_cancel_order", { orderNumber: shipped.n, reason: "Other" }), /shipped/);

  r = await run("propose_schedule_followup", { orderNumber: unshipped.n, inMinutes: 30 });
  expectProposal("followup: inMinutes", r, (p) => !!p.requests[0].body.followupAt || "no followupAt");
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  r = await run("propose_schedule_followup", { orderNumber: unshipped.n, at: `${tomorrow} 11:00` });
  expectProposal("followup: IST datetime → correct UTC", r, (p) =>
    p.requests[0].body.followupAt === new Date(`${tomorrow}T05:30:00.000Z`).toISOString() || `got ${p.requests[0].body.followupAt}`);
  expectError("followup: past time refused", await run("propose_schedule_followup", { orderNumber: unshipped.n, at: "2020-01-01 10:00" }), /past/);
  expectError("followup: no time refused", await run("propose_schedule_followup", { orderNumber: unshipped.n }), /inMinutes|at/);
  if (delivered.n) expectError("followup: delivered order refused", await run("propose_schedule_followup", { orderNumber: delivered.n, inMinutes: 10 }), /unshipped/);

  if (agent.id) {
    r = await run("propose_assign_orders", { agentName: agent.full_name.split(" ")[0], orderNumbers: [unshipped.n] });
    expectProposal("assign: by first name + order list", r, (p) => (p.requests[0].body.agentId === agent.id && p.requests[0].body.assignedBy === admin.id) || "wrong agent/actor");
    expectError("assign: shipped order refused (would wipe status)", await run("propose_assign_orders", { agentName: agent.full_name, orderNumbers: [delivered.n] }), /unshipped/);
    expectError("assign: unknown agent refused", await run("propose_assign_orders", { agentName: "Zzzz Nobody", orderNumbers: [unshipped.n] }), /No active agent/);
    expectError("assign: missing order refused", await run("propose_assign_orders", { agentName: agent.full_name, orderNumbers: ["99999999999"] }), /Not found/);
    r = await run("propose_assign_orders", { agentName: agent.full_name, unassignedPending: true, limit: 5 });
    check("assign: unassignedPending → proposal or 'none waiting'", !!r.proposal || /no unassigned/i.test(r.error ?? ""), JSON.stringify(r).slice(0, 160));
  }
  expectError("assign: admin name (not agent) refused", await run("propose_assign_orders", { agentName: "zzz-admin-only", orderNumbers: [unshipped.n] }), /No active agent/);

  if (shipped.n) {
    r = await run("propose_ndr_action", { action: "reattempt", orderNumbers: [shipped.n] });
    expectProposal("ndr: reattempt by order number → AWB path", r, (p) => (p.requests[0].path.includes(encodeURIComponent(shipped.awb)) && p.requests[0].body.actionBy === admin.id) || p.requests[0].path);
    r = await run("propose_ndr_action", { action: "defer", awbs: [shipped.awb], deferredDate: tomorrow });
    expectProposal("ndr: defer by AWB", r, (p) => p.requests[0].body.deferredDate === tomorrow || "no date");
    expectError("ndr: defer bad date refused", await run("propose_ndr_action", { action: "defer", awbs: [shipped.awb], deferredDate: "tomorrow" }), /YYYY/);
    expectError("ndr: edit without details refused", await run("propose_ndr_action", { action: "edit", awbs: [shipped.awb] }), /address1|phone/);
    expectError("ndr: edit bad phone refused", await run("propose_ndr_action", { action: "edit", awbs: [shipped.awb], phone: "abc" }), /phone/);
    r = await run("propose_ndr_action", { action: "edit", awbs: [shipped.awb], address1: "12 MG Road", phone: "9876543210" });
    expectProposal("ndr: edit address+phone", r);
  }
  if (delivered.n) expectError("ndr: delivered parcel refused", await run("propose_ndr_action", { action: "reattempt", orderNumbers: [delivered.n] }), /final|No shipped/);
  expectError("ndr: unknown parcel refused", await run("propose_ndr_action", { action: "reattempt", awbs: ["NOPE123"] }), /No shipped parcel/);
  expectError("ndr: >25 refused", await run("propose_ndr_action", { action: "reattempt", awbs: Array.from({ length: 26 }, (_, i) => `X${i}`) }), /25/);
  expectError("ndr: defer multi refused", await run("propose_ndr_action", { action: "defer", awbs: ["A", "B"], deferredDate: tomorrow }), /one parcel/);

  if (shipped.n) expectProposal("resync: proposal", await run("propose_resync_tracking", { orderNumber: shipped.n }), (p) => actorIs(p, "currentUserId"));
  expectError("resync: non-admin refused", await run("propose_resync_tracking", { orderNumber: shipped.n ?? unshipped.n }, AGENT), /Admin/);
  expectError("resync: no AWB refused", await run("propose_resync_tracking", { orderNumber: unshipped.n }), /no AWB/);
  expectProposal("reconcile: proposal", await run("propose_reconcile_statuses", {}));

  r = await run("propose_tag_order", { orderNumber: unshipped.n, add: ["vip", "vip"], remove: ["nonexistent"] });
  expectProposal("tags: merge + dedupe", r, (p) => {
    const t: string[] = p.requests[0].body.tags;
    return (t.filter((x) => x === "vip").length === 1) || `tags=${JSON.stringify(t)}`;
  });
  expectError("tags: nothing to do refused", await run("propose_tag_order", { orderNumber: unshipped.n }), /add|remove/);

  r = await run("propose_call_customer", { orderNumber: unshipped.n });
  check("call: proposal, or clear 'no extension' error", !!r.proposal || /extension/.test(r.error ?? ""), JSON.stringify(r).slice(0, 160));

  r = await run("propose_create_reshipment", { orderNumber: delivered.n ?? unshipped.n, reason: "product_damaged", customerDriven: true });
  check("reship: proposal with address + suffix C, or clear address error",
    (r.proposal && r.proposal.requests[0].body.nameSuffix === "C" && r.proposal.requests[0].body.shippingAddress?.zip && isAllowed(r.proposal.requests[0])) || /address/.test(r.error ?? ""),
    JSON.stringify(r).slice(0, 200));
  expectError("reship: bad reason refused", await run("propose_create_reshipment", { orderNumber: unshipped.n, reason: "fake_delivery_attempt" }), /reason/);
  expectError("reship: scheduled without date refused", await run("propose_create_reshipment", { orderNumber: unshipped.n, reason: "other", urgency: "scheduled" }), /scheduledDate/);

  expectError("cart: unknown id refused", await run("propose_update_cart_status", { checkoutId: 999999999, status: "LOST" }), /No abandoned/);
  expectError("cart: bad status refused", await run("propose_update_cart_status", { checkoutId: 1, status: "WON" }), /status/);
  expectError("return: unknown RMA refused", await run("propose_return_action", { rmaNumber: "RMA-NOPE", action: "approve_pickup" }), /No return/);
  expectError("return: '%' RMA literal", await run("propose_return_action", { rmaNumber: "%", action: "approve_pickup" }), /No return/);
  expectError("leave: non-admin refused", await run("propose_review_leave", { personName: "a", decision: "approve" }, AGENT), /Admin/);
  expectError("leave: none pending refused", await run("propose_review_leave", { personName: "zzzz", decision: "approve" }), /No matching/);
  expectError("payroll: non-admin refused", await run("propose_approve_payroll", { year: 2026, month: 10 }, AGENT), /Admin/);
  r = await run("propose_approve_payroll", { year: 2026, month: 10 });
  check("payroll: proposal or clear error (dev has no payroll tables)", !!r.proposal || isErr(r), JSON.stringify(r).slice(0, 160));
  r = await run("propose_shopify_sync", { daysBack: 9999 });
  expectProposal("shopify sync: daysBack clamped to 365", r, (p) => p.requests[0].body.daysBack === 365 || "not clamped");
  r = await run("propose_send_recon_digest", {});
  expectProposal("recon digest: defaults to test-to-self", r, (p) => p.requests[0].body.test === true || "not test");
  expectError("recon digest: non-admin refused", await run("propose_send_recon_digest", {}, AGENT), /Admin/);

  // Generic proposal invariants
  check("all proposals: unique ids", new Set(props.map((p) => p.id)).size === props.length);
  check("all proposals: expire in ~15 min", props.every((p) => Math.abs(new Date(p.expiresAt).getTime() - Date.now() - 15 * 60000) < 60000));
  check("all proposals: every request allow-listed", props.every((p) => p.requests.every(isAllowed)));
  check("allow-list: blocks other endpoints", !isAllowed({ method: "PATCH", path: "/api/users/123" }) && !isAllowed({ method: "POST", path: "/api/orders/1/confirm/../../users" }) && !isAllowed({ method: "PUT", path: "/api/orders/x/address" }));

  // ── Part B: execute DB-only actions through the real endpoints ───────
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.session = { userId: admin.id }; next(); });
  app.use(attachStoreScope as any);
  const server = await registerRoutes(app);
  await new Promise<void>((res) => server.listen(0, res));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const exec = async (p: any) => {
    const out: any[] = [];
    for (const q of p.requests) {
      const res = await fetch(base + q.path, { method: q.method, headers: { "Content-Type": "application/json", "X-Active-Store-Id": store.id }, body: JSON.stringify(q.body ?? {}) });
      out.push({ status: res.status, json: await res.json().catch(() => null) });
    }
    return out;
  };
  const startedAt = new Date();
  // Snapshot (tags as a Postgres array literal so it round-trips exactly).
  const orig = await one(sql`SELECT tags, tags::text AS tags_text, assigned_to, assigned_at::text AS assigned_at_text,
      status, updated_at::text AS updated_at_text FROM orders WHERE id = ${unshipped.id}`);
  try {
    const tagP = (await run("propose_tag_order", { orderNumber: unshipped.n, add: ["flo-test"] })).proposal;
    const t = await exec(tagP);
    const after = await one(sql`SELECT tags FROM orders WHERE id = ${unshipped.id}`);
    check("exec tags: endpoint accepted + tag saved", t[0].status === 200 && (after.tags ?? []).includes("flo-test"), JSON.stringify(t).slice(0, 160));

    if (agent.id) {
      const aP = (await run("propose_assign_orders", { agentName: agent.full_name, orderNumbers: [unshipped.n] })).proposal;
      const a = await exec(aP);
      const ass = await one(sql`SELECT assigned_to FROM orders WHERE id = ${unshipped.id}`);
      check("exec assign: endpoint accepted + assigned", a[0].status === 200 && ass.assigned_to === agent.id && a[0].json?.results?.[0]?.success, JSON.stringify(a).slice(0, 200));
      const uP = (await run("propose_unassign_order", { orderNumber: unshipped.n })).proposal;
      const u = await exec(uP);
      const un = await one(sql`SELECT assigned_to FROM orders WHERE id = ${unshipped.id}`);
      check("exec unassign: endpoint accepted + cleared", u[0].status === 200 && un.assigned_to === null, JSON.stringify(u).slice(0, 200));
    }
    const cart = await one(sql`SELECT id, recovery_status, is_recovered FROM abandoned_checkouts WHERE store_id = ${store.id} LIMIT 1`);
    if (cart.id) {
      const cP = (await run("propose_update_cart_status", { checkoutId: cart.id, status: "CONTACTED" })).proposal;
      const c = await exec(cP);
      const cs = await one(sql`SELECT recovery_status FROM abandoned_checkouts WHERE id = ${cart.id}`);
      check("exec cart status: saved", c[0].status === 200 && cs.recovery_status === "CONTACTED");
      await db.execute(sql`UPDATE abandoned_checkouts SET recovery_status = ${cart.recovery_status}, is_recovered = ${cart.is_recovered} WHERE id = ${cart.id}`);
    } else {
      console.log("  (no abandoned checkouts in dev store — cart execution skipped)");
    }
  } finally {
    // Restore the order exactly; drop assignment/history rows the test created.
    await db.execute(sql`UPDATE orders SET
        tags = ${orig.tags_text}::text[], assigned_to = ${orig.assigned_to},
        assigned_at = ${orig.assigned_at_text}::timestamp, status = ${orig.status}, updated_at = ${orig.updated_at_text}::timestamp
      WHERE id = ${unshipped.id}`);
    await db.execute(sql`DELETE FROM order_assignments WHERE order_id = ${unshipped.id} AND created_at >= ${startedAt.toISOString()}::timestamptz`);
    await db.execute(sql`DELETE FROM order_status_history WHERE order_id = ${unshipped.id} AND created_at >= ${startedAt.toISOString()}::timestamptz`);
    const restored = await one(sql`SELECT tags, assigned_to, status FROM orders WHERE id = ${unshipped.id}`);
    check("restore: order back to original state",
      JSON.stringify(restored.tags ?? null) === JSON.stringify(orig.tags ?? null) && restored.assigned_to === orig.assigned_to && restored.status === orig.status);
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("test-flo-actions crashed:", e); process.exit(2); });
