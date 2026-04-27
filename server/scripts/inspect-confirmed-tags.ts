import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Read-only diagnostic: where does the `of:confirmed` tag live, and
// on how many orders? Run this before sync-tags-to-status.ts so we
// know exactly what we're about to touch.
//
// Checks three surfaces:
//   1. orders.tags (text[]) — what the sync + webhook handlers write
//   2. orders.raw_shopify_data->>'tags' (comma-separated string) — the
//      authoritative Shopify payload
//   3. Cross-check: rows where the tag exists in ONE surface but not
//      the other (drift between sync and webhook code paths)
// ─────────────────────────────────────────────────────────────────────

const TAG = "of:confirmed";

async function main() {
  console.log(`[inspect-confirmed-tags] looking for "${TAG}"`);

  // ── 1. tags[] column ─────────────────────────────────────────────
  const colResult: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4 AS total_orders,
      COUNT(*) FILTER (WHERE tags IS NOT NULL AND array_length(tags, 1) > 0)::int4 AS has_any_tags,
      COUNT(*) FILTER (WHERE ${TAG} = ANY(tags))::int4 AS has_of_confirmed_col,
      COUNT(*) FILTER (
        WHERE ${TAG} = ANY(tags) AND call_status <> 'Confirmed'
      )::int4 AS tag_but_not_confirmed,
      COUNT(*) FILTER (
        WHERE ${TAG} = ANY(tags) AND call_status = 'Confirmed'
      )::int4 AS tag_and_already_confirmed
    FROM orders
  `);
  const c = ((colResult as any).rows ?? colResult)[0];
  console.log(`\n── tags[] column ─────────────────────────────`);
  console.log(`  total orders:                 ${c.total_orders}`);
  console.log(`  with any tags:                ${c.has_any_tags}`);
  console.log(`  with "${TAG}":        ${c.has_of_confirmed_col}`);
  console.log(`  tag present, NOT confirmed:   ${c.tag_but_not_confirmed}  ← backfill target`);
  console.log(`  tag present, already confirmed: ${c.tag_and_already_confirmed}`);

  // ── 2. raw_shopify_data JSONB ────────────────────────────────────
  // Shopify stores tags as a comma-separated string in the order
  // payload, not an array. Use ILIKE against the comma-joined form.
  const rawResult: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE raw_shopify_data IS NOT NULL
          AND raw_shopify_data->>'tags' IS NOT NULL
          AND (',' || (raw_shopify_data->>'tags') || ',') ILIKE '%,' || ${TAG} || ',%'
      )::int4 AS has_of_confirmed_raw
    FROM orders
  `);
  const r = ((rawResult as any).rows ?? rawResult)[0];
  console.log(`\n── raw_shopify_data->>'tags' ─────────────────`);
  console.log(`  with "${TAG}":        ${r.has_of_confirmed_raw}`);

  // ── 3. Drift: column vs JSON ─────────────────────────────────────
  const driftResult: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE NOT (${TAG} = ANY(COALESCE(tags, ARRAY[]::text[])))
          AND raw_shopify_data IS NOT NULL
          AND (',' || COALESCE(raw_shopify_data->>'tags', '') || ',') ILIKE '%,' || ${TAG} || ',%'
      )::int4 AS in_raw_not_in_col,
      COUNT(*) FILTER (
        WHERE ${TAG} = ANY(COALESCE(tags, ARRAY[]::text[]))
          AND NOT (
            raw_shopify_data IS NOT NULL
            AND (',' || COALESCE(raw_shopify_data->>'tags', '') || ',') ILIKE '%,' || ${TAG} || ',%'
          )
      )::int4 AS in_col_not_in_raw
    FROM orders
  `);
  const d = ((driftResult as any).rows ?? driftResult)[0];
  console.log(`\n── Drift ──────────────────────────────────────`);
  console.log(`  in raw JSON but NOT in tags[]: ${d.in_raw_not_in_col}  ← would be missed if we only scan tags[]`);
  console.log(`  in tags[] but NOT in raw JSON: ${d.in_col_not_in_raw}  ← stale/manual edits`);

  // ── 4. Age distribution of the backfill cohort ───────────────────
  const ageResult: any = await db.execute(sql`
    SELECT
      DATE_TRUNC('month', processed_at AT TIME ZONE 'Asia/Kolkata')::date AS month,
      COUNT(*)::int4 AS n
    FROM orders
    WHERE ${TAG} = ANY(COALESCE(tags, ARRAY[]::text[]))
      AND call_status <> 'Confirmed'
    GROUP BY 1
    ORDER BY 1 ASC
  `);
  const ageRows: any[] = (ageResult as any).rows ?? ageResult ?? [];
  console.log(`\n── Backfill cohort by month (IST) ─────────────`);
  if (ageRows.length === 0) {
    console.log(`  (none)`);
  } else {
    for (const row of ageRows) {
      console.log(`  ${row.month}: ${row.n}`);
    }
  }

  // ── 5. Sample rows ───────────────────────────────────────────────
  const sampleResult: any = await db.execute(sql`
    SELECT
      shopify_order_id,
      shopify_order_number,
      call_status,
      confirmed_by,
      array_to_string(tags, ',')                      AS tags_col,
      raw_shopify_data->>'tags'                       AS tags_raw,
      DATE(processed_at AT TIME ZONE 'Asia/Kolkata')  AS day_ist
    FROM orders
    WHERE ${TAG} = ANY(COALESCE(tags, ARRAY[]::text[]))
    ORDER BY processed_at DESC
    LIMIT 5
  `);
  const sampleRows: any[] = (sampleResult as any).rows ?? sampleResult ?? [];
  console.log(`\n── Sample rows (most recent 5) ────────────────`);
  for (const row of sampleRows) {
    console.log(
      `  #${row.shopify_order_number} (${row.day_ist})  call_status=${row.call_status}  confirmed_by=${row.confirmed_by ?? "NULL"}`,
    );
    console.log(`    tags col: ${row.tags_col}`);
    console.log(`    tags raw: ${row.tags_raw}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[inspect-confirmed-tags] failed:", err);
  process.exit(1);
});
