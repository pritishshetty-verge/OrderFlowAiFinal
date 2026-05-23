import { useEffect, useState } from "react";
import { PageLayout } from "@/components/page-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreferencesSettings } from "@/components/settings-preferences";
import { NotificationsSettings } from "@/components/settings-notifications";
import { SecuritySettings } from "@/components/settings-security";
import { WorkspaceSettings } from "@/components/settings-workspace";
import {
  IVRConnectionStatus,
  ShopifyWebhookStatusCard,
  ProductCatalogSync,
  PaymentMappingSettings,
  ShopifyHelpCard,
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
  | "notifications"
  | "security"
  | "workspace"
  | "operations"
  | "ivr";
const VALID_TABS: SettingsTab[] = [
  "preferences",
  "notifications",
  "security",
  "workspace",
  "operations",
  "ivr",
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
      <div className="p-6 space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="space-y-6"
        >
          <TabsList data-testid="tabs-settings">
            <TabsTrigger value="preferences" data-testid="tab-preferences">
              Preferences
            </TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-notifications">
              Notifications
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">
              Security
            </TabsTrigger>
            {userRole === "admin" && (
              <TabsTrigger value="workspace" data-testid="tab-workspace">
                Workspace
              </TabsTrigger>
            )}
            {userRole === "admin" && (
              <TabsTrigger value="operations" data-testid="tab-operations">
                Store Operations
              </TabsTrigger>
            )}
            {userRole === "admin" && (
              <TabsTrigger value="ivr" data-testid="tab-ivr">
                IVR
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="preferences">
            <PreferencesSettings />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsSettings />
          </TabsContent>

          <TabsContent value="security">
            <SecuritySettings />
          </TabsContent>

          {userRole === "admin" && (
            <TabsContent value="workspace" className="space-y-6">
              <WorkspaceSettings />
            </TabsContent>
          )}

          {userRole === "admin" && (
            <TabsContent value="operations" className="space-y-6">
              <ShopifyWebhookStatusCard />
              <ProductCatalogSync />
              <PaymentMappingSettings />
              <ShopifyHelpCard />
            </TabsContent>
          )}

          {userRole === "admin" && (
            <TabsContent value="ivr">
              <IVRConnectionStatus />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </PageLayout>
  );
}
