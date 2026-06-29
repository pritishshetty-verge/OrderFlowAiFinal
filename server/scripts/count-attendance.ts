import "dotenv/config";
import { pool } from "../db";

const ID = "54862e00-6bee-4921-ab9e-339cfdc13d56";

async function main() {
  const host = (process.env.DATABASE_URL || "").match(/@([^/]+)/)?.[1] ?? "?";
  const r = await pool.query(
    `SELECT COUNT(*) AS days, MIN(date) AS first, MAX(date) AS last,
            COALESCE(SUM(total_hours::numeric), 0) AS hours
     FROM attendance WHERE user_id = $1`,
    [ID],
  );
  const x = r.rows[0];
  console.log(`DB: ${host}`);
  console.log(
    `ATTENDANCE: days=${x.days} first=${x.first ? new Date(x.first).toISOString().slice(0, 10) : "-"} last=${x.last ? new Date(x.last).toISOString().slice(0, 10) : "-"} totalHours=${Number(x.hours).toFixed(1)}`,
  );
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
