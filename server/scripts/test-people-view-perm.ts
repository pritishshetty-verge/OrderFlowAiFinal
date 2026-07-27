import "dotenv/config";
import { peopleView } from "../razorpay-payroll/client";

// Read-only diagnostic: can this API key access the People module at all?
// Tries to VIEW an employee that already exists (nandakishore's gmail).
const EMAIL = "nandhakishore12713@gmail.com";

async function main() {
  const res = await peopleView({ email: EMAIL, "employee-type": "employee" });
  console.log("ok:", res.ok);
  console.log("http status:", res.status);
  console.log("body:", JSON.stringify(res.body, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
