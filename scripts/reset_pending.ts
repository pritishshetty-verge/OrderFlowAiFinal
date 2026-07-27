import 'dotenv/config';
import { db, pool } from "../server/db";
import { pgSettlements } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const r = await db
    .update(pgSettlements)
    .set({ status: "pending", orderId: null, orderAmount: null })
    .where(eq(pgSettlements.pgName, "payu"))
    .returning({ id: pgSettlements.id });
  console.log("Reset " + r.length + " rows to pending");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
