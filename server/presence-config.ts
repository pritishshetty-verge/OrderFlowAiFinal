/**
 * Smart-presence policy thresholds, read from env with safe parsing.
 *
 * Centralized so the idle/grace numbers are read identically everywhere
 * (worker, cron, /api/presence/*, monthly report) and so a malformed
 * env value can never poison the math. `Number(process.env.X ?? 10)`
 * was the old pattern — but `?? 10` only catches `undefined`, so
 * `IDLE_THRESHOLD_MIN=""` parsed to 0 (→ everyone instantly idle /
 * auto-logged-out) and `"abc"` parsed to NaN (→ broken countdown).
 * `parseMinutes` rejects both and falls back to the default.
 */

const DEFAULT_IDLE_MIN = 10;
const DEFAULT_GRACE_MIN = 30;

function parseMinutes(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  // Reject NaN, 0, and negatives — any of these would break the policy
  // (0 = auto-logout everyone immediately; negative is nonsensical).
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getIdleThresholdMin(): number {
  return parseMinutes(process.env.IDLE_THRESHOLD_MIN, DEFAULT_IDLE_MIN);
}

export function getGraceMin(): number {
  return parseMinutes(process.env.AUTO_LOGOUT_GRACE_MIN, DEFAULT_GRACE_MIN);
}

export function getAutoLogoutTotalMin(): number {
  return getIdleThresholdMin() + getGraceMin();
}

/**
 * Compute the close timestamp + credited hours for an auto-logout.
 * Shared by the in-process worker (server/index.ts) and the Vercel cron
 * endpoint (server/routes.ts) so the two paths are guaranteed identical.
 *
 * The shift closes at the last seen activity (lastActiveAt) — that's the
 * last moment the agent was actually working; the idle/grace window after
 * it isn't credited. Guards:
 *   - lastActiveAt NULL (never sent a heartbeat) → close at clock-in, 0h
 *   - lastActiveAt BEFORE clock-in (stale heartbeat from a prior shift)
 *     → clamped to clock-in, 0h
 *   - clockIn NULL (shouldn't happen for a clocked-in candidate) → close
 *     at `now`, 0h, so we never persist a null/garbage close time
 * Result hours are always >= 0; never NaN.
 */
export function computeAutoClose(
  clockInTime: Date | null,
  lastActiveAt: Date | null,
  now: Date,
): { closeTime: Date; totalHours: number } {
  if (!clockInTime) {
    return { closeTime: now, totalHours: 0 };
  }
  const clockInMs = clockInTime.getTime();
  const effectiveEndMs = lastActiveAt
    ? Math.max(clockInMs, lastActiveAt.getTime())
    : clockInMs;
  const workedMs = Math.max(0, effectiveEndMs - clockInMs);
  const totalHours = +(workedMs / (1000 * 60 * 60)).toFixed(2);
  return { closeTime: new Date(effectiveEndMs), totalHours };
}
