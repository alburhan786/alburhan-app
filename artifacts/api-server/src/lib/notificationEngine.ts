import { pool } from "@workspace/db";
import {
  sendWhatsApp,
  sendDLTSMS,
  sendRCS,
  sendEmail,
} from "./notifications.js";

export type EventType =
  // Bookings
  | "new_booking" | "booking_approved" | "booking_cancelled" | "booking_rejected" | "booking_completed"
  // Payments
  | "payment_received" | "payment_due" | "payment_failed" | "balance_reminder"
  // Invoices
  | "invoice_generated" | "receipt_generated" | "invoice_paid" | "invoice_cancelled"
  // Pilgrims & Documents
  | "passport_uploaded" | "passport_expiry" | "visa_approved" | "visa_rejected" | "visa_ready"
  // Flights
  | "flight_assigned" | "flight_changed" | "flight_cancelled"
  // Hotels
  | "hotel_assigned" | "room_assigned" | "room_changed"
  // Transport
  | "bus_assigned" | "seat_changed"
  // Travel
  | "departure_reminder" | "arrival_reminder" | "return_reminder"
  // Attendance & Safety
  | "airport_checkin" | "missing_pilgrim" | "medical_emergency"
  // General
  | "feedback_request";

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
  airline?: string;
  hotelName?: string;
  roomNumber?: string;
  busNumber?: string;
  seatNumber?: string;
  departureDate?: string;
  returnDate?: string;
  visaStatus?: string;
  visaNumber?: string;
  reason?: string;
  severity?: string;
  description?: string;
  groupName?: string;
  [key: string]: unknown;
}

export const EVENT_LABELS: Record<EventType, string> = {
  new_booking: "New Booking",
  booking_approved: "Booking Approved",
  booking_cancelled: "Booking Cancelled",
  booking_rejected: "Booking Rejected",
  booking_completed: "Booking Completed",
  payment_received: "Payment Received",
  payment_due: "Payment Due",
  payment_failed: "Payment Failed",
  balance_reminder: "Balance Reminder",
  invoice_generated: "Invoice Generated",
  receipt_generated: "Receipt Generated",
  invoice_paid: "Invoice Paid",
  invoice_cancelled: "Invoice Cancelled",
  passport_uploaded: "Passport Uploaded",
  passport_expiry: "Passport Expiry",
  visa_approved: "Visa Approved",
  visa_rejected: "Visa Rejected",
  visa_ready: "Visa Ready",
  flight_assigned: "Flight Assigned",
  flight_changed: "Flight Changed",
  flight_cancelled: "Flight Cancelled",
  hotel_assigned: "Hotel Assigned",
  room_assigned: "Room Assigned",
  room_changed: "Room Changed",
  bus_assigned: "Bus Assigned",
  seat_changed: "Seat Changed",
  departure_reminder: "Departure Reminder",
  arrival_reminder: "Arrival Reminder",
  return_reminder: "Return Reminder",
  airport_checkin: "Airport Check-In",
  missing_pilgrim: "Missing Pilgrim Alert",
  medical_emergency: "Medical Emergency",
  feedback_request: "Feedback Request",
};

export const EVENT_GROUPS: Record<string, EventType[]> = {
  "Bookings": ["new_booking","booking_approved","booking_cancelled","booking_rejected","booking_completed"],
  "Payments": ["payment_received","payment_due","payment_failed","balance_reminder"],
  "Invoices": ["invoice_generated","receipt_generated","invoice_paid","invoice_cancelled"],
  "Pilgrims & Documents": ["passport_uploaded","passport_expiry","visa_approved","visa_rejected","visa_ready"],
  "Flights": ["flight_assigned","flight_changed","flight_cancelled"],
  "Hotels": ["hotel_assigned","room_assigned","room_changed"],
  "Transport": ["bus_assigned","seat_changed"],
  "Travel": ["departure_reminder","arrival_reminder","return_reminder"],
  "Attendance & Safety": ["airport_checkin","missing_pilgrim","medical_emergency"],
  "General": ["feedback_request"],
};

