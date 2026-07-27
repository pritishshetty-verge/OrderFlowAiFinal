/**
 * RazorpayX Payroll API client.
 *
 * Thin wrapper over the two endpoints the payroll API exposes:
 *   POST  https://payroll.razorpay.com/api/people   (people module)
 *   POST/PATCH https://payroll.razorpay.com/api/att (attendance module)
 *
 * Auth is body-based (NOT a header): every request carries
 *   { auth: { id, key }, request: { type, "sub-type" }, data }
 *
 * Credentials come from env (never hard-coded):
 *   RAZORPAY_PAYROLL_AUTH_ID   — numeric account id
 *   RAZORPAY_PAYROLL_AUTH_KEY  — secret key
 *   RAZORPAY_PAYROLL_BASE_URL  — optional override (defaults to prod)
 *
 * SAFETY: RazorpayX Payroll has no sandbox — a real key mutates the real
 * payroll account. The sync service gates every WRITE behind a dry-run
 * flag; this client only performs the HTTP call when actually invoked.
 */

const BASE_URL =
  process.env.RAZORPAY_PAYROLL_BASE_URL?.replace(/\/$/, "") ||
  "https://payroll.razorpay.com/api";

export interface RazorpayAuth {
  /** Numeric if the ID is all digits (sent as a JSON number, matching the
   *  docs), otherwise the raw string — so alphanumeric account IDs work too. */
  id: number | string;
  key: string;
}

export class RazorpayPayrollConfigError extends Error {}

/** Read + validate credentials from env. Throws if missing. */
export function getRazorpayAuth(): RazorpayAuth {
  const idRaw = process.env.RAZORPAY_PAYROLL_AUTH_ID?.trim();
  const key = process.env.RAZORPAY_PAYROLL_AUTH_KEY?.trim();
  // Treat the unreplaced placeholder as "not configured".
  if (!idRaw || !key || idRaw === "REPLACE_WITH_ID" || key === "REPLACE_WITH_KEY") {
    throw new RazorpayPayrollConfigError(
      "RazorpayX Payroll credentials missing — set RAZORPAY_PAYROLL_AUTH_ID and RAZORPAY_PAYROLL_AUTH_KEY in .env",
    );
  }
  // Send id as a number when it's all digits (matches the API docs),
  // else pass the alphanumeric id through unchanged.
  const id = /^\d+$/.test(idRaw) ? Number(idRaw) : idRaw;
  return { id, key };
}

/** True when both credentials are present (for the UI to show config state). */
export function isRazorpayPayrollConfigured(): boolean {
  try {
    getRazorpayAuth();
    return true;
  } catch {
    return false;
  }
}

/** Whether live writes are allowed. Defaults to DRY-RUN (safe) unless
 *  RAZORPAY_PAYROLL_DRY_RUN is explicitly "false". */
export function isDryRun(): boolean {
  return process.env.RAZORPAY_PAYROLL_DRY_RUN !== "false";
}

type Resource = "people" | "att";

interface CallArgs {
  resource: Resource;
  type: string; // request.type, e.g. "attendance" | "people"
  subType: string; // request.sub-type, e.g. "modify" | "fetch" | "view"
  data: Record<string, unknown>;
  method?: "POST" | "PATCH";
}

export interface RazorpayCallResult {
  ok: boolean;
  status: number;
  body: any;
  /** The exact request payload we sent (key redacted) — for audit / dry-run. */
  sentPayload: Record<string, unknown>;
}

/**
 * Low-level call. Builds the auth envelope and POSTs/PATCHes. Never throws
 * on a non-2xx — returns { ok:false, status, body } so callers can log the
 * failure per-row without aborting a batch sync.
 */
