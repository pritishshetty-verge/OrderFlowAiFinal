import crypto from "crypto";

interface ShopifyConfig {
  storeUrl: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret?: string;
  useClientCredentials?: boolean;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

export class ShopifyClient {
  private config: ShopifyConfig;
  private baseUrl: string;
  private tokenCache: TokenCache | null = null;

  constructor(config: ShopifyConfig) {
    this.config = config;
    this.baseUrl = `https://${this.sanitizeStoreUrl(config.storeUrl)}/admin/api/2024-01`;
  }

  private sanitizeStoreUrl(url: string): string {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  private async fetchClientCredentialsToken(): Promise<TokenCache> {
    const domain = this.sanitizeStoreUrl(this.config.storeUrl);
    const url = `https://${domain}/admin/oauth/access_token`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.apiKey,
        client_secret: this.config.apiSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Shopify OAuth token fetch failed: ${response.status} ${response.statusText} - ${body}`,
      );
    }

    const data = await response.json();
    const expiresIn: number = data.expires_in ?? 86400; // default 24h

    const cache: TokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    console.log(
      `[Shopify] Client credentials token fetched, expires in ${expiresIn}s`,
    );
    return cache;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.config.useClientCredentials) {
      return this.config.apiKey;
    }

    const now = Date.now();
    if (
      this.tokenCache &&
      this.tokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS > now
    ) {
      return this.tokenCache.accessToken;
    }

    this.tokenCache = await this.fetchClientCredentialsToken();
    return this.tokenCache.accessToken;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await this.getAccessToken();
    return {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
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
      headers: await this.getHeaders(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Shopify API error details:", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        hasApiKey: !!this.config.apiKey,
      });
      throw new Error(
        `Shopify API error: ${response.statusText} (${response.status})`,
      );
    }

    return await response.json();
  }

  async fetchOrder(orderId: string): Promise<any> {
    const url = `${this.baseUrl}/orders/${orderId}.json`;
    const response = await fetch(url, {
      method: "GET",
      headers: await this.getHeaders(),
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
      headers: await this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async getShopInfo(
    customConfig?: ShopifyConfig & { accessToken?: string },
  ): Promise<any> {
    const storeUrl = customConfig?.storeUrl || this.config.storeUrl;
    const domain = this.sanitizeStoreUrl(storeUrl);
    const url = `https://${domain}/admin/api/2024-01/shop.json`;

    let token: string;
    if (customConfig?.accessToken) {
      token = customConfig.accessToken;
    } else if (customConfig) {
      const tempClient = new ShopifyClient({
        storeUrl: customConfig.storeUrl,
        apiKey: customConfig.apiKey,
        apiSecret: customConfig.apiSecret,
        useClientCredentials: customConfig.useClientCredentials,
      });
      token = await tempClient.getAccessToken();
    } else {
      token = await this.getAccessToken();
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    };

    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Shopify API error: ${response.statusText} - ${errorBody}`,
      );
    }

    const data = await response.json();
    return data.shop;
  }

  async fetchAllProducts(): Promise<any[]> {
    const allProducts: any[] = [];
    let pageInfo: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const queryParams = new URLSearchParams();
      queryParams.set("limit", "250");
      if (pageInfo) queryParams.set("page_info", pageInfo);

      const url = `${this.baseUrl}/products.json?${queryParams.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        headers: await this.getHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Shopify products API error:", {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
        });
        throw new Error(
          `Shopify API error: ${response.statusText} (${response.status})`,
        );
      }

      const data = await response.json();
      allProducts.push(...(data.products || []));

      const linkHeader = response.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(
          /<[^>]*page_info=([^>&>]+)[^>]*>;\s*rel="next"/,
        );
        pageInfo = match ? match[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }
    }

