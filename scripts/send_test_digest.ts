/**
 * Manual digest test — sends an actual Resend email to a single
 * recipient using LIVE data from the recon-dev branch.
 *
 * Run:  npx tsx scripts/send_test_digest.ts
 *
 * Hits the email pipeline end-to-end without needing the React UI or
 * a session cookie. If this works, the UI button works too — same
 * underlying function.
 */
import "dotenv/config";
import { db, pool } from "../server/db";
import { stores, pgSettlements, orders } from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { storage } from "../server/storage";
import { sendReconDigestEmail } from "../server/resend";
import { getOverdueOrders } from "../server/recon/matcher";

const RECIPIENT = "nandakishore@vergescales.com";
const STORE_ID = "3f550942-9bb4-4ec1-b8ed-3a11803acd3e"; // Glow & Me
const DIGEST_TYPE: "3-day" | "bi-weekly" = "3-day";

const mask = (e: string | null) => {
  if (!e) return "—";
  const [l, d] = e.split("@");
  return d ? l.slice(0, 3) + "***@" + d : "***";
};
const fmtINR = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  console.log(`\nSending ${DIGEST_TYPE} digest for storeId=${STORE_ID} to ${RECIPIENT}...\n`);

  // Resolve store name
  const [store] = await db
    .select({ storeName: stores.storeName })
    .from(stores)
    .where(eq(stores.id, STORE_ID));
  const storeName = store?.storeName ?? "Your store";
  console.log(`Store: ${storeName}`);

  // KPI counts
  const counts = await storage.getPgSettlementStatusCounts(STORE_ID);
  console.log(`Counts:`, counts);

  // Overdue computed live (with window auto-detection)
  const overdueResult = await getOverdueOrders({
    storeId: STORE_ID,
    graceDays: 3,
    limit: 100,
  });
  console.log(`Overdue: ${overdueResult.rows.length} in window`);

  // Mismatch sample — top 10 by drift
  const mismatches = await db
    .select({
      id: pgSettlements.id,
      orderId: pgSettlements.orderId,
      orderAmount: pgSettlements.orderAmount,
      settledAmount: pgSettlements.settledAmount,
      pgPaymentId: pgSettlements.pgPaymentId,
    })
    .from(pgSettlements)
    .where(
      and(
        eq(pgSettlements.storeId, STORE_ID),
        eq(pgSettlements.status, "mismatch"),
      ),
    )
    .orderBy(
      sql`(CAST(${pgSettlements.orderAmount} AS NUMERIC) - CAST(${pgSettlements.settledAmount} AS NUMERIC)) DESC`,
    )
    .limit(10);
  console.log(`Mismatches: ${mismatches.length} ready to surface`);

  // Hydrate order numbers for mismatches
  const mismatchOrderIds = mismatches.map(s => s.orderId).filter((x): x is string => !!x);
  const mismatchOrders =
    mismatchOrderIds.length > 0
      ? await db
          .select({
            id: orders.id,
            shopifyOrderNumber: orders.shopifyOrderNumber,
            customerEmail: orders.customerEmail,
          })
          .from(orders)
          .where(inArray(orders.id, mismatchOrderIds))
      : [];
  const orderById = new Map(mismatchOrders.map(o => [o.id, o]));

  // Top-flagged: up to 7 overdue + up to 3 mismatch, capped at 10
  const topFlagged = [
    ...overdueResult.rows.slice(0, 7).map(o => ({
      shopifyOrderNumber: o.shopifyOrderNumber,
      customerEmailMasked: mask(o.customerEmail),
      amount: fmtINR(parseFloat(o.totalPrice)),
      ageDays: o.ageDays,
      reason: "overdue" as const,
    })),
    ...mismatches.slice(0, 3).map(s => {
      const o = s.orderId ? orderById.get(s.orderId) : null;
      return {
        shopifyOrderNumber: o?.shopifyOrderNumber ?? s.pgPaymentId,
        customerEmailMasked: mask(o?.customerEmail ?? null),
        amount: fmtINR(parseFloat(s.orderAmount ?? "0")),
        ageDays: 0,
        reason: "mismatch" as const,
      };
    }),
  ].slice(0, 10);

  // Totals
  const mismatchDriftSum = mismatches.reduce((s, x) => {
    const order = parseFloat(x.orderAmount ?? "0");
    const settled = parseFloat(x.settledAmount);
    return s + Math.max(0, order - settled);
  }, 0);
  const overdueAmountSum = overdueResult.rows.reduce(
    (s, x) => s + parseFloat(x.totalPrice),
    0,
  );
  const totalFlaggedAmount = fmtINR(mismatchDriftSum + overdueAmountSum);

  const settledSum = await db
    .select({
      c: sql<string>`COALESCE(SUM(CAST(${pgSettlements.settledAmount} AS NUMERIC)), 0)::text`,
    })
    .from(pgSettlements)
    .where(
      and(eq(pgSettlements.storeId, STORE_ID), eq(pgSettlements.status, "settled")),
    );
  const totalSettledAmount = fmtINR(Number(settledSum[0]?.c ?? 0));

  const windowFrom = overdueResult.window
    ? new Date(overdueResult.window.fromDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
    : "—";
  const windowTo = overdueResult.window
    ? new Date(overdueResult.window.toDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" })
    : "—";

  console.log(`\nDigest payload summary:`);
  console.log(`  Subject color: ${overdueResult.rows.length + counts.mismatch > 0 ? "red (trouble)" : "green (all clear)"}`);
  console.log(`  Total settled: ${counts.settled} (${totalSettledAmount})`);
  console.log(`  Total flagged: ${counts.mismatch + overdueResult.rows.length}`);
  console.log(`  Top flagged in email: ${topFlagged.length}`);
  console.log(`  Total flagged value: ${totalFlaggedAmount}`);
  console.log(`  Window: ${windowFrom} – ${windowTo}\n`);

  console.log(`Sending to: ${RECIPIENT}`);
  const result = await sendReconDigestEmail({
    toEmails: [RECIPIENT],
    storeName,
    digestType: DIGEST_TYPE,
    totalSettled: counts.settled,
    totalSettledAmount,
    totalFlagged: counts.mismatch + overdueResult.rows.length,
    totalFlaggedAmount,
    overdueCount: overdueResult.rows.length,
    mismatchCount: counts.mismatch,
    topFlagged,
    windowFrom,
    windowTo,
  });

  console.log(`\n✓ Email dispatched.`);
  console.log(`  Resend ID: ${(result as any)?.id ?? "(no id returned)"}`);
  console.log(`  Check ${RECIPIENT} inbox in a few seconds.\n`);

  await pool.end();
}

main().catch(e => { console.error("\nFAILED:", e?.message ?? e); process.exit(1); });
