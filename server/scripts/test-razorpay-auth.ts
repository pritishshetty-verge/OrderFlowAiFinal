import "dotenv/config";
import { isRazorpayPayrollConfigured, isDryRun, attFetch, peopleView } from "../razorpay-payroll/client";

// Read-only credential check. Calls RazorpayX att-fetch + people-view for
// one email. Writes nothing. Interprets the result:
//   - auth error      → credentials wrong
//   - not-found       → credentials OK, that email isn't in RazorpayX
//   - data returned   → credentials OK + employee exists (best case)
//
//   npx tsx server/scripts/test-razorpay-auth.ts someone@vergescales.com

const email = process.argv[2] ?? "nandakishore@vergescales.com";
const date = process.argv[3] ?? "2026-06-17";

async function main() {
  console.log(`configured=${isRazorpayPayrollConfigured()} dryRun=${isDryRun()}`);
  if (!isRazorpayPayrollConfigured()) {
    console.log("NOT CONFIGURED — fill RAZORPAY_PAYROLL_AUTH_ID/KEY in .env");
    process.exit(1);
  }

  console.log(`\n[att fetch] ${email} @ ${date}`);
  const a = await attFetch({ email, "employee-type": "employee", date });
  console.log(`  http=${a.status} ok=${a.ok}`);
  console.log(`  body=${JSON.stringify(a.body)?.slice(0, 400)}`);

  console.log(`\n[people view] ${email}`);
  const p = await peopleView({ email, "employee-type": "employee" });
  console.log(`  http=${p.status} ok=${p.ok}`);
  console.log(`  body=${JSON.stringify(p.body)?.slice(0, 400)}`);

  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
