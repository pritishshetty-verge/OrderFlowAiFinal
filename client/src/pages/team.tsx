import { PageLayout } from "@/components/page-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamDirectory } from "@/components/team-directory";
import { LeaveRequests } from "@/components/leave-requests";
import { TeamMessages } from "@/components/team-messages";
import { TeamPresence } from "@/components/team-presence";
import { AttendanceReportContent } from "@/pages/attendance-report";
import { PayrollSyncContent } from "@/pages/payroll-sync";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export default function TeamPage() {
  const userRole = (localStorage.getItem("userRole") as "admin" | "agent") || "admin";

  const { isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  if (isLoading) {
    return (
      <PageLayout
        title="Team Management"
        description="Manage team members, leave requests, and internal communication"
      >
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full max-w-md" />
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </PageLayout>
    );
  }

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
            <TabsTrigger value="attendance-report" data-testid="tab-attendance-report">
              Attendance Report
            </TabsTrigger>
            {userRole === "admin" && (
              <TabsTrigger value="payroll" data-testid="tab-payroll">
                Payroll
              </TabsTrigger>
            )}
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

          <TabsContent value="attendance-report">
            <AttendanceReportContent />
          </TabsContent>

          {userRole === "admin" && (
            <TabsContent value="payroll">
              <PayrollSyncContent />
            </TabsContent>
          )}

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
