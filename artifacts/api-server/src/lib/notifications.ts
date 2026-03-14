import axios from "axios";

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_SENDER_ID = "ALBURH";
const FAST2SMS_DLT_TEMPLATE_ID = "164844";

const BOTBEE_API_KEY = process.env.BOTBEE_API_KEY;
const BOTBEE_PHONE_NUMBER_ID = process.env.BOTBEE_PHONE_NUMBER_ID;
const BOTBEE_API_URL = "https://app.botbee.io/api/v1/whatsapp/send";

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
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=dlt&sender_id=${FAST2SMS_SENDER_ID}&message=${FAST2SMS_DLT_TEMPLATE_ID}&variables_values=${otp}|&numbers=${phone}&flash=0`;
    const response = await axios.get(url);
    console.log("[OTP-SMS] Sent to", mobile, response.data);
    return true;
  } catch (err: any) {
    console.error("[OTP-SMS] Error:", err?.response?.data || err.message);
    return false;
  }
}

export async function sendSMS(mobile: string, message: string): Promise<boolean> {
  if (!FAST2SMS_API_KEY) {
    console.log("[SMS] API key not set — message:", message, "for:", mobile);
    return false;
  }
  try {
    const phone = toFast2SMSPhone(mobile);
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "otp",
        variables_values: message,
        flash: 0,
        numbers: phone,
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("[SMS] Sent to", mobile, response.data);
    return true;
  } catch (err: any) {
    console.error("[SMS] Error:", err?.response?.data || err.message);
    return false;
  }
}

export async function sendWhatsApp(mobile: string, message: string): Promise<boolean> {
  if (!BOTBEE_API_KEY || !BOTBEE_PHONE_NUMBER_ID) {
    console.log("[WhatsApp] API not configured, skipping:", mobile, message);
    return false;
  }
  try {
    const phone = toBotBeePhone(mobile);
    const response = await axios.post(
      BOTBEE_API_URL,
      {
        apiToken: BOTBEE_API_KEY,
        phone_number_id: BOTBEE_PHONE_NUMBER_ID,
        message,
        phone_number: phone,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    console.log("[WhatsApp] Sent to", mobile, response.data);
    return true;
  } catch (err: any) {
    console.error("[WhatsApp] Error:", err?.response?.data || err.message);
    return false;
  }
}

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  console.log("[Email] Would send to:", to, "Subject:", subject, "Body:", body.slice(0, 100));
  return true;
}

export async function sendBookingApprovalNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
}) {
  const message = `Assalamu Alaikum ${opts.customerName},\n\nYour booking request #${opts.bookingNumber} with Al Burhan Tours & Travels has been APPROVED.\n\nPlease login to your dashboard and complete payment to confirm your booking.\n\nFor help call us:\n+91 9893225590\n+91 9893989786\n\nJazak Allah Khair!`;
  await Promise.allSettled([
    sendSMS(opts.mobile, message),
    sendWhatsApp(opts.mobile, message),
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
  const message = `Assalamu Alaikum ${opts.customerName},\n\nWe regret to inform you that your booking request #${opts.bookingNumber} with Al Burhan Tours & Travels could not be processed at this time.${reasonText}\n\nPlease contact us for more information:\n+91 9893225590\n+91 9893989786`;
  await Promise.allSettled([
    sendSMS(opts.mobile, message),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Update – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

export async function sendBookingSubmissionNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  packageName: string;
  numberOfPilgrims: number;
}) {
  const customerMsg = `Assalamu Alaikum ${opts.customerName},\n\nYour booking request #${opts.bookingNumber} for "${opts.packageName}" (${opts.numberOfPilgrims} pilgrim${opts.numberOfPilgrims > 1 ? "s" : ""}) has been submitted successfully.\n\nOur team will review and respond shortly. You will receive a notification once approved.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590 | +91 9893989786`;

  const adminMsg = `New Booking Alert!\n\nBooking #${opts.bookingNumber}\nCustomer: ${opts.customerName}\nMobile: ${opts.mobile}\nPackage: ${opts.packageName}\nPilgrims: ${opts.numberOfPilgrims}\n\nPlease review and approve/reject from the admin dashboard.`;

  await Promise.allSettled([
    sendSMS(opts.mobile, customerMsg),
    sendWhatsApp(opts.mobile, customerMsg),
    opts.email ? sendEmail(opts.email, "Booking Submitted – Al Burhan Tours & Travels", customerMsg) : Promise.resolve(),
    sendWhatsApp("9893989786", adminMsg),
    sendWhatsApp("9893225590", adminMsg),
  ]);
}

export async function sendPaymentConfirmationNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  amount: string;
  invoiceNumber: string;
}) {
  const message = `Assalamu Alaikum ${opts.customerName},\n\nYour payment of INR ${opts.amount} for booking #${opts.bookingNumber} has been received.\n\nYour booking is now CONFIRMED!\nInvoice: #${opts.invoiceNumber}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590 | +91 9893989786`;
  await Promise.allSettled([
    sendSMS(opts.mobile, message),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Confirmed – Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}
