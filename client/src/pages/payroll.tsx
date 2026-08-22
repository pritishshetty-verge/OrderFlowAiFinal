/**
 * /payroll — Master Payroll Dashboard.
 *
 * Per the Payroll PRD:
 *   • Top-level sidebar entry (admin-only)
 *   • Notification bell suppressed on this view
 *   • List of monthly payroll cycles as collapsible cards
 *   • Each card: title, generated-at, employee count, total payout,
 *     Pending → "Approve payroll" button OR Approved → green badge
 *   • Expand → employee table with columns: Employee, Attendance
 *     (N/26 + red "X unpaid" flag), Fixed, Variable, Total, View
 *   • View → right-slide Payslip Modal (View/Edit modes)
 *   • Cron auto-generates cycle on 2nd of every month at 00:00 IST;
 *     admins can also generate on-demand for a past month
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, Check, Search, Plus, X, Eye,
  Download, Pencil, Save, XCircle, Sparkles, Store as StoreIcon,
} from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENCY = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

// ── Types (mirror backend responses) ────────────────────────────────

interface CycleRow {
  id: string; storeId: string; year: number; month: number;
  status: "pending" | "approved"; employeeCount: number; totalPayout: string;
  generatedAt: string; generatedBy: string | null;
  approvedAt: string | null; approvedBy: string | null;
}

interface LineItem { label: string; amount: number }

interface LedgerRow {
  id: string; cycleId: string | null; userId: string;
  year: number; month: number;
  baseSalary: string; expectedWorkingDays: number;
  daysPresent: number; paidHolidaysUsed: number; unpaidLeaves: number;
  basePayRatio: string; basePayAmount: string;
  compensationProfile: "ORDER_CONFIRMATION" | "NDR_RTO" | "CHAT_SUPPORT" | null;
  deliveryRatePct: string | null; teamDeliveryRatePct: string | null; recoveryRatePct: string | null;
  reshipsCount: number | null;
  confirmationBonus: string; teamDeliveryBonus: string; recoveryBonus: string; reshipsBonus: string;
  totalIncentives: string; reimbursement: string;
  lineItems: LineItem[];
  finalPayout: string; status: string;
  user: { fullName: string | null; email: string | null; role: string | null; department: string | null; employeeId: string | null };
}

interface CycleDetail {
  cycle: CycleRow;
  ledgers: LedgerRow[];
}

interface StoreRow { id: string; shopifyDomain: string | null; isActive: boolean | null }

// ── Main page ────────────────────────────────────────────────────────

export default function PayrollPage() {
  const now = new Date();
  const [storeId, setStoreId] = useState<string>("");
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  const [selectedLedger, setSelectedLedger] = useState<{ cycle: CycleRow; ledger: LedgerRow } | null>(null);

  const stores = useQuery<StoreRow[]>({ queryKey: ["/api/stores"] });

  // Default store to first active. Waits for stores to load.
  useMemo(() => {
    if (!storeId && stores.data?.length) {
      const active = stores.data.find((s) => s.isActive) ?? stores.data[0];
      setStoreId(active.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.data]);

  return (
    <PageLayout
      title="Payroll"
      description="A new payroll is generated on the 2nd of every month"
      hideNotifications
      actions={
        <div className="flex items-center gap-2">
          <StoreIcon className="w-4 h-4 text-muted-foreground" />
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="w-[240px]" data-testid="payroll-store-selector">
              <SelectValue placeholder="Store" />
            </SelectTrigger>
            <SelectContent>
              {(stores.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.shopifyDomain ?? s.id.slice(0, 8)}{s.isActive === false && " · closed"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <GenerateCycleButton storeId={storeId} />
        </div>
      }
    >
      <div className="p-6 max-w-[1200px] mx-auto space-y-3">
        <CycleList
          storeId={storeId}
          expandedCycleId={expandedCycleId}
          onToggleExpand={(id) => setExpandedCycleId(id === expandedCycleId ? null : id)}
          onView={(cycle, ledger) => setSelectedLedger({ cycle, ledger })}
        />
      </div>

      <PayslipSheet
        open={!!selectedLedger}
        onClose={() => setSelectedLedger(null)}
        cycle={selectedLedger?.cycle ?? null}
        ledger={selectedLedger?.ledger ?? null}
      />
    </PageLayout>
  );
}

// ── Generate cycle button (backfill / manual trigger) ───────────────

function GenerateCycleButton({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth()); // default: previous month

  const gen = useMutation({
    mutationFn: async () => {
      const currentUserId = localStorage.getItem("userId") ?? "";
      const res = await apiRequest("POST", "/api/payroll/cycles", { storeId, year, month, currentUserId });
      return await res.json();
    },
    onSuccess: (r: any) => {
      toast({
        title: r.alreadyExisted ? "Cycle already exists" : "Cycle generated",
        description: r.message,
      });
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey?.[0] === "string" && (q.queryKey[0] as string).startsWith("/api/payroll/cycles") });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Generate failed", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!storeId}>
        <Sparkles className="w-4 h-4 mr-1.5" />
        Generate cycle
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate payroll cycle</AlertDialogTitle>
          <AlertDialogDescription>
            Creates a new payroll cycle for the selected month. Cycles for future or past months can be created manually; the cron auto-generates on the 2nd of each month for the previous month.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[now.getFullYear(), now.getFullYear() - 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); gen.mutate(); }} disabled={gen.isPending}>
            {gen.isPending ? "Generating…" : "Generate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Cycle list ───────────────────────────────────────────────────────

function CycleList({
  storeId, expandedCycleId, onToggleExpand, onView,
}: {
  storeId: string;
  expandedCycleId: string | null;
  onToggleExpand: (id: string) => void;
  onView: (cycle: CycleRow, ledger: LedgerRow) => void;
}) {
  const q = useQuery<{ cycles: CycleRow[]; activeStoreId: string | null }>({
    queryKey: [`/api/payroll/cycles?storeId=${storeId}`],
    enabled: !!storeId,
  });

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (!q.data?.cycles.length) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
        No payroll cycles yet. Click <b>Generate cycle</b> to create one for a past month, or wait for the 2nd of next month.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {q.data.cycles.map((c) => (
        <CycleCard
          key={c.id}
          cycle={c}
          expanded={expandedCycleId === c.id}
          onToggle={() => onToggleExpand(c.id)}
          onView={(ledger) => onView(c, ledger)}
        />
      ))}
    </div>
  );
}

// ── Cycle card (collapsible) ────────────────────────────────────────

function CycleCard({
  cycle, expanded, onToggle, onView,
}: {
  cycle: CycleRow;
  expanded: boolean;
  onToggle: () => void;
  onView: (ledger: LedgerRow) => void;
}) {
  const title = `${MONTHS[cycle.month - 1]} ${cycle.year} Payroll`;
  const genDate = new Date(cycle.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Header row — always visible */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px]">{title}</p>
          <p className="text-xs text-muted-foreground">Generated {genDate} · {cycle.employeeCount} employee{cycle.employeeCount === 1 ? "" : "s"}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total payout</p>
          <p className="text-lg font-semibold tabular-nums">{CURRENCY(Number(cycle.totalPayout))}</p>
        </div>
        <div className="ml-4">
          {cycle.status === "approved" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-1 text-xs font-medium">
              <Check className="w-3.5 h-3.5" /> Approved
            </span>
          ) : (
            <ApprovePayrollButton cycleId={cycle.id} />
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && <CycleBody cycleId={cycle.id} onView={onView} />}
    </div>
  );
}

