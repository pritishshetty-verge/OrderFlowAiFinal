// Flo (Ops Copilot) — ad-hoc read-only SQL for questions no dedicated tool
// covers. Admin-only. Defence in depth:
//   1. Static checks: one SELECT/WITH statement, no semicolons, no blocked
//      tables (sessions, credentials, settings, invites…), no secret columns,
//      no dangerous functions.
//   2. Runs inside a READ ONLY transaction with a statement timeout, wrapped
//      in an outer SELECT … LIMIT so the row count is bounded.
//   3. Results are redacted: any key that looks like a secret and any value
//      that looks like a password hash or token is masked.
// The model is told to scope every query to the current store with $STORE.

import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { CopilotToolContext } from "./tools";
import { rowsOf, clamp } from "./util";

const BLOCKED_TABLES = [
  "session", "sessions", "shopify_credentials", "app_settings", "invites", "webhooks",
  "copilot_audit", "pg_shadow", "pg_authid", "pg_user", "pg_roles", "pg_stat_activity",
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
  "Store scoping: most tables have store_id; users belong to stores via user_stores(user_id, store_id).",
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
      "Run ONE read-only PostgreSQL SELECT (or WITH … SELECT) when no other tool answers the question. Use $STORE for the current store id and always filter by it (e.g. WHERE o.store_id = $STORE). No semicolons. Max 200 rows, 8 s timeout. Admin only. Prefer the dedicated tools whenever they fit.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A single SELECT/WITH query using $STORE for the store id." },
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

// Tables that hold secrets in some columns but are useful to query. Every
// reference is rewritten to a subquery exposing only non-secret columns, so
// whole-row tricks (SELECT s FROM stores s, json_agg(u), u::text) can't
// reach the secret columns at all.
const PROTECTED_TABLES = ["users", "stores"];
const SECRET_COLUMN_NAME = /pass|secret|token|api_?key|salt|cred|kyc|merchant_key/i;
const SQL_KEYWORDS = new Set([
  "where", "join", "left", "right", "inner", "outer", "full", "cross", "natural", "on", "using", "group",
  "order", "limit", "offset", "union", "except", "intersect", "having", "window", "lateral", "as", "and", "or",
]);
let safeColsCache: { at: number; cols: Record<string, string[]> } | null = null;

async function safeColumns(): Promise<Record<string, string[]>> {
  if (safeColsCache && Date.now() - safeColsCache.at < 10 * 60_000) return safeColsCache.cols;
  const r = await db.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('users', 'stores')
    ORDER BY ordinal_position`);
  const cols: Record<string, string[]> = { users: [], stores: [] };
  for (const row of rowsOf(r)) {
    const c = String(row.column_name);
    if (!SECRET_COLUMN_NAME.test(c) && !BLOCKED_COLUMNS.test(c)) cols[String(row.table_name)].push(`"${c}"`);
  }
  safeColsCache = { at: Date.now(), cols };
  return cols;
}

/** Rewrite FROM/JOIN users|stores [alias] → (SELECT safe cols FROM …) AS alias. */
export function rewriteProtected(body: string, cols: Record<string, string[]>): string | { error: string } {
  let out = body.replace(
    /\b(from|join)\s+(?:public\.)?(users|stores)\b(\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi,
    (_m, kw: string, table: string, aliasPart: string | undefined, alias: string | undefined) => {
      const t = table.toLowerCase();
      const keepAlias = alias && !SQL_KEYWORDS.has(alias.toLowerCase());
      const name = keepAlias ? alias : t;
      const rest = aliasPart && !keepAlias ? aliasPart : "";
      return `${kw} (SELECT ${cols[t].join(", ")} FROM public.${t}) AS ${name}${rest}`;
    },
  );
  // Any other way of naming these tables (comma joins, ONLY, …) is refused.
  const stripped = out.replace(/\(SELECT [^)]*FROM public\.(users|stores)\)/g, "");
  if (/,\s*(?:public\.)?(users|stores)\b(?!\s*\.)|\bonly\s+(?:public\.)?(users|stores)\b|\bpublic\.(users|stores)\b/i.test(stripped)) {
    return { error: "join users/stores with JOIN … ON (not comma joins)" };
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

async function runSql(input: any, ctx: CopilotToolContext) {
  const err = checkQuery(input?.query);
  if (err) return { error: `Query rejected: ${err}` };
  if (!/^[\w-]{1,64}$/.test(ctx.storeId)) return { error: "invalid store id" };
  const maxRows = clamp(input?.maxRows, 50, 1, 200);
  const body = String(input.query).trim().replace(/;\s*$/, "").replace(/\$STORE\b/g, `'${ctx.storeId}'`);
  if (/\$\d|\$[A-Za-z]/.test(body.replace(/'(?:[^']|'')*'/g, "''"))) {
    return { error: "Query rejected: only the $STORE placeholder is supported" };
  }
  const rewritten = rewriteProtected(body, await safeColumns());
  if (typeof rewritten !== "string") return { error: `Query rejected: ${rewritten.error}` };
  const wrapped = `SELECT * FROM (\n${rewritten}\n) AS flo_q LIMIT ${maxRows + 1}`;
  const t0 = Date.now();
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = '8000'`));
      await tx.execute(sql.raw(`SET LOCAL idle_in_transaction_session_timeout = '10000'`));
      return rowsOf(await tx.execute(sql.raw(wrapped)));
    });
    const truncated = rows.length > maxRows;
    return {
      purpose: String(input?.purpose ?? "").slice(0, 200),
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
