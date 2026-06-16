import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Returns & Store Credit (RMA) schema:
//  • returns       — one RMA per request, scoped by store_id, FK to orders
//  • return_items  — line-level items being returned, FK to order_items
// Idempotent (CREATE TABLE IF NOT EXISTS) so it's safe to re-run.

async function main() {
  console.log("Creating returns + return_items tables…");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS returns (
      id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id        VARCHAR REFERENCES stores(id),
      order_id        VARCHAR REFERENCES orders(id) ON DELETE CASCADE,
      rma_number      TEXT NOT NULL UNIQUE,
      status          TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
      return_reason   TEXT,
      customer_notes  TEXT,
      return_fee_paid BOOLEAN NOT NULL DEFAULT false,
      refund_amount   DECIMAL(12,2),
      refund_type     TEXT NOT NULL DEFAULT 'STORE_CREDIT',
      tracking_awb    TEXT,
      created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS return_items (
      id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      return_id     VARCHAR NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      order_item_id VARCHAR REFERENCES order_items(id),
      quantity      INTEGER NOT NULL DEFAULT 1,
      condition     TEXT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Helpful index for the store-scoped dashboard query.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS returns_store_id_idx ON returns(store_id)
  `);

  console.log("Done. returns + return_items ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
