import fs from "fs";
import path from "path";
import { pool } from "@workspace/db";
import { objectStorageClient } from "./objectStorage.js";
import { sendPDFDocument, sendText, uploadMedia, sendFile } from "./botbee.js";
import { sendEmail, type EmailAttachment } from "./notifications.js";
import {
  sendFlightTicketIssued as smsSendTicket,
  sendVisaIssued as smsSendVisa,
  sendInvoiceCreated as smsSendInvoiceCreated,
} from "./sms.js";

const UPLOADS_DIR = process.env.UPLOADS_DIR ||
  path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? "uploads" : "../../uploads");

// Human-readable labels with emojis for each document type
export const DOC_TYPE_LABELS: Record<string, string> = {
  flight_ticket:         "Flight Ticket ✈️",
  visa:                  "Visa 🛂",
  room_allotment:        "Room Allotment 🛏️",
  bus_allotment:         "Bus Allotment 🚌",
  hotel_voucher:         "Hotel Voucher 🏨",
  tour_itinerary:        "Tour Itinerary 📋",
  payment_receipt:       "Payment Receipt 🧾",
  ziyarat_schedule:      "Ziyarat Schedule 🕌",
  insurance:             "Insurance Certificate 🛡️",
  hajj_id:               "Hajj ID Card 🪪",
  luggage_tag:           "Luggage Tag 🏷️",
  emergency_contact_card:"Emergency Contact Card 📞",
  vaccination_certificate:"Vaccination Certificate 💉",
  passport_copy:         "Passport Copy 🛂",
  model_contract:        "Travel Contract 📄",
  other:                 "Document 📄",
};

// Admin-only travel docs that should trigger automatic customer delivery
export const TRAVEL_DOC_TYPES = new Set([
  "flight_ticket", "visa", "room_allotment", "bus_allotment", "hotel_voucher",
  "tour_itinerary", "payment_receipt", "ziyarat_schedule", "insurance", "hajj_id",
  "luggage_tag", "emergency_contact_card", "vaccination_certificate", "passport_copy",
  "model_contract", "other",
]);

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function isPdfMime(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

function guessFromExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
    ".gif": "image/gif", ".heic": "image/heic",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] || "application/octet-stream";
}

async function fetchFileBuffer(fileUrl: string, fileName: string, storedMimeType?: string | null): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    if (fileUrl.startsWith("/api/documents/files/")) {
      const filename = path.basename(fileUrl);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (!fs.existsSync(filePath)) { console.warn("[docDelivery] Disk file not found:", filePath); return null; }
      const buffer = fs.readFileSync(filePath);
      const mimeType = storedMimeType || guessFromExtension(filename);
      return { buffer, mimeType };
    }

    if (fileUrl.startsWith("/api/storage/objects/")) {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) { console.warn("[docDelivery] No bucket ID configured"); return null; }
      const tail = fileUrl.replace("/api/storage/objects/", "");
      const gcsKey = `objects/${tail}`;
      const file = objectStorageClient.bucket(bucketId).file(gcsKey);
      const [buffer] = await file.download();
      const [metadata] = await file.getMetadata();
      const mimeType = storedMimeType || (metadata.contentType as string) || guessFromExtension(fileName);
      return { buffer, mimeType };
    }

    console.warn("[docDelivery] Unknown fileUrl scheme:", fileUrl);
    return null;
  } catch (err: any) {
    console.error("[docDelivery] fetchFileBuffer error:", err?.message || err);
    return null;
  }
}

export interface DocDeliveryInput {
  docId: string;
  bookingId: string;
  bookingNumber: string;
  customerId?: string | null;
  customerName: string;
  customerMobile: string;
  customerEmail?: string | null;
  documentType: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  packageName?: string | null;
}

