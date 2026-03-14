import { useParams } from "wouter";
import { useGetPublicInvoice } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Printer, Share2 } from "lucide-react";

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
  return result.trim() + " Rupees Only";
}

function convert99(n: number, ones: string[], tens: string[]): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatInvoiceDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(dateString));
  } catch { return dateString; }
}

export default function Invoice() {
  const params = useParams<{ bookingNumber: string }>();
  const bookingNumber = params.bookingNumber;

  const { data: invoice, isLoading, error } = useGetPublicInvoice(bookingNumber!, {
    query: { enabled: !!bookingNumber },
  });

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
            <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" />Print</Button>
            <Button variant="outline" size="sm" onClick={handleShare}><Share2 className="w-4 h-4 mr-2" />Share</Button>
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden" id="invoice-content">
            <div className="bg-[#0A3D2A] text-white px-8 py-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-serif font-bold tracking-wide">{invoice.companyName}</h1>
                  <p className="text-emerald-200 text-sm mt-1 max-w-md leading-relaxed">{invoice.companyAddress}</p>
                  <p className="text-emerald-200 text-sm mt-1">Phone: {invoice.companyPhone}</p>
                  <p className="text-emerald-200 text-sm">Email: {invoice.companyEmail}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-serif font-bold text-[#C9A84C]">TAX INVOICE</div>
                  <p className="text-emerald-200 text-sm mt-2">GSTIN: {invoice.gstin}</p>
                  <p className="text-emerald-200 text-sm">PAN: {invoice.pan}</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Invoice Details</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Invoice No:</span> <span className="font-semibold">{invoice.invoiceNumber}</span></p>
                    <p><span className="text-gray-500">Invoice Date:</span> <span className="font-semibold">{formatInvoiceDate(invoice.paymentDate)}</span></p>
                    <p><span className="text-gray-500">Booking No:</span> <span className="font-semibold">{invoice.bookingNumber}</span></p>
                    {invoice.dueDate && (
                      <p><span className="text-gray-500">Due Date:</span> <span className="font-semibold">{formatInvoiceDate(invoice.dueDate)}</span></p>
                    )}
                    {invoice.departureDate && (
                      <p><span className="text-gray-500">Departure:</span> <span className="font-semibold">{formatInvoiceDate(invoice.departureDate)}</span></p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bill To</h3>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-base">{invoice.customerName}</p>
                    <p><span className="text-gray-500">Mobile:</span> {invoice.customerMobile}</p>
                    {invoice.customerEmail && (
                      <p><span className="text-gray-500">Email:</span> {invoice.customerEmail}</p>
                    )}
                    <p><span className="text-gray-500">Pilgrims:</span> {invoice.numberOfPilgrims}</p>
                    {invoice.roomType && (
                      <p><span className="text-gray-500">Room Type:</span> <span className="capitalize">{invoice.roomType}</span></p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-y border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">S.No</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600">SAC Code</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600">Qty</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Rate (₹)</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3">1</td>
                      <td className="px-4 py-3 font-medium">{invoice.packageName || "Travel Package"}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs">{invoice.sacCode}</td>
                      <td className="px-4 py-3 text-center">{invoice.numberOfPilgrims}</td>
                      <td className="px-4 py-3 text-right font-mono">{invoice.pricePerPerson ? formatINR(invoice.pricePerPerson) : "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">{invoice.totalAmount ? formatINR(invoice.totalAmount) : "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mb-8">
                <div className="w-72">
                  <div className="flex justify-between py-2 text-sm">
                    <span className="text-gray-500">Subtotal:</span>
                    <span className="font-mono">₹ {invoice.totalAmount ? formatINR(invoice.totalAmount) : "—"}</span>
                  </div>
                  <div className="flex justify-between py-2 text-sm border-b border-gray-100">
                    <span className="text-gray-500">GST ({invoice.gstPercent}%):</span>
                    <span className="font-mono">₹ {invoice.gstAmount ? formatINR(invoice.gstAmount) : "—"}</span>
                  </div>
                  <div className="flex justify-between py-3 text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-[#0A3D2A] font-mono">₹ {invoice.finalAmount ? formatINR(invoice.finalAmount) : "—"}</span>
                  </div>
                  {invoice.advanceAmount != null && invoice.advanceAmount > 0 && (
                    <>
                      <div className="flex justify-between py-2 text-sm border-t border-gray-100">
                        <span className="text-gray-500">Advance Paid:</span>
                        <span className="font-mono text-green-700">- ₹ {formatINR(invoice.advanceAmount)}</span>
                      </div>
                      <div className="flex justify-between py-2 text-sm font-semibold">
                        <span>Balance Due:</span>
                        <span className="font-mono text-red-700">₹ {invoice.finalAmount ? formatINR(invoice.finalAmount - invoice.advanceAmount) : "—"}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {invoice.finalAmount && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-8 text-sm">
                  <span className="font-semibold text-amber-800">Amount in Words: </span>
                  <span className="text-amber-900 italic">{numberToWords(Math.round(invoice.finalAmount))}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bank Details</h3>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500">Bank:</span> <span className="font-semibold">{invoice.bankName}</span></p>
                    <p><span className="text-gray-500">Branch:</span> {invoice.bankBranch}</p>
                    <p><span className="text-gray-500">A/C No:</span> <span className="font-mono font-semibold">{invoice.bankAccount}</span></p>
                    <p><span className="text-gray-500">IFSC:</span> <span className="font-mono font-semibold">{invoice.bankIfsc}</span></p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Terms & Conditions</h3>
                  <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                    <li>Payment is non-refundable once the visa process has begun.</li>
                    <li>Cancellation charges as per company policy.</li>
                    <li>All disputes subject to Mumbai jurisdiction.</li>
                    <li>GST is charged as per government norms (SAC 998555).</li>
                    <li>This is a computer generated invoice.</li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6 flex items-end justify-between">
                <div className="text-xs text-gray-400">
                  <p>This is a computer-generated invoice and does not require a physical signature.</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-700">For {invoice.companyName}</p>
                  <div className="mt-8 border-t border-gray-300 pt-1">
                    <p className="text-xs text-gray-500">Authorized Signatory</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#0A3D2A] text-center text-emerald-200 text-xs py-3">
              Thank you for choosing Al Burhan Tours & Travels — Serving pilgrims for 35+ years
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}
