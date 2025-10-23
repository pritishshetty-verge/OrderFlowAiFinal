import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, Check, AlertCircle, Store, Webhook } from "lucide-react";

interface SyncResult {
  syncedCount: number;
  skippedCount: number;
  totalOrders: number;
}

export function ShopifySettings() {
  const { toast } = useToast();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{
    registered: boolean;
    message?: string;
  } | null>(null);

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
          ? "Invalid Shopify credentials. Please check your Admin API access token in Secrets."
          : errorMessage,
        variant: "destructive",
      });
    },
  });

  // Register webhooks mutation
  const registerWebhooksMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/shopify/webhooks/register", {});
      return response.json();
    },
    onSuccess: (data) => {
      setWebhookStatus({ registered: true, message: data.message });
      toast({
        title: "Webhooks Registered",
        description: "Shopify webhooks have been successfully registered. New orders will sync automatically.",
      });
    },
    onError: (error: Error) => {
      setWebhookStatus({ registered: false, message: error.message });
      toast({
        title: "Webhook Registration Failed",
        description: error.message || "Failed to register webhooks. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  const handleRegisterWebhooks = () => {
    registerWebhooksMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Shopify Connection Status */}
      <Card data-testid="card-shopify-status">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            <CardTitle>Shopify Integration Setup</CardTitle>
          </div>
          <CardDescription>
            Connect and sync your Shopify store orders
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong className="block mb-2">Required Secrets (add in Replit Secrets):</strong>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li><code className="bg-muted px-1 rounded">SHOPIFY_STORE_URL</code> - Your store domain (e.g., mystore.myshopify.com)</li>
                <li><code className="bg-muted px-1 rounded">SHOPIFY_API_KEY</code> - Admin API Access Token (from Shopify Admin → Settings → Apps → Develop apps)</li>
                <li><code className="bg-muted px-1 rounded">SHOPIFY_API_SECRET</code> - Admin API Secret Key</li>
                <li><code className="bg-muted px-1 rounded">SHOPIFY_WEBHOOK_SECRET</code> - Webhook verification secret</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium">How to get your Shopify API credentials:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Go to Shopify Admin → Settings → Apps and sales channels</li>
              <li>Click "Develop apps" → "Create an app"</li>
              <li>Configure Admin API scopes: read_orders, write_orders, read_customers</li>
              <li>Install the app and copy the Admin API access token</li>
              <li>Add credentials to Replit Secrets</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Manual Sync */}
      <Card data-testid="card-manual-sync">
        <CardHeader>
          <CardTitle>Manual Sync</CardTitle>
          <CardDescription>
            Pull recent orders from your Shopify store
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
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
                  Sync Orders
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Sync the latest 100 orders from Shopify
            </p>
          </div>

          {syncResult && (
            <Alert data-testid="alert-sync-result">
              <Check className="h-4 w-4" />
              <AlertDescription>
                <strong>Last sync:</strong> {syncResult.syncedCount} new orders added, {syncResult.skippedCount} existing orders skipped.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card data-testid="card-webhooks">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            <CardTitle>Real-Time Webhooks</CardTitle>
          </div>
          <CardDescription>
            Enable automatic order synchronization via webhooks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleRegisterWebhooks}
              disabled={registerWebhooksMutation.isPending}
              variant="outline"
              data-testid="button-register-webhooks"
              className="gap-2"
            >
              {registerWebhooksMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Webhook className="h-4 w-4" />
                  Register Webhooks
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground">
              Set up webhooks for orders/create, orders/update, and orders/cancelled
            </p>
          </div>

          {webhookStatus && (
            <Alert
              variant={webhookStatus.registered ? "default" : "destructive"}
              data-testid="alert-webhook-status"
            >
              {webhookStatus.registered ? (
                <Check className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {webhookStatus.message || "Webhook status updated"}
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium">How webhooks work:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>New orders automatically appear in your dashboard</li>
              <li>Order updates sync in real-time</li>
              <li>Cancelled orders are immediately reflected</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
