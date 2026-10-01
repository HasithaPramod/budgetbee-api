const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

const LOGO_URL = 'https://res.cloudinary.com/luzz2ysm/image/upload/v1787473234/Asset_4.png';

// OTP code eka email ekakin send karanawa
const sendOtpEmail = async (toEmail, otpCode) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#EDEDED; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EDEDED; padding: 32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF; border-radius:16px; overflow:hidden; box-shadow:0 4px 16px rgba(43,45,58,0.08);">

          <!-- Header banner -->
          <tr>
            <td style="background-color:#FFF8EF; padding:36px 32px 28px 32px; text-align:center; border-bottom:1px solid #F0E4CC;">
              <img src="${LOGO_URL}" alt="BudgetBee" width="180" style="display:block; margin:0 auto;" />
            </td>
          </tr>

          <!-- Greeting + OTP -->
          <tr>
            <td style="padding:36px 40px 8px 40px; text-align:center;">
              <p style="margin:0; color:#2B2D3A; font-size:19px; font-weight:bold;">Verify your email</p>
              <p style="margin:10px 0 0 0; color:#6B6D7A; font-size:14px; line-height:1.6;">
                Enter this code in the BudgetBee app to confirm it's really you.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px 8px 40px; text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto; background-color:#FFF8EF; border:1.5px dashed #F4A825; border-radius:14px;">
                <tr>
                  <td style="padding:18px 36px;">
                    <span style="font-size:36px; font-weight:bold; letter-spacing:10px; color:#2B2D3A;">${otpCode}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0 0; color:#9A9CAA; font-size:12px;">
                This code expires in 5 minutes. Don't share it with anyone.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:28px 40px 0 40px;">
              <hr style="border:none; border-top:1px solid #E7E5E0; margin:0;">
            </td>
          </tr>

          <!-- Features section -->
          <tr>
            <td style="padding:28px 40px 8px 40px;">
              <p style="margin:0 0 18px 0; color:#2B2D3A; font-size:14px; font-weight:bold; text-align:center; letter-spacing:0.5px;">
                WHAT YOU CAN DO WITH BUDGETBEE
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="44" valign="top" style="padding-bottom:18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr><td style="width:36px; height:36px; background-color:#FCEBCB; border-radius:10px; text-align:center; font-size:17px;">⚡</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-bottom:18px; padding-left:12px;">
                    <p style="margin:0; color:#2B2D3A; font-size:14px; font-weight:bold;">Log income &amp; expenses in seconds</p>
                    <p style="margin:4px 0 0 0; color:#6B6D7A; font-size:12.5px; line-height:1.5;">One tap or a quick voice note — never lose track of small costs like fuel or fees again.</p>
                  </td>
                </tr>
                <tr>
                  <td width="44" valign="top" style="padding-bottom:18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr><td style="width:36px; height:36px; background-color:#FCEBCB; border-radius:10px; text-align:center; font-size:17px;">📊</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-bottom:18px; padding-left:12px;">
                    <p style="margin:0; color:#2B2D3A; font-size:14px; font-weight:bold;">See your real profit, not just earnings</p>
                    <p style="margin:4px 0 0 0; color:#6B6D7A; font-size:12.5px; line-height:1.5;">Fuel, platform fees, and repairs are automatically subtracted so you know what you actually kept.</p>
                  </td>
                </tr>
                <tr>
                  <td width="44" valign="top" style="padding-bottom:18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr><td style="width:36px; height:36px; background-color:#FCEBCB; border-radius:10px; text-align:center; font-size:17px;">💰</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-bottom:18px; padding-left:12px;">
                    <p style="margin:0; color:#2B2D3A; font-size:14px; font-weight:bold;">Budget for irregular income</p>
                    <p style="margin:4px 0 0 0; color:#6B6D7A; font-size:12.5px; line-height:1.5;">Split every payment into savings and fixed expenses, and know what's safe to spend today.</p>
                  </td>
                </tr>
                <tr>
                  <td width="44" valign="top" style="padding-bottom:6px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr><td style="width:36px; height:36px; background-color:#FCEBCB; border-radius:10px; text-align:center; font-size:17px;">🛡️</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding-bottom:6px; padding-left:12px;">
                    <p style="margin:0; color:#2B2D3A; font-size:14px; font-weight:bold;">Your data stays private</p>
                    <p style="margin:4px 0 0 0; color:#6B6D7A; font-size:12.5px; line-height:1.5;">PIN and biometric lock, plus full control over what you ever share and with whom.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#2B2D3A; padding:24px 40px; text-align:center; margin-top:20px;">
              <p style="margin:0; color:#F4A825; font-size:12px; letter-spacing:3px; font-weight:bold;">
                TRACK. MANAGE. GROW.
              </p>
              <p style="margin:10px 0 0 0; color:#8A8C99; font-size:11px;">
                If you didn't request this code, you can safely ignore this email.
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

  await transporter.sendMail({
    from: `"BudgetBee" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your BudgetBee verification code',
    html,
  });
};

module.exports = sendOtpEmail;