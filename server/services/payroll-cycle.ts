/**
 * Payroll cycle service.
 *
 * A "cycle" is one monthly payroll run for a specific store, composed
 * of one payroll_ledger row per eligible employee. Cycles are the unit
 * the /payroll dashboard renders and the unit the admin approves.
 *
 * Lifecycle:
 *   generateCycle(store, year, month) → status='pending', one ledger
 *   per employee, all editable
 *   approveCycle(cycleId)            → status='approved', ledgers
 *   locked, PDF+email fired per employee (RazorpayX push is Phase 5)
 */

import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  payrollCycles, payrollLedger, users, type PayrollCycle,
  type InsertPayrollLedger, type PayrollLedger, type User,
} from "@shared/schema";
import { storage } from "../storage";
import {
  runPayrollMath, expectedWorkingDays, DEFAULT_REIMBURSEMENT,
  ANNUAL_PAID_HOLIDAY_CAP, type CompensationProfile, type LineItem,
} from "./payroll";
import {
  getAttendanceMetrics, getAutoPaidHolidaysCount,
  getConfirmationDeliveryRatePct, getTeamDeliveryRatePct,
  getBrandTDRPct, getBrandNDRDeliveryRate, getReshipmentsDeliveredCount,
  getYtdPaidHolidaysUsed, getDeliveredGMVForAgent,
} from "./payroll-metrics";

// ── Types ────────────────────────────────────────────────────────────

export interface PayslipInputs {
  // Base salary override — per-payslip only, does NOT mutate users.baseSalary.
  // Set when admin edits the "Fixed Salary" row in the payslip modal.
  baseSalary?: number;
  daysPresent?: number;
  paidHolidaysUsed?: number;
  unpaidLeaves?: number;
  deliveryRatePct?: number | null;
  teamDeliveryRatePct?: number | null;
  personalRecoveryRatePct?: number | null;
  reshipsCount?: number | null;
  reimbursement?: number | null;
  lineItems?: LineItem[] | null;
  notes?: string | null;
}

// ── Ledger row builder ──────────────────────────────────────────────

/**
 * Compute a fresh payroll_ledger row for one employee in one period,
 * pulling every value the math needs from live OrderFlow data. Used
 * by generateCycle + regenerateLedgerRow. Caller supplies optional
 * overrides that win over the auto-computed values (admin-edited
 * cycle re-save uses this to preserve manual changes).
 */
