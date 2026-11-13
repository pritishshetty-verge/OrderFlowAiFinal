// Ops Copilot smoke test. Runs streamCopilot directly against the dev DB +
// Anthropic, bypassing the HTTP route / auth / SSE plumbing. Local dev check.
//
//   npx tsx server/scripts/smoke-copilot.ts
//   npx tsx server/scripts/smoke-copilot.ts "Where is order #15667?"
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { streamCopilot } from "../services/copilot/agent";

const rows = (r: any): any[] => (r?.rows ?? r ?? []) as any[];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY is not set in .env — add it and re-run.");
    process.exit(2);
  }
  console.log(`model: ${process.env.COPILOT_MODEL || "claude-sonnet-5-5"}`);

  // Pick an active store + an admin/developer user from the DEV DB.
  const store = rows(await db.execute(sql`
    SELECT id, store_name FROM stores WHERE is_active = true LIMIT 1
  `))[0];
  const user = rows(await db.execute(sql`
    SELECT id, full_name, role FROM users
    WHERE is_active = true AND role IN ('admin','developer') LIMIT 1
  `))[0];
  if (!store || !user) {
    console.error("✗ Need an active store and an admin/developer user in the dev DB.", { store, user });
    process.exit(1);
  }
  console.log(`store: ${store.store_name} (${store.id})`);
  console.log(`user:  ${user.full_name} [${user.role}]`);

  const ctx = { storeId: store.id as string, userId: user.id as string, isAdmin: true };
  const question =
    process.argv.slice(2).join(" ").trim() ||
    "How many open NDRs are there right now? List up to 5 with their reasons.";

  console.log("\n────────────────────────────────────────────");
  console.log("Q:", question);
  console.log("────────────────────────────────────────────");

  const t0 = Date.now();
  let textLen = 0;
  const toolsUsed: string[] = [];
  const usage = await streamCopilot({
    history: [{ role: "user", content: question }],
    ctx,
    pageContext: "page: /ndr (smoke test)",
    onEvent: (ev) => {
      if (ev.type === "text") { process.stdout.write(ev.delta); textLen += ev.delta.length; }
      else if (ev.type === "tool") { toolsUsed.push(ev.name); console.log(`\n  ⚙ [${ev.name}] ${ev.summary}`); }
      else if (ev.type === "tool_done") console.log(`  ✓ [${ev.name}] done`);
      else if (ev.type === "error") console.log(`\n  ✗ ERROR: ${ev.message}`);
      else if (ev.type === "done") console.log("\n  ● done");
    },
  });

  console.log(`\n────────────────────────────────────────────`);
  console.log(`tools called: ${toolsUsed.join(", ") || "(none)"}`);
  console.log(`answer chars: ${textLen} · elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`tokens: ${usage.inputTokens} in / ${usage.outputTokens} out · cache read ${usage.cacheReadTokens} / write ${usage.cacheWriteTokens}`);
  process.exit(0);
}

main().catch((e) => { console.error("smoke-copilot failed:", e); process.exit(1); });
