/**
 * One-off verification after db:push:
 *   1. Confirm pg_settlements table is present with the expected columns.
 *   2. Sample a few PayU-paid Shopify orders and check whether their
 *      raw_shopify_data jsonb actually contains the PayU_txn_id bridge
 *      key in note_attributes (the assumption the entire matcher rests on).
 *
 * Run with:  npx tsx scripts/verify_recon_setup.ts
 *
 * Deleted after the matcher work lands — this is sanity, not a fixture.
 */

import "dotenv/config";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

// Mask helper — strips actual customer info from anything we log.
function maskEmail(e: string | null | undefined): string {
  if (!e) return "(null)";
  const [local, domain] = e.split("@");
  if (!domain) return "***";
  return local.slice(0, 3) + "***@" + domain;
}

async function main() {
  console.log("\n=== 1) pg_settlements table present? ===");
  const tableInfo = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'pg_settlements'
    ORDER BY ordinal_position
  `);
  if (tableInfo.rows.length === 0) {
    console.error("FAIL — pg_settlements table not found");
    process.exit(1);
  }
  console.log(`OK — ${tableInfo.rows.length} columns:`);
  for (const r of tableInfo.rows) {
    console.log(`  ${(r as any).column_name.padEnd(24)} ${(r as any).data_type}`);
  }

  console.log("\n=== 2) Indexes on pg_settlements? ===");
  const indexes = await db.execute(sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'pg_settlements'
  `);
  for (const r of indexes.rows) {
    console.log(`  ${(r as any).indexname}`);
  }

  console.log("\n=== 3) Sample PayU-paid orders: do they carry PayU_txn_id? ===");
  // We look for orders where:
  //   - financial_status = 'paid'
  //   - payment_method mentions PayU somehow (varies: 'PayU', 'Cards, UPI, NB by PayU India', etc.)
  //   - raw_shopify_data has SOMETHING in note_attributes
  // Then we extract the note_attributes array and search for the key.
  const samples = await db.execute(sql`
    SELECT
      id,
      shopify_order_number,
      customer_email,
      payment_method,
      total_price,
      raw_shopify_data->'note_attributes' AS note_attributes
    FROM orders
    WHERE financial_status = 'paid'
      AND payment_method ILIKE '%payu%'
      AND raw_shopify_data IS NOT NULL
    ORDER BY shopify_created_at DESC
    LIMIT 10
  `);

  if (samples.rows.length === 0) {
    console.log("  No PayU-paid orders found. Either no PayU rows or payment_method doesn't say 'payu'.");
    console.log("  Trying a broader query (any prepaid order)...");
    const broader = await db.execute(sql`
      SELECT
        id,
        shopify_order_number,
        payment_method,
        raw_shopify_data ? 'note_attributes' AS has_note_attrs,
        jsonb_array_length(COALESCE(raw_shopify_data->'note_attributes', '[]'::jsonb)) AS na_count
      FROM orders
      WHERE financial_status = 'paid'
        AND raw_shopify_data IS NOT NULL
      ORDER BY shopify_created_at DESC
      LIMIT 5
    `);
    for (const r of broader.rows) {
      console.log(
        `  #${(r as any).shopify_order_number}  payment_method=${(r as any).payment_method}  has_note_attrs=${(r as any).has_note_attrs}  na_count=${(r as any).na_count}`
      );
    }
  } else {
    console.log(`  Found ${samples.rows.length} PayU-paid orders. Inspecting note_attributes:\n`);
    let withPayUId = 0;
    let withoutPayUId = 0;
    for (const r of samples.rows) {
      const na = (r as any).note_attributes as Array<{ name: string; value: string }> | null;
      const payuTxn = na?.find((a) => a.name === "PayU_txn_id");
      if (payuTxn) {
        withPayUId++;
        console.log(
          `  #${(r as any).shopify_order_number}  ${maskEmail((r as any).customer_email)}  PayU_txn_id=${payuTxn.value}  (length: ${payuTxn.value.length})`
        );
      } else {
        withoutPayUId++;
        const keys = na?.map((a) => a.name).slice(0, 5).join(", ") || "(none)";
        console.log(
          `  #${(r as any).shopify_order_number}  ${maskEmail((r as any).customer_email)}  PayU_txn_id MISSING.  note_attrs keys: ${keys}`
        );
      }
    }
    console.log(`\n  Summary: ${withPayUId} have PayU_txn_id, ${withoutPayUId} missing.`);
    if (withPayUId === samples.rows.length) {
      console.log("  OK — bridge holds. Matcher design will work.");
    } else if (withPayUId > 0) {
      console.log("  PARTIAL — bridge works for some orders. Need a fuzzy fallback for the rest.");
    } else {
      console.log("  FAIL — bridge data not present. Matcher needs a different join strategy.");
    }
  }

  console.log("\n=== 4) Total orders in this dev branch ===");
  const counts = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE financial_status = 'paid') AS paid,
      COUNT(*) FILTER (WHERE payment_method ILIKE '%payu%') AS payu_payment_method,
      COUNT(*) AS total
    FROM orders
  `);
  const c = counts.rows[0] as any;
  console.log(`  total=${c.total}  paid=${c.paid}  payment_method-mentions-payu=${c.payu_payment_method}`);

  await pool.end();
}

main().catch((err) => {
  console.error("\nVerification crashed:", err);
  process.exit(1);
});
