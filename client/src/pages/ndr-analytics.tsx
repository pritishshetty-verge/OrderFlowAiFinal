import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActiveStore } from "@/hooks/use-store";
import { PageLayout } from "@/components/page-layout";
import { DateRangeSelector, type DateRangeOutput } from "@/components/date-range-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartTooltip } from "@/components/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { subDays, startOfDay, endOfDay, format, parseISO } from "date-fns";
import {
  AlertTriangle, PackageCheck, PackageX, IndianRupee, Clock,
  MapPin, Repeat, ShieldCheck, ArrowUpRight, ArrowDownRight, Inbox, TrendingUp,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────
interface GeoRow { key: string; ordersShipped: number; ndrs: number; ndrRatePct: number | null; }
interface ReasonRow { key: string; count: number; sharePct: number | null; }
interface RevenueBand { atRisk: number; saved: number; lost: number; }
interface AgingBucket { bucket: string; count: number; valueAtRisk: number; }
interface TrendPoint { date: string; ndrs: number; delivered: number; rto: number; }
interface NdrAnalytics {
  window: { start: string; end: string };
  kpis: {
    ordersShipped: number; shippedThatNdrd: number; ndrOrders: number; totalEvents: number;
    avgAttemptsPerOrder: number | null;
    deliveredOrders: number; returnedOrders: number; cancelledOrders: number; openOrders: number;
    totalNdrRatePct: number | null; ndrToDeliveryPct: number | null; ndrToRtoPct: number | null;
  };
  revenue: { cod: RevenueBand; prepaid: RevenueBand; total: RevenueBand };
  reshipments: { created: number; delivered: number; pending: number; cancelled: number };
  geography: { byCity: GeoRow[]; byPincode: GeoRow[] };
  reasons: { byCategory: ReasonRow[]; byNslCode: ReasonRow[] };
  resolutionTime: { overallHours: number | null; deliveredHours: number | null; returnedHours: number | null; resolvedCount: number };
  actionable: { actionable: number; nonActionable: number; actionablePct: number | null; actionableRescued: number; actionableRescuePct: number | null };
  openAging: AgingBucket[];
  trend: TrendPoint[];
  prev: { totalNdrRatePct: number | null; ndrToDeliveryPct: number | null; ndrToRtoPct: number | null; atRisk: number };
  paymentSplit: { cod: PaymentSplitRow; prepaid: PaymentSplitRow };
  reattempt: { withReattempt: number; reattemptDelivered: number; effectivenessPct: number | null; ndrOrders: number };
  openList: OpenNdrRow[];
}
interface PaymentSplitRow { shipped: number; ndrd: number; ratePct: number | null; }
interface OpenNdrRow {
  orderNumber: string | null; awb: string | null; customerName: string | null; customerPhone: string | null;
  city: string | null; reason: string | null; nslCode: string | null; isActionable: boolean;
  paymentType: string; value: number; attempts: number; daysOpen: number;
}

// ── formatters ──────────────────────────────────────────────────────
const inr = (n: number) => {
  if (n >= 1e7) return "₹" + (n / 1e7).toFixed(2) + "Cr";
  if (n >= 1e5) return "₹" + (n / 1e5).toFixed(2) + "L";
  if (n >= 1e3) return "₹" + (n / 1e3).toFixed(1) + "k";
  return "₹" + Math.round(n).toLocaleString("en-IN");
};
const inrFull = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const pctStr = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);
const hrStr = (v: number | null | undefined) =>
  v == null ? "—" : v < 48 ? `${Math.round(v)}h` : `${Math.round((v / 24) * 10) / 10}d`;
const num = (n: number) => n.toLocaleString("en-IN");

