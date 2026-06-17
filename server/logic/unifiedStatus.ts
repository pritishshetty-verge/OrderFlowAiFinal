/**
 * Unified Shipping Status Mapper — the SINGLE source of truth for translating
 * every courier / Shopify status vocabulary into our canonical
 * `SHIPPING_STATUSES` (written to `orders.status`).
 *
 * Architectural rules this module enforces:
 *  - DRY: Delhivery, Shiprocket and Shopify webhooks ALL pipe through
 *    `toUnifiedStatus()`. No mapping tables live inside webhook handlers.
 *  - Strict typing: the only outputs are `ShippingStatus` union members.
 *  - Safe fallbacks: an unknown/undocumented courier string never throws — it
 *    logs a clear warning and falls back to a logical default (RTO-ish strings
 *    → `rto_initiated`, everything else → `in_transit`).
 */

import { SHIPPING_STATUSES, type ShippingStatus } from "@shared/schema";

export type { ShippingStatus };

const VALID_STATUSES = new Set<string>(SHIPPING_STATUSES);

/**
 * Safe fallback for an unrecognised raw status. Never throws.
 * RTO-flavoured unknowns degrade to `rto_initiated` (so the parcel is still
 * tracked as a return); anything else degrades to `in_transit`.
 */
function safeFallback(raw: string, source: string): ShippingStatus {
  const lower = (raw || "").toLowerCase();
  const fallback: ShippingStatus =
    lower.includes("rto") || lower.includes("return") || lower.includes("rtnd")
      ? "rto_initiated"
      : "in_transit";
  console.warn(
    `[unifiedStatus] Unknown ${source} status "${raw}" — falling back to "${fallback}". ` +
      `Add an explicit mapping if this status is expected.`,
  );
  return fallback;
}

// ---------------------------------------------------------------------------
// Delhivery
// ---------------------------------------------------------------------------
// normalizeDelhivery() (server/logic/rules/delhivery.ts) runs the proprietary
// StatusType/NSLCode state machine and already emits keys aligned with
// ShippingStatus. This map formalises that contract and guarantees validity.
const DELHIVERY_TO_UNIFIED: Record<string, ShippingStatus> = {
  unfulfilled: "unfulfilled",
  awb_assigned: "awb_assigned",
  ready_to_ship: "awb_assigned", // legacy alias
  ready_for_pickup: "ready_for_pickup",
  picked_up: "picked_up",
  in_transit: "in_transit",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  ndr: "ndr",
  rto_initiated: "rto_initiated",
  rto_ofd: "rto_ofd",
  rto_delivered: "rto_delivered",
  cancelled: "cancelled",
  lost: "lost",
};

// ---------------------------------------------------------------------------
// Shiprocket
// ---------------------------------------------------------------------------
// Shiprocket sends a free-text `current_status`. Keyed by lowercased+trimmed
// string. Covers Shiprocket's documented tracking vocabulary.
const SHIPROCKET_TO_UNIFIED: Record<string, ShippingStatus> = {
  // pre-pickup
  "manifest generated": "awb_assigned",
  "awb assigned": "awb_assigned",
  "label generated": "awb_assigned",
  "ready to ship": "awb_assigned",
  "pickup scheduled": "ready_for_pickup",
  "pickup generated": "ready_for_pickup",
  "pickup queued": "ready_for_pickup",
  "out for pickup": "ready_for_pickup",
  "pickup rescheduled": "ready_for_pickup",
  // in motion
  "picked up": "picked_up",
  "pickup done": "picked_up",
  "in transit": "in_transit",
  shipped: "in_transit",
  "reached at destination hub": "in_transit",
  "misrouted": "in_transit",
  "out for delivery": "out_for_delivery",
  // terminal (forward)
  delivered: "delivered",
  // failed delivery
  undelivered: "ndr",
  ndr: "ndr",
  "ndr raised": "ndr",
  "delivery attempted": "ndr",
  // RTO lifecycle
  "rto initiated": "rto_initiated",
  "rto acknowledged": "rto_initiated",
  "rto in transit": "rto_initiated",
  rto: "rto_initiated",
  "rto out for delivery": "rto_ofd",
  "rto ofd": "rto_ofd",
  "rto delivered": "rto_delivered",
  "rto returned": "rto_delivered",
  returned: "rto_delivered",
  // exceptions
  cancelled: "cancelled",
  canceled: "cancelled",
  lost: "lost",
  "lost in transit": "lost",
  damaged: "lost",
  "damaged in transit": "lost",
};

