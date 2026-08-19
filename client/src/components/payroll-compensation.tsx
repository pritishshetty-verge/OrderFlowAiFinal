/**
 * Payroll → Compensation tab.
 *
 * Monthly payslip generator that auto-computes every variable-pay
 * component from live OrderFlow data (attendance, NDR Delivery Rate,
 * Total Delivery Rate, reshipments delivered, confirmation delivery
 * rate) and lets the admin nudge any field before saving.
 *
 * Data flow:
 *   1. Pick month + store (both drive the metric queries)
 *   2. Pick an employee → GET /api/payroll/preview → autoMetrics + math
 *   3. Admin reviews / overrides → POST /api/payroll/run
 *   4. Server saves to payroll_ledger, renders PDF, emails employee
 *
 * Visual language: matches the RazorpayX Sync tab — indigo brand
 * accent, card-first layout, tinted status pills, InitialsAvatar.
 */
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Wallet, Save, RotateCcw, CheckCircle2, AlertTriangle,
  User as UserIcon, TrendingUp, PackageCheck, Repeat, Store as StoreIcon,
} from "lucide-react";
import type { User } from "@shared/schema";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DEFAULT_REIMBURSEMENT = 349;

// ── Response types (mirror server/routes.ts /api/payroll/preview) ───

interface AutoMetrics {
  deliveryRatePct: number | null;
  teamDeliveryRatePct: number | null;
  brandTdrPct: number | null;
  personalRecoveryRatePct: number | null;
  ndrBreakdown: { total: number; delivered: number; returned: number; cancelled: number; stillOpen: number };
  reshipsCount: number;
  reimbursement: number;
}

interface PayrollPreviewResponse {
  user: {
    id: string; fullName: string; email: string; role: string;
    holidayState: string | null;
    compensationProfile: "ORDER_CONFIRMATION" | "NDR_RTO" | "CHAT_SUPPORT" | null;
    baseSalary: number; employeeId: string | null; department: string | null;
  };
  period: { year: number; month: number };
  attendance: { daysPresent: number; daysLeave: number; expectedWorkingDays: number };
  holidayQuota: {
    annualCap: number; ytdUsed: number; remaining: number;
    autoCountFromCalendar: number; autoCountAfterQuota: number;
  };
  autoMetrics: AutoMetrics;
  math: {
    base: { ratio: number; amount: number; capped: boolean };
    incentives: {
      confirmationBonus: number; teamDeliveryBonus: number;
      recoveryBonus: number; reshipsBonus: number; total: number;
    };
    reimbursement: number;
    finalPayout: number;
  };
  existingLedger: { id: string; status: string; sentAt: string | null; finalPayout: string } | null;
}

interface StoreRow { id: string; shopifyDomain: string | null; isActive: boolean | null; }

// ── Main ─────────────────────────────────────────────────────────────

