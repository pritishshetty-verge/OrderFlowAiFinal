import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { stores } from "@shared/schema";
import { decrypt } from "../encryption";

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
// Credentials are resolved PER STORE from the encrypted stores.payu_*
// columns (set via the Integrations page), falling back to the global
// PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT env vars when a store hasn't
// configured its own. This keeps the pre-UI env setup working and lets
// each brand run its own PayU merchant account for fee reconciliation.
// ─────────────────────────────────────────────────────────────────────

export interface PayuCreds {
  key: string;
  salt: string;
}

// Resolved-creds cache, keyed by storeId. Only DB-backed creds are
// cached (env-fallback resolution is cheap and must stay live across a
// redeploy). Busted by invalidatePayuCreds() when a store's config
// changes — same pattern as the Delhivery/Resend client caches.
const credsCache = new Map<string, PayuCreds>();

function envCreds(): PayuCreds | null {
  const key = process.env.PAYU_MERCHANT_KEY;
  const salt = process.env.PAYU_MERCHANT_SALT;
  if (key && salt) return { key, salt };
  return null;
}

/**
 * Resolve the PayU merchant key + salt for a store. Prefers the store's
 * own encrypted credentials; falls back to the global env vars. Throws
 * when neither source is configured.
 */
export async function getPayuCreds(storeId?: string): Promise<PayuCreds> {
  if (storeId) {
    const cached = credsCache.get(storeId);
    if (cached) return cached;

    const [row] = await db
      .select({
        payuMerchantKey: stores.payuMerchantKey,
        payuMerchantSalt: stores.payuMerchantSalt,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);

    if (row?.payuMerchantKey && row?.payuMerchantSalt) {
      const key = decrypt(row.payuMerchantKey);
      const salt = decrypt(row.payuMerchantSalt);
      if (key && salt) {
        const creds = { key, salt };
        credsCache.set(storeId, creds);
        return creds;
      }
    }
  }

  const fallback = envCreds();
  if (fallback) return fallback;

  throw new Error(
    "PayU is not configured for this store (no saved credentials and no PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT env fallback)",
  );
}

/** Drop the cached creds for a store after its config changes. */
export function invalidatePayuCreds(storeId?: string): void {
  if (storeId) {
    credsCache.delete(storeId);
  } else {
    credsCache.clear();
  }
}

export async function getPayuKey(storeId?: string): Promise<string> {
  return (await getPayuCreds(storeId)).key;
}

/**
 * Generate the SHA-512 request hash PayU expects when launching a
 * hosted-checkout payment. Returns the lowercase hex digest.
 *
 * Formula: key|txnid|amount|productinfo|firstname|email|||||||||||salt
 */
export async function generatePayuHash(
  storeId: string | undefined,
  txnid: string,
  amount: string,
  productinfo: string,
  firstname: string,
  email: string,
): Promise<string> {
  const { key, salt } = await getPayuCreds(storeId);
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
 * Recomputes the SHA-512 digest from the response fields and the
 * store's salt, then timing-safe compares it against the `hash` PayU
 * returned. Resolve the store from the txnid (= rmaNumber) before
 * calling this; pass undefined to verify against the env-fallback salt
 * (e.g. when the RMA can't be found).
 *
 * Formula: salt|status|||||||||||email|firstname|productinfo|amount|txnid|key
 */
export async function verifyPayuHash(
  storeId: string | undefined,
  payload: PayuCallbackPayload,
): Promise<boolean> {
  const provided = (payload.hash ?? "").toLowerCase();
  if (!provided) return false;

  let salt: string;
  try {
    ({ salt } = await getPayuCreds(storeId));
  } catch {
    return false;
  }

  const status = payload.status ?? "";
  const email = payload.email ?? "";
  const firstname = payload.firstname ?? "";
  const productinfo = payload.productinfo ?? "";
  const amount = payload.amount ?? "";
  const txnid = payload.txnid ?? "";
  const key = payload.key ?? "";

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
