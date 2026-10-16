import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReshipmentPayload, type BuildReshipmentPayloadArgs } from "./payload";

const baseArgs = (overrides: Partial<BuildReshipmentPayloadArgs> = {}): BuildReshipmentPayloadArgs => ({
  original: {
    id: 987654321,
    name: "#1234",
    currency: "INR",
    payment_gateway_names: ["Cash on Delivery (COD)"],
    line_items: [
      { variant_id: 111, title: "Serum A", quantity: 1, price: "699.00" },
      { variant_id: 222, title: "Serum B", quantity: 2, price: "349.50" },
    ],
    ...overrides.original,
  },
  customerName: "Priya Nair",
  customerPhone: "+919812345678",
  shippingAddress: {
    address1: "12 Sunrise Apts",
    address2: "MG Road",
    city: "Bengaluru",
    province: "Karnataka",
    zip: "560001",
    phone: "+919812345678",
  },
  reason: "customer_unavailable",
  urgency: "instant",
  paymentType: "cod",
  ...overrides,
});

test("COD: cart value intact, financial_status pending, gateway = original COD label", () => {
  const p = buildReshipmentPayload(baseArgs()).order;

  // Subtotal: 699 + 2×349.50 = 1398.00
  assert.equal(p.financial_status, "pending");
  const txns = p.transactions as any[];
  assert.equal(txns.length, 1);
  assert.equal(txns[0].amount, "1398.00");
  assert.equal(txns[0].status, "pending");
  assert.equal(txns[0].gateway, "Cash on Delivery (COD)");
  assert.equal(p.discount_codes, undefined, "COD must not carry a discount");
  assert.equal(p.total_discounts, undefined);

  // Line items exact-clone
  const li = p.line_items as any[];
  assert.equal(li.length, 2);
  assert.equal(li[0].variant_id, 111);
  assert.equal(li[0].quantity, 1);
  assert.equal(li[0].price, "699.00");
  assert.equal(li[1].quantity, 2);
});

test("Prepaid: retains real value, marked paid with a SUCCESS txn (not ₹0)", () => {
  const p = buildReshipmentPayload(
    baseArgs({
      paymentType: "prepaid",
      original: {
        id: 42,
        name: "#7777",
        currency: "INR",
        payment_gateway_names: ["Razorpay"],
        line_items: [{ variant_id: 999, title: "Cream", quantity: 1, price: "1200.00" }],
      },
    }),
  ).order;

  // No discount on the original → no zero-out, full value retained.
  assert.equal(p.financial_status, "paid");
  assert.equal(p.discount_codes, undefined, "no discount on original → none applied");
  const txns = p.transactions as any[];
  assert.equal(txns.length, 1, "prepaid records a settled transaction for the real value");
  assert.equal(txns[0].kind, "sale");
  assert.equal(txns[0].status, "success", "prepaid txn is settled, not pending");
  assert.equal(txns[0].amount, "1200.00", "retains the full order value — NOT ₹0");
  assert.equal(txns[0].gateway, "Razorpay");
});

test("Prepaid with a discount (TARA10): keeps the discount, pays the discounted value", () => {
  const p = buildReshipmentPayload(
    baseArgs({
      paymentType: "prepaid",
      original: {
        id: 43,
        name: "#7778",
        currency: "INR",
        payment_gateway_names: ["Razorpay"],
        total_price: "1080.00",
        total_discounts: "120.00",
        discount_codes: [{ code: "TARA10", amount: "120.00", type: "fixed_amount" }],
        line_items: [{ variant_id: 1, title: "Serum", quantity: 1, price: "1200.00" }],
      },
    }),
  ).order;

  assert.equal(p.financial_status, "paid");
  const disc = p.discount_codes as any[];
  assert.equal(disc.length, 1);
  assert.equal(disc[0].code, "TARA10");
  assert.equal(disc[0].amount, "120.00");
  assert.equal(p.total_discounts, "120.00");
  const txns = p.transactions as any[];
  assert.equal(txns.length, 1);
  assert.equal(txns[0].status, "success");
  // subtotal 1200 − discount 120 = 1080, the original discounted value.
  assert.equal(txns[0].amount, "1080.00");
});

test("Reshipment of a legacy ₹0 prepaid reshipment is NOT free (safety net)", () => {
  // A chained reshipment: the parent was a legacy ₹0 prepaid reshipment
  // whose discount_codes zeroed the whole subtotal and total_price = 0.
  // The new COD reshipment must still collect the real cart value.
  const p = buildReshipmentPayload(
    baseArgs({
      paymentType: "cod",
      original: {
        id: 44,
        name: "#7779R",
        currency: "INR",
        total_price: "0.00",
        total_discounts: "999.00",
        discount_codes: [{ code: "RESHIPMENT_ALREADY_PAID", amount: "999.00", type: "fixed_amount" }],
        line_items: [{ variant_id: 1, title: "Mask", quantity: 1, price: "999.00" }],
      },
    }),
  ).order;

  assert.equal(p.financial_status, "pending");
  // The self-cancelling discount is dropped so the order isn't ₹0.
  assert.equal(p.discount_codes, undefined, "self-cancelling discount dropped");
  const txns = p.transactions as any[];
  assert.equal(txns.length, 1, "must collect COD, not deliver free");
  assert.equal(txns[0].status, "pending");
  assert.equal(txns[0].amount, "999.00");
});

