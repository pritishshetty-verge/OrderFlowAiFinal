import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OrderStatus = "pending" | "assigned" | "confirmed" | "cancelled" | "shipped" | "delivered" | "ndr" | "Unfulfilled" | "unfulfilled" | "in_transit" | "out_for_delivery";

interface StatusBadgeProps {
  status: OrderStatus;
  shipmentStatus?: string | null;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700 font-medium",
  },
  assigned: {
    label: "Assigned",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700 font-medium",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-700 font-medium",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700 font-medium",
  },
  shipped: {
    label: "Shipped",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-medium",
  },
  delivered: {
    label: "Delivered",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 font-medium",
  },
  ndr: {
    label: "NDR",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-700 font-medium",
  },
  in_transit: {
    label: "In Transit",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700 font-medium",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700 font-medium",
  },
  dispatched: {
    label: "Dispatched",
    className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-700 font-medium",
  },
  rto: {
    label: "RTO",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700 font-medium",
  },
};

function formatShipmentStatus(status: string): string {
  const lower = status.toLowerCase().trim();
  
  if (lower === 'ot' || lower === 'ofd' || lower.includes('out for delivery')) {
    return 'Out for Delivery';
  }
  if (lower === 'it' || lower.includes('in transit') || lower.includes('in-transit')) {
    return 'In Transit';
  }
  if (lower === 'dispatched') {
    return 'Dispatched';
  }
  if (lower.includes('delivered')) {
    return 'Delivered';
  }
  if (lower.includes('rto') || lower.includes('return')) {
    return 'RTO';
  }
  
  return status.split(/[_-]/).map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

function getStatusKey(status: string): string {
  const lower = status.toLowerCase().trim();
  
  if (lower === 'ot' || lower === 'ofd' || lower.includes('out for delivery')) {
    return 'out_for_delivery';
  }
  if (lower === 'it' || lower.includes('in transit') || lower.includes('in-transit')) {
    return 'in_transit';
  }
  if (lower === 'dispatched') {
    return 'dispatched';
  }
  if (lower.includes('delivered')) {
    return 'delivered';
  }
  if (lower.includes('rto') || lower.includes('return')) {
    return 'rto';
  }
  if (lower.includes('ndr') || lower.includes('undelivered')) {
    return 'ndr';
  }
  
  return lower;
}

export function StatusBadge({ status, shipmentStatus, className }: StatusBadgeProps) {
  const displayStatus = shipmentStatus && shipmentStatus.trim() 
    ? formatShipmentStatus(shipmentStatus)
    : null;
  
  const statusKey = shipmentStatus && shipmentStatus.trim()
    ? getStatusKey(shipmentStatus)
    : status;
  
  const config = statusConfig[statusKey] || {
    label: displayStatus || status || "Unknown",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-medium",
  };
  
  const label = displayStatus || config.label;
  
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 text-xs", config.className, className)}
      data-testid={`badge-status-${statusKey}`}
    >
      {label}
    </Badge>
  );
}
