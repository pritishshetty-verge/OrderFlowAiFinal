import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// One-shot backfill: lift `processed_at` from raw_shopify_data JSONB
// into the new dedicated column. Falls back to shopify_created_at when
// the JSON doesn't contain a processed_at value.
//
// This is the "financial" timestamp Shopify's own reports bucket on,
// and what Pare v0.5+ uses for the waterfall.
// ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[backfill-processed-at] starting");

  // Count what we're about to update.
  const beforeRows: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4 AS total,
      COUNT(*) FILTER (WHERE processed_at IS NULL)::int4 AS null_rows,
      COUNT(*) FILTER (
        WHERE processed_at IS NULL AND raw_shopify_data ? 'processed_at'
          AND raw_shopify_data->>'processed_at' IS NOT NULL
      )::int4 AS can_fill_from_json,
      COUNT(*) FILTER (
        WHERE processed_at IS NULL AND (
          NOT raw_shopify_data ? 'processed_at'
          OR raw_shopify_data->>'processed_at' IS NULL
        )
      )::int4 AS needs_fallback
    FROM orders
  `);
  const b = ((beforeRows as any).rows ?? beforeRows)[0];
  console.log(`[backfill-processed-at] before:`);
  console.log(`  total rows:              ${b.total}`);
  console.log(`  processed_at IS NULL:    ${b.null_rows}`);
  console.log(`  can fill from JSON:      ${b.can_fill_from_json}`);
  console.log(`  needs fallback to created_at: ${b.needs_fallback}`);

  // Single bulk UPDATE with COALESCE fallback. Runs in one round-trip
  // on Neon — for 47k rows this completes in a couple seconds.
  console.log(`[backfill-processed-at] executing UPDATE…`);
  const updated: any = await db.execute(sql`
    UPDATE orders
       SET processed_at = COALESCE(
             (raw_shopify_data->>'processed_at')::timestamptz,
             -- shopify_created_at is plain timestamp storing UTC wallclock.
             -- Lift to timestamptz at UTC so the semantics match new rows.
             shopify_created_at AT TIME ZONE 'UTC'
           )
     WHERE processed_at IS NULL
    RETURNING shopify_order_id
  `);
  const updatedRows = (updated as any).rows ?? updated;
  console.log(`[backfill-processed-at] updated ${updatedRows.length} rows`);

  // Audit after.
  const afterRows: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4 AS total,
      COUNT(*) FILTER (WHERE processed_at IS NULL)::int4 AS null_rows
    FROM orders
  `);
  const a = ((afterRows as any).rows ?? afterRows)[0];
  console.log(`[backfill-processed-at] after:  total=${a.total}, NULLs=${a.null_rows}`);
  if (a.null_rows > 0) {
    console.warn(
      `[backfill-processed-at] WARN: ${a.null_rows} rows still have NULL processed_at`,
    );
  }

  // Spot-check Apr 18 (IST) — should land on ~465 orders per the earlier
  // diagnostic, matching Shopify's sales report.
  const apr18: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4 AS n_orders,
      SUM(total_price::numeric)::float8 AS sum_total_price,
      SUM(subtotal::numeric + COALESCE(total_discount::numeric, 0))::float8 AS gross_gmv
    FROM orders
    WHERE DATE(processed_at AT TIME ZONE 'Asia/Kolkata') = '2026-04-18'
  `);
  const apr = ((apr18 as any).rows ?? apr18)[0];
  console.log(`[backfill-processed-at] Apr 18 (IST) spot-check via processed_at:`);
  console.log(`  orders:         ${apr.n_orders}`);
  console.log(`  sum_total_price: ₹${Number(apr.sum_total_price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  console.log(`  gross_gmv:       ₹${Number(apr.gross_gmv).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
  console.log(`[backfill-processed-at] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-processed-at] failed:", err);
  process.exit(1);
});
