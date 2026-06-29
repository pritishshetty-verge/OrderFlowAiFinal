/**
 * RazorpayX Payroll sync service.
 *
 * Pulls OrderFlow attendance + approved leave for a month, maps each to a
 * RazorpayX attendance record, and either:
 *   - previews   (dry-run: returns exactly what WOULD be sent, no API call)
 *   - runs       (pushes each record via attModify, collecting per-record
 *                 results for the audit log)
 *
 * One-way only (OrderFlow → RazorpayX). Keyed by employee email. Idempotent:
 * re-running a period overwrites the same days in RazorpayX (attModify is
 * add-or-update), so it's always safe to re-sync.
 */

import { sql, desc } from "drizzle-orm";
import { db } from "../db";
import { payrollSyncRuns, type PayrollSyncRun } from "@shared/schema";
import {
  mapAttendanceRow,
  mapLeaveRow,
  isSkipped,
  leaveTypesConfigured,
  type MappedRecord,
  type SkippedRecord,
} from "./mapping";
import { attModify, attFetch, isDryRun, isRazorpayPayrollConfigured } from "./client";
import { fetchRazorpayEmployees, buildEmailResolver } from "./resolver";

export interface SyncRecordResult extends MappedRecord {
  outcome: "preview" | "ok" | "failed";
  /** RazorpayX response (redacted) or error detail, when not a preview. */
  detail?: any;
}

export interface SyncReport {
  year: number;
  month: number;
  mode: "preview" | "live";
  configured: boolean;
  leaveTypesConfigured: boolean;
  totals: {
    attendanceDays: number;
    leaveDays: number;
    skipped: number;
    ok: number;
    failed: number;
  };
  records: SyncRecordResult[];
  skipped: SkippedRecord[];
}

/** Pull + map all syncable records for the given month (IST). */
async function buildRecords(year: number, month: number): Promise<{
  records: MappedRecord[];
  skipped: SkippedRecord[];
}> {
  const records: MappedRecord[] = [];
  const skipped: SkippedRecord[] = [];

  // ── Resolve each OrderFlow user to their RazorpayX email ────────────
  // OrderFlow uses @vergescales.com work emails; RazorpayX has each
  // agent under their personal Gmail. Rather than maintain a separate
  // mapping field, fetch the RazorpayX roster live and match by NAME.
  // The email RazorpayX has on file for that employee is then used as
  // the attendance push target. (If credentials aren't configured the
  // resolver falls back to no-op and rows skip with a clear reason.)
  let resolveRzpEmail: (fullName: string) => string | null = () => null;
  if (isRazorpayPayrollConfigured()) {
    try {
      const roster = await fetchRazorpayEmployees();
      resolveRzpEmail = buildEmailResolver(roster);
    } catch (err: any) {
      console.warn("[payroll-sync] failed to fetch RazorpayX roster:", err?.message ?? err);
    }
  }

  // ── Attendance for the month (IST), joined to the user ──────────────
  const attRes: any = await db.execute(sql`
    SELECT a.id, u.email, u.full_name,
           a.date, a.clock_in_time, a.clock_out_time, a.status, a.total_hours
    FROM attendance a
    JOIN users u ON u.id = a.user_id
    WHERE a.clock_in_time IS NOT NULL
      AND EXTRACT(YEAR  FROM (a.date AT TIME ZONE 'Asia/Kolkata')) = ${year}::int
      AND EXTRACT(MONTH FROM (a.date AT TIME ZONE 'Asia/Kolkata')) = ${month}::int
    ORDER BY u.email, a.date
  `);
  for (const r of (attRes.rows ?? attRes)) {
    // Email-to-RazorpayX resolution — use the resolver if available,
    // else skip with a clear reason so the admin knows what to fix.
    const rzpEmail = resolveRzpEmail(r.full_name ?? "");
    if (!rzpEmail) {
      skipped.push({
        sourceId: r.id,
        reason: `No RazorpayX employee matching name "${r.full_name ?? r.email}" — add them in RazorpayX (or fix the name) and re-run.`,
        email: r.email ?? undefined,
      });
      continue;
    }
    const mapped = mapAttendanceRow({
      id: r.id,
      email: rzpEmail,
      date: r.date,
      clockInTime: r.clock_in_time,
      clockOutTime: r.clock_out_time,
      status: r.status,
      totalHours: r.total_hours,
    });
    if (isSkipped(mapped)) skipped.push(mapped);
    else records.push(mapped);
  }

  // ── Approved leave overlapping the month ────────────────────────────
  const leaveRes: any = await db.execute(sql`
    SELECT l.id, u.email, u.full_name,
           l.leave_type, l.start_date, l.end_date, l.status
    FROM leave_requests l
    JOIN users u ON u.id = l.user_id
    WHERE l.status = 'approved'
      AND l.start_date <= (make_date(${year}::int, ${month}::int, 1) + INTERVAL '1 month')
      AND l.end_date   >= make_date(${year}::int, ${month}::int, 1)
    ORDER BY u.email, l.start_date
  `);
  for (const r of (leaveRes.rows ?? leaveRes)) {
    const rzpEmail = resolveRzpEmail(r.full_name ?? "");
    if (!rzpEmail) {
      skipped.push({
        sourceId: r.id,
        reason: `No RazorpayX employee matching name "${r.full_name ?? r.email}" — add them in RazorpayX (or fix the name) and re-run.`,
        email: r.email ?? undefined,
      });
      continue;
    }
    const { mapped, skipped: sk } = mapLeaveRow({
      id: r.id,
      email: rzpEmail,
      leaveType: r.leave_type,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
    });
    // Only keep leave days that actually fall in the target month.
    for (const m of mapped) {
      const [yy, mm] = m.payload.date.split("-").map(Number);
      if (yy === year && mm === month) records.push(m);
    }
    skipped.push(...sk);
  }

  return { records, skipped };
}

