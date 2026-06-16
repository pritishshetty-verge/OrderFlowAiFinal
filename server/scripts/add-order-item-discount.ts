import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Add per-line-item discount to order_items so refunds can subtract
// promotional discounts (free gifts contribute ₹0). Idempotent.

async function main() {
  console.log("Adding order_items.total_discount…");

  await db.execute(sql`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS total_discount DECIMAL(12,2) DEFAULT '0'
  `);

  console.log("Done. order_items.total_discount ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
