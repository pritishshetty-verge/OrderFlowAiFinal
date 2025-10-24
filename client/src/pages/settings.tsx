import { PageLayout } from "@/components/page-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileSettings } from "@/components/settings-profile";
import { PreferencesSettings } from "@/components/settings-preferences";
import { NotificationsSettings } from "@/components/settings-notifications";
import { SecuritySettings } from "@/components/settings-security";
import { ShopifySettingsMain } from "@/components/settings-shopify-main";
import { AttendanceSettings } from "@/components/settings-attendance";

export default function SettingsPage() {
  const userRole = (localStorage.getItem("userRole") as "admin" | "manager" | "agent") || "admin";

  return (
    <PageLayout
      title="Settings"
      description="Manage your account settings and preferences"
    >
      <div className="p-6 space-y-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList data-testid="tabs-settings">
            <TabsTrigger value="profile" data-testid="tab-profile">
              Profile
            </TabsTrigger>
            <TabsTrigger value="attendance" data-testid="tab-attendance">
              Attendance
            </TabsTrigger>
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

          <TabsContent value="profile">
            <ProfileSettings userRole={userRole} />
          </TabsContent>

          <TabsContent value="attendance">
            <AttendanceSettings userRole={userRole} />
          </TabsContent>

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
