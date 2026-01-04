import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { LogIn, LogOut, Clock, Timer } from "lucide-react";
import { format } from "date-fns";
import type { Attendance } from "@shared/schema";

export function ShiftController() {
  const { toast } = useToast();
  const userId = localStorage.getItem("userId") || "";
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Get user's local date in YYYY-MM-DD format (timezone-safe)
  const localDate = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const { data: todayAttendance, isLoading } = useQuery<Attendance | null>({
    queryKey: ["/api/attendance/today", userId, localDate],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/today/${userId}?date=${localDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch attendance");
      return res.json();
    },
    enabled: !!userId,
    refetchInterval: 60000,
  });

  const isClockedIn = todayAttendance?.clockInTime && !todayAttendance?.clockOutTime;
  const isClockedOut = todayAttendance?.clockInTime && todayAttendance?.clockOutTime;

  useEffect(() => {
    if (!isClockedIn || !todayAttendance?.clockInTime) {
      setElapsedTime(0);
      return;
    }

    const clockInTime = new Date(todayAttendance.clockInTime).getTime();
    const updateTimer = () => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - clockInTime) / 1000));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isClockedIn, todayAttendance?.clockInTime]);

  const clockInMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/attendance/clock-in", { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      toast({
        title: "Clocked In",
        description: "Your shift has started. Have a productive day!",
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

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/attendance/clock-out", { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      toast({
        title: "Clocked Out",
        description: "Great work today! Your hours have been recorded.",
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

  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = () => {
    if (isClockedOut) {
      return <Badge variant="secondary" className="text-xs" data-testid="badge-shift-complete">Shift Complete</Badge>;
    }
    if (isClockedIn) {
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs" data-testid="badge-on-shift">On Shift</Badge>;
    }
    return <Badge variant="outline" className="text-xs" data-testid="badge-not-started">Not Started</Badge>;
  };

  return (
    <Card data-testid="card-shift-controller">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            Shift Control
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-3">
            {isClockedIn && (
              <div className="text-center py-2">
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs mb-1">
                  <Timer className="h-3 w-3" />
                  Shift Duration
                </div>
                <div className="text-2xl font-mono font-bold tabular-nums" data-testid="text-elapsed-time">
                  {formatElapsedTime(elapsedTime)}
                </div>
              </div>
            )}

            {isClockedOut && todayAttendance?.totalHours && (
              <div className="text-center py-2">
                <div className="text-muted-foreground text-xs mb-1">Today's Total</div>
                <div className="text-xl font-bold" data-testid="text-total-hours">
                  {parseFloat(todayAttendance.totalHours).toFixed(1)} hours
                </div>
              </div>
            )}

            {!isClockedIn && !isClockedOut && (
              <div className="text-center py-2 text-muted-foreground text-sm">
                Ready to start your shift?
              </div>
            )}

            <div className="flex flex-col gap-2">
              {!todayAttendance?.clockInTime && (
                <Button
                  className="w-full"
                  onClick={() => clockInMutation.mutate()}
                  disabled={clockInMutation.isPending}
                  data-testid="button-clock-in"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  {clockInMutation.isPending ? "Clocking In..." : "Clock In"}
                </Button>
              )}

              {isClockedIn && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => clockOutMutation.mutate()}
                  disabled={clockOutMutation.isPending}
                  data-testid="button-clock-out"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {clockOutMutation.isPending ? "Clocking Out..." : "Clock Out"}
                </Button>
              )}
            </div>

            {todayAttendance?.clockInTime && (
              <div className="pt-2 border-t text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Clock In</span>
                  <span data-testid="text-clock-in-time">
                    {format(new Date(todayAttendance.clockInTime), "h:mm a")}
                  </span>
                </div>
                {todayAttendance?.clockOutTime && (
                  <div className="flex justify-between mt-1">
                    <span>Clock Out</span>
                    <span data-testid="text-clock-out-time">
                      {format(new Date(todayAttendance.clockOutTime), "h:mm a")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
