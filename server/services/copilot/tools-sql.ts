// Flo (Ops Copilot) — ad-hoc read-only SQL for questions no dedicated tool
// covers. Admin-only. Defence in depth:
//   0. Store scope enforced by the database (temp views; see scopeViews).
//   1. Static checks: one SELECT/WITH statement, no semicolons, no blocked
//      tables (sessions, credentials, settings, invites…), no secret columns,
//      no dangerous functions.
//   2. Runs inside a READ ONLY transaction with a statement timeout, wrapped
//      in an outer SELECT … LIMIT so the row count is bounded.
//   3. Results are redacted: any key that looks like a secret and any value
//      that looks like a password hash or token is masked.
// The model does not have to (and cannot) choose the store.

import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { CopilotToolContext } from "./tools";
import { rowsOf, clamp } from "./util";

const BLOCKED_TABLES = [
  "session", "sessions", "shopify_credentials", "app_settings", "invites", "webhooks",
  "copilot_audit", "pg_shadow", "pg_authid", "pg_user", "pg_roles", "pg_stat_activity",
  // Not store-scoped and not reference data: private messages, raw courier
  // webhooks for every store.
  "team_messages", "inbound_webhook_logs",
];
// Secret columns (users.password, stores.*_token / *_api_key / payu salt…)
// plus a few huge raw-payload columns.
const BLOCKED_COLUMNS = /\b(\w*password\w*|\w*secret\w*|\w*_token|token|\w*api_key|\w*salt\w*|\w*merchant_key|kyc_document_url|raw_shopify_data|raw_shiprocket_data|raw_payload|webhook_data|payload|rules)\b/i;
const BLOCKED_FUNCS = /\b(pg_sleep|pg_read_\w+|pg_ls_dir|pg_stat_file|lo_\w+|dblink\w*|set_config|current_setting|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|copy|query_to_xml|xpath|txid_\w+|nextval|setval|pg_advisory\w*)\s*\(/i;
// Statement keywords that never belong in a read query. (The READ ONLY
// transaction is the real guard; this gives a clear error early.)
const WRITE_WORDS = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|vacuum|cluster|reindex|listen|notify|lock|call|execute|prepare|discard|refresh|copy)\b/i;
const SECRET_KEY = /pass|secret|token|api_?key|credential|cookie|session/i;
const SECRET_VALUE = /^(\$2[aby]\$\d{2}\$.{50,}|shpat_\w+|shpss_\w+|sk-ant-[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)$/;

const SCHEMA_NOTES = [
  "All timestamp columns are 'timestamp without time zone' holding UTC. For IST days use (col AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date.",
  "Money columns are numeric/decimal stored as text in results; CAST(x AS numeric) before SUM.",
  "orders.status: unfulfilled, assigned, confirmed, awb_assigned, in_transit, out_for_delivery, ndr, delivered, rto_initiated, rto_delivered, cancelled. orders.call_status: Pending, Confirmed, Follow Up, Cancelled.",
  "COD detection: LOWER(COALESCE(payment_method,'')) LIKE '%cod%' (values vary).",
  "Exclude test orders: orders.test_order = false.",
  "Shopify order number: orders.shopify_order_number (may have a leading '#').",
  "Store scoping is automatic: every table you query already contains ONLY the current store's rows (and users/attendance/leave only this store's team). You cannot see other stores, so never add or remove a store filter and never use a schema prefix like public.",
];

export const SQL_TOOLS = [
  {
    name: "describe_schema",
    description:
      "List database tables and their columns (name + type), with notes on conventions. Call before run_sql to write a correct query. Optionally restrict to some tables. Admin only.",
    input_schema: {
      type: "object",
      properties: {
        tables: { type: "array", items: { type: "string" }, description: "Optional table names to describe (default: all)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "run_sql",
    description:
      "Run ONE read-only PostgreSQL SELECT (or WITH … SELECT) when no other tool answers the question. Every table is automatically limited to the current store's rows, so no store filter is needed (and other stores can't be queried). Use plain table names with no schema prefix. No semicolons. Max 200 rows, 8 s timeout. Admin only. Prefer the dedicated tools whenever they fit.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A single SELECT/WITH query. $STORE is available as the current store id but is not required." },
        purpose: { type: "string", description: "One line: what question this query answers." },
        maxRows: { type: "integer", description: "Row cap (default 50, max 200)." },
      },
      required: ["query", "purpose"],
      additionalProperties: false,
    },
  },
] as const;

export const SQL_TOOL_NAMES = new Set<string>(SQL_TOOLS.map((t) => t.name));

export function summarizeSqlTool(name: string, input: any): string | null {
  if (name === "describe_schema") return "Reading the database schema";
  if (name === "run_sql") return `Querying: ${String(input?.purpose ?? "custom query").slice(0, 60)}`;
  return null;
}

export async function runSqlTool(name: string, input: any, ctx: CopilotToolContext): Promise<any> {
  if (!ctx.isAdmin) return { error: "Custom queries are admin-only." };
  if (name === "describe_schema") return describeSchema(input);
  if (name === "run_sql") return runSql(input, ctx);
  return { error: `Unknown tool: ${name}` };
}

async function describeSchema(input: any) {
  const wanted: string[] = Array.isArray(input?.tables)
    ? input.tables.map((t: any) => String(t).toLowerCase()).slice(0, 30)
    : [];
  const r = await db.execute(sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const tables: Record<string, string[]> = {};
  for (const row of rowsOf(r)) {
    const t = String(row.table_name);
    if (BLOCKED_TABLES.includes(t)) continue;
    if (wanted.length && !wanted.includes(t)) continue;
    const c = String(row.column_name);
    if (BLOCKED_COLUMNS.test(c)) continue;
    (tables[t] ??= []).push(`${c} ${shortType(String(row.data_type))}`);
  }
  return { notes: SCHEMA_NOTES, tableCount: Object.keys(tables).length, tables };
}

const shortType = (t: string) =>
  t.replace("timestamp without time zone", "timestamp(utc)").replace("character varying", "varchar")
    .replace("timestamp with time zone", "timestamptz").replace("double precision", "float8");

/** Static validation. Returns an error string, or null if the query is acceptable. */
export function checkQuery(raw: string): string | null {
  const q = String(raw ?? "").trim().replace(/;\s*$/, "");
  if (!q) return "query is empty";
  if (q.length > 6000) return "query too long (max 6000 chars)";
  // Strip string literals and comments before keyword checks so text inside
  // quotes doesn't trip them (and comments can't hide anything).
  const code = q.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  if (/;/.test(code)) return "only one statement allowed (no semicolons)";
  if (!/^\s*(select|with)\b/i.test(code)) return "query must start with SELECT or WITH";
  if (/\$\$|\bE'/.test(q)) return "dollar-quoted / escape strings are not allowed";
  // Store scoping works by shadowing tables with temp views; a schema prefix
  // or an escaped identifier would step around them.
  if (/\b(public|pg_temp\w*)\b/i.test(code) || /"\s*\./.test(code)) return "use plain table names (no schema prefix)";
  if (/\bU&\s*["']/i.test(q)) return "unicode-escaped identifiers are not allowed";
  if (WRITE_WORDS.test(code)) return "only read queries are allowed";
  if (/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(code)) return "row locks are not allowed";
  if (/\binto\b/i.test(code)) return "SELECT INTO is not allowed";
  if (BLOCKED_FUNCS.test(code)) return "that function is not allowed";
  const lowered = code.toLowerCase();
  for (const t of BLOCKED_TABLES) {
    if (new RegExp(`\\b${t}\\b`).test(lowered)) return `table "${t}" is not accessible`;
  }
  if (/\binformation_schema\b|\bpg_catalog\b|\bpg_(class|namespace|attribute|proc|tables|views|indexes|settings|database|stat\w*|user\w*|roles?|authid|shadow|file\w*|largeobject\w*)\b/.test(lowered)) {
    return "system catalogs are not accessible; use describe_schema";
  }
  const col = BLOCKED_COLUMNS.exec(code);
  if (col) return `column "${col[1]}" is not accessible`;
  if (/\.\s*\*|\bselect\s+\*|\bto_jsonb?\s*\(\s*\w+\s*\)|\brow_to_json\s*\(/i.test(code)) {
    return "select explicit columns (no * or whole-row JSON) so secret columns can't leak";
  }
  return null;
}

// ── Store scoping, enforced by the database ─────────────────────────────
//
// The model is NOT trusted to add a store filter. Before the query runs we
// create TEMP VIEWS that shadow every table the query mentions (pg_temp is
// searched before public), each exposing only non-secret columns and only
// the current store's rows:
//   • tables with store_id        → store_id = <store>
//   • stores                      → id = <store>
//   • users / tables with user_id → members of this store (user_stores)
//   • payroll_ledger (cycle_id)   → cycles of this store
//   • attendance_breaks, return_items → via their parent table
// Schema-qualified names are rejected, so the views can't be bypassed, and
// the transaction is rolled back so nothing persists. Reference tables with
// no store link (holidays, courses, pincode_tiers…) are left as they are.
const SECRET_COLUMN_NAME = /pass|secret|token|api_?key|salt|cred|kyc|merchant_key/i;

interface ScopedTable {
  cols: string[];
  /** WHERE clause with {S} for the quoted store id; null = global table. */
  where: string | null;
}
let catalogCache: { at: number; tables: Record<string, ScopedTable> } | null = null;

const MEMBERS = `(SELECT user_id FROM public.user_stores WHERE store_id = {S})`;

async function scopeCatalog(): Promise<Record<string, ScopedTable>> {
  if (catalogCache && Date.now() - catalogCache.at < 10 * 60_000) return catalogCache.tables;
  const r = await db.execute(sql`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position`);
  const all: Record<string, string[]> = {};
  for (const row of rowsOf(r)) (all[String(row.table_name)] ??= []).push(String(row.column_name));
  const tables: Record<string, ScopedTable> = {};
  for (const [name, columns] of Object.entries(all)) {
    if (BLOCKED_TABLES.includes(name) || !/^[a-z_][a-z0-9_]*$/.test(name)) continue;
    const has = (c: string) => columns.includes(c);
    let where: string | null = null;
    if (name === "stores") where = `id = {S}`;
    else if (name === "users") where = `id IN ${MEMBERS}`;
    else if (has("store_id")) where = `store_id = {S}`;
    else if (has("cycle_id") && all["payroll_cycles"]?.includes("store_id")) {
      where = `cycle_id IN (SELECT id FROM public.payroll_cycles WHERE store_id = {S})`;
    } else if (has("user_id")) where = `user_id IN ${MEMBERS}`;
    else if (has("attendance_id") && all["attendance"]) {
      where = `attendance_id IN (SELECT id FROM public.attendance WHERE user_id IN ${MEMBERS})`;
    } else if (has("return_id") && all["returns"]?.includes("store_id")) {
      where = `return_id IN (SELECT id FROM public.returns WHERE store_id = {S})`;
    }
    tables[name] = {
      cols: columns.filter((c) => /^[a-z_][a-z0-9_]*$/.test(c) && !SECRET_COLUMN_NAME.test(c) && !BLOCKED_COLUMNS.test(c)),
      where,
    };
  }
  catalogCache = { at: Date.now(), tables };
  return tables;
}

/** CREATE TEMP VIEW statements for every scoped table the query mentions. */
export function scopeViews(query: string, storeId: string, catalog: Record<string, ScopedTable>): string[] {
  const lowered = query.toLowerCase();
  const out: string[] = [];
  for (const [name, t] of Object.entries(catalog)) {
    // Substring (not word) match on purpose: over-creating a view is harmless,
    // missing one would be a leak.
    if (!t.where || !t.cols.length || !lowered.includes(name)) continue;
    out.push(
      `CREATE TEMP VIEW "${name}" AS SELECT ${t.cols.map((c) => `"${c}"`).join(", ")} FROM public."${name}" WHERE ${t.where.replace(/\{S\}/g, `'${storeId}'`)}`,
    );
  }
  return out;
}

const SECRET_SUBSTRINGS = [
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, // bcrypt
  /\b(shpat|shpss|shpca|shppa)_[A-Za-z0-9]{20,}/g, // Shopify tokens
  /\bsk-ant-[\w-]{20,}/g,
  /\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, // JWT
];

/** Mask anything that looks like a secret, recursively (also inside longer strings). */
export function redact(v: any, depth = 0): any {
  if (depth > 6 || v == null) return v;
  if (typeof v === "string") {
    if (SECRET_VALUE.test(v.trim())) return "[redacted]";
    let s = v;
    for (const re of SECRET_SUBSTRINGS) s = s.replace(re, "[redacted]");
    return s.length > 2000 ? s.slice(0, 2000) + "…" : s;
  }
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  if (typeof v === "object") {
    if (v instanceof Date) return v;
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(x, depth + 1);
    return out;
  }
  return v;
}

class RollbackSignal extends Error {}

async function runSql(input: any, ctx: CopilotToolContext) {
  const err = checkQuery(input?.query);
  if (err) return { error: `Query rejected: ${err}` };
  if (!/^[\w-]{1,64}$/.test(ctx.storeId)) return { error: "invalid store id" };
  const maxRows = clamp(input?.maxRows, 50, 1, 200);
  const body = String(input.query).trim().replace(/;\s*$/, "").replace(/\$STORE\b/g, `'${ctx.storeId}'`);
  if (/\$\d|\$[A-Za-z]/.test(body.replace(/'(?:[^']|'')*'/g, "''"))) {
    return { error: "Query rejected: only the $STORE placeholder is supported" };
  }
  const views = scopeViews(body, ctx.storeId, await scopeCatalog());
  const wrapped = `SELECT * FROM (\n${body}\n) AS flo_q LIMIT ${maxRows + 1}`;
  const t0 = Date.now();
  try {
    // Always rolled back: the temp views must not outlive the query on a
    // pooled connection.
    let rows: any[] = [];
    await db
      .transaction(async (tx) => {
        await tx.execute(
          sql.raw(
            [
              `SET LOCAL statement_timeout = '8000'`,
              `SET LOCAL idle_in_transaction_session_timeout = '10000'`,
              ...views,
              // Read-only from here on (after the views exist).
              `SET TRANSACTION READ ONLY`,
            ].join(";\n"),
          ),
        );
        rows = rowsOf(await tx.execute(sql.raw(wrapped)));
        throw new RollbackSignal();
      })
      .catch((e) => {
        if (!(e instanceof RollbackSignal)) throw e;
      });
    const truncated = rows.length > maxRows;
    return {
      purpose: String(input?.purpose ?? "").slice(0, 200),
      scope: `${ctx.storeName ?? "current store"} only`,
      rowCount: Math.min(rows.length, maxRows),
      truncated,
      ms: Date.now() - t0,
      rows: redact(rows.slice(0, maxRows)),
      ...(truncated ? { note: `More than ${maxRows} rows; showing the first ${maxRows}. Aggregate or filter further.` } : {}),
    };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/statement timeout|canceling statement/i.test(msg)) return { error: "Query took longer than 8 s. Narrow the date range or aggregate." };
    if (/read-only transaction/i.test(msg)) return { error: "Query rejected: read-only." };
    return { error: `SQL error: ${msg.slice(0, 300)}` };
  }
}
