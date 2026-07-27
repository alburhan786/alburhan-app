import { pool } from "@workspace/db";
import {
  sendWhatsApp,
  sendDLTSMS,
  sendRCS,
  sendEmail,
} from "./notifications.js";
import { sendTemplate as sendBotBeeTemplate, is24hWindowError } from "./botbee.js";
import { sendMetaEventTemplate, isMetaWapiConfigured, META_EVENT_TEMPLATE_MAP } from "./metaWapi.js";

export type EventType =
  // Account & Auth
  | "customer_registration" | "email_verification" | "mobile_otp" | "login_alert"
  // Bookings
  | "new_booking" | "booking_approved" | "booking_cancelled" | "booking_rejected" | "booking_completed"
  // Payments
  | "payment_received" | "partial_payment" | "payment_due" | "payment_failed" | "balance_reminder" | "refund"
  | "offline_payment_submitted" | "payment_verified" | "payment_rejected"
  | "balance_reminder_30d" | "balance_reminder_15d" | "balance_reminder_7d" | "balance_reminder_3d" | "balance_overdue"
  // Invoices
  | "invoice_generated" | "invoice_ready" | "receipt_generated" | "invoice_paid" | "invoice_cancelled"
  // Agreements
  | "agreement_ready" | "agreement_signed"
  // Pilgrims & Documents
  | "passport_uploaded" | "passport_received" | "passport_expiry" | "passport_reminder" | "visa_approved" | "visa_rejected" | "visa_ready" | "visa_issued"
  // Flights & Tickets
  | "ticket_issued" | "flight_assigned" | "flight_changed" | "flight_cancelled" | "flight_reminder" | "return_flight_reminder"
  // Hotels & Groups
  | "hotel_assigned" | "room_assigned" | "room_changed" | "room_allocation" | "group_orientation"
  // Transport
  | "bus_assigned" | "seat_changed"
  // Travel & Journey
  | "departure_reminder" | "airport_reporting_reminder" | "arrival_reminder" | "return_reminder" | "ziyarat_schedule"
  | "welcome_saudi" | "arrival_india" | "hajj_mubarak"
  // Attendance & Safety
  | "airport_checkin" | "missing_pilgrim" | "medical_emergency" | "emergency_alert"
  // Content & Promotions
  | "hajj_guide_update" | "hajj_package_launch"
  | "hajj_updates" | "umrah_promotions" | "eid_greeting" | "custom_admin"
  // General
  | "feedback_request"
  // Journey status generic (documents_pending, visa_processing, reached_madinah, etc.)
  | "journey_status_changed";

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
  invoiceUrl?: string;
  invoicePdfUrl?: string;
  finalAmount?: number;
  [key: string]: unknown;
}

export const EVENT_LABELS: Record<EventType, string> = {
  customer_registration: "Customer Registration",
  email_verification: "Email Verification",
  mobile_otp: "Mobile OTP",
  login_alert: "Login Alert",
  offline_payment_submitted: "Offline Payment Submitted",
  payment_verified: "Payment Verified",
  payment_rejected: "Payment Rejected",
  balance_reminder_30d: "Balance Reminder (30 Days)",
  balance_reminder_15d: "Balance Reminder (15 Days)",
  balance_reminder_7d: "Balance Reminder (7 Days)",
  balance_reminder_3d: "Balance Reminder (3 Days)",
  balance_overdue: "Balance Overdue",
  passport_reminder: "Passport Reminder",
  airport_reporting_reminder: "Airport Reporting Reminder",
  ziyarat_schedule: "Ziyarat Schedule",
  hajj_guide_update: "Hajj Guide Update",
  emergency_alert: "Emergency Alert",
  new_booking: "New Booking",
  booking_approved: "Booking Approved",
  booking_cancelled: "Booking Cancelled",
  booking_rejected: "Booking Rejected",
  booking_completed: "Booking Completed",
  payment_received: "Payment Received",
  partial_payment: "Partial Payment",
  payment_due: "Payment Due",
  payment_failed: "Payment Failed",
  balance_reminder: "Balance Reminder",
  refund: "Refund Processed",
  invoice_generated: "Invoice Generated",
  receipt_generated: "Receipt Generated",
  invoice_paid: "Invoice Paid",
  invoice_cancelled: "Invoice Cancelled",
  passport_uploaded: "Passport Uploaded",
  passport_expiry: "Passport Expiry",
  visa_approved: "Visa Approved",
  visa_rejected: "Visa Rejected",
  visa_ready: "Visa Issued",
  ticket_issued: "Ticket Issued",
  flight_assigned: "Flight Assigned",
  flight_changed: "Flight Changed",
  flight_cancelled: "Flight Cancelled",
  hotel_assigned: "Hotel Confirmation",
  room_assigned: "Room Allocation",
  room_changed: "Room Changed",
  bus_assigned: "Bus Assigned",
  seat_changed: "Seat Changed",
  departure_reminder: "Departure Reminder",
  arrival_reminder: "Arrival Welcome",
  return_reminder: "Return Reminder",
  airport_checkin: "Airport Check-In",
  missing_pilgrim: "Missing Pilgrim Alert",
  medical_emergency: "Medical Emergency",
  passport_received: "Passport Received",
  hajj_updates: "Hajj Updates",
  umrah_promotions: "Umrah Promotions",
  eid_greeting: "Eid Greeting",
  custom_admin: "Custom Admin Notification",
  feedback_request: "Feedback Request",
  journey_status_changed: "Journey Status Update",
};

export const EVENT_GROUPS: Record<string, EventType[]> = {
  "Account & Auth": ["customer_registration","email_verification","mobile_otp","login_alert"],
  "Bookings": ["new_booking","booking_approved","booking_cancelled","booking_rejected","booking_completed"],
  "Payments": ["payment_received","partial_payment","payment_due","payment_failed","balance_reminder","refund","offline_payment_submitted","payment_verified","payment_rejected","balance_reminder_30d","balance_reminder_15d","balance_reminder_7d","balance_reminder_3d","balance_overdue"],
  "Invoices": ["invoice_generated","receipt_generated","invoice_paid","invoice_cancelled"],
  "Pilgrims & Documents": ["passport_uploaded","passport_received","passport_expiry","passport_reminder","visa_approved","visa_rejected","visa_ready"],
  "Flights": ["ticket_issued","flight_assigned","flight_changed","flight_cancelled"],
  "Hotels": ["hotel_assigned","room_assigned","room_changed"],
  "Transport": ["bus_assigned","seat_changed"],
  "Travel": ["departure_reminder","airport_reporting_reminder","arrival_reminder","return_reminder","ziyarat_schedule"],
  "Attendance & Safety": ["airport_checkin","missing_pilgrim","medical_emergency","emergency_alert"],
  "Content": ["hajj_guide_update"],
  "Promotions & Campaigns": ["hajj_updates","umrah_promotions","eid_greeting","custom_admin"],
  "General": ["feedback_request", "journey_status_changed"],
};

export const EVENT_TYPES: EventType[] = Object.values(EVENT_GROUPS).flat();
export const CHANNELS: Channel[] = ["whatsapp", "sms", "rcs", "email", "push"];
export const CHANNEL_PRIORITY: Channel[] = ["whatsapp", "sms", "rcs", "email", "push"];
export const MAX_RETRY = 5;

function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

