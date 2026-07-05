import { pool } from "@workspace/db";
import {
  sendWhatsApp,
  sendDLTSMS,
  sendRCS,
  sendEmail,
} from "./notifications.js";

export type EventType =
  | "new_booking" | "booking_approved" | "booking_cancelled"
  | "payment_received" | "payment_due" | "invoice_generated"
  | "receipt_generated" | "visa_ready" | "flight_assigned"
  | "hotel_assigned" | "room_assigned" | "bus_assigned"
  | "passport_expiry" | "departure_reminder" | "arrival_reminder"
  | "return_reminder" | "feedback_request";

export type Channel = "whatsapp" | "sms" | "rcs" | "email" | "push";

export interface NotificationContext {
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  customerId?: string;
  bookingId?: string;
  bookingNumber?: string;
  packageName?: string;
  amount?: number;
  paidAmount?: number;
  balanceAmount?: number;
  invoiceNumber?: string;
  flightNumber?: string;
  hotelName?: string;
  roomNumber?: string;
  busNumber?: string;
  departureDate?: string;
  returnDate?: string;
  visaStatus?: string;
  [key: string]: unknown;
}

const EVENT_LABELS: Record<EventType, string> = {
  new_booking: "New Booking",
  booking_approved: "Booking Approved",
  booking_cancelled: "Booking Cancelled",
  payment_received: "Payment Received",
  payment_due: "Payment Due",
  invoice_generated: "Invoice Generated",
  receipt_generated: "Receipt Generated",
  visa_ready: "Visa Ready",
  flight_assigned: "Flight Assigned",
  hotel_assigned: "Hotel Assigned",
  room_assigned: "Room Assigned",
  bus_assigned: "Bus Assigned",
  passport_expiry: "Passport Expiry",
  departure_reminder: "Departure Reminder",
  arrival_reminder: "Arrival Reminder",
  return_reminder: "Return Reminder",
  feedback_request: "Feedback Request",
};

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

function buildDefaultMessage(eventType: EventType, ctx: NotificationContext): string {
  const name = ctx.customerName;
  const booking = ctx.bookingNumber ? `#${ctx.bookingNumber}` : "";
  const pkg = ctx.packageName || "your package";
  const invUrl = ctx.bookingNumber
    ? `https://alburhantravels.com/invoice/${ctx.bookingNumber}`
    : "https://alburhantravels.com";

  switch (eventType) {
    case "new_booking":
      return `Assalamu Alaikum ${name},\n\nYour booking ${booking} for ${pkg} has been received. Our team will review and approve it shortly.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590`;
    case "booking_approved":
      return `Assalamu Alaikum ${name},\n\nCongratulations! Your booking ${booking} for ${pkg} has been APPROVED.\n\nPlease complete your payment at:\n${invUrl}\n\nFor queries call: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "booking_cancelled":
      return `Assalamu Alaikum ${name},\n\nYour booking ${booking} has been cancelled. Please contact us for more information.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "payment_received":
      return `Assalamu Alaikum ${name},\n\nPayment of ₹${formatINR(ctx.amount || 0)} received for booking ${booking}.\n\nBalance: ₹${formatINR(ctx.balanceAmount || 0)}\n\nView invoice: ${invUrl}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "payment_due":
      return `Assalamu Alaikum ${name},\n\nReminder: Payment of ₹${formatINR(ctx.balanceAmount || 0)} is due for your booking ${booking} (${pkg}).\n\nPay now: ${invUrl}\n\nQueries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "invoice_generated":
      return `Assalamu Alaikum ${name},\n\nYour invoice ${ctx.invoiceNumber ? `#${ctx.invoiceNumber}` : ""} for booking ${booking} is ready.\n\nView/Download: ${invUrl}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "receipt_generated":
      return `Assalamu Alaikum ${name},\n\nPayment receipt for ₹${formatINR(ctx.amount || 0)} (Booking ${booking}) has been generated.\n\nView receipt: ${invUrl}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "visa_ready":
      return `Assalamu Alaikum ${name},\n\nGreat news! Your visa for booking ${booking} (${pkg}) is ready. Please contact our office to collect your documents.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "flight_assigned":
      return `Assalamu Alaikum ${name},\n\nFlight details for your booking ${booking}:\nFlight: ${ctx.flightNumber || "TBA"}\nDeparture: ${ctx.departureDate || "TBA"}\n\nPlease check-in 3 hours before departure.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "hotel_assigned":
      return `Assalamu Alaikum ${name},\n\nHotel assignment for booking ${booking}:\nHotel: ${ctx.hotelName || "TBA"}\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "room_assigned":
      return `Assalamu Alaikum ${name},\n\nRoom assignment for booking ${booking}:\nHotel: ${ctx.hotelName || "TBA"}\nRoom: ${ctx.roomNumber || "TBA"}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "bus_assigned":
      return `Assalamu Alaikum ${name},\n\nBus assignment for booking ${booking}:\nBus: ${ctx.busNumber || "TBA"}\n\nPlease be at the assembly point 30 mins early.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "passport_expiry":
      return `Assalamu Alaikum ${name},\n\nImportant: Your passport is expiring soon. Please renew it at least 6 months before your travel date.\n\nFor assistance: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "departure_reminder":
      return `Assalamu Alaikum ${name},\n\nReminder: Your departure for ${pkg} is on ${ctx.departureDate || "the scheduled date"}. Please ensure all documents are ready.\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "arrival_reminder":
      return `Assalamu Alaikum ${name},\n\nWelcome! Please confirm your arrival arrangements for ${pkg}. Our team will be there to assist you.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "return_reminder":
      return `Assalamu Alaikum ${name},\n\nReminder: Your return from ${pkg} is scheduled for ${ctx.returnDate || "the scheduled date"}. Please be ready at the assigned meeting point.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "feedback_request":
      return `Assalamu Alaikum ${name},\n\nThank you for choosing Al Burhan Tours & Travels for ${pkg}. We would appreciate your feedback.\n\nShare your experience: https://alburhantravels.com/feedback/${ctx.bookingNumber || ""}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    default:
      return `Assalamu Alaikum ${name},\n\nImportant update regarding your booking ${booking}.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
  }
}

