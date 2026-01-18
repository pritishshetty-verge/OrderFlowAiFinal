import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { DashboardStats } from "@/components/dashboard-stats";
import { DateRangeSelector } from "@/components/date-range-selector";
import { AttendanceCalendar } from "@/components/attendance-calendar";
import { HourlyActivityChart } from "@/components/hourly-activity-chart";
import { ShiftController } from "@/components/shift-controller";
import { startOfDay, endOfDay } from "date-fns";
import type { User } from "@shared/schema";

interface DashboardMetrics {
  assignedOrders: number;
  confirmedOrders: number;
  cancelledOrders: number;
  followUpOrders: number;
  fulfilledOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
}

export default function AnalyticsPage() {
  // Get current user from localStorage
  const userEmail = localStorage.getItem("userEmail");
  const userId = localStorage.getItem("userId");
  const userRole = localStorage.getItem("userRole");
  
  // Date range state - default to "Today"
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return {
      startDate: startOfDay(now),
      endDate: endOfDay(now),
    };
  });
  
  // Fetch current user profile for personalized greeting
  const { data: currentUser } = useQuery<User>({
    queryKey: [`/api/users/by-email/${userEmail}`],
    enabled: !!userEmail,
  });
  
  // For agents, filter metrics by their assigned orders; for admins, show global metrics
  const metricsUserId = userRole === "agent" ? userId : undefined;
  
  // Fetch dashboard metrics from backend aggregation query with date range
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics", metricsUserId, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (metricsUserId) params.append("userId", metricsUserId);
      params.append("startDate", dateRange.startDate.toISOString());
      params.append("endDate", dateRange.endDate.toISOString());
      
      const res = await fetch(`/api/dashboard/metrics?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch metrics");
      return res.json();
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds for real-time updates
  });

  // Use backend metrics for stats
  const stats = {
    assignedOrders: metrics?.assignedOrders || 0,
    confirmedOrders: metrics?.confirmedOrders || 0,
    cancelledOrders: metrics?.cancelledOrders || 0,
    followUpOrders: metrics?.followUpOrders || 0,
    fulfilledOrders: metrics?.fulfilledOrders || 0,
    deliveredOrders: metrics?.deliveredOrders || 0,
    rtoOrders: metrics?.rtoOrders || 0,
  };

  // Build personalized greeting
  const userName = currentUser?.fullName || currentUser?.username || "there";
  const greeting = `Welcome back, ${userName}`;

  return (
    <PageLayout
      title={greeting}
      description="Your analytics dashboard and performance metrics"
    >
      <div className="p-6 space-y-6">
        {/* Date Range Selector - always visible */}
        <div className="flex items-center justify-between">
          <DateRangeSelector dateRange={dateRange} onDateChange={setDateRange} />
        </div>
        
        {/* KPI Cards - 8 metrics in 2 rows of 4 */}
        <DashboardStats {...stats} isLoading={metricsLoading} />

        {/* 3-Column Layout: Attendance Calendar | Hourly Activity | Shift Controller */}
        <div className="grid gap-4 md:grid-cols-3">
          <AttendanceCalendar />
          <HourlyActivityChart dateRange={dateRange} />
          <ShiftController />
        </div>
      </div>
    </PageLayout>
  );
}
