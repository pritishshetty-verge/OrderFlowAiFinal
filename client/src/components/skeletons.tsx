import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────
// Shape-accurate skeletons.
//
// Ad-hoc <Skeleton className="h-4 w-1/2" /> blocks read as "something
// is loading" without telling the user what shape to expect. The
// Linear/Vercel pattern is to render skeleton blocks that match the
// real component's geometry — same heights, same column widths,
// same vertical rhythm — so the transition from loading→loaded is
// a fade, not a layout shift.
//
// Three reusable shapes covering the three highest-traffic loading
// surfaces in the app:
//
//   • StatCardSkeleton  — dashboard / KPI rows (4–5 cards in a grid)
//   • TableRowSkeleton  — data tables (orders, NDR, calls, payroll)
//   • ChartAreaSkeleton — Recharts panels (analytics, Pare, RTO)
//
// Generic <Skeleton /> blocks remain for one-off use; these three
// just standardise the "I am loading a [thing]" presentation.
// ─────────────────────────────────────────────────────────────────────

// ── Stat card ─────────────────────────────────────────────────────
//
// Mirrors the dashboard StatCard:
//   • Title row (label + icon)
//   • Value row (large number)
//   • Description row (muted caption)
// All three are skeleton bars at the matching heights so the card
// height is exactly what the real one will be.
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-5 space-y-3",
        className,
      )}
      aria-busy="true"
      data-testid="skeleton-stat-card"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" /> {/* label */}
        <Skeleton className="h-4 w-4 rounded" /> {/* icon */}
      </div>
      <Skeleton className="h-7 w-16" /> {/* value */}
      <Skeleton className="h-3 w-28" /> {/* description */}
    </div>
  );
}

// ── Table row ─────────────────────────────────────────────────────
//
// Renders a TableRow with skeleton bars matching the column count
// in the real header. Caller passes `columns` so the skeleton stays
// in sync if the table grows/shrinks. Each cell's bar width is
// randomised slightly within a deterministic range so the skeleton
// reads as varied rather than as a perfect grid of identical bars.
export function TableRowSkeleton({
  columns,
  testId,
}: {
  columns: number;
  testId?: string;
}) {
  return (
    <TableRow data-testid={testId ?? "skeleton-table-row"}>
      {Array.from({ length: columns }).map((_, i) => (
        <TableCell key={i}>
          {/* Stable per-index width to avoid layout flicker between
              re-renders. Values picked so the bars read as "data
              of varied length" instead of a perfectly uniform grid. */}
          <Skeleton
            className="h-3.5"
            style={{ width: `${50 + ((i * 7) % 35)}%` }}
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

// Convenience wrapper: renders N skeleton rows. Use inside a
// `<TableBody>`. Most callers pass `rows={8}` to fill a typical
// viewport.
export function TableBodySkeleton({
  rows = 8,
  columns,
}: {
  rows?: number;
  columns: number;
}) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton
          key={i}
          columns={columns}
          testId={`skeleton-table-row-${i}`}
        />
      ))}
    </TableBody>
  );
}

// ── Chart area ────────────────────────────────────────────────────
//
// Mimics a chart canvas: a tall rectangular body with implied axis
// ticks along the bottom. Used in place of generic full-width
// skeletons inside `<ResponsiveContainer>` wrappers so a loading
// Pare chart still occupies the same vertical space the real chart
// will.
//
// Defaults to 280px height (matching the analytics page charts).
// Pass `height` to override.
export function ChartAreaSkeleton({
  height = 280,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("w-full space-y-2", className)}
      style={{ height }}
      aria-busy="true"
      data-testid="skeleton-chart-area"
    >
      {/* The plot area itself. Slight inset so axis ticks below
          aren't flush with the page padding. */}
      <Skeleton className="h-[calc(100%-1.5rem)] w-full rounded-md" />
      {/* Implied axis ticks: five short bars spaced evenly to
          suggest x-axis labels. */}
      <div className="flex items-center justify-between px-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-2 w-10" />
        ))}
      </div>
    </div>
  );
}
