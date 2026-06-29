import "dotenv/config";
import { pool } from "../db";

// Reads the original nandakishore row from the CURRENT DB (the child
// branch, which still has it) and emits a prod-ready INSERT that
// restores the account faithfully — same id (so FK references re-link),
// same password hash (so Nandhu@123 keeps working), same admin role.

const EMAIL = "nandakishore@vergescales.com";

function q(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main() {
  const host = (process.env.DATABASE_URL || "").match(/@([^/]+)/)?.[1] ?? "?";
  const r = await pool.query(
    `SELECT id, username, password, email, full_name, role, admin_type, is_active,
            phone, department, presence_status, employee_id, agent_extension,
            holiday_state, base_salary, compensation_profile
     FROM users WHERE email = $1`,
    [EMAIL],
  );
  if (!r.rowCount) {
    console.log(`-- ${EMAIL} not found on ${host}`);
    process.exit(1);
  }
  const u = r.rows[0];
  const cols = [
    "id", "username", "password", "email", "full_name", "role", "admin_type",
    "is_active", "phone", "department", "presence_status", "employee_id",
    "agent_extension", "holiday_state", "base_salary", "compensation_profile",
  ];
  const vals = cols.map((c) => q(u[c]));
  console.log(`-- source DB: ${host}`);
  console.log(`-- restores ${EMAIL} (role=${u.role}/${u.admin_type}) with original id`);
  console.log(`INSERT INTO users (${cols.join(", ")})`);
  console.log(`VALUES (${vals.join(", ")})`);
  console.log(`ON CONFLICT (id) DO UPDATE SET`);
  console.log(`  username = EXCLUDED.username,`);
  console.log(`  password = EXCLUDED.password,`);
  console.log(`  email = EXCLUDED.email,`);
  console.log(`  full_name = EXCLUDED.full_name,`);
  console.log(`  role = EXCLUDED.role,`);
  console.log(`  admin_type = EXCLUDED.admin_type,`);
  console.log(`  is_active = EXCLUDED.is_active`);
  console.log(`RETURNING email, role, admin_type, is_active;`);
  process.exit(0);
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
