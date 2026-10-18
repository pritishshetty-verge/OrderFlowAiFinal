// Read-only audit: how many users.password values are NOT bcrypt hashes.
// Run before touching server/auth.ts verification logic. Prints ids only,
// never password values. Result on 2026-10-18: 7 users, 7 bcrypt, 0 plaintext,
// which is what allowed the legacy plaintext compare to be removed.
//   npx tsx server/scripts/audit-password-hashes.ts
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { isBcryptHash } from "../auth";
async function main() {
  const r: any = await db.execute(sql`SELECT id, email, is_active, role, password FROM users`);
  const rows: any[] = r.rows ?? r;
  const bad = rows.filter((u) => !isBcryptHash(u.password));
  const summary = { users: rows.length, bcrypt: rows.length - bad.length, nonBcrypt: bad.length,
    nonBcryptActive: bad.filter((u) => u.is_active).length, nonBcryptInactive: bad.filter((u) => !u.is_active).length,
    nullOrEmpty: bad.filter((u) => !u.password).length };
  console.log(JSON.stringify(summary, null, 2));
  for (const u of bad) console.log(`  non-bcrypt: id=${u.id} role=${u.role} active=${u.is_active} len=${u.password ? String(u.password).length : 0}`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
