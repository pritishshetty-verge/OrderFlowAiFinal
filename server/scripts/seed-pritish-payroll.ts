import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// One-time test setup: configure pritish@vergescales.com as the
// payroll-engine smoke-test subject.
//
//   base_salary          = 50000
//   compensation_profile = ORDER_CONFIRMATION
//   holiday_state        = MUMBAI
//
// Idempotent — re-running just re-applies the same values.
// ─────────────────────────────────────────────────────────────────────

const EMAIL = "pritish@vergescales.com";
const BASE_SALARY = "50000.00";
const COMPENSATION_PROFILE = "ORDER_CONFIRMATION";
const HOLIDAY_STATE = "MUMBAI";

async function main() {
  console.log(`[seed-pritish-payroll] target: ${EMAIL}`);

  const upd: any = await db.execute(sql`
    UPDATE users
       SET base_salary          = ${BASE_SALARY},
           compensation_profile = ${COMPENSATION_PROFILE},
           holiday_state        = ${HOLIDAY_STATE},
           updated_at           = NOW()
     WHERE email = ${EMAIL}
    RETURNING id, email, full_name, base_salary, compensation_profile, holiday_state
  `);
  const row = ((upd as any).rows ?? upd)[0];
  if (!row) {
    console.error(`✗ no user with email=${EMAIL}`);
    process.exit(1);
  }

  console.log("\nupdated row:");
  console.log(`  id:                   ${row.id}`);
  console.log(`  email:                ${row.email}`);
  console.log(`  full_name:            ${row.full_name}`);
  console.log(`  base_salary:          ${row.base_salary}`);
  console.log(`  compensation_profile: ${row.compensation_profile}`);
  console.log(`  holiday_state:        ${row.holiday_state}`);

  console.log(`\n[seed-pritish-payroll] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-pritish-payroll] failed:", err);
  process.exit(1);
});