export function buildDefaultMessage(eventType: EventType, ctx: NotificationContext): string {
  const name = ctx.customerName;
  const booking = ctx.bookingNumber ? `#${ctx.bookingNumber}` : "";
  const pkg = ctx.packageName || "your package";
  const invUrl = ctx.bookingNumber
    ? `https://alburhantravels.online/invoice/${ctx.bookingNumber}`
    : "https://alburhantravels.online";

  switch (eventType) {
    case "customer_registration":
      return `Assalamu Alaikum ${name},\n\nWelcome to Al Burhan Tours & Travels! Your account has been created successfully.\n\nStart exploring Hajj & Umrah packages today.\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!`;
    case "email_verification":
      return `Assalamu Alaikum ${name},\n\nPlease verify your email address to complete your registration with Al Burhan Tours & Travels.\n\nJazak Allah Khair!`;
    case "mobile_otp":
      return `Your Al Burhan Tours & Travels OTP is ${ctx.otp || "------"}. Valid for 5 minutes. Do not share this with anyone.`;
    case "login_alert":
      return `Assalamu Alaikum ${name},\n\nA new login was detected on your Al Burhan Tours & Travels account${ctx.description ? ` (${ctx.description})` : ""}.\n\nIf this wasn't you, contact us immediately at +91 9893225590.`;
    case "offline_payment_submitted":
      return `Assalamu Alaikum ${name},\n\nWe've received your offline payment submission of ₹${formatINR(ctx.amount || 0)} for booking ${booking}. Our team will verify it shortly.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "payment_verified":
      return `Assalamu Alaikum ${name},\n\nYour payment of ₹${formatINR(ctx.amount || 0)} for booking ${booking} has been VERIFIED.\n\nBalance: ₹${formatINR(ctx.balanceAmount || 0)}\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "payment_rejected":
      return `Assalamu Alaikum ${name},\n\nYour payment submission for booking ${booking} could not be verified${ctx.reason ? `: ${ctx.reason}` : ""}. Please resubmit or contact us.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "balance_reminder_30d":
    case "balance_reminder_15d":
    case "balance_reminder_7d":
    case "balance_reminder_3d": {
      const days = eventType.match(/(\d+)d/)?.[1] || "";
      return `Assalamu Alaikum ${name},\n\nReminder: Outstanding balance of ₹${formatINR(ctx.balanceAmount || 0)} for booking ${booking} (${pkg}) is due in ${days} days.\n\nPay now: ${invUrl}\n\nQueries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    }
    case "balance_overdue":
      return `Assalamu Alaikum ${name},\n\nURGENT: Your balance of ₹${formatINR(ctx.balanceAmount || 0)} for booking ${booking} is OVERDUE. Please pay immediately to avoid cancellation.\n\nPay now: ${invUrl}\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "passport_reminder":
      return `Assalamu Alaikum ${name},\n\nReminder: Please submit your passport for booking ${booking} at the earliest to avoid delays in visa processing.\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "airport_reporting_reminder":
      return `Assalamu Alaikum ${name},\n\nReminder: Please report at the airport for booking ${booking} (${pkg}) on ${ctx.departureDate || "your scheduled date"}, at least 4 hours before departure.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "ziyarat_schedule":
      return `Assalamu Alaikum ${name},\n\nYour Ziyarat schedule for ${pkg} has been updated${ctx.description ? `:\n${ctx.description}` : "."}. Please check with your group leader for details.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "hajj_guide_update":
      return `Assalamu Alaikum ${name},\n\nAn important update to your Hajj/Umrah guide is available${ctx.description ? `:\n${ctx.description}` : "."}\n\nAl Burhan Tours & Travels\n+91 9893225590`;
    case "emergency_alert":
      return `URGENT ALERT: ${name} — ${ctx.description || "An emergency has been reported."} Please contact your group leader or call +91 9893225590 immediately.\n\nAl Burhan Tours & Travels`;
    case "new_booking":
      return `Assalamu Alaikum ${name},\n\nYour booking ${booking} for ${pkg} has been received. Our team will review and approve it shortly.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590`;
    case "booking_approved":
      return `Assalamu Alaikum ${name},\n\nCongratulations! Your booking ${booking} for ${pkg} has been APPROVED.\n\nPlease complete your payment at:\n${invUrl}\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "booking_cancelled":
    case "booking_rejected":
      return `Assalamu Alaikum ${name},\n\nYour booking ${booking} has been ${eventType === "booking_rejected" ? "rejected" : "cancelled"}${ctx.reason ? `: ${ctx.reason}` : ""}. Please contact us for assistance.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "booking_completed":
      return `Assalamu Alaikum ${name},\n\nAlhamdulillah! Your journey ${booking} (${pkg}) is complete. May Allah accept your Ibadah.\n\nWe hope to serve you again.\nAl Burhan Tours & Travels\n+91 9893225590`;
    case "payment_received": {
      return `Assalamu Alaikum Dear ${name},\n\nYour booking with Al Burhan Tours & Travels has been confirmed.\n\nBooking ID: ${ctx.bookingNumber || "-"}\n\nPackage: ${pkg}\n\nYour Booking Confirmation and Invoice are attached.\n\nThank you for choosing Al Burhan Tours & Travels.\n\nTrusted Excellence in Holy Journeys.`;
    }
    case "partial_payment":
      return `Assalamu Alaikum ${name},\n\n✅ *Partial Payment Received — JazakAllah Khair!*\n\n📋 Booking: ${booking}\n📦 Package: ${pkg}\n\n💰 Amount Paid: ₹${formatINR(ctx.paidAmount || ctx.amount || 0)}\n💳 Balance Due: ₹${formatINR(ctx.balanceAmount || 0)}\n\n📄 View Invoice: ${invUrl}\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "refund":
      return `Assalamu Alaikum ${name},\n\nYour refund of ₹${formatINR(ctx.amount || 0)} for booking ${booking} has been processed.\n\nIt will reflect in your account within 5-7 business days.\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    case "payment_due":
    case "balance_reminder":
      return `Assalamu Alaikum ${name},\n\nYour pending payment of Rs ${formatINR(ctx.balanceAmount || 0)} for your Hajj/Umrah booking is due.\n\nPlease complete your payment to confirm your seat.\n\nFor assistance:\n+91 9893225590\n\nWarm Regards,\nAl Burhan Tours & Travels`;
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
    case "ticket_issued":
      return `Assalamu Alaikum ${name},\n\n✈️ Your flight ticket for booking ${booking} has been issued!\n\nAirline: ${ctx.airline || "TBA"}\nFlight No: ${ctx.flightNumber || "TBA"}\nDeparture: ${ctx.departureDate || "TBA"}\n\nPlease check-in 3 hours before departure.\n\nJazak Allah Khair!\nAl Burhan Tours & Travels\n+91 9893225590`;
    case "visa_approved":
    case "visa_ready":
      return `Assalamu Alaikum ${name},\n\nAlhamdulillah! 🕌 Your Visa for booking ${booking} (${pkg}) has been ISSUED${ctx.visaNumber ? `.\nVisa No: ${ctx.visaNumber}` : ""}.\n\nPlease visit our office to collect your documents.\n\nPhone: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
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
    case "departure_reminder": {
      const depAirport = (ctx as any).departureAirport || ctx.departureAirport || "TBA";
      const arrAirport = (ctx as any).arrivalAirport || ctx.arrivalAirport || "TBA";
      const terminal   = (ctx as any).terminal || ctx.terminal || "TBA";
      const depTime    = (ctx as any).departureTime || ctx.departureTime || "";
      const repTime    = (ctx as any).reportingTime || (depTime ? `${depTime} (4 hours before departure)` : "4 hours before departure");
      return `Assalamu Alaikum ${name},\n\nThis is a reminder that your Hajj/Umrah flight is scheduled on ${ctx.departureDate || "the scheduled date"}.\n\nFlight Number: ${ctx.flightNumber || "TBA"}\nDeparture: ${depAirport}\nArrival: ${arrAirport}\nReporting Time: ${repTime}\nTerminal: ${terminal}\n\nPlease report at the airport at least 4 hours before departure.\n\nMay Allah accept your journey.\n\nAl Burhan Tours & Travels\n+91 9893225590`;
    }
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
      return `Assalamu Alaikum ${name},\n\nJazakAllah for choosing Al Burhan Tours & Travels for ${pkg}! We'd love your feedback.\n\nRate us: https://alburhantravels.online/feedback/${ctx.bookingNumber || ""}\n\nAl Burhan Tours & Travels`;
    case "journey_status_changed": {
      const statusLabels: Record<string, string> = {
        documents_pending:  "Documents Required — Please submit your passport and required documents.",
        documents_received: "Documents Received — We have received your documents. Thank you.",
        admin_verification: "Under Verification — Your documents are being verified by our team.",
        visa_processing:    "Visa Processing — Your visa application is being processed.",
        journey_started:    "Journey Started — Your sacred journey has begun. May Allah bless you.",
        reached_madinah:    "Reached Madinah — Alhamdulillah! You have reached Madinah Al-Munawwarah. May Allah grant you the honour of Salawat at Masjid Al-Nabawi.",
      };
      const journeyStatus = (ctx as any).journeyStatus || "";
      const statusMsg = statusLabels[journeyStatus] || `Status updated to: ${journeyStatus.replace(/_/g, " ")}`;
      return `Assalamu Alaikum ${name},\n\n📋 Journey Update — Booking ${booking}\n\n${statusMsg}\n\nFor queries: +91 9893225590\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
    }
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
    payment_received: `Booking Confirmed – Al Burhan Tours & Travels`,
    partial_payment: `Partial Payment Received – Booking ${booking}`,
    payment_due: `Payment Reminder – Booking ${booking}`,
    payment_failed: `Payment Failed – Booking ${booking}`,
    balance_reminder: `Outstanding Balance – Booking ${booking}`,
    refund: `Refund Processed – Booking ${booking}`,
    invoice_generated: `Invoice Ready – Booking ${booking}`,
    visa_approved: `Visa Approved – Booking ${booking}`,
    visa_rejected: `Visa Rejected – Booking ${booking}`,
    visa_ready: `Visa Issued – Booking ${booking}`,
    ticket_issued: `Flight Ticket Issued – Booking ${booking}`,
    flight_assigned: `Flight Details – Booking ${booking}`,
    hotel_assigned: `Hotel Confirmation – Booking ${booking}`,
    room_assigned: `Room Assignment – Booking ${booking}`,
    bus_assigned: `Transport Details – Booking ${booking}`,
    departure_reminder: `Departure Reminder – ${ctx.packageName || "Your Journey"}`,
    arrival_reminder: `Arrival Welcome – ${ctx.packageName || "Your Journey"}`,
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

// ── Category helper for customer inbox ──────────────────────────────────────
function getNotificationCategory(eventType: string): string {
  if (["new_booking","booking_approved","booking_rejected","booking_cancelled","booking_completed"].includes(eventType)) return "booking";
  if (["payment_received","partial_payment","invoice_paid","receipt_generated","balance_overdue","offline_payment_submitted","payment_verified","payment_rejected","refund"].includes(eventType)) return "payment";
  if (["invoice_generated","invoice_ready","invoice_cancelled"].includes(eventType)) return "invoice";
  if (["agreement_ready","agreement_signed"].includes(eventType)) return "agreement";
  if (["visa_issued","visa_approved","visa_rejected","visa_ready"].includes(eventType)) return "visa";
  if (["ticket_issued","flight_assigned","flight_changed","flight_cancelled","flight_reminder","return_flight_reminder","flight_update"].includes(eventType)) return "flight";
  if (["departure_reminder","return_reminder","balance_reminder","balance_reminder_30d","balance_reminder_15d","balance_reminder_7d","balance_reminder_3d","airport_reporting_reminder","passport_reminder","passport_expiry","room_allocation"].includes(eventType)) return "reminder";
  return "general";
}

export async function trackNotification(data: {
  eventType: string;
  channel: Channel;
  recipient: string;
  customerId?: string;
  bookingId?: string;
  customerName?: string;
  bookingNumber?: string;
  message?: string;
  status: "sent" | "failed" | "pending";
  providerResponse?: unknown;
  provider?: string;
}): Promise<void> {
  try {
    const id = await makeLogId();
    const pr = data.providerResponse as any;
    const providerName = data.provider || pr?.provider || null;
    const apiEndpoint = pr?.endpoint || null;
    const httpStatus = pr?.httpStatus || null;
    const requestPayload = pr?.requestPayload ? JSON.stringify(pr.requestPayload) : null;
    const errorCode = pr?.errorCode || null;
    // Extract wamid and template_id from the BotBee response payload
    const innerRp = pr?.responsePayload as Record<string, unknown> | null | undefined;
    const msgArr = Array.isArray(innerRp?.messages) ? (innerRp!.messages as Array<Record<string, unknown>>) : null;
    const wamid = (innerRp?.wa_message_id || innerRp?.msg_id || innerRp?.wamid || msgArr?.[0]?.id || null) as string | null;
    const templateId = (pr?.requestPayload?.template_id?.toString() || pr?.requestPayload?.template_name || null) as string | null;
    if (wamid) console.log(`[trackNotification] ${data.eventType} → wamid=${wamid} template=${templateId}`);
    await pool.query(
      `INSERT INTO notification_logs
       (id, event_type, customer_id, booking_id, customer_name, booking_number,
        channel, recipient, message, status,
        provider_response, provider_name, api_endpoint, http_status, request_payload, error_code,
        wamid, template,
        sent_at, retry_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),0)`,
      [
        id, data.eventType, data.customerId || null, data.bookingId || null,
        data.customerName || null, data.bookingNumber || null,
        data.channel, data.recipient, data.message || null, data.status,
        data.providerResponse ? JSON.stringify(data.providerResponse) : null,
        providerName, apiEndpoint, httpStatus, requestPayload, errorCode,
        wamid, templateId,
      ]
    );
    // ── Enqueue non-WhatsApp failures into the generic retry queue ──────────
    // (WhatsApp already has its own dedicated retry engine in index.ts)
    if (data.status === "failed" && data.channel !== "whatsapp") {
      try {
        await pool.query(
          `INSERT INTO notification_retry_queue
           (id, notification_log_id, event_type, channel, customer_id, booking_id, recipient, message, context, retry_count, status, last_error, next_retry_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'pending',$10, NOW() + INTERVAL '30 seconds')`,
          [
            `nrq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            id, data.eventType, data.channel, data.customerId || null, data.bookingId || null,
            data.recipient, data.message || "", JSON.stringify({ eventType: data.eventType }),
            (data.providerResponse as any)?.errorMessage || "Delivery failed",
          ]
        );
      } catch (enqueueErr) {
        console.error("[notificationEngine] retry queue enqueue failed:", enqueueErr);
      }
    }
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
    // Default: sms + email (rcs removed — 97% failure; whatsapp needs WABA fix via BotBee)
    if (res.rows.length === 0) return ["sms", "email"];
    return res.rows.map((r: any) => r.channel as Channel);
  } catch {
    return ["sms", "email"];
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
      const result = await sendWhatsApp(ctx.customerMobile, message);
      return { status: result.ok ? "sent" : "failed", providerResponse: result };
    } else if (channel === "sms") {
      try {
        await sendDLTSMS(ctx.customerMobile, ctx.customerName, ctx.bookingNumber || "", ctx.invoiceNumber || "");
        return { status: "sent", providerResponse: { ok: true, provider: "Fast2SMS", endpoint: "https://www.fast2sms.com/dev/bulkV2" } };
      } catch (smsErr: any) {
        return { status: "failed", providerResponse: { ok: false, provider: "Fast2SMS", endpoint: "https://www.fast2sms.com/dev/bulkV2", errorMessage: smsErr?.message } };
      }
    } else if (channel === "rcs") {
      const result = await sendRCS(ctx.customerMobile, ctx.customerName, message);
      return { status: result.ok ? "sent" : "failed", providerResponse: result };
    } else if (channel === "email") {
      if (!ctx.customerEmail) return { status: "failed", providerResponse: { ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: "No email address" } };
      const subject = buildEmailSubject(ctx as unknown as EventType extends string ? any : never, ctx);
      const result = await sendEmail(ctx.customerEmail, subject, message.replace(/\n/g, "<br>"));
      return { status: result.ok ? "sent" : "failed", providerResponse: result };
    } else if (channel === "push") {
      let pushCustomerId = ctx.customerId;
      if (!pushCustomerId && (ctx.bookingId || ctx.bookingNumber)) {
        try {
          const bid = ctx.bookingId || ctx.bookingNumber;
          const r = await pool.query(`SELECT customer_id FROM bookings WHERE id=$1 OR booking_number=$1 LIMIT 1`, [bid]);
          if (r.rows[0]?.customer_id) pushCustomerId = r.rows[0].customer_id;
        } catch {}
      }
      if (!pushCustomerId) return { status: "failed", providerResponse: { ok: false, provider: "WebPush", endpoint: "web-push", errorMessage: "No customer ID for push" } };
      try {
        const { sendPushToCustomer } = await import("./webPush.js");
        const pushResult = await sendPushToCustomer(pushCustomerId, { title: "Al Burhan Tours & Travels", body: message.substring(0, 200), url: "https://alburhantravels.online/customer/dashboard" });
        return { status: pushResult.ok ? "sent" : "failed", providerResponse: { ok: pushResult.ok, provider: "WebPush", endpoint: "web-push", sent: pushResult.sent, total: pushResult.total } };
      } catch (pushErr: any) {
        return { status: "failed", providerResponse: { ok: false, provider: "WebPush", endpoint: "web-push", errorMessage: pushErr.message } };
      }
    }
    return { status: "failed", providerResponse: { ok: false, provider: "unknown", endpoint: "", errorMessage: "Unknown channel" } };
  } catch (err: unknown) {
    return { status: "failed", providerResponse: { ok: false, provider: "unknown", endpoint: "", errorMessage: err instanceof Error ? err.message : String(err) } };
  }
}

