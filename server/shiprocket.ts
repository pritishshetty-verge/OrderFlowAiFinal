import axios, { AxiosInstance } from 'axios';

// Quality rating threshold for courier categorization
// Couriers with rating >= QUALITY_RATING_THRESHOLD go to "Serviceable" tab
// Couriers with 0 < rating < QUALITY_RATING_THRESHOLD go to "Low Rated" tab
// This threshold is easily adjustable based on operational requirements
const QUALITY_RATING_THRESHOLD = 3.8;

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

interface ShiprocketCourierServiceabilityPayload {
  pickup_postcode: string;
  delivery_postcode: string;
  cod: 0 | 1;
  weight: number;
  declared_value?: number;
}

interface ShiprocketSuppressionDates {
  action_on?: string;
  blocked_fm?: string;
  blocked_lm?: string;
  delay_remark?: string;
  pickup_delay_by?: number;
  pickup_delay_days?: string;
  pickup_delay_from?: string;
  pickup_delay_to?: string;
}

interface ShiprocketCourierPartner {
  courier_company_id: number;
  courier_name: string;
  freight_charge: number;
  cod_charges: number;
  other_charges: number;
  rate: number; // This is the total charge displayed by Shiprocket
  total_charge?: number; // Computed for backward compatibility
  rating: string;
  etd: string;
  estimated_delivery_days: string;
  pickup_availability: string;
  pickup_performance: number;
  delivery_performance: number;
  rto_performance: number;
  tracking_performance: number;
  rto_charges: number;
  courier_type: string;
  is_surface: boolean;
  is_hyperlocal: boolean;
  min_weight: number;
  qc_courier: number;
  recommendation_score?: number;
  suppression_dates: ShiprocketSuppressionDates | null;
  suppress_text?: string;
  suppress_date?: string;
  blocked?: number;
  base_courier_id: number;
  base_weight: number;
  block_cod: number;
  call_before_delivery: string;
  city: string;
  ship_type: number;
  delivery_boy_contact: string;
  pod_available: string;
  is_custom_rate: number;
  weight_cases: number;
  child_courier_id: number | null;
  is_recommended?: boolean;
  is_serviceable?: boolean;
  non_serviceable_reason?: string;
  has_warning?: boolean;
  warning_message?: string;
  category?: 'serviceable' | 'low_rated' | 'non_serviceable';
}

interface CategorizedCouriersResponse {
  serviceable: ShiprocketCourierPartner[];
  lowRated: ShiprocketCourierPartner[];
  nonServiceable: ShiprocketCourierPartner[];
  qualityRatingThreshold: number;
}

interface ShiprocketCourierServiceabilityResponse {
  data: {
    available_courier_companies: ShiprocketCourierPartner[];
    recommended_courier_company_id: number;
    shiprocket_recommended_courier_id: number;
  };
}

interface ShiprocketAssignCourierPayload {
  shipment_id: number;
  courier_id: number;
}

interface ShiprocketAssignCourierResponse {
  awb_assign_status: number;
  response: {
    data: {
      awb_code: string;
      courier_company_id: number;
      courier_name: string;
      shipment_id: number;
      order_id: number;
      pickup_scheduled_date: string;
      routing_code: string;
      applied_weight: number;
      charged_weight: number;
    };
  };
}

interface ShiprocketShipmentDetails {
  id: number;
  order_id: number;
  shipment_id: number;
  awb: string | null;
  courier_id: number | null;
  courier_name: string | null;
  status: string;
  weight: string;
  length: number;
  breadth: number;
  height: number;
  volumetric_weight: number;
  applied_weight: number;
  pickup_postcode: string;
  delivery_postcode: string;
  cod: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  customer_state: string;
  customer_pincode: string;
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

