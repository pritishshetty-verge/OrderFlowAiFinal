import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding Shopify-native + ERP fields to catalog_products…");

  await db.execute(sql`
    ALTER TABLE catalog_products
      ADD COLUMN IF NOT EXISTS compare_at_price TEXT,
      ADD COLUMN IF NOT EXISTS sku              TEXT,
      ADD COLUMN IF NOT EXISTS barcode          TEXT,
      ADD COLUMN IF NOT EXISTS weight           DECIMAL(10,3),
      ADD COLUMN IF NOT EXISTS weight_unit      TEXT,
      ADD COLUMN IF NOT EXISTS cogs             DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS packaging_cost   DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS gst_rate         DECIMAL(5,2),
      ADD COLUMN IF NOT EXISTS hsn_code         TEXT,
      ADD COLUMN IF NOT EXISTS dimension_length DECIMAL(8,2),
      ADD COLUMN IF NOT EXISTS dimension_width  DECIMAL(8,2),
      ADD COLUMN IF NOT EXISTS dimension_height DECIMAL(8,2)
  `);

  console.log("Done. All 12 new columns added.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
