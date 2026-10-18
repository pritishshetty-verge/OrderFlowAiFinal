import "dotenv/config";
import { createReshipment, cancelReshipment, ReshipmentError } from "../reshipments/service";
import { db } from "../db";
import { sql } from "drizzle-orm";

const STORE = "3f550942-9bb4-4ec1-b8ed-3a11803acd3e";
const ADMIN = "ed3baf77-171b-45e2-b53a-7435ccae8373";
let fails = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok?"✅":"❌"} ${n}${d?` — ${d}`:""}`); if(!ok) fails++; };

(async () => {
  // Pick a delivered order so we know it can be reshipped (not the same one twice).
  const pick: any = await db.execute(sql`
    SELECT id FROM orders WHERE store_id = ${STORE}
      AND shopify_order_id IS NOT NULL AND status = 'delivered' AND processed_at > NOW() - INTERVAL '30 days'
      AND id NOT IN (SELECT original_order_id FROM reshipment_logs WHERE store_id = ${STORE})
    LIMIT 1`);
  const orderId = (pick.rows ?? pick)[0]?.id;
  if (!orderId) { console.log("no eligible order"); process.exit(1); }

  const row = await createReshipment({
    storeId: STORE,
    originalOrderId: orderId,
    customerName: "Cancel Test",
    customerPhone: "+919000000000",
    shippingAddress: { address1: "Test", city: "Bangalore", province: "Karnataka", zip: "560001", country: "India", country_code: "IN" } as any,
    reason: "other" as any,
    urgency: "instant" as any,
    createdBy: ADMIN,
    createdByName: "Cancel Test Admin",
  });
  check("created pending reshipment", row.courierStatus === "pending", `id=${row.id}, shopify=${row.newShopifyOrderName}`);

  const cancelled = await cancelReshipment(STORE, row.id, ADMIN);
  check("status is cancelled", cancelled.courierStatus === "cancelled");
  check("cancelledAt populated", !!cancelled.cancelledAt);
  check("cancelledBy populated", cancelled.cancelledBy === ADMIN);

  // Cancelling again must fail with 409.
  try {
    await cancelReshipment(STORE, row.id, ADMIN);
    check("re-cancel rejected", false, "second call unexpectedly succeeded");
  } catch (e: any) {
    check("re-cancel rejected", e instanceof ReshipmentError && e.status === 409, e?.message);
  }

  // Freeing the guard: a fresh reshipment for the same order should now work.
  const fresh = await createReshipment({
    storeId: STORE, originalOrderId: orderId, customerName: "Cancel Test 2",
    customerPhone: "+919000000000",
    shippingAddress: { address1: "T2", city: "Bangalore", province: "Karnataka", zip: "560001", country: "India", country_code: "IN" } as any,
    reason: "other" as any, urgency: "instant" as any, createdBy: ADMIN, createdByName: "Cancel Test Admin",
  });
  check("cancel frees the duplicate guard", fresh.courierStatus === "pending");

  // Clean up both test rows (Shopify orders are already cancelled/created and require manual review).
  await db.execute(sql`DELETE FROM reshipment_logs WHERE id IN (${row.id}, ${fresh.id})`);
  console.log(`\nTest orders on Shopify to REVIEW: ${row.newShopifyOrderName} (cancelled), ${fresh.newShopifyOrderName} (live)`);
  console.log(fails === 0 ? "AUDIT PASSED" : `AUDIT FAILED — ${fails}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
