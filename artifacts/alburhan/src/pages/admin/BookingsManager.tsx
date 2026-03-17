import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListBookings, useApproveBooking, useRejectBooking } from "@workspace/api-client-react";
import type { Booking, Pilgrim } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, ExternalLink, Plus, Trash2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function BookingDetailModal({ booking, open, onClose }: { booking: Booking | null; open: boolean; onClose: () => void }) {
  if (!booking) return null;

  const pilgrims = Array.isArray(booking.pilgrims) ? booking.pilgrims : [];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Booking Details</span>
            <Badge variant="outline" className="uppercase text-[10px] font-bold">{booking.status}</Badge>
            {booking.isOffline && <Badge className="bg-amber-500 text-white text-[9px]">Offline</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Booking Info</h4>
              <div className="space-y-1.5 text-sm">
                <p><span className="text-muted-foreground">Booking #:</span> <span className="font-mono font-bold">{booking.bookingNumber}</span></p>
                <p><span className="text-muted-foreground">Date:</span> {formatDate(booking.createdAt)}</p>
                {booking.invoiceNumber && <p><span className="text-muted-foreground">Invoice:</span> <span className="font-mono font-bold text-emerald-700">{booking.invoiceNumber}</span></p>}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Customer</h4>
              <div className="space-y-1.5 text-sm">
                <p className="font-bold text-base">{booking.customerName}</p>
                <p><span className="text-muted-foreground">Mobile:</span> {booking.customerMobile}</p>
                {booking.customerEmail && <p><span className="text-muted-foreground">Email:</span> {booking.customerEmail}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Package</h4>
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">{booking.packageName || "—"}</p>
                <p><span className="text-muted-foreground">Pilgrims:</span> {booking.numberOfPilgrims}</p>
                {booking.roomType && <p><span className="text-muted-foreground">Room:</span> <span className="capitalize">{booking.roomType}</span></p>}
                {booking.preferredDepartureDate && <p><span className="text-muted-foreground">Departure:</span> {formatDate(booking.preferredDepartureDate)}</p>}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Payment</h4>
              <div className="space-y-1.5 text-sm">
                {booking.totalAmount && <p><span className="text-muted-foreground">Total:</span> <span className="font-mono font-bold text-[#0B3D2E]">{formatCurrency(booking.totalAmount)}</span></p>}
                {booking.gstAmount && <p><span className="text-muted-foreground">GST:</span> <span className="font-mono">{formatCurrency(booking.gstAmount)}</span></p>}
                {booking.finalAmount && <p><span className="text-muted-foreground">Final:</span> <span className="font-mono font-bold text-[#0B3D2E]">{formatCurrency(booking.finalAmount)}</span></p>}
                {(booking as any).advanceAmount && <p><span className="text-muted-foreground">Advance:</span> <span className="font-mono text-emerald-700">₹{Number((booking as any).advanceAmount).toLocaleString("en-IN")}</span></p>}
                {(booking as any).paidAmount && <p><span className="text-muted-foreground">Paid Online:</span> <span className="font-mono font-bold text-orange-700">₹{Number((booking as any).paidAmount).toLocaleString("en-IN")}</span></p>}
                {(booking as any).paidAmount && booking.finalAmount && Number((booking as any).paidAmount) < Number(booking.finalAmount) && <p><span className="text-muted-foreground">Balance Due:</span> <span className="font-mono font-bold text-red-600">₹{(Number(booking.finalAmount) - Number((booking as any).paidAmount)).toLocaleString("en-IN")}</span></p>}
                {booking.razorpayPaymentId && <p><span className="text-muted-foreground">Razorpay:</span> <span className="font-mono text-xs">{booking.razorpayPaymentId}</span></p>}
              </div>
            </div>
          </div>

          {booking.rejectionReason && (
            <div>
              <h4 className="text-xs font-semibold text-red-600 uppercase mb-2">Rejection Reason</h4>
              <p className="text-sm bg-red-50 rounded-lg p-3 text-red-800">{booking.rejectionReason}</p>
            </div>
          )}

          {booking.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Notes</h4>
              <p className="text-sm bg-muted rounded-lg p-3 whitespace-pre-wrap">{booking.notes}</p>
            </div>
          )}

          {pilgrims.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Pilgrims ({pilgrims.length})</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Passport</th>
                      <th className="px-3 py-2 text-left">DOB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pilgrims.map((p: Pilgrim, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{p.name || "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.passportNumber || "—"}</td>
                        <td className="px-3 py-2 text-xs">{p.dateOfBirth || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {booking.status === "confirmed" && booking.invoiceNumber && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`${import.meta.env.BASE_URL}invoice/${booking.bookingNumber}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />View Invoice
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_PILGRIM = { name: "", passportNumber: "", passportIssue: "", passportExpiry: "", dateOfBirth: "", address: "" };

function OfflineBookingForm({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    agentName: "",
    customerName: "",
    customerMobile: "",
    customerEmail: "",
    packageName: "",
    totalAmount: "",
    advanceAmount: "",
    roomType: "",
    notes: "",
    paymentStatus: "pending" as "pending" | "paid",
  });
  const [pilgrims, setPilgrims] = useState([{ ...EMPTY_PILGRIM }]);

  const setField = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const addPilgrim = () => setPilgrims(p => [...p, { ...EMPTY_PILGRIM }]);
  const removePilgrim = (i: number) => setPilgrims(p => p.filter((_, idx) => idx !== i));
  const setPilgrimField = (i: number, key: string, value: string) =>
    setPilgrims(p => p.map((row, idx) => idx === i ? { ...row, [key]: value } : row));

  const totalAmt = parseFloat(form.totalAmount) || 0;
  const advAmt = parseFloat(form.advanceAmount) || 0;
  const balAmt = totalAmt > 0 ? totalAmt - advAmt : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim()) { toast({ title: "Customer name is required", variant: "destructive" }); return; }
    if (!form.customerMobile.trim()) { toast({ title: "Mobile number is required", variant: "destructive" }); return; }
    if (pilgrims[0].name.trim() === "") { toast({ title: "At least one pilgrim name is required", variant: "destructive" }); return; }

    setLoading(true);

    const notesLines: string[] = [];
    if (form.agentName) notesLines.push(`Agent: ${form.agentName}`);
    if (form.packageName) notesLines.push(`Package: ${form.packageName}`);
    if (totalAmt > 0) notesLines.push(`Total Amount: ₹${totalAmt.toLocaleString("en-IN")}`);
    if (advAmt > 0) notesLines.push(`Advance Paid: ₹${advAmt.toLocaleString("en-IN")}`);
    if (balAmt > 0) notesLines.push(`Balance Due: ₹${balAmt.toLocaleString("en-IN")}`);
    pilgrims.forEach((p, i) => {
      if (p.passportIssue) notesLines.push(`Pilgrim ${i+1} Passport Issue: ${p.passportIssue}`);
      if (p.address) notesLines.push(`Pilgrim ${i+1} Address: ${p.address}`);
    });
    if (form.notes) notesLines.push(`Notes: ${form.notes}`);

    const payload: Record<string, unknown> = {
      customerName: form.customerName.trim(),
      customerMobile: form.customerMobile.trim().replace(/\D/g, ""),
      customerEmail: form.customerEmail.trim() || undefined,
      numberOfPilgrims: pilgrims.length,
      pilgrims: pilgrims.map(p => ({
        name: p.name.trim(),
        passportNumber: p.passportNumber.trim() || undefined,
        passportExpiry: p.passportExpiry.trim() || undefined,
        dateOfBirth: p.dateOfBirth.trim() || undefined,
      })).filter(p => p.name),
      roomType: form.roomType || undefined,
      advanceAmount: advAmt > 0 ? advAmt : undefined,
      paymentStatus: form.paymentStatus,
      notes: notesLines.join("\n") || undefined,
    };

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
      toast({ title: "Offline Booking Created!", description: `Booking ID: ${booking.bookingNumber}` });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create booking", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";
  const inputCls = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A3D2A] focus:border-transparent";
  const sectionHdr = "text-sm font-bold text-[#0A3D2A] uppercase tracking-wide border-b border-[#0A3D2A]/20 pb-1 mb-3";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div style={{ background: "#0A3D2A" }} className="px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">New Offline Booking</h2>
            <p className="text-white/70 text-xs mt-0.5">AL BURHAN TOURS & TRAVELS</p>
          </div>
          <Badge className="bg-amber-500 text-white text-xs">Offline / Walk-in</Badge>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Booking Type & Agent */}
          <div>
            <div className={sectionHdr}>Booking Info</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Booking Type</label>
                <div className="flex gap-3">
                  {["Offline", "Walk-in", "Agent"].map(t => (
                    <button type="button" key={t} onClick={() => setField("agentName", form.agentName || t === "Offline" ? form.agentName : t)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${form.agentName === t ? "bg-[#0A3D2A] text-white border-[#0A3D2A]" : "bg-white text-gray-600 border-gray-200 hover:border-[#0A3D2A]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Agent Name / Booked By</label>
                <input className={inputCls} type="text" placeholder="Agent name or in-house" value={form.agentName} onChange={e => setField("agentName", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div>
            <div className={sectionHdr}>Customer Details</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Customer Name <span className="text-red-500">*</span></label>
                <input required className={inputCls} type="text" placeholder="Full name" value={form.customerName} onChange={e => setField("customerName", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Mobile Number <span className="text-red-500">*</span></label>
                <input required className={inputCls} type="tel" placeholder="10-digit mobile" value={form.customerMobile} onChange={e => setField("customerMobile", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Email (optional)</label>
                <input className={inputCls} type="email" placeholder="email@example.com" value={form.customerEmail} onChange={e => setField("customerEmail", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Room Type</label>
                <select className={inputCls} value={form.roomType} onChange={e => setField("roomType", e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="sharing">Sharing</option>
                  <option value="double">Double</option>
                  <option value="triple">Triple</option>
                  <option value="quad">Quad</option>
                </select>
              </div>
            </div>
          </div>

          {/* Package & Payment */}
          <div>
            <div className={sectionHdr}>Package & Payment</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Package Name</label>
                <input className={inputCls} type="text" placeholder="e.g. Hajj Standard, Umrah Premium..." value={form.packageName} onChange={e => setField("packageName", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Total Amount (₹)</label>
                <input className={inputCls} type="number" placeholder="0" min="0" value={form.totalAmount} onChange={e => setField("totalAmount", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Advance Payment (₹)</label>
                <input className={inputCls} type="number" placeholder="0" min="0" value={form.advanceAmount} onChange={e => setField("advanceAmount", e.target.value)} />
              </div>
              {totalAmt > 0 && (
                <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex gap-8">
                  <div><span className="text-xs text-gray-500">Total:</span> <span className="font-bold text-gray-800">₹{totalAmt.toLocaleString("en-IN")}</span></div>
                  <div><span className="text-xs text-gray-500">Advance:</span> <span className="font-bold text-emerald-700">₹{advAmt.toLocaleString("en-IN")}</span></div>
                  <div><span className="text-xs text-gray-500">Balance Due:</span> <span className="font-bold text-red-600">₹{balAmt.toLocaleString("en-IN")}</span></div>
                </div>
              )}
              <div>
                <label className={labelCls}>Payment Status</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setField("paymentStatus", "pending")} className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${form.paymentStatus === "pending" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-600 border-gray-200"}`}>
                    Pending / Advance
                  </button>
                  <button type="button" onClick={() => setField("paymentStatus", "paid")} className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${form.paymentStatus === "paid" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200"}`}>
                    Fully Paid
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pilgrims */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className={sectionHdr} style={{ marginBottom: 0, borderBottom: "none" }}>Pilgrims ({pilgrims.length})</div>
              <button type="button" onClick={addPilgrim} className="flex items-center gap-1 px-3 py-1.5 bg-[#0A3D2A] text-white text-xs rounded-lg font-semibold hover:bg-[#0d5038] transition">
                <Plus size={12} /> Add Pilgrim
              </button>
            </div>
            <div className="space-y-4">
              {pilgrims.map((p, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 relative bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[#0A3D2A] uppercase tracking-wide">Pilgrim {i + 1}</span>
                    {pilgrims.length > 1 && (
                      <button type="button" onClick={() => removePilgrim(i)} className="text-red-400 hover:text-red-600 transition">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
                      <input required={i === 0} className={inputCls} type="text" placeholder="As on passport" value={p.name} onChange={e => setPilgrimField(i, "name", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Passport Number</label>
                      <input className={`${inputCls} font-mono uppercase`} type="text" placeholder="e.g. P1234567" value={p.passportNumber} onChange={e => setPilgrimField(i, "passportNumber", e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <label className={labelCls}>Date of Birth</label>
                      <input className={inputCls} type="text" placeholder="DD/MM/YYYY" value={p.dateOfBirth} onChange={e => setPilgrimField(i, "dateOfBirth", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Passport Issue Date</label>
                      <input className={inputCls} type="text" placeholder="DD/MM/YYYY" value={p.passportIssue} onChange={e => setPilgrimField(i, "passportIssue", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Passport Expiry Date</label>
                      <input className={inputCls} type="text" placeholder="DD/MM/YYYY" value={p.passportExpiry} onChange={e => setPilgrimField(i, "passportExpiry", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Address</label>
                      <input className={inputCls} type="text" placeholder="Full address" value={p.address} onChange={e => setPilgrimField(i, "address", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Additional Notes</label>
            <textarea className={inputCls} rows={3} placeholder="Any special requirements, notes..." value={form.notes} onChange={e => setField("notes", e.target.value)} />
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1 bg-[#0A3D2A] hover:bg-[#0d5038] text-white">
              {loading ? "Creating Booking..." : `Create ${form.paymentStatus === "paid" ? "Confirmed" : "Approved"} Booking`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BookingsManager() {
  const { data, isLoading, refetch } = useListBookings();
  const bookings = data?.bookings || [];
  const approveMutation = useApproveBooking();
  const rejectMutation = useRejectBooking();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [showOfflineForm, setShowOfflineForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync({ id });
      toast({ title: "Booking Approved" });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to approve booking";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Reason for rejection:");
    if (reason === null) return;
    try {
      await rejectMutation.mutateAsync({ id, data: { reason } });
      toast({ title: "Booking Rejected" });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reject booking";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-emerald-100 text-emerald-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      case 'partially_paid': return 'bg-orange-100 text-orange-800';
      default: return 'bg-amber-100 text-amber-800';
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === 'partially_paid') return 'Partially Paid';
    return status;
  };

  const filtered = statusFilter === "all" ? bookings : bookings.filter(b => b.status === statusFilter);

  const counts = bookings.reduce((acc: Record<string, number>, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Bookings Management</h1>
          <p className="text-muted-foreground mt-1">Review, process, and create offline booking requests.</p>
        </div>
        <Button onClick={() => setShowOfflineForm(true)} className="bg-[#0A3D2A] hover:bg-[#0d5038] text-white font-semibold flex items-center gap-2 shadow-md">
          <Plus size={16} /> New Offline Booking
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        {[
          { label: "All", value: bookings.length, key: "all", color: "bg-gray-50 border-gray-200" },
          { label: "Pending", value: counts.pending || 0, key: "pending", color: "bg-amber-50 border-amber-200" },
          { label: "Approved", value: counts.approved || 0, key: "approved", color: "bg-blue-50 border-blue-200" },
          { label: "Part. Paid", value: counts.partially_paid || 0, key: "partially_paid", color: "bg-orange-50 border-orange-200" },
          { label: "Confirmed", value: counts.confirmed || 0, key: "confirmed", color: "bg-emerald-50 border-emerald-200" },
          { label: "Rejected", value: counts.rejected || 0, key: "rejected", color: "bg-red-50 border-red-200" },
        ].map(s => (
          <button key={s.key} onClick={() => setStatusFilter(s.key)} className={`p-4 rounded-xl border-2 text-left transition hover:shadow-md ${s.color} ${statusFilter === s.key ? "shadow-md ring-2 ring-[#0A3D2A]" : ""}`}>
            <div className="text-2xl font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground font-semibold uppercase mt-1">{s.label}</div>
          </button>
        ))}
      </div>

      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Booking ID / Date</th>
                <th className="px-6 py-4">Customer Info</th>
                <th className="px-6 py-4">Package</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No bookings found.</td></tr>
              ) : filtered.map(booking => (
                <tr key={booking.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-mono font-bold text-primary">{booking.bookingNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">{formatDate(booking.createdAt)}</div>
                    {booking.isOffline && <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">OFFLINE</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold">{booking.customerName}</div>
                    <div className="text-xs text-muted-foreground">{booking.customerMobile}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{booking.packageName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{booking.numberOfPilgrims} Pilgrim(s)</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-mono font-semibold text-[#0A3D2A]">{booking.finalAmount ? formatCurrency(booking.finalAmount) : "—"}</div>
                    {(booking as any).advanceAmount && (
                      <div className="text-xs text-emerald-600">Adv: ₹{Number((booking as any).advanceAmount).toLocaleString("en-IN")}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className={`px-2.5 py-1 uppercase tracking-wider text-[10px] font-bold border-0 ${getStatusColor(booking.status)}`}>
                      {getStatusLabel(booking.status)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => setDetailBooking(booking)} title="View Details">
                        <Eye size={18} />
                      </Button>
                      {booking.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="icon" className="text-emerald-600 hover:bg-emerald-50" onClick={() => handleApprove(booking.id)} title="Approve">
                            <CheckCircle size={18} />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600 hover:bg-red-50" onClick={() => handleReject(booking.id)} title="Reject">
                            <XCircle size={18} />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <BookingDetailModal booking={detailBooking} open={!!detailBooking} onClose={() => setDetailBooking(null)} />
      <OfflineBookingForm
        open={showOfflineForm}
        onClose={() => setShowOfflineForm(false)}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['/api/bookings'] }); refetch(); }}
      />
    </AdminLayout>
  );
}
