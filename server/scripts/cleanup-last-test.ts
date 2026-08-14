import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { getShopifyClient } from "../shopify";
(async () => {
  // The 2nd fresh test order left behind by test-cancel-flow. Only the
  // most recent one is live; cancel it too so nothing ships.
  const r: any = await db.execute(sql`
    SELECT new_shopify_order_id FROM orders o
    JOIN reshipment_logs rl ON rl.original_order_id = o.id
    WHERE rl.new_shopify_order_name = '#8234R' AND rl.courier_status <> 'cancelled'
    ORDER BY rl.created_at DESC LIMIT 1`);
  console.log("candidate:", (r.rows ?? r)[0]);
  // Just print the shopify ids the test left behind — cancellation is
  // manual from Shopify admin since we've already deleted the DB rows.
  process.exit(0);
})();
