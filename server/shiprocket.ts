import axios, { AxiosInstance } from 'axios';

interface ShiprocketAuthResponse {
  token: string;
  expires_in?: number;
}

interface ShiprocketOrderPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  channel_id?: string;
  comment?: string;
  billing_customer_name: string;
  billing_last_name?: string;
  billing_address: string;
  billing_address_2?: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  shipping_customer_name?: string;
  shipping_last_name?: string;
  shipping_address?: string;
  shipping_address_2?: string;
  shipping_city?: string;
  shipping_pincode?: string;
  shipping_country?: string;
  shipping_state?: string;
  shipping_email?: string;
  shipping_phone?: string;
  order_items: Array<{
    name: string;
    sku: string;
    units: number;
    selling_price: string;
    discount?: string;
    tax?: string;
    hsn?: string;
  }>;
  payment_method: 'Prepaid' | 'COD';
  shipping_charges?: number;
  giftwrap_charges?: number;
  transaction_charges?: number;
  total_discount?: number;
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

interface ShiprocketCreateOrderResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
  onboarding_completed_now: number;
  awb_code?: string;
  courier_company_id?: number;
  courier_name?: string;
}

interface ShiprocketTrackResponse {
  tracking_data: {
    track_status: number;
    shipment_status: number;
    shipment_track: Array<{
      id: number;
      awb_code: string;
      courier_company_id: number;
      shipment_id: number;
      order_id: number;
      pickup_date: string;
      delivered_date: string;
      weight: string;
      packages: number;
      current_status: string;
      delivered_to: string;
      destination: string;
      consignee_name: string;
      origin: string;
      courier_agent_details: string;
      edd: string;
    }>;
    shipment_track_activities: Array<{
      date: string;
      status: string;
      activity: string;
      location: string;
      sr_status_label: string;
    }>;
  };
}

interface ShiprocketNDRShipment {
  id: number;
  awb: string;
  order_id: number;
  shipment_id: number;
  courier_name: string;
  ndr_status: string;
  ndr_status_code: string;
  comment: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_address: string;
  buyer_city: string;
  buyer_state: string;
  buyer_pincode: string;
  ndr_date: string;
  action_taken: string;
}

interface ShiprocketReattemptPayload {
  awb: string;
  address1: string;
  address2?: string;
  phone: string;
  deferred_date?: string;
}

class ShiprocketService {
  private baseUrl = 'https://apiv2.shiprocket.in/v1/external';
  private token: string | null = null;
  private tokenExpiresAt: number | null = null;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private async authenticate(): Promise<string> {
    // Check if we have a valid token
    if (this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    const email = process.env.SHIPROCKET_API_EMAIL;
    const password = process.env.SHIPROCKET_API_PASSWORD;

    if (!email || !password) {
      throw new Error('Shiprocket credentials not configured. Please set SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD environment variables.');
    }

    try {
      const response = await axios.post<ShiprocketAuthResponse>(
        `${this.baseUrl}/auth/login`,
        { email, password }
      );

      this.token = response.data.token;
      // Token expires in 10 days by default, cache for 9 days to be safe
      this.tokenExpiresAt = Date.now() + (9 * 24 * 60 * 60 * 1000);

      console.log('[Shiprocket] Authentication successful, token cached');
      return this.token;
    } catch (error: any) {
      console.error('[Shiprocket] Authentication failed:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Shiprocket API');
    }
  }

  private async getAuthHeaders(): Promise<{ Authorization: string }> {
    const token = await this.authenticate();
    return { Authorization: `Bearer ${token}` };
  }

  async createShipment(payload: ShiprocketOrderPayload): Promise<ShiprocketCreateOrderResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axiosInstance.post<ShiprocketCreateOrderResponse>(
        '/orders/create/adhoc',
        payload,
        { headers }
      );

      console.log('[Shiprocket] Shipment created:', {
        orderId: response.data.order_id,
        shipmentId: response.data.shipment_id,
        awb: response.data.awb_code,
      });

      return response.data;
    } catch (error: any) {
      console.error('[Shiprocket] Create shipment failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to create shipment in Shiprocket');
    }
  }

  async trackShipment(awb: string): Promise<ShiprocketTrackResponse> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axiosInstance.get<ShiprocketTrackResponse>(
        `/courier/track/awb/${awb}`,
        { headers }
      );

      console.log('[Shiprocket] Shipment tracked:', { awb, status: response.data.tracking_data.shipment_status });
      return response.data;
    } catch (error: any) {
      console.error('[Shiprocket] Track shipment failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to track shipment');
    }
  }

  async getNDRShipments(): Promise<ShiprocketNDRShipment[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axiosInstance.get<{ data: ShiprocketNDRShipment[] }>(
        '/ndr/all',
        { headers }
      );

      console.log('[Shiprocket] NDR shipments fetched:', response.data.data.length);
      return response.data.data;
    } catch (error: any) {
      console.error('[Shiprocket] Get NDR shipments failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch NDR shipments');
    }
  }

  async getSpecificNDR(awb: string): Promise<ShiprocketNDRShipment> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axiosInstance.get<{ data: ShiprocketNDRShipment }>(
        `/ndr/${awb}`,
        { headers }
      );

      console.log('[Shiprocket] Specific NDR fetched:', { awb });
      return response.data.data;
    } catch (error: any) {
      console.error('[Shiprocket] Get specific NDR failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch NDR details');
    }
  }

  async reattemptDelivery(payload: ShiprocketReattemptPayload): Promise<{ success: boolean; message: string }> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axiosInstance.post(
        '/ndr/reattempt',
        payload,
        { headers }
      );

      console.log('[Shiprocket] Reattempt scheduled:', { awb: payload.awb });
      return {
        success: true,
        message: 'Reattempt scheduled successfully',
      };
    } catch (error: any) {
      console.error('[Shiprocket] Reattempt delivery failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to schedule reattempt');
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.authenticate();
      return {
        success: true,
        message: 'Successfully connected to Shiprocket API',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to connect to Shiprocket API',
      };
    }
  }
}

export const shiprocketService = new ShiprocketService();

export type {
  ShiprocketOrderPayload,
  ShiprocketCreateOrderResponse,
  ShiprocketTrackResponse,
  ShiprocketNDRShipment,
  ShiprocketReattemptPayload,
};
