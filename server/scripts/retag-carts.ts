import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
const OLB = "484da382-137f-445e-b8b1-064af45a113a";
const GLOW = "3f550942-9bb4-4ec1-b8ed-3a11803acd3e";
(async () => {
  // Re-tag ONLY carts that actually checked out on glowandme.in — verified safe.
  const r: any = await db.execute(sql`
    UPDATE abandoned_checkouts
    SET store_id = ${GLOW}
    WHERE store_id = ${OLB} AND checkout_url ILIKE '%glowandme.in%'
    RETURNING id
  `);
  const n = (r.rows ?? r).length;
  console.log(`✅ Re-tagged ${n} cart(s) OLB → Glow & Me`);
  // sanity: how many carts still tagged OLB?
  const left: any = await db.execute(sql`SELECT COUNT(*) AS n FROM abandoned_checkouts WHERE store_id = ${OLB}`);
  console.log(`   carts still tagged OLB: ${(left.rows ?? left)[0].n}`);
})().then(() => process.exit(0)).catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