export async function buildLedgerRow(args: {
  user: User;
  storeId: string;
  year: number;
  month: number;
  cycleId: string | null;
  overrides?: PayslipInputs;
  createdBy?: string | null;
}): Promise<InsertPayrollLedger> {
  const { user, storeId, year, month, cycleId, overrides = {}, createdBy = null } = args;
  // Base salary — override wins, otherwise snapshot from users.baseSalary.
  // The override is stored ONLY on this ledger row; the user record is
  // unchanged (per PRD: "Admin can edit the numerical value of the
  // Fixed Salary" for this payslip; permanent raises go through Team).
  const baseSalary = Math.max(
    0,
    Number(overrides.baseSalary ?? user.baseSalary ?? 0),
  );
  const expectedDays = expectedWorkingDays(year, month);

  const [attendance, holidaysAuto, confirmRate, teamRate, brandTdr, brandNdr, reships, ytdHolidays, deliveredGmv] =
    await Promise.all([
      getAttendanceMetrics(user.id, year, month),
      user.holidayState ? getAutoPaidHolidaysCount(user.holidayState, year, month) : Promise.resolve(0),
      getConfirmationDeliveryRatePct(user.id, year, month),
      getTeamDeliveryRatePct(year, month),
      getBrandTDRPct(storeId, year, month),
      getBrandNDRDeliveryRate(storeId, year, month),
      getReshipmentsDeliveredCount(storeId, year, month),
      getYtdPaidHolidaysUsed(user.id, year, month),
      // GMV only matters for ORDER_CONFIRMATION agents — but we
      // fetch unconditionally so overrides can flip profile without
      // a second round-trip. Cheap query, storeId is required.
      getDeliveredGMVForAgent(user.id, storeId, year, month),
    ]);

  const remainingQuota = Math.max(0, ANNUAL_PAID_HOLIDAY_CAP - ytdHolidays);
  const paidHolidaysAuto = Math.min(holidaysAuto, remainingQuota);

  const daysPresent = overrides.daysPresent ?? attendance.daysPresent;
  const paidHolidaysUsed = overrides.paidHolidaysUsed ?? paidHolidaysAuto;
  // Auto-derived unpaid leaves: any expected working day the employee
  // didn't clock in for AND didn't apply an approved paid holiday to
  // is counted as unpaid. Clamped >= 0 so overtime (daysPresent >
  // expectedDays) doesn't fabricate a negative deduction.
  const unpaidLeavesAuto = Math.max(0, expectedDays - daysPresent - paidHolidaysUsed);
  const unpaidLeaves = overrides.unpaidLeaves ?? unpaidLeavesAuto;
  const deliveryRatePct = overrides.deliveryRatePct ?? confirmRate;
  const teamDeliveryRatePct = overrides.teamDeliveryRatePct ?? (brandTdr ?? teamRate);
  const personalRecoveryRatePct = overrides.personalRecoveryRatePct ?? brandNdr.ratePct;
  const reshipsCount = overrides.reshipsCount ?? reships;

  // Default line items: one Reimbursement row at ₹349. Admin can
  // delete or edit in the payslip modal.
  const defaultLineItems: LineItem[] = [
    { label: "Reimbursement", amount: DEFAULT_REIMBURSEMENT },
  ];
  const lineItems: LineItem[] = overrides.lineItems ?? defaultLineItems;

  const profile = (user.compensationProfile as CompensationProfile) ?? null;

  const math = runPayrollMath({
    baseSalary,
    expectedWorkingDays: expectedDays,
    daysPresent,
    paidHolidaysUsed,
    unpaidLeaves,
    compensationProfile: profile,
    deliveryRatePct,
    deliveredGmv,
    teamDeliveryRatePct,
    personalRecoveryRatePct,
    reshipsCount,
    reimbursement: overrides.reimbursement ?? 0,
    lineItems,
  });

  return {
    cycleId,
    userId: user.id,
    year,
    month,
    baseSalary: String(baseSalary),
    expectedWorkingDays: expectedDays,
    daysPresent,
    paidHolidaysUsed,
    unpaidLeaves,
    basePayRatio: String(round4(math.base.ratio)),
    basePayAmount: String(math.base.amount),
    compensationProfile: profile,
    deliveryRatePct: deliveryRatePct != null ? String(deliveryRatePct) : null,
    teamDeliveryRatePct: teamDeliveryRatePct != null ? String(teamDeliveryRatePct) : null,
    recoveryRatePct: personalRecoveryRatePct != null ? String(personalRecoveryRatePct) : null,
    reshipsCount,
    confirmationBonus: String(math.incentives.confirmationBonus),
    teamDeliveryBonus: String(math.incentives.teamDeliveryBonus),
    recoveryBonus: String(math.incentives.recoveryBonus),
    reshipsBonus: String(math.incentives.reshipsBonus),
    totalIncentives: String(math.incentives.total),
    reimbursement: String(math.reimbursement),
    lineItems: math.lineItems as any,
    finalPayout: String(math.finalPayout),
    currency: "INR",
    status: "finalized",
    recipientEmail: user.email,
    notes: overrides.notes ?? null,
    createdBy,
  };
}

// ── Cycle generation ────────────────────────────────────────────────

export interface GenerateCycleResult {
  ok: boolean;
  cycle: PayrollCycle;
  ledgerCount: number;
  totalPayout: number;
  alreadyExisted: boolean;
  message: string;
}

/**
 * Idempotent cycle generator. If a cycle already exists for
 * (storeId, year, month) it returns the existing one untouched.
 * Otherwise it creates the cycle + one ledger row per eligible
 * employee (isActive AND baseSalary set).
 */