  async getAvailableCouriers(payload: ShiprocketCourierServiceabilityPayload): Promise<ShiprocketCourierPartner[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axiosInstance.get<ShiprocketCourierServiceabilityResponse>(
        '/courier/serviceability',
        { 
          headers,
          params: payload
        }
      );

      console.log('[Shiprocket] Available couriers fetched:', response.data.data.available_courier_companies.length);
      
      // Mark the recommended courier
      const recommendedId = response.data.data.shiprocket_recommended_courier_id || response.data.data.recommended_courier_company_id;
      const couriers = response.data.data.available_courier_companies.map(courier => ({
        ...courier,
        is_recommended: courier.courier_company_id === recommendedId
      }));

      return couriers;
    } catch (error: any) {
      console.error('[Shiprocket] Get available couriers failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch available couriers');
    }
  }

  async assignCourierAndShip(payload: ShiprocketAssignCourierPayload): Promise<ShiprocketAssignCourierResponse> {
    try {
      const headers = await this.getAuthHeaders();
      
      console.log('[Shiprocket] Assigning courier with payload:', payload);
      
      const response = await this.axiosInstance.post<ShiprocketAssignCourierResponse>(
        '/courier/assign/awb',
        payload,
        { headers }
      );

      console.log('[Shiprocket] FULL AWB Assignment Response:', 
        JSON.stringify(response.data, null, 2)
      );

      console.log('[Shiprocket] Courier assignment result:', {
        shipmentId: payload.shipment_id,
        courierId: payload.courier_id,
        awbAssignStatus: response.data.awb_assign_status,
        awbCode: response.data.response?.data?.awb_code,
        courierName: response.data.response?.data?.courier_name,
        pickupDate: response.data.response?.data?.pickup_scheduled_date,
        hasResponseData: !!response.data.response?.data,
      });

      return response.data;
    } catch (error: any) {
      console.error('[Shiprocket] Assign courier failed:', {
        error: error.response?.data || error.message,
        payload,
        statusCode: error.response?.status
      });
      throw new Error(error.response?.data?.message || 'Failed to assign courier');
    }
  }

  async getOrderDetails(shopifyOrderNumber: string): Promise<{ shipment_id: number; order_id: number } | null> {
    try {
      const headers = await this.getAuthHeaders();
      
      console.log('[Shiprocket] Querying order by channel_order_id:', shopifyOrderNumber);
      
      // Use channel_order_id to search for orders - this matches the Shopify order number
      const response = await this.axiosInstance.get(
        '/orders',
        { 
          headers,
          params: {
            channel_order_id: shopifyOrderNumber
          }
        }
      );

      console.log('[Shiprocket] API Response:', {
        totalResults: response.data.data?.length || 0,
        meta: response.data.meta,
        searchedFor: shopifyOrderNumber
      });

      if (response.data.data && response.data.data.length > 0) {
        // Log all returned orders to debug
        console.log('[Shiprocket] Returned orders:', response.data.data.map((o: any) => ({
          shiprocketOrderId: o.id,
          channelOrderId: o.channel_order_id,
          orderNumber: o.order_number,
          shipmentCount: o.shipments?.length || 0
        })));

        // Find the exact matching order by channel_order_id (Shopify order number)
        const matchingOrder = response.data.data.find((o: any) => 
          o.channel_order_id === shopifyOrderNumber || 
          o.order_number === shopifyOrderNumber
        );

        if (!matchingOrder) {
          console.error('[Shiprocket] No exact match found for order:', shopifyOrderNumber);
          console.error('[Shiprocket] Available orders:', response.data.data.map((o: any) => o.channel_order_id));
          return null;
        }

        console.log('[Shiprocket] Exact order match found:', {
          shiprocketOrderId: matchingOrder.id,
          channelOrderId: matchingOrder.channel_order_id,
          shipmentId: matchingOrder.shipments?.[0]?.id,
          shipmentCount: matchingOrder.shipments?.length || 0,
          requestedOrderNumber: shopifyOrderNumber
        });
        
        if (matchingOrder.shipments && matchingOrder.shipments.length > 0) {
          return {
            shipment_id: matchingOrder.shipments[0].id,
            order_id: matchingOrder.id
          };
        } else {
          console.warn('[Shiprocket] Order found but has no shipments:', {
            orderId: matchingOrder.id,
            channelOrderId: matchingOrder.channel_order_id
          });
          return null;
        }
      }
      
      console.log('[Shiprocket] No orders returned from API for:', shopifyOrderNumber);
      return null;
    } catch (error: any) {
      console.error('[Shiprocket] Get order details failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to get order details');
    }
  }

  async getShipmentDetails(shipmentId: number): Promise<ShiprocketShipmentDetails> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axiosInstance.get(
        `/shipments/${shipmentId}`,
        { headers }
      );

      const shipment = response.data.data;
      console.log('[Shiprocket] Shipment details fetched:', {
        shipmentId,
        weight: shipment.weight,
        dimensions: `${shipment.length}x${shipment.breadth}x${shipment.height}`
      });

      return shipment;
    } catch (error: any) {
      console.error('[Shiprocket] Get shipment details failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to get shipment details');
    }
  }

  async getCouriersForShipment(shipmentId: number, orderId?: number): Promise<CategorizedCouriersResponse> {
    try {
      // Shiprocket's serviceability API requires either:
      // 1. order_id parameter, OR
      // 2. pickup_postcode, delivery_postcode, cod, and weight parameters
      
      // Option 1: Use order_id if available (simplest and most accurate)
      if (orderId) {
        const headers = await this.getAuthHeaders();
        
        console.log('[Shiprocket] Fetching couriers for shipment:', { shipmentId, orderId });
        
        const response = await this.axiosInstance.get<ShiprocketCourierServiceabilityResponse>(
          '/courier/serviceability',
          { 
            headers,
            params: {
              order_id: orderId
            }
          }
        );

        console.log('[Shiprocket] RAW Courier API Response:', {
          orderId,
          totalCouriers: response.data.data.available_courier_companies?.length || 0,
          recommendedCourierId: response.data.data.shiprocket_recommended_courier_id || response.data.data.recommended_courier_company_id,
          responseKeys: Object.keys(response.data.data)
        });

        // Log COMPLETE raw API response for debugging
        console.log('\n========== COMPLETE RAW SHIPROCKET COURIER DATA ==========');
        console.log(JSON.stringify(response.data.data.available_courier_companies, null, 2));
        console.log('========== END RAW COURIER DATA ==========\n');

        // Create detailed comparison table
        console.log('\n========== COURIER COMPARISON TABLE ==========');
        console.log('Columns: Name | Total | Freight | COD | Rating | Score | Blocked | Suppress | QC | Surface');
        console.log('─'.repeat(120));
        
        response.data.data.available_courier_companies.forEach((courier: any) => {
          const blockedDates = courier.suppression_dates?.blocked_fm || courier.suppression_dates?.blocked_lm ? 
            `FM:${courier.suppression_dates.blocked_fm || 'N'} LM:${courier.suppression_dates.blocked_lm || 'N'}` : 'NONE';
          
          const totalCharge = courier.rate != null ? `₹${Number(courier.rate).toFixed(2)}` : 'N/A';
          const freightCharge = courier.freight_charge != null ? `₹${Number(courier.freight_charge).toFixed(2)}` : 'N/A';
          const codCharges = courier.cod_charges != null ? `₹${Number(courier.cod_charges).toFixed(2)}` : 'N/A';
          
          console.log([
            courier.courier_name.padEnd(35),
            totalCharge.padEnd(12),
            freightCharge.padEnd(12),
            codCharges.padEnd(12),
            String(courier.rating || 'N/A').padEnd(8),
            String(courier.recommendation_score || 'N/A').padEnd(8),
            String(courier.blocked || 0).padEnd(8),
            (courier.suppress_text?.substring(0, 20) || 'NONE').padEnd(22),
            String(courier.qc_courier || 0).padEnd(6),
            String(courier.is_surface).padEnd(8)
          ].join(' | '));
          
          if (courier.suppression_dates) {
            console.log(`    └─ Suppression: ${blockedDates}, Delay: ${courier.suppression_dates.delay_remark || 'NONE'}`);
          }
        });
        console.log('─'.repeat(120));
        console.log('========== END COMPARISON TABLE ==========\n');
        
        const recommendedId = response.data.data.shiprocket_recommended_courier_id || response.data.data.recommended_courier_company_id;
        const rawCouriers = response.data.data.available_courier_companies;

        console.log('[Shiprocket] All couriers before processing:', rawCouriers.map(c => ({
          id: c.courier_company_id,
          name: c.courier_name,
          freight: c.freight_charge,
          cod: c.cod_charges,
          rate: c.rate,
          qc_courier: c.qc_courier,
          blocked: c.blocked,
          suppress_text: c.suppress_text,
          suppression_dates: c.suppression_dates,
          rating: c.rating
        })));

        // Process all couriers and categorize into three buckets
        const processedCouriers = rawCouriers.map(courier => {
          // Add total_charge as computed field for backward compatibility
          const total_charge = courier.rate;
          const rating = parseFloat(courier.rating) || 0;
          
          // Determine courier category based on blocking status and rating
          let category: 'serviceable' | 'low_rated' | 'non_serviceable' = 'serviceable';
          let nonServiceableReason = '';
          let hasWarning = false;
          let warningMessage = '';
          
          // First, check if courier is blocked or suppressed (non-serviceable)
          if (courier.blocked === 1) {
            category = 'non_serviceable';
            nonServiceableReason = courier.suppress_text || 'Courier services are currently unavailable for this location';
            console.log(`[Shiprocket] Non-serviceable ${courier.courier_name}: blocked=1, reason="${nonServiceableReason}"`);
          }
          else if (courier.suppression_dates && 
              (courier.suppression_dates.blocked_fm || courier.suppression_dates.blocked_lm)) {
            category = 'non_serviceable';
            nonServiceableReason = courier.suppress_text || 
              `Courier services to the requested pin code are currently suspended${courier.suppression_dates.delay_remark ? ' due to ' + courier.suppression_dates.delay_remark.toLowerCase() : ''}`;
            console.log(`[Shiprocket] Non-serviceable ${courier.courier_name}: has blocking dates, reason="${nonServiceableReason}"`);
          }
          else if (courier.suppress_text && courier.suppress_text.trim() !== '') {
            // Suppress_text without blocking dates indicates operational issues but still serviceable
            category = 'non_serviceable';
            nonServiceableReason = courier.suppress_text;
            console.log(`[Shiprocket] Non-serviceable ${courier.courier_name}: suppress_text="${nonServiceableReason}"`);
          }
          // If not blocked, categorize by rating
          else if (rating > 0 && rating < QUALITY_RATING_THRESHOLD) {
            category = 'low_rated';
            console.log(`[Shiprocket] Low rated ${courier.courier_name}: rating=${rating}`);
          }
          // Otherwise, it's serviceable (rating >= QUALITY_RATING_THRESHOLD or no rating)
          else {
            category = 'serviceable';
            console.log(`[Shiprocket] Serviceable ${courier.courier_name}: rating=${rating}`);
          }
          
          // Check for warnings on serviceable/low_rated couriers
          if (category !== 'non_serviceable') {
            // Check for pickup/delivery delays
            if (courier.suppression_dates?.delay_remark && 
                !courier.suppression_dates.blocked_fm && 
                !courier.suppression_dates.blocked_lm) {
              hasWarning = true;
              warningMessage = `Delivery may be delayed due to ${courier.suppression_dates.delay_remark.toLowerCase()}`;
              console.log(`[Shiprocket] Warning for ${courier.courier_name}: ${warningMessage}`);
            }
          }
          
          return {
            ...courier,
            total_charge, // Add total_charge for backward compatibility with frontend
            is_recommended: courier.courier_company_id === recommendedId,
            category,
            non_serviceable_reason: nonServiceableReason,
            has_warning: hasWarning,
            warning_message: warningMessage
          };
        });

        // Categorize couriers into three arrays
        const serviceable = processedCouriers
          .filter(c => c.category === 'serviceable')
          .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)); // Sort by rating descending
        
        const lowRated = processedCouriers
          .filter(c => c.category === 'low_rated')
          .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)); // Sort by rating descending
        
        const nonServiceable = processedCouriers
          .filter(c => c.category === 'non_serviceable');

        console.log('[Shiprocket] Courier categorization:', {
          total: processedCouriers.length,
          serviceable: serviceable.length,
          lowRated: lowRated.length,
          nonServiceable: nonServiceable.length,
          serviceableList: serviceable.map(c => `${c.courier_name} (${c.rating})`),
          lowRatedList: lowRated.map(c => `${c.courier_name} (${c.rating})`),
          nonServiceableList: nonServiceable.map(c => ({ 
            name: c.courier_name, 
            reason: c.non_serviceable_reason 
          }))
        });

        return {
          serviceable,
          lowRated,
          nonServiceable,
          qualityRatingThreshold: QUALITY_RATING_THRESHOLD
        };
      }
      
      // Option 2: Fetch shipment details and construct serviceability params
      // (fallback if order_id not available)
      const shipment = await this.getShipmentDetails(shipmentId);

      const serviceabilityPayload: ShiprocketCourierServiceabilityPayload = {
        pickup_postcode: shipment.pickup_postcode,
        delivery_postcode: shipment.delivery_postcode || shipment.customer_pincode,
        cod: shipment.cod as 0 | 1,
        weight: shipment.applied_weight || parseFloat(shipment.weight),
        declared_value: shipment.total,
      };

      const couriers = await this.getAvailableCouriers(serviceabilityPayload);
      
      // Categorize the couriers (fallback path)
      const categorizedFallback = {
        serviceable: couriers.filter(c => {
          const rating = parseFloat(c.rating as any) || 0;
          return c.is_serviceable && rating >= QUALITY_RATING_THRESHOLD;
        }).sort((a, b) => (parseFloat(b.rating as any) || 0) - (parseFloat(a.rating as any) || 0)),
        
        lowRated: couriers.filter(c => {
          const rating = parseFloat(c.rating as any) || 0;
          return c.is_serviceable && rating > 0 && rating < QUALITY_RATING_THRESHOLD;
        }).sort((a, b) => (parseFloat(b.rating as any) || 0) - (parseFloat(a.rating as any) || 0)),
        
        nonServiceable: couriers.filter(c => !c.is_serviceable),
        qualityRatingThreshold: QUALITY_RATING_THRESHOLD
      };
      
      return categorizedFallback;
    } catch (error: any) {
      console.error('[Shiprocket] Get couriers for shipment failed:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch couriers for shipment');
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
  ShiprocketCourierServiceabilityPayload,
  ShiprocketCourierPartner,
  ShiprocketAssignCourierPayload,
  ShiprocketAssignCourierResponse,
  CategorizedCouriersResponse,
};
