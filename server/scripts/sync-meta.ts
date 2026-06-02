import "dotenv/config";
import { syncMetaInsights } from "../services/meta";

// ─────────────────────────────────────────────────────────────────────
// Manual Meta sync runner.
//
// Requires a --storeId <uuid> argument identifying the store whose
// stored Meta credentials and ad-account config should be used.
//
// Usage:
//   npx tsx server/scripts/sync-meta.ts --storeId <uuid>                       # last 30 days
//   npx tsx server/scripts/sync-meta.ts --storeId <uuid> 60                    # last 60 days
//   npx tsx server/scripts/sync-meta.ts --storeId <uuid> 2026-03-01 2026-04-19
// ─────────────────────────────────────────────────────────────────────

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseStoreId(args: string[]): { storeId: string; rest: string[] } {
  const rest: string[] = [];
  let storeId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--storeId" || arg === "--store-id") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(
          "Missing value for --storeId. Usage: npx tsx server/scripts/sync-meta.ts --storeId <uuid> [days | startDate endDate]",
        );
      }
      storeId = next;
      i++; // skip the value
    } else if (arg.startsWith("--storeId=")) {
      storeId = arg.slice("--storeId=".length);
    } else if (arg.startsWith("--store-id=")) {
      storeId = arg.slice("--store-id=".length);
    } else {
      rest.push(arg);
    }
  }

  if (!storeId) {
    throw new Error(
      "Missing required --storeId <uuid> argument. Usage: npx tsx server/scripts/sync-meta.ts --storeId <uuid> [days | startDate endDate]",
    );
  }

  return { storeId, rest };
}

async function main() {
  const { storeId, rest } = parseStoreId(process.argv.slice(2));

  let startDate: string;
  let endDate: string;

  if (rest.length === 2) {
    // Explicit start/end.
    startDate = rest[0];
    endDate = rest[1];
  } else {
    const days = rest.length === 1 ? Math.max(1, Number(rest[0]) || 30) : 30;
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 864e5);
    startDate = toYmd(start);
    endDate = toYmd(end);
  }

  console.log(`[sync-meta] store: ${storeId}  window: ${startDate} → ${endDate}`);
  const result = await syncMetaInsights(storeId, startDate, endDate);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("[sync-meta] failed:", err);
  process.exit(1);
});
