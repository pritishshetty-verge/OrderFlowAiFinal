// ─────────────────────────────────────────────────────────────────────
// Payroll math service
//
// All pure functions. No DB, no fetch, no I/O. The orchestration layer
// (server/routes.ts → /api/payroll/preview & /run) is responsible for
// gathering inputs (attendance counts, delivery rates, holiday totals)
// and feeding them in here. Keeping the math separate from data
// gathering means the engine is unit-testable in isolation and the
// numbers shown in the PDF/email can be reproduced from the
// payroll_ledger row alone.
// ─────────────────────────────────────────────────────────────────────

// ── Constants ────────────────────────────────────────────────────────
//
// Per-year cap: 9 fixed + 2 optional = 11 paid holidays. Used to clip
// the running paidHolidaysUsed argument so a generous month can't spend
// the full year's allowance.
export const ANNUAL_PAID_HOLIDAY_CAP = 11;

// Per-reship bonus (NDR_RTO ladder).
export const RESHIP_BONUS_PER_UNIT = 50;

// Order-confirmation delivery-rate tiers. Inclusive lower bound,
// exclusive upper. Highest matching tier wins.
export const ORDER_CONFIRMATION_TIERS = [
  { minPct: 90, maxPct: Infinity, bonus: 10000 },
  { minPct: 85, maxPct: 90, bonus: 7500 },
  { minPct: 75, maxPct: 85, bonus: 5000 },
] as const;

// NDR/RTO team-delivery tiers (stackable with personal recovery + reships).
export const TEAM_DELIVERY_TIERS = [
  { minPct: 90, maxPct: Infinity, bonus: 5000 },
  { minPct: 80, maxPct: 90, bonus: 2000 },
] as const;

// NDR/RTO personal-recovery tiers.
export const PERSONAL_RECOVERY_TIERS = [
  { minPct: 50, maxPct: Infinity, bonus: 10000 },
  { minPct: 40, maxPct: 50, bonus: 6000 },
  { minPct: 30, maxPct: 40, bonus: 3000 },
] as const;

// ── Working-day helpers ──────────────────────────────────────────────

/**
 * Count of working days (Mon–Sat) in the given calendar month.
 * Verge Scales runs a 6-day work week, so Sundays are the only
 * off-day. Aligns with STANDARD_WORKING_DAYS_PER_MONTH = 26.
 *
 * The user's holiday calendar is NOT subtracted here — paid holidays
 * factor in via the numerator of the base-pay ratio (treated as
 * "paid present days") rather than by shrinking the denominator.
 *
 * @param year  Full year (e.g. 2026)
 * @param month 1-indexed month (1=Jan, 12=Dec)
 */
export function expectedWorkingDays(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  // Date(year, month, 0) → last day of `month`. Iterate 1…lastDay
  // and tally every day except Sunday (dow === 0).
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0) count++;
  }
  return count;
}

// ── Base pay ─────────────────────────────────────────────────────────

export interface BasePayInputs {
  daysPresent: number;
  paidHolidaysUsed: number;
  expectedWorkingDays: number;
  baseSalary: number;
}

export interface BasePayResult {
  ratio: number; // capped at 1.0
  amount: number; // ratio × baseSalary, rounded to 2dp
  capped: boolean; // true if raw ratio exceeded 1
}

/**
 * Capped base-pay calculation:
 *
 *   ratio = min(1, (daysPresent + paidHolidaysUsed) / expectedWorkingDays)
 *   amount = ratio × baseSalary
 *
 * Cap at 1.0 prevents extra work showing up as base-pay inflation —
 * extra effort flows through the incentive ladder instead.
 */
export function calculateBasePay(input: BasePayInputs): BasePayResult {
  const { daysPresent, paidHolidaysUsed, expectedWorkingDays, baseSalary } = input;
  if (expectedWorkingDays <= 0) {
    return { ratio: 0, amount: 0, capped: false };
  }
  const rawRatio = (daysPresent + paidHolidaysUsed) / expectedWorkingDays;
  const capped = rawRatio > 1;
  const ratio = capped ? 1 : Math.max(0, rawRatio);
  const amount = round2(ratio * baseSalary);
  return { ratio, amount, capped };
}

// ── Incentive: Order Confirmation (Earned Commission = 10% × GMV) ──
//
// Per the Compensation Breakdown PDF, the ORDER_CONFIRMATION profile
// pays a flat 10% commission on the Delivered GMV attributable to
// the agent — NOT a tiered confirmation-rate bonus. Tanisha is the
// canonical example.
export const EARNED_COMMISSION_RATE = 0.10;

/**
 * Earned Commission bonus for the ORDER_CONFIRMATION profile.
 * `deliveredGmv` is the sum of order totals delivered from this
 * agent's confirmed orders in the month (see
 * getDeliveredGMVForAgent in payroll-metrics.ts).
 * Returns 0 when the number is null / non-finite / negative.
 */
export function calculateConfirmationBonus(deliveredGmv: number | null | undefined): number {
  if (deliveredGmv == null || !Number.isFinite(deliveredGmv) || deliveredGmv <= 0) return 0;
  return round2(deliveredGmv * EARNED_COMMISSION_RATE);
}

