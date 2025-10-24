import { useState } from "react";
import { Link } from "wouter";
import { PageLayout } from "@/components/page-layout";
import { SettingsCard } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { ArrowLeft, ArrowRight, CheckCircle, ExternalLink, Key } from "lucide-react";

export default function ShopifySetupPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  return (
    <PageLayout
      title="Shopify Setup Guide"
      description="Step-by-step guide to connect your Shopify store"
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  step === currentStep
                    ? "bg-primary text-primary-foreground"
                    : step < currentStep
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step < currentStep ? <CheckCircle className="h-4 w-4" /> : step}
              </div>
              {step < totalSteps && (
                <div
                  className={`h-0.5 w-12 ${
                    step < currentStep ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Get API Credentials */}
        {currentStep === 1 && (
          <SettingsCard
            icon={Key}
            title="Step 1: Get Shopify API Credentials"
            description="Create a custom app in your Shopify Admin to get API access"
          >
            <div className="space-y-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Follow these steps in your Shopify Admin:</h4>
                <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside ml-2">
                  <li>Navigate to <strong>Settings → Apps and sales channels</strong></li>
                  <li>Click <strong>"Develop apps"</strong> button</li>
                  <li>Click <strong>"Create an app"</strong></li>
                  <li>Name it "OrderFlowAI" and click <strong>"Create app"</strong></li>
                  <li>Click <strong>"Configure Admin API scopes"</strong></li>
                  <li>Enable these scopes:
                    <ul className="ml-6 mt-2 space-y-1 list-disc">
                      <li><code className="bg-muted px-1 rounded text-xs">read_orders</code></li>
                      <li><code className="bg-muted px-1 rounded text-xs">write_orders</code></li>
                      <li><code className="bg-muted px-1 rounded text-xs">read_customers</code></li>
                    </ul>
                  </li>
                  <li>Click <strong>"Save"</strong> and then <strong>"Install app"</strong></li>
                  <li>Copy your <strong>Admin API access token</strong> (shows only once!)</li>
                </ol>
              </div>

              <Alert>
                <ExternalLink className="h-4 w-4" />
                <AlertDescription>
                  <a 
                    href="https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/generate-app-access-tokens-admin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    View Shopify's official documentation →
                  </a>
                </AlertDescription>
              </Alert>

              <div className="flex justify-end">
                <Button onClick={nextStep} className="gap-2">
                  Next: Add Credentials
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SettingsCard>
        )}

        {/* Step 2: Add Credentials */}
        {currentStep === 2 && (
          <SettingsCard
            icon={Key}
            title="Step 2: Add Credentials to Replit"
            description="Securely store your Shopify credentials in Replit Secrets"
          >
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  <strong>Important:</strong> Never hard-code API credentials. Use Replit Secrets for secure storage.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Add these secrets in Replit:</h4>
                <p className="text-sm text-muted-foreground">
                  Click the lock icon (🔒) in the left sidebar, then add:
                </p>

                <div className="space-y-3">
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono">SHOPIFY_STORE_URL</code>
                      <Badge variant="outline">Required</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your store domain (e.g., mystore.myshopify.com)
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono">SHOPIFY_API_KEY</code>
                      <Badge variant="outline">Required</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Admin API access token from Step 1
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono">SHOPIFY_API_SECRET</code>
                      <Badge variant="outline">Required</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Admin API secret key from your app settings
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono">SHOPIFY_WEBHOOK_SECRET</code>
                      <Badge variant="outline">Optional (for webhooks)</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Webhook verification secret (needed for direct webhooks)
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={prevStep} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={nextStep} className="gap-2">
                  Next: Test Connection
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SettingsCard>
        )}

        {/* Step 3: Test Connection */}
        {currentStep === 3 && (
          <SettingsCard
            icon={CheckCircle}
            title="Step 3: Test Your Connection"
            description="Verify that everything is set up correctly"
          >
            <div className="space-y-4">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Test your Shopify integration:</h4>
                <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside ml-2">
                  <li>Go back to the <Link href="/settings"><span className="text-primary underline">Shopify Settings</span></Link> page</li>
                  <li>Click the <strong>"Sync Now"</strong> button</li>
                  <li>You should see your orders importing successfully</li>
                  <li>If you get an error, double-check your credentials in Replit Secrets</li>
                </ol>
              </div>

              <Alert className="bg-green-500/10 border-green-500/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  <strong>Success!</strong> You've completed the Shopify setup. Your store is now connected.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Next steps:</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link href="/settings">
                    <Button variant="outline" className="w-full justify-start gap-2">
                      Go to Shopify Settings
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/settings/shopify/webhooks">
                    <Button variant="outline" className="w-full justify-start gap-2">
                      Setup Real-Time Webhooks
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <Button variant="outline" onClick={prevStep} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Link href="/settings">
                  <Button className="gap-2">
                    Finish Setup
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </SettingsCard>
        )}

        {/* Back to Settings Link */}
        <div className="text-center">
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