function summarize(
  year: number,
  month: number,
  mode: "preview" | "live",
  records: SyncRecordResult[],
  skipped: SkippedRecord[],
): SyncReport {
  return {
    year,
    month,
    mode,
    configured: isRazorpayPayrollConfigured(),
    leaveTypesConfigured: leaveTypesConfigured(),
    totals: {
      attendanceDays: records.filter((r) => r.source === "attendance").length,
      leaveDays: records.filter((r) => r.source === "leave").length,
      skipped: skipped.length,
      ok: records.filter((r) => r.outcome === "ok").length,
      failed: records.filter((r) => r.outcome === "failed").length,
    },
    records,
    skipped,
  };
}

/** Preview only — maps everything, sends nothing. Needs no credentials. */
export async function previewSync(year: number, month: number): Promise<SyncReport> {
  const { records, skipped } = await buildRecords(year, month);
  const result: SyncRecordResult[] = records.map((r) => ({ ...r, outcome: "preview" }));
  return summarize(year, month, "preview", result, skipped);
}

/**
 * Live sync — pushes each record to RazorpayX. Honors the global dry-run
 * flag: if RAZORPAY_PAYROLL_DRY_RUN !== "false", this falls back to a
 * preview (so a misconfigured env can never silently write to live payroll).
 */
export async function runSync(year: number, month: number, triggeredBy?: string): Promise<SyncReport> {
  let report: SyncReport;
  if (isDryRun()) {
    report = await previewSync(year, month);
  } else {
    const { records, skipped } = await buildRecords(year, month);
    const results: SyncRecordResult[] = [];
    for (const rec of records) {
      const res = await attModify(rec.payload);
      results.push({
        ...rec,
        outcome: res.ok ? "ok" : "failed",
        detail: res.ok ? res.body : { status: res.status, body: res.body },
      });
    }
    report = summarize(year, month, "live", results, skipped);
  }
  // Persist an audit row (best-effort — a logging failure must not fail
  // the sync). Compact per-record outcomes for drill-in.
  try {
    await db.insert(payrollSyncRuns).values({
      year,
      month,
      mode: report.mode,
      attendanceDays: report.totals.attendanceDays,
      leaveDays: report.totals.leaveDays,
      okCount: report.totals.ok,
      failedCount: report.totals.failed,
      skippedCount: report.totals.skipped,
      triggeredBy: triggeredBy ?? null,
      details: {
        records: report.records.map((r) => ({
          email: r.payload.email, date: r.payload.date, status: r.payload.status,
          source: r.source, outcome: r.outcome,
        })),
        skipped: report.skipped,
      },
    });
  } catch (err: any) {
    console.warn("[payroll-sync] failed to write audit row:", err?.message ?? err);
  }
  return report;
}

