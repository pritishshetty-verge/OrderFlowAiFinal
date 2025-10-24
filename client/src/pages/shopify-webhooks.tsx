import { Link } from "wouter";
import { PageLayout } from "@/components/page-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsCard } from "@/components/ui/settings-card";
import { CodeBlock } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Webhook, GitBranch, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";

export default function ShopifyWebhooksPage() {
  const appUrl = window.location.origin;

  return (
    <PageLayout
      title="Webhook Setup Guide"
      description="Configure real-time order synchronization from Shopify"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList data-testid="tabs-webhook-guide">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="n8n">n8n Setup</TabsTrigger>
            <TabsTrigger value="shopify">Shopify Config</TabsTrigger>
            <TabsTrigger value="testing">Testing</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <SettingsCard
              icon={Webhook}
              title="What are Webhooks?"
              description="Webhooks allow Shopify to automatically notify your app about new orders, updates, and cancellations in real-time."
            >
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Without webhooks, you'd need to manually click "Sync Now" to import orders. With webhooks enabled, new orders appear automatically.
                </p>

                <div className="rounded-lg border p-4 bg-muted/30">
                  <h4 className="text-sm font-medium mb-3">Why we use n8n as a relay:</h4>
                  <p className="text-sm text-muted-foreground">
                    Replit app URLs can change when your app restarts or redeploys. n8n provides a stable, permanent webhook URL that doesn't change, acting as a reliable bridge between Shopify and your app.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">How it works:</h4>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">Shopify</Badge>
                    <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">n8n</Badge>
                    <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20">Your App</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground ml-2">
                    When a customer creates an order, Shopify → sends webhook to n8n → n8n forwards to your app → order appears in dashboard
                  </p>
                </div>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* n8n Setup Tab */}
          <TabsContent value="n8n" className="space-y-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Simplified Approach:</strong> We'll create 3 simple workflows (one per event type) instead of one complex workflow. This is easier to set up and debug.
              </AlertDescription>
            </Alert>

            {/* Workflow 1: Orders Create */}
            <SettingsCard
              icon={GitBranch}
              title='Workflow 1: "Shopify Orders - Create"'
              description="Handles new order creation events"
            >
              <div className="space-y-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Step 1: Create New Workflow</h4>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                    <li>Log in to <a href="https://n8n.io" target="_blank" rel="noopener" className="text-primary underline">n8n.io</a> (or your self-hosted instance)</li>
                    <li>Click <strong>"New Workflow"</strong></li>
                    <li>Name it: <code className="bg-muted px-1 rounded">Shopify Orders - Create</code></li>
                  </ol>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Step 2: Add Webhook Node</h4>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                    <li>Click the <strong>"+"</strong> button to add a node</li>
                    <li>Search for and select <strong>"Webhook"</strong></li>
                    <li>Configure:
                      <ul className="ml-6 mt-2 space-y-1 list-disc">
                        <li>HTTP Method: <code className="bg-muted px-1 rounded">POST</code></li>
                        <li>Path: <code className="bg-muted px-1 rounded">/orders-create</code></li>
                        <li>Response Mode: <code className="bg-muted px-1 rounded">Immediately Respond</code></li>
                      </ul>
                    </li>
                    <li>Click <strong>"Execute Node"</strong> and copy the <strong>Production URL</strong> (save this for later!)</li>
                  </ol>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Step 3: Add HTTP Request Node</h4>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                    <li>Click the <strong>"+"</strong> button after the Webhook node</li>
                    <li>Search for and select <strong>"HTTP Request"</strong></li>
                    <li>Configure the following settings:</li>
                  </ol>
                  
                  <div className="space-y-3 ml-4">
                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-medium">Method</p>
                      <CodeBlock code="POST" showCopy={false} />
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-medium">URL</p>
                      <CodeBlock code={`${appUrl}/api/webhooks/orders/create`} />
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-medium">Headers (CRITICAL!)</p>
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Add this header or requests will be rejected:</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="font-mono text-muted-foreground mb-1">Name:</p>
                            <code className="bg-muted px-2 py-1 rounded block">X-Forwarded-By</code>
                          </div>
                          <div>
                            <p className="font-mono text-muted-foreground mb-1">Value:</p>
                            <code className="bg-muted px-2 py-1 rounded block">n8n</code>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-medium">Body Content Type</p>
                      <CodeBlock code="Raw/JSON" showCopy={false} />
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-medium">Body (JSON)</p>
                      <CodeBlock code={'{{ $json["body"] }}'} />
                      <p className="text-xs text-muted-foreground">This passes through the order data from Shopify</p>
                    </div>
                  </div>

                  <ol start={4} className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                    <li>Click <strong>"Execute Workflow"</strong> to test</li>
                    <li>Click <strong>"Save"</strong> and <strong>"Activate"</strong> the workflow</li>
                  </ol>
                </div>
              </div>
            </SettingsCard>

            {/* Workflow 2 & 3: Similar structure */}
            <SettingsCard
              icon={GitBranch}
              title='Workflows 2 & 3: "Orders - Update" and "Orders - Cancel"'
              description="Repeat the same steps with different paths"
            >
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Create two more workflows following the exact same structure as above, but with these changes:
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-4 space-y-3">
                    <h4 className="text-sm font-medium">Workflow 2: Orders - Update</h4>
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Webhook Path:</p>
                        <code className="bg-muted px-2 py-1 rounded block mt-1">/orders-update</code>
                      </div>
                      <div>
                        <p className="text-muted-foreground">HTTP Request URL:</p>
                        <code className="bg-muted px-2 py-1 rounded block mt-1 text-[10px]">{appUrl}/api/webhooks/orders/update</code>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4 space-y-3">
                    <h4 className="text-sm font-medium">Workflow 3: Orders - Cancel</h4>
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Webhook Path:</p>
                        <code className="bg-muted px-2 py-1 rounded block mt-1">/orders-cancelled</code>
                      </div>
                      <div>
                        <p className="text-muted-foreground">HTTP Request URL:</p>
                        <code className="bg-muted px-2 py-1 rounded block mt-1 text-[10px]">{appUrl}/api/webhooks/orders/cancelled</code>
                      </div>
                    </div>
                  </div>
                </div>

                <Alert className="bg-yellow-500/10 border-yellow-500/20">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                  <AlertDescription>
                    <strong>Don't forget:</strong> Each workflow must include the <code className="bg-muted px-1 rounded text-xs">X-Forwarded-By: n8n</code> header in the HTTP Request node!
                  </AlertDescription>
                </Alert>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Shopify Config Tab */}
          <TabsContent value="shopify" className="space-y-6">
            <SettingsCard
              title="Configure Shopify Webhooks"
              description="Add your n8n webhook URLs to Shopify"
            >
              <div className="space-y-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">1. Access Shopify Webhook Settings</h4>
                  <p className="text-sm text-muted-foreground">
                    In your Shopify Admin, go to: <strong>Settings → Notifications → Webhooks</strong>
                  </p>
                  <a
                    href="https://admin.shopify.com/settings/notifications"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" className="gap-2" size="sm">
                      Open Shopify Webhooks
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">2. Create These 3 Webhooks</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Click "Create webhook" and add each of these:
                  </p>

                  <div className="space-y-3">
                    <div className="rounded-lg border">
                      <div className="bg-muted/50 px-4 py-2 border-b">
                        <p className="text-sm font-medium">Webhook 1: Order creation</p>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="grid sm:grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Event:</p>
                            <code className="text-xs">Order creation</code>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-muted-foreground text-xs">URL:</p>
                            <code className="text-xs bg-muted px-2 py-1 rounded block">Your n8n URL from Workflow 1 (/orders-create)</code>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Format: JSON</p>
                      </div>
                    </div>

                    <div className="rounded-lg border">
                      <div className="bg-muted/50 px-4 py-2 border-b">
                        <p className="text-sm font-medium">Webhook 2: Order updated</p>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="grid sm:grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Event:</p>
                            <code className="text-xs">Order updated</code>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-muted-foreground text-xs">URL:</p>
                            <code className="text-xs bg-muted px-2 py-1 rounded block">Your n8n URL from Workflow 2 (/orders-update)</code>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Format: JSON</p>
                      </div>
                    </div>

                    <div className="rounded-lg border">
                      <div className="bg-muted/50 px-4 py-2 border-b">
                        <p className="text-sm font-medium">Webhook 3: Order cancelled</p>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="grid sm:grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Event:</p>
                            <code className="text-xs">Order cancelled</code>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-muted-foreground text-xs">URL:</p>
                            <code className="text-xs bg-muted px-2 py-1 rounded block">Your n8n URL from Workflow 3 (/orders-cancelled)</code>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">Format: JSON</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SettingsCard>
          </TabsContent>

          {/* Testing Tab */}
          <TabsContent value="testing" className="space-y-6">
            <SettingsCard
              icon={CheckCircle}
              title="Test Your Webhook Setup"
              description="Verify everything is working correctly"
            >
              <div className="space-y-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Testing Checklist:</h4>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3 text-sm">
                      <CheckCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">All 3 n8n workflows are <strong>activated</strong> (toggle in top-right)</p>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <CheckCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">All 3 Shopify webhooks are created and <strong>enabled</strong></p>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <CheckCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-muted-foreground">Each HTTP Request node has <code className="bg-muted px-1 rounded text-xs">X-Forwarded-By: n8n</code> header</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Create a Test Order:</h4>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                    <li>In your Shopify Admin, go to <strong>Orders → Create order</strong></li>
                    <li>Add a test product and customer</li>
                    <li>Click <strong>"Create order"</strong></li>
                    <li>Wait 5-10 seconds</li>
                    <li>Check n8n execution log - should show successful run for Workflow 1</li>
                    <li>Go to your <Link href="/orders"><span className="text-primary underline">Orders page</span></Link> - the test order should appear!</li>
                  </ol>
                </div>

                <Alert className="bg-green-500/10 border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-400">
                    If you see the test order in your app, <strong>congratulations!</strong> Webhooks are working correctly.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Troubleshooting:</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>If the order doesn't appear:</p>
                    <ul className="ml-6 space-y-1 list-disc">
                      <li>Check n8n execution logs for errors</li>
                      <li>Verify the <code className="bg-muted px-1 rounded text-xs">X-Forwarded-By: n8n</code> header is present</li>
                      <li>Ensure workflows are activated in n8n</li>
                      <li>Check that Shopify webhooks are enabled (green checkmark)</li>
                      <li>Verify the app URL in your HTTP Request nodes is correct</li>
                    </ul>
                  </div>
                </div>
              </div>
            </SettingsCard>
          </TabsContent>
        </Tabs>

        {/* Back to Settings Link */}
        <div className="text-center pt-6">
          <Link href="/settings">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Settings
            </Button>
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
