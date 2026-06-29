import "dotenv/config";
import { peopleEdit, peopleView, isDryRun } from "../razorpay-payroll/client";

// One-off cleanup: rename RazorpayX employee `chandichaudhary.11@gmail.com`
// (employee-id 1, currently labeled "Vani Sirohi") to "Chandi Chaudhary"
// so the OrderFlow name-resolver can match her.
//
// Run with: RAZORPAY_PAYROLL_DRY_RUN=false npx tsx server/scripts/rename-chandi.ts
const EMAIL = "chandichaudhary.11@gmail.com";
const NEW_NAME = "Chandi Chaudhary";

(async () => {
  console.log("dry-run:", isDryRun());
  if (isDryRun()) {
    console.log("DRY-RUN is on — refusing to edit. Re-run with RAZORPAY_PAYROLL_DRY_RUN=false.");
    return;
  }

  console.log(`Looking up ${EMAIL} …`);
  const before = await peopleView({ email: EMAIL, "employee-type": "employee" });
  if (!before.ok) {
    console.error("Could not find employee:", JSON.stringify(before.body));
    process.exit(1);
  }
  console.log("Before:", JSON.stringify({ name: before.body?.name, email: before.body?.email }, null, 2));

  if (before.body?.name === NEW_NAME) {
    console.log(`Already named "${NEW_NAME}" — nothing to do.`);
    return;
  }

  console.log(`Renaming → "${NEW_NAME}" …`);
  const res = await peopleEdit({ email: EMAIL, name: NEW_NAME });
  console.log("ok:", res.ok);
  console.log("http status:", res.status);
  console.log("body:", JSON.stringify(res.body, null, 2));

  const after = await peopleView({ email: EMAIL, "employee-type": "employee" });
  console.log("After:", JSON.stringify({ name: after.body?.name, email: after.body?.email }, null, 2));
})().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
