import "dotenv/config";
import { randomUUID } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Reconstruct CX attribution from Shopify order notes.
//
// Background:
//   inspect-notes-attribution.ts proved that agent names live in the
//   raw_shopify_data->>'note' field with a strict, predictable shape:
//
//     "<Action> by <Full Name> • <DD Mon YYYY>, <HH:MM>"
//
//   e.g. "Confirmed by Chandi Chaudhary • 13 Apr 2026, 21:27"
//
//   9,312 orders carry this format across three agents.
//
// What this script does:
//   1. Idempotently creates three agent users (Chandi / Tanisha / Shruti).
//   2. For every order whose raw.note matches the pattern:
//        • picks the LAST action line (most recent state)
//        • maps action → call_status (Confirmed | Cancelled | Follow Up)
//        • maps name   → confirmed_by (user id)
//        • maps "DD Mon YYYY, HH:MM" IST → confirmed_at (UTC)
//        • writes confirmed_notes with the raw line we matched
//   3. Prints a per-agent performance report.
//
// Idempotency:
//   Each row's WHERE guard is (call_status <> target OR confirmed_by IS
//   DISTINCT FROM target_user). Re-runs are no-ops for already-correct
//   rows and repair drift for changed rows.
//
// Flags:
//   --dry-run        don't write, just report what would change
//   --limit=<N>      only process first N matching orders (debug)
// ─────────────────────────────────────────────────────────────────────

type AgentSpec = {
  firstName: string;
  fullNamePattern: RegExp; // matches note-form, case-insensitive
  fullNameCanonical: string;
  username: string;
  email: string;
};

const AGENTS: AgentSpec[] = [
  {
    firstName: "Chandi",
    fullNamePattern: /Chandi(?:\s+Chaudhary)?/i,
    fullNameCanonical: "Chandi Chaudhary",
    username: "chandi_chaudhary",
    email: "chandi@vergescales.com",
  },
  {
    firstName: "Tanisha",
    fullNamePattern: /Tanisha(?:\s+Sahu)?/i,
    fullNameCanonical: "Tanisha Sahu",
    username: "tanisha_sahu",
    email: "tanisha@vergescales.com",
  },
  {
    firstName: "Shruti",
    // note data has "Shruti jha" (lowercase j); stay tolerant.
    fullNamePattern: /Shruti(?:\s+[Jj]ha)?/i,
    fullNameCanonical: "Shruti Jha",
    username: "shruti_jha",
    email: "shruti@vergescales.com",
  },
];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Line parser: matches
//   "Confirmed by Chandi Chaudhary • 13 Apr 2026, 21:27"
// or the same without the timestamp half.
//
// Action: Confirmed / Cancelled / Follow-up / Follow up / Followup
// (case-insensitive). Name: everything up to the bullet or end-of-line.
// Lookahead anchors the name at EOL so we don't truncate non-greedily
// (the earlier version captured just "Ch").
const LINE_RE =
  /(Confirmed|Cancelled|Canceled|Follow[\s-]?up)\s+by\s+([^•·\n\r]+?)\s*(?:[•·]\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2}))?(?=\s*(?:\r?\n|$))/gim;

type Parsed = {
  action: "Confirmed" | "Cancelled" | "Follow Up";
  agent: AgentSpec;
  confirmedAt: string | null; // ISO UTC, or null if we couldn't parse timestamp
  matchedLine: string;
};

function normalizeAction(raw: string): Parsed["action"] | null {
  const a = raw.toLowerCase();
  if (a.startsWith("confirm")) return "Confirmed";
  if (a.startsWith("cancel")) return "Cancelled";
  if (a.startsWith("follow")) return "Follow Up";
  return null;
}

function parseIstToUtcIso(
  day: string,
  monStr: string,
  year: string,
  hh: string,
  mm: string,
): string | null {
  const mon = MONTHS[monStr.toLowerCase().slice(0, 3)];
  if (!mon) return null;
  const dd = day.padStart(2, "0");
  const hhp = hh.padStart(2, "0");
  // IST = +05:30. JS parses ISO with offset correctly.
  const iso = `${year}-${mon}-${dd}T${hhp}:${mm}:00+05:30`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Pick the LAST matching line (most recent action) from a multi-line note.
// Uses exec() in a while loop instead of matchAll() so the code compiles
// under the repo's default tsconfig (no downlevelIteration flag).
function parseNote(note: string): Parsed | null {
  let chosen: Parsed | null = null;
  LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINE_RE.exec(note)) !== null) {
    const [, actionRaw, nameRaw, day, mon, year, hh, mm] = m;
    const action = normalizeAction(actionRaw);
    if (!action) continue;
    const agent = AGENTS.find((a) => a.fullNamePattern.test(nameRaw));
    if (!agent) continue;
    const confirmedAt =
      day && mon && year && hh && mm
        ? parseIstToUtcIso(day, mon, year, hh, mm)
        : null;
    chosen = {
      action,
      agent,
      confirmedAt,
      matchedLine: m[0].trim(),
    };
  }
  return chosen;
}

