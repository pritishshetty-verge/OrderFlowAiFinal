import "dotenv/config";
import { pool } from "../db";
import { verifyPassword } from "../auth";

// Diagnostic: does a given email+password authenticate against the DB
// that DATABASE_URL points at? Reports DB host + match result.

const EMAIL = "nandakishore@vergescales.com";
const CANDIDATE = "Nandhu@123";

async function main() {
  const host = (process.env.DATABASE_URL || "").match(/@([^/]+)/)?.[1] ?? "unknown";
  console.log("CHECKING DB HOST:", host);
  const r = await pool.query(
    "SELECT email, password, is_active, role FROM users WHERE email = $1",
    [EMAIL],
  );
  if (!r.rowCount) {
    console.log(`RESULT: ${EMAIL} NOT FOUND on this DB`);
    process.exit(0);
  }
  const u = r.rows[0];
  const { ok } = await verifyPassword(CANDIDATE, u.password);
  console.log(
    `RESULT: found — active=${u.is_active} role=${u.role} | "${CANDIDATE}" matches = ${ok}`,
  );
  process.exit(0);
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
