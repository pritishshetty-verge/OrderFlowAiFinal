import { test } from "node:test";
import assert from "node:assert/strict";
import type { Order } from "@shared/schema";
import {
  normalizeOrderNumber,
  normalizeAwb,
  contactMatchesOrder,
  findVerifiedOrder,
} from "./publicOrderLookup";

const makeOrder = (over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    customerEmail: "jane@example.com",
    customerPhone: "+91 98765 43210",
    ...over,
  }) as unknown as Order;

function fakeStorage(byNumber: Record<string, Order>) {
  const calls: string[] = [];
  return {
    calls,
    async getOrderByShopifyOrderNumber(num: string): Promise<Order | undefined> {
      calls.push(num);
      return byNumber[num];
    },
  };
}

// ── normalisers ──────────────────────────────────────────────────────────────
test("normalizeOrderNumber trims and strips one leading #", () => {
  assert.equal(normalizeOrderNumber("  #1234 "), "1234");
  assert.equal(normalizeOrderNumber("1234"), "1234");
  assert.equal(normalizeOrderNumber(undefined), "");
});

test("normalizeAwb cleans, upper-cases and validates length/charset", () => {
  assert.equal(normalizeAwb(" 1234-5678-90 "), "1234567890");
  assert.equal(normalizeAwb("abcd1234ef"), "ABCD1234EF");
  assert.equal(normalizeAwb("short"), null); // < 8 chars
  assert.equal(normalizeAwb("has@symbol99"), null); // @ is not stripped
  assert.equal(normalizeAwb("A".repeat(26)), null); // > 25 chars
});

// ── contact matching ─────────────────────────────────────────────────────────
test("contactMatchesOrder: email matches exactly, case-insensitive", () => {
  const o = makeOrder();
  assert.equal(contactMatchesOrder(o, "JANE@Example.com"), true);
  assert.equal(contactMatchesOrder(o, "someone@else.com"), false);
});

test("contactMatchesOrder: phone matches on last 10 digits, needs >= 6 both sides", () => {
  const o = makeOrder({ customerPhone: "+91 98765 43210" });
  assert.equal(contactMatchesOrder(o, "9876543210"), true);
  assert.equal(contactMatchesOrder(o, "098765-43210"), true);
  assert.equal(contactMatchesOrder(o, "1234567890"), false); // different number
  assert.equal(contactMatchesOrder(o, "12345"), false); // < 6 digits
  assert.equal(contactMatchesOrder({ customerEmail: null, customerPhone: "12345" } as any, "123456"), false);
});

// ── findVerifiedOrder ────────────────────────────────────────────────────────
test("findVerifiedOrder returns the order on a matching contact", async () => {
  const order = makeOrder();
  const s = fakeStorage({ "1234": order });
  assert.equal(await findVerifiedOrder(s, { orderNumber: "#1234", contact: "jane@example.com" }), order);
});

test("findVerifiedOrder returns null on a wrong contact (indistinguishable from unknown)", async () => {
  const s = fakeStorage({ "1234": makeOrder() });
  assert.equal(await findVerifiedOrder(s, { orderNumber: "1234", contact: "wrong@x.com" }), null);
});

test("findVerifiedOrder returns null for an unknown order", async () => {
  const s = fakeStorage({});
  assert.equal(await findVerifiedOrder(s, { orderNumber: "9999", contact: "jane@example.com" }), null);
});

test("findVerifiedOrder never queries when the contact is empty", async () => {
  const s = fakeStorage({ "1234": makeOrder() });
  assert.equal(await findVerifiedOrder(s, { orderNumber: "1234", contact: "   " }), null);
  assert.equal(s.calls.length, 0);
});

test("findVerifiedOrder tries the bare number then the #-prefixed variant", async () => {
  const order = makeOrder();
  const s = fakeStorage({ "#1234": order }); // only the #-prefixed is stored
  assert.equal(await findVerifiedOrder(s, { orderNumber: "1234", contact: "jane@example.com" }), order);
  assert.deepEqual(s.calls, ["1234", "#1234"]);
});
