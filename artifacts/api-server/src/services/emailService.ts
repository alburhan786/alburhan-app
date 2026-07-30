// @ts-nocheck
/**
 * emailService.ts — Premium MSG91 SMTP email service for Al Burhan Tours & Travels
 *
 * Uses Nodemailer with MSG91 SMTP relay (smtp.mailer91.com) to send all transactional
 * emails. Credentials are read ONLY from environment variables and are never embedded
 * in frontend bundles or exposed to clients.
 *
 * Required environment variables:
 *   SMTP_HOST      — smtp.mailer91.com
 *   SMTP_PORT      — 587  (TLS) or 465 (SSL)
 *   SMTP_USER      — Your MSG91 username / domain email
 *   SMTP_PASS      — Your MSG91 SMTP password
 *   SMTP_FROM      — Sender address  (info@alburhantravels.online)
 *   SMTP_FROM_NAME — Display name    (Al Burhan Tours & Travels)
 *
 * Exported functions (all return { ok: boolean, messageId?, error? }):
 *   sendOTPEmail            — Login / verification OTP
 *   sendBookingConfirmation — Booking created / confirmed
 *   sendPaymentReceipt      — Payment received
 *   sendInvoiceEmail        — Invoice with optional PDF attachment
 *   sendTicketEmail         — Flight ticket with optional PDF attachment
 *   sendVisaEmail           — Visa document with optional PDF attachment
 *   sendPasswordResetEmail  — Password reset / account recovery OTP
 *   sendGenericEmail        — Catch-all for any custom HTML email
 *   sendBookingStatusEmail  — Journey status update
 */

import nodemailer from "nodemailer";

// ── Brand constants ────────────────────────────────────────────────────────────
const BRAND = {
  darkGreen:  "#0B5D3B",
  midGreen:   "#0d7a4e",
  gold:       "#C8A951",
  goldLight:  "#f5e9c0",
  website:    "https://alburhantravels.online",
  dashboard:  "https://alburhantravels.online/dashboard",
  phone1:     "+91 9893225590",
  phone2:     "+91 9893989786",
  whatsapp:   "https://wa.me/919893225590",
  email:      "info@alburhantravels.online",
  address:    "Bhopal, Madhya Pradesh, India",
};

// ── SMTP config — reads from env vars at call time (works after build injection) ─
function getSmtpConfig() {
  return {
    host:     process.env.SMTP_HOST     || "smtp.mailer91.com",
    port:     Number(process.env.SMTP_PORT || 587),
    user:     process.env.SMTP_USER     || "",
    pass:     process.env.SMTP_PASS     || "",
    from:     process.env.SMTP_FROM     || BRAND.email,
    fromName: process.env.SMTP_FROM_NAME|| "Al Burhan Tours & Travels",
  };
}

// ── Cached Nodemailer transport ────────────────────────────────────────────────
let _cachedTransport: nodemailer.Transporter | null = null;
let _cacheKey = "";

function getTransport(): nodemailer.Transporter | null {
  const cfg = getSmtpConfig();
  if (!cfg.user || !cfg.pass) {
    console.warn("[EmailService] SMTP_USER or SMTP_PASS not set — email disabled");
    return null;
  }
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (!_cachedTransport || key !== _cacheKey) {
    _cachedTransport = nodemailer.createTransport({
      host:   cfg.host,
      port:   cfg.port,
      secure: cfg.port === 465,
      auth:   { user: cfg.user, pass: cfg.pass },
      tls:    { rejectUnauthorized: false },
      pool:   true,
      maxConnections: 5,
    });
    _cacheKey = key;
    console.log(`[EmailService] Transport initialised: ${cfg.host}:${cfg.port} user=${cfg.user}`);
  }
  return _cachedTransport;
}

// ── Result type ────────────────────────────────────────────────────────────────
export interface EmailResult {
  ok:         boolean;
  messageId?: string;
  error?:     string;
}

