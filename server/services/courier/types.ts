/**
 * Generic reverse-logistics provider contract.
 *
 * Every courier aggregator (Delhivery today; Shiprocket, F-ship, … later)
 * implements `CourierProvider` so the return-approval flow can schedule a
 * reverse pickup without knowing which courier is behind it. Add a new
 * aggregator by writing a class that implements this interface and registering
 * it in ./index.ts — no changes to the route layer.
 */

export interface ReversePickupRequest {
  /** Our RMA number — used as the courier order/reference id. */
  rmaNumber: string;
  /** The CUSTOMER — on a reverse leg this is the pickup point. */
  customerName: string;
  customerPhone: string;
  pickupAddressLine1: string;
  pickupAddressLine2?: string;
  pickupCity: string;
  pickupState: string;
  pickupPincode: string;
  pickupCountry?: string;
  /** Optional parcel hints. */
  weight?: number;
  productsDesc?: string;
}

/**
 * Stable, provider-agnostic error codes so the route/UI can react without
 * parsing free-text. Providers map their proprietary failures onto these.
 */
export type ReversePickupErrorCode =
  | "UNSERVICEABLE" // pickup pincode not serviceable for reverse
  | "WAREHOUSE_NOT_REGISTERED" // destination warehouse / client not set up
  | "INVALID_ADDRESS" // missing / malformed pickup address
  | "PROVIDER_REJECTED" // courier rejected for another stated reason
  | "PROVIDER_UNAVAILABLE"; // network / 5xx / timeout talking to courier

export interface ReversePickupResult {
  success: boolean;
  /** Reverse AWB / waybill on success. */
  awb?: string;
  /** Human-readable reason on failure (surfaced to ops). */
  error?: string;
  /** Machine-readable classification of the failure. */
  errorCode?: ReversePickupErrorCode;
}

export interface CourierProvider {
  /** Stable slug for logging / persistence, e.g. "delhivery". */
  readonly name: string;
  /**
   * Schedule a paperless reverse pickup. MUST NOT throw for expected courier
   * failures (unserviceable pincode, etc.) — return `{ success: false, error,
   * errorCode }` so the caller can surface the reason cleanly.
   */
  scheduleReversePickup(req: ReversePickupRequest): Promise<ReversePickupResult>;
}
