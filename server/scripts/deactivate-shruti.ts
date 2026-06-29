import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Soft-deactivate Shruti Jha (no longer with the team). Preserves her
// attendance/leave history (foreign keys stay valid); just sets the
// is_active flag to false so she stops appearing in the team list,
// payroll sync, and presence cards. Targeted by name to avoid touching
// the wrong user.
(async () => {
  // Find her first so we can confirm before / after.
  const before: any = await db.execute(sql`
    SELECT id, full_name, email, is_active
    FROM users
    WHERE full_name = 'Shruti Jha'
  `);
  const rows = before.rows ?? before;
  if (!rows.length) {
    console.log("No user named 'Shruti Jha' found — nothing to do.");
    process.exit(0);
  }
  console.log("Before:", rows[0]);

  const result: any = await db.execute(sql`
    UPDATE users
    SET is_active = FALSE,
        updated_at = NOW()
    WHERE full_name = 'Shruti Jha'
      AND is_active = TRUE
    RETURNING id, full_name, email, is_active
  `);
  const updated = result.rows ?? result;
  console.log("After:", updated[0] ?? "(no change — was already inactive)");
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
