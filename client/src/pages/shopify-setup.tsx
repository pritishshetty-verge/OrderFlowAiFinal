import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { SettingsCard } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, ArrowRight, CheckCircle, ExternalLink, Key, Eye, EyeOff, Loader2 } from "lucide-react";

const credentialsSchema = z.object({
  storeUrl: z.string().min(1, "Store URL is required").regex(/\.myshopify\.com$/, "Store URL must end with .myshopify.com"),
  apiKey: z.string().min(1, "Admin API access token is required"),
  apiSecret: z.string().min(1, "API secret key is required"),
  accessToken: z.string().min(1, "Access token is required"),
  webhookSecret: z.string().optional(),
});

type CredentialsFormData = z.infer<typeof credentialsSchema>;

export default function ShopifySetupPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [showSecrets, setShowSecrets] = useState({
    apiKey: false,
    apiSecret: false,
    accessToken: false,
    webhookSecret: false,
  });
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    shopName?: string;
    message?: string;
  } | null>(null);
  const totalSteps = 3;
  const { toast } = useToast();

  const form = useForm<CredentialsFormData>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      storeUrl: "",
      apiKey: "",
      apiSecret: "",
      accessToken: "",
      webhookSecret: "",
    },
  });

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const toggleSecret = (field: keyof typeof showSecrets) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  // Save credentials mutation
  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: CredentialsFormData) => {
      return await apiRequest("POST", "/api/shopify/credentials", data) as any;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials/status"] });
      
      if (data.success) {
        setConnectionTestResult({
          success: true,
          shopName: data.shopName,
          message: data.message,
        });
        
        toast({
          title: "Success",
          description: data.message || "Credentials saved successfully",
        });
        
        // Auto-advance to step 3
        setTimeout(() => {
          nextStep();
        }, 1000);
      } else {
        setConnectionTestResult({
          success: false,
          message: data.testError || "Connection test failed",
        });
        
        toast({
          title: "Credentials Saved",
          description: "Credentials saved but connection test failed. Please check your credentials.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save credentials",
        variant: "destructive",
      });
    },
  });

  const handleSaveCredentials = (data: CredentialsFormData) => {
    saveCredentialsMutation.mutate(data);
  };

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

        {/* Step 2: Add Credentials (In-App Form) */}
        {currentStep === 2 && (
          <SettingsCard
            icon={Key}
            title="Step 2: Add Your Shopify Credentials"
            description="Enter your credentials securely - they will be encrypted and stored safely"
          >
            <form onSubmit={form.handleSubmit(handleSaveCredentials)} className="space-y-4">
              <Alert>
                <AlertDescription>
                  <strong>Secure Storage:</strong> Your credentials will be encrypted and stored securely in the database. Never share your API keys.
                </AlertDescription>
              </Alert>

              {/* Store URL */}
              <div className="space-y-2">
                <Label htmlFor="storeUrl">
                  Store URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="storeUrl"
                  placeholder="yourstore.myshopify.com"
                  data-testid="input-store-url"
                  {...form.register("storeUrl")}
                />
                {form.formState.errors.storeUrl && (
                  <p className="text-sm text-red-500">{form.formState.errors.storeUrl.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Your Shopify store domain (e.g., mystore.myshopify.com)
                </p>
              </div>

              {/* Admin API Access Token */}
              <div className="space-y-2">
                <Label htmlFor="accessToken">
                  Admin API Access Token <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="accessToken"
                    type={showSecrets.accessToken ? "text" : "password"}
                    placeholder="shpat_..."
                    data-testid="input-access-token"
                    {...form.register("accessToken")}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret("accessToken")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="toggle-access-token"
                  >
                    {showSecrets.accessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.formState.errors.accessToken && (
                  <p className="text-sm text-red-500">{form.formState.errors.accessToken.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  The Admin API access token you copied in Step 1
                </p>
              </div>

              {/* API Key (Client ID) */}
              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  API Key (Client ID) <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showSecrets.apiKey ? "text" : "password"}
                    placeholder="Enter your API key"
                    data-testid="input-api-key"
                    {...form.register("apiKey")}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret("apiKey")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="toggle-api-key"
                  >
                    {showSecrets.apiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.formState.errors.apiKey && (
                  <p className="text-sm text-red-500">{form.formState.errors.apiKey.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Found in your Shopify app's API credentials
                </p>
              </div>

              {/* API Secret */}
              <div className="space-y-2">
                <Label htmlFor="apiSecret">
                  API Secret Key <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="apiSecret"
                    type={showSecrets.apiSecret ? "text" : "password"}
                    placeholder="Enter your API secret"
                    data-testid="input-api-secret"
                    {...form.register("apiSecret")}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret("apiSecret")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="toggle-api-secret"
                  >
                    {showSecrets.apiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.formState.errors.apiSecret && (
                  <p className="text-sm text-red-500">{form.formState.errors.apiSecret.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Your app's secret key from Shopify settings
                </p>
              </div>

              {/* Webhook Secret (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="webhookSecret">
                  Webhook Secret <Badge variant="outline" className="ml-2">Optional</Badge>
                </Label>
                <div className="relative">
                  <Input
                    id="webhookSecret"
                    type={showSecrets.webhookSecret ? "text" : "password"}
                    placeholder="For direct webhooks only"
                    data-testid="input-webhook-secret"
                    {...form.register("webhookSecret")}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret("webhookSecret")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="toggle-webhook-secret"
                  >
                    {showSecrets.webhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only needed if using direct Shopify webhooks (n8n setup doesn't need this)
                </p>
              </div>

              {connectionTestResult && !connectionTestResult.success && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <strong>Connection Test Failed:</strong> {connectionTestResult.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={prevStep} 
                  className="gap-2"
                  disabled={saveCredentialsMutation.isPending}
                  data-testid="button-back"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button 
                  type="submit" 
                  className="gap-2"
                  disabled={saveCredentialsMutation.isPending}
                  data-testid="button-save-credentials"
                >
                  {saveCredentialsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      Save & Test Connection
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </SettingsCard>
        )}

        {/* Step 3: Connection Success */}
        {currentStep === 3 && (
          <SettingsCard
            icon={CheckCircle}
            title="Step 3: Setup Complete!"
            description="Your Shopify store is now connected"
          >
            <div className="space-y-4">
              {connectionTestResult?.success && connectionTestResult.shopName && (
                <Alert className="bg-green-500/10 border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-400">
                    <strong>Successfully Connected!</strong> Your store "{connectionTestResult.shopName}" is now linked to OrderFlowAI.
                  </AlertDescription>
                </Alert>
              )}

              {!connectionTestResult?.success && (
                <Alert className="bg-green-500/10 border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-400">
                    <strong>Credentials Saved!</strong> Your Shopify credentials have been saved securely.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <h4 className="text-sm font-medium">What you can do now:</h4>
                <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside ml-2">
                  <li>Go to <strong>Shopify Settings</strong> to sync your existing orders</li>
                  <li>Set up <strong>Real-Time Webhooks</strong> for automatic order updates</li>
                  <li>View and manage your orders in the <strong>Dashboard</strong></li>
                  <li>Assign orders to team members and track performance</li>
                </ol>
              </div>

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
