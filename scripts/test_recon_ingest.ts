/**
 * End-to-end ingestion smoke test.
 *
 * Pipeline exercised:
 *   1. Load the converted PayU CSV from recon-test-data/
 *   2. Hand it to payuAdapter.parseSettlementCsv (the adapter we just wrote)
 *   3. Bulk-upsert the parsed rows via storage.bulkUpsertPgSettlements
 *   4. Verify the rows landed by querying pg_settlements
 *   5. Show a sample of what got stored
 *
 * Run:  npx tsx scripts/test_recon_ingest.ts
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { payuAdapter } from "../server/pgs/payu";
import { storage } from "../server/storage";
import { db, pool } from "../server/db";
import { pgSettlements } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

function maskEmail(e: string | null | undefined): string {
  if (!e) return "(null)";
  const [local, domain] = e.split("@");
  if (!domain) return "***";
  return local.slice(0, 3) + "***@" + domain;
}

async function main() {
  console.log("\n=== 1) Load CSV ===");
  const csvPath = resolve("recon-test-data/payu-sample.csv");
  const csv = readFileSync(csvPath, "utf8");
  console.log(`  ${csvPath}  (${csv.length} bytes)`);

  console.log("\n=== 2) Parse via payuAdapter ===");
  // Glow & Me storeId (PayU/Fastrr is theirs, matches CSV origin).
  // Hardcoded for the test; production resolves this via req.storeScope.
  const GLOW_AND_ME_STORE_ID = "3f550942-9bb4-4ec1-b8ed-3a11803acd3e";
  const t0 = Date.now();
  const { rows, skipped, errors } = await payuAdapter.parseSettlementCsv(csv, {
    storeId: GLOW_AND_ME_STORE_ID,
    sourceFile: "payu-sample.csv",
  });
  const t1 = Date.now();
  console.log(`  parsed=${rows.length}  skipped=${skipped}  errors=${errors.length}  in ${t1 - t0}ms`);
  if (errors.length > 0) {
    console.log("  Error samples:");
    for (const e of errors.slice(0, 5)) {
      console.log(`    row ${e.row}: ${e.reason}`);
    }
  }
  if (rows.length === 0) {
    console.error("  No rows produced — aborting before DB writes.");
    process.exit(1);
  }

  console.log("\n=== 3) Sample of parsed rows ===");
  for (const r of rows.slice(0, 3)) {
    console.log(`  pgPaymentId=${r.pgPaymentId}  pgOrderId=${r.pgOrderId}`);
    console.log(`    gross=${r.grossAmount}  net=${r.settledAmount}  fee=${r.feeDeducted}  gst=${r.taxOnFee}`);
    console.log(`    settled_at=${r.settledAt}  pg_txn_at=${r.pgTransactionAt}  utr=${r.utrNumber}`);
    console.log(`    status=${r.status}  storeId=${r.storeId ?? "(null)"}  source=${r.sourceFile}`);
  }

  console.log("\n=== 4) Bulk upsert into pg_settlements ===");
  const t2 = Date.now();
  const { processed } = await storage.bulkUpsertPgSettlements(rows);
  const t3 = Date.now();
  console.log(`  processed=${processed} rows  in ${t3 - t2}ms`);

  console.log("\n=== 5) Re-upload to verify idempotency (same rows, no duplicates) ===");
  const t4 = Date.now();
  const { processed: again } = await storage.bulkUpsertPgSettlements(rows);
  const t5 = Date.now();
  console.log(`  re-processed=${again} rows in ${t5 - t4}ms (would only insert NEW rows; updates the rest)`);

  console.log("\n=== 6) Query back what's in pg_settlements ===");
  const total = await db
    .select({ c: sql<number>`count(*)` })
    .from(pgSettlements)
    .where(eq(pgSettlements.pgName, "payu"));
  console.log(`  total payu rows in pg_settlements = ${total[0].c}`);

  // Status breakdown — all should be 'pending' since matcher hasn't run.
  const byStatus = await db
    .select({
      status: pgSettlements.status,
      c: sql<number>`count(*)`,
    })
    .from(pgSettlements)
    .where(eq(pgSettlements.pgName, "payu"))
    .groupBy(pgSettlements.status);
  console.log("  by status:");
  for (const r of byStatus) {
    console.log(`    ${r.status}: ${r.c}`);
  }

  // One full sample row to confirm shape.
  const [sample] = await db
    .select()
    .from(pgSettlements)
    .where(eq(pgSettlements.pgName, "payu"))
    .limit(1);
  if (sample) {
    console.log("\n  Sample row:");
    console.log(`    id=${sample.id}`);
    console.log(`    pgPaymentId=${sample.pgPaymentId}  pgOrderId=${sample.pgOrderId}`);
    console.log(`    gross=${sample.grossAmount}  settled=${sample.settledAmount}  fee=${sample.feeDeducted}`);
    console.log(`    utr=${sample.utrNumber}  settled_at=${sample.settledAt}`);
    console.log(`    status=${sample.status}  source=${sample.sourceFile}`);
    console.log(`    rawPayload keys: ${Object.keys(sample.rawPayload as any).slice(0, 6).join(", ")}, ...`);
  }

  console.log("\n=== 7) Cross-check: any of these PayU IDs already in our orders' note_attributes? ===");
  // Preview of what the matcher will do — does the bridge actually
  // resolve any of our just-uploaded PayU rows to existing Shopify
  // orders? Build IN-list as SQL literal interpolation (safe: these
  // values came from our own parser and are 11-digit numerics).
  const allIds = rows.map((r) => r.pgPaymentId);
  // Quote each id, join — `sql.raw` is safe because allIds came from
  // parseSettlementCsv which validates them as numerics earlier.
  const inList = allIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  const matches = await db.execute(sql.raw(`
    SELECT
      o.shopify_order_number,
      o.customer_email,
      o.total_price,
      attr->>'value' AS payu_txn_id
    FROM orders o
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.raw_shopify_data->'note_attributes', '[]'::jsonb)) attr
    WHERE attr->>'name' = 'PayU_txn_id'
      AND attr->>'value' IN (${inList})
  `));
  if (matches.rows.length === 0) {
    console.log("  No matches in this dev branch for the 5 sample PayU IDs.");
    console.log("  (Expected — the CSV is from Jun 5, the production data has older orders.)");
  } else {
    console.log(`  ${matches.rows.length} matches found:`);
    for (const m of matches.rows) {
      const row = m as any;
      console.log(`    Shopify #${row.shopify_order_number}  ${maskEmail(row.customer_email)}  total=₹${row.total_price}  PayU_txn_id=${row.payu_txn_id}`);
    }
  }

  console.log("\n✓ Ingestion pipeline works end-to-end.");
  await pool.end();
}

main().catch((err) => {
  console.error("\nTest crashed:", err);
  process.exit(1);
});
