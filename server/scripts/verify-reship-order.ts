import "dotenv/config";
import { getShopifyClient } from "../shopify";
(async () => {
  const c = await getShopifyClient("3f550942-9bb4-4ec1-b8ed-3a11803acd3e");
  for (const id of ["7181999833266", "7181957365938"]) {
    try {
      const r = await c.fetchOrder(id);
      const o = r?.order ?? r;
      console.log(JSON.stringify({
        name: o.name, financial_status: o.financial_status,
        total_price: o.total_price, subtotal_price: o.subtotal_price,
        total_discounts: o.total_discounts, tags: o.tags,
        gateway: o.payment_gateway_names,
      }, null, 2));
    } catch (e: any) { console.log(id, "→", e?.message); }
  }
  process.exit(0);
})();
