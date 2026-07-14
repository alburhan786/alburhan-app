// @ts-nocheck
import PDFDocument from "pdfkit";
import { LOGO_BASE64 } from "./logoData.js";
import QRCode from "qrcode";

const LOGO_BUFFER = Buffer.from(LOGO_BASE64, "base64");
const DARK_GREEN = "#0B3D2E";
const GOLD = "#C9A23F";
const LIGHT_GREEN = "#EBF5EB";
const PAGE_MARGIN = 40;

function pdfToBuffer(doc: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function drawPageHeader(doc: any) {
  const W = doc.page.width;
  doc.rect(0, 0, W, 92).fill(DARK_GREEN);
  try { doc.image(LOGO_BUFFER, PAGE_MARGIN, 12, { width: 60 }); } catch {}
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(17)
    .text("AL BURHAN TOURS & TRAVELS", PAGE_MARGIN + 68, 16, { width: W - PAGE_MARGIN * 2 - 68 });
  doc.fill("white").font("Helvetica").fontSize(8)
    .text("Regd. Travel Agency | Hajj & Umrah Specialists | Est. 2008", PAGE_MARGIN + 68, 38, { width: W - PAGE_MARGIN * 2 - 68 });
  doc.fill("white").font("Helvetica").fontSize(7.5)
    .text("5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P. | +91 9893989786 | alburhantravels.com | GSTIN: 23AAVFA3223C1ZW", PAGE_MARGIN + 68, 52, { width: W - PAGE_MARGIN * 2 - 68 });
  doc.fill(GOLD).font("Helvetica-Bold").fontSize(13)
    .text("HAJJ PACKAGE AGREEMENT & DECLARATION", PAGE_MARGIN + 68, 68, { width: W - PAGE_MARGIN * 2 - 68 });
  doc.fill("black");
}

function drawPageFooter(doc: any, pageNum: number) {
  const W = doc.page.width;
  const H = doc.page.height;
  doc.rect(0, H - 32, W, 32).fill(DARK_GREEN);
  doc.fill("white").font("Helvetica").fontSize(7.5)
    .text("Al Burhan Tours & Travels | Legally Binding Agreement under IT Act 2000", PAGE_MARGIN, H - 20, { width: (W - PAGE_MARGIN * 2) / 2 });
  doc.fill(GOLD).font("Helvetica").fontSize(7.5)
    .text(`Page ${pageNum} | Confidential — For Authorized Parties Only`, W / 2, H - 20, { width: (W - PAGE_MARGIN * 2) / 2, align: "right" });
  doc.fill("black");
}

function sectionHeader(doc: any, y: number, text: string) {
  const W = doc.page.width;
  doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 22).fill(DARK_GREEN);
  doc.fill("white").font("Helvetica-Bold").fontSize(10)
    .text(text, PAGE_MARGIN + 8, y + 6, { width: W - PAGE_MARGIN * 2 - 16 });
  doc.fill("black");
  return y + 28;
}

function kvRow(doc: any, y: number, label: string, value: string, highlight = false) {
  doc.font("Helvetica-Bold").fontSize(9).fill("#555").text(label + ":", PAGE_MARGIN, y, { width: 175, continued: false });
  doc.font(highlight ? "Helvetica-Bold" : "Helvetica").fontSize(9)
    .fill(highlight ? DARK_GREEN : "#111")
    .text(value || "—", PAGE_MARGIN + 180, y, { width: doc.page.width - PAGE_MARGIN * 2 - 180 });
  return y + 17;
}

