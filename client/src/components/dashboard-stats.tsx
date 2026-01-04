import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Package, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Truck, 
  TrendingUp, 
  Target,
  AlertCircle 
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </div>
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
  pendingOrders: number;
}

export function DashboardStats({
  assignedOrders,
  confirmedOrders,
  cancelledOrders,
  followUpOrders,
  fulfilledOrders,
  deliveredOrders,
  pendingOrders,
}: DashboardStatsProps) {
  const confirmationRate = assignedOrders > 0 
    ? ((confirmedOrders / assignedOrders) * 100).toFixed(1) 
    : "0.0";
    
  const deliveryRate = assignedOrders > 0
    ? ((deliveredOrders / assignedOrders) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Assigned Orders"
          value={assignedOrders}
          icon={<Package className="h-4 w-4 text-muted-foreground" />}
          description="My total workload"
        />
        <StatCard
          title="Confirmed Orders"
          value={confirmedOrders}
          icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
          description="Ready for fulfillment"
        />
        <StatCard
          title="Cancelled Orders"
          value={cancelledOrders}
          icon={<XCircle className="h-4 w-4 text-red-600" />}
          description="Customer cancelled"
        />
        <StatCard
          title="Follow-up Orders"
          value={followUpOrders}
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          description="Requires callback"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Fulfilled Orders"
          value={fulfilledOrders}
          icon={<Truck className="h-4 w-4 text-blue-600" />}
          description="Shipped or fulfilled"
        />
        <StatCard
          title="Confirmation Rate"
          value={`${confirmationRate}%`}
          icon={<TrendingUp className="h-4 w-4 text-green-600" />}
          description="Confirmed / Assigned"
        />
        <StatCard
          title="Delivery Rate"
          value={`${deliveryRate}%`}
          icon={<Target className="h-4 w-4 text-purple-600" />}
          description="Delivered / Assigned"
        />
        <StatCard
          title="Pending Orders"
          value={pendingOrders}
          icon={<AlertCircle className="h-4 w-4 text-orange-600" />}
          description="Awaiting verification"
        />
      </div>
    </div>
  );
}
