import "dotenv/config";
import { db } from "../db";
import { orders } from "@shared/schema";
import { sql, inArray } from "drizzle-orm";
import { updateShopifyClient } from "../shopify";

// ─────────────────────────────────────────────────────────────────────
// One-shot targeted backfill: flag every test-mode order in our DB.
//
// Why: our historical Shopify sync stored the raw order payload into
// orders.raw_shopify_data but never lifted the `test` flag into its own
// column. Pare's Phase 1 waterfall needs to exclude these to match
// Shopify's own sales reports.
//
// Strategy (primary): fetch the authoritative list from Shopify REST
//   GET /admin/api/2024-01/orders.json?status=any&test=true
// This is O(N_test_orders) — typically a handful, not 45k — so it's
// an order of magnitude faster than re-syncing every order.
//
// Strategy (safety net): union with any rows whose stored
// raw_shopify_data.test is true. Covers the edge case where Shopify's
// API might omit very old test orders during pagination.
// ─────────────────────────────────────────────────────────────────────

async function flagByIds(ids: string[], source: string) {
  if (ids.length === 0) return 0;
  // Chunk because IN (...) with tens of thousands of params is ugly
  // even though Drizzle handles it.
  const chunkSize = 500;
  let total = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const result = await db
      .update(orders)
      .set({ testOrder: true })
      .where(inArray(orders.shopifyOrderId, chunk))
      .returning({ shopifyOrderId: orders.shopifyOrderId });
    total += result.length;
  }
  console.log(`[flag-test-orders] ${source}: flagged ${total} rows`);
  return total;
}

async function main() {
  console.log(`[flag-test-orders] starting targeted backfill`);

  // ── Primary: hit Shopify REST for authoritative list ─────────────
  const client = await updateShopifyClient();
  console.log(`[flag-test-orders] fetching test orders from Shopify…`);
  const shopifyTestOrders = await client.fetchAllTestOrders();
  const shopifyIds = shopifyTestOrders.map((o) => String(o.id));
  console.log(
    `[flag-test-orders] Shopify returned ${shopifyIds.length} test orders`,
  );
  const shopifyFlagged = await flagByIds(shopifyIds, "Shopify API");

  // ── Safety net: union with local JSONB scan ──────────────────────
  // This catches orders whose test flag is present in raw_shopify_data
  // but were somehow missed by the Shopify pagination (very old test
  // orders beyond the API's window, for example).
  console.log(`[flag-test-orders] checking raw_shopify_data as safety net…`);
  const localResult = await db.execute(sql`
    UPDATE ${orders}
       SET test_order = true
     WHERE (raw_shopify_data->>'test')::boolean = true
       AND test_order = false
    RETURNING shopify_order_id
  `);
  const localRows: any[] =
    (localResult as any).rows ?? (localResult as any) ?? [];
  console.log(
    `[flag-test-orders] raw_shopify_data scan: flagged ${localRows.length} additional rows`,
  );

  // ── Final audit ──────────────────────────────────────────────────
  const audit: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE test_order = true)::int4 AS test_rows,
      COUNT(*)::int4 AS total_rows,
      COUNT(*) FILTER (
        WHERE test_order = true
          AND DATE(shopify_created_at AT TIME ZONE 'Asia/Kolkata') = '2026-04-18'
      )::int4 AS apr18_test_rows
    FROM orders
  `);
  const a = ((audit as any).rows ?? audit)[0];
  console.log(`[flag-test-orders] DB now has:`);
  console.log(`  test_order = true total:          ${a.test_rows}`);
  console.log(`  test_order = true on Apr 18:      ${a.apr18_test_rows}`);
  console.log(`  total orders in DB:               ${a.total_rows}`);
  console.log(`[flag-test-orders] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[flag-test-orders] failed:", err);
  process.exit(1);
});
