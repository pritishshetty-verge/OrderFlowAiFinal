import "dotenv/config";
import { pool } from "../db";
import { writeFileSync } from "fs";

// Reads all of nandakishore's attendance from the CURRENT DB (child
// branch snapshot) and writes a prod-ready, idempotent INSERT to a .sql
// file. ON CONFLICT (id) DO NOTHING → safe to run repeatedly, won't
// duplicate any day already present.

const ID = "54862e00-6bee-4921-ab9e-339cfdc13d56";
const OUT = "restore-attendance.sql";

function lit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return "'" + v.toISOString() + "'";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main() {
  // Source branch is pre-migration (no auto_closed_at / reactivated_* yet).
  // Emit only the original columns; the new nullable columns on prod
  // default to NULL, which is correct for these historical days.
  const cols = [
    "id", "user_id", "date", "clock_in_time", "clock_out_time", "status",
    "total_hours", "notes", "created_at", "updated_at",
  ];
  const r = await pool.query(
    `SELECT ${cols.join(", ")} FROM attendance WHERE user_id = $1 ORDER BY date`,
    [ID],
  );
  const rows = r.rows.map(
    (u) => "  (" + cols.map((c) => lit(u[c])).join(", ") + ")",
  );
  const sql =
    `-- Restore ${r.rowCount} attendance days for nandakishore (from child-branch snapshot)\n` +
    `INSERT INTO attendance (${cols.join(", ")}) VALUES\n` +
    rows.join(",\n") +
    `\nON CONFLICT (id) DO NOTHING;\n`;
  writeFileSync(OUT, sql);
  console.log(`WROTE ${r.rowCount} rows to ${OUT}`);
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
