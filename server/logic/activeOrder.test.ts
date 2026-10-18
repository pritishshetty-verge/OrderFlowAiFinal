/**
 * Keeps the in-memory "active order" predicate and its SQL twin in lockstep.
 * The assignment engine counts workload with the SQL form; this test pins the
 * exact clause it emits and the edge cases (NULL, whitespace, casing) that the
 * in-memory form has always handled.
 *
 * Run: `npm test`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { activeOrderCondition, isActiveOrder } from "./activeOrder";

test("isActiveOrder: open on both sides → active", () => {
  assert.equal(isActiveOrder({ callStatus: "Pending", fulfillmentStatus: null }), true);
  assert.equal(isActiveOrder({ callStatus: "Follow Up", fulfillmentStatus: "unfulfilled" }), true);
  assert.equal(isActiveOrder({ callStatus: null, fulfillmentStatus: undefined }), true);
  assert.equal(isActiveOrder({ callStatus: "", fulfillmentStatus: "" }), true);
});

test("isActiveOrder: agent finished → not active, regardless of warehouse", () => {
  assert.equal(isActiveOrder({ callStatus: "Confirmed", fulfillmentStatus: null }), false);
  assert.equal(isActiveOrder({ callStatus: "cancelled", fulfillmentStatus: "unfulfilled" }), false);
  assert.equal(isActiveOrder({ callStatus: "  CONFIRMED  ", fulfillmentStatus: null }), false);
});

test("isActiveOrder: warehouse finished → not active, regardless of agent", () => {
  assert.equal(isActiveOrder({ callStatus: "Pending", fulfillmentStatus: "fulfilled" }), false);
  assert.equal(isActiveOrder({ callStatus: null, fulfillmentStatus: " Partial " }), false);
  assert.equal(isActiveOrder({ callStatus: "Follow Up", fulfillmentStatus: "FULFILLED" }), false);
});

test("isActiveOrder: only exact closed statuses count as closed", () => {
  // Substrings / variants must not match: "partially_fulfilled" is NOT "partial".
  assert.equal(isActiveOrder({ callStatus: "Pending", fulfillmentStatus: "partially_fulfilled" }), true);
  assert.equal(isActiveOrder({ callStatus: "unconfirmed", fulfillmentStatus: null }), true);
});

test("activeOrderCondition: emits the same predicate as SQL", () => {
  const { sql, params } = new PgDialect().sqlToQuery(activeOrderCondition());
  assert.equal(
    sql,
    `(lower(trim(coalesce("orders"."call_status", ''))) not in ($1, $2) and ` +
      `lower(trim(coalesce("orders"."fulfillment_status", ''))) not in ($3, $4))`,
  );
  assert.deepEqual(params, ["confirmed", "cancelled", "fulfilled", "partial"]);
});
