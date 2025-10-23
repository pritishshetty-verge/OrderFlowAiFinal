import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OrderStatus = "pending" | "assigned" | "confirmed" | "cancelled" | "shipped" | "delivered" | "ndr";

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const statusConfig: Record<OrderStatus, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  },
  assigned: {
    label: "Assigned",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  },
  shipped: {
    label: "Shipped",
    className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  },
  delivered: {
    label: "Delivered",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  ndr: {
    label: "NDR",
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status || "Unknown",
    className: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  };
  
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 text-xs font-medium border", config.className, className)}
      data-testid={`badge-status-${status}`}
    >
      {config.label}
    </Badge>
  );
}
