/**
 * Pure builder for the public order-tracking view.
 *
 * Given an order (+ its shipment, status history and items), produce the
 * customer-safe tracking payload returned by POST /api/public/tracking/lookup.
 *
 * Two visibility modes via `includeOrderDetails`:
 *   • verified (order number + contact): includes order number, placed date
 *     and items.
 *   • AWB-only: status-only — NO order number, placed date, items, name,
 *     phone, email or address ever appears in the output.
 *
 * Guiding rule: never claim progress beyond what we actually know.
 */

import type { Order, Shipment, OrderStatusHistory, OrderItem } from "@shared/schema";

export type StepKey =
  | "ORDER_CONFIRMED"
  | "PACKED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED";

export type ExceptionKey =
  | "delivery_attempt_failed"
  | "returning"
  | "returned"
  | "lost"
  | "cancelled";

export type StatusGroup = "in_progress" | "delivered" | "attention" | "cancelled";

export interface TrackingStep {
  key: StepKey;
  label: string;
  done: boolean;
  current: boolean;
  at: string | null;
}

export interface TrackingItem {
  name: string;
  variant: string | null;
  quantity: number;
  image: string | null;
}

export interface TrackingView {
  found: true;
  orderNumber: string | null;
  placedAt: string | null;
  status: StepKey | ExceptionKey;
  statusGroup: StatusGroup;
  headline: string;
  message: string | null;
  steps: TrackingStep[];
  courier: string | null;
  awb: string | null;
  trackingUrl: string;
  estimatedDelivery: string | null;
  lastUpdatedAt: string | null;
  items: TrackingItem[];
}

// Ordered step definitions. Index is the canonical progress position.
const STEPS: { key: StepKey; label: string; headline: string }[] = [
  { key: "ORDER_CONFIRMED", label: "Order confirmed", headline: "Order confirmed" },
  { key: "PACKED", label: "Packed", headline: "Packed and ready to ship" },
  { key: "PICKED_UP", label: "Picked up", headline: "Picked up by the courier" },
  { key: "IN_TRANSIT", label: "In transit", headline: "On the way" },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery", headline: "Out for delivery today" },
  { key: "DELIVERED", label: "Delivered", headline: "Delivered" },
];

const IDX: Record<StepKey, number> = {
  ORDER_CONFIRMED: 0,
  PACKED: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
};

// orders.status (or a history row status) -> step index.
const STATUS_TO_STEP: Record<string, number> = {
  pending: 0,
  assigned: 0,
  confirmed: 0,
  unfulfilled: 0,
  awb_assigned: 1,
  ready_for_pickup: 1,
  picked_up: 2,
  in_transit: 3,
  out_for_delivery: 4,
  delivered: 5,
};

const PRE_SHIP = new Set(["pending", "assigned", "confirmed", "unfulfilled"]);

// orders.status -> exception.
const EXCEPTION_OF: Record<string, ExceptionKey> = {
  ndr: "delivery_attempt_failed",
  rto_initiated: "returning",
  rto_ofd: "returning",
  rto_delivered: "returned",
  lost: "lost",
  cancelled: "cancelled",
};

const EXCEPTIONS: Record<
  ExceptionKey,
  { group: StatusGroup; headline: string; message: string }
> = {
  delivery_attempt_failed: {
    group: "attention",
    headline: "Delivery attempt failed",
    message:
      "We tried to deliver your order but couldn't reach you. Please contact us and we'll arrange another delivery.",
  },
  returning: {
    group: "attention",
    headline: "On its way back to us",
    message:
      "Your order is being returned to us. Please contact us if you'd still like to receive it.",
  },
  returned: {
    group: "attention",
    headline: "Returned to us",
    message:
      "Your order has come back to us. Please contact us and we'll help you reorder or sort it out.",
  },
  lost: {
    group: "attention",
    headline: "Shipment delayed",
    message:
      "There's an issue with your shipment in transit. Please contact us and we'll make it right.",
  },
  cancelled: {
    group: "cancelled",
    headline: "Order cancelled",
    message: "This order was cancelled. Please contact us if you have any questions.",
  },
};

const DELHIVERY_URL = (awb: string) =>
  `https://www.delhivery.com/track-v2/package/${awb}`;

/** Normalise any timestamp input to an ISO string, or null. */
function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export interface BuildTrackingViewArgs {
  order: Order;
  shipment: Shipment | null | undefined;
  history: OrderStatusHistory[];
  items: OrderItem[];
  includeOrderDetails: boolean;
}