export async function generateCycle(args: {
  storeId: string;
  year: number;
  month: number;
  generatedBy?: string | null;
}): Promise<GenerateCycleResult> {
  const { storeId, year, month, generatedBy = null } = args;

  const [existing] = await db
    .select()
    .from(payrollCycles)
    .where(
      and(
        eq(payrollCycles.storeId, storeId),
        eq(payrollCycles.year, year),
        eq(payrollCycles.month, month),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      ok: true,
      cycle: existing,
      ledgerCount: existing.employeeCount,
      totalPayout: Number(existing.totalPayout),
      alreadyExisted: true,
      message: `Cycle for ${year}-${String(month).padStart(2, "0")} already exists`,
    };
  }

  // Insert cycle row first so ledger rows can reference it.
  const [cycle] = await db
    .insert(payrollCycles)
    .values({
      storeId,
      year,
      month,
      status: "pending",
      employeeCount: 0,
      totalPayout: "0",
      generatedBy,
    })
    .returning();

  // Eligible employees per the Platform Review:
  //   1. active
  //   2. has a base salary set
  //   3. has a compensation profile assigned (null = "No payroll")
  // Employees without a profile intentionally get NO payslip so
  // the admin controls opt-out at the Team → Edit Compensation step.
  const eligible = await db
    .select()
    .from(users)
    .where(and(eq(users.isActive, true)));
  const withSalary = eligible.filter(
    (u) =>
      u.baseSalary != null &&
      Number(u.baseSalary) > 0 &&
      u.compensationProfile != null &&
      u.compensationProfile !== "",
  );

  const inserts: InsertPayrollLedger[] = [];
  for (const u of withSalary) {
    const row = await buildLedgerRow({
      user: u,
      storeId,
      year,
      month,
      cycleId: cycle.id,
      createdBy: generatedBy,
    });
    inserts.push(row);
  }

  if (inserts.length > 0) {
    await db.insert(payrollLedger).values(inserts);
  }

  // Refresh cycle totals from the child rows we just inserted.
  const updated = await refreshCycleTotals(cycle.id);

  return {
    ok: true,
    cycle: updated,
    ledgerCount: inserts.length,
    totalPayout: Number(updated.totalPayout),
    alreadyExisted: false,
    message: `Generated cycle for ${year}-${String(month).padStart(2, "0")} with ${inserts.length} employees`,
  };
}

/** Recompute employee_count + total_payout from child ledger rows. */
export async function refreshCycleTotals(cycleId: string): Promise<PayrollCycle> {
  // Neon's db.execute returns an object with `.rows`. Previous
  // implementation destructured it as `[row] = ...` which extracts
  // the object's first own property (usually `command`), not the
  // first row — leaving employee_count + total_payout at 0 on every
  // cron-generated cycle. Fixed by reading `.rows` explicitly.
  const result: any = await db.execute(sql`
    SELECT COUNT(*)::int4 AS n, COALESCE(SUM(final_payout), 0)::text AS total
    FROM payroll_ledger
    WHERE cycle_id = ${cycleId}
  `);
  const rows = (result?.rows ?? []) as Array<{ n: number; total: string | null }>;
  const summary = rows[0] ?? { n: 0, total: "0" };
  const [updated] = await db
    .update(payrollCycles)
    .set({
      employeeCount: summary.n ?? 0,
      totalPayout: String(summary.total ?? "0"),
      updatedAt: new Date(),
    })
    .where(eq(payrollCycles.id, cycleId))
    .returning();
  return updated;
}

// ── Cycle approval ──────────────────────────────────────────────────

export interface ApproveCycleResult {
  ok: boolean;
  cycle: PayrollCycle;
  dispatched: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
  message: string;
}

/**
 * Approve a cycle. Locks the cycle + all its ledger rows, then fires
 * the existing PDF+email pipeline for each employee. Individual
 * dispatch failures are logged in ledger.emailError but do not
 * un-approve the cycle — approval is the admin's decision, dispatch
 * is fire-and-forget.
 *
 * TODO(future): plumb into RazorpayX Payouts API for actual money
 * movement. Today the "Additions" array (from lineItems) travels only
 * inside the PDF; real disbursal is manual on the RazorpayX side.
 */
