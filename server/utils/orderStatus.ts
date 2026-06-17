/**
 * Shared Order Status Mapping Utilities
 *
 * Thin Shopify-facing wrapper over the centralized unified mapper
 * (server/logic/unifiedStatus.ts). Used by both routes.ts (historical sync)
 * and webhooks.ts (real-time updates). The mapping brains live in ONE place;
 * this file only adapts Shopify's payload shape to that mapper.
 */

import { toUnifiedStatus, type ShippingStatus } from "../logic/unifiedStatus";

/**
 * Maps Shopify order data to our canonical order status.
 *
 * Truth Table (in priority order):
 *   1. cancelled_at NOT NULL → 'cancelled' (explicit Shopify cancellation)
 *   2. shipment_status = 'delivered' → 'delivered' (courier confirmed delivery)
 *   3. fulfillment_status = 'fulfilled' OR 'partial' → 'awb_assigned'
 *   4. Everything else → 'unfulfilled'
 *
 * IMPORTANT: We do NOT mark orders as cancelled based on financial_status.
 * A refunded or voided payment does NOT mean the order is cancelled - only
 * Shopify's explicit `cancelled_at` timestamp does.
 *
 * @param financialStatus - kept for signature compatibility, not used
 * @param fulfillmentStatus - Shopify's fulfillment_status (null, unfulfilled, partial, fulfilled)
 * @param shipmentStatus - Our internal shipment tracking status
 * @param cancelledAt - Shopify's cancelled_at timestamp (null if not cancelled)
 * @returns A canonical ShippingStatus
 */
export function mapShopifyStatus(
  financialStatus?: string | null,
  fulfillmentStatus?: string | null,
  shipmentStatus?: string | null,
  cancelledAt?: string | null,
): ShippingStatus {
  return toUnifiedStatus({
    source: "shopify",
    fulfillmentStatus,
    shipmentStatus,
    cancelledAt,
  });
}

/**
 * Extracts tracking information from Shopify fulfillments array.
 * 
 * Shopify stores tracking data in the fulfillments array. Each fulfillment contains:
 * - tracking_number: The carrier tracking number (AWB)
 * - tracking_url: Direct link to track the shipment
 * - tracking_company: The shipping carrier name
 * - shipment_status: Current shipment status from carrier
 * 
 * We extract from the first fulfillment as most orders have a single fulfillment.
 * 
 * @param fulfillments - Shopify's fulfillments array from order payload
 * @returns Object with extracted tracking fields (all may be null if no fulfillment)
 */
export function extractFulfillmentTracking(fulfillments?: any[] | null): {
  trackingNumber: string | null;
  trackingUrl: string | null;
  trackingCompany: string | null;
  shipmentStatus: string | null;
} {
  const firstFulfillment = fulfillments?.[0];
  
  if (!firstFulfillment) {
    return {
      trackingNumber: null,
      trackingUrl: null,
      trackingCompany: null,
      shipmentStatus: null,
    };
  }

  return {
    trackingNumber: firstFulfillment.tracking_number || null,
    trackingUrl: firstFulfillment.tracking_url || null,
    trackingCompany: firstFulfillment.tracking_company || null,
    shipmentStatus: firstFulfillment.shipment_status || null,
  };
}
