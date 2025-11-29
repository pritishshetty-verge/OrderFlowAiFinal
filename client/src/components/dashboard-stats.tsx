import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, CheckCircle2, XCircle, TrendingUp } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: string;
}

function StatCard({ title, value, icon, description, trend }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">{trend}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface DashboardStatsProps {
  totalOrders: number;
  confirmedOrders: number;
  cancelledOrders: number;
  codOrders: number;
}

export function DashboardStats({
  totalOrders,
  confirmedOrders,
  cancelledOrders,
  codOrders,
}: DashboardStatsProps) {
  const confirmationRate = totalOrders > 0 
    ? ((confirmedOrders / totalOrders) * 100).toFixed(1) 
    : "0";
    
  const codPercentage = totalOrders > 0
    ? ((codOrders / totalOrders) * 100).toFixed(1)
    : "0";

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Orders"
        value={totalOrders}
        icon={<Package className="h-4 w-4 text-muted-foreground" />}
        description="All time orders"
      />
      <StatCard
        title="Confirmed Orders"
        value={confirmedOrders}
        icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
        description={`${confirmationRate}% confirmation rate`}
      />
      <StatCard
        title="Cancelled Orders"
        value={cancelledOrders}
        icon={<XCircle className="h-4 w-4 text-red-600" />}
        description="Requires attention"
      />
      <StatCard
        title="COD Orders"
        value={codOrders}
        icon={<TrendingUp className="h-4 w-4 text-orange-600" />}
        description={`${codPercentage}% of total orders`}
      />
    </div>
  );
}
