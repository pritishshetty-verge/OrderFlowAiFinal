import "dotenv/config";
import { peopleCreate, isDryRun } from "../razorpay-payroll/client";

// One-off LIVE test: create a single employee in RazorpayX Payroll to
// observe whether RazorpayX sends them an onboarding/invite email.
// Create ONLY (no salary) so the record stays minimal and easy to dismiss.
//
// Run with:  RAZORPAY_PAYROLL_DRY_RUN=false npx tsx server/scripts/test-people-create-invite.ts
const EMAIL = "nandakishore@vergescales.com";
const NAME = "Nandakishore";
const HIRE_DATE = "14/01/2026"; // dd/mm/yyyy (RazorpayX format)

async function main() {
  console.log("dry-run:", isDryRun());
  if (isDryRun()) {
    console.log("DRY-RUN is on — refusing to create. Re-run with RAZORPAY_PAYROLL_DRY_RUN=false to do the real create.");
    return;
  }
  console.log(`Creating employee: ${NAME} <${EMAIL}> ...`);
  const res = await peopleCreate({ email: EMAIL, name: NAME, type: "employee", hire_date: HIRE_DATE });
  console.log("ok:", res.ok);
  console.log("http status:", res.status);
  console.log("body:", JSON.stringify(res.body, null, 2));
  console.log("sent (redacted):", JSON.stringify(res.sentPayload, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
