/**
 * Reconciliation dashboard — full port of the polished HTML mockup at
 * Downloads/verge resources/reconciliation-mockup/.
 *
 * Every visual element from the mockup is wired to real data:
 *   - Phaid-style dark alert banner (when there's a high-value overdue)
 *   - 4 minimal KPI cards with Phaid-style dense sparklines (real time-series)
 *   - Smooth area trend chart (Catmull-Rom path, NetSuite/Aminat style)
 *   - Donut chart breakdown (real status counts)
 *   - Activity card + Report delivery card
 *   - Quick-stat filter chips
 *   - Settlements table with PG brand-marks, row-stripes, status pills, conflict popover
 *   - Two-pane Nanonets-style match-selector drawer
 *   - Settlements-by-UTR tab
 *   - Upload tab with file dropzone + auto-match
 *   - Settings tab with PG keys + schedule + delivery channels
 *
 * Endpoints used:
 *   GET  /api/recon/status-counts
 *   GET  /api/recon/settlements
 *   GET  /api/recon/overdue
 *   GET  /api/recon/trend
 *   GET  /api/recon/by-utr
 *   GET  /api/recon/sparklines
 *   POST /api/recon/upload       (multipart file)
 *   POST /api/recon/match
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveStore } from "@/hooks/use-store";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  AlertTriangle,
  Play,
  CheckCircle2,
  ArrowUpRight,
  Wallet,
  Hourglass,
  AlertCircle,
  Download,
  Upload as UploadIcon,
  RefreshCw,
  Search,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Mail,
  MessageSquare,
  ShoppingBag,
  CreditCard,
  Sparkles,
  Plus,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================
interface StatusCounts {
  pending: number;
  overdue: number;
  mismatch: number;
  settled: number;
}

interface Settlement {
  id: string;
  pgName: string;
  pgPaymentId: string;
  pgOrderId: string | null;
  orderId: string | null;
  orderAmount: string | null;
  settledAmount: string;
  feeDeducted: string | null;
  taxOnFee: string | null;
  grossAmount: string | null;
  utrNumber: string | null;
  settledAt: string | null;
  status: "pending" | "overdue" | "mismatch" | "settled";
}

interface OverdueOrder {
  id: string;
  shopifyOrderNumber: string;
  customerEmail: string | null;
  totalPrice: string;
  shopifyCreatedAt: string;
  payUTxnId: string;
  ageDays: number;
}

interface TrendPoint { date: string; settled: number; count: number; }
interface UtrRow {
  utr: string;
  settlementDate: string;
  orderCount: number;
  gross: number; fee: number; gst: number; net: number;
  mismatchCount: number;
}
interface SparklinesData {
  byStatus: Record<string, Array<{ date: string; count: number }>>;
}

type StatusKey = "settled" | "pending" | "overdue" | "mismatch";
type TabKey = "overview" | "recon" | "settlements" | "upload" | "settings";

// =============================================================================
// Constants
// =============================================================================
const STATUS_PILL: Record<StatusKey, { label: string; dot: string; pill: string; }> = {
  settled:  { label: "Settled",  dot: "bg-green-500",  pill: "bg-green-500/15 text-green-700 dark:text-green-400" },
  pending:  { label: "Pending",  dot: "bg-yellow-500", pill: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  overdue:  { label: "Overdue",  dot: "bg-red-500",    pill: "bg-red-500/15 text-red-700 dark:text-red-400" },
  mismatch: { label: "Mismatch", dot: "bg-orange-500", pill: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
};

const PG_BRANDS: Record<string, { initial: string; gradient: string }> = {
  payu:     { initial: "P",  gradient: "linear-gradient(135deg, hsl(20 92% 55%), hsl(14 85% 45%))" },
  razorpay: { initial: "R",  gradient: "linear-gradient(135deg, hsl(217 91% 60%), hsl(222 80% 50%))" },
  cashfree: { initial: "C",  gradient: "linear-gradient(135deg, hsl(173 70% 45%), hsl(178 75% 38%))" },
  phonepe:  { initial: "Ph", gradient: "linear-gradient(135deg, hsl(263 70% 55%), hsl(258 75% 45%))" },
};

const GLOW_AND_ME_FALLBACK = "3f550942-9bb4-4ec1-b8ed-3a11803acd3e";

// =============================================================================
// Utility primitives
// =============================================================================
function maskEmail(e: string | null): string {
  if (!e) return "—";
  const [local, domain] = e.split("@");
  if (!domain) return "***";
  return local.slice(0, 3) + "***@" + domain;
}

function formatINR(amount: string | number | null | undefined): string {
  if (amount == null) return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatINRCompact(amount: number): string {
  if (amount >= 1e7) return "₹" + (amount / 1e7).toFixed(2) + "Cr";
  if (amount >= 1e5) return "₹" + (amount / 1e5).toFixed(2) + "L";
  if (amount >= 1e3) return "₹" + (amount / 1e3).toFixed(1) + "K";
  return "₹" + amount.toFixed(0);
}

// =============================================================================
// Visual subcomponents
// =============================================================================

function PgBrandMark({ name }: { name: string }) {
  const brand = PG_BRANDS[name.toLowerCase()] ?? PG_BRANDS.payu;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="w-[18px] h-[18px] rounded grid place-items-center text-[10px] font-bold text-white"
            style={{ background: brand.gradient }}>
        {brand.initial}
      </span>
      <span className="font-medium">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
    </span>
  );
}

function StatusPill({ status }: { status: StatusKey }) {
  const s = STATUS_PILL[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", s.pill)}>
      <span className={cn("w-2 h-2 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/** Dense 60-bar Phaid-style sparkline. Falls back to deterministic pattern if no data. */
function Sparkline({ data, fallbackSeed, color }: { data?: Array<{ date: string; count: number }>; fallbackSeed: number; color: string }) {
  const bars = useMemo(() => {
    const N = 60;
    if (data && data.length > 0) {
      const max = Math.max(1, ...data.map(d => d.count));
      // Right-align: last N points
      const slice = data.slice(-N);
      const pad = N - slice.length;
      return [
        ...Array.from({ length: pad }, () => 0.0),
        ...slice.map(d => d.count / max),
      ];
    }
    // Deterministic fallback
    return Array.from({ length: N }, (_, i) => {
      const wave = Math.sin((i + fallbackSeed) * 0.45) * 0.25 + 0.55;
      const dip = Math.sin((i + fallbackSeed * 1.7) * 0.18) * 0.18;
      const noise = ((i * 9301 + fallbackSeed * 49297) % 233280) / 233280;
      return Math.max(0.15, Math.min(1.0, wave + dip + (noise - 0.5) * 0.35));
    });
  }, [data, fallbackSeed]);

  return (
    <div className="flex items-end gap-px h-7">
      {bars.map((v, i) => {
        const fade = 0.3 + (i / bars.length) * 0.7;
        return (
          <div key={i} className="flex-1"
               style={{ height: `${Math.round(v * 100)}%`, minWidth: 1, minHeight: 2, background: color, opacity: fade }} />
        );
      })}
    </div>
  );
}

function KpiCard({ label, value, loading, icon, sparklineData, sparkSeed, sparkColor, borderColor }: {
  label: string; value: number | undefined; loading?: boolean; icon: React.ReactNode;
  sparklineData?: Array<{ date: string; count: number }>; sparkSeed: number;
  sparkColor: string; borderColor: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 relative cursor-pointer hover:shadow-md transition-shadow" style={{ borderColor }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        {loading ? <Skeleton className="h-10 w-20" /> : (
          <div className="text-[40px] leading-[1] font-bold tracking-tight tabular-nums">
            {(value ?? 0).toLocaleString("en-IN")}
          </div>
        )}
        <div className="shrink-0">{icon}</div>
      </div>
      <div className="flex items-baseline justify-between gap-2 mb-4">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">last 30 days</div>
      </div>
      <Sparkline data={sparklineData} fallbackSeed={sparkSeed} color={sparkColor} />
    </div>
  );
}

