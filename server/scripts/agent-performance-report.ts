import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Read-only agent performance report.
//
// Source of truth: raw_shopify_data.tags (the comma-separated string
// Shopify returns). We scan every order, extract tags starting with
// `of:`, and attempt to attribute each to an agent.
//
// Attribution strategies (in priority order):
//   1. Namespaced tag:  `of:<action>:<agent>`  → `agent`
//   2. Note attribute:  raw.note_attributes with key matching
//                       /agent|cx.?rep|operator/i
//   3. Unattributed     → flagged in the audit section
//
// Cross-check: we look up each extracted agent string against
// users.username, users.full_name, and users.email to enrich the
// report with an email ID.
//
// This script NEVER writes to the database. It prints the report
// and exits.
// ─────────────────────────────────────────────────────────────────────

type AgentKey = string; // Normalized slug derived from the tag.

type AgentStats = {
  key: AgentKey;
  displayName: string; // Best-known casing, preserves the first form we saw
  confirmed: number;
  cancelled: number;
  followup: number;
  otherActions: Map<string, number>; // other `of:<action>` buckets
  totalGmv: number;
  firstSeen: string | null; // YYYY-MM-DD IST
  lastSeen: string | null; // YYYY-MM-DD IST
  orderIds: Set<string>; // for unique-order count
};

type Row = {
  shopify_order_id: string;
  shopify_order_number: string | null;
  processed_at: string | null;
  total_price: string | null;
  tags_raw: string | null;
  note_attributes: any;
};

