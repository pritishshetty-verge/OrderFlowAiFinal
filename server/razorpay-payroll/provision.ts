/**
 * RazorpayX Payroll provisioning — create a new employee + set their
 * salary in RazorpayX from an OrderFlow user. Used to onboard new hires
 * so the attendance sync has someone to push to.
 *
 * Salary: OrderFlow `baseSalary` is a MONTHLY figure (shown as "₹X/mo" in
 * the UI); RazorpayX `set-salary` wants annual CTC, so we multiply by 12.
 *
 * Idempotent: safe to call multiple times for the same user. Looks the
 * employee up first, skips create when they already exist, always ends
 * by setting salary (when a salary is known). Used by:
 *   - the new-hire hook on POST /api/invites/accept (no salary yet)
 *   - the compensation-update hook on PATCH /api/users/:id (salary
 *     gets pushed the first time it's entered)
 *   - the manual "Provision" button on the RazorpayX Sync tab
 *
 * Dry-run gated: when RAZORPAY_PAYROLL_DRY_RUN !== "false" this returns
 * a preview of what WOULD be created/set, and calls nothing.
 */

import { storage } from "../storage";
import {
  peopleCreate, peopleSetSalary, peopleView,
  isDryRun, isRazorpayPayrollConfigured,
} from "./client";

export interface ProvisionResult {
  ok: boolean;
  mode: "preview" | "live";
  userId: string;
  email: string;
  name: string;
  annualCtc: number | null;
  steps: Array<{ step: "lookup" | "create" | "set-salary" | "skip"; ok: boolean; detail?: any }>;
  employeeId?: number | string;
  message: string;
}

export async function provisionUser(userId: string): Promise<ProvisionResult> {
  const user = await storage.getUser(userId);
  if (!user) {
    return { ok: false, mode: "preview", userId, email: "", name: "", annualCtc: null, steps: [], message: "User not found" };
  }
  const email = (user.payrollEmail?.trim() || user.email || "").trim();
  const name = user.fullName || user.username || email;
  const monthly = user.baseSalary != null && user.baseSalary !== "" ? Number(user.baseSalary) : null;
  const annualCtc = monthly && Number.isFinite(monthly) && monthly > 0 ? Math.round(monthly * 12) : null;
  // RazorpayX requires hire_date in dd/mm/yyyy on create. Derive it from the
  // OrderFlow join date (createdAt); en-GB locale yields dd/mm/yyyy and we
  // pin the IST zone so the date doesn't slip across the UTC boundary.
  const hireDate = new Date(user.createdAt ?? new Date()).toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
  });

  if (!email) {
    return { ok: false, mode: "preview", userId, email, name, annualCtc, steps: [], message: "No email to provision" };
  }
  if (!isRazorpayPayrollConfigured()) {
    return { ok: false, mode: "preview", userId, email, name, annualCtc, steps: [], message: "RazorpayX not configured" };
  }

  // Dry-run: report intent, write nothing.
  if (isDryRun()) {
    return {
      ok: true,
      mode: "preview",
      userId,
      email,
      name,
      annualCtc,
      steps: [
        { step: "create", ok: true, detail: { email, name, type: "employee", hire_date: hireDate } },
        ...(annualCtc ? [{ step: "set-salary" as const, ok: true, detail: { "annual-ctc": annualCtc } }] : []),
      ],
      message: `Dry-run: would create ${name} (${email}, hired ${hireDate})${annualCtc ? ` + set annual CTC ₹${annualCtc.toLocaleString("en-IN")}` : ""}`,
    };
  }

  const steps: ProvisionResult["steps"] = [];

  // Step 1 — look up by email. If RazorpayX already has this employee,
  // skip the create call so this function is safe to re-run whenever
  // an admin edits compensation.
  const lookup = await peopleView({ email, "employee-type": "employee" });
  let employeeId: number | string | undefined;
  const existing = lookup.ok ? extractEmployeeId(lookup.body) : undefined;
  if (existing != null) {
    employeeId = existing;
    steps.push({ step: "lookup", ok: true, detail: { employeeId, alreadyExists: true } });
  } else {
    steps.push({ step: "lookup", ok: true, detail: { alreadyExists: false } });
    const created = await peopleCreate({ email, name, type: "employee", hire_date: hireDate });
    steps.push({ step: "create", ok: created.ok, detail: created.body });
    if (!created.ok) {
      // code -1 = "Permission Denied": the API key can read employees and
      // write attendance, but lacks People-module write permission.
      const denied = created.body?.error?.code === -1;
      return {
        ok: false,
        mode: "live",
        userId,
        email,
        name,
        annualCtc,
        steps,
        message: denied
          ? "RazorpayX denied employee creation: this API key lacks People-module write permission. Add the new hire in the RazorpayX dashboard, or grant the key 'manage employees' permission."
          : created.body?.error?.message ?? "Create failed",
      };
    }
    employeeId = created.body?.["employee-id"];
  }

  // Step 2 — set salary if we know one AND we have an employee-id.
  // Skipping when annualCtc is null is normal: the invite-accept hook
  // fires before compensation is entered; the compensation-update hook
  // retries with the real number when the admin sets it.
  if (annualCtc && employeeId != null) {
    const sal = await peopleSetSalary({ "employee-id": Number(employeeId), "annual-ctc": annualCtc });
    steps.push({ step: "set-salary", ok: sal.ok, detail: sal.body });
  } else {
    steps.push({
      step: "skip",
      ok: true,
      detail: annualCtc == null ? "no salary set yet" : "employee-id missing from create response",
    });
  }

  return {
    ok: steps.every((s) => s.ok),
    mode: "live",
    userId,
    email,
    name,
    annualCtc,
    steps,
    employeeId,
    message: existing != null
      ? `${name} already in RazorpayX (id ${employeeId})${annualCtc ? " · salary updated" : ""}`
      : `Created ${name} (${employeeId ? `employee-id ${employeeId}` : "no id returned"})${annualCtc ? " + salary set" : ""}`,
  };
}

/**
 * Best-effort employee-id extractor. peopleView's body shape varies
 * slightly by account state; try the common paths in order and return
 * undefined if the employee isn't in RazorpayX yet.
 */
function extractEmployeeId(body: any): number | string | undefined {
  if (!body || body.error) return undefined;
  const id =
    body["employee-id"] ??
    body.employee_id ??
    body.employee?.["employee-id"] ??
    body.employee?.employee_id ??
    body.data?.["employee-id"] ??
    body.data?.employee_id;
  return id != null ? id : undefined;
}
