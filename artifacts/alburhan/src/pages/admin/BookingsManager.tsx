import { useState, useRef, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { PermissionGuard } from "@/components/PermissionGuard";
import { useListBookings, useApproveBooking, useRejectBooking, useListDocuments } from "@workspace/api-client-react";
import { useDeleteGuard } from "@/components/DeleteGuard";
import type { Booking, Pilgrim } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, ExternalLink, Plus, Trash2, FileText, Download, ImageIcon, RefreshCw, Upload, Wallet, ClipboardList, User, Link2, Send, Bell, Pencil, Copy, History, RotateCcw, AlertTriangle, Search, Loader2 } from "lucide-react";

const DOC_TYPE_LABELS: Record<string, string> = {
  // Customer KYC docs
  passport: "Passport",
  pan_card: "PAN Card",
  aadhaar: "Aadhaar Card",
  passport_photo: "Passport Photo",
  medical_certificate: "Medical Certificate",
  other: "Other Document",
  // Admin travel docs
  flight_ticket: "Flight Ticket",
  visa: "Visa",
  hotel_voucher: "Hotel Voucher",
  room_allotment: "Room Allotment",
  bus_allotment: "Bus Allotment",
  model_contract: "Model Contract",
  tour_itinerary: "Tour Itinerary",
  payment_receipt: "Payment Receipt",
  ziyarat_schedule: "Ziyarat Schedule",
  insurance: "Insurance",
  hajj_id: "Hajj ID Card",
  luggage_tag: "Luggage Tag",
  emergency_contact_card: "Emergency Contact Card",
};