    return allProducts;
  }

  verifyWebhook(body: string, hmacHeader: string): boolean {
    if (!this.config.webhookSecret) {
      throw new Error(
        "Webhook secret not configured - refusing to process unverified webhooks",
      );
    }

    const hash = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(body, "utf8")
      .digest("base64");

    return hash === hmacHeader;
  }

  async registerWebhook(topic: string, address: string): Promise<any> {
    const url = `${this.baseUrl}/webhooks.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: await this.getHeaders(),
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
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
      headers: await this.getHeaders(),
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
    const domain = this.sanitizeStoreUrl(this.config.storeUrl);
    const url = `https://${domain}/admin/api/2025-01/graphql.json`;
    const token = await this.getAccessToken();

    console.log("[Shopify GraphQL] Request:", {
      url,
      tokenPrefix: token.substring(0, 10) + "...",
      query: query.substring(0, 100) + "...",
      variables: JSON.stringify(variables),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[Shopify GraphQL] HTTP Error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(
        `Shopify GraphQL error: ${response.statusText} - ${errorBody}`,
      );
    }

    const result = await response.json();

    if (result.errors) {
      console.error(
        "[Shopify GraphQL] GraphQL Errors:",
        JSON.stringify(result.errors, null, 2),
      );
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    const mutationKey = Object.keys(result.data || {})[0];
    if (
      mutationKey &&
      result.data[mutationKey]?.userErrors?.length > 0
    ) {
      console.warn(
        "[Shopify GraphQL] User Errors:",
        JSON.stringify(result.data[mutationKey].userErrors, null, 2),
      );
    }

    return result.data;
  }

  async updateOrderTags(
    shopifyOrderId: string,
    tags: string[],
  ): Promise<any> {
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
        id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
        tags,
      },
    };

    const data = await this.graphqlRequest(query, variables);

    if (data.orderUpdate.userErrors.length > 0) {
      throw new Error(
        `Order update failed: ${JSON.stringify(data.orderUpdate.userErrors)}`,
      );
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
        id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
        note,
      },
    };

    const data = await this.graphqlRequest(query, variables);

    if (data.orderUpdate.userErrors.length > 0) {
      throw new Error(
        `Order note update failed: ${JSON.stringify(data.orderUpdate.userErrors)}`,
      );
    }

    return data.orderUpdate.order;
  }

  async updateOrderShippingAddress(
    shopifyOrderId: string,
    shippingAddress: {
      firstName?: string;
      lastName?: string;
      address1?: string;
      address2?: string;
      city?: string;
      province?: string;
      zip?: string;
      country?: string;
      phone?: string;
    },
  ): Promise<any> {
    const query = `
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              provinceCode
              zip
              country
              countryCodeV2
              phone
            }
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
        id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
        shippingAddress: {
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          address1: shippingAddress.address1,
          address2: shippingAddress.address2,
          city: shippingAddress.city,
          province: shippingAddress.province,
          zip: shippingAddress.zip,
          country: shippingAddress.country || "India",
          phone: shippingAddress.phone,
        },
      },
    };

    const data = await this.graphqlRequest(query, variables);

    if (data.orderUpdate.userErrors.length > 0) {
      throw new Error(
        `Shipping address update failed: ${JSON.stringify(data.orderUpdate.userErrors)}`,
      );
    }

    return data.orderUpdate.order;
  }

  async cancelOrder(
    shopifyOrderId: string,
    reason: string,
    notifyCustomer: boolean = true,
    restock: boolean = true,
  ): Promise<any> {
    const orderState = await this.getOrderState(shopifyOrderId);

    if (orderState.cancelledAt !== null) {
      throw new Error("Order already cancelled");
    }
    if (
      orderState.displayFinancialStatus === "VOIDED" ||
      orderState.displayFinancialStatus === "REFUNDED"
    ) {
      throw new Error("Order already cancelled/refunded");
    }
    if (
      orderState.displayFulfillmentStatus === "FULFILLED" ||
      orderState.displayFulfillmentStatus === "PARTIALLY_FULFILLED"
    ) {
      throw new Error("Cannot cancel fulfilled orders");
    }
    if (orderState.closed === true) {
      throw new Error("Cannot cancel archived orders");
    }

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

    const shopifyReasonMap: Record<string, string> = {
      "Customer changed mind": "CUSTOMER",
      "Found better price elsewhere": "CUSTOMER",
      "Wrong item/size/color": "INVENTORY",
      "Delivery time too long": "CUSTOMER",
      "Family member disapproved": "CUSTOMER",
      "Fake/test order": "FRAUD",
      "Customer unreachable": "CUSTOMER",
      "Address issues": "CUSTOMER",
      Other: "OTHER",
    };

    const shopifyReason = shopifyReasonMap[reason] || "OTHER";

    const variables = {
      orderId: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
      reason: shopifyReason,
      notifyCustomer,
      restock,
      refund: true,
    };

    const data = await this.graphqlRequest(query, variables);

    if (
      data.orderCancel.orderCancelUserErrors &&
      data.orderCancel.orderCancelUserErrors.length > 0
    ) {
      throw new Error(
        `Order cancellation failed: ${JSON.stringify(data.orderCancel.orderCancelUserErrors)}`,
      );
    }

    return data.orderCancel.job;
  }

  async updateMetafield(
    shopifyOrderId: string,
    key: string,
    value: string,
    type: string = "single_line_text_field",
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
          ownerId: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
          namespace: "orderflowai",
          key,
          value,
          type,
        },
      ],
    };

    const data = await this.graphqlRequest(query, variables);

    if (data.metafieldsSet.userErrors.length > 0) {
      throw new Error(
        `Metafield update failed: ${JSON.stringify(data.metafieldsSet.userErrors)}`,
      );
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
      id: `gid://shopify/Order/${shopifyOrderId.replace(/^s/, "")}`,
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

// ============================================================================
// CREDENTIAL LOADING
// ============================================================================

async function loadShopifyCredentials(): Promise<ShopifyConfig> {
  try {
    const { storage } = await import("./storage");
    const { decrypt } = await import("./encryption");

    const credentials = await storage.getShopifyCredentials();

    if (credentials && credentials.isActive) {
      return {
        storeUrl: credentials.storeUrl,
        apiKey: decrypt(credentials.accessToken),
        apiSecret: decrypt(credentials.apiSecret),
        webhookSecret: credentials.webhookSecret
          ? decrypt(credentials.webhookSecret)
          : undefined,
        useClientCredentials: false,
      };
    }
  } catch {
    console.log(
      "No database credentials found, falling back to environment variables",
    );
  }

  const shopDomain =
    process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_STORE_URL!;

  return {
    storeUrl: shopDomain,
    apiKey: process.env.SHOPIFY_API_KEY!,
    apiSecret: process.env.SHOPIFY_API_SECRET!,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
    useClientCredentials: true,
  };
}

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

const shopDomain =
  process.env.SHOPIFY_SHOP_DOMAIN ||
  process.env.SHOPIFY_STORE_URL ||
  "placeholder.myshopify.com";

const initialConfig: ShopifyConfig = {
  storeUrl: shopDomain,
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecret: process.env.SHOPIFY_API_SECRET || "",
  webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
  useClientCredentials: true,
};

console.log("Shopify configuration status:", {
  hasStoreUrl: !!initialConfig.storeUrl,
  hasClientId: !!initialConfig.apiKey,
  hasClientSecret: !!initialConfig.apiSecret,
  hasWebhookSecret: !!initialConfig.webhookSecret,
  storeUrlFormat: initialConfig.storeUrl?.includes(".myshopify.com")
    ? "valid"
    : "invalid",
  authMode: "client_credentials_grant",
});

export const shopifyClient = new ShopifyClient(initialConfig);

export async function updateShopifyClient() {
  const config = await loadShopifyCredentials();
  (shopifyClient as any).config = config;
  (shopifyClient as any).baseUrl = `https://${shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/admin/api/2024-01`;
  (shopifyClient as any).tokenCache = null;
  return shopifyClient;
}
