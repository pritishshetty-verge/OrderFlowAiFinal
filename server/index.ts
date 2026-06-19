import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { pool } from "./db";
import { shopifyClient, getLegacyStoreShopifyClient } from "./shopify";
import { attachStoreScope } from "./storeScope";
import {
  getIdleThresholdMin,
  getGraceMin,
  getAutoLogoutTotalMin,
  computeAutoClose,
} from "./presence-config";

// ─────────────────────────────────────────────────────────────────────
// Global crash safety net.
//
// Without these handlers a transient WebSocket flicker from Neon's
// serverless driver (which we use because Vercel can't open arbitrary
// outbound TCP) brings the whole Node process down. The first handler
// keeps the process alive. The second handler dedicates a quiet path
// for ONE specific noisy error class:
//
//   TypeError: Cannot set property message of #<ErrorEvent> which has
//   only a getter
//
// Root cause: the `ws` package's `ErrorEvent` class uses
// getter-only properties on Node 20+, but @neondatabase/serverless
// (≤0.10.x) tries to mutate `event.message` when augmenting the error.
// The pool reconnects on its next query, so the only externally
// visible effect is a confusing stack trace in the log. We collapse
// it to a single concise warning instead of a 15-line trace.
//
// Upstream fix tracked at neondatabase/serverless#... — drop this
// classifier once we move to a version that no longer mutates the
// event object.
// ─────────────────────────────────────────────────────────────────────
const NEON_WS_FINGERPRINT =
  "Cannot set property message of #<ErrorEvent>";

process.on("uncaughtException", (err) => {
  if (err?.message?.includes(NEON_WS_FINGERPRINT)) {
    console.warn(
      "[neon-ws] transient WebSocket flicker (pool will reconnect on next query)",
    );
    return;
  }
  console.error("Uncaught exception (server staying alive):", err.message);
  console.error("Stack:", err.stack);
});

process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message ?? String(reason);
  if (typeof msg === "string" && msg.includes(NEON_WS_FINGERPRINT)) {
    console.warn(
      "[neon-ws] transient WebSocket flicker (rejected; pool will reconnect)",
    );
    return;
  }
  console.error("Unhandled rejection (server staying alive):", reason);
});

const app = express();

// Trust Vercel/Proxy for secure cookies
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Augment express-session's SessionData so TypeScript knows about the
// fields we store on `req.session`. Today only `userId` lives there;
// any future per-session state (e.g. activeStoreId in Phase 3) gets
// added here.
// ─────────────────────────────────────────────────────────────────────
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// ─────────────────────────────────────────────────────────────────────
// Session store: connect-pg-simple backed by Neon.
// Sessions persist across serverless invocations on Vercel and across
// restarts locally. The `session` table is auto-created on first use.
// ─────────────────────────────────────────────────────────────────────
const PgSession = connectPgSimple(session);
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error(
    "SESSION_SECRET must be set. Generate a long random string and add it to your .env.",
  );
}

