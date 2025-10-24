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
