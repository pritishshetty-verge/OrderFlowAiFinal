import { test } from "node:test";
import assert from "node:assert/strict";
import type { Order, Shipment, OrderStatusHistory, OrderItem } from "@shared/schema";
import { buildTrackingView } from "./trackingView";

const makeOrder = (over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    status: "confirmed",
    shopifyOrderNumber: "7788",
    shopifyCreatedAt: new Date("2026-10-10T10:00:00Z"),
    customerName: "Jane Secret",
    customerEmail: "jane@secret.com",
    customerPhone: "+91 99999 11111",
    shippingAddressLine1: "42 Secret Lane",
    shippingCity: "Hiddentown",
    trackingNumber: null,
    courierName: null,
    trackingUrl: null,
    storeId: "store-1",
    ...over,
  }) as unknown as Order;

const makeShipment = (over: Partial<Shipment> = {}): Shipment =>
  ({ awb: null, courierName: null, trackingUrl: null, statusUpdatedAt: null, estimatedDeliveryDate: null, pickedUpAt: null, deliveredAt: null, ...over }) as unknown as Shipment;

const makeHist = (status: string, createdAt: Date): OrderStatusHistory =>
  ({ status, createdAt }) as unknown as OrderStatusHistory;

const makeItem = (over: Partial<OrderItem> = {}): OrderItem =>
  ({ productName: "Glow Serum", variantTitle: null, quantity: 1, imageUrl: null, ...over }) as unknown as OrderItem;

const base = (order: Order, extra: Partial<Parameters<typeof buildTrackingView>[0]> = {}) =>
  buildTrackingView({ order, shipment: null, history: [], items: [], includeOrderDetails: true, ...extra });

// ── every status mapping ─────────────────────────────────────────────────────
const MAP: [string, string][] = [
  ["pending", "ORDER_CONFIRMED"],
  ["assigned", "ORDER_CONFIRMED"],
  ["confirmed", "ORDER_CONFIRMED"],
  ["unfulfilled", "ORDER_CONFIRMED"],
  ["awb_assigned", "PACKED"],
  ["ready_for_pickup", "PACKED"],
  ["picked_up", "PICKED_UP"],
  ["in_transit", "IN_TRANSIT"],
  ["out_for_delivery", "OUT_FOR_DELIVERY"],
  ["delivered", "DELIVERED"],
  ["ndr", "delivery_attempt_failed"],
  ["rto_initiated", "returning"],
  ["rto_ofd", "returning"],
  ["rto_delivered", "returned"],
  ["lost", "lost"],
  ["cancelled", "cancelled"],
];
for (const [status, expected] of MAP) {
  test(`status "${status}" maps to ${expected}`, () => {
    assert.equal(base(makeOrder({ status })).status, expected);
  });
}

test("unknown status falls back to ORDER_CONFIRMED (no AWB) or PACKED (with AWB)", () => {
  assert.equal(base(makeOrder({ status: "something_new" })).status, "ORDER_CONFIRMED");
  assert.equal(base(makeOrder({ status: "something_new", trackingNumber: "AWB12345678" })).status, "PACKED");
});

// ── confirmed-only ───────────────────────────────────────────────────────────
test("confirmed-only: first step done+current, rest not done, dated by placedAt", () => {
  const v = base(makeOrder({ status: "confirmed" }));
  assert.equal(v.status, "ORDER_CONFIRMED");
  assert.equal(v.statusGroup, "in_progress");
  assert.equal(v.steps[0].done, true);
  assert.equal(v.steps[0].current, true);
  assert.equal(v.steps[1].done, false);
  assert.equal(v.steps[0].at, v.placedAt);
});

// ── in transit with dated steps + Delhivery link ─────────────────────────────
test("in transit: steps dated from history, Delhivery tracking link", () => {
  const picked = new Date("2026-10-11T09:00:00Z");
  const transit = new Date("2026-10-12T08:00:00Z");
  const v = buildTrackingView({
    order: makeOrder({ status: "in_transit", courierName: "Delhivery" }),
    shipment: makeShipment({ awb: "1234567890123" }),
    history: [makeHist("in_transit", transit), makeHist("picked_up", picked), makeHist("confirmed", new Date("2026-10-10T10:00:00Z"))],
    items: [],
    includeOrderDetails: true,
  });
  assert.equal(v.status, "IN_TRANSIT");
  assert.equal(v.trackingUrl, "https://www.delhivery.com/track-v2/package/1234567890123");
  const byKey = Object.fromEntries(v.steps.map((s) => [s.key, s]));
  assert.equal(byKey.IN_TRANSIT.current, true);
  assert.equal(byKey.IN_TRANSIT.done, true);
  assert.equal(byKey.PICKED_UP.at, picked.toISOString());
  assert.equal(byKey.IN_TRANSIT.at, transit.toISOString());
  assert.equal(byKey.OUT_FOR_DELIVERY.done, false);
  assert.equal(byKey.OUT_FOR_DELIVERY.at, null);
});

