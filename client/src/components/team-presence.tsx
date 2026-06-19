import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Users, UserCheck, Package, Clock, RotateCcw, Power } from "lucide-react";
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

  // Reactivate an auto-closed shift. Admin only — backend enforces.
  // Clears auto_closed_at + auto_close_reason on the attendance row and
  // appends an audit note so future inspection knows who flipped it back.
  const reactivateMutation = useMutation({
    mutationFn: async (attendanceId: string) => {
      return await apiRequest("POST", `/api/attendance/${attendanceId}/reactivate`, {});
    },
    onSuccess: (_, attendanceId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/team-today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/presence/me"] });
      toast({
        title: "Shift reactivated",
        description: "The agent is back on shift — no need for them to clock in again.",
      });
      void attendanceId;
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't reactivate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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

  // Helper to derive live status from attendance record. "auto-closed"
  // means the smart-presence worker closed today's shift; the agent
  // can't clock back in until an admin reactivates.
  const getLiveStatus = (
    userId: string,
    accountStatus: string,
  ): "online" | "break" | "offline" | "auto-closed" => {
    const attendance = attendanceMap.get(userId);
    // Auto-close is a fact about today's shift and MUST surface regardless
    // of the account presence status. An idle agent is typically "inactive"
    // (and the field defaults to "inactive" when unset), so checking account
    // status first would wrongly hide auto-closed shifts and the reactivate
    // button. `autoClosedAt` is cleared to null on reactivation, so its mere
    // presence means "currently auto-closed" — this also covers a shift that
    // was reactivated earlier and then auto-closed again.
    if (attendance?.autoClosedAt) return "auto-closed";
    if (accountStatus === "onleave" || accountStatus === "inactive") {
      return "offline";
    }
    if (!attendance) return "offline";
    if (attendance.clockOutTime) return "offline";
    if (attendance.status === "break") return "break";
    return "online";
  };

  // Stats - count based on LIVE attendance status
  const onlineCount = teamMembers.filter((u) => getLiveStatus(u.id, u.presenceStatus || "inactive") === "online").length;
  const onBreakCount = teamMembers.filter((u) => getLiveStatus(u.id, u.presenceStatus || "inactive") === "break").length;
  const autoClosedCount = teamMembers.filter((u) => getLiveStatus(u.id, u.presenceStatus || "inactive") === "auto-closed").length;
  const totalWorkload = Array.from(workloadMap.values()).reduce((sum, count) => sum + count, 0);

  // Only allow admins to manage presence
  const canManagePresence = userRole === "admin";

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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

        <Card data-testid="card-auto-closed">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto Clocked-Out</CardTitle>
            <Power className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-blue-500">{autoClosedCount}</div>
            )}
            {autoClosedCount > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">Reactivate below to resume their shift</p>
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
                const attendance = attendanceMap.get(member.id);
                const autoClosedAt = attendance?.autoClosedAt
                  ? new Date(attendance.autoClosedAt)
                  : null;
                const autoClosedTimeStr = autoClosedAt
                  ? autoClosedAt.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })
                  : null;

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border rounded-md"
                    data-testid={`member-${member.id}`}
                  >
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{member.fullName}</p>
                        {getRoleBadge(member.role)}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                      {liveStatus === "auto-closed" && autoClosedTimeStr && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                          Auto clocked-out at {autoClosedTimeStr}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Reactivate (only when auto-closed, admin only) */}
                      {liveStatus === "auto-closed" && canManagePresence && attendance && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10"
                          disabled={reactivateMutation.isPending}
                          onClick={() => reactivateMutation.mutate(attendance.id)}
                          data-testid={`reactivate-${member.id}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Reactivate
                        </Button>
                      )}

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

                      {/* Live Status - derived from attendance.
                          Width sized to fit the widest badge ("Auto Clocked-Out")
                          without clipping into the Account Status column. */}
                      <div className="w-40 shrink-0 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Live Status</p>
                        <div data-testid={`live-status-${member.id}`}>
                          {liveStatus === "online" && (
                            <Badge className="bg-green-500 text-white whitespace-nowrap">Online</Badge>
                          )}
                          {liveStatus === "break" && (
                            <Badge className="bg-orange-500 text-white whitespace-nowrap">On Break</Badge>
                          )}
                          {liveStatus === "auto-closed" && (
                            <Badge className="bg-blue-500 text-white whitespace-nowrap">Auto Clocked-Out</Badge>
                          )}
                          {liveStatus === "offline" && (
                            <Badge variant="secondary" className="whitespace-nowrap">Offline</Badge>
                          )}
                        </div>
                      </div>

                      {/* Account Status (admin can change) */}
                      <div className="w-40 shrink-0">
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
