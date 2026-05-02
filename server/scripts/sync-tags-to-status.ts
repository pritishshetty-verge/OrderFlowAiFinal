import "dotenv/config";
import { randomUUID } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Backfill: `of:confirmed` tag → call_status = 'Confirmed'
//
// Why:
//   We lost local CX confirmation history during the Replit→local
//   migration. The Shopify tags survived (stored in
//   orders.raw_shopify_data.tags), so we can reconstruct "CX Confirmed"
//   counts from them.
//
// Data discovery (see inspect-confirmed-tags.ts):
//   - orders.tags[] column is empty for all 47k rows (historical sync
//     never lifted tags out of the JSON).
//   - raw_shopify_data->>'tags' is a comma-separated string, the
//     authoritative Shopify payload. 1,125 orders contain "of:confirmed".
//   So we scan the JSON, not the array column.
//
// What we write:
//   - call_status = 'Confirmed'
//   - confirmed_at = processed_at  (best-known proxy; keeps Pare's
//       per-day CX Confirmed bucket on the right IST day)
//   - confirmed_by = <backfill user id>  (non-null so Pare's SQL
//       COUNT FILTER (… AND confirmed_by IS NOT NULL) picks them up
//       as CX Confirmed instead of Brand Confirmed)
//   - confirmed_notes = 'Backfilled from of:confirmed tag …'
//
// Backfill user:
//   Defaults to a synthetic agent (`cx-historical@backfill.local`)
//   created once and reused on subsequent runs. Pass --cx-user-email
//   to use an existing agent account instead — useful if you want
//   the rows attributed to a real person.
//
// Idempotency:
//   The WHERE filter requires call_status <> 'Confirmed', so re-runs
//   are no-ops. The synthetic user is looked up by email first and
//   only created when missing.
//
// Flags:
//   --dry-run              show what would change, don't mutate
//   --cx-user-email=<e>    use this existing agent instead of the
//                          synthetic backfill user
// ─────────────────────────────────────────────────────────────────────

const TAG = "of:confirmed";
const BACKFILL_USER_EMAIL = "cx-historical@backfill.local";
const BACKFILL_USER_USERNAME = "cx_historical_backfill";
const BACKFILL_USER_FULLNAME = "CX Historical (Pre-Migration Backfill)";

type Args = {
  dryRun: boolean;
  cxUserEmail: string | null;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const emailArg = args.find((a) => a.startsWith("--cx-user-email="));
  const cxUserEmail = emailArg ? emailArg.split("=", 2)[1] : null;
  return { dryRun, cxUserEmail };
}

async function findOrCreateBackfillUser(
  overrideEmail: string | null,
  dryRun: boolean,
): Promise<{ id: string; email: string; source: "existing" | "created" }> {
  const targetEmail = overrideEmail ?? BACKFILL_USER_EMAIL;

  const existing: any = await db.execute(sql`
    SELECT id, email FROM users WHERE email = ${targetEmail} LIMIT 1
  `);
  const existingRow = ((existing as any).rows ?? existing)[0];

  if (existingRow) {
    return { id: existingRow.id, email: existingRow.email, source: "existing" };
  }

  // If user explicitly named an email that doesn't exist, that's a
  // mistake — fail loudly rather than silently creating.
  if (overrideEmail) {
    throw new Error(
      `--cx-user-email=${overrideEmail} not found in users table. ` +
        `Either use an existing agent email or omit the flag to use the ` +
        `synthetic backfill user (${BACKFILL_USER_EMAIL}).`,
    );
  }

  if (dryRun) {
    // Use a placeholder so we can still show the plan. The UUID is
    // fake — we won't touch the DB in dry-run mode anyway.
    return {
      id: "00000000-0000-0000-0000-000000000000",
      email: targetEmail,
      source: "created",
    };
  }

  // Create synthetic user. bcrypt hash below is for a random password
  // nobody knows — the account can't be logged into.
  const insert: any = await db.execute(sql`
    INSERT INTO users (username, password, email, full_name, role, is_active)
    VALUES (
      ${BACKFILL_USER_USERNAME},
      ${"$2a$10$" + Buffer.from(randomUUID()).toString("base64").slice(0, 53)},
      ${BACKFILL_USER_EMAIL},
      ${BACKFILL_USER_FULLNAME},
      'agent',
      false
    )
    RETURNING id, email
  `);
  const createdRow = ((insert as any).rows ?? insert)[0];
  return { id: createdRow.id, email: createdRow.email, source: "created" };
}

