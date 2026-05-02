import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Reconnaissance: does the string "Chandi" / "Tanisha" / "Shruti"
// actually appear in orders.notes or raw_shopify_data->>'note', and
// if so, how often and in what surrounding text?
//
// Run BEFORE reconstruct-from-notes.ts so we don't repeat the tag
// fiasco (where `of:confirmed:chandi` format was assumed and 0 rows
// matched). Read-only.
// ─────────────────────────────────────────────────────────────────────

const NAMES = ["Chandi", "Tanisha", "Shruti"] as const;

async function main() {
  // ── 1. Overall column population ─────────────────────────────────
  const pop: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4                                                     AS total,
      COUNT(*) FILTER (WHERE notes IS NOT NULL AND notes <> '')::int4    AS has_local_notes,
      COUNT(*) FILTER (
        WHERE raw_shopify_data->>'note' IS NOT NULL
          AND raw_shopify_data->>'note' <> ''
      )::int4                                                            AS has_raw_note
    FROM orders
    WHERE test_order = false
  `);
  const p = ((pop as any).rows ?? pop)[0];
  console.log(`\n── Note-field population (non-test orders) ──`);
  console.log(`  total non-test orders:         ${p.total}`);
  console.log(`  with orders.notes populated:   ${p.has_local_notes}`);
  console.log(`  with raw.note populated:       ${p.has_raw_note}`);

  // ── 2. Per-name mention counts ───────────────────────────────────
  console.log(`\n── Per-name mention counts ──`);
  for (const name of NAMES) {
    const pattern = `%${name}%`;
    const row: any = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE notes ILIKE ${pattern})::int4                             AS in_local,
        COUNT(*) FILTER (WHERE raw_shopify_data->>'note' ILIKE ${pattern})::int4         AS in_raw,
        COUNT(*) FILTER (
          WHERE notes ILIKE ${pattern}
             OR raw_shopify_data->>'note' ILIKE ${pattern}
        )::int4                                                                          AS in_either,
        COUNT(*) FILTER (
          WHERE (notes ILIKE ${pattern} OR raw_shopify_data->>'note' ILIKE ${pattern})
            AND call_status <> 'Confirmed'
        )::int4                                                                          AS unattributed_cohort
      FROM orders
      WHERE test_order = false
    `);
    const r = ((row as any).rows ?? row)[0];
    console.log(
      `  ${name.padEnd(8)}  local=${String(r.in_local).padStart(5)}  raw=${String(r.in_raw).padStart(5)}  either=${String(r.in_either).padStart(5)}  not-yet-confirmed=${r.unattributed_cohort}`,
    );
  }

  // ── 3. Sample notes per name to understand format ────────────────
  for (const name of NAMES) {
    const pattern = `%${name}%`;
    const sample: any = await db.execute(sql`
      SELECT
        shopify_order_number,
        call_status,
        notes,
        raw_shopify_data->>'note' AS raw_note,
        processed_at
      FROM orders
      WHERE test_order = false
        AND (notes ILIKE ${pattern} OR raw_shopify_data->>'note' ILIKE ${pattern})
      ORDER BY processed_at DESC
      LIMIT 5
    `);
    const rows: any[] = (sample as any).rows ?? sample;
    console.log(`\n── Sample notes mentioning "${name}" (most recent 5) ──`);
    if (rows.length === 0) {
      console.log(`  (none)`);
      continue;
    }
    for (const r of rows) {
      console.log(`  #${r.shopify_order_number}  status=${r.call_status}  processed_at=${r.processed_at}`);
      if (r.notes) console.log(`    local: ${String(r.notes).slice(0, 220)}`);
      if (r.raw_note) console.log(`    raw:   ${String(r.raw_note).slice(0, 220)}`);
    }
  }

  // ── 4. Action-word distribution around names ─────────────────────
  // Helps pick the right regex for call_status inference.
  console.log(`\n── Action keyword distribution in notes mentioning any target name ──`);
  const actionRow: any = await db.execute(sql`
    WITH hits AS (
      SELECT
        COALESCE(notes, '') || ' || ' || COALESCE(raw_shopify_data->>'note', '') AS blob
      FROM orders
      WHERE test_order = false
        AND (
          notes        ILIKE '%chandi%'   OR raw_shopify_data->>'note' ILIKE '%chandi%'
          OR notes     ILIKE '%tanisha%'  OR raw_shopify_data->>'note' ILIKE '%tanisha%'
          OR notes     ILIKE '%shruti%'   OR raw_shopify_data->>'note' ILIKE '%shruti%'
        )
    )
    SELECT
      COUNT(*) FILTER (WHERE blob ILIKE '%confirm%')::int4    AS confirm,
      COUNT(*) FILTER (WHERE blob ILIKE '%cancel%')::int4     AS cancel,
      COUNT(*) FILTER (WHERE blob ILIKE '%follow%')::int4     AS follow,
      COUNT(*) FILTER (WHERE blob ILIKE '%reject%')::int4     AS reject,
      COUNT(*) FILTER (WHERE blob ILIKE '%pending%')::int4    AS pending,
      COUNT(*)::int4                                          AS total
    FROM hits
  `);
  const a = ((actionRow as any).rows ?? actionRow)[0];
  console.log(`  total name-mention notes: ${a.total}`);
  console.log(`    contains "confirm":  ${a.confirm}`);
  console.log(`    contains "cancel":   ${a.cancel}`);
  console.log(`    contains "follow":   ${a.follow}`);
  console.log(`    contains "reject":   ${a.reject}`);
  console.log(`    contains "pending":  ${a.pending}`);

  // ── 5. Does the note carry a timestamp we can parse? ─────────────
  // Peek at a handful of full notes so we can decide on a parser.
  console.log(`\n── Full-length samples (for timestamp format inspection) ──`);
  const full: any = await db.execute(sql`
    SELECT raw_shopify_data->>'note' AS note
    FROM orders
    WHERE test_order = false
      AND raw_shopify_data->>'note' IS NOT NULL
      AND (
        raw_shopify_data->>'note' ILIKE '%chandi%'
        OR raw_shopify_data->>'note' ILIKE '%tanisha%'
        OR raw_shopify_data->>'note' ILIKE '%shruti%'
      )
    LIMIT 8
  `);
  const fullRows: any[] = (full as any).rows ?? full;
  for (const r of fullRows) {
    console.log(`  ---`);
    console.log(`  ${r.note}`);
  }

  console.log(`\n[inspect-notes-attribution] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[inspect-notes-attribution] failed:", err);
  process.exit(1);
});
