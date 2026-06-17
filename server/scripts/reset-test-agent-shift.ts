import "dotenv/config";
import { pool } from "../db";

// Clear today's attendance for the test agent so they can clock in
// fresh. Idempotent — no-op if there's no row for today.

const EMAIL = "testagent@orderflow.local";

async function main() {
  // First peek at what exists so we know what we deleted.
  const peek = await pool.query(
    `SELECT a.id, a.date, a.clock_in_time, a.clock_out_time, a.auto_closed_at
     FROM attendance a
     JOIN users u ON u.id = a.user_id
     WHERE u.email = $1
     ORDER BY a.date DESC
     LIMIT 5`,
    [EMAIL],
  );
  console.log(`existing rows for ${EMAIL}:`);
  console.table(peek.rows);

  // Nuke them all — this is a test account.
  const r = await pool.query(
    `DELETE FROM attendance
     WHERE user_id = (SELECT id FROM users WHERE email = $1)
     RETURNING id`,
    [EMAIL],
  );
  console.log(`cleared ${r.rowCount} row(s)`);

  // Also reset their lastActiveAt so they don't immediately go idle on next clock-in.
  await pool.query(
    `UPDATE users SET last_active_at = NULL WHERE email = $1`,
    [EMAIL],
  );
  console.log(`reset last_active_at`);

  process.exit(0);
}

main().catch((err) => {
  console.error("reset failed:", err);
  process.exit(1);
});
