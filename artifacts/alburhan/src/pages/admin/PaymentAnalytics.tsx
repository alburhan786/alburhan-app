import { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-permissions";
import {
  IndianRupee, TrendingUp, Clock, AlertTriangle,
  ChevronUp, ChevronDown, Bell, BellOff, Play,
  Edit2, Trash2, RotateCcw, Eye, Printer, History,
  X, Plus, CheckCircle, AlertCircle, Loader2, Search,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

type BookingRow = {
  id: string; bookingNumber: string; customerName: string; customerMobile: string;
  status: string; finalAmount: number | null; paidAmount: number;
  remainingAmount: number | null; invoiceNumber: string | null;
  createdAt: string; updatedAt: string; isOffline: boolean;
  packageName?: string | null;
};
type AnalyticsData = {
  todayCollection: number; monthlyRevenue: number; totalPending: number;
  totalOverdue: number; overdueCount: number;
  paymentStatusBreakdown: Record<string, number>;
  bookings: BookingRow[];
};
type PaymentTxn = {
  id: string; bookingId: string; amount: number; paymentDate: string;
  paymentMode: string; referenceNumber?: string | null; bankName?: string | null;
  receivedBy?: string | null; notes?: string | null; recordedBy?: string | null;
  createdAt: string; editedAt?: string | null; editedBy?: string | null;
  isDeleted: boolean; deletedAt?: string | null; deletedBy?: string | null;
  deletionReason?: string | null;
};
type AuditLog = {
  id: string; action: string; old_amount?: number; new_amount?: number;
  old_mode?: string; new_mode?: string; old_date?: string; new_date?: string;
  changed_by_name?: string; change_reason?: string; changed_at: string;
};

type SortKey = "bookingNumber" | "customerName" | "finalAmount" | "paidAmount" | "remainingAmount" | "updatedAt";
type FilterTab = "all" | "confirmed" | "partially_paid" | "approved" | "pending" | "overdue";

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const MODE_LABELS: Record<string, string> = {
  cash: "Cash", neft: "NEFT", upi: "UPI", cheque: "Cheque", online: "Online",
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  confirmed:     { label: "Paid",      bg: "bg-emerald-100", text: "text-emerald-800" },
  partially_paid:{ label: "Partial",   bg: "bg-amber-100",   text: "text-amber-800" },
  approved:      { label: "Approved",  bg: "bg-blue-100",    text: "text-blue-800" },
  pending:       { label: "Pending",   bg: "bg-red-100",     text: "text-red-800" },
  rejected:      { label: "Rejected",  bg: "bg-red-100",     text: "text-red-800" },
  cancelled:     { label: "Cancelled", bg: "bg-gray-100",    text: "text-gray-500" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function KpiCard({ label, value, icon: Icon, iconBg, iconColor, sub }: {
  label: string; value: string; icon: React.ElementType;
  iconBg: string; iconColor: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={18} className={iconColor} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 font-mono">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ---------- Payment Drawer ----------

type DrawerProps = {
  booking: BookingRow | null;
  onClose: () => void;
  onRefreshAnalytics: () => void;
};

function PaymentDrawer({ booking, onClose, onRefreshAnalytics }: DrawerProps) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canDelete = can("payments", "delete");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<PaymentTxn | null>(null);
  const [deleteTxn, setDeleteTxn] = useState<PaymentTxn | null>(null);
  const [reverseTxn, setReverseTxn] = useState<PaymentTxn | null>(null);
  const [historyTxn, setHistoryTxn] = useState<PaymentTxn | null>(null);
  const [receiptTxn, setReceiptTxn] = useState<PaymentTxn | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const txnKey = ["booking-payments", booking?.id, includeDeleted];
  const { data: txns = [], isLoading: txnsLoading, refetch: refetchTxns } = useQuery<PaymentTxn[]>({
    queryKey: txnKey,
    queryFn: () =>
      fetch(`${API}/api/admin/bookings/${booking!.id}/payments?includeDeleted=${includeDeleted ? 1 : 0}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!booking,
  });

  const refresh = () => {
    refetchTxns();
    onRefreshAnalytics();
  };

  const doRestore = async (txn: PaymentTxn) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/${booking!.id}/payments/${txn.id}/restore`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json() as { message?: string };
      if (!r.ok) throw new Error(d.message ?? "Failed");
      showToast("ok", "Payment restored successfully");
      refresh();
    } catch (e) {
      showToast("err", (e as Error).message);
    } finally { setLoading(false); }
  };

  if (!booking) return null;

  const activeTxns = txns.filter(t => !t.isDeleted);
  const deletedTxns = txns.filter(t => t.isDeleted);
  const manualTotal = activeTxns.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-[#0B3D2E]">
          <div>
            <p className="text-white font-bold text-lg">{booking.customerName}</p>
            <p className="text-emerald-300 text-xs font-mono">{booking.bookingNumber}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-emerald-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Balance Summary */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { label: "Total Amount", value: booking.finalAmount != null ? fmt(booking.finalAmount) : "—", color: "text-gray-900" },
            { label: "Total Paid", value: fmt(booking.paidAmount), color: "text-emerald-600" },
            { label: "Remaining", value: booking.remainingAmount != null && booking.remainingAmount > 0 ? fmt(booking.remainingAmount) : "Paid ✓", color: booking.remainingAmount ? "text-amber-600" : "text-emerald-600" },
          ].map(c => (
            <div key={c.label} className="px-4 py-3 text-center">
              <p className="text-xs text-gray-400 font-medium">{c.label}</p>
              <p className={`text-base font-bold font-mono mt-0.5 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mx-5 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${toast.type === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {toast.type === "ok" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {toast.msg}
          </div>
        )}

        {/* Actions bar */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 text-xs bg-[#0B3D2E] text-white rounded-lg px-3 py-1.5 hover:bg-[#0a3327] transition-colors font-medium"
            >
              <Plus size={13} /> Add Payment
            </button>
            <button
              onClick={() => setIncludeDeleted(v => !v)}
              className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 transition-colors font-medium ${includeDeleted ? "border-red-300 text-red-600 bg-red-50" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
            >
              <Trash2 size={12} />
              {includeDeleted ? "Hide Deleted" : "Show Deleted"}
              {deletedTxns.length > 0 && <span className="ml-1 bg-red-100 text-red-700 rounded-full px-1.5 text-xs font-bold">{deletedTxns.length}</span>}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-400">Manual ledger: <span className="font-mono font-semibold text-emerald-600">{fmt(manualTotal)}</span></p>
            {canDelete && <DeleteBookingButton booking={booking} onClose={onClose} onRefreshAnalytics={onRefreshAnalytics} showToast={showToast} />}
          </div>
        </div>

        {/* Transaction list */}
        <div className="flex-1 overflow-y-auto">
          {txnsLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading...
            </div>
          ) : txns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
              <IndianRupee size={24} className="opacity-40" />
              <p className="text-sm">No payment records yet</p>
              <button onClick={() => setAddOpen(true)} className="text-xs text-[#0B3D2E] underline">Add first payment</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {txns.map(txn => (
                <TxnRow
                  key={txn.id}
                  txn={txn}
                  loading={loading}
                  canDelete={canDelete}
                  onEdit={() => setEditTxn(txn)}
                  onDelete={() => setDeleteTxn(txn)}
                  onReverse={() => setReverseTxn(txn)}
                  onRestore={() => doRestore(txn)}
                  onHistory={() => setHistoryTxn(txn)}
                  onReceipt={() => setReceiptTxn(txn)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Payment Dialog */}
      {addOpen && (
        <AddPaymentDialog
          booking={booking}
          onClose={() => setAddOpen(false)}
          onSuccess={(msg) => { showToast("ok", msg); refresh(); setAddOpen(false); }}
          onError={(msg) => showToast("err", msg)}
        />
      )}

      {/* Edit Payment Dialog */}
      {editTxn && (
        <EditPaymentDialog
          booking={booking}
          txn={editTxn}
          onClose={() => setEditTxn(null)}
          onSuccess={(msg) => { showToast("ok", msg); refresh(); setEditTxn(null); }}
          onError={(msg) => showToast("err", msg)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTxn && (
        <DeleteDialog
          txn={deleteTxn}
          booking={booking}
          onClose={() => setDeleteTxn(null)}
          onSuccess={(msg) => { showToast("ok", msg); refresh(); setDeleteTxn(null); }}
          onError={(msg) => showToast("err", msg)}
          onRequestReverse={() => { setDeleteTxn(null); setReverseTxn(deleteTxn); }}
        />
      )}

      {/* Reverse Payment */}
      {reverseTxn && (
        <ReverseDialog
          txn={reverseTxn}
          booking={booking}
          onClose={() => setReverseTxn(null)}
          onSuccess={(msg) => { showToast("ok", msg); refresh(); setReverseTxn(null); }}
          onError={(msg) => showToast("err", msg)}
        />
      )}

      {/* History */}
      {historyTxn && (
        <HistoryDialog txn={historyTxn} booking={booking} onClose={() => setHistoryTxn(null)} />
      )}

      {/* Receipt */}
      {receiptTxn && (
        <ReceiptDialog txn={receiptTxn} booking={booking} onClose={() => setReceiptTxn(null)} />
      )}
    </div>
  );
}

function TxnRow({ txn, loading, canDelete, onEdit, onDelete, onReverse, onRestore, onHistory, onReceipt }: {
  txn: PaymentTxn; loading: boolean; canDelete: boolean;
  onEdit: () => void; onDelete: () => void; onReverse: () => void; onRestore: () => void;
  onHistory: () => void; onReceipt: () => void;
}) {
  return (
    <div className={`px-5 py-3 flex items-start gap-3 ${txn.isDeleted ? "opacity-50 bg-red-50/30" : "hover:bg-gray-50"} transition-colors`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-gray-900 text-sm">{fmt(txn.amount)}</span>
          <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-medium">{MODE_LABELS[txn.paymentMode] ?? txn.paymentMode}</span>
          {txn.isDeleted && <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-medium">Deleted</span>}
          {txn.notes?.startsWith("Reversal:") && !txn.isDeleted && <span className="text-xs bg-orange-50 text-orange-600 rounded px-1.5 py-0.5 font-medium">Reversal</span>}
          {txn.editedAt && !txn.isDeleted && !txn.notes?.startsWith("Reversal:") && <span className="text-xs bg-blue-50 text-blue-500 rounded px-1.5 py-0.5">Edited</span>}
        </div>
        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{new Date(txn.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
          {txn.referenceNumber && <span className="font-mono">Ref: {txn.referenceNumber}</span>}
          {txn.bankName && <span>Bank: {txn.bankName}</span>}
          {txn.receivedBy && <span>Rcvd by: {txn.receivedBy}</span>}
        </div>
        {txn.notes && <p className="text-xs text-gray-400 mt-0.5 italic truncate">{txn.notes}</p>}
        {txn.isDeleted && txn.deletionReason && (
          <p className="text-xs text-red-500 mt-0.5">Reason: {txn.deletionReason}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {txn.isDeleted ? (
          <button title="Restore" disabled={loading} onClick={onRestore} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40">
            <RotateCcw size={14} />
          </button>
        ) : (
          <>
            <button title="View Receipt" onClick={onReceipt} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
              <Printer size={14} />
            </button>
            <button title="Edit" onClick={onEdit} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
              <Edit2 size={14} />
            </button>
            {canDelete && (
              <>
                <button title="Reverse Payment" onClick={onReverse} className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 transition-colors">
                  <RotateCcw size={14} />
                </button>
                <button title="Delete Payment" onClick={onDelete} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </>
        )}
        <button title="Payment History" onClick={onHistory} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
          <History size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------- Add Payment Dialog ----------
function AddPaymentDialog({ booking, onClose, onSuccess, onError }: {
  booking: BookingRow; onClose: () => void;
  onSuccess: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({ amount: "", paymentDate: new Date().toISOString().slice(0, 10), paymentMode: "cash", referenceNumber: "", bankName: "", receivedBy: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/${booking.id}/payments`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const d = await r.json() as { message?: string };
      if (!r.ok) throw new Error(d.message ?? "Failed");
      onSuccess("Payment added successfully");
    } catch (e) { onError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog title="Add Payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <PaymentFormFields form={form} setForm={setForm} />
        <DialogFooter onCancel={onClose} saving={saving} label="Add Payment" />
      </form>
    </Dialog>
  );
}

// ---------- Edit Payment Dialog ----------
function EditPaymentDialog({ booking, txn, onClose, onSuccess, onError }: {
  booking: BookingRow; txn: PaymentTxn; onClose: () => void;
  onSuccess: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    amount: String(txn.amount),
    paymentDate: txn.paymentDate,
    paymentMode: txn.paymentMode,
    referenceNumber: txn.referenceNumber ?? "",
    bankName: txn.bankName ?? "",
    receivedBy: txn.receivedBy ?? "",
    notes: txn.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/${booking.id}/payments/${txn.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const d = await r.json() as { message?: string };
      if (!r.ok) throw new Error(d.message ?? "Failed");
      onSuccess("Payment updated successfully");
    } catch (e) { onError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog title="Edit Payment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <PaymentFormFields form={form} setForm={setForm} />
        <DialogFooter onCancel={onClose} saving={saving} label="Save Changes" />
      </form>
    </Dialog>
  );
}

// ---------- Shared form fields ----------
type FormState = { amount: string; paymentDate: string; paymentMode: string; referenceNumber: string; bankName: string; receivedBy: string; notes: string };
function PaymentFormFields({ form, setForm }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>> }) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" required>
          <input type="number" min="1" step="0.01" value={form.amount} onChange={set("amount")} required className="input-std" placeholder="Enter amount" />
        </Field>
        <Field label="Payment Date" required>
          <input type="date" value={form.paymentDate} onChange={set("paymentDate")} required className="input-std" />
        </Field>
      </div>
      <Field label="Payment Mode" required>
        <select value={form.paymentMode} onChange={set("paymentMode")} className="input-std">
          <option value="cash">Cash</option>
          <option value="neft">NEFT / Bank Transfer</option>
          <option value="upi">UPI</option>
          <option value="cheque">Cheque</option>
          <option value="online">Online (Razorpay)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reference / TXN ID">
          <input type="text" value={form.referenceNumber} onChange={set("referenceNumber")} className="input-std" placeholder="UTR / Ref No." />
        </Field>
        <Field label="Bank Name">
          <input type="text" value={form.bankName} onChange={set("bankName")} className="input-std" placeholder="SBI, HDFC…" />
        </Field>
      </div>
      <Field label="Received By">
        <input type="text" value={form.receivedBy} onChange={set("receivedBy")} className="input-std" placeholder="Staff name" />
      </Field>
      <Field label="Notes">
        <textarea value={form.notes} onChange={set("notes")} className="input-std resize-none" rows={2} placeholder="Optional notes…" />
      </Field>
    </>
  );
}

// ---------- Delete Booking Button ----------
function DeleteBookingButton({ booking, onClose, onRefreshAnalytics, showToast }: {
  booking: BookingRow; onClose: () => void;
  onRefreshAnalytics: () => void; showToast: (t: "ok" | "err", m: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const doDelete = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/${booking.id}`, {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? d.message ?? "Failed to delete booking");
      showToast("ok", "Booking deleted successfully.");
      onRefreshAnalytics();
      onClose();
    } catch (e) {
      showToast("err", (e as Error).message);
      setConfirm(false);
    } finally { setSaving(false); }
  };

  if (confirm) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
        <span className="text-xs text-red-700 font-medium">Delete this booking?</span>
        <button onClick={doDelete} disabled={saving} className="text-xs bg-red-600 text-white rounded px-2 py-0.5 hover:bg-red-700 disabled:opacity-50 font-medium flex items-center gap-1">
          {saving && <Loader2 size={11} className="animate-spin" />} Yes, Delete
        </button>
        <button onClick={() => setConfirm(false)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="flex items-center gap-1.5 text-xs border border-red-200 text-red-600 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors font-medium"
    >
      <Trash2 size={12} /> Delete Booking
    </button>
  );
}

// ---------- Delete Dialog ----------
function DeleteDialog({ txn, booking, onClose, onSuccess, onError, onRequestReverse }: {
  txn: PaymentTxn; booking: BookingRow; onClose: () => void;
  onSuccess: (msg: string) => void; onError: (msg: string) => void;
  onRequestReverse: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [journalLinked, setJournalLinked] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/${booking.id}/payments/${txn.id}`, {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const d = await r.json() as { message?: string; code?: string };
      if (!r.ok) {
        if (d.code === "JOURNAL_LINKED") { setJournalLinked(true); return; }
        throw new Error(d.message ?? "Failed");
      }
      onSuccess("Payment deleted successfully.");
    } catch (e) { onError((e as Error).message); }
    finally { setSaving(false); }
  };

  if (journalLinked) {
    return (
      <Dialog title="Cannot Delete Payment" onClose={onClose}>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <p className="text-amber-800 text-sm font-semibold mb-1">Linked to Accounting Records</p>
          <p className="text-amber-700 text-sm">This payment is linked to accounting records. Please reverse or cancel the payment instead.</p>
          <p className="text-amber-600 text-xs mt-2">A reversal creates a negative transaction that preserves the full audit trail.</p>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
          <button type="button" onClick={onRequestReverse} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center gap-1.5">
            <RotateCcw size={13} /> Reverse Payment
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Delete Payment" onClose={onClose}>
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
        <p className="text-red-700 text-sm font-semibold">Are you sure you want to delete this payment? This action cannot be undone.</p>
        <p className="text-red-600 text-xs mt-1">Amount: <strong>{fmt(txn.amount)}</strong> — {MODE_LABELS[txn.paymentMode]} on {new Date(txn.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        <p className="text-red-500 text-xs mt-0.5">Booking balance and ledgers will be recalculated automatically.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason for deletion (optional)">
          <textarea value={reason} onChange={e => setReason(e.target.value)} className="input-std resize-none" rows={2} placeholder="Duplicate entry, data correction…" />
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors font-medium flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />} Delete Payment
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------- Reverse Dialog ----------
function ReverseDialog({ txn, booking, onClose, onSuccess, onError }: {
  txn: PaymentTxn; booking: BookingRow; onClose: () => void;
  onSuccess: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/${booking.id}/payments/${txn.id}/reverse`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const d = await r.json() as { message?: string };
      if (!r.ok) throw new Error(d.message ?? "Failed");
      onSuccess("Payment reversed successfully.");
    } catch (e) { onError((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog title="Reverse Payment" onClose={onClose}>
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
        <p className="text-orange-800 text-sm font-semibold">A reversal entry will be created</p>
        <p className="text-orange-700 text-xs mt-1">Amount: <strong>{fmt(txn.amount)}</strong> — {MODE_LABELS[txn.paymentMode]} on {new Date(txn.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        <p className="text-orange-600 text-xs mt-0.5">A negative transaction of <strong>{fmt(txn.amount)}</strong> will be added, cancelling this payment while preserving the audit trail.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason for reversal (optional)">
          <textarea value={reason} onChange={e => setReason(e.target.value)} className="input-std resize-none" rows={2} placeholder="Entered in error, customer refund…" />
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors font-medium flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />} Confirm Reversal
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------- History Dialog ----------
function HistoryDialog({ txn, booking, onClose }: { txn: PaymentTxn; booking: BookingRow; onClose: () => void }) {
  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["payment-history", txn.id],
    queryFn: () =>
      fetch(`${API}/api/admin/bookings/${booking.id}/payments/${txn.id}/history`, { credentials: "include" })
        .then(r => r.json()),
  });

  const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    created: { label: "Added", color: "text-emerald-700 bg-emerald-50" },
    edited:  { label: "Edited", color: "text-blue-700 bg-blue-50" },
    deleted: { label: "Deleted", color: "text-red-700 bg-red-50" },
    restored:{ label: "Restored", color: "text-purple-700 bg-purple-50" },
  };

  return (
    <Dialog title={`Payment History — ${fmt(txn.amount)}`} onClose={onClose}>
      {isLoading ? (
        <div className="flex items-center justify-center h-24 text-gray-400"><Loader2 size={18} className="animate-spin mr-2" /> Loading…</div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No audit history yet.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {logs.map(log => {
            const cfg = ACTION_LABELS[log.action] ?? { label: log.action, color: "text-gray-700 bg-gray-50" };
            return (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <span className={`mt-0.5 shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                <div className="flex-1">
                  {log.new_amount && <p className="font-mono font-semibold text-gray-900">{fmt(log.new_amount)}{log.old_amount && log.old_amount !== log.new_amount ? <span className="text-gray-400 text-xs ml-2">← {fmt(log.old_amount)}</span> : null}</p>}
                  {log.changed_by_name && <p className="text-xs text-gray-500">by {log.changed_by_name}</p>}
                  {log.change_reason && <p className="text-xs text-gray-400 italic">{log.change_reason}</p>}
                  <p className="text-xs text-gray-300">{new Date(log.changed_at).toLocaleString("en-IN")}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="pt-4 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium">Close</button>
      </div>
    </Dialog>
  );
}

// ---------- Receipt Dialog ----------
function ReceiptDialog({ txn, booking, onClose }: { txn: PaymentTxn; booking: BookingRow; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const doPrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Payment Receipt</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:0;color:#111;font-size:13px}
        .header{background:#0B3D2E;color:white;padding:20px 24px;text-align:center}
        .header h1{margin:0;font-size:20px;letter-spacing:0.5px}
        .header p{margin:4px 0 0;font-size:12px;opacity:0.8}
        .body{padding:24px}
        .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0}
        .label{color:#666;font-size:12px}
        .value{font-weight:600;font-size:12px}
        .amount-box{background:#f0faf5;border:1px solid #d1fae5;border-radius:8px;padding:14px;text-align:center;margin:16px 0}
        .amount-box .big{font-size:26px;font-weight:900;color:#0B3D2E}
        .footer{text-align:center;color:#aaa;font-size:10px;padding:16px;border-top:1px solid #eee;margin-top:8px}
      </style></head><body>
      <div class="header"><h1>Al Burhan Tours & Travels</h1><p>Payment Receipt</p></div>
      <div class="body">
        <div class="amount-box"><div style="font-size:11px;color:#666;margin-bottom:4px">AMOUNT RECEIVED</div><div class="big">₹${txn.amount.toLocaleString("en-IN")}</div></div>
        <div class="row"><span class="label">Booking No.</span><span class="value">${booking.bookingNumber}</span></div>
        <div class="row"><span class="label">Pilgrim Name</span><span class="value">${booking.customerName}</span></div>
        <div class="row"><span class="label">Mobile</span><span class="value">${booking.customerMobile}</span></div>
        <div class="row"><span class="label">Payment Date</span><span class="value">${new Date(txn.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span></div>
        <div class="row"><span class="label">Payment Mode</span><span class="value">${MODE_LABELS[txn.paymentMode] ?? txn.paymentMode}</span></div>
        ${txn.referenceNumber ? `<div class="row"><span class="label">Reference No.</span><span class="value">${txn.referenceNumber}</span></div>` : ""}
        ${txn.bankName ? `<div class="row"><span class="label">Bank</span><span class="value">${txn.bankName}</span></div>` : ""}
        ${txn.receivedBy ? `<div class="row"><span class="label">Received By</span><span class="value">${txn.receivedBy}</span></div>` : ""}
        ${txn.notes ? `<div class="row"><span class="label">Notes</span><span class="value">${txn.notes}</span></div>` : ""}
        <div class="row"><span class="label">Package Total</span><span class="value">₹${(booking.finalAmount ?? 0).toLocaleString("en-IN")}</span></div>
        <div class="row"><span class="label">Total Paid</span><span class="value" style="color:#059669">₹${booking.paidAmount.toLocaleString("en-IN")}</span></div>
        <div class="row"><span class="label">Balance Due</span><span class="value" style="color:${(booking.remainingAmount ?? 0) > 0 ? "#d97706" : "#059669"}">${(booking.remainingAmount ?? 0) > 0 ? `₹${(booking.remainingAmount ?? 0).toLocaleString("en-IN")}` : "Paid in Full ✓"}</span></div>
      </div>
      <div class="footer">Receipt generated on ${new Date().toLocaleString("en-IN")} • Al Burhan Tours & Travels — alburhantravels.com</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 400);
  };

  return (
    <Dialog title="Payment Receipt" onClose={onClose}>
      <div ref={printRef} className="space-y-3">
        <div className="bg-[#0B3D2E] text-white text-center rounded-xl p-4">
          <p className="text-xs opacity-70 mb-1">AMOUNT RECEIVED</p>
          <p className="text-3xl font-black font-mono">{fmt(txn.amount)}</p>
        </div>
        {[
          ["Booking No.", booking.bookingNumber],
          ["Pilgrim", booking.customerName],
          ["Mobile", booking.customerMobile],
          ["Date", new Date(txn.paymentDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })],
          ["Mode", MODE_LABELS[txn.paymentMode] ?? txn.paymentMode],
          txn.referenceNumber ? ["Reference", txn.referenceNumber] : null,
          txn.bankName ? ["Bank", txn.bankName] : null,
          txn.receivedBy ? ["Received By", txn.receivedBy] : null,
          ["Package Total", booking.finalAmount != null ? fmt(booking.finalAmount) : "—"],
          ["Total Paid", fmt(booking.paidAmount)],
          ["Balance Due", (booking.remainingAmount ?? 0) > 0 ? fmt(booking.remainingAmount!) : "Paid in Full ✓"],
        ].filter((x): x is [string, string] => x !== null).map(([label, value]) => (
          <div key={label} className="flex justify-between items-center py-1.5 border-b border-gray-50 text-sm">
            <span className="text-gray-500">{label}</span>
            <span className="font-semibold text-gray-800">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium">Close</button>
        <button onClick={doPrint} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#0B3D2E] text-white rounded-lg hover:bg-[#0a3327] transition-colors font-medium">
          <Printer size={13} /> Print Receipt
        </button>
      </div>
    </Dialog>
  );
}

// ---------- Generic Dialog ----------
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

function DialogFooter({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors font-medium">Cancel</button>
      <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#0B3D2E] text-white rounded-lg hover:bg-[#0a3327] disabled:opacity-50 transition-colors font-medium">
        {saving && <Loader2 size={13} className="animate-spin" />} {label}
      </button>
    </div>
  );
}

// ---------- Quick Trash Button (main table) ----------
function QuickTrashButton({ booking, onRefreshAnalytics }: { booking: BookingRow; onRefreshAnalytics: () => void }) {
  const [fetchingPayments, setFetchingPayments] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState<PaymentTxn | null>(null);
  const [multiplePayments, setMultiplePayments] = useState(false);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [localToast, setLocalToast] = useState<{ type: "ok"|"err"; msg: string } | null>(null);

  const showLocalToast = (type: "ok"|"err", msg: string) => {
    setLocalToast({ type, msg });
    setTimeout(() => setLocalToast(null), 3500);
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setFetchingPayments(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/${booking.id}/payments?includeDeleted=0`, { credentials: "include" });
      const txns = await r.json() as PaymentTxn[];
      const active = txns.filter((t: PaymentTxn) => !t.isDeleted);
      if (active.length === 0) {
        showLocalToast("err", "No payments to delete for this booking.");
        return;
      }
      if (active.length === 1) {
        setConfirmPayment(active[0]);
      } else {
        setMultiplePayments(true);
      }
    } catch { showLocalToast("err", "Failed to load payments."); }
    finally { setFetchingPayments(false); }
  };

  const doDelete = async () => {
    if (!confirmPayment) return;
    setDeleting(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/${booking.id}/payments/${confirmPayment.id}`, {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const d = await r.json() as { message?: string; code?: string };
      if (!r.ok) throw new Error(d.message ?? "Failed");
      showLocalToast("ok", "✓ Payment moved to trash successfully.");
      setConfirmPayment(null);
      setReason("");
      onRefreshAnalytics();
    } catch (e) { showLocalToast("err", (e as Error).message); }
    finally { setDeleting(false); }
  };

  return (
    <>
      {localToast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${localToast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {localToast.type === "ok" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          {localToast.msg}
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={fetchingPayments}
        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
        title="Delete Payment"
      >
        {fetchingPayments ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>

      {/* Single payment confirmation */}
      {confirmPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg">Delete Payment</h3>
              <button onClick={() => { setConfirmPayment(null); setReason(""); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
              {[
                ["Payment ID", <span className="font-mono text-xs">{confirmPayment.id.slice(0,16)}…</span>],
                ["Booking ID", <span className="font-mono font-bold text-[#0B3D2E]">{booking.bookingNumber}</span>],
                ["Customer", <span className="font-medium">{booking.customerName}</span>],
                ["Amount", <span className="font-mono font-bold text-gray-900">{fmt(confirmPayment.amount)}</span>],
                ["Date", <span>{new Date(confirmPayment.paymentDate).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })}</span>],
                ["Mode", <span>{MODE_LABELS[confirmPayment.paymentMode] ?? confirmPayment.paymentMode}</span>],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between items-center">
                  <span className="text-gray-500">{label}</span>
                  <span>{val}</span>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-amber-800 text-xs font-semibold mb-1.5">⚠️ Are you sure you want to delete this payment?</p>
              <ul className="text-amber-700 text-xs space-y-0.5">
                {["Remove the payment record","Update Paid Amount","Update Remaining Balance","Update Booking Status","Reverse Accounting Journal Entries","Update Cash Book & Bank Book","Update Dashboard totals"].map(item => (
                  <li key={item} className="flex items-center gap-1.5">• {item}</li>
                ))}
              </ul>
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Reason (optional)</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
                rows={2} placeholder="Duplicate entry, data correction…" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setConfirmPayment(null); setReason(""); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">Cancel</button>
              <button onClick={doDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium flex items-center gap-1.5">
                {deleting && <Loader2 size={13} className="animate-spin" />} Delete Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multiple payments — redirect to manage */}
      {multiplePayments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-bold text-gray-900 mb-2">Multiple Payments Found</h3>
            <p className="text-sm text-gray-600 mb-4">This booking has multiple payment records. Please click <strong>Manage</strong> to select and delete a specific payment.</p>
            <div className="flex justify-end">
              <button onClick={() => setMultiplePayments(false)} className="px-4 py-2 text-sm bg-[#0B3D2E] text-white rounded-lg hover:bg-[#0a3327] font-medium">OK, Got It</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- Main Page ----------
export default function PaymentAnalytics() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [remindersEnabled, setRemindersEnabledState] = useState<boolean | null>(null);
  const [reminderActionLoading, setReminderActionLoading] = useState(false);
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null);
  const { can } = usePermissions();
  const canDelete = can("payments", "delete");
  const qc = useQueryClient();

  useEffect(() => {
    fetch(`${API}/api/payments/reminders/status`, { credentials: "include" })
      .then(r => r.json())
      .then((d: { enabled?: boolean }) => setRemindersEnabledState(d.enabled ?? true))
      .catch(() => {});
  }, []);

  const toggleReminders = async () => {
    if (remindersEnabled === null) return;
    setReminderActionLoading(true);
    try {
      const endpoint = remindersEnabled ? "disable" : "enable";
      const res = await fetch(`${API}/api/payments/reminders/${endpoint}`, { method: "POST", credentials: "include" });
      const d = (await res.json()) as { enabled?: boolean };
      setRemindersEnabledState(d.enabled ?? !remindersEnabled);
    } catch { } finally { setReminderActionLoading(false); }
  };

  const runRemindersNow = async () => {
    setReminderActionLoading(true);
    try {
      await fetch(`${API}/api/payments/reminders/run-now`, { method: "POST", credentials: "include" });
    } catch { } finally { setReminderActionLoading(false); }
  };

  const analyticsKey = ["payment-analytics"];
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: analyticsKey,
    queryFn: () =>
      fetch(`${API}/api/payments/analytics`, { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error("Failed to load analytics");
        return r.json();
      }),
    refetchInterval: 60_000,
  });

  const refreshAnalytics = () => qc.invalidateQueries({ queryKey: analyticsKey });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="inline ml-1 text-[#0B3D2E]" />
      : <ChevronDown size={13} className="inline ml-1 text-[#0B3D2E]" />;
  };

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const filtered = (data?.bookings || []).filter(b => {
    const matchSearch =
      !search ||
      b.customerName.toLowerCase().includes(search.toLowerCase()) ||
      b.bookingNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.customerMobile.includes(search) ||
      (b.packageName ?? "").toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === "all") return true;
    if (filter === "overdue") {
      return (b.status === "pending" || b.status === "partially_paid") &&
        new Date(b.createdAt).getTime() < thirtyDaysAgo &&
        (b.remainingAmount ?? 0) > 0;
    }
    return b.status === filter;
  });

  const STRING_SORT_KEYS: SortKey[] = ["bookingNumber", "customerName", "updatedAt"];
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (STRING_SORT_KEYS.includes(sortKey)) {
      cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
    } else {
      const av = Number(a[sortKey] ?? 0), bv = Number(b[sortKey] ?? 0);
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const today = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const todayDate = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "confirmed", label: "Paid" },
    { key: "partially_paid", label: "Partial" },
    { key: "approved", label: "Approved" },
    { key: "pending", label: "Pending" },
    { key: "overdue", label: "Overdue" },
  ];

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0B3D2E]">Payment Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">Click any booking row to manage its payments — {today}</p>
          </div>
          <div className="flex items-center gap-2">
            {remindersEnabled !== null && (
              <>
                <button onClick={runRemindersNow} disabled={reminderActionLoading || !remindersEnabled} title="Send reminders now"
                  className="flex items-center gap-1.5 text-xs border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors font-medium">
                  <Play size={12} /> Run Now
                </button>
                <button onClick={toggleReminders} disabled={reminderActionLoading}
                  className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-2 transition-colors font-medium ${remindersEnabled ? "border-green-300 text-green-700 hover:bg-green-50" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}>
                  {remindersEnabled ? <><Bell size={12} /> Reminders ON</> : <><BellOff size={12} /> Reminders OFF</>}
                </button>
              </>
            )}
            <Link href="/admin/bookings">
              <button className="text-sm text-[#0B3D2E] border border-[#0B3D2E] rounded-lg px-4 py-2 hover:bg-[#0B3D2E] hover:text-white transition-colors font-medium">
                Manage Bookings →
              </button>
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-pulse h-24" />)}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">Failed to load analytics data. Please refresh.</div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4">
              <KpiCard label={`Today's Collection (${todayDate})`} value={fmt(data.todayCollection)} icon={IndianRupee} iconBg="bg-emerald-50" iconColor="text-emerald-600" sub="Manual + online payments today" />
              <KpiCard label="Monthly Revenue" value={fmt(data.monthlyRevenue)} icon={TrendingUp} iconBg="bg-blue-50" iconColor="text-blue-600" sub={today} />
            </div>

            {/* Status Breakdown */}
            {Object.keys(data.paymentStatusBreakdown).length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Booking Status Breakdown</p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(data.paymentStatusBreakdown).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                    const cfg = STATUS_CONFIG[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700" };
                    return (
                      <button key={status} onClick={() => setFilter(status as FilterTab)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${cfg.bg} ${cfg.text} border-transparent hover:border-gray-300`}>
                        {cfg.label}
                        <span className="bg-white bg-opacity-60 rounded-full px-1.5 py-0.5 text-xs font-bold">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bookings Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {TABS.map(t => (
                    <button key={t.key} onClick={() => setFilter(t.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === t.key ? "bg-[#0B3D2E] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search name, booking, mobile…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]" onClick={() => toggleSort("bookingNumber")}>
                        Booking <SortIcon k="bookingNumber" />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]" onClick={() => toggleSort("customerName")}>
                        Customer <SortIcon k="customerName" />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]" onClick={() => toggleSort("finalAmount")}>
                        Total <SortIcon k="finalAmount" />
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]" onClick={() => toggleSort("paidAmount")}>
                        Paid <SortIcon k="paidAmount" />
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]" onClick={() => toggleSort("remainingAmount")}>
                        Remaining <SortIcon k="remainingAmount" />
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Payments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sorted.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No bookings match this filter.</td></tr>
                    ) : (
                      sorted.map(b => {
                        const isOverdue =
                          (b.status === "pending" || b.status === "partially_paid") &&
                          new Date(b.createdAt).getTime() < thirtyDaysAgo &&
                          (b.remainingAmount ?? 0) > 0;
                        const isActive = activeBooking?.id === b.id;

                        return (
                          <tr
                            key={b.id}
                            onClick={() => setActiveBooking(isActive ? null : b)}
                            className={`cursor-pointer transition-colors ${isActive ? "bg-[#0B3D2E]/5 border-l-4 border-l-[#0B3D2E]" : isOverdue ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-gray-50"}`}
                          >
                            <td className="px-4 py-3">
                              <div className="font-mono text-xs font-bold text-[#0B3D2E]">{b.bookingNumber}</div>
                              {b.isOffline && <span className="text-xs text-gray-400">Offline</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{b.customerName}</div>
                              <div className="text-xs text-gray-400">{b.customerMobile}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <StatusBadge status={b.status} />
                                {isOverdue && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Overdue</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">{b.finalAmount != null ? fmt(b.finalAmount) : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-sm text-emerald-700 font-semibold">{fmt(b.paidAmount)}</td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {b.remainingAmount != null && b.remainingAmount > 0 ? (
                                <span className={`font-bold ${isOverdue ? "text-red-600" : "text-amber-600"}`}>{fmt(b.remainingAmount)}</span>
                              ) : b.remainingAmount === 0 ? (
                                <span className="text-emerald-600 font-semibold">Paid ✓</span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {canDelete && <QuickTrashButton booking={b} onRefreshAnalytics={refreshAnalytics} />}
                                <button
                                  onClick={e => { e.stopPropagation(); setActiveBooking(b); }}
                                  className="inline-flex items-center gap-1 text-xs text-[#0B3D2E] font-semibold hover:underline"
                                >
                                  <Eye size={13} /> Manage <ChevronRight size={11} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {sorted.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                  Showing {sorted.length} booking{sorted.length !== 1 ? "s" : ""}{filter !== "all" ? ` (${TABS.find(t => t.key === filter)?.label} filter)` : ""}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Payment Drawer */}
      {activeBooking && (
        <PaymentDrawer
          booking={activeBooking}
          onClose={() => setActiveBooking(null)}
          onRefreshAnalytics={refreshAnalytics}
        />
      )}
    </AdminLayout>
  );
}
