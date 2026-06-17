import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Create a dummy agent account for testing smart-presence end to end.
//
// Use it like this:
//   1. Sign in as this user in an incognito window
//   2. Clock in, walk away for 3 minutes (with the dev IDLE_THRESHOLD_MIN=1
//      / AUTO_LOGOUT_GRACE_MIN=2 env vars set)
//   3. Watch the smart-presence flow trigger
//   4. In your normal admin window, go to /team and click Reactivate
//
// Password is plaintext per the app's current convention (verified in
// scripts/create-admin-account.ts and scripts/set-agent-passwords.ts).
// Don't reuse this account for anything that isn't testing.
//
// Idempotent: if the row already exists we re-activate it and reset
// the password so a forgotten password between sessions doesn't lock
// us out.
//
// Also auto-attaches the agent to every store via user_stores so any
// scoped page renders for them instead of empty.
// ─────────────────────────────────────────────────────────────────────

const EMAIL = "testagent@orderflow.local";
const USERNAME = "testagent";
const FULL_NAME = "Test Agent (Smart Presence QA)";
const PASSWORD = "TestAgent2026!";

async function main() {
  console.log(`[create-test-agent] target: ${EMAIL}`);

  const existingRes: any = await db.execute(sql`
    SELECT id, email, role, is_active
    FROM users
    WHERE email = ${EMAIL}
    LIMIT 1
  `);
  const existing = ((existingRes as any).rows ?? existingRes)[0];

  let userId: string;

  if (existing) {
    console.log(
      `  existing row found: id=${existing.id} role=${existing.role} active=${existing.is_active}`,
    );
    console.log(`  → re-activating, resetting password to "${PASSWORD}"`);

    const upd: any = await db.execute(sql`
      UPDATE users
         SET password  = ${PASSWORD},
             role      = 'agent',
             is_active = true,
             updated_at = NOW()
       WHERE email = ${EMAIL}
      RETURNING id
    `);
    userId = ((upd as any).rows ?? upd)[0].id;
  } else {
    console.log(`  no existing row — creating new agent`);

    const ins: any = await db.execute(sql`
      INSERT INTO users (username, password, email, full_name, role, is_active, presence_status)
      VALUES (
        ${USERNAME},
        ${PASSWORD},
        ${EMAIL},
        ${FULL_NAME},
        'agent',
        true,
        'present'
      )
      RETURNING id
    `);
    userId = ((ins as any).rows ?? ins)[0].id;
  }

  // ── Attach to every store so scoped pages render data ────────────
  const stores: any = await db.execute(sql`SELECT id FROM stores`);
  const storeRows = (stores as any).rows ?? stores;
  for (const s of storeRows) {
    await db.execute(sql`
      INSERT INTO user_stores (user_id, store_id, role)
      VALUES (${userId}, ${s.id}, 'agent')
      ON CONFLICT (user_id, store_id) DO NOTHING
    `);
  }
  console.log(`  attached to ${storeRows.length} store(s)`);

  console.log(`\n────────────────────────────────────────`);
  console.log(`  Test agent ready. Log in with:`);
  console.log(`    email:    ${EMAIL}`);
  console.log(`    password: ${PASSWORD}`);
  console.log(`────────────────────────────────────────\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[create-test-agent] failed:", err);
  process.exit(1);
});
