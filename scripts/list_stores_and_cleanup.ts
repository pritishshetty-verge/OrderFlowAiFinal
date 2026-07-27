import "dotenv/config";
import { db, pool } from "../server/db";
import { stores, pgSettlements } from "@shared/schema";
import { isNull } from "drizzle-orm";

async function main() {
  const all = await db
    .select({ id: stores.id, storeName: stores.storeName, storeUrl: stores.storeUrl })
    .from(stores);
  console.log("\nStores in dev branch:");
  for (const s of all) console.log(`  ${s.id}  ${s.storeName ?? "(unnamed)"}  ${s.storeUrl}`);

  const del = await db
    .delete(pgSettlements)
    .where(isNull(pgSettlements.storeId))
    .returning({ id: pgSettlements.id });
  console.log(`\nDeleted ${del.length} null-storeId test rows from pg_settlements\n`);

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
