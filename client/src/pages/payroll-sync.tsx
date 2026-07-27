/**
 * RazorpayX Payroll Sync — admin screen to push OrderFlow attendance +
 * leave into RazorpayX Payroll.
 *
 * Safe by default: a dry-run preview shows exactly what would be sent; the
 * live "Sync" only writes when the server's dry-run flag is off.
 *
 * Visual language (light + dark): indigo brand accent on a card-first
 * layout — icon-tile KPI cards, tinted status pills, employee avatars, a
 * micro composition bar. Status meaning carried by semantic colors
 * (emerald/amber/red); the brand indigo carries identity, not state.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageLayout } from "@/components/page-layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CloudUpload, ShieldCheck, CalendarCheck, PlaneTakeoff, MinusCircle,
  CheckCircle2, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface SyncRecord {
  payload: { email: string; date: string; status: string; checkin?: string; checkout?: string; "leave-type"?: number };
  source: "attendance" | "leave";
  outcome: "preview" | "ok" | "failed";
}
interface SyncReport {
  year: number; month: number; mode: "preview" | "live";
  configured: boolean; leaveTypesConfigured: boolean;
  totals: { attendanceDays: number; leaveDays: number; skipped: number; ok: number; failed: number };
  records: SyncRecord[];
  skipped: { reason: string; sourceId: string; email?: string }[];
}
interface SyncRun {
  id: string; year: number; month: number; mode: string;
  attendanceDays: number; leaveDays: number; okCount: number; failedCount: number; skippedCount: number;
  createdAt: string;
}
interface ReconcileReport {
  totals: { checked: number; match: number; mismatch: number; missing: number; notFound: number };
  issues: { email: string; date: string; expected: string; actual: string | null; state: string; note?: string }[];
}

/**
 * Inner content of the Payroll Sync screen, without the PageLayout
 * chrome. Used both as a standalone page (PayrollSyncPage below) and
 * as a tab on the Payroll page (Payroll → Sync).
 */
