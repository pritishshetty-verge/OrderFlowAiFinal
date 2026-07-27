import { Resend } from 'resend';

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  if (!fromEmail) {
    throw new Error('RESEND_FROM_EMAIL environment variable is not set');
  }

  return { apiKey, fromEmail };
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = getResendConfig();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

/**
 * Alert admins about a failed / failing nightly payroll sync. Best-effort:
 * if Resend isn't configured it logs and returns rather than throwing, so an
 * alert failure can never mask the underlying sync error. Recipients come
 * from PAYROLL_ALERT_EMAILS (comma-separated), defaulting to the two ops
 * admins.
 */
export async function sendPayrollAlertEmail(params: {
  year: number;
  month: number;
  mode?: string;
  totals?: { ok: number; failed: number; skipped: number };
  error?: string;
}): Promise<void> {
  const recipients = (
    process.env.PAYROLL_ALERT_EMAILS ||
    "abinav@vergescales.com,nandakishore@vergescales.com"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length) return;

  let client: Resend;
  let fromEmail: string;
  try {
    ({ client, fromEmail } = await getUncachableResendClient());
  } catch (e: any) {
    console.warn("[payroll-alert] Resend not configured; skipping email:", e?.message ?? e);
    return;
  }

  const monthStr = `${params.year}-${String(params.month).padStart(2, "0")}`;
  const esc = (s: string) =>
    s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  const subject = params.error
    ? `⚠️ OrderFlow payroll sync FAILED — ${monthStr}`
    : `⚠️ OrderFlow payroll sync: ${params.totals?.failed ?? 0} failed record(s) — ${monthStr}`;
  const body = params.error
    ? `<p>The nightly RazorpayX payroll sync <b>errored</b> for <b>${monthStr}</b>.</p>
       <pre style="background:#f6f6f7;padding:12px;border-radius:8px;white-space:pre-wrap">${esc(params.error)}</pre>`
    : `<p>The nightly RazorpayX payroll sync for <b>${monthStr}</b> finished with failures (mode: ${esc(params.mode ?? "?")}).</p>
       <p>ok: ${params.totals?.ok ?? 0} &nbsp;·&nbsp; <b style="color:#c0392b">failed: ${params.totals?.failed ?? 0}</b> &nbsp;·&nbsp; skipped: ${params.totals?.skipped ?? 0}</p>
       <p>See the <code>payroll_sync_runs</code> audit table / Vercel logs for per-record detail.</p>`;

  try {
    await client.emails.send({
      from: fromEmail,
      to: recipients,
      subject,
      html: `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${body}<hr style="border:none;border-top:1px solid #eee;margin:20px 0"/><p style="color:#888;font-size:12px">OrderFlow · automated payroll-sync alert</p></div>`,
    });
    console.log(`[payroll-alert] sent to ${recipients.join(", ")}`);
  } catch (e: any) {
    console.error("[payroll-alert] send failed:", e?.message ?? e);
  }
}