export const HAJJ_AGREEMENT_CLAUSES = [
  {
    id: "booking_confirmation",
    title: "1. BOOKING CONFIRMATION & AGREEMENT",
    body: "This Agreement is entered into between Al Burhan Tours & Travels (hereinafter 'the Agency'), a registered travel agency specializing in Hajj and Umrah services, and the Customer named herein (hereinafter 'the Pilgrim'). This Agreement constitutes a legally binding contract upon digital execution. The Agency confirms the Pilgrim's booking for the Hajj package as detailed herein. A unique Agreement Number is assigned which serves as the official reference for all correspondence, legal proceedings, and service delivery.",
  },
  {
    id: "payment_terms",
    title: "2. PAYMENT TERMS & CONDITIONS",
    body: "The total Package Amount is as specified in this Agreement. Full payment must be completed at least 60 days before the departure date unless otherwise agreed in writing. Partial payments are accepted subject to a structured payment schedule. A booking amount (minimum 20% of total package cost) is required to confirm the registration. The Agency will issue official receipts for all payments. All payments must be made through official channels only (Razorpay online, NEFT/IMPS to Agency bank account, or cash with receipt). Payments to unauthorized persons on behalf of the Agency are not recognized.",
  },
  {
    id: "cancellation_policy",
    title: "3. CANCELLATION & REFUND POLICY",
    body: "Cancellations must be communicated in writing (email or registered letter).\n• More than 90 days before departure: 10% administrative charge; 90% refundable.\n• 60–89 days before departure: 25% deduction on total amount paid.\n• 30–59 days before departure: 50% deduction on total amount paid.\n• 15–29 days before departure: 75% deduction on total amount paid.\n• Less than 15 days or after departure: No refund.\nNote: Visa fees, government levies, airline cancellation charges, and hotel pre-payments are non-refundable in all circumstances. Refunds, where applicable, will be processed within 30 working days by the same payment method. No cash refunds for amounts exceeding ₹10,000.",
  },
  {
    id: "package_inclusions",
    title: "4. PACKAGE INCLUSIONS & EXCLUSIONS",
    body: "INCLUSIONS: Round-trip economy class airfare from/to designated Indian airport, accommodation in Makkah (near Haram) and Madinah as specified in the package, group transportation (airport transfers, Makkah–Madinah journey, Mina/Muzdalifah/Arafat transport), certified Hajj guide services throughout, Mina tent accommodation, Zamzam water (5 litres per pilgrim), official Al Burhan ID badge and documentation.\n\nEXCLUSIONS: Personal expenses, meals beyond breakfast (unless specified), laundry, international calls, travel insurance, Hajj visa fees (charged separately as per Government rates), Umrah kit/ihram, medications, and any services not explicitly listed. The Agency reserves the right to provide equivalent-quality substitutes for accommodation or transportation where original arrangements become unavailable due to circumstances beyond its control.",
  },
  {
    id: "visa_documents",
    title: "5. VISA, PASSPORT & TRAVEL DOCUMENTS",
    body: "The Pilgrim must hold a valid Indian passport with minimum 6 months validity from the return date. The Agency will apply for the Hajj visa on behalf of the Pilgrim through the authorized Hajj Committee process; however, visa approval rests solely with Saudi Arabian authorities, and the Agency accepts no liability for visa rejection or delays. The Pilgrim must submit all required documents (passport original, Aadhaar card, PAN card, recent photographs as specified, vaccination certificates, medical fitness certificate if above 65 years) by the document submission deadline communicated by the Agency. Failure to submit documents on time may result in cancellation with applicable deductions. All documents submitted become the responsibility of the Agency during the application process and will be returned after visa processing.",
  },
  {
    id: "health_requirements",
    title: "6. HEALTH, MEDICAL & VACCINATION REQUIREMENTS",
    body: "The Pilgrim declares and warrants that they are physically and medically fit to perform all obligatory Hajj rites. All vaccinations mandated by Saudi Arabian authorities (currently: Meningococcal ACWY vaccine, COVID-19 vaccination as required, and any other vaccines notified) must be completed before departure. Pilgrims above 65 years of age or those with chronic medical conditions must obtain a medical fitness certificate from a registered medical practitioner. The Agency is not responsible for medical expenses, hospitalization, or any health-related costs during or after travel. Pilgrims are strongly advised to obtain comprehensive travel and medical insurance. The Agency reserves the right to deny boarding to any Pilgrim deemed medically unfit by the Agency's representative or medical staff.",
  },
  {
    id: "conduct_discipline",
    title: "7. CONDUCT, DISCIPLINE & GROUP REGULATIONS",
    body: "The Pilgrim agrees to conduct themselves with dignity and decorum befitting the sanctity of the Holy Sites of Makkah and Madinah. The Pilgrim will comply with all instructions issued by Saudi Arabian authorities, the Hajj Committee, and the Agency's group guide at all times. The Pilgrim must remain with the group at all designated times and inform the guide before any independent movement. The Agency may terminate this Agreement and arrange the Pilgrim's return travel (at the Pilgrim's expense) in cases of serious misconduct, violation of Saudi laws, or conduct endangering others. The Agency is not liable for loss, theft, or damage to personal property. Prohibited items as defined by Saudi Arabian law must not be carried.",
  },
  {
    id: "liability_insurance",
    title: "8. LIABILITY LIMITATION & INSURANCE",
    body: "The Agency acts as an organizer and intermediary between the Pilgrim and third-party service providers including airlines, hotels, and transportation companies. The Agency's maximum total liability under this Agreement shall not exceed the total amount actually paid by the Pilgrim. The Agency is not liable for delays, cancellations, strikes, or service failures caused by third parties. The Agency is not responsible for injury, illness, death, or loss of baggage during the journey. Comprehensive travel insurance (covering trip cancellation, medical emergencies, personal accidents, and baggage loss) is available through the Agency and is strongly recommended. The Pilgrim acknowledges that international Hajj travel involves inherent risks and accepts personal responsibility for their safety.",
  },
  {
    id: "force_majeure",
    title: "9. FORCE MAJEURE",
    body: "Neither party shall be held liable for failure or delay in performing obligations under this Agreement due to circumstances beyond their reasonable control, including but not limited to: acts of God, natural disasters, fire, flood, earthquake, war, armed conflict, terrorism, riots, pandemic, epidemic, government orders, actions or decisions of Saudi Arabian or Indian authorities, strikes, or civil disturbances. In such circumstances, the Agency shall notify the Pilgrim promptly and make commercially reasonable efforts to arrange alternative services or reschedule. Refunds in force majeure events will be limited to amounts recoverable from airlines, hotels, and other service providers, net of administrative costs.",
  },
  {
    id: "privacy_data",
    title: "10. PRIVACY & DATA PROTECTION",
    body: "The Pilgrim consents to the collection, storage, processing, and transfer of personal data including name, contact details, passport information, photographs, biometric data, medical information, and payment details. This data will be used exclusively for: facilitating the Hajj journey, complying with Saudi Arabian and Indian regulatory requirements, and maintaining Agency records. Data will be shared with Saudi Arabian Hajj authorities, Indian Hajj Committee, airlines, hotels, transport providers, and government agencies as required by law. The Agency will not sell or share personal data with any commercial third party without consent. Records will be retained for a minimum of 7 years as required under applicable law. The Pilgrim has the right to access their personal data held by the Agency.",
  },
  {
    id: "amendments",
    title: "11. AMENDMENTS & ENTIRE AGREEMENT",
    body: "This Agreement constitutes the entire understanding between the parties and supersedes all prior negotiations, representations, or agreements. Any amendments to this Agreement must be in writing and signed by authorized representatives of both parties. If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect. The Agency's failure to enforce any provision shall not constitute a waiver of future enforcement rights.",
  },
  {
    id: "governing_law",
    title: "12. DISPUTE RESOLUTION & GOVERNING LAW",
    body: "Any dispute, controversy, or claim arising out of or relating to this Agreement shall first be subject to good-faith negotiation between the parties for a period of 30 days. If unresolved, disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996 (India), with the venue at Burhanpur, Madhya Pradesh. The arbitral award shall be final and binding. This Agreement is governed by the laws of the Republic of India. The courts at Burhanpur, Madhya Pradesh shall have exclusive jurisdiction for matters not subject to arbitration.",
  },
  {
    id: "digital_signature_declaration",
    title: "13. DIGITAL SIGNATURE DECLARATION & CUSTOMER UNDERTAKING",
    body: "I, the undersigned Customer/Pilgrim, hereby solemnly declare that:\n(a) I have read, fully understood, and voluntarily accept all terms and conditions of this Agreement.\n(b) All personal, medical, and travel information provided to the Agency is true, accurate, complete, and not misleading.\n(c) I am physically, medically, and legally competent to undertake the Hajj journey.\n(d) I understand that this is a legally binding contract and I enter into it of my own free will without coercion.\n(e) I accept full responsibility for my conduct during the journey and compliance with all applicable laws.\n(f) My digital signature affixed to this Agreement is valid and legally equivalent to a handwritten (wet ink) signature under Section 5 of the Information Technology Act, 2000 (India) read with Schedule I.\n(g) I confirm that my mobile number has been verified via One-Time Password (OTP) immediately prior to signing, constituting a valid form of electronic authentication.",
  },
];