export const EVENT_TYPES: EventType[] = Object.values(EVENT_GROUPS).flat();
export const CHANNELS: Channel[] = ["whatsapp", "sms", "rcs", "email", "push"];
export const MAX_RETRY = 3;

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

export function buildDefaultMessage(eventType: EventType, ctx: NotificationContext): string {
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
      return `Assalamu Alaikum ${name},\n\nCongratulations! Your booking ${booking} for ${pkg} has been APPROVED.\n\nPlease complete your payment at:\n${invUrl}\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "booking_cancelled":
    case "booking_rejected":
      return `Assalamu Alaikum ${name},\n\nYour booking ${booking} has been ${eventType === "booking_rejected" ? "rejected" : "cancelled"}${ctx.reason ? `: ${ctx.reason}` : ""}. Please contact us for assistance.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "booking_completed":
      return `Assalamu Alaikum ${name},\n\nAlhamdulillah! Your journey ${booking} (${pkg}) is complete. May Allah accept your Ibadah.\n\nWe hope to serve you again.\nAl Burhan Tours & Travels\n+91 9893225590`;
    case "payment_received":
      return `Assalamu Alaikum ${name},\n\nPayment of ₹${formatINR(ctx.amount || 0)} received for booking ${booking}.\n\nBalance: ₹${formatINR(ctx.balanceAmount || 0)}\n\nView invoice: ${invUrl}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "payment_due":
    case "balance_reminder":
      return `Assalamu Alaikum ${name},\n\nReminder: Outstanding balance of ₹${formatINR(ctx.balanceAmount || 0)} is due for your booking ${booking} (${pkg}).\n\nPay now: ${invUrl}\n\nQueries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "payment_failed":
      return `Assalamu Alaikum ${name},\n\nYour payment for booking ${booking} could not be processed. Please try again or contact us.\n\nRetry: ${invUrl}\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "invoice_generated":
      return `Assalamu Alaikum ${name},\n\nYour invoice ${ctx.invoiceNumber ? `#${ctx.invoiceNumber}` : ""} for booking ${booking} is ready.\n\nView/Download: ${invUrl}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "receipt_generated":
      return `Assalamu Alaikum ${name},\n\nPayment receipt for ₹${formatINR(ctx.amount || 0)} (Booking ${booking}) is ready.\n\nView: ${invUrl}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "invoice_paid":
      return `Assalamu Alaikum ${name},\n\nYour invoice for booking ${booking} has been marked as PAID. JazakAllah for your trust!\n\nAl Burhan Tours & Travels\n+91 9893225590`;
    case "invoice_cancelled":
      return `Assalamu Alaikum ${name},\n\nThe invoice for booking ${booking} has been cancelled. Please contact us if this is incorrect.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "passport_uploaded":
      return `Assalamu Alaikum ${name},\n\nYour passport document has been uploaded for booking ${booking}. Our team will verify it shortly.\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "passport_expiry":
      return `Assalamu Alaikum ${name},\n\nIMPORTANT: Your passport is expiring soon. Please renew it at least 6 months before travel.\n\nFor assistance: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "visa_approved":
    case "visa_ready":
      return `Assalamu Alaikum ${name},\n\nAlhamdulillah! Your visa for booking ${booking} (${pkg}) is APPROVED${ctx.visaNumber ? ` — Visa No: ${ctx.visaNumber}` : ""}.\n\nPlease visit our office to collect your documents.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "visa_rejected":
      return `Assalamu Alaikum ${name},\n\nWe regret to inform that your visa application for booking ${booking} has been rejected${ctx.reason ? `: ${ctx.reason}` : ""}.\n\nPlease contact us immediately.\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "flight_assigned":
      return `Assalamu Alaikum ${name},\n\nFlight details for your booking ${booking}:\nAirline: ${ctx.airline || "TBA"}\nFlight: ${ctx.flightNumber || "TBA"}\nDeparture: ${ctx.departureDate || "TBA"}\n\nPlease check-in 3 hours before departure.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "flight_changed":
      return `Assalamu Alaikum ${name},\n\nYour flight details for booking ${booking} have been UPDATED.\nFlight: ${ctx.flightNumber || "TBA"}\nDeparture: ${ctx.departureDate || "TBA"}\n\nPlease note the new details.\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "flight_cancelled":
      return `Assalamu Alaikum ${name},\n\nYour flight for booking ${booking} has been cancelled. Our team will arrange an alternative.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "hotel_assigned":
      return `Assalamu Alaikum ${name},\n\nHotel details for your booking ${booking}:\nHotel: ${ctx.hotelName || "TBA"}\n${ctx.groupName ? `Group: ${ctx.groupName}` : ""}\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "room_assigned":
      return `Assalamu Alaikum ${name},\n\nRoom assignment for your stay:\nHotel: ${ctx.hotelName || "TBA"}\nRoom: ${ctx.roomNumber || "TBA"}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "room_changed":
      return `Assalamu Alaikum ${name},\n\nYour room has been changed:\nHotel: ${ctx.hotelName || "TBA"}\nNew Room: ${ctx.roomNumber || "TBA"}\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "bus_assigned":
      return `Assalamu Alaikum ${name},\n\nTransport details for your journey:\nBus: ${ctx.busNumber || "TBA"}${ctx.seatNumber ? `\nSeat: ${ctx.seatNumber}` : ""}\n\nPlease be at the assembly point 30 mins early.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "seat_changed":
      return `Assalamu Alaikum ${name},\n\nYour bus seat has been changed.\nBus: ${ctx.busNumber || "TBA"}\nNew Seat: ${ctx.seatNumber || "TBA"}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "departure_reminder":
      return `Assalamu Alaikum ${name},\n\nReminder: Your departure for ${pkg} is on ${ctx.departureDate || "the scheduled date"}. Please ensure all documents are ready.\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "arrival_reminder":
      return `Assalamu Alaikum ${name},\n\nWelcome! Your arrival for ${pkg} is approaching. Our team will assist you at the destination.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "return_reminder":
      return `Assalamu Alaikum ${name},\n\nReminder: Your return from ${pkg} is on ${ctx.returnDate || "the scheduled date"}. Please be at the meeting point 2 hours early.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "airport_checkin":
      return `Assalamu Alaikum ${name},\n\nYour airport check-in has been recorded. Have a blessed journey!\n\nAl Burhan Tours & Travels\n+91 9893225590`;
    case "missing_pilgrim":
      return `URGENT: ${name} — We have been unable to locate you. Please contact your group leader or call +91 9893225590 immediately.\n\nAl Burhan Tours & Travels`;
    case "medical_emergency":
      return `Assalamu Alaikum ${name},\n\nA medical case has been recorded${ctx.severity ? ` (${ctx.severity})` : ""}${ctx.description ? `: ${ctx.description}` : ""}. Our team is providing assistance.\n\nEmergency: +91 9893225590\n\nAl Burhan Tours & Travels`;
    case "feedback_request":
      return `Assalamu Alaikum ${name},\n\nJazakAllah for choosing Al Burhan Tours & Travels for ${pkg}! We'd love your feedback.\n\nRate us: https://alburhantravels.com/feedback/${ctx.bookingNumber || ""}\n\nAl Burhan Tours & Travels`;
    default:
      return `Assalamu Alaikum ${name},\n\nImportant update regarding your booking ${booking}.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
  }
}

function buildEmailSubject(eventType: EventType, ctx: NotificationContext): string {
  const booking = ctx.bookingNumber ? `#${ctx.bookingNumber}` : "";
  const map: Partial<Record<EventType, string>> = {
    new_booking: `Booking Confirmation ${booking} – Al Burhan`,
    booking_approved: `Booking Approved ${booking} – Al Burhan`,
    booking_cancelled: `Booking Cancelled ${booking} – Al Burhan`,
    booking_rejected: `Booking Rejected ${booking} – Al Burhan`,
    booking_completed: `Journey Complete ${booking} – Al Burhan`,
    payment_received: `Payment Received – Booking ${booking}`,
    payment_due: `Payment Reminder – Booking ${booking}`,
    payment_failed: `Payment Failed – Booking ${booking}`,
    balance_reminder: `Outstanding Balance – Booking ${booking}`,
    invoice_generated: `Invoice Ready – Booking ${booking}`,
    visa_approved: `Visa Approved – Booking ${booking}`,
    visa_rejected: `Visa Rejected – Booking ${booking}`,
    flight_assigned: `Flight Details – Booking ${booking}`,
    room_assigned: `Room Assignment – Booking ${booking}`,
    bus_assigned: `Transport Details – Booking ${booking}`,
    departure_reminder: `Departure Reminder – ${ctx.packageName || "Your Journey"}`,
    medical_emergency: `Medical Alert – ${ctx.customerName}`,
    feedback_request: `Share Your Experience – Al Burhan`,
  };
  return map[eventType] || `Update from Al Burhan Tours & Travels`;
}

