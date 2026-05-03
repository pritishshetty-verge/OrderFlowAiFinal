import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";

// IMPORTANT: vite must be loaded dynamically AND we cannot import the
// project's vite.config from this file.
//
// We bundle this file into api/index.js for Vercel via esbuild.
//   1. ESM `import` statements are hoisted and eagerly evaluated at
//      module load, which would pull `vite` → `rollup` →
//      @rollup/rollup-linux-x64-gnu (a platform-specific native binary)
//      into the cold-start path even in production where setupVite()
//      is never called. Vercel's serverless container doesn't ship
//      that optional binary, so the function crashes with
//      MODULE_NOT_FOUND. Solution: dynamic `await import("vite")` only
//      inside setupVite(), so it's reached only on the dev path.
//   2. Static `import viteConfig from "../vite.config"` was the
//      sneakier offender: esbuild bundled vite.config.ts, and *its*
//      top-level `import { defineConfig } from "vite"` got hoisted to
//      the top of the merged bundle — pulling vite/rollup in eagerly
//      regardless of how we wrote the surrounding logic. Solution: do
//      NOT import vite.config at all. Pass `configFile: true` to
//      createViteServer so Vite reads vite.config.ts from disk at dev
//      runtime. The Vercel bundle never references it.

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer, createLogger } = await import("vite");

  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  // configFile: true (default) tells Vite to load vite.config.ts from
  // the cwd at dev runtime — see the file-level comment above for why
  // we don't import it statically.
  const vite = await createViteServer({
    configFile: true,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
