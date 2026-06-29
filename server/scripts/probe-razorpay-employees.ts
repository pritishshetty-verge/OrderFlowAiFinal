import "dotenv/config";
import { peopleView } from "../razorpay-payroll/client";

// Probe whether the configured RazorpayX account has any employees, by
// looking up low employee-ids. If these return profiles, the account has
// staff and we just have the wrong email; if all "not found", the account
// is empty / wrong org.
async function main() {
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = await peopleView({ "employee-id": id, "employee-type": "employee" });
    const b = JSON.stringify(r.body)?.slice(0, 180);
    console.log(`employee-id=${id} ok=${r.ok} ${b}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