// ── WhatsApp business-initiated sends must use a pre-approved Meta template.
// Priority path: route each event to its dedicated production-approved BotBee
// template (July 2026 — these replace broken template 333473 "conformation").
// If the BotBee template fails, fall through to wa_templates table lookup,
// then last-resort free-form session message.

// All 17 approved BotBee template event types. Events in this set are tried
// via sendBotBeeEventTemplate() FIRST before falling through to wa_templates or free-form.
const ABT_TEMPLATE_EVENTS = new Set<EventType>([
  // Booking & payment
  "new_booking", "booking_approved",
  "payment_received", "partial_payment", "payment_due", "balance_reminder",
  // Documents
  "invoice_generated", "invoice_ready",
  "agreement_ready", "agreement_signed",
  "visa_approved", "visa_ready", "visa_issued",
  "ticket_issued", "flight_assigned",
  // Travel
  "departure_reminder", "flight_reminder", "return_flight_reminder", "return_reminder",
  // On-ground
  "room_assigned", "room_allocation", "group_orientation",
  "welcome_saudi", "arrival_india", "hajj_mubarak",
  // Promotions
  "hajj_package_launch",
]);

export async function sendBotBeeEventTemplate(
  eventType: EventType,
  ctx: NotificationContext,
  bookingId?: string,
  customerId?: string,
): Promise<BotBeeResult> {
  const {
    sendBookingSubmittedTemplate,
    sendPaymentReceivedTemplate,
    sendPendingPaymentTemplate,
    sendApprovalTemplate,
    sendDepartureReminderTemplate,
    sendVisaIssuedTemplate,
    sendFlightTemplate,
    sendInvoiceReadyTemplate,
    sendAgreementReadyTemplate,
    sendAgreementSignedTemplate,
    sendFlightReminderTemplate,
    sendReturnFlightReminderTemplate,
    sendRoomAllocationTemplate,
    sendGroupOrientationTemplate,
    sendWelcomeSaudiTemplate,
    sendArrivalIndiaTemplate,
    sendHajjMubarakTemplate,
    sendHajjPackageLaunchTemplate,
  } = await import("./botbee.js");

  const siteBase = "https://alburhantravels.online";
  const bookingRef = ctx.bookingNumber || bookingId || "-";
  const invoiceUrl = (ctx.invoiceUrl as string | undefined) ||
    (ctx.bookingNumber ? `${siteBase}/invoice/${ctx.bookingNumber}` : `${siteBase}`);
  const paymentUrl = ctx.bookingNumber
    ? `${siteBase}/pay/${ctx.bookingNumber}` : `${siteBase}`;
  // forceTemplateApi removed — Meta Cloud API (line ~758) is tried FIRST in sendOnChannelWithType.
  // BotBee template API (/whatsapp/send/template) is only reached as a last resort fallback.
  const opts = { eventType, bookingId, customerId, customerName: ctx.customerName, skipFailureLog: true, noInternalLog: true };

  switch (eventType) {
    // ── Booking ───────────────────────────────────────────────────────────────
    case "new_booking":
      return sendBookingSubmittedTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        packageName: ctx.packageName || "Hajj/Umrah Package",
        bookingId: bookingRef,
        invoiceUrl,
      }, opts);

    case "booking_approved":
      return sendApprovalTemplate(ctx.customerMobile, {
        customerName: (ctx.customerName || "").trim() || "Customer",
        packageName: ctx.packageName || "Hajj/Umrah Package",
        bookingId: bookingRef,
        amount: ctx.finalAmount ?? ctx.amount ?? 0,
        invoiceUrl,
      }, opts);

    // ── Payments ──────────────────────────────────────────────────────────────
    case "payment_received":
    case "partial_payment":
      return sendPaymentReceivedTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        packageName: ctx.packageName || "Hajj/Umrah Package",
        bookingId: bookingRef,
        amount: ctx.finalAmount ?? ctx.amount ?? 0,
        invoiceUrl,
      }, opts);

    case "payment_due":
    case "balance_reminder":
      return sendPendingPaymentTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        packageName: ctx.packageName || "Hajj/Umrah Package",
        bookingId: bookingRef,
        paymentUrl,
      }, opts);

    // ── Invoice ───────────────────────────────────────────────────────────────
    case "invoice_generated":
    case "invoice_ready":
      return sendInvoiceReadyTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        packageName: ctx.packageName,
        invoiceNumber: (ctx as any).invoiceNumber,
        amount: ctx.finalAmount ?? ctx.amount ?? 0,
        invoiceUrl,
      }, opts);

    // ── Agreements ────────────────────────────────────────────────────────────
    case "agreement_ready":
      return sendAgreementReadyTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        packageName: ctx.packageName,
        agreementNumber: (ctx as any).agreementNumber || bookingRef,
        agreementUrl: (ctx as any).agreementUrl || invoiceUrl,
      }, opts);

    case "agreement_signed":
      return sendAgreementSignedTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        signedDate: (ctx as any).signedDate || new Date().toLocaleDateString("en-IN"),
      }, opts);

    // ── Visa ──────────────────────────────────────────────────────────────────
    case "visa_ready":
    case "visa_approved":
    case "visa_issued":
      return sendVisaIssuedTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        packageName: ctx.packageName,
        visaNumber: ctx.visaNumber as string | undefined,
        visaUrl: (ctx as any).visaUrl || invoiceUrl,
      }, opts);

    // ── Ticket / Flight ───────────────────────────────────────────────────────
    case "ticket_issued":
      return sendFlightTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        flightNumber: ctx.flightNumber,
        departureDate: ctx.departureDate,
        ticketUrl: (ctx as any).ticketUrl || invoiceUrl,
      }, opts);

    case "flight_assigned":
    case "flight_reminder":
      return sendFlightReminderTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        flightNumber: ctx.flightNumber,
        departureDate: ctx.departureDate,
        departureAirport: (ctx as any).departureAirport,
        reportingTime: (ctx as any).reportingTime,
      }, opts);

    // ── Departure reminder ────────────────────────────────────────────────────
    case "departure_reminder":
      return sendDepartureReminderTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        packageName: ctx.packageName || "Hajj/Umrah Package",
        bookingId: bookingRef,
        flightNumber: ctx.flightNumber,
        departureDate: ctx.departureDate,
        reportingTime: (ctx as any).reportingTime,
        departureAirport: (ctx as any).departureAirport,
        hotelName: ctx.hotelName,
        emergencyContact: (ctx as any).emergencyContact || "+91 9893225590",
      }, opts);

    // ── Return journey ────────────────────────────────────────────────────────
    case "return_flight_reminder":
    case "return_reminder":
      return sendReturnFlightReminderTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        flightNumber: ctx.flightNumber,
        returnDate: ctx.departureDate,
        returnAirport: (ctx as any).returnAirport || (ctx as any).departureAirport,
        reportingTime: (ctx as any).reportingTime,
      }, opts);

    // ── Room / Hotel ──────────────────────────────────────────────────────────
    case "room_assigned":
    case "room_allocation":
      return sendRoomAllocationTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        hotelName: ctx.hotelName,
        roomNumber: ctx.roomNumber,
        checkInDate: (ctx as any).checkInDate,
      }, opts);

    // ── Group ─────────────────────────────────────────────────────────────────
    case "group_orientation":
      return sendGroupOrientationTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        groupName: (ctx as any).groupName,
        orientationDate: (ctx as any).orientationDate,
        orientationTime: (ctx as any).orientationTime,
        location: (ctx as any).location,
      }, opts);

    // ── On-ground ─────────────────────────────────────────────────────────────
    case "welcome_saudi":
      return sendWelcomeSaudiTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        hotelName: ctx.hotelName,
        groupName: (ctx as any).groupName,
      }, opts);

    case "arrival_india":
      return sendArrivalIndiaTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
        flightNumber: ctx.flightNumber,
        arrivalDate: ctx.departureDate,
      }, opts);

    case "hajj_mubarak":
      return sendHajjMubarakTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        bookingId: bookingRef,
      }, opts);

    // ── Promotions ────────────────────────────────────────────────────────────
    case "hajj_package_launch":
      return sendHajjPackageLaunchTemplate(ctx.customerMobile, {
        customerName: ctx.customerName,
        packageName: ctx.packageName,
        launchUrl: (ctx as any).launchUrl || siteBase,
      }, opts);

    // ── Journey status updates (no dedicated WhatsApp template — fall back to text) ─
    case "journey_status_changed":
      return { ok: false, provider: "BotBee", endpoint: "", errorMessage: "No WhatsApp template for journey_status_changed — SMS/email used" };

    default:
      return { ok: false, provider: "BotBee", endpoint: "", errorMessage: `No ABT template for event: ${eventType}` };
  }
}

