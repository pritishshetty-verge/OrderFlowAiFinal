import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Fix: OrderFlow Overview dashboard shows 0 Confirmed for the three
// backfilled agents even though orders.call_status is set correctly.
//
// Root cause (verified in server/storage.ts#getDashboardMetrics):
//
//   Confirmed count does NOT read orders.call_status — it reads
//   order_status_history with:
//     LOWER(order_status_history.status) IN ('confirmed','cancelled')
//     AND createdAt BETWEEN <start> AND <end>
//     AND (changed_by = userId  OR
//          (changed_by IS NULL AND order_assignments.user_id = userId))
//
// The reconstruct-from-notes.ts backfill wrote to orders.* but never
// inserted companion order_status_history rows, so the dashboard's
// query returns 0 for these agents.
//
// Fix:
//   For every order currently attributed to one of the three agents,
//   insert a single order_status_history row with:
//     status      = lowercase(orders.call_status)
//     changed_by  = orders.confirmed_by
//     created_at  = orders.confirmed_at   (critical for date-range filter)
//     note        = "Reconstructed from Shopify note" + the matched line
//
// Idempotency:
//   NOT EXISTS guard skips orders that already have a history row of
//   the right (status, changed_by) pair. Safe to re-run.
//
// Timestamp audit:
//   We verified upstream that 0/9,312 backfilled rows have NULL
//   confirmed_at; still, this script defensively COALESCEs to
//   processed_at and shopify_created_at.
//
// Flags:
//   --dry-run    show planned inserts, don't write
// ─────────────────────────────────────────────────────────────────────

const AGENT_EMAILS = [
  "chandi@vergescales.com",
  "tanisha@vergescales.com",
  "shruti@vergescales.com",
] as const;

type Args = { dryRun: boolean };
function parseArgs(): Args {
  return { dryRun: process.argv.slice(2).includes("--dry-run") };
}

