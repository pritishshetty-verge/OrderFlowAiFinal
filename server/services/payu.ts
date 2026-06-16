import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────────────
// PayU (Hosted Checkout) hashing utilities.
//
// PayU signs both the outbound request and its return callback with a
// SHA-512 hash over a pipe-delimited field string keyed by the
// merchant's secret salt. The field ORDER is fixed by PayU and must be
// reproduced exactly — see the two formulas below.
//
//   Request hash:
//     key|txnid|amount|productinfo|firstname|email|||||||||||salt
//     (5 udf fields + 5 reserved empties between email and salt)
//
//   Reverse (response) hash:
//     salt|status|||||||||||email|firstname|productinfo|amount|txnid|key
//
// Credentials come from PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT.
// ─────────────────────────────────────────────────────────────────────

function getCreds(): { key: string; salt: string } {
  const key = process.env.PAYU_MERCHANT_KEY;
  const salt = process.env.PAYU_MERCHANT_SALT;
  if (!key || !salt) {
    throw new Error(
      "PayU is not configured (PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT missing)",
    );
  }
  return { key, salt };
}

export function getPayuKey(): string {
  return getCreds().key;
}

/**
 * Generate the SHA-512 request hash PayU expects when launching a
 * hosted-checkout payment. Returns the lowercase hex digest.
 *
 * Formula: key|txnid|amount|productinfo|firstname|email|||||||||||salt
 */
export function generatePayuHash(
  txnid: string,
  amount: string,
  productinfo: string,
  firstname: string,
  email: string,
): string {
  const { key, salt } = getCreds();
  const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
  return crypto.createHash("sha512").update(hashString).digest("hex");
}

export interface PayuCallbackPayload {
  status?: string;
  email?: string;
  firstname?: string;
  productinfo?: string;
  amount?: string;
  txnid?: string;
  key?: string;
  hash?: string;
  [k: string]: any;
}

/**
 * Verify the reverse hash PayU sends on its success/failure callback.
 * Recomputes the SHA-512 digest from the response fields and the salt,
 * then timing-safe compares it against the `hash` PayU returned.
 *
 * Formula: salt|status|||||||||||email|firstname|productinfo|amount|txnid|key
 */
export function verifyPayuHash(payload: PayuCallbackPayload): boolean {
  const { salt } = getCreds();
  const status = payload.status ?? "";
  const email = payload.email ?? "";
  const firstname = payload.firstname ?? "";
  const productinfo = payload.productinfo ?? "";
  const amount = payload.amount ?? "";
  const txnid = payload.txnid ?? "";
  const key = payload.key ?? "";
  const provided = (payload.hash ?? "").toLowerCase();

  if (!provided) return false;

  const reverseString = `${salt}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  const computed = crypto
    .createHash("sha512")
    .update(reverseString)
    .digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const RETURN_FEE_AMOUNT = "150.00";
