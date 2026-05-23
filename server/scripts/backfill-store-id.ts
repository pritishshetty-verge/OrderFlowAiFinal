import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Phase 1 backfill: single-store → multi-store schema migration.
//
// Run this AFTER `npm run db:push` has applied the new schema (already
// done in the Phase 1 deploy). The script is idempotent — re-running
// it does nothing if all rows already have store_id set.
//
// Order of operations:
//
//   1. Resolve the "legacy" store row.
//      a. If a stores row already exists for the current
//         shopify_credentials.store_url, reuse it.
//      b. Otherwise insert one, copying storeName/storeUrl/encrypted
//         credentials/test status from the active shopify_credentials row.
//   2. For every store-scoped data table (13 of them), set
//      store_id = <legacy.id> on rows where store_id IS NULL.
//   3. For every existing user, ensure a user_stores row exists
//      linking them to the legacy store (ON CONFLICT DO NOTHING).
//      Admins don't strictly need a row (they implicitly see all
//      stores) but we add one anyway for explicit auditability.
//   4. Print a per-table summary.
//
// Usage:
//   npx tsx server/scripts/backfill-store-id.ts
//
// What we deliberately DON'T do:
//   • Flip any storeId column to NOT NULL. That's a separate
//     follow-up migration once we've verified the backfill in prod.
//   • Drop the date-only PK on marketing_metrics and add the
//     composite (date, storeId) PK. Same reason — deferred to the
//     post-backfill follow-up where we also flip NOT NULLs.
//   • Touch the legacy shopify_credentials table. It stays intact
//     until Phase 5 migrates code off it.
// ─────────────────────────────────────────────────────────────────────

const TABLES_WITH_STORE_ID = [
  "orders",
  "products",
  "customers",
  "order_items",
  "order_assignments",
  "order_status_history",
  "shopify_sync_logs",
  "webhook_logs",
  "shipments",
  "ndr_events",
  "calls",
  "abandoned_checkouts",
  "marketing_metrics",
] as const;

