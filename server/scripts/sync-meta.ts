import "dotenv/config";
import { syncMetaInsights } from "../services/meta";

// ─────────────────────────────────────────────────────────────────────
// Manual Meta sync runner.
//
// Usage:
//   npx tsx server/scripts/sync-meta.ts              # last 30 days
//   npx tsx server/scripts/sync-meta.ts 60           # last 60 days
//   npx tsx server/scripts/sync-meta.ts 2026-03-01 2026-04-19
// ─────────────────────────────────────────────────────────────────────

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  let startDate: string;
  let endDate: string;

  if (args.length === 2) {
    // Explicit start/end.
    startDate = args[0];
    endDate = args[1];
  } else {
    const days = args.length === 1 ? Math.max(1, Number(args[0]) || 30) : 30;
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 864e5);
    startDate = toYmd(start);
    endDate = toYmd(end);
  }

  console.log(`[sync-meta] window: ${startDate} → ${endDate}`);
  const result = await syncMetaInsights(startDate, endDate);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("[sync-meta] failed:", err);
  process.exit(1);
});
