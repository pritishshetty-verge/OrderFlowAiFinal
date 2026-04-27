import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { PageLayout } from "@/components/page-layout";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Pare — Clean Revenue dashboard (v0.4, 35 signals)
//
// Layout: one CSS grid. Rows = signals, cols = dates. First column is
// the sticky signal label; the remaining columns scroll horizontally.
// No Card, no Table, no <thead>/<tbody>. Five PRD phase groups
// separated by pure whitespace rows.
// ─────────────────────────────────────────────────────────────────────

type Bucket = { count: number; value: number };
type NullableBucket = {
  count: number | null;
  value: number | null;
  note?: string;
};
type DailyBucket = {
  date: string;
  grossGmv: number;
  discounts: number;
  orderRevenue: number;
  deliveredGmv: number;
  rtoGmv: number;
  cancelledGmv: number;
  refundedAmount: number;
  leakage: number;
  netGmv: number;
  totalOrders: number;
  codOrders: number;
  paidOrders: number;
  exchangeOrdersPaid: number | null;
  exchangeOrdersCod: number | null;
  cancelledOrders: number;
  fulfilledOrders: number;
  unfulfilledOrders: number;
  deliveredOrders: number;
  rtoOrders: number;
  refundedOrders: number;
  cxConfirmedOrders: number;
  cxConfirmationPending: number;
  c2pOrders: number | null;
  brandConfirmedOrders: number;
  // Phase 4 · Meta/FB ads (populated by POST /api/meta/sync)
  fbSpend: number | null;
  fbRoas: number | null;
  fbGmv: number | null;
  fbOrders: number | null;
  tier1Orders: number | null;
  tier1Rto: number | null;
  tier2Orders: number | null;
  tier2Rto: number | null;
  tier3Orders: number | null;
  tier3Rto: number | null;
  unknownTierOrders: number;
};

type PareMetrics = {
  dateRange: { startDate: string; endDate: string };
  grossGmv: number;
  leakage: number;
  netGmv: number;
  totalOrders: number;
  phases: {
    transit: {
      rtoPct: number | null;
    };
  };
  daily: DailyBucket[];
  computedAt: string;
};

const PRESETS = [
  { id: "7d", label: "7d", days: 7 },
  { id: "14d", label: "14d", days: 14 },
  { id: "30d", label: "30d", days: 30 },
] as const;
type PresetId = (typeof PRESETS)[number]["id"];

const DASH = "—";

// Compact Indian currency: ₹4.12Cr / ₹41.88L / ₹74k / ₹230.
function fmtINRCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  if (n === 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}
function fmtINRHero(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  if (n === 0) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return new Intl.NumberFormat("en-IN").format(n);
}
function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return `${n.toFixed(1)}%`;
}
function fmtCountPct(
  count: number | null | undefined,
  pct: number | null | undefined,
): string {
  if (count === null || count === undefined) return DASH;
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return fmtInt(count);
  }
  return `${fmtInt(count)} · ${pct.toFixed(0)}%`;
}
function fmtDateHeader(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt
    .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    .toUpperCase();
}

function computeWindow(days: number): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (days - 1) * 864e5);
  return { startDate, endDate };
}

type CellKind = "currency" | "count" | "percent" | "ratio";
type CellData = {
  primary: number | null;
  pct?: number | null; // Secondary percentage — rendered as "N · P%".
  kind: CellKind;
};

type SignalRow = {
  label: string;
  cell: (day: DailyBucket) => CellData;
  // `emphasis` = strong (Net GMV): semibold + muted background.
  // `subtotal` = medium (Order Revenue): font-medium only, no bg.
  emphasis?: boolean;
  subtotal?: boolean;
  accent?: (day: DailyBucket) => "red" | "amber" | null;
};

type PhaseGroup = { name: string; rows: SignalRow[] };

