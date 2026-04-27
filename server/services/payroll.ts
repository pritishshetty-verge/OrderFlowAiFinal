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
 * Count of weekdays (Mon-Fri) in the given calendar month. Saturdays
 * and Sundays do not contribute. The user's holiday calendar is NOT
 * subtracted here — paid holidays factor in via the numerator of the
 * base-pay ratio (treated as "paid present days") rather than by
 * shrinking the denominator.
 *
 * @param year  Full year (e.g. 2026)
 * @param month 1-indexed month (1=Jan, 12=Dec)
 */
export function expectedWorkingDays(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  // Date(year, month, 0) → last day of `month` (because day 0 is "the
  // day before day 1"). Iterate inclusive 1…lastDay and tally Mon-Fri.
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count++;
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

// ── Incentive: Order Confirmation ────────────────────────────────────

/**
 * Tiered bonus based on personal delivery rate of orders confirmed by
 * this agent in the month.
 *   75–84.99% → ₹5,000   |   85–89.99% → ₹7,500   |   90%+ → ₹10,000
 * Below 75% → ₹0.
 */
export function calculateConfirmationBonus(deliveryRatePct: number | null | undefined): number {
  if (deliveryRatePct == null || !Number.isFinite(deliveryRatePct)) return 0;
  for (const tier of ORDER_CONFIRMATION_TIERS) {
    if (deliveryRatePct >= tier.minPct && deliveryRatePct < tier.maxPct) {
      return tier.bonus;
    }
  }
  return 0;
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
export type CompensationProfile =
  | "ORDER_CONFIRMATION"
  | "NDR_RTO"
  | "CHAT_SUPPORT"
  | null;

export interface PayrollMathInputs {
  // Base-pay inputs
  baseSalary: number;
  expectedWorkingDays: number;
  daysPresent: number;
  paidHolidaysUsed: number;

  // Incentive inputs (kept optional — admin may zero them via override)
  compensationProfile: CompensationProfile;
  deliveryRatePct?: number | null;
  teamDeliveryRatePct?: number | null;
  personalRecoveryRatePct?: number | null;
  reshipsCount?: number | null;
}

export interface PayrollMathResult {
  base: BasePayResult;
  incentives: {
    confirmationBonus: number;
    teamDeliveryBonus: number;
    recoveryBonus: number;
    reshipsBonus: number;
    total: number;
  };
  finalPayout: number;
}

/**
 * One-shot payroll calculation. Gathers base-pay + incentive components
 * for the given compensation profile and returns a fully-itemised
 * result. Components not relevant to the profile are zeroed.
 */
export function runPayrollMath(input: PayrollMathInputs): PayrollMathResult {
  const base = calculateBasePay({
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
    confirmationBonus = calculateConfirmationBonus(input.deliveryRatePct);
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

  const total = confirmationBonus + teamDeliveryBonus + recoveryBonus + reshipsBonus;
  const finalPayout = round2(base.amount + total);

  return {
    base,
    incentives: {
      confirmationBonus,
      teamDeliveryBonus,
      recoveryBonus,
      reshipsBonus,
      total,
    },
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
