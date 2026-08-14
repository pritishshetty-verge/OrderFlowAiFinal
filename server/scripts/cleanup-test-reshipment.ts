import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
(async () => {
  const r: any = await db.execute(sql`
    DELETE FROM reshipment_logs
    WHERE new_shopify_order_id IN ('7181957365938','7181999833266')
    RETURNING new_shopify_order_name`);
  console.log("Deleted test log rows:", JSON.stringify(r.rows ?? r));
  process.exit(0);
})();