function makePhases(overallRtoPct: number | null): PhaseGroup[] {
  const rtoOver15 = (overallRtoPct ?? 0) > 15;

  const emDash = (
    label: string,
    kind: CellKind = "count",
  ): SignalRow => ({
    label,
    cell: () => ({ primary: null, kind }),
  });

  return [
    // ── Phase 1 · Financial Performance (Gross-to-Net waterfall) ───
    // Strict exclusivity hierarchy — an order can only fall into ONE
    // leakage bucket, ordered by lifecycle stage:
    //   Gross GMV (list value)
    //     − Discounts
    //   = Order Revenue (subtotal — what customers actually paid)
    //     − Canceled GMV  (Warehouse: cancelled before fulfillment)
    //     − RTO GMV       (Transit:   logistics RTO, any financial_status)
    //     · Delivered GMV (informational — NOT subtracted)
    //     − RMS Refunded  (Customer:  delivered THEN refunded)
    //   = Net GMV (bottom line)
    {
      name: "Phase 1 · Financial Performance",
      rows: [
        {
          label: "Gross GMV",
          cell: (d) => ({ primary: d.grossGmv, kind: "currency" }),
        },
        {
          label: "Discounts",
          cell: (d) => ({ primary: d.discounts, kind: "currency" }),
          // Always amber — discounts are a deduction, not an alert.
          // Using the existing amber accent hook lets the cell read
          // as "money going out" without needing a new color class.
          accent: () => "amber",
        },
        {
          label: "Order Revenue",
          cell: (d) => ({ primary: d.orderRevenue, kind: "currency" }),
          subtotal: true,
        },
        {
          label: "Canceled GMV",
          cell: (d) => ({ primary: d.cancelledGmv, kind: "currency" }),
        },
        {
          label: "RTO GMV",
          cell: (d) => ({ primary: d.rtoGmv, kind: "currency" }),
          accent: () => (rtoOver15 ? "red" : null),
        },
        {
          // Informational: successfully-delivered revenue. NOT subtracted
          // from Net GMV — it's the positive counterpart to the leakage
          // rows above. Kept in Phase 1 so operators can eyeball the
          // Delivered:RTO ratio at a glance.
          label: "Delivered GMV",
          cell: (d) => ({ primary: d.deliveredGmv, kind: "currency" }),
        },
        {
          label: "RMS Refunded Amount",
          cell: (d) => ({ primary: d.refundedAmount, kind: "currency" }),
        },
        {
          label: "Net GMV",
          cell: (d) => ({ primary: d.netGmv, kind: "currency" }),
          emphasis: true,
        },
      ],
    },

    // ── Phase 2 · Order Volume & Payments ──────────────────────────
    {
      name: "Phase 2 · Order Volume & Payments",
      rows: [
        {
          label: "Total Orders",
          cell: (d) => ({ primary: d.totalOrders, kind: "count" }),
        },
        {
          label: "COD Orders",
          cell: (d) => ({
            primary: d.codOrders,
            pct:
              d.totalOrders > 0 ? (d.codOrders / d.totalOrders) * 100 : null,
            kind: "count",
          }),
        },
        {
          label: "Paid Orders",
          cell: (d) => ({
            primary: d.paidOrders,
            pct:
              d.totalOrders > 0 ? (d.paidOrders / d.totalOrders) * 100 : null,
            kind: "count",
          }),
        },
        {
          label: "Exchange Orders Paid",
          cell: (d) => ({ primary: d.exchangeOrdersPaid, kind: "count" }),
        },
        {
          label: "Exchange Orders COD",
          cell: (d) => ({ primary: d.exchangeOrdersCod, kind: "count" }),
        },
      ],
    },

    // ── Phase 3 · Fulfillment & Logistics States ──────────────────
    {
      name: "Phase 3 · Fulfillment & Logistics States",
      rows: [
        {
          label: "Cancelled Orders",
          cell: (d) => ({
            primary: d.cancelledOrders,
            pct:
              d.totalOrders > 0
                ? (d.cancelledOrders / d.totalOrders) * 100
                : null,
            kind: "count",
          }),
        },
        {
          label: "Fulfilled Orders",
          cell: (d) => ({ primary: d.fulfilledOrders, kind: "count" }),
        },
        {
          label: "Unfulfilled Orders",
          cell: (d) => ({ primary: d.unfulfilledOrders, kind: "count" }),
          accent: (d) => (d.unfulfilledOrders > 0 ? "red" : null),
        },
        emDash("Fulfilled and Cancelled Orders"),
        emDash("Fulfilled and No End States Order"),
        {
          label: "Delivered Orders",
          cell: (d) => ({
            primary: d.deliveredOrders,
            pct:
              d.totalOrders > 0
                ? (d.deliveredOrders / d.totalOrders) * 100
                : null,
            kind: "count",
          }),
        },
        {
          label: "RTO Orders",
          cell: (d) => ({
            primary: d.rtoOrders,
            pct:
              d.fulfilledOrders > 0
                ? (d.rtoOrders / d.fulfilledOrders) * 100
                : null,
            kind: "count",
          }),
          accent: () => (rtoOver15 ? "red" : null),
        },
        emDash("RMS Exchanged Orders"),
        {
          label: "RMS Refunded Orders",
          cell: (d) => ({ primary: d.refundedOrders, kind: "count" }),
        },
      ],
    },

    // ── Phase 4 · Marketing & CX (Top-Funnel) ─────────────────────
    {
      name: "Phase 4 · Marketing & CX (Top-Funnel)",
      rows: [
        {
          label: "Facebook Spend",
          cell: (d) => ({ primary: d.fbSpend, kind: "currency" }),
        },
        {
          label: "FB ROAS",
          cell: (d) => ({ primary: d.fbRoas, kind: "ratio" }),
          // PRD §3.7: a day where we spent on FB but didn't recoup
          // (ROAS < 1.0) is unprofitable — flag red.
          accent: (d) =>
            d.fbRoas !== null && d.fbRoas !== undefined && d.fbRoas < 1
              ? "red"
              : null,
        },
        {
          label: "FB GMV",
          cell: (d) => ({ primary: d.fbGmv, kind: "currency" }),
        },
        {
          label: "FB Order Count",
          cell: (d) => ({ primary: d.fbOrders, kind: "count" }),
        },
        {
          label: "CX Confirmed Orders",
          cell: (d) => ({ primary: d.cxConfirmedOrders, kind: "count" }),
        },
        {
          label: "CX Confirmation Pending",
          cell: (d) => ({ primary: d.cxConfirmationPending, kind: "count" }),
          accent: (d) => (d.cxConfirmationPending > 0 ? "amber" : null),
        },
        {
          label: "C2P Orders",
          cell: (d) => ({ primary: d.c2pOrders, kind: "count" }),
        },
        {
          label: "Brand Confirmed Orders",
          cell: (d) => ({ primary: d.brandConfirmedOrders, kind: "count" }),
        },
      ],
    },

    // ── Phase 5 · Geographic Risk Segmentation (Tier Stack) ───────
    {
      name: "Phase 5 · Geographic Risk Segmentation",
      rows: [
        {
          label: "Tier 1",
          cell: (d) => ({ primary: d.tier1Orders, kind: "count" }),
        },
        {
          label: "Tier 1 RTO %",
          cell: (d) => ({ primary: d.tier1Rto, kind: "percent" }),
        },
        {
          label: "Tier 2",
          cell: (d) => ({ primary: d.tier2Orders, kind: "count" }),
        },
        {
          label: "Tier 2 RTO %",
          cell: (d) => ({ primary: d.tier2Rto, kind: "percent" }),
        },
        {
          label: "Tier 3",
          cell: (d) => ({ primary: d.tier3Orders, kind: "count" }),
        },
        {
          label: "Tier 3 RTO %",
          cell: (d) => ({ primary: d.tier3Rto, kind: "percent" }),
        },
        {
          label: "Unknown Tier",
          cell: (d) => ({ primary: d.unknownTierOrders, kind: "count" }),
          accent: (d) => (d.unknownTierOrders > 0 ? "amber" : null),
        },
      ],
    },
  ];
}

