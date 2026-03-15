import { useRef } from "react";
import { useParams } from "wouter";
import { useGetPublicInvoice } from "@workspace/api-client-react";
import type { Invoice as InvoiceType, Pilgrim } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Printer, Share2, Download } from "lucide-react";
import { downloadPdf } from "@/lib/pdf-download";

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

function formatINRWhole(amount: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function fmtDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(dateString));
  } catch { return dateString; }
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="text-left py-1 px-2 text-[11px] whitespace-nowrap border border-black">{label}</td>
      <td className="py-1 px-1 text-[11px] border border-black text-center">:</td>
      <td className="text-right py-1 px-2 text-[11px] font-semibold whitespace-nowrap border border-black">{value || ""}</td>
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

  return (
    <div className="bg-white text-black" style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "12px", lineHeight: 1.4 }}>
      <div className="border border-black">
        {/* HEADER */}
        <div className="flex border-b border-black">
          <div className="w-[40%] p-3 border-r border-black">
            <div className="font-bold text-[15px] leading-tight mb-1">ALBURHAN TOURS &<br />TRAVELS</div>
            <div className="text-[10px] leading-snug mt-1">
              {invoice.companyAddress}
            </div>
            <div className="text-[10px] mt-1">GSTIN : {invoice.gstin}</div>
            <div className="text-[10px]">Mobile : {invoice.companyPhone}</div>
            <div className="text-[10px]">Email : {invoice.companyEmail}</div>
            <div className="text-[10px]">PAN Number : {invoice.pan}</div>
          </div>
          <div className="w-[20%] flex flex-col items-center justify-start p-3 border-r border-black">
            <div className="font-bold text-[14px] text-center">TAX INVOICE</div>
            <div className="text-[9px] mt-1 text-center">ORIGINAL FOR RECIPIENT</div>
          </div>
          <div className="w-[40%] p-0">
            <table className="w-full border-collapse">
              <tbody>
                <MetaRow label="Invoice No." value={invoice.invoiceNumber || ""} />
                <MetaRow label="Invoice Date" value={fmtDate(invoice.paymentDate)} />
                <MetaRow label="Due Date" value={fmtDate(invoice.dueDate)} />
                <MetaRow label="BANK NAME" value={invoice.bankName || ""} />
                <MetaRow label="DATE AND CHEQUE" value={invoice.chequeInfo || ""} />
                <MetaRow label="HAJ YEARS" value={invoice.hajYear || ""} />
              </tbody>
            </table>
          </div>
        </div>

        {/* BILL TO */}
        <div className="border-b border-black p-3">
          <div className="font-bold text-[11px] mb-1 px-2 py-1 inline-block border border-black">BILL TO</div>
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
              <tr>
                <th className="border-y border-black px-2 py-2 text-center w-[6%]">S.NO.</th>
                <th className="border-y border-black px-2 py-2 text-left w-[20%]">SERVICES</th>
                <th className="border-y border-black px-2 py-2 text-center w-[8%]">SAC</th>
                <th className="border-y border-black px-2 py-2 text-center w-[14%]">PASSPORT NO</th>
                <th className="border-y border-black px-2 py-2 text-center w-[12%]">DATE OF ISSUE</th>
                <th className="border-y border-black px-2 py-2 text-right w-[14%]">RATE</th>
                <th className="border-y border-black px-2 py-2 text-right w-[12%]">TAX</th>
                <th className="border-y border-black px-2 py-2 text-right w-[14%]">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {pilgrims.length > 0 ? (
                pilgrims.map((p, i) => (
                  <tr key={i} className="border-b border-black">
                    <td className="px-2 py-2 text-center">{i + 1}</td>
                    <td className="px-2 py-2">
                      <div className="font-semibold">{invoice.packageName || "Travel Package"}</div>
                    </td>
                    <td className="px-2 py-2 text-center">{invoice.sacCode || "998555"}</td>
                    <td className="px-2 py-2 text-center">{p.passportNumber || "—"}</td>
                    <td className="px-2 py-2 text-center">—</td>
                    <td className="px-2 py-2 text-right">{formatINR(pricePerPerson)}</td>
                    <td className="px-2 py-2 text-right">
                      {formatINR(taxPerPerson)}
                      <div className="text-[8px]">({gstPercent}%)</div>
                    </td>
                    <td className="px-2 py-2 text-right">{formatINR(amountPerPerson)}</td>
                  </tr>
                ))
              ) : (
                <tr className="border-b border-black">
                  <td className="px-2 py-2 text-center">1</td>
                  <td className="px-2 py-2">
                    <div className="font-semibold">{invoice.packageName || "Travel Package"}</div>
                  </td>
                  <td className="px-2 py-2 text-center">{invoice.sacCode || "998555"}</td>
                  <td className="px-2 py-2 text-center">—</td>
                  <td className="px-2 py-2 text-center">—</td>
                  <td className="px-2 py-2 text-right">{formatINR(totalAmount)}</td>
                  <td className="px-2 py-2 text-right">
                    {formatINR(gstAmount)}
                    <div className="text-[8px] text-gray-500">({gstPercent}%)</div>
                  </td>
                  <td className="px-2 py-2 text-right">{formatINR(finalAmount)}</td>
                </tr>
              )}
              {/* SUBTOTAL row */}
              <tr className="border-t border-black font-bold">
                <td colSpan={5} className="px-2 py-2 text-right">SUBTOTAL</td>
                <td className="px-2 py-2 text-right"></td>
                <td className="px-2 py-2 text-right">{"\u20B9"} {formatINR(gstAmount)}</td>
                <td className="px-2 py-2 text-right">{"\u20B9"} {formatINR(finalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* TERMS + TAX SUMMARY */}
        <div className="flex border-t border-black">
          {/* LEFT: Terms & Conditions */}
          <div className="w-[55%] p-3 border-r border-black text-[8px] leading-snug">
            <div className="font-bold text-[10px] mb-1">TERMS AND CONDITIONS</div>
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
                <tr className="border-t border-black">
                  <td className="py-1 font-bold">TOTAL AMOUNT</td>
                  <td className="py-1 text-right font-bold">{"\u20B9"} {formatINR(finalAmount)}</td>
                </tr>
                <tr>
                  <td className="py-1">Received Amount</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(advanceAmount)}</td>
                </tr>
                <tr>
                  <td className="py-1">Balance</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(balance)}</td>
                </tr>
                <tr className="border-t border-black">
                  <td className="py-1">Previous Balance</td>
                  <td className="py-1 text-right">{"\u20B9"} {previousBalance}</td>
                </tr>
                <tr className="font-bold">
                  <td className="py-1">Current Balance</td>
                  <td className="py-1 text-right">{"\u20B9"} {formatINR(currentBalance)}</td>
                </tr>
              </tbody>
            </table>

            {/* Amount in words */}
            <div className="mt-3 border-t border-black pt-2 text-center">
              <div className="text-[9px]">Total Amount (in words)</div>
              <div className="text-[11px] font-semibold italic">{numberToWords(Math.round(finalAmount))}</div>
            </div>
          </div>
        </div>

        {/* BANK DETAILS */}
        <div className="border-t border-black p-3">
          <div className="font-bold text-[10px] mb-1">BANK DETAILS</div>
          <table className="text-[10px]">
            <tbody>
              <tr>
                <td className="pr-3 py-[1px]">Name:</td>
                <td className="font-semibold py-[1px]">{invoice.bankName}</td>
              </tr>
              <tr>
                <td className="pr-3 py-[1px]">IFSC Code:</td>
                <td className="font-semibold py-[1px]">{invoice.bankIfsc}</td>
              </tr>
              <tr>
                <td className="pr-3 py-[1px]">Account No:</td>
                <td className="font-semibold py-[1px]">{invoice.bankAccount}</td>
              </tr>
              <tr>
                <td className="pr-3 py-[1px]">Bank:</td>
                <td className="font-semibold py-[1px]">{invoice.bankName}, {invoice.bankBranch}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SIGNATURE */}
        <div className="border-t border-black p-3 flex justify-end">
          <div className="text-right">
            <div className="h-14"></div>
            <div className="text-[10px]">Authorised Signature for</div>
            <div className="text-[11px] font-bold">ALBURHAN TOURS & TRAVELS</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Invoice() {
  const params = useParams<{ bookingNumber: string }>();
  const bookingNumber = params.bookingNumber;
  const invoiceRef = useRef<HTMLDivElement>(null);

  const queryResult = useGetPublicInvoice(bookingNumber ?? "");
  const { data: invoice, isLoading, error } = queryResult;

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

  const handlePrint = () => window.print();
  const handleDownloadPdf = () => {
    downloadPdf(invoiceRef.current, {
      filename: `Invoice-${invoice.invoiceNumber || bookingNumber}.pdf`,
      orientation: "portrait",
      margin: 5,
    });
  };
  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: `Invoice ${invoice.invoiceNumber}`, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert("Invoice link copied to clipboard!");
    }
  };

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } .print-area { padding: 0 !important; margin: 0 !important; } }`}</style>
      <MainLayout>
        <div className="max-w-4xl mx-auto py-8 px-4 print-area">
          <div className="no-print flex gap-3 mb-6 justify-end">
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}><Download className="w-4 h-4 mr-2" />Download PDF</Button>
            <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Print</Button>
            <Button variant="outline" size="sm" onClick={handleShare}><Share2 className="w-4 h-4 mr-2" />Share</Button>
          </div>

          <div ref={invoiceRef} id="invoice-content">
            <InvoiceContent invoice={invoice} />
          </div>
        </div>
      </MainLayout>
    </>
  );
}
