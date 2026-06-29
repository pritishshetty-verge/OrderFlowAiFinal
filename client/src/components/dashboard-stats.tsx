import { useEffect, useState } from "react";
import { motion, animate } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/theme-provider";
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
// Visual language (UI rework): gradient icon tiles (one hue per metric,
// the brand tile follows the selected accent), numbers that count up on
// mount, a staggered fade-in, and real depth via the design-system
// shadow. Honest by design — no invented "+12% vs yesterday" deltas,
// since the historical-comparison data isn't wired yet.
// ─────────────────────────────────────────────────────────────────────

type Tone = "brand" | "success" | "danger" | "amber" | "sky" | "violet";

// Soft-tinted chip per metric — calm and cohesive (loud gradients are
// reserved for the hero + charts). The brand chip follows the accent.
const CHIP: Record<Tone, string> = {
  brand: "bg-brand/10 text-brand",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

/** Animates 0 → value once on mount (and again if value changes). */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value]);
  return <>{format(display)}</>;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-IN");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: Tone;
  description?: string;
  isLoading?: boolean;
  format?: (n: number) => string;
  index: number;
}

function StatCard({ title, value, icon, tone, description, isLoading, format = fmtInt, index }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm",
        "transition-shadow duration-200 hover:shadow-md",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl", CHIP[tone])}
          aria-hidden
        >
          {icon}
        </span>
        <span
          className="text-[13px] font-medium text-muted-foreground"
          data-testid={`stat-title-${title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {title}
        </span>
      </div>
      <div className="mt-4 h-9 flex items-end">
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <span
            className="text-[32px] font-semibold tracking-tight tabular-nums leading-none text-foreground"
            data-testid={`stat-value-${title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <CountUp value={value} format={format} />
          </span>
        )}
      </div>
      {description && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </motion.div>
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
  const { accent } = useTheme();
  const confirmationRate = assignedOrders > 0 ? (confirmedOrders / assignedOrders) * 100 : 0;
  const deliveryRate = fulfilledOrders > 0 ? (deliveredOrders / fulfilledOrders) * 100 : 0;

  // Pearl is the monochrome accent — collapse every chip to the brand
  // tone so the whole dashboard reads as one cohesive grey set. Other
  // accents keep their per-metric semantic colors.
  const t = (tone: Tone): Tone => (accent === "pearl" ? "brand" : tone);

  const cards: Omit<StatCardProps, "index">[] = [
    { title: "Total Assigned", value: assignedOrders, icon: <Package className="h-5 w-5" />, tone: t("brand"), description: "Active workload across the team", isLoading },
    { title: "Confirmed Orders", value: confirmedOrders, icon: <CheckCircle2 className="h-5 w-5" />, tone: t("success"), description: "Ready for fulfillment", isLoading },
    { title: "Cancelled Orders", value: cancelledOrders, icon: <XCircle className="h-5 w-5" />, tone: t("danger"), description: "Customer cancelled", isLoading },
    { title: "Follow-up Queue", value: followUpOrders, icon: <Clock className="h-5 w-5" />, tone: t("amber"), description: "Requires a callback", isLoading },
    { title: "Confirmation Rate", value: confirmationRate, icon: <TrendingUp className="h-5 w-5" />, tone: t("violet"), description: "Confirmed / Assigned", isLoading, format: fmtPct },
    { title: "Delivery Rate", value: deliveryRate, icon: <Target className="h-5 w-5" />, tone: t("sky"), description: "Delivered / Shipped", isLoading, format: fmtPct },
    { title: "RTO Orders", value: rtoOrders, icon: <AlertTriangle className="h-5 w-5" />, tone: t("danger"), description: "Returned to origin", isLoading },
    { title: "AI Agent Confirmed", value: aiConfirmedOrders, icon: <Bot className="h-5 w-5" />, tone: t("violet"), description: "Auto-confirmed by Scalysis", isLoading },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <StatCard key={c.title} {...c} index={i} />
      ))}
    </div>
  );
}