// ── Retry wrapper ──────────────────────────────────────────────────────────────
async function sendWithRetry(
  mailOptions: nodemailer.SendMailOptions,
  _maxRetries = 1 // single attempt — outer retry queue handles backoff
): Promise<EmailResult> {
  // ── Circuit breaker: honour the global email suspension flag ─────────────
  try {
    const { isEmailEnabled } = await import("../lib/apiSettingsProvider.js");
    if (!(await isEmailEnabled())) {
      console.warn(`[EmailService] SUSPENDED — skipping send to ${mailOptions.to}`);
      return { ok: false, error: "Email sending is currently suspended. Re-enable via System Health." };
    }
  } catch { /* non-fatal — proceed */ }

  const transport = getTransport();
  if (!transport) {
    return { ok: false, error: "SMTP not configured — check SMTP env vars" };
  }
  try {
    const info = await transport.sendMail(mailOptions);
    console.log(
      `[EmailService] ✅ Delivered to ${mailOptions.to}` +
      ` | Subject: "${mailOptions.subject}"` +
      ` | ID: ${info.messageId}`
    );
    return { ok: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`[EmailService] ❌ Failed for ${mailOptions.to}: ${err?.message}`);
    return { ok: false, error: err?.message || "Email delivery failed" };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PREMIUM TEMPLATE HELPERS ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

/** Format Indian Rupee amounts */
function formatINR(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Format a date string/object nicely */
function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch { return String(d); }
}

/** Generate a QR code <img> tag pointing to the given URL */
function qrImg(url: string, size = 120): string {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&color=0B5D3B&bgcolor=ffffff&margin=3`;
  return `<img src="${src}" width="${size}" height="${size}" alt="QR Code"
              style="display:block;border:2px solid #ddd;border-radius:6px;"
              border="0">`;
}

/**
 * Outlook VML + universal HTML action button.
 * Renders a clickable pill button that works in ALL email clients.
 */
function btn(
  label:     string,
  url:       string,
  bg:        string = BRAND.darkGreen,
  textColor: string = "#ffffff",
  width:     number = 176
): string {
  return `<!--[if mso]><table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;"><tr><td style="padding:4px 8px;"><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:44px;v-text-anchor:middle;width:${width}px;" arcsize="14%" strokecolor="${bg}" fillcolor="${bg}"><w:anchorlock/><center style="color:${textColor};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;">${label}</center></v:roundrect></td></tr></table><![endif]--><!--[if !mso]><!--><a href="${url}" style="display:inline-block;background:${bg};color:${textColor};font-size:13px;font-weight:bold;padding:12px 22px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;margin:4px 6px;">&#8203;${label}</a><!--<![endif]-->`;
}

/** Renders a centered row of 1–3 buttons */
function btnRow(...buttons: string[]): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:24px 0 8px;">
  <tr>
    <td align="center" style="padding:0;">
      <!--[if mso]><table cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->
      ${buttons.join("\n      ")}
      <!--[if mso]></tr></table><![endif]-->
    </td>
  </tr>
</table>`;
}

/** Booking ID badge — prominent dark-green pill showing the reference number */
function bookingBadge(bookingNumber: string): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:20px 0 4px;">
  <tr>
    <td style="background:${BRAND.darkGreen};border-radius:8px;padding:14px 20px;text-align:center;">
      <p style="margin:0 0 3px;font-size:10px;color:#a8d5be;text-transform:uppercase;letter-spacing:1.5px;font-family:Arial,sans-serif;">Booking Reference</p>
      <p style="margin:0;font-size:20px;font-weight:bold;color:${BRAND.gold};font-family:'Courier New',monospace;letter-spacing:2px;">${bookingNumber}</p>
    </td>
  </tr>
</table>`;
}

/** Two-column info table row */
function row(label: string, value: string, shade = false): string {
  const bg = shade ? "#f7f4ee" : "#ffffff";
  return `
<tr style="background:${bg};">
  <td style="padding:10px 18px;font-size:12px;color:#666;font-family:Arial,sans-serif;width:40%;border-bottom:1px solid #ede8df;">${label}</td>
  <td style="padding:10px 18px;font-size:13px;color:#1a1a1a;font-weight:600;font-family:Arial,sans-serif;border-bottom:1px solid #ede8df;">${value}</td>
</tr>`;
}

/** Info table wrapper with a coloured header row */
function infoTable(headerLabel: string, rows: string, icon = "📋"): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
       style="margin:20px 0;border:1px solid #ddd7cc;border-radius:8px;overflow:hidden;border-collapse:separate;border-spacing:0;">
  <tr>
    <td colspan="2" style="background:${BRAND.darkGreen};padding:12px 18px;">
      <p style="margin:0;font-size:13px;font-weight:bold;color:#ffffff;font-family:Arial,sans-serif;">${icon}&nbsp; ${headerLabel}</p>
    </td>
  </tr>
  ${rows}
</table>`;
}

/** Coloured pill badge for payment / booking status */
function statusBadge(status: string): string {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid:        { bg: "#d4edda", color: "#155724", label: "✅ Paid" },
    partial:     { bg: "#fff3cd", color: "#856404", label: "⏳ Partially Paid" },
    unpaid:      { bg: "#f8d7da", color: "#721c24", label: "❌ Unpaid" },
    pending:     { bg: "#fff3cd", color: "#856404", label: "⏳ Pending" },
    confirmed:   { bg: "#d4edda", color: "#155724", label: "✅ Confirmed" },
    approved:    { bg: "#d4edda", color: "#155724", label: "✅ Approved" },
    rejected:    { bg: "#f8d7da", color: "#721c24", label: "❌ Rejected" },
    processing:  { bg: "#cce5ff", color: "#004085", label: "🔄 Processing" },
  };
  const s = map[status?.toLowerCase()] || { bg: "#e2e3e5", color: "#383d41", label: status };
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};font-size:12px;font-weight:bold;padding:4px 12px;border-radius:20px;font-family:Arial,sans-serif;">${s.label}</span>`;
}

/** Alert/notice box — tip, warning, or info */
function notice(
  content: string,
  type: "tip" | "warn" | "info" = "tip"
): string {
  const styles = {
    tip:  { bg: "#eaf7ef", border: BRAND.darkGreen, color: "#155724" },
    warn: { bg: "#fff8e1", border: BRAND.gold,      color: "#7a5f00" },
    info: { bg: "#e8f0ff", border: "#4a6cf7",       color: "#1e3a8a" },
  };
  const s = styles[type];
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
       style="background:${s.bg};border-left:4px solid ${s.border};border-radius:4px;margin:16px 0;">
  <tr>
    <td style="padding:14px 16px;font-size:13px;color:${s.color};font-family:Arial,sans-serif;line-height:1.6;">
      ${content}
    </td>
  </tr>
</table>`;
}

/** QR code + label block for inline use in the email content */
function qrBlock(url: string, label = "Scan to open your booking"): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin:20px 0;">
  <tr>
    <td align="center" style="padding:16px;background:#f7f4ee;border-radius:8px;border:1px solid #ddd7cc;">
      ${qrImg(url, 120)}
      <p style="margin:10px 0 0;font-size:11px;color:#666;font-family:Arial,sans-serif;">${label}</p>
    </td>
  </tr>
</table>`;
}

// ── Premium master template ────────────────────────────────────────────────────
/**
 * Wraps any email content in the Al Burhan premium branded shell.
 * Fully responsive (mobile @media), Outlook VML-ready, Gmail-compatible.
 */
