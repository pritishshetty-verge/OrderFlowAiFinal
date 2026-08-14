import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
(async () => {
  const r: any = await db.execute(sql`
    SELECT id, shopify_order_id, shopify_order_number, customer_name, customer_phone, payment_method,
           shipping_city, shipping_state, shipping_pincode
    FROM orders
    WHERE store_id = '3f550942-9bb4-4ec1-b8ed-3a11803acd3e'
      AND shopify_order_id IS NOT NULL
      AND LOWER(COALESCE(payment_method,'')) NOT LIKE '%cod%'
      AND status <> 'cancelled'
    ORDER BY processed_at DESC LIMIT 1`);
  console.log(JSON.stringify((r.rows ?? r)[0], null, 2));
  process.exit(0);
})();