// ── pre-ship with AWB → PACKED ───────────────────────────────────────────────
test("pre-ship order carrying a tracking number shows PACKED", () => {
  assert.equal(base(makeOrder({ status: "confirmed", trackingNumber: "AWB123456" })).status, "PACKED");
});

// ── delivered ────────────────────────────────────────────────────────────────
test("delivered: group delivered, every step done, delivered date from shipment", () => {
  const v = buildTrackingView({
    order: makeOrder({ status: "delivered" }),
    shipment: makeShipment({ deliveredAt: new Date("2026-10-15T10:00:00Z") }),
    history: [],
    items: [],
    includeOrderDetails: true,
  });
  assert.equal(v.status, "DELIVERED");
  assert.equal(v.statusGroup, "delivered");
  assert.ok(v.steps.every((s) => s.done));
  const d = v.steps.find((s) => s.key === "DELIVERED")!;
  assert.equal(d.current, true);
  assert.equal(d.at, "2026-10-15T10:00:00.000Z");
  assert.equal(v.estimatedDelivery, null);
});

// ── ndr ──────────────────────────────────────────────────────────────────────
test("ndr: attention, a message, no current step, OUT_FOR_DELIVERY reached", () => {
  const v = base(makeOrder({ status: "ndr" }));
  assert.equal(v.status, "delivery_attempt_failed");
  assert.equal(v.statusGroup, "attention");
  assert.ok(v.message && v.message.length > 0);
  assert.ok(v.steps.every((s) => !s.current));
  assert.equal(v.steps.find((s) => s.key === "OUT_FOR_DELIVERY")!.done, true);
  assert.equal(v.steps.find((s) => s.key === "DELIVERED")!.done, false);
});

// ── AWB-only: no PII, number or items ────────────────────────────────────────
test("AWB-only view leaks no name, email, phone, address, order number or items", () => {
  const v = buildTrackingView({
    order: makeOrder({ status: "in_transit" }),
    shipment: makeShipment({ awb: "AWB990011223" }),
    history: [],
    items: [makeItem({ productName: "Secret Serum" })],
    includeOrderDetails: false,
  });
  assert.equal(v.orderNumber, null);
  assert.equal(v.placedAt, null);
  assert.deepEqual(v.items, []);
  const json = JSON.stringify(v);
  for (const leak of ["Jane Secret", "jane@secret.com", "99999", "Secret Lane", "Hiddentown", "Secret Serum", "#7788", "7788"]) {
    assert.ok(!json.includes(leak), `AWB-only view must not contain "${leak}"`);
  }
});

// ── verified: number + date + items, but no personal contact / address ───────
test("verified view includes number, placed date and items, but no contact or address", () => {
  const v = buildTrackingView({
    order: makeOrder({ status: "delivered" }),
    shipment: makeShipment({ deliveredAt: new Date("2026-10-15T10:00:00Z") }),
    history: [],
    items: [makeItem({ productName: "Glow Serum", variantTitle: "50ml", quantity: 2, imageUrl: "https://img/x.png" })],
    includeOrderDetails: true,
  });
  assert.equal(v.orderNumber, "#7788");
  assert.equal(v.placedAt, "2026-10-10T10:00:00.000Z");
  assert.equal(v.items.length, 1);
  assert.deepEqual(v.items[0], { name: "Glow Serum", variant: "50ml", quantity: 2, image: "https://img/x.png" });
  const json = JSON.stringify(v);
  for (const leak of ["Jane Secret", "jane@secret.com", "99999", "Secret Lane", "Hiddentown"]) {
    assert.ok(!json.includes(leak), `verified view must not contain "${leak}"`);
  }
});
