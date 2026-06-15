import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Multi-tenant Delhivery migration:
//  • stores.delhivery_api_token       — encrypted per-store API token
//  • stores.delhivery_client_name     — per-store Delhivery client name
//  • shipments.shipping_label_url     — printable label / packing-slip URL
// Idempotent (ADD COLUMN IF NOT EXISTS) so it's safe to re-run.

async function main() {
  console.log("Adding multi-tenant Delhivery fields…");

  await db.execute(sql`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS delhivery_api_token   TEXT,
      ADD COLUMN IF NOT EXISTS delhivery_client_name TEXT
  `);

  await db.execute(sql`
    ALTER TABLE shipments
      ADD COLUMN IF NOT EXISTS shipping_label_url TEXT
  `);

  console.log("Done. stores.delhivery_api_token, stores.delhivery_client_name, shipments.shipping_label_url ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
