// One rule for "is this order cash-on-delivery?", shared by server and client.
//
// `orders.payment_method` is Shopify's first payment gateway name, and
// checkout apps don't always put "cod" in it — when Shopify sends no gateway
// at all it's stored as "Unknown". So the gateway name alone misses real COD
// orders. An order whose Shopify financial_status is still "pending" has had
// nothing paid yet, which for this business means cash on delivery.
//
// This matches the Orders page badge (client/src/components/payment-badge.tsx),
// so a reshipment always agrees with the COD/Prepaid label the team sees.

export function isCodOrder(
  paymentMethod: string | null | undefined,
  financialStatus: string | null | undefined,
): boolean {
  if ((paymentMethod ?? "").toLowerCase().includes("cod")) return true;
  return (financialStatus ?? "").trim().toLowerCase() === "pending";
}
