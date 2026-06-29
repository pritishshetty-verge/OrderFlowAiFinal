/**
 * One-off backfill: where pg_settlements has gross > settled but
 * fee_deducted stored as 0 or NULL, populate fee_deducted with the
 * derived value (gross − settled). The display already shows the
 * derived value at read time; this brings the DB into line so the
 * matcher's expected-fee math reads from a real fee column.
 */
import "dotenv/config";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    UPDATE pg_settlements
    SET fee_deducted = CAST(gross_amount AS NUMERIC) - CAST(settled_amount AS NUMERIC),
        updated_at = NOW()
    WHERE pg_name = 'payu'
      AND gross_amount IS NOT NULL
      AND settled_amount IS NOT NULL
      AND CAST(gross_amount AS NUMERIC) > CAST(settled_amount AS NUMERIC)
      AND (fee_deducted IS NULL OR CAST(fee_deducted AS NUMERIC) = 0)
    RETURNING id
  `);
  console.log(`Backfilled ${result.rows.length} rows with derived fee_deducted`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