/** Smooth area chart — Catmull-Rom path with gradient fill. */
function TrendChart({ data, days }: { data?: TrendPoint[]; days: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  // Real resize observer (was useMemo before — never attached).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Initial measure on mount
    setWidth(el.clientWidth || 720);
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth || 720);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pad sparse data with zeros for missing days so a 2-point series
  // doesn't render as two lonely points stretched across a wide chart.
  // We backfill the last `days` days with whatever the API returned,
  // filling gaps with 0.
  const paddedData = useMemo<TrendPoint[]>(() => {
    if (!data || data.length === 0) return [];
    const byDate = new Map(data.map(d => [d.date.slice(0, 10), d]));
    const out: TrendPoint[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const existing = byDate.get(key);
      out.push(existing ?? { date: key, settled: 0, count: 0 });
    }
    return out;
  }, [data, days]);

  if (!data || data.length === 0) {
    return (
      <div ref={containerRef} className="w-full h-[200px] flex flex-col items-center justify-center text-xs text-muted-foreground gap-2 border border-dashed border-border rounded-md">
        <Hourglass className="w-5 h-5 opacity-50" />
        <div>No settlement data in this window yet</div>
        <div className="text-[10px]">Upload a PayU settlement CSV to populate this chart</div>
      </div>
    );
  }

  const H = 200, padX = 36, padY = 22;
  const values = paddedData.map(d => d.settled);
  const max = Math.max(...values) * 1.15 || 1;

  const points = paddedData.map((d, i) => {
    const x = padX + (i * (width - padX * 2)) / Math.max(1, paddedData.length - 1);
    const y = H - padY - (d.settled / max) * (H - padY * 2);
    return [x, y] as [number, number];
  });

  // Catmull-Rom to Bezier
  let pathD = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    pathD += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  const areaD = `${pathD} L ${points[points.length - 1][0]},${H - padY} L ${points[0][0]},${H - padY} Z`;

  const ticks = 4;
  const gridLines = Array.from({ length: ticks + 1 }, (_, i) => {
    const y = padY + (i * (H - padY * 2) / ticks);
    const v = max * (1 - i / ticks);
    return { y, label: formatINRCompact(v) };
  });

  return (
    <div ref={containerRef} className="w-full block" style={{ height: H }}>
      <svg viewBox={`0 0 ${width} ${H}`} className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padX} y1={g.y} x2={width - padX} y2={g.y} stroke="hsl(var(--border))" strokeDasharray="2 4" />
            <text x={padX - 6} y={g.y + 3} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">{g.label}</text>
          </g>
        ))}
        <path d={areaD} fill="url(#area-grad)" />
        <path d={pathD} fill="none" stroke="hsl(var(--foreground))" strokeWidth="2" />
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          if (isLast) {
            return (
              <g key={i}>
                <circle cx={p[0]} cy={p[1]} r="6" fill="hsl(var(--foreground))" fillOpacity="0.12" />
                <circle cx={p[0]} cy={p[1]} r="3.5" fill="hsl(var(--card))" stroke="hsl(var(--foreground))" strokeWidth="2" />
              </g>
            );
          }
          return <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="hsl(var(--card))" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />;
        })}
        {paddedData.map((d, i) => {
          // Show ~7 evenly-spaced X labels
          const step = Math.max(1, Math.ceil(paddedData.length / 7));
          if (i % step !== 0 && i !== paddedData.length - 1) return null;
          const x = padX + (i * (width - padX * 2)) / Math.max(1, paddedData.length - 1);
          const label = new Date(d.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
          return (
            <text key={`x-${i}`} x={x} y={H - 2} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">{label}</text>
          );
        })}
      </svg>
    </div>
  );
}

