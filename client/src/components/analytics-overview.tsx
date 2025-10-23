import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Order } from "@/components/orders-table";

interface AnalyticsOverviewProps {
  orders: Order[];
}

export function AnalyticsOverview({ orders }: AnalyticsOverviewProps) {
  // Calculate order trends by day
  const orderTrends = generateOrderTrends(orders);
  
  // Calculate revenue trends
  const revenueTrends = generateRevenueTrends(orders);
  
  // Calculate status distribution
  const statusDistribution = generateStatusDistribution(orders);
  
  // Calculate payment method distribution
  const paymentDistribution = generatePaymentDistribution(orders);
  
  // Calculate agent performance
  const agentPerformance = generateAgentPerformance(orders);

  const COLORS = {
    assigned: "#3b82f6",
    confirmed: "#10b981",
    cancelled: "#ef4444",
    pending: "#f59e0b",
    shipped: "#6366f1",
    delivered: "#22c55e",
    ndr: "#dc2626",
  };

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList data-testid="tabs-analytics">
        <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
        <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
        <TabsTrigger value="distribution" data-testid="tab-distribution">Distribution</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Order Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Order Trends</CardTitle>
              <CardDescription>Orders over the last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={orderTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="orders" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    name="Orders"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Revenue Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trends</CardTitle>
              <CardDescription>Revenue from confirmed orders</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                    formatter={(value: number) => `₹${value.toLocaleString()}`}
                  />
                  <Legend />
                  <Bar 
                    dataKey="revenue" 
                    fill="#10b981" 
                    name="Revenue (₹)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="performance" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Agent Performance</CardTitle>
            <CardDescription>Order handling by team members</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={agentPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  type="number"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  type="category"
                  dataKey="agent" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  width={120}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Bar dataKey="total" fill="#3b82f6" name="Total Orders" radius={[0, 4, 4, 0]} />
                <Bar dataKey="confirmed" fill="#10b981" name="Confirmed" radius={[0, 4, 4, 0]} />
                <Bar dataKey="cancelled" fill="#ef4444" name="Cancelled" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="distribution" className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Order Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Order Status</CardTitle>
              <CardDescription>Distribution by status</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || "#8884d8"} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Payment Method Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>COD vs Prepaid split</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={paymentDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent, value }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill="#f59e0b" />
                    <Cell fill="#10b981" />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}

// Helper functions to generate analytics data
function generateOrderTrends(orders: Order[]) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  return last7Days.map(dateStr => {
    const date = new Date(dateStr);
    const count = orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate.toDateString() === date.toDateString();
    }).length;

    return {
      date: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      orders: count,
    };
  });
}

function generateRevenueTrends(orders: Order[]) {
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toISOString().split('T')[0];
  });

  return last7Days.map(dateStr => {
    const date = new Date(dateStr);
    const revenue = orders
      .filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate.toDateString() === date.toDateString() && 
               (order.status === 'confirmed' || order.status === 'delivered');
      })
      .reduce((sum, order) => sum + order.total, 0);

    return {
      date: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue,
    };
  });
}

function generateStatusDistribution(orders: Order[]) {
  const statusCounts: Record<string, number> = {};
  
  orders.forEach(order => {
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
  });

  return Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
  }));
}

function generatePaymentDistribution(orders: Order[]) {
  const cod = orders.filter(o => o.paymentMethod === 'cod').length;
  const prepaid = orders.filter(o => o.paymentMethod === 'prepaid').length;

  return [
    { name: 'COD', value: cod },
    { name: 'Prepaid', value: prepaid },
  ];
}

function generateAgentPerformance(orders: Order[]) {
  const agentStats: Record<string, { total: number; confirmed: number; cancelled: number }> = {};

  orders.forEach(order => {
    if (order.assignedTo) {
      if (!agentStats[order.assignedTo]) {
        agentStats[order.assignedTo] = { total: 0, confirmed: 0, cancelled: 0 };
      }
      agentStats[order.assignedTo].total++;
      if (order.status === 'confirmed') agentStats[order.assignedTo].confirmed++;
      if (order.status === 'cancelled') agentStats[order.assignedTo].cancelled++;
    }
  });

  return Object.entries(agentStats).map(([agent, stats]) => ({
    agent,
    ...stats,
  }));
}