async function makeLogId(): Promise<string> {
  return `nl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function applyTemplate(template: string, ctx: NotificationContext): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = ctx[key];
      return val != null ? String(val) : `{{${key}}}`;
    })
    .replace(/\{(\w+)\}/g, (_, key) => {
      const val = ctx[key];
      return val != null ? String(val) : `{${key}}`;
    });
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
  provider?: string;
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
    if (res.rows.length === 0) return ["whatsapp", "sms"];
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

async function sendOnChannel(channel: Channel, ctx: NotificationContext, message: string): Promise<{ status: "sent" | "failed"; providerResponse: unknown }> {
  try {
    if (channel === "whatsapp") {
      const ok = await sendWhatsApp(ctx.customerMobile, message);
      return { status: ok ? "sent" : "failed", providerResponse: { ok, provider: "BotBee" } };
    } else if (channel === "sms") {
      await sendDLTSMS(ctx.customerMobile, ctx.customerName, ctx.bookingNumber || "", ctx.invoiceNumber || "");
      return { status: "sent", providerResponse: { provider: "Fast2SMS" } };
    } else if (channel === "rcs") {
      const ok = await sendRCS(ctx.customerMobile, ctx.customerName, message);
      return { status: ok ? "sent" : "failed", providerResponse: { ok, provider: "Lemin RCS" } };
    } else if (channel === "email") {
      if (!ctx.customerEmail) return { status: "failed", providerResponse: { error: "No email address" } };
      const subject = buildEmailSubject(ctx as unknown as EventType extends string ? any : never, ctx);
      await sendEmail(ctx.customerEmail, subject, message.replace(/\n/g, "<br>"));
      return { status: "sent", providerResponse: { provider: "SMTP" } };
    } else if (channel === "push") {
      return { status: "failed", providerResponse: { error: "Push not configured — Firebase credentials required" } };
    }
    return { status: "failed", providerResponse: { error: "Unknown channel" } };
  } catch (err: unknown) {
    return { status: "failed", providerResponse: { error: err instanceof Error ? err.message : String(err) } };
  }
}

// Fix email subject — must pass eventType separately
async function sendOnChannelWithType(channel: Channel, eventType: EventType, ctx: NotificationContext, message: string): Promise<{ status: "sent" | "failed"; providerResponse: unknown }> {
  try {
    if (channel === "whatsapp") {
      const ok = await sendWhatsApp(ctx.customerMobile, message);
      return { status: ok ? "sent" : "failed", providerResponse: { ok, provider: "BotBee" } };
    } else if (channel === "sms") {
      await sendDLTSMS(ctx.customerMobile, ctx.customerName, ctx.bookingNumber || "", ctx.invoiceNumber || "");
      return { status: "sent", providerResponse: { provider: "Fast2SMS" } };
    } else if (channel === "rcs") {
      const ok = await sendRCS(ctx.customerMobile, ctx.customerName, message);
      return { status: ok ? "sent" : "failed", providerResponse: { ok, provider: "Lemin RCS" } };
    } else if (channel === "email") {
      if (!ctx.customerEmail) return { status: "failed", providerResponse: { error: "No email address" } };
      await sendEmail(ctx.customerEmail, buildEmailSubject(eventType, ctx), message.replace(/\n/g, "<br>"));
      return { status: "sent", providerResponse: { provider: "SMTP" } };
    } else if (channel === "push") {
      return { status: "failed", providerResponse: { error: "Push not configured" } };
    }
    return { status: "failed", providerResponse: { error: "Unknown channel" } };
  } catch (err: unknown) {
    return { status: "failed", providerResponse: { error: err instanceof Error ? err.message : String(err) } };
  }
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
      const { status, providerResponse } = await sendOnChannelWithType(channel, eventType, ctx, message);
      await trackNotification({
        eventType, channel,
        recipient: channel === "email" ? (ctx.customerEmail || ctx.customerMobile) : ctx.customerMobile,
        customerId: ctx.customerId, bookingId: ctx.bookingId,
        message, status, providerResponse,
      });
    })
  );
}

export async function retryNotification(logId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await pool.query(`SELECT * FROM notification_logs WHERE id=$1 LIMIT 1`, [logId]);
    const log = res.rows[0];
    if (!log) return { success: false, error: "Log not found" };
    if (log.retry_count >= MAX_RETRY) return { success: false, error: `Max retries (${MAX_RETRY}) reached` };

    const channel = log.channel as Channel;
    const message = log.message || "";

    let status: "sent" | "failed" = "failed";
    let providerResponse: unknown = null;

    if (channel === "whatsapp") {
      const ok = await sendWhatsApp(log.recipient, message);
      status = ok ? "sent" : "failed";
      providerResponse = { ok, provider: "BotBee" };
    } else if (channel === "sms") {
      await sendDLTSMS(log.recipient, log.recipient, "", "");
      status = "sent"; providerResponse = { provider: "Fast2SMS" };
    } else if (channel === "rcs") {
      const ok = await sendRCS(log.recipient, log.recipient, message);
      status = ok ? "sent" : "failed"; providerResponse = { ok, provider: "Lemin RCS" };
    } else if (channel === "email") {
      await sendEmail(log.recipient, "Notification from Al Burhan Tours", message.replace(/\n/g, "<br>"));
      status = "sent"; providerResponse = { provider: "SMTP" };
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

// Bulk send — used by Campaign Manager
export async function sendBulkNotification(opts: {
  campaignId: string;
  channel: Channel;
  message: string;
  recipients: Array<{ mobile: string; email?: string; name: string; customerId?: string; bookingId?: string }>;
  eventType?: EventType;
}): Promise<{ sent: number; failed: number; total: number }> {
  let sent = 0; let failed = 0;
  for (const r of opts.recipients) {
    const ctx: NotificationContext = { customerName: r.name, customerMobile: r.mobile, customerEmail: r.email, customerId: r.customerId, bookingId: r.bookingId };
    const { status, providerResponse } = await sendOnChannelWithType(opts.channel, opts.eventType || "feedback_request", ctx, opts.message);
    if (status === "sent") sent++; else failed++;
    await trackNotification({
      eventType: opts.eventType || "feedback_request",
      channel: opts.channel,
      recipient: opts.channel === "email" ? (r.email || r.mobile) : r.mobile,
      customerId: r.customerId, bookingId: r.bookingId,
      message: opts.message, status, providerResponse,
    });
  }
  await pool.query(
    `UPDATE notification_campaigns SET status='sent', sent_count=$1, failed_count=$2, completed_at=NOW() WHERE id=$3`,
    [sent, failed, opts.campaignId]
  ).catch(() => {});
  return { sent, failed, total: opts.recipients.length };
}
