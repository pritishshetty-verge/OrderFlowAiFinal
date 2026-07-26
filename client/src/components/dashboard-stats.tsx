import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Target,
  AlertTriangle,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// DashboardStats — Overview KPI grid.
//
// Design intent (post UI debt report):
//   • Keep the existing 8 metrics (removed only the "Fulfilled
//     (Shipped)" card, per product call — it duplicated info the
//     funnel already shows downstream).
//   • Promote the cards from "feature checklist" to "command
//     center" by tightening typography: tabular-numerals on every
//     value, uppercase tracking-wide labels, a single dense card
//     shape with the new 8px radius + soft shadow from the design
//     system.
//   • Reduce visual noise: drop the inner Card wrapper components
//     in favour of plain divs styled directly so we don't pay
//     CardHeader's default padding. The KPI strip is *not* a
//     section of content; it's a heads-up display, and HUDs are
//     terse.
//
// What is intentionally NOT here:
//   • No icon-on-card-corner cuteness — too consumer.
//   • No "delta vs yesterday" arrows in this commit. We don't have
//     the historical comparison data wired yet; faking it would be
//     dishonest. Future improvement: thread a prior-period query
//     and surface a tiny `+12%` chip below the description.
// ─────────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  isLoading?: boolean;
  /** Optional emphasis: tints the value in a semantic color (e.g.
   *  the destructive red for RTO). Use sparingly — too many emphasis
   *  states defeat the point. */
  tone?: "default" | "destructive" | "success";
  /** Slot for the right-hand badge / chevron / mini-stat. Currently
   *  unused; kept available for the future delta-chip extension. */
  trailing?: React.ReactNode;
}

function StatCard({
  title,
  value,
  icon,
  description,
  isLoading,
  tone = "default",
}: StatCardProps) {
  // Hero number tone. Default reads in foreground (zinc-900 light /
  // zinc-100 dark). RTO uses destructive red so a non-zero RTO count
  // catches the eye without needing its own card position.
  const toneClass =
    tone === "destructive"
      ? "text-destructive"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-foreground";

  return (
    <div
      className={cn(
        // rounded-lg picks up the new --radius (8px). Hairline
        // border + the design-system shadow gives the card just
        // enough lift without the v1 cage feel.
        "rounded-lg border bg-card p-5 shadow-sm",
        "transition-shadow hover:shadow",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Uppercase tracking-wide label. ~11px feels right for the
            "I am a stat label" pattern — Linear / Stripe both sit
            here. font-medium keeps it readable at small size. */}
        <span
          className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          data-testid={`stat-title-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {title}
        </span>
        <span className="text-muted-foreground/70" aria-hidden>
          {icon}
        </span>
      </div>
      {/* Value: text-3xl (30px) with negative tracking is the
          "this is the answer" rhythm. Inter's tabular-nums kicks
          in via the body-level setting; the inline class makes it
          explicit so future refactors don't accidentally drop it. */}
      <div className="mt-2.5 h-9 flex items-end">
        {isLoading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <span
            className={cn(
              "text-3xl font-semibold tracking-tight tabular-nums leading-none",
              toneClass,
            )}
            data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {value}
          </span>
        )}
      </div>
      {description && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

interface DashboardStatsProps {
  assignedOrders: number;
  confirmedOrders: number;
  cancelledOrders: number;
  followUpOrders: number;
  /** Fulfilled count is still accepted in the props for
   *  back-compat with the parent's queryFn — we just no longer
   *  surface it as its own card. Used downstream to compute
   *  Delivery Rate. */
  fulfilledOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  aiConfirmedOrders: number;
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
  aiConfirmedOrders,
  isLoading = false,
}: DashboardStatsProps) {
  const confirmationRate =
    assignedOrders > 0
      ? ((confirmedOrders / assignedOrders) * 100).toFixed(1)
      : "0.0";

  const deliveryRate =
    fulfilledOrders > 0
      ? ((deliveredOrders / fulfilledOrders) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-4">
      {/* Row 1 — the pipeline state (what the agent will work on
          today). Four cards, equal weight, since these are the
          operational queues. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Assigned"
          value={assignedOrders.toLocaleString("en-IN")}
          icon={<Package className="h-4 w-4" />}
          description="Active workload across the team"
          isLoading={isLoading}
        />
        <StatCard
          title="Confirmed Orders"
          value={confirmedOrders.toLocaleString("en-IN")}
          icon={<CheckCircle2 className="h-4 w-4" />}
          description="Ready for fulfillment"
          isLoading={isLoading}
          tone="success"
        />
        <StatCard
          title="Cancelled Orders"
          value={cancelledOrders.toLocaleString("en-IN")}
          icon={<XCircle className="h-4 w-4" />}
          description="Customer cancelled"
          isLoading={isLoading}
        />
        <StatCard
          title="Follow-up Queue"
          value={followUpOrders.toLocaleString("en-IN")}
          icon={<Clock className="h-4 w-4" />}
          description="Requires a callback"
          isLoading={isLoading}
        />
      </div>
      {/* Row 2 — outcome metrics (how the team is performing). Four
          cards instead of five — the v1 "Fulfilled (Shipped)" card
          was removed because the same data is encoded by Delivery
          Rate's denominator and the funnel charts below. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Confirmation Rate"
          value={`${confirmationRate}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          description="Confirmed / Assigned"
          isLoading={isLoading}
        />
        <StatCard
          title="Delivery Rate"
          value={`${deliveryRate}%`}
          icon={<Target className="h-4 w-4" />}
          description="Delivered / Shipped"
          isLoading={isLoading}
        />
        <StatCard
          title="RTO Orders"
          value={rtoOrders.toLocaleString("en-IN")}
          icon={<AlertTriangle className="h-4 w-4" />}
          description="Returned to origin"
          isLoading={isLoading}
          // RTO is the only inherently-negative signal in the strip.
          // A non-zero count gets a destructive tint so it stands out
          // without claiming its own row.
          tone={rtoOrders > 0 ? "destructive" : "default"}
        />
        <StatCard
          title="AI Agent Confirmed"
          value={aiConfirmedOrders.toLocaleString("en-IN")}
          icon={<Bot className="h-4 w-4" />}
          description="Auto-confirmed by Scalysis"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
