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

  const handleSync = () => {
    syncMutation.mutate();
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

      {/* Webhook Setup Guide */}
      <Card data-testid="card-webhooks">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            <CardTitle>Real-Time Webhook Setup (via n8n)</CardTitle>
          </div>
          <CardDescription>
            Follow this step-by-step guide to enable automatic order synchronization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Why n8n explanation */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Why use n8n?</strong> Replit app URLs change, so we use n8n (a free workflow automation tool) as a stable relay between Shopify and your app.
            </AlertDescription>
          </Alert>

          {/* Step 1: Set up n8n */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="rounded-full w-6 h-6 flex items-center justify-center p-0">1</Badge>
              <h3 className="font-semibold">Set up n8n (Free)</h3>
            </div>
            <div className="ml-8 space-y-2">
              <p className="text-sm text-muted-foreground">
                1. Create a free account at <a href="https://n8n.io" target="_blank" rel="noopener" className="text-primary underline">n8n.io</a> or self-host it
              </p>
              <p className="text-sm text-muted-foreground">
                2. Create a new workflow called "Shopify to OrderFlowAI Relay"
              </p>
            </div>
          </div>

          {/* Step 2: Configure Shopify Webhooks */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="rounded-full w-6 h-6 flex items-center justify-center p-0">2</Badge>
              <h3 className="font-semibold">Configure Shopify Webhooks</h3>
            </div>
            <div className="ml-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                In your Shopify Admin → Settings → Notifications → Webhooks, create these 3 webhooks:
              </p>
              <div className="rounded-lg border divide-y">
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium">Event: Order creation</p>
                  <p className="text-xs text-muted-foreground">URL: Your n8n webhook URL (from Step 3)</p>
                  <p className="text-xs text-muted-foreground">Format: JSON</p>
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium">Event: Order updated</p>
                  <p className="text-xs text-muted-foreground">URL: Your n8n webhook URL (from Step 3)</p>
                  <p className="text-xs text-muted-foreground">Format: JSON</p>
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-sm font-medium">Event: Order cancelled</p>
                  <p className="text-xs text-muted-foreground">URL: Your n8n webhook URL (from Step 3)</p>
                  <p className="text-xs text-muted-foreground">Format: JSON</p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Create n8n Workflow */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="rounded-full w-6 h-6 flex items-center justify-center p-0">3</Badge>
              <h3 className="font-semibold">Build n8n Relay Workflow</h3>
            </div>
            <div className="ml-8 space-y-3">
              <p className="text-sm text-muted-foreground">Add these nodes to your n8n workflow:</p>
              
              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <p className="text-sm font-medium">Node 1: Webhook Trigger</p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  <li>• Type: Webhook</li>
                  <li>• Method: POST</li>
                  <li>• Path: /shopify-orders</li>
                  <li>• Copy the Production URL - this goes in Shopify webhooks (Step 2)</li>
                </ul>
              </div>

              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <p className="text-sm font-medium">Node 2: HTTP Request</p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  <li>• Method: POST</li>
                  <li>• URL: <code className="bg-background px-1 rounded text-xs">{window.location.origin}/api/webhooks/orders/create</code></li>
                  <li>• Headers: Add <code className="bg-background px-1 rounded text-xs">X-Forwarded-By: n8n</code></li>
                  <li>• Body: Pass through from previous node</li>
                </ul>
              </div>

              <Alert className="bg-yellow-500/10 border-yellow-500/20">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="text-sm">
                  <strong>Critical:</strong> You MUST add the header <code className="bg-muted px-1 rounded text-xs">X-Forwarded-By: n8n</code> or webhooks will be rejected!
                </AlertDescription>
              </Alert>
            </div>
          </div>

          {/* Step 4: Test the Setup */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="rounded-full w-6 h-6 flex items-center justify-center p-0">4</Badge>
              <h3 className="font-semibold">Test Your Setup</h3>
            </div>
            <div className="ml-8 space-y-2">
              <p className="text-sm text-muted-foreground">
                1. Create a test order in your Shopify store
              </p>
              <p className="text-sm text-muted-foreground">
                2. Check n8n workflow execution log - should show successful run
              </p>
              <p className="text-sm text-muted-foreground">
                3. Refresh your Orders page - new order should appear within 30 seconds
              </p>
            </div>
          </div>

          {/* Benefits */}
          <div className="rounded-lg border p-4 space-y-2 bg-primary/5">
            <p className="text-sm font-medium flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              What you get with webhooks:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-6">
              <li>New orders appear automatically (no manual sync needed)</li>
              <li>Order updates sync in real-time</li>
              <li>Cancelled orders immediately reflected</li>
              <li>Auto-refresh every 30 seconds ensures you never miss updates</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
