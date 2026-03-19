import axios from "axios";
import nodemailer from "nodemailer";

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 1500
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_SENDER_ID = "ALBURH";
const FAST2SMS_OTP_DLT_TEMPLATE_ID = "164844";
const FAST2SMS_NOTIFY_DLT_TEMPLATE_ID = "211277";

const BOTBEE_API_KEY = process.env.BOTBEE_API_KEY;
const BOTBEE_PHONE_NUMBER_ID = process.env.BOTBEE_PHONE_NUMBER_ID;
const BOTBEE_BUSINESS_ID = process.env.BOTBEE_BUSINESS_ID;
const BOTBEE_BASE_URL = "https://app.botbee.io/api/v1/whatsapp";

function toFast2SMSPhone(mobile: string): string {
  const clean = mobile.replace(/\D/g, "");
  if (clean.startsWith("91") && clean.length === 12) return clean.slice(2);
  return clean;
}

function toBotBeePhone(mobile: string): string {
  const clean = mobile.replace(/\D/g, "");
  if (clean.length === 10) return `91${clean}`;
  if (clean.startsWith("+")) return clean.slice(1);
  return clean;
}

export async function sendOtpSMS(mobile: string, otp: string): Promise<boolean> {
  if (!FAST2SMS_API_KEY) {
    console.log("[OTP-SMS] API key not set — OTP:", otp, "for:", mobile);
    return true;
  }
  try {
    const phone = toFast2SMSPhone(mobile);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=dlt&sender_id=${FAST2SMS_SENDER_ID}&message=${FAST2SMS_OTP_DLT_TEMPLATE_ID}&variables_values=${otp}|&numbers=${phone}&flash=0`;
    const response = await withRetry(() => axios.get(url), 3, 1000);
    console.log("[OTP-SMS] Sent to", mobile, response.data);
    return true;
  } catch (err: any) {
    console.error("[OTP-SMS] Error after retries:", err?.response?.data || err.message);
    return false;
  }
}

export async function sendDLTSMS(
  mobile: string,
  var1: string,
  var2: string,
  var3: string
): Promise<boolean> {
  if (!FAST2SMS_API_KEY) {
    console.log("[SMS-DLT] API key not set — vars:", var1, var2, var3, "for:", mobile);
    return false;
  }
  try {
    const phone = toFast2SMSPhone(mobile);
    const variables = encodeURIComponent(`${var1}|${var2}|${var3}|`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=dlt&sender_id=${FAST2SMS_SENDER_ID}&message=${FAST2SMS_NOTIFY_DLT_TEMPLATE_ID}&variables_values=${variables}&numbers=${phone}&flash=0`;
    const response = await withRetry(() => axios.get(url));
    console.log("[SMS-DLT] Sent to", mobile, response.data);
    return true;
  } catch (err: any) {
    const errData = err?.response?.data || err.message;
    console.error("[SMS-DLT] Error after retries for", mobile, ":", JSON.stringify(errData));
    return false;
  }
}

export async function sendWhatsApp(mobile: string, message: string): Promise<boolean> {
  if (!BOTBEE_API_KEY || !BOTBEE_PHONE_NUMBER_ID) {
    console.log("[WhatsApp] API not configured, skipping:", mobile);
    return false;
  }
  try {
    const phone = toBotBeePhone(mobile);
    const response = await withRetry(() =>
      axios.post(
        `${BOTBEE_BASE_URL}/send`,
        {
          apiToken: BOTBEE_API_KEY,
          phone_number_id: BOTBEE_PHONE_NUMBER_ID,
          message,
          phone_number: phone,
        },
        { headers: { "Content-Type": "application/json" } }
      )
    );
    const result = response.data;
    if (result?.status === "0" || result?.status === 0) {
      console.warn("[WhatsApp] Session msg failed for", mobile, ":", result.message, "— trying template fallback");
      return false;
    }
    console.log("[WhatsApp] Session msg sent to", mobile, result);
    return true;
  } catch (err: any) {
    console.error("[WhatsApp] Error after retries for", mobile, ":", err?.response?.data || err.message);
    return false;
  }
}

export async function sendWhatsAppTemplate(
  mobile: string,
  templateName: string,
  components: object[]
): Promise<boolean> {
  if (!BOTBEE_API_KEY || !BOTBEE_PHONE_NUMBER_ID) {
    console.log("[WhatsApp-Template] API not configured, skipping:", mobile);
    return false;
  }
  try {
    const phone = toBotBeePhone(mobile);
    const payload: Record<string, unknown> = {
      apiToken: BOTBEE_API_KEY,
      phone_number_id: BOTBEE_PHONE_NUMBER_ID,
      phone_number: phone,
      template: {
        name: templateName,
        language: { code: "en" },
        components,
      },
    };
    if (BOTBEE_BUSINESS_ID) {
      payload.business_account_id = BOTBEE_BUSINESS_ID;
    }
    const response = await withRetry(() =>
      axios.post(
        `${BOTBEE_BASE_URL}/send-template`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      )
    );
    console.log("[WhatsApp-Template] Sent", templateName, "to", mobile, response.data);
    return true;
  } catch (err: any) {
    console.error("[WhatsApp-Template] Error after retries for", mobile, ":", err?.response?.data || err.message);
    return false;
  }
}