function normalizeAgentKey(raw: string): AgentKey {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseOfTags(rawTagsStr: string | null): Array<{ action: string; agent: string | null }> {
  if (!rawTagsStr) return [];
  const out: Array<{ action: string; agent: string | null }> = [];
  for (const t of rawTagsStr.split(",")) {
    const tag = t.trim();
    if (!tag) continue;
    // Case-insensitive "of:" prefix (we saw both `of:` and `OF:` in data).
    if (!/^of:/i.test(tag)) continue;
    const rest = tag.slice(3); // after "of:"
    // Remaining may be "confirmed", "confirmed:chandi", "followup:rahul kumar"
    const parts = rest.split(":").map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    const [action, ...agentParts] = parts;
    const agent = agentParts.length > 0 ? agentParts.join(" ") : null;
    out.push({ action: action.toLowerCase(), agent });
  }
  return out;
}

// Shopify's note_attributes is an array of { name, value } pairs.
// Some shops stuff the agent name there under a key like "agent" or
// "cx_rep". Pull the first one that matches a reasonable pattern.
function agentFromNoteAttributes(noteAttrs: any): string | null {
  if (!Array.isArray(noteAttrs)) return null;
  const agentKeyRegex = /^(agent|cx.?rep|operator|confirmed.?by)$/i;
  for (const attr of noteAttrs) {
    if (attr?.name && typeof attr.name === "string" && agentKeyRegex.test(attr.name)) {
      const v = attr.value;
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
  }
  return null;
}

async function main() {
  console.log(`[agent-performance-report] scanning orders with "of:*" tags`);

  // Pull every row whose raw JSON tags contain "of:" (case-insensitive).
  // This is a single scan over ~47k rows — cheap on Neon.
  const result: any = await db.execute(sql`
    SELECT
      shopify_order_id,
      shopify_order_number,
      processed_at::text                       AS processed_at,
      total_price::text                        AS total_price,
      raw_shopify_data->>'tags'                AS tags_raw,
      raw_shopify_data->'note_attributes'      AS note_attributes
    FROM orders
    WHERE raw_shopify_data IS NOT NULL
      AND raw_shopify_data->>'tags' IS NOT NULL
      AND raw_shopify_data->>'tags' ILIKE '%of:%'
      AND test_order = false
      AND (financial_status IS NULL OR financial_status <> 'voided')
  `);
  const rows: Row[] = (result as any).rows ?? result ?? [];
  console.log(`[agent-performance-report] ${rows.length} orders carry an of:* tag`);

  // ── Aggregate ────────────────────────────────────────────────────
  const agents = new Map<AgentKey, AgentStats>();
  const UNATTRIBUTED: AgentKey = "__unattributed__";

  // Tally of unique `of:<action>` values seen with no agent — helps
  // the audit section explain what's unaccounted for.
  const unattributedByAction = new Map<string, number>();
  let totalOfTagsSeen = 0;
  let totalOfTagsUnattributed = 0;

  function istDate(ts: string | null): string | null {
    if (!ts) return null;
    // processed_at is a timestamptz coming back as an ISO-ish string.
    // Format to YYYY-MM-DD in IST.
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function getOrInit(key: AgentKey, display: string): AgentStats {
    let s = agents.get(key);
    if (!s) {
      s = {
        key,
        displayName: display,
        confirmed: 0,
        cancelled: 0,
        followup: 0,
        otherActions: new Map(),
        totalGmv: 0,
        firstSeen: null,
        lastSeen: null,
        orderIds: new Set(),
      };
      agents.set(key, s);
    }
    return s;
  }

  for (const row of rows) {
    const parsed = parseOfTags(row.tags_raw);
    if (parsed.length === 0) continue;

    // Fallback agent source: note_attributes on the raw payload.
    const noteAttrAgent = agentFromNoteAttributes(row.note_attributes);

    const day = istDate(row.processed_at);
    const gmv = Number(row.total_price) || 0;

    for (const { action, agent } of parsed) {
      totalOfTagsSeen++;

      const resolvedAgent = agent ?? noteAttrAgent;
      let key: AgentKey;
      let display: string;

      if (!resolvedAgent) {
        totalOfTagsUnattributed++;
        unattributedByAction.set(action, (unattributedByAction.get(action) ?? 0) + 1);
        key = UNATTRIBUTED;
        display = "(unattributed)";
      } else {
        key = normalizeAgentKey(resolvedAgent);
        display = resolvedAgent;
      }

      const stats = getOrInit(key, display);
      // Preserve the nicest-looking display name (prefer title-case-ish
      // forms over screaming-case where possible). Heuristic: shorter
      // all-lower is fine, but prefer mixed-case if we see it.
      if (
        display !== stats.displayName &&
        /[A-Z]/.test(display) &&
        stats.displayName === stats.displayName.toLowerCase()
      ) {
        stats.displayName = display;
      }

      // Bucket the action
      if (action === "confirmed") stats.confirmed++;
      else if (action === "cancelled" || action === "canceled") stats.cancelled++;
      else if (action === "followup" || action === "follow_up" || action === "follow-up") stats.followup++;
      else {
        stats.otherActions.set(action, (stats.otherActions.get(action) ?? 0) + 1);
      }

      // Order-level stats — only count GMV/dates once per (agent, order).
      if (!stats.orderIds.has(row.shopify_order_id)) {
        stats.orderIds.add(row.shopify_order_id);
        stats.totalGmv += gmv;
        if (day) {
          if (!stats.firstSeen || day < stats.firstSeen) stats.firstSeen = day;
          if (!stats.lastSeen || day > stats.lastSeen) stats.lastSeen = day;
        }
      }
    }
  }

  // ── Enrich with users table ──────────────────────────────────────
  // Match each agent key against users.username / full_name / email.
  // The match is lowercase-normalized; exact token match only (no
  // fuzzy matching — flagging mismatches is more honest than guessing).
  const agentKeys = Array.from(agents.keys()).filter((k) => k !== UNATTRIBUTED);
  const userLookup = new Map<
    AgentKey,
    { id: string; email: string; fullName: string; username: string } | null
  >();

  if (agentKeys.length > 0) {
    const usersResult: any = await db.execute(sql`
      SELECT id, email, full_name, username FROM users
    `);
    const allUsers: Array<{
      id: string;
      email: string;
      full_name: string;
      username: string;
    }> = (usersResult as any).rows ?? usersResult ?? [];

    for (const key of agentKeys) {
      const target = key; // already normalized
      const match = allUsers.find((u) => {
        const username = (u.username ?? "").toLowerCase();
        const fullName = (u.full_name ?? "").toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        const emailLocal = email.split("@")[0];
        // Match username exactly, or target appears as a first-token
        // of the full name (so "chandi" matches "Chandi Kumar"), or
        // matches the email local-part.
        return (
          username === target ||
          emailLocal === target ||
          fullName === target ||
          fullName.split(" ")[0] === target ||
          fullName.includes(` ${target}`) // handle "Chandi" in "Rahul Chandi"
        );
      });
      userLookup.set(
        key,
        match
          ? {
              id: match.id,
              email: match.email,
              fullName: match.full_name,
              username: match.username,
            }
          : null,
      );
    }
  }

  // ── Render the report ────────────────────────────────────────────
  const sortedAgents = Array.from(agents.values()).sort((a, b) => {
    // Unattributed last
    if (a.key === UNATTRIBUTED) return 1;
    if (b.key === UNATTRIBUTED) return -1;
    // Primary sort: confirmed + cancelled + followup desc
    const aTotal = a.confirmed + a.cancelled + a.followup;
    const bTotal = b.confirmed + b.cancelled + b.followup;
    return bTotal - aTotal;
  });

  function fmtGmv(n: number): string {
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  function pad(s: string, n: number): string {
    return s.length >= n ? s : s + " ".repeat(n - s.length);
  }
  function padR(s: string, n: number): string {
    return s.length >= n ? s : " ".repeat(n - s.length) + s;
  }

  console.log(`\n${"═".repeat(110)}`);
  console.log(`AGENT PERFORMANCE REPORT`);
  console.log(`${"═".repeat(110)}`);
  console.log(`Source:  raw_shopify_data.tags, filter: tags matching /^of:/i`);
  console.log(`Scope:   ${rows.length} tagged orders  (excludes test_order and voided)`);
  console.log(`Tags:    ${totalOfTagsSeen} total of:* tags, ${totalOfTagsUnattributed} without agent identifier`);
  console.log(`${"═".repeat(110)}\n`);

  // Table header
  console.log(
    pad("Agent", 22) +
      pad("Email", 34) +
      pad("Active Range", 23) +
      padR("Conf", 6) +
      padR("Canc", 6) +
      padR("F/U", 5) +
      padR("Orders", 8) +
      padR("GMV", 14),
  );
  console.log("─".repeat(110));

  for (const a of sortedAgents) {
    const user = userLookup.get(a.key);
    const email = user?.email ?? (a.key === UNATTRIBUTED ? "—" : "(no match)");
    const name =
      user?.fullName ??
      (a.key === UNATTRIBUTED ? a.displayName : `${a.displayName} (unlinked)`);
    const range =
      a.firstSeen && a.lastSeen
        ? a.firstSeen === a.lastSeen
          ? a.firstSeen
          : `${a.firstSeen} → ${a.lastSeen}`
        : "—";
    console.log(
      pad(truncate(name, 21), 22) +
        pad(truncate(email, 33), 34) +
        pad(truncate(range, 22), 23) +
        padR(String(a.confirmed), 6) +
        padR(String(a.cancelled), 6) +
        padR(String(a.followup), 5) +
        padR(String(a.orderIds.size), 8) +
        padR(fmtGmv(a.totalGmv), 14),
    );
    if (a.otherActions.size > 0) {
      const other = Array.from(a.otherActions.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      console.log(`  └─ other of:* actions: ${other}`);
    }
  }

  // ── Audit section ────────────────────────────────────────────────
  console.log(`\n${"═".repeat(110)}`);
  console.log(`ATTRIBUTION AUDIT`);
  console.log(`${"═".repeat(110)}\n`);

  console.log(
    `Unattributed tags: ${totalOfTagsUnattributed} of ${totalOfTagsSeen} total of:* tags (` +
      `${((100 * totalOfTagsUnattributed) / Math.max(totalOfTagsSeen, 1)).toFixed(1)}%)`,
  );
  if (unattributedByAction.size > 0) {
    console.log(`\nUnattributed by action:`);
    const entries = Array.from(unattributedByAction.entries()).sort((a, b) => b[1] - a[1]);
    for (const [action, n] of entries) {
      console.log(`  of:${action.padEnd(18)} ${n}`);
    }
  }

  const linkedCount = agentKeys.filter((k) => userLookup.get(k)).length;
  const unlinkedCount = agentKeys.length - linkedCount;
  console.log(
    `\nAgent → users table match: ${linkedCount}/${agentKeys.length} matched, ${unlinkedCount} unlinked`,
  );
  if (unlinkedCount > 0) {
    console.log(`\nUnlinked agent identifiers (no row in users):`);
    for (const k of agentKeys) {
      if (!userLookup.get(k)) {
        const a = agents.get(k)!;
        console.log(
          `  ${pad(a.displayName, 20)}  tags=${a.confirmed + a.cancelled + a.followup}  orders=${a.orderIds.size}`,
        );
      }
    }
  }

  console.log(`\n[agent-performance-report] done. No writes performed.`);
  process.exit(0);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

main().catch((err) => {
  console.error("[agent-performance-report] failed:", err);
  process.exit(1);
});
