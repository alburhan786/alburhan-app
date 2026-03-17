import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { QRCodeSVG } from "qrcode.react";
import { Search, ScanLine, User, Hash, Package, CreditCard, Calendar, Phone, MapPin, Printer, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

type BookingStatus = "pending" | "approved" | "confirmed" | "rejected" | "cancelled";

interface Pilgrim {
  name: string;
  passportNumber?: string;
  dateOfBirth?: string;
  passportExpiry?: string;
}

interface FoundBooking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  packageName?: string;
  numberOfPilgrims: number;
  roomType?: string;
  totalAmount?: number;
  finalAmount?: number;
  advanceAmount?: number;
  invoiceNumber?: string;
  createdAt: string;
  preferredDepartureDate?: string;
  isOffline?: boolean;
  pilgrims?: Pilgrim[];
  notes?: string;
}

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock size={14} /> },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <AlertCircle size={14} /> },
  confirmed: { label: "Confirmed", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle size={14} /> },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle size={14} /> },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <XCircle size={14} /> },
};

function buildQR(booking: FoundBooking): string {
  const lines = [
    `AL BURHAN TOURS & TRAVELS`,
    `Booking: ${booking.bookingNumber}`,
    `Name: ${booking.customerName}`,
    `Mobile: ${booking.customerMobile}`,
    booking.packageName ? `Package: ${booking.packageName}` : "",
    `Status: ${booking.status.toUpperCase()}`,
    booking.invoiceNumber ? `Invoice: ${booking.invoiceNumber}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildPilgrimQR(p: Pilgrim, booking: FoundBooking): string {
  const lines = [
    `AL BURHAN TOURS & TRAVELS`,
    `Booking: ${booking.bookingNumber}`,
    `Pilgrim: ${p.name}`,
    p.passportNumber ? `Passport: ${p.passportNumber}` : "",
    p.dateOfBirth ? `DOB: ${p.dateOfBirth}` : "",
    p.passportExpiry ? `Expiry: ${p.passportExpiry}` : "",
    booking.packageName ? `Package: ${booking.packageName}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export default function QRTracker() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<FoundBooking | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { toast } = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    if (!q) return;
    setLoading(true);
    setBooking(null);
    setNotFound(false);
    try {
      const res = await fetch(`${API}/api/bookings?limit=200`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const found = (data.bookings || []).find(
        (b: FoundBooking) =>
          b.bookingNumber.toUpperCase() === q ||
          b.customerName.toUpperCase().includes(query.trim().toUpperCase()) ||
          (b.customerMobile || "").includes(query.trim()) ||
          (b.pilgrims || []).some((p: Pilgrim) => (p.passportNumber || "").toUpperCase() === q || (p.name || "").toUpperCase().includes(query.trim().toUpperCase()))
      );
      if (found) {
        setBooking(found);
      } else {
        setNotFound(true);
      }
    } catch {
      toast({ title: "Error", description: "Failed to search bookings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const status = booking ? (STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending) : null;

  return (
    <AdminLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <ScanLine className="w-7 h-7 text-[#0B3D2E]" />
          <h1 className="text-3xl font-serif font-bold text-foreground">QR Pilgrim Tracker</h1>
        </div>
        <p className="text-muted-foreground">Search by Booking Reference, Pilgrim Name, Mobile, or Passport Number.</p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-10 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/40 focus:border-[#0B3D2E] bg-white shadow-sm"
            placeholder="e.g. ABT2603xxxx  or  Mohammed Ali  or  9876543210"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-[#0B3D2E] text-white rounded-xl font-semibold text-sm hover:bg-[#0d5038] transition shadow-sm disabled:opacity-60"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Not Found */}
      {notFound && (
        <div className="max-w-xl bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h3 className="font-bold text-red-700 text-lg mb-1">No Booking Found</h3>
          <p className="text-sm text-red-600">No result matched "<strong>{query}</strong>". Check the reference or try name/mobile.</p>
        </div>
      )}

      {/* Result */}
      {booking && status && (
        <div className="space-y-6 max-w-4xl">

          {/* Booking Header Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            <div className="bg-[#0B3D2E] px-6 py-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-white font-bold text-xl tracking-widest">{booking.bookingNumber}</span>
                  {booking.isOffline && <span className="text-[10px] bg-amber-400 text-white font-bold px-2 py-0.5 rounded-full">OFFLINE</span>}
                </div>
                <p className="text-white/60 text-xs">Created: {formatDate(booking.createdAt)}</p>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold ${status.color}`}>
                {status.icon} {status.label}
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Customer Info */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Customer</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2"><User size={14} className="text-[#0B3D2E]" /><span className="font-bold text-base">{booking.customerName}</span></div>
                    <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /><span>{booking.customerMobile}</span></div>
                    {booking.customerEmail && <div className="flex items-center gap-2"><span className="text-gray-400 text-xs">✉</span><span>{booking.customerEmail}</span></div>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Package</p>
                    <div className="flex items-start gap-2 text-sm">
                      <Package size={14} className="text-[#0B3D2E] mt-0.5" />
                      <span className="font-medium">{booking.packageName || "—"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-5">{booking.numberOfPilgrims} Pilgrim(s) · {booking.roomType || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Payment</p>
                    <div className="text-sm space-y-1">
                      {booking.finalAmount ? <p className="font-mono font-bold text-[#0B3D2E]">₹{Number(booking.finalAmount).toLocaleString("en-IN")}</p>
                        : booking.totalAmount ? <p className="font-mono font-bold text-[#0B3D2E]">₹{Number(booking.totalAmount).toLocaleString("en-IN")}</p>
                          : <p className="text-muted-foreground">—</p>}
                      {booking.advanceAmount && booking.advanceAmount > 0 && (
                        <p className="text-xs text-emerald-600 font-medium">Advance: ₹{Number(booking.advanceAmount).toLocaleString("en-IN")}</p>
                      )}
                      {booking.invoiceNumber && <p className="text-xs font-mono text-blue-600">{booking.invoiceNumber}</p>}
                    </div>
                  </div>
                  {booking.preferredDepartureDate && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Departure</p>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{formatDate(booking.preferredDepartureDate)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Master QR */}
              <div className="flex flex-col items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-200 p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-3 font-bold">Booking QR</p>
                <QRCodeSVG value={buildQR(booking)} size={120} level="M" fgColor="#0B3D2E" />
                <p className="text-[10px] text-muted-foreground mt-3 text-center font-mono">{booking.bookingNumber}</p>
                {booking.status === "confirmed" && booking.invoiceNumber && (
                  <Link href={`${BASE}invoice/${booking.bookingNumber}`}>
                    <button className="mt-3 text-xs text-[#0B3D2E] hover:underline font-semibold">View Invoice →</button>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Pilgrims */}
          {booking.pilgrims && booking.pilgrims.length > 0 && (
            <div>
              <h3 className="font-serif font-bold text-lg text-foreground mb-4">Pilgrim Details & QR Codes</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {booking.pilgrims.map((p, i) => (
                  <div key={i} className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 flex gap-4">
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <div className="w-8 h-8 rounded-full bg-[#0B3D2E] text-white flex items-center justify-center font-bold text-sm">{i + 1}</div>
                      <QRCodeSVG value={buildPilgrimQR(p, booking)} size={80} level="M" fgColor="#0B3D2E" />
                    </div>
                    <div className="space-y-1.5 text-sm min-w-0">
                      <p className="font-bold text-foreground truncate">{p.name}</p>
                      {p.passportNumber && (
                        <div className="flex items-center gap-1.5">
                          <CreditCard size={12} className="text-gray-400 shrink-0" />
                          <span className="font-mono text-xs truncate">{p.passportNumber}</span>
                        </div>
                      )}
                      {p.dateOfBirth && (
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-gray-400 shrink-0" />
                          <span className="text-xs">DOB: {p.dateOfBirth}</span>
                        </div>
                      )}
                      {p.passportExpiry && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 text-xs">📅</span>
                          <span className="text-xs">Expiry: {p.passportExpiry}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {booking.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Booking Notes</p>
              <pre className="text-sm text-amber-900 whitespace-pre-wrap font-sans leading-relaxed">{booking.notes}</pre>
            </div>
          )}

          {/* Print Actions */}
          <div className="bg-[#0B3D2E]/5 border border-[#0B3D2E]/15 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Printer size={16} className="text-[#0B3D2E]" />
              <p className="font-bold text-[#0B3D2E] text-sm">Print Options</p>
            </div>
            <p className="text-xs text-muted-foreground mb-4">These print options are available through Hajj Groups. Go to Hajj Groups → Select Group → Print.</p>
            <Link href="/admin/groups">
              <button className="px-5 py-2.5 bg-[#0B3D2E] text-white text-sm rounded-xl font-semibold hover:bg-[#0d5038] transition">
                Go to Hajj Groups & Print →
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Hint when empty */}
      {!booking && !notFound && !loading && (
        <div className="max-w-xl bg-white border border-border/50 rounded-2xl p-10 text-center shadow-sm">
          <ScanLine className="w-14 h-14 text-[#0B3D2E]/20 mx-auto mb-4" />
          <h3 className="font-serif font-bold text-xl text-foreground mb-2">QR Pilgrim Tracker</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">Enter any booking reference (e.g. <code className="bg-muted px-1 rounded text-xs font-mono">ABT2603xxxx</code>), pilgrim name, mobile number, or passport number to find booking details and QR codes.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-left text-xs text-muted-foreground">
            {[
              { icon: <Hash size={12} />, label: "Booking Reference", eg: "ABT2603xxxx" },
              { icon: <User size={12} />, label: "Customer/Pilgrim Name", eg: "Mohammed Ali" },
              { icon: <Phone size={12} />, label: "Mobile Number", eg: "9876543210" },
              { icon: <CreditCard size={12} />, label: "Passport Number", eg: "P1234567" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                <span className="text-[#0B3D2E] mt-0.5">{item.icon}</span>
                <div>
                  <p className="font-semibold text-gray-600">{item.label}</p>
                  <p className="text-gray-400 font-mono">{item.eg}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
