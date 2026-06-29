/**
 * Monthly attendance / idle-time report — admin-facing page used to
 * roll up each agent's clocked hours, auto-clock-outs, breaks, and
 * idle-minutes-deducted for the month. Drives payroll inputs.
 *
 * Pattern mirrors client/src/pages/call-logs.tsx — PageLayout, Card
 * frame, table body, CSV download in the header — so the look stays
 * consistent across admin reports.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLayout } from "@/components/page-layout";
import { Download, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

interface ReportRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  daysPresent: number;
  daysAutoClosed: number;
  clockedHours: number;
  breakMinutes: number;
  idleMinutesDeducted: number;
  avgHoursPerDay: number;
}

interface ReportResponse {
  year: number;
  month: number;
  rows: ReportRow[];
  totals: {
    daysPresent: number;
    daysAutoClosed: number;
    clockedHours: number;
    breakMinutes: number;
    idleMinutesDeducted: number;
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Inner content of the attendance report — pure component, no
 * PageLayout. Used both by the standalone /reports/attendance route
 * AND as a tab inside the Team page (Team → Attendance Report tab).
 * Splitting it out means neither location renders a duplicate page
 * header when both surfaces want the same body.
 */
export function AttendanceReportContent() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery<ReportResponse>({
    queryKey: ["/api/reports/attendance-monthly", year, month],
    queryFn: async () => {
      const r = await fetch(
        `/api/reports/attendance-monthly?year=${year}&month=${month}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed to fetch report");
      return r.json();
    },
  });

  // Year dropdown: current year + 2 previous. Most teams won't need
  // deep history; if they do, this is the one place to widen the range.
  const yearOptions = useMemo(
    () => [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2],
    [now],
  );

  const handleDownloadCsv = () => {
    // Plain link — the server sets Content-Disposition: attachment so
    // the browser triggers a download without us needing a hidden
    // anchor + click() dance.
    window.location.href = `/api/reports/attendance-monthly/csv?year=${year}&month=${month}`;
  };

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-6">
      {/* Controls row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[150px]" data-testid="select-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[110px]" data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            onClick={handleDownloadCsv}
            disabled={!rows.length}
            data-testid="button-download-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
        </div>

        {/* KPI strip — proper card grid (matches dashboard). Each tile has
            its own surface + soft shadow so the report opens with a clear
            "this is what the month says" summary. */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCell label="Agents tracked" loading={isLoading} value={String(rows.length)} tone="brand" />
          <KpiCell label="Days present" loading={isLoading} value={String(totals?.daysPresent ?? 0)} tone="success" />
          <KpiCell label="Total clocked" loading={isLoading} value={`${(totals?.clockedHours ?? 0).toFixed(1)}h`} tone="brand" />
          <KpiCell label="Auto clock-outs" loading={isLoading} value={String(totals?.daysAutoClosed ?? 0)}
            tone={totals?.daysAutoClosed ? "amber" : undefined} />
          <KpiCell label="Est. idle window" loading={isLoading} value={formatHM(totals?.idleMinutesDeducted ?? 0)}
            hint="≈ policy window × auto clock-outs. Pay uses Total clocked." />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Per-agent breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Days Present</TableHead>
                  <TableHead className="text-right">Auto Clocked-Out</TableHead>
                  <TableHead className="text-right">Clocked Hours</TableHead>
                  <TableHead className="text-right">Break Time</TableHead>
                  <TableHead className="text-right">Est. Idle</TableHead>
                  <TableHead className="text-right">Avg Hrs/Day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <EmptyState
                        icon={CalendarX}
                        title={`Nothing logged for ${MONTH_NAMES[month - 1]} ${year}`}
                        description="No agent clocked in this period. Pick a different month from the selector above."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.userId} data-testid={`row-${r.userId}`}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand"
                            aria-hidden
                          >
                            {r.fullName
                              .trim()
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((w) => w[0])
                              .join("")
                              .toUpperCase() || "?"}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.fullName}</div>
                            <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                          {r.role.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.daysPresent}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.daysAutoClosed > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">{r.daysAutoClosed}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {r.clockedHours.toFixed(2)}h
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatHM(r.breakMinutes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.idleMinutesDeducted > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {formatHM(r.idleMinutesDeducted)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.avgHoursPerDay.toFixed(2)}h
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
    </div>
  );
}

/**
 * Standalone /reports/attendance route — wraps the content in the
 * shared PageLayout chrome. Kept so direct-link / bookmark usage
 * continues to work even though the primary surface now lives as a
 * tab on the Team page (Team → Attendance Report).
 */
export default function AttendanceReportPage() {
  return (
    <PageLayout
      title="Attendance & Idle Report"
      description="Monthly rollup of clocked hours, auto clock-outs, and idle deductions — ready for payroll."
    >
      <div className="p-6">
        <AttendanceReportContent />
      </div>
    </PageLayout>
  );
}

const KPI_STRIPE: Record<string, string> = {
  brand: "bg-brand",
  success: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

function KpiCell({ label, value, loading, tone, hint }: {
  label: string; value: string; loading: boolean; tone?: string; hint?: string;
}) {
  const stripe = tone ? KPI_STRIPE[tone] : null;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      {stripe && <span className={cn("inline-block h-1.5 w-6 rounded-full mb-3", stripe)} aria-hidden />}
      {loading ? (
        <Skeleton className="h-8 w-20 mt-1" />
      ) : (
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      )}
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug normal-case">{hint}</p>}
    </div>
  );
}