function buildTemplate(
  title:   string,
  content: string,
  opts: {
    preheader?: string;
    ctaText?:   string;
    ctaUrl?:    string;
  } = {}
): string {
  const preheader = opts.preheader || title;
  const ctaBlock  = opts.ctaText && opts.ctaUrl
    ? `<tr><td style="background:#ffffff;padding:0 48px 32px;text-align:center;">
         ${btn(opts.ctaText, opts.ctaUrl, BRAND.gold, "#1a0a00")}
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--<![endif]-->
  <title>${title} — Al Burhan Tours &amp; Travels</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    /* Client resets */
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    /* Mobile */
    @media only screen and (max-width:620px) {
      .ew  { padding:0 !important; }
      .ec  { border-radius:0 !important; }
      .eb  { padding:24px 20px !important; }
      .eh  { padding:28px 20px !important; }
      .ef  { padding:22px 20px !important; }
      .bn  { display:block !important; text-align:center !important; margin:6px auto !important; }
      .nm  { font-size:22px !important; }
      .dtd { display:block !important; width:100% !important; box-sizing:border-box; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#e9e4da;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;">

<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#e9e4da"><tr><td align="center"><![endif]-->

<!-- Hidden preheader text — shows in inbox preview -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#e9e4da;">
  ${preheader}&nbsp;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;
</div>

<!-- Outer wrapper -->
<table class="ew" width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
       style="background:#e9e4da;padding:28px 16px;">
<tr><td align="center">

  <!--[if mso]><table width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->

  <!-- ═══════════════ EMAIL CARD ═══════════════ -->
  <table class="ec" width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
         style="max-width:600px;width:100%;border-radius:14px;overflow:hidden;
                box-shadow:0 10px 40px rgba(0,0,0,0.14);">

    <!-- TOP GOLD ACCENT -->
    <tr>
      <td style="background:linear-gradient(90deg,${BRAND.gold} 0%,#e8c96a 50%,${BRAND.gold} 100%);height:5px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
    </tr>

    <!-- ═══ HEADER / LOGO ═══ -->
    <tr>
      <td class="eh" style="background:${BRAND.darkGreen};padding:34px 48px 28px;text-align:center;">

        <!-- Decorative row -->
        <p style="margin:0 0 12px;font-size:18px;color:${BRAND.gold};line-height:1;letter-spacing:8px;">
          &#9670;&nbsp;&#9670;&nbsp;&#9670;
        </p>

        <!-- Company Name -->
        <h1 class="nm" style="margin:0;font-size:28px;font-weight:900;
                   color:${BRAND.gold};letter-spacing:3px;text-transform:uppercase;
                   font-family:Arial,Helvetica,sans-serif;mso-line-height-rule:exactly;">
          Al Burhan
        </h1>
        <p style="margin:3px 0 0;font-size:12px;font-weight:700;color:#e8d9a0;
                  letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;">
          Tours &amp; Travels
        </p>

        <!-- Thin gold rule -->
        <table width="80" cellpadding="0" cellspacing="0" border="0" role="presentation"
               style="margin:14px auto 12px;">
          <tr><td style="background:${BRAND.gold};height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>

        <p style="margin:0;font-size:11px;color:#9ec8b0;letter-spacing:0.8px;
                  font-family:Arial,sans-serif;">
          Hajj &amp; Umrah Specialists &nbsp;&bull;&nbsp; 35+ Years of Excellence
        </p>
      </td>
    </tr>

    <!-- GOLD DIVIDER -->
    <tr>
      <td style="background:${BRAND.gold};height:3px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
    </tr>

    <!-- ═══ TITLE BAND ═══ -->
    <tr>
      <td style="background:#ffffff;padding:16px 48px 14px;border-bottom:1px solid #ede7db;">
        <h2 style="margin:0;font-size:16px;font-weight:700;color:${BRAND.darkGreen};
                   letter-spacing:0.2px;font-family:Arial,sans-serif;">
          ${title}
        </h2>
      </td>
    </tr>

    <!-- ═══ BODY CONTENT ═══ -->
    <tr>
      <td class="eb" style="background:#ffffff;padding:30px 48px 20px;
                 color:#2c2c2c;font-size:14px;line-height:1.75;font-family:Arial,sans-serif;">
        ${content}
      </td>
    </tr>

    <!-- ═══ SINGLE CTA (legacy compat) ═══ -->
    ${ctaBlock}

    <!-- DIVIDER -->
    <tr>
      <td style="background:#ffffff;padding:0 48px;">
        <hr style="border:none;border-top:1px solid #ede7db;margin:0;">
      </td>
    </tr>

    <!-- ═══ FOOTER ═══ -->
    <tr>
      <td class="ef" style="background:#f9f6f0;padding:26px 48px;text-align:center;">
        <p style="margin:0 0 5px;font-size:14px;font-weight:700;color:${BRAND.darkGreen};
                  font-family:Arial,sans-serif;">
          Al Burhan Tours &amp; Travels
        </p>
        <p style="margin:0 0 4px;font-size:12px;color:#777;font-family:Arial,sans-serif;">
          📍 ${BRAND.address}
        </p>
        <p style="margin:0 0 4px;font-size:12px;color:#777;font-family:Arial,sans-serif;">
          📞 ${BRAND.phone1} &nbsp;|&nbsp; 📞 ${BRAND.phone2}
        </p>
        <p style="margin:0 0 10px;font-size:12px;color:#777;font-family:Arial,sans-serif;">
          ✉&nbsp;<a href="mailto:${BRAND.email}" style="color:${BRAND.darkGreen};text-decoration:none;">${BRAND.email}</a>
          &nbsp;|&nbsp;
          🌐&nbsp;<a href="${BRAND.website}" style="color:${BRAND.darkGreen};text-decoration:none;">www.alburhantravels.online</a>
        </p>
        <p style="margin:0;font-size:10px;color:#aaa;line-height:1.6;font-family:Arial,sans-serif;">
          This is an automated notification. Do not reply to this email.<br>
          For support, call or WhatsApp us on ${BRAND.phone1}.
        </p>
      </td>
    </tr>

    <!-- DARK GREEN BOTTOM BAR -->
    <tr>
      <td style="background:${BRAND.darkGreen};padding:13px 48px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#9ec8b0;letter-spacing:0.5px;
                  font-family:Arial,sans-serif;">
          May Allah accept your Hajj &amp; Umrah &nbsp;&mdash;&nbsp; آمين
        </p>
      </td>
    </tr>

    <!-- BOTTOM GOLD ACCENT -->
    <tr>
      <td style="background:${BRAND.gold};height:4px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td>
    </tr>

  </table>
  <!-- /EMAIL CARD -->

  <!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>

<!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── EXPORTED EMAIL FUNCTIONS ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. OTP Email ──────────────────────────────────────────────────────────────
export async function sendOTPEmail(
  to:   string,
  name: string,
  otp:  string
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const content = `
    <p style="margin:0 0 16px;">Dear <strong>${name || "Pilgrim"}</strong>,</p>
    <p style="margin:0 0 20px;color:#444;">
      Your one-time verification code for <strong>Al Burhan Tours &amp; Travels</strong> is:
    </p>

    <!-- OTP Box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="margin:24px 0;">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"
                 style="background:${BRAND.goldLight};border:2px dashed ${BRAND.gold};
                        border-radius:12px;padding:24px 48px;text-align:center;">
            <tr>
              <td>
                <p style="margin:0 0 6px;font-size:11px;color:#888;text-transform:uppercase;
                          letter-spacing:2px;font-family:Arial,sans-serif;">YOUR SECURE OTP</p>
                <p style="margin:0;font-size:44px;font-weight:900;color:${BRAND.darkGreen};
                          letter-spacing:12px;font-family:'Courier New',monospace;">${otp}</p>
                <p style="margin:10px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif;">
                  ⏱&nbsp; Valid for <strong>5 minutes</strong> only
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${notice(`🔒 <strong>Security Notice:</strong> Al Burhan Tours &amp; Travels will <u>never</u> call or message you asking for your OTP. Do not share this code with anyone.`, "warn")}

    <p style="font-size:13px;color:#888;margin:16px 0 0;">
      If you did not request this code, please ignore this email or contact us immediately at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};font-weight:bold;">${BRAND.phone1}</a>.
    </p>
  `;

  return sendWithRetry({
    from:    `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject: `${otp} — Your Al Burhan Tours Login OTP (Do Not Share)`,
    text:    `Your OTP is: ${otp}\nValid for 5 minutes. Do not share it with anyone.\n\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:    buildTemplate("Login Verification Code", content, {
               preheader: `Your OTP is ${otp} — valid for 5 minutes. Do not share.`,
             }),
  });
}

// ── 2. Booking Confirmation ───────────────────────────────────────────────────
export async function sendBookingConfirmation(
  to:   string,
  data: {
    customerName:     string;
    bookingNumber:    string;
    packageName:      string;
    travelDate?:      string | Date;
    numberOfPilgrims?: number;
    totalAmount?:     number | string;
    paidAmount?:      number | string;
    balanceAmount?:   number | string;
    status?:          string;
    groupName?:       string;
    agreementId?:     string;
  }
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const statusLabel = data.status === "confirmed" ? "Confirmed"
                    : data.status === "approved"   ? "Approved"
                    : data.status === "pending"    ? "Pending Review"
                    : "Received";

  const paymentStatus = data.balanceAmount && Number(data.balanceAmount) > 0
    ? statusBadge("partial")
    : data.paidAmount && Number(data.paidAmount) > 0
    ? statusBadge("paid")
    : statusBadge("pending");

  const dashUrl = `${BRAND.website}/dashboard`;

  const content = `
    <p style="margin:0 0 16px;">Dear <strong>${data.customerName}</strong>,</p>
    <p style="margin:0 0 20px;color:#444;">
      Alhamdulillah! Your booking with <strong>Al Burhan Tours &amp; Travels</strong> has been
      <strong>${statusLabel.toLowerCase()}</strong>. May Allah bless your journey. 🕌
    </p>

    ${bookingBadge(data.bookingNumber)}

    ${infoTable("Booking Details", `
      ${row("Passenger Name", `<span style="color:${BRAND.darkGreen};font-weight:700;">${data.customerName}</span>`, true)}
      ${row("Package", data.packageName)}
      ${row("Status", `<span style="font-weight:bold;color:${BRAND.midGreen};">${statusLabel}</span>`, true)}
      ${data.travelDate    ? row("Departure Date",  `<strong>${formatDate(data.travelDate)}</strong>`)   : ""}
      ${data.numberOfPilgrims ? row("No. of Pilgrims", String(data.numberOfPilgrims), true) : ""}
      ${data.groupName     ? row("Group",            data.groupName)                                 : ""}
      ${data.agreementId   ? row("Agreement ID",     `<span style="font-family:monospace;color:${BRAND.darkGreen};">${data.agreementId}</span>`, true) : ""}
    `, "📋")}

    ${data.totalAmount != null ? infoTable("Payment Summary", `
      ${row("Total Package Amount", `<strong>${formatINR(data.totalAmount)}</strong>`, true)}
      ${data.paidAmount  != null ? row("Amount Paid",    `<span style="color:#1a7a3c;font-weight:bold;">${formatINR(data.paidAmount)}</span>`)          : ""}
      ${data.balanceAmount != null ? row("Balance Due",  `<span style="color:#c0392b;font-weight:bold;">${formatINR(data.balanceAmount)}</span>`, true) : ""}
      ${row("Payment Status", paymentStatus)}
    `, "💰") : ""}

    ${btnRow(
      btn("🕋 View My Booking",   dashUrl,           BRAND.darkGreen),
      btn("💬 WhatsApp Support",  BRAND.whatsapp,    "#25D366"),
      btn("⬇ Download Booking",  `${BRAND.website}/invoice/${data.bookingNumber}`, BRAND.gold, "#1a0a00"),
    )}

    ${qrBlock(dashUrl, "Scan to access your booking dashboard")}

    <p style="font-size:13px;color:#777;margin:16px 0 0;">
      Our team will contact you shortly with documentation and travel details.
      For any queries, call <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};font-weight:bold;">${BRAND.phone1}</a>.
    </p>
    <p style="margin:16px 0 0;">JazakAllah Khair 🤲<br>
      <strong style="color:${BRAND.darkGreen};">Al Burhan Tours &amp; Travels Team</strong>
    </p>
  `;

  return sendWithRetry({
    from:    `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject: `Booking ${statusLabel} — ${data.bookingNumber} | Al Burhan Tours & Travels`,
    text:    `Dear ${data.customerName},\n\nYour booking ${data.bookingNumber} for ${data.packageName} is ${statusLabel}.\n\nDashboard: ${dashUrl}\n\nFor queries: ${BRAND.phone1}\n\nAl Burhan Tours & Travels`,
    html:    buildTemplate(`Booking ${statusLabel} ✅`, content, {
               preheader: `Your booking ${data.bookingNumber} for ${data.packageName} is ${statusLabel}`,
             }),
  });
}

