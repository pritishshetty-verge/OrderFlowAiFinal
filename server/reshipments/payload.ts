// ─────────────────────────────────────────────────────────────────────
// Build the Shopify "create order" payload for a reshipment.
//
// Pure function — no I/O, unit-testable. The runtime layer
// (server/reshipments/create.ts) fetches the original from Shopify,
// calls this to build the payload, and POSTs it.
//
// Financial logic (the whole reason this file exists):
//
//   COD reshipment  → cart value stays intact, financial_status=pending,
//                     gateway carries the original COD label → courier
//                     picks up the parcel and collects cash on delivery.
//
//   Prepaid reshipment → we do NOT want the customer paying twice, and
//                        we do NOT want double-counted revenue in
//                        Shopify's own reports. Apply a 100% order-level
//                        discount so total = ₹0, mark financial_status
//                        paid, attach a $0 gateway transaction with the
//                        original gateway label so nothing else in the
//                        store's stack thinks a new payment is due.
//
// Shopify quirk: `payment_gateway_names` on Order is read-only on
// create. The way to force the gateway on a new order is via the
// `transactions[].gateway` field, which we set below. The read model
// will surface the transaction's gateway back out under
// `payment_gateway_names`, so downstream code that reads that field
// sees exactly the original label.
// ─────────────────────────────────────────────────────────────────────

/** The subset of the original Shopify order we need to build a reshipment. */
export interface ShopifyOrderForReshipment {
  id: string | number;
  name: string; // e.g. "#1234"
  currency?: string;
  total_price?: string | number;
  payment_gateway_names?: string[];
  line_items: Array<{
    variant_id?: string | number | null;
    product_id?: string | number | null;
    title?: string;
    name?: string;
    quantity: number;
    price: string | number;
    sku?: string | null;
    taxable?: boolean;
    requires_shipping?: boolean;
    properties?: Array<{ name: string; value: string }>;
  }>;
}

export interface ReshipmentShippingAddress {
  first_name?: string;
  last_name?: string;
  address1: string;
  address2?: string;
  city?: string;
  province?: string;
  province_code?: string;
  country?: string;
  country_code?: string;
  zip: string;
  phone?: string;
  name?: string;
}

export interface BuildReshipmentPayloadArgs {
  original: ShopifyOrderForReshipment;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress: ReshipmentShippingAddress;
  reason: string;
  urgency: "instant" | "scheduled";
  scheduledDate?: string | null; // YYYY-MM-DD
  internalNotes?: string | null;
  paymentType: "cod" | "prepaid";
}

/** The exact JSON body we POST to Shopify. Typed loosely because
 *  Shopify's Order create payload has ~40 optional fields and the
 *  official REST types don't ship in a lightweight form. */
export type ShopifyCreateOrderBody = {
  order: Record<string, unknown>;
};

/** Round to paise the way the ledger engine does — Shopify strings
 *  compare exactly, so any float drift causes a validation error. */
const money = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