export async function approveCycle(args: {
  cycleId: string;
  approvedBy: string;
}): Promise<ApproveCycleResult> {
  const { cycleId, approvedBy } = args;
  const [cycle] = await db.select().from(payrollCycles).where(eq(payrollCycles.id, cycleId)).limit(1);
  if (!cycle) {
    throw new Error("Cycle not found");
  }
  if (cycle.status === "approved") {
    return {
      ok: true,
      cycle,
      dispatched: 0,
      failed: 0,
      errors: [],
      message: "Cycle was already approved",
    };
  }

  // Mark cycle approved before dispatch so partial failures during
  // email don't reopen the approval window.
  const [approved] = await db
    .update(payrollCycles)
    .set({ status: "approved", approvedAt: new Date(), approvedBy, updatedAt: new Date() })
    .where(eq(payrollCycles.id, cycleId))
    .returning();

  const ledgers = await db
    .select()
    .from(payrollLedger)
    .where(eq(payrollLedger.cycleId, cycleId));

  let dispatched = 0;
  let failed = 0;
  const errors: Array<{ userId: string; error: string }> = [];

  // PDF + email per employee — reuse the existing pipeline from
  // /api/payroll/run so payslip formatting stays consistent.
  const { renderPayslipPdf } = await import("./payslip-pdf");
  const { sendPayslipEmail } = await import("./payslip-email");

  for (const row of ledgers) {
    try {
      const user = await storage.getUser(row.userId);
      if (!user) throw new Error("User row missing");
      const data = payslipDataFromLedger(row, user);
      const pdf = await renderPayslipPdf(data);
      try {
        await sendPayslipEmail(data, pdf);
        await storage.updatePayrollLedgerDispatch(row.id, {
          status: "sent",
          pdfFilename: pdf.filename,
          sentAt: new Date(),
          emailError: null,
        });
        dispatched += 1;
      } catch (emailErr: any) {
        await storage.updatePayrollLedgerDispatch(row.id, {
          status: "failed",
          pdfFilename: pdf.filename,
          sentAt: null,
          emailError: emailErr?.message ?? String(emailErr),
        });
        failed += 1;
        errors.push({ userId: row.userId, error: emailErr?.message ?? String(emailErr) });
      }
    } catch (err: any) {
      failed += 1;
      errors.push({ userId: row.userId, error: err?.message ?? String(err) });
      await storage.updatePayrollLedgerDispatch(row.id, {
        status: "failed",
        sentAt: null,
        emailError: err?.message ?? String(err),
      });
    }
  }

  return {
    ok: failed === 0,
    cycle: approved,
    dispatched,
    failed,
    errors,
    message: `Approved cycle · ${dispatched} sent · ${failed} failed`,
  };
}

// ── Cycle-scoped ledger update ──────────────────────────────────────

/**
 * Patch one ledger row inside a pending cycle. Runs the full math
 * against the merged input so bonuses recompute correctly (e.g. if
 * the admin edits a rate, the tier bonus follows).
 * Rejects when the parent cycle is approved.
 */
export async function updateCycleLedger(args: {
  cycleId: string;
  userId: string;
  storeId: string;
  overrides: PayslipInputs;
}): Promise<PayrollLedger> {
  const { cycleId, userId, storeId, overrides } = args;
  const [cycle] = await db.select().from(payrollCycles).where(eq(payrollCycles.id, cycleId)).limit(1);
  if (!cycle) throw new Error("Cycle not found");
  if (cycle.status === "approved") throw new Error("Cycle is locked — approved cycles cannot be edited");

  const user = await storage.getUser(userId);
  if (!user) throw new Error("User not found");

  const rebuilt = await buildLedgerRow({
    user,
    storeId,
    year: cycle.year,
    month: cycle.month,
    cycleId: cycle.id,
    overrides,
  });

  // Upsert on (cycle_id, user_id) — a row should already exist from
  // generateCycle, but be defensive.
  const [existing] = await db
    .select()
    .from(payrollLedger)
    .where(and(eq(payrollLedger.cycleId, cycleId), eq(payrollLedger.userId, userId)))
    .limit(1);

  let saved: PayrollLedger;
  if (existing) {
    const [updated] = await db
      .update(payrollLedger)
      .set({ ...rebuilt, updatedAt: new Date() } as any)
      .where(eq(payrollLedger.id, existing.id))
      .returning();
    saved = updated;
  } else {
    const [created] = await db.insert(payrollLedger).values(rebuilt).returning();
    saved = created;
  }

  await refreshCycleTotals(cycleId);
  return saved;
}

