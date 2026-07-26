/**
 * Personal presence banner — global, shown to every signed-in user.
 * Polls /api/presence/me every 30s. States:
 *
 *   - active           → nothing rendered
 *   - break            → nothing rendered (break flow has its own UI)
 *   - idle (urgent)    → red, pulses, "I'm Here" CTA — fires last third of grace
 *   - idle             → yellow countdown with progress bar
 *   - auto-closed      → blue banner: "Shift auto-closed at HH:MM" — persistent
 *                        until they dismiss (sessionStorage) or get reactivated.
 *
 * "Auto-logout" here means CLOCKED OUT for the day — the user stays
 * signed in to OrderFlow. They simply can't clock back in until an
 * admin reactivates them from the Team page.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Clock, Info, X, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Send a heartbeat POST when the user actually interacts with the page.
 * Listens to mousedown, keydown, touchstart only — NOT mousemove or
 * wheel. The bar is "the agent is actively working in OrderFlow," not
 * "a cursor is on the screen" or "they scrolled past something." A
 * clicked button or typed character is the real signal. Throttled to
 * one POST per HEARTBEAT_THROTTLE_MS so a fast-clicking user doesn't
 * hammer the server.
 */
const HEARTBEAT_THROTTLE_MS = 30_000;

function useActivityHeartbeat(enabled: boolean) {
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const fire = () => {
      const now = Date.now();
      if (now - lastSentRef.current < HEARTBEAT_THROTTLE_MS) return;
      lastSentRef.current = now;
      fetch("/api/presence/heartbeat", {
        method: "POST",
        credentials: "include",
      }).catch(() => {
        // Swallow — a missed heartbeat is fine, the next interaction
        // will fire one. We don't want a console error every time the
        // network blips.
      });
    };

    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("mousedown", fire, opts);
    window.addEventListener("keydown", fire, opts);
    window.addEventListener("touchstart", fire, opts);

    // Fire one immediately on mount so a freshly-loaded page counts as
    // activity — otherwise a user who just clocked in and is reading
    // would tick into "idle" before doing anything.
    fire();

    return () => {
      window.removeEventListener("mousedown", fire);
      window.removeEventListener("keydown", fire);
      window.removeEventListener("touchstart", fire);
    };
  }, [enabled]);
}

interface PresenceState {
  status: "active" | "idle" | "break" | "offline";
  lastActiveAt: string | null;
  minutesSinceActive: number;
  minutesUntilLogout: number;
  idleThresholdMin: number;
  graceMin: number;
  autoLogoutTotalMin: number;
  isClockedIn: boolean;
  onBreak: boolean;
  // Set by the server when today's attendance row was auto-closed.
  // Null/absent means either never clocked in today, or shift still open.
  autoClosedAt?: string | null;
}

const AUTO_CLOSED_DISMISS_KEY = "presence:auto-closed-dismissed-at";

