import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { LogIn, LogOut, Clock, Timer, Coffee, Play } from "lucide-react";
import { format } from "date-fns";
import type { Attendance, AttendanceBreak } from "@shared/schema";

export function ShiftController() {
  const { toast } = useToast();
  const userId = localStorage.getItem("userId") || "";
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [breakElapsedTime, setBreakElapsedTime] = useState<number>(0);

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

  // Query for active break
  const { data: activeBreak } = useQuery<AttendanceBreak | null>({
    queryKey: ["/api/attendance/break/active", userId, localDate],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/break/active/${userId}?date=${localDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch active break");
      return res.json();
    },
    enabled: !!userId && !!todayAttendance?.clockInTime && !todayAttendance?.clockOutTime,
    refetchInterval: 30000,
  });

  // Derive states
  const isClockedIn = !!todayAttendance?.clockInTime && !todayAttendance?.clockOutTime;
  const isClockedOut = !!todayAttendance?.clockInTime && !!todayAttendance?.clockOutTime;
  const isOnBreak = isClockedIn && !!activeBreak;
  const isWorking = isClockedIn && !isOnBreak;

  // Timer for working time
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

  // Timer for break time
  useEffect(() => {
    if (!isOnBreak || !activeBreak?.breakStart) {
      setBreakElapsedTime(0);
      return;
    }

    const breakStartTime = new Date(activeBreak.breakStart).getTime();
    const updateBreakTimer = () => {
      const now = Date.now();
      setBreakElapsedTime(Math.floor((now - breakStartTime) / 1000));
    };

    updateBreakTimer();
    const interval = setInterval(updateBreakTimer, 1000);
    return () => clearInterval(interval);
  }, [isOnBreak, activeBreak?.breakStart]);

  const clockInMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/attendance/clock-in", { userId, localDate });
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
      return await apiRequest("POST", "/api/attendance/clock-out", { userId, localDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/break/active"] });
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

  const startBreakMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/attendance/break/start", { userId, localDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/break/active"] });
      toast({
        title: "Break Started",
        description: "Enjoy your break! Resume when you're ready.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Start Break Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const endBreakMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/attendance/break/end", { userId, localDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/break/active"] });
      toast({
        title: "Break Ended",
        description: "Welcome back! You're now on shift.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "End Break Failed",
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
    if (isOnBreak) {
      return <Badge variant="outline" className="text-xs" data-testid="badge-on-break">On Break</Badge>;
    }
    if (isWorking) {
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs" data-testid="badge-on-shift">On Shift</Badge>;
    }
    return <Badge variant="outline" className="text-xs" data-testid="badge-not-started">Not Started</Badge>;
  };

  return (
    <Card data-testid="card-shift-controller">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-brand" />
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
            {/* Timer Display */}
            {isOnBreak && (
              <div className="rounded-xl bg-amber-500/10 py-3 text-center">
                <div className="inline-flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400 text-[11px] font-medium uppercase tracking-wider mb-1">
                  <Coffee className="h-3.5 w-3.5" />
                  On Break
                </div>
                <div className="text-3xl font-semibold tabular-nums tracking-tight text-foreground" data-testid="text-break-time">
                  {formatElapsedTime(breakElapsedTime)}
                </div>
              </div>
            )}

            {isWorking && (
              <div className="rounded-xl bg-emerald-500/10 py-3 text-center">
                <div className="inline-flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium uppercase tracking-wider mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Working
                </div>
                <div className="text-3xl font-semibold tabular-nums tracking-tight text-foreground" data-testid="text-elapsed-time">
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

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              {/* State: Offline - Show Clock In */}
              {!todayAttendance?.clockInTime && (
                <Button
                  className="w-full bg-brand text-brand-foreground hover:bg-brand/90 shadow-sm transition-shadow hover:shadow-md"
                  onClick={() => clockInMutation.mutate()}
                  disabled={clockInMutation.isPending}
                  data-testid="button-clock-in"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  {clockInMutation.isPending ? "Clocking In..." : "Clock In"}
                </Button>
              )}

              {/* State: Working - Show Take Break + Clock Out */}
              {isWorking && (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => startBreakMutation.mutate()}
                    disabled={startBreakMutation.isPending}
                    data-testid="button-take-break"
                  >
                    <Coffee className="h-4 w-4 mr-2" />
                    {startBreakMutation.isPending ? "Starting Break..." : "Take Break"}
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => clockOutMutation.mutate()}
                    disabled={clockOutMutation.isPending}
                    data-testid="button-clock-out"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {clockOutMutation.isPending ? "Clocking Out..." : "End Shift"}
                  </Button>
                </>
              )}

              {/* State: On Break - Show Resume Work only */}
              {isOnBreak && (
                <Button
                  className="w-full"
                  onClick={() => endBreakMutation.mutate()}
                  disabled={endBreakMutation.isPending}
                  data-testid="button-resume-work"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {endBreakMutation.isPending ? "Resuming..." : "Resume Work"}
                </Button>
              )}
            </div>

            {/* Clock In/Out Times */}
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