// ── 3. Payment Receipt ────────────────────────────────────────────────────────
export async function sendPaymentReceipt(
  to:   string,
  data: {
    customerName:   string;
    bookingNumber:  string;
    packageName?:   string;
    paymentAmount:  number | string;
    paymentMethod?: string;
    paymentDate?:   string | Date;
    transactionId?: string;
    totalAmount?:   number | string;
    paidSoFar?:     number | string;
    balanceDue?:    number | string;
  }
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const isFullyPaid = data.balanceDue == null || Number(data.balanceDue) <= 0;
  const dashUrl = `${BRAND.website}/dashboard`;

  const content = `
    <p style="margin:0 0 16px;">Dear <strong>${data.customerName}</strong>,</p>

    <!-- Big payment received hero -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="background:#eef7f2;border:1px solid #b5dfc8;border-radius:10px;
                  margin:0 0 20px;text-align:center;">
      <tr>
        <td style="padding:22px 24px;">
          <p style="margin:0 0 4px;font-size:32px;line-height:1;">✅</p>
          <p style="margin:0 0 6px;font-size:13px;color:#555;font-family:Arial,sans-serif;
                    text-transform:uppercase;letter-spacing:1px;">Payment Received</p>
          <p style="margin:0;font-size:36px;font-weight:900;color:${BRAND.darkGreen};
                    font-family:Arial,sans-serif;">${formatINR(data.paymentAmount)}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif;">
            ${isFullyPaid ? "🎉 Fully Paid — Thank You!" : "Partial payment recorded"}
          </p>
        </td>
      </tr>
    </table>

    ${bookingBadge(data.bookingNumber)}

    ${infoTable("Payment Details", `
      ${row("Passenger Name", `<span style="color:${BRAND.darkGreen};font-weight:700;">${data.customerName}</span>`, true)}
      ${data.packageName    ? row("Package",        data.packageName)                  : ""}
      ${data.paymentDate    ? row("Payment Date",   formatDate(data.paymentDate), true) : ""}
      ${data.paymentMethod  ? row("Payment Method", data.paymentMethod)                : ""}
      ${data.transactionId  ? row("Transaction ID", `<span style="font-family:monospace;font-size:12px;">${data.transactionId}</span>`, true) : ""}
    `, "💳")}

    ${infoTable("Amount Summary", `
      ${data.totalAmount != null ? row("Total Package Amount", `<strong>${formatINR(data.totalAmount)}</strong>`, true) : ""}
      ${row("This Payment",       `<span style="color:#1a7a3c;font-size:16px;font-weight:bold;">${formatINR(data.paymentAmount)}</span>`)}
      ${data.paidSoFar  != null  ? row("Total Paid So Far",   `<span style="color:#1a7a3c;font-weight:bold;">${formatINR(data.paidSoFar)}</span>`, true) : ""}
      ${data.balanceDue != null  ? row("Balance Remaining",   `<span style="color:${Number(data.balanceDue) > 0 ? "#c0392b" : "#1a7a3c"};font-weight:bold;">${formatINR(data.balanceDue)}</span>`) : ""}
      ${row("Payment Status", statusBadge(isFullyPaid ? "paid" : "partial"), true)}
    `, "📊")}

    ${btnRow(
      btn("🕋 View My Booking",  dashUrl,         BRAND.darkGreen),
      btn("💬 WhatsApp Support", BRAND.whatsapp,  "#25D366"),
    )}

    ${qrBlock(dashUrl, "Scan to view your booking & payment history")}

    <p style="font-size:13px;color:#777;margin:16px 0 0;">
      Please keep this email as your payment confirmation. For any discrepancies,
      contact us at <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};font-weight:bold;">${BRAND.phone1}</a>.
    </p>
    <p style="margin:16px 0 0;">Warm regards,<br>
      <strong style="color:${BRAND.darkGreen};">Al Burhan Tours &amp; Travels Team</strong>
    </p>
  `;

  return sendWithRetry({
    from:    `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject: `Payment Received — ${formatINR(data.paymentAmount)} | ${data.bookingNumber} | Al Burhan`,
    text:    `Payment of ${formatINR(data.paymentAmount)} received for booking ${data.bookingNumber}. Thank you!\n\nDashboard: ${dashUrl}\n\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:    buildTemplate("Payment Received — Thank You!", content, {
               preheader: `${formatINR(data.paymentAmount)} payment confirmed for booking ${data.bookingNumber}`,
             }),
  });
}

