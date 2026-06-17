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
import { Download, Clock, Users, Power, Coffee, TrendingDown } from "lucide-react";

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

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Agents Tracked</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{rows.length}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Days Present</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{totals?.daysPresent ?? 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clocked</CardTitle>
              <TrendingDown className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">
                  {(totals?.clockedHours ?? 0).toFixed(1)}<span className="text-sm font-normal text-muted-foreground ml-1">h</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auto Clock-Outs</CardTitle>
              <Power className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold text-blue-500">{totals?.daysAutoClosed ?? 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Est. Idle Window</CardTitle>
              <Coffee className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold text-yellow-500">
                  {formatHM(totals?.idleMinutesDeducted ?? 0)}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                ≈ policy window × auto clock-outs. Pay uses Total Clocked.
              </p>
            </CardContent>
          </Card>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No attendance recorded for {MONTH_NAMES[month - 1]} {year}.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.userId} data-testid={`row-${r.userId}`}>
                      <TableCell>
                        <div className="font-medium">{r.fullName}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{r.role.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.daysPresent}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.daysAutoClosed > 0 ? (
                          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                            {r.daysAutoClosed}
                          </Badge>
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
                          <span className="text-yellow-600 dark:text-yellow-400">
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
