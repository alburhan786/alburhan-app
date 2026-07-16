// ─────────────────────────────────────────────────────────────────────────────
// Central WhatsApp Template Configuration
// ALL template names read from environment variables — never hardcoded.
// Set the corresponding env var to override any template name at runtime.
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateConfig {
  key:         string;
  displayName: string;
  id:          string;
  name:        string;
  envVar:      string;
  language:    string;
  eventTypes:  string[];
  paramCount:  number;
  description: string;
}

function envName(envVar: string, fallback: string): string {
  const v = (process.env[envVar] || "").trim();
  return v || fallback;
}

export const TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    key:         "booking_submitted",
    displayName: "Booking Submitted",
    id:          "407645",
    name:        envName("BOTBEE_BOOKING_SUBMITTED_TEMPLATE", "bookingsubmitted"),
    envVar:      "BOTBEE_BOOKING_SUBMITTED_TEMPLATE",
    language:    "en",
    eventTypes:  ["new_booking"],
    paramCount:  4,
    description: "Sent when customer submits a new booking",
  },
  {
    key:         "payment_received",
    displayName: "Payment Received",
    id:          "407646",
    name:        envName("BOTBEE_PAYMENT_RECEIVED_TEMPLATE", "paymentreceived"),
    envVar:      "BOTBEE_PAYMENT_RECEIVED_TEMPLATE",
    language:    "en",
    eventTypes:  ["payment_received", "partial_payment"],
    paramCount:  5,
    description: "Sent on full or partial payment",
  },
  {
    key:         "pending_payment",
    displayName: "Payment Reminder",
    id:          "407648",
    name:        envName("BOTBEE_PENDING_PAYMENT_TEMPLATE", "pending_payment_reminder"),
    envVar:      "BOTBEE_PENDING_PAYMENT_TEMPLATE",
    language:    "en",
    eventTypes:  ["payment_due", "balance_reminder"],
    paramCount:  4,
    description: "Sent as payment due / balance reminder",
  },
  {
    key:         "booking_approved",
    displayName: "Booking Approved",
    id:          "407642",
    name:        envName("BOTBEE_BOOKING_APPROVED_TEMPLATE", "approve"),
    envVar:      "BOTBEE_BOOKING_APPROVED_TEMPLATE",
    language:    "en",
    eventTypes:  ["booking_approved"],
    paramCount:  4,
    description: "Sent when admin approves a booking",
  },
  {
    key:         "departure_reminder",
    displayName: "Departure Reminder",
    id:          "407664",
    name:        envName("BOTBEE_DEPARTURE_REMINDER_TEMPLATE", "departure_reminder"),
    envVar:      "BOTBEE_DEPARTURE_REMINDER_TEMPLATE",
    language:    "en",
    eventTypes:  ["departure_reminder"],
    paramCount:  7,
    description: "Sent 7d / 3d / 1d before departure",
  },
  {
    key:         "visa_issued",
    displayName: "Visa Issued",
    id:          "407667",
    name:        envName("BOTBEE_VISA_ISSUED_TEMPLATE", "visa_issued"),
    envVar:      "BOTBEE_VISA_ISSUED_TEMPLATE",
    language:    "en",
    eventTypes:  ["visa_ready", "visa_approved"],
    paramCount:  4,
    description: "Sent when visa is uploaded / approved",
  },
  {
    key:         "flight_issued",
    displayName: "Flight Tickets Issued",
    id:          "361654",
    name:        envName("BOTBEE_FLIGHT_ISSUED_TEMPLATE", "flight"),
    envVar:      "BOTBEE_FLIGHT_ISSUED_TEMPLATE",
    language:    "en",
    eventTypes:  ["ticket_issued", "flight_assigned"],
    paramCount:  5,
    description: "Sent when flight tickets are issued",
  },
];

export function getTemplate(key: string): TemplateConfig | undefined {
  return TEMPLATE_CONFIGS.find(t => t.key === key);
}

export function getTemplateName(key: string): string {
  return getTemplate(key)?.name ?? key;
}
