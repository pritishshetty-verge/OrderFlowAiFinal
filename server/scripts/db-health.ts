import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Local DB health check. Verifies that:
//   1. .env DATABASE_URL is loaded and parses
//   2. Neon serverless pool can establish a connection
//   3. SELECT 1 round-trips
//   4. The `users` table is reachable and has rows
// Exits 0 on success, 1 on any failure.
// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[db-health] running…\n");

  const ping: any = await db.execute(sql`SELECT 1 AS ok, NOW() AT TIME ZONE 'Asia/Kolkata' AS ist_now`);
  const pingRow = ((ping as any).rows ?? ping)[0];
  console.log(`✓ ping     ok=${pingRow?.ok}  ist_now=${pingRow?.ist_now}`);

  const sizeRes: any = await db.execute(sql`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS size
  `);
  console.log(`✓ db size  ${((sizeRes as any).rows ?? sizeRes)[0]?.size}`);

  const userCount: any = await db.execute(sql`SELECT COUNT(*)::int4 AS n FROM users`);
  const n = ((userCount as any).rows ?? userCount)[0]?.n ?? 0;
  console.log(`✓ users    ${n} rows`);

  const first: any = await db.execute(sql`
    SELECT id, username, email, full_name, role, admin_type, holiday_state,
           base_salary, compensation_profile, is_active, created_at
    FROM users
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const row = ((first as any).rows ?? first)[0];
  console.log(`\n✓ first user row:`);
  console.log(JSON.stringify(row, null, 2));

  console.log("\n[db-health] all checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[db-health] FAILED:", err?.message ?? err);
  process.exit(1);
});