// ── Dashboard queries ───────────────────────────────────────────────

export async function listCycles(storeId?: string | null): Promise<PayrollCycle[]> {
  const rows = storeId
    ? await db.select().from(payrollCycles).where(eq(payrollCycles.storeId, storeId)).orderBy(desc(payrollCycles.year), desc(payrollCycles.month))
    : await db.select().from(payrollCycles).orderBy(desc(payrollCycles.year), desc(payrollCycles.month));
  return rows;
}

export async function getCycleWithLedgers(cycleId: string): Promise<{
  cycle: PayrollCycle;
  ledgers: Array<PayrollLedger & { user: { fullName: string | null; email: string | null; role: string | null; department: string | null; employeeId: string | null } }>;
} | null> {
  const [cycle] = await db.select().from(payrollCycles).where(eq(payrollCycles.id, cycleId)).limit(1);
  if (!cycle) return null;

  const rows = await db
    .select({
      ledger: payrollLedger,
      user: {
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        department: users.department,
        employeeId: users.employeeId,
      },
    })
    .from(payrollLedger)
    .innerJoin(users, eq(payrollLedger.userId, users.id))
    .where(eq(payrollLedger.cycleId, cycleId))
    .orderBy(users.fullName);

  return {
    cycle,
    ledgers: rows.map((r) => ({ ...r.ledger, user: r.user })),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function round4(n: number): number { return Math.round(n * 10000) / 10000; }

/**
 * Build the payslip data object used by the PDF + email templates.
 * Mirrors the shape /api/payroll/run assembles inline.
 */
function payslipDataFromLedger(row: PayrollLedger, user: User): any {
  return {
    employee: {
      fullName: user.fullName,
      email: user.email,
      employeeId: user.employeeId ?? null,
      holidayState: user.holidayState ?? null,
      department: user.department ?? null,
    },
    period: { year: row.year, month: row.month },
    base: {
      baseSalary: Number(row.baseSalary),
      expectedWorkingDays: row.expectedWorkingDays,
      daysPresent: row.daysPresent,
      paidHolidaysUsed: row.paidHolidaysUsed,
      ratio: Number(row.basePayRatio),
      amount: Number(row.basePayAmount),
      capped: Number(row.basePayRatio) >= 1,
    },
    incentives: {
      profile: row.compensationProfile,
      deliveryRatePct: row.deliveryRatePct != null ? Number(row.deliveryRatePct) : null,
      teamDeliveryRatePct: row.teamDeliveryRatePct != null ? Number(row.teamDeliveryRatePct) : null,
      recoveryRatePct: row.recoveryRatePct != null ? Number(row.recoveryRatePct) : null,
      reshipsCount: row.reshipsCount,
      confirmationBonus: Number(row.confirmationBonus),
      teamDeliveryBonus: Number(row.teamDeliveryBonus),
      recoveryBonus: Number(row.recoveryBonus),
      reshipsBonus: Number(row.reshipsBonus),
      total: Number(row.totalIncentives),
    },
    reimbursement: Number(row.reimbursement),
    lineItems: (row.lineItems as unknown as LineItem[]) ?? [],
    unpaidLeaves: row.unpaidLeaves,
    // Recompute the deduction here (not stored on the ledger) so the
    // PDF renders the "- ₹X" row correctly for approve-emailed
    // payslips. Matches STANDARD_WORKING_DAYS_PER_MONTH = 26 in the
    // math service.
    unpaidLeaveDeduction: row.unpaidLeaves > 0
      ? Math.round((Number(row.baseSalary) / 26) * row.unpaidLeaves * 100) / 100
      : 0,
    finalPayout: Number(row.finalPayout),
    ledgerId: row.id,
    generatedAt: new Date(),
  };
}