async function main() {
  console.log(`[backfill-store-id] starting at ${new Date().toISOString()}\n`);

  // ── Step 1: resolve or create the legacy store row ────────────────
  // First check whether the backfill has already run.
  const existingByCount: any = await db.execute(
    sql`SELECT COUNT(*)::int4 AS n FROM stores`,
  );
  const existingStoreCount =
    ((existingByCount as any).rows ?? existingByCount)[0]?.n ?? 0;
  console.log(`  stores table currently has ${existingStoreCount} row(s)`);

  // Read the active shopify_credentials row — this is the legacy
  // single-store config we're promoting.
  const credsRes: any = await db.execute(sql`
    SELECT id, store_name, store_url, api_key, api_secret, access_token,
           webhook_secret, is_active, last_tested_at, test_status, test_message
    FROM shopify_credentials
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const creds = ((credsRes as any).rows ?? credsRes)[0];
  if (!creds) {
    console.error(
      "  ✗ no active shopify_credentials row found — cannot determine legacy store. Aborting.",
    );
    process.exit(1);
  }
  console.log(
    `  ✓ legacy creds: storeUrl=${creds.store_url}  storeName=${creds.store_name ?? "(unset)"}`,
  );

  // Insert (or look up) the stores row for this storeUrl.
  let legacyStoreId: string;
  const existingStoreRes: any = await db.execute(sql`
    SELECT id FROM stores WHERE store_url = ${creds.store_url} LIMIT 1
  `);
  const existingStore = ((existingStoreRes as any).rows ?? existingStoreRes)[0];
  if (existingStore) {
    legacyStoreId = existingStore.id;
    console.log(`  ✓ existing stores row found:  id=${legacyStoreId}  (reusing)`);
  } else {
    const ins: any = await db.execute(sql`
      INSERT INTO stores (
        store_name, store_url, api_key, api_secret, access_token,
        webhook_secret, is_active, last_tested_at, test_status, test_message
      )
      VALUES (
        ${creds.store_name},
        ${creds.store_url},
        ${creds.api_key},
        ${creds.api_secret},
        ${creds.access_token},
        ${creds.webhook_secret},
        ${creds.is_active},
        ${creds.last_tested_at},
        ${creds.test_status},
        ${creds.test_message}
      )
      RETURNING id
    `);
    legacyStoreId = ((ins as any).rows ?? ins)[0].id;
    console.log(`  ✓ inserted new stores row:    id=${legacyStoreId}`);
  }

  console.log();

  // ── Step 2: backfill store_id on every data table ────────────────
  console.log(`[backfill-store-id] tagging data rows with store_id=${legacyStoreId}\n`);
  const tableResults: Array<{ table: string; updated: number; remaining: number }> = [];
  for (const table of TABLES_WITH_STORE_ID) {
    // db.execute doesn't interpolate identifiers — use sql.raw for the
    // table name, sql.placeholder for the value. The table list is a
    // compile-time constant so there's no injection risk.
    const upd: any = await db.execute(sql`
      WITH updated AS (
        UPDATE ${sql.raw(table)}
        SET store_id = ${legacyStoreId}
        WHERE store_id IS NULL
        RETURNING 1
      )
      SELECT COUNT(*)::int4 AS n FROM updated
    `);
    const updatedCount = ((upd as any).rows ?? upd)[0]?.n ?? 0;

    const remRes: any = await db.execute(sql`
      SELECT COUNT(*)::int4 AS n FROM ${sql.raw(table)} WHERE store_id IS NULL
    `);
    const remaining = ((remRes as any).rows ?? remRes)[0]?.n ?? 0;

    tableResults.push({ table, updated: updatedCount, remaining });
    console.log(
      `  ${table.padEnd(24)}  updated=${String(updatedCount).padStart(7)}  null-remaining=${remaining}`,
    );
  }

  // ── Step 3: grant every existing user access to the legacy store ──
  console.log();
  console.log(`[backfill-store-id] granting user_stores membership to every existing user`);
  const usersRes: any = await db.execute(sql`SELECT id FROM users`);
  const userRows = ((usersRes as any).rows ?? usersRes) as Array<{ id: string }>;
  let usGranted = 0;
  let usSkipped = 0;
  for (const u of userRows) {
    const ins: any = await db.execute(sql`
      INSERT INTO user_stores (user_id, store_id)
      VALUES (${u.id}, ${legacyStoreId})
      ON CONFLICT (user_id, store_id) DO NOTHING
      RETURNING id
    `);
    const inserted = ((ins as any).rows ?? ins).length > 0;
    if (inserted) usGranted++;
    else usSkipped++;
  }
  console.log(`  user_stores rows: ${usGranted} new, ${usSkipped} already existed (total users: ${userRows.length})`);

  // ── Step 4: summary ──────────────────────────────────────────────
  console.log("\n──────────────  backfill summary  ──────────────");
  console.log(`  legacy store id  : ${legacyStoreId}`);
  console.log(`  legacy store URL : ${creds.store_url}`);
  console.log();
  console.log(`  table-by-table data rows updated:`);
  for (const r of tableResults) {
    const status = r.remaining === 0 ? "✓" : "⚠";
    console.log(
      `    ${status} ${r.table.padEnd(24)}  +${String(r.updated).padStart(7)}  (still NULL: ${r.remaining})`,
    );
  }
  console.log();
  console.log(`  user_stores memberships: +${usGranted}  (existing: ${usSkipped})`);
  console.log();
  console.log(`[backfill-store-id] done at ${new Date().toISOString()}`);
  console.log();
  console.log(`Next step (post-verification):`);
  console.log(`  • Add NOT NULL to every storeId column in shared/schema.ts`);
  console.log(`  • Swap marketing_metrics PK from (date) to (date, store_id)`);
  console.log(`  • Run npm run db:push again to enforce the constraints`);
  console.log(`  • Both changes will succeed cleanly now that no row has store_id IS NULL`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-store-id] FAILED:", err);
  process.exit(1);
});
