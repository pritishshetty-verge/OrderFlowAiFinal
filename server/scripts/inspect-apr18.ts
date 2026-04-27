import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  // Compare created_at vs processed_at bucketing for Apr 18.
  const byCreated: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4 AS n,
      SUM(total_price::numeric)::float8 AS sum_total_price,
      SUM(subtotal::numeric + COALESCE(total_discount::numeric, 0))::float8 AS gross_gmv
    FROM orders
    WHERE DATE(shopify_created_at AT TIME ZONE 'Asia/Kolkata') = '2026-04-18'
  `);
  console.log("Bucketing by shopify_created_at (what Pare uses today):");
  for (const [k, v] of Object.entries(((byCreated as any).rows ?? byCreated)[0])) {
    const disp = typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : v;
    console.log(`  ${k.padEnd(24)} ${disp}`);
  }

  const byProcessed: any = await db.execute(sql`
    SELECT
      COUNT(*)::int4 AS n,
      SUM(total_price::numeric)::float8 AS sum_total_price,
      SUM(subtotal::numeric + COALESCE(total_discount::numeric, 0))::float8 AS gross_gmv
    FROM orders
    WHERE DATE(
      (raw_shopify_data->>'processed_at')::timestamptz AT TIME ZONE 'Asia/Kolkata'
    ) = '2026-04-18'
  `);
  console.log("\nBucketing by processed_at (what Shopify sales report uses):");
  for (const [k, v] of Object.entries(((byProcessed as any).rows ?? byProcessed)[0])) {
    const disp = typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : v;
    console.log(`  ${k.padEnd(24)} ${disp}`);
  }

  // How many orders differ between the two bucketings?
  const drift: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE DATE(shopify_created_at AT TIME ZONE 'Asia/Kolkata') <> DATE(
          (raw_shopify_data->>'processed_at')::timestamptz AT TIME ZONE 'Asia/Kolkata'
        )
      )::int4 AS days_differ,
      COUNT(*) FILTER (WHERE raw_shopify_data->>'processed_at' IS NULL)::int4 AS null_processed_at
    FROM orders
    WHERE DATE(shopify_created_at AT TIME ZONE 'Asia/Kolkata') BETWEEN '2026-04-17' AND '2026-04-19'
  `);
  console.log("\nDrift analysis (Apr 17-19 cohort):");
  for (const [k, v] of Object.entries(((drift as any).rows ?? drift)[0])) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