async function sendWhatsAppForEvent(eventType: EventType, ctx: NotificationContext, message: string, bookingId?: string, customerId?: string): Promise<{ status: "sent" | "failed"; providerResponse: unknown }> {
  console.log(`[notifEngine] sendWhatsAppForEvent: ${eventType} → ${ctx.customerMobile} | isABTTemplate=${ABT_TEMPLATE_EVENTS.has(eventType)}`);
  try {
    // ── Priority 0: Meta WhatsApp Cloud API (primary provider) ───────────────
    // Activated when META_ACCESS_TOKEN is configured in Replit Secrets.
    // Falls back automatically to BotBee when not configured or when the
    // template is not found / not approved in Meta Business Manager.
    if (isMetaWapiConfigured() && META_EVENT_TEMPLATE_MAP[eventType] !== undefined) {
      console.log(`[notifEngine] ${eventType}: trying Meta Cloud API first (primary provider)…`);
      try {
        const metaResult = await sendMetaEventTemplate(eventType, ctx as Record<string, any>, { bookingId, customerId });
        if (metaResult.ok) {
          console.log(`[notifEngine] ✅ Meta Cloud API ok: ${eventType} → ${ctx.customerMobile} | wamid=${metaResult.wamid}`);
          return { status: "sent", providerResponse: metaResult };
        }
        console.warn(`[notifEngine] ⚠️ Meta Cloud API failed: ${eventType} | ${metaResult.errorMessage} — falling back to BotBee`);
      } catch (metaErr: unknown) {
        console.warn(`[notifEngine] ⚠️ Meta Cloud API exception: ${metaErr instanceof Error ? metaErr.message : String(metaErr)} — falling back to BotBee`);
      }
    }

    // ── Priority 1: Production BotBee templates with Meta {{1}}…{{5}} variables ──
    // Templates must be created on BotBee dashboard using {{1}}, {{2}} etc.
    // (NOT #!system-appointment-*!# placeholders which are BotBee-internal).
    // Variable values are sent via the components/body/parameters array.
    if (ABT_TEMPLATE_EVENTS.has(eventType)) {
      console.log(`[notifEngine] ${eventType}: calling sendBotBeeEventTemplate…`);
      const tplResult = await sendBotBeeEventTemplate(eventType, ctx, bookingId, customerId);
      if (tplResult.ok) {
        const wamid = (tplResult.responsePayload as any)?.wa_message_id || "n/a";
        console.log(`[notifEngine] ✅ ABT template OK: ${eventType} → ${ctx.customerMobile} | wamid=${wamid}`);
        return { status: "sent", providerResponse: tplResult };
      }
      console.warn(`[notifEngine] ❌ ABT template FAILED: ${eventType} → ${ctx.customerMobile} | error="${tplResult.errorMessage}" | httpStatus=${(tplResult as any).httpStatus} — falling back`);
    }

    // ── Priority 2: look up wa_templates table for the event ─────────────────
    const tpl = await pool.query(
      `SELECT name, template_id, variables FROM wa_templates WHERE event_type=$1 AND enabled=true AND status IN ('approved','local') ORDER BY is_builtin DESC LIMIT 1`,
      [eventType]
    );
    if (tpl.rows.length > 0) {
      const { name, template_id: tplId, variables } = tpl.rows[0];
      const varNames: string[] = Array.isArray(variables) ? variables : JSON.parse(variables || "[]");
      const varMap: Record<string, unknown> = {
        customer_name:  ctx.customerName,
        booking_id:     ctx.bookingNumber,
        package_name:   ctx.packageName,
        amount:         ctx.amount != null ? formatINR(ctx.amount) : undefined,
        invoice_number: ctx.invoiceNumber,
        ticket_number:  ctx.invoiceNumber,
        flight_number:  ctx.flightNumber,
        departure_date: ctx.departureDate,
        departure_time: (ctx as Record<string, unknown>).departureTime ?? ctx.departureDate,
        visa_number:    ctx.visaNumber,
        hotel_name:     ctx.hotelName,
        room_number:    ctx.roomNumber,
        invoice_url:    (ctx.invoiceUrl as string | undefined) ||
                        (ctx.bookingNumber ? `https://alburhantravels.online/invoice/${ctx.bookingNumber}` : undefined),
      };
      const variableValues = varNames.map((v) => String(varMap[v] ?? "-"));
      const result = await sendBotBeeTemplate(ctx.customerMobile, tplId || name, {
        eventType, bookingId, customerId,
        variables: variableValues.length ? variableValues : undefined,
      });
      if (result.ok) return { status: "sent", providerResponse: result };
      console.warn(`[notificationEngine] wa_template "${name}" failed for ${eventType}:`, result.errorMessage);
      // For ABT template events, do NOT fall back to session messages — template must be approved and configured
      if (ABT_TEMPLATE_EVENTS.has(eventType)) {
        console.warn(`[notificationEngine] ABT template event ${eventType} — skipping session fallback (24h window rejected). Fix: ensure template is approved on BotBee dashboard.`);
        return { status: "failed", providerResponse: { ok: false, provider: "BotBee", errorMessage: `Template "${name}" failed and session fallback skipped for ABT event: ${result.errorMessage}` } };
      }
    }

    // ── Last-resort: free-form session message (only for non-ABT events, inside 24h window) ──
    // ABT events (the 6 mapped templates + others) must always use approved templates.
    // They are blocked here to prevent plain-text sends that Meta silently drops outside 24h.
    if (ABT_TEMPLATE_EVENTS.has(eventType)) {
      console.warn(`[notificationEngine] ABT event ${eventType} reached session fallback — returning failed (no template in wa_templates table either).`);
      return { status: "failed", providerResponse: { ok: false, provider: "BotBee", errorMessage: `No template configured for ${eventType}. Add it to wa_templates or configure BotBee dashboard.` } };
    }
    const result = await sendWhatsApp(ctx.customerMobile, message);
    if (!result.ok && is24hWindowError(result)) {
      console.warn(
        `[notificationEngine] ⚠️ 24h session window detected for non-ABT event "${eventType}" → ${ctx.customerMobile}.` +
        ` Plain-text not delivered. Add this event to ABT_TEMPLATE_EVENTS and map it to an approved template.`
      );
    }
    return { status: result.ok ? "sent" : "failed", providerResponse: result };
  } catch (err: unknown) {
    return { status: "failed", providerResponse: { ok: false, provider: "BotBee", errorMessage: err instanceof Error ? err.message : String(err) } };
  }
}

