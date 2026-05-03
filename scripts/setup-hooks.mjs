// One-time setup: install a git pre-push hook that re-bundles
// api/index.js whenever the user pushes. This stops a stale committed
// bundle from shipping when someone forgets to run `npm run build:api`
// after editing server/* code.
//
// Why a script instead of husky:
//   - Zero new dependencies. Pure Node + git plumbing.
//   - Self-documenting. Anyone who reads .githooks/pre-push sees the
//     full intent.
//
// Usage (one-time):
//   npm run setup:hooks
//
// Each subsequent `git push` runs the hook, which:
//   1. Re-bundles api/index.js from server/api-handler.ts via esbuild.
//   2. If the bundle changed, fails the push with an instruction to
//      `git add api/index.js && git commit --amend --no-edit` and try
//      again. This is intentional — we want the committed bundle to
//      match the source code being pushed.

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const HOOK_DIR = ".githooks";
const HOOK_NAME = "pre-push";
const HOOK_BODY = `#!/usr/bin/env bash
# Auto-installed by scripts/setup-hooks.mjs — see that file for context.
# Rebuilds api/index.js and aborts the push if the committed bundle is
# stale relative to the current source.

set -e

# Skip the hook if we're not pushing the main branch (preview pushes
# are okay to ship slightly-stale bundles — Vercel will re-bundle on
# the dev's next merge).
range="$1"
remote_url="$2"
# Read the refs being pushed from stdin (git's documented input format).
while read -r local_ref local_sha remote_ref remote_sha; do
  if [[ "$remote_ref" != "refs/heads/main" ]]; then
    continue
  fi

  echo "[pre-push] re-bundling api/index.js…"
  npm run build:api --silent
  if ! git diff --quiet --exit-code -- api/index.js; then
    echo
    echo "✗ api/index.js was out of sync with server/ source."
    echo "  The hook regenerated it. Add and amend, then push again:"
    echo
    echo "    git add api/index.js"
    echo "    git commit --amend --no-edit"
    echo "    git push"
    echo
    exit 1
  fi
done
exit 0
`;

if (!fs.existsSync(HOOK_DIR)) {
  fs.mkdirSync(HOOK_DIR, { recursive: true });
}
const hookPath = path.join(HOOK_DIR, HOOK_NAME);
fs.writeFileSync(hookPath, HOOK_BODY, { mode: 0o755 });
console.log(`✓ wrote ${hookPath}`);

// Point git at our committed hooks directory so the hook fires for
// every contributor who runs `npm run setup:hooks`.
execSync("git config core.hooksPath .githooks", { stdio: "inherit" });
console.log(`✓ git core.hooksPath = .githooks`);
console.log(`\n  pre-push hook installed. It will re-bundle api/index.js`);
console.log(`  before each push to main and block stale bundles.`);
