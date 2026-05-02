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

// Shape of a webhook record as returned by Shopify's REST Admin API
// (`GET /admin/api/{version}/webhooks.json`). Narrow type — we only
// touch the fields the idempotent registration needs.
export interface ShopifyWebhook {
  id: number;
  topic: string;
  address: string;
  format: string;
  created_at?: string;
  updated_at?: string;
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

  // Fetch every test-mode order (Shopify's `test=true` flag) across the
  // whole store, paginated. Uses the same Link-header cursor pattern as
  // fetchAllProducts. Shopify's REST filter `test=true` is accepted as
  // a query param; we also filter client-side as a defence-in-depth in
  // case the param is ever silently ignored.
  async fetchAllTestOrders(): Promise<
    Array<{ id: number; name: string; test: boolean }>
  > {
    const out: Array<{ id: number; name: string; test: boolean }> = [];
    let pageInfo: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const params = new URLSearchParams();
      params.set("limit", "250");
      params.set("status", "any");
      params.set("fields", "id,name,test");
      // Initial page can pass additional filters; Link-cursor pages
      // must NOT include any filter other than page_info.
      if (pageInfo) {
        params.set("page_info", pageInfo);
      } else {
        params.set("test", "true");
      }

      const url = `${this.baseUrl}/orders.json?${params.toString()}`;
      const response = await fetch(url, {
        method: "GET",
        headers: await this.getHeaders(),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Shopify test-orders API error:", {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
        });
        throw new Error(
          `Shopify API error: ${response.statusText} (${response.status})`,
        );
      }
      const data = await response.json();
      for (const o of data.orders || []) {
        if (o.test === true) {
          out.push({ id: Number(o.id), name: String(o.name ?? ""), test: true });
        }
      }

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

    return out;
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