export function PayrollCompensationContent() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [storeId, setStoreId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const users = useQuery<User[]>({ queryKey: ["/api/users"] });
  const stores = useQuery<StoreRow[]>({ queryKey: ["/api/stores"] });

  // Default the store selector to the first active store (avoids the
  // "oldest store" middleware fallback picking a closed one).
  useEffect(() => {
    if (!storeId && stores.data?.length) {
      const active = stores.data.find((s) => s.isActive) ?? stores.data[0];
      setStoreId(active.id);
    }
  }, [stores.data, storeId]);

  // Only employees with a base salary set can be paid.
  const employees = useMemo(() => {
    const list = users.data ?? [];
    return list
      .filter((u) => u.isActive && u.baseSalary != null && Number(u.baseSalary) > 0)
      .sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));
  }, [users.data]);

  // Auto-select the first employee when the list first arrives so the
  // preview panel isn't empty.
  useEffect(() => {
    if (!selectedUserId && employees.length) setSelectedUserId(employees[0].id);
  }, [employees, selectedUserId]);

  const yearOptions = useMemo(() => [now.getFullYear(), now.getFullYear() - 1], [now]);

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Controls row — period + store selector */}
      <div className="rounded-2xl border bg-card shadow-sm p-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <StoreIcon className="w-4 h-4 text-muted-foreground" />
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Store" /></SelectTrigger>
            <SelectContent>
              {(stores.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.shopifyDomain ?? s.id.slice(0, 8)} {s.isActive === false && " · closed"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Split layout: employee list left, payslip card right */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <EmployeeList
          employees={employees}
          loading={users.isLoading}
          selectedId={selectedUserId}
          onSelect={setSelectedUserId}
        />
        <div>
          {selectedUserId ? (
            <PayslipCard
              key={`${selectedUserId}-${year}-${month}-${storeId}`}
              userId={selectedUserId}
              year={year}
              month={month}
              storeId={storeId}
            />
          ) : (
            <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
              Pick an employee on the left to preview their payslip.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Employee list ────────────────────────────────────────────────────

function EmployeeList({
  employees, loading, selectedId, onSelect,
}: {
  employees: User[]; loading: boolean; selectedId: string; onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="px-4 pt-4 pb-2 border-b">
        <h3 className="text-sm font-semibold">Employees</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{employees.length} eligible for payroll</p>
      </div>
      <div className="p-2 space-y-1 max-h-[560px] overflow-y-auto">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-2 flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-2 w-16" /></div>
            </div>
          ))
        ) : employees.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 text-center">No employees have a base salary set.</p>
        ) : (
          employees.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelect(u.id)}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                selectedId === u.id ? "bg-brand/10 text-foreground" : "hover:bg-muted",
              )}
            >
              <InitialsAvatar name={u.fullName ?? u.email ?? "?"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{u.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  ₹{Number(u.baseSalary).toLocaleString("en-IN")} · {profileShort(u.compensationProfile as any)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Payslip preview card ─────────────────────────────────────────────

function PayslipCard({
  userId, year, month, storeId,
}: { userId: string; year: number; month: number; storeId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentUserId = localStorage.getItem("userId") ?? "";

  // Server-computed preview. Includes autoMetrics + math with all
  // bonuses/reimbursement/finalPayout.
  const previewQueryKey = [
    `/api/payroll/preview?userId=${userId}&year=${year}&month=${month}&storeId=${storeId}&currentUserId=${currentUserId}`,
  ];
  const preview = useQuery<PayrollPreviewResponse>({
    queryKey: previewQueryKey,
    enabled: Boolean(userId && storeId),
  });

  // Editable overrides. Initialized from server values on first
  // successful fetch; admin can nudge any field before saving.
  const [overrides, setOverrides] = useState<{
    daysPresent?: number; paidHolidaysUsed?: number;
    deliveryRatePct?: number | null; teamDeliveryRatePct?: number | null;
    personalRecoveryRatePct?: number | null; reshipsCount?: number;
    reimbursement?: number; notes?: string;
  }>({});

  const [dirty, setDirty] = useState(false);

  // Sync overrides when the preview first arrives OR when the key
  // changes (different employee / month).
  useEffect(() => {
    if (preview.data) {
      setOverrides({
        daysPresent: preview.data.attendance.daysPresent,
        paidHolidaysUsed: preview.data.holidayQuota.autoCountAfterQuota,
        deliveryRatePct: preview.data.autoMetrics.deliveryRatePct,
        teamDeliveryRatePct: preview.data.autoMetrics.teamDeliveryRatePct,
        personalRecoveryRatePct: preview.data.autoMetrics.personalRecoveryRatePct,
        reshipsCount: preview.data.autoMetrics.reshipsCount,
        reimbursement: preview.data.autoMetrics.reimbursement ?? DEFAULT_REIMBURSEMENT,
        notes: "",
      });
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.data?.user.id, preview.data?.period.year, preview.data?.period.month]);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payroll/run", {
        userId, year, month,
        ...overrides,
        currentUserId,
      });
      return await res.json();
    },
    onSuccess: (result: any) => {
      toast({
        title: "Payslip saved",
        description: result.emailSent
          ? `₹${Number(result.ledger.finalPayout).toLocaleString("en-IN")} finalised and emailed.`
          : `Saved as ₹${Number(result.ledger.finalPayout).toLocaleString("en-IN")}. Email failed — you can retry.`,
        variant: result.emailSent ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: previewQueryKey });
      setDirty(false);
    },
    onError: (e: any) => {
      toast({
        title: "Save failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Re-derive finalPayout client-side using the CURRENT overrides so
  // the total updates instantly as the admin edits fields. The server
  // is the source of truth on save; this is preview math only.
  const liveTotal = useMemo(() => {
    if (!preview.data) return 0;
    const base = preview.data.math.base.amount;
    const inc = preview.data.math.incentives.total;
    const reimb = Number(overrides.reimbursement ?? DEFAULT_REIMBURSEMENT);
    // NOTE: this assumes bonuses don't change when the admin edits a
    // rate (which they might, tier-wise). Backend recomputes on save
    // and shows the authoritative total in the success toast.
    return round2(base + inc + reimb);
  }, [preview.data, overrides.reimbursement]);

  if (preview.isLoading) return <SkeletonCard />;
  if (preview.error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-600 dark:text-red-400">
        <AlertTriangle className="inline w-4 h-4 mr-2" />
        Failed to load preview. {(preview.error as any)?.message ?? ""}
      </div>
    );
  }
  if (!preview.data) return null;

  const p = preview.data;
  const profile = p.user.compensationProfile;

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <InitialsAvatar name={p.user.fullName} size={40} />
          <div>
            <p className="font-semibold">{p.user.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {p.user.role} · {profileLong(profile)} · {MONTHS[p.period.month - 1]} {p.period.year}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Final payout</p>
          <p className="text-2xl font-semibold tabular-nums">₹{liveTotal.toLocaleString("en-IN")}</p>
          {p.existingLedger && (
            <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              Saved: ₹{Number(p.existingLedger.finalPayout).toLocaleString("en-IN")} · {p.existingLedger.status}
            </p>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="divide-y">
        {/* Attendance & base pay */}
        <Section title="Base pay" icon={UserIcon}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Base salary" value={`₹${p.user.baseSalary.toLocaleString("en-IN")}`} />
            <Stat label="Working days" value={p.attendance.expectedWorkingDays} />
            <EditableStat
              label="Days present"
              value={overrides.daysPresent ?? p.attendance.daysPresent}
              autoValue={p.attendance.daysPresent}
              onChange={(v) => { setOverrides((o) => ({ ...o, daysPresent: v })); setDirty(true); }}
            />
            <EditableStat
              label="Paid holidays"
              value={overrides.paidHolidaysUsed ?? p.holidayQuota.autoCountAfterQuota}
              autoValue={p.holidayQuota.autoCountAfterQuota}
              onChange={(v) => { setOverrides((o) => ({ ...o, paidHolidaysUsed: v })); setDirty(true); }}
              hint={`${p.holidayQuota.remaining}/${p.holidayQuota.annualCap} left this year`}
            />
          </div>
          <div className="mt-4 rounded-lg bg-muted/40 px-4 py-2.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Ratio × base = {(p.math.base.ratio * 100).toFixed(1)}% × ₹{p.user.baseSalary.toLocaleString("en-IN")}
              {p.math.base.capped && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">capped @ 100%</span>}
            </span>
            <span className="font-semibold tabular-nums">₹{p.math.base.amount.toLocaleString("en-IN")}</span>
          </div>
        </Section>

        {/* Variable pay — profile-dependent */}
        {profile === "NDR_RTO" && (
          <Section title="Variable pay" icon={TrendingUp}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TierBox
                icon={TrendingUp}
                label="Total Delivery Rate (TDR)"
                ratePct={overrides.teamDeliveryRatePct ?? p.autoMetrics.brandTdrPct}
                bonus={p.math.incentives.teamDeliveryBonus}
                onRateChange={(v) => { setOverrides((o) => ({ ...o, teamDeliveryRatePct: v })); setDirty(true); }}
                tiers="≥80% → ₹2,000  ·  ≥90% → ₹5,000"
                autoRate={p.autoMetrics.brandTdrPct}
              />
              <TierBox
                icon={PackageCheck}
                label="NDR Delivery Rate"
                ratePct={overrides.personalRecoveryRatePct ?? p.autoMetrics.personalRecoveryRatePct}
                bonus={p.math.incentives.recoveryBonus}
                onRateChange={(v) => { setOverrides((o) => ({ ...o, personalRecoveryRatePct: v })); setDirty(true); }}
                tiers="≥30% → ₹3K  ·  ≥40% → ₹6K  ·  ≥50% → ₹10K"
                autoRate={p.autoMetrics.personalRecoveryRatePct}
                sublabel={
                  <span className="text-[10px] text-muted-foreground">
                    {p.autoMetrics.ndrBreakdown.delivered}/{p.autoMetrics.ndrBreakdown.total} delivered
                    {p.autoMetrics.ndrBreakdown.stillOpen > 0 && ` · ${p.autoMetrics.ndrBreakdown.stillOpen} open`}
                  </span>
                }
              />
              <CountBox
                icon={Repeat}
                label="Reshipments delivered"
                count={overrides.reshipsCount ?? p.autoMetrics.reshipsCount}
                autoCount={p.autoMetrics.reshipsCount}
                bonus={p.math.incentives.reshipsBonus}
                onChange={(v) => { setOverrides((o) => ({ ...o, reshipsCount: v })); setDirty(true); }}
                rate="₹50 each"
              />
            </div>
            <div className="mt-4 rounded-lg bg-muted/40 px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Variable pay subtotal</span>
              <span className="font-semibold tabular-nums">₹{p.math.incentives.total.toLocaleString("en-IN")}</span>
            </div>
          </Section>
        )}

        {profile === "ORDER_CONFIRMATION" && (
          <Section title="Variable pay" icon={TrendingUp}>
            <TierBox
              icon={TrendingUp}
              label="Confirmation delivery rate"
              ratePct={overrides.deliveryRatePct ?? p.autoMetrics.deliveryRatePct}
              bonus={p.math.incentives.confirmationBonus}
              onRateChange={(v) => { setOverrides((o) => ({ ...o, deliveryRatePct: v })); setDirty(true); }}
              tiers="≥75% → ₹5K · ≥85% → ₹7.5K · ≥90% → ₹10K"
              autoRate={p.autoMetrics.deliveryRatePct}
            />
          </Section>
        )}

        {(!profile || profile === "CHAT_SUPPORT") && (
          <Section title="Variable pay" icon={TrendingUp}>
            <p className="text-sm text-muted-foreground">
              {profile === "CHAT_SUPPORT"
                ? "Chat support role has no variable pay component."
                : "No compensation profile set — variable pay is zero. Set a profile in Team → Edit compensation."}
            </p>
          </Section>
        )}

        {/* Reimbursement */}
        <Section title="Reimbursement" icon={Wallet}>
          <div className="flex items-end gap-4">
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Amount</Label>
              <div className="relative mt-1">
                <span className="absolute inset-y-0 left-2 flex items-center text-sm text-muted-foreground">₹</span>
                <Input
                  type="number"
                  className="pl-6 tabular-nums"
                  value={overrides.reimbursement ?? DEFAULT_REIMBURSEMENT}
                  onChange={(e) => { setOverrides((o) => ({ ...o, reimbursement: Number(e.target.value) })); setDirty(true); }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground pb-2.5">
              Default ₹{DEFAULT_REIMBURSEMENT}. Set to 0 for employees without a reimbursement line.
            </p>
          </div>
        </Section>

        {/* Notes */}
        <Section title="Notes" icon={undefined}>
          <Textarea
            placeholder="Optional — reason for any overrides, one-off bonuses, etc."
            className="h-20"
            value={overrides.notes ?? ""}
            onChange={(e) => { setOverrides((o) => ({ ...o, notes: e.target.value })); setDirty(true); }}
          />
        </Section>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-muted/30">
          <div className="text-sm">
            <p className="text-muted-foreground">Total payout</p>
            <p className="text-xl font-semibold tabular-nums">₹{liveTotal.toLocaleString("en-IN")}</p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => {
                setOverrides({
                  daysPresent: p.attendance.daysPresent,
                  paidHolidaysUsed: p.holidayQuota.autoCountAfterQuota,
                  deliveryRatePct: p.autoMetrics.deliveryRatePct,
                  teamDeliveryRatePct: p.autoMetrics.teamDeliveryRatePct,
                  personalRecoveryRatePct: p.autoMetrics.personalRecoveryRatePct,
                  reshipsCount: p.autoMetrics.reshipsCount,
                  reimbursement: p.autoMetrics.reimbursement ?? DEFAULT_REIMBURSEMENT,
                  notes: "",
                });
                setDirty(false);
              }}>
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Reset
              </Button>
            )}
            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              style={{ backgroundImage: "var(--brand-gradient)", color: "hsl(var(--brand-foreground))" }}
            >
              <Save className="w-4 h-4 mr-2" />
              {runMutation.isPending ? "Saving…" : p.existingLedger ? "Re-save & email" : "Save & email"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small building blocks ────────────────────────────────────────────

function Section({ title, icon: Icon, children }: {
  title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-brand" />}
        {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function EditableStat({
  label, value, autoValue, onChange, hint,
}: {
  label: string; value: number; autoValue: number; onChange: (v: number) => void; hint?: string;
}) {
  const overridden = value !== autoValue;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {label}
        {overridden && <span className="text-[9px] rounded-sm bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1">edited</span>}
      </p>
      <Input
        type="number"
        className="h-8 mt-0.5 tabular-nums"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function TierBox({
  icon: Icon, label, ratePct, bonus, onRateChange, tiers, autoRate, sublabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  ratePct: number | null;
  bonus: number;
  onRateChange: (v: number | null) => void;
  tiers: string;
  autoRate: number | null;
  sublabel?: React.ReactNode;
}) {
  const overridden = ratePct !== autoRate;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-brand" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <Input
          type="number"
          step="0.01"
          className="h-8 w-20 tabular-nums text-lg font-semibold"
          value={ratePct ?? ""}
          placeholder="—"
          onChange={(e) => onRateChange(e.target.value === "" ? null : Number(e.target.value))}
        />
        <span className="text-sm text-muted-foreground">%</span>
        {overridden && <span className="text-[9px] rounded-sm bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1">edited</span>}
      </div>
      {sublabel && <div className="mt-1">{sublabel}</div>}
      <p className="text-[10px] text-muted-foreground mt-2">{tiers}</p>
      <div className="mt-2 pt-2 border-t flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Bonus</span>
        <span className="font-semibold tabular-nums">₹{bonus.toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
}

function CountBox({
  icon: Icon, label, count, autoCount, bonus, onChange, rate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; count: number; autoCount: number; bonus: number;
  onChange: (v: number) => void; rate: string;
}) {
  const overridden = count !== autoCount;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-brand" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <Input
          type="number"
          className="h-8 w-20 tabular-nums text-lg font-semibold"
          value={count}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {overridden && <span className="text-[9px] rounded-sm bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1">edited</span>}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">{rate}</p>
      <div className="mt-2 pt-2 border-t flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Bonus</span>
        <span className="font-semibold tabular-nums">₹{bonus.toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
}

function InitialsAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-medium"
      style={{ height: size, width: size, fontSize: size * 0.35 }}
    >
      {initials}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function profileShort(p: string | null | undefined): string {
  switch (p) {
    case "NDR_RTO": return "NDR/RTO";
    case "ORDER_CONFIRMATION": return "Confirmation";
    case "CHAT_SUPPORT": return "Chat support";
    default: return "No profile";
  }
}

function profileLong(p: string | null | undefined): string {
  switch (p) {
    case "NDR_RTO": return "NDR/RTO agent (TDR + NDR Delivery + Reshipments)";
    case "ORDER_CONFIRMATION": return "Order confirmation agent (delivery rate bonus)";
    case "CHAT_SUPPORT": return "Chat support (base only)";
    default: return "No compensation profile";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
