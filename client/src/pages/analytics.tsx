import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { AnalyticsOverview } from "@/components/analytics-overview";
import { DashboardStats } from "@/components/dashboard-stats";
import type { Order } from "@/components/orders-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
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
  totalOrders: number;
  confirmedOrders: number;
  cancelledOrders: number;
  codOrders: number;
}

export default function AnalyticsPage() {
  // Get current user from localStorage
  const userEmail = localStorage.getItem("userEmail");
  
  // Fetch current user profile for personalized greeting
  const { data: currentUser } = useQuery<User>({
    queryKey: [`/api/users/by-email/${userEmail}`],
    enabled: !!userEmail,
  });
  
  // Fetch dashboard metrics from backend aggregation query
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
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
    totalOrders: metrics?.totalOrders || 0,
    confirmedOrders: metrics?.confirmedOrders || 0,
    cancelledOrders: metrics?.cancelledOrders || 0,
    codOrders: metrics?.codOrders || 0,
  };

  const conversionRate = useMemo(
    () =>
      stats.totalOrders > 0 ? ((stats.confirmedOrders / stats.totalOrders) * 100).toFixed(1) : "0",
    [stats]
  );

  const activeAgents = useMemo(
    () => new Set(allOrders.filter((o) => o.assignedTo).map((o) => o.assignedTo)).size,
    [allOrders]
  );

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
            {/* KPI Cards */}
            <DashboardStats {...stats} />

            {/* Additional Insights */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <InsightCard
                title="Conversion Rate"
                value={`${conversionRate}%`}
                change="Based on confirmed orders"
                trend="up"
                icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              />
              <InsightCard
                title="Active Agents"
                value={activeAgents.toString()}
                change="With assigned orders"
                trend="up"
                icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              />
              <InsightCard
                title="Pending Actions"
                value={(stats.totalOrders - stats.confirmedOrders - stats.cancelledOrders).toString()}
                change="Orders awaiting verification"
                trend="down"
                icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
              />
              <InsightCard
                title="Cancellation Rate"
                value={stats.totalOrders > 0 ? `${((stats.cancelledOrders / stats.totalOrders) * 100).toFixed(1)}%` : "0%"}
                change="Focus on reduction"
                trend="down"
                icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
              />
            </div>

            {/* Charts and Visualizations */}
            <AnalyticsOverview orders={allOrders} />
          </>
        )}
      </div>
    </PageLayout>
  );
}