app.use(
  session({
    store: new PgSession({
      pool: pool as any, // neon-serverless Pool is node-postgres compatible
      tableName: "session",
      createTableIfMissing: true,
    }),
    name: "orderflow.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
);

// ─────────────────────────────────────────────────────────────────────
// Server-authoritative identity middleware (Phase 0).
//
// Until now, every authenticated route trusted `?currentUserId=…` from
// the URL or `currentUserId` from the body — i.e. the client declared
// its own identity. That was a real spoofing vector and the
// fundamental hole the multi-store RBAC design can't safely sit on.
//
// This middleware fixes it without touching all 133 routes one-by-one:
//   • If the request has a valid session (`req.session.userId` set
//     by POST /api/auth/login), it OVERWRITES whatever the client
//     put in `req.query.currentUserId` and `req.body.currentUserId`
//     with the server-trusted value from the session. Spoofs are
//     silently corrected — the route handler reads what we say.
//   • If there is no session (logged-out client, webhook from
//     Shopify, an old cached frontend that hasn't redeployed yet),
//     the middleware does nothing and the legacy
//     client-supplied `currentUserId` path still works. This keeps
//     the deploy gracefully backwards-compatible during the
//     transition; the fallback will be deleted in a follow-up once
//     the whole frontend is migrated.
//
// Placement: must run AFTER session() (needs `req.session`) and
// AFTER express.json/urlencoded (needs `req.body`), BEFORE routes.
// ─────────────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  const sessionUserId = req.session?.userId;
  if (sessionUserId) {
    // Express 4's `req.query` is a mutable plain object; safe to assign.
    (req.query as any).currentUserId = sessionUserId;
    if (
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body)
    ) {
      (req.body as any).currentUserId = sessionUserId;
    }
    // Heartbeat is no longer auto-fired here — too many background
    // polls (auth/me, stores/me, dashboard data) would keep the user
    // "active" forever. Real user activity is signaled explicitly by
    // the client posting to /api/presence/heartbeat on mouse/keyboard
    // events (see client/src/components/presence-banner.tsx).
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────
// Store scope resolution (Phase 2).
//
// Runs AFTER the identity-injection middleware (which gives us a
// trustworthy req.session.userId) and BEFORE route handlers. Attaches
// `req.storeScope = { storeId, isAdmin, isFallback }` on every
// authenticated request so handlers can scope reads to the active
// store without re-doing the user_stores lookup. Webhooks and other
// unauthenticated endpoints pass through untouched; the middleware
// noops for them.
//
// Resolution order (see server/storeScope.ts for full rules):
//   1. X-Active-Store-Id header (what the Phase 3 store-switcher
//      writes from the frontend).
//   2. Fallback to the user's first user_stores row, or — for
//      admins — the oldest stores row.
//
// Authorization failures (user requested a store they don't belong
// to) are NOT raised here — they're stashed on req and surfaced when
// a route handler actually pulls the scope via requireStoreScope().
// That keeps non-scoped endpoints (e.g. /api/auth/me) reachable for
// users whose membership is still being set up.
// ─────────────────────────────────────────────────────────────────────
app.use(attachStoreScope);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// ─────────────────────────────────────────────────────────────────────
// Shopify webhook auto-registration
//
// Runs once at boot, right after the DB is seeded. Reads APP_URL from
// the environment (must be the publicly-reachable hostname Shopify
// will POST to — for local dev, an ngrok URL; for prod, your Vercel
// domain). If APP_URL is missing we log a clear warning and skip —
// the server still boots so n8n-relayed or manually-configured
// webhooks keep working.
//
// Non-blocking: failures here NEVER crash the server. Shopify might
// be down, the store might not have the webhook scope yet — neither
// should prevent our app from coming up.
// ─────────────────────────────────────────────────────────────────────
async function registerAllWebhooks(): Promise<void> {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    console.warn(
      "⚠ [webhook-register] APP_URL not set — skipping Shopify webhook auto-registration.",
    );
    console.warn(
      "  Set APP_URL in .env to the publicly-reachable URL Shopify should call",
    );
    console.warn(
      "  (e.g. APP_URL=https://abc123.ngrok.io for local dev, or your Vercel",
    );
    console.warn(
      "  domain in prod). Without this, you must register webhooks manually",
    );
    console.warn("  or rely on the n8n relay documented in /settings/shopify/webhooks.");
    return;
  }

  // Basic shape validation. Shopify will reject non-HTTPS URLs anyway,
  // so catch the common "http://localhost" mistake early.
  if (!/^https:\/\//i.test(appUrl)) {
    console.warn(
      `⚠ [webhook-register] APP_URL must be HTTPS (got: ${appUrl}). Skipping.`,
    );
    console.warn(
      "  Shopify requires HTTPS for webhook endpoints. Use ngrok locally.",
    );
    return;
  }

  console.log(`[webhook-register] Registering Shopify webhooks for ${appUrl}…`);
  try {
    // Boot-time registration: route through the legacy store's
    // client so multi-store creds in `stores` are picked up instead
    // of the env-var fallback. Falls back to the env-singleton when
    // no `stores` row exists yet (very first boot before any seed).
    const client = await getLegacyStoreShopifyClient();
    const { topics } = await client.registerAllWebhooks(appUrl);
    const summary = topics
      .map((t) => `  ${t.action.padEnd(9)} ${t.topic.padEnd(22)} → ${t.address}${t.error ? `  (${t.error})` : ""}`)
      .join("\n");
    console.log(`[webhook-register] Done.\n${summary}`);
    const failed = topics.filter((t) => t.action === "failed");
    if (failed.length > 0) {
      console.warn(
        `⚠ [webhook-register] ${failed.length} topic(s) failed — check Shopify credentials and webhook scopes.`,
      );
    }
  } catch (err: any) {
    // Catch-all safety net — registerAllWebhooks already handles
    // per-topic errors, so this only fires for truly unexpected
    // exceptions (import errors, network unreachable, etc.)
    console.error(
      "✗ [webhook-register] Unexpected failure:",
      err?.message ?? err,
    );
    console.warn("  Server continuing; webhooks can be re-registered via the UI.");
  }
}

// ─────────────────────────────────────────────────────────────────────
// Smart presence — auto-logout worker.
//
// "Auto-logout" here means CLOCKED OUT, not signed out of the web app.
// We close their attendance row for the day. They stay logged in to
// OrderFlow (so they can still browse, see their shift status, ask an
// admin to reactivate) but the clock-in endpoint blocks them until an
// admin clicks Reactivate.
//
// Rule (from product spec):
//   • 10 min no API activity     → status flips to "idle" (visible only)
//   • 30 min more (40 min total) → auto-close attendance (clock them out)
//   • Admin can "Reactivate" from Team page (sets reactivated_at, lets
//     them clock back in)
//
// Runs every 60 seconds. Cheap query: 1 row per active staffer at most,
// usually 0. We skip the loop entirely while no users are flagged
// (i.e., quick early-return path) to avoid noisy logs.
//
// IDLE_THRESHOLD_MIN + AUTO_LOGOUT_GRACE_MIN are read from env so an
// admin can tune them per-deployment without a redeploy. Defaults
// match the policy above.
// ─────────────────────────────────────────────────────────────────────
const IDLE_THRESHOLD_MIN = getIdleThresholdMin();
const AUTO_LOGOUT_GRACE_MIN = getGraceMin();
const AUTO_LOGOUT_TOTAL_MIN = getAutoLogoutTotalMin();

async function runAutoLogoutSweep() {
  try {
    const candidates = await storage.findAutoLogoutCandidates(AUTO_LOGOUT_TOTAL_MIN);
    if (candidates.length === 0) return;

    const now = new Date();
    for (const c of candidates) {
      try {
        // Use the candidate's own clock_in_time (carried on the row) —
        // NOT a re-fetched "today" row. getTodayAttendance uses
        // server-local day boundaries; near IST/UTC midnight that could
        // return undefined and silently credit 0 hours for a real shift.
        // computeAutoClose is shared with the cron path so both agree.
        const { closeTime, totalHours } = computeAutoClose(c.clockInTime, c.lastActiveAt, now);
        const reason = `Auto-logout: no activity for ${AUTO_LOGOUT_TOTAL_MIN}+ minutes (idle ${IDLE_THRESHOLD_MIN}m + grace ${AUTO_LOGOUT_GRACE_MIN}m). Admin can reactivate from Team page.`;

        const closed = await storage.autoCloseAttendance(c.attendanceId, closeTime, reason, totalHours);
        // NOTE: deliberately NOT killing web sessions — the user stays
        // signed in. Only their shift is closed. clock-in endpoint
        // will block them via isAutoLoggedOutToday until admin reactivates.
        if (closed) {
          console.log(
            `[auto-logout] clocked out user ${c.userId} (attendance ${c.attendanceId}, worked ${totalHours}h)`,
          );
        }
      } catch (err: any) {
        console.error(`[auto-logout] failed for user ${c.userId}:`, err?.message ?? err);
      }
    }
  } catch (err: any) {
    console.error("[auto-logout] sweep failed:", err?.message ?? err);
  }
}

// Bootstrap is an async IIFE that resolves when the app is fully wired up.
// We export the resulting promise so `api/index.ts` (Vercel) can await it
// per cold-start invocation.
const ready = (async () => {
  // Idempotent schema guard for columns added without a migration runner
  // (e.g. abandoned_checkouts.recovery_status). Non-fatal: a transient DDL
  // hiccup must not take down boot.
  try {
    await storage.ensureSchemaPatches();
  } catch (err) {
    console.error("[schema-patch] ensure failed (non-fatal):", err);
  }

  // Seed default app settings on startup
  await storage.seedDefaultSettings();

  // Start the auto-logout worker. Once a minute is fine — the policy
  // is "40 min of inactivity," so a 60s sweep gives ±60s precision,
  // which nobody will notice.
  //
  // PRODUCTION path: Vercel cron hits /api/cron/attendance-auto-logout
  // every minute (see vercel.json + routes.ts). Vercel has no
  // persistent process, so setInterval would never fire.
  // DEV / standalone Node path: in-process setInterval, below.
  if (!process.env.VERCEL) {
    setInterval(() => {
      void runAutoLogoutSweep();
    }, 60_000);
    console.log(
      `[auto-logout] worker started — sweeps every 60s, threshold ${AUTO_LOGOUT_TOTAL_MIN} min ` +
      `(idle ${IDLE_THRESHOLD_MIN}m + grace ${AUTO_LOGOUT_GRACE_MIN}m)`,
    );
  }

  // Register Shopify webhooks in the background. We don't await it —
  // it can take a couple seconds round-trip to Shopify and we don't
  // want to block the rest of boot on it. Any errors are logged
  // inside the function.
  registerAllWebhooks().catch((err) => {
    console.error("[webhook-register] uncaught:", err);
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error("Express error:", err.message || err);
  });

  // Vite middleware must never run on Vercel serverless. Locally, only run
  // it in development after all other routes are registered.
  if (app.get("env") === "development" && !process.env.VERCEL) {
    await setupVite(app, server);
  } else if (!process.env.VERCEL) {
    serveStatic(app);
  }

  // Only bind a port when running as a standalone Node process.
  // On Vercel, the serverless runtime invokes the exported app directly.
  if (!process.env.VERCEL) {
    const port = parseInt(process.env.PORT || "5000", 10);
    // reusePort is Linux-only; on macOS it fails with ENOTSUP.
    const listenOptions: { port: number; host: string; reusePort?: boolean } = {
      port,
      host: "0.0.0.0",
    };
    if (process.platform === "linux") {
      listenOptions.reusePort = true;
    }
    server.listen(listenOptions, () => {
      log(`serving on port ${port}`);
    });

    // ─────────────────────────────────────────────────────────────────
    // Graceful shutdown.
    //
    // macOS auto-restores terminal sessions across reboots, which used
    // to crash-loop the dev server: SIGTERM at shutdown left the
    // Neon WS pool with half-open sockets, the next boot tried to
    // bind :5001 while the prior PID was still draining (or its
    // pooler was still holding a connection slot), and the new
    // process panicked.
    //
    // The fix has two halves:
    //   (a) `npm run predev` force-kills anything on the port before
    //       boot (see package.json), so a stale PID never blocks us.
    //   (b) These handlers below cleanly stop the HTTP listener and
    //       drain the Neon pool when the OS sends SIGTERM/SIGINT, so
    //       the *next* boot doesn't have to clean up after us.
    //
    // We re-emit SIGINT/SIGTERM exactly once. A second Ctrl-C escalates
    // to a hard exit so the user can always force-quit.
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        console.warn(`[${signal}] received twice; forcing exit`);
        process.exit(1);
      }
      shuttingDown = true;
      console.log(`[${signal}] graceful shutdown started`);

      // Stop accepting new connections; existing ones drain.
      const closePromise = new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) console.warn(`[${signal}] server.close error:`, err.message);
          else console.log(`[${signal}] http listener closed`);
          resolve();
        });
      });

      // Hard 5s ceiling: open SSE / long-polling clients shouldn't
      // block the OS shutdown loop forever.
      const ceiling = new Promise<void>((resolve) =>
        setTimeout(() => {
          console.warn(`[${signal}] http close timed out (5s); proceeding`);
          resolve();
        }, 5000),
      );
      await Promise.race([closePromise, ceiling]);

      // Drain the Neon pool. Failures here are non-fatal — we're
      // exiting anyway, and the OS will clean up sockets.
      try {
        await pool.end();
        console.log(`[${signal}] db pool drained`);
      } catch (err: any) {
        console.warn(`[${signal}] pool.end error:`, err?.message ?? err);
      }

      console.log(`[${signal}] shutdown complete`);
      process.exit(0);
    };

    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  }

  return app;
})();

export { ready, registerAllWebhooks };
export default app;
