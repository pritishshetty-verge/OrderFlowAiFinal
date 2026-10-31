import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/ui/settings-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useActiveStore } from "@/hooks/use-store";
import { RefreshCw, CheckCircle, Activity, ArrowRight, AlertCircle, Phone, Loader2, Package, Settings, CreditCard, ArrowLeftRight, Save, Download, ImageIcon, Unplug, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
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
    setActiveStore,
  } = useActiveStore();

  // Pull the lightweight order count to surface "Total Orders" on the
  // connection card. The Phase-3 fetch interceptor attaches the
  // active store id, so this number is always scoped to whichever
  // store the user is currently looking at.
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
    // opts picks the look-back window: { daysBack } for "last N days", or
    // { allHistory: true } for a full re-scan. Threaded into the first
    // chunk; later chunks reuse the server-pinned window.
    mutationFn: async (opts: { daysBack?: number; allHistory?: boolean }) => {
      // Kick off polling immediately so the UI shows activity even during
      // the first page fetch (which can take a few seconds).
      startPolling();

      // Chunked resume loop. The server processes a bounded batch per call
      // (so each request finishes inside the serverless time limit) and
      // returns { hasMore, nextSinceId, updatedAtMin }. We keep calling,
      // carrying the cursor + window forward, until the window is fully
      // scanned — accumulating the totals for the final toast.
      let sinceId: string | undefined;
      let updatedAtMin: string | undefined;
      let syncedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      let pagesFetched = 0;

      for (let i = 0; i < 200; i++) {
        const body: Record<string, unknown> = { limit: 250 };
        if (sinceId) body.sinceId = sinceId;
        if (opts.allHistory) {
          body.allHistory = true;
        } else if (updatedAtMin) {
          // Later chunks reuse the exact window opened by the first call.
          body.updatedAtMin = updatedAtMin;
        } else if (opts.daysBack) {
          // First call opens the window; server returns the resolved
          // updatedAtMin which we pin for the rest of the loop.
          body.daysBack = opts.daysBack;
        }

        const response = await apiRequest("POST", "/api/shopify/sync", body);
        const data = await response.json();

        syncedCount += data.syncedCount ?? 0;
        skippedCount += data.skippedCount ?? 0;
        failedCount += data.failedCount ?? 0;
        pagesFetched += data.pagesFetched ?? 0;
        // Pin the window after the first call so later chunks scan the
        // exact same range rather than a window that drifts with time.
        if (!opts.allHistory) updatedAtMin = data.updatedAtMin ?? updatedAtMin;

        if (!data.hasMore || !data.nextSinceId) break;
        // Guard against a stuck cursor (shouldn't happen) so we never loop
        // forever.
        if (data.nextSinceId === sinceId) break;
        sinceId = data.nextSinceId as string;
      }

      return {
        syncedCount,
        skippedCount,
        failedCount,
        pagesFetched,
        totalOrders: syncedCount + skippedCount,
      };
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

  // Look-back windows for the sync. The dropdown lets the admin scan only
  // as far back as needed (e.g. a known 7-day outage) instead of the whole
  // window — less work, same result.
  const SYNC_RANGES: { label: string; days?: number; all?: boolean }[] = [
    { label: "Last 7 days", days: 7 },
    { label: "Last 10 days", days: 10 },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
    { label: "All time", all: true },
  ];
  const [syncRange, setSyncRange] = useState(SYNC_RANGES[0]);

  const runSync = (range: (typeof SYNC_RANGES)[number]) => {
    setSyncRange(range);
    syncMutation.mutate(range.all ? { allHistory: true } : { daysBack: range.days });
  };
  const handleSync = () => runSync(syncRange);

  // Display name for the active store. Mirrors the StoreSwitcher
  // logic (storeName takes precedence, falls back to the URL when
  // the admin hasn't set a friendly name yet).
  // Soft-disconnect the active store. Server flips isActive=false (order
  // history is retained; a later re-add reactivates it). On success we switch
  // to another accessible store if one exists, else the StoreProvider
  // reconciles to none after /api/stores/me refetches.
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!activeStore) throw new Error("No active store to disconnect.");
      const res = await apiRequest("DELETE", `/api/stores/${activeStore.id}`);
      return res.json();
    },
    onSuccess: async () => {
      const removedId = activeStore?.id;
      const next = accessibleStores?.find((s) => s.id !== removedId);
      if (next) setActiveStore(next.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/stores/me"] });
      queryClient.invalidateQueries();
      toast({
        title: "Store disconnected",
        description:
          "This store won't sync anymore. Its order history is kept — re-add the same store to reconnect.",
      });
    },
    onError: (err: any) => {
      const msg = (err?.message ?? "Failed to disconnect").replace(/^\d+:\s*/, "");
      toast({ title: "Couldn't disconnect", description: msg, variant: "destructive" });
    },
  });

  const activeStoreDisplayName =
    activeStore?.storeName?.trim() || activeStore?.storeUrl || "";

  // ── Real-time sync (webhook) health for the active store ────────────
  // Scoped to the active store via the X-Active-Store-Id header that
  // apiRequest attaches. Surfaces whether Shopify is wired to push live
  // order events here, with one-click re-registration — so admins never
  // need to hunt for the old buried setup page.
  const EXPECTED_WEBHOOK_TOPICS = [
    "orders/create",
    "orders/updated",
    "orders/cancelled",
    "fulfillments/update",
  ];
  const webhookStatusQuery = useQuery<{
    storeId: string;
    webhooks: Array<{ topic: string; address: string }>;
  }>({
    queryKey: ["/api/shopify/webhooks", activeStore?.id ?? "none"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/shopify/webhooks");
      return await res.json();
    },
    enabled: isConnected && !!activeStore?.id,
    retry: false,
  });
  const registeredTopics = new Set(
    (webhookStatusQuery.data?.webhooks ?? []).map((w) => w.topic),
  );
  const registeredCount = EXPECTED_WEBHOOK_TOPICS.filter((t) =>
    registeredTopics.has(t),
  ).length;
  const registerWebhooksMutation = useMutation({
    mutationFn: async () => {
      // Raw fetch (not apiRequest) so a 207 Multi-Status partial result
      // isn't thrown as an error. Attach the active-store header manually.
      const res = await fetch("/api/shopify/webhooks/register-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(activeStore?.id ? { "X-Active-Store-Id": activeStore.id } : {}),
        },
        body: "{}",
        credentials: "include",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok && res.status !== 207) {
        throw new Error(
          body?.error ?? `Registration failed (HTTP ${res.status})`,
        );
      }
      return body;
    },
    onSuccess: (data: any) => {
      const failed = data?.summary?.failed ?? 0;
      toast({
        title: failed > 0 ? "Some webhooks failed" : "Webhooks registered",
        description:
          failed > 0
            ? `${failed} topic(s) could not be registered — check the store's Shopify billing/permissions and retry.`
            : "Real-time order sync is wired up for this store.",
        variant: failed > 0 ? "destructive" : undefined,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/shopify/webhooks", activeStore?.id ?? "none"],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not register webhooks",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header — matches the other integration manage views: a plain
          title + status badge. No duplicate icon/title; the slide-over
          already shows the Shopify header above this. */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">
            {isConnected ? "Active configuration" : "Connect Shopify"}
          </h3>
          {isConnected && (
            <Badge
              variant="outline"
              className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30 gap-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Connected
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isConnected
            ? "Orders sync in real time via webhooks. Run a manual sync to fill any gaps."
            : "Your Shopify store isn't connected yet. Add it from the catalog to start syncing."}
        </p>
      </div>

      {!isConnected ? (
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your Shopify store is not configured yet. Follow our setup guide to get started.
            </AlertDescription>
          </Alert>
          <Link href="/integrations">
            <Button className="gap-2" data-testid="button-setup-guide">
              Connect a Store
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Store facts — divide-y list, consistent with the other cards. */}
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between gap-3 p-3">
              <span className="text-xs text-muted-foreground">Active store</span>
              <span
                className="text-sm font-medium truncate text-right"
                title={activeStoreDisplayName}
                data-testid="active-store-name"
              >
                {activeStoreDisplayName || "—"}
              </span>
            </div>
            {activeStore?.storeUrl && (
              <div className="flex items-center justify-between gap-3 p-3">
                <span className="text-xs text-muted-foreground">Store URL</span>
                <span
                  className="text-sm font-medium truncate text-right"
                  title={activeStore.storeUrl}
                  data-testid="active-store-url"
                >
                  {activeStore.storeUrl}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 p-3">
              <span className="text-xs text-muted-foreground">Total orders</span>
              <span
                className="text-sm font-medium"
                data-testid="active-store-order-total"
              >
                {(recentOrderData?.total ?? 0).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
              {/* Split button: the main action syncs the selected range;
                  the chevron picks a different window. The backend's
                  storeScope middleware reads the X-Active-Store-Id header
                  attached by lib/queryClient.ts, so this always syncs the
                  store named above. */}
              <div className="inline-flex">
                <Button
                  onClick={handleSync}
                  disabled={syncMutation.isPending || syncProgress?.isRunning === true}
                  data-testid="button-sync-orders"
                  className="gap-2 rounded-r-none"
                >
                  {syncMutation.isPending || syncProgress?.isRunning ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Syncing…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Sync · {syncRange.label.toLowerCase()}
                    </>
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={syncMutation.isPending || syncProgress?.isRunning === true}
                      className="rounded-l-none border-l border-primary-foreground/20 px-2"
                      aria-label="Choose sync range"
                      data-testid="button-sync-range"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {SYNC_RANGES.map((r) => (
                      <DropdownMenuItem
                        key={r.label}
                        onClick={() => runSync(r)}
                        data-testid={`sync-range-${r.days ?? "all"}`}
                      >
                        {r.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-xs text-muted-foreground">
                Fills any order gaps missed by webhooks. Use the dropdown to
                choose how far back to scan.
                {hasMultipleStores
                  ? " Switch stores from the top-left sidebar."
                  : ""}
              </p>
            </div>

            {/* Real-time sync (webhooks) — status + one-click repair, so
                admins never need the old buried setup page. */}
            <div
              className="rounded-lg border p-3 space-y-3"
              data-testid="webhook-status"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Real-time order sync (webhooks)
                  </p>
                </div>
                {webhookStatusQuery.isLoading ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking…
                  </span>
                ) : webhookStatusQuery.isError ? (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Status unavailable
                  </span>
                ) : (
                  <span
                    className={`text-xs font-medium ${
                      registeredCount >= EXPECTED_WEBHOOK_TOPICS.length
                        ? "text-green-600 dark:text-green-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {registeredCount}/{EXPECTED_WEBHOOK_TOPICS.length} registered
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                New stores wire this up automatically on connect. Use
                Re-register if a topic ever drops.
              </p>
              {!webhookStatusQuery.isLoading && !webhookStatusQuery.isError && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {EXPECTED_WEBHOOK_TOPICS.map((t) => {
                    const ok = registeredTopics.has(t);
                    return (
                      <div key={t} className="flex items-center gap-2 text-xs">
                        {ok ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                        )}
                        <span className="font-mono text-muted-foreground truncate">
                          {t}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => registerWebhooksMutation.mutate()}
                  disabled={registerWebhooksMutation.isPending}
                  className="gap-2"
                  data-testid="button-reregister-webhooks"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      registerWebhooksMutation.isPending ? "animate-spin" : ""
                    }`}
                  />
                  {registerWebhooksMutation.isPending
                    ? "Registering…"
                    : "Re-register webhooks"}
                </Button>
              </div>
            </div>

            {/* Live progress — visible while syncing and after it finishes
                until the user clicks Sync Now again. */}
            {syncProgress && (
              <div
                className="rounded-lg border p-3 space-y-3"
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

            {/* Disconnect — simple actions row, matching the other cards.
                Soft-disconnect keeps order history; re-adding the store
                reconnects it. */}
            <div className="flex items-center justify-end pt-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive gap-2"
                    disabled={!activeStore || disconnectMutation.isPending}
                    data-testid="button-disconnect-store"
                  >
                    {disconnectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unplug className="h-4 w-4" />
                    )}
                    Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Disconnect {activeStoreDisplayName || "this store"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      The store will stop syncing and disappear from the store
                      switcher. Existing orders and reports are kept. You can
                      reconnect anytime by adding the same store again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => disconnectMutation.mutate()}
                      data-testid="button-confirm-disconnect"
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
    </div>
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
  // Active store from the switcher. Without this in the queryKey
  // React Query would serve the previous tenant's product count
  // cache when the admin flips stores; without the `enabled` gate
  // the very first tick after login fires before scope resolves.
  const { activeStoreId, activeStore } = useActiveStore();

  const { data: syncStatus, isLoading } = useQuery<ProductSyncStatus>({
    queryKey: ["/api/admin/products/status", activeStoreId],
    // Explicit queryFn — the default getQueryFn in lib/queryClient.ts
    // builds the URL by joining the queryKey with "/", which would
    // produce `/api/admin/products/status/<storeId>` and 404. Using
    // apiRequest keeps the URL clean and still attaches
    // X-Active-Store-Id from the interceptor.
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/products/status");
      return res.json();
    },
    enabled: !!activeStoreId,
    refetchInterval: 60000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/sync-products", {});
      return response.json() as Promise<ProductSyncResult>;
    },
    onSuccess: (data) => {
      // Invalidate this store's products/status entry specifically.
      // The mutation's apiRequest already attaches X-Active-Store-Id,
      // so the backend syncs the right tenant.
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/products/status", activeStoreId],
      });
      toast({
        title: "Products Synced",
        description: `Successfully synced ${data.productsCount} products with ${data.variantsCount} variants from Shopify.`,
      });
    },
    onError: (error: Error) => {
      // Surface 402 specifically — the backend translates Shopify's
      // "Payment Required" into a clearer error so we can tell the
      // admin which store's subscription needs to be reactivated
      // instead of the generic "Failed to sync products."
      const message = error.message || "Failed to sync products from Shopify.";
      const isPaused = /402/.test(message) || /subscription paused/i.test(message);
      toast({
        title: isPaused ? "Shopify subscription paused" : "Sync Failed",
        description: isPaused
          ? `Reactivate ${activeStore?.storeName ?? "this store"}'s subscription in Shopify and retry.`
          : message,
        variant: "destructive",
      });
    },
  });

  // Retroactive image backfill: patches order_items rows whose
  // image_url is still NULL by joining them against the (now-synced)
  // products table for this store. Idempotent — safe to run any
  // time, and the second run reports 0 updates if there's nothing
  // left to fix. Reports `missingVariantsInCatalog` so admins know
  // when to re-sync products before retrying.
  const backfillMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        "/api/admin/backfill-order-item-images",
        {},
      );
      return response.json() as Promise<{
        success: boolean;
        updated: number;
        missingVariantsInCatalog: number;
      }>;
    },
    onSuccess: (data) => {
      // Refresh any order-detail caches so the slide-over preview
      // pulls the new image without a hard refresh.
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      const note =
        data.missingVariantsInCatalog > 0
          ? ` (${data.missingVariantsInCatalog} variant${data.missingVariantsInCatalog === 1 ? "" : "s"} still missing from the catalog — run Sync Products and retry.)`
          : "";
      toast({
        title: data.updated > 0 ? "Images backfilled" : "Nothing to backfill",
        description:
          data.updated > 0
            ? `Patched ${data.updated} order item${data.updated === 1 ? "" : "s"} with catalog images.${note}`
            : `No order items needed image patching.${note}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Backfill failed",
        description: error.message || "Could not patch order item images.",
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
        <div className="space-y-3">
          {/* Count lives in the header badge, so here we only surface the
              freshness as one compact line. */}
          <p className="text-xs text-muted-foreground">
            Last synced{" "}
            {syncStatus?.lastSyncedAt
              ? formatDistanceToNow(new Date(syncStatus.lastSyncedAt), { addSuffix: true })
              : "never"}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
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
            {/* Backfill button: patches historical order_items that
                were imported before the catalog sync (image_url
                left NULL at insert time). Disabled when there's no
                catalog yet — that path is "Sync Products first". */}
            <Button
              variant="outline"
              onClick={() => backfillMutation.mutate()}
              disabled={
                backfillMutation.isPending ||
                syncMutation.isPending ||
                !syncStatus?.productCount
              }
              data-testid="button-backfill-images"
              className="gap-2"
              title={
                !syncStatus?.productCount
                  ? "Sync products first so there's a catalog to backfill from."
                  : "Patch missing images on historical order items."
              }
            >
              {backfillMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Backfilling…
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4" />
                  Backfill missing images
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sync imports product images; backfill patches old orders.
          </p>

          {!syncStatus?.productCount && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No products synced yet — click Sync Products to import images
                for order previews.
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
  // Active store key on both queries below so flipping tenants
  // re-fetches each store's own prepaid-mapping config instead of
  // serving the previously-loaded store's list. Gated with
  // `enabled` so we never request without a resolved scope.
  const { activeStoreId } = useActiveStore();
  const [prepaidMethods, setPrepaidMethods] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const initializedRef = useRef(false);

  const { data: detectedData, isLoading: isLoadingDetected } = useQuery<PaymentMethodsResponse>({
    queryKey: ["/api/orders/payment-methods", activeStoreId],
    // See comment in ProductCatalogSync — the default getQueryFn
    // would join the queryKey into `/api/orders/payment-methods/<id>`
    // which 404s. Explicit queryFn fixes the URL while keeping the
    // store id in the cache key for per-store refetches.
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/orders/payment-methods");
      return res.json();
    },
    enabled: !!activeStoreId,
  });

  const { data: savedData, isLoading: isLoadingSaved } = useQuery<PaymentSettingsResponse>({
    queryKey: ["/api/settings/payments", activeStoreId],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/payments");
      return res.json();
    },
    enabled: !!activeStoreId,
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
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Methods marked prepaid auto-confirm once payment status is "paid",
            so COD orders marked paid after delivery don't skew agent metrics.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Detected on store</p>
                <span className="text-[11px] text-muted-foreground">· tap to mark prepaid</span>
              </div>
              <div className="min-h-[72px] rounded-lg border border-dashed p-2.5 space-y-2">
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

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <p className="text-sm font-medium">Treat as prepaid</p>
                <span className="text-[11px] text-muted-foreground">· tap to remove</span>
              </div>
              <div className="min-h-[72px] rounded-lg border border-green-500/30 bg-green-500/5 p-2.5 space-y-2">
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
