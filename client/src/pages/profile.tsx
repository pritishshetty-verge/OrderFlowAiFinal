import { PageLayout } from "@/components/page-layout";
import { ProfileSettings } from "@/components/settings-profile";

export default function ProfilePage() {
  const userRole = (localStorage.getItem("userRole") as "admin" | "manager" | "agent") || "admin";

  return (
    <PageLayout
      title="Profile"
      description="View and update your personal information"
    >
      <div className="p-6">
        <ProfileSettings userRole={userRole} />
      </div>
    </PageLayout>
  );
}