export function PresenceBanner() {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const lastSeenAutoClosedAt = useRef<string | null>(null);
  const [dismissedAutoClose, setDismissedAutoClose] = useState<string | null>(
    () => sessionStorage.getItem(AUTO_CLOSED_DISMISS_KEY),
  );
  const [isFiringHeartbeat, setIsFiringHeartbeat] = useState(false);

  const isPublicPage =
    location === "/login" ||
    location === "/signup" ||
    location.startsWith("/signup");

  const presence = useQuery<PresenceState>({
    queryKey: ["/api/presence/me"],
    queryFn: async () => {
      const r = await fetch("/api/presence/me", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !isPublicPage,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // Real user-interaction heartbeats. Only active when there's a
  // session (don't fire on login/signup screens).
  useActivityHeartbeat(!isPublicPage);

  // If we get reactivated (autoClosedAt cleared), drop the dismiss flag
  // so a future auto-close shows the banner again.
  useEffect(() => {
    if (presence.data && !presence.data.autoClosedAt && dismissedAutoClose) {
      sessionStorage.removeItem(AUTO_CLOSED_DISMISS_KEY);
      setDismissedAutoClose(null);
    }
  }, [presence.data, dismissedAutoClose]);

  // When we notice the transition into auto-closed, kick the attendance
  // queries so the dashboard's Shift Control card flips from "On Shift"
  // → "Not Started" instantly instead of waiting up to a full minute.
  useEffect(() => {
    const ac = presence.data?.autoClosedAt ?? null;
    if (ac && ac !== lastSeenAutoClosedAt.current) {
      lastSeenAutoClosedAt.current = ac;
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/break/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/team-today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    }
    if (!ac && lastSeenAutoClosedAt.current) {
      lastSeenAutoClosedAt.current = null;
    }
  }, [presence.data?.autoClosedAt, queryClient]);

  // Click handler for "I'm Here" — explicit heartbeat then refetch.
  // Refetching alone races with the heartbeat (refetch may read /me
  // before the POST lands and return stale "idle"). Doing them in
  // sequence guarantees lastActiveAt is bumped before the next read.
  const handleImHere = async () => {
    setIsFiringHeartbeat(true);
    try {
      await fetch("/api/presence/heartbeat", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore — refetch will retry the read either way
    }
    await presence.refetch();
    setIsFiringHeartbeat(false);
  };

  if (isPublicPage) return null;
  if (!presence.data) return null;

  const d = presence.data;

  // ─── State 1: shift was auto-closed today ──────────────────────────
  // Highest priority — supersedes the idle banner since they're no
  // longer accumulating idle time anyway.
  if (d.autoClosedAt && d.autoClosedAt !== dismissedAutoClose) {
    const t = new Date(d.autoClosedAt);
    const timeStr = t.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return (
      <div className="sticky top-0 z-40 w-full shadow-md">
        <div className="bg-blue-50 dark:bg-blue-950/50 border-b-2 border-blue-500/70">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
            <div className="shrink-0 w-11 h-11 rounded-full bg-blue-500/20 dark:bg-blue-500/15 flex items-center justify-center ring-2 ring-blue-500/20">
              <Info className="w-5 h-5 text-blue-700 dark:text-blue-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base sm:text-lg font-bold text-blue-900 dark:text-blue-100">
                Shift auto-closed at {timeStr}
              </div>
              <div className="text-sm mt-0.5 text-blue-800 dark:text-blue-300/90">
                {d.autoLogoutTotalMin} {d.autoLogoutTotalMin === 1 ? "minute" : "minutes"} of inactivity — ask an admin to reactivate you from the Team page if you need to keep working today.
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                sessionStorage.setItem(AUTO_CLOSED_DISMISS_KEY, d.autoClosedAt!);
                setDismissedAutoClose(d.autoClosedAt!);
              }}
              className="shrink-0 h-9 w-9 text-blue-700 dark:text-blue-300 hover:bg-blue-500/10"
              aria-label="Dismiss"
              data-testid="banner-dismiss-autoclosed"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── State 2: idle countdown ───────────────────────────────────────
  if (d.status !== "idle") return null;

  // Urgency: last third of grace OR <= 1 min remaining, whichever is
  // larger. Prevents the dev override (3 min total) from firing red
  // immediately at idle, and gives prod a sensible "last 10 of 30 min"
  // window.
  const urgentThreshold = Math.max(1, Math.ceil(d.graceMin / 3));
  const isUrgent = d.minutesUntilLogout <= urgentThreshold;

  // Progress bar: percent of grace period remaining. Drains as the
  // countdown burns down — a visual "time draining" cue more direct
  // than a numeric "X min".
  const pctRemaining = Math.max(
    0,
    Math.min(100, (d.minutesUntilLogout / d.autoLogoutTotalMin) * 100),
  );

  return (
    <div className="sticky top-0 z-40 w-full shadow-md">
      <div
        className={cn(
          "border-b-2 transition-colors",
          isUrgent
            ? "bg-red-50 dark:bg-red-950/50 border-red-500/80"
            : "bg-yellow-50 dark:bg-yellow-950/40 border-yellow-500/70",
        )}
        data-testid="presence-banner-idle"
      >
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <div
            className={cn(
              "shrink-0 w-11 h-11 rounded-full flex items-center justify-center ring-2",
              isUrgent
                ? "bg-red-500/20 ring-red-500/30 animate-pulse"
                : "bg-yellow-500/20 ring-yellow-500/25",
            )}
          >
            {isUrgent ? (
              <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-300" />
            ) : (
              <Clock className="w-5 h-5 text-yellow-700 dark:text-yellow-300" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "text-base sm:text-lg font-bold leading-tight",
                isUrgent
                  ? "text-red-900 dark:text-red-100"
                  : "text-yellow-900 dark:text-yellow-100",
              )}
            >
              {isUrgent
                ? `Auto clock-out in ${d.minutesUntilLogout} ${d.minutesUntilLogout === 1 ? "minute" : "minutes"}`
                : `You've been idle for ${d.minutesSinceActive} ${d.minutesSinceActive === 1 ? "minute" : "minutes"}`}
            </div>
            <div
              className={cn(
                "text-sm mt-0.5",
                isUrgent
                  ? "text-red-700 dark:text-red-300/90"
                  : "text-yellow-800 dark:text-yellow-300/90",
              )}
            >
              {isUrgent
                ? "Click the button or do anything in OrderFlow now to stay clocked in."
                : `You'll be clocked out in ${d.minutesUntilLogout} ${d.minutesUntilLogout === 1 ? "minute" : "minutes"} if you stay inactive (policy: ${d.autoLogoutTotalMin} min).`}
            </div>
          </div>

          <Button
            size="lg"
            onClick={handleImHere}
            disabled={isFiringHeartbeat}
            className={cn(
              "shrink-0 font-semibold shadow-sm",
              isUrgent
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-yellow-500 hover:bg-yellow-600 text-yellow-950 dark:text-yellow-50",
            )}
            data-testid="banner-im-here"
          >
            <Hand className="w-4 h-4 mr-2" />
            {isFiringHeartbeat ? "Resetting..." : "I'm Here"}
          </Button>
        </div>

        {/* Progress bar — visualizes time remaining in the grace window.
            Drains right-to-left as minutesUntilLogout falls. */}
        <div
          className={cn(
            "h-1 w-full",
            isUrgent ? "bg-red-200/70 dark:bg-red-900/40" : "bg-yellow-200/70 dark:bg-yellow-900/40",
          )}
        >
          <div
            className={cn(
              "h-full transition-all duration-1000 ease-linear",
              isUrgent ? "bg-red-600" : "bg-yellow-500",
            )}
            style={{ width: `${pctRemaining}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
