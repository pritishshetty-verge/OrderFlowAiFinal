/**
 * Return (RMA) security gates — the single source of truth for the
 * reverse-pickup-fee payment lock.
 *
 * A return is created in PENDING_FEE and stays locked until the customer pays
 * the ₹150 reverse-pickup fee. The PayU success webhook (reverse-hash verified)
 * is the ONLY mechanism allowed to advance it to an actionable state. These
 * pure predicates encode that invariant so it is centralized, exhaustively
 * unit-tested (returnGuards.test.ts), and cannot be silently removed by a
 * future refactor of the route handlers — the routes delegate here.
 */

export type GuardResult =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

const OK: GuardResult = { ok: true };

/**
 * Manual dashboard status change (PATCH /api/returns/:id/status).
 *
 * An unpaid return (PENDING_FEE) may ONLY be moved to REJECTED through this
 * endpoint — so ops can clear abandoned, never-paid requests. Any other target
 * is blocked; advancing to an actionable state must go through the paid webhook.
 */
export function canManuallySetStatus(current: string, target: string): GuardResult {
  if (current === "PENDING_FEE" && target !== "REJECTED") {
    return {
      ok: false,
      status: 402,
      code: "FEE_UNPAID",
      error:
        "Return fee is unpaid. It can only be advanced by a successful payment, or rejected.",
    };
  }
  return OK;
}

/**
 * Approve + schedule a reverse pickup (POST /api/returns/:id/approve-pickup).
 *
 * Requires a fee-paid return that is awaiting approval. Both the status AND the
 * returnFeePaid flag are checked (defence in depth): an unpaid return must never
 * be scheduled, or ops would fulfil a free return.
 */
export function canSchedulePickup(current: string, returnFeePaid: boolean): GuardResult {
  if (current === "PENDING_FEE" || !returnFeePaid) {
    return {
      ok: false,
      status: 402,
      code: "FEE_UNPAID",
      error: "Return fee has not been paid; cannot schedule a pickup.",
    };
  }
  if (current !== "PENDING_APPROVAL") {
    return {
      ok: false,
      status: 400,
      code: "INVALID_STATE",
      error: `Return is not awaiting approval (current: ${current})`,
    };
  }
  return OK;
}

/**
 * Should a verified PayU success callback advance this return? Only a still
 * fee-pending return is moved forward (idempotent: a second callback is a no-op).
 * This is the sole sanctioned path out of PENDING_FEE into an actionable state.
 */
export function shouldWebhookAdvance(current: string): boolean {
  return current === "PENDING_FEE";
}
