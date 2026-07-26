import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SHIPPING_STATUS_LABELS, type ShippingStatus } from "@shared/schema";

/**
 * Dumb status pill. It blindly trusts the `status` key it is handed (the
 * single source of truth, orders.status) and maps it straight to a colour
 * family + label. No string-guessing, no shipmentStatus re-derivation — all of
 * that lives in the backend unified mapper (server/logic/unifiedStatus.ts).
 */

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

// Colour families (light + dark). Greens = success, blues = in-motion,
// amber/yellow = needs-attention, reds = failure/return, slate = neutral.
const FAMILY = {
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-700",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-700",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-700",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600",
} as const;

type Family = keyof typeof FAMILY;

// Colour family for every unified shipping status.
const SHIPPING_FAMILY: Record<ShippingStatus, Family> = {
  unfulfilled: "slate",
  awb_assigned: "indigo",
  ready_for_pickup: "violet",
  picked_up: "cyan",
  in_transit: "blue",
  out_for_delivery: "amber",
  delivered: "green",
  ndr: "yellow", // "Undelivered"
  rto_initiated: "red",
  rto_ofd: "red",
  rto_delivered: "rose",
  cancelled: "red",
  lost: "red",
};

// Pre-shipment workflow statuses (assigned by the call-centre flow, not a
// courier) + legacy aliases for rows written before the unified refactor.
const EXTRA_STYLES: Record<string, { label: string; family: Family }> = {
  pending: { label: "Pending", family: "yellow" },
  assigned: { label: "Assigned", family: "blue" },
  confirmed: { label: "Confirmed", family: "green" },
  followup: { label: "Follow Up", family: "amber" },
  // legacy values that may still live in old order rows
  shipped: { label: "AWB Assigned", family: "indigo" },
  dispatched: { label: "In Transit", family: "blue" },
  rto: { label: "RTO in Transit", family: "red" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = (status || "").toLowerCase().trim();

  let label: string;
  let family: Family;

  if (key in SHIPPING_FAMILY) {
    label = SHIPPING_STATUS_LABELS[key as ShippingStatus];
    family = SHIPPING_FAMILY[key as ShippingStatus];
  } else if (key in EXTRA_STYLES) {
    label = EXTRA_STYLES[key].label;
    family = EXTRA_STYLES[key].family;
  } else {
    // Unknown value — render it humanised on a neutral chip rather than break.
    label = (status || "Unknown")
      .split(/[_-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    family = "slate";
  }

  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 text-xs font-medium", FAMILY[family], className)}
      data-testid={`badge-status-${key || "unknown"}`}
    >
      {label}
    </Badge>
  );
}
