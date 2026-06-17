/**
 * Regression tests for the reverse-pickup-fee payment gate.
 *
 * These lock in the security invariant: a return in PENDING_FEE (unpaid) can
 * NEVER reach an actionable state through the manual dashboard routes — the
 * paid PayU webhook is the only path. If a future refactor weakens
 * server/logic/returnGuards.ts, these tests fail.
 *
 * Run: `npm test` (Node's built-in test runner via tsx — no extra deps).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { RETURN_STATUSES } from "@shared/schema";
import {
  canManuallySetStatus,
  canSchedulePickup,
  shouldWebhookAdvance,
} from "./returnGuards";

// Statuses from which ops can actually fulfil / refund a return.
const ACTIONABLE = [
  "PENDING_APPROVAL",
  "APPROVED",
  "PICKUP_SCHEDULED",
  "IN_TRANSIT",
  "RECEIVED",
  "INSPECTED",
  "REFUNDED",
] as const;

// ── approve-pickup gate ─────────────────────────────────────────────────────

test("canSchedulePickup: blocks an unpaid PENDING_FEE return (402 FEE_UNPAID)", () => {
  const r = canSchedulePickup("PENDING_FEE", false);
  assert.equal(r.ok, false);
  assert.equal((r as any).status, 402);
  assert.equal((r as any).code, "FEE_UNPAID");
});

test("canSchedulePickup: blocks PENDING_FEE even if the paid flag is somehow set", () => {
  const r = canSchedulePickup("PENDING_FEE", true);
  assert.equal(r.ok, false);
  assert.equal((r as any).status, 402);
});

test("canSchedulePickup: blocks PENDING_APPROVAL when fee unpaid (defence in depth)", () => {
  const r = canSchedulePickup("PENDING_APPROVAL", false);
  assert.equal(r.ok, false);
  assert.equal((r as any).code, "FEE_UNPAID");
});

test("canSchedulePickup: allows a fee-paid PENDING_APPROVAL return", () => {
  assert.deepEqual(canSchedulePickup("PENDING_APPROVAL", true), { ok: true });
});

test("canSchedulePickup: blocks every non-PENDING_APPROVAL status, even when paid", () => {
  for (const s of RETURN_STATUSES) {
    if (s === "PENDING_APPROVAL") continue;
    assert.equal(
      canSchedulePickup(s, true).ok,
      false,
      `expected status "${s}" to be unschedulable`,
    );
  }
});

// ── manual PATCH /status gate ───────────────────────────────────────────────

test("canManuallySetStatus: a PENDING_FEE return may ONLY be moved to REJECTED", () => {
  for (const target of RETURN_STATUSES) {
    const r = canManuallySetStatus("PENDING_FEE", target);
    if (target === "REJECTED") {
      assert.deepEqual(r, { ok: true }, "PENDING_FEE → REJECTED must be allowed");
    } else {
      assert.equal(r.ok, false, `PENDING_FEE → ${target} must be blocked`);
      assert.equal((r as any).status, 402);
      assert.equal((r as any).code, "FEE_UNPAID");
    }
  }
});

test("canManuallySetStatus: once out of PENDING_FEE, the fee gate never interferes", () => {
  for (const current of RETURN_STATUSES) {
    if (current === "PENDING_FEE") continue;
    for (const target of RETURN_STATUSES) {
      assert.deepEqual(
        canManuallySetStatus(current, target),
        { ok: true },
        `${current} → ${target} should pass the fee gate`,
      );
    }
  }
});

// ── webhook gate ────────────────────────────────────────────────────────────

test("shouldWebhookAdvance: only PENDING_FEE advances (idempotent on re-delivery)", () => {
  for (const s of RETURN_STATUSES) {
    assert.equal(
      shouldWebhookAdvance(s),
      s === "PENDING_FEE",
      `webhook advance decision wrong for "${s}"`,
    );
  }
});

// ── top-level invariant ─────────────────────────────────────────────────────

test("INVARIANT: an unpaid return cannot reach any actionable state via manual routes", () => {
  for (const target of ACTIONABLE) {
    assert.equal(
      canManuallySetStatus("PENDING_FEE", target).ok,
      false,
      `manual PATCH must not move PENDING_FEE → ${target}`,
    );
  }
  // approve-pickup never acts on an unpaid return, regardless of the flag.
  assert.equal(canSchedulePickup("PENDING_FEE", false).ok, false);
  assert.equal(canSchedulePickup("PENDING_FEE", true).ok, false);
});