export function buildTrackingView(args: BuildTrackingViewArgs): TrackingView {
  const { order, shipment, history, items, includeOrderDetails } = args;

  const rawStatus = (order.status || "").toLowerCase().trim();
  const awb = shipment?.awb || order.trackingNumber || null;
  const hasAwb = !!awb;

  // Earliest history createdAt whose status maps to a given step index.
  const sortedHistory = [...(history ?? [])].sort(
    (a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime(),
  );
  const firstHistoryAtForStep = (stepIdx: number): string | null => {
    for (const row of sortedHistory) {
      const s = (row.status || "").toLowerCase().trim();
      if (STATUS_TO_STEP[s] === stepIdx) return iso(row.createdAt as any);
    }
    return null;
  };

  // `at` for a step: history first; ORDER_CONFIRMED uses placed date (verified
  // only, so the AWB-only view never leaks it); PICKED_UP / DELIVERED fall back
  // to shipment timestamps.
  const stepAt = (stepIdx: number): string | null => {
    if (stepIdx === IDX.ORDER_CONFIRMED) {
      return includeOrderDetails ? iso(order.shopifyCreatedAt as any) : firstHistoryAtForStep(0);
    }
    const histAt = firstHistoryAtForStep(stepIdx);
    if (histAt) return histAt;
    if (stepIdx === IDX.PICKED_UP) return iso(shipment?.pickedUpAt as any);
    if (stepIdx === IDX.DELIVERED) return iso(shipment?.deliveredAt as any);
    return null;
  };

  // Furthest step index evidenced by the history rows.
  const furthestInHistory = (): number => {
    let max = -1;
    for (const row of sortedHistory) {
      const s = (row.status || "").toLowerCase().trim();
      const idx = STATUS_TO_STEP[s];
      if (idx !== undefined && idx > max) max = idx;
    }
    return max;
  };

  const courier = order.courierName || shipment?.courierName || null;
  const courierLc = (courier || "").toLowerCase();
  const isDelhiveryOrEmpty = courierLc === "" || courierLc.includes("delhivery");
  const trackingUrl = (() => {
    if (isDelhiveryOrEmpty && awb) return DELHIVERY_URL(awb);
    return order.trackingUrl || shipment?.trackingUrl || "";
  })();

  const lastUpdatedAt =
    iso(shipment?.statusUpdatedAt as any) ||
    (sortedHistory.length
      ? iso(sortedHistory[sortedHistory.length - 1].createdAt as any)
      : null) ||
    iso(order.shopifyCreatedAt as any);

  const orderNumber = includeOrderDetails
    ? `#${String(order.shopifyOrderNumber ?? "").replace(/^#/, "")}`
    : null;
  const placedAt = includeOrderDetails ? iso(order.shopifyCreatedAt as any) : null;
  const mappedItems: TrackingItem[] = includeOrderDetails
    ? (items ?? []).map((it) => ({
        name: it.productName,
        variant: it.variantTitle ?? null,
        quantity: it.quantity,
        image: it.imageUrl ?? null,
      }))
    : [];

  // ── Exception path ─────────────────────────────────────────────────────────
  const exceptionKey = EXCEPTION_OF[rawStatus];
  if (exceptionKey) {
    const cfg = EXCEPTIONS[exceptionKey];
    let furthest = Math.max(furthestInHistory(), 0); // at least ORDER_CONFIRMED
    // An NDR means a delivery was attempted → at least OUT_FOR_DELIVERY reached.
    if (exceptionKey === "delivery_attempt_failed") {
      furthest = Math.max(furthest, IDX.OUT_FOR_DELIVERY);
    }
    const steps: TrackingStep[] = STEPS.map((s, i) => ({
      key: s.key,
      label: s.label,
      done: i <= furthest,
      current: false, // exceptions never mark a current step
      at: i <= furthest ? stepAt(i) : null,
    }));
    return {
      found: true,
      orderNumber,
      placedAt,
      status: exceptionKey,
      statusGroup: cfg.group,
      headline: cfg.headline,
      message: cfg.message,
      steps,
      courier,
      awb,
      trackingUrl,
      estimatedDelivery: null, // not in progress
      lastUpdatedAt,
      items: mappedItems,
    };
  }

  // ── Step path ────────────────────────────────────────────────────────────
  let ci = STATUS_TO_STEP[rawStatus];
  if (ci === undefined) {
    // Unknown status: PACKED if there's an AWB, else ORDER_CONFIRMED.
    ci = hasAwb ? IDX.PACKED : IDX.ORDER_CONFIRMED;
  } else if (PRE_SHIP.has(rawStatus) && hasAwb) {
    // Pre-ship order that already has a tracking number → show as PACKED.
    ci = IDX.PACKED;
  }

  const currentStepKey = STEPS[ci].key;
  const currentDef = STEPS[ci];
  const statusGroup: StatusGroup = ci === IDX.DELIVERED ? "delivered" : "in_progress";

  const steps: TrackingStep[] = STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    done: i <= ci,
    current: i === ci,
    at: i <= ci ? stepAt(i) : null,
  }));

  return {
    found: true,
    orderNumber,
    placedAt,
    status: currentStepKey,
    statusGroup,
    headline: currentDef.headline,
    message: null,
    steps,
    courier,
    awb,
    trackingUrl,
    estimatedDelivery:
      statusGroup === "in_progress" ? iso(shipment?.estimatedDeliveryDate as any) : null,
    lastUpdatedAt,
    items: mappedItems,
  };
}