async function main() {
  const { dryRun } = parseArgs();
  console.log(
    `[align-overview-data] starting${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  // ── Resolve agent user ids ─────────────────────────────────────
  const userRows: any = await db.execute(sql`
    SELECT id, email, full_name FROM users WHERE email = ANY(${sql.raw(
      `ARRAY[${AGENT_EMAILS.map((e) => `'${e}'`).join(",")}]::text[]`,
    )})
  `);
  const users: { id: string; email: string; full_name: string }[] =
    (userRows as any).rows ?? userRows;
  if (users.length !== AGENT_EMAILS.length) {
    console.error(
      `[align-overview-data] expected ${AGENT_EMAILS.length} users, found ${users.length}. Missing?`,
    );
    process.exit(1);
  }
  console.log(`\n── users ──`);
  for (const u of users) {
    console.log(`  ${u.full_name.padEnd(20)} <${u.email}>  id=${u.id}`);
  }

  const userIds = users.map((u) => u.id);

  // ── Audit: confirmed_at coverage ────────────────────────────────
  const coverage: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                            AS total,
      COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL)::int4    AS has_confirmed_at,
      COUNT(*) FILTER (WHERE confirmed_at IS NULL)::int4        AS null_confirmed_at,
      COUNT(*) FILTER (WHERE call_status = 'Confirmed')::int4   AS confirmed,
      COUNT(*) FILTER (WHERE call_status = 'Cancelled')::int4   AS cancelled,
      COUNT(*) FILTER (WHERE call_status = 'Follow Up')::int4   AS follow_up
    FROM orders
    WHERE confirmed_by = ANY(${sql.raw(`ARRAY[${userIds.map((id) => `'${id}'`).join(",")}]::text[]`)})
  `);
  const cov = ((coverage as any).rows ?? coverage)[0];
  console.log(`\n── backfilled cohort ──`);
  console.log(`  total orders attributed to the 3 agents: ${cov.total}`);
  console.log(`    call_status=Confirmed:                 ${cov.confirmed}`);
  console.log(`    call_status=Cancelled:                 ${cov.cancelled}`);
  console.log(`    call_status=Follow Up:                 ${cov.follow_up}`);
  console.log(`  confirmed_at populated:                  ${cov.has_confirmed_at}`);
  console.log(`  confirmed_at NULL (would be ignored):    ${cov.null_confirmed_at}`);

  if (Number(cov.null_confirmed_at) > 0) {
    // Repair any NULL confirmed_at so the date-range filter doesn't
    // drop these rows. Source priority: processed_at → shopify_created_at.
    console.log(`\n[align-overview-data] repairing ${cov.null_confirmed_at} NULL confirmed_at values…`);
    if (!dryRun) {
      await db.execute(sql`
        UPDATE orders
           SET confirmed_at = COALESCE(processed_at, shopify_created_at)
         WHERE confirmed_by = ANY(${sql.raw(`ARRAY[${userIds.map((id) => `'${id}'`).join(",")}]::text[]`)})
           AND confirmed_at IS NULL
      `);
    }
  }

  // ── Plan: what would be inserted ────────────────────────────────
  const planSql = sql`
    SELECT
      COALESCE(CASE o.call_status
                 WHEN 'Confirmed' THEN 'confirmed'
                 WHEN 'Cancelled' THEN 'cancelled'
                 WHEN 'Follow Up' THEN 'follow up'
               END, '?') AS mapped_status,
      COUNT(*)::int4 AS n
    FROM orders o
    WHERE o.confirmed_by = ANY(${sql.raw(`ARRAY[${userIds.map((id) => `'${id}'`).join(",")}]::text[]`)})
      AND o.call_status IN ('Confirmed','Cancelled','Follow Up')
      AND NOT EXISTS (
        SELECT 1 FROM order_status_history h
        WHERE h.order_id = o.id
          AND LOWER(h.status) = LOWER(
                CASE o.call_status
                  WHEN 'Confirmed' THEN 'confirmed'
                  WHEN 'Cancelled' THEN 'cancelled'
                  WHEN 'Follow Up' THEN 'follow up'
                END)
          AND h.changed_by = o.confirmed_by
      )
    GROUP BY 1
    ORDER BY 1
  `;
  const planRows: any = await db.execute(planSql);
  const planData: any[] = (planRows as any).rows ?? planRows;
  console.log(`\n── planned inserts (not yet written) ──`);
  let totalToInsert = 0;
  for (const r of planData) {
    console.log(`  status="${r.mapped_status}":  ${r.n} rows`);
    totalToInsert += Number(r.n);
  }
  console.log(`  total new history rows:  ${totalToInsert}`);

  if (dryRun) {
    console.log(
      `\n[align-overview-data] DRY RUN — no writes. Re-run without --dry-run.`,
    );
    process.exit(0);
  }

  if (totalToInsert === 0) {
    console.log(`\n[align-overview-data] nothing to insert — already aligned.`);
  } else {
    // ── Execute: one INSERT … SELECT, idempotent via NOT EXISTS ──
    console.log(`\n── inserting ${totalToInsert} order_status_history rows ──`);
    const insertResult: any = await db.execute(sql`
      INSERT INTO order_status_history (order_id, status, previous_status, changed_by, note, created_at)
      SELECT
        o.id,
        CASE o.call_status
          WHEN 'Confirmed' THEN 'confirmed'
          WHEN 'Cancelled' THEN 'cancelled'
          WHEN 'Follow Up' THEN 'follow up'
        END                                                       AS status,
        'Pending'                                                 AS previous_status,
        o.confirmed_by                                            AS changed_by,
        COALESCE(o.confirmed_notes, 'Reconstructed from Shopify note') AS note,
        COALESCE(o.confirmed_at, o.processed_at, o.shopify_created_at) AS created_at
      FROM orders o
      WHERE o.confirmed_by = ANY(${sql.raw(`ARRAY[${userIds.map((id) => `'${id}'`).join(",")}]::text[]`)})
        AND o.call_status IN ('Confirmed','Cancelled','Follow Up')
        AND NOT EXISTS (
          SELECT 1 FROM order_status_history h
          WHERE h.order_id = o.id
            AND LOWER(h.status) = LOWER(
                  CASE o.call_status
                    WHEN 'Confirmed' THEN 'confirmed'
                    WHEN 'Cancelled' THEN 'cancelled'
                    WHEN 'Follow Up' THEN 'follow up'
                  END)
            AND h.changed_by = o.confirmed_by
        )
      RETURNING id
    `);
    const inserted = ((insertResult as any).rows ?? insertResult) as any[];
    console.log(`  inserted: ${inserted.length}`);
  }

  // ── Verification: simulate "Chandi's personal view" ─────────────
  // Replicates the exact attribution condition from storage.ts:
  //   LOWER(status)='confirmed' AND (changed_by=chandi OR ...)
  console.log(`\n── verification: simulating the dashboard's Confirmed query per agent ──`);
  for (const u of users) {
    const qs = sql`
      SELECT
        COUNT(DISTINCT h.order_id) FILTER (WHERE LOWER(h.status) = 'confirmed')::int4 AS confirmed,
        COUNT(DISTINCT h.order_id) FILTER (WHERE LOWER(h.status) = 'cancelled')::int4 AS cancelled,
        MIN(h.created_at)                                                              AS first_action,
        MAX(h.created_at)                                                              AS last_action
      FROM order_status_history h
      LEFT JOIN order_assignments a ON a.order_id = h.order_id
      WHERE (
        h.changed_by = ${u.id}
        OR (h.changed_by IS NULL AND a.user_id = ${u.id})
      )
    `;
    const res: any = await db.execute(qs);
    const row = ((res as any).rows ?? res)[0];
    console.log(
      `  ${u.full_name.padEnd(20)}  Confirmed=${String(row.confirmed).padStart(5)}  Cancelled=${String(row.cancelled).padStart(4)}  range=${row.first_action ?? "(none)"} → ${row.last_action ?? "(none)"}`,
    );
  }

  // Also simulate team-wide (admin view — no userId filter).
  const team: any = await db.execute(sql`
    SELECT
      COUNT(DISTINCT h.order_id) FILTER (WHERE LOWER(h.status) = 'confirmed')::int4 AS team_confirmed,
      COUNT(DISTINCT h.order_id) FILTER (WHERE LOWER(h.status) = 'cancelled')::int4 AS team_cancelled
    FROM order_status_history h
    WHERE h.changed_by = ANY(${sql.raw(`ARRAY[${userIds.map((id) => `'${id}'`).join(",")}]::text[]`)})
  `);
  const t = ((team as any).rows ?? team)[0];
  console.log(
    `\n  TEAM TOTAL (3 agents):  Confirmed=${t.team_confirmed}  Cancelled=${t.team_cancelled}`,
  );

  console.log(`\n[align-overview-data] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[align-overview-data] failed:", err);
  process.exit(1);
});
