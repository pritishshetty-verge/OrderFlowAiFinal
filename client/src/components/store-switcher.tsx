import { useMemo } from "react";
import { useLocation } from "wouter";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveStore, type StoreSummary } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// StoreSwitcher — premium workspace switcher for the sidebar.
//
// Visual reference: the Linear / Vercel / Notion style — gradient
// avatar tile, single-line workspace name, ChevronsUpDown affordance
// on the right that appears only when there's more than one option.
//
// Three render modes, picked from the user's `user_stores` membership:
//
//   1. Empty (zero stores) — muted avatar + "No store assigned". The
//      user can still browse profile/settings; the backend's
//      storeScope middleware will 403 every data route on its own.
//   2. Single store — non-interactive workspace tile (avatar + name).
//      No dropdown chevron, no hover state. The legacy single-store
//      deployment lives here.
//   3. Multi-store — full DropdownMenu trigger with chevron, hover
//      state, and a check mark next to the active row.
//
// Avatars are derived deterministically from the store id so each
// tenant gets a stable, unique-looking tile without needing an
// uploaded logo. djb2-ish hash → HSL gradient.
// ─────────────────────────────────────────────────────────────────────

function storeGradient(id: string): string {
  // Cheap, deterministic hash → hue. Spread of 40° between stops
  // keeps the gradient readable rather than flat-looking.
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h) ^ id.charCodeAt(i); // h*33 ^ char
  }
  const hue1 = Math.abs(h) % 360;
  const hue2 = (hue1 + 40) % 360;
  // Two-stop linear gradient: 70% saturation keeps it vivid without
  // straying into neon territory; the lightness drop on the second
  // stop adds the subtle dimensional feel of the inspiration image.
  return `linear-gradient(135deg, hsl(${hue1} 72% 56%), hsl(${hue2} 72% 44%))`;
}

function storeInitial(store: StoreSummary): string {
  const source = store.storeName?.trim() || store.storeUrl;
  // Strip protocol / www / .myshopify.com noise so the initial is
  // actually the brand letter, not "W" for "www".
  const cleaned = source
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.myshopify\.com.*$/i, "");
  return (cleaned[0] || "?").toUpperCase();
}

/**
 * Reusable square avatar tile. Used in both the trigger and inside
 * each dropdown row so the visual rhyme is tight.
 *
 * Render strategy:
 *   1. If the store has a logoUrl (uploaded via Settings → Workspace,
 *      or set to a CDN URL), render <img> on a neutral background.
 *      object-contain keeps the aspect ratio so a wide wordmark
 *      doesn't get cropped into a square. A faint ring + white
 *      backdrop give it visual weight against the sidebar.
 *   2. Otherwise fall back to the deterministic gradient avatar
 *      (djb2 hash of store.id → HSL gradient) with the first
 *      letter of the store name inside. Every store gets a stable,
 *      unique tile without any uploads.
 */