/** Recent sync runs for the audit-history UI. */
export async function listSyncRuns(limit = 20): Promise<PayrollSyncRun[]> {
  return db.select().from(payrollSyncRuns).orderBy(desc(payrollSyncRuns.createdAt)).limit(limit);
}

export interface ReconcileItem {
  email: string;
  date: string;
  expected: string;
  actual: string | null;
  state: "match" | "mismatch" | "missing" | "not-found";
  note?: string;
}
export interface ReconcileReport {
  year: number;
  month: number;
  configured: boolean;
  totals: { checked: number; match: number; mismatch: number; missing: number; notFound: number };
  /** Only the problems (mismatch / missing / not-found) — matches omitted to keep it tight. */
  issues: ReconcileItem[];
}

/**
 * Month-end "everything matches" check. Read-only: re-fetches each
 * expected record from RazorpayX and compares status. Reports anything
 * that isn't a clean match, so an admin can fix before the payroll run.
 *   - match     : RazorpayX status == expected
 *   - mismatch  : present in RazorpayX but different status
 *   - missing   : employee exists, but no record for that date (not synced)
 *   - not-found : employee email not in RazorpayX (mapping/provisioning gap)
 */
// Bound the work so a big month can't blow the serverless timeout
// (Vercel maxDuration 30s). We fetch in small concurrent batches and cap
// the total checked, surfacing a note if we truncated.
const RECONCILE_MAX = 500;
const RECONCILE_CONCURRENCY = 8;

export async function reconcileMonth(year: number, month: number): Promise<ReconcileReport> {
  const built = await buildRecords(year, month);
  const all = built.records;
  const capped = all.length > RECONCILE_MAX;
  const records = capped ? all.slice(0, RECONCILE_MAX) : all;

  const issues: ReconcileItem[] = [];
  let match = 0, mismatch = 0, missing = 0, notFound = 0;

  const classify = (rec: (typeof records)[number], f: Awaited<ReturnType<typeof attFetch>>) => {
    if (!f.ok) {
      if (f.body?.error?.code === 12) {
        missing++;
        issues.push({ email: rec.payload.email, date: rec.payload.date, expected: rec.payload.status, actual: null, state: "missing", note: "not synced yet" });
      } else {
        notFound++;
        issues.push({ email: rec.payload.email, date: rec.payload.date, expected: rec.payload.status, actual: null, state: "not-found", note: f.body?.error?.message });
      }
      return;
    }
    const actual = f.body?.data?.status?.description ?? null;
    if (actual === rec.payload.status) match++;
    else { mismatch++; issues.push({ email: rec.payload.email, date: rec.payload.date, expected: rec.payload.status, actual, state: "mismatch" }); }
  };

  // Process in concurrent chunks rather than one-at-a-time.
  for (let i = 0; i < records.length; i += RECONCILE_CONCURRENCY) {
    const chunk = records.slice(i, i + RECONCILE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((rec) =>
        attFetch({ email: rec.payload.email, "employee-type": "employee", date: rec.payload.date })
          .then((f) => ({ rec, f })),
      ),
    );
    for (const { rec, f } of results) classify(rec, f);
  }

  if (capped) {
    issues.unshift({
      email: "—", date: "—", expected: "—", actual: null, state: "not-found",
      note: `Only the first ${RECONCILE_MAX} of ${all.length} records were checked (limit).`,
    });
  }

  return {
    year,
    month,
    configured: isRazorpayPayrollConfigured(),
    totals: { checked: records.length, match, mismatch, missing, notFound },
    issues,
  };
}
