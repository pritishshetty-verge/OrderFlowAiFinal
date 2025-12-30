import axios, { AxiosInstance } from 'axios';

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
  packages?: string[];
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

class DelhiveryService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.token = process.env.DELHIVERY_API_TOKEN || null;
    
    this.client = axios.create({
      baseURL: DELHIVERY_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Token ${this.token}`;
      }
      return config;
    });
  }

  isConfigured(): boolean {
    return !!this.token;
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
    if (!this.isConfigured()) {
      return { success: false, error: 'Delhivery API token not configured' };
    }

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
        pickup_location: { name: orderData.pickupLocationName || 'Default' },
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

      if (response.data.success && response.data.waybill) {
        return {
          success: true,
          awb: response.data.waybill,
        };
      }

      return {
        success: false,
        error: response.data.rmk || response.data.error || 'Unknown error creating shipment',
      };
    } catch (error: any) {
      console.error('Delhivery createShipment error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to create Delhivery shipment',
      };
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
    if (!this.isConfigured()) {
      return { success: false, error: 'Delhivery API token not configured' };
    }

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
    if (!this.isConfigured()) {
      return { success: false, error: 'Delhivery API token not configured' };
    }

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

  mapNDRStatus(statusCode: string): string {
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

  isNDRStatus(statusCode: string): boolean {
    const ndrCodes = [
      'EOD-74', 'EOD-15', 'EOD-11', 'EOD-3', 'EOD-16', 
      'EOD-6', 'ST-108', 'EOD-104', 'EOD-43', 'EOD-86', 'EOD-69'
    ];
    return ndrCodes.includes(statusCode);
  }
}

export const delhiveryService = new DelhiveryService();
export default delhiveryService;
