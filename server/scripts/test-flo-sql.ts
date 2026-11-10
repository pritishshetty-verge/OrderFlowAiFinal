// Flo run_sql security + correctness tests against the DEV database.
//   npx tsx server/scripts/test-flo-sql.ts
// Every attack must be rejected or return no secret material; legit queries
// must work and match the dedicated tools.
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { runCopilotTool, type CopilotToolContext } from "../services/copilot/tools";

const rows = (r: any): any[] => (r?.rows ?? r ?? []) as any[];
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const store = rows(await db.execute(sql`SELECT s.id FROM stores s JOIN orders o ON o.store_id = s.id GROUP BY s.id ORDER BY COUNT(*) DESC LIMIT 1`))[0];
  const admin = rows(await db.execute(sql`SELECT id FROM users WHERE role IN ('admin','developer') AND is_active LIMIT 1`))[0];
  const A: CopilotToolContext = { storeId: store.id, userId: admin.id, isAdmin: true };
  // Known secret material to look for in any output.
  const hashes = rows(await db.execute(sql`SELECT password FROM users WHERE password IS NOT NULL`)).map((r) => String(r.password)).filter((h) => h.length > 20);
  const storeSecrets = rows(await db.execute(sql`SELECT delhivery_api_token, meta_access_token, payu_merchant_key, payu_merchant_salt, resend_api_key, access_token, api_key, api_secret, webhook_secret FROM stores`))
    .flatMap((r) => Object.values(r)).filter((v) => typeof v === "string" && v.length >= 8) as string[];
  const secrets = [...hashes, ...storeSecrets];
  console.log(`secret values tracked: ${secrets.length}\n`);
  const leaks = (out: any) => {
    const s = JSON.stringify(out ?? "");
    return secrets.some((x) => s.includes(x) || (x.length > 30 && s.includes(x.slice(7, 37))));
  };
  const q = (query: string, ctx = A) => runCopilotTool("run_sql", { query, purpose: "test" }, ctx);

  // ── Must be rejected (static) ─────────────────────────────────────────
  const attacks: [string, string][] = [
    ["delete", "DELETE FROM orders"],
    ["stacked", "SELECT 1; DROP TABLE orders"],
    ["data-modifying CTE", "WITH d AS (DELETE FROM orders WHERE false RETURNING id) SELECT id FROM d"],
    ["update in CTE", "WITH u AS (UPDATE orders SET notes = notes WHERE false RETURNING id) SELECT id FROM u"],
    ["password column", "SELECT password FROM users"],
    ["quoted password column", `SELECT "password" FROM users`],
    ["star from users", "SELECT * FROM users"],
    ["alias star", "SELECT u.* FROM users u"],
    ["to_jsonb row", "SELECT to_jsonb(u) FROM users u"],
    ["row_to_json", "SELECT row_to_json(u) FROM users u"],
    ["sessions", "SELECT sess FROM session"],
    ["credentials table", "SELECT store_url FROM shopify_credentials"],
    ["invites token table", "SELECT email FROM invites"],
    ["store token column", "SELECT delhivery_api_token FROM stores"],
    ["payu salt", "SELECT payu_merchant_salt FROM stores"],
    ["pg_sleep", "SELECT pg_sleep(20)"],
    ["pg_read_file", "SELECT pg_read_file('/etc/passwd')"],
    ["current_setting", "SELECT current_setting('server_version')"],
    ["set_config", "SELECT set_config('statement_timeout','0',false)"],
    ["for update", "SELECT id FROM orders FOR UPDATE"],
    ["select into", "SELECT id INTO tmp_x FROM orders"],
    ["information_schema", "SELECT table_name FROM information_schema.tables"],
    ["pg_user", "SELECT usename FROM pg_user"],
    ["pg_stat_activity", "SELECT query FROM pg_stat_activity"],
    ["copy", "COPY orders TO STDOUT"],
    ["dollar quote", "SELECT $$x$$"],
    ["nextval", "SELECT nextval('orders_id_seq')"],
    ["comma join users", `SELECT o.id FROM orders o, users WHERE o.assigned_to = users.id`],
    ["only users", "SELECT id FROM ONLY users"],
    ["positional param", "SELECT id FROM orders WHERE store_id = $1"],
    ["empty", "   "],
    ["not select", "EXPLAIN ANALYZE SELECT 1"],
    ["lock", "LOCK TABLE orders"],
    ["copilot audit", "SELECT input FROM copilot_audit"],
  ];
  for (const [name, query] of attacks) {
    const r = await q(query);
    check(`reject: ${name}`, !!r?.error && !leaks(r), JSON.stringify(r).slice(0, 140));
  }

  // ── Whole-row tricks that pass static checks must not leak secrets ────
  const sneaky: [string, string][] = [
    ["whole row users", "SELECT u FROM users u LIMIT 5"],
    ["whole row cast users", "SELECT u::text AS t FROM users u LIMIT 5"],
    ["json_agg users", "SELECT json_agg(u) AS j FROM users u"],
    ["array_agg stores", "SELECT array_agg(s) AS a FROM stores s"],
    ["whole row stores", "SELECT s FROM stores s"],
    ["stores keyword alias", "SELECT store_name FROM stores WHERE is_active"],
    ["users in subquery", "SELECT (SELECT array_agg(x) FROM users x) AS a"],
    ["users via lateral", "SELECT o.id, uu FROM orders o JOIN LATERAL (SELECT u FROM users u WHERE u.id = o.assigned_to) uu ON true WHERE o.store_id = $STORE LIMIT 3"],
    ["substr of row text", "SELECT substr(u::text, 1, 400) AS t FROM users u LIMIT 3"],
    ["semicolon inside string", "SELECT 'a;DROP TABLE orders;--' AS s"],
    ["comment hiding", "SELECT 1 AS one /* ; DROP TABLE orders */"],
    ["explicit schema users join", "SELECT u FROM orders x JOIN public.users u ON u.id = x.assigned_to LIMIT 3"],
    ["keyword after table", "SELECT users FROM orders o JOIN users ON users.id = o.assigned_to LIMIT 3"],
  ];
  for (const [name, query] of sneaky) {
    const r = await q(query);
    check(`no leak: ${name}`, !leaks(r), JSON.stringify(r).slice(0, 160));
  }
  const ordersStill = rows(await db.execute(sql`SELECT COUNT(*)::int AS n FROM orders`))[0].n;
  check("orders table intact after attacks", ordersStill > 0);

  // ── Runtime guards ────────────────────────────────────────────────────
  let r: any = await q("SELECT COUNT(*) AS n FROM order_items a CROSS JOIN order_items b CROSS JOIN order_items c");
  check("timeout: runaway query stopped with a clear error", !!r.error && /8 s|timeout/i.test(r.error), JSON.stringify(r).slice(0, 140));
  r = await q("SELECT id FROM orders WHERE store_id = $STORE");
  check("row cap: default 50 + truncated flag", r.rowCount === 50 && r.truncated === true, JSON.stringify(r).slice(0, 120));
  r = await runCopilotTool("run_sql", { query: "SELECT id FROM orders WHERE store_id = $STORE", purpose: "t", maxRows: 9999 }, A);
  check("row cap: max 200", r.rowCount === 200);
  r = await q("SELECT nonexistent_col FROM orders");
  check("sql error surfaced cleanly", !!r.error && /SQL error/.test(r.error));
  r = await q("SELECT 1 AS x", { ...A, isAdmin: false });
  check("non-admin denied", !!r.error && /admin/i.test(r.error));

  // ── Correctness vs dedicated tool ─────────────────────────────────────
  const dr = await runCopilotTool("get_delivery_rate", { year: 2026, month: 3 }, A);
  r = await q(`SELECT COUNT(*)::int AS placed,
      COUNT(*) FILTER (WHERE LOWER(status) = 'delivered')::int AS delivered
    FROM orders WHERE store_id = $STORE
      AND shopify_created_at >= '2026-03-01' AND shopify_created_at < '2026-04-01'`);
  check("correct: placed/delivered match get_delivery_rate", r.rows?.[0]?.placed === dr.counts.placed && r.rows?.[0]?.delivered === dr.counts.delivered,
    `${JSON.stringify(r.rows?.[0])} vs ${dr.counts.placed}/${dr.counts.delivered}`);
  r = await q(`SELECT u.full_name, COUNT(o.id)::int AS n FROM orders o JOIN users u ON u.id = o.assigned_to
    WHERE o.store_id = $STORE GROUP BY u.full_name ORDER BY n DESC`);
  check("works: JOIN users with alias", !r.error && Array.isArray(r.rows), JSON.stringify(r).slice(0, 140));
  r = await q(`WITH m AS (SELECT date_trunc('month', shopify_created_at) AS m, COUNT(*) AS n FROM orders WHERE store_id = $STORE GROUP BY 1)
    SELECT m, n FROM m ORDER BY m DESC LIMIT 6`);
  check("works: WITH + date_trunc", !r.error && r.rows?.length > 0, JSON.stringify(r).slice(0, 140));
  r = await q(`SELECT s.store_name FROM stores s WHERE s.id = $STORE`);
  check("works: stores with alias", !r.error && r.rows?.length === 1, JSON.stringify(r).slice(0, 140));
  r = await q(`SELECT pg_name, COUNT(*) AS n FROM pg_settlements GROUP BY pg_name`);
  check("works: app table named pg_* isn't blocked as a catalog", !r.error || /does not exist/.test(r.error), JSON.stringify(r).slice(0, 140));
  const ds = await runCopilotTool("describe_schema", { tables: ["users", "stores", "orders"] }, A);
  const dsStr = JSON.stringify(ds);
  check("schema: hides secret columns", !/password|delhivery_api_token|payu_merchant_salt|api_secret/.test(dsStr) && dsStr.includes("full_name"));
  check("schema: hides blocked tables", !JSON.stringify(await runCopilotTool("describe_schema", {}, A)).match(/"(session|shopify_credentials|invites|app_settings)"/));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("test-flo-sql crashed:", e); process.exit(2); });
