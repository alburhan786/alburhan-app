// @ts-nocheck
/**
 * emailService.ts — Dedicated MSG91 SMTP email service for Al Burhan Tours & Travels
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
 *   SMTP_FROM      — Sender address  (info@alburhantravels.com)
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
 */

import nodemailer from "nodemailer";

// ── Brand constants ────────────────────────────────────────────────────────────
const BRAND = {
  darkGreen:   "#0B5D3B",
  midGreen:    "#0d6b44",
  gold:        "#C8A951",
  website:     "https://alburhantravels.com",
  phone1:      "+91 9893225590",
  phone2:      "+91 9893989786",
  email:       "info@alburhantravels.com",
  address:     "Bhopal, Madhya Pradesh, India",
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
// The transport is created lazily and cached across calls for connection pooling.
let _cachedTransport: nodemailer.Transporter | null = null;
let _cacheKey = "";

/**
 * Returns a Nodemailer transporter, creating a new one if credentials changed.
 * Returns null if SMTP credentials are not set (emails are silently skipped).
 */
function getTransport(): nodemailer.Transporter | null {
  const cfg = getSmtpConfig();
  if (!cfg.user || !cfg.pass) {
    console.warn("[EmailService] SMTP_USER or SMTP_PASS not set — email disabled");
    return null;
  }
  // Re-create transport only if credentials changed (e.g. live config update)
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (!_cachedTransport || key !== _cacheKey) {
    _cachedTransport = nodemailer.createTransport({
      host:   cfg.host,
      port:   cfg.port,
      secure: cfg.port === 465,          // true = SSL, false = STARTTLS (port 587)
      auth:   { user: cfg.user, pass: cfg.pass },
      tls:    { rejectUnauthorized: false },
      pool:   true,                       // reuse connections for throughput
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

// ── Retry wrapper ─────────────────────────────────────────────────────────────
/**
 * Attempts to send an email up to maxRetries times.
 * Uses exponential backoff (2 s, 4 s) between attempts.
 * Logs every attempt so failures are visible in server logs.
 */
async function sendWithRetry(
  mailOptions: nodemailer.SendMailOptions,
  maxRetries = 3
): Promise<EmailResult> {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, error: "SMTP not configured — check SMTP env vars" };
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const info = await transport.sendMail(mailOptions);
      console.log(
        `[EmailService] ✅ Delivered to ${mailOptions.to}` +
        ` | Subject: "${mailOptions.subject}"` +
        ` | ID: ${info.messageId}` +
        (attempt > 1 ? ` (attempt ${attempt})` : "")
      );
      return { ok: true, messageId: info.messageId };
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[EmailService] ⚠️  Attempt ${attempt}/${maxRetries} failed` +
        ` for ${mailOptions.to}: ${err?.message}`
      );
      if (attempt < maxRetries) {
        // Exponential backoff: 2s, 4s
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
  }

  console.error(
    `[EmailService] ❌ All ${maxRetries} attempts failed` +
    ` for ${mailOptions.to}: ${lastError?.message}`
  );
  return { ok: false, error: lastError?.message || "Email delivery failed after retries" };
}

// ── HTML template builder ──────────────────────────────────────────────────────
/**
 * Wraps arbitrary HTML content in a fully responsive, table-based email layout.
 * Uses the Al Burhan brand palette and renders correctly in Gmail, Outlook, Apple Mail.
 *
 * @param title    — Shown in the coloured title bar below the logo header
 * @param content  — Inner HTML (can include <p>, <table>, <strong>, etc.)
 * @param opts     — Optional preheader text, CTA button
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
  const { preheader = title, ctaText, ctaUrl } = opts;

  // Optional CTA button row
  const ctaRow = ctaText && ctaUrl
    ? `<tr>
         <td style="padding:8px 40px 32px;text-align:center;">
           <a href="${ctaUrl}"
              style="display:inline-block;background:${BRAND.gold};color:#1a0a00;
                     font-weight:bold;font-size:15px;padding:14px 40px;
                     border-radius:6px;text-decoration:none;letter-spacing:0.3px;">
             ${ctaText}
           </a>
         </td>
       </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title} — Al Burhan Tours &amp; Travels</title>
</head>
<body style="margin:0;padding:0;background:#efefef;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;">

  <!--[if mso]><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><![endif]-->

  <!-- Preheader (hidden preview line in inbox) -->
  <div style="display:none;font-size:1px;color:#efefef;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#efefef;padding:28px 0;">
  <tr><td align="center" style="padding:0 12px;">

    <!-- Email card -->
    <table width="600" cellpadding="0" cellspacing="0" border="0"
           style="max-width:600px;width:100%;background:#ffffff;
                  border-radius:10px;overflow:hidden;
                  box-shadow:0 4px 20px rgba(0,0,0,0.10);">

      <!-- ── HEADER ── -->
      <tr>
        <td style="background:${BRAND.darkGreen};padding:28px 40px;text-align:center;">
          <!-- Logo text (replace with <img> if you have a hosted logo URL) -->
          <p style="margin:0;font-size:28px;color:${BRAND.gold};">✈</p>
          <h1 style="margin:6px 0 0;color:${BRAND.gold};font-size:20px;font-weight:bold;letter-spacing:0.5px;">
            Al Burhan Tours &amp; Travels
          </h1>
          <p style="margin:5px 0 0;color:#a8d5be;font-size:12px;letter-spacing:0.3px;">
            Trusted Hajj &amp; Umrah Services — 35+ Years of Excellence
          </p>
        </td>
      </tr>

      <!-- ── TITLE BAR ── -->
      <tr>
        <td style="background:${BRAND.midGreen};padding:14px 40px;">
          <h2 style="margin:0;color:#ffffff;font-size:15px;font-weight:600;letter-spacing:0.2px;">
            ${title}
          </h2>
        </td>
      </tr>

      <!-- ── BODY CONTENT ── -->
      <tr>
        <td style="padding:32px 40px 20px;color:#333333;font-size:15px;line-height:1.75;">
          ${content}
        </td>
      </tr>

      <!-- ── CTA BUTTON ── -->
      ${ctaRow}

      <!-- ── DIVIDER ── -->
      <tr>
        <td style="padding:0 40px;">
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:0;">
        </td>
      </tr>

      <!-- ── FOOTER ── -->
      <tr>
        <td style="background:#f7f7f7;padding:22px 40px;text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;color:#444;font-weight:bold;">Al Burhan Tours &amp; Travels</p>
          <p style="margin:0 0 3px;font-size:12px;color:#777;">📍 ${BRAND.address}</p>
          <p style="margin:0 0 3px;font-size:12px;color:#777;">📞 ${BRAND.phone1} &nbsp;|&nbsp; 📞 ${BRAND.phone2}</p>
          <p style="margin:0 0 8px;font-size:12px;color:#777;">
            ✉ <a href="mailto:${BRAND.email}" style="color:${BRAND.darkGreen};text-decoration:none;">${BRAND.email}</a>
          </p>
          <p style="margin:0 0 10px;font-size:12px;">
            <a href="${BRAND.website}" style="color:${BRAND.darkGreen};text-decoration:none;font-weight:bold;">${BRAND.website}</a>
          </p>
          <p style="margin:0;font-size:11px;color:#aaa;">
            This is an automated notification. Please do not reply to this email directly.
          </p>
        </td>
      </tr>

    </table>
    <!-- /Email card -->

  </td></tr>
  </table>
  <!-- /Outer wrapper -->

  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;
}

// ── Helper: format Indian Rupee amounts ───────────────────────────────────────
function formatINR(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ── Helper: format a date string nicely ───────────────────────────────────────
function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch { return String(d); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── EXPORTED EMAIL FUNCTIONS ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. OTP Email ──────────────────────────────────────────────────────────────
/**
 * Sends a one-time password (OTP) to the user's email address for login / verification.
 *
 * @param to   — Recipient email address
 * @param name — Recipient display name (shown in greeting)
 * @param otp  — The 6-digit OTP string
 */
export async function sendOTPEmail(
  to: string,
  name: string,
  otp: string
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };

  const cfg = getSmtpConfig();
  const content = `
    <p>Dear <strong>${name || "Pilgrim"}</strong>,</p>
    <p>Your one-time password (OTP) for logging in to <strong>Al Burhan Tours &amp; Travels</strong> is:</p>

    <!-- OTP Box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background:#f0f9f4;border:2px dashed ${BRAND.gold};
                      border-radius:10px;padding:20px 48px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#555;letter-spacing:0.5px;">YOUR SECURE OTP</p>
            <p style="margin:8px 0 0;font-size:40px;font-weight:bold;color:${BRAND.darkGreen};
                      letter-spacing:10px;font-family:monospace;">${otp}</p>
          </div>
        </td>
      </tr>
    </table>

    <p style="color:#555;font-size:14px;">⏱ This OTP is valid for <strong>5 minutes</strong> and can only be used once.</p>

    <table width="100%" cellpadding="12" cellspacing="0" border="0"
           style="background:#fff8e1;border-left:4px solid ${BRAND.gold};border-radius:4px;margin:16px 0;">
      <tr>
        <td style="font-size:13px;color:#7a6000;">
          🔒 <strong>Security notice:</strong> Al Burhan Tours &amp; Travels will <u>never</u> call or text you asking for your OTP.
          Do not share this code with anyone.
        </td>
      </tr>
    </table>

    <p style="font-size:13px;color:#888;">If you did not request this OTP, please ignore this email or contact us immediately at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};">${BRAND.phone1}</a>.
    </p>
  `;

  return sendWithRetry({
    from:    `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject: "Your Al Burhan Tours OTP — Do Not Share",
    text:    `Your OTP is: ${otp}\nValid for 5 minutes. Do not share it with anyone.`,
    html:    buildTemplate("Login Verification Code", content, {
               preheader: `Your OTP is ${otp} — valid for 5 minutes`,
             }),
  });
}

// ── 2. Booking Confirmation ───────────────────────────────────────────────────
/**
 * Sends a booking confirmation email to the customer after their booking is
 * created or status changes to "confirmed" / "approved".
 *
 * @param to   — Customer email address
 * @param data — Booking details object
 */
export async function sendBookingConfirmation(
  to: string,
  data: {
    customerName:    string;
    bookingNumber:   string;
    packageName:     string;
    travelDate?:     string | Date;
    numberOfPilgrims?: number;
    totalAmount?:    number | string;
    paidAmount?:     number | string;
    balanceAmount?:  number | string;
    status?:         string;
    groupName?:      string;
  }
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const statusLabel = data.status === "confirmed" ? "✅ Confirmed"
                    : data.status === "approved"   ? "✅ Approved"
                    : data.status === "pending"    ? "⏳ Pending Review"
                    : "✅ Received";

  const content = `
    <p>Dear <strong>${data.customerName}</strong>,</p>
    <p>We are pleased to confirm your booking with <strong>Al Burhan Tours &amp; Travels</strong>.
       May Allah bless your journey. 🕌</p>

    <!-- Booking Details Table -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:20px 0;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
      <tr style="background:${BRAND.darkGreen};">
        <td colspan="2" style="padding:12px 20px;color:#ffffff;font-weight:bold;font-size:14px;">
          📋 Booking Details
        </td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;width:45%;border-bottom:1px solid #eee;">Booking Reference</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:${BRAND.darkGreen};border-bottom:1px solid #eee;">${data.bookingNumber}</td>
      </tr>
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Package</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.packageName}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Status</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${statusLabel}</td>
      </tr>
      ${data.travelDate ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Travel Date</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${formatDate(data.travelDate)}</td>
      </tr>` : ""}
      ${data.numberOfPilgrims ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">No. of Pilgrims</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.numberOfPilgrims}</td>
      </tr>` : ""}
      ${data.groupName ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Group</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.groupName}</td>
      </tr>` : ""}
      ${data.totalAmount != null ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Total Amount</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:#333;border-bottom:1px solid #eee;">${formatINR(data.totalAmount)}</td>
      </tr>` : ""}
      ${data.paidAmount != null ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Amount Paid</td>
        <td style="padding:10px 20px;font-size:14px;color:#27ae60;font-weight:bold;border-bottom:1px solid #eee;">${formatINR(data.paidAmount)}</td>
      </tr>` : ""}
      ${data.balanceAmount != null ? `
      <tr style="background:#fff8f0;">
        <td style="padding:10px 20px;font-size:13px;color:#555;">Balance Due</td>
        <td style="padding:10px 20px;font-size:14px;color:#e67e22;font-weight:bold;">${formatINR(data.balanceAmount)}</td>
      </tr>` : ""}
    </table>

    <p style="font-size:14px;color:#555;">
      Our team will reach out to you shortly with further details regarding documentation
      and travel arrangements. For any queries, please contact us at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};">${BRAND.phone1}</a>.
    </p>
    <p>JazakAllah Khair 🤲</p>
    <p style="margin-top:24px;">Warm regards,<br><strong>Al Burhan Tours &amp; Travels Team</strong></p>
  `;

  return sendWithRetry({
    from:    `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject: `Booking Confirmed — ${data.bookingNumber} | Al Burhan Tours & Travels`,
    text:    `Dear ${data.customerName},\n\nYour booking ${data.bookingNumber} for ${data.packageName} has been ${data.status || "confirmed"}.\n\nFor queries: ${BRAND.phone1}\n\nAl Burhan Tours & Travels`,
    html:    buildTemplate(`Booking ${statusLabel}`, content, {
               preheader: `Your booking ${data.bookingNumber} for ${data.packageName} is confirmed`,
               ctaText:   "View My Booking",
               ctaUrl:    `${BRAND.website}/customer/dashboard`,
             }),
  });
}

// ── 3. Payment Receipt ────────────────────────────────────────────────────────
/**
 * Sends a payment receipt email to the customer after a payment is recorded.
 *
 * @param to   — Customer email address
 * @param data — Payment and booking details
 */
export async function sendPaymentReceipt(
  to: string,
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

  const content = `
    <p>Dear <strong>${data.customerName}</strong>,</p>
    <p>We have successfully received your payment. Thank you! 🎉</p>

    <!-- Payment Summary Box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:20px 0;background:#f0f9f4;border:1px solid #b2dfca;border-radius:8px;">
      <tr style="background:${BRAND.darkGreen};">
        <td colspan="2" style="padding:12px 20px;color:#ffffff;font-weight:bold;font-size:14px;">
          💳 Payment Receipt
        </td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;width:45%;border-bottom:1px solid #dff0e8;">Booking Reference</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:${BRAND.darkGreen};border-bottom:1px solid #dff0e8;">${data.bookingNumber}</td>
      </tr>
      ${data.packageName ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #dff0e8;">Package</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #dff0e8;">${data.packageName}</td>
      </tr>` : ""}
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #dff0e8;">Amount Paid</td>
        <td style="padding:10px 20px;font-size:18px;font-weight:bold;color:#27ae60;border-bottom:1px solid #dff0e8;">${formatINR(data.paymentAmount)}</td>
      </tr>
      ${data.paymentMethod ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #dff0e8;">Payment Method</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #dff0e8;">${data.paymentMethod}</td>
      </tr>` : ""}
      ${data.paymentDate ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #dff0e8;">Payment Date</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #dff0e8;">${formatDate(data.paymentDate)}</td>
      </tr>` : ""}
      ${data.transactionId ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #dff0e8;">Transaction ID</td>
        <td style="padding:10px 20px;font-size:13px;color:#666;font-family:monospace;border-bottom:1px solid #dff0e8;">${data.transactionId}</td>
      </tr>` : ""}
      ${data.totalAmount != null ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #dff0e8;">Total Package Amount</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:#333;border-bottom:1px solid #dff0e8;">${formatINR(data.totalAmount)}</td>
      </tr>` : ""}
      ${data.paidSoFar != null ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #dff0e8;">Total Paid So Far</td>
        <td style="padding:10px 20px;font-size:14px;color:#27ae60;font-weight:bold;border-bottom:1px solid #dff0e8;">${formatINR(data.paidSoFar)}</td>
      </tr>` : ""}
      ${data.balanceDue != null ? `
      <tr style="background:#fff8f0;">
        <td style="padding:10px 20px;font-size:13px;color:#555;">Balance Remaining</td>
        <td style="padding:10px 20px;font-size:14px;color:#e67e22;font-weight:bold;">${formatINR(data.balanceDue)}</td>
      </tr>` : ""}
    </table>

    <p style="font-size:13px;color:#666;">Please keep this email as your payment confirmation.
      For any discrepancies, contact us at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};">${BRAND.phone1}</a>.
    </p>
    <p>Warm regards,<br><strong>Al Burhan Tours &amp; Travels Team</strong></p>
  `;

  return sendWithRetry({
    from:    `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject: `Payment Received — ${formatINR(data.paymentAmount)} | ${data.bookingNumber}`,
    text:    `Payment of ${formatINR(data.paymentAmount)} received for booking ${data.bookingNumber}. Thank you!\n\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:    buildTemplate("Payment Received — Thank You!", content, {
               preheader: `Payment of ${formatINR(data.paymentAmount)} confirmed for ${data.bookingNumber}`,
             }),
  });
}

// ── 4. Invoice Email ──────────────────────────────────────────────────────────
/**
 * Sends an invoice email, optionally with a PDF invoice as an attachment.
 *
 * @param to          — Customer email address
 * @param data        — Invoice and booking details
 * @param pdfBuffer   — Optional PDF buffer to attach
 */
export async function sendInvoiceEmail(
  to: string,
  data: {
    customerName:  string;
    bookingNumber: string;
    invoiceNumber: string;
    packageName?:  string;
    invoiceDate?:  string | Date;
    dueDate?:      string | Date;
    subtotal?:     number | string;
    discount?:     number | string;
    gstAmount?:    number | string;
    totalAmount:   number | string;
    paidAmount?:   number | string;
    balanceDue?:   number | string;
    invoiceStatus?: string;
  },
  pdfBuffer?: Buffer
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const statusColor = data.invoiceStatus === "paid"    ? "#27ae60"
                    : data.invoiceStatus === "partial"  ? "#e67e22"
                    : "#e74c3c";

  const content = `
    <p>Dear <strong>${data.customerName}</strong>,</p>
    <p>Please find your invoice from <strong>Al Burhan Tours &amp; Travels</strong> for your upcoming journey.</p>
    ${pdfBuffer ? `<p style="color:#555;font-size:13px;">📎 Your invoice PDF is attached to this email.</p>` : ""}

    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:20px 0;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
      <tr style="background:${BRAND.darkGreen};">
        <td colspan="2" style="padding:12px 20px;color:#ffffff;font-weight:bold;font-size:14px;">
          🧾 Invoice Details
        </td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;width:45%;border-bottom:1px solid #eee;">Invoice Number</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:${BRAND.darkGreen};border-bottom:1px solid #eee;">${data.invoiceNumber}</td>
      </tr>
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Booking Reference</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.bookingNumber}</td>
      </tr>
      ${data.packageName ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Package</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.packageName}</td>
      </tr>` : ""}
      ${data.invoiceDate ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Invoice Date</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${formatDate(data.invoiceDate)}</td>
      </tr>` : ""}
      ${data.dueDate ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Due Date</td>
        <td style="padding:10px 20px;font-size:14px;color:#e67e22;border-bottom:1px solid #eee;">${formatDate(data.dueDate)}</td>
      </tr>` : ""}
      ${data.subtotal != null ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Subtotal</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${formatINR(data.subtotal)}</td>
      </tr>` : ""}
      ${data.discount != null && Number(data.discount) > 0 ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Discount</td>
        <td style="padding:10px 20px;font-size:14px;color:#27ae60;border-bottom:1px solid #eee;">− ${formatINR(data.discount)}</td>
      </tr>` : ""}
      ${data.gstAmount != null && Number(data.gstAmount) > 0 ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">GST / TCS</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${formatINR(data.gstAmount)}</td>
      </tr>` : ""}
      <tr style="background:#f0f9f4;">
        <td style="padding:12px 20px;font-size:14px;font-weight:bold;color:#333;border-bottom:1px solid #eee;">Total Amount</td>
        <td style="padding:12px 20px;font-size:18px;font-weight:bold;color:${BRAND.darkGreen};border-bottom:1px solid #eee;">${formatINR(data.totalAmount)}</td>
      </tr>
      ${data.paidAmount != null ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Amount Paid</td>
        <td style="padding:10px 20px;font-size:14px;color:#27ae60;font-weight:bold;border-bottom:1px solid #eee;">${formatINR(data.paidAmount)}</td>
      </tr>` : ""}
      ${data.balanceDue != null ? `
      <tr style="background:#fff8f0;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Balance Due</td>
        <td style="padding:10px 20px;font-size:14px;color:#e67e22;font-weight:bold;border-bottom:1px solid #eee;">${formatINR(data.balanceDue)}</td>
      </tr>` : ""}
      ${data.invoiceStatus ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;">Status</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:${statusColor};">${data.invoiceStatus.toUpperCase()}</td>
      </tr>` : ""}
    </table>

    <p style="font-size:13px;color:#666;">
      For payment queries or discrepancies, please contact us at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};">${BRAND.phone1}</a> or
      <a href="mailto:${BRAND.email}" style="color:${BRAND.darkGreen};">${BRAND.email}</a>.
    </p>
    <p>Warm regards,<br><strong>Al Burhan Tours &amp; Travels Team</strong></p>
  `;

  const attachments: any[] = pdfBuffer
    ? [{ filename: `Invoice-${data.invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  return sendWithRetry({
    from:        `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject:     `Invoice ${data.invoiceNumber} — Al Burhan Tours & Travels`,
    text:        `Invoice ${data.invoiceNumber} for booking ${data.bookingNumber}. Total: ${formatINR(data.totalAmount)}. Balance: ${formatINR(data.balanceDue ?? 0)}.\n\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:        buildTemplate("Your Invoice", content, {
                   preheader: `Invoice ${data.invoiceNumber} — Total ${formatINR(data.totalAmount)}`,
                 }),
    attachments,
  });
}

// ── 5. Flight Ticket Email ────────────────────────────────────────────────────
/**
 * Sends the customer's flight ticket via email with an optional PDF attachment.
 * Called when admin uploads a ticket document for a booking.
 *
 * @param to         — Customer email address
 * @param data       — Ticket and booking details
 * @param pdfBuffer  — Optional ticket PDF buffer to attach
 */
export async function sendTicketEmail(
  to: string,
  data: {
    customerName:  string;
    bookingNumber: string;
    packageName?:  string;
    flightNumber?: string;
    departure?:    string;
    destination?:  string;
    departureDate?: string | Date;
    returnDate?:   string | Date;
    pnr?:          string;
    fileName?:     string;
  },
  pdfBuffer?: Buffer
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const content = `
    <p>Dear <strong>${data.customerName}</strong>,</p>
    <p>Your flight ticket is now ready! Please find the details below.
       ${pdfBuffer ? "Your e-ticket is attached to this email." : ""}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:20px 0;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
      <tr style="background:${BRAND.darkGreen};">
        <td colspan="2" style="padding:12px 20px;color:#ffffff;font-weight:bold;font-size:14px;">
          ✈ Flight Ticket Details
        </td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;width:45%;border-bottom:1px solid #eee;">Booking Reference</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:${BRAND.darkGreen};border-bottom:1px solid #eee;">${data.bookingNumber}</td>
      </tr>
      ${data.packageName ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Package</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.packageName}</td>
      </tr>` : ""}
      ${data.flightNumber ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Flight Number</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;font-weight:bold;border-bottom:1px solid #eee;">${data.flightNumber}</td>
      </tr>` : ""}
      ${data.pnr ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">PNR</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;font-family:monospace;font-weight:bold;border-bottom:1px solid #eee;">${data.pnr}</td>
      </tr>` : ""}
      ${data.departure ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">From</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.departure}</td>
      </tr>` : ""}
      ${data.destination ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">To</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.destination}</td>
      </tr>` : ""}
      ${data.departureDate ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Departure Date</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;font-weight:bold;border-bottom:1px solid #eee;">${formatDate(data.departureDate)}</td>
      </tr>` : ""}
      ${data.returnDate ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;">Return Date</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;">${formatDate(data.returnDate)}</td>
      </tr>` : ""}
    </table>

    <table width="100%" cellpadding="12" cellspacing="0" border="0"
           style="background:#e8f5e9;border-left:4px solid ${BRAND.darkGreen};border-radius:4px;margin:16px 0;">
      <tr>
        <td style="font-size:13px;color:#2d6a4f;">
          💡 <strong>Reminder:</strong> Please carry a printout or digital copy of your e-ticket at the airport.
          Report to the check-in counter at least 3 hours before departure.
        </td>
      </tr>
    </table>

    <p style="font-size:13px;color:#666;">
      For any queries regarding your flight, please contact us at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};">${BRAND.phone1}</a>.
    </p>
    <p>Have a blessed journey! 🕌✈<br><strong>Al Burhan Tours &amp; Travels Team</strong></p>
  `;

  const attachments: any[] = pdfBuffer
    ? [{ filename: data.fileName || `Ticket-${data.bookingNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  return sendWithRetry({
    from:        `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject:     `Your Flight Ticket — ${data.bookingNumber} | Al Burhan Tours & Travels`,
    text:        `Dear ${data.customerName},\n\nYour flight ticket for booking ${data.bookingNumber} is ready.\n${data.flightNumber ? `Flight: ${data.flightNumber}\n` : ""}${data.pnr ? `PNR: ${data.pnr}\n` : ""}${data.departureDate ? `Departure: ${formatDate(data.departureDate)}\n` : ""}\nJazakAllah Khair!\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:        buildTemplate("Your Flight Ticket is Ready ✈", content, {
                   preheader: `Your e-ticket for ${data.bookingNumber} is attached`,
                   ctaText:   "View My Dashboard",
                   ctaUrl:    `${BRAND.website}/customer/dashboard`,
                 }),
    attachments,
  });
}

// ── 6. Visa Email ─────────────────────────────────────────────────────────────
/**
 * Sends the customer's visa document via email with an optional PDF attachment.
 * Called when admin uploads a visa document for a booking.
 *
 * @param to         — Customer email address
 * @param data       — Visa and booking details
 * @param pdfBuffer  — Optional visa document PDF buffer to attach
 */
export async function sendVisaEmail(
  to: string,
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

  const content = `
    <p>Dear <strong>${data.customerName}</strong>,</p>
    <p>Alhamdulillah! Your visa document is ready. Please find the details below.
       ${pdfBuffer ? "Your visa document is attached to this email." : ""}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:20px 0;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
      <tr style="background:${BRAND.darkGreen};">
        <td colspan="2" style="padding:12px 20px;color:#ffffff;font-weight:bold;font-size:14px;">
          🛂 Visa Details
        </td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;width:45%;border-bottom:1px solid #eee;">Pilgrim Name</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:#333;border-bottom:1px solid #eee;">${data.customerName}</td>
      </tr>
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Booking Reference</td>
        <td style="padding:10px 20px;font-size:14px;color:${BRAND.darkGreen};font-weight:bold;border-bottom:1px solid #eee;">${data.bookingNumber}</td>
      </tr>
      ${data.country ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Destination</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.country}</td>
      </tr>` : ""}
      ${data.visaNumber ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Visa Number</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;font-family:monospace;font-weight:bold;border-bottom:1px solid #eee;">${data.visaNumber}</td>
      </tr>` : ""}
      ${data.passportNumber ? `
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Passport Number</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.passportNumber}</td>
      </tr>` : ""}
      ${data.issueDate ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Issue Date</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${formatDate(data.issueDate)}</td>
      </tr>` : ""}
      ${data.expiryDate ? `
      <tr style="background:#fff8e1;">
        <td style="padding:10px 20px;font-size:13px;color:#555;">Expiry Date</td>
        <td style="padding:10px 20px;font-size:14px;color:#e67e22;font-weight:bold;">${formatDate(data.expiryDate)}</td>
      </tr>` : ""}
    </table>

    <table width="100%" cellpadding="12" cellspacing="0" border="0"
           style="background:#fff3cd;border-left:4px solid ${BRAND.gold};border-radius:4px;margin:16px 0;">
      <tr>
        <td style="font-size:13px;color:#856404;">
          ⚠️ <strong>Important:</strong> Please carry the original visa document along with your passport.
          Keep both documents safe throughout your journey.
          Verify that your name and passport number on the visa match exactly.
        </td>
      </tr>
    </table>

    <p style="font-size:13px;color:#666;">
      For any visa-related queries, contact us immediately at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};">${BRAND.phone1}</a>.
    </p>
    <p>May Allah accept your Ibadah! 🤲<br><strong>Al Burhan Tours &amp; Travels Team</strong></p>
  `;

  const attachments: any[] = pdfBuffer
    ? [{ filename: data.fileName || `Visa-${data.bookingNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  return sendWithRetry({
    from:        `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject:     `Your Visa Document — ${data.bookingNumber} | Al Burhan Tours & Travels`,
    text:        `Dear ${data.customerName},\n\nAlhamdulillah! Your visa for booking ${data.bookingNumber} is ready.\n${data.visaNumber ? `Visa No: ${data.visaNumber}\n` : ""}${data.expiryDate ? `Expiry: ${formatDate(data.expiryDate)}\n` : ""}\nJazakAllah Khair!\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:        buildTemplate("Your Visa Document is Ready 🛂", content, {
                   preheader: `Your visa for ${data.bookingNumber} is now available`,
                   ctaText:   "View My Dashboard",
                   ctaUrl:    `${BRAND.website}/customer/dashboard`,
                 }),
    attachments,
  });
}

// ── 7. Password Reset Email ───────────────────────────────────────────────────
/**
 * Sends a password reset / account recovery OTP email.
 * Use this when a customer triggers "Forgot Password" on the login page.
 *
 * @param to   — Customer email address
 * @param name — Customer display name
 * @param otp  — One-time recovery code (6 digits)
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  otp: string
): Promise<EmailResult> {
  if (!to) return { ok: false, error: "No recipient email" };
  const cfg = getSmtpConfig();

  const content = `
    <p>Dear <strong>${name || "Pilgrim"}</strong>,</p>
    <p>We received a request to reset the password for your Al Burhan Tours &amp; Travels account.
       Use the code below to proceed:</p>

    <!-- OTP Box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background:#fff3f3;border:2px dashed #e74c3c;
                      border-radius:10px;padding:20px 48px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#555;letter-spacing:0.5px;">RESET CODE</p>
            <p style="margin:8px 0 0;font-size:40px;font-weight:bold;color:#c0392b;
                      letter-spacing:10px;font-family:monospace;">${otp}</p>
          </div>
        </td>
      </tr>
    </table>

    <p style="color:#555;font-size:14px;">⏱ This code is valid for <strong>10 minutes</strong>.</p>

    <table width="100%" cellpadding="12" cellspacing="0" border="0"
           style="background:#fff0f0;border-left:4px solid #e74c3c;border-radius:4px;margin:16px 0;">
      <tr>
        <td style="font-size:13px;color:#7b2020;">
          🔒 If you did not request a password reset, please ignore this email.
          Your account remains secure. Contact us immediately at
          <a href="tel:${BRAND.phone1}" style="color:#e74c3c;">${BRAND.phone1}</a> if you suspect unauthorised access.
        </td>
      </tr>
    </table>

    <p>Warm regards,<br><strong>Al Burhan Tours &amp; Travels Support Team</strong></p>
  `;

  return sendWithRetry({
    from:    `"${cfg.fromName}" <${cfg.from}>`,
    to,
    subject: "Password Reset Code — Al Burhan Tours & Travels",
    text:    `Your password reset code is: ${otp}\nValid for 10 minutes.\n\nIf you did not request this, please ignore.\n\nAl Burhan Tours & Travels\n${BRAND.phone1}`,
    html:    buildTemplate("Password Reset Request", content, {
               preheader: "Your password reset code is ready — valid 10 minutes",
             }),
  });
}

// ── 8. Generic / Custom Email ─────────────────────────────────────────────────
/**
 * General-purpose email function for any custom notification.
 * Wraps provided HTML content in the branded template automatically.
 *
 * @param to          — Recipient email address
 * @param subject     — Email subject line
 * @param htmlContent — Inner HTML content (will be wrapped in branded template)
 * @param opts        — Optional: title bar text, attachments, CTA
 */
export async function sendGenericEmail(
  to: string,
  subject: string,
  htmlContent: string,
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

  // Strip HTML for plain-text fallback
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

// ── Convenience: Booking Status Update ────────────────────────────────────────
/**
 * Sends a booking status update email (e.g. approved, visa processing, departed).
 * Thin wrapper around sendGenericEmail with a pre-built status template.
 */
export async function sendBookingStatusEmail(
  to: string,
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
    confirmed:           "✅",
    approved:            "✅",
    pending:             "⏳",
    cancelled:           "❌",
    rejected:            "❌",
    visa_processing:     "🛂",
    visa_approved:       "🛂✅",
    payment_received:    "💳",
    payment_pending:     "💰",
    invoice_generated:   "🧾",
    departed:            "✈",
    returned:            "🏠",
  };
  const emoji = statusEmoji[data.newStatus] || "📋";
  const statusLabel = data.newStatus.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const content = `
    <p>Dear <strong>${data.customerName}</strong>,</p>
    <p>There is an update to your booking with <strong>Al Burhan Tours &amp; Travels</strong>.</p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:20px 0;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
      <tr style="background:${BRAND.darkGreen};">
        <td colspan="2" style="padding:12px 20px;color:#ffffff;font-weight:bold;font-size:14px;">
          ${emoji} Booking Update
        </td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 20px;font-size:13px;color:#555;width:45%;border-bottom:1px solid #eee;">Booking Reference</td>
        <td style="padding:10px 20px;font-size:14px;font-weight:bold;color:${BRAND.darkGreen};border-bottom:1px solid #eee;">${data.bookingNumber}</td>
      </tr>
      ${data.packageName ? `
      <tr>
        <td style="padding:10px 20px;font-size:13px;color:#555;border-bottom:1px solid #eee;">Package</td>
        <td style="padding:10px 20px;font-size:14px;color:#333;border-bottom:1px solid #eee;">${data.packageName}</td>
      </tr>` : ""}
      <tr style="background:#f0f9f4;">
        <td style="padding:12px 20px;font-size:13px;color:#555;">New Status</td>
        <td style="padding:12px 20px;font-size:16px;font-weight:bold;color:${BRAND.darkGreen};">${emoji} ${statusLabel}</td>
      </tr>
    </table>

    ${data.message ? `<p style="font-size:14px;color:#555;">${data.message}</p>` : ""}

    <p style="font-size:13px;color:#666;">
      For any queries, contact us at
      <a href="tel:${BRAND.phone1}" style="color:${BRAND.darkGreen};">${BRAND.phone1}</a>.
    </p>
    <p>Warm regards,<br><strong>Al Burhan Tours &amp; Travels Team</strong></p>
  `;

  return sendGenericEmail(
    to,
    `Booking Update: ${statusLabel} — ${data.bookingNumber}`,
    content,
    {
      title:     `Booking Status: ${statusLabel}`,
      preheader: `Your booking ${data.bookingNumber} status is now: ${statusLabel}`,
      ctaText:   "View My Booking",
      ctaUrl:    `${BRAND.website}/customer/dashboard`,
    }
  );
}
