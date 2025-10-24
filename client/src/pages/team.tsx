import { PageLayout } from "@/components/page-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamDirectory } from "@/components/team-directory";
import { LeaveRequests } from "@/components/leave-requests";
import { TeamMessages } from "@/components/team-messages";
import { TeamPresence } from "@/components/team-presence";

export default function TeamPage() {
  const userRole = (localStorage.getItem("userRole") as "admin" | "manager" | "agent") || "admin";

  return (
    <PageLayout
      title="Team Management"
      description="Manage team members, leave requests, and internal communication"
    >
      <div className="p-6 space-y-6">
        <Tabs defaultValue="directory" className="space-y-6">
          <TabsList data-testid="tabs-team">
            <TabsTrigger value="directory" data-testid="tab-directory">
              Team Directory
            </TabsTrigger>
            <TabsTrigger value="presence" data-testid="tab-presence">
              Presence & Workload
            </TabsTrigger>
            <TabsTrigger value="messages" data-testid="tab-messages">
              Messages
            </TabsTrigger>
            <TabsTrigger value="leave" data-testid="tab-leave">
              Leave Requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="directory">
            <TeamDirectory userRole={userRole} />
          </TabsContent>

          <TabsContent value="presence">
            <TeamPresence userRole={userRole} />
          </TabsContent>

          <TabsContent value="messages">
            <TeamMessages userRole={userRole} />
          </TabsContent>

          <TabsContent value="leave">
            <LeaveRequests userRole={userRole} />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
