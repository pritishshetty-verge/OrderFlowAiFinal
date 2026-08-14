import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Backfill one attendance row for Nandakishore on 2026-07-11 IST:
// clock in 10:00 AM, clock out 09:00 PM = 11 hours.
// Idempotent — checks for an existing row on that date first.

const USER_ID = "54862e00-6bee-4921-ab9e-339cfdc13d56"; // nandakishore@vergescales.com

(async () => {
  // IST-anchored day (UTC+5:30). 10:00 AM IST = 04:30 UTC, 9:00 PM IST = 15:30 UTC.
  const dateAt = new Date("2026-07-11T00:00:00+05:30");
  const clockIn = new Date("2026-07-11T10:00:00+05:30");
  const clockOut = new Date("2026-07-11T21:00:00+05:30");
  const totalHours = (clockOut.getTime() - clockIn.getTime()) / 3_600_000;

  const existing: any = await db.execute(sql`
    SELECT id, clock_in_time, clock_out_time FROM attendance
    WHERE user_id = ${USER_ID}
      AND (date AT TIME ZONE 'Asia/Kolkata')::date = '2026-07-11'`);
  const row = (existing.rows ?? existing)[0];

  if (row) {
    console.log("Row already exists — updating instead of inserting.");
    await db.execute(sql`
      UPDATE attendance
      SET clock_in_time = ${clockIn},
          clock_out_time = ${clockOut},
          total_hours = ${totalHours.toFixed(2)},
          status = 'present',
          auto_closed_at = NULL,
          auto_close_reason = NULL
      WHERE id = ${row.id}`);
  } else {
    await db.execute(sql`
      INSERT INTO attendance (user_id, date, clock_in_time, clock_out_time, status, total_hours)
      VALUES (${USER_ID}, ${dateAt}, ${clockIn}, ${clockOut}, 'present', ${totalHours.toFixed(2)})`);
  }

  const check: any = await db.execute(sql`
    SELECT date, clock_in_time, clock_out_time, total_hours, status
    FROM attendance
    WHERE user_id = ${USER_ID}
      AND (date AT TIME ZONE 'Asia/Kolkata')::date = '2026-07-11'`);
  console.log("Result:", JSON.stringify((check.rows ?? check)[0], null, 2));
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
