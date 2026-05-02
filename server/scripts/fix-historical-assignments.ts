import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// One-time fix: historical orders that have a known confirming agent
// but still show as "Unassigned" in agent dashboards.
//
// Surfaces (verified in shared/schema.ts + server/routes.ts):
//
//   • orders.assigned_to / orders.assigned_at
//       → What GET /api/orders filters on (the "My Orders" list).
//
//   • order_assignments (order_id, user_id, assigned_by, created_at)
//       → What the Overview "Confirmed" tile falls back to when
//         order_status_history.changed_by is NULL (AI auto-confirm).
//
//   The app's manual-assignment flow (POST /api/orders/:id/assign)
//   writes to BOTH surfaces — this backfill matches that pattern.
//
// Source of truth for "who did the work":
//   orders.confirmed_by, populated by reconstruct-from-notes.ts from
//   the Shopify order-note text. Same field already feeds the Pare
//   CX Confirmed split, and it's denormalized from
//   order_status_history.changed_by — so using it keeps all three
//   surfaces consistent.
//
// Target cohort:
//   orders WHERE confirmed_by IS NOT NULL
//            AND assigned_to IS NULL
//   (unassigned orders that have a confirming agent)
//
// Idempotency:
//   • UPDATE's WHERE clause excludes already-assigned rows.
//   • INSERT uses NOT EXISTS on (order_id, user_id) to avoid dupes.
//   Safe to re-run.
//
// Flags:
//   --dry-run   show planned changes, no writes
// ─────────────────────────────────────────────────────────────────────

type Args = { dryRun: boolean };
function parseArgs(): Args {
  return { dryRun: process.argv.slice(2).includes("--dry-run") };
}