export async function sendDocumentToCustomer(input: DocDeliveryInput): Promise<{ whatsapp: boolean; email: boolean; sms: boolean }> {
  const {
    docId, bookingId, bookingNumber, customerId, customerName,
    customerMobile, customerEmail, documentType, fileName, fileUrl, mimeType,
    packageName,
  } = input;

  const label = DOC_TYPE_LABELS[documentType] || documentType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const siteBase = process.env.SITE_URL || "https://alburhantravels.online";
  const dashboardUrl = `${siteBase}/dashboard`;
  const pkgLine = packageName ? `\nPackage:\n${packageName}` : "";

  const whatsappMessage = `Assalamu Alaikum ${customerName},\n\nYour *${label}* has been uploaded successfully.\n\nBooking ID:\n#${bookingNumber}${pkgLine}\n\nPlease login to your dashboard to view and download:\n📱 ${dashboardUrl}\n\nFor assistance:\n📞 +91 9893225590\n\n*Al Burhan Tours & Travels*`;

  const notifOpts = { eventType: "document_delivered", bookingId, customerId: customerId || undefined };

  // 1. Fetch file buffer (best-effort)
  let fileData: { buffer: Buffer; mimeType: string } | null = null;
  try {
    fileData = await fetchFileBuffer(fileUrl, fileName, mimeType);
  } catch (err) {
    console.error("[docDelivery] File fetch failed:", err);
  }

  const effectiveMime = fileData?.mimeType || mimeType || guessFromExtension(fileName) || "application/octet-stream";
  const fileCaption = `${label} — Booking #${bookingNumber}`;

  // ── 1. WhatsApp ──────────────────────────────────────────────────────────────
  let waOk = false;
  try {
    if (fileData?.buffer && isPdfMime(effectiveMime)) {
      const result = await sendPDFDocument(customerMobile, fileData.buffer, fileName, fileCaption, notifOpts);
      waOk = result.ok;
      if (!result.ok) {
        const fallback = await sendText(customerMobile, whatsappMessage, { ...notifOpts, logMessage: whatsappMessage.substring(0, 300) });
        waOk = fallback.ok;
      }
    } else if (fileData?.buffer && isImageMime(effectiveMime)) {
      const up = await uploadMedia(fileData.buffer, effectiveMime, fileName);
      if (up.ok && up.mediaId) {
        const result = await sendFile(customerMobile, up.mediaId, fileCaption, notifOpts);
        waOk = result.ok;
        if (!result.ok) {
          const fallback = await sendText(customerMobile, whatsappMessage, { ...notifOpts, logMessage: whatsappMessage.substring(0, 300) });
          waOk = fallback.ok;
        }
      } else {
        const fallback = await sendText(customerMobile, whatsappMessage, { ...notifOpts, logMessage: whatsappMessage.substring(0, 300) });
        waOk = fallback.ok;
      }
    } else {
      // DOCX or other — send message with dashboard link
      const fallback = await sendText(customerMobile, whatsappMessage, { ...notifOpts, logMessage: whatsappMessage.substring(0, 300) });
      waOk = fallback.ok;
    }
  } catch (err) {
    console.error("[docDelivery] WhatsApp error:", err);
  }

  // ── 2. Email ─────────────────────────────────────────────────────────────────
  let emailOk = false;
  if (customerEmail) {
    try {
      const emailBody = `Assalamu Alaikum ${customerName},\n\nAlhamdulillah! Your ${label} for booking #${bookingNumber} is ready.\n\n${fileData?.buffer ? "Please find the document attached to this email." : `Please login to your dashboard to view and download it:\n${dashboardUrl}`}\n\nFor any queries, please contact us:\n📞 +91 8989701701\n📧 alburhantravels@gmail.com\n\nJazak Allah Khair!\nAl Burhan Tours & Travels`;
      const attachments: EmailAttachment[] = [];
      if (fileData?.buffer) {
        attachments.push({ filename: fileName, content: fileData.buffer, contentType: effectiveMime });
      }
      const result = await sendEmail(
        customerEmail,
        `${label} Ready — Booking #${bookingNumber} | Al Burhan Tours & Travels`,
        emailBody,
        undefined,
        attachments.length > 0 ? attachments : undefined
      );
      emailOk = result.ok;
    } catch (err) {
      console.error("[docDelivery] Email error:", err);
    }
  }

  // ── 3. SMS ───────────────────────────────────────────────────────────────────
  let smsOk = false;
  try {
    const smsCtx = { mobile: customerMobile, customerName, bookingNumber, bookingId, customerId: customerId || undefined };
    let smsResult;
    if (documentType === "flight_ticket") {
      smsResult = await smsSendTicket(smsCtx);
    } else if (documentType === "visa") {
      smsResult = await smsSendVisa(smsCtx);
    } else {
      smsResult = await smsSendInvoiceCreated(smsCtx);
    }
    smsOk = smsResult.ok;
  } catch (err) {
    console.error("[docDelivery] SMS error:", err);
  }

  // ── Mark notification_sent = TRUE ────────────────────────────────────────────
  await pool.query(`UPDATE documents SET notification_sent = TRUE WHERE id = $1`, [docId]).catch(() => {});

  console.log(`[docDelivery] #${bookingNumber} ${documentType} → WA:${waOk} Email:${emailOk} SMS:${smsOk}`);
  return { whatsapp: waOk, email: emailOk, sms: smsOk };
}
