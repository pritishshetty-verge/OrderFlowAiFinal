import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { stores } from "@shared/schema";
import { decrypt } from "./encryption";

// ─────────────────────────────────────────────────────────────────────
// Phase 5 — Per-store Shopify webhook routing.
//
// Inbound Shopify webhooks all hit the same endpoint per topic
// (/api/webhooks/orders/create, etc.). Until now, the handler verified
// HMAC against a single env-var webhook secret and inserted orders
// with storeId=NULL — both wrong as soon as a second store was
// connected. This resolver figures out which `stores` row sent the
// webhook so the handler can:
//
//   1. Verify HMAC against THAT store's webhook_secret (after
//      decryption).
//   2. Stamp the resulting order/customer rows with the right
//      storeId.
//   3. Scope the de-dup lookup to (storeId, shopifyOrderId).
//
// Resolution order, most-trusted to least:
//
//   1. `X-Shopify-Shop-Domain` request header — present on every
//      direct Shopify webhook. The canonical answer.
//   2. `req.body.myshopify_domain` — Shopify includes this on most
//      payload shapes when sending via partner apps. Useful when an
//      upstream proxy (n8n, Cloudflare Workers) strips the header.
//   3. Parsed from `req.body.order_status_url` — the order status URL
//      embeds the .myshopify.com hostname. Last-resort but reliable
//      because Shopify itself generates it.
//
// Returns `null` when no candidate can be matched against `stores`
// rows. The caller should 404 the webhook in that case so Shopify
// retries until the row is provisioned (giving ops a recoverable
// failure mode instead of a silent drop).
// ─────────────────────────────────────────────────────────────────────

export interface ResolvedWebhookStore {
  /** The matched stores row. */
  store: {
    id: string;
    storeName: string | null;
    storeUrl: string;
    webhookSecret: string | null; // encrypted on the row
  };
  /**
   * Decrypted webhook secret ready for HMAC verification.
   * Null when the store row has no secret stored (e.g., legacy
   * row that pre-dates explicit webhook-secret capture); the caller
   * can fall back to the env-var secret for the legacy store only.
   */
  webhookSecret: string | null;
}

export async function resolveWebhookStore(
  req: Request,
): Promise<ResolvedWebhookStore | null> {
  const candidate = pickShopDomainCandidate(req);
  if (!candidate) return null;
  const normalized = normalizeShopDomain(candidate);

  const [row] = await db
    .select({
      id: stores.id,
      storeName: stores.storeName,
      storeUrl: stores.storeUrl,
      webhookSecret: stores.webhookSecret,
    })
    .from(stores)
    .where(eq(stores.storeUrl, normalized))
    .limit(1);
  if (!row) return null;

  return {
    store: row,
    webhookSecret: row.webhookSecret ? safeDecrypt(row.webhookSecret) : null,
  };
}

// Pull the best-available shop-domain hint from the request. Lowercase
// + trim is left to normalizeShopDomain so this stays purely "pick
// the source." Returns null if all sources are empty.
function pickShopDomainCandidate(req: Request): string | null {
  // Header is canonical. Express lowercases header names so the
  // mixed-case Shopify spelling matches.
  const headerVal = req.get("X-Shopify-Shop-Domain");
  if (headerVal && headerVal.trim().length > 0) return headerVal;

  const body = (req.body ?? {}) as Record<string, any>;

  // Direct field — present on most order/fulfillment payloads.
  if (typeof body.myshopify_domain === "string" && body.myshopify_domain.trim()) {
    return body.myshopify_domain;
  }

  // Some Shopify payloads put the shop in the order's metadata.
  // order_status_url is in the form
  // "https://{shop}.myshopify.com/{...}". Parse the host segment.
  if (typeof body.order_status_url === "string") {
    const m = body.order_status_url.match(
      /^https?:\/\/([^/]+\.myshopify\.com)/i,
    );
    if (m) return m[1];
  }

  return null;
}

// Strip protocol / trailing slash / case, matching the same
// normalization POST /api/stores does at insert time so the lookup
// hits the row reliably.
function normalizeShopDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

// `decrypt` will throw on a malformed input. We don't want a corrupt
// `webhook_secret` blob to cascade into a 500 — return null instead
// so the caller falls back to the env-var path or rejects the
// webhook with a clean 401.
function safeDecrypt(blob: string): string | null {
  try {
    return decrypt(blob);
  } catch (err) {
    console.warn(
      "[webhook-resolver] failed to decrypt webhook_secret:",
      (err as Error).message,
    );
    return null;
  }
}
