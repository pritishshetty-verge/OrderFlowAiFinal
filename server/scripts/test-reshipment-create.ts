import "dotenv/config";
import { createReshipment, ReshipmentError } from "../reshipments/service";

// Dry-run the FULL create path (fetch original → build payload →
// Shopify POST → DB insert) exactly as the route does, minus session
// auth. Set RESHIP_DRY=1 to stop before the Shopify write.
const STORE = "3f550942-9bb4-4ec1-b8ed-3a11803acd3e";
const ORDER = "9acbb99c-fbaa-4b71-883f-24fe64f9a3bc";
const ADMIN = "ed3baf77-171b-45e2-b53a-7435ccae8373";

(async () => {
  try {
    const row = await createReshipment({
      storeId: STORE,
      originalOrderId: ORDER,
      customerName: "navya bharathi",
      customerPhone: "+919121635633",
      shippingAddress: {
        first_name: "navya", last_name: "bharathi", name: "navya bharathi",
        phone: "+919121635633", address1: "b k singh towers", city: "Kurnool",
        province: "Andhra Pradesh", zip: "518002", country: "India", country_code: "IN",
      },
      reason: "customer_unavailable" as any,
      urgency: "instant" as any,
      createdBy: ADMIN,
    });
    console.log("SUCCESS — created:", JSON.stringify({
      id: row.id, newShopifyOrderId: row.newShopifyOrderId,
      newShopifyOrderName: row.newShopifyOrderName, paymentType: row.paymentType,
      courierStatus: row.courierStatus,
    }, null, 2));
  } catch (e: any) {
    console.log("FAILED:", e instanceof ReshipmentError ? `[${e.status}]` : "[unexpected]", e?.message ?? e);
    if (e?.stack) console.log(e.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(0);
})();