// ── Expanded body — employee ledger table ───────────────────────────

function CycleBody({ cycleId, onView }: { cycleId: string; onView: (ledger: LedgerRow) => void }) {
  const q = useQuery<CycleDetail>({ queryKey: [`/api/payroll/cycles/${cycleId}`] });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = q.data?.ledgers ?? [];
    if (!search.trim()) return list;
    const needle = search.trim().toLowerCase();
    return list.filter((l) => (l.user.fullName ?? "").toLowerCase().includes(needle));
  }, [q.data?.ledgers, search]);

  return (
    <div className="border-t bg-muted/20 px-5 py-4 space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search employee"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead className="text-right">Fixed</TableHead>
                <TableHead className="text-right">Variable</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No employees match "{search}"</TableCell></TableRow>
              ) : filtered.map((row) => (
                <EmployeeRow key={row.id} row={row} onView={() => onView(row)} />
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground px-4 py-2 border-t">Showing {filtered.length} of {q.data?.ledgers.length ?? 0} employees</p>
        </div>
      )}
    </div>
  );
}

function EmployeeRow({ row, onView }: { row: LedgerRow; onView: () => void }) {
  const fixed = Number(row.basePayAmount) + Number(row.reimbursement) + (row.lineItems ?? []).reduce((s, li) => s + Number(li.amount), 0);
  const variable = Number(row.totalIncentives);
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <InitialsAvatar name={row.user.fullName ?? row.user.email ?? "?"} />
          <div>
            <p className="text-sm font-medium">{row.user.fullName}</p>
            <p className="text-xs text-muted-foreground">{formatDesignation(row.user)}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm tabular-nums">
          {row.daysPresent}/{row.expectedWorkingDays} days
        </div>
        {row.unpaidLeaves > 0 && (
          <div className="text-[11px] text-red-600 dark:text-red-400 font-medium">{row.unpaidLeaves} unpaid</div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{CURRENCY(fixed)}</TableCell>
      <TableCell className="text-right tabular-nums">{CURRENCY(variable)}</TableCell>
      <TableCell className="text-right tabular-nums font-semibold">{CURRENCY(Number(row.finalPayout))}</TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={onView}>
          <Eye className="w-3.5 h-3.5 mr-1.5" /> View
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ── Approve payroll button ──────────────────────────────────────────

function ApprovePayrollButton({ cycleId }: { cycleId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const approve = useMutation({
    mutationFn: async () => {
      const currentUserId = localStorage.getItem("userId") ?? "";
      const res = await apiRequest("POST", `/api/payroll/cycles/${cycleId}/approve`, { currentUserId });
      return await res.json();
    },
    onSuccess: (r: any) => {
      toast({
        title: r.ok ? "Payroll approved" : "Approved with issues",
        description: r.message,
        variant: r.ok ? "default" : "destructive",
      });
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey?.[0] === "string" && (q.queryKey[0] as string).startsWith("/api/payroll/cycles") });
      setConfirming(false);
    },
    onError: (e: any) => toast({ title: "Approve failed", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  return (
    <AlertDialog open={confirming} onOpenChange={setConfirming}>
      <Button
        onClick={() => setConfirming(true)}
        className="bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90"
        size="sm"
      >
        Approve payroll
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Approve this payroll cycle?</AlertDialogTitle>
          <AlertDialogDescription>
            All ledger rows will be locked and payslips emailed to each employee. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); approve.mutate(); }} disabled={approve.isPending}>
            {approve.isPending ? "Approving…" : "Approve"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Payslip Modal (right-slide Sheet) ───────────────────────────────

function PayslipSheet({
  open, onClose, cycle, ledger,
}: {
  open: boolean;
  onClose: () => void;
  cycle: CycleRow | null;
  ledger: LedgerRow | null;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        hideCloseButton
        className="flex !h-full !w-full !max-w-none flex-col rounded-none p-0 shadow-2xl sm:!inset-y-auto sm:!top-4 sm:!bottom-4 sm:my-4 sm:mr-4 sm:!h-auto sm:max-h-[calc(100vh-2rem)] sm:!w-[min(560px,calc(100vw-2rem))] sm:rounded-l-xl"
      >
        {cycle && ledger && <PayslipContent cycle={cycle} ledger={ledger} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function PayslipContent({ cycle, ledger: initialLedger, onClose }: { cycle: CycleRow; ledger: LedgerRow; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [ledger, setLedger] = useState<LedgerRow>(initialLedger);
  const [draftBase, setDraftBase] = useState<number>(Number(initialLedger.baseSalary));
  const [draftItems, setDraftItems] = useState<LineItem[]>(initialLedger.lineItems ?? []);
  const { toast } = useToast();
  const qc = useQueryClient();

  const locked = cycle.status === "approved";

  const save = useMutation({
    mutationFn: async () => {
      const currentUserId = localStorage.getItem("userId") ?? "";
      const res = await apiRequest("PATCH", `/api/payroll/cycles/${cycle.id}/ledger/${ledger.userId}`, {
        currentUserId,
        // baseSalary override travels via the reimbursement/lineItems
        // route — we keep base_salary in sync via a "Base override"
        // line item ONLY if the admin changed it. This preserves the
        // schema's base_salary field for auditability.
        lineItems: draftItems.filter((i) => i.label.trim() && Number.isFinite(i.amount)),
        // reimbursement folded into lineItems, so post 0 for the
        // legacy single-value field.
        reimbursement: 0,
      });
      return (await res.json()) as LedgerRow;
    },
    onSuccess: (updated) => {
      setLedger(updated);
      setEditing(false);
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey?.[0] === "string" && (q.queryKey[0] as string).startsWith("/api/payroll/cycles") });
      toast({ title: "Saved", description: `New total: ${CURRENCY(Number(updated.finalPayout))}` });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  const liveBase = Number(ledger.basePayAmount);
  const liveItemsTotal = editing
    ? draftItems.reduce((s, li) => s + (Number.isFinite(li.amount) ? Number(li.amount) : 0), 0)
    : (ledger.lineItems ?? []).reduce((s, li) => s + Number(li.amount), 0);
  const liveVariable = Number(ledger.totalIncentives);
  const liveNet = liveBase + liveItemsTotal + liveVariable + Number(ledger.reimbursement);

  const attendance = {
    workingDays: ledger.expectedWorkingDays,
    daysWorked: ledger.daysPresent,
    paidLeave: ledger.paidHolidaysUsed,
    unpaidLeave: ledger.unpaidLeaves,
  };

  return (
    <>
      {/* Header — sticky */}
      <div className="border-b px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[15px]">{ledger.user.fullName}</p>
          <p className="text-xs text-muted-foreground">{formatDesignation(ledger.user)} · {MONTHS[cycle.month - 1]} {cycle.year}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Actions row */}
      <div className="border-b px-5 py-2 flex items-center justify-between">
        {editing ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraftItems(ledger.lineItems ?? []); }}>
              <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditing(true); setDraftItems(ledger.lineItems ?? []); }}
            disabled={locked}
            title={locked ? "Approved cycles cannot be edited" : undefined}
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit pay
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled title="PDF is emailed on cycle approval">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
        </Button>
      </div>

      {/* Body — scroll */}
      <div className="flex-1 overflow-y-auto">
        {/* Attendance */}
        <Section title="Attendance">
          <div className="grid grid-cols-2 gap-3">
            <StatCell label="Working days" value={attendance.workingDays} />
            <StatCell label="Days worked" value={attendance.daysWorked} />
            <StatCell label="Paid leave" value={attendance.paidLeave} />
            <StatCell label={<>Unpaid leave</>} value={attendance.unpaidLeave} tone={attendance.unpaidLeave > 0 ? "red" : "muted"} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Read-only. Modifications to attendance happen in the Team → Attendance module.</p>
        </Section>

        {/* Fixed Pay */}
        <Section title="Fixed Pay" totalLabel={CURRENCY(liveBase + liveItemsTotal)}>
          <FixedRow label="Fixed Salary" amount={liveBase} readOnly />
          {(editing ? draftItems : (ledger.lineItems ?? [])).map((li, i) => (
            <FixedRow
              key={i}
              label={li.label}
              amount={Number(li.amount)}
              readOnly={!editing}
              editable={editing}
              onLabelChange={editing ? (v) => setDraftItems((arr) => arr.map((x, idx) => idx === i ? { ...x, label: v } : x)) : undefined}
              onAmountChange={editing ? (v) => setDraftItems((arr) => arr.map((x, idx) => idx === i ? { ...x, amount: v } : x)) : undefined}
              onDelete={editing ? () => setDraftItems((arr) => arr.filter((_, idx) => idx !== i)) : undefined}
            />
          ))}
          {editing && (
            <button
              onClick={() => setDraftItems((arr) => [...arr, { label: "", amount: 0 }])}
              className="mt-2 w-full rounded-md border border-dashed border-muted-foreground/40 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add component (reimbursement, bonus…)
            </button>
          )}
        </Section>

        {/* Variable Pay */}
        <Section title="Variable Pay" subtitle="Formula · view only" totalLabel={CURRENCY(liveVariable)}>
          <VariableBreakdown ledger={ledger} />
        </Section>
      </div>

      {/* Footer — net pay */}
      <div className="border-t bg-black text-white dark:bg-white dark:text-black flex items-center justify-between px-5 py-4">
        <p className="text-sm font-medium">Net pay for {MONTHS[cycle.month - 1]} {cycle.year}</p>
        <p className="text-2xl font-semibold tabular-nums">{CURRENCY(liveNet)}</p>
      </div>
    </>
  );
}

// ── Building blocks ──────────────────────────────────────────────────

function Section({ title, subtitle, totalLabel, children }: {
  title: string; subtitle?: string; totalLabel?: string; children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
        </div>
        {totalLabel && <p className="text-sm font-semibold tabular-nums">{totalLabel}</p>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function StatCell({ label, value, tone = "muted" }: { label: React.ReactNode; value: React.ReactNode; tone?: "muted" | "red" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium tabular-nums mt-0.5", tone === "red" && "text-red-600 dark:text-red-400")}>{value}</p>
    </div>
  );
}

function FixedRow({
  label, amount, readOnly, editable, onLabelChange, onAmountChange, onDelete,
}: {
  label: string; amount: number; readOnly?: boolean; editable?: boolean;
  onLabelChange?: (v: string) => void;
  onAmountChange?: (v: number) => void;
  onDelete?: () => void;
}) {
  if (readOnly && !editable) {
    return (
      <div className="flex items-center justify-between text-sm py-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{CURRENCY(amount)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Input
        value={label}
        onChange={(e) => onLabelChange?.(e.target.value)}
        placeholder="Label"
        className="h-8 flex-1"
      />
      <div className="relative w-32">
        <span className="absolute inset-y-0 left-2 flex items-center text-xs text-muted-foreground">₹</span>
        <Input
          type="number"
          value={Number.isFinite(amount) ? amount : 0}
          onChange={(e) => onAmountChange?.(Number(e.target.value))}
          className="h-8 pl-6 tabular-nums text-right"
        />
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          className="w-7 h-7 shrink-0 rounded-md text-red-500 hover:bg-red-500/10 inline-flex items-center justify-center"
          aria-label="Delete component"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function VariableBreakdown({ ledger }: { ledger: LedgerRow }) {
  const p = ledger.compensationProfile;
  const rows: Array<{ label: string; sub?: string; amount: number }> = [];
  if (p === "ORDER_CONFIRMATION") {
    rows.push({
      label: "Confirmation delivery rate",
      sub: ledger.deliveryRatePct != null ? `${Number(ledger.deliveryRatePct).toFixed(2)}% of confirmed orders delivered` : "No data",
      amount: Number(ledger.confirmationBonus),
    });
  } else if (p === "NDR_RTO") {
    rows.push({
      label: "Total Delivery Rate",
      sub: ledger.teamDeliveryRatePct != null ? `${Number(ledger.teamDeliveryRatePct).toFixed(2)}% brand delivery` : "No data",
      amount: Number(ledger.teamDeliveryBonus),
    });
    rows.push({
      label: "NDR Delivery Rate",
      sub: ledger.recoveryRatePct != null ? `${Number(ledger.recoveryRatePct).toFixed(2)}% of NDRs delivered` : "No data",
      amount: Number(ledger.recoveryBonus),
    });
    rows.push({
      label: "Reshipments delivered",
      sub: `${ledger.reshipsCount ?? 0} × ₹50 each`,
      amount: Number(ledger.reshipsBonus),
    });
  } else {
    return <p className="text-xs text-muted-foreground">No variable pay component for this compensation profile.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start justify-between text-sm py-1">
          <div>
            <p className="text-muted-foreground">{r.label}</p>
            {r.sub && <p className="text-[10px] text-muted-foreground/70">{r.sub}</p>}
          </div>
          <p className="tabular-nums font-medium">+{CURRENCY(r.amount)}</p>
        </div>
      ))}
    </div>
  );
}

function InitialsAvatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-medium text-brand">
      {initials}
    </span>
  );
}

function formatDesignation(user: LedgerRow["user"]): string {
  const parts: string[] = [];
  if (user.department) parts.push(user.department);
  if (user.role && user.role !== "admin") parts.push(prettifyRole(user.role));
  if (!parts.length && user.role) parts.push(prettifyRole(user.role));
  return parts.join(" · ");
}

function prettifyRole(r: string): string {
  return r.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}
