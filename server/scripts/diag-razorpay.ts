import "dotenv/config";
import { attFetch } from "../razorpay-payroll/client";

// Diagnose the "Unable to locate the user" result: print the account id
// (NOT the key) to rule out the docs' sample creds, and try both
// employee-types for the given email.
const email = process.argv[2] ?? "nandakishore12713@gmail.com";
const date = process.argv[3] ?? "2026-06-17";

async function main() {
  const id = process.env.RAZORPAY_PAYROLL_AUTH_ID;
  console.log(`AUTH_ID in use = ${id}  (docs sample is 2631 — must NOT be that)`);
  console.log(`base = ${process.env.RAZORPAY_PAYROLL_BASE_URL ?? "https://payroll.razorpay.com/api (default)"}`);

  for (const type of ["employee", "contractor"] as const) {
    const r = await attFetch({ email, "employee-type": type, date });
    console.log(`\n[att fetch | ${type}] ${email} @ ${date}`);
    console.log(`  http=${r.status} ok=${r.ok} body=${JSON.stringify(r.body)?.slice(0, 300)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