// ── Incentive: NDR/RTO (stackable) ───────────────────────────────────

export interface NdrRtoInputs {
  teamDeliveryRatePct: number | null | undefined;
  personalRecoveryRatePct: number | null | undefined;
  reshipsCount: number | null | undefined;
}

export interface NdrRtoResult {
  teamDeliveryBonus: number;
  recoveryBonus: number;
  reshipsBonus: number;
  total: number;
}

/**
 * NDR/RTO compensation: three stackable components.
 *   • Team delivery: 80–89% → ₹2,000  |  90%+ → ₹5,000
 *   • Personal recovery: 30–39% → ₹3k  |  40–49% → ₹6k  |  50%+ → ₹10k
 *   • Reships: count × ₹50
 */
export function calculateNdrRtoBonus(input: NdrRtoInputs): NdrRtoResult {
  const teamDeliveryBonus = pickTier(input.teamDeliveryRatePct, TEAM_DELIVERY_TIERS);
  const recoveryBonus = pickTier(input.personalRecoveryRatePct, PERSONAL_RECOVERY_TIERS);
  const reshipsBonus =
    typeof input.reshipsCount === "number" && Number.isFinite(input.reshipsCount)
      ? Math.max(0, Math.floor(input.reshipsCount)) * RESHIP_BONUS_PER_UNIT
      : 0;
  return {
    teamDeliveryBonus,
    recoveryBonus,
    reshipsBonus,
    total: teamDeliveryBonus + recoveryBonus + reshipsBonus,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────

// CHAT_SUPPORT is a valid profile but earns zero variable comp today
// — it's a base-pay-only ladder. The orchestrator handles unknown
// profiles gracefully (no incentive component fires) so adding new
// profiles in future doesn't require an engine change.
// DEVELOPER: admin-level access role with a dedicated compensation
// profile (base pay + admin-added line items, no auto-computed
// variable bonus). Keeps the metric-driven profiles clean while
// letting devs receive payslips.
export type CompensationProfile =
  | "ORDER_CONFIRMATION"
  | "NDR_RTO"
  | "CHAT_SUPPORT"
  | "DEVELOPER"
  | null;

// Developer's "Manager bonus" auto-computed from BOTH store
// performance AND the reportee's individual performance.
// Tiered TDR ladder:
//   brand TDR ≥ 80%   →  ₹5,000
//   brand TDR ≥ 60%   →  ₹3,000
//   below            →  ₹0
// Gated on reportee attendance ratio ≥ 80% — if the direct report
// isn't showing up, no manager bonus regardless of TDR.
// Editable in the payslip modal for manual override.
export const DEVELOPER_MANAGER_TIERS = [
  { minPct: 80, bonus: 5000 },
  { minPct: 60, bonus: 3000 },
] as const;
export const DEVELOPER_MANAGER_REPORTEE_ATTENDANCE_THRESHOLD_PCT = 80;

export function calculateDeveloperManagerBonus(args: {
  brandTdrPct: number | null | undefined;
  /** Reportee attendance ratio 0-100 (daysPresent/expected × 100). */
  reporteeAttendancePct: number | null | undefined;
}): number {
  const tdr = args.brandTdrPct;
  const att = args.reporteeAttendancePct;
  if (tdr == null || !Number.isFinite(tdr)) return 0;
  if (att == null || !Number.isFinite(att)) return 0;
  if (att < DEVELOPER_MANAGER_REPORTEE_ATTENDANCE_THRESHOLD_PCT) return 0;
  for (const tier of DEVELOPER_MANAGER_TIERS) {
    if (tdr >= tier.minPct) return tier.bonus;
  }
  return 0;
}

// Default reimbursement (₹) suggested for a fresh payslip. The admin
// can edit this to 0 for employees without a reimbursement line
// (per the Compensation Breakdown PDF, Tanisha + Chandi get 349;
// Satish + Nandakishore have no reimbursement mentioned).
export const DEFAULT_REIMBURSEMENT = 349;

// Per the Payroll PRD: standard full-time month is 26 working days
// (8 hours/day, 5 days/week baseline). Used as the denominator for
// unpaid-leave pro-rata deduction so a day off costs baseSalary / 26,
// not baseSalary / (variable Mon-Fri count that changes each month).
export const STANDARD_WORKING_DAYS_PER_MONTH = 26;

export interface LineItem {
  label: string;
  amount: number;
}

export interface PayrollMathInputs {
  // Base-pay inputs
  baseSalary: number;
  expectedWorkingDays: number;
  daysPresent: number;
  paidHolidaysUsed: number;
  // Unpaid leaves — each subtracts (baseSalary / STANDARD_WORKING_DAYS_PER_MONTH)
  // from the base amount, per PRD "Attendance Deductions" rule.
  unpaidLeaves?: number | null;

  // Incentive inputs (kept optional — admin may zero them via override)
  compensationProfile: CompensationProfile;
  // Legacy tier-based delivery rate — retained for schema/audit but
  // NOT used by the current ORDER_CONFIRMATION formula (see
  // deliveredGmv below). Kept nullable so old callers still compile.
  deliveryRatePct?: number | null;
  // Sum of delivered order totals from this agent's confirmed
  // orders in the month. Drives the ORDER_CONFIRMATION variable
  // (Earned Commission = 10% × deliveredGmv).
  deliveredGmv?: number | null;
  teamDeliveryRatePct?: number | null;
  personalRecoveryRatePct?: number | null;
  reshipsCount?: number | null;

  // Reimbursement — legacy single-value field. New payslips express
  // reimbursement as one of the lineItems below.
  reimbursement?: number | null;

  // Custom Fixed-Pay line items (from "+ Add component" UI). Each
  // { label, amount } sums into the final payout AND flows through
  // as one entry in the RazorpayX "Additions" array on approval.
  lineItems?: LineItem[] | null;
}

export interface PayrollMathResult {
  base: BasePayResult;
  unpaidLeaveDeduction: number;
  incentives: {
    confirmationBonus: number;
    teamDeliveryBonus: number;
    recoveryBonus: number;
    reshipsBonus: number;
    total: number;
  };
  reimbursement: number;
  lineItems: LineItem[];
  lineItemsTotal: number;
  finalPayout: number;
}

/**
 * One-shot payroll calculation. Gathers base-pay + incentive components
 * for the given compensation profile and returns a fully-itemised
 * result. Components not relevant to the profile are zeroed.
 */
export function runPayrollMath(input: PayrollMathInputs): PayrollMathResult {
  // DEVELOPER is a flat-salary role (Nandakishore) — full base
  // regardless of daily attendance, like a salaried manager. Every
  // other profile prorates by attendance ratio via calculateBasePay.
  const base = input.compensationProfile === "DEVELOPER"
    ? {
        ratio: 1,
        amount: round2(Math.max(0, input.baseSalary)),
        capped: false,
      }
    : calculateBasePay({
        baseSalary: input.baseSalary,
        expectedWorkingDays: input.expectedWorkingDays,
        daysPresent: input.daysPresent,
        paidHolidaysUsed: input.paidHolidaysUsed,
      });

  let confirmationBonus = 0;
  let teamDeliveryBonus = 0;
  let recoveryBonus = 0;
  let reshipsBonus = 0;

  if (input.compensationProfile === "ORDER_CONFIRMATION") {
    // Earned Commission = 10% × Delivered GMV. Falls back to 0 if
    // GMV wasn't provided (e.g. legacy /api/payroll/run callers).
    confirmationBonus = calculateConfirmationBonus(input.deliveredGmv);
  } else if (input.compensationProfile === "NDR_RTO") {
    const ndr = calculateNdrRtoBonus({
      teamDeliveryRatePct: input.teamDeliveryRatePct,
      personalRecoveryRatePct: input.personalRecoveryRatePct,
      reshipsCount: input.reshipsCount,
    });
    teamDeliveryBonus = ndr.teamDeliveryBonus;
    recoveryBonus = ndr.recoveryBonus;
    reshipsBonus = ndr.reshipsBonus;
  }

  // Unpaid-leave pro-rata deduction (per PRD): each unpaid day costs
  // baseSalary / STANDARD_WORKING_DAYS_PER_MONTH. Clamped so a runaway
  // count can't push finalPayout negative.
  const unpaidDays = Math.max(0, Math.floor(Number(input.unpaidLeaves ?? 0)));
  const perDayRate = input.baseSalary > 0
    ? input.baseSalary / STANDARD_WORKING_DAYS_PER_MONTH
    : 0;
  const unpaidLeaveDeduction = round2(Math.min(base.amount, unpaidDays * perDayRate));

  const total = confirmationBonus + teamDeliveryBonus + recoveryBonus + reshipsBonus;
  const reimbursement = Math.max(0, Number(input.reimbursement ?? 0));

  // Custom Fixed-Pay line items — cleaned + summed. Non-numeric or
  // negative amounts are dropped rather than silently negating other
  // components.
  const lineItems: LineItem[] = (input.lineItems ?? [])
    .filter((li) => li && typeof li.label === "string" && Number.isFinite(Number(li.amount)))
    .map((li) => ({ label: String(li.label).slice(0, 80), amount: Math.max(0, Number(li.amount)) }));
  const lineItemsTotal = round2(lineItems.reduce((s, li) => s + li.amount, 0));

  const finalPayout = round2(
    base.amount - unpaidLeaveDeduction + total + reimbursement + lineItemsTotal,
  );

  return {
    base,
    unpaidLeaveDeduction,
    incentives: {
      confirmationBonus,
      teamDeliveryBonus,
      recoveryBonus,
      reshipsBonus,
      total,
    },
    reimbursement,
    lineItems,
    lineItemsTotal,
    finalPayout,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function pickTier(
  value: number | null | undefined,
  tiers: readonly { minPct: number; maxPct: number; bonus: number }[],
): number {
  if (value == null || !Number.isFinite(value)) return 0;
  for (const tier of tiers) {
    if (value >= tier.minPct && value < tier.maxPct) return tier.bonus;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Format INR amount with grouping & 2dp (no symbol). 12345.6 → "12,345.60". */
export function formatINR(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
