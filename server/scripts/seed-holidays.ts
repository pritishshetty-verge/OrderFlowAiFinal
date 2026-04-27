import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Seed `holidays` table from the 2026 Verge Scales holiday calendar
// (Verge Scales Holiday 2026 - Sheet2.pdf, four-state matrix).
//
// Idempotent: each row carries a NOT EXISTS guard on (date, state, name)
// so re-running this script does not duplicate.
//
// Usage:
//   npx tsx server/scripts/seed-holidays.ts
//
// To add a different year, append rows to `HOLIDAYS_2026` below or
// create a sibling array (e.g. HOLIDAYS_2027) and seed in turn.
// ─────────────────────────────────────────────────────────────────────

type HolidayRow = {
  date: string; // YYYY-MM-DD
  name: string;
  state: "MUMBAI" | "DELHI" | "BENGALURU" | "HYDERABAD";
  type: "Fixed" | "Optional";
};

const HOLIDAYS_2026: HolidayRow[] = [
  // ── MUMBAI (15) ──
  { date: "2026-01-01", name: "New Year's Day",    state: "MUMBAI", type: "Fixed"    },
  { date: "2026-01-26", name: "Republic Day",      state: "MUMBAI", type: "Fixed"    },
  { date: "2026-02-18", name: "Mahashivratri",     state: "MUMBAI", type: "Optional" },
  { date: "2026-03-14", name: "Holi",              state: "MUMBAI", type: "Fixed"    },
  { date: "2026-03-22", name: "Gudi Padwa",        state: "MUMBAI", type: "Optional" },
  { date: "2026-03-31", name: "Eid al-Fitr",       state: "MUMBAI", type: "Optional" },
  { date: "2026-05-01", name: "Maharashtra Day",   state: "MUMBAI", type: "Fixed"    },
  { date: "2026-06-07", name: "Eid al-Adha",       state: "MUMBAI", type: "Optional" },
  { date: "2026-08-15", name: "Independence Day",  state: "MUMBAI", type: "Fixed"    },
  { date: "2026-09-17", name: "Ganesh Chaturthi",  state: "MUMBAI", type: "Fixed"    },
  { date: "2026-10-02", name: "Gandhi Jayanti",    state: "MUMBAI", type: "Fixed"    },
  { date: "2026-10-24", name: "Dussehra",          state: "MUMBAI", type: "Optional" },
  { date: "2026-11-03", name: "Bhai Dooj",         state: "MUMBAI", type: "Optional" },
  { date: "2026-11-12", name: "Diwali",            state: "MUMBAI", type: "Fixed"    },
  { date: "2026-12-25", name: "Christmas",         state: "MUMBAI", type: "Fixed"    },

  // ── DELHI (15) ──
  { date: "2026-01-01", name: "New Year's Day",    state: "DELHI", type: "Fixed"    },
  { date: "2026-01-13", name: "Lohri",             state: "DELHI", type: "Optional" },
  { date: "2026-01-26", name: "Republic Day",      state: "DELHI", type: "Fixed"    },
  { date: "2026-02-18", name: "Mahashivratri",     state: "DELHI", type: "Optional" },
  { date: "2026-03-14", name: "Holi",              state: "DELHI", type: "Fixed"    },
  { date: "2026-03-31", name: "Eid al-Fitr",       state: "DELHI", type: "Optional" },
  { date: "2026-04-03", name: "Good Friday",       state: "DELHI", type: "Optional" },
  { date: "2026-06-07", name: "Eid al-Adha",       state: "DELHI", type: "Optional" },
  { date: "2026-08-15", name: "Independence Day",  state: "DELHI", type: "Fixed"    },
  { date: "2026-08-30", name: "Raksha Bandhan",    state: "DELHI", type: "Fixed"    },
  { date: "2026-10-02", name: "Gandhi Jayanti",    state: "DELHI", type: "Fixed"    },
  { date: "2026-10-24", name: "Dussehra",          state: "DELHI", type: "Fixed"    },
  { date: "2026-11-05", name: "Guru Nanak Jayanti", state: "DELHI", type: "Optional" },
  { date: "2026-11-12", name: "Diwali",            state: "DELHI", type: "Fixed"    },
  { date: "2026-12-25", name: "Christmas",         state: "DELHI", type: "Fixed"    },

  // ── HYDERABAD (15) ──
  { date: "2026-01-01", name: "New Year's Day",       state: "HYDERABAD", type: "Fixed"    },
  { date: "2026-01-14", name: "Sankranti",            state: "HYDERABAD", type: "Optional" },
  { date: "2026-01-26", name: "Republic Day",         state: "HYDERABAD", type: "Fixed"    },
  { date: "2026-02-18", name: "Mahashivratri",        state: "HYDERABAD", type: "Optional" },
  { date: "2026-03-14", name: "Holi",                 state: "HYDERABAD", type: "Fixed"    },
  { date: "2026-03-19", name: "Ugadi",                state: "HYDERABAD", type: "Optional" },
  { date: "2026-03-31", name: "Eid al-Fitr",          state: "HYDERABAD", type: "Fixed"    },
  { date: "2026-06-07", name: "Eid al-Adha",          state: "HYDERABAD", type: "Optional" },
  { date: "2026-08-15", name: "Independence Day",     state: "HYDERABAD", type: "Fixed"    },
  { date: "2026-09-29", name: "Bathukamma Festival",  state: "HYDERABAD", type: "Fixed"    },
  { date: "2026-10-02", name: "Gandhi Jayanti",       state: "HYDERABAD", type: "Fixed"    },
  { date: "2026-10-21", name: "Bonalu",               state: "HYDERABAD", type: "Optional" },
  { date: "2026-10-24", name: "Dussehra",             state: "HYDERABAD", type: "Optional" },
  { date: "2026-11-12", name: "Diwali",               state: "HYDERABAD", type: "Fixed"    },
  { date: "2026-12-25", name: "Christmas",            state: "HYDERABAD", type: "Fixed"    },

  // ── BENGALURU (15) ──
  { date: "2026-01-01", name: "New Year's Day",        state: "BENGALURU", type: "Fixed"    },
  { date: "2026-01-14", name: "Makara Sankranti",      state: "BENGALURU", type: "Optional" },
  { date: "2026-01-26", name: "Republic Day",          state: "BENGALURU", type: "Fixed"    },
  { date: "2026-02-18", name: "Mahashivratri",         state: "BENGALURU", type: "Optional" },
  { date: "2026-03-14", name: "Holi",                  state: "BENGALURU", type: "Optional" },
  { date: "2026-03-19", name: "Ugadi",                 state: "BENGALURU", type: "Fixed"    },
  { date: "2026-03-31", name: "Eid al-Fitr",           state: "BENGALURU", type: "Optional" },
  { date: "2026-04-03", name: "Good Friday",           state: "BENGALURU", type: "Fixed"    },
  { date: "2026-06-07", name: "Eid al-Adha",           state: "BENGALURU", type: "Optional" },
  { date: "2026-08-15", name: "Independence Day",      state: "BENGALURU", type: "Fixed"    },
  { date: "2026-10-02", name: "Gandhi Jayanti",        state: "BENGALURU", type: "Fixed"    },
  { date: "2026-10-24", name: "Dussehra",              state: "BENGALURU", type: "Optional" },
  { date: "2026-11-01", name: "Karnataka Rajyotsava",  state: "BENGALURU", type: "Fixed"    },
  { date: "2026-11-12", name: "Diwali",                state: "BENGALURU", type: "Fixed"    },
  { date: "2026-12-25", name: "Christmas",             state: "BENGALURU", type: "Fixed"    },
];

