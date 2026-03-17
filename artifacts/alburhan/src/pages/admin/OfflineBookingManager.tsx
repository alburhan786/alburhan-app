import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListBookings, useListPackages } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus, Trash2, CheckCircle2, ClipboardList, User, Wallet, Users,
  Phone, MapPin, CreditCard, Hash, FileText, Eye, X
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const EMPTY_PILGRIM = {
  name: "", passportNumber: "", dateOfBirth: "",
  passportIssue: "", passportExpiry: "", address: "",
};

const BOOKING_TYPES = ["Offline", "Walk-in", "Agent", "In-house"];

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-4 border-b border-[#0B3D2E]/15">
      <span className="text-[#0B3D2E]">{icon}</span>
      <span className="text-xs font-bold text-[#0B3D2E] uppercase tracking-widest">{label}</span>
    </div>
  );
}

function SuccessBanner({ bookingNumber, onNew }: { bookingNumber: string; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
        <CheckCircle2 className="w-10 h-10 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-serif font-bold text-[#0B3D2E] mb-2">Booking Created!</h2>
      <p className="text-muted-foreground mb-4">Offline booking has been successfully saved.</p>
      <div className="bg-[#0B3D2E] text-white px-8 py-3 rounded-xl font-mono text-xl font-bold mb-6 shadow-lg tracking-widest">
        {bookingNumber}
      </div>
      <p className="text-xs text-muted-foreground mb-8">Keep this Booking Reference ID for your records.</p>
      <Button onClick={onNew} className="bg-[#0B3D2E] hover:bg-[#0d5038] text-white px-8">
        <Plus className="w-4 h-4 mr-2" /> Create Another Booking
      </Button>
    </div>
  );
}

