import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Plus, CheckCircle, HelpCircle, ArrowLeft, ExternalLink, Copy, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveStore } from "@/hooks/use-store";
import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────
// AddStoreDialog — Phase 4 multi-store onboarding form.
//
// Renders a dialog with five inputs (storeName, storeUrl, apiKey,
// apiSecret, webhookSecret) and a single "Connect" button. Submission
// flow:
//
//   1. POST /api/stores with the form values. Backend tests the
//      credentials inline and either commits (201) or returns 400
//      with a human-readable failure message.
//   2. On success:
//        a. Toast the result, including webhook registration counts
//           if APP_URL was configured server-side.
//        b. Invalidate /api/stores/me so the StoreSwitcher picks up
//           the new store immediately.
//        c. Switch to the new store via setActiveStore so the rest of
//           the UI is already pointed at it when the dialog closes.
//        d. Close the dialog and reset the form.
//   3. On failure: show the error in an inline Alert. The dialog
//      stays open so the user can correct the field and retry
//      without re-typing everything.
//
// Why a dialog (not a separate page): admins almost always trigger
// this from the sidebar switcher or the Integrations card — both
// places where keeping context (the rest of the dashboard) helps.
// ─────────────────────────────────────────────────────────────────────

interface AddStoreDialogProps {
  /** Render the trigger inline, e.g. a Button with "+ Add store". */
  trigger: ReactNode;
}

type FormState = {
  storeName: string;
  storeUrl: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
};

const INITIAL: FormState = {
  storeName: "",
  storeUrl: "",
  apiKey: "",
  apiSecret: "",
  webhookSecret: "",
};

