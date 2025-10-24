import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: "connected" | "disconnected" | "active" | "inactive" | "pending" | "error";
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = {
    connected: {
      icon: CheckCircle,
      color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
      text: label || "Connected",
    },
    disconnected: {
      icon: XCircle,
      color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
      text: label || "Not Connected",
    },
    active: {
      icon: CheckCircle,
      color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
      text: label || "Active",
    },
    inactive: {
      icon: XCircle,
      color: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
      text: label || "Inactive",
    },
    pending: {
      icon: Clock,
      color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
      text: label || "Pending",
    },
    error: {
      icon: AlertCircle,
      color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
      text: label || "Error",
    },
  };

  const { icon: Icon, color, text } = config[status];

  return (
    <Badge variant="outline" className={`${color} gap-1.5`} data-testid={`badge-status-${status}`}>
      <Icon className="h-3 w-3" />
      {text}
    </Badge>
  );
}
