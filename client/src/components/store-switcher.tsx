import { Store, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveStore } from "@/hooks/use-store";
import { cn } from "@/lib/utils";
import logoUrl from "@assets/Orderflow_Icon[1]_1761724429427.png";

// ─────────────────────────────────────────────────────────────────────
// StoreSwitcher — sidebar header element for Phase 3 multi-store UI.
//
// Three rendering modes, picked from the user's store membership:
//
//   1. No stores at all (e.g. a fresh non-admin account that hasn't
//      been attached to anything yet) — render a muted "No store" tag.
//      The user can still browse profile/settings; data routes will
//      already be returning 403 from the storeScope middleware.
//   2. Exactly one store — render the storeName as static text. No
//      dropdown chevron, no clickable surface; there's nothing to
//      switch to. The legacy single-store deployment lives here.
//   3. Two or more stores — render a DropdownMenu of all options with
//      a check mark next to the active one. Selecting an item calls
//      setActiveStore(), which both writes localStorage and triggers
//      a query-cache invalidation so every page refetches.
//
// The OrderFlow logo lives inside the trigger to keep visual parity
// with the previous header (logo + "OrderFlow" wordmark). On the
// dropdown variant we replace the wordmark with the active store
// name so the user always sees which tenant they're operating on.
// ─────────────────────────────────────────────────────────────────────

export function StoreSwitcher() {
  const { stores, activeStore, setActiveStore, loading, hasMultipleStores } =
    useActiveStore();

  // While the initial /api/stores/me request is in flight we
  // optimistically render the wordmark — the dropdown can finish
  // populating in the background without flashing an empty state.
  if (loading && stores.length === 0) {
    return (
      <div
        className="flex items-center gap-3 text-[20px]"
        data-testid="store-switcher-loading"
      >
        <img
          src={logoUrl}
          alt="OrderFlow Logo"
          className="h-10 w-10 rounded-md logo-spin-on-hover"
        />
        <div className="flex flex-col">
          <span className="font-semibold text-[16px]">OrderFlow</span>
        </div>
      </div>
    );
  }

  // No memberships — render a clearly empty state so the admin sees
  // they need to grant access in the team directory.
  if (stores.length === 0) {
    return (
      <div
        className="flex items-center gap-3 text-[20px]"
        data-testid="store-switcher-empty"
      >
        <img
          src={logoUrl}
          alt="OrderFlow Logo"
          className="h-10 w-10 rounded-md"
        />
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-[16px]">OrderFlow</span>
          <span className="text-xs text-muted-foreground truncate">
            No store assigned
          </span>
        </div>
      </div>
    );
  }

  const displayName = activeStore?.storeName || activeStore?.storeUrl || "Store";

  // Single store: static label, no dropdown affordance. We still
  // surface the storeName so admins can see at a glance which tenant
  // they're connected to — useful during the rollout while existing
  // deployments are single-store-by-default.
  if (!hasMultipleStores) {
    return (
      <div
        className="flex items-center gap-3 text-[20px]"
        data-testid="store-switcher-single"
      >
        <img
          src={logoUrl}
          alt="OrderFlow Logo"
          className="h-10 w-10 rounded-md logo-spin-on-hover"
        />
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-[16px] truncate">
            {displayName}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            OrderFlow
          </span>
        </div>
      </div>
    );
  }

  // 2+ stores: full dropdown.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-md p-1.5 text-left",
            "hover:bg-sidebar-accent/40 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          data-testid="store-switcher-trigger"
        >
          <img
            src={logoUrl}
            alt="OrderFlow Logo"
            className="h-10 w-10 rounded-md"
          />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-semibold text-[15px] truncate">
              {displayName}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {stores.length} stores · click to switch
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-[--radix-dropdown-menu-trigger-width] min-w-[14rem]"
      >
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Switch store
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stores.map((store) => {
          const isActive = store.id === activeStore?.id;
          return (
            <DropdownMenuItem
              key={store.id}
              onSelect={() => setActiveStore(store.id)}
              className="cursor-pointer"
              data-testid={`store-switcher-item-${store.id}`}
            >
              <div className="flex items-center gap-2 w-full min-w-0">
                <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {store.storeName || store.storeUrl}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {store.storeUrl}
                  </span>
                </div>
                {isActive && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