const DOC_TYPE_COLOR: Record<string, string> = {
  passport: "bg-blue-100 text-blue-800",
  pan_card: "bg-purple-100 text-purple-800",
  aadhaar: "bg-orange-100 text-orange-800",
  passport_photo: "bg-pink-100 text-pink-800",
  flight_ticket: "bg-sky-100 text-sky-800",
  visa: "bg-green-100 text-green-800",
  hotel_voucher: "bg-cyan-100 text-cyan-800",
  room_allotment: "bg-teal-100 text-teal-800",
  bus_allotment: "bg-indigo-100 text-indigo-800",
  model_contract: "bg-rose-100 text-rose-800",
  tour_itinerary: "bg-amber-100 text-amber-800",
  payment_receipt: "bg-emerald-100 text-emerald-800",
  ziyarat_schedule: "bg-lime-100 text-lime-800",
  insurance: "bg-yellow-100 text-yellow-800",
  hajj_id: "bg-violet-100 text-violet-800",
  luggage_tag: "bg-fuchsia-100 text-fuchsia-800",
  emergency_contact_card: "bg-red-100 text-red-800",
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
  const { toast } = useToast();
  const { requestDelete } = useDeleteGuard();
  const queryClient = useQueryClient();

  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("flight_ticket");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleDelete = (docId: string, fileName: string) => {
    requestDelete(`Document: ${fileName}`, async (token) => {
      const res = await fetch(`${BASE_API}/api/documents/${docId}`, {
        method: "DELETE", credentials: "include",
        headers: { "X-Delete-Token": token },
      });
      if (!res.ok) throw new Error("Could not delete document");
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${bookingId}`] });
      toast({ title: "Document deleted" });
    });
  };

  const doUpload = async (f: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("bookingId", bookingId);
      fd.append("documentType", docType);
      const res = await fetch(`${BASE_API}/api/documents/upload`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      toast({ title: "Document uploaded!", description: `${DOC_TYPE_LABELS[docType] || docType} — customer notified automatically.` });
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

  const handleUpload = () => { if (file) doUpload(file); else toast({ title: "Please select a file", variant: "destructive" }); };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); doUpload(dropped); }
  };

  const docList = (docs || []) as any[];
  // Separate admin-uploaded travel docs from customer KYC docs
  const adminDocs = docList.filter((d: any) => d.uploadedBy === "admin");
  const customerDocs = docList.filter((d: any) => d.uploadedBy !== "admin");

  const renderDoc = (doc: any) => {
    const label = DOC_TYPE_LABELS[doc.documentType] || doc.documentType;
    const color = DOC_TYPE_COLOR[doc.documentType] || "bg-gray-100 text-gray-800";
    const fileUrl = `${BASE_API}${doc.fileUrl}`;
    const isImg = isImageFile(doc.fileName || "");
    const downloads = doc.downloadCount ?? doc.download_count ?? 0;
    const lastDl = doc.lastDownloadedAt ?? doc.last_downloaded_at;

    return (
      <div key={doc.id} className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white">
        <div className="flex-shrink-0">
          {isImg ? <ImageIcon size={15} className="text-blue-500" /> : <FileText size={15} className="text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0 text-left overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Badge className={`text-[10px] px-1.5 py-0 font-semibold border-0 shrink-0 ${color}`}>{label}</Badge>
            <span className="text-[11px] text-gray-800 font-medium truncate block">{doc.fileName}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5 truncate">
            {doc.uploadedBy === "admin" ? "Admin" : "Customer"}
            {doc.createdAt ? ` · ${new Date(doc.createdAt).toLocaleDateString("en-IN")}` : ""}
            {" · "}
            {(doc.notificationSent || doc.notification_sent) ? "Notified" : "No notif"}
            {" · "}
            {(doc.viewedAt || doc.viewed_at)
              ? `Viewed ${new Date(doc.viewedAt || doc.viewed_at).toLocaleDateString("en-IN")}`
              : "Not viewed"}
            {" · "}
            {downloads > 0
              ? `Downloaded ${downloads}×`
              : "Not downloaded"}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <a href={fileUrl} target="_blank" rel="noreferrer" title="View">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600 hover:bg-blue-50"><Eye size={12} /></Button>
          </a>
          <a href={fileUrl} download={doc.fileName} title="Download">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-emerald-600 hover:bg-emerald-50"><Download size={12} /></Button>
          </a>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" title="Delete"
            onClick={() => handleDelete(doc.id, doc.fileName)}>
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Drag & Drop Upload Zone */}
      <div
        ref={dropRef}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-4 transition-colors ${dragging ? "border-[#0B3D2E] bg-emerald-50" : "border-border bg-muted/30"}`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="h-8 w-48 text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Travel Documents (Delivered to Customer)</div>
              {["flight_ticket","visa","hotel_voucher","room_allotment","bus_allotment","model_contract","tour_itinerary","payment_receipt","ziyarat_schedule","insurance","hajj_id","luggage_tag","emergency_contact_card"].map(v => (
                <SelectItem key={v} value={v} className="text-xs">{DOC_TYPE_LABELS[v]}</SelectItem>
              ))}
              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide mt-1 border-t">KYC / Other</div>
              {["passport","pan_card","aadhaar","passport_photo","medical_certificate","other"].map(v => (
                <SelectItem key={v} value={v} className="text-xs">{DOC_TYPE_LABELS[v]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 flex-1 w-full">
            <label className={`flex-1 flex items-center gap-2 text-xs cursor-pointer px-3 py-2 rounded-md border bg-white hover:bg-muted/40 transition-colors ${file ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              <Upload size={12} />
              {file ? file.name : dragging ? "Drop file here…" : "Click or drag & drop (PDF, JPG, PNG, DOCX · max 25 MB)"}
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-[#0B3D2E] hover:bg-[#0d5038] text-white shrink-0"
              onClick={handleUpload} disabled={uploading || !file}>
              <Upload size={12} /> {uploading ? "Uploading…" : "Upload"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground shrink-0" onClick={() => refetch()}>
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
        {dragging && <p className="text-xs text-center text-[#0B3D2E] font-medium mt-2">Drop to upload as {DOC_TYPE_LABELS[docType] || docType}</p>}
      </div>

      {/* Document List */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading documents…</p>}
      {!isLoading && docList.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
          <FileText size={16} /><span>No documents uploaded yet.</span>
        </div>
      )}
      {adminDocs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Admin-delivered (visible to customer)</p>
          <div className="space-y-2">{adminDocs.map(renderDoc)}</div>
        </div>
      )}
      {customerDocs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 mt-2">Customer-uploaded (KYC)</p>
          <div className="space-y-2">{customerDocs.map(renderDoc)}</div>
        </div>
      )}
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
  const { requestDelete } = useDeleteGuard();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{ url: string; waSent: boolean } | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [lastReminderSent, setLastReminderSent] = useState<string | null>(null);
  const [reminderHistory, setReminderHistory] = useState<Array<{ id: string; sentAt: string; status: string; triggeredBy: string; notes: string | null }>>([]);
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

  const fetchReminderHistory = async () => {
    try {
      const res = await fetch(`${API}/api/payments/${booking.id}/reminder-history`, { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as Array<{ id: string; sentAt: string; status: string; triggeredBy: string; notes: string | null }>;
      setReminderHistory(data);
    } catch {
      // non-critical — silently ignore
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchReminderHistory();
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

  const handleDelete = (txnId: string) => {
    requestDelete("Payment entry (balance will be recalculated)", async (token) => {
      const res = await fetch(`${API}/api/admin/bookings/${booking.id}/payments/${txnId}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-Delete-Token": token },
      });
      const data = (await res.json()) as { message?: string; booking?: { paidAmount?: number } };
      if (!res.ok) throw new Error(data.message ?? "Failed to delete payment entry");
      if (data.booking?.paidAmount !== undefined) {
        setLivePaidAmount(data.booking.paidAmount);
      }
      toast({ title: "Payment entry deleted" });
      fetchEntries();
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    });
  };

  const handleSendPaymentLink = async () => {
    if (!confirm(`Generate a Razorpay payment link and send via WhatsApp to ${booking.customerName} (${booking.customerMobile})?`)) return;
    setSendingLink(true);
    setGeneratedLink(null);
    try {
      const res = await fetch(`${API}/api/payments/${booking.id}/payment-link`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { paymentUrl?: string; waSent?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to generate payment link");
      setGeneratedLink({ url: data.paymentUrl ?? "", waSent: !!data.waSent });
      toast({
        title: data.waSent ? "Payment link sent via WhatsApp!" : "Payment link generated",
        description: data.waSent
          ? `Link sent to ${booking.customerMobile}`
          : "WhatsApp not configured — copy the link manually",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate payment link";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSendingLink(false);
    }
  };

  const handleSendReminder = async () => {
    if (!confirm(`Send a WhatsApp payment reminder to ${booking.customerName} (${booking.customerMobile})?`)) return;
    setSendingReminder(true);
    try {
      const res = await fetch(`${API}/api/payments/${booking.id}/send-reminder`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to send reminder");
      setLastReminderSent(new Date().toLocaleTimeString());
      toast({ title: "Reminder sent!", description: data.message ?? `WhatsApp reminder sent to ${booking.customerMobile}` });
      fetchReminderHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send reminder";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSendingReminder(false);
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
                    {can("payments", "delete") && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => handleDelete(entry.id)}>
                        <Trash2 size={12} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showForm && (
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" className="bg-[#0B3D2E] hover:bg-[#0d5038] text-white h-8 text-xs gap-1.5" onClick={() => setShowForm(true)}>
            <Plus size={12} /> Record Payment
          </Button>
          {remaining > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={handleSendPaymentLink}
              disabled={sendingLink}
            >
              {sendingLink ? (
                <><RefreshCw size={12} className="animate-spin" /> Generating…</>
              ) : (
                <><Send size={12} /> Send Payment Link</>
              )}
            </Button>
          )}
          {remaining > 0 && (booking.status === "approved" || booking.status === "partially_paid" || booking.status === "pending") && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={handleSendReminder}
              disabled={sendingReminder}
              title={lastReminderSent ? `Last sent at ${lastReminderSent}` : "Send WhatsApp payment reminder"}
            >
              {sendingReminder ? (
                <><RefreshCw size={12} className="animate-spin" /> Sending…</>
              ) : (
                <><Bell size={12} /> {lastReminderSent ? "Resend Reminder" : "Send Reminder"}</>
              )}
            </Button>
          )}
        </div>
      )}

      {generatedLink && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-blue-800">
            <Link2 size={12} /> Payment link generated
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-blue-700 break-all flex-1">{generatedLink.url}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-blue-700 hover:bg-blue-100 shrink-0"
              onClick={() => { navigator.clipboard.writeText(generatedLink.url); toast({ title: "Copied!" }); }}
            >
              Copy
            </Button>
            <a href={generatedLink.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-blue-700 hover:bg-blue-100">
                <ExternalLink size={11} />
              </Button>
            </a>
          </div>
          <p className="text-[10px] text-blue-500">
            {generatedLink.waSent
              ? `Sent to ${booking.customerMobile} via WhatsApp • Expires in 7 days`
              : "WhatsApp not sent — share the link above manually • Expires in 7 days"}
          </p>
        </div>
      )}

      {reminderHistory.length > 0 && (
        <div className="border border-amber-100 bg-amber-50/50 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
            <Bell size={10} /> Reminder History
          </div>
          <div className="space-y-1">
            {reminderHistory.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-center justify-between text-[10px] text-gray-500">
                <span>{new Date(log.sentAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-[9px] text-gray-400">{log.triggeredBy}</span>
                <span className={`px-1.5 py-0.5 rounded-full font-semibold ${log.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {log.status}
                </span>
              </div>
            ))}
          </div>
        </div>
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

const JOURNEY_STATUS_OPTIONS = [
  { value: "booking_requested",  label: "🕌 Booking Submitted" },
  { value: "documents_pending",  label: "📄 Documents Required" },
  { value: "documents_received", label: "📋 Documents Received" },
  { value: "admin_verification", label: "🔍 Under Verification" },
  { value: "payment_pending",    label: "💰 Payment Pending" },
  { value: "payment_received",   label: "✅ Payment Received" },
  { value: "invoice_generated",  label: "🧾 Invoice Generated" },
  { value: "visa_processing",    label: "🛂 Visa Processing" },
  { value: "visa_approved",      label: "🎉 Visa Approved" },
  { value: "flight_confirmed",   label: "✈️ Flight Confirmed" },
  { value: "hotel_confirmed",    label: "🏨 Hotel Confirmed" },
  { value: "bus_allocated",      label: "🚌 Bus Allocated" },
  { value: "room_allocated",     label: "🛏️ Room Allocated" },
  { value: "departure_ready",    label: "🧳 Departure Ready" },
  { value: "journey_started",    label: "🛫 Journey Started" },
  { value: "reached_makkah",     label: "🕋 Reached Makkah" },
  { value: "reached_madinah",    label: "🕌 Reached Madinah" },
  { value: "return_flight",      label: "🛫 Return Flight" },
  { value: "journey_completed",  label: "🏠 Journey Completed" },
];

type ConfirmChannel = { channel: string; status: string; error_message?: string | null; sent_at?: string | null };

function BookingDetailModal({ booking, open, onClose }: { booking: Booking | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [assigningGroup, setAssigningGroup] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string; year: number; maktabNumber?: string }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedJourneyStatus, setSelectedJourneyStatus] = useState("");
  const [updatingJourneyStatus, setUpdatingJourneyStatus] = useState(false);
  const [confirmChannels, setConfirmChannels] = useState<ConfirmChannel[]>([]);
  const [resending, setResending] = useState(false);

  const fetchConfirmStatus = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/bookings/${id}/confirmation-status`, { credentials: "include" });
      const data = await res.json();
      setConfirmChannels(data.channels || []);
    } catch { setConfirmChannels([]); }
  };

  const handleResendConfirmation = async () => {
    if (!booking) return;
    setResending(true);
    try {
      await fetch(`${API}/api/bookings/${booking.id}/resend-confirmation`, {
        method: "POST", credentials: "include",
      });
      toast({ title: "Resending notifications", description: "WhatsApp, SMS, Email & Dashboard notifications are being sent." });
      setTimeout(() => fetchConfirmStatus(booking.id), 5000);
    } catch (err: any) {
      toast({ title: "Resend failed", description: err.message, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

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
      else setSelectedGroupId("");
      setSelectedJourneyStatus((booking as any)?.journeyStatus || "booking_requested");
      if (booking?.id && (booking.status === "approved" || booking.status === "confirmed" || booking.status === "partially_paid")) {
        fetchConfirmStatus(booking.id);
      } else {
        setConfirmChannels([]);
      }
    }
  }, [open, booking?.id]);

  const handleUpdateJourneyStatus = async () => {
    if (!booking || !selectedJourneyStatus) return;
    setUpdatingJourneyStatus(true);
    try {
      const res = await fetch(`${API}/api/bookings/${booking.id}/journey-status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journey_status: selectedJourneyStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");
      toast({ title: "Journey status updated!", description: `Customer notified via WhatsApp & SMS. Status: ${selectedJourneyStatus.replace(/_/g, " ")}` });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setUpdatingJourneyStatus(false);
    }
  };

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
                {(booking as any).discountAmount && Number((booking as any).discountAmount) > 0 && (
                  <p><span className="text-muted-foreground">Discount{(booking as any).discountType ? ` (${(booking as any).discountType})` : ""}:</span>{" "}
                    <span className="font-mono font-bold text-orange-600">-₹{Number((booking as any).discountAmount).toLocaleString("en-IN")}{(booking as any).discountPercentage ? ` (${Number((booking as any).discountPercentage)}%)` : ""}</span>
                  </p>
                )}
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

          {(booking.status === "approved" || booking.status === "confirmed" || booking.status === "partially_paid") && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase">Booking Confirmation Notifications</h4>
                <button
                  onClick={handleResendConfirmation}
                  disabled={resending}
                  className="text-xs px-3 py-1 rounded-md bg-[#0B3D2E] text-white hover:bg-[#0d4f3c] disabled:opacity-50 flex items-center gap-1"
                >
                  {resending ? "Sending..." : "↻ Resend All"}
                </button>
              </div>
              {confirmChannels.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No notification records yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(["whatsapp","sms","email","dashboard"] as const).map(ch => {
                    const rec = confirmChannels.find(c => c.channel === ch);
                    const icons: Record<string, string> = { whatsapp: "💬", sms: "📱", email: "📧", dashboard: "🔔" };
                    const labels: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email", dashboard: "Dashboard" };
                    if (!rec) return (
                      <span key={ch} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                        {icons[ch]} {labels[ch]} —
                      </span>
                    );
                    const sent = rec.status === "sent";
                    return (
                      <span key={ch} title={rec.error_message || undefined} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${sent ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                        {icons[ch]} {sent ? "✓" : "✗"} {labels[ch]}
                        {!sent && rec.error_message && <span className="max-w-[120px] truncate opacity-75">— {rec.error_message}</span>}
                      </span>
                    );
                  })}
                </div>
              )}
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

          {/* Journey Status Control */}
          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-2">
              🗺️ Journey Status
              <span className="font-normal text-muted-foreground normal-case tracking-normal">— auto-notifies customer via WhatsApp + SMS</span>
            </h4>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="h-9 flex-1 min-w-[200px] rounded-lg border border-primary/20 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                value={selectedJourneyStatus}
                onChange={e => setSelectedJourneyStatus(e.target.value)}
              >
                {JOURNEY_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Button
                size="sm"
                className="bg-primary text-white hover:bg-primary/90 font-semibold"
                onClick={handleUpdateJourneyStatus}
                disabled={updatingJourneyStatus || selectedJourneyStatus === ((booking as any).journeyStatus || "booking_requested")}
              >
                {updatingJourneyStatus ? "Updating…" : "Update & Notify"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Current: <strong className="text-primary">{JOURNEY_STATUS_OPTIONS.find(o => o.value === ((booking as any).journeyStatus || "booking_requested"))?.label || "🕌 Booking Submitted"}</strong>
            </p>
          </div>

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

          {booking.travellerDetailsStatus && (
            <div className={`rounded-lg px-3 py-2 flex items-center gap-2 text-sm ${booking.travellerDetailsStatus === "submitted" ? "bg-indigo-50 border border-indigo-200 text-indigo-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
              {booking.travellerDetailsStatus === "submitted"
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
            {booking.travellerDetailsStatus === "submitted" ? (
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
                Customer travel details: <span className="font-semibold capitalize">{booking.travellerDetailsStatus || "not submitted"}</span>.
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
            {(booking.status === "approved" || booking.status === "partially_paid") && booking.razorpayOrderId && (
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

const EDITABLE_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "partially_paid", label: "Partially Paid" },
];

function EditBookingModal({ booking, open, onClose, onSaved }: {
  booking: any | null; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (booking) {
      setForm({
        customerName: booking.customerName || "",
        customerMobile: booking.customerMobile || "",
        customerEmail: booking.customerEmail || "",
        packageName: booking.packageName || "",
        numberOfPilgrims: String(booking.numberOfPilgrims ?? 1),
        roomType: booking.roomType || "",
        preferredDepartureDate: booking.preferredDepartureDate || "",
        status: booking.status || "pending",
        totalAmount: booking.totalAmount != null ? String(Number(booking.totalAmount)) : "",
        gstAmount: booking.gstAmount != null ? String(Number(booking.gstAmount)) : "",
        finalAmount: booking.finalAmount != null ? String(Number(booking.finalAmount)) : "",
        advanceAmount: booking.advanceAmount != null ? String(Number(booking.advanceAmount)) : "",
        paidAmount: booking.paidAmount != null ? String(Number(booking.paidAmount)) : "",
        invoiceNumber: booking.invoiceNumber || "",
        rejectionReason: booking.rejectionReason || "",
        notes: booking.notes || "",
      });
    }
  }, [booking?.id, open]);

  const setField = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!booking) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/bookings/${booking.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed to save"); }
      toast({ title: "Booking updated!" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!booking) return null;

  const inp = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A3D2A]";
  const lbl = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto p-0">
        <div style={{ background: "#0A3D2A" }} className="px-6 py-4 flex items-center gap-3">
          <Pencil className="text-white/70 w-5 h-5" />
          <div>
            <h2 className="text-white font-bold text-lg">Edit Booking</h2>
            <p className="text-white/60 text-xs">{booking.bookingNumber} · {booking.customerName}</p>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <div className="text-sm font-bold text-[#0A3D2A] uppercase tracking-wide border-b border-[#0A3D2A]/20 pb-1 mb-3">Customer Details</div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={lbl}>Customer Name *</label><input className={inp} value={form.customerName} onChange={e => setField("customerName", e.target.value)} /></div>
              <div><label className={lbl}>Mobile *</label><input className={inp} value={form.customerMobile} onChange={e => setField("customerMobile", e.target.value)} /></div>
              <div><label className={lbl}>Email</label><input className={inp} type="email" value={form.customerEmail} onChange={e => setField("customerEmail", e.target.value)} /></div>
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-[#0A3D2A] uppercase tracking-wide border-b border-[#0A3D2A]/20 pb-1 mb-3">Package & Trip</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className={lbl}>Package Name</label><input className={inp} value={form.packageName} onChange={e => setField("packageName", e.target.value)} /></div>
              <div><label className={lbl}>No. of Pilgrims</label><input className={inp} type="number" min="1" value={form.numberOfPilgrims} onChange={e => setField("numberOfPilgrims", e.target.value)} /></div>
              <div><label className={lbl}>Room Type</label>
                <select className={inp} value={form.roomType} onChange={e => setField("roomType", e.target.value)}>
                  <option value="">— Select —</option>
                  {["sharing", "double", "triple", "quad"].map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Departure Date</label><input className={inp} type="date" value={form.preferredDepartureDate} onChange={e => setField("preferredDepartureDate", e.target.value)} /></div>
              <div><label className={lbl}>Status</label>
                <select className={inp} value={form.status} onChange={e => setField("status", e.target.value)}>
                  {EDITABLE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {form.status === "rejected" && (
                <div className="col-span-2"><label className={lbl}>Rejection Reason</label><input className={inp} value={form.rejectionReason} onChange={e => setField("rejectionReason", e.target.value)} /></div>
              )}
              <div><label className={lbl}>Invoice Number</label><input className={`${inp} font-mono uppercase`} value={form.invoiceNumber} onChange={e => setField("invoiceNumber", e.target.value.toUpperCase())} /></div>
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-[#0A3D2A] uppercase tracking-wide border-b border-[#0A3D2A]/20 pb-1 mb-3">Amounts (₹)</div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={lbl}>Base Amount</label><input className={`${inp} font-mono`} type="number" min="0" step="0.01" value={form.totalAmount} onChange={e => setField("totalAmount", e.target.value)} /></div>
              <div><label className={lbl}>GST Amount</label><input className={`${inp} font-mono`} type="number" min="0" step="0.01" value={form.gstAmount} onChange={e => setField("gstAmount", e.target.value)} /></div>
              <div><label className={lbl}>Final Amount</label><input className={`${inp} font-mono`} type="number" min="0" step="0.01" value={form.finalAmount} onChange={e => setField("finalAmount", e.target.value)} /></div>
              <div><label className={lbl}>Advance Paid</label><input className={`${inp} font-mono`} type="number" min="0" step="0.01" value={form.advanceAmount} onChange={e => setField("advanceAmount", e.target.value)} /></div>
              <div><label className={lbl}>Total Paid</label><input className={`${inp} font-mono`} type="number" min="0" step="0.01" value={form.paidAmount} onChange={e => setField("paidAmount", e.target.value)} /></div>
            </div>
          </div>
          <div>
            <div className="text-sm font-bold text-[#0A3D2A] uppercase tracking-wide border-b border-[#0A3D2A]/20 pb-1 mb-3">Notes</div>
            <textarea className={`${inp} resize-none`} rows={3} value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="Additional notes..." />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-lg bg-[#0A3D2A] text-white text-sm font-bold hover:bg-[#0d5038] disabled:opacity-60">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AuditLogModal({ bookingId, bookingNumber, open, onClose }: {
  bookingId: string | null; bookingNumber: string; open: boolean; onClose: () => void;
}) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !bookingId) return;
    setLoading(true);
    fetch(`${API}/api/bookings/${bookingId}/audit-log`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setLogs(Array.isArray(data) ? data : []))
      .catch(() => toast({ title: "Failed to load audit log", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, bookingId]);

  const actionLabel = (action: string) => {
    if (action === "edit") return { label: "Edited", color: "bg-blue-100 text-blue-800" };
    if (action === "soft_delete") return { label: "Deleted", color: "bg-red-100 text-red-800" };
    if (action === "restore") return { label: "Restored", color: "bg-emerald-100 text-emerald-800" };
    if (action === "create") return { label: "Created", color: "bg-purple-100 text-purple-800" };
    return { label: action, color: "bg-gray-100 text-gray-800" };
  };

  const fieldLabel = (f: string) => f.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History size={18} className="text-[#0A3D2A]" />
            Audit Log — {bookingNumber}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading audit log…</p>
        ) : logs.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <History size={16} />No audit records found.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Date & Time</th>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Field</th>
                  <th className="px-3 py-2 text-left">Old Value</th>
                  <th className="px-3 py-2 text-left">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log: any, i: number) => {
                  const { label, color } = actionLabel(log.action);
                  return (
                    <tr key={log.id ?? i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {log.changed_at ? new Date(log.changed_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">{log.changed_by || "—"}</td>
                      <td className="px-3 py-2">
                        <Badge className={`text-[10px] px-2 py-0.5 border-0 font-semibold ${color}`}>{label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{log.field_name ? fieldLabel(log.field_name) : "—"}</td>
                      <td className="px-3 py-2 text-xs text-red-600 max-w-[120px] truncate" title={log.old_value}>{log.old_value || "—"}</td>
                      <td className="px-3 py-2 text-xs text-emerald-700 max-w-[120px] truncate" title={log.new_value}>{log.new_value || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteConfirmDialog({ count, open, deleting, onClose, onConfirm }: {
  count: number; open: boolean; deleting: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && !deleting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle size={18} /> Delete Selected Bookings
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm font-semibold text-amber-900">
            ⚠️ You are about to delete <span className="font-bold text-red-700">{count} booking{count !== 1 ? "s" : ""}</span>.
          </div>
          <p className="text-sm text-muted-foreground font-medium">This will:</p>
          <ul className="text-sm text-muted-foreground space-y-1.5 pl-2">
            {[
              "Move bookings to Trash (Soft Delete)",
              "Keep audit logs",
              "Remove them from the active bookings list",
              "Update dashboard statistics",
              "Update payment analytics",
              "Update customer and hajji records",
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">•</span> {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground bg-gray-50 rounded-lg px-3 py-2 border">
            You can restore bookings from the 🗑 Trash tab at any time.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2">
            {deleting && <Loader2 size={14} className="animate-spin" />}
            Move to Trash
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDeleteDialog({ booking, open, onClose, onConfirm }: {
  booking: any | null; open: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle size={18} /> Move to Trash
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to move this booking to Trash?
          </p>
          {booking && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">Booking:</span> <span className="font-mono font-bold">{booking.bookingNumber}</span></p>
              <p><span className="text-muted-foreground">Customer:</span> <span className="font-semibold">{booking.customerName}</span></p>
              <p><span className="text-muted-foreground">Status:</span> <span className="capitalize">{booking.status}</span></p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Payments, invoices, and pilgrim records will NOT be deleted. You can restore this booking anytime.</p>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700">Move to Trash</button>
        </div>
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
  const { requestDelete } = useDeleteGuard();
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [showOfflineForm, setShowOfflineForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [autoFillingCardId, setAutoFillingCardId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editBooking, setEditBooking] = useState<any | null>(null);
  const [auditBooking, setAuditBooking] = useState<any | null>(null);
  const [softDeleteTarget, setSoftDeleteTarget] = useState<any | null>(null);
  const [trashBookings, setTrashBookings] = useState<any[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchTrash = async () => {
    setTrashLoading(true);
    try {
      const res = await fetch(`${API}/api/bookings/trash`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trash");
      const data = await res.json();
      setTrashBookings(data.bookings || []);
    } catch (err: any) {
      toast({ title: "Error loading trash", description: err.message, variant: "destructive" });
    } finally {
      setTrashLoading(false);
    }
  };

  useEffect(() => {
    if (statusFilter === "trash") fetchTrash();
  }, [statusFilter]);

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync({ id });
      toast({ title: "Booking Approved" });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to approve", variant: "destructive" });
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
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to reject", variant: "destructive" });
    }
  };

  const handleAutoFillFromCard = async (bookingId: string) => {
    setAutoFillingCardId(bookingId);
    try {
      const res = await fetch(`${API}/api/admin/bookings/${bookingId}/auto-fill-pilgrim`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Auto-fill failed");
      toast({ title: "Pilgrim auto-filled!", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Auto-fill failed", variant: "destructive" });
    } finally {
      setAutoFillingCardId(null);
    }
  };

  const handleSoftDelete = async (bookingId: string) => {
    try {
      const res = await fetch(`${API}/api/bookings/${bookingId}/trash`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || d.error || "Failed to delete"); }
      toast({ title: "Booking moved to Trash" });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      setSoftDeleteTarget(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleRestore = async (bookingId: string) => {
    try {
      const res = await fetch(`${API}/api/bookings/${bookingId}/restore`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed to restore"); }
      toast({ title: "Booking restored!" });
      fetchTrash();
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handlePermanentDelete = (booking: any) => {
    requestDelete(`Booking #${booking.bookingNumber} (${booking.customerName})`, async (token) => {
      const res = await fetch(`${API}/api/bookings/${booking.id}/permanent`, {
        method: "DELETE", credentials: "include", headers: { "X-Delete-Token": token },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed to permanently delete"); }
      toast({ title: "Booking permanently deleted" });
      fetchTrash();
    });
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((b: any) => b.id)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch(`${API}/api/bookings/bulk-trash`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const d = await res.json() as { message?: string; successCount?: number; failCount?: number };
      if (!res.ok) throw new Error(d.message || "Bulk delete failed");
      toast({ title: "Bulk Delete Complete", description: d.message });
      setSelectedIds(new Set());
      setShowBulkConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      refetch();
    } catch (err: any) {
      toast({ title: "Bulk Delete Error", description: err.message, variant: "destructive" });
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDuplicate = async (bookingId: string) => {
    try {
      const res = await fetch(`${API}/api/bookings/${bookingId}/duplicate`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Failed to duplicate"); }
      const data = await res.json();
      toast({ title: "Booking duplicated!", description: `New booking: ${data.bookingNumber}` });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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

  const matchesSearch = (b: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    if (b.bookingNumber?.toLowerCase().includes(q)) return true;
    if (b.customerName?.toLowerCase().includes(q)) return true;
    if (b.customerMobile?.includes(q.replace(/\D/g, ''))) return true;
    if (b.notes?.toLowerCase().includes(q)) return true;
    const pilgrims = Array.isArray(b.pilgrims) ? b.pilgrims : [];
    if (pilgrims.some((p: any) => p.passportNumber?.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q))) return true;
    return false;
  };

  const filtered = (statusFilter === "all" ? bookings : bookings.filter((b: any) => b.status === statusFilter)).filter(matchesSearch);
  const allSelected = filtered.length > 0 && filtered.every((b: any) => selectedIds.has(b.id));
  const someSelected = !allSelected && filtered.some((b: any) => selectedIds.has(b.id));
  const counts = bookings.reduce((acc: Record<string, number>, b: any) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  const statusTabs = [
    { label: "All", value: "all", count: bookings.length, color: "bg-gray-50 border-gray-200" },
    { label: "Pending", value: "pending", count: counts.pending || 0, color: "bg-amber-50 border-amber-200" },
    { label: "Approved", value: "approved", count: counts.approved || 0, color: "bg-blue-50 border-blue-200" },
    { label: "Part. Paid", value: "partially_paid", count: counts.partially_paid || 0, color: "bg-orange-50 border-orange-200" },
    { label: "Confirmed", value: "confirmed", count: counts.confirmed || 0, color: "bg-emerald-50 border-emerald-200" },
    { label: "Cancelled", value: "cancelled", count: counts.cancelled || 0, color: "bg-gray-50 border-gray-200" },
    { label: "Rejected", value: "rejected", count: counts.rejected || 0, color: "bg-red-50 border-red-200" },
    { label: "🗑 Trash", value: "trash", count: 0, color: "bg-red-50 border-red-300" },
  ];

  return (
    <AdminLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Bookings Management</h1>
          <p className="text-muted-foreground mt-1">Review, process, and create offline booking requests.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && statusFilter !== "trash" && (
            <button
              onClick={() => setShowBulkConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 shadow-md transition-colors"
            >
              <Trash2 size={15} /> Bulk Delete ({selectedIds.size})
            </button>
          )}
          <Button onClick={() => setShowOfflineForm(true)} className="bg-[#0A3D2A] hover:bg-[#0d5038] text-white font-semibold flex items-center gap-2 shadow-md">
            <Plus size={16} /> New Offline Booking
          </Button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="grid grid-cols-8 gap-2 mb-4">
        {statusTabs.map(s => (
          <button key={s.value} onClick={() => setStatusFilter(s.value)}
            className={`p-3 rounded-xl border-2 text-left transition hover:shadow-md ${s.color} ${statusFilter === s.value ? "shadow-md ring-2 ring-[#0A3D2A]" : ""}`}>
            <div className="text-xl font-bold text-foreground">{s.value === "trash" ? "—" : s.count}</div>
            <div className="text-[10px] text-muted-foreground font-semibold uppercase mt-0.5 leading-tight">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Search Bar */}
      {statusFilter !== "trash" && (
        <div className="mb-4 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by Booking ID, Name, Mobile, Passport, Family ID…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A3D2A] bg-white shadow-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold">
              Clear
            </button>
          )}
        </div>
      )}

      {/* TRASH VIEW */}
      {statusFilter === "trash" && (
        <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
          <div className="px-6 py-4 bg-red-50 border-b border-red-200 flex items-center gap-2">
            <Trash2 size={16} className="text-red-600" />
            <h2 className="font-semibold text-red-800 text-sm">Deleted Bookings — Trash</h2>
            <span className="text-xs text-red-500 ml-auto">Payments, invoices & pilgrims are preserved</span>
            <Button size="sm" variant="outline" className="h-7 text-xs ml-2" onClick={fetchTrash}>
              <RefreshCw size={12} className={trashLoading ? "animate-spin" : ""} />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
                <tr>
                  <th className="px-5 py-3">Booking</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Package / Amount</th>
                  <th className="px-5 py-3">Deleted By / When</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trashLoading ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading trash…</td></tr>
                ) : trashBookings.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Trash is empty.</td></tr>
                ) : trashBookings.map((b: any) => (
                  <tr key={b.id} className="hover:bg-red-50/30 transition-colors bg-red-50/10">
                    <td className="px-5 py-3">
                      <div className="font-mono font-bold text-red-700 line-through opacity-70">{b.bookingNumber}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDate(b.createdAt)}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-semibold text-gray-600">{b.customerName}</div>
                      <div className="text-xs text-muted-foreground">{b.customerMobile}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-sm text-gray-600">{b.packageName || "—"}</div>
                      <div className="font-mono text-xs text-[#0A3D2A]">{b.finalAmount ? formatCurrency(b.finalAmount) : "—"}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-xs font-medium">{b.deletedBy || "—"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {b.deletedAt ? new Date(b.deletedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-700 hover:bg-emerald-50 gap-1" onClick={() => handleRestore(b.id)}>
                          <RotateCcw size={12} /> Restore
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50 gap-1" onClick={() => handlePermanentDelete(b)}>
                          <Trash2 size={12} /> Permanent Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* MAIN BOOKINGS TABLE */}
      {statusFilter !== "trash" && (
        <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
                <tr>
                  <th className="px-4 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={handleSelectAll}
                      className="w-4 h-4 accent-[#0A3D2A] cursor-pointer"
                      title="Select All"
                    />
                  </th>
                  <th className="px-5 py-4">Booking ID / Date</th>
                  <th className="px-5 py-4">Customer Info</th>
                  <th className="px-5 py-4">Package</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">
                    {searchQuery ? `No bookings match "${searchQuery}"` : "No bookings found."}
                  </td></tr>
                ) : filtered.map((booking: any) => (
                  <tr key={booking.id} className={`hover:bg-muted/30 transition-colors ${selectedIds.has(booking.id) ? "bg-red-50/40" : ""}`}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(booking.id)}
                        onChange={() => handleToggleSelect(booking.id)}
                        className="w-4 h-4 accent-[#0A3D2A] cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-mono font-bold text-primary text-sm">{booking.bookingNumber}</div>
                      <div className="text-xs text-muted-foreground mt-1">{formatDate(booking.createdAt)}</div>
                      {booking.isOffline && <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">OFFLINE</span>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold">{booking.customerName}</div>
                      <div className="text-xs text-muted-foreground">{booking.customerMobile}</div>
                      {booking.customerEmail && <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{booking.customerEmail}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-foreground">{booking.packageName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{booking.numberOfPilgrims} Pilgrim(s)</div>
                      {booking.roomType && <div className="text-[10px] text-muted-foreground capitalize">{booking.roomType}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-mono font-semibold text-[#0A3D2A]">{booking.finalAmount ? formatCurrency(booking.finalAmount) : "—"}</div>
                      {booking.advanceAmount && (
                        <div className="text-xs text-emerald-600">Adv: ₹{Number(booking.advanceAmount).toLocaleString("en-IN")}</div>
                      )}
                      {booking.paidAmount && booking.finalAmount && Number(booking.paidAmount) < Number(booking.finalAmount) && (
                        <div className="text-[10px] text-red-500">Due: ₹{(Number(booking.finalAmount) - Number(booking.paidAmount)).toLocaleString("en-IN")}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1.5">
                        <Badge variant="outline" className={`px-2.5 py-1 uppercase tracking-wider text-[10px] font-bold border-0 ${getStatusColor(booking.status)}`}>
                          {getStatusLabel(booking.status)}
                        </Badge>
                        {booking.travellerDetailsStatus === "submitted" ? (
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
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* View */}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-blue-50" onClick={() => setDetailBooking(booking)} title="View Details">
                          <Eye size={15} />
                        </Button>
                        {/* Edit */}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => setEditBooking(booking)} title="Edit Booking">
                          <Pencil size={15} />
                        </Button>
                        {/* Duplicate */}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:bg-indigo-50" onClick={() => handleDuplicate(booking.id)} title="Duplicate Booking">
                          <Copy size={15} />
                        </Button>
                        {/* Audit Log */}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:bg-gray-100" onClick={() => setAuditBooking(booking)} title="View Audit Log">
                          <History size={15} />
                        </Button>
                        {/* Auto-fill Pilgrim */}
                        {booking.travellerDetailsStatus === "submitted" && booking.groupId && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:bg-indigo-50" title="Auto-fill Pilgrim"
                            disabled={autoFillingCardId === booking.id} onClick={() => handleAutoFillFromCard(booking.id)}>
                            <User size={15} className={autoFillingCardId === booking.id ? "animate-pulse" : ""} />
                          </Button>
                        )}
                        {/* Approve / Reject (pending only) */}
                        {booking.status === 'pending' && (
                          <>
                            <PermissionGuard module="bookings" action="approve" asDisabled>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={() => handleApprove(booking.id)} title="Approve">
                                <CheckCircle size={15} />
                              </Button>
                            </PermissionGuard>
                            <PermissionGuard module="bookings" action="edit" asDisabled>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => handleReject(booking.id)} title="Reject">
                                <XCircle size={15} />
                              </Button>
                            </PermissionGuard>
                          </>
                        )}
                        {/* Soft Delete */}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => setSoftDeleteTarget(booking)} title="Move to Trash">
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
              Showing {filtered.length} booking{filtered.length !== 1 ? "s" : ""}
              {searchQuery && ` matching "${searchQuery}"`}
            </div>
          )}
        </Card>
      )}

      {/* Modals */}
      <BookingDetailModal booking={detailBooking} open={!!detailBooking} onClose={() => setDetailBooking(null)} />
      <EditBookingModal
        booking={editBooking}
        open={!!editBooking}
        onClose={() => setEditBooking(null)}
        onSaved={() => { queryClient.invalidateQueries({ queryKey: ['/api/bookings'] }); refetch(); }}
      />
      <AuditLogModal
        bookingId={auditBooking?.id ?? null}
        bookingNumber={auditBooking?.bookingNumber ?? ""}
        open={!!auditBooking}
        onClose={() => setAuditBooking(null)}
      />
      <ConfirmDeleteDialog
        booking={softDeleteTarget}
        open={!!softDeleteTarget}
        onClose={() => setSoftDeleteTarget(null)}
        onConfirm={() => softDeleteTarget && handleSoftDelete(softDeleteTarget.id)}
      />
      <OfflineBookingForm
        open={showOfflineForm}
        onClose={() => setShowOfflineForm(false)}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['/api/bookings'] }); refetch(); }}
      />
      <BulkDeleteConfirmDialog
        count={selectedIds.size}
        open={showBulkConfirm}
        deleting={bulkDeleting}
        onClose={() => setShowBulkConfirm(false)}
        onConfirm={handleBulkDelete}
      />
    </AdminLayout>
  );
}