const REASON_LABELS: Record<string, string> = {
  customer_unavailable: "Customer unavailable", address_issue: "Address issue",
  refused: "Customer refused", rto: "RTO", other: "Other", unknown: "Unknown",
  "EOD-74": "Customer unavailable", "EOD-15": "Address issue", "EOD-11": "Refused",
  "EOD-104": "Reschedule requested", "EOD-43": "Not reachable", "EOD-86": "Incomplete address",
  "EOD-69": "COD not ready", "EOD-6": "Out of area",
};
const reasonLabel = (k: string) => REASON_LABELS[k] ?? k;

// Monochrome — everything is the app's single primary colour, with
// opacity steps to tell stacked segments / series apart. No red/green/
// amber. Secondary values use the muted-foreground grey.
const C_MAIN = "hsl(var(--primary))";
const C_M2 = "hsl(var(--primary) / 0.6)";
const C_M3 = "hsl(var(--primary) / 0.38)";
const C_M4 = "hsl(var(--primary) / 0.22)";
// All semantic aliases collapse to the primary ramp.
const C_GOOD = C_MAIN;
const C_BAD = C_MAIN;
const C_WARN = C_M2;
const C_BLUE = C_MAIN;
const C_PURPLE = C_M3;
const C_RED = C_MAIN;
const C_RED_DK = C_MAIN;
const C_RED_SOFT = C_M2;
const C_INK = C_MAIN;
const C_GREY = "hsl(var(--muted-foreground))";
const C_GREY_LT = "hsl(var(--muted-foreground) / 0.35)";
const REASON_COLORS = [C_MAIN, C_M2, C_M3, C_M4, C_M4, C_M4, C_M4];

// ── trend chip (vs previous period) ─────────────────────────────────
// `goodWhenDown`: for NDR rate / RTO / at-risk, a decrease is good.
function TrendChip({ cur, prev, goodWhenDown = false }: { cur: number | null; prev: number | null; goodWhenDown?: boolean }) {
  if (cur == null || prev == null || prev === 0) return null;
  const delta = cur - prev;
  if (Math.abs(delta) < 0.05) return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">flat</span>
  );
  const up = delta > 0;
  const good = goodWhenDown ? !up : up;
  // Only negatives get colour (destructive). Good movement stays neutral.
  const cls = good ? "bg-muted text-muted-foreground" : "bg-muted text-foreground";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const pctChange = Math.abs((delta / prev) * 100);
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      <Icon className="h-2.5 w-2.5" />{pctChange.toFixed(1)}%
    </span>
  );
}

