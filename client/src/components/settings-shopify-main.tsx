import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/components/ui/settings-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Store, RefreshCw, CheckCircle, Activity, ArrowRight, AlertCircle } from "lucide-react";
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

export function ShopifySettingsMain() {
  const { toast } = useToast();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Fetch most recent order to show webhook activity
  const { data: recentOrderData, isLoading: isLoadingOrders } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders?limit=1"],
    refetchInterval: 30000,
  });

  const lastOrder = recentOrderData?.orders?.[0];
  // Consider Shopify connected if we have any orders in the system
  const isConnected = (recentOrderData?.total ?? 0) > 0;

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

  const handleSync = () => {
    syncMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <SettingsCard
        icon={Store}
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

      {/* Help Section */}
      <SettingsCard
        title="Need Help?"
        description="Access setup guides and documentation"
        testId="card-help"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/settings/shopify/setup">
            <Button variant="outline" className="w-full justify-start gap-2">
              <Store className="h-4 w-4" />
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
