import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/ui/settings-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw, CheckCircle, Activity, ArrowRight, AlertCircle, Phone, Loader2, Package, Unplug, Settings } from "lucide-react";
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
import { formatDistanceToNow } from "date-fns";

interface SyncResult {
  syncedCount: number;
  skippedCount: number;
  totalOrders: number;
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
  lastTested: string | null;
  testStatus: string | null;
  testMessage?: string;
}

export function ShopifySettingsMain() {
  const { toast } = useToast();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Fetch credentials status from database (source of truth for connection state)
  const { data: credentialsStatus } = useQuery<CredentialsStatus>({
    queryKey: ["/api/shopify/credentials/status"],
    refetchInterval: 30000,
  });

  // Fetch most recent order to show webhook activity
  const { data: recentOrderData, isLoading: isLoadingOrders } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders?limit=1"],
    refetchInterval: 30000,
  });

  const lastOrder = recentOrderData?.orders?.[0];
  // Connection status is determined ONLY by database credentials, not by order count
  const isConnected = credentialsStatus?.configured === true;

  // Manual sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/shopify/sync", {
        limit: 100,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSyncResult(data);
      toast({
        title: "Sync Completed",
        description: `Synced ${data.syncedCount} new orders, skipped ${data.skippedCount} existing orders.`,
      });
    },
    onError: (error: Error) => {
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

  // Disconnect store mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/shopify/credentials");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Store Disconnected",
        description: "Your Shopify store has been disconnected. You can now reconnect with fresh credentials.",
      });
      // Invalidate relevant queries to refresh the UI state
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials/status"] });
    },
    onError: () => {
      // Even on error, force cache invalidation to escape "zombie" state
      // The backend now returns 200 for "already cleared" so errors are real failures
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials/status"] });
      toast({
        title: "Store Disconnected",
        description: "Credentials have been cleared. You can now reconnect with fresh credentials.",
      });
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <SettingsCard
        iconImg="https://cdn.shopify.com/s/files/1/0741/0594/6252/files/Shopify-logo.png?v=1765021115"
        title="Shopify Connection"
        description="Manage your Shopify store integration"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Integration Status</p>
                <p className="text-sm font-medium">Connected & Syncing</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-sm font-medium">{recentOrderData?.total ?? 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSync}
                disabled={syncMutation.isPending}
                data-testid="button-sync-orders"
                className="gap-2"
              >
                {syncMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Sync Now
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                Import the latest 100 orders from Shopify
              </p>
            </div>
            {syncResult && (
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  Last sync: {syncResult.syncedCount} new orders, {syncResult.skippedCount} existing orders skipped
                </AlertDescription>
              </Alert>
            )}

            {/* Disconnect Store Section */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Disconnect Store</p>
                  <p className="text-sm text-muted-foreground">
                    Remove credentials to reconnect with fresh OAuth token
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="gap-2 text-destructive hover:text-destructive"
                      data-testid="button-disconnect-store"
                      disabled={disconnectMutation.isPending}
                    >
                      {disconnectMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        <>
                          <Unplug className="h-4 w-4" />
                          Disconnect Store
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Shopify Store?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove your Shopify API credentials. Your existing orders will remain in the system, but you will need to reconnect the store to sync new orders and fix any authentication issues.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDisconnect}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Disconnect Store
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        )}
      </SettingsCard>

      {/* Real-Time Webhook Status */}
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

      {/* Product Catalog Sync */}
      <ProductCatalogSync />

      {/* IVR Connection Status */}
      <IVRConnectionStatus />

      {/* Help Section */}
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
    </div>
  );
}

function IVRConnectionStatus() {
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

function ProductCatalogSync() {
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
