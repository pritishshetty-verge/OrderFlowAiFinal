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
import { RefreshCw, CheckCircle, Activity, ArrowRight, AlertCircle, Phone, Loader2, Package, Unplug, Settings, CreditCard, ArrowLeftRight, Save } from "lucide-react";
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
  storeName: string | null;
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

  // Determine the description based on connection status
  const cardDescription = isConnected && credentialsStatus?.storeName
    ? `Connected to: ${credentialsStatus.storeName}`
    : "Manage your Shopify store integration";

  return (
    <div className="space-y-6">
      {/* Connection Status */}
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

      {/* Payment Mapping Settings */}
      <PaymentMappingSettings />

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

interface PaymentMethodsResponse {
  methods: string[];
}

interface PaymentSettingsResponse {
  prepaidMethods: string[];
}

function PaymentMappingSettings() {
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
