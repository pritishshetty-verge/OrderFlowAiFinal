import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
(async () => {
  const r: any = await db.execute(sql`
    SELECT id, store_id, shopify_order_id, shopify_order_number, customer_name, customer_phone,
           payment_method, shipping_address_line1, shipping_city, shipping_state, shipping_pincode
    FROM orders WHERE shopify_order_id IS NOT NULL AND status <> 'cancelled' ORDER BY processed_at DESC LIMIT 1`);
  console.log(JSON.stringify((r.rows ?? r)[0], null, 2));
  const u: any = await db.execute(sql`SELECT id FROM users WHERE role='admin' AND is_active=TRUE LIMIT 1`);
  console.log("ADMIN_ID:", (u.rows ?? u)[0]?.id);
  process.exit(0);
})();