// Fix email subject — must pass eventType separately
async function sendOnChannelWithType(channel: Channel, eventType: EventType, ctx: NotificationContext, message: string): Promise<{ status: "sent" | "failed"; providerResponse: unknown }> {
  try {
    if (channel === "whatsapp") {
      const waResult = await sendWhatsAppForEvent(eventType, ctx, message, ctx.bookingId, ctx.customerId);

      // After the text message, send any PDF attachments as WhatsApp documents (fire-and-forget)
      const attachments = ctx.attachments as Array<{ filename: string; content: Buffer; contentType?: string }> | undefined;
      if (attachments?.length) {
        (async () => {
          const { sendPDFDocument } = await import("./botbee.js");
          for (const att of attachments) {
            if (att.content instanceof Buffer && (att.contentType === "application/pdf" || (att.filename || "").endsWith(".pdf"))) {
              const caption = `📄 ${att.filename}`;
              await sendPDFDocument(ctx.customerMobile, att.content, att.filename, caption, {
                eventType: eventType + "_pdf",
                bookingId: ctx.bookingId,
                customerId: ctx.customerId,
              }).catch((e: unknown) => console.error("[notificationEngine] WhatsApp PDF send failed:", e));
            }
          }
        })().catch((e: unknown) => console.error("[notificationEngine] WhatsApp PDF batch error:", e));
      }

      return waResult;
    } else if (channel === "sms") {
      try {
        const smsLib = await import("./sms.js");
        const smsCtx = {
          mobile: ctx.customerMobile,
          customerName: ctx.customerName,
          bookingNumber: ctx.bookingNumber || "",
          packageName: ctx.packageName,
          bookingId: ctx.bookingId,
          customerId: ctx.customerId,
        };
        let result: import("./sms.js").SMSResult;
        switch (eventType) {
          case "new_booking": {
            result = await smsLib.sendBookingCreated(smsCtx);
            // No fallback to Quick route — if DLT template missing, SMS is blocked per DLT policy
            break;
          }
          case "booking_approved":
            result = await smsLib.sendBookingConfirmed(smsCtx);
            break;
          case "payment_received":
            result = await smsLib.sendPaymentReceived({
              ...smsCtx,
              amount: ctx.amount != null ? String(Math.round(Number(ctx.amount))) : "0",
              invoiceUrl: (ctx.invoiceUrl as string | undefined) || (ctx.bookingNumber ? `https://alburhantravels.online/invoice/${ctx.bookingNumber}` : undefined),
            });
            break;
          case "partial_payment":
            result = await smsLib.sendPartialPaymentReceived({
              ...smsCtx,
              paidAmount: ctx.paidAmount != null ? String(Math.round(Number(ctx.paidAmount))) : "0",
              balanceAmount: ctx.balanceAmount != null ? String(Math.round(Number(ctx.balanceAmount))) : "0",
              invoiceUrl: (ctx.invoiceUrl as string | undefined) || (ctx.bookingNumber ? `https://alburhantravels.online/invoice/${ctx.bookingNumber}` : undefined),
            });
            break;
          case "balance_reminder":
          case "payment_due":
          case "balance_overdue":
          case "balance_reminder_7d":
          case "balance_reminder_3d":
          case "balance_reminder_30d":
          case "balance_reminder_15d": {
            // Payment reminder — routed through sms.ts DLT validation (uses pending_payment_tid)
            const balStr = ctx.balanceAmount != null ? String(Math.round(Number(ctx.balanceAmount))) : "0";
            result = await smsLib.sendPendingPaymentReminder({ ...smsCtx, balance: balStr });
            break;
          }
          case "visa_approved":
          case "visa_ready":
          case "visa_issued":
            result = await smsLib.sendVisaIssued({ ...smsCtx, visaNumber: (ctx as any).visaNumber });
            break;
          case "ticket_issued":
            result = await smsLib.sendFlightTicketIssued(smsCtx);
            break;
          case "hotel_assigned":
          case "hotel_voucher_issued":
            result = await smsLib.sendHotelVoucherIssued({ ...smsCtx, hotelName: (ctx as any).hotelName });
            break;
          case "flight_assigned":
            result = await smsLib.sendFlightAssigned({
              ...smsCtx,
              flightNumber: (ctx as any).flightNumber || "",
              fromAirport: (ctx as any).fromAirport || "",
              toAirport: (ctx as any).toAirport || "",
              departureDate: (ctx as any).departureDate || ctx.departureDate || "",
              departureTime: (ctx as any).departureTime || "",
            });
            break;
          case "departure_reminder":
          case "departure_reminder_7d":
          case "departure_reminder_3d":
          case "departure_reminder_1d":
            result = await smsLib.sendDepartureReminder({
              ...smsCtx,
              departureDate: (ctx as any).departureDate || ctx.departureDate || "",
              daysRemaining: (ctx as any).daysRemaining,
            });
            break;
          case "arrival_reminder":
            result = await smsLib.sendArrivalReminder({
              ...smsCtx,
              arrivalDate: (ctx as any).arrivalDate,
              destination: (ctx as any).destination,
            });
            break;
          case "invoice_generated":
            result = await smsLib.sendInvoiceCreated({
              ...smsCtx,
              invoiceNumber: ctx.invoiceNumber,
              amount: ctx.amount != null ? String(Math.round(Number(ctx.amount))) : undefined,
            });
            break;
          case "agreement_ready":
            result = await smsLib.sendAgreementReadySMS({
              ...smsCtx,
              agreementNumber: (ctx as any).agreementNumber,
              agreementUrl: (ctx as any).agreementUrl,
            });
            break;
          case "agreement_signed":
            result = await smsLib.sendAgreementSignedSMS({
              ...smsCtx,
              agreementNumber: (ctx as any).agreementNumber,
            });
            break;
          case "room_assigned":
          case "room_allocation":
            result = await smsLib.sendRoomAllocationSMS({
              ...smsCtx,
              hotelName: (ctx as any).hotelName || ctx.hotelName,
              roomNumber: (ctx as any).roomNumber || ctx.roomNumber,
            });
            break;
          default: {
            result = await smsLib.sendCustomSMS({ mobile: ctx.customerMobile, message });
            break;
          }
        }
        return { status: result.ok ? "sent" : "failed", providerResponse: result };
      } catch (smsErr: any) {
        return { status: "failed", providerResponse: { ok: false, provider: "Fast2SMS", endpoint: "https://www.fast2sms.com/dev/bulkV2", errorMessage: smsErr?.message } };
      }
    } else if (channel === "rcs") {
      const result = await sendRCS(ctx.customerMobile, ctx.customerName, message);
      return { status: result.ok ? "sent" : "failed", providerResponse: result };
    } else if (channel === "email") {
      if (!ctx.customerEmail) return { status: "failed", providerResponse: { ok: false, provider: "SMTP", endpoint: "smtp", errorMessage: "No email address" } };
      const attachments = ctx.attachments as import("./notifications.js").EmailAttachment[] | undefined;
      const result = await sendEmail(ctx.customerEmail, buildEmailSubject(eventType, ctx), message.replace(/\n/g, "<br>"), undefined, attachments);
      return { status: result.ok ? "sent" : "failed", providerResponse: result };
    } else if (channel === "push") {
      let pushCustomerId2 = ctx.customerId || customerId;
      if (!pushCustomerId2 && (bookingId || ctx.bookingNumber)) {
        try {
          const bid = bookingId || ctx.bookingNumber;
          const r = await pool.query(`SELECT customer_id FROM bookings WHERE id=$1 OR booking_number=$1 LIMIT 1`, [bid]);
          if (r.rows[0]?.customer_id) pushCustomerId2 = r.rows[0].customer_id;
        } catch {}
      }
      if (!pushCustomerId2) return { status: "failed", providerResponse: { ok: false, provider: "WebPush", endpoint: "web-push", errorMessage: "No customer ID for push" } };
      try {
        const { sendPushToCustomer } = await import("./webPush.js");
        const pushTitle = buildEmailSubject(eventType, ctx) || "Al Burhan Tours & Travels";
        const pushResult = await sendPushToCustomer(pushCustomerId2, { title: pushTitle, body: message.substring(0, 200), url: "https://alburhantravels.online/customer/dashboard" });
        return { status: pushResult.ok ? "sent" : "failed", providerResponse: { ok: pushResult.ok, provider: "WebPush", endpoint: "web-push", sent: pushResult.sent, total: pushResult.total } };
      } catch (pushErr: any) {
        return { status: "failed", providerResponse: { ok: false, provider: "WebPush", endpoint: "web-push", errorMessage: pushErr.message } };
      }
    }
    return { status: "failed", providerResponse: { ok: false, provider: "unknown", endpoint: "", errorMessage: "Unknown channel" } };
  } catch (err: unknown) {
    return { status: "failed", providerResponse: { ok: false, provider: "unknown", endpoint: "", errorMessage: err instanceof Error ? err.message : String(err) } };
  }
}

