/**
 * Run the matcher against our 53 ingested test rows.
 * Expect: 53 scanned, ~53 matched (all settled, since fee structure
 * happens to align with PayU's contracted rate).
 */
import "dotenv/config";
import { matchPendingSettlements, getOverdueOrders } from "../server/recon/matcher";
import { pool } from "../server/db";

const GLOW_AND_ME = "3f550942-9bb4-4ec1-b8ed-3a11803acd3e";

async function main() {
  console.log("\n=== Running matcher on Glow & Me ===");
  const t0 = Date.now();
  const result = await matchPendingSettlements({ storeId: GLOW_AND_ME });
  const t1 = Date.now();
  console.log(`  scanned ${result.scanned} rows in ${t1 - t0}ms`);
  console.log(`  matched: ${result.matched}`);
  console.log(`    → settled:  ${result.classified.settled}`);
  console.log(`    → mismatch: ${result.classified.mismatch}`);
  console.log(`  orphan: ${result.orphan}`);
  if (result.errors.length > 0) {
    console.log(`  errors (${result.errors.length}):`);
    for (const e of result.errors.slice(0, 5)) {
      console.log(`    ${e.pgPaymentId}: ${e.reason}`);
    }
  }

  console.log("\n=== Running overdue query ===");
  const t2 = Date.now();
  const overdue = await getOverdueOrders({
    storeId: GLOW_AND_ME,
    graceDays: 3,
    limit: 10,
  });
  const t3 = Date.now();
  console.log(`  found ${overdue.length} overdue orders (showing top 10 by age) in ${t3 - t2}ms`);
  for (const o of overdue) {
    const masked =
      o.customerEmail?.slice(0, 3) +
      "***" +
      (o.customerEmail?.includes("@") ? "@" + o.customerEmail.split("@")[1] : "");
    console.log(
      `    #${o.shopifyOrderNumber}  ${masked.padEnd(28)}  ₹${o.totalPrice}  ${o.ageDays}d old  PayU=${o.payUTxnId}`,
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