function buildEmailSubject(eventType: EventType, ctx: NotificationContext): string {
  const booking = ctx.bookingNumber ? `#${ctx.bookingNumber}` : "";
  switch (eventType) {
    case "new_booking": return `Booking Confirmation ${booking} – Al Burhan Tours & Travels`;
    case "booking_approved": return `Booking Approved ${booking} – Al Burhan Tours & Travels`;
    case "booking_cancelled": return `Booking Cancellation ${booking} – Al Burhan Tours & Travels`;
    case "payment_received": return `Payment Received – Booking ${booking}`;
    case "payment_due": return `Payment Reminder – Booking ${booking}`;
    case "invoice_generated": return `Invoice Ready – Booking ${booking}`;
    case "visa_ready": return `Visa Ready – Booking ${booking}`;
    case "flight_assigned": return `Flight Details – Booking ${booking}`;
    case "departure_reminder": return `Departure Reminder – ${ctx.packageName || "Your Journey"}`;
    case "feedback_request": return `Share Your Experience – Al Burhan Tours & Travels`;
    default: return `Update from Al Burhan Tours & Travels`;
  }
}

async function makeLogId(): Promise<string> {
  return `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function trackNotification(data: {
  eventType: string;
  channel: Channel;
  recipient: string;
  customerId?: string;
  bookingId?: string;
  message?: string;
  status: "sent" | "failed" | "pending";
  providerResponse?: unknown;
}): Promise<void> {
  try {
    const id = await makeLogId();
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, customer_id, booking_id, channel, recipient, message, status, provider_response, sent_at, retry_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),0)`,
      [
        id, data.eventType, data.customerId || null, data.bookingId || null,
        data.channel, data.recipient, data.message || null, data.status,
        data.providerResponse ? JSON.stringify(data.providerResponse) : null,
      ]
    );
  } catch (err) {
    console.error("[notificationEngine] trackNotification failed:", err);
  }
}

async function getEnabledChannels(eventType: string): Promise<Channel[]> {
  try {
    const res = await pool.query(
      `SELECT channel FROM notification_settings WHERE event_type=$1 AND enabled=true`,
      [eventType]
    );
    return res.rows.map((r: any) => r.channel as Channel);
  } catch {
    return ["whatsapp", "sms"];
  }
}

