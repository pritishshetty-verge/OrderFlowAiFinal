import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Data fix: the Glow & Me store's delhivery_client_name was "Verge Scales",
// which does not match the registered Delhivery facility. Reverse pickups send
// pickup_location.name = delhiveryClientName, so the mismatch made Delhivery
// unable to resolve the warehouse → "pickup pincode not serviceable".
// Set it to the EXACT registered facility name "Glow&Me". Idempotent.

const STORE_URL = "r7rsqd-z8.myshopify.com"; // Glow & Me
const CORRECT_NAME = "Glow&Me";

async function main() {
  const before = await db.execute(sql`
    SELECT store_name, store_url, delhivery_client_name
    FROM stores WHERE store_url = ${STORE_URL}`);
  console.log("BEFORE:");
  console.table((before as any).rows ?? before);

  const res: any = await db.execute(sql`
    UPDATE stores SET delhivery_client_name = ${CORRECT_NAME}, updated_at = NOW()
    WHERE store_url = ${STORE_URL} AND delhivery_client_name IS DISTINCT FROM ${CORRECT_NAME}`);
  console.log(`Rows updated: ${res.rowCount ?? 0}`);

  const after = await db.execute(sql`
    SELECT store_name, store_url, delhivery_client_name
    FROM stores WHERE store_url = ${STORE_URL}`);
  console.log("AFTER:");
  console.table((after as any).rows ?? after);

  process.exit(0);
}

main().catch((err) => {
  console.error("Data fix failed:", err);
  process.exit(1);
});
