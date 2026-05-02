// Build script for the Vercel serverless API function.
//
// Why we need this:
//   Our project is ESM (package.json has "type": "module"). Vercel's
//   @vercel/node runtime ships .ts files compiled in-place but does NOT
//   bundle them. Node's ESM loader then can't resolve our 80+
//   extension-less relative imports (`./foo`, `../bar/baz`) nor the
//   `@shared/*` tsconfig path aliases — every cold start crashes with
//   ERR_MODULE_NOT_FOUND.
//
// What this does:
//   esbuild bundles server/api-handler.ts and everything it transitively
//   imports (including dynamic `await import(...)` calls and
//   @shared/schema via tsconfig paths) into a single self-contained
//   api/index.js ESM module. Vercel deploys that .js file directly.
//
// Why source lives at server/api-handler.ts (not api/index.ts):
//   @vercel/node prefers .ts over .js when both exist in api/. To
//   guarantee Vercel uses our bundled output, we keep the source
//   outside api/ entirely. The bundler emits the .js into api/ during
//   the build step.
//
// Why --packages=external:
//   Vercel deploys node_modules with the function. Marking npm packages
//   as external keeps the bundle small (~50 KB instead of ~5 MB) and
//   sidesteps CJS/ESM interop snags in libraries like pdfkit and ws.
//   The require() shim in the banner enables those CJS packages to
//   load via createRequire under ESM.
import { build } from "esbuild";
import fs from "fs";

const outFile = "api/index.js";
fs.mkdirSync("api", { recursive: true });

await build({
  entryPoints: ["server/api-handler.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: outFile,
  packages: "external",
  tsconfig: "tsconfig.json",
  // ESM doesn't have require() by default. Several CJS packages we depend
  // on (pdfkit, ws transitive deps, etc.) call require() internally.
  // Polyfill it via createRequire so the bundled output is self-sufficient.
  banner: {
    js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
  },
  logLevel: "info",
});

console.log(`✓ bundled → ${outFile}`);
