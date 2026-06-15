import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Per-store Resend (email) credentials:
//  • stores.resend_api_key    — encrypted Resend API key
//  • stores.resend_from_email — verified "from" address
// Idempotent (ADD COLUMN IF NOT EXISTS) so it's safe to re-run.

async function main() {
  console.log("Adding per-store Resend fields…");

  await db.execute(sql`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS resend_api_key    TEXT,
      ADD COLUMN IF NOT EXISTS resend_from_email TEXT
  `);

  console.log("Done. stores.resend_api_key, stores.resend_from_email ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