type Args = { dryRun: boolean; limit: number | null };
function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
  return { dryRun, limit };
}

// ── User setup ──────────────────────────────────────────────────────
async function ensureAgentUsers(
  dryRun: boolean,
): Promise<Map<string, string>> {
  // email → userId
  const byEmail = new Map<string, string>();

  for (const a of AGENTS) {
    const existing: any = await db.execute(sql`
      SELECT id, email, full_name FROM users WHERE email = ${a.email} LIMIT 1
    `);
    const row = ((existing as any).rows ?? existing)[0];
    if (row) {
      byEmail.set(a.email, row.id);
      console.log(
        `  user exists: ${a.fullNameCanonical.padEnd(20)} <${a.email}>  id=${row.id}`,
      );
      continue;
    }

    if (dryRun) {
      const placeholder = `00000000-0000-0000-0000-${a.username.slice(0, 12).padEnd(12, "0")}`;
      byEmail.set(a.email, placeholder);
      console.log(
        `  would create:  ${a.fullNameCanonical.padEnd(20)} <${a.email}>  (dry run)`,
      );
      continue;
    }

    // Synthetic bcrypt-shaped placeholder — login is impossible until
    // the agent resets their password through the app. Same pattern as
    // sync-tags-to-status.ts (project has no bcrypt dep to reuse).
    const fakeHash =
      "$2a$10$" + Buffer.from(randomUUID()).toString("base64").slice(0, 53);
    const inserted: any = await db.execute(sql`
      INSERT INTO users (username, password, email, full_name, role, is_active)
      VALUES (
        ${a.username},
        ${fakeHash},
        ${a.email},
        ${a.fullNameCanonical},
        'agent',
        true
      )
      RETURNING id
    `);
    const created = ((inserted as any).rows ?? inserted)[0];
    byEmail.set(a.email, created.id);
    console.log(
      `  created:       ${a.fullNameCanonical.padEnd(20)} <${a.email}>  id=${created.id}`,
    );
  }
  return byEmail;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const { dryRun, limit } = parseArgs();
  console.log(
    `[reconstruct-from-notes] starting${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  // Step 1 — users
  console.log(`\n── Step 1: ensure agent users ──`);
  const userByEmail = await ensureAgentUsers(dryRun);

  // Step 2 — scan candidate orders
  console.log(`\n── Step 2: fetch candidate orders ──`);
  const limitClause = limit ? sql`LIMIT ${limit}` : sql``;
  const cand: any = await db.execute(sql`
    SELECT
      id,
      shopify_order_number,
      call_status,
      confirmed_by,
      processed_at,
      raw_shopify_data->>'note' AS raw_note
    FROM orders
    WHERE test_order = false
      AND raw_shopify_data->>'note' IS NOT NULL
      AND (
        raw_shopify_data->>'note' ILIKE '%Chandi%'
        OR raw_shopify_data->>'note' ILIKE '%Tanisha%'
        OR raw_shopify_data->>'note' ILIKE '%Shruti%'
      )
    ORDER BY processed_at DESC
    ${limitClause}
  `);
  const candRows: any[] = (cand as any).rows ?? cand;
  console.log(`  candidate orders: ${candRows.length}`);

  // Step 3 — parse
  console.log(`\n── Step 3: parse notes ──`);
  const plans: {
    id: string;
    orderNumber: string;
    currentStatus: string;
    parsed: Parsed;
  }[] = [];
  let unparseable = 0;
  let missingTs = 0;
  for (const r of candRows) {
    const parsed = parseNote(String(r.raw_note ?? ""));
    if (!parsed) {
      unparseable++;
      continue;
    }
    if (!parsed.confirmedAt) missingTs++;
    plans.push({
      id: r.id,
      orderNumber: r.shopify_order_number,
      currentStatus: r.call_status,
      parsed,
    });
  }

  // Per-agent plan summary
  const planByAgent = new Map<string, { total: number; conf: number; canc: number; fup: number }>();
  for (const a of AGENTS) planByAgent.set(a.email, { total: 0, conf: 0, canc: 0, fup: 0 });
  for (const p of plans) {
    const s = planByAgent.get(p.parsed.agent.email)!;
    s.total++;
    if (p.parsed.action === "Confirmed") s.conf++;
    else if (p.parsed.action === "Cancelled") s.canc++;
    else s.fup++;
  }

  console.log(`  parsed successfully: ${plans.length}`);
  console.log(`  unparseable:         ${unparseable}`);
  console.log(`  parsed but no ts:    ${missingTs}  (will fall back to processed_at)`);
  console.log(`\n  per-agent plan:`);
  for (const a of AGENTS) {
    const s = planByAgent.get(a.email)!;
    console.log(
      `    ${a.fullNameCanonical.padEnd(20)}  total=${String(s.total).padStart(5)}  Conf=${String(s.conf).padStart(5)}  Canc=${String(s.canc).padStart(4)}  F/U=${String(s.fup).padStart(4)}`,
    );
  }

  if (dryRun) {
    console.log(
      `\n[reconstruct-from-notes] DRY RUN — sample of first 5 plans:`,
    );
    for (const p of plans.slice(0, 5)) {
      console.log(
        `  #${p.orderNumber}  ${p.currentStatus} → ${p.parsed.action}  by ${p.parsed.agent.fullNameCanonical}  @ ${p.parsed.confirmedAt ?? "(fallback to processed_at)"}`,
      );
      console.log(`    match: "${p.parsed.matchedLine}"`);
    }
    console.log(`\n[reconstruct-from-notes] DRY RUN — no writes. Re-run without --dry-run.`);
    process.exit(0);
  }

  // Step 4 — write
  console.log(`\n── Step 4: executing UPDATEs ──`);
  let written = 0;
  let skipped = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const p of plans) {
    const userId = userByEmail.get(p.parsed.agent.email)!;
    const reconstructionNote = `Reconstructed from Shopify note on ${today} — "${p.parsed.matchedLine}"`;

    // Idempotency: skip if already in the desired state.
    // We compare call_status AND confirmed_by — re-runs on already-correct
    // rows are no-ops, but drift gets repaired.
    const upd: any = await db.execute(sql`
      UPDATE orders
         SET call_status     = ${p.parsed.action},
             confirmed_by    = ${userId},
             confirmed_at    = COALESCE(
                                 ${p.parsed.confirmedAt}::timestamptz,
                                 processed_at,
                                 shopify_created_at
                               ),
             confirmed_notes = ${reconstructionNote}
       WHERE id = ${p.id}
         AND (
           call_status  IS DISTINCT FROM ${p.parsed.action}
           OR confirmed_by IS DISTINCT FROM ${userId}
         )
      RETURNING id
    `);
    const updRows = ((upd as any).rows ?? upd) as any[];
    if (updRows.length > 0) written++;
    else skipped++;

    if ((written + skipped) % 500 === 0) {
      console.log(
        `    progress: ${written + skipped}/${plans.length}  (written=${written}, already-correct=${skipped})`,
      );
    }
  }

  console.log(`\n  writes applied:      ${written}`);
  console.log(`  already correct:     ${skipped}`);

  // Step 5 — final per-agent performance report
  console.log(`\n── Step 5: per-agent performance (post-reconstruction) ──`);
  for (const a of AGENTS) {
    const userId = userByEmail.get(a.email)!;
    const r: any = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE call_status = 'Confirmed')::int4  AS confirmed,
        COUNT(*) FILTER (WHERE call_status = 'Cancelled')::int4  AS cancelled,
        COUNT(*) FILTER (WHERE call_status = 'Follow Up')::int4  AS follow_up,
        COUNT(*)::int4                                            AS total,
        COALESCE(SUM(total_price::numeric), 0)::float8            AS gmv,
        MIN(confirmed_at)                                          AS first_action,
        MAX(confirmed_at)                                          AS last_action
      FROM orders
      WHERE confirmed_by = ${userId}
    `);
    const row = ((r as any).rows ?? r)[0];
    console.log(
      `  ${a.fullNameCanonical.padEnd(20)} <${a.email}>`,
    );
    console.log(
      `    Confirmed=${String(row.confirmed).padStart(5)}  Cancelled=${String(row.cancelled).padStart(4)}  FollowUp=${String(row.follow_up).padStart(4)}  Total=${String(row.total).padStart(5)}`,
    );
    console.log(
      `    Range: ${row.first_action ?? "(none)"}  →  ${row.last_action ?? "(none)"}`,
    );
    console.log(
      `    GMV: ₹${Number(row.gmv).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
    );
  }

  console.log(`\n[reconstruct-from-notes] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[reconstruct-from-notes] failed:", err);
  process.exit(1);
});