async function getTemplate(eventType: string, channel: Channel): Promise<string | null> {
  try {
    const res = await pool.query(
      `SELECT t.body FROM notification_templates t
       JOIN notification_settings s ON s.template_id = t.id
       WHERE s.event_type=$1 AND s.channel=$2 AND s.enabled=true
       LIMIT 1`,
      [eventType, channel]
    );
    return res.rows[0]?.body || null;
  } catch {
    return null;
  }
}

function applyTemplate(template: string, ctx: NotificationContext): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = ctx[key];
    return val != null ? String(val) : `{${key}}`;
  });
}

export async function fireNotificationEvent(
  eventType: EventType,
  ctx: NotificationContext
): Promise<void> {
  const channels = await getEnabledChannels(eventType);

  await Promise.allSettled(
    channels.map(async (channel) => {
      const templateBody = await getTemplate(eventType, channel);
      const message = templateBody
        ? applyTemplate(templateBody, ctx)
        : buildDefaultMessage(eventType, ctx);

      let status: "sent" | "failed" = "failed";
      let providerResponse: unknown = null;

      try {
        if (channel === "whatsapp") {
          const ok = await sendWhatsApp(ctx.customerMobile, message);
          status = ok ? "sent" : "failed";
          providerResponse = { ok };
        } else if (channel === "sms") {
          await sendDLTSMS(
            ctx.customerMobile,
            ctx.customerName,
            ctx.bookingNumber || "",
            ctx.invoiceNumber || ""
          );
          status = "sent";
        } else if (channel === "rcs") {
          const ok = await sendRCS(ctx.customerMobile, ctx.customerName, message);
          status = ok ? "sent" : "failed";
          providerResponse = { ok };
        } else if (channel === "email") {
          if (ctx.customerEmail) {
            const subject = buildEmailSubject(eventType, ctx);
            await sendEmail(ctx.customerEmail, subject, message.replace(/\n/g, "<br>"));
            status = "sent";
          } else {
            status = "failed";
            providerResponse = { error: "No email address" };
          }
        } else if (channel === "push") {
          status = "failed";
          providerResponse = { error: "Push not configured" };
        }
      } catch (err: unknown) {
        status = "failed";
        providerResponse = { error: err instanceof Error ? err.message : String(err) };
      }

      await trackNotification({
        eventType,
        channel,
        recipient: channel === "email" ? (ctx.customerEmail || ctx.customerMobile) : ctx.customerMobile,
        customerId: ctx.customerId,
        bookingId: ctx.bookingId,
        message,
        status,
        providerResponse,
      });
    })
  );
}

export async function retryNotification(logId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await pool.query(
      `SELECT * FROM notification_logs WHERE id=$1 LIMIT 1`,
      [logId]
    );
    const log = res.rows[0];
    if (!log) return { success: false, error: "Log not found" };

    const channel = log.channel as Channel;
    const message = log.message || "";
    let status: "sent" | "failed" = "failed";
    let providerResponse: unknown = null;

    if (channel === "whatsapp") {
      const ok = await sendWhatsApp(log.recipient, message);
      status = ok ? "sent" : "failed";
      providerResponse = { ok };
    } else if (channel === "sms") {
      await sendDLTSMS(log.recipient, log.recipient, "", "");
      status = "sent";
    } else if (channel === "rcs") {
      const ok = await sendRCS(log.recipient, log.recipient, message);
      status = ok ? "sent" : "failed";
      providerResponse = { ok };
    } else if (channel === "email") {
      await sendEmail(log.recipient, "Notification", message);
      status = "sent";
    } else {
      return { success: false, error: "Channel not supported for retry" };
    }

    await pool.query(
      `UPDATE notification_logs SET status=$1, provider_response=$2, sent_at=NOW(), retry_count=retry_count+1 WHERE id=$3`,
      [status, JSON.stringify(providerResponse), logId]
    );

    return { success: status === "sent" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const EVENT_TYPES: EventType[] = [
  "new_booking", "booking_approved", "booking_cancelled",
  "payment_received", "payment_due", "invoice_generated",
  "receipt_generated", "visa_ready", "flight_assigned",
  "hotel_assigned", "room_assigned", "bus_assigned",
  "passport_expiry", "departure_reminder", "arrival_reminder",
  "return_reminder", "feedback_request",
];

export const CHANNELS: Channel[] = ["whatsapp", "sms", "rcs", "email", "push"];
export { EVENT_LABELS };