export function AddStoreDialog({ trigger }: AddStoreDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setActiveStore } = useActiveStore();

  const mutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const res = await apiRequest("POST", "/api/stores", payload);
      return res.json() as Promise<{
        store: {
          id: string;
          storeName: string | null;
          storeUrl: string;
        };
        shopName: string | null;
        webhooks: { topics: Array<{ action: string }> } | null;
      }>;
    },
    onSuccess: async (data) => {
      // Refresh the store list and switch into the new tenant
      // immediately so subsequent navigation lands on it.
      await queryClient.invalidateQueries({ queryKey: ["/api/stores/me"] });
      setActiveStore(data.store.id);

      // Kick off the historical order import in the background so the admin
      // doesn't have to trigger a separate "Sync orders" step. The active
      // store was just switched above, so the X-Active-Store-Id header now
      // targets the new store. Fire-and-forget: a failure here (e.g. a sync
      // already running) is non-fatal and surfaces on the Sync card.
      apiRequest("POST", "/api/shopify/sync", {}).catch((err) => {
        console.warn("[add-store] background order sync could not start:", err);
      });

      // Friendly summary of the webhook registration, if APP_URL was
      // configured. Skipping the count when null is intentional —
      // we don't want to imply something went wrong on local dev
      // where APP_URL is often unset.
      let webhookNote = "";
      if (data.webhooks) {
        const total = data.webhooks.topics.length;
        const ok = data.webhooks.topics.filter(
          (t) => t.action !== "failed",
        ).length;
        webhookNote = ` · ${ok}/${total} webhook topics registered`;
      }

      toast({
        title: "Store connected",
        description: `${data.store.storeName ?? data.store.storeUrl} is now your active store — importing orders in the background.${webhookNote}`,
      });

      setOpen(false);
      setForm(INITIAL);
      setError(null);
    },
    onError: (err: any) => {
      // apiRequest throws `${status}: ${body}` — extract a clean
      // message for the inline alert.
      const raw = err?.message ?? "Unknown error";
      const stripped = raw.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(stripped);
        setError(parsed?.error ?? stripped);
      } catch {
        setError(stripped);
      }
    },
  });

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Light client-side gate so the user gets feedback before the
    // network round-trip. The server re-validates everything.
    if (!form.storeUrl.trim() || !form.apiKey.trim() || !form.apiSecret.trim()) {
      setError(
        "Store URL, API Key, and API Secret are required.",
      );
      return;
    }
    mutation.mutate(form);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reset transient state when the dialog closes so a re-open
        // doesn't surface a stale error or half-typed creds.
        setOpen(next);
        if (!next) {
          setError(null);
          setShowGuide(false);
          if (!mutation.isPending) setForm(INITIAL);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Connect a Shopify store
          </DialogTitle>
          <DialogDescription>
            Adds a brand-new store to your workspace. We test the credentials
            before saving — invalid keys won't be committed to the database.
          </DialogDescription>
        </DialogHeader>
        {showGuide ? (
          <ShopifySetupGuide onBack={() => setShowGuide(false)} />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-store-name">Store name (optional)</Label>
            <Input
              id="add-store-name"
              placeholder="Acme Demo"
              value={form.storeName}
              onChange={(e) => update("storeName", e.target.value)}
              disabled={mutation.isPending}
              data-testid="input-add-store-name"
            />
            <p className="text-xs text-muted-foreground">
              Defaults to the shop name returned by Shopify if left blank.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-store-url">Store URL</Label>
            <Input
              id="add-store-url"
              placeholder="acme-demo.myshopify.com"
              value={form.storeUrl}
              onChange={(e) => update("storeUrl", e.target.value)}
              required
              disabled={mutation.isPending}
              data-testid="input-add-store-url"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-store-key">API Key (Client ID)</Label>
            <Input
              id="add-store-key"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={form.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              required
              disabled={mutation.isPending}
              data-testid="input-add-store-key"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-store-secret">API Secret (Client Secret)</Label>
            <Input
              id="add-store-secret"
              type="password"
              placeholder="shpss_…"
              value={form.apiSecret}
              onChange={(e) => update("apiSecret", e.target.value)}
              required
              disabled={mutation.isPending}
              data-testid="input-add-store-secret"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-store-webhook-secret">
              Webhook Secret (optional)
            </Label>
            <Input
              id="add-store-webhook-secret"
              type="password"
              placeholder="Used to verify incoming webhooks"
              value={form.webhookSecret}
              onChange={(e) => update("webhookSecret", e.target.value)}
              disabled={mutation.isPending}
              data-testid="input-add-store-webhook-secret"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for now if you haven't configured webhooks yet — you
              can add it later from Settings.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription data-testid="add-store-error">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowGuide(true)}
              disabled={mutation.isPending}
              className="sm:mr-auto gap-1.5"
              data-testid="button-add-store-help"
            >
              <HelpCircle className="h-4 w-4" />
              Need help?
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
              data-testid="button-add-store-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              data-testid="button-add-store-submit"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing &amp; saving…
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Connect store
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ShopifySetupGuide — in-dialog walkthrough for creating a Shopify custom
// app and finding the credentials this form asks for. Shown when the user
// clicks "Need help?"; the form stays mounted in state so nothing typed is
// lost when switching back.
// ─────────────────────────────────────────────────────────────────────

// Full scope set an OMS may need, enabled up front so the app's
// configuration never has to be edited again later. Grouped by area;
// copied to the clipboard as a single comma-separated list that can be
// pasted into Shopify's scope field / app config.
const SHOPIFY_SCOPES = [
  // Orders (read_all_orders unlocks full history older than 60 days)
  "read_all_orders",
  "read_orders",
  "write_orders",
  "read_draft_orders",
  "write_draft_orders",
  // Customers
  "read_customers",
  "write_customers",
  // Products & inventory
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  // Fulfillment & shipping
  "read_fulfillments",
  "write_fulfillments",
  "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders",
  "read_assigned_fulfillment_orders",
  "write_assigned_fulfillment_orders",
  "read_third_party_fulfillment_orders",
  "write_third_party_fulfillment_orders",
  "read_shipping",
  // Returns / RTO
  "read_returns",
  "write_returns",
  // Discounts & coupons (attribution)
  "read_discounts",
  "write_discounts",
  "read_price_rules",
  "write_price_rules",
  // Locations & payments (reconciliation)
  "read_locations",
  "read_shopify_payments_payouts",
  "read_shopify_payments_disputes",
];

function GuideStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold flex-shrink-0">
          {n}
        </span>
        <h4 className="font-medium">{title}</h4>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function ShopifySetupGuide({ onBack }: { onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const scopesText = SHOPIFY_SCOPES.join(", ");
  const handleCopyScopes = async () => {
    try {
      await navigator.clipboard.writeText(scopesText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) — no-op.
    }
  };
  return (
    <div className="space-y-4">
      <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-5 text-sm">
        <p className="text-muted-foreground">
          OrderFlow connects with a Shopify <strong>custom app</strong> using
          the Client Credentials grant — there's no access token to copy, just a
          Client ID and Client Secret. Takes about 3 minutes.
        </p>

        <GuideStep n={1} title="Create a custom app">
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>
              In your Shopify admin, open{" "}
              <strong>Settings &rarr; Apps and sales channels &rarr; Develop apps</strong>.
            </li>
            <li>
              First time only: click <strong>Allow custom app development</strong>.
            </li>
            <li>
              Click <strong>Create an app</strong>, name it <em>OrderFlow</em>,
              and create it.
            </li>
          </ul>
        </GuideStep>

        <GuideStep n={2} title="Enable Admin API scopes">
          <p className="text-muted-foreground">
            Open <strong>Configuration &rarr; Admin API integration</strong>,
            then copy the full scope list below and enable each one. Click{" "}
            <strong>Save</strong> when done.
          </p>
          <div className="mt-2 overflow-hidden rounded-md border bg-muted/40">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Admin API scopes
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleCopyScopes}
                data-testid="button-copy-scopes"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy all"}
              </Button>
            </div>
            <code className="block px-3 py-2 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {scopesText}
            </code>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Includes{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
              read_all_orders
            </code>{" "}
            (full order history) plus all the scopes OrderFlow may need, so you
            won't have to edit the app's permissions again later.
          </p>
        </GuideStep>

        <GuideStep n={3} title="Install the app">
          <p className="text-muted-foreground">
            Click <strong>Install app</strong> (top-right). This activates your
            API credentials.
          </p>
        </GuideStep>

        <GuideStep n={4} title="Copy the credentials into this form">
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>
              Open the <strong>API credentials</strong> tab.
            </li>
            <li>
              <strong>Client ID</strong> &rarr; paste into{" "}
              <strong>API Key (Client ID)</strong>.
            </li>
            <li>
              <strong>Client secret</strong> &rarr; paste into{" "}
              <strong>API Secret (Client Secret)</strong>.
            </li>
            <li>
              <strong>Store URL</strong> is your myshopify domain, e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                acme-demo.myshopify.com
              </code>
              .
            </li>
          </ul>
        </GuideStep>

        <GuideStep n={5} title="Webhook secret? Skip it">
          <p className="text-muted-foreground">
            Leave <strong>Webhook Secret</strong> blank — OrderFlow registers the
            order webhooks for you automatically right after you connect.
          </p>
        </GuideStep>

        <a
          href="https://help.shopify.com/en/manual/apps/app-types/custom-apps"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs"
        >
          Open Shopify's official custom-app guide
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="gap-1.5"
          data-testid="button-guide-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to form
        </Button>
      </DialogFooter>
    </div>
  );
}
