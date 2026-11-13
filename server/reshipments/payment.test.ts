import test from "node:test";
import assert from "node:assert/strict";
import { isCodOrder } from "@shared/payment";

// The reshipment payment type must agree with the Orders page badge:
// COD when the gateway name says "cod" OR the order is still unpaid.

test("gateway names that say COD are COD regardless of status", () => {
  assert.equal(isCodOrder("Cash on Delivery (COD)", "pending"), true);
  assert.equal(isCodOrder("cod", null), true);
  assert.equal(isCodOrder("Razorpay - COD", "paid"), true); // COD later marked paid on delivery
});

test("unpaid orders with no/unknown gateway are COD (the 18656 bug)", () => {
  assert.equal(isCodOrder("Unknown", "pending"), true);
  assert.equal(isCodOrder(null, "pending"), true);
  assert.equal(isCodOrder("", " PENDING "), true);
  assert.equal(isCodOrder("gokwik", "pending"), true);
});

test("paid prepaid gateways stay prepaid", () => {
  assert.equal(isCodOrder("PayU", "paid"), false);
  assert.equal(isCodOrder("manual (PayU)", "paid"), false);
  assert.equal(isCodOrder("manual (Cards, UPI, NB by PayU India)", "paid"), false);
  assert.equal(isCodOrder("Unknown", "paid"), false);
});

test("anything else defaults to prepaid, matching the badge", () => {
  assert.equal(isCodOrder(null, null), false);
  assert.equal(isCodOrder("PayU", "partially_paid"), false);
  assert.equal(isCodOrder("PayU", "refunded"), false);
});
