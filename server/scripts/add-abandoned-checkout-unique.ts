import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Add a UNIQUE index on abandoned_checkouts.external_id so the Shiprocket Faster
// webhook can UPSERT by cart_id (one row per cart, stage advances over time).
// Idempotent. The table is currently empty so no dedup is required; the guard
// below keeps it safe to re-run even if rows are added later.

async function main() {
  console.log("Adding unique index on abandoned_checkouts.external_id…");

  // Safety: if duplicate external_ids ever exist, keep the newest row per id.
  const dups = await db.execute(sql`
    SELECT external_id, COUNT(*)::int AS n FROM abandoned_checkouts
    WHERE external_id IS NOT NULL GROUP BY external_id HAVING COUNT(*) > 1`);
  const dupRows = (dups as any).rows ?? dups;
  if (dupRows.length > 0) {
    console.log(`Found ${dupRows.length} duplicate external_id group(s) — keeping newest row each.`);
    await db.execute(sql`
      DELETE FROM abandoned_checkouts a
      USING abandoned_checkouts b
      WHERE a.external_id = b.external_id
        AND a.external_id IS NOT NULL
        AND a.id < b.id`);
  }

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS abandoned_checkouts_external_id_key
      ON abandoned_checkouts (external_id)`);

  console.log("Done. abandoned_checkouts.external_id is now unique.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