async function main() {
  const { dryRun, cxUserEmail } = parseArgs();

  console.log(
    `[sync-tags-to-status] starting${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );
  console.log(`[sync-tags-to-status] target tag: "${TAG}"`);

  // ── Step 1: resolve the confirmed_by user ────────────────────────
  const user = await findOrCreateBackfillUser(cxUserEmail, dryRun);
  console.log(
    `[sync-tags-to-status] confirmed_by user: ${user.email}  (${user.source})  id=${user.id}`,
  );

  // ── Step 2: count the target cohort before writing ───────────────
  // Filter uses the same comma-wrapped ILIKE trick as the inspect
  // script so we don't accidentally match substrings like
  // `of:confirmed_followup`.
  const beforeResult: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE raw_shopify_data IS NOT NULL
          AND (',' || COALESCE(raw_shopify_data->>'tags', '') || ',')
              ILIKE '%,' || ${TAG} || ',%'
      )::int4 AS tagged_in_raw,
      COUNT(*) FILTER (
        WHERE raw_shopify_data IS NOT NULL
          AND (',' || COALESCE(raw_shopify_data->>'tags', '') || ',')
              ILIKE '%,' || ${TAG} || ',%'
          AND call_status <> 'Confirmed'
      )::int4 AS to_update,
      COUNT(*) FILTER (
        WHERE raw_shopify_data IS NOT NULL
          AND (',' || COALESCE(raw_shopify_data->>'tags', '') || ',')
              ILIKE '%,' || ${TAG} || ',%'
          AND call_status = 'Confirmed'
      )::int4 AS already_confirmed
    FROM orders
  `);
  const b = ((beforeResult as any).rows ?? beforeResult)[0];
  console.log(`\n[sync-tags-to-status] cohort:`);
  console.log(`  tagged ${TAG} in raw JSON:       ${b.tagged_in_raw}`);
  console.log(`  already Confirmed (will skip):   ${b.already_confirmed}`);
  console.log(`  will update to Confirmed:        ${b.to_update}`);

  if (Number(b.to_update) === 0) {
    console.log(`[sync-tags-to-status] nothing to do. exiting.`);
    process.exit(0);
  }

  if (dryRun) {
    // Show a sample of what would change so the user can eyeball.
    const sample: any = await db.execute(sql`
      SELECT
        shopify_order_number,
        call_status,
        DATE(processed_at AT TIME ZONE 'Asia/Kolkata') AS day_ist,
        raw_shopify_data->>'tags' AS tags
      FROM orders
      WHERE raw_shopify_data IS NOT NULL
        AND (',' || COALESCE(raw_shopify_data->>'tags', '') || ',')
            ILIKE '%,' || ${TAG} || ',%'
        AND call_status <> 'Confirmed'
      ORDER BY processed_at DESC
      LIMIT 10
    `);
    const rows: any[] = (sample as any).rows ?? sample;
    console.log(`\n[sync-tags-to-status] sample (first 10 that would be updated):`);
    for (const r of rows) {
      console.log(
        `  #${r.shopify_order_number}  ${r.day_ist}  current=${r.call_status}  tags=${r.tags}`,
      );
    }
    console.log(
      `\n[sync-tags-to-status] DRY RUN — no rows written. Re-run without --dry-run to apply.`,
    );
    process.exit(0);
  }

  // ── Step 3: bulk UPDATE ──────────────────────────────────────────
  // Single round-trip UPDATE. For 1,125 rows on Neon this is sub-second.
  // We set confirmed_at = processed_at so each backfilled row sits in
  // the correct IST daily bucket in Pare's Phase 4 CX breakdown.
  console.log(`\n[sync-tags-to-status] executing UPDATE…`);
  const note = `Backfilled from ${TAG} tag on ${new Date().toISOString().slice(0, 10)}`;
  const updateResult: any = await db.execute(sql`
    UPDATE orders
       SET call_status     = 'Confirmed',
           confirmed_at    = COALESCE(processed_at, shopify_created_at AT TIME ZONE 'UTC'),
           confirmed_by    = ${user.id},
           confirmed_notes = ${note}
     WHERE raw_shopify_data IS NOT NULL
       AND (',' || COALESCE(raw_shopify_data->>'tags', '') || ',')
           ILIKE '%,' || ${TAG} || ',%'
       AND call_status <> 'Confirmed'
    RETURNING shopify_order_id
  `);
  const updatedRows = (updateResult as any).rows ?? updateResult;
  console.log(
    `[sync-tags-to-status] updated ${updatedRows.length} rows.`,
  );

  // ── Step 4: audit after ──────────────────────────────────────────
  const afterResult: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE raw_shopify_data IS NOT NULL
          AND (',' || COALESCE(raw_shopify_data->>'tags', '') || ',')
              ILIKE '%,' || ${TAG} || ',%'
          AND call_status <> 'Confirmed'
      )::int4 AS residual_unconfirmed,
      COUNT(*) FILTER (
        WHERE call_status = 'Confirmed' AND confirmed_by = ${user.id}
      )::int4 AS attributed_to_backfill_user
    FROM orders
  `);
  const a = ((afterResult as any).rows ?? afterResult)[0];
  console.log(`\n[sync-tags-to-status] audit:`);
  console.log(`  residual tagged-but-not-Confirmed: ${a.residual_unconfirmed}`);
  console.log(`  rows attributed to backfill user:  ${a.attributed_to_backfill_user}`);

  if (Number(a.residual_unconfirmed) > 0) {
    console.warn(
      `[sync-tags-to-status] WARN: ${a.residual_unconfirmed} rows with the tag are still not Confirmed.`,
    );
  }

  console.log(`[sync-tags-to-status] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[sync-tags-to-status] failed:", err);
  process.exit(1);
});
