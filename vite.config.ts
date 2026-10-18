import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Replit-only dev plugins are loaded dynamically so local/Vercel builds
// don't require them.
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
          await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
            m.default(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Keep the framework in its own long-lived chunk so a page or
        // app change doesn't invalidate the cached React runtime.
        // Pages are already split by React.lazy in client/src/App.tsx.
        manualChunks: {
          vendor: ["react", "react-dom", "@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
