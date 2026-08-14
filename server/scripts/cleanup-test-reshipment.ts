import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
(async () => {
  const r: any = await db.execute(sql`
    DELETE FROM reshipment_logs WHERE new_shopify_order_id = '7181957365938' RETURNING id, new_shopify_order_name`);
  console.log("Deleted test log rows:", (r.rows ?? r).length, JSON.stringify(r.rows ?? r));
  process.exit(0);
})();
