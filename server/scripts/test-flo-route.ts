// Flo (Ops Copilot) HTTP route tests, in-process against the DEV database.
// Mounts the real routes behind a test-only session shim (header
// X-Test-User → req.session.userId) so auth, store scoping, validation, SSE,
// abort, concurrency, audit logging and the daily cap can be exercised
// without a browser login. The shim exists only in this script.
//
//   npx tsx server/scripts/test-flo-route.ts
//   COPILOT_DAILY_MESSAGE_LIMIT=1 npx tsx server/scripts/test-flo-route.ts cap
import "dotenv/config";
import express from "express";
import type { AddressInfo } from "net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { attachStoreScope } from "../storeScope";
import { registerRoutes } from "../routes";

const rows = (r: any): any[] => (r?.rows ?? r ?? []) as any[];
const one = async (q: any) => rows(await db.execute(q))[0] ?? {};
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use((req: any, _res, next) => {
    const u = req.header("x-test-user");
    req.session = u ? { userId: u } : {};
    next();
  });
  app.use(attachStoreScope as any);
  const server = await registerRoutes(app);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const admin = await one(sql`SELECT id FROM users WHERE role IN ('admin','developer') AND is_active LIMIT 1`);
  const agent = await one(sql`SELECT id FROM users WHERE role = 'agent' AND is_active LIMIT 1`);
  const stores = rows(await db.execute(sql`SELECT s.id, s.store_name FROM stores s WHERE s.is_active ORDER BY s.created_at`));
  const [s1, s2] = stores;

  async function post(body: any, opts: { user?: string; store?: string; signal?: AbortSignal; raw?: string } = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.user) headers["x-test-user"] = opts.user;
    if (opts.store) headers["X-Active-Store-Id"] = opts.store;
    const r = await fetch(`${base}/api/copilot/message`, {
      method: "POST", headers, body: opts.raw ?? JSON.stringify(body), signal: opts.signal,
    });
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("event-stream")) return { status: r.status, json: await r.json().catch(() => null) as any };
    const text = await r.text();
    const evs = text.split("\n\n").filter(Boolean).map((l) => {
      try { return JSON.parse(l.replace(/^data: /, "")); } catch { return { type: "BAD", raw: l }; }
    });
    return {
      status: r.status, sse: true, evs,
      last: evs[evs.length - 1]?.type,
      bad: evs.filter((e: any) => e.type === "BAD").length,
      errors: evs.filter((e: any) => e.type === "error").map((e: any) => e.message),
      text: evs.filter((e: any) => e.type === "text").map((e: any) => e.delta).join(""),
    };
  }
  const ask = (q: string) => ({ history: [{ role: "user", content: q }] });

  if (process.argv.includes("cap")) {
    const r = await post(ask("hi"), { user: admin.id, store: s1.id });
    check("cap: over the daily limit → 429 with message", r.status === 429 && /limit/i.test(r.json?.error ?? ""), JSON.stringify(r).slice(0, 200));
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }

  const auditBefore = await one(sql`SELECT COUNT(*) FILTER (WHERE kind='message')::int AS m, COUNT(*) FILTER (WHERE kind='tool')::int AS t
    FROM copilot_audit WHERE user_id = ${admin.id}`);

  // ── Auth ─────────────────────────────────────────────────────────────
  let r: any = await post(ask("hi"));
  check("auth: no session → 401", r.status === 401);
  r = await post(ask("hi"), { user: "00000000-0000-0000-0000-000000000000" });
  check("auth: session for deleted user → 401", r.status === 401);
  if (agent.id) {
    r = await post(ask("hi"), { user: agent.id });
    check("auth: agent role → 403", r.status === 403);
  }
  r = await post({ ...ask("hi"), currentUserId: admin.id });
  check("auth: spoofed currentUserId ignored → 401", r.status === 401);

  // ── Validation ───────────────────────────────────────────────────────
  for (const [name, body] of [
    ["empty body", {}],
    ["history not array", { history: "hi" }],
    ["ends with assistant", { history: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }],
    ["only system/tool roles", { history: [{ role: "system", content: "x" }, { role: "tool", content: "y" }] }],
    ["non-string content", { history: [{ role: "user", content: { x: 1 } }] }],
    ["whitespace-only", { history: [{ role: "user", content: "   " }] }],
  ] as const) {
    r = await post(body, { user: admin.id, store: s1.id });
    check(`validate: ${name} → 400`, r.status === 400, JSON.stringify(r).slice(0, 120));
  }
  r = await post(null, { user: admin.id, store: s1.id, raw: "{not json" });
  check("validate: malformed JSON → 400", r.status === 400);

  // ── Store scope ──────────────────────────────────────────────────────
  r = await post(ask("hi"), { user: admin.id, store: "not-a-real-store" });
  check("store: bogus store header → 4xx", r.status >= 400 && r.status < 500, JSON.stringify(r).slice(0, 120));
  r = await post(ask("Which store am I on? Reply with only the store name."), { user: admin.id, store: s1.id });
  check(`store: knows it's on ${s1.store_name}`, r.status === 200 && r.text.includes(s1.store_name), r.text?.slice(0, 80));
  if (s2) {
    r = await post(ask("Which store am I on? Reply with only the store name."), { user: admin.id, store: s2.id });
    check(`store: knows it's on ${s2.store_name}`, r.status === 200 && r.text.includes(s2.store_name), r.text?.slice(0, 80));
  }
  r = await post(ask("Which store am I on? Reply with only the store name."), { user: admin.id });
  check("store: no header → falls back to a real store", r.status === 200 && stores.some((s) => r.text.includes(s.store_name)));

  // ── SSE contract ─────────────────────────────────────────────────────
  r = await post(ask("What was the delivery rate in March 2026? One line."), { user: admin.id, store: s1.id });
  check("sse: 200 + event-stream", r.status === 200 && r.sse);
  check("sse: every frame is valid JSON", r.bad === 0);
  check("sse: ends with done", r.last === "done");
  const types = r.evs.map((e: any) => e.type);
  check("sse: tool → tool_done pairs", types.filter((t: string) => t === "tool").length === types.filter((t: string) => t === "tool_done").length && types.includes("tool"));
  check("sse: no errors", r.errors.length === 0, r.errors.join("; "));

  // ── Oversize / long inputs ───────────────────────────────────────────
  r = await post(ask("Reply with just OK. " + "x".repeat(200_000)), { user: admin.id, store: s1.id });
  check("input: 200k-char message truncated, still answers", r.status === 200 && r.last === "done");
  const long: any[] = [];
  for (let i = 0; i < 40; i++) long.push({ role: "user", content: `m${i}` }, { role: "assistant", content: `a${i}` });
  long.push({ role: "user", content: "Reply with just OK." });
  r = await post({ history: long }, { user: admin.id, store: s1.id });
  check("input: 81-turn history trimmed, still answers", r.status === 200 && r.last === "done");
  r = await post({ ...ask("Reply with just OK."), pageContext: "page: /\u0000\u001b[31m" + "y".repeat(5000) }, { user: admin.id, store: s1.id });
  check("input: hostile pageContext sanitised", r.status === 200 && r.last === "done");

  // ── Abort mid-stream ─────────────────────────────────────────────────
  const msgBefore = (await one(sql`SELECT COUNT(*)::int AS n FROM copilot_audit WHERE user_id = ${admin.id} AND kind = 'message'`)).n;
  const ac = new AbortController();
  const t0 = Date.now();
  const resP = fetch(`${base}/api/copilot/message`, {
    method: "POST", signal: ac.signal,
    headers: { "Content-Type": "application/json", "x-test-user": admin.id, "X-Active-Store-Id": s1.id },
    body: JSON.stringify(ask("Give me a full ops check-in covering everything you can.")),
  });
  const res = await resP;
  const reader = res.body!.getReader();
  await reader.read();
  ac.abort();
  // The server should notice the disconnect and finish (logging the message) quickly.
  let logged = false;
  for (let i = 0; i < 40 && !logged; i++) {
    await new Promise((x) => setTimeout(x, 500));
    logged = (await one(sql`SELECT COUNT(*)::int AS n FROM copilot_audit WHERE user_id = ${admin.id} AND kind = 'message'`)).n > msgBefore;
  }
  check("abort: server stops and wraps up after client disconnect", logged, `${Date.now() - t0}ms`);

  // ── Concurrency ──────────────────────────────────────────────────────
  const c0 = Date.now();
  const conc = await Promise.all([
    "Delivery rate March 2026? One line.", "GMV March 2026? One line.", "Any stuck orders? One line.",
  ].map((q) => post(ask(q), { user: admin.id, store: s1.id })));
  check("concurrency: 3 parallel requests all complete", conc.every((x: any) => x.status === 200 && x.last === "done" && !x.errors.length),
    JSON.stringify(conc.map((x: any) => [x.status, x.last, x.errors])));
  console.log(`  (3 parallel in ${((Date.now() - c0) / 1000).toFixed(1)}s)`);

  // ── Audit ────────────────────────────────────────────────────────────
  await new Promise((x) => setTimeout(x, 1000));
  const auditAfter = await one(sql`SELECT COUNT(*) FILTER (WHERE kind='message')::int AS m, COUNT(*) FILTER (WHERE kind='tool')::int AS t
    FROM copilot_audit WHERE user_id = ${admin.id}`);
  check("audit: message rows written", auditAfter.m > auditBefore.m, `${auditBefore.m}→${auditAfter.m}`);
  check("audit: tool rows written", auditAfter.t > auditBefore.t, `${auditBefore.t}→${auditAfter.t}`);
  const lastMsg = await one(sql`SELECT input_tokens, output_tokens, duration_ms, store_id, input FROM copilot_audit
    WHERE user_id = ${admin.id} AND kind = 'message' ORDER BY created_at DESC LIMIT 1`);
  check("audit: tokens + duration + store recorded", lastMsg.input_tokens > 0 && lastMsg.output_tokens > 0 && lastMsg.duration_ms > 0 && lastMsg.store_id === s1.id);
  const rejected = await one(sql`SELECT COUNT(*)::int AS n FROM copilot_audit WHERE user_id = ${admin.id}
    AND kind = 'message' AND created_at > now() - interval '10 minutes' AND input->>'question' LIKE '%not json%'`);
  check("audit: rejected requests not logged as messages", rejected.n === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  server.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("test-flo-route crashed:", e); process.exit(2); });
