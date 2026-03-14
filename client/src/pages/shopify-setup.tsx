import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { SettingsCard } from "@/components/ui/settings-card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, ArrowRight, CheckCircle, ExternalLink, Key, Eye, EyeOff, Loader2, Shield } from "lucide-react";

const credentialsSchema = z.object({
  storeUrl: z.string().min(1, "Shop domain is required").regex(/\.myshopify\.com$/, "Must end with .myshopify.com"),
  apiKey: z.string().min(1, "Client ID is required"),
  apiSecret: z.string().min(1, "Client Secret is required"),
  webhookSecret: z.string().optional(),
});

type CredentialsFormData = z.infer<typeof credentialsSchema>;

export default function ShopifySetupPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [showSecrets, setShowSecrets] = useState({
    apiKey: false,
    apiSecret: false,
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
      webhookSecret: "",
    },
  });

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const toggleSecret = (field: keyof typeof showSecrets) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: CredentialsFormData) => {
      const currentUserId = localStorage.getItem("userId");
      const res = await apiRequest("POST", "/api/shopify/credentials", {
        ...data,
        currentUserId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/credentials/status"] });

      if (data.success) {
        setConnectionTestResult({
          success: true,
          shopName: data.shopName,
          message: data.message,
        });
        toast({ title: "Connected", description: data.message || "Shopify store connected successfully" });
        setTimeout(() => nextStep(), 1000);
      } else {
        setConnectionTestResult({
          success: false,
          message: data.testError || "Connection test failed",
        });
        toast({
          title: "Saved — Connection Failed",
          description: "Credentials saved but the connection test failed. Please verify your Client ID and Secret.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save credentials", variant: "destructive" });
    },
  });

  const handleSaveCredentials = (data: CredentialsFormData) => {
    saveCredentialsMutation.mutate(data);
  };

  return (
    <PageLayout
      title="Shopify Setup Guide"
      description="Connect your Shopify store using the 2026 Client Credentials API"
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
                <div className={`h-0.5 w-12 ${step < currentStep ? "bg-green-500" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Create App & Get Credentials */}
        {currentStep === 1 && (
          <SettingsCard
            icon={Key}
            title="Step 1: Create a Shopify Custom App"
            description="Get your Client ID and Client Secret from Shopify Partners or your store's app settings"
          >
            <div className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  <strong>2026 Update:</strong> Shopify now uses the Client Credentials Grant flow instead of static access tokens. You need a <strong>Client ID</strong> and <strong>Client Secret</strong> from a Custom App.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Steps in your Shopify Admin:</h4>
                <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside ml-2">
                  <li>Go to <strong>Settings → Apps and sales channels</strong></li>
                  <li>Click <strong>"Develop apps"</strong>, then <strong>"Create an app"</strong></li>
                  <li>Name it (e.g. "OrderSync") and click <strong>"Create app"</strong></li>
                  <li>Under <strong>Configuration → Admin API integration</strong>, enable these scopes:
                    <ul className="ml-6 mt-2 space-y-1 list-disc">
                      <li><code className="bg-muted px-1 rounded text-xs">read_orders, write_orders</code></li>
                      <li><code className="bg-muted px-1 rounded text-xs">read_customers, write_customers</code></li>
                      <li><code className="bg-muted px-1 rounded text-xs">read_fulfillments, write_fulfillments</code></li>
                      <li><code className="bg-muted px-1 rounded text-xs">read_products</code></li>
                    </ul>
                  </li>
                  <li>Click <strong>"Save"</strong> and then <strong>"Install app"</strong></li>
                  <li>Go to <strong>API credentials</strong> tab — copy your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                </ol>
              </div>

              <Alert>
                <ExternalLink className="h-4 w-4" />
                <AlertDescription>
                  <a
                    href="https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    View Shopify Client Credentials documentation →
                  </a>
                </AlertDescription>
              </Alert>

              <div className="flex justify-end">
                <Button onClick={nextStep} className="gap-2" data-testid="button-next-step">
                  Next: Enter Credentials
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SettingsCard>
        )}

        {/* Step 2: Enter Credentials */}
        {currentStep === 2 && (
          <SettingsCard
            icon={Key}
            title="Step 2: Enter Your App Credentials"
            description="Your credentials are encrypted and stored securely — never shared"
          >
            <form onSubmit={form.handleSubmit(handleSaveCredentials)} className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  <strong>Secure Storage:</strong> All credentials are encrypted before being saved to the database.
                </AlertDescription>
              </Alert>

              {/* Shop Domain */}
              <div className="space-y-2">
                <Label htmlFor="storeUrl">
                  Shop Domain <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="storeUrl"
                  placeholder="yourstore.myshopify.com"
                  data-testid="input-store-url"
                  {...form.register("storeUrl")}
                />
                {form.formState.errors.storeUrl && (
                  <p className="text-sm text-destructive">{form.formState.errors.storeUrl.message}</p>
                )}
                <p className="text-xs text-muted-foreground">Your store's .myshopify.com domain</p>
              </div>

              {/* Client ID */}
              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  Client ID <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showSecrets.apiKey ? "text" : "password"}
                    placeholder="Shopify app Client ID"
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
                  <p className="text-sm text-destructive">{form.formState.errors.apiKey.message}</p>
                )}
                <p className="text-xs text-muted-foreground">From your app's API credentials tab</p>
              </div>

              {/* Client Secret */}
              <div className="space-y-2">
                <Label htmlFor="apiSecret">
                  Client Secret <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="apiSecret"
                    type={showSecrets.apiSecret ? "text" : "password"}
                    placeholder="Shopify app Client Secret"
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
                  <p className="text-sm text-destructive">{form.formState.errors.apiSecret.message}</p>
                )}
                <p className="text-xs text-muted-foreground">From your app's API credentials tab</p>
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
                    placeholder="For direct Shopify webhooks only"
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
                <p className="text-xs text-muted-foreground">Only needed for direct Shopify webhooks (not required for n8n relay)</p>
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
                      Testing & Saving...
                    </>
                  ) : (
                    <>
                      Test Connection & Save
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </SettingsCard>
        )}

        {/* Step 3: Setup Complete */}
        {currentStep === 3 && (
          <SettingsCard
            icon={CheckCircle}
            title="Step 3: Setup Complete!"
            description="Your Shopify store is now connected via Client Credentials"
          >
            <div className="space-y-4">
              {connectionTestResult?.success && (
                <Alert className="bg-green-500/10 border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-400">
                    <strong>Successfully Connected!</strong>{" "}
                    {connectionTestResult.shopName
                      ? `Your store "${connectionTestResult.shopName}" is now linked.`
                      : "Your Shopify store is now linked to OrderSync."}
                  </AlertDescription>
                </Alert>
              )}

              {!connectionTestResult?.success && (
                <Alert className="bg-green-500/10 border-green-500/20">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700 dark:text-green-400">
                    <strong>Credentials Saved.</strong> The connection test failed — you can retry from Settings.
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