async function main() {
  console.log(
    `[seed-holidays] inserting up to ${HOLIDAYS_2026.length} rows (idempotent)...`,
  );

  let inserted = 0;
  let skipped = 0;
  for (const h of HOLIDAYS_2026) {
    // Guard on (date, state, name) so a name correction in a future
    // re-seed updates nothing automatically — manual fixup if needed.
    const res: any = await db.execute(sql`
      INSERT INTO holidays (date, name, state, type)
      SELECT ${h.date}::date, ${h.name}, ${h.state}, ${h.type}
      WHERE NOT EXISTS (
        SELECT 1 FROM holidays
        WHERE date = ${h.date}::date
          AND state = ${h.state}
          AND name = ${h.name}
      )
      RETURNING id
    `);
    const rows = (res as any).rows ?? res;
    if (rows.length > 0) inserted++;
    else skipped++;
  }

  // Sanity: counts per state.
  const counts: any = await db.execute(sql`
    SELECT state, COUNT(*)::int4 AS n
    FROM holidays
    WHERE date >= '2026-01-01'::date AND date <= '2026-12-31'::date
    GROUP BY state
    ORDER BY state
  `);
  const countRows = ((counts as any).rows ?? counts) as Array<{
    state: string;
    n: number;
  }>;

  console.log(`\n[seed-holidays] inserted ${inserted}, skipped ${skipped} (already present)`);
  console.log("\n  per-state row counts (2026):");
  for (const r of countRows) {
    console.log(`    ${r.state.padEnd(10)} ${r.n}`);
  }
  console.log(`\n[seed-holidays] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-holidays] failed:", err);
  process.exit(1);
});
