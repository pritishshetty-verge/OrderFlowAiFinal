import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Add a first-class per-item return reason column to return_items.
// Idempotent (ADD COLUMN IF NOT EXISTS) so it's safe to re-run.

async function main() {
  console.log("Adding return_items.return_reason…");

  await db.execute(sql`
    ALTER TABLE return_items
      ADD COLUMN IF NOT EXISTS return_reason TEXT
  `);

  console.log("Done. return_items.return_reason ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
