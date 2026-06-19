import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Add recovery_status to abandoned_checkouts for the telecalling workflow
// (PENDING → CONTACTED → RECOVERED/LOST). Idempotent. Backfill existing rows so
// already-recovered carts reflect RECOVERED.

async function main() {
  console.log("Adding abandoned_checkouts.recovery_status…");

  await db.execute(sql`
    ALTER TABLE abandoned_checkouts
      ADD COLUMN IF NOT EXISTS recovery_status TEXT NOT NULL DEFAULT 'PENDING'`);

  const res: any = await db.execute(sql`
    UPDATE abandoned_checkouts SET recovery_status = 'RECOVERED'
    WHERE is_recovered = true AND recovery_status = 'PENDING'`);
  console.log(`Backfilled ${res.rowCount ?? 0} already-recovered row(s) to RECOVERED.`);

  console.log("Done. abandoned_checkouts.recovery_status ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
