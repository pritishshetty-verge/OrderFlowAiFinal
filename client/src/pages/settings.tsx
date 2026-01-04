import { PageLayout } from "@/components/page-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PreferencesSettings } from "@/components/settings-preferences";
import { NotificationsSettings } from "@/components/settings-notifications";
import { SecuritySettings } from "@/components/settings-security";
import { ShopifySettingsMain } from "@/components/settings-shopify-main";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export default function SettingsPage() {
  const userRole = (localStorage.getItem("userRole") as "admin" | "manager" | "agent") || "admin";
  const userEmail = localStorage.getItem("userEmail");

  const { isLoading } = useQuery<User>({
    queryKey: [`/api/users/by-email/${userEmail}`],
  });

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
        <Tabs defaultValue="preferences" className="space-y-6">
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
              <TabsTrigger value="shopify" data-testid="tab-shopify">
                Shopify
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
            <TabsContent value="shopify">
              <ShopifySettingsMain />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </PageLayout>
  );
}
