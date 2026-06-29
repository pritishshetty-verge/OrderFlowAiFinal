import "dotenv/config";
import { fetchRazorpayEmployees, buildEmailResolver } from "../razorpay-payroll/resolver";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Verify the email resolver: for every active non-admin OF user,
// resolve to their RazorpayX email and print side-by-side.

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

(async () => {
  console.log("Fetching RazorpayX roster…");
  const roster = await fetchRazorpayEmployees();
  console.log(`  → ${roster.length} active employees in RazorpayX.`);
  const resolve = buildEmailResolver(roster);

  console.log("\nFetching OrderFlow users (active, non-admin)…");
  const res: any = await db.execute(sql`
    SELECT id, full_name AS "fullName", email
    FROM users
    WHERE is_active = TRUE AND role <> 'admin'
    ORDER BY full_name
  `);
  const users: { id: string; fullName: string; email: string }[] = res.rows ?? res;
  console.log(`  → ${users.length} users.\n`);

  console.log("=".repeat(110));
  console.log(
    pad("OrderFlow name", 24) + "│ " +
    pad("OrderFlow email", 32) + "│ " +
    pad("Resolved RazorpayX email", 38) + "│ Result",
  );
  console.log("─".repeat(110));
  let resolved = 0, missing = 0;
  for (const u of users) {
    const rzpEmail = resolve(u.fullName ?? "");
    if (rzpEmail) resolved++; else missing++;
    console.log(
      pad(u.fullName, 24) + "│ " +
      pad(u.email, 32) + "│ " +
      pad(rzpEmail ?? "—", 38) + "│ " + (rzpEmail ? "✓ will sync" : "✗ skipped"),
    );
  }
  console.log("─".repeat(110));
  console.log(`Summary: ${resolved} will sync, ${missing} skipped (no RazorpayX match by name).`);
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
