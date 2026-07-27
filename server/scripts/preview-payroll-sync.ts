import "dotenv/config";
import { previewSync } from "../razorpay-payroll/sync";

// Dry-run preview of the RazorpayX payroll sync for a month. No API calls.
//   npx tsx server/scripts/preview-payroll-sync.ts 2026 6

async function main() {
  const year = Number(process.argv[2] ?? new Date().getFullYear());
  const month = Number(process.argv[3] ?? new Date().getMonth() + 1);
  const report = await previewSync(year, month);

  console.log(`\n=== RazorpayX payroll sync preview — ${year}-${String(month).padStart(2, "0")} ===`);
  console.log(`configured: ${report.configured} | leaveTypesConfigured: ${report.leaveTypesConfigured}`);
  console.log(
    `totals: attendance=${report.totals.attendanceDays} leave=${report.totals.leaveDays} skipped=${report.totals.skipped}\n`,
  );
  // Show a sample of mapped payloads.
  for (const r of report.records.slice(0, 8)) {
    const p = r.payload;
    console.log(
      `  [${r.source}] ${p.email}  ${p.date}  ${p.status}  ${p.checkin ?? "--"}→${p.checkout ?? "--"}  ${p["leave-type"] !== undefined ? "lt=" + p["leave-type"] : ""}`,
    );
  }
  if (report.records.length > 8) console.log(`  … and ${report.records.length - 8} more`);
  if (report.skipped.length) {
    console.log(`\n  skipped (${report.skipped.length}):`);
    for (const s of report.skipped.slice(0, 5)) console.log(`    - ${s.email ?? s.sourceId}: ${s.reason}`);
  }
  console.log("");
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
