/**
 * Maps OrderFlow attendance + leave into RazorpayX Payroll payloads.
 *
 * OrderFlow model:
 *   - attendance: a row per worked day (status 'present'/'break',
 *     clock_in_time / clock_out_time in UTC, total_hours).
 *   - leave_requests: leave_type ('sick'|'casual'|'vacation'),
 *     start_date..end_date, status ('pending'|'approved'|'rejected').
 *
 * RazorpayX model (/api/att):
 *   - one record per (employee email, date): status ∈
 *     present | leave | half-day | unpaid-leave | unpaid-half-day,
 *     plus checkin/checkout (HH:MM) and an integer leave-type.
 *
 * Bridge key: EMAIL. RazorpayX identifies employees by email, which we
 * already have on every OrderFlow user.
 */

import type { AttendancePayload, RazorpayAttendanceStatus } from "./client";

// ── Timezone helpers ────────────────────────────────────────────────
// OrderFlow stores timestamps in UTC; RazorpayX expects IST wall-clock.
const IST = "Asia/Kolkata";

/** UTC timestamp → "YYYY-MM-DD" in IST. */
export function istDate(ts: Date | string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: IST });
}

/** UTC timestamp → "HH:MM" (24h) in IST. */
export function istTime(ts: Date | string): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── Leave-type mapping ──────────────────────────────────────────────
// RazorpayX leave-type is an integer ID specific to YOUR payroll account.
// Fill these in with the real IDs from your RazorpayX leave config, and
// set `paid: false` for any type that should map to "unpaid-leave".
//
// TODO(confirm-with-boss): replace the placeholder IDs (0) with the real
// RazorpayX leave-type IDs before going live. Until confirmed, leave sync
// stays in preview only.
export interface LeaveTypeMapping {
  razorpayLeaveTypeId: number;
  paid: boolean;
}
export const LEAVE_TYPE_MAP: Record<string, LeaveTypeMapping> = {
  sick: { razorpayLeaveTypeId: 0, paid: true },
  casual: { razorpayLeaveTypeId: 0, paid: true },
  vacation: { razorpayLeaveTypeId: 0, paid: true },
};

/** Have the leave-type IDs been configured (not all placeholder 0)? */
export function leaveTypesConfigured(): boolean {
  return Object.values(LEAVE_TYPE_MAP).some((m) => m.razorpayLeaveTypeId > 0);
}

// ── Result shapes ───────────────────────────────────────────────────
export interface MappedRecord {
  payload: AttendancePayload;
  /** Source for the audit log + UI ("attendance" or "leave"). */
  source: "attendance" | "leave";
  /** OrderFlow row id that produced this record. */
  sourceId: string;
}

export interface SkippedRecord {
  reason: string;
  sourceId: string;
  email?: string;
  date?: string;
}

// ── Attendance → present ────────────────────────────────────────────
export interface OrderflowAttendanceRow {
  id: string;
  email: string | null;
  /** The attendance day (canonical). Drives the RazorpayX `date` so it
   *  matches the month the row was selected for — see mapAttendanceRow. */
  date: Date | string | null;
  clockInTime: Date | string | null;
  clockOutTime: Date | string | null;
  status: string | null;
  totalHours: string | number | null;
}

/**
 * Map one OrderFlow attendance row to a "present" RazorpayX record.
 * Returns null (with a reason) when the row can't be synced — e.g. no
 * email on the user, or no clock-in (an empty/auto-only row).
 */
export function mapAttendanceRow(
  row: OrderflowAttendanceRow,
): MappedRecord | SkippedRecord {
  if (!row.email) {
    return { reason: "user has no email", sourceId: row.id };
  }
  if (!row.clockInTime) {
    return { reason: "no clock-in time", sourceId: row.id, email: row.email };
  }
  // Only sync COMPLETED shifts. An open shift (clocked in, no clock-out)
  // would push a present-day with no checkout — an incomplete payroll
  // record. The day syncs once the shift closes (manual or auto). This
  // means the current in-progress day is held back until clock-out, which
  // is correct for payroll.
  if (!row.clockOutTime) {
    return { reason: "shift still open (no clock-out yet)", sourceId: row.id, email: row.email };
  }
  // Emit the date from the canonical attendance day (`date`), NOT from the
  // clock-in instant. The sync query selects rows by `date`'s IST month, so
  // deriving the RazorpayX date from the same field guarantees a selected
  // row never lands in an adjacent month in RazorpayX.
  const date = istDate(row.date ?? row.clockInTime);
  const payload: AttendancePayload = {
    email: row.email,
    "employee-type": "employee",
    date,
    status: "present",
    // RazorpayX requires leave-type on every att-modify. For a non-leave
    // (present) day the sentinel is -1 ("no leave type"); 0 / omitted are
    // rejected ("valid values for leave-type are: …"). Verified against
    // the live API.
    "leave-type": -1,
    checkin: istTime(row.clockInTime),
    checkout: istTime(row.clockOutTime),
    remarks: "Synced from OrderFlow",
  };
  return { payload, source: "attendance", sourceId: row.id };
}

// ── Leave request → leave days ──────────────────────────────────────
export interface OrderflowLeaveRow {
  id: string;
  email: string | null;
  leaveType: string;
  startDate: Date | string;
  endDate: Date | string;
  status: string; // pending | approved | rejected
}

/**
 * Expand one APPROVED leave request into per-day RazorpayX records.
 * Pending/rejected leave is skipped. Unknown leave types are skipped with
 * a reason rather than guessing.
 */
export function mapLeaveRow(
  row: OrderflowLeaveRow,
): { mapped: MappedRecord[]; skipped: SkippedRecord[] } {
  const mapped: MappedRecord[] = [];
  const skipped: SkippedRecord[] = [];

  if (row.status !== "approved") {
    skipped.push({ reason: `leave not approved (${row.status})`, sourceId: row.id, email: row.email ?? undefined });
    return { mapped, skipped };
  }
  if (!row.email) {
    skipped.push({ reason: "user has no email", sourceId: row.id });
    return { mapped, skipped };
  }
  const map = LEAVE_TYPE_MAP[row.leaveType?.toLowerCase?.()];
  if (!map) {
    skipped.push({ reason: `unmapped leave type "${row.leaveType}"`, sourceId: row.id, email: row.email });
    return { mapped, skipped };
  }
  // Guard: RazorpayX rejects leave-type 0 (its valid-list is per-account
  // and these IDs start as placeholders). Until real leave-type IDs are
  // configured, skip leave rather than emit a value the live API rejects.
  if (!map.razorpayLeaveTypeId || map.razorpayLeaveTypeId <= 0) {
    skipped.push({ reason: `leave type "${row.leaveType}" not configured (set RazorpayX leave-type ID)`, sourceId: row.id, email: row.email });
    return { mapped, skipped };
  }
  const status: RazorpayAttendanceStatus = map.paid ? "leave" : "unpaid-leave";

  // Expand the inclusive date range into individual IST days.
  const start = new Date(istDate(row.startDate) + "T00:00:00+05:30");
  const end = new Date(istDate(row.endDate) + "T00:00:00+05:30");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = istDate(d);
    mapped.push({
      payload: {
        email: row.email,
        "employee-type": "employee",
        date,
        status,
        "leave-type": map.razorpayLeaveTypeId,
        remarks: `OrderFlow leave (${row.leaveType})`,
      },
      source: "leave",
      sourceId: row.id,
    });
  }
  return { mapped, skipped };
}

export function isSkipped(r: MappedRecord | SkippedRecord): r is SkippedRecord {
  return (r as SkippedRecord).reason !== undefined;
}
