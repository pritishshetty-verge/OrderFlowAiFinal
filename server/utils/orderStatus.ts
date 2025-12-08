/**
 * Shared Order Status Mapping Utilities
 * 
 * Single source of truth for mapping Shopify order statuses to our system.
 * Used by both routes.ts (historical sync) and webhooks.ts (real-time updates).
 */

/**
 * Maps Shopify order data to our internal order status.
 * 
 * Truth Table (in priority order):
 *   1. cancelled_at NOT NULL → 'Cancelled' (explicit Shopify cancellation)
 *   2. shipment_status = 'delivered' → 'Delivered' (courier confirmed delivery)
 *   3. fulfillment_status = 'fulfilled' OR 'partial' → 'Shipped'
 *   4. Everything else → 'Unfulfilled' (pending processing)
 * 
 * IMPORTANT: We do NOT mark orders as 'Cancelled' based on financial_status.
 * A refunded or voided payment does NOT mean the order is cancelled - it could be:
 *   - Partial refund (customer returned one item)
 *   - Authorization expired (voided)
 *   - Price adjustment
 * 
 * Only Shopify's explicit `cancelled_at` timestamp indicates true cancellation.
 * 
 * @param financialStatus - Shopify's financial_status (kept for signature compatibility, not used for cancellation)
 * @param fulfillmentStatus - Shopify's fulfillment_status (null, unfulfilled, partial, fulfilled)
 * @param shipmentStatus - Our internal shipment tracking status (from Shiprocket)
 * @param cancelledAt - Shopify's cancelled_at timestamp (null if not cancelled)
 * @returns Our internal order status string
 */
export function mapShopifyStatus(
  financialStatus?: string | null,
  fulfillmentStatus?: string | null,
  shipmentStatus?: string | null,
  cancelledAt?: string | null,
): string {
  // 1. Cancelled ONLY if Shopify explicitly cancelled the order
  if (cancelledAt) {
    return "Cancelled";
  }

  // 2. Delivered if shipment tracking confirms delivery
  if (shipmentStatus === "delivered") {
    return "Delivered";
  }

  // 3. Shipped if fulfilled or partially fulfilled
  if (fulfillmentStatus === "fulfilled" || fulfillmentStatus === "partial") {
    return "Shipped";
  }

  // 4. Everything else (null, unfulfilled) = Unfulfilled
  // Note: We return 'Unfulfilled' here instead of 'Pending' because:
  // - 'Pending' in our system means "awaiting agent assignment"
  // - 'Unfulfilled' means "order exists, needs to be processed"
  // The assignment logic will update to 'assigned' when an agent is selected.
  return "Unfulfilled";
}
