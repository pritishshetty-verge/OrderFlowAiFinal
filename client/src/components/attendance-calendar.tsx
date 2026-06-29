import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, getDay, addMonths, subMonths } from "date-fns";
import { useState } from "react";
import type { Attendance, Holiday } from "@shared/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AttendanceCalendar() {
  const userId = localStorage.getItem("userId") || "";
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: attendanceRecords, isLoading } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance", { userId, startDate: monthStart.toISOString(), endDate: monthEnd.toISOString() }],
    queryFn: async () => {
      const params = new URLSearchParams({
        userId,
        startDate: monthStart.toISOString(),
        endDate: monthEnd.toISOString(),
      });
      const res = await fetch(`/api/attendance?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch attendance");
      return res.json();
    },
    enabled: !!userId,
  });

  // Holidays for the user's assigned state. Year-scoped so we only
  // load what this calendar can possibly show — when navigating back
  // a year the query refetches automatically. The endpoint resolves
  // the user's `holidayState` server-side; the client just sends
  // userId + year. Empty array if the user has no state assigned yet.
  const currentYear = currentMonth.getFullYear();
  const { data: holidayRecords } = useQuery<Holiday[]>({
    queryKey: ["/api/holidays", { userId, year: currentYear }],
    queryFn: async () => {
      const params = new URLSearchParams({
        userId,
        year: String(currentYear),
      });
      const res = await fetch(`/api/holidays?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch holidays");
      return res.json();
    },
    enabled: !!userId,
  });

  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  // Index holidays by YYYY-MM-DD for O(1) lookup per render. The
  // `Holiday.date` value comes through as a YYYY-MM-DD string from
  // pg's `date` type, which is exactly the key shape we want — no
  // timezone math required.
  const holidayByDate = useMemo(() => {
    const map = new Map<string, Holiday>();
    for (const h of holidayRecords ?? []) {
      // h.date is `string` (PG date) but typed as `unknown` in some
      // pgs; coerce defensively.
      const key = typeof h.date === "string" ? h.date : format(new Date(h.date as any), "yyyy-MM-dd");
      map.set(key, h);
    }
    return map;
  }, [holidayRecords]);

  const getHolidayForDay = (day: Date): Holiday | undefined => {
    return holidayByDate.get(format(day, "yyyy-MM-dd"));
  };

  const getAttendanceForDay = (day: Date) => {
    return attendanceRecords?.find((record) =>
      isSameDay(new Date(record.date), day)
    );
  };

  const getDotColor = (
    attendance: Attendance | undefined,
    holiday: Holiday | undefined,
    day: Date,
  ) => {
    // Holidays win over everything else — even if the user clocked in
    // on a holiday (rare but possible) we still want the day badged
    // purple so the calendar is glanceable for payroll.
    if (holiday) return "bg-purple-500";
    if (!attendance) {
      if (isToday(day)) return null;
      if (day > new Date()) return null;
      return "bg-muted-foreground/30";
    }
    if (attendance.status === "leave") return "bg-yellow-500";
    if (attendance.status === "absent") return "bg-red-500";
    if (attendance.clockInTime) return "bg-green-500";
    return "bg-muted-foreground/30";
  };

  const getStreakCount = () => {
    if (!attendanceRecords) return 0;
    let streak = 0;
    const sortedRecords = [...attendanceRecords]
      .filter((r) => r.status === "present" || r.clockInTime)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < sortedRecords.length; i++) {
      const recordDate = new Date(sortedRecords[i].date);
      recordDate.setHours(0, 0, 0, 0);
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - i);

      if (recordDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
  const firstDayOfMonth = getDay(monthStart);

  return (
    <Card data-testid="card-attendance-calendar">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-brand" />
            Attendance
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              data-testid="button-prev-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium w-20 text-center">
              {format(currentMonth, "MMM yyyy")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              data-testid="button-next-month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayNames.map((day, i) => (
                <div key={i} className="text-center text-xs text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array(firstDayOfMonth)
                .fill(null)
                .map((_, i) => (
                  <div key={`empty-${i}`} className="h-6" />
                ))}
              {days.map((day) => {
                const attendance = getAttendanceForDay(day);
                const holiday = getHolidayForDay(day);
                const dotColor = getDotColor(attendance, holiday, day);
                const isTodayDate = isToday(day);

                return (
                  <Tooltip key={day.toISOString()}>
                    <TooltipTrigger asChild>
                      <div
                        className={`h-7 w-7 mx-auto flex items-center justify-center relative rounded-full transition-colors ${
                          isTodayDate ? "bg-brand text-brand-foreground font-semibold" : "hover:bg-muted"
                        }`}
                        data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
                      >
                        <span className="text-xs">{format(day, "d")}</span>
                        {dotColor && !isTodayDate && (
                          <span
                            className={`absolute -bottom-0.5 w-1.5 h-1.5 rounded-full ${dotColor}`}
                          />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {format(day, "MMM d")}
                        {holiday && (
                          <>
                            <br />
                            <span className="font-medium">{holiday.name}</span>
                            {" "}
                            <span className="text-muted-foreground">
                              ({holiday.type})
                            </span>
                          </>
                        )}
                        {attendance?.clockInTime && (
                          <>
                            <br />
                            In: {format(new Date(attendance.clockInTime), "h:mm a")}
                          </>
                        )}
                        {attendance?.clockOutTime && (
                          <>
                            <br />
                            Out: {format(new Date(attendance.clockOutTime), "h:mm a")}
                          </>
                        )}
                        {attendance?.totalHours && (
                          <>
                            <br />
                            Hours: {parseFloat(attendance.totalHours).toFixed(1)}h
                          </>
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-3 pt-2 border-t">
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">Present</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span className="text-muted-foreground">Leave</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                  <span className="text-muted-foreground">Absent</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-muted-foreground">Holiday</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                Streak {getStreakCount()}d
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
