import { useEffect, useMemo, useState } from "react";
import { Redirect } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Send, FileDown, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────
// Payroll dashboard
//
// Admin-only. For each non-admin user that has a base salary, lets the
// admin preview the auto-derived numbers (attendance, holidays,
// delivery/team rates), override anything (recovery rate + reships
// MUST be entered manually since we don't auto-derive them yet), see
// the live final payout, and on Run dispatch the PDF payslip to the
// employee's email via Resend.
// ─────────────────────────────────────────────────────────────────────

type PreviewResponse = {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    holidayState: string | null;
    compensationProfile: "ORDER_CONFIRMATION" | "NDR_RTO" | null;
    baseSalary: number;
    employeeId: string | null;
    department: string | null;
  };
  period: { year: number; month: number };
  attendance: { daysPresent: number; daysLeave: number; expectedWorkingDays: number };
  holidayQuota: {
    annualCap: number;
    ytdUsed: number;
    remaining: number;
    autoCountFromCalendar: number;
    autoCountAfterQuota: number;
  };
  autoMetrics: {
    deliveryRatePct: number | null;
    teamDeliveryRatePct: number | null;
    personalRecoveryRatePct: number | null;
    reshipsCount: number | null;
  };
  math: {
    base: { ratio: number; amount: number; capped: boolean };
    incentives: {
      confirmationBonus: number;
      teamDeliveryBonus: number;
      recoveryBonus: number;
      reshipsBonus: number;
      total: number;
    };
    finalPayout: number;
  };
  existingLedger: { id: string; status: string; sentAt: string | null; finalPayout: string } | null;
};

