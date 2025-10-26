import crypto from "crypto";

interface ShopifyConfig {
  storeUrl: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret?: string;
}

export class ShopifyClient {
  private config: ShopifyConfig;
  private baseUrl: string;

  constructor(config: ShopifyConfig) {
    this.config = config;
    this.baseUrl = `https://${config.storeUrl}/admin/api/2024-01`;
  }

  private getHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": this.config.apiKey,
    };
  }

  async fetchOrders(params?: {
    status?: string;
    limit?: number;
    sinceId?: string;
  }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set("status", params.status);
    if (params?.limit) queryParams.set("limit", params.limit.toString());
    if (params?.sinceId) queryParams.set("since_id", params.sinceId);

    const url = `${this.baseUrl}/orders.json?${queryParams.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Shopify API error details:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        url: url.replace(/\.myshopify\.com/, '.myshopify.com'), // Don't log full URL
        hasApiKey: !!this.config.apiKey,
        apiKeyLength: this.config.apiKey?.length || 0
      });
      throw new Error(`Shopify API error: ${response.statusText} (${response.status})`);
    }

    return await response.json();
  }

  async fetchOrder(orderId: string): Promise<any> {
    const url = `${this.baseUrl}/orders/${orderId}.json`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async fetchCustomer(customerId: string): Promise<any> {
    const url = `${this.baseUrl}/customers/${customerId}.json`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async getShopInfo(customConfig?: ShopifyConfig & { accessToken: string }): Promise<any> {
    const config = customConfig || this.config;
    const baseUrl = `https://${config.storeUrl}/admin/api/2024-01`;
    const url = `${baseUrl}/shop.json`;
    
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": customConfig?.accessToken || this.config.apiKey,
    };

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Shopify API error: ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    return data.shop;
  }

  verifyWebhook(body: string, hmacHeader: string): boolean {
    if (!this.config.webhookSecret) {
      throw new Error("Webhook secret not configured - refusing to process unverified webhooks");
    }

    const hash = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(body, "utf8")
      .digest("base64");

    return hash === hmacHeader;
  }

  async registerWebhook(
    topic: string,
    address: string,
  ): Promise<any> {
    const url = `${this.baseUrl}/webhooks.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        webhook: {
          topic,
          address,
          format: "json",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to register webhook: ${response.statusText}`);
    }

    return await response.json();
  }

  async listWebhooks(): Promise<any> {
    const url = `${this.baseUrl}/webhooks.json`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to list webhooks: ${response.statusText}`);
    }

    return await response.json();
  }

  // ============================================================================
  // GRAPHQL MUTATIONS FOR SHOPIFY SYNC
  // ============================================================================

  private async graphqlRequest(query: string, variables?: any): Promise<any> {
    // Sanitize store URL: remove https://, http://, and trailing slashes
    const sanitizedStoreUrl = this.config.storeUrl
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    
    const url = `https://${sanitizedStoreUrl}/admin/api/2025-01/graphql.json`;
    
    // Log the request for debugging
    console.log('[Shopify GraphQL] Request:', {
      url,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.config.apiKey.substring(0, 10) + '...' // Mask token
      },
      query: query.substring(0, 100) + '...', // Truncate query
      variables: JSON.stringify(variables)
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.config.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[Shopify GraphQL] HTTP Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody
      });
      throw new Error(`Shopify GraphQL error: ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      console.error('[Shopify GraphQL] GraphQL Errors:', JSON.stringify(result.errors, null, 2));
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    // Log userErrors if present in the response
    const mutationKey = Object.keys(result.data || {})[0];
    if (mutationKey && result.data[mutationKey]?.userErrors?.length > 0) {
      console.warn('[Shopify GraphQL] User Errors:', JSON.stringify(result.data[mutationKey].userErrors, null, 2));
    }

    return result.data;
  }

  async updateOrderTags(shopifyOrderId: string, tags: string[]): Promise<any> {
    const query = `
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, '')}`,
        tags: tags,
      },
    };

    const data = await this.graphqlRequest(query, variables);
    
    if (data.orderUpdate.userErrors.length > 0) {
      throw new Error(`Order update failed: ${JSON.stringify(data.orderUpdate.userErrors)}`);
    }

    return data.orderUpdate.order;
  }

  async addOrderNote(shopifyOrderId: string, note: string): Promise<any> {
    const query = `
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            note
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, '')}`,
        note: note,
      },
    };

    const data = await this.graphqlRequest(query, variables);
    
    if (data.orderUpdate.userErrors.length > 0) {
      throw new Error(`Order note update failed: ${JSON.stringify(data.orderUpdate.userErrors)}`);
    }

    return data.orderUpdate.order;
  }

  async cancelOrder(
    shopifyOrderId: string, 
    reason: string, 
    notifyCustomer: boolean = true,
    restock: boolean = true
  ): Promise<any> {
    // STEP 1: Validate order state before cancellation
    const orderState = await this.getOrderState(shopifyOrderId);
    
    // Check if already cancelled
    if (orderState.cancelledAt !== null) {
      throw new Error("Order already cancelled");
    }
    
    // Check if voided or refunded
    if (orderState.displayFinancialStatus === "VOIDED" || orderState.displayFinancialStatus === "REFUNDED") {
      throw new Error("Order already cancelled/refunded");
    }
    
    // Check if fulfilled
    if (orderState.displayFulfillmentStatus === "FULFILLED" || orderState.displayFulfillmentStatus === "PARTIALLY_FULFILLED") {
      throw new Error("Cannot cancel fulfilled orders");
    }
    
    // Check if archived
    if (orderState.closed === true) {
      throw new Error("Cannot cancel archived orders");
    }

    // STEP 2: Proceed with cancellation
    const query = `
      mutation orderCancel($orderId: ID!, $reason: OrderCancelReason!, $notifyCustomer: Boolean!, $restock: Boolean!, $refund: Boolean!) {
        orderCancel(
          orderId: $orderId
          notifyCustomer: $notifyCustomer
          restock: $restock
          reason: $reason
          refund: $refund
        ) {
          job {
            id
            done
          }
          orderCancelUserErrors {
            field
            message
            code
          }
        }
      }
    `;

    // Map our cancellation reasons to Shopify's enum values
    const shopifyReasonMap: Record<string, string> = {
      "Customer changed mind": "CUSTOMER",
      "Found better price elsewhere": "CUSTOMER",
      "Wrong item/size/color": "INVENTORY",
      "Delivery time too long": "CUSTOMER",
      "Family member disapproved": "CUSTOMER",
      "Fake/test order": "FRAUD",
      "Customer unreachable": "CUSTOMER",
      "Address issues": "CUSTOMER",
      "Other": "OTHER",
    };

    const shopifyReason = shopifyReasonMap[reason] || "OTHER";

    const variables = {
      orderId: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, '')}`,
      reason: shopifyReason,
      notifyCustomer: notifyCustomer,
      restock: restock,
      refund: true,
    };

    const data = await this.graphqlRequest(query, variables);
    
    if (data.orderCancel.orderCancelUserErrors && data.orderCancel.orderCancelUserErrors.length > 0) {
      throw new Error(`Order cancellation failed: ${JSON.stringify(data.orderCancel.orderCancelUserErrors)}`);
    }

    return data.orderCancel.job;
  }

  async updateMetafield(
    shopifyOrderId: string, 
    key: string, 
    value: string, 
    type: string = "single_line_text_field"
  ): Promise<any> {
    const query = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      metafields: [
        {
          ownerId: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, '')}`,
          namespace: "orderflowai",
          key: key,
          value: value,
          type: type,
        },
      ],
    };

    const data = await this.graphqlRequest(query, variables);
    
    if (data.metafieldsSet.userErrors.length > 0) {
      throw new Error(`Metafield update failed: ${JSON.stringify(data.metafieldsSet.userErrors)}`);
    }

    return data.metafieldsSet.metafields;
  }

  async getOrderState(shopifyOrderId: string): Promise<{
    cancelledAt: string | null;
    displayFinancialStatus: string;
    displayFulfillmentStatus: string;
    closed: boolean;
  }> {
    const query = `
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          closed
        }
      }
    `;

    const variables = {
      id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, '')}`,
    };

    const data = await this.graphqlRequest(query, variables);
    
    if (!data.order) {
      throw new Error(`Order not found: ${shopifyOrderId}`);
    }

    return {
      cancelledAt: data.order.cancelledAt,
      displayFinancialStatus: data.order.displayFinancialStatus,
      displayFulfillmentStatus: data.order.displayFulfillmentStatus,
      closed: data.order.closed,
    };
  }
}

