import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { AnalyticsOverview } from "@/components/analytics-overview";
import { DashboardStats } from "@/components/dashboard-stats";
import { DateRangeSelector } from "@/components/date-range-selector";
import type { Order } from "@/components/orders-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";
import type { Order as BackendOrder, User } from "@shared/schema";

// Transform backend order to frontend order format
function transformOrder(order: BackendOrder, users: User[]): Order {
  const assignedUser = order.assignedTo
    ? users.find((u) => u.id === order.assignedTo)
    : undefined;

  return {
    id: order.id,
    shopifyOrderId: order.shopifyOrderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: order.itemsSummary || "",
    total: parseFloat(order.totalPrice),
    paymentMethod: order.paymentMethod === "cod" ? "cod" : "prepaid",
    status: order.status as Order["status"],
    assignedTo: assignedUser?.fullName,
    createdAt: new Date(order.shopifyCreatedAt),
  };
}

interface InsightCardProps {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: React.ReactNode;
}

function InsightCard({ title, value, change, trend, icon }: InsightCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-xs flex items-center gap-1 mt-1 ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
          {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {change}
        </p>
      </CardContent>
    </Card>
  );
}

interface DashboardMetrics {
  assignedOrders: number;
  confirmedOrders: number;
  cancelledOrders: number;
  followUpOrders: number;
  fulfilledOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
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

  // Fetch orders from backend with auto-refresh every 30 seconds
  const { data: ordersResponse, isLoading: ordersLoading } = useQuery<{ orders: BackendOrder[]; total: number }>({
    queryKey: ["/api/orders"],
    refetchInterval: 30000, // Auto-refresh every 30 seconds for real-time webhook updates
  });

  // Fetch users for assignment display
  const { data: usersData, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Transform backend orders to frontend format (for charts)
  const allOrders = useMemo(() => {
    if (!ordersResponse?.orders || !usersData) return [];
    return ordersResponse.orders.map((order) => transformOrder(order, usersData));
  }, [ordersResponse, usersData]);

  const isLoading = metricsLoading || ordersLoading || usersLoading;

  // Use backend metrics for stats
  const stats = {
    assignedOrders: metrics?.assignedOrders || 0,
    confirmedOrders: metrics?.confirmedOrders || 0,
    cancelledOrders: metrics?.cancelledOrders || 0,
    followUpOrders: metrics?.followUpOrders || 0,
    fulfilledOrders: metrics?.fulfilledOrders || 0,
    deliveredOrders: metrics?.deliveredOrders || 0,
    pendingOrders: metrics?.pendingOrders || 0,
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
        {isLoading ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Skeleton className="h-32" data-testid="skeleton-stat-1" />
              <Skeleton className="h-32" data-testid="skeleton-stat-2" />
              <Skeleton className="h-32" data-testid="skeleton-stat-3" />
              <Skeleton className="h-32" data-testid="skeleton-stat-4" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-32" data-testid="skeleton-insight-1" />
              <Skeleton className="h-32" data-testid="skeleton-insight-2" />
              <Skeleton className="h-32" data-testid="skeleton-insight-3" />
              <Skeleton className="h-32" data-testid="skeleton-insight-4" />
            </div>
            <Skeleton className="h-96 w-full" data-testid="skeleton-chart" />
          </>
        ) : (
          <>
            {/* Date Range Selector */}
            <div className="flex items-center justify-between">
              <DateRangeSelector onDateChange={setDateRange} />
            </div>
            
            {/* KPI Cards - 8 metrics in 2 rows of 4 */}
            <DashboardStats {...stats} />

            {/* Charts and Visualizations */}
            <AnalyticsOverview orders={allOrders} />
          </>
        )}
      </div>
    </PageLayout>
  );
}
