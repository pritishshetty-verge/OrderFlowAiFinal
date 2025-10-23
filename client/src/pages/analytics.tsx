import { PageLayout } from "@/components/page-layout";
import { AnalyticsOverview } from "@/components/analytics-overview";
import { DashboardStats } from "@/components/dashboard-stats";
import type { Order } from "@/components/orders-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";

//todo: remove mock functionality
const mockOrders: Order[] = [
  {
    id: "1",
    shopifyOrderId: "1001",
    customerName: "Rajesh Kumar",
    customerPhone: "+91 98765 43210",
    items: "iPhone 15 Pro, AirPods Pro",
    total: 145000,
    paymentMethod: "cod",
    status: "assigned",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "2",
    shopifyOrderId: "1002",
    customerName: "Priya Patel",
    customerPhone: "+91 98765 43211",
    items: "Samsung Galaxy S24",
    total: 79999,
    paymentMethod: "prepaid",
    status: "confirmed",
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 120),
  },
  {
    id: "3",
    shopifyOrderId: "1003",
    customerName: "Amit Verma",
    customerPhone: "+91 98765 43212",
    items: "OnePlus 12, Smart Watch",
    total: 95000,
    paymentMethod: "cod",
    status: "pending",
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
  },
  {
    id: "4",
    shopifyOrderId: "1004",
    customerName: "Sneha Reddy",
    customerPhone: "+91 98765 43213",
    items: "iPad Air, Apple Pencil",
    total: 68000,
    paymentMethod: "prepaid",
    status: "shipped",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 240),
  },
  {
    id: "5",
    shopifyOrderId: "1005",
    customerName: "Vikram Singh",
    customerPhone: "+91 98765 43214",
    items: "MacBook Pro 14",
    total: 199000,
    paymentMethod: "cod",
    status: "cancelled",
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 180),
  },
  {
    id: "6",
    shopifyOrderId: "1006",
    customerName: "Anjali Gupta",
    customerPhone: "+91 98765 43215",
    items: "Sony WH-1000XM5",
    total: 29990,
    paymentMethod: "prepaid",
    status: "delivered",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 360),
  },
  {
    id: "7",
    shopifyOrderId: "1007",
    customerName: "Karan Malhotra",
    customerPhone: "+91 98765 43216",
    items: "PS5 Console, Games Bundle",
    total: 54990,
    paymentMethod: "cod",
    status: "ndr",
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 90),
  },
  {
    id: "8",
    shopifyOrderId: "1008",
    customerName: "Neha Sharma",
    customerPhone: "+91 98765 43217",
    items: "Dell XPS 13",
    total: 125000,
    paymentMethod: "prepaid",
    status: "confirmed",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 45),
  },
  {
    id: "9",
    shopifyOrderId: "1009",
    customerName: "Arjun Mehta",
    customerPhone: "+91 98765 43218",
    items: "Nike Air Max, Adidas Shoes",
    total: 18500,
    paymentMethod: "cod",
    status: "assigned",
    assignedTo: "Priya Sharma",
    createdAt: new Date(Date.now() - 1000 * 60 * 60),
  },
  {
    id: "10",
    shopifyOrderId: "1010",
    customerName: "Kavya Nair",
    customerPhone: "+91 98765 43219",
    items: "Canon EOS R6, Lens Kit",
    total: 285000,
    paymentMethod: "prepaid",
    status: "confirmed",
    assignedTo: "Amit Singh",
    createdAt: new Date(Date.now() - 1000 * 60 * 90),
  },
];

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

export default function AnalyticsPage() {
  //todo: remove mock functionality - calculate from real data
  const stats = {
    totalOrders: mockOrders.length,
    confirmedOrders: mockOrders.filter((o) => o.status === "confirmed").length,
    cancelledOrders: mockOrders.filter((o) => o.status === "cancelled").length,
    totalRevenue: mockOrders
      .filter((o) => o.status === "confirmed" || o.status === "delivered")
      .reduce((sum, o) => sum + o.total, 0),
  };

  const avgOrderValue = stats.totalOrders > 0 
    ? Math.floor(stats.totalRevenue / stats.confirmedOrders) 
    : 0;

  const conversionRate = stats.totalOrders > 0
    ? ((stats.confirmedOrders / stats.totalOrders) * 100).toFixed(1)
    : "0";

  return (
    <PageLayout
      title="Analytics & Insights"
      description="Comprehensive analytics and performance metrics"
    >
      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <DashboardStats {...stats} />

        {/* Additional Insights */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <InsightCard
            title="Avg Order Value"
            value={`₹${avgOrderValue.toLocaleString("en-IN")}`}
            change="+8.2% from last period"
            trend="up"
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          />
          <InsightCard
            title="Conversion Rate"
            value={`${conversionRate}%`}
            change="+3.1% from last period"
            trend="up"
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          />
          <InsightCard
            title="COD Orders"
            value={mockOrders.filter(o => o.paymentMethod === 'cod').length.toString()}
            change="-2.4% from last period"
            trend="down"
            icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
          />
          <InsightCard
            title="Active Agents"
            value={new Set(mockOrders.filter(o => o.assignedTo).map(o => o.assignedTo)).size.toString()}
            change="No change"
            trend="up"
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        {/* Charts and Visualizations */}
        <AnalyticsOverview orders={mockOrders} />
      </div>
    </PageLayout>
  );
}