export interface AgreementPdfOptions {
  agreementNumber: string;
  bookingNumber: string;
  bookingId: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string | null;
  packageName?: string | null;
  numberOfPilgrims?: number | null;
  totalAmount?: number | null;
  paidAmount?: number | null;
  balanceAmount?: number | null;
  departureDate?: string | null;
  groupName?: string | null;
  signatureData?: string | null;
  signedAt?: Date | null;
  signedIp?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
  otpVerified?: boolean;
  otpVerifiedAt?: Date | null;
  verificationUrl?: string;
  termsAccepted?: Record<string, boolean>;
  status?: string;
  agreementDate?: Date | null;
}

export async function generateAgreementPdfBuffer(opts: AgreementPdfOptions): Promise<Buffer> {
  let qrBuffer: Buffer | null = null;
  if (opts.verificationUrl) {
    try { qrBuffer = await QRCode.toBuffer(opts.verificationUrl, { width: 120, margin: 1 }); } catch {}
  }

  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true, bufferPages: true });
  const W = doc.page.width;
  let pageNum = 1;

  // ─── PAGE 1: Cover, Parties, Package Details ────────────────────────────────
  drawPageHeader(doc);
  let y = 102;

  // Reference banner
  doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 48).fill("#F0F7F0").stroke(DARK_GREEN);
  doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(9).text("AGREEMENT REFERENCE", PAGE_MARGIN + 10, y + 6);
  doc.fill("#111").font("Helvetica-Bold").fontSize(10)
    .text(`${opts.agreementNumber}`, PAGE_MARGIN + 10, y + 20);
  doc.fill("#666").font("Helvetica").fontSize(8.5)
    .text(`Booking: ${opts.bookingNumber}   |   Status: ${(opts.status || "PENDING SIGNATURE").toUpperCase().replace(/_/g, " ")}   |   Dated: ${new Date(opts.agreementDate || Date.now()).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`, PAGE_MARGIN + 10, y + 36, { width: W - PAGE_MARGIN * 2 - 20 });
  if (qrBuffer) {
    try { doc.image(qrBuffer, W - PAGE_MARGIN - 42, y + 2, { width: 40, height: 40 }); } catch {}
  }
  doc.fill("black");
  y += 58;

  // Parties
  y = sectionHeader(doc, y, "PARTIES TO THIS AGREEMENT");
  const colW = (W - PAGE_MARGIN * 2) / 2 - 6;

  doc.rect(PAGE_MARGIN, y, colW, 80).fill(LIGHT_GREEN).stroke(DARK_GREEN);
  doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(9).text("PARTY 1 — THE AGENCY", PAGE_MARGIN + 8, y + 7);
  doc.fill("#111").font("Helvetica").fontSize(8.5)
    .text("Al Burhan Tours & Travels\n5/8 Khanka Masjid Complex, Shanwara Road\nBurhanpur – 450331, Madhya Pradesh\nGSTIN: 23AAVFA3223C1ZW | +91 9893989786", PAGE_MARGIN + 8, y + 22, { width: colW - 16, lineGap: 1 });
  doc.fill("black");

  const col2X = PAGE_MARGIN + colW + 12;
  doc.rect(col2X, y, colW, 80).fill("#FFF8E7").stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica-Bold").fontSize(9).text("PARTY 2 — THE PILGRIM / CUSTOMER", col2X + 8, y + 7);
  doc.fill("#111").font("Helvetica").fontSize(8.5)
    .text(`${opts.customerName}\nMobile: ${opts.customerMobile}\nEmail: ${opts.customerEmail || "—"}\nBooking Ref: ${opts.bookingNumber}`, col2X + 8, y + 22, { width: colW - 16, lineGap: 1 });
  doc.fill("black");
  y += 90;

  // Package Details
  y = sectionHeader(doc, y, "PACKAGE DETAILS");
  y = kvRow(doc, y, "Package Name", opts.packageName || "Hajj Package");
  y = kvRow(doc, y, "Number of Pilgrims", String(opts.numberOfPilgrims || 1));
  y = kvRow(doc, y, "Group Assignment", opts.groupName || "To be notified");
  y = kvRow(doc, y, "Departure Date", opts.departureDate ? new Date(opts.departureDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "As per group schedule");
  y += 4;
  doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 1).fill("#DDD"); y += 8;
  y = kvRow(doc, y, "Total Package Amount", `₹ ${Number(opts.totalAmount || 0).toLocaleString("en-IN")}`, true);
  y = kvRow(doc, y, "Amount Paid to Date", `₹ ${Number(opts.paidAmount || 0).toLocaleString("en-IN")}`);
  y = kvRow(doc, y, "Outstanding Balance", `₹ ${Number(opts.balanceAmount || 0).toLocaleString("en-IN")}`, Number(opts.balanceAmount || 0) > 0);
  y += 10;

  // Agreement validity statement
  doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 30).fill("#FFF3CD").stroke(GOLD);
  doc.fill("#7B4700").font("Helvetica").fontSize(8)
    .text("This Agreement becomes legally binding upon digital signature and OTP verification by the Customer. It is executable under the Information Technology Act, 2000 (India).", PAGE_MARGIN + 10, y + 9, { width: W - PAGE_MARGIN * 2 - 20 });
  doc.fill("black");

  drawPageFooter(doc, pageNum++);

  // ─── PAGES 2–4: Terms & Conditions ─────────────────────────────────────────
  const clausesPerPage = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [9, 10, 11, 12],
  ];

  for (const pageGroup of clausesPerPage) {
    doc.addPage();
    drawPageHeader(doc);
    y = 102;

    for (const clauseIdx of pageGroup) {
      const clause = HAJJ_AGREEMENT_CLAUSES[clauseIdx];
      if (!clause) continue;

      y = sectionHeader(doc, y, clause.title);

      if (opts.signedAt) {
        const accepted = opts.termsAccepted?.[clause.id] !== false;
        doc.rect(PAGE_MARGIN, y, 12, 12).fill(accepted ? DARK_GREEN : "#CCC").stroke("#888");
        if (accepted) doc.fill("white").font("Helvetica-Bold").fontSize(8).text("✓", PAGE_MARGIN + 2, y + 1);
        doc.fill(accepted ? DARK_GREEN : "#999").font("Helvetica-Bold").fontSize(7.5)
          .text(accepted ? "ACCEPTED" : "NOT ACCEPTED", PAGE_MARGIN + 16, y + 1);
        doc.fill("black");
        y += 16;
      }

      doc.fill("#222").font("Helvetica").fontSize(8.5)
        .text(clause.body, PAGE_MARGIN, y, { width: W - PAGE_MARGIN * 2, lineGap: 1.5 });
      y = doc.y + 12;

      if (y > doc.page.height - 100) {
        drawPageFooter(doc, pageNum++);
        doc.addPage();
        drawPageHeader(doc);
        y = 102;
      }
    }

    drawPageFooter(doc, pageNum++);
  }

  // ─── FINAL PAGE: Signature, Audit Trail, QR Verification ────────────────────
  doc.addPage();
  drawPageHeader(doc);
  y = 102;

  y = sectionHeader(doc, y, "DIGITAL SIGNATURE & EXECUTION");

  if (opts.signedAt && opts.signatureData) {
    const sigColW = (W - PAGE_MARGIN * 2) / 2 - 6;

    doc.rect(PAGE_MARGIN, y, sigColW, 110).fill("#FAFFFE").stroke(DARK_GREEN);
    doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(9).text("CUSTOMER DIGITAL SIGNATURE", PAGE_MARGIN + 8, y + 7);
    try {
      const sigBuf = Buffer.from(opts.signatureData.replace(/^data:image\/\w+;base64,/, ""), "base64");
      doc.image(sigBuf, PAGE_MARGIN + 8, y + 22, { width: sigColW - 20, height: 60, fit: [sigColW - 20, 60] });
    } catch {}
    doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(7.5)
      .text(`Signed by: ${opts.customerName}`, PAGE_MARGIN + 8, y + 88);
    doc.fill("#555").font("Helvetica").fontSize(7.5)
      .text(`${opts.signedAt.toLocaleString("en-IN")}`, PAGE_MARGIN + 8, y + 100);
    doc.fill("black");

    const otpX = PAGE_MARGIN + sigColW + 12;
    const otpOk = opts.otpVerified;
    doc.rect(otpX, y, sigColW, 110).fill(otpOk ? "#E8F5E9" : "#FFF0F0").stroke(otpOk ? DARK_GREEN : "#CC0000");
    doc.fill(otpOk ? DARK_GREEN : "#CC0000").font("Helvetica-Bold").fontSize(9)
      .text("OTP MOBILE VERIFICATION", otpX + 8, y + 7);
    doc.fill(otpOk ? DARK_GREEN : "#CC0000").font("Helvetica-Bold").fontSize(22)
      .text(otpOk ? "✓ VERIFIED" : "✗ UNVERIFIED", otpX + 8, y + 30, { width: sigColW - 16 });
    doc.fill("#444").font("Helvetica").fontSize(8.5)
      .text(`Mobile: ${opts.customerMobile}`, otpX + 8, y + 62);
    doc.fill("#444").font("Helvetica").fontSize(8)
      .text(`Verified at: ${opts.otpVerifiedAt ? opts.otpVerifiedAt.toLocaleString("en-IN") : "—"}`, otpX + 8, y + 78);
    doc.fill("#444").font("Helvetica").fontSize(7.5)
      .text("Authentication via SMS OTP", otpX + 8, y + 94);
    doc.fill("black");
    y += 120;
  } else {
    doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 40).fill("#FFF8E7").stroke(GOLD);
    doc.fill("#7B4700").font("Helvetica-Oblique").fontSize(9)
      .text("⏳  This agreement is awaiting digital signature from the customer. Signature and audit details will appear here once signed.", PAGE_MARGIN + 10, y + 13, { width: W - PAGE_MARGIN * 2 - 20 });
    doc.fill("black");
    y += 50;
  }

  // Audit Trail
  y = sectionHeader(doc, y, "LEGAL AUDIT TRAIL");
  if (opts.signedAt) {
    y = kvRow(doc, y, "Agreement Generated", new Date(opts.agreementDate || Date.now()).toLocaleString("en-IN"));
    y = kvRow(doc, y, "OTP Verification Time", opts.otpVerifiedAt ? opts.otpVerifiedAt.toLocaleString("en-IN") : "—");
    y = kvRow(doc, y, "Signature Timestamp", opts.signedAt.toLocaleString("en-IN"));
    y = kvRow(doc, y, "Signatory IP Address", opts.signedIp || "Recorded");
    y = kvRow(doc, y, "Device / Platform", opts.deviceInfo || opts.userAgent?.substring(0, 80) || "Recorded");
    y = kvRow(doc, y, "OTP Verified", opts.otpVerified ? "Yes — Mobile ownership confirmed" : "No");
  } else {
    doc.fill("#888").font("Helvetica-Oblique").fontSize(8.5)
      .text("Audit trail will be recorded upon signature completion.", PAGE_MARGIN, y + 4);
    y += 18;
  }
  y += 6;

  // QR Code
  y = sectionHeader(doc, y, "QR CODE — DOCUMENT VERIFICATION");
  if (qrBuffer) {
    try {
      doc.image(qrBuffer, PAGE_MARGIN, y, { width: 90, height: 90 });
    } catch {}
    doc.fill(DARK_GREEN).font("Helvetica-Bold").fontSize(10).text("Scan to Verify This Agreement", PAGE_MARGIN + 102, y + 8);
    doc.fill("#555").font("Helvetica").fontSize(8.5)
      .text(`Agreement ID: ${opts.agreementNumber}\nBooking: ${opts.bookingNumber}\nCustomer: ${opts.customerName}\nStatus: ${(opts.status || "pending_signature").toUpperCase().replace(/_/g, " ")}`, PAGE_MARGIN + 102, y + 26, { lineGap: 2 });
    doc.fill("#333").font("Helvetica").fontSize(7.5)
      .text(`URL: ${opts.verificationUrl || "—"}`, PAGE_MARGIN + 102, y + 72, { width: W - PAGE_MARGIN * 2 - 110 });
    y += 100;
  }

  // Legal footer notice
  y += 4;
  doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 2).fill(GOLD); y += 8;
  doc.fill("#555").font("Helvetica-Oblique").fontSize(7.5)
    .text("This document constitutes a legally binding agreement executed by way of digital/electronic signature under Section 5 read with Schedule I of the Information Technology Act, 2000 (India), and the Indian Contract Act, 1872. The digital signature affixed herein is as valid and enforceable as a wet-ink signature. This agreement was generated by the Al Burhan Tours & Travels automated agreement system and carries the full legal authority of the Agency. Any unauthorized alteration of this document is an offence under applicable law.", PAGE_MARGIN, y, { width: W - PAGE_MARGIN * 2, lineGap: 1.5 });

  drawPageFooter(doc, pageNum++);

  return pdfToBuffer(doc);
}
