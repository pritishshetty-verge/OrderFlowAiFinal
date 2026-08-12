import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { buildReshipmentPayload } from "../reshipments/payload";

// ═════════════════════════════════════════════════════════════════════
// RESHIPMENTS ACCURACY AUDIT — every invariant that must hold before
// this ships in front of real customers. Zero tolerance.
// ═════════════════════════════════════════════════════════════════════

let failures = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
const one = async (q: any) => ((await db.execute(q)) as any).rows?.[0] ?? ((await db.execute(q)) as any)[0];

(async () => {
  console.log("═══ A. SCHEMA — reshipment_logs table shape ═══");
  const cols: any = await db.execute(sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'reshipment_logs' ORDER BY ordinal_position`);
  const colNames = (cols.rows ?? cols).map((c: any) => c.column_name);
  const expected = [
    "id","store_id","original_order_id","original_shopify_order_id","original_shopify_order_name",
    "new_shopify_order_id","new_shopify_order_name","customer_name","customer_phone",
    "shipping_address","reason","urgency_type","scheduled_date","internal_notes","payment_type",
    "tracking_awb","courier_name","courier_status","created_by","created_at","updated_at",
  ];
  for (const c of expected) check(`column present: ${c}`, colNames.includes(c));

  const idx: any = await db.execute(sql`
    SELECT indexname FROM pg_indexes WHERE tablename = 'reshipment_logs'`);
  const idxNames = (idx.rows ?? idx).map((i: any) => i.indexname);
  for (const i of [
    "reshipment_logs_store_created_idx",
    "reshipment_logs_original_idx",
    "reshipment_logs_awb_idx",
    "reshipment_logs_status_idx",
  ]) check(`index present: ${i}`, idxNames.includes(i));

  console.log("\n═══ B. PAYLOAD BUILDER — COD vs Prepaid financial framing ═══");
  const baseOrder = {
    id: 9001, name: "#9001", currency: "INR",
    line_items: [{ variant_id: 100, quantity: 2, price: "499.00", title: "T" }],
    payment_gateway_names: ["cod"],
  } as const;
  const baseArgs = {
    original: baseOrder as any,
    customerName: "Test",
    customerPhone: "9990000000",
    shippingAddress: { address1: "1 Test St", zip: "560001", city: "Bangalore" },
    reason: "customer_unavailable" as const,
    urgency: "instant" as const,
    paymentType: "cod" as const,
  };

  const codBody = buildReshipmentPayload(baseArgs).order as any;
  check("COD: financial_status = pending", codBody.financial_status === "pending");
  check("COD: no order-level discount", !Array.isArray(codBody.discount_codes) || codBody.discount_codes.length === 0);
  check("COD: tag Reshipment present", String(codBody.tags).includes("Reshipment"));
  check("COD: original linkage tag", String(codBody.tags).includes("Original:#9001"));
  check("COD: name suffix R", codBody.name === "#9001R");

  const prepaidBody = buildReshipmentPayload({
    ...baseArgs,
    paymentType: "prepaid",
    original: { ...baseOrder, payment_gateway_names: ["Razorpay"] } as any,
  }).order as any;
  check("Prepaid: financial_status = paid", prepaidBody.financial_status === "paid");
  // Zero-out mechanism: either a 100% discount OR line_items priced 0.
  const hasFullDiscount = Array.isArray(prepaidBody.discount_codes) && prepaidBody.discount_codes.length > 0;
  const zeroedLineItems = Array.isArray(prepaidBody.line_items) && prepaidBody.line_items.every((li: any) => Number(li.price) === 0);
  check("Prepaid: total zeroed (100% discount or ₹0 line items)", hasFullDiscount || zeroedLineItems);

  console.log("\n═══ C. SCHEDULED URGENCY — Hold_Until tag ═══");
  const scheduled = buildReshipmentPayload({
    ...baseArgs,
    urgency: "scheduled",
    scheduledDate: "2026-08-15",
  }).order as any;
  check("scheduled: Hold_Until tag present", String(scheduled.tags).includes("Hold_Until_2026-08-15"));

  console.log("\n═══ D. PINCODE LOOKUP — coverage + a real query ═══");
  const cov: any = await one(sql`SELECT COUNT(*)::int4 AS n FROM pincode_tiers WHERE city IS NOT NULL`);
  check("pincode directory populated (>10k rows)", Number(cov.n) > 10_000, `${cov.n} rows`);
  const blr: any = await one(sql`SELECT city, state FROM pincode_tiers WHERE pincode = '560001'`);
  check("560001 → Bangalore, KARNATAKA", !!blr && /bang|beng/i.test(String(blr.city ?? "")), JSON.stringify(blr));

  console.log("\n═══ E. ACCESS MODEL — per-agent scoping enforced ═══");
  const { listReshipments, getReshipmentStats } = await import("../reshipments/service");
  const anyRow: any = await one(sql`SELECT store_id, created_by FROM reshipment_logs WHERE created_by IS NOT NULL LIMIT 1`);
  if (anyRow) {
    const scoped = await listReshipments(anyRow.store_id, "all", { createdByOnly: anyRow.created_by });
    const unscoped = await listReshipments(anyRow.store_id, "all");
    check(
      "createdByOnly filter narrows the list (or matches when creator = only creator)",
      scoped.length <= unscoped.length,
      `scoped=${scoped.length}, unscoped=${unscoped.length}`,
    );
    check(
      "every scoped row belongs to that creator",
      scoped.every((r) => r.createdBy === anyRow.created_by),
    );
    const scopedStats = await getReshipmentStats(anyRow.store_id, { createdByOnly: anyRow.created_by });
    const unscopedStats = await getReshipmentStats(anyRow.store_id);
    check(
      "stats: scoped total ≤ store total",
      scopedStats.total <= unscopedStats.total,
      `mine=${scopedStats.total} vs store=${unscopedStats.total}`,
    );
  } else {
    console.log("  (no rows with created_by yet — skipping runtime scoping check)");
  }

  console.log("\n═══ F. LINE-ITEM CLONE — quantity and variant preserved ═══");
  const multi = buildReshipmentPayload({
    ...baseArgs,
    original: {
      ...baseOrder,
      line_items: [
        { variant_id: 10, quantity: 2, price: "100.00", title: "A" },
        { variant_id: 20, quantity: 5, price: "250.00", title: "B" },
      ],
    } as any,
  }).order as any;
  check("clone: 2 line items", multi.line_items.length === 2);
  check("clone: quantities preserved", multi.line_items[0].quantity === 2 && multi.line_items[1].quantity === 5);
  check("clone: variant ids preserved", multi.line_items[0].variant_id === 10 && multi.line_items[1].variant_id === 20);

  console.log(failures === 0 ? "\nAUDIT PASSED — reshipments ready" : `\nAUDIT FAILED — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
