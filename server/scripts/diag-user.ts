import "dotenv/config";
import { pool } from "../db";

// Diagnostic only — reports account state for the given emails on
// whatever DB DATABASE_URL points at (dev branch locally). Masks the
// actual password; only reports its FORMAT + length so we can advise.

const EMAILS = [
  "nandakishore@vergescales.com",
  "abinav@vergescales.com",
  "pritish@vergescales.com",
];

async function main() {
  const host = (process.env.DATABASE_URL || "").match(/@([^/]+)/)?.[1] ?? "unknown";
  console.log(`DB host: ${host}\n`);
  for (const email of EMAILS) {
    const r = await pool.query(
      `SELECT email, role, admin_type, is_active, password FROM users WHERE email = $1`,
      [email],
    );
    if (r.rowCount === 0) {
      console.log(`${email}: NOT FOUND`);
      continue;
    }
    const u = r.rows[0];
    const pw: string = u.password ?? "";
    const fmt = pw.startsWith("$2") ? "bcrypt" : pw.length ? "plaintext" : "EMPTY";
    console.log(
      `${email}: role=${u.role} adminType=${u.admin_type} active=${u.is_active} pwFormat=${fmt} pwLen=${pw.length}`,
    );
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
