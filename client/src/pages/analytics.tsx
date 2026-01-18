import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { DashboardStats } from "@/components/dashboard-stats";
import { DateRangeSelector } from "@/components/date-range-selector";
import { AttendanceCalendar } from "@/components/attendance-calendar";
import { HourlyActivityChart } from "@/components/hourly-activity-chart";
import { ShiftController } from "@/components/shift-controller";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { startOfDay, endOfDay } from "date-fns";
import { TrendingDown, Package, IndianRupee, Truck, MapPin, Users } from "lucide-react";
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

interface RTOInsights {
  kpis: {
    overall_rto_rate: number;
    total_rto_count: number;
    rto_in_transit_count: number;
    rto_delivered_count: number;
    rto_revenue_loss: number;
    total_shipped: number;
  };
  weekly_cohorts: Array<{
    week: string;
    in_transit_count: number;
    delivered_count: number;
  }>;
  top_offenders: {
    top_cities: Array<{ city: string; count: number }>;
    top_couriers: Array<{ courier: string; count: number }>;
    top_agents: Array<{ agent_id: string; agent_name: string; count: number }>;
  };
}

export default function AnalyticsPage() {
  const userEmail = localStorage.getItem("userEmail");
  const userId = localStorage.getItem("userId");
  const userRole = localStorage.getItem("userRole");
  
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return {
      startDate: startOfDay(now),
      endDate: endOfDay(now),
    };
  });
  
  const { data: currentUser } = useQuery<User>({
    queryKey: [`/api/users/by-email/${userEmail}`],
    enabled: !!userEmail,
  });
  
  const metricsUserId = userRole === "agent" ? userId : undefined;
  
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
    refetchInterval: 30000,
  });

  const { data: rtoInsights, isLoading: rtoLoading } = useQuery<RTOInsights>({
    queryKey: ["/api/analytics/rto-insights"],
    refetchInterval: 60000,
  });

  const stats = {
    assignedOrders: metrics?.assignedOrders || 0,
    confirmedOrders: metrics?.confirmedOrders || 0,
    cancelledOrders: metrics?.cancelledOrders || 0,
    followUpOrders: metrics?.followUpOrders || 0,
    fulfilledOrders: metrics?.fulfilledOrders || 0,
    deliveredOrders: metrics?.deliveredOrders || 0,
    rtoOrders: metrics?.rtoOrders || 0,
  };

  const userName = currentUser?.fullName || currentUser?.username || "there";
  const greeting = `Welcome back, ${userName}`;

  const COLORS = {
    primary: "#3b82f6",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    purple: "#8b5cf6",
    orange: "#f97316",
    cyan: "#06b6d4",
  };

  const courierColors = [COLORS.primary, COLORS.success, COLORS.warning, COLORS.purple, COLORS.orange];

  return (
    <PageLayout
      title={greeting}
      description="Your analytics dashboard and performance metrics"
    >
      <div className="p-6 space-y-6">
        <Tabs defaultValue="general" className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <TabsList data-testid="tabs-dashboard">
              <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
              <TabsTrigger value="rto-insights" data-testid="tab-rto-insights">RTO Insights</TabsTrigger>
            </TabsList>
            <DateRangeSelector dateRange={dateRange} onDateChange={setDateRange} />
          </div>

          <TabsContent value="general" className="space-y-6">
            <DashboardStats {...stats} isLoading={metricsLoading} />
            <div className="grid gap-4 md:grid-cols-3">
              <AttendanceCalendar />
              <HourlyActivityChart dateRange={dateRange} />
              <ShiftController />
            </div>
          </TabsContent>

          <TabsContent value="rto-insights" className="space-y-6">
            {/* KPI Cards Row */}
            <div className="grid gap-4 md:grid-cols-3" data-testid="rto-kpi-cards">
              <Card data-testid="card-rto-rate">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">RTO Rate</CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {rtoLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="stat-rto-rate">
                      {rtoInsights?.kpis.overall_rto_rate || 0}%
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    of {rtoInsights?.kpis.total_shipped || 0} shipped orders
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-total-rto">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                  <CardTitle className="text-sm font-medium">Total RTO Count</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {rtoLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid="stat-total-rto">
                      {rtoInsights?.kpis.total_rto_count || 0}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {rtoInsights?.kpis.rto_in_transit_count || 0} returning, {rtoInsights?.kpis.rto_delivered_count || 0} returned
                  </p>
                </CardContent>
              </Card>

              <Card className="border-destructive/50 bg-destructive/5" data-testid="card-revenue-loss">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                  <CardTitle className="text-sm font-medium text-destructive">Revenue Loss</CardTitle>
                  <IndianRupee className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  {rtoLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold text-destructive" data-testid="stat-revenue-loss">
                      ₹{(rtoInsights?.kpis.rto_revenue_loss || 0).toLocaleString()}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Total value of all RTO orders
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 md:grid-cols-3" data-testid="rto-charts-row">
              {/* Top Cities - Horizontal Bar Chart */}
              <Card data-testid="card-top-cities">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Top Cities by RTO
                  </CardTitle>
                  <CardDescription>Cities with highest RTO count</CardDescription>
                </CardHeader>
                <CardContent>
                  {rtoLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : rtoInsights?.top_offenders.top_cities.length ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={rtoInsights.top_offenders.top_cities}
                        layout="vertical"
                        margin={{ left: 0, right: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <YAxis
                          type="category"
                          dataKey="city"
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          width={100}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                        />
                        <Bar dataKey="count" fill={COLORS.danger} radius={[0, 4, 4, 0]} name="RTO Count" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground" data-testid="text-no-cities-data">
                      No RTO data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Agents - Bar Chart */}
              <Card data-testid="card-top-agents">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Top Agents by RTO
                  </CardTitle>
                  <CardDescription>Agents with highest RTO count</CardDescription>
                </CardHeader>
                <CardContent>
                  {rtoLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : rtoInsights?.top_offenders.top_agents.length ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={rtoInsights.top_offenders.top_agents}
                        layout="vertical"
                        margin={{ left: 0, right: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                        <YAxis
                          type="category"
                          dataKey="agent_name"
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          width={100}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                        />
                        <Bar dataKey="count" fill={COLORS.warning} radius={[0, 4, 4, 0]} name="RTO Count" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground" data-testid="text-no-agents-data">
                      No RTO data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Couriers - Pie/Donut Chart */}
              <Card data-testid="card-top-couriers">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    RTO by Courier
                  </CardTitle>
                  <CardDescription>Distribution across couriers</CardDescription>
                </CardHeader>
                <CardContent>
                  {rtoLoading ? (
                    <div className="flex items-center justify-center h-[250px]">
                      <Skeleton className="h-40 w-40 rounded-full" />
                    </div>
                  ) : rtoInsights?.top_offenders.top_couriers.length ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={rtoInsights.top_offenders.top_couriers}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="courier"
                          label={({ courier, percent }) => `${courier} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {rtoInsights.top_offenders.top_couriers.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={courierColors[index % courierColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px'
                          }}
                          formatter={(value: number) => [`${value} RTOs`, 'Count']}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground" data-testid="text-no-couriers-data">
                      No RTO data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Weekly Cohort Table */}
            <Card data-testid="card-weekly-cohorts">
              <CardHeader>
                <CardTitle>Weekly RTO Trends</CardTitle>
                <CardDescription>RTO orders grouped by creation week</CardDescription>
              </CardHeader>
              <CardContent>
                {rtoLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : rtoInsights?.weekly_cohorts.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Week</TableHead>
                        <TableHead>In-Transit (Returning)</TableHead>
                        <TableHead>Delivered (Returned)</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rtoInsights.weekly_cohorts.map((cohort) => (
                        <TableRow key={cohort.week} data-testid={`cohort-row-${cohort.week}`}>
                          <TableCell className="font-medium">{cohort.week}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300" data-testid={`badge-in-transit-${cohort.week}`}>
                              {cohort.in_transit_count}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive" data-testid={`badge-delivered-${cohort.week}`}>
                              {cohort.delivered_count}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {cohort.in_transit_count + cohort.delivered_count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground" data-testid="text-no-cohorts-data">
                    No weekly cohort data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
