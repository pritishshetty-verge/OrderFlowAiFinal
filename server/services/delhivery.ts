import axios, { AxiosInstance } from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { stores } from '@shared/schema';
import { decrypt } from '../encryption';
import type {
  CourierProvider,
  ReversePickupRequest,
  ReversePickupResult,
  ReversePickupErrorCode,
} from './courier/types';

/**
 * Map a Delhivery failure message onto our provider-agnostic error code so the
 * route/UI can react (and tell ops exactly why) without parsing free text.
 */
function classifyReverseError(message: string): ReversePickupErrorCode {
  const m = (message || '').toLowerCase();
  if (m.includes('serviceab') || m.includes('non-serviceable') || (m.includes('pin') && m.includes('serv'))) {
    return 'UNSERVICEABLE';
  }
  if (m.includes('warehouse') || m.includes('pickup_location') || m.includes('client') || m.includes('registered')) {
    return 'WAREHOUSE_NOT_REGISTERED';
  }
  if (m.includes('address') || m.includes('pincode') || m.includes('phone') || m.includes('invalid')) {
    return 'INVALID_ADDRESS';
  }
  return 'PROVIDER_REJECTED';
}

const DELHIVERY_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://track.delhivery.com'
  : 'https://staging-express.delhivery.com';

interface DelhiveryShipmentPayload {
  name: string;
  add: string;
  pin: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  order: string;
  payment_mode: 'Prepaid' | 'COD' | 'Pickup';
  cod_amount?: string;
  return_pin?: string;
  return_city?: string;
  return_phone?: string;
  return_add?: string;
  return_state?: string;
  return_country?: string;
  return_name?: string;
  products_desc?: string;
  hsn_code?: string;
  seller_gst_tin?: string;
  shipping_mode?: 'Surface' | 'Express';
  weight?: string;
  seller_name?: string;
  seller_add?: string;
  pickup_location?: { name: string };
  waybill?: string;
}

interface DelhiveryCreateResponse {
  success: boolean;
  waybill?: string;
  packages?: Array<{ waybill?: string; status?: string; remarks?: string[] }>;
  upload_wbn?: string;
  rmk?: string;
  error?: string;
}

interface DelhiveryTrackResponse {
  ShipmentData?: Array<{
    Shipment: {
      Status: {
        Status: string;
        StatusCode: string;
        StatusLocation: string;
        StatusDateTime: string;
        Instructions?: string;
      };
      AWB: string;
      OrderID: string;
      ReferenceNo?: string;
      PickUpDate?: string;
      DeliveryDate?: string;
      PromisedDeliveryDate?: string;
      Consignee: {
        Name: string;
        Address1: string;
        Address2?: string;
        City: string;
        State: string;
        PinCode: string;
        Phone1: string;
      };
      Scans?: Array<{
        ScanDetail: {
          Scan: string;
          ScanDateTime: string;
          ScannedLocation: string;
          Instructions?: string;
          StatusCode?: string;
        };
      }>;
    };
  }>;
  Error?: string;
}

interface DelhiveryNDRActionPayload {
  waybill: string;
  act: 'RE-ATTEMPT' | 'RTO' | 'DEFER_DLV' | 'EDIT_DETAILS';
  action_data?: {
    deferred_date?: string;
    name?: string;
    add?: string;
    phone?: string;
  };
}

interface DelhiveryNDRActionResponse {
  upload_id?: string;
  success: boolean;
  error?: string;
}

interface DelhiveryPackingSlipResponse {
  packages?: Array<{
    pdf_download_link?: string;
    pdf?: string;
    wbn?: string;
  }>;
  packages_found?: number;
}

export interface DelhiveryClientConfig {
  token: string;
  clientName?: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Store-scoped Delhivery client.
//
// Previously this module exported a single global `delhiveryService`
// instance built from process.env.DELHIVERY_API_TOKEN. Now every
// outbound call must run in the context of a specific store, so the
// client is constructed per-store from the encrypted credentials on
// the `stores` row and handed out by `getDelhiveryClient(storeId)`.
//
// NDR status classification (mapNDRStatus / isNDRStatus) is pure data —
// it doesn't need credentials — so it's exported as standalone
// functions used by both the webhook and the route layer.
// ─────────────────────────────────────────────────────────────────────

export class DelhiveryClient implements CourierProvider {
  /** CourierProvider slug — used for logging / persistence. */
  readonly name = 'delhivery';
  private client: AxiosInstance;
  private token: string;
  readonly clientName: string | null;

