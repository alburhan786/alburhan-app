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
  // ─── Core booking flow ──────────────────────────────────────────────────
  {
    key:         "booking_receive",
    displayName: "Booking Received",
    id:          "407645",
    name:        envName("BOTBEE_BOOKING_RECEIVE_TEMPLATE", "booking_receive"),
    envVar:      "BOTBEE_BOOKING_RECEIVE_TEMPLATE",
    language:    "en",
    eventTypes:  ["new_booking"],
    paramCount:  4,
    description: "Sent when customer submits a new booking",
  },
  {
    key:         "booking_approved",
    displayName: "Booking Approved",
    id:          "407642",
    name:        envName("BOTBEE_BOOKING_APPROVED_TEMPLATE", "booking_approved"),
    envVar:      "BOTBEE_BOOKING_APPROVED_TEMPLATE",
    language:    "en",
    eventTypes:  ["booking_approved"],
    paramCount:  4,
    description: "Sent when admin approves a booking",
  },
  // ─── Payments ───────────────────────────────────────────────────────────
  {
    key:         "payment_received",
    displayName: "Payment Received",
    id:          "407646",
    name:        envName("BOTBEE_PAYMENT_RECEIVED_TEMPLATE", "payment_received"),
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
  // ─── Documents ──────────────────────────────────────────────────────────
  {
    key:         "invoice_ready",
    displayName: "Invoice Ready",
    id:          "",
    name:        envName("BOTBEE_INVOICE_READY_TEMPLATE", "invoice_ready"),
    envVar:      "BOTBEE_INVOICE_READY_TEMPLATE",
    language:    "en",
    eventTypes:  ["invoice_generated", "invoice_ready"],
    paramCount:  4,
    description: "Sent when invoice is generated and available",
  },
  {
    key:         "agreement_ready",
    displayName: "Agreement Ready",
    id:          "",
    name:        envName("BOTBEE_AGREEMENT_READY_TEMPLATE", "agreement_ready"),
    envVar:      "BOTBEE_AGREEMENT_READY_TEMPLATE",
    language:    "en",
    eventTypes:  ["agreement_generated", "agreement_ready"],
    paramCount:  4,
    description: "Sent when hajj agreement is ready for signing",
  },
  {
    key:         "agreement_signed",
    displayName: "Agreement Signed",
    id:          "",
    name:        envName("BOTBEE_AGREEMENT_SIGNED_TEMPLATE", "agreement_signed"),
    envVar:      "BOTBEE_AGREEMENT_SIGNED_TEMPLATE",
    language:    "en",
    eventTypes:  ["agreement_signed"],
    paramCount:  3,
    description: "Sent when customer digitally signs the agreement",
  },
  // ─── Travel logistics ───────────────────────────────────────────────────
  {
    key:         "visa_issued",
    displayName: "Visa Issued",
    id:          "407667",
    name:        envName("BOTBEE_VISA_ISSUED_TEMPLATE", "visa_issued"),
    envVar:      "BOTBEE_VISA_ISSUED_TEMPLATE",
    language:    "en",
    eventTypes:  ["visa_ready", "visa_approved", "visa_issued"],
    paramCount:  4,
    description: "Sent when visa is uploaded / approved",
  },
  {
    key:         "ticket_issued",
    displayName: "Ticket Issued",
    id:          "361654",
    name:        envName("BOTBEE_TICKET_ISSUED_TEMPLATE", "ticket_issued"),
    envVar:      "BOTBEE_TICKET_ISSUED_TEMPLATE",
    language:    "en",
    eventTypes:  ["ticket_issued"],
    paramCount:  5,
    description: "Sent when flight tickets are issued",
  },
  {
    key:         "flight_reminder",
    displayName: "Flight Reminder",
    id:          "",
    name:        envName("BOTBEE_FLIGHT_REMINDER_TEMPLATE", "flight_reminder"),
    envVar:      "BOTBEE_FLIGHT_REMINDER_TEMPLATE",
    language:    "en",
    eventTypes:  ["flight_assigned", "flight_reminder"],
    paramCount:  5,
    description: "Sent after flight is assigned to remind customer",
  },
  {
    key:         "return_flight_reminder",
    displayName: "Return Flight Reminder",
    id:          "",
    name:        envName("BOTBEE_RETURN_FLIGHT_REMINDER_TEMPLATE", "return_flight_reminder"),
    envVar:      "BOTBEE_RETURN_FLIGHT_REMINDER_TEMPLATE",
    language:    "en",
    eventTypes:  ["return_reminder", "return_flight_reminder"],
    paramCount:  4,
    description: "Sent as reminder before return flight",
  },
  // ─── Saudi operations ───────────────────────────────────────────────────
  {
    key:         "room_allocation",
    displayName: "Room Allocation",
    id:          "",
    name:        envName("BOTBEE_ROOM_ALLOCATION_TEMPLATE", "room_allocation"),
    envVar:      "BOTBEE_ROOM_ALLOCATION_TEMPLATE",
    language:    "en",
    eventTypes:  ["room_assigned", "room_allocation"],
    paramCount:  4,
    description: "Sent when hotel room is allocated",
  },
  {
    key:         "group_orientation",
    displayName: "Group Orientation",
    id:          "",
    name:        envName("BOTBEE_GROUP_ORIENTATION_TEMPLATE", "group_orientation"),
    envVar:      "BOTBEE_GROUP_ORIENTATION_TEMPLATE",
    language:    "en",
    eventTypes:  ["group_orientation"],
    paramCount:  3,
    description: "Group orientation / briefing session details",
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
    key:         "welcome_saudi",
    displayName: "Welcome Saudi",
    id:          "",
    name:        envName("BOTBEE_WELCOME_SAUDI_TEMPLATE", "welcome_saudi"),
    envVar:      "BOTBEE_WELCOME_SAUDI_TEMPLATE",
    language:    "en",
    eventTypes:  ["welcome_saudi"],
    paramCount:  3,
    description: "Sent on arrival in Saudi Arabia",
  },
  {
    key:         "arrival_india",
    displayName: "Arrival India",
    id:          "",
    name:        envName("BOTBEE_ARRIVAL_INDIA_TEMPLATE", "arrival_india"),
    envVar:      "BOTBEE_ARRIVAL_INDIA_TEMPLATE",
    language:    "en",
    eventTypes:  ["arrival_india"],
    paramCount:  2,
    description: "Sent on return / arrival in India",
  },
  // ─── Special ────────────────────────────────────────────────────────────
  {
    key:         "hajj_mubarak",
    displayName: "Hajj Mubarak",
    id:          "",
    name:        envName("BOTBEE_HAJJ_MUBARAK_TEMPLATE", "hajj_mubarak"),
    envVar:      "BOTBEE_HAJJ_MUBARAK_TEMPLATE",
    language:    "en",
    eventTypes:  ["hajj_mubarak"],
    paramCount:  2,
    description: "Congratulatory message after Hajj completion",
  },
  {
    key:         "hajj_package_launch",
    displayName: "Hajj Package Launch",
    id:          "",
    name:        envName("BOTBEE_HAJJ_PACKAGE_LAUNCH_TEMPLATE", "hajj_package_launch"),
    envVar:      "BOTBEE_HAJJ_PACKAGE_LAUNCH_TEMPLATE",
    language:    "en",
    eventTypes:  ["hajj_package_launch"],
    paramCount:  3,
    description: "Broadcast when a new Hajj package is launched",
  },
];

export function getTemplate(key: string): TemplateConfig | undefined {
  return TEMPLATE_CONFIGS.find(t => t.key === key);
}

export function getTemplateName(key: string): string {
  return getTemplate(key)?.name ?? key;
}