async function sendWhatsAppWithFallback(mobile: string, message: string): Promise<void> {
  const sessionOk = await sendWhatsApp(mobile, message);
  if (!sessionOk) {
    await sendWhatsAppTemplate(mobile, "hello_world", []);
  }
}

function getEmailTransport() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!to) return false;
  const transport = getEmailTransport();
  if (!transport) {
    console.log("[Email] SMTP not configured (set SMTP_USER + SMTP_PASS). Skipping email to:", to);
    return false;
  }
  try {
    const from = process.env.SMTP_USER || "info@alburhantravels.com";
    await withRetry(() =>
      transport!.sendMail({
        from: `Al Burhan Tours & Travels <${from}>`,
        to,
        subject,
        text: body,
        html: body.replace(/\n/g, "<br>"),
      })
    );
    console.log("[Email] Sent to:", to, "Subject:", subject);
    return true;
  } catch (err: any) {
    console.error("[Email] Error after retries to", to, ":", err?.message);
    return false;
  }
}

export async function sendBookingSubmissionNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  packageName: string;
  numberOfPilgrims: number;
}) {
  const customerMsg = `Assalamu Alaikum ${opts.customerName},\n\nYour booking #${opts.bookingNumber} for "${opts.packageName}" (${opts.numberOfPilgrims} pilgrim${opts.numberOfPilgrims > 1 ? "s" : ""}) has been submitted.\n\nOur team will review shortly and notify you once approved.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701`;
  const adminMsg = `New Booking Alert!\n\nBooking #${opts.bookingNumber}\nCustomer: ${opts.customerName}\nMobile: ${opts.mobile}\nPackage: ${opts.packageName}\nPilgrims: ${opts.numberOfPilgrims}\n\nReview from admin dashboard.`;

  await Promise.allSettled([
    sendDLTSMS(opts.mobile, opts.customerName, opts.bookingNumber, "SUBMITTED"),
    sendWhatsAppWithFallback(opts.mobile, customerMsg),
    opts.email ? sendEmail(opts.email, "Booking Submitted – Al Burhan Tours & Travels", customerMsg) : Promise.resolve(),
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("8989701701", adminMsg),
  ]);
}

export async function sendBookingApprovalNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
}) {
  const message = `Assalamu Alaikum ${opts.customerName},\n\nYour booking #${opts.bookingNumber} with Al Burhan Tours & Travels has been APPROVED.\n\nPlease login to complete payment.\n\nHelp: +91 8989701701 / +91 9893989786\n\nJazak Allah Khair!`;
  await Promise.allSettled([
    sendDLTSMS(opts.mobile, opts.customerName, opts.bookingNumber, "APPROVED"),
    sendWhatsAppWithFallback(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Approved – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

export async function sendBookingRejectionNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  reason?: string | null;
}) {
  const reasonText = opts.reason ? `\n\nReason: ${opts.reason}` : "";
  const message = `Assalamu Alaikum ${opts.customerName},\n\nWe regret that your booking #${opts.bookingNumber} could not be processed.${reasonText}\n\nPlease contact us:\n+91 8989701701\n+91 9893989786`;
  await Promise.allSettled([
    sendDLTSMS(opts.mobile, opts.customerName, opts.bookingNumber, "REJECTED"),
    sendWhatsAppWithFallback(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Update – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

export async function sendPaymentConfirmationNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  amount: string;
  invoiceNumber: string;
  invoiceUrl?: string;
}) {
  const invoiceLine = opts.invoiceUrl ? `\n\nInvoice: ${opts.invoiceUrl}` : "";
  const message = `Assalamu Alaikum ${opts.customerName},\n\nPayment of Rs.${opts.amount} received for booking #${opts.bookingNumber}.\n\nYour booking is CONFIRMED!\nInvoice No: ${opts.invoiceNumber}${invoiceLine}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 8989701701`;
  const adminMsg = `Payment Received!\n\nBooking: #${opts.bookingNumber}\nCustomer: ${opts.customerName}\nMobile: ${opts.mobile}\nAmount: Rs.${opts.amount}\nInvoice: ${opts.invoiceNumber}`;

  await Promise.allSettled([
    sendDLTSMS(opts.mobile, opts.customerName, opts.bookingNumber, "CONFIRMED"),
    sendWhatsAppWithFallback(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Confirmed – Al Burhan Tours & Travels", message) : Promise.resolve(),
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("8989701701", adminMsg),
  ]);
}

export async function sendPartialPaymentNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  paidAmount: string;
  remainingAmount: string;
}) {
  const message = `Assalamu Alaikum ${opts.customerName},\n\nPartial payment of Rs.${opts.paidAmount} received for booking #${opts.bookingNumber}.\n\nBalance remaining: Rs.${opts.remainingAmount}\n\nPlease login to pay the remaining amount.\n\nAl Burhan Tours & Travels\n+91 8989701701`;
  await Promise.allSettled([
    sendDLTSMS(opts.mobile, opts.customerName, opts.bookingNumber, "PARTIAL PAYMENT"),
    sendWhatsAppWithFallback(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Partial Payment Received – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}