export async function sendInvitationEmail(params: {
  toEmail: string;
  inviterName: string;
  role: string;
  inviteToken: string;
  expiresAt: Date;
}) {
  const { client, fromEmail } = await getUncachableResendClient();

  // Resolve the base URL the invite link points at. Priority:
  //   1. process.env.APP_BASE_URL  — set on Vercel for prod / preview.
  //   2. https://www.orderflow.sbs — official production domain. This
  //      is a hard-coded safety net against the env var being wrong
  //      (which is exactly what got us here: Vercel had APP_BASE_URL=
  //      'https://placeholder.vercel.app' from initial setup, so every
  //      invite email shipped a broken link). Any non-empty / non-
  //      placeholder env value still wins; this fallback only fires
  //      when the env var is missing or set to the literal
  //      'placeholder' string.
  //   3. http://localhost:5001     — local dev fallback (matches the
  //      port `npm run dev` actually binds to).
  const envBase =
    typeof process.env.APP_BASE_URL === "string"
      ? process.env.APP_BASE_URL.trim()
      : "";
  const isUsableEnvBase =
    envBase.length > 0 && !/placeholder/i.test(envBase);
  const baseUrl = isUsableEnvBase
    ? envBase
    : process.env.NODE_ENV === "production"
      ? "https://www.orderflow.sbs"
      : "http://localhost:5001";
  // Strip a trailing slash so the join below never produces a double-slash.
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const inviteUrl = `${cleanBase}/signup?token=${params.inviteToken}`;
  
  const expiryDate = new Date(params.expiresAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const roleDisplay = params.role === 'admin' ? 'Administrator' : 'Agent';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to OrderFlowAI</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px 40px; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111827;">
                You're invited to join OrderFlowAI
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #374151;">
                Hello,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #374151;">
                <strong>${params.inviterName}</strong> has invited you to join their team on <strong>OrderFlowAI</strong> as a <strong>${roleDisplay}</strong>.
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 24px; color: #374151;">
                OrderFlowAI is a powerful order management platform designed to help Indian e-commerce brands reduce COD/RTO rates and streamline multi-courier logistics.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 20px 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 30px 0; font-size: 14px; line-height: 20px; color: #3b82f6; word-break: break-all;">
                ${inviteUrl}
              </p>
              
              <!-- Info Box -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 30px 0;">
                <p style="margin: 0; font-size: 14px; line-height: 20px; color: #92400e;">
                  <strong>Note:</strong> This invitation expires on ${expiryDate}. Please accept it before then.
                </p>
              </div>
              
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #e5e7eb; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #6b7280; text-align: center;">
                © ${new Date().getFullYear()} OrderFlowAI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textContent = `
You're invited to join OrderFlowAI

Hello,

${params.inviterName} has invited you to join their team on OrderFlowAI as a ${roleDisplay}.

OrderFlowAI is a powerful order management platform designed to help Indian e-commerce brands reduce COD/RTO rates and streamline multi-courier logistics.

To accept this invitation, click the link below or copy and paste it into your browser:
${inviteUrl}

Note: This invitation expires on ${expiryDate}. Please accept it before then.

If you didn't expect this invitation, you can safely ignore this email.

© ${new Date().getFullYear()} OrderFlowAI. All rights reserved.
  `.trim();

  const { data, error } = await client.emails.send({
    from: fromEmail,
    to: params.toEmail,
    subject: `You're invited to join OrderFlowAI`,
    html: htmlContent,
    text: textContent,
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(`Failed to send invitation email: ${error.message}`);
  }

  return data;
}

// =============================================================================
// PG RECONCILIATION DIGEST
// =============================================================================
//
// Sent every 3 days (current overdue + mismatch list) and bi-weekly
// (rollup summary). Same shape as the invite email above — HTML body
// + text fallback, dispatched via Resend.
//
// Content is intentionally executive-summary terse — the audience is
// the boss reading on their phone at 8am IST, not a finance analyst
// digging into specifics. Each row links back to the dashboard for
// the full picture.
// =============================================================================

export interface ReconDigestRow {
  shopifyOrderNumber: string;
  customerEmailMasked: string;
  amount: string; // pre-formatted with ₹ prefix
  ageDays: number;
  reason: "overdue" | "mismatch";
}

export async function sendReconDigestEmail(params: {
  toEmails: string[];
  storeName: string;
  digestType: "3-day" | "bi-weekly";
  // Headline counts
  totalSettled: number;
  totalSettledAmount: string; // pre-formatted
  totalFlagged: number;
  totalFlaggedAmount: string;
  overdueCount: number;
  mismatchCount: number;
  // Top N flagged rows (we cap at 10 in the cron handler)
  topFlagged: ReconDigestRow[];
  // Window the digest covers
  windowFrom: string;
  windowTo: string;
}) {
  const { client, fromEmail } = await getUncachableResendClient();

  // Compute the dashboard link.
  const envBase =
    typeof process.env.APP_BASE_URL === "string"
      ? process.env.APP_BASE_URL.trim()
      : "";
  const isUsableEnvBase =
    envBase.length > 0 && !/placeholder/i.test(envBase);
  const baseUrl = isUsableEnvBase
    ? envBase
    : process.env.NODE_ENV === "production"
      ? "https://www.orderflow.sbs"
      : "http://localhost:5001";
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const dashboardUrl = `${cleanBase}/reconciliation`;

  const isTrouble = params.totalFlagged > 0;
  const headlineColor = isTrouble ? "#dc2626" : "#059669";
  const headlineEmoji = isTrouble ? "⚠️" : "✓";
  const subjectVerb =
    params.digestType === "bi-weekly" ? "Bi-weekly summary" : "Reconciliation digest";

  const subject = isTrouble
    ? `[${params.storeName}] ${subjectVerb} — ${params.totalFlagged} ${
        params.totalFlagged === 1 ? "order needs" : "orders need"
      } attention (${params.totalFlaggedAmount})`
    : `[${params.storeName}] ${subjectVerb} — all settlements matched ✓`;

  const flaggedRowsHtml =
    params.topFlagged.length === 0
      ? `<tr><td colspan="4" style="padding: 16px; text-align: center; color: #6b7280; font-size: 14px;">No orders need attention — all clear.</td></tr>`
      : params.topFlagged
          .map(
            (r) => `
            <tr>
              <td style="padding: 12px 8px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; color: #111827;">#${r.shopifyOrderNumber}</td>
              <td style="padding: 12px 8px; font-size: 13px; color: #6b7280;">${r.customerEmailMasked}</td>
              <td style="padding: 12px 8px; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; color: #111827; text-align: right;">${r.amount}</td>
              <td style="padding: 12px 8px; text-align: right;">
                <span style="display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background-color: ${r.reason === "overdue" ? "#fee2e2" : "#ffedd5"}; color: ${r.reason === "overdue" ? "#991b1b" : "#9a3412"};">
                  ${r.reason === "overdue" ? `${r.ageDays}d overdue` : "mismatch"}
                </span>
              </td>
            </tr>`,
          )
          .join("");

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #e5e7eb;">
              <div style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                ${params.storeName} · ${params.digestType === "bi-weekly" ? "Bi-weekly summary" : "Reconciliation digest"}
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: ${headlineColor};">
                ${headlineEmoji} ${
                  isTrouble
                    ? `${params.totalFlagged} ${params.totalFlagged === 1 ? "order needs" : "orders need"} attention`
                    : "All settlements matched"
                }
              </h1>
              <div style="margin-top: 4px; font-size: 13px; color: #6b7280;">
                Window: ${params.windowFrom} – ${params.windowTo}
              </div>
            </td>
          </tr>

          <!-- Headline numbers -->
          <tr>
            <td style="padding: 24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="padding: 0 8px 0 0; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Settled</div>
                    <div style="font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px;">${params.totalSettled.toLocaleString("en-IN")}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${params.totalSettledAmount}</div>
                  </td>
                  <td width="33%" style="padding: 0 8px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Overdue</div>
                    <div style="font-size: 22px; font-weight: 700; color: ${params.overdueCount > 0 ? "#dc2626" : "#111827"}; margin-top: 4px;">${params.overdueCount}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">past T+2</div>
                  </td>
                  <td width="33%" style="padding: 0 0 0 8px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Mismatches</div>
                    <div style="font-size: 22px; font-weight: 700; color: ${params.mismatchCount > 0 ? "#ea580c" : "#111827"}; margin-top: 4px;">${params.mismatchCount}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">PayU shaved more</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Total flagged amount callout -->
          ${
            isTrouble
              ? `
          <tr>
            <td style="padding: 0 40px;">
              <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px 16px; border-radius: 4px;">
                <div style="font-size: 11px; font-weight: 600; color: #991b1b; text-transform: uppercase; letter-spacing: 0.05em;">Total flagged value</div>
                <div style="font-size: 24px; font-weight: 700; color: #7f1d1d; margin-top: 2px;">${params.totalFlaggedAmount}</div>
                <div style="font-size: 12px; color: #991b1b; margin-top: 4px;">Potential money missing — review and escalate to PayU support before write-off.</div>
              </div>
            </td>
          </tr>`
              : ""
          }

          <!-- Top flagged rows table -->
          ${
            isTrouble
              ? `
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <div style="font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 10px;">
                Top ${params.topFlagged.length} ${params.topFlagged.length === 1 ? "order" : "orders"} needing attention
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                <thead>
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Order</th>
                    <th style="padding: 8px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Customer</th>
                    <th style="padding: 8px; text-align: right; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Amount</th>
                    <th style="padding: 8px; text-align: right; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Issue</th>
                  </tr>
                </thead>
                <tbody>${flaggedRowsHtml}</tbody>
              </table>
            </td>
          </tr>`
              : ""
          }

          <!-- CTA -->
          <tr>
            <td style="padding: 32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 28px; background-color: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      Open dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #e5e7eb; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; font-size: 11px; line-height: 16px; color: #6b7280; text-align: center;">
                You're receiving this because you're a reconciliation recipient for ${params.storeName}.<br>
                Manage recipients in the dashboard → Settings → Delivery channels.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textContent = `
${params.storeName} · ${params.digestType === "bi-weekly" ? "Bi-weekly summary" : "Reconciliation digest"}
Window: ${params.windowFrom} – ${params.windowTo}

${
  isTrouble
    ? `⚠️ ${params.totalFlagged} ${params.totalFlagged === 1 ? "order needs" : "orders need"} attention`
    : "✓ All settlements matched"
}

Settled: ${params.totalSettled.toLocaleString("en-IN")} orders (${params.totalSettledAmount})
Overdue: ${params.overdueCount}
Mismatches: ${params.mismatchCount}
${isTrouble ? `\nTotal flagged value: ${params.totalFlaggedAmount}\n` : ""}
${
  params.topFlagged.length > 0
    ? `\nTop orders needing attention:\n${params.topFlagged
        .map(
          (r) =>
            `  #${r.shopifyOrderNumber}  ${r.customerEmailMasked}  ${r.amount}  ${r.reason === "overdue" ? `${r.ageDays}d overdue` : "mismatch"}`,
        )
        .join("\n")}\n`
    : ""
}

Open the dashboard: ${dashboardUrl}

— You're receiving this because you're a reconciliation recipient for ${params.storeName}.
  `.trim();

  const { data, error } = await client.emails.send({
    from: fromEmail,
    to: params.toEmails,
    subject,
    html: htmlContent,
    text: textContent,
  });

  if (error) {
    console.error("Resend recon-digest error:", error);
    throw new Error(`Failed to send recon digest: ${error.message}`);
  }

  return data;
}
