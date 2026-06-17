import "dotenv/config";
import { pool } from "../db";
import { storage } from "../storage";
import { computeAutoClose } from "../presence-config";

/**
 * End-to-end smoke test for the smart-presence + monthly attendance
 * report feature. Drives the entire flow against a live local server
 * + real Neon dev DB with no manual clicks:
 *
 *   1. Reset test agent state
 *   2. Log in (gets session cookie)
 *   3. Clock in
 *   4. /api/presence/me — expect status="active"
 *   5. Force-age lastActiveAt → trigger worker — expect attendance auto-closed
 *   6. /api/presence/me — expect autoClosedAt set
 *   7. Try clock-in again — expect 403 AUTO_LOGGED_OUT
 *   8. Log in as admin, hit reactivate
 *   9. /api/presence/me — expect back to active
 *   10. /api/reports/attendance-monthly — expect rows
 *
 * Pass = "smart presence is ready end-to-end."
 * Fail = the script prints which step broke + the response body.
 */

const BASE = "http://localhost:5000";
const AGENT_EMAIL = "testagent@orderflow.local";
const AGENT_PASS = "TestAgent2026!";

let pass = 0;
let fail = 0;

function logStep(name: string, ok: boolean, detail?: string) {
  const icon = ok ? "PASS" : "FAIL";
  const line = `  [${icon}] ${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (ok) pass++;
  else fail++;
}

// Tiny cookie jar so we can keep one session per role.
function parseSetCookie(res: Response): string[] {
  const raw = res.headers.get("set-cookie");
  if (!raw) return [];
  // Simple split — node's fetch joins multiple Set-Cookie with ", ".
  return raw.split(/, (?=[a-zA-Z0-9_-]+=)/);
}

class Session {
  cookies: string[] = [];
  label: string;
  constructor(label: string) {
    this.label = label;
  }
  private cookieHeader(): string {
    return this.cookies
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
  }
  async req(method: string, path: string, body?: any): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.cookies.length) headers["Cookie"] = this.cookieHeader();
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const fresh = parseSetCookie(res);
    if (fresh.length) this.cookies.push(...fresh);
    return res;
  }
}

async function getJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function main() {
  console.log("\n=== smart-presence end-to-end smoke test ===\n");

  // ── 0. Reset test agent state ──────────────────────────────────────
  await pool.query(
    `DELETE FROM attendance WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
    [AGENT_EMAIL],
  );
  await pool.query(
    `UPDATE users SET last_active_at = NULL WHERE email = $1`,
    [AGENT_EMAIL],
  );
  logStep("reset test agent attendance + lastActiveAt", true);

  // ── 1. Agent login ─────────────────────────────────────────────────
  const agent = new Session("agent");
  let r = await agent.req("POST", "/api/auth/login", {
    email: AGENT_EMAIL,
    password: AGENT_PASS,
  });
  let body = await getJson(r);
  logStep(
    "agent /api/auth/login → 200",
    r.status === 200,
    `status ${r.status}, body ${JSON.stringify(body).slice(0, 100)}`,
  );
  if (r.status !== 200) {
    console.log("\nCan't continue without agent session. Bailing.\n");
    process.exit(1);
  }
  // Login returns the user object flat (id, username, email, role), not
  // wrapped in {user: ...}. Take what's there.
  const agentUser = body?.user ?? body;

  // ── 2. Clock in ─────────────────────────────────────────────────────
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  r = await agent.req("POST", "/api/attendance/clock-in", {
    userId: agentUser?.id,
    localDate,
  });
  body = await getJson(r);
  logStep(
    "agent clock-in → 200",
    r.status === 200,
    `status ${r.status}`,
  );
  const attendanceId: string | undefined = body?.attendance?.id;

  // ── 3. /api/presence/me — should be active ─────────────────────────
  // Fire a heartbeat first to be sure.
  await agent.req("POST", "/api/presence/heartbeat");
  r = await agent.req("GET", "/api/presence/me");
  body = await getJson(r);
  logStep(
    "presence/me reports status=active, isClockedIn=true",
    body?.status === "active" && body?.isClockedIn === true,
    `status=${body?.status} isClockedIn=${body?.isClockedIn}`,
  );

  // ── 3b. REGRESSION: double clock-in is still rejected ──────────────
  // Existing behavior — one clock-in per day. We reordered the clock-in
  // route's guards for smart-presence; this confirms the original
  // "already clocked in" 400 still fires for a normal active shift.
  r = await agent.req("POST", "/api/attendance/clock-in", {
    userId: agentUser?.id,
    localDate,
  });
  body = await getJson(r);
  logStep(
    "REGRESSION: double clock-in (active shift) → 400 Already clocked in",
    r.status === 400 && /already clocked in/i.test(body?.error ?? ""),
    `status=${r.status} error="${body?.error}"`,
  );

  // ── 4. Force-age lastActiveAt + run worker ─────────────────────────
  // Push lastActiveAt back 5 minutes — well past the 3-min total threshold.
  await pool.query(
    `UPDATE users SET last_active_at = NOW() - INTERVAL '5 minutes' WHERE email = $1`,
    [AGENT_EMAIL],
  );
  // Drive the worker logic directly (same code path as the cron).
  const candidates = await storage.findAutoLogoutCandidates(3);
  logStep(
    "findAutoLogoutCandidates surfaces the test agent",
    candidates.some((c) => c.userId === agentUser?.id),
    `candidates=${candidates.length}, ids=[${candidates.map((c) => c.userId.slice(0, 8)).join(",")}]`,
  );

  // Candidate carries clock_in_time directly now (fix for the
  // getTodayAttendance server-local-TZ mismatch). Verify it's populated.
  const candidate = candidates.find((c) => c.userId === agentUser?.id);
  logStep(
    "candidate row carries clockInTime (no getTodayAttendance re-fetch)",
    !!candidate?.clockInTime,
    `clockInTime=${candidate?.clockInTime?.toISOString() ?? "null"}`,
  );

  if (candidate) {
    // Use the SAME shared helper the worker + cron use.
    const { closeTime, totalHours } = computeAutoClose(
      candidate.clockInTime,
      candidate.lastActiveAt,
      new Date(),
    );
    // closeTime must never be before clock-in, hours never negative/NaN.
    logStep(
      "computeAutoClose: closeTime >= clockIn, hours >= 0, finite",
      !!candidate.clockInTime &&
        closeTime.getTime() >= candidate.clockInTime.getTime() &&
        Number.isFinite(totalHours) &&
        totalHours >= 0,
      `closeTime=${closeTime.toISOString()} hours=${totalHours}`,
    );

    const didClose = await storage.autoCloseAttendance(
      candidate.attendanceId,
      closeTime,
      "[smoke-test] simulated worker close",
      totalHours,
    );
    logStep("autoCloseAttendance first call returns true (closed)", didClose === true);

    // IDEMPOTENCY (#8): a second close on the same row must be a no-op.
    const didCloseAgain = await storage.autoCloseAttendance(
      candidate.attendanceId,
      new Date(),
      "[smoke-test] SHOULD NOT OVERWRITE",
      999,
    );
    logStep(
      "autoCloseAttendance second call returns false (idempotent, no overwrite)",
      didCloseAgain === false,
      `didCloseAgain=${didCloseAgain}`,
    );
  }

  // ── 5. /api/presence/me — should be offline + autoClosedAt set ─────
  r = await agent.req("GET", "/api/presence/me");
  body = await getJson(r);
  logStep(
    "presence/me reports autoClosedAt set, isClockedIn=false",
    body?.autoClosedAt && body?.isClockedIn === false,
    `isClockedIn=${body?.isClockedIn} autoClosedAt=${body?.autoClosedAt}`,
  );

  // ── 6. Clock-in attempt after auto-close — should 403 ──────────────
  r = await agent.req("POST", "/api/attendance/clock-in", {
    userId: agentUser?.id,
    localDate,
  });
  body = await getJson(r);
  logStep(
    "clock-in attempt after auto-close → 403 AUTO_LOGGED_OUT",
    r.status === 403 && body?.code === "AUTO_LOGGED_OUT",
    `status=${r.status} code=${body?.code}`,
  );

  // ── 7. SECURITY: admin-gated endpoints reject unauthenticated callers ─
  // The reactivate + report endpoints are admin-only. Hitting them with
  // no session must be rejected (401/403), never leak data.
  r = await fetch(`${BASE}/api/attendance/${attendanceId}/reactivate`, { method: "POST" });
  logStep(
    "SECURITY: reactivate without session → 401/403",
    r.status === 401 || r.status === 403,
    `status=${r.status}`,
  );
  r = await fetch(`${BASE}/api/reports/attendance-monthly?year=2026&month=6`);
  logStep(
    "SECURITY: monthly report without session → 401/403",
    r.status === 401 || r.status === 403,
    `status=${r.status}`,
  );

  // ── 8. Reactivate via storage (same code path the admin route calls) ─
  // We don't have the admin HTTP password in this harness, so we drive
  // reactivateAttendance directly — it's the exact function the
  // POST /api/attendance/:id/reactivate route invokes.
  if (attendanceId) {
    const reactivated = await storage.reactivateAttendance(attendanceId, agentUser?.id);
    logStep(
      "reactivateAttendance clears auto-close + reopens shift",
      !!reactivated && reactivated.autoClosedAt === null && reactivated.clockOutTime === null,
      `autoClosedAt=${reactivated?.autoClosedAt} clockOutTime=${reactivated?.clockOutTime} reactivatedAt=${reactivated?.reactivatedAt ? "set" : "null"}`,
    );
  }

  // ── 9. After reactivate: lockout cleared, agent back on shift ──────
  const lockoutAfter = await storage.isAutoLoggedOutToday(agentUser?.id, localDate);
  logStep(
    "isAutoLoggedOutToday=false after reactivate",
    lockoutAfter.isLoggedOut === false,
    `isLoggedOut=${lockoutAfter.isLoggedOut}`,
  );
  r = await agent.req("GET", "/api/presence/me");
  body = await getJson(r);
  logStep(
    "presence/me reports clocked-in again after reactivate",
    body?.isClockedIn === true && !body?.autoClosedAt,
    `isClockedIn=${body?.isClockedIn} autoClosedAt=${body?.autoClosedAt}`,
  );

  // ── 10. REGRESSION: normal clock-out still works ───────────────────
  r = await agent.req("POST", "/api/attendance/clock-out", {
    userId: agentUser?.id,
    localDate,
  });
  body = await getJson(r);
  logStep(
    "REGRESSION: normal clock-out → 200",
    r.status === 200,
    `status=${r.status}`,
  );

  // ── 11. Monthly report via storage reflects this agent's day ───────
  const now = new Date();
  const report = await storage.getMonthlyAttendanceReport(now.getFullYear(), now.getMonth() + 1);
  const agentRow = report.find((row) => row.userId === agentUser?.id);
  logStep(
    "monthly report includes the test agent's row",
    !!agentRow && agentRow.daysPresent >= 1,
    agentRow
      ? `daysPresent=${agentRow.daysPresent} autoClosed=${agentRow.daysAutoClosed} hours=${agentRow.clockedHours} idleDeducted=${agentRow.idleMinutesDeducted}`
      : "row not found",
  );

  // ── 11b. FIX D: rows with NULL clock_in_time are excluded ──────────
  // A bare attendance row (status set, never clocked in) must not count
  // as a day present — it would inflate daysPresent and deflate avg
  // hours/day. Insert one and confirm the report ignores it.
  await pool.query(
    `DELETE FROM attendance WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
    [AGENT_EMAIL],
  );
  await pool.query(
    `INSERT INTO attendance (user_id, date, clock_in_time, status)
     VALUES ((SELECT id FROM users WHERE email = $1), NOW(), NULL, 'present')`,
    [AGENT_EMAIL],
  );
  const reportD = await storage.getMonthlyAttendanceReport(now.getFullYear(), now.getMonth() + 1);
  const agentRowD = reportD.find((row) => row.userId === agentUser?.id);
  logStep(
    "FIX D: null clock-in row excluded from report (agent absent)",
    !agentRowD,
    agentRowD ? `unexpectedly present: daysPresent=${agentRowD.daysPresent}` : "absent as expected",
  );

  // ── 12. Cron endpoint auth ─────────────────────────────────────────
  r = await fetch(`${BASE}/api/cron/attendance-auto-logout`, { method: "POST" });
  logStep(
    "cron endpoint without secret → 401",
    r.status === 401,
    `status=${r.status}`,
  );
  const cronSecret = process.env.ATTENDANCE_CRON_SECRET;
  if (cronSecret) {
    r = await fetch(`${BASE}/api/cron/attendance-auto-logout`, {
      method: "POST",
      headers: { "x-attendance-cron-secret": cronSecret },
    });
    body = await getJson(r);
    logStep(
      "cron endpoint with valid secret → 200",
      r.status === 200 && body?.ok === true,
      `status=${r.status} candidates=${body?.candidates} closed=${body?.closed}`,
    );
  } else {
    console.log("\n  (cron valid-secret check skipped — ATTENDANCE_CRON_SECRET not set)\n");
  }

  // ── 13. EXEMPTION: full-control admins are never auto-logged-out ───
  // Promote the test agent to a full-control admin, clock in, age their
  // activity well past the threshold, and confirm the worker does NOT
  // surface them as a candidate + the lockout never trips. Demote after.
  await pool.query(
    `UPDATE users SET role = 'admin', admin_type = 'full_control' WHERE email = $1`,
    [AGENT_EMAIL],
  );
  // Fresh clocked-in shift for the now-admin.
  await pool.query(
    `DELETE FROM attendance WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
    [AGENT_EMAIL],
  );
  await pool.query(
    `INSERT INTO attendance (user_id, date, clock_in_time, status)
     VALUES ((SELECT id FROM users WHERE email = $1), NOW(), NOW(), 'present')`,
    [AGENT_EMAIL],
  );
  await pool.query(
    `UPDATE users SET last_active_at = NOW() - INTERVAL '10 minutes' WHERE email = $1`,
    [AGENT_EMAIL],
  );
  const exemptCandidates = await storage.findAutoLogoutCandidates(3);
  logStep(
    "EXEMPTION: full-control admin NOT in auto-logout candidates",
    !exemptCandidates.some((c) => c.userId === agentUser?.id),
    `candidates=${exemptCandidates.length} (agent should be absent)`,
  );
  // presence/me for the exempt admin → status active, exempt flag, no banner
  r = await agent.req("GET", "/api/presence/me");
  body = await getJson(r);
  logStep(
    "EXEMPTION: presence/me returns exempt=true, status=active for full-control admin",
    body?.exempt === true && body?.status === "active",
    `exempt=${body?.exempt} status=${body?.status}`,
  );
  // Demote back to a plain agent.
  await pool.query(
    `UPDATE users SET role = 'agent', admin_type = NULL WHERE email = $1`,
    [AGENT_EMAIL],
  );

  // ── 14. /api/presence/policy ───────────────────────────────────────
  r = await fetch(`${BASE}/api/presence/policy`);
  body = await getJson(r);
  logStep(
    "GET /api/presence/policy returns thresholds",
    r.status === 200 && body?.idleThresholdMin > 0 && body?.graceMin > 0,
    `idle=${body?.idleThresholdMin} grace=${body?.graceMin} total=${body?.autoLogoutTotalMin}`,
  );

  // ── 15. Cleanup: leave the test agent in a clean state ─────────────
  await pool.query(
    `DELETE FROM attendance WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
    [AGENT_EMAIL],
  );
  await pool.query(
    `UPDATE users SET last_active_at = NULL, role = 'agent', admin_type = NULL WHERE email = $1`,
    [AGENT_EMAIL],
  );
  logStep("cleanup: test agent attendance + role reset", true);

  console.log(`\n=== ${pass}/${pass + fail} PASSED ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
