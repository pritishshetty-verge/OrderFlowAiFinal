import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Package, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Truck, 
  TrendingUp, 
  Target,
  AlertTriangle 
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  isLoading?: boolean;
}

function StatCard({ title, value, icon, description, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {value}
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface DashboardStatsProps {
  assignedOrders: number;
  confirmedOrders: number;
  cancelledOrders: number;
  followUpOrders: number;
  fulfilledOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  isLoading?: boolean;
}

export function DashboardStats({
  assignedOrders,
  confirmedOrders,
  cancelledOrders,
  followUpOrders,
  fulfilledOrders,
  deliveredOrders,
  rtoOrders,
  isLoading = false,
}: DashboardStatsProps) {
  const confirmationRate = assignedOrders > 0 
    ? ((confirmedOrders / assignedOrders) * 100).toFixed(1) 
    : "0.0";
    
  const deliveryRate = fulfilledOrders > 0
    ? ((deliveredOrders / fulfilledOrders) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Assigned"
          value={assignedOrders}
          icon={<Package className="h-4 w-4 text-muted-foreground" />}
          description="Pipeline: Active workload"
          isLoading={isLoading}
        />
        <StatCard
          title="Confirmed Orders"
          value={confirmedOrders}
          icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
          description="Ready for fulfillment"
          isLoading={isLoading}
        />
        <StatCard
          title="Cancelled Orders"
          value={cancelledOrders}
          icon={<XCircle className="h-4 w-4 text-red-600" />}
          description="Customer cancelled"
          isLoading={isLoading}
        />
        <StatCard
          title="Follow-up Queue"
          value={followUpOrders}
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          description="Pipeline: Requires callback"
          isLoading={isLoading}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Fulfilled (Shipped)"
          value={fulfilledOrders}
          icon={<Truck className="h-4 w-4 text-blue-600" />}
          description="Orders shipped out"
          isLoading={isLoading}
        />
        <StatCard
          title="Confirmation Rate"
          value={`${confirmationRate}%`}
          icon={<TrendingUp className="h-4 w-4 text-green-600" />}
          description="Confirmed / Assigned"
          isLoading={isLoading}
        />
        <StatCard
          title="Delivery Rate"
          value={`${deliveryRate}%`}
          icon={<Target className="h-4 w-4 text-purple-600" />}
          description="Delivered / Shipped"
          isLoading={isLoading}
        />
        <StatCard
          title="RTO Orders"
          value={rtoOrders}
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          description="Returned to origin"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
