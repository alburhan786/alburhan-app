import axios from "axios";

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_SENDER_ID = "ALBURH";

const BOTBEE_API_KEY = process.env.BOTBEE_API_KEY;
const BOTBEE_PHONE_NUMBER_ID = process.env.BOTBEE_PHONE_NUMBER_ID;

export async function sendSMS(mobile: string, message: string): Promise<boolean> {
  if (!FAST2SMS_API_KEY) {
    console.log("[SMS] API key not set, skipping:", mobile, message);
    return false;
  }
  try {
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "v3",
        sender_id: FAST2SMS_SENDER_ID,
        message,
        language: "english",
        flash: 0,
        numbers: mobile,
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

export async function sendOtpSMS(mobile: string, otp: string): Promise<boolean> {
  if (!FAST2SMS_API_KEY) {
    console.log("[OTP-SMS] API key not set, OTP is:", otp, "for mobile:", mobile);
    return true;
  }
  try {
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "otp",
        variables_values: otp,
        flash: 0,
        numbers: mobile,
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("[OTP-SMS] Sent to", mobile, response.data);
    return true;
  } catch (err: any) {
    console.error("[OTP-SMS] Error:", err?.response?.data || err.message);
    return false;
  }
}

export async function sendWhatsApp(mobile: string, message: string): Promise<boolean> {
  if (!BOTBEE_API_KEY || !BOTBEE_PHONE_NUMBER_ID) {
    console.log("[WhatsApp] API not configured, skipping:", mobile, message);
    return false;
  }
  try {
    const phone = mobile.startsWith("+") ? mobile : `+91${mobile}`;
    const response = await axios.post(
      `https://api.botbee.ai/v1/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${BOTBEE_API_KEY}`,
          "Content-Type": "application/json",
          "X-Phone-Number-ID": BOTBEE_PHONE_NUMBER_ID,
        },
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
  const message = `Dear ${opts.customerName}, your booking request #${opts.bookingNumber} with Al Burhan Tours & Travels has been APPROVED. Please login to your dashboard and complete payment to confirm your booking. For help, call us at +91-XXXXXXXXXX.`;
  await Promise.allSettled([
    sendSMS(opts.mobile, message),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Approved - Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}

export async function sendBookingRejectionNotification(opts: {
  mobile: string;
  email?: string | null;
  customerName: string;
  bookingNumber: string;
  reason?: string | null;
}) {
  const reasonText = opts.reason ? ` Reason: ${opts.reason}.` : "";
  const message = `Dear ${opts.customerName}, we regret to inform you that your booking request #${opts.bookingNumber} with Al Burhan Tours & Travels has been rejected.${reasonText} Please contact us for more information.`;
  await Promise.allSettled([
    sendSMS(opts.mobile, message),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Update - Al Burhan Tours & Travels", message) : Promise.resolve(),
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
  const message = `Dear ${opts.customerName}, your payment of INR ${opts.amount} for booking #${opts.bookingNumber} has been received. Your booking is now CONFIRMED! Invoice #${opts.invoiceNumber} has been generated. Jazak Allah Khair! - Al Burhan Tours & Travels`;
  await Promise.allSettled([
    sendSMS(opts.mobile, message),
    sendWhatsApp(opts.mobile, message),
    opts.email ? sendEmail(opts.email, "Booking Confirmed - Al Burhan Tours & Travels", message) : Promise.resolve(),
  ]);
}
