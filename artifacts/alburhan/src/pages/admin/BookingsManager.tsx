import { useState, useRef, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListBookings, useApproveBooking, useRejectBooking, useListDocuments, useDeleteDocument } from "@workspace/api-client-react";
import type { Booking, Pilgrim } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, ExternalLink, Plus, Trash2, FileText, Download, ImageIcon, RefreshCw, Upload, Wallet, ClipboardList, User } from "lucide-react";

const DOC_TYPE_LABELS: Record<string, string> = {
  passport: "Passport",
  pan_card: "PAN Card",
  aadhaar: "Aadhaar Card",
  passport_photo: "Passport Photo",
  flight_ticket: "Flight Ticket",
  visa: "Visa",
  room_allotment: "Room Allotment",
  bus_allotment: "Bus Allotment",
  model_contract: "Model Contract",
  tour_itinerary: "Tour Itinerary",
  medical_certificate: "Medical Certificate",
  other: "Other Document",
};

const DOC_TYPE_COLOR: Record<string, string> = {
  passport: "bg-blue-100 text-blue-800",
  pan_card: "bg-purple-100 text-purple-800",
  aadhaar: "bg-orange-100 text-orange-800",
  passport_photo: "bg-pink-100 text-pink-800",
  flight_ticket: "bg-sky-100 text-sky-800",
  visa: "bg-green-100 text-green-800",
  room_allotment: "bg-teal-100 text-teal-800",
  bus_allotment: "bg-indigo-100 text-indigo-800",
  model_contract: "bg-rose-100 text-rose-800",
  tour_itinerary: "bg-amber-100 text-amber-800",
  medical_certificate: "bg-red-100 text-red-800",
  other: "bg-gray-100 text-gray-800",
};

function isImageFile(fileName: string) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
}

const DOC_TYPES = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const BASE_API = import.meta.env.VITE_API_URL || "";

