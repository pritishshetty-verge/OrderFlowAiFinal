import "dotenv/config";
import { createReshipment, ReshipmentError } from "../reshipments/service";
(async () => {
  try {
    const row = await createReshipment({
      storeId: "3f550942-9bb4-4ec1-b8ed-3a11803acd3e",
      originalOrderId: "ab4aec87-8244-4664-8669-33a57b1085a9",
      customerName: "Manju Teljeeru",
      customerPhone: "+919000576700",
      shippingAddress: {
        first_name: "Manju", last_name: "Teljeeru", name: "Manju Teljeeru",
        phone: "+919000576700", address1: "Test address", city: "Medak",
        province: "Telangana", zip: "502103", country: "India", country_code: "IN",
      },
      reason: "courier_error" as any,
      urgency: "instant" as any,
      createdBy: "ed3baf77-171b-45e2-b53a-7435ccae8373",
    });
    console.log("SUCCESS (prepaid):", JSON.stringify({
      id: row.id, newShopifyOrderId: row.newShopifyOrderId,
      newShopifyOrderName: row.newShopifyOrderName, paymentType: row.paymentType,
    }, null, 2));
  } catch (e: any) {
    console.log("FAILED:", e instanceof ReshipmentError ? `[${e.status}]` : "[unexpected]", e?.message ?? e);
  }
  process.exit(0);
})();