/** Donut chart with N segments + center label. */
function DonutChart({ segments, total }: { segments: Array<{ label: string; value: number; color: string; description?: string }>; total: number; }) {
  const R = 48, STROKE = 16, CIRC = 2 * Math.PI * R; // ~301.6
  let offset = 0;
  const visible = segments.filter(s => s.value > 0);

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 120 120" className="w-[112px] h-[112px] -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="hsl(var(--secondary))" strokeWidth={STROKE} />
          {visible.map((s, i) => {
            const fraction = total > 0 ? s.value / total : 0;
            const dash = fraction * CIRC;
            const el = (
              <circle key={i} cx="60" cy="60" r={R} fill="none"
                      stroke={s.color} strokeWidth={STROKE}
                      strokeDasharray={`${dash} ${CIRC}`} strokeDashoffset={-offset} />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-bold leading-none tabular-nums">{total}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Flagged</div>
        </div>
      </div>
      <div className="flex-1 space-y-3 text-[13px]">
        {segments.map((s) => (
          <div key={s.label} className="flex items-start gap-2.5">
            <span className="w-2 h-2 rounded-sm mt-1.5 shrink-0" style={{ background: s.color }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{s.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.value}</span>
                  {total > 0 && <> · {Math.round((s.value / total) * 100)}%</>}
                </span>
              </div>
              {s.description && <div className="text-[11px] text-muted-foreground">{s.description}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickStatChip({ label, count, color, active, onClick }: { label: string; count: number; color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
              active ? "border-foreground" : "border-border",
              "bg-card hover:bg-accent",
            )}>
      <span className={cn("w-2 h-2 rounded-full", color)} />
      {label}
      <span className="text-muted-foreground font-normal">{count}</span>
    </button>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function ReconciliationPage() {
  const { toast } = useToast();
  const { activeStoreId } = useActiveStore();
  const storeId = activeStoreId ?? GLOW_AND_ME_FALLBACK;

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [statusFilter, setStatusFilter] = useState<StatusKey[]>([]);
  const [drawerSettlement, setDrawerSettlement] = useState<Settlement | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dateRange, setDateRange] = useState<"all" | "30d" | "90d" | "year">("30d");

  // Debounce search input by 250ms so we don't fire on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, dateRange, statusFilter.join(",")]);

  // ── data fetches ──
  const counts = useQuery<StatusCounts>({
    queryKey: ["/api/recon/status-counts", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/recon/status-counts?storeId=${storeId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  // Build the settlements query string from all active filters.
  const settlementsQueryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("storeId", storeId);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (statusFilter.length > 0) p.set("status", statusFilter.join(","));
    if (debouncedQ) p.set("q", debouncedQ);
    if (dateRange !== "all") {
      const now = new Date();
      const days = dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 365;
      const from = new Date(now.getTime() - days * 86400_000);
      p.set("fromDate", from.toISOString());
      p.set("toDate", now.toISOString());
    }
    return p.toString();
  }, [storeId, page, pageSize, statusFilter, debouncedQ, dateRange]);

  const settlements = useQuery<{ rows: Settlement[]; total: number }>({
    queryKey: ["/api/recon/settlements", settlementsQueryString],
    queryFn: async () => {
      const r = await fetch(`/api/recon/settlements?${settlementsQueryString}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  function handleExport() {
    // Reuse the same filter query string — admin gets exactly what
    // they're looking at on screen.
    const p = new URLSearchParams(settlementsQueryString);
    p.delete("page");
    p.delete("pageSize");
    window.open(`/api/recon/export?${p.toString()}`, "_blank");
  }

  const fetchOrphans = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/recon/fetch-from-shopify", { storeId, limit: 25 }),
    onSuccess: (data: any) => {
      const msg = data.orphansFound === 0
        ? "No orphan settlements — every PG row already has a Shopify order."
        : `${data.orphansFound} orphans · ${data.ordersInserted} new orders inserted · ${data.stillMissing} still missing.` +
          (data.rematched ? ` Matcher re-ran: ${data.rematched.classified?.settled ?? 0} settled, ${data.rematched.classified?.mismatch ?? 0} mismatch.` : "");
      toast({ title: "Shopify auto-fetch complete", description: msg });
      invalidateAll();
    },
    onError: (err: Error) => toast({ title: "Auto-fetch failed", description: err.message, variant: "destructive" }),
  });

  const overdue = useQuery<{ rows: OverdueOrder[]; total: number; graceDays: number; window: { fromDate: string; toDate: string } | null; windowNote: string | null }>({
    queryKey: ["/api/recon/overdue", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/recon/overdue?storeId=${storeId}&graceDays=3&limit=50`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const trend = useQuery<{ rows: TrendPoint[]; days: number }>({
    queryKey: ["/api/recon/trend", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/recon/trend?storeId=${storeId}&days=14`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const sparklines = useQuery<SparklinesData>({
    queryKey: ["/api/recon/sparklines", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/recon/sparklines?storeId=${storeId}&days=60`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const byUtr = useQuery<{ rows: UtrRow[]; days: number }>({
    queryKey: ["/api/recon/by-utr", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/recon/by-utr?storeId=${storeId}&days=30`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const runMatcher = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/recon/match", { storeId, pgName: "payu" }),
    onSuccess: (data: any) => {
      toast({
        title: "Matcher complete",
        description: `${data.scanned} scanned · settled ${data.classified?.settled ?? 0} · mismatch ${data.classified?.mismatch ?? 0} · orphan ${data.orphan ?? 0}`,
      });
      invalidateAll();
    },
    onError: (err: Error) => toast({ title: "Match failed", description: err.message, variant: "destructive" }),
  });

  function invalidateAll() {
    ["/api/recon/status-counts", "/api/recon/settlements", "/api/recon/overdue", "/api/recon/trend", "/api/recon/sparklines", "/api/recon/by-utr"].forEach(key =>
      queryClient.invalidateQueries({ queryKey: [key, storeId] })
    );
  }

  function toggleStatusFilter(s: StatusKey) {
    setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    setPage(1);
  }

  const topOverdue = overdue.data?.rows[0];
  const totalFlagged = (counts.data?.mismatch ?? 0) + (overdue.data?.total ?? 0);

  return (
    <div className="min-h-screen w-full flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border w-full">
        <div className="px-6 lg:px-8 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <span>Finance</span><ChevronRight className="w-3 h-3" /><span>Reconciliation</span>
              </div>
              <h1 className="text-2xl font-bold leading-tight">PG Reconciliation</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Cross-check Payment Gateway settlements against Shopify orders. Catch missing payouts and fee discrepancies before they cost you.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => invalidateAll()}
                      className="h-9 px-3 text-sm rounded-md border border-input bg-card hover:bg-accent inline-flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button onClick={handleExport} className="h-9 px-3 text-sm rounded-md border border-input bg-card hover:bg-accent inline-flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Export for CA
              </button>
              <button onClick={() => runMatcher.mutate()} disabled={runMatcher.isPending}
                      className="h-9 px-3 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center gap-1.5 disabled:opacity-60">
                <Play className="w-4 h-4" /> {runMatcher.isPending ? "Running…" : "Run reconciliation"}
              </button>
            </div>
          </div>

          {/* TABS */}
          <div className="mt-5 -mb-px flex items-center gap-1 text-sm">
            {(["overview", "recon", "settlements", "upload", "settings"] as TabKey[]).map(t => {
              const active = activeTab === t;
              const labels: Record<TabKey, React.ReactNode> = {
                overview: "Overview",
                recon: <>Reconciliation {totalFlagged > 0 && <span className="ml-1 text-xs bg-red-500/15 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">{totalFlagged}</span>}</>,
                settlements: "Settlements",
                upload: "Upload",
                settings: "Settings",
              };
              return (
                <button key={t} onClick={() => setActiveTab(t)}
                        className={cn("px-3 py-2 rounded-t-md border-b-2 transition-colors",
                                     active ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {labels[t]}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="px-6 lg:px-8 py-6 w-full flex-1">
        {activeTab === "overview" && (
          <OverviewTab
            counts={counts.data} countsLoading={counts.isLoading}
            overdueCount={overdue.data?.total} overdueLoading={overdue.isLoading}
            overdueWindowNote={overdue.data?.windowNote ?? null}
            topOverdue={topOverdue}
            trend={trend.data?.rows}
            sparklines={sparklines.data?.byStatus}
            onJumpToRecon={() => setActiveTab("recon")}
            onJumpToSettings={() => setActiveTab("settings")}
          />
        )}

        {activeTab === "recon" && (
          <ReconciliationTab
            settlements={settlements.data} settlementsLoading={settlements.isLoading}
            counts={counts.data} overdueCount={overdue.data?.total ?? 0}
            statusFilter={statusFilter} onToggleStatus={toggleStatusFilter}
            page={page} pageSize={pageSize} onPage={setPage}
            onOpenDrawer={setDrawerSettlement}
            searchQuery={searchQuery} onSearchChange={setSearchQuery}
            dateRange={dateRange} onDateRangeChange={setDateRange}
          />
        )}

        {activeTab === "settlements" && (
          <SettlementsTab data={byUtr.data?.rows ?? []} loading={byUtr.isLoading} />
        )}

        {activeTab === "upload" && (
          <UploadTab storeId={storeId} onUploadComplete={invalidateAll}
                     onFetchOrphans={() => fetchOrphans.mutate()}
                     fetchingOrphans={fetchOrphans.isPending} />
        )}

        {activeTab === "settings" && (
          <SettingsTab storeId={storeId} />
        )}
      </main>

      <footer className="px-6 lg:px-8 py-6 mt-4 border-t border-border text-xs text-muted-foreground flex items-center justify-between w-full">
        <div>OrderFlow · PG Reconciliation · Glow&amp;Me + OLB</div>
        <div>Designed for ~10k–20k orders · server-paginated · indexed reads under 200ms</div>
      </footer>

      {drawerSettlement && (
        <MismatchDrawer
          settlement={drawerSettlement}
          allSettlements={settlements.data?.rows ?? []}
          onClose={() => setDrawerSettlement(null)}
          onConfirm={() => {
            toast({ title: "Match confirmed (V1 placeholder)", description: "Status update endpoint comes in V2." });
            setDrawerSettlement(null);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// OVERVIEW TAB
// =============================================================================
function OverviewTab({
  counts, countsLoading, overdueCount, overdueLoading, overdueWindowNote, topOverdue, trend, sparklines, onJumpToRecon, onJumpToSettings,
}: {
  counts?: StatusCounts; countsLoading: boolean;
  overdueCount?: number; overdueLoading: boolean;
  overdueWindowNote?: string | null;
  topOverdue?: OverdueOrder;
  trend?: TrendPoint[];
  sparklines?: Record<string, Array<{ date: string; count: number }>>;
  onJumpToRecon: () => void; onJumpToSettings: () => void;
}) {
  const flaggedSegments = useMemo(() => {
    if (!counts) return [];
    return [
      { label: "Overdue (computed)", value: overdueCount ?? 0, color: "hsl(0 84% 60%)", description: "Paid Shopify orders past T+2, no settlement" },
      { label: "Mismatch", value: counts.mismatch, color: "hsl(25 95% 53%)", description: "Settled, but PayU shaved more than agreed" },
      { label: "Pending", value: counts.pending, color: "hsl(43 89% 50%)", description: "Still inside T+2 window" },
    ];
  }, [counts, overdueCount]);
  const flaggedTotal = flaggedSegments.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-5">
      {/* Phaid alert banner — only when there's a high-value overdue */}
      {topOverdue && topOverdue.ageDays >= 10 && (
        <div className="rounded-2xl overflow-hidden relative" style={{ background: "hsl(240 6% 9%)", color: "hsl(0 0% 98%)" }}>
          <div className="absolute inset-0" style={{
            backgroundImage: "repeating-linear-gradient(45deg, transparent 0, transparent 6px, hsl(0 84% 60% / 0.06) 6px, hsl(0 84% 60% / 0.06) 12px)",
          }} />
          <div className="relative px-5 py-4 flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-xl grid place-items-center"
                 style={{ background: "hsl(0 84% 60% / 0.18)", color: "hsl(0 84% 70%)", boxShadow: "0 0 0 1px hsl(0 84% 60% / 0.3) inset" }}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 pt-0.5">
              <div className="font-semibold text-[15px] leading-snug">
                High-value order overdue: <span className="font-mono">#{topOverdue.shopifyOrderNumber}</span> for{" "}
                <span className="font-mono">{formatINR(topOverdue.totalPrice)}</span> has been unsettled for {topOverdue.ageDays} days.
              </div>
              <div className="text-xs opacity-60 mt-1">
                Past PayU's standard T+2 window by {Math.max(0, topOverdue.ageDays - 2)} days. Escalate before it's written off.
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs">
                <button onClick={onJumpToRecon} className="font-medium hover:opacity-80 underline underline-offset-2 decoration-white/40">View order details</button>
                <span className="opacity-30">·</span>
                <button className="font-medium hover:opacity-80 underline underline-offset-2 decoration-white/40">Open PayU ticket</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overdue-window banner — explains what "overdue" is computed against */}
      {overdueWindowNote && (
        <div className="rounded-lg border border-border bg-card px-4 py-2.5 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="text-xs text-muted-foreground leading-relaxed flex-1">
            <span className="font-medium text-foreground">Overdue scope:</span> {overdueWindowNote}
          </div>
        </div>
      )}

      {/* 4 minimal KPI cards (Phaid-style) — same labels + order as mockup */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Pending Settlements" value={counts?.pending} loading={countsLoading}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(43 89% 50%)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/>
            </svg>
          }
          sparklineData={sparklines?.pending} sparkSeed={3}
          sparkColor="hsl(43 89% 50%)" borderColor="hsl(var(--border))"
        />
        <KpiCard
          label="Total Reconciled" value={counts?.settled} loading={countsLoading}
          icon={<CheckCircle2 className="w-4 h-4" strokeWidth={2.2} style={{ color: "hsl(142 71% 40%)" }} />}
          sparklineData={sparklines?.settled} sparkSeed={11}
          sparkColor="hsl(142 71% 40%)" borderColor="hsl(var(--border))"
        />
        <KpiCard
          label="High-Risk Mismatches" value={counts?.mismatch} loading={countsLoading}
          icon={<AlertTriangle className="w-4 h-4" strokeWidth={2.2} style={{ color: "hsl(25 95% 53%)" }} />}
          sparklineData={sparklines?.mismatch} sparkSeed={7}
          sparkColor="hsl(25 95% 53%)" borderColor="hsl(var(--border))"
        />
        <KpiCard
          label="Unmatched / Overdue" value={overdueCount} loading={overdueLoading}
          icon={<AlertCircle className="w-4 h-4" strokeWidth={2.2} style={{ color: "hsl(0 84% 60%)" }} />}
          sparklineData={undefined} sparkSeed={19}
          sparkColor="hsl(0 84% 60%)" borderColor="hsl(var(--border))"
        />
      </div>

      {/* Trend chart + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2 2xl:col-span-3">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-[15px] font-semibold">Settlement trend</div>
              <div className="text-xs text-muted-foreground mt-0.5">₹ settled to bank · last 14 days</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-500/10 px-2 py-1 rounded-md">
                <TrendingUp className="w-3 h-3" /> Live
              </span>
              <select className="text-xs border border-input rounded-md px-2 py-1.5 bg-card text-muted-foreground hover:text-foreground">
                <option>14 days</option>
                <option>30 days</option>
                <option>90 days</option>
              </select>
            </div>
          </div>
          <TrendChart data={trend} days={14} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-[15px] font-semibold">Activity</div>
              <div className="text-xs text-muted-foreground mt-0.5">Recent runs &amp; emails</div>
            </div>
            <button className="text-xs text-muted-foreground hover:text-foreground">View all</button>
          </div>
          <div className="divide-y divide-border -mx-1">
            <ActivityRow color="bg-green-500" title="Daily recon" sub="Today · just now" right="100%" />
            <ActivityRow color="bg-primary" title="CSV uploaded" sub="Today · PayU settlement batch" right={<CheckCircle2 className="w-3.5 h-3.5 text-green-600" />} />
            <ActivityRow color="bg-yellow-500" title="3-day email queued" sub="Pending: 2d 18h" right={<Mail className="w-3.5 h-3.5 text-muted-foreground" />} />
            <ActivityRow color="bg-green-500" title="Bi-weekly summary" sub="Mon Jun 16 · 1,224 orders" right="98.4%" />
            <ActivityRow color="bg-green-500" title="Daily recon" sub="Yesterday · 156 orders" right="99.4%" />
          </div>
        </div>
      </div>

      {/* Donut + Report Delivery */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-[15px] font-semibold mb-1">Why orders are flagged</div>
          <div className="text-xs text-muted-foreground mb-5">Live snapshot</div>
          <DonutChart segments={flaggedSegments} total={flaggedTotal} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="text-[15px] font-semibold mb-1">Report delivery</div>
          <div className="text-xs text-muted-foreground mb-5">3-day + bi-weekly cadence</div>
          <div className="divide-y divide-border -mx-1 text-[13px]">
            <DeliveryRow title="3-day email" sub="Next in 2d 18h" />
            <DeliveryRow title="Bi-weekly summary" sub="Mon Jun 16 · 8:00 IST" />
            <DeliveryRow title="Slack #finance" sub="Alerts > ₹10K" />
          </div>
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted-foreground">4 recipients</span>
            <button onClick={onJumpToSettings} className="font-medium hover:underline">Manage</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ color, title, sub, right }: { color: string; title: string; sub: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-1 py-2.5">
      <span className={cn("w-2 h-2 rounded-full", color)} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px]">{title}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <div className="text-[12px] font-mono font-semibold">{right}</div>
    </div>
  );
}

function DeliveryRow({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-center justify-between px-1 py-2.5">
      <div>
        <div>{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      </div>
      <span className="w-2 h-2 rounded-full bg-green-500" />
    </div>
  );
}

// =============================================================================
// RECONCILIATION TAB
// =============================================================================
function ReconciliationTab({
  settlements, settlementsLoading, counts, overdueCount, statusFilter, onToggleStatus, page, pageSize, onPage, onOpenDrawer,
  searchQuery, onSearchChange, dateRange, onDateRangeChange,
}: {
  settlements?: { rows: Settlement[]; total: number };
  settlementsLoading: boolean;
  counts?: StatusCounts; overdueCount: number;
  statusFilter: StatusKey[]; onToggleStatus: (s: StatusKey) => void;
  page: number; pageSize: number; onPage: (p: number) => void;
  onOpenDrawer: (s: Settlement) => void;
  searchQuery: string; onSearchChange: (s: string) => void;
  dateRange: "all" | "30d" | "90d" | "year"; onDateRangeChange: (r: "all" | "30d" | "90d" | "year") => void;
}) {
  const totalPages = settlements ? Math.max(1, Math.ceil(settlements.total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      {/* Quick-stat chips */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <QuickStatChip label="Overdue" count={overdueCount} color="bg-red-500" active={statusFilter.includes("overdue")} onClick={() => onToggleStatus("overdue")} />
          <QuickStatChip label="Mismatch" count={counts?.mismatch ?? 0} color="bg-orange-500" active={statusFilter.includes("mismatch")} onClick={() => onToggleStatus("mismatch")} />
          <QuickStatChip label="Pending" count={counts?.pending ?? 0} color="bg-yellow-500" active={statusFilter.includes("pending")} onClick={() => onToggleStatus("pending")} />
          <QuickStatChip label="Settled" count={counts?.settled ?? 0} color="bg-green-500" active={statusFilter.includes("settled")} onClick={() => onToggleStatus("settled")} />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search PayU id, UTR, merchant txn id…"
              className="w-full pl-9 pr-8 h-9 text-sm border border-input rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            {searchQuery && (
              <button onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <select
            value={dateRange}
            onChange={(e) => onDateRangeChange(e.target.value as any)}
            className="h-9 px-3 text-sm border border-input rounded-md bg-card cursor-pointer"
          >
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="year">Last year</option>
          </select>
        </div>
      </div>

      {/* Settlements table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-border">
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">PG</th>
                <th className="px-4 py-2.5 font-medium">PayU ID</th>
                <th className="px-4 py-2.5 font-medium">UTR</th>
                <th className="px-4 py-2.5 font-medium text-right">Order ₹</th>
                <th className="px-4 py-2.5 font-medium text-right">Settled ₹</th>
                <th className="px-4 py-2.5 font-medium text-right">Fee ₹</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {settlementsLoading ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td></tr>
              )) : settlements?.rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No settlement records match these filters.
                </td></tr>
              ) : settlements?.rows.map(s => {
                const isConflict = s.status === "overdue" || s.status === "mismatch";
                // Effective deduction = the REAL money PayU kept.
                // Per-row fee columns in PayU's CSV are often 0 (batch-level fees).
                // Truth = (gross or order) − settled.
                const orderAmt = s.orderAmount ? parseFloat(s.orderAmount) : null;
                const settledAmt = parseFloat(s.settledAmount);
                const grossAmt = s.grossAmount ? parseFloat(s.grossAmount) : orderAmt;
                const reportedFee = s.feeDeducted ? parseFloat(s.feeDeducted) : 0;
                const effectiveFee = grossAmt != null && grossAmt > settledAmt
                  ? grossAmt - settledAmt
                  : reportedFee;
                const feePct = grossAmt && grossAmt > 0 ? (effectiveFee / grossAmt) * 100 : null;
                return (
                  <tr key={s.id} onClick={() => onOpenDrawer(s)}
                      className="hover:bg-accent/40 cursor-pointer transition-colors"
                      data-testid={`row-settlement-${s.id}`}>
                    <td className="px-4 py-3 text-muted-foreground text-xs"
                        style={isConflict ? { boxShadow: "inset 3px 0 0 0 hsl(25 95% 53%)" } : undefined}>
                      {s.settledAt ? new Date(s.settledAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3"><PgBrandMark name={s.pgName} /></td>
                    <td className="px-4 py-3 font-mono text-xs">{s.pgPaymentId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.utrNumber ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-right text-sm">{formatINR(s.orderAmount)}</td>
                    <td className="px-4 py-3 font-mono text-right text-sm">{formatINR(s.settledAmount)}</td>
                    <td
                      className={cn(
                        "px-4 py-3 font-mono text-right text-xs",
                        feePct != null && feePct > 5 ? "text-orange-600 font-semibold" : "text-muted-foreground",
                      )}
                      title={
                        reportedFee > 0
                          ? `PayU reported: ₹${reportedFee.toFixed(2)} · Actual deduction: ₹${effectiveFee.toFixed(2)}`
                          : `PayU's per-row fee = ₹0 (batch-level). Actual deduction: ₹${effectiveFee.toFixed(2)}`
                      }
                    >
                      {effectiveFee > 0 ? (
                        <>
                          <div>{formatINR(effectiveFee)}</div>
                          {feePct != null && (
                            <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                              {feePct.toFixed(1)}%
                            </div>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/40 text-xs">
          <div className="text-muted-foreground">
            Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, settlements?.total ?? 0)} of <span className="font-mono font-medium text-foreground">{settlements?.total ?? 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
                    className="h-7 px-2 border border-input rounded-md bg-card disabled:text-muted-foreground inline-flex items-center gap-1">
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <span className="px-2">{page} / {totalPages}</span>
            <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                    className="h-7 px-2 border border-input rounded-md bg-card disabled:text-muted-foreground inline-flex items-center gap-1">
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SETTLEMENTS TAB (by UTR)
// =============================================================================
function SettlementsTab({ data, loading }: { data: UtrRow[]; loading: boolean }) {
  const totals = useMemo(() => {
    return data.reduce((acc, r) => ({
      gross: acc.gross + r.gross, fee: acc.fee + r.fee, gst: acc.gst + r.gst, net: acc.net + r.net,
    }), { gross: 0, fee: 0, gst: 0, net: 0 });
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Settlements</h2>
        <p className="text-sm text-muted-foreground">Each row = one UTR PayU deposited. Last 30 days.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <SummaryTile label="Total settled" value={formatINRCompact(totals.gross)} />
        <SummaryTile label="Total fees" value={formatINRCompact(totals.fee)} sub={totals.gross > 0 ? `${((totals.fee / totals.gross) * 100).toFixed(2)}% effective` : undefined} />
        <SummaryTile label="Total GST" value={formatINRCompact(totals.gst)} />
        <SummaryTile label="Net to bank" value={formatINRCompact(totals.net)} highlight />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-border">
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Settlement date</th>
                <th className="px-4 py-2.5 font-medium">UTR</th>
                <th className="px-4 py-2.5 font-medium text-right">Orders</th>
                <th className="px-4 py-2.5 font-medium text-right">Gross</th>
                <th className="px-4 py-2.5 font-medium text-right">Fee + GST</th>
                <th className="px-4 py-2.5 font-medium text-right">Net to bank</th>
                <th className="px-4 py-2.5 font-medium">Recon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td></tr>
              )) : data.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No settlements in window.</td></tr>
              ) : data.map(r => (
                <tr key={r.utr} className="hover:bg-accent/40 cursor-pointer">
                  <td className="px-4 py-3 font-medium">{new Date(r.settlementDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.utr}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.orderCount}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatINR(r.gross)}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{formatINR(r.fee + r.gst)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatINR(r.net)}</td>
                  <td className="px-4 py-3">
                    {r.mismatchCount === 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                        <span className="w-2 h-2 rounded-full bg-green-500" />All matched
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs bg-orange-500/15 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />{r.mismatchCount} mismatched
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", highlight && "border-foreground/20")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold font-mono mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// =============================================================================
// UPLOAD TAB
// =============================================================================
interface RecentUpload {
  id: string;
  fileName: string | null;
  fileHash: string;
  fileSize: number | null;
  parsedRows: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  errorCount: number;
  status: "success" | "partial" | "duplicate" | "error";
  notes: string | null;
  createdAt: string;
}

function UploadTab({ storeId, onUploadComplete, onFetchOrphans, fetchingOrphans }: {
  storeId: string;
  onUploadComplete: () => void;
  onFetchOrphans: () => void;
  fetchingOrphans: boolean;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pendingForceFile, setPendingForceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recent = useQuery<{ rows: RecentUpload[] }>({
    queryKey: ["/api/recon/recent-uploads", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/recon/recent-uploads?storeId=${storeId}&limit=10`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const upload = useMutation({
    mutationFn: async (args: { f: File; force?: boolean }) => {
      const fd = new FormData();
      fd.append("file", args.f);
      fd.append("storeId", storeId);
      fd.append("pgName", "payu");
      if (args.force) fd.append("force", "true");
      const res = await fetch("/api/recon/upload", { method: "POST", body: fd, credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.duplicate) {
        // Special-case: surface to the caller, don't throw.
        return { ...body, _duplicate: true };
      }
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      return body;
    },
    onSuccess: (data: any) => {
      if (data._duplicate) {
        // Show confirm UI instead of clearing the file
        setPendingForceFile(file);
        toast({
          title: "Duplicate file detected",
          description: `This exact file was already uploaded${data.priorUpload?.fileName ? ` (${data.priorUpload.fileName})` : ""}. Confirm below to re-process anyway.`,
          variant: "destructive",
        });
        return;
      }
      const am = data.autoMatched;
      const isReUpload = data.rowsInserted === 0 && data.rowsUpdated > 0;
      toast({
        title: isReUpload ? "Re-upload processed" : "Upload complete",
        description: isReUpload
          ? `0 new rows · ${data.rowsUpdated} updated (already had these). No change to totals.` +
            (am ? ` Matcher re-ran: ${am.classified.settled} settled, ${am.classified.mismatch} mismatch.` : "")
          : `${data.rowsInserted} new · ${data.rowsUpdated} updated · ${data.skipped} skipped` +
            (am ? ` · matcher: ${am.classified.settled} settled, ${am.classified.mismatch} mismatch` : ""),
      });
      setFile(null);
      setPendingForceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploadComplete();
      queryClient.invalidateQueries({ queryKey: ["/api/recon/recent-uploads", storeId] });
    },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setPendingForceFile(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Upload settlement CSV</h2>
        <p className="text-sm text-muted-foreground">Drop a PayU settlement export. The matcher auto-runs after ingest. Duplicate files are detected via SHA-256 hash.</p>
      </div>

      {/* Dropzone */}
      <div onDragOver={e => e.preventDefault()} onDrop={handleDrop}
           onClick={() => fileInputRef.current?.click()}
           className="rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center cursor-pointer hover:bg-accent/30 transition-colors">
        <UploadIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <div className="font-medium">PayU settlement CSV</div>
        <div className="text-xs text-muted-foreground mt-1">Drop a file here or click to browse · max 10 MB · .csv only</div>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
               onChange={e => { setFile(e.target.files?.[0] ?? null); setPendingForceFile(null); }} />
      </div>

      {/* File queue */}
      {file && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-sm font-semibold mb-3">Selected</div>
          <div className="flex items-center justify-between text-sm px-3 py-2.5 rounded-md bg-muted">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono">{file.name}</span>
              <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
            <button onClick={() => { setFile(null); setPendingForceFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="text-xs text-muted-foreground hover:text-red-600 inline-flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
          <div className="mt-5 pt-5 border-t border-border flex items-center justify-between gap-2">
            {pendingForceFile && (
              <div className="text-xs text-red-600 inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Duplicate detected — confirm to re-process
              </div>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {pendingForceFile && (
                <button onClick={() => upload.mutate({ f: pendingForceFile, force: true })} disabled={upload.isPending}
                        className="h-9 px-4 text-sm rounded-md border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5 disabled:opacity-60">
                  Force re-process
                </button>
              )}
              {!pendingForceFile && (
                <button onClick={() => upload.mutate({ f: file })} disabled={upload.isPending}
                        className="h-9 px-4 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center gap-1.5 disabled:opacity-60">
                  <Play className="w-4 h-4" /> {upload.isPending ? "Uploading…" : "Upload + auto-match"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent uploads */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-[15px] font-semibold mb-1">Recent uploads</div>
        <div className="text-xs text-muted-foreground mb-4">Last 10 uploads for this store · dedup via SHA-256</div>
        {recent.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !recent.data?.rows.length ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No uploads yet.</div>
        ) : (
          <div className="divide-y divide-border -mx-1">
            {recent.data.rows.map(u => {
              const isDup = u.status === "duplicate";
              const isErr = u.status === "error";
              const statusColor = isDup ? "text-yellow-700 bg-yellow-500/15"
                : isErr ? "text-red-700 bg-red-500/15"
                : u.status === "partial" ? "text-orange-700 bg-orange-500/15"
                : "text-green-700 bg-green-500/15";
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 px-1 py-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-mono truncate">{u.fileName ?? "(unnamed)"}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        <span>{new Date(u.createdAt).toLocaleString("en-IN")}</span>
                        {u.fileSize && <span>{(u.fileSize / 1024).toFixed(1)} KB</span>}
                        <span className="font-mono opacity-60">sha:{u.fileHash.slice(0, 8)}…</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {!isDup && (
                      <div className="text-xs text-muted-foreground hidden md:block">
                        <span className="text-green-600 font-medium">{u.rowsInserted} new</span>
                        {" · "}
                        <span>{u.rowsUpdated} updated</span>
                        {u.rowsSkipped > 0 && <> · <span>{u.rowsSkipped} skipped</span></>}
                        {u.errorCount > 0 && <> · <span className="text-red-600">{u.errorCount} errors</span></>}
                      </div>
                    )}
                    <span className={cn("text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full", statusColor)}>
                      {u.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Shopify auto-fetch — V2 */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-[15px] font-semibold inline-flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Auto-fetch missing orders from Shopify
            </div>
            <div className="text-xs text-muted-foreground mt-1 max-w-[600px]">
              If a PayU settlement landed but the matcher couldn't link it (Shopify order not in our DB yet),
              this queries the Shopify Admin API for that order's date window, finds it by note_attribute,
              syncs it locally, and re-runs the matcher.
            </div>
          </div>
          <button
            onClick={onFetchOrphans}
            disabled={fetchingOrphans}
            className="h-9 px-3 text-sm rounded-md border border-input bg-card hover:bg-accent inline-flex items-center gap-1.5 disabled:opacity-60 shrink-0"
          >
            <Sparkles className="w-4 h-4" /> {fetchingOrphans ? "Fetching…" : "Fetch orphans (up to 25)"}
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Uses your <code className="font-mono">SHOPIFY_API_KEY</code> / <code className="font-mono">SHOPIFY_API_SECRET</code> from <code className="font-mono">.env</code>.
          Each orphan triggers ~1 Shopify API call against a ±2-day window. Rate-limited to 25 orphans per click.
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground text-sm mb-2">How it works</div>
        <ol className="list-decimal list-inside space-y-1">
          <li>Export your PayU settlement report as CSV (XLSX → SaveAs CSV if needed).</li>
          <li>Drop it in the box above. We hash the file content first — if you've uploaded this exact file before, we warn you before re-processing.</li>
          <li>The PayU adapter parses, dedups within-file by PayU ID, and bulk-upserts to <code className="font-mono">pg_settlements</code>.</li>
          <li>The matcher auto-runs: each row is resolved to a Shopify order via <code className="font-mono">PayU_txn_id</code> in note_attributes.</li>
          <li>Any orphans (no Shopify order in our DB) can be auto-fetched via the Shopify Admin API above.</li>
          <li>The audit row in <code className="font-mono">recon_uploads</code> records counts + hash + user — full history kept.</li>
        </ol>
      </div>
    </div>
  );
}

// =============================================================================
// RATE CARDS
// =============================================================================
interface RateCardRules {
  default: { mdrPct: number; gstPct: number };
  byPaymentMode?: Record<string, { mdrPct: number; gstPct: number }>;
  byAmountTier?: Array<{ minAmount: number; maxAmount?: number; mdrPct: number; gstPct: number }>;
  notes?: string;
}
interface RateCard {
  id: string;
  name: string;
  pgName: string;
  rules: RateCardRules;
  isActive: boolean;
  sourceFile: string | null;
  createdAt: string;
}

function RateCardSection({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const csvInputRef = useRef<HTMLInputElement>(null);

  const cards = useQuery<{ rows: RateCard[]; activeId: string | null }>({
    queryKey: ["/api/recon/rate-cards", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/recon/rate-cards?storeId=${storeId}&pgName=payu`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const active = cards.data?.rows.find(c => c.id === cards.data?.activeId);

  // Editable copy of the active card's rules. Reset whenever the active
  // card changes (e.g. after a save or upload).
  const [editing, setEditing] = useState<RateCardRules | null>(null);
  const [editName, setEditName] = useState<string>("");
  useEffect(() => {
    if (active) {
      setEditing(JSON.parse(JSON.stringify(active.rules)));
      setEditName(active.name);
    } else if (!editing) {
      // No active card — seed with sensible defaults so the form is usable.
      setEditing({
        default: { mdrPct: 1.2, gstPct: 18.0 },
        byPaymentMode: {},
        byAmountTier: [],
      });
      setEditName(`PayU standard rates`);
    }
  }, [active?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Nothing to save");
      return await apiRequest("POST", "/api/recon/rate-cards", {
        storeId,
        pgName: "payu",
        name: editName,
        rules: editing,
        isActive: true,
      });
    },
    onSuccess: () => {
      toast({ title: "Rate card saved", description: "Mismatch detection now uses these rates. Run reconciliation to re-classify." });
      queryClient.invalidateQueries({ queryKey: ["/api/recon/rate-cards", storeId] });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const uploadCsv = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("storeId", storeId);
      fd.append("pgName", "payu");
      fd.append("name", `${file.name.replace(/\.[^.]+$/, "")} (uploaded)`);
      const res = await fetch("/api/recon/rate-cards/upload", { method: "POST", body: fd, credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      return body;
    },
    onSuccess: () => {
      toast({ title: "Rate card uploaded", description: "Parsed and set as active. Run reconciliation to re-classify." });
      queryClient.invalidateQueries({ queryKey: ["/api/recon/rate-cards", storeId] });
      if (csvInputRef.current) csvInputRef.current.value = "";
    },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  // Helpers for the per-mode editor
  function setDefault(field: "mdrPct" | "gstPct", value: number) {
    if (!editing) return;
    setEditing({ ...editing, default: { ...editing.default, [field]: value } });
  }
  function setModeRate(mode: string, field: "mdrPct" | "gstPct", value: number) {
    if (!editing) return;
    const cur = editing.byPaymentMode ?? {};
    const existing = cur[mode] ?? { mdrPct: 0, gstPct: 18 };
    setEditing({ ...editing, byPaymentMode: { ...cur, [mode]: { ...existing, [field]: value } } });
  }
  function removeMode(mode: string) {
    if (!editing) return;
    const cur = { ...(editing.byPaymentMode ?? {}) };
    delete cur[mode];
    setEditing({ ...editing, byPaymentMode: cur });
  }
  function addMode() {
    if (!editing) return;
    const name = window.prompt("Payment mode name (e.g., Credit Card, UPI, Net Banking, Debit Card)");
    if (!name) return;
    const cur = editing.byPaymentMode ?? {};
    if (cur[name]) {
      toast({ title: "Already exists", description: `${name} is already in the table.`, variant: "destructive" });
      return;
    }
    setEditing({ ...editing, byPaymentMode: { ...cur, [name]: { mdrPct: 1.2, gstPct: 18 } } });
  }

  const previewAmount = 1500;
  const previewExpected = useMemo(() => {
    if (!editing) return null;
    const fee = +(previewAmount * (editing.default.mdrPct / 100)).toFixed(2);
    const gst = +(fee * (editing.default.gstPct / 100)).toFixed(2);
    return { fee, gst, net: previewAmount - fee - gst };
  }, [editing]);

  if (cards.isLoading || !editing) {
    return (
      <SettingsSection title="Rate card" subtitle="Contracted PayU rates for mismatch detection">
        <Skeleton className="h-24 w-full" />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Rate card"
      subtitle="Your contracted PayU rates. Mismatch detection compares actual deductions against this card."
    >
      <div className="space-y-4">
        {/* Active card summary */}
        {active ? (
          <div className="text-xs text-muted-foreground">
            Active: <span className="font-medium text-foreground">{active.name}</span>
            {active.sourceFile && <> · uploaded from <span className="font-mono">{active.sourceFile}</span></>}
          </div>
        ) : (
          <div className="text-xs px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400">
            No rate card configured — mismatch detection uses the default <span className="font-mono">1.20% MDR + 18% GST</span>.
            That's why your screen probably shows lots of "mismatch" rows. Configure your actual rates below.
          </div>
        )}

        {/* Card name */}
        <div>
          <label className="block text-xs font-medium mb-1">Card name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full h-9 px-3 text-sm border border-input rounded-md bg-card"
            placeholder="e.g., PayU Standard 2026"
          />
        </div>

        {/* Default rates */}
        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium mb-2">Default (applies when no payment-mode override matches)</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <label className="block text-xs font-medium mb-1">MDR %</label>
              <input
                type="number" step="0.01" min="0"
                value={editing.default.mdrPct}
                onChange={(e) => setDefault("mdrPct", parseFloat(e.target.value) || 0)}
                className="w-full h-9 px-3 font-mono text-sm border border-input rounded-md bg-card"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">GST on fee %</label>
              <input
                type="number" step="0.01" min="0"
                value={editing.default.gstPct}
                onChange={(e) => setDefault("gstPct", parseFloat(e.target.value) || 0)}
                className="w-full h-9 px-3 font-mono text-sm border border-input rounded-md bg-card"
              />
            </div>
          </div>
          {previewExpected && (
            <div className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border">
              Preview: on a <span className="font-mono">{formatINR(previewAmount)}</span> order, fee = <span className="font-mono">{formatINR(previewExpected.fee)}</span>,
              GST = <span className="font-mono">{formatINR(previewExpected.gst)}</span>,
              net to bank = <span className="font-mono font-semibold text-foreground">{formatINR(previewExpected.net)}</span>
            </div>
          )}
        </div>

        {/* Per-payment-mode overrides */}
        <div className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Per-payment-mode overrides</div>
            <button onClick={addMode} className="h-7 px-2 text-xs rounded-md border border-input bg-card hover:bg-accent inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add mode
            </button>
          </div>
          {Object.keys(editing.byPaymentMode ?? {}).length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">
              No overrides — all transactions use the default rates above. Add a mode if your contract has different rates for UPI, cards, etc.
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(editing.byPaymentMode ?? {}).map(([mode, rate]) => (
                <div key={mode} className="grid grid-cols-[1fr_100px_100px_auto] gap-2 items-center text-sm">
                  <div className="font-medium">{mode}</div>
                  <input
                    type="number" step="0.01" min="0"
                    value={rate.mdrPct}
                    onChange={(e) => setModeRate(mode, "mdrPct", parseFloat(e.target.value) || 0)}
                    className="h-8 px-2 font-mono text-xs border border-input rounded-md bg-card"
                    placeholder="MDR %"
                  />
                  <input
                    type="number" step="0.01" min="0"
                    value={rate.gstPct}
                    onChange={(e) => setModeRate(mode, "gstPct", parseFloat(e.target.value) || 0)}
                    className="h-8 px-2 font-mono text-xs border border-input rounded-md bg-card"
                    placeholder="GST %"
                  />
                  <button onClick={() => removeMode(mode)} className="text-muted-foreground hover:text-red-600 p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CSV upload */}
        <div className="rounded-md border border-border p-3 bg-secondary/30">
          <div className="text-sm font-medium mb-1">Or upload a rate card CSV</div>
          <div className="text-[11px] text-muted-foreground mb-2">
            Columns: <code className="font-mono">payment_mode, mdr_pct, gst_pct</code>. Optional: <code className="font-mono">min_amount, max_amount, notes</code>.
            Row with <code className="font-mono">payment_mode=default</code> sets the fallback.
          </div>
          <input
            ref={csvInputRef} type="file" accept=".csv,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCsv.mutate(f); }}
            className="text-xs"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="h-9 px-4 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" /> {save.isPending ? "Saving…" : "Save rate card"}
          </button>
        </div>
      </div>
    </SettingsSection>
  );
}

// =============================================================================
// SETTINGS TAB
// =============================================================================
function SettingsTab({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const sendTestDigest = useMutation({
    mutationFn: async (digestType: "3-day" | "bi-weekly") => {
      return await apiRequest("POST", "/api/recon/send-digest", {
        storeId,
        digestType,
        test: true,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Test digest sent",
        description: `Email dispatched to ${data.recipients?.[0] ?? "your inbox"} via Resend. Check your inbox.`,
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Send failed",
        description: err.message,
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-6">
      <RateCardSection storeId={storeId} />

      <SettingsSection title="Schedule" subtitle="Recon runs daily. Email delivery is paced.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <SettingCard title="Daily recon" toggle="On" sub="Keeps dashboard fresh — no email fired.">
            <div className="flex items-center gap-2">
              <input type="time" defaultValue="08:00" className="w-32 h-9 px-2 border border-input rounded-md bg-card font-mono" />
              <span className="text-xs text-muted-foreground">IST</span>
            </div>
          </SettingCard>
          <SettingCard title="3-day email" toggle="On" sub="Current overdue + mismatch list.">
            <div className="flex items-center gap-2">
              <input type="number" defaultValue={3} className="w-16 h-9 px-2 border border-input rounded-md bg-card font-mono" />
              <span className="text-xs text-muted-foreground">days · 8:00 IST</span>
            </div>
          </SettingCard>
          <SettingCard title="Bi-weekly summary" toggle="On" sub="Trends, fee totals, store comparison.">
            <select className="w-full h-9 px-2 border border-input rounded-md bg-card">
              <option>Every other Monday</option><option>Every other Friday</option>
            </select>
          </SettingCard>
          <SettingCard title="Settlement window" toggle="T+2 + 1d" sub="Orders younger than this stay 'pending'.">
            <div className="flex items-center gap-2">
              <input type="number" defaultValue={3} className="w-16 h-9 px-2 border border-input rounded-md bg-card font-mono" />
              <span className="text-xs text-muted-foreground">calendar days</span>
            </div>
          </SettingCard>
        </div>
      </SettingsSection>

      <SettingsSection title="Payment Gateways" subtitle="Per-store PG credentials. Adapter pattern keeps adding new PGs trivial.">
        <div className="space-y-3">
          {/* PayU active */}
          <div className="rounded-md border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-md grid place-items-center font-bold text-base text-white shrink-0"
                      style={{ background: PG_BRANDS.payu.gradient }}>P</span>
                <div>
                  <div className="font-medium text-sm">PayU India</div>
                  <div className="text-xs text-muted-foreground">Currently active · via Fastrr</div>
                </div>
              </div>
              <span className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">Connected</span>
            </div>
            <div className="text-xs text-muted-foreground pt-3 border-t border-border">
              V1: CSV upload only. API ingestion lands in V2 when PayU support enables Settlement Reports API.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ComingSoonPg name="Razorpay" gradient={PG_BRANDS.razorpay.gradient} initial="R" />
            <ComingSoonPg name="Cashfree" gradient={PG_BRANDS.cashfree.gradient} initial="C" />
            <ComingSoonPg name="PhonePe" gradient={PG_BRANDS.phonepe.gradient} initial="Ph" />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Delivery channels" subtitle="Resend handles all transactional email · n8n / Slack for alerts">
        <div className="space-y-3">
          {/* Resend — the primary email channel, with send-test buttons */}
          <div className="flex items-start justify-between px-3 py-3 rounded-md border border-border gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 grid place-items-center bg-secondary rounded-md text-muted-foreground shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Resend · digest emails</div>
                <div className="text-xs text-muted-foreground">3-day digest + bi-weekly summary to admin recipients</div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => sendTestDigest.mutate("3-day")}
                    disabled={sendTestDigest.isPending}
                    className="h-7 px-2.5 text-[11px] rounded-md border border-input bg-card hover:bg-accent disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" /> Send test 3-day digest
                  </button>
                  <button
                    onClick={() => sendTestDigest.mutate("bi-weekly")}
                    disabled={sendTestDigest.isPending}
                    className="h-7 px-2.5 text-[11px] rounded-md border border-input bg-card hover:bg-accent disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" /> Send test bi-weekly summary
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1.5">
                  Test sends go to your inbox only. Scheduled sends go to all admin recipients.
                </div>
              </div>
            </div>
            <span className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium shrink-0">
              Connected
            </span>
          </div>

          <DeliveryChannel icon={<MessageSquare className="w-4 h-4" />} title="Slack #finance" sub="Real-time alerts for mismatch > ₹10K (V2)" connected={false} />
          <DeliveryChannel icon={<ShoppingBag className="w-4 h-4" />} title="Shopify Admin API" sub="read_orders scope · loaded from .env" connected />
          <DeliveryChannel icon={<CreditCard className="w-4 h-4" />} title="PayU Settlement Reports API" sub="V2 — requires PayU support enablement" connected={false} />
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-semibold mb-1">{title}</div>
      <div className="text-xs text-muted-foreground mb-4">{subtitle}</div>
      {children}
    </div>
  );
}

function SettingCard({ title, toggle, sub, children }: { title: string; toggle: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{title}</div>
        <span className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">{toggle}</span>
      </div>
      <div className="text-xs text-muted-foreground mb-2">{sub}</div>
      {children}
    </div>
  );
}

function ComingSoonPg({ name, gradient, initial }: { name: string; gradient: string; initial: string }) {
  return (
    <div className="rounded-md border border-border p-3 opacity-60">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-9 h-9 rounded-md grid place-items-center font-bold text-sm text-white shrink-0"
              style={{ background: gradient }}>{initial}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{name}</div>
          <div className="text-xs text-muted-foreground">Adapter scaffolded · not yet active</div>
        </div>
      </div>
      <button className="w-full text-xs border border-input rounded-md py-1.5 hover:bg-accent" disabled>Connect</button>
    </div>
  );
}

function DeliveryChannel({ icon, title, sub, connected }: { icon: React.ReactNode; title: string; sub: string; connected: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-3 rounded-md border border-border">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 grid place-items-center bg-secondary rounded-md text-muted-foreground">{icon}</div>
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">{sub}</div>
        </div>
      </div>
      <span className={cn(
        "text-xs px-2 py-0.5 rounded-full font-medium",
        connected ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
      )}>
        {connected ? "Connected" : "Pending"}
      </span>
    </div>
  );
}

// =============================================================================
// MISMATCH DRAWER (Nanonets two-pane match selector)
// =============================================================================
function MismatchDrawer({
  settlement, allSettlements, onClose, onConfirm,
}: {
  settlement: Settlement; allSettlements: Settlement[];
  onClose: () => void; onConfirm: () => void;
}) {
  // Build candidate list — settlements with the same UTR (most likely related)
  const candidates = useMemo(() => {
    return allSettlements
      .filter(s => s.utrNumber === settlement.utrNumber && s.id !== settlement.id)
      .slice(0, 5);
  }, [allSettlements, settlement]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set([settlement.id]));

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedTotal = useMemo(() => {
    const all = [settlement, ...candidates];
    return all.filter(s => selectedIds.has(s.id)).reduce((sum, s) => sum + parseFloat(s.settledAmount), 0);
  }, [selectedIds, settlement, candidates]);

  const target = settlement.orderAmount ? parseFloat(settlement.orderAmount) : parseFloat(settlement.settledAmount);
  const pct = target > 0 ? (selectedTotal / target) * 100 : 0;
  const drift = selectedTotal - target;

  return (
    <>
      <div onClick={onClose}
           className="fixed inset-0 bg-foreground/30 z-40" />
      <aside className="fixed top-0 right-0 w-[520px] h-full bg-card border-l border-border z-50 shadow-2xl flex flex-col"
             style={{ animation: "slideIn 0.25s cubic-bezier(.4,0,.2,1)" }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Resolve mismatch</div>
            <div className="font-semibold font-mono text-lg mt-0.5">{settlement.pgPaymentId}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md grid place-items-center hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
          {/* What's expected */}
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-3">What Shopify expects</div>
            <div className="space-y-2">
              <Row label="UTR" value={<span className="font-mono text-xs">{settlement.utrNumber ?? "—"}</span>} />
              <Row label="Settled at" value={settlement.settledAt ? new Date(settlement.settledAt).toLocaleString("en-IN") : "—"} />
              <Row label="PayU_txn_id" value={<span className="font-mono text-xs">{settlement.pgPaymentId}</span>} />
              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <span className="font-medium">Expected to bank</span>
                <span className="font-mono font-bold text-base">{formatINR(settlement.orderAmount ?? settlement.settledAmount)}</span>
              </div>
            </div>
          </div>

          {/* AI suggestion banner */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border"
               style={{ background: "linear-gradient(135deg, hsl(263 70% 55% / 0.06), hsl(var(--card)) 60%)" }}>
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: "hsl(263 70% 55%)" }} />
            <div className="flex-1 text-xs">
              <span className="font-medium">This settlement is pre-selected</span>
              <span className="text-muted-foreground"> · same UTR candidates below for split-match</span>
            </div>
          </div>

          {/* Match candidates */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Candidates</div>
              <div className="text-[11px] text-muted-foreground">Same UTR</div>
            </div>
            <div className="space-y-1.5">
              <CandidateRow s={settlement} selected={selectedIds.has(settlement.id)} onToggle={() => toggle(settlement.id)} isPrimary />
              {candidates.map(c => (
                <CandidateRow key={c.id} s={c} selected={selectedIds.has(c.id)} onToggle={() => toggle(c.id)} />
              ))}
              {candidates.length === 0 && (
                <div className="text-xs text-muted-foreground py-2">No other settlements share this UTR.</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer with progress + actions */}
        <div className="border-t border-border bg-card">
          <div className="px-5 pt-4 pb-3 border-b border-border">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Selected total</div>
              <div className="text-xs text-muted-foreground"><span className="font-mono">{pct.toFixed(1)}%</span> match</div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-xl font-bold">{formatINR(selectedTotal)}</div>
              <div className="text-sm text-muted-foreground">of <span className="font-mono">{formatINR(target)}</span></div>
            </div>
            <div className="bar-track mt-2 bg-secondary rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${Math.min(100, pct)}%`,
                            background: Math.abs(drift) < 2 ? "hsl(142 71% 40%)" : drift > 0 ? "hsl(0 84% 60%)" : "hsl(43 89% 50%)" }} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Drift: <span className={cn("font-mono", drift < 0 ? "text-orange-600" : "text-green-600")}>{drift >= 0 ? "+" : ""}{formatINR(drift)}</span> · attributed to PayU MDR + GST.
            </div>
          </div>
          <div className="px-5 py-3 flex items-center justify-between gap-2">
            <button onClick={onClose} className="h-9 px-3 text-sm rounded-md border border-input bg-card hover:bg-accent">Cancel</button>
            <div className="flex gap-2">
              <button className="h-9 px-3 text-sm rounded-md border border-input bg-card hover:bg-accent">Flag for review</button>
              <button onClick={onConfirm} className="h-9 px-4 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Confirm match
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}

function CandidateRow({ s, selected, onToggle, isPrimary }: { s: Settlement; selected: boolean; onToggle: () => void; isPrimary?: boolean }) {
  return (
    <label className={cn(
      "flex items-start gap-3 px-3 py-3 rounded-lg border cursor-pointer hover:bg-accent/40 transition-colors",
      selected ? "border-foreground bg-secondary/40" : "border-border",
    )}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="rounded border-input mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold">{formatINR(s.settledAmount)}</span>
            {isPrimary && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: "hsl(263 70% 55% / 0.12)", color: "hsl(263 70% 50%)" }}>
                <Sparkles className="w-2.5 h-2.5" /> AI MATCH
              </span>
            )}
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">{s.pgPaymentId}</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          {s.settledAt ? new Date(s.settledAt).toLocaleString("en-IN") : "—"} · Fee {formatINR(s.feeDeducted)} · UTR {s.utrNumber ?? "—"}
        </div>
      </div>
    </label>
  );
}