export default function ParePage() {
  // UI-level admin guard (belt-and-suspenders with AdminOnlyGuard in App.tsx).
  // Follows the codebase's localStorage convention — this app has no
  // useAuth/useUser hook; every page reads role from localStorage.
  const userRole =
    typeof window !== "undefined" ? localStorage.getItem("userRole") : null;
  if (userRole && userRole !== "admin") {
    return <Redirect to="/" />;
  }

  const [preset, setPreset] = useState<PresetId>("14d");
  const { startDate, endDate } = useMemo(() => {
    const p = PRESETS.find((x) => x.id === preset)!;
    return computeWindow(p.days);
  }, [preset]);

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("startDate", startDate.toISOString());
    params.set("endDate", endDate.toISOString());
    // Server-side admin guard (server/routes.ts) reads userId from the
    // query string to look up the role. Matches how /api/dashboard/metrics
    // authenticates per-agent views elsewhere in the app.
    const userId =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    if (userId) params.set("userId", userId);
    return params.toString();
  }, [startDate, endDate]);

  const { data, isLoading, isError, error } = useQuery<PareMetrics>({
    queryKey: [`/api/analytics/pare?${qs}`],
  });

  const phases = useMemo(
    () => makePhases(data?.phases.transit.rtoPct ?? null),
    [data?.phases.transit.rtoPct],
  );

  const days = data?.daily ?? [];
  const rangeLabel = useMemo(() => {
    if (!days.length) return "";
    const first = fmtDateHeader(days[0].date);
    const last = fmtDateHeader(days[days.length - 1].date);
    return `${first} – ${last}`;
  }, [days]);

  const DAY_COL = 80;
  const LABEL_COL = 220;
  const gridTemplate = `${LABEL_COL}px repeat(${Math.max(days.length, 1)}, ${DAY_COL}px)`;

  return (
    <PageLayout title="Pare" description="Strip down to what's real.">
      <div className="max-w-6xl mx-auto px-8 py-10">
        {/* ── Hero row ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-6 mb-12">
          <div>
            {isError ? (
              <div className="text-sm text-red-600">
                Failed to load: {(error as Error)?.message ?? "Unknown error"}
              </div>
            ) : (
              <>
                <div
                  className={cn(
                    "text-4xl font-semibold tracking-tight tabular-nums text-foreground",
                    isLoading && "animate-pulse text-muted-foreground/30",
                  )}
                  data-testid="pare-net-gmv"
                >
                  {isLoading ? "₹—" : fmtINRHero(data?.netGmv)}
                </div>
                <div className="mt-2 flex items-baseline gap-3 text-xs text-muted-foreground">
                  <span>Net GMV</span>
                  {rangeLabel && (
                    <>
                      <span>·</span>
                      <span>{rangeLabel}</span>
                    </>
                  )}
                </div>
                <div className="mt-4 flex items-baseline gap-10 text-xs">
                  <div>
                    <div className="uppercase text-[10px] tracking-wider text-muted-foreground">
                      Gross GMV
                    </div>
                    <div className="mt-0.5 tabular-nums text-foreground/80">
                      {fmtINRHero(data?.grossGmv)}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase text-[10px] tracking-wider text-muted-foreground">
                      Leakage
                    </div>
                    <div className="mt-0.5 tabular-nums text-foreground/80">
                      {fmtINRHero(data?.leakage)}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase text-[10px] tracking-wider text-muted-foreground">
                      Orders
                    </div>
                    <div className="mt-0.5 tabular-nums text-foreground/80">
                      {fmtInt(data?.totalOrders)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Preset pills. Inactive is text-only; active gets a filled
              chip so the control reads as a toggle without a container. */}
          <div className="flex items-center gap-1 shrink-0 pt-2">
            {PRESETS.map((p) => {
              const active = p.id === preset;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded transition-colors tabular-nums",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`preset-${p.id}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Grid ─────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <div
            className="grid"
            style={{ gridTemplateColumns: gridTemplate }}
            role="grid"
          >
            {/* Column header row: empty label cell + date labels. */}
            <div className="sticky left-0 bg-background z-10 h-10 border-b border-border/30" />
            {days.map((d) => (
              <div
                key={`h-${d.date}`}
                className="text-right text-xs uppercase tracking-wider text-muted-foreground py-2 px-1 border-b border-border/30"
              >
                {fmtDateHeader(d.date)}
              </div>
            ))}

            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <Fragment key={`sk-${i}`}>
                  <div className="sticky left-0 bg-background py-3 border-b border-border/30">
                    <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                  </div>
                  {days.map((d) => (
                    <div
                      key={`sk-c-${i}-${d.date}`}
                      className="flex justify-end py-3 px-1 border-b border-border/30"
                    >
                      <div className="h-3 w-10 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </Fragment>
              ))
            ) : (
              phases.map((phase, phaseIdx) => (
                <PhaseBlock
                  key={phase.name}
                  phase={phase}
                  days={days}
                  topGap={phaseIdx === 0 ? "mt-2" : "mt-10"}
                />
              ))
            )}
          </div>
        </div>

        {data && (
          <div className="mt-10 text-[10px] uppercase tracking-wider text-muted-foreground text-right">
            Computed {new Date(data.computedAt).toLocaleString("en-IN")}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function renderCellText(cell: CellData): string {
  const { primary, pct, kind } = cell;
  const isDash = primary === null || primary === undefined;
  if (isDash) return DASH;
  if (kind === "currency") return fmtINRCompact(primary);
  if (kind === "percent") return fmtPct(primary);
  if (kind === "ratio") return `${(primary as number).toFixed(2)}x`;
  if (pct !== null && pct !== undefined) return fmtCountPct(primary, pct);
  return fmtInt(primary);
}

function PhaseBlock({
  phase,
  days,
  topGap,
}: {
  phase: PhaseGroup;
  days: DailyBucket[];
  topGap: string;
}) {
  return (
    <>
      {/* Whitespace spacer row — spans every column, creates a gap
          without a visible divider (PRD: phases are separated by
          whitespace only). */}
      <div className={cn("col-span-full", topGap)} />
      {phase.rows.map((row) => {
        // Three emphasis tiers:
        //  - emphasis (strong): semibold + bg tint  (Net GMV, bottom line)
        //  - subtotal (medium): font-medium only    (Order Revenue, running subtotal)
        //  - default:           normal weight
        const emphasisBg = row.emphasis ? "bg-muted/40" : "";
        const labelWeight = row.emphasis
          ? "font-semibold text-foreground"
          : row.subtotal
            ? "font-medium text-foreground"
            : "text-foreground/80";
        const cellWeightNoAccent = row.emphasis
          ? "font-semibold text-foreground"
          : row.subtotal
            ? "font-medium text-foreground"
            : "text-foreground/85";
        return (
          <Fragment key={`${phase.name}-${row.label}`}>
            <div
              className={cn(
                "sticky left-0 text-xs py-3 pr-4 border-b border-border/30",
                row.emphasis ? "bg-muted/40" : "bg-background",
                labelWeight,
              )}
            >
              {row.label}
            </div>
            {days.map((d) => {
              const cell = row.cell(d);
              const accent = row.accent ? row.accent(d) : null;
              const isDash = cell.primary === null || cell.primary === undefined;
              const color = isDash
                ? "text-muted-foreground/60"
                : accent === "red"
                  ? "text-red-600"
                  : accent === "amber"
                    ? "text-amber-600"
                    : cellWeightNoAccent;
              return (
                <div
                  key={`cell-${phase.name}-${row.label}-${d.date}`}
                  className={cn(
                    "text-right text-xs tabular-nums py-3 px-1 border-b border-border/30",
                    color,
                    emphasisBg,
                    // Keep the weight even when an accent overrides color.
                    row.emphasis && "font-semibold",
                    row.subtotal && "font-medium",
                  )}
                >
                  {renderCellText(cell)}
                </div>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}