function AdminDocumentsSection({ bookingId }: { bookingId: string }) {
  const { data: docs, isLoading, refetch } = useListDocuments(bookingId, {
    query: { refetchOnMount: "always" },
  });
  const deleteDoc = useDeleteDocument();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("passport");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDelete = async (docId: string, fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    try {
      await deleteDoc.mutateAsync({ id: docId });
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${bookingId}`] });
      toast({ title: "Document deleted" });
    } catch {
      toast({ title: "Error", description: "Could not delete document", variant: "destructive" });
    }
  };

  const handleUpload = async () => {
    if (!file) { toast({ title: "Please select a file", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bookingId", bookingId);
      fd.append("documentType", docType);
      const res = await fetch(`${BASE_API}/api/documents/upload`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      toast({ title: "Document uploaded!" });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${bookingId}`] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const docList = (docs || []) as any[];

  return (
    <div className="space-y-3">
      {/* Admin Upload Row */}
      <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border border-dashed">
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="text-xs flex-1 min-w-0"
          onChange={e => setFile(e.target.files?.[0] || null)}
        />
        <Button size="sm" className="h-8 text-xs gap-1.5 bg-[#0B3D2E] hover:bg-[#0d5038] text-white shrink-0" onClick={handleUpload} disabled={uploading || !file}>
          <Upload size={12} /> {uploading ? "Uploading…" : "Upload"}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground shrink-0" title="Refresh list" onClick={() => refetch()}>
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Document List */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading documents…</p>}
      {!isLoading && docList.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
          <FileText size={16} />
          <span>No documents uploaded yet.</span>
        </div>
      )}
      {docList.map((doc: any) => {
        const label = DOC_TYPE_LABELS[doc.documentType] || doc.documentType;
        const color = DOC_TYPE_COLOR[doc.documentType] || "bg-gray-100 text-gray-800";
        const fileUrl = `${BASE_API}${doc.fileUrl}`;
        const isImg = isImageFile(doc.fileName || "");

        return (
          <div key={doc.id} className="flex items-center gap-3 border rounded-lg p-3 bg-white">
            <div className="flex-shrink-0">
              {isImg
                ? <ImageIcon size={20} className="text-blue-500" />
                : <FileText size={20} className="text-gray-500" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-[10px] px-2 py-0.5 font-semibold border-0 ${color}`}>{label}</Badge>
                <span className="text-xs text-muted-foreground truncate">{doc.fileName}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Uploaded by {doc.uploadedBy === "admin" ? "Admin" : "Customer"}
                {doc.createdAt ? ` · ${new Date(doc.createdAt).toLocaleDateString("en-IN")}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <a href={fileUrl} target="_blank" rel="noreferrer" title="View">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:bg-blue-50">
                  <Eye size={14} />
                </Button>
              </a>
              <a href={fileUrl} download={doc.fileName} title="Download">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50">
                  <Download size={14} />
                </Button>
              </a>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-500 hover:bg-red-50"
                title="Delete"
                onClick={() => handleDelete(doc.id, doc.fileName)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const API = import.meta.env.VITE_API_URL || "";

const MODE_LABELS: Record<string, string> = {
  cash: "Cash", neft: "NEFT", upi: "UPI", cheque: "Cheque", online: "Online",
};
const MODE_COLORS: Record<string, string> = {
  cash: "bg-green-100 text-green-800",
  neft: "bg-blue-100 text-blue-800",
  upi: "bg-purple-100 text-purple-800",
  cheque: "bg-amber-100 text-amber-800",
  online: "bg-orange-100 text-orange-800",
};

interface PaymentEntry {
  id: string;
  bookingId: string;
  amount: number;
  paymentDate: string;
  paymentMode: "cash" | "neft" | "upi" | "cheque" | "online";
  referenceNumber?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
  createdAt: string;
}

interface BookingWithAmounts extends Booking {
  paidAmount?: string | null;
  onlinePaidAmount?: string | null;
}

interface LedgerForm {
  amount: string;
  paymentDate: string;
  paymentMode: string;
  referenceNumber: string;
  notes: string;
}

function getBalanceColor(remaining: number, finalAmount: number): string {
  if (remaining < 0) return "text-red-600";
  if (remaining === 0) return "text-emerald-600";
  if (remaining < finalAmount * 0.5) return "text-amber-600";
  return "text-red-600";
}

function AdminPaymentLedger({ booking }: { booking: BookingWithAmounts }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // livePaidAmount is kept in sync from server responses so the balance bar
  // reflects the latest state even while the modal is open (the booking prop is stale).
  const [livePaidAmount, setLivePaidAmount] = useState<number>(Number(booking.paidAmount ?? 0));
  const [form, setForm] = useState<LedgerForm>({
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0] ?? "",
    paymentMode: "cash",
    referenceNumber: "",
    notes: "",
  });

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/bookings/${booking.id}/payments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ledger entries");
      const data = (await res.json()) as PaymentEntry[];
      setEntries(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not load payment ledger";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    setLivePaidAmount(Number(booking.paidAmount ?? 0));
  }, [booking.id]);

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/admin/bookings/${booking.id}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const data = (await res.json()) as { message?: string; booking?: { paidAmount?: number } };
      if (!res.ok) throw new Error(data.message ?? "Failed to record payment");
      if (data.booking?.paidAmount !== undefined) {
        setLivePaidAmount(data.booking.paidAmount);
      }
      toast({ title: "Payment recorded!" });
      setShowForm(false);
      setForm({ amount: "", paymentDate: new Date().toISOString().split("T")[0] ?? "", paymentMode: "cash", referenceNumber: "", notes: "" });
      fetchEntries();
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record payment";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (txnId: string) => {
    if (!confirm("Delete this payment entry? The booking balance will be recalculated.")) return;
    try {
      const res = await fetch(`${API}/api/admin/bookings/${booking.id}/payments/${txnId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as { message?: string; booking?: { paidAmount?: number } };
      if (!res.ok) throw new Error(data.message ?? "Failed to delete payment entry");
      if (data.booking?.paidAmount !== undefined) {
        setLivePaidAmount(data.booking.paidAmount);
      }
      toast({ title: "Payment entry deleted" });
      fetchEntries();
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const ledgerTotal = entries.reduce((s, e) => s + Number(e.amount), 0);
  // finalAmount is already a number from the generated Booking type
  const finalAmount = booking.finalAmount ?? 0;
  // livePaidAmount is authoritative — updated from server responses after each mutation.
  const totalPaid = livePaidAmount;
  const remaining = finalAmount > 0 ? finalAmount - totalPaid : 0;
  const onlinePortion = totalPaid - ledgerTotal;

  return (
    <div className="space-y-3">
      {finalAmount > 0 && (
        <div className="grid grid-cols-3 gap-2 bg-muted/40 rounded-xl p-3 border">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground font-semibold uppercase">Total</div>
            <div className="font-mono font-bold text-sm text-foreground">₹{finalAmount.toLocaleString("en-IN")}</div>
          </div>
          <div className="text-center border-x">
            <div className="text-[10px] text-muted-foreground font-semibold uppercase">Paid</div>
            <div className="font-mono font-bold text-sm text-emerald-700">₹{totalPaid.toLocaleString("en-IN")}</div>
            {onlinePortion > 0 && ledgerTotal > 0 && (
              <div className="text-[10px] text-muted-foreground">
                ₹{onlinePortion.toLocaleString("en-IN")} online + ₹{ledgerTotal.toLocaleString("en-IN")} manual
              </div>
            )}
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground font-semibold uppercase">
              {remaining < 0 ? "Overpaid" : "Balance"}
            </div>
            <div className={`font-mono font-bold text-sm ${getBalanceColor(remaining, finalAmount)}`}>
              {remaining < 0 ? `+₹${Math.abs(remaining).toLocaleString("en-IN")}` : `₹${remaining.toLocaleString("en-IN")}`}
            </div>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading ledger…</p>}
      {!loading && entries.length === 0 && (
        <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">No payment entries recorded yet.</p>
      )}
      {entries.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[10px] text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Ref / Notes</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map(entry => (
                <tr key={entry.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{entry.paymentDate}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] px-2 py-0.5 border-0 font-semibold ${MODE_COLORS[entry.paymentMode] ?? "bg-gray-100 text-gray-800"}`}>
                      {MODE_LABELS[entry.paymentMode] ?? entry.paymentMode}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">₹{Number(entry.amount).toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">
                    {entry.referenceNumber && <span className="font-mono mr-1">{entry.referenceNumber}</span>}
                    {entry.notes && <span className="italic">{entry.notes}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => handleDelete(entry.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showForm && (
        <Button size="sm" className="bg-[#0B3D2E] hover:bg-[#0d5038] text-white h-8 text-xs gap-1.5" onClick={() => setShowForm(true)}>
          <Plus size={12} /> Record Payment
        </Button>
      )}

      {showForm && (
        <form onSubmit={handleRecord} className="border rounded-xl p-4 bg-muted/30 space-y-3">
          <div className="text-xs font-bold text-[#0B3D2E] uppercase tracking-wide mb-1">Record New Payment</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹) *</label>
              <input
                type="number" min="1" step="0.01" required placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Date *</label>
              <input
                type="date" required
                value={form.paymentDate}
                onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Mode *</label>
              <select
                required
                value={form.paymentMode}
                onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]"
              >
                <option value="cash">Cash</option>
                <option value="neft">NEFT</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online (Razorpay)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Reference # (optional)</label>
              <input
                type="text" placeholder="UTR / Cheque no. / Txn ID"
                value={form.referenceNumber}
                onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
              <input
                type="text" placeholder="Any notes about this payment"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="bg-[#0B3D2E] hover:bg-[#0d5038] text-white h-8 text-xs" disabled={submitting}>
              {submitting ? "Saving…" : "Save Payment"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function BookingDetailModal({ booking, open, onClose }: { booking: Booking | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [assigningGroup, setAssigningGroup] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string; year: number; maktabNumber?: string }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (open) {
      setLoadingGroups(true);
      fetch(`${API}/api/groups`, { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          const groups = Array.isArray(data) ? data : (data.groups ?? []);
          setAvailableGroups(groups.map((g: any) => ({ id: g.id, name: g.name, year: g.year, maktabNumber: g.maktabNumber })));
        })
        .catch(() => {})
        .finally(() => setLoadingGroups(false));
      if (booking?.groupId) setSelectedGroupId(booking.groupId);
    }
  }, [open, booking?.id]);

  const handleAutoFillPilgrim = async () => {
    if (!booking) return;
    if (!booking.groupId) {
      toast({ title: "No group assigned", description: "Please assign this booking to a Hajj group first.", variant: "destructive" }); return;
    }
    setAutoFilling(true);
    try {
      const res = await fetch(`${API}/api/admin/bookings/${booking.id}/auto-fill-pilgrim`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Auto-fill failed");
      toast({ title: "Pilgrim added to group!", description: `${data.pilgrim?.fullName} has been added/updated in the Hajj group.` });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (err: any) {
      toast({ title: "Auto-fill failed", description: err.message, variant: "destructive" });
    } finally {
      setAutoFilling(false);
    }
  };

  const handleAssignGroup = async () => {
    if (!booking || !selectedGroupId) return;
    setAssigningGroup(true);
    try {
      const res = await fetch(`${API}/api/bookings/${booking.id}/assign-group`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: selectedGroupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Group assignment failed");
      const autoFillMsg = data.autoFilled ? " Pilgrim auto-populated from submitted travel details." : "";
      toast({ title: "Group assigned!", description: `Booking assigned to group.${autoFillMsg}` });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      onClose();
    } catch (err: any) {
      toast({ title: "Assignment failed", description: err.message, variant: "destructive" });
    } finally {
      setAssigningGroup(false);
    }
  };

  if (!booking) return null;

  const pilgrims = Array.isArray(booking.pilgrims) ? booking.pilgrims : [];

  const handleSyncPayment = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/payments/sync-payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sync failed");
      if (data.status === "confirmed" || data.status === "partially_paid") {
        toast({ title: "Payment Synced!", description: `Booking updated to ${data.status}. Notifications sent.` });
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        onClose();
      } else {
        toast({ title: "No payment captured", description: data.message || "Razorpay has no captured payment for this order yet." });
      }
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

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

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <FileText size={12} /> Customer Documents
            </h4>
            <AdminDocumentsSection bookingId={booking.id} />
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <Wallet size={12} /> Payment Ledger
            </h4>
            <AdminPaymentLedger booking={booking} />
          </div>

          {(booking as any).travellerDetailsStatus && (
            <div className={`rounded-lg px-3 py-2 flex items-center gap-2 text-sm ${(booking as any).travellerDetailsStatus === "submitted" ? "bg-indigo-50 border border-indigo-200 text-indigo-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
              {(booking as any).travellerDetailsStatus === "submitted"
                ? <><User size={14} /> Customer has submitted travel details</>
                : <><ClipboardList size={14} /> Customer has not submitted travel details yet</>}
            </div>
          )}

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-700 flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Hajj Group Assignment
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="h-9 flex-1 min-w-[180px] rounded-lg border border-indigo-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value)}
                disabled={loadingGroups}
              >
                <option value="">{loadingGroups ? "Loading groups…" : "Select a Hajj group…"}</option>
                {availableGroups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.year}){g.maktabNumber ? ` — Maktab ${g.maktabNumber}` : ""}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="bg-indigo-700 hover:bg-indigo-800 text-white shrink-0"
                onClick={handleAssignGroup}
                disabled={!selectedGroupId || assigningGroup}
              >
                {assigningGroup ? <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />Assigning…</span> : "Assign to Group"}
              </Button>
            </div>
            {booking.groupId && (
              <p className="text-xs text-indigo-600">
                Currently assigned to group ID: <span className="font-mono">{booking.groupId}</span>
              </p>
            )}
            {(booking as any).travellerDetailsStatus === "submitted" ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-indigo-400 text-indigo-700 hover:bg-indigo-50"
                  onClick={handleAutoFillPilgrim}
                  disabled={autoFilling || !booking.groupId}
                >
                  <User className={`w-4 h-4 mr-2 ${autoFilling ? "animate-pulse" : ""}`} />
                  {autoFilling ? "Filling…" : "Auto-fill Pilgrim"}
                </Button>
                {!booking.groupId && (
                  <p className="text-xs text-amber-600">Assign a group above to enable auto-fill.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Customer travel details: <span className="font-semibold capitalize">{(booking as any).travellerDetailsStatus || "not submitted"}</span>.
                Auto-fill will be available once customer submits their travel details.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            {booking.status === "confirmed" && booking.invoiceNumber && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`${import.meta.env.BASE_URL}invoice/${booking.bookingNumber}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />View Invoice
              </Button>
            )}
            {(booking.status === "approved" || booking.status === "partially_paid") && (booking as any).razorpayOrderId && (
              <Button
                variant="outline"
                size="sm"
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={handleSyncPayment}
                disabled={syncing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync Payment from Razorpay"}
              </Button>
            )}
          </div>
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
                    <div className="flex flex-col gap-1.5">
                      <Badge variant="outline" className={`px-2.5 py-1 uppercase tracking-wider text-[10px] font-bold border-0 ${getStatusColor(booking.status)}`}>
                        {getStatusLabel(booking.status)}
                      </Badge>
                      {(booking as any).travellerDetailsStatus === "submitted" ? (
                        <Badge className="bg-indigo-100 text-indigo-800 border-0 text-[9px] px-1.5 py-0.5 font-semibold w-fit">
                          <User size={9} className="mr-0.5" /> Details Submitted
                        </Badge>
                      ) : (["approved", "confirmed", "partially_paid"].includes(booking.status)) ? (
                        <Badge className="bg-amber-100 text-amber-700 border-0 text-[9px] px-1.5 py-0.5 font-semibold w-fit animate-pulse">
                          <ClipboardList size={9} className="mr-0.5" /> Details Pending
                        </Badge>
                      ) : null}
                    </div>
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
