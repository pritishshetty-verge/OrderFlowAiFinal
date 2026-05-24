import type { TooltipProps } from "recharts";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// ChartTooltip — single source of truth for Recharts tooltip styling.
//
// Replaces the inline `contentStyle={{ backgroundColor: '...',
// border: '...', borderRadius: '...' }}` blocks scattered across
// analytics.tsx (6+ duplicates). Each chart wraps its data feed
// independently; the visual contract was getting harder to keep
// consistent.
//
// Three things this gets right that the inline styles couldn't:
//
//   1. Tabular numerals on every numeric value. Recharts uses
//      inline `style` props that don't inherit `body { font-variant-
//      numeric: tabular-nums }`. Setting `font-variant-numeric` on
//      the tooltip root forces money/quantities to align — the same
//      visual contract our data tables already follow.
//
//   2. Consistent currency formatting. Pass `format="currency"` and
//      values render as `₹1,250` instead of `1250`. Stripe-style.
//
//   3. Zinc-tinted card surface. Uses the design system tokens
//      (`bg-popover` / `border-popover-border`) so dark mode and
//      light mode pick up the right surface automatically — no more
//      hard-coded `hsl(var(--card))` strings duplicated per chart.
//
// Usage in a Recharts component:
//
//   <Tooltip content={<ChartTooltip format="currency" />} />
//
// or with a custom formatter:
//
//   <Tooltip content={
//     <ChartTooltip formatValue={(v) => `${v}%`} />
//   } />
// ─────────────────────────────────────────────────────────────────────

type ChartTooltipFormat = "currency" | "number" | "percent";

interface ChartTooltipProps extends TooltipProps<number, string> {
  /** Built-in format presets. */
  format?: ChartTooltipFormat;
  /** Custom value formatter — wins over `format` when both supplied. */
  formatValue?: (value: number, name?: string) => string;
  /** Optional custom label formatter (default: the raw label from Recharts). */
  formatLabel?: (label: unknown) => string;
}

const formatters: Record<ChartTooltipFormat, (v: number) => string> = {
  // Indian Rupees with thousands separators ("en-IN" yields lakhs/
  // crores grouping; if a future locale-switch is needed, only this
  // helper needs to change).
  currency: (v) => `₹${v.toLocaleString("en-IN")}`,
  // Plain number with thousands separators.
  number: (v) => v.toLocaleString("en-IN"),
  // Percent — values are expected to already be percentage units
  // (0–100), not 0–1. Most of our Recharts data shapes are like that
  // (e.g. RTO rate). One decimal place to avoid the "21%" vs "21.4%"
  // jitter between charts.
  percent: (v) => `${v.toFixed(1)}%`,
};

export function ChartTooltip({
  active,
  payload,
  label,
  format = "number",
  formatValue,
  formatLabel,
}: ChartTooltipProps) {
  // Recharts only renders the tooltip while it's "active" (mouse
  // hovering a data point). If the prop isn't true we bail out — no
  // empty card flickering when the cursor leaves the canvas.
  if (!active || !payload || payload.length === 0) return null;

  const valueFmt =
    formatValue ?? ((v: number) => formatters[format](v));
  const labelFmt = formatLabel ?? ((l: unknown) => String(l ?? ""));

  return (
    <div
      className={cn(
        "rounded-md border bg-popover text-popover-foreground shadow-md",
        // Tabular-nums forced via inline class chain — Recharts'
        // injected inline style would otherwise win.
        "px-3 py-2 min-w-[10rem]",
        "font-sans",
      )}
      style={{ fontVariantNumeric: "tabular-nums" }}
      data-testid="chart-tooltip"
    >
      {/* Date/category title. Muted styling so the eye lands on the
          numeric rows below it. */}
      {label !== undefined && label !== null && (
        <div className="text-xs text-muted-foreground mb-1.5">
          {labelFmt(label)}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => {
          const color = (entry as any).color ?? "currentColor";
          const numericValue =
            typeof entry.value === "number"
              ? entry.value
              : Number(entry.value);
          return (
            <div
              key={`${entry.dataKey ?? entry.name ?? i}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="h-2 w-2 rounded-sm shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="text-xs text-muted-foreground truncate">
                  {entry.name ?? entry.dataKey}
                </span>
              </div>
              <span className="text-xs font-medium">
                {Number.isFinite(numericValue)
                  ? valueFmt(numericValue, entry.name as string | undefined)
                  : String(entry.value ?? "—")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