// ── 4. Invoice Email ──────────────────────────────────────────────────────────
export async function sendInvoiceEmail(
  to:   string,
  data: {
    customerName:   string;
    bookingNumber:  string;
    invoiceNumber:  string;
    packageName?:   string;
    invoiceDate?:   string | Date;
    dueDate?:       string | Date;
    subtotal?:      number | string;
    discount?:      number | string;
    gstAmount?:     number | string;
    totalAmount:    number | string;
    paidAmount?:    number | string;
    balanceDue?:    number | string;
    invoiceStatus?: string;
  },
  pdfBuffer?: Buffer
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const invoiceUrl = `${BRAND.website}/invoice/${data.bookingNumber}`;
  const isFullyPaid = data.invoiceStatus === "paid"
    || (data.balanceDue != null && Number(data.balanceDue) <= 0);

  const content = `
    <p style="margin:0 0 16px;">Dear <strong>${data.customerName}</strong>,</p>
    <p style="margin:0 0 6px;color:#444;">
      Please find your invoice from <strong>Al Burhan Tours &amp; Travels</strong> below.
      ${pdfBuffer ? "Your <strong>invoice PDF</strong> is attached to this email. 📎" : ""}
    </p>

    <!-- Invoice number hero -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="background:${BRAND.darkGreen};border-radius:8px;margin:20px 0 4px;text-align:center;">
      <tr>
        <td style="padding:18px 24px;">
          <p style="margin:0 0 3px;font-size:10px;color:#a8d5be;text-transform:uppercase;
                    letter-spacing:2px;font-family:Arial,sans-serif;">Invoice Number</p>
          <p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:${BRAND.gold};
                    font-family:'Courier New',monospace;letter-spacing:1px;">${data.invoiceNumber}</p>
          <p style="margin:0;font-size:11px;color:#9ec8b0;font-family:Arial,sans-serif;">
            Booking Ref: ${data.bookingNumber}
          </p>
        </td>
      </tr>
    </table>

    ${infoTable("Invoice Details", `
      ${row("Passenger Name", `<span style="color:${BRAND.darkGreen};font-weight:700;">${data.customerName}</span>`, true)}
      ${data.packageName  ? row("Package",       data.packageName)                              : ""}
      ${data.invoiceDate  ? row("Invoice Date",  formatDate(data.invoiceDate), true)            : ""}
      ${data.dueDate      ? row("Due Date",      `<span style="color:#c0392b;font-weight:bold;">${formatDate(data.dueDate)}</span>`)  : ""}
      ${row("Invoice Status", statusBadge(isFullyPaid ? "paid" : (data.invoiceStatus || "pending")), true)}
    `, "🧾")}

    ${infoTable("Amount Breakdown", `
      ${data.subtotal  != null ? row("Subtotal",          formatINR(data.subtotal), true) : ""}
      ${data.discount  != null && Number(data.discount) > 0 ? row("Discount", `<span style="color:#1a7a3c;">− ${formatINR(data.discount)}</span>`) : ""}
      ${data.gstAmount != null && Number(data.gstAmount) > 0 ? row("GST / TCS", formatINR(data.gstAmount), true) : ""}
      ${row("Total Amount", `<span style="font-size:18px;font-weight:bold;color:${BRAND.darkGreen};">${formatINR(data.totalAmount)}</span>`)}
      ${data.paidAmount != null ? row("Amount Paid",    `<span style="color:#1a7a3c;font-weight:bold;">${formatINR(data.paidAmount)}</span>`, true) : ""}
      ${data.balanceDue != null ? row("Balance Due",    `<span style="color:#c0392b;font-weight:bold;">${formatINR(data.balanceDue)}</span>`)       : ""}
    `, "📊")}

    ${pdfBuffer ? notice("📎 <strong>Your invoice PDF is attached.</strong> Please save it for your records.", "tip") : ""}

    ${btnRow(
      btn("⬇ Download Invoice",   invoiceUrl,      BRAND.gold, "#1a0a00"),
      btn("🕋 View My Booking",    BRAND.dashboard, BRAND.darkGreen),
      btn("💬 WhatsApp Support",   BRAND.whatsapp,  "#25D366"),
    )}

    ${qrBlock(invoiceUrl, "Scan to view or download your invoice")}

    <p style="font-size:13px;color:#777;margin:16px 0 0;">
      For payment queries or discrepancies, contact us at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};font-weight:bold;">${BRAND.phone1}</a> or
      <a href="mailto:${BRAND.email}" style="color:${BRAND.darkGreen};">${BRAND.email}</a>.
    </p>
    <p style="margin:16px 0 0;">Warm regards,<br>
      <strong style="color:${BRAND.darkGreen};">Al Burhan Tours &amp; Travels Team</strong>
    </p>
  `;

  const attachments: any[] = pdfBuffer
    ? [{ filename: `Invoice-${data.invoiceNumber.replace(/\//g, "-")}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  return sendWithRetry({
    from:        `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject:     `Invoice ${data.invoiceNumber} — Al Burhan Tours & Travels`,
    text:        `Invoice ${data.invoiceNumber} for booking ${data.bookingNumber}.\nTotal: ${formatINR(data.totalAmount)}${data.balanceDue != null ? `\nBalance Due: ${formatINR(data.balanceDue)}` : ""}.\n\nView invoice: ${invoiceUrl}\n\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:        buildTemplate("Your Invoice is Ready 🧾", content, {
                   preheader: `Invoice ${data.invoiceNumber} — Total ${formatINR(data.totalAmount)}`,
                 }),
    attachments,
  });
}

// ── 5. Flight Ticket Email ────────────────────────────────────────────────────
export async function sendTicketEmail(
  to:   string,
  data: {
    customerName:   string;
    bookingNumber:  string;
    packageName?:   string;
    flightNumber?:  string;
    departure?:     string;
    destination?:   string;
    departureDate?: string | Date;
    returnDate?:    string | Date;
    pnr?:           string;
    fileName?:      string;
  },
  pdfBuffer?: Buffer
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const dashUrl = `${BRAND.website}/dashboard`;

  const content = `
    <p style="margin:0 0 16px;">Dear <strong>${data.customerName}</strong>,</p>

    <!-- Ticket hero banner -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="background:linear-gradient(135deg,${BRAND.darkGreen} 0%,${BRAND.midGreen} 100%);
                  border-radius:10px;margin:0 0 20px;text-align:center;">
      <tr>
        <td style="padding:22px 24px;">
          <p style="margin:0 0 4px;font-size:36px;line-height:1;">✈</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:bold;color:${BRAND.gold};
                    font-family:Arial,sans-serif;">Your Flight Ticket is Ready!</p>
          <p style="margin:0;font-size:12px;color:#9ec8b0;font-family:Arial,sans-serif;">
            ${pdfBuffer ? "E-ticket PDF attached to this email 📎" : "Your ticket details are below"}
          </p>
        </td>
      </tr>
    </table>

    ${bookingBadge(data.bookingNumber)}

    ${infoTable("Passenger & Flight Details", `
      ${row("Passenger Name",  `<span style="color:${BRAND.darkGreen};font-weight:700;">${data.customerName}</span>`, true)}
      ${data.packageName    ? row("Package",         data.packageName)                                               : ""}
      ${data.flightNumber   ? row("Flight Number",   `<strong style="font-family:monospace;">${data.flightNumber}</strong>`, true)   : ""}
      ${data.pnr            ? row("PNR / Booking Ref", `<strong style="font-family:monospace;color:${BRAND.darkGreen};">${data.pnr}</strong>`) : ""}
      ${data.departure      ? row("From",            data.departure, true)                                           : ""}
      ${data.destination    ? row("To",              data.destination)                                               : ""}
      ${data.departureDate  ? row("Departure Date",  `<strong style="color:${BRAND.darkGreen};">${formatDate(data.departureDate)}</strong>`, true) : ""}
      ${data.returnDate     ? row("Return Date",     formatDate(data.returnDate))                                    : ""}
    `, "✈")}

    ${pdfBuffer ? notice("📎 <strong>Your e-ticket PDF is attached.</strong> Please download and save it before your journey.", "tip") : ""}

    ${notice(`
      💡 <strong>Travel Reminder:</strong><br>
      &bull; Carry a printed or digital copy of your e-ticket at the airport.<br>
      &bull; Report to check-in at least <strong>3 hours before departure</strong>.<br>
      &bull; Keep your passport, visa, and boarding pass together at all times.
    `, "info")}

    ${btnRow(
      pdfBuffer
        ? btn("⬇ Download Ticket",  dashUrl,         BRAND.gold, "#1a0a00")
        : btn("🕋 View Dashboard",   dashUrl,         BRAND.gold, "#1a0a00"),
      btn("🕋 My Booking",          dashUrl,         BRAND.darkGreen),
      btn("💬 WhatsApp Support",    BRAND.whatsapp,  "#25D366"),
    )}

    ${qrBlock(dashUrl, "Scan to view your booking & download your ticket")}

    <p style="font-size:13px;color:#777;margin:16px 0 0;">
      For any flight-related queries, contact us at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};font-weight:bold;">${BRAND.phone1}</a>.
    </p>
    <p style="margin:16px 0 0;">
      Have a blessed journey! 🕌✈<br>
      <strong style="color:${BRAND.darkGreen};">Al Burhan Tours &amp; Travels Team</strong>
    </p>
  `;

  const attachments: any[] = pdfBuffer
    ? [{ filename: data.fileName || `Ticket-${data.bookingNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  return sendWithRetry({
    from:        `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject:     `✈ Your Flight Ticket — ${data.bookingNumber} | Al Burhan Tours & Travels`,
    text:        `Dear ${data.customerName},\n\nYour flight ticket for booking ${data.bookingNumber} is ready.${data.flightNumber ? `\nFlight: ${data.flightNumber}` : ""}${data.pnr ? `\nPNR: ${data.pnr}` : ""}${data.departureDate ? `\nDeparture: ${formatDate(data.departureDate)}` : ""}\n\nDashboard: ${dashUrl}\n\nJazakAllah Khair!\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:        buildTemplate("Your Flight Ticket is Ready ✈", content, {
                   preheader: `Your e-ticket for booking ${data.bookingNumber} is ready — check inside`,
                 }),
    attachments,
  });
}

// ── 6. Visa Email ─────────────────────────────────────────────────────────────
export async function sendVisaEmail(
  to:   string,
  data: {
    customerName:    string;
    bookingNumber:   string;
    packageName?:    string;
    visaNumber?:     string;
    passportNumber?: string;
    issueDate?:      string | Date;
    expiryDate?:     string | Date;
    country?:        string;
    fileName?:       string;
  },
  pdfBuffer?: Buffer
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const dashUrl = `${BRAND.website}/dashboard`;

  const content = `
    <p style="margin:0 0 16px;">Dear <strong>${data.customerName}</strong>,</p>

    <!-- Visa ready hero -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="background:linear-gradient(135deg,${BRAND.darkGreen} 0%,${BRAND.midGreen} 100%);
                  border-radius:10px;margin:0 0 20px;text-align:center;">
      <tr>
        <td style="padding:22px 24px;">
          <p style="margin:0 0 4px;font-size:32px;line-height:1;">🛂</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:bold;color:${BRAND.gold};
                    font-family:Arial,sans-serif;">Alhamdulillah — Visa is Ready!</p>
          <p style="margin:0;font-size:12px;color:#9ec8b0;font-family:Arial,sans-serif;">
            ${pdfBuffer ? "Visa document PDF attached to this email 📎" : "Your visa details are below"}
          </p>
        </td>
      </tr>
    </table>

    ${bookingBadge(data.bookingNumber)}

    ${infoTable("Pilgrim & Visa Details", `
      ${row("Pilgrim Name",      `<span style="color:${BRAND.darkGreen};font-weight:700;">${data.customerName}</span>`, true)}
      ${row("Booking Reference", data.bookingNumber)}
      ${data.country        ? row("Destination",    data.country, true)                                             : ""}
      ${data.packageName    ? row("Package",         data.packageName)                                              : ""}
      ${data.visaNumber     ? row("Visa Number",    `<strong style="font-family:monospace;color:${BRAND.darkGreen};">${data.visaNumber}</strong>`, true) : ""}
      ${data.passportNumber ? row("Passport Number", `<span style="font-family:monospace;">${data.passportNumber}</span>`) : ""}
      ${data.issueDate      ? row("Issue Date",      formatDate(data.issueDate), true)                              : ""}
      ${data.expiryDate     ? row("Expiry Date",    `<span style="color:#c0392b;font-weight:bold;">${formatDate(data.expiryDate)}</span>`)             : ""}
    `, "🛂")}

    ${pdfBuffer ? notice("📎 <strong>Your visa document PDF is attached.</strong> Please download and keep it safe.", "tip") : ""}

    ${notice(`
      ⚠️ <strong>Important Instructions:</strong><br>
      &bull; Carry the <strong>original visa document</strong> along with your passport.<br>
      &bull; Verify that your <strong>name and passport number</strong> on the visa match exactly.<br>
      &bull; Keep both documents safe throughout your entire journey.
    `, "warn")}

    ${btnRow(
      pdfBuffer
        ? btn("⬇ Download Visa",    dashUrl,         BRAND.gold, "#1a0a00")
        : btn("🕋 View Dashboard",   dashUrl,         BRAND.gold, "#1a0a00"),
      btn("🕋 My Booking",          dashUrl,         BRAND.darkGreen),
      btn("💬 WhatsApp Support",    BRAND.whatsapp,  "#25D366"),
    )}

    ${qrBlock(dashUrl, "Scan to access your booking & visa documents")}

    <p style="font-size:13px;color:#777;margin:16px 0 0;">
      For any visa-related queries, contact us immediately at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};font-weight:bold;">${BRAND.phone1}</a>.
    </p>
    <p style="margin:16px 0 0;">
      May Allah accept your Ibadah! 🤲<br>
      <strong style="color:${BRAND.darkGreen};">Al Burhan Tours &amp; Travels Team</strong>
    </p>
  `;

  const attachments: any[] = pdfBuffer
    ? [{ filename: data.fileName || `Visa-${data.bookingNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  return sendWithRetry({
    from:        `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject:     `🛂 Your Visa Document — ${data.bookingNumber} | Al Burhan Tours & Travels`,
    text:        `Dear ${data.customerName},\n\nAlhamdulillah! Your visa for booking ${data.bookingNumber} is ready.${data.visaNumber ? `\nVisa No: ${data.visaNumber}` : ""}${data.expiryDate ? `\nExpiry: ${formatDate(data.expiryDate)}` : ""}\n\nDashboard: ${dashUrl}\n\nJazakAllah Khair!\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:        buildTemplate("Your Visa Document is Ready 🛂", content, {
                   preheader: `Alhamdulillah — your visa for booking ${data.bookingNumber} is now available`,
                 }),
    attachments,
  });
}

// ── 7. Password Reset Email ───────────────────────────────────────────────────
export async function sendPasswordResetEmail(
  to:   string,
  name: string,
  otp:  string
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const content = `
    <p style="margin:0 0 16px;">Dear <strong>${name || "Pilgrim"}</strong>,</p>
    <p style="margin:0 0 20px;color:#444;">
      We received a request to reset access for your Al Burhan Tours &amp; Travels account.
      Use the code below to proceed:
    </p>

    <!-- Reset code box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="margin:24px 0;">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation"
                 style="background:#fff0f0;border:2px dashed #e74c3c;
                        border-radius:12px;padding:24px 48px;text-align:center;">
            <tr>
              <td>
                <p style="margin:0 0 6px;font-size:11px;color:#888;text-transform:uppercase;
                          letter-spacing:2px;font-family:Arial,sans-serif;">ACCOUNT RESET CODE</p>
                <p style="margin:0;font-size:44px;font-weight:900;color:#c0392b;
                          letter-spacing:12px;font-family:'Courier New',monospace;">${otp}</p>
                <p style="margin:10px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif;">
                  ⏱&nbsp; Valid for <strong>10 minutes</strong> only
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${notice(`🔒 <strong>Security Notice:</strong> If you did not request this reset, please ignore this email. Your account remains secure. Contact us immediately at <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};font-weight:bold;">${BRAND.phone1}</a> if you suspect unauthorised access.`, "warn")}

    <p style="margin:16px 0 0;">Warm regards,<br>
      <strong style="color:${BRAND.darkGreen};">Al Burhan Tours &amp; Travels Support Team</strong>
    </p>
  `;

  return sendWithRetry({
    from:    `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject: "Account Reset Code — Al Burhan Tours & Travels",
    text:    `Your account reset code is: ${otp}\nValid for 10 minutes.\n\nIf you did not request this, please ignore.\n\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:    buildTemplate("Account Reset Request 🔐", content, {
               preheader: "Your account reset code is ready — valid for 10 minutes",
             }),
  });
}

// ── 8. Generic / Custom Email ─────────────────────────────────────────────────
export async function sendGenericEmail(
  to:           string,
  subject:      string,
  htmlContent:  string,
  opts: {
    title?:       string;
    preheader?:   string;
    ctaText?:     string;
    ctaUrl?:      string;
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
    plainText?:   string;
  } = {}
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const html = buildTemplate(
    opts.title || subject,
    htmlContent,
    { preheader: opts.preheader || subject, ctaText: opts.ctaText, ctaUrl: opts.ctaUrl }
  );

  const plainText = opts.plainText ||
    htmlContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|tr|h[1-6]|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  return sendWithRetry({
    from:        `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject,
    text:        plainText,
    html,
    attachments: opts.attachments?.map(a => ({
                   filename:    a.filename,
                   content:     a.content,
                   contentType: a.contentType,
                 })),
  });
}

// ── 9. Booking Status Update ──────────────────────────────────────────────────
export async function sendBookingStatusEmail(
  to:   string,
  data: {
    customerName:  string;
    bookingNumber: string;
    packageName?:  string;
    newStatus:     string;
    message?:      string;
  }
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };

  const statusEmoji: Record<string, string> = {
    booking_requested:    "📝",
    documents_pending:    "📂",
    documents_received:   "📂✅",
    admin_verification:   "🔍",
    payment_pending:      "💰",
    payment_received:     "💳✅",
    invoice_generated:    "🧾",
    visa_processing:      "🛂",
    visa_approved:        "🛂✅",
    flight_confirmed:     "✈✅",
    hotel_confirmed:      "🏨✅",
    bus_allocated:        "🚌",
    room_allocated:       "🛏",
    departure_ready:      "🧳",
    journey_started:      "✈",
    reached_makkah:       "🕋",
    reached_madinah:      "🕌",
    return_flight:        "✈🏠",
    journey_completed:    "🏠✅",
    confirmed:            "✅",
    approved:             "✅",
    pending:              "⏳",
    cancelled:            "❌",
    rejected:             "❌",
  };

  const emoji = statusEmoji[data.newStatus] || "📋";
  const statusLabel = data.newStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const dashUrl = `${BRAND.website}/dashboard`;

  // Choose banner colour by status category
  const isPositive = ["confirmed","approved","payment_received","visa_approved",
    "flight_confirmed","hotel_confirmed","journey_completed","reached_makkah","reached_madinah"].includes(data.newStatus);
  const bannerBg = isPositive ? "#eaf7ef" : "#f7f4ee";
  const bannerBorder = isPositive ? BRAND.darkGreen : BRAND.gold;
  const bannerColor  = isPositive ? "#155724" : "#7a5f00";

  const content = `
    <p style="margin:0 0 16px;">Dear <strong>${data.customerName}</strong>,</p>
    <p style="margin:0 0 20px;color:#444;">
      There is an update to your booking with <strong>Al Burhan Tours &amp; Travels</strong>.
    </p>

    <!-- Status banner -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
           style="background:${bannerBg};border:2px solid ${bannerBorder};border-radius:10px;
                  margin:0 0 20px;text-align:center;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 6px;font-size:32px;line-height:1;">${emoji}</p>
          <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;
                    letter-spacing:2px;font-family:Arial,sans-serif;">New Status</p>
          <p style="margin:0;font-size:20px;font-weight:bold;color:${bannerColor};
                    font-family:Arial,sans-serif;">${statusLabel}</p>
        </td>
      </tr>
    </table>

    ${bookingBadge(data.bookingNumber)}

    ${infoTable("Booking Update", `
      ${row("Passenger Name",  `<span style="color:${BRAND.darkGreen};font-weight:700;">${data.customerName}</span>`, true)}
      ${row("Booking Reference", data.bookingNumber)}
      ${data.packageName ? row("Package", data.packageName, true) : ""}
      ${row("Status Updated To", `<span style="font-weight:bold;">${emoji} ${statusLabel}</span>`)}
    `, "📋")}

    ${data.message ? `<p style="font-size:14px;color:#444;margin:16px 0;">${data.message}</p>` : ""}

    ${btnRow(
      btn("🕋 View My Booking",  dashUrl,         BRAND.darkGreen),
      btn("💬 WhatsApp Support", BRAND.whatsapp,  "#25D366"),
    )}

    ${qrBlock(dashUrl, "Scan to view your latest booking status")}

    <p style="font-size:13px;color:#777;margin:16px 0 0;">
      For any queries, call us on
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};font-weight:bold;">${BRAND.phone1}</a>.
    </p>
    <p style="margin:16px 0 0;">Warm regards,<br>
      <strong style="color:${BRAND.darkGreen};">Al Burhan Tours &amp; Travels Team</strong>
    </p>
  `;

  return sendGenericEmail(
    to,
    `Booking Update: ${statusLabel} — ${data.bookingNumber} | Al Burhan`,
    content,
    {
      title:     `Journey Update: ${statusLabel}`,
      preheader: `Your booking ${data.bookingNumber} — Status: ${statusLabel}`,
      ctaText:   "View My Booking",
      ctaUrl:    dashUrl,
    }
  );
}
