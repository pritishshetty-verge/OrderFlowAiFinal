import { DashboardStats } from "../dashboard-stats";

export default function DashboardStatsExample() {
  return (
    <div className="p-8">
      <DashboardStats
        totalOrders={247}
        confirmedOrders={198}
        cancelledOrders={23}
        totalRevenue={4850000}
      />
    </div>
  );
}
