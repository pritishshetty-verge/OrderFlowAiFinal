// Flo (Ops Copilot) tool regression tests — runs every tool against the DEV
// database with normal, edge and hostile inputs, checks admin gating and store
// scoping, and cross-checks key numbers against independent SQL.
//
//   npx tsx server/scripts/test-flo-tools.ts
//
// Prints only pass/fail lines (no customer data). Exit code 1 on any failure.
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { runCopilotTool, COPILOT_TOOLS, type CopilotToolContext } from "../services/copilot/tools";

const rows = (r: any): any[] => (r?.rows ?? r ?? []) as any[];
let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
async function run(name: string, input: any, ctx: CopilotToolContext): Promise<any> {
  try {
    return await runCopilotTool(name, input, ctx);
  } catch (e: any) {
    return { __threw: String(e?.message ?? e).slice(0, 200) };
  }
}
const noThrow = (r: any) => !(r && r.__threw);
const isErr = (r: any) => r && typeof r === "object" && "error" in r;
const one = async (q: any) => rows(await db.execute(q))[0] ?? {};

async function main() {
  // ── Fixtures (resolved from the DB, never printed) ──────────────────
  const stores = rows(await db.execute(sql`
    SELECT s.id, s.store_name, COUNT(o.id)::int AS n
    FROM stores s LEFT JOIN orders o ON o.store_id = s.id
    GROUP BY s.id, s.store_name ORDER BY n DESC`));
  const main = stores[0];
  const other = stores.find((s) => s.id !== main.id);
  const admin = await one(sql`SELECT id FROM users WHERE role IN ('admin','developer') AND is_active LIMIT 1`);
  const A: CopilotToolContext = { storeId: main.id, userId: admin.id, isAdmin: true };
  const AGENT: CopilotToolContext = { ...A, isAdmin: false };
  const OTHER: CopilotToolContext | null = other ? { ...A, storeId: other.id } : null;

  const withAwb = await one(sql`SELECT replace(shopify_order_number,'#','') AS n, tracking_number FROM orders
    WHERE store_id = ${main.id} AND COALESCE(tracking_number,'') <> '' ORDER BY shopify_created_at DESC LIMIT 1`);
  const noAwb = await one(sql`SELECT replace(shopify_order_number,'#','') AS n FROM orders
    WHERE store_id = ${main.id} AND COALESCE(tracking_number,'') = '' ORDER BY shopify_created_at DESC LIMIT 1`);
  const cust = await one(sql`SELECT customer_name, right(regexp_replace(customer_phone,'\\D','','g'),10) AS phone
    FROM orders WHERE store_id = ${main.id} AND length(customer_name) >= 5 AND customer_phone IS NOT NULL
    ORDER BY shopify_created_at DESC LIMIT 1`);
  // Busiest month for this store, for numeric cross-checks.
  const busy = await one(sql`SELECT EXTRACT(YEAR FROM shopify_created_at AT TIME ZONE 'UTC')::int AS y,
      EXTRACT(MONTH FROM shopify_created_at AT TIME ZONE 'UTC')::int AS m, COUNT(*)::int AS n
    FROM orders WHERE store_id = ${main.id} GROUP BY 1,2 ORDER BY n DESC LIMIT 1`);
  const Y = busy.y, M = busy.m;
  const mStart = new Date(Date.UTC(Y, M - 1, 1)).toISOString();
  const mEnd = new Date(Date.UTC(Y, M, 1)).toISOString();
  console.log(`store=${main.store_name} other=${other?.store_name ?? "-"} month=${Y}-${M} tools=${COPILOT_TOOLS.length}\n`);

  // ── Registry ─────────────────────────────────────────────────────────
  const names = COPILOT_TOOLS.map((t: any) => t.name);
  check("registry: 44 tools (25 read + 2 SQL + 17 actions)", names.length === 44, `got ${names.length}`);
  check("registry: names unique", new Set(names).size === names.length);
  check("registry: every tool has a description + object schema",
    COPILOT_TOOLS.every((t: any) => t.description?.length > 20 && t.input_schema?.type === "object"));
  const unknown = await run("does_not_exist", {}, A);
  check("dispatch: unknown tool → error", isErr(unknown));

  // ── get_order ────────────────────────────────────────────────────────
  let r = await run("get_order", { orderNumber: `#${withAwb.n}` }, A);
  check("get_order: '#123' form finds order", r.found === true);
  r = await run("get_order", { orderNumber: `  ${withAwb.n} ` }, A);
  check("get_order: whitespace trimmed", r.found === true);
  r = await run("get_order", { orderNumber: "99999999999" }, A);
  check("get_order: unknown → found:false", r.found === false);
  r = await run("get_order", { orderNumber: "" }, A);
  check("get_order: empty → error", isErr(r));
  r = await run("get_order", { orderNumber: "1' OR '1'='1" }, A);
  check("get_order: SQL-injection text → not found, no throw", noThrow(r) && r.found === false);
  if (OTHER) {
    r = await run("get_order", { orderNumber: withAwb.n }, OTHER);
    const leaked = r.found && r.orders?.some((o: any) => o.tracking_number === withAwb.tracking_number);
    check("get_order: other store can't see this store's order", !leaked);
  }

  // ── track_shipment ───────────────────────────────────────────────────
  r = await run("track_shipment", { orderNumber: noAwb.n }, A);
  check("track: order without AWB → 'not shipped' note", noThrow(r) && (r.note || r.tracking === null || isErr(r)));
  r = await run("track_shipment", { orderNumber: withAwb.n }, A);
  check("track: order with AWB → resolves AWB, no throw", noThrow(r) && r.awb === String(withAwb.tracking_number).trim());
  r = await run("track_shipment", {}, A);
  check("track: no input → error", isErr(r));
  r = await run("track_shipment", { orderNumber: "99999999999" }, A);
  check("track: unknown order → error", isErr(r));

  // ── search_orders ────────────────────────────────────────────────────
  r = await run("search_orders", { query: cust.customer_name.slice(0, 5) }, A);
  check("search: by name fragment finds rows", r.count > 0);
  r = await run("search_orders", { query: cust.phone }, A);
  check("search: by 10-digit phone finds rows", r.count > 0);
  r = await run("search_orders", { status: "delivered", limit: 5 }, A);
  check("search: status=delivered filters", r.count > 0 && r.orders.every((o: any) => o.status === "delivered"));
  r = await run("search_orders", { status: "RTO", limit: 10 }, A);
  check("search: status='RTO' matches rto_*", noThrow(r) && r.orders.every((o: any) => String(o.status).startsWith("rto")));
  r = await run("search_orders", { status: "In Transit", limit: 5 }, A);
  check("search: 'In Transit' normalised", noThrow(r) && r.orders.every((o: any) => o.status === "in_transit"));
  r = await run("search_orders", { paymentMethod: "cod", limit: 50 }, A);
  check("search: COD filter catches all COD spellings", r.count > 0 && r.orders.every((o: any) => /cod/i.test(o.payment_method)));
  r = await run("search_orders", { paymentMethod: "prepaid", limit: 50 }, A);
  check("search: prepaid excludes COD", r.count > 0 && r.orders.every((o: any) => !/cod/i.test(o.payment_method)));
  r = await run("search_orders", { limit: 10000 }, A);
  check("search: limit clamped to 50", r.count <= 50);
  r = await run("search_orders", { query: "%" }, A);
  check("search: '%' treated literally (no match-all)", noThrow(r) && r.count === 0);
  r = await run("search_orders", { query: "'; DROP TABLE orders; --" }, A);
  check("search: injection text harmless", noThrow(r) && r.count === 0);
  const stillThere = await one(sql`SELECT COUNT(*)::int AS n FROM orders`);
  check("search: orders table intact", stillThere.n > 0);

  // ── Windows (shared resolver) ────────────────────────────────────────
  const future = new Date(); future.setUTCMonth(future.getUTCMonth() + 2);
  r = await run("get_delivery_rate", { year: future.getUTCFullYear(), month: future.getUTCMonth() + 1 }, A);
  check("window: future month → clear error", isErr(r) && /hasn't started/.test(r.error));
  r = await run("get_delivery_rate", { year: 2026, month: 13 }, A);
  check("window: month 13 → error", isErr(r));
  r = await run("get_delivery_rate", { month: new Date().getUTCMonth() + 1 }, A);
  check("window: month without year → current year", !isErr(r) && r.window.label.startsWith(String(new Date().getUTCFullYear())));
  r = await run("get_delivery_rate", { days: 0 }, A);
  check("window: days 0 clamped to 1", r.window?.label === "last 1 days");
  r = await run("get_delivery_rate", { days: 99999 }, A);
  check("window: days clamped to max", r.window?.label === "last 365 days");
  r = await run("get_sales_summary", { year: "2026", month: "4" }, A);
  check("window: string year/month accepted", !isErr(r) && r.window?.label?.startsWith("2026-04"));

  // Exact IST days (from/to)
  // Columns are timestamp-without-tz holding UTC → convert UTC → IST explicitly.
  const day = await one(sql`SELECT to_char((shopify_created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
    FROM orders WHERE store_id = ${main.id}
    GROUP BY 1 ORDER BY n DESC LIMIT 1`);
  r = await run("get_delivery_rate", { from: day.d }, A);
  check("window: single IST day count matches SQL", r.counts?.placed === day.n, `${r.counts?.placed} vs ${day.n}`);
  r = await run("get_sales_summary", { from: "2026-02-31" }, A);
  check("window: impossible date rejected", isErr(r));
  r = await run("get_sales_summary", { from: "2026-05-10", to: "2026-05-01" }, A);
  check("window: to before from rejected", isErr(r));
  r = await run("get_sales_summary", { from: "08/11/2026" }, A);
  check("window: non-ISO date rejected", isErr(r));
  r = await run("get_sales_summary", { from: "2020-01-01", to: "2026-01-01" }, A);
  check("window: over-long range rejected", isErr(r));
  const tomorrowIst = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  r = await run("get_sales_summary", { from: tomorrowIst }, A);
  check("window: future day rejected", isErr(r) && /hasn't started/.test(r.error));
  r = await run("get_product_performance", { from: day.d }, A);
  check("window: ops tool accepts from/to", noThrow(r) && !isErr(r) && r.window?.label?.includes("IST"));

  // ── get_delivery_rate vs independent SQL ─────────────────────────────
  const dr = await run("get_delivery_rate", { year: Y, month: M }, A);
  const truth = await one(sql`SELECT COUNT(*)::int AS placed,
      COUNT(*) FILTER (WHERE LOWER(status)='delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE LOWER(status) LIKE 'rto%')::int AS rto,
      COUNT(*) FILTER (WHERE LOWER(status)='cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE LOWER(status) IN ('unfulfilled','pending','assigned','confirmed'))::int AS not_shipped
    FROM orders WHERE store_id = ${main.id}
      AND shopify_created_at >= ${mStart}::timestamptz AND shopify_created_at < ${mEnd}::timestamptz`);
  const shipped = truth.placed - truth.cancelled - truth.not_shipped;
  check("delivery_rate: placed matches SQL", dr.counts?.placed === truth.placed, `${dr.counts?.placed} vs ${truth.placed}`);
  check("delivery_rate: shipped matches SQL", dr.counts?.shipped === shipped);
  check("delivery_rate: delivered/rto match SQL", dr.counts?.delivered === truth.delivered && dr.counts?.rto === truth.rto);
  const expPct = shipped ? Math.round((truth.delivered / shipped) * 10000) / 100 : null;
  check("delivery_rate: % = delivered ÷ shipped", dr.deliveryRatePct === expPct, `${dr.deliveryRatePct} vs ${expPct}`);
  check("delivery_rate: counts add up", dr.counts.shipped === dr.counts.delivered + dr.counts.rto + dr.counts.inFlight);

  // ── get_sales_summary vs SQL ─────────────────────────────────────────
  const sales = await run("get_sales_summary", { year: Y, month: M }, A);
  const gmv = await one(sql`SELECT COALESCE(SUM(CAST(total_price AS numeric)),0) AS g, COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(payment_method,'')) LIKE '%cod%')::int AS cod
    FROM orders WHERE store_id = ${main.id}
      AND shopify_created_at >= ${mStart}::timestamptz AND shopify_created_at < ${mEnd}::timestamptz`);
  const salesStr = JSON.stringify(sales);
  check("sales: no error", !isErr(sales), salesStr.slice(0, 150));
  check("sales: order count matches SQL", salesStr.includes(String(gmv.n)), `expected ${gmv.n}`);
  const gmvRounded = Math.round(Number(gmv.g));
  check("sales: GMV matches SQL (±1)", /"gmv":\s*([\d.]+)/i.test(salesStr) &&
    Math.abs(Number(salesStr.match(/"gmv":\s*([\d.]+)/i)![1]) - gmvRounded) <= 1, `expected ~${gmvRounded}`);
  const expCod = Math.round((gmv.cod / gmv.n) * 10000) / 100;
  check("sales: COD share matches SQL", salesStr.includes(String(expCod)), `expected ${expCod}`);

  // ── NDR tools ────────────────────────────────────────────────────────
  r = await run("get_ndr_summary", {}, A);
  check("ndr_summary: default window works", noThrow(r) && !isErr(r) && r.window?.label === "last 30 days");
  r = await run("get_ndr_summary", { year: Y, month: M }, A);
  check("ndr_summary: month window", noThrow(r) && r.window?.label?.startsWith(`${Y}-`));
  r = await run("get_ndr_summary", { days: 500 }, A);
  check("ndr_summary: days clamped to 180", r.window?.label === "last 180 days");
  r = await run("get_open_ndrs", { limit: 0 }, A);
  check("open_ndrs: limit 0 → 1", noThrow(r) && r.count <= 1);
  r = await run("get_open_ndrs", { limit: 1000 }, A);
  check("open_ndrs: limit clamped to 100", noThrow(r) && r.count <= 100);
  check("open_ndrs: result size < 40k chars", JSON.stringify(r).length < 40000, `${JSON.stringify(r).length}`);

  // ── check_pincode ────────────────────────────────────────────────────
  r = await run("check_pincode", { pincode: "abc" }, A);
  check("pincode: non-numeric → error", isErr(r));
  r = await run("check_pincode", { pincode: "12345" }, A);
  check("pincode: 5 digits → error", isErr(r));
  r = await run("check_pincode", { pincode: "560001" }, A);
  check("pincode: valid → result or graceful error (no throw)", noThrow(r));

  // ── employee performance ─────────────────────────────────────────────
  r = await run("get_employee_performance", { name: "" }, A);
  check("employee: empty name → error", isErr(r));
  r = await run("get_employee_performance", { name: "zzzznobody" }, A);
  check("employee: unknown → found:false", r.found === false && !r.ambiguous);
  r = await run("get_employee_performance", { name: "a" }, A);
  check("employee: ambiguous → candidates", r.ambiguous === true && r.candidates?.length > 1);

  // ── payroll ──────────────────────────────────────────────────────────
  r = await run("get_payroll", { year: Y, month: M }, AGENT);
  check("payroll: non-admin denied", isErr(r) && /admin/i.test(r.error));
  r = await run("get_payroll", { year: Y, month: M }, A);
  check("payroll: admin → result or graceful error (no throw)", noThrow(r));

  // ── returns / abandoned carts ────────────────────────────────────────
  r = await run("get_returns_summary", { year: Y, month: M }, A);
  check("returns: month window, no throw", noThrow(r) && !isErr(r));
  r = await run("get_abandoned_carts", { days: 1000 }, A);
  check("abandoned: days clamped to 90", noThrow(r) && r.window?.label === "last 90 days");
  r = await run("get_abandoned_carts", { year: Y, month: M }, A);
  check("abandoned: month window", noThrow(r) && !isErr(r));

  // ── Ops tools: admin gating ──────────────────────────────────────────
  for (const t of ["get_team_today", "get_attendance_report", "get_leave_requests", "get_system_health",
                   "get_reconciliation", "get_learning_progress"]) {
    r = await run(t, {}, AGENT);
    check(`${t}: non-admin denied`, isErr(r) && /admin/i.test(r.error));
  }
  for (const t of ["get_agent_workload", "get_followups_due", "get_call_stats", "get_product_performance",
                   "get_geo_performance", "get_stuck_orders", "get_reshipments"]) {
    r = await run(t, {}, AGENT);
    check(`${t}: available to non-admin`, noThrow(r) && !isErr(r));
  }

  // ── Ops tools: normal + edge ─────────────────────────────────────────
  r = await run("get_team_today", {}, A);
  check("team_today: counts add up", noThrow(r) && r.counts.team ===
    r.counts.working + r.counts.onBreak + r.counts.clockedOut + r.counts.autoLoggedOut + r.counts.notClockedIn + r.counts.onLeave);
  r = await run("get_attendance_report", { year: 2026, month: 7 }, A);
  check("attendance: month report", noThrow(r) && Array.isArray(r.members));
  r = await run("get_attendance_report", { year: 2026, month: 99 }, A);
  check("attendance: bad month clamped, no throw", noThrow(r));
  r = await run("get_leave_requests", { status: "bogus" }, A);
  check("leave: bad status → defaults to pending", r.filter === "pending");
  r = await run("get_leave_requests", { status: "all" }, A);
  check("leave: all", noThrow(r) && Array.isArray(r.requests));
  // IST day logic vs independent SQL (followup due ≤ today IST)
  const fuTruth = await one(sql`SELECT COUNT(*)::int AS n FROM orders
    WHERE store_id = ${main.id} AND test_order = false AND call_status = 'Follow Up'
      AND LOWER(status) IN ('unfulfilled','pending','assigned','confirmed') AND followup_at IS NOT NULL
      AND (followup_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= (now() AT TIME ZONE 'Asia/Kolkata')::date`);
  r = await run("get_followups_due", {}, A);
  check("followups: due count matches SQL (IST)", r.totalDue === fuTruth.n, `${r.totalDue} vs ${fuTruth.n}`);
  const ist = (h: number, m: number) => { const d = new Date(Date.UTC(2026, 6, 20, h, m)); return d; };
  const conv = await one(sql`SELECT
      (${ist(18, 30).toISOString()}::timestamptz AT TIME ZONE 'UTC')::timestamp AS ts,
      ((((${ist(18, 30).toISOString()}::timestamptz AT TIME ZONE 'UTC')::timestamp) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date)::text AS d`);
  check("ist: 18:30 UTC stored → next IST day", conv.d === "2026-07-21", conv.d);
  r = await run("get_followups_due", { agentName: "%" }, A);
  check("followups: '%' agent filter literal", noThrow(r) && r.totalDue === 0);
  r = await run("get_followups_due", { limit: 999 }, A);
  check("followups: limit clamp", noThrow(r) && r.followups.length <= 50);
  r = await run("get_call_stats", { days: 9999 }, A);
  check("calls: days clamp to 90", r.window?.label === "last 90 days");

  const prod = await run("get_product_performance", { year: Y, month: M, limit: 30 }, A);
  check("products: rows", prod.products?.length > 0);
  check("products: sorted by units desc",
    prod.products.every((p: any, i: number, a: any[]) => i === 0 || Number(a[i - 1].units) >= Number(p.units)));
  const unitsTruth = await one(sql`SELECT COALESCE(SUM(oi.quantity),0)::int AS u FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.store_id = ${main.id} AND o.test_order = false AND LOWER(o.status) <> 'cancelled'
      AND o.shopify_created_at >= ${mStart}::timestamptz AND o.shopify_created_at < ${mEnd}::timestamptz`);
  const unitsSum = prod.products.reduce((s: number, p: any) => s + Number(p.units ?? 0), 0);
  check("products: units ≤ SQL total (top 30)", unitsSum <= unitsTruth.u, `${unitsSum} vs ${unitsTruth.u}`);
  r = await run("get_product_performance", { year: Y, month: M, sortBy: "rto_rate" }, A);
  check("products: rto_rate sort", noThrow(r) && !isErr(r));
  r = await run("get_product_performance", { sortBy: "nonsense" }, A);
  check("products: bad sortBy → units", r.sortBy === "units");

  const geo = await run("get_geo_performance", { year: Y, month: M, sortBy: "volume", minShipped: 1, limit: 30 }, A);
  check("geo: rows", geo.rows?.length > 0);
  const g0 = geo.rows[0];
  const gTruth = await one(sql`SELECT
      COUNT(*) FILTER (WHERE LOWER(status) NOT IN ('cancelled','unfulfilled','pending','assigned','confirmed'))::int AS shipped,
      COUNT(*) FILTER (WHERE LOWER(COALESCE(payment_method,'')) LIKE '%cod%')::int AS cod, COUNT(*)::int AS placed
    FROM orders WHERE store_id = ${main.id} AND test_order = false AND INITCAP(TRIM(shipping_state)) = ${g0.place}
      AND shopify_created_at >= ${mStart}::timestamptz AND shopify_created_at < ${mEnd}::timestamptz`);
  check("geo: top state shipped matches SQL", g0.shipped === gTruth.shipped, `${g0.shipped} vs ${gTruth.shipped}`);
  check("geo: COD share matches SQL",
    Number(g0.cod_share) === Math.round((gTruth.cod / gTruth.placed) * 10000) / 100, `${g0.cod_share}`);
  r = await run("get_geo_performance", { groupBy: "country" }, A);
  check("geo: bad groupBy → state", r.groupBy === "state");
  r = await run("get_geo_performance", { groupBy: "pincode", days: 365 }, A);
  check("geo: pincode grouping", noThrow(r) && !isErr(r));

  const stuck = await run("get_stuck_orders", { lookbackDays: 365, staleDays: 3 }, A);
  check("stuck: runs", noThrow(stuck) && typeof stuck.buckets === "object");
  const unconfTruth = await one(sql`SELECT COUNT(*)::int AS n FROM orders
    WHERE store_id = ${main.id} AND test_order = false
      AND shopify_created_at >= now() - interval '365 days'
      AND LOWER(status) IN ('unfulfilled','pending','assigned') AND call_status IN ('Pending','Follow Up')
      AND shopify_created_at < now() - interval '3 days'`);
  check("stuck: unconfirmed count matches SQL", (stuck.buckets.unconfirmed?.count ?? 0) === unconfTruth.n,
    `${stuck.buckets.unconfirmed?.count} vs ${unconfTruth.n}`);
  check("stuck: samples capped", Object.values(stuck.buckets).every((b: any) => b.oldest.length <= 5));
  r = await run("get_stuck_orders", { staleDays: -5, lookbackDays: 0, samplesPerBucket: 999 }, A);
  check("stuck: hostile params clamped, no throw", noThrow(r) && !isErr(r));

  r = await run("get_system_health", { hours: 0 }, A);
  check("health: hours clamp, no throw", noThrow(r) && r.lookbackHours === 1);
  r = await run("get_reshipments", { days: 365 }, A);
  check("reshipments: runs", noThrow(r) && !isErr(r));
  r = await run("get_reconciliation", { year: Y, month: M }, A);
  check("reconciliation: result or 'not set up' note", noThrow(r) && !isErr(r));
  r = await run("get_learning_progress", { name: "%" }, A);
  check("learning: '%' literal", noThrow(r) && r.members.length === 0);
  r = await run("get_learning_progress", {}, A);
  check("learning: members", noThrow(r) && Array.isArray(r.members));

  // ── Store scoping for aggregates ─────────────────────────────────────
  if (OTHER) {
    const a1 = await run("get_delivery_rate", { year: Y, month: M }, A);
    const b1 = await run("get_delivery_rate", { year: Y, month: M }, OTHER);
    const otherTruth = await one(sql`SELECT COUNT(*)::int AS n FROM orders WHERE store_id = ${other.id}
      AND shopify_created_at >= ${mStart}::timestamptz AND shopify_created_at < ${mEnd}::timestamptz`);
    check("scope: other store's delivery count is its own", b1.counts?.placed === otherTruth.n && a1.counts?.placed !== b1.counts?.placed || otherTruth.n === a1.counts?.placed);
    const sOther = await run("search_orders", { query: cust.phone }, OTHER);
    const sameStore = await one(sql`SELECT COUNT(*)::int AS n FROM orders WHERE store_id = ${other.id}
      AND customer_phone LIKE ${"%" + cust.phone}`);
    check("scope: search doesn't cross stores", sOther.count === Math.min(sameStore.n, 20));
  }

  // ── Result sizes (prompt cost) ───────────────────────────────────────
  const sizes: [string, any][] = [
    ["get_ndr_summary", {}], ["get_stuck_orders", { lookbackDays: 365, samplesPerBucket: 15 }],
    ["get_product_performance", { limit: 30, days: 365 }], ["search_orders", { limit: 50 }],
  ];
  for (const [t, i] of sizes) {
    const len = JSON.stringify(await run(t, i, A)).length;
    check(`size: ${t} max-params result < 40k chars`, len < 40000, `${len}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log("FAILURES:\n- " + failures.join("\n- "));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("test-flo-tools crashed:", e);
  process.exit(2);
});