test("Tags: always Reshipment + Original:<name>; scheduled adds Hold_Until_<date>", () => {
  const instantTags = String(buildReshipmentPayload(baseArgs()).order.tags).split(", ");
  assert.ok(instantTags.includes("Reshipment"));
  assert.ok(instantTags.includes("Original:#1234"));
  assert.ok(!instantTags.some((t) => t.startsWith("Hold_Until_")));

  const scheduledTags = String(
    buildReshipmentPayload(baseArgs({ urgency: "scheduled", scheduledDate: "2026-08-15" })).order.tags,
  ).split(", ");
  assert.ok(scheduledTags.includes("Hold_Until_2026-08-15"));
});

test("Name is suffixed with R for Shopify Plus support (falls back safely on non-Plus)", () => {
  const p = buildReshipmentPayload(baseArgs()).order;
  assert.equal(p.name, "#1234R");
});

test("note_attributes carry the reshipment linkage in a queryable form", () => {
  const p = buildReshipmentPayload(
    baseArgs({ urgency: "scheduled", scheduledDate: "2026-09-01" }),
  ).order;
  const attrs = p.note_attributes as Array<{ name: string; value: string }>;
  const map = Object.fromEntries(attrs.map((a) => [a.name, a.value]));
  assert.equal(map.reshipment_of, "987654321");
  assert.equal(map.reshipment_of_name, "#1234");
  assert.equal(map.reshipment_reason, "customer_unavailable");
  assert.equal(map.reshipment_urgency, "scheduled");
  assert.equal(map.reshipment_scheduled_date, "2026-09-01");
});

test("shipping address: operator-edited pincode + phone override the original's contact", () => {
  const p = buildReshipmentPayload(
    baseArgs({
      customerPhone: "+919000000000",
      shippingAddress: {
        address1: "New address",
        city: "Mumbai",
        zip: "400001",
        phone: "+919000000000",
      },
    }),
  ).order;
  const ship = p.shipping_address as any;
  assert.equal(ship.zip, "400001");
  assert.equal(ship.phone, "+919000000000");
  assert.equal(ship.country, "India");
  assert.equal(ship.country_code, "IN");
});

test("Missing payment_gateway_names on the original falls back to a sane default per payment_type", () => {
  const cod = buildReshipmentPayload(
    baseArgs({ original: { id: 1, name: "#1", line_items: [{ quantity: 1, price: "10" }] } }),
  ).order;
  assert.equal((cod.transactions as any[])[0].gateway, "COD");

  // Prepaid now records a settled txn for the real value; with no
  // original gateway it falls back to "manual".
  const prepaid = buildReshipmentPayload(
    baseArgs({
      paymentType: "prepaid",
      original: { id: 2, name: "#2", line_items: [{ quantity: 1, price: "10" }] },
    }),
  ).order;
  const pTxns = prepaid.transactions as any[];
  assert.equal(pTxns.length, 1);
  assert.equal(pTxns[0].status, "success");
  assert.equal(pTxns[0].amount, "10.00");
  assert.equal(pTxns[0].gateway, "manual");
  assert.equal(prepaid.financial_status, "paid");
});

test("zero-value COD order sends no transaction (Shopify rejects amount 0)", () => {
  const p = buildReshipmentPayload(
    baseArgs({ original: { id: 3, name: "#3", line_items: [{ quantity: 1, price: "0" }] } }),
  ).order;
  assert.equal(p.transactions, undefined);
  assert.equal(p.financial_status, "pending");
});

test("inventory_behaviour=bypass so reshipment doesn't decrement stock again", () => {
  const p = buildReshipmentPayload(baseArgs()).order;
  assert.equal(p.inventory_behaviour, "bypass");
  assert.equal(p.send_receipt, false);
});

test("customer: parent's customer.id → link-by-id (no phone/email create block)", () => {
  const p = buildReshipmentPayload(
    baseArgs({
      original: {
        id: 1,
        name: "#1",
        currency: "INR",
        customer: { id: 5551234567890 },
        line_items: [{ quantity: 1, price: "100.00" }],
      },
    }),
  ).order;
  const cust = p.customer as any;
  assert.deepEqual(cust, { id: 5551234567890 });
  // Critical: the create-new-customer fields must NOT appear when we
  // have an id — that's exactly what triggers Shopify's phone-uniqueness 422.
  assert.equal(cust.phone, undefined);
  assert.equal(cust.email, undefined);
  assert.equal(cust.first_name, undefined);
});

test("customer: no parent id → fall back to create-new-customer shape", () => {
  const p = buildReshipmentPayload(
    baseArgs({
      customerEmail: "priya@example.com",
      original: {
        id: 1,
        name: "#1",
        currency: "INR",
        line_items: [{ quantity: 1, price: "100.00" }],
      },
    }),
  ).order;
  const cust = p.customer as any;
  assert.equal(cust.first_name, "Priya");
  assert.equal(cust.last_name, "Nair");
  assert.equal(cust.phone, "+919812345678");
  assert.equal(cust.email, "priya@example.com");
  assert.equal(cust.id, undefined);
});