export default function OfflineBookingManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: packagesData } = useListPackages({ active: true });
  const { data: bookingsData, isLoading } = useListBookings();
  const packages = packagesData || [];
  const offlineBookings = (bookingsData?.bookings || []).filter((b: any) => b.isOffline);

  const [loading, setLoading] = useState(false);
  const [createdRef, setCreatedRef] = useState<string | null>(null);
  const [viewBooking, setViewBooking] = useState<any | null>(null);

  const [bookingType, setBookingType] = useState("Offline");
  const [form, setForm] = useState({
    agentName: "",
    customerName: "",
    customerMobile: "",
    customerEmail: "",
    customerAddress: "",
    packageName: "",
    totalAmount: "",
    advanceAmount: "",
    roomType: "",
    paymentStatus: "pending" as "pending" | "paid",
    notes: "",
  });
  const [pilgrims, setPilgrims] = useState([{ ...EMPTY_PILGRIM }]);

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const totalAmt = parseFloat(form.totalAmount) || 0;
  const advAmt = parseFloat(form.advanceAmount) || 0;
  const balAmt = totalAmt > 0 ? Math.max(0, totalAmt - advAmt) : 0;

  const addPilgrim = () => setPilgrims(p => [...p, { ...EMPTY_PILGRIM }]);
  const removePilgrim = (i: number) => setPilgrims(p => p.filter((_, idx) => idx !== i));
  const setPilgrimField = (i: number, k: string, v: string) =>
    setPilgrims(p => p.map((row, idx) => idx === i ? { ...row, [k]: v } : row));

  const resetForm = () => {
    setForm({ agentName: "", customerName: "", customerMobile: "", customerEmail: "",
      customerAddress: "", packageName: "", totalAmount: "", advanceAmount: "",
      roomType: "", paymentStatus: "pending", notes: "" });
    setPilgrims([{ ...EMPTY_PILGRIM }]);
    setBookingType("Offline");
    setCreatedRef(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim()) { toast({ title: "Customer name is required", variant: "destructive" }); return; }
    if (!form.customerMobile.trim()) { toast({ title: "Mobile number is required", variant: "destructive" }); return; }
    if (!pilgrims[0].name.trim()) { toast({ title: "At least one pilgrim name is required", variant: "destructive" }); return; }

    setLoading(true);

    const notesLines: string[] = [];
    notesLines.push(`Booking Type: ${bookingType}`);
    if (form.agentName) notesLines.push(`Agent/Booked By: ${form.agentName}`);
    if (form.customerAddress) notesLines.push(`Customer Address: ${form.customerAddress}`);
    if (advAmt > 0) notesLines.push(`Advance Paid: ₹${advAmt.toLocaleString("en-IN")}`);
    if (balAmt > 0) notesLines.push(`Balance Due: ₹${balAmt.toLocaleString("en-IN")}`);
    pilgrims.forEach((p, i) => {
      if (p.passportIssue) notesLines.push(`Pilgrim ${i + 1} Passport Issue: ${p.passportIssue}`);
      if (p.address && p.address !== form.customerAddress) notesLines.push(`Pilgrim ${i + 1} Address: ${p.address}`);
    });
    if (form.notes) notesLines.push(form.notes);

    const payload: Record<string, unknown> = {
      customerName: form.customerName.trim(),
      customerMobile: form.customerMobile.trim().replace(/\D/g, ""),
      customerEmail: form.customerEmail.trim() || undefined,
      numberOfPilgrims: pilgrims.length,
      pilgrims: pilgrims
        .map(p => ({
          name: p.name.trim(),
          passportNumber: p.passportNumber.trim() || undefined,
          passportExpiry: p.passportExpiry.trim() || undefined,
          dateOfBirth: p.dateOfBirth.trim() || undefined,
        }))
        .filter(p => p.name),
      roomType: form.roomType || undefined,
      advanceAmount: advAmt > 0 ? advAmt : undefined,
      paymentStatus: form.paymentStatus,
      notes: notesLines.join("\n") || undefined,
    };

    if (form.packageName.trim()) {
      const matched = packages.find((pkg: any) =>
        pkg.name.toLowerCase() === form.packageName.trim().toLowerCase()
      );
      if (matched) payload.packageId = matched.id;
      else payload.packageName = form.packageName.trim();
    }

    if (totalAmt > 0) {
      payload.totalAmount = totalAmt;
    }

    try {
      const res = await fetch(`${API}/api/bookings/offline`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create booking");
      }
      const booking = await res.json();
      setCreatedRef(booking.bookingNumber);
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: "Booking Created!", description: `Ref: ${booking.bookingNumber}` });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/40 focus:border-[#0B3D2E] bg-white transition";
  const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Offline Booking</h1>
        <p className="text-muted-foreground mt-1">Create walk-in, agent, or in-house bookings without online payment.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">

        {/* Left: Form */}
        <div className="xl:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            {/* Header */}
            <div className="bg-[#0B3D2E] px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-base">New Offline Booking</h2>
                <p className="text-white/60 text-xs mt-0.5">Al Burhan Tours & Travels</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/60 uppercase">Booking Ref:</span>
                <span className="font-mono text-amber-300 text-sm font-bold">AUTO</span>
              </div>
            </div>

            {createdRef ? (
              <div className="p-8">
                <SuccessBanner bookingNumber={createdRef} onNew={resetForm} />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-7">

                {/* 1. Booking Info */}
                <div>
                  <SectionHeader icon={<Hash size={14} />} label="Booking Info" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Booking Type</label>
                      <div className="flex flex-wrap gap-2">
                        {BOOKING_TYPES.map(t => (
                          <button
                            key={t} type="button"
                            onClick={() => setBookingType(t)}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${bookingType === t ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow" : "bg-white text-gray-600 border-gray-200 hover:border-[#0B3D2E]"}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Agent Name / Booked By</label>
                      <input className={inputCls} type="text" placeholder="Agent name or staff member" value={form.agentName} onChange={e => setField("agentName", e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* 2. Customer Details */}
                <div>
                  <SectionHeader icon={<User size={14} />} label="Customer Details" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Customer Name <span className="text-red-500">*</span></label>
                      <input required className={inputCls} type="text" placeholder="Full name" value={form.customerName} onChange={e => setField("customerName", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Mobile Number <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                        <input required className={`${inputCls} pl-8`} type="tel" placeholder="10-digit mobile" maxLength={15} value={form.customerMobile} onChange={e => setField("customerMobile", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Email (optional)</label>
                      <input className={inputCls} type="email" placeholder="email@example.com" value={form.customerEmail} onChange={e => setField("customerEmail", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Room Type</label>
                      <select className={inputCls} value={form.roomType} onChange={e => setField("roomType", e.target.value)}>
                        <option value="">— Select room type —</option>
                        <option value="sharing">Sharing</option>
                        <option value="double">Double</option>
                        <option value="triple">Triple</option>
                        <option value="quad">Quad</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Address</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 text-gray-400 w-3.5 h-3.5" />
                        <input className={`${inputCls} pl-8`} type="text" placeholder="Full address" value={form.customerAddress} onChange={e => setField("customerAddress", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Package & Payment */}
                <div>
                  <SectionHeader icon={<Wallet size={14} />} label="Package & Payment" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className={labelCls}>Package Name</label>
                      {packages.length > 0 ? (
                        <select
                          className={inputCls}
                          value={form.packageName}
                          onChange={e => setField("packageName", e.target.value)}
                        >
                          <option value="">— Select a package or type custom —</option>
                          {packages.map((pkg: any) => (
                            <option key={pkg.id} value={pkg.name}>{pkg.name}</option>
                          ))}
                          <option value="__custom__">Other / Custom Package</option>
                        </select>
                      ) : null}
                      {(form.packageName === "__custom__" || packages.length === 0) && (
                        <input
                          className={`${inputCls} mt-2`}
                          type="text"
                          placeholder="Type package name..."
                          value={form.packageName === "__custom__" ? "" : form.packageName}
                          onChange={e => setField("packageName", e.target.value)}
                        />
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Total Amount (₹)</label>
                      <input className={inputCls} type="number" min="0" placeholder="0" value={form.totalAmount} onChange={e => setField("totalAmount", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Advance Payment (₹)</label>
                      <input className={inputCls} type="number" min="0" placeholder="0" value={form.advanceAmount} onChange={e => setField("advanceAmount", e.target.value)} />
                    </div>

                    {/* Amount Summary */}
                    {totalAmt > 0 && (
                      <div className="col-span-2 grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Total Amount</p>
                          <p className="font-mono font-bold text-gray-800 text-base">₹{totalAmt.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                          <p className="text-[10px] text-emerald-600 uppercase tracking-wide mb-1">Advance Paid</p>
                          <p className="font-mono font-bold text-emerald-700 text-base">₹{advAmt.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                          <p className="text-[10px] text-red-600 uppercase tracking-wide mb-1">Balance Due</p>
                          <p className="font-mono font-bold text-red-600 text-base">₹{balAmt.toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                    )}

                    <div className="col-span-2">
                      <label className={labelCls}>Payment Status</label>
                      <div className="flex gap-3">
                        <button
                          type="button" onClick={() => setField("paymentStatus", "pending")}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${form.paymentStatus === "pending" ? "bg-amber-500 text-white border-amber-500 shadow-md" : "bg-white text-gray-600 border-gray-200 hover:border-amber-400"}`}
                        >
                          Pending / Advance Only
                        </button>
                        <button
                          type="button" onClick={() => setField("paymentStatus", "paid")}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${form.paymentStatus === "paid" ? "bg-emerald-600 text-white border-emerald-600 shadow-md" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-500"}`}
                        >
                          Fully Paid
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Pilgrim(s) */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-[#0B3D2E]" />
                      <span className="text-xs font-bold text-[#0B3D2E] uppercase tracking-widest">Pilgrim Details ({pilgrims.length})</span>
                    </div>
                    <button
                      type="button" onClick={addPilgrim}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0B3D2E] text-white text-xs rounded-lg font-semibold hover:bg-[#0d5038] transition shadow-sm"
                    >
                      <Plus size={12} /> Add Pilgrim
                    </button>
                  </div>

                  <div className="space-y-4">
                    {pilgrims.map((p, i) => (
                      <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 relative">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#0B3D2E] text-white text-xs flex items-center justify-center font-bold">{i + 1}</div>
                            <span className="text-xs font-bold text-[#0B3D2E] uppercase tracking-wide">Pilgrim {i + 1}</span>
                          </div>
                          {pilgrims.length > 1 && (
                            <button type="button" onClick={() => removePilgrim(i)} className="text-red-400 hover:text-red-600 transition p-1 rounded-lg hover:bg-red-50">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className={labelCls}>Full Name (as on passport) <span className="text-red-500">{i === 0 ? "*" : ""}</span></label>
                            <input
                              required={i === 0} className={inputCls} type="text"
                              placeholder="As written on passport"
                              value={p.name} onChange={e => setPilgrimField(i, "name", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>Passport Number</label>
                            <div className="relative">
                              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                              <input className={`${inputCls} pl-8 font-mono uppercase`} type="text" placeholder="e.g. P1234567"
                                value={p.passportNumber} onChange={e => setPilgrimField(i, "passportNumber", e.target.value.toUpperCase())} />
                            </div>
                          </div>
                          <div>
                            <label className={labelCls}>Date of Birth</label>
                            <input className={inputCls} type="text" placeholder="DD/MM/YYYY"
                              value={p.dateOfBirth} onChange={e => setPilgrimField(i, "dateOfBirth", e.target.value)} />
                          </div>
                          <div>
                            <label className={labelCls}>Passport Issue Date</label>
                            <input className={inputCls} type="text" placeholder="DD/MM/YYYY"
                              value={p.passportIssue} onChange={e => setPilgrimField(i, "passportIssue", e.target.value)} />
                          </div>
                          <div>
                            <label className={labelCls}>Passport Expiry Date</label>
                            <input className={inputCls} type="text" placeholder="DD/MM/YYYY"
                              value={p.passportExpiry} onChange={e => setPilgrimField(i, "passportExpiry", e.target.value)} />
                          </div>
                          <div className="col-span-2">
                            <label className={labelCls}>Pilgrim Address (if different)</label>
                            <input className={inputCls} type="text" placeholder="Leave blank if same as customer address"
                              value={p.address} onChange={e => setPilgrimField(i, "address", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Notes */}
                <div>
                  <SectionHeader icon={<FileText size={14} />} label="Additional Notes" />
                  <textarea
                    className={inputCls} rows={3}
                    placeholder="Special requirements, dietary needs, accessibility, etc."
                    value={form.notes} onChange={e => setField("notes", e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-2 border-t">
                  <Button type="button" variant="outline" className="flex-1" onClick={resetForm}>Reset Form</Button>
                  <Button
                    type="submit" disabled={loading}
                    className="flex-1 bg-[#0B3D2E] hover:bg-[#0d5038] text-white font-semibold shadow-md"
                  >
                    {loading ? "Creating Booking..." : `Create ${form.paymentStatus === "paid" ? "Confirmed" : "Approved"} Booking`}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Right: Offline Bookings List */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden sticky top-8">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#0B3D2E]" />
              <h3 className="font-bold text-foreground text-sm">Offline Bookings</h3>
              <span className="ml-auto bg-[#0B3D2E]/10 text-[#0B3D2E] text-xs font-bold px-2 py-0.5 rounded-full">{offlineBookings.length}</span>
            </div>

            <div className="divide-y max-h-[70vh] overflow-y-auto">
              {isLoading ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Loading...</div>
              ) : offlineBookings.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">No offline bookings yet.</div>
              ) : offlineBookings.map((b: any) => (
                <div key={b.id} className="px-5 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-xs font-bold text-[#0B3D2E]">{b.bookingNumber}</span>
                        <StatusBadge status={b.status} />
                      </div>
                      <p className="font-semibold text-sm text-foreground truncate">{b.customerName}</p>
                      <p className="text-xs text-muted-foreground">{b.customerMobile}</p>
                      {b.packageName && <p className="text-xs text-muted-foreground truncate mt-0.5">{b.packageName}</p>}
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{formatDate(b.createdAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {b.finalAmount ? (
                        <p className="text-sm font-mono font-bold text-[#0B3D2E]">{formatCurrency(b.finalAmount)}</p>
                      ) : b.totalAmount ? (
                        <p className="text-sm font-mono font-bold text-[#0B3D2E]">₹{Number(b.totalAmount).toLocaleString("en-IN")}</p>
                      ) : null}
                      {b.advanceAmount && (
                        <p className="text-[10px] text-emerald-600 font-medium">Adv: ₹{Number(b.advanceAmount).toLocaleString("en-IN")}</p>
                      )}
                      <button
                        onClick={() => setViewBooking(b)}
                        className="mt-1 text-[10px] text-[#0B3D2E] hover:underline font-semibold flex items-center gap-0.5 ml-auto"
                      >
                        <Eye size={10} /> View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {viewBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewBooking(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#0B3D2E] px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <p className="text-white font-mono font-bold text-lg">{viewBooking.bookingNumber}</p>
                <p className="text-white/60 text-xs">{formatDate(viewBooking.createdAt)}</p>
              </div>
              <button onClick={() => setViewBooking(null)} className="text-white/60 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <InfoRow label="Customer" value={viewBooking.customerName} bold />
              <InfoRow label="Mobile" value={viewBooking.customerMobile} />
              {viewBooking.customerEmail && <InfoRow label="Email" value={viewBooking.customerEmail} />}
              {viewBooking.packageName && <InfoRow label="Package" value={viewBooking.packageName} />}
              <InfoRow label="Pilgrims" value={`${viewBooking.numberOfPilgrims}`} />
              {viewBooking.totalAmount && <InfoRow label="Total" value={`₹${Number(viewBooking.totalAmount).toLocaleString("en-IN")}`} />}
              {viewBooking.advanceAmount && <InfoRow label="Advance" value={`₹${Number(viewBooking.advanceAmount).toLocaleString("en-IN")}`} />}
              {viewBooking.notes && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <pre className="text-xs text-gray-700 bg-muted p-3 rounded-lg whitespace-pre-wrap font-sans leading-relaxed">{viewBooking.notes}</pre>
                </div>
              )}
              {Array.isArray(viewBooking.pilgrims) && viewBooking.pilgrims.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Pilgrims</p>
                  <div className="space-y-2">
                    {viewBooking.pilgrims.map((p: any, i: number) => (
                      <div key={i} className="bg-muted/50 rounded-lg p-3 text-xs">
                        <p className="font-bold">{i + 1}. {p.name}</p>
                        {p.passportNumber && <p className="text-muted-foreground font-mono mt-0.5">Passport: {p.passportNumber}</p>}
                        {p.dateOfBirth && <p className="text-muted-foreground">DOB: {p.dateOfBirth}</p>}
                        {p.passportExpiry && <p className="text-muted-foreground">Expiry: {p.passportExpiry}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700",
    confirmed: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${cls[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-muted-foreground text-xs w-24 shrink-0">{label}</span>
      <span className={`text-right text-sm ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
