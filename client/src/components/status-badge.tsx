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

// Soft-tinted families (light + dark). Greens = success, blues = in-motion,
// amber/yellow = needs-attention, reds = failure/return, slate = neutral.
// Modern: 10% fill + matching text + a colored dot — no heavy borders.
const FAMILY = {
  green:  { pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  blue:   { pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400",          dot: "bg-blue-500" },
  indigo: { pill: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",    dot: "bg-indigo-500" },
  cyan:   { pill: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",          dot: "bg-cyan-500" },
  violet: { pill: "bg-violet-500/10 text-violet-600 dark:text-violet-400",    dot: "bg-violet-500" },
  amber:  { pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400",       dot: "bg-amber-500" },
  yellow: { pill: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",    dot: "bg-yellow-500" },
  red:    { pill: "bg-red-500/10 text-red-600 dark:text-red-400",             dot: "bg-red-500" },
  rose:   { pill: "bg-rose-500/10 text-rose-600 dark:text-rose-400",          dot: "bg-rose-500" },
  slate:  { pill: "bg-muted text-muted-foreground",                            dot: "bg-zinc-400" },
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

  const f = FAMILY[family];
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border-transparent",
        f.pill,
        className,
      )}
      data-testid={`badge-status-${key || "unknown"}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", f.dot)} />
      {label}
    </Badge>
  );
}