// ── sparkline ───────────────────────────────────────────────────────
function Spark({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
  if (!data?.length) return <div className="h-9" />;
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`sp-${dataKey}-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#sp-${dataKey}-${color})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── rate KPI: big % + trend chip + gauge bar ────────────────────────
function RateKpi({
  label, value, prev, color, icon: Icon, goodWhenDown, foot,
}: { label: string; value: number | null; prev: number | null; color: string; icon: any; goodWhenDown?: boolean; foot: string }) {
  const v = value ?? 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Icon className="h-4 w-4" /> {label}
          </div>
          <TrendChip cur={value} prev={prev} goodWhenDown={goodWhenDown} />
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight" style={{ color }}>{value == null ? "—" : `${v}%`}</div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-muted-foreground/50" style={{ width: `${Math.min(v, 100)}%` }} />
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">{foot}</div>
      </CardContent>
    </Card>
  );
}

function SegBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="h-full" />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{num(s.value)}</span>
            <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function StatTile({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
          <Icon className="h-4 w-4" /> {label}
        </div>
        <div className="text-xl font-bold" style={{ color: color ?? "hsl(var(--foreground))" }}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Panel({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {right}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-4 w-4" />
      </span>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

const tooltipStyle = { borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", fontSize: 12 } as const;


export default function NdrAnalyticsPage() {
  const { activeStoreId } = useActiveStore();
  const [dateRange, setDateRange] = useState<DateRangeOutput>(() => ({
    startDate: startOfDay(subDays(new Date(), 29)),
    endDate: endOfDay(new Date()),
  }));

  const { data, isLoading } = useQuery<NdrAnalytics>({
    queryKey: ["/api/ndr/analytics", activeStoreId, dateRange.startDate?.toISOString() || "d", dateRange.endDate?.toISOString() || "d"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("start", dateRange.startDate.toISOString());
      if (dateRange.endDate) params.append("end", dateRange.endDate.toISOString());
      const store = activeStoreId ?? (typeof window !== "undefined" ? localStorage.getItem("activeStoreId") : null);
      if (store) params.append("storeId", store);
      const uid = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
      if (uid) params.append("currentUserId", uid);
      const res = await apiRequest("GET", `/api/ndr/analytics?${params.toString()}`);
      return res.json();
    },
  });

  const k = data?.kpis;
  const rev = data?.revenue;
  const trend = (data?.trend ?? []).map((t) => ({ ...t, label: (() => { try { return format(parseISO(t.date), "d MMM"); } catch { return t.date; } })() }));

  const reasonBars = (data?.reasons.byCategory ?? []).map((r, i) => ({
    name: reasonLabel(r.key), count: r.count, fill: REASON_COLORS[i % REASON_COLORS.length],
  }));
  // Darker = older (the problem end).
  const agingBars = (data?.openAging ?? []).map((a) => ({
    ...a, fill: a.bucket === "14d+" ? C_MAIN : a.bucket === "7-14d" ? C_M2 : a.bucket === "3-7d" ? C_M3 : C_M4,
  }));

  return (
    <PageLayout
      title="NDR Analytics"
      description="Non-delivery performance, revenue exposure, reasons and geography"
      actions={<DateRangeSelector dateRange={dateRange} onDateChange={setDateRange} />}
    >
      {isLoading || !data ? (
        <div className="mx-auto max-w-[1400px] space-y-4">
          <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
          <Skeleton className="h-72 rounded-2xl" />
          <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        </div>
      ) : (
        <div className="mx-auto max-w-[1400px] space-y-4">
          {/* ── Row 1: rate KPIs with trend chips + gauge bars ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RateKpi label="Total NDR Rate" value={k!.totalNdrRatePct} prev={data.prev.totalNdrRatePct} color={C_RED} icon={AlertTriangle} goodWhenDown
              foot={`${num(k!.shippedThatNdrd)} of ${num(k!.ordersShipped)} shipped hit NDR`} />
            <RateKpi label="NDR → Delivery" value={k!.ndrToDeliveryPct} prev={data.prev.ndrToDeliveryPct} color={C_GOOD} icon={PackageCheck}
              foot={`${num(k!.deliveredOrders)} of ${num(k!.ndrOrders)} NDRs rescued`} />
            <RateKpi label="NDR → RTO" value={k!.ndrToRtoPct} prev={data.prev.ndrToRtoPct} color={C_RED} icon={PackageX} goodWhenDown
              foot={`${num(k!.returnedOrders)} of ${num(k!.ndrOrders)} returned`} />
            {/* Open NDRs — neutral count; the aging panel flags what's stale */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Clock className="h-4 w-4" /> Open NDR Orders
                </div>
                <div className="mt-2 text-2xl font-bold text-foreground">{num(k!.openOrders)}</div>
                <Spark data={trend} dataKey="ndrs" color={C_GREY} />
                <div className="text-xs text-muted-foreground">daily new NDRs · {k!.avgAttemptsPerOrder ?? "—"} avg attempts</div>
              </CardContent>
            </Card>
          </div>

          {/* ── Row 2: hero trend chart + outcomes seg bar ── */}
          <div className="grid items-start gap-3 lg:grid-cols-3">
            <Panel title="NDR Volume & Recovery Trend" className="lg:col-span-2"
              right={<div className="flex gap-3 text-xs text-muted-foreground">
                <span><span className="inline-block h-2 w-2 rounded-sm mr-1 align-middle" style={{ background: C_MAIN }} />New NDRs</span>
                <span><span className="inline-block h-2 w-2 rounded-sm mr-1 align-middle" style={{ background: C_M2 }} />Delivered</span>
                <span><span className="inline-block h-2 w-2 rounded-sm mr-1 align-middle" style={{ background: C_M3 }} />RTO</span>
              </div>}>
              {trend.every((t) => t.ndrs === 0) ? (
                <EmptyState text="No NDR activity in this window." />
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={trend} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ndrArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C_MAIN} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={C_MAIN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={34} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "hsl(var(--border))" }} />
                    <Area type="monotone" dataKey="ndrs" name="New NDRs" stroke={C_MAIN} strokeWidth={2} fill="url(#ndrArea)" dot={false} />
                    <Line type="monotone" dataKey="delivered" name="Delivered" stroke={C_M2} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="rto" name="RTO" stroke={C_M3} strokeWidth={2} strokeDasharray="4 2" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="NDR Outcomes">
              {k!.ndrOrders === 0 ? (
                <EmptyState text="No NDRs in this window." />
              ) : (
                <>
                  <div className="mb-4 flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{num(k!.ndrOrders)}</span>
                    <span className="text-xs text-muted-foreground">NDR orders</span>
                  </div>
                  <SegBar segments={[
                    { label: "Delivered", value: k!.deliveredOrders, color: C_MAIN },
                    { label: "RTO", value: k!.returnedOrders, color: C_M2 },
                    { label: "Open", value: k!.openOrders, color: C_M3 },
                    { label: "Cancelled", value: k!.cancelledOrders, color: C_M4 },
                  ]} />
                </>
              )}
            </Panel>
          </div>

          {/* ── Row 3: revenue band (seg bars, COD/prepaid) ── */}
          <div className="grid gap-3 lg:grid-cols-3">
            {([
              { label: "Revenue at Risk", band: rev!.total.atRisk, cod: rev!.cod.atRisk, pre: rev!.prepaid.atRisk, color: C_MAIN, prev: data.prev.atRisk, gwd: true },
              { label: "Revenue Saved", band: rev!.total.saved, cod: rev!.cod.saved, pre: rev!.prepaid.saved, color: C_MAIN, prev: null as number | null, gwd: false },
              { label: "Revenue Lost (RTO)", band: rev!.total.lost, cod: rev!.cod.lost, pre: rev!.prepaid.lost, color: C_MAIN, prev: null as number | null, gwd: true },
            ]).map((r) => {
              const codShare = r.band > 0 ? (r.cod / r.band) * 100 : 0;
              return (
                <Card key={r.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <IndianRupee className="h-4 w-4" /> {r.label}
                      </div>
                      {r.prev != null && <TrendChip cur={r.band} prev={r.prev} goodWhenDown={r.gwd} />}
                    </div>
                    <div className="mt-2 text-2xl font-bold tracking-tight" style={{ color: r.color }} title={inrFull(r.band)}>{inr(r.band)}</div>
                    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full" style={{ width: `${codShare}%`, background: C_GREY }} />
                      <div className="h-full" style={{ width: `${100 - codShare}%`, background: C_GREY_LT }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                      <span><span className="inline-block h-2 w-2 rounded-sm mr-1 align-middle" style={{ background: C_GREY }} />COD {inr(r.cod)}</span>
                      <span><span className="inline-block h-2 w-2 rounded-sm mr-1 align-middle" style={{ background: C_GREY_LT }} />Prepaid {inr(r.pre)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ── Row 3.5: COD vs Prepaid NDR rate + reattempt effectiveness ── */}
          <div className="grid items-start gap-3 lg:grid-cols-3">
            <Panel title="NDR Rate: COD vs Prepaid" className="lg:col-span-2">
              <PaymentCompare cod={data.paymentSplit.cod} prepaid={data.paymentSplit.prepaid} />
            </Panel>
            <Panel title="Reattempt Effectiveness">
              {data.reattempt.withReattempt === 0 ? (
                <div className="py-4">
                  <div className="text-3xl font-bold text-muted-foreground">—</div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    No reattempts recorded in this window. Either none were scheduled, or the
                    reattempt flow isn't writing <span className="font-mono">reattempt_scheduled</span> yet.
                  </p>
                </div>
              ) : (
                <div className="py-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold" style={{ color: C_GOOD }}>{pctStr(data.reattempt.effectivenessPct)}</span>
                    <span className="text-xs text-muted-foreground">delivered after reattempt</span>
                  </div>
                  <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(data.reattempt.effectivenessPct ?? 0, 100)}%`, background: C_GOOD }} />
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {num(data.reattempt.reattemptDelivered)} of {num(data.reattempt.withReattempt)} reattempted orders delivered ·
                    coverage {pctStr(data.reattempt.ndrOrders ? Math.round((data.reattempt.withReattempt / data.reattempt.ndrOrders) * 10000) / 100 : null)} of NDRs
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* ── Row 4: reasons + aging ── */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Why Deliveries Fail">
              {reasonBars.length === 0 ? <EmptyState text="No reason data in this window." /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={reasonBars} layout="vertical" margin={{ left: 50, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                      {reasonBars.map((b, i) => <Cell key={i} fill={b.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
            <Panel title="Open-NDR Aging" right={<span className="text-[11px] text-muted-foreground">live snapshot</span>}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agingBars} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                    formatter={(v: number, n: string) => (n === "valueAtRisk" ? inrFull(v) : v)} />
                  <Bar dataKey="count" name="Open orders" radius={[6, 6, 0, 0]} barSize={42}>
                    {agingBars.map((b, i) => <Cell key={i} fill={b.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* ── Row 5: secondary stat strip ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={ShieldCheck} label="Actionable NDRs" value={pctStr(data.actionable.actionablePct)}
              sub={`${num(data.actionable.actionable)} actionable · ${num(data.actionable.nonActionable)} not`} />
            <StatTile icon={TrendingUp} label="Actionable Rescue Rate" color={C_GOOD} value={pctStr(data.actionable.actionableRescuePct)}
              sub={`${num(data.actionable.actionableRescued)} of ${num(data.actionable.actionable)} saved`} />
            <StatTile icon={Clock} label="Avg Resolution Time" value={hrStr(data.resolutionTime.overallHours)}
              sub={`Deliver ${hrStr(data.resolutionTime.deliveredHours)} · RTO ${hrStr(data.resolutionTime.returnedHours)}`} />
            <StatTile icon={Repeat} label="Reshipments" value={`${num(data.reshipments.delivered)} / ${num(data.reshipments.created)}`} sub="delivered / created" />
          </div>

          {/* ── Row 5.5: actionable open-NDR queue (drill-down) ── */}
          <Panel title="Open NDRs to Action"
            right={<span className="text-[11px] text-muted-foreground">oldest first · {data.openList.length} shown</span>}>
            {data.openList.length === 0 ? (
              <EmptyState text="No open NDRs right now. 🎉" />
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60">
                      <th className="px-2 py-2 font-medium">Order</th>
                      <th className="px-2 py-2 font-medium">Customer</th>
                      <th className="px-2 py-2 font-medium">City</th>
                      <th className="px-2 py-2 font-medium">Reason</th>
                      <th className="px-2 py-2 font-medium">Pay</th>
                      <th className="px-2 py-2 font-medium text-right">Value</th>
                      <th className="px-2 py-2 font-medium text-center">Att.</th>
                      <th className="px-2 py-2 font-medium text-right">Days open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.openList.map((r, i) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-muted/40">
                        <td className="px-2 py-2 font-medium whitespace-nowrap">
                          {r.orderNumber ? `#${r.orderNumber}` : "—"}
                          {r.awb && <div className="font-mono text-[10px] text-muted-foreground">{r.awb}</div>}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {r.customerName || "—"}
                          {r.customerPhone && <div className="text-[10px] text-muted-foreground">{r.customerPhone}</div>}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{r.city || "—"}</td>
                        <td className="px-2 py-2 max-w-[180px] truncate" title={r.reason ?? ""}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle" style={{ background: r.isActionable ? C_GOOD : C_GREY_LT }} />
                          {r.reason || r.nslCode || "—"}
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant="secondary" className="text-[10px] font-medium">{r.paymentType}</Badge>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{inr(r.value)}</td>
                        <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{r.attempts}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <span className="font-semibold text-foreground">{r.daysOpen}d</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* ── Row 6: geography ── */}
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <Panel title="Highest NDR by City" right={<MapPin className="h-4 w-4 text-muted-foreground" />}>
              <GeoHeat rows={data.geography.byCity} label="City" />
            </Panel>
            <Panel title="Highest NDR by Pincode" right={<MapPin className="h-4 w-4 text-muted-foreground" />}>
              <GeoHeat rows={data.geography.byPincode} label="Pincode" />
            </Panel>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Window {new Date(data.window.start).toLocaleDateString()} – {new Date(data.window.end).toLocaleDateString()} ·
            Trend chips compare the previous equal-length period · Rates &amp; revenue are per distinct order
            (multi-attempt NDRs counted once) · Geography ranked by NDR rate with a minimum-volume floor.
          </p>
        </div>
      )}
    </PageLayout>
  );
}

function PaymentCompare({ cod, prepaid }: { cod: PaymentSplitRow; prepaid: PaymentSplitRow }) {
  const max = Math.max(cod.ratePct ?? 0, prepaid.ratePct ?? 0, 1);
  const rows = [
    { label: "COD", color: C_WARN, d: cod },
    { label: "Prepaid", color: C_BLUE, d: prepaid },
  ];
  const codHigher = (cod.ratePct ?? 0) > (prepaid.ratePct ?? 0) && (prepaid.ratePct ?? 0) > 0;
  const multiple = (prepaid.ratePct ?? 0) > 0 ? (cod.ratePct ?? 0) / (prepaid.ratePct ?? 1) : null;
  return (
    <div>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium">{r.label}</span>
              <span className="text-muted-foreground">{num(r.d.ndrd)} of {num(r.d.shipped)} shipped</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-7 rounded-lg bg-muted/60 overflow-hidden">
                <div className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                  style={{ width: `${Math.max(((r.d.ratePct ?? 0) / max) * 100, 8)}%`, background: r.color }}>
                  <span className="text-[11px] font-bold text-white">{pctStr(r.d.ratePct)}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {codHigher && multiple && multiple >= 1.1 && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          COD orders NDR <span className="font-semibold text-foreground">{multiple.toFixed(1)}×</span> more than prepaid —
          a prepaid-incentive push would cut NDR exposure directly.
        </p>
      )}
    </div>
  );
}

function GeoHeat({ rows, label }: { rows: GeoRow[]; label: string }) {
  if (!rows.length) return <EmptyState text="Not enough volume to rank." />;
  const max = Math.max(...rows.map((r) => r.ndrRatePct ?? 0), 1);
  // Darker = higher NDR rate (the worst offenders).
  const heat = (p: number) => (p >= 30 ? C_MAIN : p >= 20 ? C_M2 : p >= 10 ? C_M3 : C_M4);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
        <span>{label}</span><span>Shipped · NDRs · Rate</span>
      </div>
      {rows.map((r) => {
        const p = r.ndrRatePct ?? 0;
        return (
          <div key={r.key} className="flex items-center gap-3">
            <div className="w-28 truncate text-sm font-medium" title={r.key}>{r.key}</div>
            <div className="flex-1 h-5 rounded-md bg-muted/60 overflow-hidden">
              <div className="h-full rounded-md" style={{ width: `${Math.max((p / max) * 100, 4)}%`, background: heat(p) }} />
            </div>
            <div className="w-32 text-right text-[11px] text-muted-foreground tabular-nums">
              {r.ordersShipped} · {r.ndrs} · <span className="font-semibold" style={{ color: heat(p) }}>{pctStr(r.ndrRatePct)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
