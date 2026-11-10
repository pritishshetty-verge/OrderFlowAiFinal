/**
 * Reshipment reason contract: the server accepts exactly the canonical
 * RESHIPMENT_REASONS, plus the legacy `fake_delivery_attempt` spelling
 * the New Reshipment dialog used to send (normalized to `fake_delivery`).
 *
 * Run: `npm test`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RESHIPMENT_REASONS, normalizeReshipmentReason } from "@shared/schema";

test("every canonical reason normalizes to itself", () => {
  for (const r of RESHIPMENT_REASONS) {
    assert.equal(normalizeReshipmentReason(r), r);
  }
});

test("legacy fake_delivery_attempt maps to fake_delivery", () => {
  assert.equal(normalizeReshipmentReason("fake_delivery_attempt"), "fake_delivery");
});

test("unknown or non-string reasons are rejected", () => {
  assert.equal(normalizeReshipmentReason("lost_in_space"), null);
  assert.equal(normalizeReshipmentReason(""), null);
  assert.equal(normalizeReshipmentReason(undefined), null);
  assert.equal(normalizeReshipmentReason(null), null);
  assert.equal(normalizeReshipmentReason(42), null);
});
