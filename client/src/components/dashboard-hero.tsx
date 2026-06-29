import { useEffect, useState } from "react";
import { motion, animate } from "framer-motion";
import { Bot, TrendingUp } from "lucide-react";

// DashboardHero — the focal gradient card. The gradient follows the
// selected accent (--brand), with a soft highlight bloom and a progress
// ring. Confirmation rate counts up on mount; the ring sweeps with it.

interface DashboardHeroProps {
  assignedOrders: number;
  confirmedOrders: number;
  aiConfirmedOrders: number;
  isLoading?: boolean;
}

export function DashboardHero({ assignedOrders, confirmedOrders, aiConfirmedOrders }: DashboardHeroProps) {
  const rate = assignedOrders > 0 ? (confirmedOrders / assignedOrders) * 100 : 0;
  const [disp, setDisp] = useState(0);

  useEffect(() => {
    const controls = animate(0, rate, { duration: 1, ease: "easeOut", onUpdate: setDisp });
    return () => controls.stop();
  }, [rate]);

  const R = 46;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.min(disp, 100) / 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl p-6 shadow-lg"
      style={{ backgroundImage: "var(--brand-gradient)", color: "hsl(var(--brand-foreground))" }}
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/15 blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-black/10 blur-2xl" aria-hidden />

      <div className="relative flex items-center justify-between gap-6 flex-wrap">
        <div className="min-w-[220px]">
          <p className="inline-flex items-center gap-1.5 text-sm opacity-80">
            <TrendingUp className="h-4 w-4" /> Confirmation rate
          </p>
          <p className="mt-2 text-5xl font-semibold tabular-nums leading-none">
            {disp.toFixed(1)}%
          </p>
          <p className="mt-3 text-sm opacity-85">
            {confirmedOrders.toLocaleString("en-IN")} of {assignedOrders.toLocaleString("en-IN")} orders confirmed
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
            <Bot className="h-3.5 w-3.5" />
            {aiConfirmedOrders.toLocaleString("en-IN")} auto-confirmed by Scalysis
          </span>
        </div>

        <div className="relative shrink-0">
          <svg width="124" height="124" viewBox="0 0 124 124" role="img" aria-label={`Confirmation rate ${disp.toFixed(1)} percent`}>
            <circle cx="62" cy="62" r={R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="10" />
            <circle
              cx="62" cy="62" r={R} fill="none" stroke="white" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 62 62)"
            />
            <text x="62" y="68" textAnchor="middle" fill="white" fontSize="24" fontWeight="600">
              {Math.round(disp)}%
            </text>
          </svg>
        </div>
      </div>
    </motion.div>
  );
}
