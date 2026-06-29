import { PageLayout } from "@/components/page-layout";
import { PayrollSyncContent } from "@/pages/payroll-sync";

/**
 * /payroll — RazorpayX Payroll integration.
 *
 * Pushes attendance + leave from OrderFlow into RazorpayX, which is now
 * the source of truth for payroll calculation, payslip generation, and
 * disbursement. OrderFlow's role here is the data source / bridge.
 *
 * The legacy "Payroll Run" page (OrderFlow's own salary calculator +
 * Resend payslip emailer) was retired when RazorpayX became the engine.
 * Removed to avoid two parallel payroll workflows and the risk of
 * sending conflicting payslips to the same employee. See:
 *   - server/razorpay-payroll/  (sync + provisioning + reconcile)
 *   - server/payroll/           (legacy engine — server-side cleanup pending)
 */
export default function PayrollPage() {
  return (
    <PageLayout
      title="Payroll"
      description="Push attendance and leave into RazorpayX Payroll."
    >
      <div className="p-6">
        <PayrollSyncContent />
      </div>
    </PageLayout>
  );
}
