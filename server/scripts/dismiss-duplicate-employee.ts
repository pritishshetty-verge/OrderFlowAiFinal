import "dotenv/config";
import { peopleDismiss, peopleView, isDryRun } from "../razorpay-payroll/client";

// One-off cleanup: dismiss the DUPLICATE record created in testing
// (nandakishore@vergescales.com / employee-id 8). Keyed by the
// @vergescales.com email so it can ONLY target the duplicate, never the
// real Gmail record (nandhakishore12713@gmail.com).
//
// Run with: RAZORPAY_PAYROLL_DRY_RUN=false npx tsx server/scripts/dismiss-duplicate-employee.ts
const EMAIL = "nandakishore@vergescales.com";
const DISMISSAL_DATE = "19/06/2026"; // dd/mm/yyyy

async function main() {
  console.log("dry-run:", isDryRun());
  if (isDryRun()) {
    console.log("DRY-RUN is on — refusing to dismiss. Re-run with RAZORPAY_PAYROLL_DRY_RUN=false.");
    return;
  }
  // Safety: confirm the target exists and is the @vergescales.com record first.
  const before = await peopleView({ email: EMAIL, "employee-type": "employee" });
  console.log("target before:", JSON.stringify(before.body, null, 2));

  const res = await peopleDismiss({ email: EMAIL, "employee-type": "employee", "dismissal-date": DISMISSAL_DATE });
  console.log("ok:", res.ok);
  console.log("http status:", res.status);
  console.log("body:", JSON.stringify(res.body, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