  constructor(config: DelhiveryClientConfig) {
    this.token = config.token;
    this.clientName = config.clientName ?? null;

    this.client = axios.create({
      baseURL: DELHIVERY_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      config.headers.Authorization = `Token ${this.token}`;
      return config;
    });
  }

  async createShipment(orderData: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    shippingAddressLine1: string;
    shippingAddressLine2?: string;
    shippingCity: string;
    shippingState: string;
    shippingPincode: string;
    shippingCountry?: string;
    paymentMethod: string;
    totalPrice: string;
    itemsSummary?: string;
    weight?: number;
    pickupLocationName?: string;
  }): Promise<{ success: boolean; awb?: string; error?: string }> {
    try {
      const shipmentPayload: DelhiveryShipmentPayload = {
        name: orderData.customerName,
        add: [orderData.shippingAddressLine1, orderData.shippingAddressLine2].filter(Boolean).join(', '),
        pin: orderData.shippingPincode,
        city: orderData.shippingCity,
        state: orderData.shippingState,
        country: orderData.shippingCountry || 'India',
        phone: orderData.customerPhone,
        order: orderData.orderId,
        payment_mode: orderData.paymentMethod.toLowerCase() === 'cod' ? 'COD' : 'Prepaid',
        products_desc: orderData.itemsSummary || 'General merchandise',
        weight: orderData.weight?.toString() || '0.5',
        pickup_location: { name: orderData.pickupLocationName || this.clientName || 'Default' },
      };

      if (shipmentPayload.payment_mode === 'COD') {
        shipmentPayload.cod_amount = orderData.totalPrice;
      }

      const payload = `format=json&data=${encodeURIComponent(JSON.stringify({ shipments: [shipmentPayload] }))}`;

      const response = await this.client.post<DelhiveryCreateResponse>(
        '/api/cmu/create.json',
        payload,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // AWB can be at the top level (waybill) or inside packages[0].
      const awb =
        response.data.waybill ||
        response.data.packages?.find((p) => p.waybill)?.waybill;

      if (response.data.success && awb) {
        return { success: true, awb };
      }

      return {
        success: false,
        error:
          response.data.packages?.[0]?.remarks?.join(', ') ||
          response.data.rmk ||
          response.data.error ||
          'Unknown error creating shipment',
      };
    } catch (error: any) {
      console.error('Delhivery createShipment error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to create Delhivery shipment',
      };
    }
  }

  /**
   * Schedule a paperless B2C REVERSE pickup (CourierProvider contract).
   *
   * Per Delhivery's docs, a reverse pickup uses the SAME Order Creation
   * endpoint (`/api/cmu/create.json`) as a forward shipment, but with
   * `payment_mode: "Pickup"` — that flag turns the leg around and tells
   * Delhivery to send a rider with the label (paperless; the customer doesn't
   * print anything). The logistics are inverted vs. a forward shipment:
   *   - consignee fields = the CUSTOMER (where Delhivery collects FROM)
   *   - registered `pickup_location` (this store's warehouse, keyed by client
   *     name) = the return DESTINATION.
   *
   * Never throws for an expected courier rejection (e.g. unserviceable
   * pincode): returns `{ success: false, error, errorCode }` so ops sees why.
   */
  async scheduleReversePickup(req: ReversePickupRequest): Promise<ReversePickupResult> {
    try {
      // pickup_location.name MUST exactly match a registered, reverse-enabled
      // Delhivery facility. If it's wrong/blank, Delhivery can't resolve the
      // warehouse and rejects the leg as "pickup pincode not serviceable".
      // Fail fast with a precise reason instead of sending an unresolvable name
      // (the old `'Default'` fallback was guaranteed to fail serviceability).
      const pickupLocationName = this.clientName?.trim();
      if (!pickupLocationName) {
        return {
          success: false,
          error:
            "Delhivery pickup location is not configured for this store. Set the store's " +
            "Delhivery client name to the exact registered warehouse name before scheduling a pickup.",
          errorCode: 'WAREHOUSE_NOT_REGISTERED',
        };
      }

      const shipmentPayload: DelhiveryShipmentPayload = {
        // Consignee = customer: on a reverse leg this is where Delhivery
        // collects the parcel FROM (the rider goes to the customer's address).
        name: req.customerName,
        add: [req.pickupAddressLine1, req.pickupAddressLine2]
          .filter(Boolean)
          .join(', '),
        pin: req.pickupPincode,
        city: req.pickupCity,
        state: req.pickupState,
        country: req.pickupCountry || 'India',
        phone: req.customerPhone,
        order: req.rmaNumber,
        // "Pickup" payment mode marks this as a paperless reverse pickup.
        payment_mode: 'Pickup',
        products_desc: req.productsDesc || 'Return item',
        weight: req.weight?.toString() || '0.5',
        // Registered warehouse = the return destination. Must exactly match the
        // facility name registered in the Delhivery panel (e.g. "Glow&Me").
        pickup_location: { name: pickupLocationName },
      };

      const payload = `format=json&data=${encodeURIComponent(
        JSON.stringify({ shipments: [shipmentPayload] }),
      )}`;

      const response = await this.client.post<DelhiveryCreateResponse>(
        '/api/cmu/create.json',
        payload,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const awb =
        response.data.waybill ||
        response.data.packages?.find((p) => p.waybill)?.waybill;

      if (response.data.success && awb) {
        return { success: true, awb };
      }

      // Delhivery accepted the request but rejected the shipment — surface the
      // stated reason and classify it (e.g. unserviceable pincode).
      const error =
        response.data.packages?.[0]?.remarks?.join(', ') ||
        response.data.rmk ||
        response.data.error ||
        'Delhivery rejected the reverse pickup';
      return { success: false, error, errorCode: classifyReverseError(error) };
    } catch (error: any) {
      // Network / 5xx / timeout — the courier itself is unreachable.
      const msg =
        error.response?.data?.error ||
        error.message ||
        'Failed to reach Delhivery to schedule the reverse pickup';
      console.error('Delhivery scheduleReversePickup error:', error.response?.data || error.message);
      return { success: false, error: msg, errorCode: 'PROVIDER_UNAVAILABLE' };
    }
  }

  async trackShipment(awb: string): Promise<{
    success: boolean;
    status?: string;
    statusCode?: string;
    location?: string;
    activities?: Array<{
      status: string;
      datetime: string;
      location: string;
      instructions?: string;
    }>;
    error?: string;
  }> {
    try {
      const response = await this.client.get<DelhiveryTrackResponse>(
        `/api/v1/packages/json/?waybill=${awb}`
      );

      const shipmentData = response.data.ShipmentData?.[0]?.Shipment;

      if (!shipmentData) {
        return { success: false, error: 'Shipment not found' };
      }

      const activities = shipmentData.Scans?.map((scan) => ({
        status: scan.ScanDetail.Scan,
        datetime: scan.ScanDetail.ScanDateTime,
        location: scan.ScanDetail.ScannedLocation,
        instructions: scan.ScanDetail.Instructions,
      })) || [];

      return {
        success: true,
        status: shipmentData.Status.Status,
        statusCode: shipmentData.Status.StatusCode,
        location: shipmentData.Status.StatusLocation,
        activities,
      };
    } catch (error: any) {
      console.error('Delhivery trackShipment error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.Error || error.message || 'Failed to track shipment',
      };
    }
  }

  /**
   * Retrieve the printable packing slip / shipping label for an AWB.
   * Delhivery returns a JSON envelope with a pdf_download_link (and/or
   * base64 PDF) per package.
   */
  async getShippingLabel(awb: string): Promise<{
    success: boolean;
    labelUrl?: string;
    error?: string;
  }> {
    try {
      const response = await this.client.get<DelhiveryPackingSlipResponse>(
        `/api/p/packing_slip?wbns=${encodeURIComponent(awb)}&pdf=true`
      );

      const pkg = response.data.packages?.[0];
      const labelUrl = pkg?.pdf_download_link || pkg?.pdf;

      if (labelUrl) {
        return { success: true, labelUrl };
      }

      return { success: false, error: 'No packing slip available for this AWB yet' };
    } catch (error: any) {
      console.error('Delhivery getShippingLabel error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.Error || error.message || 'Failed to fetch shipping label',
      };
    }
  }

  async actionNDR(
    awb: string,
    action: 'reattempt' | 'rto' | 'defer' | 'edit',
    actionData?: {
      deferredDate?: string;
      name?: string;
      address?: string;
      phone?: string;
    }
  ): Promise<{ success: boolean; uploadId?: string; error?: string }> {
    const actionMap: Record<string, DelhiveryNDRActionPayload['act']> = {
      reattempt: 'RE-ATTEMPT',
      rto: 'RTO',
      defer: 'DEFER_DLV',
      edit: 'EDIT_DETAILS',
    };

    try {
      const payload: DelhiveryNDRActionPayload = {
        waybill: awb,
        act: actionMap[action],
      };

      if (action === 'defer' && actionData?.deferredDate) {
        payload.action_data = { deferred_date: actionData.deferredDate };
      }

      if (action === 'edit' && actionData) {
        payload.action_data = {
          name: actionData.name,
          add: actionData.address,
          phone: actionData.phone,
        };
      }

      const response = await this.client.post<DelhiveryNDRActionResponse>(
        '/api/p/update',
        { data: [payload] }
      );

      if (response.data.success || response.data.upload_id) {
        return {
          success: true,
          uploadId: response.data.upload_id,
        };
      }

      return {
        success: false,
        error: response.data.error || 'Unknown error processing NDR action',
      };
    } catch (error: any) {
      console.error('Delhivery actionNDR error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to process NDR action',
      };
    }
  }
}

// ── Pure NDR status classification (no credentials needed) ──────────────

export function mapNDRStatus(statusCode: string): string {
  const ndrStatusMap: Record<string, string> = {
    'EOD-74': 'customer_unavailable',
    'EOD-15': 'address_issue',
    'EOD-11': 'refused',
    'EOD-3': 'customer_unavailable',
    'EOD-16': 'address_issue',
    'EOD-6': 'other',
    'ST-108': 'other',
    'EOD-104': 'address_issue',
    'EOD-43': 'refused',
    'EOD-86': 'other',
    'EOD-69': 'other',
  };
  return ndrStatusMap[statusCode] || 'other';
}

export function isNDRStatus(statusCode: string): boolean {
  const ndrCodes = [
    'EOD-74', 'EOD-15', 'EOD-11', 'EOD-3', 'EOD-16',
    'EOD-6', 'ST-108', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-69',
  ];
  return ndrCodes.includes(statusCode);
}

// ── Store-scoped client factory ─────────────────────────────────────────

interface CacheEntry {
  client: DelhiveryClient;
  loadedAt: number;
}

const clientCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Build (or return a cached) Delhivery client for a specific store.
 * Reads the encrypted token + client name from the `stores` row,
 * decrypts the token, and constructs a DelhiveryClient bound to that
 * store's credentials. Throws if the store has no Delhivery token
 * configured so callers surface a clear "not configured" error.
 */
export async function getDelhiveryClient(storeId: string): Promise<DelhiveryClient> {
  if (!storeId) {
    throw new Error('storeId is required to build a Delhivery client');
  }

  const cached = clientCache.get(storeId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.client;
  }

  const [row] = await db
    .select({
      delhiveryApiToken: stores.delhiveryApiToken,
      delhiveryClientName: stores.delhiveryClientName,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  if (!row) {
    throw new Error(`Store not found: ${storeId}`);
  }
  if (!row.delhiveryApiToken) {
    throw new Error('Delhivery is not configured for this store');
  }

  const token = decrypt(row.delhiveryApiToken);
  if (!token) {
    throw new Error('Delhivery token failed to decrypt for this store');
  }

  const client = new DelhiveryClient({
    token,
    clientName: row.delhiveryClientName,
  });
  clientCache.set(storeId, { client, loadedAt: Date.now() });
  return client;
}

/** Drop the cached client for a store after its credentials change. */
export function invalidateDelhiveryClient(storeId?: string): void {
  if (storeId) {
    clientCache.delete(storeId);
  } else {
    clientCache.clear();
  }
}