export async function fireNotificationEvent(
  eventType: EventType,
  ctx: NotificationContext,
  opts: { dedupWindowHours?: number } = {}
): Promise<void> {
  console.log(`[notifEngine] ▶ fireNotificationEvent: ${eventType} | mobile=${ctx.customerMobile} | customer=${ctx.customerName} | booking=${ctx.bookingId || "none"}`);

  // ── IDEMPOTENCY: skip if this exact event+booking was sent recently ─────────
  const dedupWindow = opts.dedupWindowHours ?? defaultDedupWindow(eventType);
  if (dedupWindow > 0 && ctx.bookingId) {
    try {
      const recent = await pool.query(
        `SELECT id FROM notification_logs
         WHERE event_type = $1
           AND booking_id = $2
           AND status     = 'sent'
           AND sent_at    > NOW() - ($3 || ' hours')::interval
         LIMIT 1`,
        [eventType, ctx.bookingId, String(dedupWindow)]
      );
      if (recent.rows.length > 0) {
        console.log(`[notifEngine] ⏭ DEDUP-BLOCKED: ${eventType} already sent within ${dedupWindow}h for booking ${ctx.bookingId} (log=${recent.rows[0].id})`);
        return;
      }
      console.log(`[notifEngine] ✓ Dedup OK: no recent ${eventType} send for booking ${ctx.bookingId} (window=${dedupWindow}h)`);
    } catch (dedupErr: any) {
      console.warn(`[notifEngine] ⚠ dedup check failed (non-fatal):`, dedupErr?.message);
    }
  }

  const enabled = await getEnabledChannels(eventType);
  const orderedChannels = CHANNEL_PRIORITY.filter(c => {
    if (!enabled.includes(c)) return false;
    // Skip email when customer has no email address (prevents "failed" noise in logs)
    if (c === "email" && !ctx.customerEmail) return false;
    // Skip RCS globally — provider is non-functional (0% success); disabled in notification_settings
    if (c === "rcs") return false;
    return true;
  });
  console.log(`[notifEngine] ${eventType}: enabled channels = [${orderedChannels.join(", ")}] (of [${enabled.join(", ")}])`);

  if (orderedChannels.length === 0) {
    console.warn(`[notifEngine] ⚠ ${eventType}: NO channels enabled — notification will not be sent. Check notification_settings table.`);
    return;
  }

  const templateBody = await getTemplate(eventType, orderedChannels[0] ?? "whatsapp");
  const message = templateBody ? applyTemplate(templateBody, ctx) : buildDefaultMessage(eventType, ctx);

  // ── BROADCAST MODE: fire ALL enabled channels in parallel ──────────────────
  console.log(`[notifEngine] ${eventType}: dispatching to ${orderedChannels.length} channel(s)…`);
  const results = await Promise.allSettled(
    orderedChannels.map(channel => sendOnChannelWithType(channel, eventType, ctx, message))
  );

  let successCount = 0;
  for (let i = 0; i < orderedChannels.length; i++) {
    const channel = orderedChannels[i];
    const result = results[i];
    const { status, providerResponse } = result.status === "fulfilled"
      ? result.value
      : { status: "failed" as const, providerResponse: { ok: false, errorMessage: (result.reason as Error)?.message } };

    await trackNotification({
      eventType, channel,
      recipient: channel === "email" ? (ctx.customerEmail || ctx.customerMobile) : ctx.customerMobile,
      customerId: ctx.customerId, bookingId: ctx.bookingId,
      customerName: ctx.customerName, bookingNumber: ctx.bookingNumber,
      message, status, providerResponse,
    });
    if (status === "sent") {
      successCount++;
      console.log(`[notificationEngine] ${eventType} → sent via ${channel}`);
    } else {
      console.warn(`[notificationEngine] ${eventType} → ${channel} FAILED for ${ctx.customerMobile}`);
    }
  }

  if (successCount === 0) {
    console.error(`[notificationEngine] ${eventType} → ALL channels failed for ${ctx.customerMobile}`);
    // Create admin alert so the failure is visible in the dashboard
    await pool.query(
      `INSERT INTO admin_notifications (id, type, title, body, booking_id, is_read, created_at)
       VALUES ($1, 'notification_failure', $2, $3::jsonb, $4, false, NOW())
       ON CONFLICT DO NOTHING`,
      [
        (await import("crypto")).randomUUID(),
        `⚠️ All channels failed: ${eventType}`,
        JSON.stringify({
          customerName: ctx.customerName,
          customerMobile: ctx.customerMobile,
          eventType,
          bookingId: ctx.bookingId ?? null,
          bookingNumber: ctx.bookingNumber ?? null,
          failedChannels: orderedChannels,
          extra: `Tried ${orderedChannels.length} channel(s) — all failed`,
        }),
        ctx.bookingId ?? null,
      ]
    ).catch((e: any) => console.error("[notificationEngine] admin alert insert failed:", e?.message));
  } else {
    console.log(`[notificationEngine] ${eventType} → ${successCount}/${orderedChannels.length} channels succeeded`);
    // ── Populate customer notification inbox ──────────────────────────────────
    if (ctx.customerId) {
      const notifId = `cn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const notifTitle = (EVENT_LABELS as Record<string, string>)[eventType] || eventType.replace(/_/g, " ");
      const notifCategory = getNotificationCategory(eventType);
      pool.query(
        `INSERT INTO customer_notifications (id, customer_id, title, message, type, is_read, category, created_at)
         VALUES ($1,$2,$3,$4,$5,false,$6,NOW()) ON CONFLICT (id) DO NOTHING`,
        [notifId, ctx.customerId, notifTitle, message.substring(0, 500), eventType, notifCategory]
      ).catch((e: any) => console.warn("[notifEngine] customer inbox insert failed (non-fatal):", e?.message));
    }
  }
}

// ── Dedup window per event type (hours) ──────────────────────────────────────
// How long to wait before re-sending the same event for the same booking.
// 0 = no dedup (always fire). Adjust per-event as needed.
function defaultDedupWindow(eventType: EventType): number {
  switch (eventType) {
    // One-shot events — deduplicate aggressively
    case "booking_approved":
    case "visa_approved":
    case "visa_rejected":
    case "ticket_issued":
    case "flight_assigned":
    case "hotel_assigned":
    case "room_assigned":
    case "bus_assigned":
    case "invoice_generated":
    case "booking_completed":
    case "feedback_request":
      return 12; // never fire more than once per 12h for these

    // Reminders — allow re-sending but not too often
    case "departure_reminder":
    case "return_reminder":
    case "balance_reminder":
    case "payment_due":
      return 1; // deduplicate per hour (intraday crons)

    // Payment events are distinct financial events — never dedup by time window,
    // or a second real payment or webhook retry of the same event within the
    // window would be silently skipped. Idempotency for duplicate Razorpay
    // webhook retries is handled upstream via razorpayPaymentId uniqueness checks.
    case "payment_received":
    case "partial_payment":
      return 0;

    // Document reminders — 3-day window per spec
    case "passport_uploaded":
    case "passport_expiry":
      return 72;
    // Journey status — each change is a distinct event, no dedup (admin controls frequency)
    case "journey_status_changed":
      return 0;

    // No dedup for high-urgency or campaign events
    case "medical_emergency":
    case "missing_pilgrim":
    case "emergency_alert":
    case "custom_admin":
    case "hajj_updates":
    case "umrah_promotions":
    case "eid_greeting":
    case "mobile_otp":
    case "login_alert":
      return 0;

    case "balance_reminder_30d":
    case "balance_reminder_15d":
    case "balance_reminder_7d":
    case "balance_reminder_3d":
    case "balance_overdue":
    case "passport_reminder":
    case "airport_reporting_reminder":
      return 20; // once per day-ish for daily cron reminders

    case "customer_registration":
    case "offline_payment_submitted":
    case "payment_verified":
    case "payment_rejected":
      return 1;

    default:
      return 6;
  }
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
      const { sendTemplate: bbSendTemplate, sendText: bbSendText } = await import("./botbee.js");
      const reqPayload = log.request_payload as any;
      const storedTemplateId = reqPayload?.template_id?.toString() || reqPayload?.template_name;
      const storedVars = reqPayload?.variables &&
        typeof reqPayload.variables === "object" &&
        !Array.isArray(reqPayload.variables)
          ? reqPayload.variables as Record<string, string>
          : undefined;
      let result: any;
      if (storedTemplateId) {
        // Template retry: always use BotBee template API + original named vars
        result = await bbSendTemplate(log.recipient, storedTemplateId, {
          eventType: log.event_type,
          forceTemplateApi: true,
          variables: storedVars,
          bookingId: log.booking_id,
          customerId: log.customer_id,
        });
      } else {
        // Plain text retry — falls back to text API (may fail outside 24h)
        result = await bbSendText(log.recipient, message, { eventType: log.event_type });
      }
      status = result.ok ? "sent" : "failed"; providerResponse = result;
    } else if (channel === "sms") {
      const smsLib = await import("./sms.js");
      const smsCtxRetry = {
        mobile: log.recipient,
        customerName: log.customer_name || "Customer",
        bookingNumber: log.booking_number || "",
        bookingId: log.booking_id || undefined,
        customerId: log.customer_id || undefined,
      };
      const et = (log.event_type || "") as string;
      let smsResult: import("./sms.js").SMSResult;
      if (et === "new_booking")                             smsResult = await smsLib.sendBookingCreated(smsCtxRetry);
      else if (et === "booking_approved")                   smsResult = await smsLib.sendBookingConfirmed(smsCtxRetry);
      else if (et === "payment_received")                   smsResult = await smsLib.sendPaymentReceived({ ...smsCtxRetry, amount: "0" });
      else if (et === "partial_payment")                    smsResult = await smsLib.sendPartialPaymentReceived({ ...smsCtxRetry, paidAmount: "0", balanceAmount: "0" });
      else if (["balance_reminder","payment_due","balance_overdue","balance_reminder_7d","balance_reminder_3d","balance_reminder_15d","balance_reminder_30d"].includes(et))
                                                            smsResult = await smsLib.sendPendingPaymentReminder({ ...smsCtxRetry, balance: "0" });
      else if (et === "invoice_generated")                  smsResult = await smsLib.sendInvoiceCreated(smsCtxRetry);
      else if (et === "visa_approved" || et === "visa_ready") smsResult = await smsLib.sendVisaIssued(smsCtxRetry);
      else if (et === "ticket_issued")                      smsResult = await smsLib.sendFlightTicketIssued(smsCtxRetry);
      else if (et === "hotel_assigned")                     smsResult = await smsLib.sendHotelVoucherIssued(smsCtxRetry);
      else if (et === "flight_assigned")                    smsResult = await smsLib.sendFlightAssigned({ ...smsCtxRetry, flightNumber: "", fromAirport: "", toAirport: "", departureDate: "", departureTime: "" });
      else if (et === "departure_reminder")                 smsResult = await smsLib.sendDepartureReminder({ ...smsCtxRetry, departureDate: "" });
      else                                                  smsResult = await smsLib.sendCustomSMS({ mobile: log.recipient, message: log.message || "" });
      status = smsResult.ok ? "sent" : "failed";
      providerResponse = smsResult;
    } else if (channel === "rcs") {
      const result = await sendRCS(log.recipient, log.recipient, message);
      status = result.ok ? "sent" : "failed"; providerResponse = result;
    } else if (channel === "email") {
      const result = await sendEmail(log.recipient, "Notification from Al Burhan Tours", message.replace(/\n/g, "<br>"));
      status = result.ok ? "sent" : "failed"; providerResponse = result;
    } else {
      return { success: false, error: "Channel not supported for retry" };
    }

    const pr = providerResponse as any;
    await pool.query(
      `UPDATE notification_logs
       SET status=$1, provider_response=$2, provider_name=$4, api_endpoint=$5,
           http_status=$6, error_code=$7, sent_at=NOW(), retry_count=retry_count+1
       WHERE id=$3`,
      [status, JSON.stringify(providerResponse), logId,
       pr?.provider || null, pr?.endpoint || null, pr?.httpStatus || null, pr?.errorCode || null]
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
