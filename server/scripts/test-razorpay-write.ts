import "dotenv/config";
import { attModify, attFetch } from "../razorpay-payroll/client";

// One-off LIVE write test: pushes a single real attendance day to
// RazorpayX, then reads it back to confirm it landed. Uses real data
// (nandakishore's actual June 17 shift). This DOES write to the live
// payroll account — single record, on the employee's own record.
const EMAIL = "nandhakishore12713@gmail.com";
const DATE = "2026-06-17";

async function main() {
  const payload = {
    email: EMAIL,
    "employee-type": "employee" as const,
    date: DATE,
    status: "present" as const,
    checkin: "09:00",
    checkout: "22:30",
    remarks: "OrderFlow sync test",
  };
  console.log("WRITING:", JSON.stringify(payload));
  const w = await attModify(payload);
  console.log(`  modify → http=${w.status} ok=${w.ok} body=${JSON.stringify(w.body)}`);

  const r = await attFetch({ email: EMAIL, "employee-type": "employee", date: DATE });
  console.log(`\nREAD-BACK → http=${r.status} ok=${r.ok}`);
  console.log(`  body=${JSON.stringify(r.body)?.slice(0, 400)}`);
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
