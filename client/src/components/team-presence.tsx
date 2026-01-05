import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Users, UserCheck, UserX, Package, Clock } from "lucide-react";
import type { User, Order as BackendOrder, Attendance } from "@shared/schema";

interface TeamPresenceProps {
  userRole: "admin" | "manager" | "agent";
}

export function TeamPresence({ userRole }: TeamPresenceProps) {
  const { toast } = useToast();

  // Fetch team members
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Fetch orders to calculate workload
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders"],
  });

  // Fetch today's attendance for all team members
  const { data: teamAttendance, isLoading: attendanceLoading } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance/team-today"],
  });

  // Create a map of userId -> attendance record for quick lookup
  const attendanceMap = new Map<string, Attendance>();
  teamAttendance?.forEach((record) => {
    attendanceMap.set(record.userId, record);
  });

  // Calculate workload for each user
  const workloadMap = new Map<string, number>();
  ordersResponse?.orders?.forEach((order) => {
    if (order.assignedTo && order.status !== "delivered" && order.status !== "cancelled") {
      const current = workloadMap.get(order.assignedTo) || 0;
      workloadMap.set(order.assignedTo, current + 1);
    }
  });

  // Update presence status mutation
  const updatePresenceMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: "present" | "onleave" | "inactive" }) => {
      return await apiRequest("POST", "/api/users/presence", { userId, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Status Updated",
        description: "Team member account status has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePresenceChange = (userId: string, status: "present" | "onleave" | "inactive") => {
    updatePresenceMutation.mutate({ userId, status });
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge variant="default">Admin</Badge>;
      case "manager":
        return <Badge variant="secondary">Manager</Badge>;
      case "agent":
        return <Badge variant="outline">Agent</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const isLoading = usersLoading || ordersLoading || attendanceLoading;

  // Filter to agents and managers only
  const teamMembers = users?.filter((u) => u.role === "agent" || u.role === "manager") || [];

  // Helper to derive live status from attendance record
  const getLiveStatus = (userId: string, accountStatus: string): "online" | "break" | "offline" => {
    if (accountStatus === "onleave" || accountStatus === "inactive") {
      return "offline";
    }
    const attendance = attendanceMap.get(userId);
    if (!attendance) return "offline";
    if (attendance.clockOutTime) return "offline";
    if (attendance.status === "break") return "break";
    return "online";
  };

  // Stats - count based on LIVE attendance status
  const onlineCount = teamMembers.filter((u) => getLiveStatus(u.id, u.presenceStatus || "inactive") === "online").length;
  const onBreakCount = teamMembers.filter((u) => getLiveStatus(u.id, u.presenceStatus || "inactive") === "break").length;
  const offlineCount = teamMembers.filter((u) => getLiveStatus(u.id, u.presenceStatus || "inactive") === "offline").length;
  const totalWorkload = Array.from(workloadMap.values()).reduce((sum, count) => sum + count, 0);

  // Only allow admins to manage presence
  const canManagePresence = userRole === "admin";

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-members">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{teamMembers.length}</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-online-members">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-green-500">{onlineCount}</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-break-members">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Break</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-orange-500">{onBreakCount}</div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-total-workload">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{totalWorkload}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Members Table */}
      <Card data-testid="card-team-members">
        <CardHeader>
          <CardTitle>Team Status & Workload</CardTitle>
          <CardDescription>
            {canManagePresence 
              ? "Manage account status and view current workload for each team member"
              : "View team account status and current workload distribution"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-members">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No team members found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {teamMembers.map((member) => {
                const workload = workloadMap.get(member.id) || 0;
                const accountStatus = member.presenceStatus || "inactive";
                const liveStatus = getLiveStatus(member.id, accountStatus);
                
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border rounded-md"
                    data-testid={`member-${member.id}`}
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{member.fullName}</p>
                        {getRoleBadge(member.role)}
                      </div>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Workload */}
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Active Orders</p>
                        <div className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          <span className="font-medium" data-testid={`workload-${member.id}`}>
                            {workload}
                          </span>
                        </div>
                      </div>

                      {/* Live Status - derived from attendance */}
                      <div className="w-24 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Live Status</p>
                        <div data-testid={`live-status-${member.id}`}>
                          {liveStatus === "online" && (
                            <Badge className="bg-green-500 text-white">Online</Badge>
                          )}
                          {liveStatus === "break" && (
                            <Badge className="bg-orange-500 text-white">On Break</Badge>
                          )}
                          {liveStatus === "offline" && (
                            <Badge variant="secondary">Offline</Badge>
                          )}
                        </div>
                      </div>

                      {/* Account Status (admin can change) */}
                      <div className="w-40">
                        <p className="text-xs text-muted-foreground mb-1">Account Status</p>
                        {canManagePresence ? (
                          <Select
                            value={accountStatus}
                            onValueChange={(value) => handlePresenceChange(member.id, value as "present" | "onleave" | "inactive")}
                            disabled={updatePresenceMutation.isPending}
                          >
                            <SelectTrigger data-testid={`select-status-${member.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="present">Active</SelectItem>
                              <SelectItem value="onleave">On Leave</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div data-testid={`status-display-${member.id}`}>
                            {accountStatus === "present" && (
                              <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30">Active</Badge>
                            )}
                            {accountStatus === "onleave" && (
                              <Badge variant="outline">On Leave</Badge>
                            )}
                            {accountStatus === "inactive" && (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
