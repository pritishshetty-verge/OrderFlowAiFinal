import "dotenv/config";
import { renderPayslipPdf, type PayslipData } from "../services/payslip-pdf";

// ─────────────────────────────────────────────────────────────────────
// Render a sample payslip PDF using the new Verge Scales layout, with
// mock-but-realistic numbers. Useful for design reviews without
// burning a real Resend send. Outputs to uploads/payslips/.
// ─────────────────────────────────────────────────────────────────────

async function main() {
  // Sample 1: ORDER_CONFIRMATION at 87.5% delivery, full month + 2 paid holidays.
  const orderConf: PayslipData = {
    employee: {
      fullName: "Pritish Shetty",
      email: "pritish@vergescales.com",
      employeeId: "VS-2024-001",
      holidayState: "MUMBAI",
      department: "Operations",
    },
    period: { year: 2026, month: 4 },
    base: {
      baseSalary: 50000,
      expectedWorkingDays: 22,
      daysPresent: 20,
      paidHolidaysUsed: 2,
      ratio: 1.0,
      amount: 50000,
      capped: false,
    },
    incentives: {
      profile: "ORDER_CONFIRMATION",
      deliveryRatePct: 87.5,
      teamDeliveryRatePct: null,
      recoveryRatePct: null,
      reshipsCount: null,
      confirmationBonus: 7500,
      teamDeliveryBonus: 0,
      recoveryBonus: 0,
      reshipsBonus: 0,
      total: 7500,
    },
    finalPayout: 57500,
    ledgerId: "preview-order-confirmation-sample",
    generatedAt: new Date(),
  };

  // Sample 2: NDR_RTO with stacked bonuses.
  const ndrRto: PayslipData = {
    ...orderConf,
    employee: {
      ...orderConf.employee,
      fullName: "Sample NDR Agent",
      email: "ndr.sample@vergescales.com",
      employeeId: "VS-2024-002",
    },
    base: {
      baseSalary: 30000,
      expectedWorkingDays: 22,
      daysPresent: 18,
      paidHolidaysUsed: 1,
      ratio: 19 / 22,
      amount: 25909.09,
      capped: false,
    },
    incentives: {
      profile: "NDR_RTO",
      deliveryRatePct: null,
      teamDeliveryRatePct: 92,
      recoveryRatePct: 42,
      reshipsCount: 30,
      confirmationBonus: 0,
      teamDeliveryBonus: 5000,
      recoveryBonus: 6000,
      reshipsBonus: 1500,
      total: 12500,
    },
    finalPayout: 38409.09,
    ledgerId: "preview-ndr-rto-sample",
  };

  const a = await renderPayslipPdf(orderConf);
  console.log(`✓ rendered ${a.filename}  (${a.byteLength} bytes)`);
  console.log(`  ${a.absPath}`);

  const b = await renderPayslipPdf(ndrRto);
  console.log(`✓ rendered ${b.filename}  (${b.byteLength} bytes)`);
  console.log(`  ${b.absPath}`);

  console.log("\nopen with: open '" + a.absPath + "'");
  process.exit(0);
}

main().catch((err) => {
  console.error("preview failed:", err);
  process.exit(1);
});
