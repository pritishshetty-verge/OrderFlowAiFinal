import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Add the PayU gateway transaction id to returns. Idempotent.

async function main() {
  console.log("Adding returns.payu_transaction_id…");

  await db.execute(sql`
    ALTER TABLE returns
      ADD COLUMN IF NOT EXISTS payu_transaction_id TEXT
  `);

  console.log("Done. returns.payu_transaction_id ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
