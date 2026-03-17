import { useRef, useState } from "react";
import { useParams } from "wouter";
import { useGetPublicInvoice, useGetPublicInvoiceByNumber } from "@workspace/api-client-react";
import type { Invoice as InvoiceType, Pilgrim } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Share2, Copy, Mail, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { downloadPdf } from "@/lib/pdf-download";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DARK_GREEN = "#0B3D2E";
const GOLD = "#C9A23F";

function numberToWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  const rem = n % 100;
  let result = "";
  if (crore > 0) result += convert99(crore, ones, tens) + " Crore ";
  if (lakh > 0) result += convert99(lakh, ones, tens) + " Lakh ";
  if (thousand > 0) result += convert99(thousand, ones, tens) + " Thousand ";
  if (hundred > 0) result += ones[hundred] + " Hundred ";
  if (rem > 0) result += (result ? "and " : "") + convert99(rem, ones, tens);
  return result.trim() + " Rupees";
}

function convert99(n: number, ones: string[], tens: string[]): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function fmtDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(dateString));
  } catch { return dateString; }
}

const PACKAGE_TYPE_LABELS: Record<string, string> = {
  hajj: "Hajj",
  special_hajj: "Special Hajj",
  umrah: "Umrah",
  ramadan_umrah: "Ramadan Umrah",
  iraq_ziyarat: "Iraq Ziyarat",
  baitul_muqaddas: "Baitul Muqaddas",
  syria_ziyarat: "Syria Ziyarat",
  jordan_heritage: "Jordan Heritage",
};