// Load credentials dynamically from DB or environment variables
async function loadShopifyCredentials(): Promise<ShopifyConfig> {
  try {
    // Try to import storage (avoid circular dependency)
    const { storage } = await import("./storage");
    const { decrypt } = await import("./encryption");
    
    const credentials = await storage.getShopifyCredentials();
    
    if (credentials && credentials.isActive) {
      // Use database credentials (decrypted)
      return {
        storeUrl: credentials.storeUrl,
        apiKey: decrypt(credentials.accessToken), // Use accessToken as the API key for requests
        apiSecret: decrypt(credentials.apiSecret),
        webhookSecret: credentials.webhookSecret ? decrypt(credentials.webhookSecret) : undefined,
      };
    }
  } catch (error) {
    console.log("No database credentials found, falling back to environment variables");
  }

  // Fallback to environment variables
  return {
    storeUrl: process.env.SHOPIFY_STORE_URL!,
    apiKey: process.env.SHOPIFY_API_KEY!,
    apiSecret: process.env.SHOPIFY_API_SECRET!,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
  };
}

// Initialize with environment variables (will be updated when first request comes in)
const initialConfig = {
  storeUrl: process.env.SHOPIFY_STORE_URL || "placeholder.myshopify.com",
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecret: process.env.SHOPIFY_API_SECRET || "",
  webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
};

console.log('Shopify configuration status:', {
  hasStoreUrl: !!initialConfig.storeUrl,
  hasApiKey: !!initialConfig.apiKey,
  hasApiSecret: !!initialConfig.apiSecret,
  hasWebhookSecret: !!initialConfig.webhookSecret,
  storeUrlFormat: initialConfig.storeUrl?.includes('.myshopify.com') ? 'valid' : 'invalid',
});

export const shopifyClient = new ShopifyClient(initialConfig);

// Update client configuration when needed
export async function updateShopifyClient() {
  const config = await loadShopifyCredentials();
  (shopifyClient as any).config = config;
  (shopifyClient as any).baseUrl = `https://${config.storeUrl}/admin/api/2024-01`;
  return shopifyClient;
}
