import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Clock, LogIn, LogOut, Calendar } from "lucide-react";
import { format } from "date-fns";
import type { Attendance } from "@shared/schema";

interface AttendanceProps {
  userRole: "admin" | "manager" | "agent";
}

export function AttendanceSettings({ userRole }: AttendanceProps) {
  const { toast } = useToast();
  const userId = localStorage.getItem("userId") || "";
  
  // Fetch today's attendance
  const { data: todayAttendance, isLoading: attendanceLoading } = useQuery<Attendance>({
    queryKey: ["/api/attendance/today", userId],
    enabled: !!userId,
  });

  // Fetch attendance history (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data: attendanceHistory, isLoading: historyLoading } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance/records", { 
      userId, 
      startDate: thirtyDaysAgo.toISOString() 
    }],
    enabled: !!userId,
  });

  // Clock In Mutation
  const clockInMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/attendance/clock-in", { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/team-today"] });
      toast({
        title: "Clocked In",
        description: "Your attendance has been recorded.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Clock In Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Clock Out Mutation
  const clockOutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/attendance/clock-out", { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/team-today"] });
      toast({
        title: "Clocked Out",
        description: "Your work hours have been recorded.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Clock Out Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isClockedIn = todayAttendance?.clockInTime && !todayAttendance?.clockOutTime;
  const isClockedOut = todayAttendance?.clockInTime && todayAttendance?.clockOutTime;

  const handleClockIn = () => {
    clockInMutation.mutate();
  };

  const handleClockOut = () => {
    clockOutMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Clock In/Out Card */}
      <Card data-testid="card-clock-inout">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Clock In / Clock Out
          </CardTitle>
          <CardDescription>
            Track your work hours for HR and payroll purposes. This does not affect your ability to receive order assignments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {attendanceLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              {/* Today's Status */}
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Today's Status</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!todayAttendance?.clockInTime ? (
                    <Badge variant="outline" data-testid="badge-status-not-clocked">Not Clocked In</Badge>
                  ) : isClockedOut ? (
                    <Badge variant="secondary" data-testid="badge-status-completed">Completed</Badge>
                  ) : (
                    <Badge className="bg-green-500 text-white" data-testid="badge-status-working">Working</Badge>
                  )}
                </div>
              </div>

              {/* Clock In/Out Times */}
              {todayAttendance?.clockInTime && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Clock In Time</p>
                    <p className="text-sm font-medium" data-testid="text-clock-in-time">
                      {format(new Date(todayAttendance.clockInTime), "h:mm a")}
                    </p>
                  </div>
                  {todayAttendance.clockOutTime && (
                    <div className="p-3 border rounded-md">
                      <p className="text-xs text-muted-foreground mb-1">Clock Out Time</p>
                      <p className="text-sm font-medium" data-testid="text-clock-out-time">
                        {format(new Date(todayAttendance.clockOutTime), "h:mm a")}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {todayAttendance?.totalHours && (
                <div className="p-3 border rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Total Hours Worked</p>
                  <p className="text-sm font-medium" data-testid="text-total-hours">
                    {parseFloat(todayAttendance.totalHours).toFixed(2)} hours
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                {!isClockedIn && !isClockedOut && (
                  <Button
                    onClick={handleClockIn}
                    disabled={clockInMutation.isPending}
                    className="flex-1"
                    data-testid="button-clock-in"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    {clockInMutation.isPending ? "Clocking In..." : "Clock In"}
                  </Button>
                )}
                {isClockedIn && (
                  <Button
                    onClick={handleClockOut}
                    disabled={clockOutMutation.isPending}
                    variant="outline"
                    className="flex-1"
                    data-testid="button-clock-out"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {clockOutMutation.isPending ? "Clocking Out..." : "Clock Out"}
                  </Button>
                )}
                {isClockedOut && (
                  <div className="flex-1 text-center text-sm text-muted-foreground py-2">
                    You have completed your shift for today
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Attendance History */}
      <Card data-testid="card-attendance-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Attendance History
          </CardTitle>
          <CardDescription>
            Your attendance records for the last 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !attendanceHistory || attendanceHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-history">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No attendance records found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attendanceHistory.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                  data-testid={`attendance-record-${record.id}`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {format(new Date(record.date), "EEEE, MMMM d, yyyy")}
                    </p>
                    <div className="flex gap-4 mt-1">
                      {record.clockInTime && (
                        <p className="text-xs text-muted-foreground">
                          In: {format(new Date(record.clockInTime), "h:mm a")}
                        </p>
                      )}
                      {record.clockOutTime && (
                        <p className="text-xs text-muted-foreground">
                          Out: {format(new Date(record.clockOutTime), "h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {record.totalHours ? (
                      <Badge variant="secondary">
                        {parseFloat(record.totalHours).toFixed(2)} hrs
                      </Badge>
                    ) : (
                      <Badge variant="outline">Incomplete</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
