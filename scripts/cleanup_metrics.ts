import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function cleanupMetrics() {
  console.log("🔧 Running Metrics Cleanup Script...\n");

  const result = await db.execute(sql`
    UPDATE orders
    SET assigned_to = NULL
    WHERE assigned_to IS NOT NULL
      AND financial_status = 'paid'
      AND (LOWER(payment_method) LIKE '%cod%' OR LOWER(payment_method) LIKE '%cash%')
      AND confirmed_at > (created_at + INTERVAL '5 days')
  `);

  const rowCount = result.rowCount || 0;
  console.log(`✅ SUCCESS: Fixed ${rowCount} fake orders.`);
}

cleanupMetrics()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error running cleanup script:", error);
    process.exit(1);
  });
