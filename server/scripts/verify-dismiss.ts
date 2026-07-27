import "dotenv/config";
import { peopleView } from "../razorpay-payroll/client";

(async () => {
  const r = await peopleView({ email: "nandakishore@vergescales.com", "employee-type": "employee" });
  console.log("ok:", r.ok);
  console.log("is_active:", r.body?.is_active);
  console.log("body:", JSON.stringify(r.body, null, 2));
})();
