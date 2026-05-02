import fs from "fs";
import { getUncachableResendClient } from "../resend";
import { formatINR } from "./payroll";
import type { PayslipData, PayslipFile } from "./payslip-pdf";

// ─────────────────────────────────────────────────────────────────────
// Payslip email dispatch
//
// Sends a styled HTML email + the PDF as a base64 attachment via the
// existing Resend integration (server/resend.ts). The HTML body
// mirrors the PDF's earnings table so the recipient gets a usable
// receipt even on email clients that don't render the attachment
// (e.g. inline preview panes).
// ─────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Branding constants (mirror payslip-pdf.ts so email + PDF match) ──
const COMPANY_NAME = "Verge Scales Pvt Ltd";
const COMPANY_ADDRESS =
  "4th Floor, Innov8 R City North wing, LBS Marg, Sahakar Bhawan Sub Post Office, Ghatkopar West, Mumbai 400086";

export async function sendPayslipEmail(
  data: PayslipData,
  pdf: PayslipFile,
): Promise<{ id: string | null }> {
  const { client, fromEmail } = await getUncachableResendClient();

  const period = `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}`;
  const subject = `Your ${period} payslip — ${COMPANY_NAME}`;
  const html = buildPayslipHtml(data, period);
  const text = buildPayslipText(data, period);

  const pdfBytes = fs.readFileSync(pdf.absPath);
  const pdfBase64 = pdfBytes.toString("base64");

  const { data: result, error } = await client.emails.send({
    from: fromEmail,
    to: data.employee.email,
    subject,
    html,
    text,
    attachments: [
      {
        filename: pdf.filename,
        content: pdfBase64,
        contentType: "application/pdf",
      },
    ],
  });

  if (error) {
    // Bubble up; route handler logs to payroll_ledger.email_error.
    throw new Error(`Resend dispatch failed: ${error.message}`);
  }
  return { id: (result as any)?.id ?? null };
}

// ── HTML body ────────────────────────────────────────────────────────

