import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Store } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { StoreSummary } from "@/hooks/use-store";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// ManageStoreAccessDialog — Phase 4 RBAC UI.
//
// Backs the "Manage Access" button on each non-admin row of the Team
// Directory. The modal lists every connected store with a toggle per
// row; flipping toggles writes to local state, Save submits the new
// set via PUT /api/users/:userId/stores.
//
// Why a full set-reconcile (vs. incremental ADD/REMOVE):
//   - The server endpoint expects { storeIds: [] } and computes the
//     diff in one place.
//   - A modal that's "you can tick / untick rows until you click
//     Save" matches the user's mental model better than tracking
//     pending changes — fewer footguns, no half-applied state if
//     the user cancels mid-flow.
//
// Two queries:
//   - /api/stores/me — every store this *admin* can see, which is
//     the catalog of options. Cached via React Query so opening
//     the modal a second time doesn't refetch.
//   - /api/users/:userId/stores — the target user's current
//     memberships. Refetched every open so the modal can't show a
//     stale checked state if another admin updated the user between
//     opens.
// ─────────────────────────────────────────────────────────────────────

interface ManageStoreAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user whose access is being managed. */
  user: { id: string; fullName: string; email: string; role: string } | null;
}

interface StoresMeResponse {
  stores: StoreSummary[];
}

interface UserStoresResponse {
  storeIds: string[];
}

export function ManageStoreAccessDialog({
  open,
  onOpenChange,
  user,
}: ManageStoreAccessDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selected store ids (local until Save). Initialised from the
  // server response in the effect below so the user can tick/untick
  // freely and either Save or Cancel.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Catalog of stores the admin can see. Driven by the same endpoint
  // that powers the sidebar switcher.
  const { data: storesMe, isLoading: storesLoading } = useQuery<StoresMeResponse>({
    queryKey: ["/api/stores/me"],
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Current memberships for the target user. Re-fetched every time
  // the modal opens for a different user so the toggles match the
  // DB. `enabled` guards against firing for a null user.
  const { data: userStores, isLoading: userStoresLoading } =
    useQuery<UserStoresResponse>({
      queryKey: ["/api/users", user?.id ?? "none", "stores"],
      queryFn: async () => {
        const res = await apiRequest(
          "GET",
          `/api/users/${user!.id}/stores`,
        );
        return res.json();
      },
      enabled: open && !!user,
      staleTime: 0,
    });

  // Hydrate the selection set when the membership fetch lands.
  useEffect(() => {
    if (userStores) {
      setSelected(new Set(userStores.storeIds));
    } else if (!open) {
      setSelected(new Set());
      setError(null);
    }
  }, [userStores, open]);

  const mutation = useMutation({
    mutationFn: async (storeIds: string[]) => {
      if (!user) return null;
      const res = await apiRequest("PUT", `/api/users/${user.id}/stores`, {
        storeIds,
      });
      return res.json() as Promise<{
        storeIds: string[];
        added: string[];
        removed: string[];
      }>;
    },
    onSuccess: async (data) => {
      if (!data || !user) return;
      // Refresh both caches — the target user's row (for badges in
      // the directory if we ever add one) and the user's own
      // /api/stores/me if they're currently logged in.
      await queryClient.invalidateQueries({
        queryKey: ["/api/users", user.id, "stores"],
      });
      const addedCount = data.added.length;
      const removedCount = data.removed.length;
      const noChanges = addedCount === 0 && removedCount === 0;
      toast({
        title: noChanges ? "No changes" : "Access updated",
        description: noChanges
          ? `${user.fullName}'s store access is unchanged.`
          : `Granted ${addedCount}, revoked ${removedCount} store${
              addedCount + removedCount === 1 ? "" : "s"
            } for ${user.fullName}.`,
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
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

  const stores = useMemo(() => storesMe?.stores ?? [], [storesMe]);
  const loading = storesLoading || userStoresLoading;
  const isAdminTarget = user?.role === "admin";

  function toggle(storeId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    mutation.mutate(Array.from(selected));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Manage store access
          </DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                Choose which stores{" "}
                <span className="font-medium text-foreground">
                  {user.fullName}
                </span>{" "}
                can sign into. Changes apply on their next request.
              </>
            ) : (
              "Choose which stores this user can access."
            )}
          </DialogDescription>
        </DialogHeader>

        {isAdminTarget && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Admins implicitly have access to every store via the role
              bypass. These toggles still drive the explicit{" "}
              <code className="text-[11px]">user_stores</code> rows for
              audit; clearing them won't lock the admin out.
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : stores.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center space-y-1">
            <p className="text-sm font-medium">No stores connected yet</p>
            <p className="text-xs text-muted-foreground">
              Add a Shopify store from the Integrations page first.
            </p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {stores.map((store) => {
              const checked = selected.has(store.id);
              const name = store.storeName?.trim() || store.storeUrl;
              return (
                <label
                  key={store.id}
                  htmlFor={`store-access-${store.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-md p-2 cursor-pointer",
                    "hover:bg-accent transition-colors",
                  )}
                  data-testid={`store-access-row-${store.id}`}
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <Label
                      htmlFor={`store-access-${store.id}`}
                      className="text-sm font-medium cursor-pointer truncate"
                    >
                      {name}
                    </Label>
                    <span className="text-xs text-muted-foreground truncate">
                      {store.storeUrl}
                    </span>
                  </div>
                  <Switch
                    id={`store-access-${store.id}`}
                    checked={checked}
                    onCheckedChange={() => toggle(store.id)}
                    disabled={mutation.isPending}
                    data-testid={`switch-store-access-${store.id}`}
                  />
                </label>
              );
            })}
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription data-testid="manage-access-error">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-manage-access-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={mutation.isPending || loading || stores.length === 0}
            data-testid="button-manage-access-save"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
