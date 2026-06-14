import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating catalog_products table...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS catalog_products (
      id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id      VARCHAR REFERENCES stores(id),
      shopify_product_id TEXT NOT NULL,
      title         TEXT NOT NULL,
      image_url     TEXT,
      status        TEXT NOT NULL DEFAULT 'active',
      total_inventory INTEGER NOT NULL DEFAULT 0,
      price         TEXT,
      product_type  TEXT,
      vendor        TEXT,
      variant_count INTEGER NOT NULL DEFAULT 1,
      last_synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT catalog_products_store_shopify_product_id_key
        UNIQUE (store_id, shopify_product_id)
    )
  `);

  console.log("Done. catalog_products table is ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