function buildPayslipHtml(d: PayslipData, period: string): string {
  const rows: string[] = [];
  const ratioPct = (d.base.ratio * 100).toFixed(2);
  const cappedNote = d.base.capped
    ? ` <span style="color:#b45309;">(capped at 100%)</span>`
    : "";

  rows.push(
    earningsRow(
      "Base pay",
      `(${d.base.daysPresent} present + ${d.base.paidHolidaysUsed} paid holidays) ÷ ${d.base.expectedWorkingDays} working days × ₹${formatINR(d.base.baseSalary)} = ${ratioPct}%${cappedNote}`,
      `₹${formatINR(d.base.amount)}`,
    ),
  );

  if (d.incentives.profile === "ORDER_CONFIRMATION") {
    rows.push(
      earningsRow(
        "Confirmation bonus",
        d.incentives.deliveryRatePct == null
          ? "No delivery rate recorded"
          : `Delivery rate ${d.incentives.deliveryRatePct.toFixed(2)}% → tier bonus`,
        `₹${formatINR(d.incentives.confirmationBonus)}`,
      ),
    );
  } else if (d.incentives.profile === "NDR_RTO") {
    rows.push(
      earningsRow(
        "Team delivery bonus",
        d.incentives.teamDeliveryRatePct == null
          ? "No team rate recorded"
          : `Team delivery ${d.incentives.teamDeliveryRatePct.toFixed(2)}% → tier bonus`,
        `₹${formatINR(d.incentives.teamDeliveryBonus)}`,
      ),
    );
    rows.push(
      earningsRow(
        "Personal recovery bonus",
        d.incentives.recoveryRatePct == null
          ? "No recovery rate recorded"
          : `Recovery rate ${d.incentives.recoveryRatePct.toFixed(2)}% → tier bonus`,
        `₹${formatINR(d.incentives.recoveryBonus)}`,
      ),
    );
    const reships = d.incentives.reshipsCount ?? 0;
    rows.push(
      earningsRow(
        "Reships bonus",
        `${reships} reships × ₹50 = ₹${formatINR(reships * 50)}`,
        `₹${formatINR(d.incentives.reshipsBonus)}`,
      ),
    );
  }

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(15,23,42,0.08);overflow:hidden;">
          <tr><td style="background:#0b1220;padding:24px 32px;color:#ffffff;">
            <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.2px;">${escapeHtml(COMPANY_NAME)}</h1>
            <p style="margin:4px 0 0 0;font-size:11px;color:#cbd5e1;letter-spacing:1.5px;">PAYSLIP · ${escapeHtml(period.toUpperCase())}</p>
          </td></tr>
          <tr><td style="padding:24px 32px 8px 32px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;color:#64748b;font-size:11.5px;">Pay period: <strong style="color:#0f172a;">${period}</strong></p>
          </td></tr>
          <tr><td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0 0 4px 0;color:#0f172a;font-weight:600;font-size:14px;">${escapeHtml(d.employee.fullName)}</p>
            <p style="margin:0;color:#64748b;font-size:12.5px;">${escapeHtml(d.employee.email)}</p>
            ${d.employee.holidayState ? `<p style="margin:6px 0 0 0;color:#64748b;font-size:12px;">Holiday calendar: ${capitalizeFirst(d.employee.holidayState)}</p>` : ""}
          </td></tr>

          <tr><td style="padding:20px 32px 8px 32px;">
            <p style="margin:0 0 8px 0;color:#0f172a;font-weight:700;font-size:13px;">Earnings</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${rows.join("")}
            </table>
          </td></tr>

          <tr><td style="padding:8px 32px 24px 32px;border-top:2px solid #0f172a;border-bottom:2px solid #0f172a;">
            <table width="100%"><tr>
              <td style="font-weight:700;font-size:15px;color:#0f172a;padding:10px 0;">Final payout</td>
              <td style="font-weight:700;font-size:15px;color:#0f172a;text-align:right;padding:10px 0;">₹${formatINR(d.finalPayout)}</td>
            </tr></table>
          </td></tr>

          <tr><td style="padding:18px 32px;color:#94a3b8;font-size:11px;line-height:1.55;">
            <p style="margin:0;color:#b45309;font-weight:700;letter-spacing:1.5px;">CONFIDENTIAL</p>
            <p style="margin:4px 0 0 0;">System Generated · No Signature Required</p>
            <p style="margin:8px 0 0 0;color:#cbd5e1;font-size:10.5px;">${escapeHtml(COMPANY_ADDRESS)}</p>
            <p style="margin:6px 0 0 0;font-size:10px;color:#cbd5e1;">Full PDF copy attached. Generated ${d.generatedAt.toUTCString()} · Ledger ${d.ledgerId.slice(0, 8)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function earningsRow(label: string, detail: string, amount: string): string {
  return `<tr>
    <td style="padding:6px 0;vertical-align:top;">
      <div style="color:#0f172a;font-weight:600;font-size:13px;">${escapeHtml(label)}</div>
      ${detail ? `<div style="color:#64748b;font-size:11.5px;margin-top:2px;">${detail}</div>` : ""}
    </td>
    <td style="padding:6px 0;color:#0f172a;font-weight:600;font-size:13px;text-align:right;vertical-align:top;white-space:nowrap;">${amount}</td>
  </tr>`;
}

// ── Plain-text fallback ──────────────────────────────────────────────

function buildPayslipText(d: PayslipData, period: string): string {
  const lines: string[] = [];
  lines.push(`${COMPANY_NAME} payslip — ${period}`);
  lines.push("");
  lines.push(`Employee: ${d.employee.fullName} <${d.employee.email}>`);
  if (d.employee.holidayState) lines.push(`Calendar: ${d.employee.holidayState}`);
  lines.push("");
  lines.push("Earnings");
  lines.push("--------");
  lines.push(
    `Base pay: (${d.base.daysPresent} present + ${d.base.paidHolidaysUsed} paid holidays) / ${d.base.expectedWorkingDays} working days × ₹${formatINR(d.base.baseSalary)} = ₹${formatINR(d.base.amount)}${d.base.capped ? " (capped at 100%)" : ""}`,
  );
  if (d.incentives.profile === "ORDER_CONFIRMATION") {
    lines.push(`Confirmation bonus: ₹${formatINR(d.incentives.confirmationBonus)}`);
  } else if (d.incentives.profile === "NDR_RTO") {
    lines.push(`Team delivery bonus: ₹${formatINR(d.incentives.teamDeliveryBonus)}`);
    lines.push(`Personal recovery bonus: ₹${formatINR(d.incentives.recoveryBonus)}`);
    const reships = d.incentives.reshipsCount ?? 0;
    lines.push(`Reships bonus: ${reships} × ₹50 = ₹${formatINR(d.incentives.reshipsBonus)}`);
  }
  lines.push("");
  lines.push(`Final payout: ₹${formatINR(d.finalPayout)}`);
  lines.push("");
  lines.push(`Ledger ${d.ledgerId} · Generated ${d.generatedAt.toUTCString()}`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
