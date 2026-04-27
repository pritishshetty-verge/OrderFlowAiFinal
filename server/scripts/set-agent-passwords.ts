import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Set the three CX agent passwords to a shared temporary value.
//
// IMPORTANT: This app currently stores passwords as plaintext in
// users.password (no bcrypt/argon2 — verified in server/routes.ts
// and server/storage.ts#createUser). We match that existing format
// exactly so these users can log in through the normal flow.
//
// When the app migrates to hashed auth, re-run this with the hashing
// path wired in and force a re-login.
//
// Also flips is_active=true in case the row was seeded inactive.
// ─────────────────────────────────────────────────────────────────────

const AGENT_EMAILS = [
  "chandi@vergescales.com",
  "tanisha@vergescales.com",
  "shruti@vergescales.com",
] as const;

const TEMP_PASSWORD = "Verge2026!";

async function main() {
  console.log(`[set-agent-passwords] target password: "${TEMP_PASSWORD}" (plaintext — app convention)`);

  for (const email of AGENT_EMAILS) {
    const res: any = await db.execute(sql`
      UPDATE users
         SET password  = ${TEMP_PASSWORD},
             is_active = true,
             updated_at = NOW()
       WHERE email = ${email}
       RETURNING id, email, full_name, is_active
    `);
    const row = ((res as any).rows ?? res)[0];
    if (!row) {
      console.warn(`  MISSING: ${email} — no user row, skipping`);
      continue;
    }
    console.log(
      `  updated: ${row.full_name.padEnd(20)} <${row.email}>  active=${row.is_active}  id=${row.id}`,
    );
  }

  console.log(`\n[set-agent-passwords] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[set-agent-passwords] failed:", err);
  process.exit(1);
});
