import { useEffect, useState } from "react";
import { PageLayout } from "@/components/page-layout";
import { cn } from "@/lib/utils";
import {
  Palette,
  Building2,
  Store,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { PreferencesSettings } from "@/components/settings-preferences";
import { WorkspaceSettings } from "@/components/settings-workspace";
import {
  IVRConnectionStatus,
  ProductCatalogSync,
  PaymentMappingSettings,
} from "@/components/settings-shopify-main";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

// Tab layout note:
//   - Shopify *credentials* moved to /integrations (admin-only) and
//     open in a slide-over Sheet on that page.
//   - The day-to-day operational tooling (webhook health, product
//     catalog sync, prepaid mapping, help links) lives here under
//     the new "Store Operations" admin tab — it's used often enough
//     that admins shouldn't have to detour through Integrations.
//   - IVR (Click-to-Call) keeps its own admin tab; it's neither
//     Shopify nor an integration we expose in the hub today.
type SettingsTab =
  | "preferences"
  | "workspace"
  | "operations"
  | "ivr";
const VALID_TABS: SettingsTab[] = [
  "preferences",
  "workspace",
  "operations",
  "ivr",
];

const SECTIONS: {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}[] = [
  { id: "preferences", label: "Preferences", icon: Palette },
  { id: "workspace", label: "Workspace", icon: Building2, adminOnly: true },
  { id: "operations", label: "Store Operations", icon: Store, adminOnly: true },
  { id: "ivr", label: "IVR", icon: Phone, adminOnly: true },
];

function readTabFromUrl(): SettingsTab {
  if (typeof window === "undefined") return "preferences";
  const raw = new URLSearchParams(window.location.search).get("tab");
  return (VALID_TABS as string[]).includes(raw ?? "")
    ? (raw as SettingsTab)
    : "preferences";
}

export default function SettingsPage() {
  const userRole =
    (localStorage.getItem("userRole") as "admin" | "manager" | "agent") ||
    "admin";
  const userEmail = localStorage.getItem("userEmail");

  const { isLoading } = useQuery<User>({
    queryKey: [`/api/users/by-email/${userEmail}`],
  });

  // URL-driven tab state: initial value is read from ?tab=...; subsequent
  // clicks write back to the URL via replaceState (no history entry), so
  // refresh keeps you on the same tab. Back/forward navigation is kept in
  // sync via the popstate listener below.
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    readTabFromUrl(),
  );

  useEffect(() => {
    const onPopState = () => setActiveTab(readTabFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // If a non-admin lands on an admin-only tab via a bookmarked URL,
  // fall back to preferences so they don't see a blank card.
  useEffect(() => {
    const adminOnly: SettingsTab[] = ["workspace", "operations", "ivr"];
    if (adminOnly.includes(activeTab) && userRole !== "admin") {
      handleTabChange("preferences");
    }
    // Legacy: ?tab=shopify used to render the Shopify credentials card
    // here. Credentials moved to /integrations; operational tooling
    // moved to ?tab=operations. Send anyone who clicks the old
    // bookmark to the operations tab — the things they were probably
    // looking for (webhook status / sync / payment mapping) live there.
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("tab") === "shopify"
    ) {
      handleTabChange("operations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userRole]);

  const handleTabChange = (next: string) => {
    const tab = (VALID_TABS as string[]).includes(next)
      ? (next as SettingsTab)
      : "preferences";
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  };

  if (isLoading) {
    return (
      <PageLayout
        title="Settings"
        description="Manage your account settings and preferences"
      >
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full max-w-md" />
            <Card className="p-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-10 w-32" />
              </div>
            </Card>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Settings"
      description="Manage your account settings and preferences"
    >
      <div className="p-6">
        <div className="flex flex-col gap-6 md:flex-row md:gap-8">
          {/* Left section nav — vertical on desktop, a scrollable row on
              mobile. Replaces the old boxy horizontal tab bar. */}
          <nav
            className="md:w-56 md:flex-shrink-0"
            data-testid="tabs-settings"
            aria-label="Settings sections"
          >
            <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
              {SECTIONS.filter(
                (section) => !section.adminOnly || userRole === "admin",
              ).map((section) => {
                const Icon = section.icon;
                const isActive = activeTab === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleTabChange(section.id)}
                    data-testid={`tab-${section.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Content for the active section. Constrained width keeps form
              rows readable instead of stretching full-bleed. */}
          <div className="min-w-0 flex-1 max-w-3xl">
            {activeTab === "preferences" && <PreferencesSettings />}
            {userRole === "admin" && activeTab === "workspace" && (
              <WorkspaceSettings />
            )}
            {userRole === "admin" && activeTab === "operations" && (
              <div className="space-y-6">
                <ProductCatalogSync />
                <PaymentMappingSettings />
              </div>
            )}
            {userRole === "admin" && activeTab === "ivr" && (
              <IVRConnectionStatus />
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