function formatPackageType(type: string | null | undefined): string {
  if (!type) return "";
  return PACKAGE_TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function StatusBadge({ status }: { status: string | undefined }) {
  const s = (status || "Pending").toLowerCase();
  let bg = "#FEF3CD";
  let color = "#856404";
  let label = "PENDING";
  if (s === "paid") { bg = "#D4EDDA"; color = "#155724"; label = "PAID"; }
  else if (s === "partial") { bg = "#FFF3CD"; color = "#856404"; label = "PARTIAL"; }
  else { bg = "#F8D7DA"; color = "#721C24"; label = "PENDING"; }
  return (
    <span style={{ backgroundColor: bg, color, padding: "2px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px" }}>
      {label}
    </span>
  );
}

function MetaRow({ label, value, badge }: { label: string; value?: string; badge?: React.ReactNode }) {
  return (
    <tr>
      <td className="text-left py-1 px-2 text-[11px] whitespace-nowrap" style={{ border: `1px solid ${DARK_GREEN}` }}>{label}</td>
      <td className="py-1 px-1 text-[11px] text-center" style={{ border: `1px solid ${DARK_GREEN}` }}>:</td>
      <td className="text-right py-1 px-2 text-[11px] font-semibold whitespace-nowrap" style={{ border: `1px solid ${DARK_GREEN}` }}>
        {badge || value || ""}
      </td>
    </tr>
  );
}

function InvoiceContent({ invoice }: { invoice: InvoiceType }) {
  const pilgrims: Pilgrim[] = Array.isArray(invoice.pilgrims) ? invoice.pilgrims : [];
  const gstPercent = invoice.gstPercent ?? 5;
  const cgstRate = gstPercent / 2;
  const sgstRate = gstPercent / 2;
  const totalAmount = invoice.totalAmount ?? 0;
  const gstAmount = invoice.gstAmount ?? 0;
  const cgstAmount = gstAmount / 2;
  const sgstAmount = gstAmount / 2;
  const finalAmount = invoice.finalAmount ?? 0;
  const advanceAmount = invoice.advanceAmount ?? 0;
  const balance = finalAmount - advanceAmount;
  const previousBalance = invoice.previousBalance ?? 0;
  const currentBalance = balance + previousBalance;
  const pilgrimCount = pilgrims.length > 0 ? pilgrims.length : 1;
  const pricePerPerson = invoice.pricePerPerson ?? totalAmount / pilgrimCount;
  const taxPerPerson = gstAmount / pilgrimCount;
  const amountPerPerson = finalAmount / pilgrimCount;
  const verificationUrl = `https://alburhantravels.com/invoice/${invoice.invoiceNumber || invoice.bookingNumber}`;

  return (
    <div className="bg-white text-black" style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "12px", lineHeight: 1.4 }}>
      <div style={{ border: `2px solid ${DARK_GREEN}` }}>
        {/* HEADER BAR */}
        <div style={{ padding: "8px 16px", borderBottom: `3px solid ${GOLD}` }} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Al Burhan Logo" style={{ height: "48px", width: "auto" }} />
            <div>
              <div className="font-bold text-[16px] leading-tight" style={{ color: DARK_GREEN }}>ALBURHAN TOURS & TRAVELS</div>
              <div className="text-[9px] tracking-wider" style={{ color: GOLD }}>Hajj &bull; Umrah &bull; Ziyarat Tours &bull; 35+ Years Experience</div>
            </div>
          </div>
          <div className="text-right text-[9px] leading-snug" style={{ color: DARK_GREEN }}>
            <div>Tel: {invoice.companyPhone}</div>
            <div>{invoice.companyEmail}</div>
          </div>
        </div>

        {/* HEADER ROW: Company + Tax Invoice + Meta Table */}
        <div className="flex" style={{ borderBottom: `1px solid ${DARK_GREEN}` }}>
          <div className="w-[40%] p-3" style={{ borderRight: `1px solid ${DARK_GREEN}` }}>
            <div className="text-[10px] leading-snug">{invoice.companyAddress}</div>
            <div className="text-[10px] mt-1">GSTIN : {invoice.gstin}</div>
            <div className="text-[10px]">Mobile : {invoice.companyPhone}</div>
            <div className="text-[10px]">Email : {invoice.companyEmail}</div>
            <div className="text-[10px]">PAN Number : {invoice.pan}</div>
          </div>
          <div className="w-[20%] flex flex-col items-center justify-center p-3" style={{ borderRight: `1px solid ${DARK_GREEN}` }}>
            <div className="font-bold text-[14px] text-center" style={{ color: DARK_GREEN }}>TAX INVOICE</div>
            <div className="text-[9px] mt-1 text-center" style={{ color: GOLD }}>ORIGINAL FOR RECIPIENT</div>
          </div>
          <div className="w-[40%] p-0">
            <table className="w-full border-collapse">
              <tbody>
                <MetaRow label="Invoice No." value={invoice.invoiceNumber || ""} />
                <MetaRow label="Invoice Date" value={fmtDate(invoice.paymentDate)} />
                <MetaRow label="Due Date" value={fmtDate(invoice.dueDate)} />
                <MetaRow label="Payment Method" value={invoice.paymentMethod || ""} />
                <MetaRow label="Haj Year" value={invoice.hajYear || ""} />
                <MetaRow label="Status" badge={<StatusBadge status={invoice.paymentStatus} />} />
              </tbody>
            </table>
          </div>
        </div>

        {/* BILL TO */}
        <div className="p-3" style={{ borderBottom: `1px solid ${DARK_GREEN}` }}>
          <div className="font-bold text-[11px] mb-1 px-2 py-1 inline-block" style={{ border: `1px solid ${DARK_GREEN}`, color: DARK_GREEN }}>BILL TO</div>
          <div className="mt-1">
            <div className="font-bold text-[12px]">{invoice.customerName}</div>
            <div className="text-[10px]">{invoice.customerAddress || ""}</div>
            <div className="text-[10px]">Mobile : {invoice.customerMobile}</div>
            <div className="text-[10px]">GSTIN : {invoice.customerGstin || ""}</div>
            <div className="text-[10px]">PAN Number : {invoice.customerPan || ""}</div>
            <div className="text-[10px]">State : {invoice.customerState || ""}</div>
          </div>
        </div>

        {/* SERVICES TABLE */}
        <div>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr style={{ color: DARK_GREEN, borderTop: `2px solid ${DARK_GREEN}`, borderBottom: `2px solid ${DARK_GREEN}` }}>
                <th className="px-2 py-2 text-center w-[5%]">S.NO.</th>
                <th className="px-2 py-2 text-left w-[24%]">SERVICES</th>
                <th className="px-2 py-2 text-center w-[8%]">SAC</th>
                <th className="px-2 py-2 text-center w-[13%]">PASSPORT NO</th>
                <th className="px-2 py-2 text-center w-[10%]">DATE OF ISSUE</th>
                <th className="px-2 py-2 text-right w-[14%]">RATE</th>
                <th className="px-2 py-2 text-right w-[12%]">TAX</th>
                <th className="px-2 py-2 text-right w-[14%]">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {pilgrims.length > 0 ? (
                pilgrims.map((p, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${DARK_GREEN}` }}>
                    <td className="px-2 py-2 text-center">{i + 1}</td>
                    <td className="px-2 py-2">
                      <div className="font-semibold">{invoice.packageName || "Travel Package"}</div>
                      {invoice.packageType && <div className="text-[8px] font-semibold" style={{ color: GOLD }}>{formatPackageType(invoice.packageType)}</div>}
                      {p.name && <div className="text-[9px]">{p.name}</div>}
                      {invoice.roomType && <div className="text-[8px]" style={{ color: "#555" }}>Room: {invoice.roomType}</div>}
                      {invoice.maktabNumber && <div className="text-[8px]" style={{ color: "#555" }}>Maktab: {invoice.maktabNumber}</div>}
                      {invoice.travelDate && <div className="text-[8px]" style={{ color: "#555" }}>Travel: {fmtDate(invoice.travelDate)}</div>}
                    </td>
                    <td className="px-2 py-2 text-center">{invoice.sacCode || "998555"}</td>
                    <td className="px-2 py-2 text-center">{p.passportNumber || "—"}</td>
                    <td className="px-2 py-2 text-center">{p.passportExpiry ? fmtDate(p.passportExpiry) : "—"}</td>
                    <td className="px-2 py-2 text-right">{formatINR(pricePerPerson)}</td>
                    <td className="px-2 py-2 text-right">
                      {formatINR(taxPerPerson)}
                      <div className="text-[8px]">({gstPercent}%)</div>
                    </td>
                    <td className="px-2 py-2 text-right">{formatINR(amountPerPerson)}</td>
                  </tr>
                ))
              ) : (
                <tr style={{ borderBottom: `1px solid ${DARK_GREEN}` }}>
                  <td className="px-2 py-2 text-center">1</td>
                  <td className="px-2 py-2">
                    <div className="font-semibold">{invoice.packageName || "Travel Package"}</div>
                    {invoice.packageType && <div className="text-[8px] font-semibold" style={{ color: GOLD }}>{formatPackageType(invoice.packageType)}</div>}
                    {invoice.roomType && <div className="text-[8px]" style={{ color: "#555" }}>Room: {invoice.roomType}</div>}
                    {invoice.maktabNumber && <div className="text-[8px]" style={{ color: "#555" }}>Maktab: {invoice.maktabNumber}</div>}
                    {invoice.travelDate && <div className="text-[8px]" style={{ color: "#555" }}>Travel: {fmtDate(invoice.travelDate)}</div>}
                  </td>
                  <td className="px-2 py-2 text-center">{invoice.sacCode || "998555"}</td>
                  <td className="px-2 py-2 text-center">—</td>
                  <td className="px-2 py-2 text-center">—</td>
                  <td className="px-2 py-2 text-right">{formatINR(totalAmount)}</td>
                  <td className="px-2 py-2 text-right">
                    {formatINR(gstAmount)}
                    <div className="text-[8px]">({gstPercent}%)</div>
                  </td>
                  <td className="px-2 py-2 text-right">{formatINR(finalAmount)}</td>
                </tr>
              )}
              {/* SUBTOTAL row */}
              <tr className="font-bold" style={{ borderTop: `2px solid ${DARK_GREEN}` }}>
                <td colSpan={5} className="px-2 py-2 text-right">SUBTOTAL</td>
                <td className="px-2 py-2 text-right"></td>
                <td className="px-2 py-2 text-right">{"\u20B9"} {formatINR(gstAmount)}</td>
                <td className="px-2 py-2 text-right">{"\u20B9"} {formatINR(finalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* TERMS + TAX SUMMARY */}
        <div className="flex" style={{ borderTop: `1px solid ${DARK_GREEN}` }}>
          {/* LEFT: Terms & Conditions */}
          <div className="w-[55%] p-3 text-[8px] leading-snug" style={{ borderRight: `1px solid ${DARK_GREEN}` }}>
            <div className="font-bold text-[10px] mb-1" style={{ color: DARK_GREEN }}>TERMS AND CONDITIONS</div>
            <div className="text-[8px] leading-relaxed">
              <p className="font-semibold mt-1">Terms and Conditions - Alburhan Tours and Travels</p>
              <p className="font-semibold mt-2">Booking and Payment:</p>
              <p>a. Customers are required to complete the booking form and provide accurate information.</p>
              <p>b. A deposit is due upon booking, with the remaining balance payable as specified in the invoice.</p>
              <p>c. Cancellations are subject to our cancellation policy, which will be provided upon booking.</p>
              <p>d. GST 5% and TCS 5% are applicable.</p>

              <p className="font-semibold mt-2">Itinerary and Services:</p>
              <p>a. Alburhan Tours and Travels will provide a detailed itinerary for the Hajj or Umrah tour, including dates, destinations, and activities.</p>
              <p>b. The package includes accommodation, transportation, meals, and guided tours, as specified in the itinerary.</p>
              <p>c. Additional services or upgrades may be available upon request and are subject to availability and additional charges.</p>

              <p className="font-semibold mt-2">Travel Documents and Insurance:</p>
              <p>a. Customers are responsible for obtaining and maintaining valid travel documents, including passports, and health certificates, excluding visas which will be provided by the us as required.</p>
              <p>b. We strongly recommend customers to obtain comprehensive travel insurance to cover any unforeseen circumstances or emergencies.</p>

              <p className="font-semibold mt-2">Health and Safety:</p>
              <p>a. Customers are advised to consult with their healthcare provider and follow any recommended vaccinations or health precautions before embarking on the tour.</p>
              <p>b. Alburhan Tours and Travels prioritizes the safety and security of our customers and will take reasonable measures to ensure a safe and comfortable journey.</p>

              <p className="font-semibold mt-2">Responsibilities of Alburhan Tours and Travels:</p>
              <p>a. We will provide the services and accommodations as outlined in the agreed itinerary.</p>
              <p>b. In the event of unforeseen circumstances or events beyond our control, we reserve the right to make necessary changes to the itinerary or services, providing suitable alternatives.</p>
              <p>c. We shall not be liable for any loss, delay, injury, or damage caused by circumstances beyond our reasonable control.</p>

              <p className="font-semibold mt-2">Customer Responsibilities:</p>
              <p>a. Customers are expected to comply with local laws, regulations, and customs during the tour.</p>
              <p>b. Promptness and adherence to the tour schedule are essential. Late arrivals may result in missed services without liability on our part.</p>
              <p>c. Customers are responsible for their behavior towards other travelers, tour guides, and local communities.</p>

              <p className="font-semibold mt-2">Dispute Resolution:</p>
              <p>a. In the event of any disputes, both parties agree to resolve the matter amicably through negotiation or mediation.</p>
              <p>b. If a resolution cannot be reached, any legal proceedings shall be subject to the jurisdiction of the courts in Burhanpur.</p>

              <p className="font-semibold mt-2">Limitation of Liability:</p>
              <p>a. Alburhan Tours and Travels shall not be liable for any loss, injury, damage, or delay caused by factors beyond our control, including but not limited to natural disasters, political unrest, or transportation delays.</p>
              <p>b. Our liability for any claims arising from the tour shall be limited to the total amount paid by the customer for the specific tour package.</p>

              <p className="mt-2 text-[7px] italic">By booking a tour with Alburhan Tours and Travels, customers agree to abide by these terms and conditions.</p>
            </div>
          </div>

          {/* RIGHT: Tax summary */}
          <div className="w-[45%] p-3">
            <table className="w-full text-[11px]">
              <tbody>
                <tr>
                  <td className="py-1 font-semibold">TAXABLE AMOUNT</td>
                  <td className="py-1 text-right font-semibold">{"\u20B9"} {formatINR(totalAmount)}</td>
                </tr>
                <tr>
                  <td className="py-1">CGST @{cgstRate}%</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(cgstAmount)}</td>
                </tr>
                <tr>
                  <td className="py-1">SGST @{sgstRate}%</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(sgstAmount)}</td>
                </tr>
                <tr style={{ borderTop: `2px solid ${DARK_GREEN}` }}>
                  <td className="py-1 font-bold" style={{ color: DARK_GREEN }}>TOTAL AMOUNT</td>
                  <td className="py-1 text-right font-bold" style={{ color: DARK_GREEN }}>{"\u20B9"} {formatINR(finalAmount)}</td>
                </tr>
                <tr>
                  <td className="py-1">Received Amount</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(advanceAmount)}</td>
                </tr>
                <tr>
                  <td className="py-1">Balance</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(balance)}</td>
                </tr>
                <tr style={{ borderTop: `1px solid ${DARK_GREEN}` }}>
                  <td className="py-1">Previous Balance</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(previousBalance)}</td>
                </tr>
                <tr className="font-bold">
                  <td className="py-1">Current Balance</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(currentBalance)}</td>
                </tr>
              </tbody>
            </table>

            {/* Amount in words */}
            <div className="mt-3 pt-2 text-center" style={{ borderTop: `1px solid ${DARK_GREEN}` }}>
              <div className="text-[9px]">Total Amount (in words)</div>
              <div className="text-[11px] font-semibold italic" style={{ color: DARK_GREEN }}>{numberToWords(Math.round(finalAmount))}</div>
            </div>
          </div>
        </div>

        {/* BANK DETAILS + QR CODES */}
        <div className="flex" style={{ borderTop: `1px solid ${DARK_GREEN}` }}>
          <div className="flex-1 p-3">
            <div className="font-bold text-[10px] mb-1" style={{ color: DARK_GREEN }}>BANK DETAILS</div>
            <table className="text-[10px]">
              <tbody>
                <tr>
                  <td className="pr-3 py-[1px]">Bank:</td>
                  <td className="font-semibold py-[1px]">{invoice.bankName}, {invoice.bankBranch}</td>
                </tr>
                <tr>
                  <td className="pr-3 py-[1px]">IFSC Code:</td>
                  <td className="font-semibold py-[1px]">{invoice.bankIfsc}</td>
                </tr>
                <tr>
                  <td className="pr-3 py-[1px]">Account No:</td>
                  <td className="font-semibold py-[1px]">{invoice.bankAccount}</td>
                </tr>
              </tbody>
            </table>

            {/* WhatsApp Contact */}
            <div className="mt-2 pt-2 text-[9px]" style={{ borderTop: `1px solid #ddd` }}>
              <span className="font-semibold" style={{ color: DARK_GREEN }}>Customer Support (WhatsApp):</span>{" "}
              <span>+91 9893989786</span>
            </div>
          </div>

          {/* UPI Payment QR */}
          <div className="p-3 flex flex-col items-center justify-center" style={{ borderLeft: `1px solid ${DARK_GREEN}`, minWidth: "110px" }}>
            <div className="text-[8px] font-bold mb-1 text-center" style={{ color: DARK_GREEN }}>PAY VIA UPI</div>
            <QRCodeSVG
              value={`upi://pay?pa=${invoice.bankAccount || "50200011391336"}@hdfcbank&pn=ALBURHAN+TOURS+%26+TRAVELS&am=${currentBalance > 0 ? currentBalance.toFixed(2) : ""}&cu=INR&tn=Invoice+${invoice.invoiceNumber || invoice.bookingNumber || ""}`}
              size={72}
              level="M"
              fgColor={DARK_GREEN}
            />
            <div className="text-[7px] mt-1 text-center" style={{ color: "#555" }}>
              Balance: ₹{formatINR(currentBalance)}
            </div>
          </div>

          {/* Invoice Verification QR */}
          <div className="p-3 flex flex-col items-center justify-center" style={{ borderLeft: `1px solid ${DARK_GREEN}`, minWidth: "100px" }}>
            <div className="text-[8px] font-bold mb-1 text-center" style={{ color: DARK_GREEN }}>VERIFY INVOICE</div>
            <QRCodeSVG value={verificationUrl} size={72} level="M" fgColor={DARK_GREEN} />
            <div className="text-[7px] mt-1 text-center" style={{ color: DARK_GREEN }}>Scan to verify</div>
          </div>
        </div>

        {/* SIGNATURE */}
        <div className="p-3 flex justify-end" style={{ borderTop: `1px solid ${DARK_GREEN}` }}>
          <div className="text-right">
            <div className="h-14"></div>
            <div className="text-[10px]">Authorised Signature for</div>
            <div className="text-[11px] font-bold" style={{ color: DARK_GREEN }}>ALBURHAN TOURS & TRAVELS</div>
          </div>
        </div>

        {/* FOOTER BAR */}
        <div style={{ borderTop: `2px solid ${GOLD}`, padding: "6px 16px", color: DARK_GREEN }} className="text-[8px] text-center">
          Shop No 8-5, Khanka Masjid Complex, Sanwara Road, Burhanpur 450331 M.P. | Tel: {invoice.companyPhone} | {invoice.companyEmail} | GSTIN: {invoice.gstin}
        </div>
      </div>
    </div>
  );
}

export default function Invoice() {
  const params = useParams<{ bookingNumber: string }>();
  const identifier = params.bookingNumber ?? "";
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { toast } = useToast();

  const isInvoiceNumber = identifier.startsWith("INV");

  const bookingQuery = useGetPublicInvoice(isInvoiceNumber ? "" : identifier, { query: { enabled: !isInvoiceNumber && !!identifier } });
  const invoiceNumQuery = useGetPublicInvoiceByNumber(isInvoiceNumber ? identifier : "", { query: { enabled: isInvoiceNumber && !!identifier } });

  const activeQuery = isInvoiceNumber ? invoiceNumQuery : bookingQuery;
  const { data: invoice, isLoading, error } = activeQuery;

  const handleDownload = async () => {
    if (!invoiceRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadPdf(invoiceRef.current, { filename: `Invoice-${identifier}.pdf`, orientation: "portrait" });
    } finally { setPdfLoading(false); }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied!", description: "Invoice link copied to clipboard." });
    setShareOpen(false);
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`Assalamualaikum, here is your invoice from Al Burhan Tours & Travels:\n${window.location.href}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
    setShareOpen(false);
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Invoice from Al Burhan Tours & Travels`);
    const body = encodeURIComponent(`Please find your invoice here:\n${window.location.href}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    setShareOpen(false);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MainLayout>
    );
  }

  if (error || !invoice) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-serif font-bold mb-2">Invoice Not Found</h2>
            <p className="text-muted-foreground">This invoice may not exist or the booking is not yet confirmed.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <>
      <MainLayout>
        <div className="max-w-4xl mx-auto py-8 px-4">
          <div className="flex flex-wrap gap-3 mb-6 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={pdfLoading}
              className="border-[#0B3D2E] text-[#0B3D2E] hover:bg-[#0B3D2E] hover:text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              {pdfLoading ? "Generating..." : "Download PDF"}
            </Button>
            <Popover open={shareOpen} onOpenChange={setShareOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#C9A23F] text-[#C9A23F] hover:bg-[#C9A23F] hover:text-white"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={handleWhatsApp}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted text-left w-full"
                  >
                    <svg className="w-4 h-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </button>
                  <button
                    onClick={handleEmail}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted text-left w-full"
                  >
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Email
                  </button>
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted text-left w-full"
                  >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                    Copy Link
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div ref={invoiceRef} id="invoice-content">
            <InvoiceContent invoice={invoice} />
          </div>
        </div>
      </MainLayout>
    </>
  );
}
