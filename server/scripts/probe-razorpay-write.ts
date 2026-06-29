import "dotenv/config";
import { attModify } from "../razorpay-payroll/client";

// Probe what att-modify accepts for a PRESENT day. The first attempt
// failed with "valid values for leave-type are: " — so try variants to
// learn the required shape. Each writes to the same date; last success
// wins. Read-back done separately.
const EMAIL = "nandhakishore12713@gmail.com";
const DATE = "2026-06-17";

const variants: Array<{ label: string; data: any }> = [
  { label: "present + leave-type:0", data: { email: EMAIL, "employee-type": "employee", date: DATE, status: "present", "leave-type": 0, checkin: "09:00", checkout: "22:30" } },
  { label: "present + no leave-type + no remarks", data: { email: EMAIL, "employee-type": "employee", date: DATE, status: "present", checkin: "09:00", checkout: "22:30" } },
  { label: "present + leave-type:-1", data: { email: EMAIL, "employee-type": "employee", date: DATE, status: "present", "leave-type": -1, checkin: "09:00", checkout: "22:30" } },
];

async function main() {
  for (const v of variants) {
    const r = await attModify(v.data);
    console.log(`[${v.label}] ok=${r.ok} http=${r.status} body=${JSON.stringify(r.body)?.slice(0, 200)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
