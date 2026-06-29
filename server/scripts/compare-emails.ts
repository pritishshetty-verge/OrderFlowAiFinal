import "dotenv/config";
import { peopleView } from "../razorpay-payroll/client";
import { db } from "../db";
import { sql } from "drizzle-orm";

// Read-only diagnostic — fetches every employee from RazorpayX (by
// iterating employee-id) and every active user from OrderFlow, then
// prints a side-by-side comparison so the admin can see exactly which
// emails mismatch.

interface Rzp { id: number; name: string; email: string; active: boolean }
interface Of  { id: string; fullName: string; email: string; role: string }

async function fetchRzp(maxId = 20): Promise<Rzp[]> {
  const out: Rzp[] = [];
  for (let id = 1; id <= maxId; id++) {
    const r = await peopleView({ "employee-id": id, "employee-type": "employee" });
    if (!r.ok) continue; // skip not-found / gaps
    const b: any = r.body ?? {};
    out.push({
      id,
      name: b.name ?? "",
      email: b.email ?? "",
      active: !!b.is_active,
    });
  }
  return out;
}

async function fetchOf(): Promise<Of[]> {
  const res: any = await db.execute(sql`
    SELECT id, full_name AS "fullName", email, role
    FROM users
    WHERE is_active = TRUE
      AND role <> 'admin'    -- exclude admins; they don't get paid via RazorpayX
    ORDER BY full_name
  `);
  return res.rows ?? res;
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z]/g, "");
function matchByName(ofName: string, rzpList: Rzp[]): Rzp | null {
  const ofKey = norm(ofName);
  // Prefer a full-key match; fall back to "first significant token"
  // (e.g. "G Nandakishore Reddy" ↔ "Nandakishore") to tolerate name
  // ordering differences. Names are short here so collisions are rare.
  const exact = rzpList.find((r) => norm(r.name) === ofKey);
  if (exact) return exact;
  const ofTokens = ofName.split(/\s+/).filter(Boolean).map((t) => norm(t)).filter((t) => t.length >= 4);
  for (const t of ofTokens) {
    const m = rzpList.find((r) => norm(r.name).includes(t));
    if (m) return m;
  }
  return null;
}

(async () => {
  console.log("Fetching RazorpayX employees…");
  const rzp = await fetchRzp(20);
  console.log(`  → ${rzp.length} employees found in RazorpayX.\n`);

  console.log("Fetching OrderFlow users (active non-admin)…");
  const of = await fetchOf();
  console.log(`  → ${of.length} users.\n`);

  // ── Comparison: each OF user → best RazorpayX match by name ──
  console.log("=".repeat(124));
  console.log(
    pad("OrderFlow user", 26) + "│ " +
    pad("OrderFlow email", 38) + "│ " +
    pad("RazorpayX name", 24) + "│ " +
    pad("RazorpayX email", 28) + "│ Match?",
  );
  console.log("─".repeat(124));

  const matchedRzp = new Set<number>();
  for (const u of of) {
    const m = matchByName(u.fullName, rzp);
    if (m) matchedRzp.add(m.id);
    const ofEmail = u.email ?? "";
    const rzpEmail = m?.email ?? "";
    const same = ofEmail.toLowerCase() === rzpEmail.toLowerCase();
    const marker = !m ? "✗ NOT IN RZP" : same ? "✓ same" : "⚠ DIFFERENT";
    console.log(
      pad(u.fullName, 26) + "│ " +
      pad(ofEmail, 38) + "│ " +
      pad(m?.name ?? "—", 24) + "│ " +
      pad(rzpEmail || "—", 28) + "│ " + marker,
    );
  }

  // ── RazorpayX-only (employees in RZP but no OF match) ──
  const orphans = rzp.filter((r) => !matchedRzp.has(r.id));
  if (orphans.length) {
    console.log("\n" + "=".repeat(124));
    console.log(`RazorpayX-only (${orphans.length} — exist in RazorpayX but no OF user matched):`);
    console.log("─".repeat(124));
    for (const r of orphans) {
      console.log(
        pad("—", 26) + "│ " +
        pad("—", 38) + "│ " +
        pad(r.name, 24) + "│ " +
        pad(r.email, 28) + "│ employee-id " + r.id + (r.active ? "" : " (inactive)"),
      );
    }
  }

  console.log("\nDone.");
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
