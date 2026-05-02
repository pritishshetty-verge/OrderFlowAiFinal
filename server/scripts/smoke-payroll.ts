import "dotenv/config";
import {
  expectedWorkingDays,
  calculateBasePay,
  calculateConfirmationBonus,
  calculateNdrRtoBonus,
  runPayrollMath,
  ANNUAL_PAID_HOLIDAY_CAP,
} from "../services/payroll";

// ─────────────────────────────────────────────────────────────────────
// Pure-math smoke test for the payroll engine. No DB / no network.
// Asserts the spec'd tier ladders + base-pay capping. If any assertion
// trips, exits non-zero so the caller (smoke runner) sees red.
// ─────────────────────────────────────────────────────────────────────

let failures = 0;
function expect(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) {
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    actual:   ${JSON.stringify(actual)}`);
    failures++;
  }
}

// ── Working days ─────────────────────────────────────────────────────
expect("expectedWorkingDays Apr 2026", expectedWorkingDays(2026, 4), 22); // 30 days, 8 weekend
expect("expectedWorkingDays Feb 2026 (28d)", expectedWorkingDays(2026, 2), 20);
expect("expectedWorkingDays Dec 2026", expectedWorkingDays(2026, 12), 23);

// ── Base pay capping ────────────────────────────────────────────────
expect(
  "base pay full month",
  calculateBasePay({ daysPresent: 22, paidHolidaysUsed: 0, expectedWorkingDays: 22, baseSalary: 30000 }),
  { ratio: 1, amount: 30000, capped: false },
);
expect(
  "base pay extra work capped at 100%",
  calculateBasePay({ daysPresent: 25, paidHolidaysUsed: 2, expectedWorkingDays: 22, baseSalary: 30000 }),
  { ratio: 1, amount: 30000, capped: true },
);
expect(
  "base pay half month",
  calculateBasePay({ daysPresent: 11, paidHolidaysUsed: 0, expectedWorkingDays: 22, baseSalary: 30000 }),
  { ratio: 0.5, amount: 15000, capped: false },
);
expect(
  "base pay with 2 paid holidays",
  calculateBasePay({ daysPresent: 18, paidHolidaysUsed: 2, expectedWorkingDays: 22, baseSalary: 30000 }),
  // (18+2)/22 = 0.90909..., * 30000 = 27272.72 (rounded)
  { ratio: 20 / 22, amount: 27272.73, capped: false },
);

// ── Confirmation tiers ──────────────────────────────────────────────
expect("confirmation < 75% → 0", calculateConfirmationBonus(74.99), 0);
expect("confirmation 75% → 5000", calculateConfirmationBonus(75), 5000);
expect("confirmation 80% → 5000", calculateConfirmationBonus(80), 5000);
expect("confirmation 84.99% → 5000", calculateConfirmationBonus(84.99), 5000);
expect("confirmation 85% → 7500", calculateConfirmationBonus(85), 7500);
expect("confirmation 89.99% → 7500", calculateConfirmationBonus(89.99), 7500);
expect("confirmation 90% → 10000", calculateConfirmationBonus(90), 10000);
expect("confirmation 100% → 10000", calculateConfirmationBonus(100), 10000);
expect("confirmation null → 0", calculateConfirmationBonus(null), 0);

// ── NDR/RTO stack ───────────────────────────────────────────────────
expect(
  "ndr_rto: team 80% + recovery 30% + 20 reships",
  calculateNdrRtoBonus({ teamDeliveryRatePct: 80, personalRecoveryRatePct: 30, reshipsCount: 20 }),
  { teamDeliveryBonus: 2000, recoveryBonus: 3000, reshipsBonus: 1000, total: 6000 },
);
expect(
  "ndr_rto: team 90% + recovery 50% + 100 reships",
  calculateNdrRtoBonus({ teamDeliveryRatePct: 90, personalRecoveryRatePct: 50, reshipsCount: 100 }),
  { teamDeliveryBonus: 5000, recoveryBonus: 10000, reshipsBonus: 5000, total: 20000 },
);
expect(
  "ndr_rto: zeros across the board",
  calculateNdrRtoBonus({ teamDeliveryRatePct: 0, personalRecoveryRatePct: 0, reshipsCount: 0 }),
  { teamDeliveryBonus: 0, recoveryBonus: 0, reshipsBonus: 0, total: 0 },
);
expect(
  "ndr_rto: nulls/undefined ignored",
  calculateNdrRtoBonus({ teamDeliveryRatePct: null, personalRecoveryRatePct: undefined, reshipsCount: null }),
  { teamDeliveryBonus: 0, recoveryBonus: 0, reshipsBonus: 0, total: 0 },
);
expect(
  "ndr_rto: team 89.99 stays at 2000 (boundary)",
  calculateNdrRtoBonus({ teamDeliveryRatePct: 89.99, personalRecoveryRatePct: 49.99, reshipsCount: 0 }).teamDeliveryBonus,
  2000,
);

// ── End-to-end orchestrator ─────────────────────────────────────────
const e2e = runPayrollMath({
  baseSalary: 30000,
  expectedWorkingDays: 22,
  daysPresent: 20,
  paidHolidaysUsed: 2,
  compensationProfile: "ORDER_CONFIRMATION",
  deliveryRatePct: 87.5,
});
expect("E2E confirmation: ratio=1 (20+2=22)", e2e.base.ratio, 1);
expect("E2E confirmation: base=30000", e2e.base.amount, 30000);
expect("E2E confirmation: bonus=7500", e2e.incentives.confirmationBonus, 7500);
expect("E2E confirmation: final=37500", e2e.finalPayout, 37500);

const e2eNdr = runPayrollMath({
  baseSalary: 25000,
  expectedWorkingDays: 22,
  daysPresent: 18,
  paidHolidaysUsed: 1,
  compensationProfile: "NDR_RTO",
  teamDeliveryRatePct: 92,
  personalRecoveryRatePct: 42,
  reshipsCount: 30,
});
expect(
  "E2E ndr_rto: math",
  {
    base: e2eNdr.base.amount,
    team: e2eNdr.incentives.teamDeliveryBonus,
    recovery: e2eNdr.incentives.recoveryBonus,
    reships: e2eNdr.incentives.reshipsBonus,
    final: e2eNdr.finalPayout,
  },
  // (18+1)/22 = 0.8636 * 25000 = 21590.91 ; team(92%)=5000 ; recovery(42%)=6000 ; reships(30*50)=1500
  { base: 21590.91, team: 5000, recovery: 6000, reships: 1500, final: 34090.91 },
);

console.log(`\nANNUAL_PAID_HOLIDAY_CAP = ${ANNUAL_PAID_HOLIDAY_CAP}`);
console.log(`\n${failures === 0 ? "✓ all assertions passed" : `✗ ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