// ---------------------------------------------------------------------------
// Shopify fulfillment carrier status (fulfillments/update webhook)
// ---------------------------------------------------------------------------
// Shopify's fulfillment `shipment_status` is a small fixed vocabulary that maps
// cleanly onto our canonical keys.
const SHOPIFY_FULFILLMENT_TO_UNIFIED: Record<string, ShippingStatus> = {
  confirmed: "awb_assigned",
  ready_for_pickup: "ready_for_pickup",
  picked_up: "picked_up",
  in_transit: "in_transit",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  attempted_delivery: "ndr",
  failure: "ndr",
};

// ---------------------------------------------------------------------------
// Public API — one entry point, discriminated by source.
// ---------------------------------------------------------------------------
export type UnifiedStatusInput =
  | { source: "delhivery"; rawStatus: string }
  | { source: "shiprocket"; rawStatus: string | null | undefined }
  | { source: "shopify_fulfillment"; rawStatus: string | null | undefined }
  | {
      source: "shopify";
      fulfillmentStatus?: string | null;
      shipmentStatus?: string | null;
      cancelledAt?: string | null;
    };

function mapDelhivery(rawStatus: string): ShippingStatus {
  const key = (rawStatus || "").toLowerCase().trim();
  return DELHIVERY_TO_UNIFIED[key] ?? safeFallback(rawStatus, "delhivery");
}

function mapShiprocket(rawStatus: string | null | undefined): ShippingStatus {
  const key = (rawStatus || "").toLowerCase().trim();
  if (!key) {
    console.warn('[unifiedStatus] Empty shiprocket status — defaulting to "in_transit".');
    return "in_transit";
  }
  if (SHIPROCKET_TO_UNIFIED[key]) return SHIPROCKET_TO_UNIFIED[key];
  // Loose contains-matching before giving up, so minor wording drift
  // ("RTO - In Transit", "Out For Delivery (OFD)") still resolves cleanly.
  if (key.includes("out for delivery")) return key.includes("rto") ? "rto_ofd" : "out_for_delivery";
  if (key.includes("rto") && (key.includes("deliver") || key.includes("return"))) return "rto_delivered";
  if (key.includes("rto")) return "rto_initiated";
  if (key.includes("deliver")) return "delivered";
  if (key.includes("picked")) return "picked_up";
  if (key.includes("pickup")) return "ready_for_pickup";
  if (key.includes("transit")) return "in_transit";
  if (key.includes("lost") || key.includes("damaged")) return "lost";
  if (key.includes("cancel")) return "cancelled";
  if (key.includes("undeliver") || key.includes("ndr")) return "ndr";
  return safeFallback(rawStatus ?? "", "shiprocket");
}

function mapShopify(input: Extract<UnifiedStatusInput, { source: "shopify" }>): ShippingStatus {
  // 1. Cancelled ONLY on Shopify's explicit cancelled_at (never financial_status).
  if (input.cancelledAt) return "cancelled";
  // 2. Courier tracking already confirms delivery.
  if (input.shipmentStatus === "delivered") return "delivered";
  // 3. Fulfilled / partially fulfilled → AWB exists, ready to ship.
  if (input.fulfillmentStatus === "fulfilled" || input.fulfillmentStatus === "partial") {
    return "awb_assigned";
  }
  // 4. Everything else (null / unfulfilled) → unfulfilled.
  return "unfulfilled";
}

function mapShopifyFulfillment(rawStatus: string | null | undefined): ShippingStatus {
  const key = (rawStatus || "").toLowerCase().trim();
  if (!key) {
    // A fulfillment with no shipment_status just means "fulfilled / AWB created".
    return "awb_assigned";
  }
  return SHOPIFY_FULFILLMENT_TO_UNIFIED[key] ?? safeFallback(rawStatus ?? "", "shopify_fulfillment");
}

export function toUnifiedStatus(input: UnifiedStatusInput): ShippingStatus {
  switch (input.source) {
    case "delhivery":
      return mapDelhivery(input.rawStatus);
    case "shiprocket":
      return mapShiprocket(input.rawStatus);
    case "shopify_fulfillment":
      return mapShopifyFulfillment(input.rawStatus);
    case "shopify":
      return mapShopify(input);
    default: {
      // Exhaustiveness guard — unreachable under the type, defensive at runtime.
      const _exhaustive: never = input;
      console.warn("[unifiedStatus] Unknown source — defaulting to in_transit.", _exhaustive);
      return "in_transit";
    }
  }
}

/** Type guard: is an arbitrary string one of our canonical shipping statuses? */
export function isShippingStatus(value: string | null | undefined): value is ShippingStatus {
  return !!value && VALID_STATUSES.has(value);
}