async function main() {
  const { dryRun } = parseArgs();
  console.log(
    `[fix-historical-assignments] starting${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  // ── Audit before ────────────────────────────────────────────────
  const before: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                                 AS total_orders,
      COUNT(*) FILTER (WHERE confirmed_by IS NOT NULL)::int4         AS has_confirmer,
      COUNT(*) FILTER (WHERE assigned_to IS NOT NULL)::int4          AS has_assignee,
      COUNT(*) FILTER (
        WHERE confirmed_by IS NOT NULL AND assigned_to IS NULL
      )::int4                                                         AS cohort,
      COUNT(*) FILTER (
        WHERE confirmed_by IS NOT NULL
          AND assigned_to IS NOT NULL
          AND assigned_to <> confirmed_by
      )::int4                                                         AS drift
    FROM orders
  `);
  const b = ((before as any).rows ?? before)[0];
  console.log(`\n── pre-run audit ──`);
  console.log(`  total orders:                                  ${b.total_orders}`);
  console.log(`  with confirmed_by populated:                   ${b.has_confirmer}`);
  console.log(`  with assigned_to populated:                    ${b.has_assignee}`);
  console.log(`  cohort (confirmed_by set, assigned_to NULL):   ${b.cohort}   ← will fix`);
  console.log(`  drift (assigned_to <> confirmed_by):           ${b.drift}   ← left alone (manual overrides)`);

  // ── Per-agent breakdown of the cohort ───────────────────────────
  const byAgent: any = await db.execute(sql`
    SELECT
      u.full_name,
      u.email,
      COUNT(*)::int4 AS n
    FROM orders o
    JOIN users u ON u.id = o.confirmed_by
    WHERE o.confirmed_by IS NOT NULL
      AND o.assigned_to IS NULL
    GROUP BY u.full_name, u.email
    ORDER BY n DESC
  `);
  const byAgentRows: any[] = (byAgent as any).rows ?? byAgent;
  console.log(`\n── cohort breakdown by confirming agent ──`);
  for (const r of byAgentRows) {
    console.log(`  ${String(r.full_name).padEnd(22)} <${r.email}>  ${r.n}`);
  }

  if (dryRun) {
    console.log(`\n[fix-historical-assignments] DRY RUN — no writes.`);
    process.exit(0);
  }

  if (Number(b.cohort) === 0) {
    console.log(`\n[fix-historical-assignments] nothing to fix — already aligned.`);
    process.exit(0);
  }

  // ── Step A: fill orders.assigned_to / assigned_at ───────────────
  // Source: orders.confirmed_by (same agent who did the work).
  // We also stamp assigned_at from confirmed_at (the note's IST
  // timestamp) so downstream reports using assigned_at land on the
  // right day. Fall back to processed_at / shopify_created_at.
  console.log(`\n── Step A: UPDATE orders.assigned_to ──`);
  const updRes: any = await db.execute(sql`
    UPDATE orders
       SET assigned_to = confirmed_by,
           assigned_at = COALESCE(confirmed_at, processed_at, shopify_created_at)
     WHERE confirmed_by IS NOT NULL
       AND assigned_to IS NULL
    RETURNING id
  `);
  const updated = ((updRes as any).rows ?? updRes) as any[];
  console.log(`  updated rows: ${updated.length}`);

  // ── Step B: backfill order_assignments rows ─────────────────────
  // One row per (order_id, user_id) pair. Guard with NOT EXISTS so
  // repeat runs don't create duplicates. `assigned_by` = the agent
  // themselves (best available — we don't have a third-party assigner
  // for historical data).
  console.log(`\n── Step B: INSERT INTO order_assignments ──`);
  const insRes: any = await db.execute(sql`
    INSERT INTO order_assignments (order_id, user_id, assigned_by, note, created_at)
    SELECT
      o.id,
      o.confirmed_by,
      o.confirmed_by,
      'Backfilled from confirmed_by during historical-assignment fix',
      COALESCE(o.confirmed_at, o.processed_at, o.shopify_created_at)
    FROM orders o
    WHERE o.confirmed_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM order_assignments a
        WHERE a.order_id = o.id
          AND a.user_id  = o.confirmed_by
      )
    RETURNING id
  `);
  const inserted = ((insRes as any).rows ?? insRes) as any[];
  console.log(`  inserted assignment rows: ${inserted.length}`);

  // ── Verification ────────────────────────────────────────────────
  console.log(`\n── post-run verification ──`);

  const after: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE confirmed_by IS NOT NULL AND assigned_to IS NULL
      )::int4                                                     AS residual_unassigned,
      COUNT(*) FILTER (
        WHERE confirmed_by IS NOT NULL
          AND assigned_to = confirmed_by
      )::int4                                                     AS aligned
    FROM orders
  `);
  const a = ((after as any).rows ?? after)[0];
  console.log(`  orders with confirmer but no assignee: ${a.residual_unassigned}`);
  console.log(`  orders where assigned_to = confirmed_by: ${a.aligned}`);

  // Per-agent post-state. Single query via two LATERAL subqueries
  // counting each surface independently.
  const perAgent: any = await db.execute(sql`
    SELECT
      u.full_name,
      u.email,
      (SELECT COUNT(*)::int4 FROM orders            o WHERE o.assigned_to = u.id) AS assigned_column,
      (SELECT COUNT(*)::int4 FROM order_assignments a WHERE a.user_id     = u.id) AS assignment_rows
    FROM users u
    WHERE u.id IN (SELECT DISTINCT confirmed_by FROM orders WHERE confirmed_by IS NOT NULL)
    ORDER BY 3 DESC
  `);
  const perAgentRows: any[] = (perAgent as any).rows ?? perAgent;
  console.log(`\n  per-agent final counts:`);
  for (const r of perAgentRows) {
    console.log(
      `    ${String(r.full_name).padEnd(22)} <${r.email}>  orders.assigned_to=${String(r.assigned_column).padStart(5)}  order_assignments rows=${String(r.assignment_rows).padStart(5)}`,
    );
  }

  console.log(`\n[fix-historical-assignments] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[fix-historical-assignments] failed:", err);
  process.exit(1);
});
