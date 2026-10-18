import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { getShopifyClient } from "../shopify";
(async () => {
  const s: any = await db.execute(sql`SELECT id, store_name, store_url FROM stores ORDER BY created_at`);
  for (const store of s.rows ?? s) {
    const o: any = await db.execute(sql`
      SELECT shopify_order_id FROM orders WHERE store_id = ${store.id}
        AND shopify_order_id IS NOT NULL LIMIT 1`);
    const oid = (o.rows ?? o)[0]?.shopify_order_id;
    if (!oid) { console.log(`${store.store_name} (${store.store_url}) → no orders`); continue; }
    try {
      const c = await getShopifyClient(store.id);
      await c.fetchOrder(oid);
      console.log(`✅ ${store.store_name} (${store.store_url}) → Shopify API OK`);
    } catch (e: any) {
      console.log(`❌ ${store.store_name} (${store.store_url}) → ${e?.message ?? e}`);
    }
  }
  process.exit(0);
})();