function StoreAvatar({
  store,
  size = "md",
}: {
  store: StoreSummary;
  size?: "sm" | "md";
}) {
  const gradient = useMemo(() => storeGradient(store.id), [store.id]);
  const initial = storeInitial(store);
  const sizeClass = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  if (store.logoUrl) {
    return (
      <div
        className={cn(
          "shrink-0 rounded-md overflow-hidden",
          "bg-white shadow-sm ring-1 ring-black/5",
          "flex items-center justify-center",
          sizeClass,
        )}
        aria-hidden
      >
        <img
          src={store.logoUrl}
          alt=""
          // object-contain so non-square logos (most wordmarks) keep
          // their aspect ratio. A tiny inset keeps the asset from
          // touching the rounded edge.
          className="h-full w-full object-contain p-0.5"
          // Defensive: a broken/expired CDN URL shouldn't break the
          // entire sidebar layout. Hide the img on error and let the
          // white tile show through. (We don't fall back to the
          // gradient at runtime — that would require a state hook
          // here; the empty white tile is the calmer failure mode.)
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "shrink-0 rounded-md flex items-center justify-center",
        "text-white font-semibold shadow-sm ring-1 ring-black/5",
        size === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm",
      )}
      style={{ background: gradient }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function StoreSwitcher() {
  const {
    stores,
    activeStore,
    setActiveStore,
    bootLoading,
    hasMultipleStores,
  } = useActiveStore();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  // Admins always get the dropdown — even with a single store —
  // because they can connect another one via the "Add store" CTA at
  // the bottom. Non-admins only get the dropdown when there's
  // actually more than one store to choose from; otherwise the
  // single-store static label is correct.
  const isAdmin = user?.role === "admin";
  const showDropdown = hasMultipleStores || (isAdmin && stores.length > 0);

  // ── Boot skeleton ────────────────────────────────────────────────
  //
  // `bootLoading` covers both the AuthProvider rehydration window AND
  // the /api/stores/me first-fetch window. Using it (instead of
  // useQuery's local `isLoading`) prevents the brief "No store
  // assigned" flash users were seeing right after login — see audit
  // bug #2.
  //
  // Premium polish: name skeleton sized to ~8rem so it matches a
  // realistic workspace name length, with a tiny secondary bar for
  // the visual cadence of a two-row workspace header even though we
  // only render one line of real text. Eliminates layout shift when
  // the data lands.
  if (bootLoading) {
    return (
      <div
        className="flex items-center gap-2.5 px-1.5 py-1"
        data-testid="store-switcher-loading"
        aria-busy="true"
      >
        <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
          <div className="h-2 w-20 rounded bg-muted/60 animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Zero memberships ─────────────────────────────────────────────
  //
  // Reached only after boot has fully settled and the user truly has
  // no user_stores rows. Pre-bootLoading this branch used to fire
  // during the loading window — fixed by gating on bootLoading above.
  if (stores.length === 0) {
    return (
      <div
        className="flex items-center gap-2.5 px-1.5 py-1"
        data-testid="store-switcher-empty"
      >
        <div className="h-8 w-8 shrink-0 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-sm font-medium">
          ?
        </div>
        <span className="text-sm text-muted-foreground truncate">
          No store assigned
        </span>
      </div>
    );
  }

  if (!activeStore) {
    // Edge case: stores arrived but reconciliation hasn't picked one
    // yet (one render tick). Render the same boot skeleton so the
    // sidebar header height is stable.
    return (
      <div className="flex items-center gap-2.5 px-1.5 py-1">
        <div className="h-8 w-8 rounded-md bg-muted animate-pulse" />
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
          <div className="h-2 w-20 rounded bg-muted/60 animate-pulse" />
        </div>
      </div>
    );
  }

  const displayName =
    activeStore.storeName?.trim() || activeStore.storeUrl;

  // ── Single store + non-admin: polished but non-interactive. The
  // chevron + dropdown only appear when there's either a real
  // choice to make (multi-store) or an admin who could add one.
  if (!showDropdown) {
    return (
      <div
        className="flex items-center gap-2.5 px-1.5 py-1"
        data-testid="store-switcher-single"
      >
        <StoreAvatar store={activeStore} />
        <span
          className="text-[15px] font-semibold truncate text-sidebar-foreground"
          title={displayName}
        >
          {displayName}
        </span>
      </div>
    );
  }

  // ── Multi-store: full dropdown.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-md px-1.5 py-1",
            "text-left transition-colors",
            "hover:bg-sidebar-accent/60",
            // Collapsed (icon) sidebar: center the avatar, drop the gap/padding
            // so the chevron + name don't spill past the narrow rail.
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          )}
          data-testid="store-switcher-trigger"
        >
          <StoreAvatar store={activeStore} />
          <span
            className="flex-1 truncate text-[15px] font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden"
            title={displayName}
          >
            {displayName}
          </span>
          <ChevronsUpDown
            className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100 group-data-[collapsible=icon]:hidden"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        // Match the trigger width so the dropdown feels anchored, with
        // a sensible floor for narrow sidebars.
        className="w-[--radix-dropdown-menu-trigger-width] min-w-[16rem] p-1.5"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Switch store
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1" />
        {stores.map((store) => {
          const isActive = store.id === activeStore.id;
          const name = store.storeName?.trim() || store.storeUrl;
          return (
            <DropdownMenuItem
              key={store.id}
              onSelect={() => setActiveStore(store.id)}
              className={cn(
                "cursor-pointer rounded-md px-2 py-2 gap-2.5",
                "focus:bg-accent data-[highlighted]:bg-accent",
              )}
              data-testid={`store-switcher-item-${store.id}`}
            >
              <StoreAvatar store={store} size="sm" />
              <span
                className="flex-1 text-sm font-medium truncate"
                title={name}
              >
                {name}
              </span>
              {isActive ? (
                <Check className="h-4 w-4 text-primary shrink-0" aria-hidden />
              ) : (
                // Reserve the same width so rows don't shift width as
                // the active row changes. Keeps the dropdown calm.
                <span className="h-4 w-4 shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
        {/* Admin-only CTA: connect another Shopify shop. The
            integrations page hosts the actual form. Hidden for
            non-admins (agents/chat_support/recovery_agent) since
            the underlying POST /api/stores is admin-gated anyway. */}
        {isAdmin && (
          <>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              onSelect={() => setLocation("/integrations")}
              className={cn(
                "cursor-pointer rounded-md px-2 py-2 gap-2.5",
                "text-primary focus:text-primary",
                "focus:bg-accent data-[highlighted]:bg-accent",
              )}
              data-testid="store-switcher-add"
            >
              <div className="h-7 w-7 shrink-0 rounded-md border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
                <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <span className="flex-1 text-sm font-medium">Add store</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