export function PayrollSyncContent() {
  const { toast } = useToast();
  const currentUserId = localStorage.getItem("userId") ?? "";
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const q = (path: string) => `${path}?currentUserId=${encodeURIComponent(currentUserId)}&year=${year}&month=${month}`;

  const status = useQuery<{ configured: boolean; dryRun: boolean; leaveTypesConfigured: boolean }>({
    queryKey: [`/api/payroll-sync/status?currentUserId=${currentUserId}`],
  });
  const preview = useQuery<SyncReport>({ queryKey: [q("/api/payroll-sync/preview")] });
  const history = useQuery<SyncRun[]>({ queryKey: [`/api/payroll-sync/history?currentUserId=${currentUserId}`] });

  const [verifyReport, setVerifyReport] = useState<ReconcileReport | null>(null);
  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(q("/api/payroll-sync/verify"), { credentials: "include" });
      if (!res.ok) throw new Error("Verify failed");
      return (await res.json()) as ReconcileReport;
    },
    onSuccess: (r) => {
      setVerifyReport(r);
      toast({
        title: "Verification complete",
        description: `${r.totals.match} matched, ${r.totals.mismatch} mismatched, ${r.totals.missing} not yet synced, ${r.totals.notFound} not in RazorpayX.`,
        variant: r.totals.mismatch + r.totals.notFound > 0 ? "destructive" : "default",
      });
    },
    onError: (e: Error) => toast({ title: "Verify failed", description: e.message, variant: "destructive" }),
  });

  const [liveReport, setLiveReport] = useState<SyncReport | null>(null);
  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/payroll-sync/run?currentUserId=${encodeURIComponent(currentUserId)}`, { year, month });
      return (await res.json()) as SyncReport;
    },
    onSuccess: (report) => {
      setLiveReport(report);
      history.refetch();
      toast({
        title: report.mode === "preview" ? "Dry-run complete" : "Sync complete",
        description: report.mode === "preview"
          ? "Dry-run is on — nothing was sent to RazorpayX."
          : `Pushed ${report.totals.ok} records, ${report.totals.failed} failed.`,
        variant: report.totals.failed > 0 ? "destructive" : "default",
      });
    },
    onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const report = liveReport ?? preview.data;
  const yearOptions = useMemo(() => [now.getFullYear(), now.getFullYear() - 1], [now]);
  const dryRun = status.data?.dryRun ?? true;
  const configured = status.data?.configured ?? false;
  const onPeriodChange = () => { setLiveReport(null); setVerifyReport(null); };

  const conn: { pill: string; dot: string; label: string; hint: string } = !configured
    ? { pill: "bg-muted text-muted-foreground", dot: "bg-zinc-400", label: "Not connected", hint: "Add RazorpayX credentials to the server. Preview works without them." }
    : dryRun
      ? { pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500", label: "Dry-run", hint: "Connected — writes are off. Sync previews only." }
      : { pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", label: "Live", hint: "Sync writes to your RazorpayX payroll account." };

  // (tab styling now comes from the shared Tabs primitive)

  return (
    <div className="space-y-6 max-w-[1100px]">
        {/* Controls — period (left) against the connection state + action (right). */}
        <div className="rounded-2xl border bg-card shadow-sm p-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => { setMonth(Number(v)); onPeriodChange(); }}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); onPeriodChange(); }}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", conn.pill)}
              title={conn.hint}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", conn.dot)} />
              {conn.label}
            </span>
            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending || !report?.records.length}
              className="shadow-sm hover:shadow-md transition-shadow"
              style={{ backgroundImage: "var(--brand-gradient)", color: "hsl(var(--brand-foreground))" }}
            >
              <CloudUpload className="w-4 h-4 mr-2" />
              {runMutation.isPending ? "Syncing" : dryRun ? "Run dry-run" : "Sync to RazorpayX"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="sync" className="space-y-5">
          <TabsList>
            <TabsTrigger value="sync">Sync</TabsTrigger>
            <TabsTrigger value="verify">Verify</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* ── Sync tab ─────────────────────────────────────────────── */}
          <TabsContent value="sync" className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={CalendarCheck} tone="brand" label="Attendance days" value={report?.totals.attendanceDays} loading={preview.isLoading} />
              <Kpi icon={PlaneTakeoff} tone="muted" label="Leave days" value={report?.totals.leaveDays} loading={preview.isLoading} />
              <Kpi icon={MinusCircle} tone="muted" label="Skipped" value={report?.totals.skipped} loading={preview.isLoading} />
              <Kpi
                icon={CheckCircle2}
                tone="brand"
                label={report?.mode === "live" ? "Pushed" : "Ready to push"}
                value={report?.mode === "live" ? report?.totals.ok : report?.records.length}
                loading={preview.isLoading}
              />
            </div>

            {!preview.isLoading && report && <CompositionBar report={report} />}

            <SectionCard title={report?.mode === "live" ? "Sync results" : "Preview"}
              subtitle={report?.mode === "live" ? "What was sent to RazorpayX." : "Exactly what will be sent. Nothing is written yet."}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : !report?.records.length ? (
                    <TableRow><TableCell colSpan={7}><EmptyRow label={`No attendance or leave to sync for ${MONTHS[month-1]} ${year}.`} /></TableCell></TableRow>
                  ) : report.records.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2.5">
                          <InitialsAvatar email={r.payload.email} />
                          <span className="text-sm font-medium truncate max-w-[220px]">{r.payload.email}</span>
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">{r.payload.date}</TableCell>
                      <TableCell><StatusBadge status={r.payload.status} /></TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">{r.payload.checkin ?? "—"}</TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">{r.payload.checkout ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{r.source}</TableCell>
                      <TableCell className="text-right"><OutcomePill outcome={r.outcome} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {!!report?.skipped.length && (
                <div className="mt-4 border-t pt-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Skipped — {report.skipped.length}</p>
                  {report.skipped.slice(0, 8).map((s, i) => <p key={i}>{s.email ?? s.sourceId} — {s.reason}</p>)}
                  {report.skipped.length > 8 && <p>and {report.skipped.length - 8} more</p>}
                </div>
              )}
            </SectionCard>
          </TabsContent>

          {/* ── Verify tab ───────────────────────────────────────────── */}
          <TabsContent value="verify" className="space-y-5">
            <SectionCard
              title="Reconcile against RazorpayX"
              subtitle="Re-reads RazorpayX and confirms it matches OrderFlow for the selected month."
              action={
                <Button variant="outline" size="sm" onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending || !configured}>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {verifyMutation.isPending ? "Checking" : "Run check"}
                </Button>
              }
            >
              {!verifyReport ? (
                <EmptyRow label="Run a check to compare OrderFlow with RazorpayX." />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <Kpi icon={Inbox} tone="muted" label="Checked" value={verifyReport.totals.checked} loading={false} />
                    <Kpi icon={CheckCircle2} tone="emerald" label="Matched" value={verifyReport.totals.match} loading={false} />
                    <Kpi icon={MinusCircle} tone={verifyReport.totals.mismatch ? "red" : "muted"} label="Mismatched" value={verifyReport.totals.mismatch} loading={false} />
                    <Kpi icon={CloudUpload} tone={verifyReport.totals.missing ? "amber" : "muted"} label="Not synced" value={verifyReport.totals.missing} loading={false} />
                    <Kpi icon={ShieldCheck} tone={verifyReport.totals.notFound ? "red" : "muted"} label="Not in RazorpayX" value={verifyReport.totals.notFound} loading={false} />
                  </div>
                  {verifyReport.issues.length === 0 ? (
                    <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Everything matches.
                    </p>
                  ) : (
                    <div className="text-xs text-muted-foreground max-h-60 overflow-auto divide-y divide-border rounded-lg border">
                      {verifyReport.issues.slice(0, 60).map((it, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="inline-flex items-center gap-2 truncate">
                            <InitialsAvatar email={it.email} />
                            <span className="truncate">{it.email} · {it.date}</span>
                          </span>
                          <span className="uppercase tracking-wide text-[10px] shrink-0 rounded-full bg-muted px-2 py-0.5">{it.state.replace("-", " ")}</span>
                        </div>
                      ))}
                      {verifyReport.issues.length > 60 && <div className="px-3 py-2">and {verifyReport.issues.length - 60} more</div>}
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          </TabsContent>

          {/* ── History tab ──────────────────────────────────────────── */}
          <TabsContent value="history" className="space-y-5">
            <SectionCard title="Recent syncs" subtitle="Every preview and live push, most recent first.">
              {!history.data?.length ? (
                <EmptyRow label="No sync runs yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Attendance</TableHead>
                      <TableHead className="text-right">Leave</TableHead>
                      <TableHead className="text-right">Pushed</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Skipped</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.data.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="text-sm">{new Date(run.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">{MONTHS[run.month-1]?.slice(0,3)} {run.year}</TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                            run.mode === "live" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
                          )}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", run.mode === "live" ? "bg-brand" : "bg-zinc-400")} />
                            {run.mode}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{run.attendanceDays}</TableCell>
                        <TableCell className="text-right tabular-nums">{run.leaveDays}</TableCell>
                        <TableCell className="text-right tabular-nums">{run.okCount}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", run.failedCount > 0 && "text-red-600 dark:text-red-400")}>{run.failedCount}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{run.skippedCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>
  );
}

/**
 * Standalone /payroll-sync route. The primary surface now lives as a
 * tab on /payroll (Payroll → Sync), but direct-link / bookmark usage
 * continues to work via this wrapper.
 */
export default function PayrollSyncPage() {
  return (
    <PageLayout title="Payroll Sync" description="Push OrderFlow attendance and leave into RazorpayX Payroll.">
      <div className="p-6">
        <PayrollSyncContent />
      </div>
    </PageLayout>
  );
}

// ── Shared pieces ───────────────────────────────────────────────────

function SectionCard({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold leading-none">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-6 pb-5">{children}</div>
    </div>
  );
}

const TILE: Record<string, string> = {
  brand: "bg-brand/10 text-brand",
  muted: "bg-muted text-muted-foreground",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function Kpi({ icon: Icon, label, value, loading, tone = "muted" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value?: number; loading: boolean;
  tone?: "brand" | "muted" | "emerald" | "amber" | "red";
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg", TILE[tone])}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {loading ? (
        <Skeleton className="h-8 w-12 mt-3" />
      ) : (
        <p className="text-3xl font-semibold tabular-nums tracking-tight mt-3">{value ?? 0}</p>
      )}
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

/** Thin stacked proportion bar — a quiet micro-chart of the run makeup. */
function CompositionBar({ report }: { report: SyncReport }) {
  const t = report.totals;
  const segs = report.mode === "live"
    ? [
        { key: "Sent", n: t.ok, cls: "bg-emerald-500" },
        { key: "Failed", n: t.failed, cls: "bg-red-500" },
        { key: "Skipped", n: t.skipped, cls: "bg-zinc-300 dark:bg-zinc-600" },
      ]
    : [
        { key: "Attendance", n: t.attendanceDays, cls: "bg-brand" },
        { key: "Leave", n: t.leaveDays, cls: "bg-brand/40" },
        { key: "Skipped", n: t.skipped, cls: "bg-zinc-200 dark:bg-zinc-700" },
      ];
  const total = segs.reduce((s, x) => s + x.n, 0);
  if (total === 0) return null;
  return (
    <div className="rounded-xl border bg-card px-5 py-4 space-y-2.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {segs.filter((s) => s.n > 0).map((s) => (
          <div key={s.key} className={cn("h-full", s.cls)} style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-sm", s.cls)} />
            {s.key} <span className="tabular-nums text-foreground font-medium">{s.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function OutcomePill({ outcome }: { outcome: "preview" | "ok" | "failed" }) {
  if (outcome === "ok") return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Sent</span>;
  if (outcome === "failed") return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Failed</span>;
  return <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Preview</span>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status.includes("present") ? "emerald" : status.includes("half") ? "amber" : "brand";
  const cls: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    brand: "bg-brand/10 text-brand",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", cls[tone])}>{status.replace("-", " ")}</span>;
}

function InitialsAvatar({ email }: { email: string }) {
  const local = (email.split("@")[0] || email).replace(/[._-]+/g, " ").trim();
  const parts = local.split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2)).toUpperCase();
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-medium text-brand">
      {initials}
    </span>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Inbox className="h-[18px] w-[18px]" />
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
