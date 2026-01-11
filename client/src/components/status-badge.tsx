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
    className: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
  },
  delivered: {
    label: "Delivered",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  ndr: {
    label: "NDR",
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  },
  in_transit: {
    label: "In Transit",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  out_for_delivery: {
    label: "Out for Delivery",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  dispatched: {
    label: "Dispatched",
    className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  },
  rto: {
    label: "RTO",
    className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
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
    className: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  };
  
  const label = displayStatus || config.label;
  
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 text-xs font-medium border", config.className, className)}
      data-testid={`badge-status-${statusKey}`}
    >
      {label}
    </Badge>
  );
}