  // ── Webhook registration ──────────────────────────────────────────
  // Idempotent by design so it's safe to call on every server boot:
  //   • "unchanged" — same topic+address already registered, no-op
  //   • "updated"   — topic exists but at a different address (e.g.
  //                   ngrok tunnel rotated), we PUT the new address
  //   • "created"   — topic wasn't registered, we POST a new one
  //
  // Callers pass in a pre-fetched `existing` list to avoid re-listing
  // once per registration. See `registerAllWebhooks()` for usage.
  async registerWebhook(
    topic: string,
    address: string,
    existing?: ShopifyWebhook[],
  ): Promise<{
    action: "created" | "updated" | "unchanged";
    webhook: ShopifyWebhook;
  }> {
    const list = existing ?? (await this.listWebhooks()).webhooks ?? [];
    const match = list.find((w: ShopifyWebhook) => w.topic === topic);

    // Same topic + same address → nothing to do.
    if (match && match.address === address) {
      return { action: "unchanged", webhook: match };
    }

    // Same topic, different address → PUT to update the address. This
    // handles the ngrok-URL-rotation case without leaving orphan
    // registrations pointing at dead hosts.
    if (match && match.address !== address) {
      const url = `${this.baseUrl}/webhooks/${match.id}.json`;
      const response = await fetch(url, {
        method: "PUT",
        headers: await this.getHeaders(),
        body: JSON.stringify({ webhook: { id: match.id, address } }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Failed to update webhook ${match.id} (${topic}): ${response.status} ${response.statusText} — ${body}`,
        );
      }
      const json = await response.json();
      return { action: "updated", webhook: json.webhook };
    }

    // New topic → POST. Shopify returns 422 if we race with another
    // process; treat that as "already exists" and fall through to a
    // second listWebhooks() to pick up whichever one won.
    const url = `${this.baseUrl}/webhooks.json`;
    const response = await fetch(url, {
      method: "POST",
      headers: await this.getHeaders(),
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    });

    if (response.status === 422) {
      const fresh = (await this.listWebhooks()).webhooks ?? [];
      const now = fresh.find((w: ShopifyWebhook) => w.topic === topic);
      if (now) return { action: "unchanged", webhook: now };
      // Fall through with the original 422 error if we still can't find it.
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to register webhook (${topic} → ${address}): ${response.status} ${response.statusText} — ${body}`,
      );
    }

    const json = await response.json();
    return { action: "created", webhook: json.webhook };
  }

  async listWebhooks(): Promise<{ webhooks: ShopifyWebhook[] }> {
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

  // Register the full set of webhooks Pare needs. Topic → subpath
  // mapping matches the handlers wired in server/routes.ts. One
  // listWebhooks() call is reused for all four registrations so we
  // don't hammer Shopify on every boot.
  async registerAllWebhooks(appUrl: string): Promise<{
    topics: Array<{
      topic: string;
      address: string;
      action: "created" | "updated" | "unchanged" | "failed";
      error?: string;
    }>;
  }> {
    const base = appUrl.replace(/\/+$/, "");
    const TOPIC_MAP: Array<{ topic: string; subpath: string }> = [
      { topic: "orders/create",       subpath: "/api/webhooks/orders/create" },
      { topic: "orders/updated",      subpath: "/api/webhooks/orders/update" },
      { topic: "orders/cancelled",    subpath: "/api/webhooks/orders/cancelled" },
      { topic: "fulfillments/update", subpath: "/api/webhooks/fulfillments/update" },
    ];

    // Fetch once, reuse for all four registrations.
    let existing: ShopifyWebhook[] = [];
    try {
      const res = await this.listWebhooks();
      existing = res.webhooks ?? [];
    } catch (err: any) {
      // If we can't list, don't try to register — every call would
      // trip the duplicate-detection fallback unnecessarily. Surface
      // the failure for each topic so the UI can show it.
      const msg = err?.message ?? String(err);
      return {
        topics: TOPIC_MAP.map((t) => ({
          topic: t.topic,
          address: `${base}${t.subpath}`,
          action: "failed" as const,
          error: `listWebhooks() failed: ${msg}`,
        })),
      };
    }

    const results: Array<{
      topic: string;
      address: string;
      action: "created" | "updated" | "unchanged" | "failed";
      error?: string;
    }> = [];
    for (const { topic, subpath } of TOPIC_MAP) {
      const address = `${base}${subpath}`;
      try {
        const { action } = await this.registerWebhook(topic, address, existing);
        results.push({ topic, address, action });
      } catch (err: any) {
        results.push({
          topic,
          address,
          action: "failed",
          error: err?.message ?? String(err),
        });
      }
    }
    return { topics: results };
  }

  // ============================================================================
  // GRAPHQL MUTATIONS FOR SHOPIFY SYNC
  // ============================================================================

  private async graphqlRequest(query: string, variables?: any): Promise<any> {
    const domain = this.sanitizeStoreUrl(this.config.storeUrl);
    const url = `https://${domain}/admin/api/2025-01/graphql.json`;

    // Resolve a fresh token (uses cache when valid, re-fetches when expired)
    const token = await this.getAccessToken();
    const tokenPrefix = token ? token.substring(0, 10) + "..." : "MISSING";

    // Extract the mutation name for readable log labels
    const mutationMatch = query.match(/mutation\s+(\w+)/);
    const mutationName = mutationMatch?.[1] ?? "unknown";

    console.log(
      `[Shopify GraphQL] → ${mutationName}  url=${url}  token=${tokenPrefix}`,
    );
    console.log(
      `[Shopify GraphQL]   variables=${JSON.stringify(variables)}`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });

    // ── HTTP-level failure (401 Unauthorized, 403 Forbidden, 429 Rate-limit, etc.)
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[Shopify GraphQL] ✗ HTTP ${response.status} ${response.statusText}  mutation=${mutationName}  url=${url}`,
      );
      console.error(`[Shopify GraphQL]   response body: ${errorBody}`);
      throw new Error(
        `Shopify GraphQL HTTP ${response.status} (${response.statusText}) for ${mutationName}: ${errorBody}`,
      );
    }

    const result = await response.json();

    // ── GraphQL-level errors (schema/syntax errors returned with HTTP 200)
    if (result.errors) {
      console.error(
        `[Shopify GraphQL] ✗ GraphQL errors for ${mutationName}:`,
        JSON.stringify(result.errors, null, 2),
      );
      throw new Error(
        `GraphQL errors in ${mutationName}: ${JSON.stringify(result.errors)}`,
      );
    }

    // ── Business-level userErrors (e.g. "Order does not exist", scope denied)
    const mutationKey = Object.keys(result.data || {})[0];
    if (mutationKey && result.data[mutationKey]?.userErrors?.length > 0) {
      const userErrors = result.data[mutationKey].userErrors;
      console.error(
        `[Shopify GraphQL] ✗ userErrors in ${mutationName}:`,
        JSON.stringify(userErrors, null, 2),
      );
    } else {
      console.log(
        `[Shopify GraphQL] ✓ ${mutationName} succeeded  HTTP ${response.status}`,
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
        apiKey: decrypt(credentials.apiKey),       // clientId
        apiSecret: decrypt(credentials.apiSecret), // clientSecret
        webhookSecret: credentials.webhookSecret
          ? decrypt(credentials.webhookSecret)
          : undefined,
        useClientCredentials: true,
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

  // Derive baseUrl dynamically from config.storeUrl so that REST calls always
  // target the correct store — critical for multi-store correctness.
  // Previously used the module-level `shopDomain` constant (frozen at startup
  // from env vars), which would have silently routed REST API calls to the
  // wrong store if DB credentials pointed to a different domain.
  const cleanDomain = config.storeUrl
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  console.log(
    `[Shopify] updateShopifyClient: reloading credentials → domain=${cleanDomain}, useClientCredentials=${config.useClientCredentials}`,
  );

  (shopifyClient as any).config = config;
  (shopifyClient as any).baseUrl = `https://${cleanDomain}/admin/api/2024-01`;
  (shopifyClient as any).tokenCache = null; // force fresh token on next request
  return shopifyClient;
}
