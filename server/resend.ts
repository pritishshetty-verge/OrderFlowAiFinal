import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key, 
    fromEmail: connectionSettings.settings.from_email
  };
}

export async function getUncachableResendClient() {
  const credentials = await getCredentials();
  return {
    client: new Resend(credentials.apiKey),
    fromEmail: connectionSettings.settings.from_email
  };
}

export async function sendInvitationEmail(params: {
  toEmail: string;
  inviterName: string;
  role: string;
  inviteToken: string;
  expiresAt: Date;
}) {
  const { client, fromEmail } = await getUncachableResendClient();
  
  const inviteUrl = `${process.env.REPLIT_DOMAINS?.split(',')[0] || 'http://localhost:5000'}/signup?token=${params.inviteToken}`;
  
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