type LedgerRow = {
  id: string;
  userId: string;
  status: string;
  finalPayout: string;
  sentAt: string | null;
  pdfFilename: string | null;
  createdAt: string;
  emailError: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PayrollPage() {
  const userRole = typeof window !== "undefined" ? localStorage.getItem("userRole") : null;
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  // Hooks before early return.
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  if (userRole && userRole !== "admin") {
    return <Redirect to="/" />;
  }

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const eligibleUsers = useMemo(() => {
    if (!users) return [];
    // Show admins too (they can have a salary), but skip rows without
    // a base salary set — payroll preview returns 0 finalPayout there
    // and they clutter the dashboard. The hint badge guides admins to
    // set salaries on the team page.
    return users.filter((u) => u.isActive);
  }, [users]);

  const ledgerUrl = `/api/payroll/ledger?year=${year}&month=${month}&currentUserId=${encodeURIComponent(currentUserId ?? "")}`;
  const { data: ledger } = useQuery<LedgerRow[]>({
    queryKey: [ledgerUrl],
    enabled: !!currentUserId,
  });
  const ledgerByUser = useMemo(() => {
    const m = new Map<string, LedgerRow>();
    for (const row of ledger ?? []) m.set(row.userId, row);
    return m;
  }, [ledger]);

  return (
    <PageLayout
      title="Payroll"
      description="Auto-derive monthly payroll, override metrics, and dispatch payslips by email"
    >
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pay period</CardTitle>
            <CardDescription>
              Select a month to preview and run payroll for. Existing runs in this period
              will be re-rendered (PDF + email) when you click Run again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Year</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
                  <SelectTrigger className="w-32" data-testid="select-payroll-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Month</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
                  <SelectTrigger className="w-32" data-testid="select-payroll-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: [ledgerUrl] });
                }}
                className="ml-auto"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {usersLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-full" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {eligibleUsers.map((u) => (
              <PayrollUserCard
                key={u.id}
                user={u}
                year={year}
                month={month}
                currentUserId={currentUserId ?? ""}
                ledger={ledgerByUser.get(u.id) ?? null}
                ledgerUrl={ledgerUrl}
              />
            ))}
            {eligibleUsers.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No active users found.
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Per-user card. Owns its own preview query + form state.
// ─────────────────────────────────────────────────────────────────────

interface PayrollUserCardProps {
  user: User;
  year: number;
  month: number;
  currentUserId: string;
  ledger: LedgerRow | null;
  ledgerUrl: string;
}

function PayrollUserCard({ user, year, month, currentUserId, ledger, ledgerUrl }: PayrollUserCardProps) {
  const { toast } = useToast();

  const previewUrl = `/api/payroll/preview?userId=${user.id}&year=${year}&month=${month}&currentUserId=${encodeURIComponent(currentUserId)}`;
  const { data: preview, isLoading, refetch } = useQuery<PreviewResponse>({
    queryKey: [previewUrl],
    enabled: !!currentUserId,
  });

  // Editable fields. We seed from the preview response and let admin
  // override before running. Stored as strings to keep the inputs
  // controlled cleanly even when null.
  const [daysPresent, setDaysPresent] = useState("");
  const [paidHolidaysUsed, setPaidHolidaysUsed] = useState("");
  const [deliveryRatePct, setDeliveryRatePct] = useState("");
  const [teamDeliveryRatePct, setTeamDeliveryRatePct] = useState("");
  const [personalRecoveryRatePct, setPersonalRecoveryRatePct] = useState("");
  const [reshipsCount, setReshipsCount] = useState("");
  const [notes, setNotes] = useState("");

  // Re-seed inputs whenever the auto-fetched preview lands or period changes.
  useEffect(() => {
    if (!preview) return;
    setDaysPresent(String(preview.attendance.daysPresent));
    setPaidHolidaysUsed(String(preview.holidayQuota.autoCountAfterQuota));
    setDeliveryRatePct(numStr(preview.autoMetrics.deliveryRatePct));
    setTeamDeliveryRatePct(numStr(preview.autoMetrics.teamDeliveryRatePct));
    setPersonalRecoveryRatePct(numStr(preview.autoMetrics.personalRecoveryRatePct));
    setReshipsCount(numStr(preview.autoMetrics.reshipsCount));
  }, [preview]);

  // Live re-compute as admin edits — same tier ladders the server uses,
  // mirrored client-side so the subtotal updates instantly without a
  // round trip. The server is still authoritative on Run.
  const liveMath = useMemo(() => {
    if (!preview) return null;
    return computeLive({
      baseSalary: preview.user.baseSalary,
      expectedWorkingDays: preview.attendance.expectedWorkingDays,
      daysPresent: parseIntOr(daysPresent, 0),
      paidHolidaysUsed: parseIntOr(paidHolidaysUsed, 0),
      compensationProfile: preview.user.compensationProfile,
      deliveryRatePct: parseFloatOrNull(deliveryRatePct),
      teamDeliveryRatePct: parseFloatOrNull(teamDeliveryRatePct),
      personalRecoveryRatePct: parseFloatOrNull(personalRecoveryRatePct),
      reshipsCount: parseIntOr(reshipsCount, 0),
    });
  }, [preview, daysPresent, paidHolidaysUsed, deliveryRatePct, teamDeliveryRatePct, personalRecoveryRatePct, reshipsCount]);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payroll/run", {
        userId: user.id,
        year,
        month,
        daysPresent: parseIntOr(daysPresent, 0),
        paidHolidaysUsed: parseIntOr(paidHolidaysUsed, 0),
        deliveryRatePct: parseFloatOrNull(deliveryRatePct),
        teamDeliveryRatePct: parseFloatOrNull(teamDeliveryRatePct),
        personalRecoveryRatePct: parseFloatOrNull(personalRecoveryRatePct),
        reshipsCount: parseIntOr(reshipsCount, 0),
        notes: notes || null,
        currentUserId,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [ledgerUrl] });
      queryClient.invalidateQueries({ queryKey: [previewUrl] });
      toast({
        title: data.emailSent ? "Payroll dispatched" : "Payroll saved (email failed)",
        description: data.emailSent
          ? `Payslip emailed to ${user.email}`
          : `PDF generated; email failed: ${data.emailError ?? "unknown error"}`,
        variant: data.emailSent ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Run failed",
        description: error?.message ?? "Unable to run payroll",
        variant: "destructive",
      });
    },
  });

  // Header summary
  const profileBadge = preview?.user.compensationProfile
    ? preview.user.compensationProfile === "ORDER_CONFIRMATION"
      ? "Order Confirmation"
      : preview.user.compensationProfile === "NDR_RTO"
        ? "NDR / RTO"
        : "Chat Support"
    : "No profile";

  // baseSalary on the wire is a numeric-string from pg's decimal
  // type. Treat 0 / null / missing identically as "salary not set".
  const rawSalary = (user as any).baseSalary;
  const numericSalary =
    rawSalary == null || rawSalary === "" ? 0 : Number(rawSalary);
  const salaryNotSet = !Number.isFinite(numericSalary) || numericSalary <= 0;

  return (
    <Card data-testid={`payroll-card-${user.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{user.fullName}</CardTitle>
              {salaryNotSet && (
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1 text-[10px] py-0 px-2"
                  data-testid={`badge-no-salary-${user.id}`}
                >
                  <AlertCircle className="h-3 w-3" />
                  Salary not set
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              {user.email} · {user.role} · {profileBadge}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {ledger && (
              <Badge
                variant="outline"
                className={
                  ledger.status === "sent"
                    ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30"
                    : ledger.status === "failed"
                      ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"
                      : "text-muted-foreground"
                }
              >
                {ledger.status === "sent" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {ledger.status === "failed" && <AlertCircle className="h-3 w-3 mr-1" />}
                {ledger.status}
              </Badge>
            )}
            {ledger?.pdfFilename && (
              <a
                href={`/api/payroll/ledger/${ledger.id}/pdf?currentUserId=${encodeURIComponent(currentUserId)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
              </a>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : !preview ? (
          <p className="text-sm text-muted-foreground">Failed to load preview.</p>
        ) : preview.user.baseSalary === 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No base salary set for this user. Update via Team → user card before running payroll.
          </p>
        ) : (
          <div className="space-y-5">
            {/* ── Auto context ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Stat label="Base salary" value={`₹${formatINR(preview.user.baseSalary)}`} />
              <Stat label="Working days (M-F)" value={preview.attendance.expectedWorkingDays} />
              <Stat
                label="Holidays auto"
                value={`${preview.holidayQuota.autoCountAfterQuota} / cap ${preview.holidayQuota.annualCap}`}
                hint={
                  preview.holidayQuota.ytdUsed > 0
                    ? `${preview.holidayQuota.ytdUsed} used YTD · ${preview.holidayQuota.remaining} left`
                    : undefined
                }
              />
              <Stat
                label="State"
                value={preview.user.holidayState ? capitalize(preview.user.holidayState) : "—"}
              />
            </div>

            {/* ── Editable inputs ── */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <NumberInput
                label="Days present"
                hint={`from attendance (${preview.attendance.daysPresent})`}
                value={daysPresent}
                onChange={setDaysPresent}
                testId={`input-days-present-${user.id}`}
              />
              <NumberInput
                label="Paid holidays used"
                hint={`auto ${preview.holidayQuota.autoCountAfterQuota}`}
                value={paidHolidaysUsed}
                onChange={setPaidHolidaysUsed}
                testId={`input-paid-holidays-${user.id}`}
              />
              {preview.user.compensationProfile === "ORDER_CONFIRMATION" && (
                <NumberInput
                  label="Delivery rate %"
                  hint={preview.autoMetrics.deliveryRatePct == null ? "no auto value" : `auto ${preview.autoMetrics.deliveryRatePct}%`}
                  value={deliveryRatePct}
                  onChange={setDeliveryRatePct}
                  testId={`input-delivery-rate-${user.id}`}
                />
              )}
              {preview.user.compensationProfile === "NDR_RTO" && (
                <>
                  <NumberInput
                    label="Team delivery %"
                    hint={preview.autoMetrics.teamDeliveryRatePct == null ? "no auto value" : `auto ${preview.autoMetrics.teamDeliveryRatePct}%`}
                    value={teamDeliveryRatePct}
                    onChange={setTeamDeliveryRatePct}
                    testId={`input-team-delivery-${user.id}`}
                  />
                  <NumberInput
                    label="Personal recovery %"
                    hint="manual entry"
                    value={personalRecoveryRatePct}
                    onChange={setPersonalRecoveryRatePct}
                    testId={`input-recovery-${user.id}`}
                  />
                  <NumberInput
                    label="Reships count"
                    hint="manual entry · ₹50 each"
                    value={reshipsCount}
                    onChange={setReshipsCount}
                    testId={`input-reships-${user.id}`}
                  />
                </>
              )}
              <div className="space-y-1.5 col-span-full">
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Override reason, comments…"
                  data-testid={`input-notes-${user.id}`}
                />
              </div>
            </div>

            {/* ── Live subtotal ── */}
            {liveMath && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">
                    Base pay <span className="text-xs">({(liveMath.base.ratio * 100).toFixed(2)}%{liveMath.base.capped ? " · capped" : ""})</span>
                  </div>
                  <div className="text-right font-mono">₹{formatINR(liveMath.base.amount)}</div>

                  {preview.user.compensationProfile === "ORDER_CONFIRMATION" && (
                    <>
                      <div className="text-muted-foreground">Confirmation bonus</div>
                      <div className="text-right font-mono">₹{formatINR(liveMath.incentives.confirmationBonus)}</div>
                    </>
                  )}
                  {preview.user.compensationProfile === "NDR_RTO" && (
                    <>
                      <div className="text-muted-foreground">Team delivery</div>
                      <div className="text-right font-mono">₹{formatINR(liveMath.incentives.teamDeliveryBonus)}</div>
                      <div className="text-muted-foreground">Recovery</div>
                      <div className="text-right font-mono">₹{formatINR(liveMath.incentives.recoveryBonus)}</div>
                      <div className="text-muted-foreground">Reships ({parseIntOr(reshipsCount, 0)} × ₹50)</div>
                      <div className="text-right font-mono">₹{formatINR(liveMath.incentives.reshipsBonus)}</div>
                    </>
                  )}
                </div>
                <div className="border-t pt-2 grid grid-cols-2 gap-2 text-base">
                  <div className="font-semibold">Final payout</div>
                  <div className="text-right font-mono font-semibold" data-testid={`final-payout-${user.id}`}>
                    ₹{formatINR(liveMath.finalPayout)}
                  </div>
                </div>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-fetch
              </Button>
              <Button
                size="sm"
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
                data-testid={`button-run-payroll-${user.id}`}
              >
                {runMutation.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Running…</>
                ) : (
                  <><Send className="h-3.5 w-3.5 mr-1.5" /> Run payroll</>
                )}
              </Button>
            </div>

            {ledger?.emailError && (
              <p className="text-xs text-destructive">
                Last email error: {ledger.emailError}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tiny presentational helpers ──────────────────────────────────────

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberInput({ label, hint, value, onChange, testId }: { label: string; hint?: string; value: string; onChange: (v: string) => void; testId?: string; }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Live math (mirrors server/services/payroll.ts) ──────────────────
//
// Kept in sync with the server's calculateBasePay /
// calculateConfirmationBonus / calculateNdrRtoBonus. Server is the
// source of truth at Run time; this is purely for the live preview
// number admins see while typing.

const ORDER_CONFIRMATION_TIERS = [
  { minPct: 90, maxPct: Infinity, bonus: 10000 },
  { minPct: 85, maxPct: 90, bonus: 7500 },
  { minPct: 75, maxPct: 85, bonus: 5000 },
];
const TEAM_DELIVERY_TIERS = [
  { minPct: 90, maxPct: Infinity, bonus: 5000 },
  { minPct: 80, maxPct: 90, bonus: 2000 },
];
const PERSONAL_RECOVERY_TIERS = [
  { minPct: 50, maxPct: Infinity, bonus: 10000 },
  { minPct: 40, maxPct: 50, bonus: 6000 },
  { minPct: 30, maxPct: 40, bonus: 3000 },
];

function computeLive(input: {
  baseSalary: number;
  expectedWorkingDays: number;
  daysPresent: number;
  paidHolidaysUsed: number;
  compensationProfile: "ORDER_CONFIRMATION" | "NDR_RTO" | null;
  deliveryRatePct: number | null;
  teamDeliveryRatePct: number | null;
  personalRecoveryRatePct: number | null;
  reshipsCount: number;
}) {
  const rawRatio = input.expectedWorkingDays > 0
    ? (input.daysPresent + input.paidHolidaysUsed) / input.expectedWorkingDays
    : 0;
  const capped = rawRatio > 1;
  const ratio = capped ? 1 : Math.max(0, rawRatio);
  const baseAmount = round2(ratio * input.baseSalary);

  let confirmationBonus = 0;
  let teamDeliveryBonus = 0;
  let recoveryBonus = 0;
  let reshipsBonus = 0;

  if (input.compensationProfile === "ORDER_CONFIRMATION") {
    confirmationBonus = pickTier(input.deliveryRatePct, ORDER_CONFIRMATION_TIERS);
  } else if (input.compensationProfile === "NDR_RTO") {
    teamDeliveryBonus = pickTier(input.teamDeliveryRatePct, TEAM_DELIVERY_TIERS);
    recoveryBonus = pickTier(input.personalRecoveryRatePct, PERSONAL_RECOVERY_TIERS);
    reshipsBonus = Math.max(0, Math.floor(input.reshipsCount)) * 50;
  }
  const total = confirmationBonus + teamDeliveryBonus + recoveryBonus + reshipsBonus;
  return {
    base: { ratio, amount: baseAmount, capped },
    incentives: { confirmationBonus, teamDeliveryBonus, recoveryBonus, reshipsBonus, total },
    finalPayout: round2(baseAmount + total),
  };
}

function pickTier(value: number | null, tiers: { minPct: number; maxPct: number; bonus: number }[]): number {
  if (value == null || !Number.isFinite(value)) return 0;
  for (const t of tiers) if (value >= t.minPct && value < t.maxPct) return t.bonus;
  return 0;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseIntOr(v: string, fallback: number): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function parseFloatOrNull(v: string): number | null {
  if (v === "" || v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function numStr(v: number | null): string {
  return v == null ? "" : String(v);
}
function formatINR(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
