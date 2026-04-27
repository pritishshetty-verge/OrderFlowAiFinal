import "dotenv/config";
import { randomUUID } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Create / ensure admin account for pritish@vergescales.com.
//
// Password storage caveat (verified, end of session 2026-04-22):
//   This app stores users.password as PLAINTEXT — there is no bcrypt
//   or argon2 utility anywhere in server/. The login route in
//   client/src/pages/login.tsx fetches via /api/users/by-email and
//   does not even validate the password server-side today.
//
//   Per the user's request ("use the project's existing password
//   utility"), the "existing utility" is therefore plaintext INSERT
//   — same treatment the other three agent accounts got via
//   set-agent-passwords.ts. When hashed auth lands, rotate this row.
//
// Idempotency:
//   If a row with this email already exists, we PROMOTE it to admin
//   and reset its password rather than failing. (The existing row
//   "Pritish Shettty" was found — it's the same person, just with
//   a typo in full_name that we also correct.)
// ─────────────────────────────────────────────────────────────────────

const EMAIL = "pritish@vergescales.com";
const USERNAME = "pritish_shetty";
const FULL_NAME = "Pritish Shetty";
const PASSWORD = "VergeAdmin2026!";

async function main() {
  console.log(`[create-admin-account] target: ${EMAIL}`);

  // ── Check existing row ───────────────────────────────────────────
  const existingRes: any = await db.execute(sql`
    SELECT id, username, email, full_name, role, is_active
    FROM users
    WHERE email = ${EMAIL}
    LIMIT 1
  `);
  const existing = ((existingRes as any).rows ?? existingRes)[0];

  if (existing) {
    console.log(
      `  existing row found:  id=${existing.id}  username=${existing.username}  role=${existing.role}  full_name="${existing.full_name}"  active=${existing.is_active}`,
    );
    console.log(`  → promoting to admin, resetting password, fixing name typo`);

    const upd: any = await db.execute(sql`
      UPDATE users
         SET password   = ${PASSWORD},
             role       = 'admin',
             admin_type = 'full_control',
             full_name  = ${FULL_NAME},
             is_active  = true,
             updated_at = NOW()
       WHERE email = ${EMAIL}
      RETURNING id, username, email, full_name, role, admin_type, is_active
    `);
    const row = ((upd as any).rows ?? upd)[0];
    console.log(`\n  updated row:`);
    console.log(`    id:         ${row.id}`);
    console.log(`    username:   ${row.username}`);
    console.log(`    email:      ${row.email}`);
    console.log(`    full_name:  ${row.full_name}`);
    console.log(`    role:       ${row.role}`);
    console.log(`    admin_type: ${row.admin_type}`);
    console.log(`    is_active:  ${row.is_active}`);
  } else {
    console.log(`  no existing row — creating new admin account`);

    // Make sure the username slot isn't taken by someone else.
    const u: any = await db.execute(sql`
      SELECT id FROM users WHERE username = ${USERNAME} LIMIT 1
    `);
    let finalUsername = USERNAME;
    if (((u as any).rows ?? u)[0]) {
      finalUsername = `${USERNAME}_${randomUUID().slice(0, 8)}`;
      console.log(`  username "${USERNAME}" taken; using "${finalUsername}"`);
    }

    const ins: any = await db.execute(sql`
      INSERT INTO users (username, password, email, full_name, role, admin_type, is_active)
      VALUES (
        ${finalUsername},
        ${PASSWORD},
        ${EMAIL},
        ${FULL_NAME},
        'admin',
        'full_control',
        true
      )
      RETURNING id, username, email, full_name, role, admin_type, is_active
    `);
    const row = ((ins as any).rows ?? ins)[0];
    console.log(`\n  created row:`);
    console.log(`    id:         ${row.id}`);
    console.log(`    username:   ${row.username}`);
    console.log(`    email:      ${row.email}`);
    console.log(`    full_name:  ${row.full_name}`);
    console.log(`    role:       ${row.role}`);
    console.log(`    admin_type: ${row.admin_type}`);
    console.log(`    is_active:  ${row.is_active}`);
  }

  // ── Final sanity check: can the login flow find this user? ──────
  const check: any = await db.execute(sql`
    SELECT id, email, role, admin_type, is_active
    FROM users
    WHERE email = ${EMAIL} AND is_active = true AND role = 'admin'
    LIMIT 1
  `);
  const ok = ((check as any).rows ?? check)[0];
  console.log(`\n── verification ──`);
  if (ok) {
    console.log(`  ✓ user visible to login-by-email flow (active admin): id=${ok.id}`);
  } else {
    console.error(`  ✗ user NOT visible — something went wrong`);
    process.exit(1);
  }

  console.log(`\n[create-admin-account] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[create-admin-account] failed:", err);
  process.exit(1);
});
