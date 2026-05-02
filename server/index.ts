import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { pool } from "./db";
import { shopifyClient } from "./shopify";

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
    const { topics } = await shopifyClient.registerAllWebhooks(appUrl);
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

// Bootstrap is an async IIFE that resolves when the app is fully wired up.
// We export the resulting promise so `api/index.ts` (Vercel) can await it
// per cold-start invocation.
const ready = (async () => {
  // Seed default app settings on startup
  await storage.seedDefaultSettings();

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