export function buildReshipmentPayload(args: BuildReshipmentPayloadArgs): ShopifyCreateOrderBody {
  const isCOD = args.paymentType === "cod";

  // Line items: exact clone (variant + qty + price). Price is preserved
  // so we can see the "would-be" order value; the 100% discount below
  // is what zeroes out the payable total for prepaid.
  const line_items = args.original.line_items.map((li) => ({
    variant_id: li.variant_id ?? undefined,
    quantity: li.quantity,
    // Preserving `price` keeps subtotal_price visible in the merchant's
    // dashboard, matching the original's line values. Shopify expects a
    // string with 2 decimals; normalise defensively.
    price: money(Number(li.price ?? 0)),
    // Passthrough — Shopify uses these for variant fallback if the
    // variant has since been archived.
    title: li.title ?? li.name,
    sku: li.sku ?? undefined,
    taxable: li.taxable,
    requires_shipping: li.requires_shipping,
  }));

  const subtotal = args.original.line_items.reduce(
    (s, li) => s + Number(li.price ?? 0) * (li.quantity ?? 0),
    0,
  );

  const originalGateway = args.original.payment_gateway_names?.[0] ?? (isCOD ? "COD" : "manual");

  // Tags — always attach the linkage back to the original so downstream
  // systems (and this app's own webhook handler) can identify a
  // reshipment without a DB round-trip.
  const tags = ["Reshipment", `Original:${args.original.name}`];
  if (args.urgency === "scheduled" && args.scheduledDate) {
    tags.push(`Hold_Until_${args.scheduledDate}`);
  }
  tags.push(`Reason:${args.reason}`);

  // Base order body common to both flows.
  const body: Record<string, unknown> = {
    // `name` — Shopify overwrites this on most plans; we still set it
    // so the intent is explicit, and stores that DO allow custom names
    // (Shopify Plus) end up with the correct "#1234R" naming.
    name: `${args.original.name}R`,
    currency: args.original.currency ?? "INR",
    line_items,
    tags: tags.join(", "),
    note: `Reshipment of ${args.original.name}. Reason: ${args.reason}.${
      args.internalNotes ? " " + args.internalNotes : ""
    }`,
    note_attributes: [
      { name: "reshipment_of", value: String(args.original.id) },
      { name: "reshipment_of_name", value: args.original.name },
      { name: "reshipment_reason", value: args.reason },
      { name: "reshipment_urgency", value: args.urgency },
      ...(args.scheduledDate ? [{ name: "reshipment_scheduled_date", value: args.scheduledDate }] : []),
    ],
    shipping_address: {
      ...args.shippingAddress,
      country: args.shippingAddress.country ?? "India",
      country_code: args.shippingAddress.country_code ?? "IN",
      phone: args.customerPhone,
      first_name: args.shippingAddress.first_name ?? args.customerName.split(" ")[0],
      last_name: args.shippingAddress.last_name ?? args.customerName.split(" ").slice(1).join(" "),
      name: args.shippingAddress.name ?? args.customerName,
    },
    billing_address: {
      ...args.shippingAddress,
      country: args.shippingAddress.country ?? "India",
      country_code: args.shippingAddress.country_code ?? "IN",
      phone: args.customerPhone,
      first_name: args.shippingAddress.first_name ?? args.customerName.split(" ")[0],
      last_name: args.shippingAddress.last_name ?? args.customerName.split(" ").slice(1).join(" "),
      name: args.shippingAddress.name ?? args.customerName,
    },
    customer: {
      first_name: args.customerName.split(" ")[0],
      last_name: args.customerName.split(" ").slice(1).join(" ") || undefined,
      phone: args.customerPhone,
      email: args.customerEmail,
    },
    // We create the order as "unfulfilled" so the merchant's normal
    // fulfillment flow (Delhivery hook in the app) generates the AWB.
    inventory_behaviour: "bypass", // don't decrement stock again
    send_receipt: false,
    send_fulfillment_receipt: false,
  };

  if (isCOD) {
    // COD → cart value intact, gateway = original COD label, financial_status
    // pending so Shopify shows "Payment pending" and the courier is expected
    // to collect on delivery.
    body.financial_status = "pending";
    body.transactions = [
      {
        kind: "sale",
        status: "pending",
        amount: money(subtotal),
        currency: args.original.currency ?? "INR",
        gateway: originalGateway,
      },
    ];
  } else {
    // Prepaid → 100% order-level discount zeroes the payable total;
    // financial_status paid with a $0 gateway transaction carrying the
    // original gateway label so no downstream system tries to charge
    // the customer again or double-count revenue.
    body.discount_codes = [
      {
        code: "RESHIPMENT_ALREADY_PAID",
        amount: money(subtotal),
        type: "fixed_amount",
      },
    ];
    body.total_discounts = money(subtotal);
    body.financial_status = "paid";
    body.transactions = [
      {
        kind: "sale",
        status: "success",
        amount: "0.00",
        currency: args.original.currency ?? "INR",
        gateway: originalGateway,
      },
    ];
  }

  return { order: body };
}
