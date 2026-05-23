import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/ui/settings-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useActiveStore } from "@/hooks/use-store";
import { RefreshCw, CheckCircle, Activity, ArrowRight, AlertCircle, Phone, Loader2, Package, Settings, CreditCard, ArrowLeftRight, Save, Download, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncResult {
  syncedCount: number;
  skippedCount: number;
  totalOrders: number;
}

interface ShopifySyncState {
  isRunning: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  syncedCount: number;
  skippedCount: number;
  failedCount: number;
  totalFetched: number;
  pagesFetched: number;
  lastSinceId: string | null;
  errors: Array<{ orderId: string; reason: string }>;
  errorsTruncated: boolean;
  lastError: string | null;
  reachedMaxPages: boolean;
}

interface BackendOrder {
  id: string;
  shopifyOrderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  totalAmount: string;
  paymentMethod: string;
  status: string;
  shippingAddress: string;
  createdAt: string;
  assignedTo: string | null;
  priority: string;
}

interface CredentialsStatus {
  configured: boolean;
  storeUrl: string | null;
  storeName: string | null;
  lastTested: string | null;
  testStatus: string | null;
  testMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────
// ShopifyConnectionCard
//
// The credentials/sync/disconnect surface. This is what the Integrations
// hub embeds inside its slide-over Sheet — everything operational
// (webhook status, product catalog, payment mapping, help) lives in
// separate exported components below so Settings can host them on the
// "Store Operations" tab.
// ─────────────────────────────────────────────────────────────────────
export function ShopifyConnectionCard() {
  const { toast } = useToast();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncProgress, setSyncProgress] = useState<ShopifySyncState | null>(null);
  const pollingRef = useRef<number | null>(null);

  // Stop polling on unmount so we don't leak intervals if the user navigates
  // away mid-sync.
  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Resume sync awareness on (re)mount: if the backend reports a sync is
  // already running (user switched tabs mid-sync and came back), immediately
  // hydrate the progress card and restart the polling interval. We also
  // restore the card for a sync that has *just* finished so the user can
  // still see the final counts and download the error CSV if needed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/shopify/sync/status");
        if (!res.ok || cancelled) return;
        const state = (await res.json()) as ShopifySyncState;
        if (state.startedAt) {
          setSyncProgress(state);
        }
        if (state.isRunning) {
          startPolling();
        }
      } catch {
        // Initial status fetch is best-effort; ignore failures.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPolling = () => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const pollSyncStatus = async () => {
    try {
      const res = await fetch("/api/shopify/sync/status");
      if (!res.ok) return;
      const state = (await res.json()) as ShopifySyncState;
      setSyncProgress(state);
      if (!state.isRunning) {
        stopPolling();
      }
    } catch {
      // Transient polling failure — ignore; next tick will retry.
    }
  };

  const startPolling = () => {
    stopPolling();
    // Poll immediately, then every 1.5s.
    pollSyncStatus();
    pollingRef.current = window.setInterval(pollSyncStatus, 1500);
  };

  // Build a CSV from the errors array and trigger a browser download.
  const downloadErrorsCsv = () => {
    if (!syncProgress || syncProgress.errors.length === 0) return;
    const escape = (v: string) => {
      // RFC 4180: wrap in quotes, double any embedded quote.
      const needsQuote = /[",\r\n]/.test(v);
      const escaped = v.replace(/"/g, '""');
      return needsQuote ? `"${escaped}"` : escaped;
    };
    const header = "Order ID,Reason";
    const rows = syncProgress.errors.map(
      (e) => `${escape(e.orderId)},${escape(e.reason)}`,
    );
    const csv = [header, ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `shopify-sync-errors-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Multi-store source of truth: whichever store the sidebar
  // switcher currently points at. Replaces the legacy
  // /api/shopify/credentials/status lookup, which was tied to the
  // single-row shopify_credentials table and was the reason this
  // card kept showing "OLB" even after the user switched to a
  // second store (Phase 4 bug fix).
  //
  // The interceptor in lib/queryClient.ts already attaches
  // X-Active-Store-Id on every fetch, so order count, sync calls,
  // and webhook status all naturally re-scope when the user picks
  // a different store in the sidebar — we just need to render
  // identity from the active store object directly.
  const {
    activeStore,
    stores: accessibleStores,
    loading: storesLoading,
    hasMultipleStores,
  } = useActiveStore();

  // Pull the lightweight order count to surface "Total Orders" on the
  // connection card. The Phase-3 fetch interceptor attaches the
  // active store id, so this number is always scoped to whichever
  // store the user is currently looking at. Webhook health is shown
  // by ShopifyWebhookStatusCard (Settings → Store Operations).
  //
  // Keying the query on activeStore.id forces a refetch when the
  // user switches stores — without this, React Query would serve
  // the previous store's cached total before the next 30s tick.
  const { data: recentOrderData } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders?limit=1", activeStore?.id ?? "none"],
    queryFn: async () => {
      const res = await fetch("/api/orders?limit=1", {
        credentials: "include",
        headers: activeStore?.id
          ? { "X-Active-Store-Id": activeStore.id }
          : undefined,
      });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!activeStore,
    refetchInterval: 30000,
  });

  // A store is "connected" once there's an active store row at all —
  // the POST /api/stores endpoint only inserts rows after a
  // successful credential test, so an active store in user_stores
  // implies working credentials. Storage of last-tested-at lives on
  // the row for future surface; right now the bool suffices.
  const isConnected = !!activeStore;

  // Manual sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      // Kick off polling immediately so the UI shows activity even during
      // the first page fetch (which can take a few seconds).
      startPolling();
      const response = await apiRequest("POST", "/api/shopify/sync", {
        limit: 250,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSyncResult(data);
      // Do one final poll to flush the terminal state, then stop.
      pollSyncStatus();
      stopPolling();
      toast({
        title: "Sync Completed",
        description: `Synced ${data.syncedCount} new · skipped ${data.skippedCount} · failed ${data.failedCount ?? 0}`,
      });
    },
    onError: (error: Error) => {
      pollSyncStatus();
      stopPolling();
      const errorMessage = error.message || "Failed to sync orders from Shopify.";
      const isUnauthorized = errorMessage.includes("Unauthorized") || errorMessage.includes("401");

      toast({
        title: "Sync Failed",
        description: isUnauthorized
          ? "Invalid Shopify credentials. Please check your API credentials."
          : errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  // Display name for the active store. Mirrors the StoreSwitcher
  // logic (storeName takes precedence, falls back to the URL when
  // the admin hasn't set a friendly name yet).
  const activeStoreDisplayName =
    activeStore?.storeName?.trim() || activeStore?.storeUrl || "";

  // Description copy: while loading we hold the neutral text so the
  // card doesn't flash "not configured" during initial hydration.
  const cardDescription = storesLoading
    ? "Loading store…"
    : isConnected
      ? `Connected to: ${activeStoreDisplayName}`
      : "Manage your Shopify store integration";

  return (
    <div className="space-y-6">
      <SettingsCard
        iconImg="https://cdn.shopify.com/s/files/1/0741/0594/6252/files/Shopify-logo.png?v=1765021115"
        title="Shopify Connection"
        description={cardDescription}
        testId="card-connection-status"
        action={
          <StatusBadge 
            status={isConnected ? "connected" : "disconnected"} 
          />
        }
      >
        {!isConnected ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your Shopify store is not configured yet. Follow our setup guide to get started.
              </AlertDescription>
            </Alert>
            <Link href="/settings/shopify/setup">
              <Button className="gap-2" data-testid="button-setup-guide">
                Start Setup Guide
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Multi-store hint: shown only when the user has more
                than one accessible store, so single-store
                deployments stay uncluttered. Reminds them this
                panel always operates on whichever store the
                sidebar switcher is pointing at — flipping stores
                there re-scopes everything below. */}
            {hasMultipleStores && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Showing details for{" "}
                  <span className="font-medium">{activeStoreDisplayName}</span>.
                  To manage a different store, switch your active workspace
                  in the top-left sidebar.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Active store</p>
                <p
                  className="text-sm font-medium truncate"
                  title={activeStoreDisplayName}
                  data-testid="active-store-name"
                >
                  {activeStoreDisplayName || "—"}
                </p>
                {activeStore?.storeUrl && (
                  <p
                    className="text-xs text-muted-foreground truncate"
                    title={activeStore.storeUrl}
                    data-testid="active-store-url"
                  >
                    {activeStore.storeUrl}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p
                  className="text-sm font-medium"
                  data-testid="active-store-order-total"
                >
                  {recentOrderData?.total ?? 0}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={handleSync}
                disabled={syncMutation.isPending || syncProgress?.isRunning === true}
                data-testid="button-sync-orders"
                className="gap-2"
              >
                {syncMutation.isPending || syncProgress?.isRunning ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Syncing…
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    {/* The backend's Phase 2 storeScope middleware
                        reads the X-Active-Store-Id header attached
                        by lib/queryClient.ts, so this button always
                        syncs the store named in its label — the UI
                        contract matches the request the server
                        actually sees. */}
                    Sync orders for {activeStoreDisplayName || "this store"}
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                Paginates through this store's entire Shopify order history
              </p>
            </div>

            {/* Live progress — visible while syncing and after it finishes
                until the user clicks Sync Now again. */}
            {syncProgress && (
              <div
                className="rounded-lg border bg-muted/30 p-4 space-y-3"
                data-testid="sync-progress"
              >
                <div className="flex items-center gap-2">
                  {syncProgress.isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  <p className="text-sm font-medium">
                    {syncProgress.isRunning ? "Sync in progress" : "Sync finished"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Pages</p>
                    <p
                      className="font-mono font-medium"
                      data-testid="sync-pages"
                    >
                      {syncProgress.pagesFetched}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Synced</p>
                    <p
                      className="font-mono font-medium text-green-600"
                      data-testid="sync-synced"
                    >
                      {syncProgress.syncedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                    <p
                      className="font-mono font-medium text-muted-foreground"
                      data-testid="sync-skipped"
                    >
                      {syncProgress.skippedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <p
                      className={`font-mono font-medium ${
                        syncProgress.failedCount > 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                      data-testid="sync-failed"
                    >
                      {syncProgress.failedCount}
                    </p>
                  </div>
                </div>
                {syncProgress.lastError && (
                  <p className="text-xs text-destructive">
                    Last error: {syncProgress.lastError}
                  </p>
                )}
                {!syncProgress.isRunning &&
                  syncProgress.failedCount > 0 && (
                    <div className="pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadErrorsCsv}
                        className="gap-2"
                        data-testid="button-download-sync-errors"
                      >
                        <Download className="h-4 w-4" />
                        Download Error Report (CSV)
                      </Button>
                      {syncProgress.errorsTruncated && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Error list truncated at {syncProgress.errors.length} rows.
                        </p>
                      )}
                    </div>
                  )}
              </div>
            )}

            {syncResult && !syncProgress && (
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  Last sync: {syncResult.syncedCount} new orders, {syncResult.skippedCount} existing orders skipped
                </AlertDescription>
              </Alert>
            )}

            {/* Per-store disconnect is a Phase-5 follow-up. The legacy
                DELETE /api/shopify/credentials route only operates on
                the single-row shopify_credentials table and would do
                nothing useful in multi-store mode — keeping it here
                was the cause of confused "I disconnected but nothing
                happened" reports. The future replacement
                (DELETE /api/stores/:id) will remove the active store
                + its user_stores rows + invalidate webhook
                registration in a single transactional step. */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Need to disconnect this store? Per-store disconnect lands
                in the next release. For now, drop the row from{" "}
                <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                  stores
                </code>{" "}
                in the database to fully revoke access.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ShopifyWebhookStatusCard
//
// Read-only card showing whether webhooks are flowing (latest order
// timestamp). Lives on Settings → Store Operations now that the
// Integrations hub is a clean catalog view.
// ─────────────────────────────────────────────────────────────────────
export function ShopifyWebhookStatusCard() {
  const { data: recentOrderData, isLoading: isLoadingOrders } = useQuery<{
    orders: BackendOrder[];
    total: number;
  }>({
    queryKey: ["/api/orders?limit=1"],
    refetchInterval: 30000,
  });
  const lastOrder = recentOrderData?.orders?.[0];

  return (
    <SettingsCard
      icon={Activity}
      title="Real-Time Sync"
      description="Automatic order synchronization via webhooks"
      testId="card-webhook-status"
      action={
        lastOrder ? (
          <StatusBadge status="active" label="Webhooks Active" />
        ) : (
          <StatusBadge status="inactive" label="Not Configured" />
        )
      }
    >
      {isLoadingOrders ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : lastOrder ? (
        <div className="space-y-4">
          <div className="rounded-lg border bg-green-500/5 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Webhooks are working correctly</p>
                <p className="text-sm text-muted-foreground">
                  Last order received: <strong>#{lastOrder.orderNumber}</strong> ({lastOrder.customerName})
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(lastOrder.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            New orders are automatically syncing every 30 seconds.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No webhooks have been received yet. Set up real-time sync to automatically import new orders.
            </AlertDescription>
          </Alert>
          <Link href="/settings/shopify/webhooks">
            <Button variant="outline" className="gap-2" data-testid="button-setup-webhooks">
              Setup Webhooks
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
    </SettingsCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ShopifyHelpCard
//
// Quick links to the standalone setup/webhook guide pages. Belongs in
// Settings now, not in the Integrations hub.
// ─────────────────────────────────────────────────────────────────────
export function ShopifyHelpCard() {
  return (
    <SettingsCard
      title="Need Help?"
      description="Access setup guides and documentation"
      testId="card-help"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/settings/shopify/setup">
          <Button variant="outline" className="w-full justify-start gap-2">
            <Settings className="h-4 w-4" />
            Initial Setup Guide
          </Button>
        </Link>
        <Link href="/settings/shopify/webhooks">
          <Button variant="outline" className="w-full justify-start gap-2">
            <Activity className="h-4 w-4" />
            Webhook Setup Guide
          </Button>
        </Link>
      </div>
    </SettingsCard>
  );
}

export function IVRConnectionStatus() {
  const { toast } = useToast();
  const [testResult, setTestResult] = useState<any>(null);

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/ivr/test-credentials");
      const data = await response.json();
      
      // Always return the data, even on non-200 responses
      // The data contains diagnostic information we want to display
      return data;
    },
    onSuccess: (data) => {
      setTestResult(data);
      if (data.success) {
        toast({
          title: "IVR Connection Successful",
          description: data.connectionTest?.message || "IVR credentials are valid!",
        });
      } else {
        toast({
          title: "IVR Connection Failed",
          description: data.connectionTest?.message || data.error || "Failed to connect to IVR service",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to test IVR connection",
        variant: "destructive",
      });
    },
  });

  const isConfigured = testResult?.configured ?? false;
  const isConnected = testResult?.connectionTest?.status === "success" || testResult?.connectionTest?.status === "authenticated";

  return (
    <SettingsCard
      icon={Phone}
      title="IVR Connection"
      description="Click-to-Call integration status"
      testId="card-ivr-status"
      action={
        testResult ? (
          <StatusBadge 
            status={isConnected ? "connected" : "disconnected"} 
            label={isConnected ? "Connected" : "Not Connected"}
          />
        ) : null
      }
    >
      <div className="space-y-4">
        {!testResult ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Test your IVR credentials to verify the Click-to-Call integration is working correctly.
            </p>
            <Button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              data-testid="button-test-ivr"
              className="gap-2"
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" />
                  Test IVR Connection
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Credentials Info */}
            {testResult.credentials && (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-muted-foreground">API Token</p>
                  <p className="font-mono">{testResult.credentials.apiToken}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">DID Number</p>
                  <p className="font-mono">{testResult.credentials.didNumber}</p>
                </div>
              </div>
            )}

            {/* Connection Test Result */}
            <div className={`rounded-lg border p-4 ${
              isConnected 
                ? "bg-green-500/5 border-green-500/20" 
                : "bg-red-500/5 border-red-500/20"
            }`}>
              <div className="flex items-start gap-3">
                {isConnected ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5" />
                )}
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">
                    {testResult.connectionTest?.message || testResult.error}
                  </p>
                  {testResult.connectionTest?.note && (
                    <p className="text-xs text-muted-foreground">
                      {testResult.connectionTest.note}
                    </p>
                  )}
                  {testResult.connectionTest?.possibleCauses && (
                    <div className="mt-3">
                      <p className="text-xs font-medium mb-1">Possible causes:</p>
                      <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                        {testResult.connectionTest.possibleCauses.map((cause: string, idx: number) => (
                          <li key={idx}>{cause}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {testResult.connectionTest?.nextSteps && (
                    <div className="mt-3">
                      <p className="text-xs font-medium mb-1">Next steps:</p>
                      <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                        {testResult.connectionTest.nextSteps.map((step: string, idx: number) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Retesting...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Test Again
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

interface ProductSyncStatus {
  productCount: number;
  lastSyncedAt: string | null;
}

interface ProductSyncResult {
  success: boolean;
  message: string;
  productsCount: number;
  variantsCount: number;
}

export function ProductCatalogSync() {
  const { toast } = useToast();

  const { data: syncStatus, isLoading } = useQuery<ProductSyncStatus>({
    queryKey: ["/api/admin/products/status"],
    refetchInterval: 60000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/sync-products", {});
      return response.json() as Promise<ProductSyncResult>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products/status"] });
      toast({
        title: "Products Synced",
        description: `Successfully synced ${data.productsCount} products with ${data.variantsCount} variants from Shopify.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync products from Shopify.",
        variant: "destructive",
      });
    },
  });

  return (
    <SettingsCard
      icon={Package}
      title="Product Catalog"
      description="Sync product images and details from Shopify"
      testId="card-product-catalog"
      action={
        syncStatus?.productCount ? (
          <StatusBadge status="active" label={`${syncStatus.productCount} Products`} />
        ) : (
          <StatusBadge status="inactive" label="Not Synced" />
        )
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Products in Database</p>
              <p className="text-sm font-medium">{syncStatus?.productCount || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Synced</p>
              <p className="text-sm font-medium">
                {syncStatus?.lastSyncedAt 
                  ? formatDistanceToNow(new Date(syncStatus.lastSyncedAt), { addSuffix: true })
                  : "Never"
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-products"
              className="gap-2"
            >
              {syncMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Syncing Products...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Sync Products
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Import product images for order visualization
            </p>
          </div>

          {!syncStatus?.productCount && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No products synced yet. Click "Sync Products" to import product images from your Shopify store.
                This enables product thumbnails in the order preview panel.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

interface PaymentMethodsResponse {
  methods: string[];
}

interface PaymentSettingsResponse {
  prepaidMethods: string[];
}

export function PaymentMappingSettings() {
  const { toast } = useToast();
  const [prepaidMethods, setPrepaidMethods] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const initializedRef = useRef(false);

  const { data: detectedData, isLoading: isLoadingDetected } = useQuery<PaymentMethodsResponse>({
    queryKey: ["/api/orders/payment-methods"],
  });

  const { data: savedData, isLoading: isLoadingSaved } = useQuery<PaymentSettingsResponse>({
    queryKey: ["/api/settings/payments"],
  });

  // Initialize from saved data using useEffect
  useEffect(() => {
    if (savedData?.prepaidMethods && !initializedRef.current) {
      // Filter out any "cod" that might have been saved accidentally
      const cleanedMethods = savedData.prepaidMethods.filter(
        m => m.toLowerCase() !== 'cod'
      );
      setPrepaidMethods(cleanedMethods);
      initializedRef.current = true;
    }
  }, [savedData]);

  // Reset initialization when savedData changes after save
  useEffect(() => {
    if (!hasChanges && savedData?.prepaidMethods) {
      const cleanedMethods = savedData.prepaidMethods.filter(
        m => m.toLowerCase() !== 'cod'
      );
      setPrepaidMethods(cleanedMethods);
    }
  }, [savedData, hasChanges]);

  const saveMutation = useMutation({
    mutationFn: async (methods: string[]) => {
      const response = await apiRequest("POST", "/api/settings/payments", { prepaidMethods: methods });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/payments"] });
      setHasChanges(false);
      toast({
        title: "Settings Saved",
        description: "Prepaid payment methods updated. Orders with these payment methods will now auto-confirm.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save payment settings.",
        variant: "destructive",
      });
    },
  });

  const detectedMethods = detectedData?.methods || [];
  
  // Filter out COD from detected (never show as option to move to prepaid)
  // Also filter out methods already in prepaid list
  const unmappedMethods = detectedMethods.filter(
    m => m.toLowerCase() !== 'cod' && 
         !prepaidMethods.some(p => p.toLowerCase() === m.toLowerCase())
  );

  const moveToPrepaids = (method: string) => {
    if (method.toLowerCase() === 'cod') return; // Safety: never allow COD
    setPrepaidMethods(prev => [...prev, method]);
    setHasChanges(true);
  };

  const removeFromPrepaid = (method: string) => {
    setPrepaidMethods(prev => prev.filter(m => m.toLowerCase() !== method.toLowerCase()));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Double-check: filter out COD before saving
    const safeMethodsToSave = prepaidMethods.filter(m => m.toLowerCase() !== 'cod');
    saveMutation.mutate(safeMethodsToSave);
  };

  const isLoading = isLoadingDetected || isLoadingSaved;

  return (
    <SettingsCard
      icon={CreditCard}
      title="Prepaid Payment Mapping"
      description="Configure which payment methods are treated as prepaid for auto-confirmation"
      testId="card-payment-mapping"
      action={
        prepaidMethods.length > 0 ? (
          <StatusBadge status="active" label={`${prepaidMethods.length} Configured`} />
        ) : (
          <StatusBadge status="inactive" label="Not Configured" />
        )
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Orders with payment methods marked as "Prepaid" will be auto-confirmed when their payment status is "paid". 
              This prevents COD orders from polluting agent metrics when they are marked paid after delivery.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Detected on Store</p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Click to move to Prepaid column
              </p>
              <div className="min-h-[100px] rounded-lg border border-dashed p-3 space-y-2">
                {unmappedMethods.length > 0 ? (
                  unmappedMethods.map((method) => (
                    <button
                      key={method}
                      onClick={() => moveToPrepaids(method)}
                      className="inline-flex items-center px-3 py-1.5 rounded-md text-sm bg-muted hover:bg-accent transition-colors cursor-pointer mr-2 mb-1"
                      data-testid={`badge-detected-${method.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {method}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {detectedMethods.length === 0 
                      ? "No payment methods detected in orders yet" 
                      : "All detected methods are mapped"}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm font-medium">Treat as Prepaid</p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Click to remove from Prepaid
              </p>
              <div className="min-h-[100px] rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-2">
                {prepaidMethods.length > 0 ? (
                  prepaidMethods.map((method) => (
                    <button
                      key={method}
                      onClick={() => removeFromPrepaid(method)}
                      className="inline-flex items-center px-3 py-1.5 rounded-md text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors cursor-pointer mr-2 mb-1"
                      data-testid={`badge-prepaid-${method.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {method}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No prepaid methods configured
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
              data-testid="button-save-payment-mapping"
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
            {hasChanges && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                You have unsaved changes
              </p>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