export async function razorpayCall(args: CallArgs): Promise<RazorpayCallResult> {
  const auth = getRazorpayAuth();
  const payload = {
    auth: { id: auth.id, key: auth.key },
    request: { type: args.type, "sub-type": args.subType },
    data: args.data,
  };
  const url = `${BASE_URL}/${args.resource}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: args.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      body: { error: `Network error: ${err?.message ?? String(err)}` },
      sentPayload: redactAuth(payload),
    };
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  // RazorpayX returns HTTP 200 even for errors, with an `error` field
  // (e.g. {"error":{"message":"Unable to locate the user","code":8}}).
  // Success is: 2xx AND no `error` AND (status is "ok" or absent for reads).
  const ok =
    res.ok && !body?.error && (body?.status === undefined || body?.status === "ok");
  return { ok, status: res.status, body, sentPayload: redactAuth(payload) };
}

/** Replace the secret key with a marker so payloads are safe to log/return. */
function redactAuth(payload: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(payload));
  if (clone?.auth?.key) clone.auth.key = "***redacted***";
  return clone;
}

// ── Attendance ──────────────────────────────────────────────────────

export type RazorpayAttendanceStatus =
  | "present"
  | "leave"
  | "half-day"
  | "unpaid-leave"
  | "unpaid-half-day";

export interface AttendancePayload {
  email: string;
  "employee-type": "employee" | "contractor";
  date: string; // YYYY-MM-DD
  status: RazorpayAttendanceStatus;
  "leave-type"?: number;
  checkin?: string; // HH:MM
  checkout?: string; // HH:MM
  remarks?: string;
}

/** Add or update an attendance record (idempotent re-sync). */
export function attModify(data: AttendancePayload): Promise<RazorpayCallResult> {
  return razorpayCall({
    resource: "att",
    type: "attendance",
    subType: "modify",
    data: data as unknown as Record<string, unknown>,
  });
}

/** Fetch a single day's attendance for an employee. */
export function attFetch(data: {
  email: string;
  "employee-type": "employee" | "contractor";
  date: string;
}): Promise<RazorpayCallResult> {
  return razorpayCall({ resource: "att", type: "attendance", subType: "fetch", data });
}

// ── People ──────────────────────────────────────────────────────────

export function peopleView(data: {
  "employee-id"?: number;
  email?: string;
  "employee-type"?: "employee" | "contractor";
}): Promise<RazorpayCallResult> {
  return razorpayCall({ resource: "people", type: "people", subType: "view", data });
}

export interface PeopleCreatePayload {
  email: string;
  name: string;
  type: "employee" | "contractor";
  /** RazorpayX requires the hire date on create. Format: dd/mm/yyyy. */
  hire_date: string;
  /** Optional extras RazorpayX accepts on create. */
  phone?: string;
  title?: string;
  department?: string;
}

export function peopleCreate(data: PeopleCreatePayload): Promise<RazorpayCallResult> {
  return razorpayCall({
    resource: "people",
    type: "people",
    subType: "create",
    data: data as unknown as Record<string, unknown>,
  });
}

export function peopleSetSalary(data: {
  "employee-id": number;
  "annual-ctc": number;
  "custom-salary-structure"?: boolean;
}): Promise<RazorpayCallResult> {
  return razorpayCall({
    resource: "people",
    type: "people",
    subType: "set-salary",
    data: { "custom-salary-structure": false, ...data } as unknown as Record<string, unknown>,
  });
}

/** Edit an existing employee's profile. Keyed by email. All other
 *  fields are optional; only the ones present in `data` are updated.
 *  Useful for fixing a wrong name field (RazorpayX won't let you change
 *  the email this way — that's a different flow). */
export function peopleEdit(data: {
  email: string;
  name?: string;
  title?: string;
  department?: string;
  phone?: string;
}): Promise<RazorpayCallResult> {
  return razorpayCall({
    resource: "people",
    type: "people",
    subType: "edit",
    data: data as unknown as Record<string, unknown>,
  });
}

/** Dismiss (offboard) an employee. Keyed by email. RazorpayX dates are
 *  dd/mm/yyyy. Used to clean up records created in error. */
export function peopleDismiss(data: {
  email: string;
  "employee-type"?: "employee" | "contractor";
  "dismissal-date"?: string; // dd/mm/yyyy
}): Promise<RazorpayCallResult> {
  return razorpayCall({
    resource: "people",
    type: "people",
    subType: "dismiss",
    data: data as unknown as Record<string, unknown>,
  });
}
