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
import { Loader2, AlertCircle, Plus, CheckCircle } from "lucide-react";
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
        description: `${data.store.storeName ?? data.store.storeUrl} is now your active store.${webhookNote}`,
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
      </DialogContent>
    </Dialog>
  );
}
