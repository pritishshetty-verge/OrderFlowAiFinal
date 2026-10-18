/**
 * Shared identity gate for the public (storefront-facing) order lookups.
 *
 * Both the returns lookup and the new tracking lookup need the same rule:
 * a request only sees an order after proving it with the order number AND a
 * matching customer email/phone. This module is the single source of truth
 * for that check so the two endpoints can never drift apart.
 *
 * Pure + storage-injected so it's unit-testable without a database.
 */

import type { Order } from "@shared/schema";

/** Minimal storage surface this module needs (keeps it easy to fake in tests). */
export interface OrderLookupStorage {
  getOrderByShopifyOrderNumber(
    orderNumber: string,
    storeId?: string,
  ): Promise<Order | undefined>;
}

/** Just enough of an order to run the contact check. */
type ContactCheckable = Pick<Order, "customerEmail" | "customerPhone">;

/** Trim and strip a single leading `#`. */
export function normalizeOrderNumber(raw: unknown): string {
  return String(raw ?? "").trim().replace(/^#/, "");
}

/**
 * Normalise an AWB / tracking number: drop spaces and dashes, upper-case.
 * Returns null unless the cleaned value is 8-25 alphanumeric chars.
 */
export function normalizeAwb(raw: unknown): string | null {
  const cleaned = String(raw ?? "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  return /^[A-Z0-9]{8,25}$/.test(cleaned) ? cleaned : null;
}

/**
 * Does `contact` identify this order?
 *   - email: exact match, case-insensitive; OR
 *   - phone: at least 6 digits on both sides, and the last 10 digits equal.
 */
export function contactMatchesOrder(
  order: ContactCheckable,
  contact: unknown,
): boolean {
  const probe = String(contact ?? "").trim().toLowerCase();
  if (!probe) return false;

  const emailMatch =
    !!order.customerEmail && order.customerEmail.toLowerCase() === probe;
  if (emailMatch) return true;

  const probeDigits = probe.replace(/\D/g, "");
  const orderPhoneDigits = (order.customerPhone || "").replace(/\D/g, "");
  return (
    probeDigits.length >= 6 &&
    orderPhoneDigits.length >= 6 &&
    orderPhoneDigits.slice(-10) === probeDigits.slice(-10)
  );
}

/**
 * Look up an order by number, then verify the contact. Returns null for an
 * unknown order AND for a contact mismatch alike, so callers can't tell the
 * two apart (anti-enumeration). An empty contact returns null WITHOUT
 * querying - never surface an order without a contact to check against.
 */
export async function findVerifiedOrder(
  storage: OrderLookupStorage,
  params: { orderNumber: unknown; contact: unknown; storeId?: string | null },
): Promise<Order | null> {
  const contact = String(params.contact ?? "").trim();
  if (!contact) return null;

  const number = normalizeOrderNumber(params.orderNumber);
  if (!number) return null;

  const storeId = params.storeId || undefined;
  // Bare number first, then the `#`-prefixed variant Shopify sometimes stores.
  const order =
    (await storage.getOrderByShopifyOrderNumber(number, storeId)) ||
    (await storage.getOrderByShopifyOrderNumber(`#${number}`, storeId));

  if (!order) return null;
  if (!contactMatchesOrder(order, contact)) return null;
  return order;
}
