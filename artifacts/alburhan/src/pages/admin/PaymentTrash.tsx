import { useState, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Trash2, RotateCcw, AlertTriangle, Search, Filter,
  Download, CheckCircle, AlertCircle, Loader2, X,
  ChevronLeft, ChevronRight, Calendar, CreditCard,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const fmt = (n: number) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const MODE_LABELS: Record<string, string> = {
  cash: "Cash", neft: "NEFT", upi: "UPI", cheque: "Cheque", online: "Online",
};

type TrashEntry = {
  id: string; bookingId: string; bookingNumber: string;
  customerName: string; customerMobile: string;
  amount: number; paymentDate: string; paymentMode: string;
  referenceNumber: string | null; bankName: string | null; notes: string | null;
  deletedAt: string; deletedByName: string | null; deletionReason: string | null;
  createdAt: string;
};

type TrashResponse = { entries: TrashEntry[]; total: number; page: number; limit: number };

export default function PaymentTrash() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canDelete = can("payments", "delete");

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [permanentEntry, setPermanentEntry] = useState<TrashEntry | null>(null);
  const [permDeleting, setPermDeleting] = useState(false);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const queryKey = ["payment-trash", search, mode, from, to, page];
  const { data, isLoading, error } = useQuery<TrashResponse>({
    queryKey,
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) p.set("search", search);
      if (mode)   p.set("mode", mode);
      if (from)   p.set("from", from);
      if (to)     p.set("to", to);
      return fetch(`${API}/api/admin/bookings/payment-trash?${p}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["payment-trash"] }), [qc]);

  const doRestore = async (entry: TrashEntry) => {
    setRestoring(entry.id);
    try {
      const r = await fetch(`${API}/api/admin/bookings/payment-trash/${entry.id}/restore`, {
        method: "POST", credentials: "include",
      });
      const d = await r.json() as { message?: string };
      if (!r.ok) throw new Error(d.message ?? "Failed");
      showToast("ok", "✓ Payment restored successfully.");
      refresh();
    } catch (e) { showToast("err", (e as Error).message); }
    finally { setRestoring(null); }
  };

  const doPermanentDelete = async () => {
    if (!permanentEntry) return;
    setPermDeleting(true);
    try {
      const r = await fetch(`${API}/api/admin/bookings/payment-trash/${permanentEntry.id}/permanent`, {
        method: "DELETE", credentials: "include",
      });
      const d = await r.json() as { message?: string };
      if (!r.ok) throw new Error(d.message ?? "Failed");
      showToast("ok", "✓ Payment permanently deleted.");
      setPermanentEntry(null);
      refresh();
    } catch (e) { showToast("err", (e as Error).message); setPermanentEntry(null); }
    finally { setPermDeleting(false); }
  };

  const exportCSV = () => {
    const rows = data?.entries ?? [];
    if (!rows.length) return;
    const headers = ["Payment ID", "Booking ID", "Customer Name", "Mobile", "Amount", "Date", "Mode", "Deleted By", "Deleted At", "Reason"];
    const lines = [headers.join(","), ...rows.map(r => [
      r.id, r.bookingNumber, `"${r.customerName}"`, r.customerMobile,
      r.amount, r.paymentDate, r.paymentMode,
      `"${r.deletedByName ?? ""}"`, r.deletedAt ? new Date(r.deletedAt).toISOString() : "",
      `"${r.deletionReason ?? ""}"`,
    ].join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "payment_trash.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => window.print();

  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);
  const entries = data?.entries ?? [];

  return (
    <AdminLayout>
      <style>{`@media print { .no-print { display: none !important; } body { font-size: 12px; } }`}</style>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <Trash2 size={20} className="text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payment Trash</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Soft-deleted payments · {data?.total ?? 0} record{(data?.total ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors font-medium">
              <Download size={14} /> Export CSV
            </button>
            <button onClick={exportPDF} className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors font-medium">
              <Download size={14} /> Print / PDF
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium no-print ${toast.type === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
            {toast.type === "ok" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {toast.msg}
            <button onClick={() => setToast(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 no-print">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Payment ID, booking, customer…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 focus:border-[#0B3D2E]"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Mode</label>
              <select value={mode} onChange={e => { setMode(e.target.value); setPage(1); }}
                className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20">
                <option value="">All Modes</option>
                {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Calendar size={11} />From</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
                className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Calendar size={11} />To</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
                className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20" />
            </div>
            {(search || mode || from || to) && (
              <button onClick={() => { setSearch(""); setMode(""); setFrom(""); setTo(""); setPage(1); }}
                className="flex items-center gap-1.5 text-sm text-red-600 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors font-medium">
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-48 text-red-500 text-sm">
              <AlertCircle size={16} className="mr-2" /> Failed to load payment trash
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Trash2 size={36} className="mb-3 text-gray-300" />
              <p className="text-sm font-medium">No deleted payments found</p>
              <p className="text-xs mt-1">Deleted payments will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {["Payment ID","Booking","Customer","Amount","Date","Mode","Deleted By","Deleted At","Reason","Actions"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map(e => (
                    <tr key={e.id} className="hover:bg-red-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-500">{e.id.slice(0,8)}…</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-[#0B3D2E]">{e.bookingNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm text-gray-900">{e.customerName}</div>
                        <div className="text-xs text-gray-400">{e.customerMobile}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-red-600">{fmt(e.amount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDate(e.paymentDate)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 font-medium">
                          <CreditCard size={10} /> {MODE_LABELS[e.paymentMode] ?? e.paymentMode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{e.deletedByName ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(e.deletedAt)}</td>
                      <td className="px-4 py-3 max-w-40">
                        {e.deletionReason ? (
                          <span className="text-xs text-gray-600 italic truncate block">{e.deletionReason}</span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 no-print">
                        {canDelete && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => doRestore(e)}
                              disabled={restoring === e.id}
                              className="flex items-center gap-1 text-xs bg-emerald-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium"
                            >
                              {restoring === e.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                              Restore
                            </button>
                            <button
                              onClick={() => setPermanentEntry(e)}
                              className="flex items-center gap-1 text-xs border border-red-200 text-red-600 rounded-lg px-2.5 py-1.5 hover:bg-red-50 transition-colors font-medium"
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between no-print">
              <p className="text-xs text-gray-500">Page {page} of {totalPages} · {data?.total} records</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Permanent Delete Confirmation */}
        {permanentEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm no-print">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Permanently Delete Payment</h3>
                  <p className="text-xs text-gray-500">This cannot be undone</p>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Payment ID</span><span className="font-mono text-xs text-gray-700">{permanentEntry.id.slice(0,16)}…</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Booking</span><span className="font-mono font-bold text-[#0B3D2E]">{permanentEntry.bookingNumber}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium text-gray-800">{permanentEntry.customerName}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-mono font-bold text-red-600">{fmt(permanentEntry.amount)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Mode</span><span>{MODE_LABELS[permanentEntry.paymentMode]}</span></div>
              </div>

              <p className="text-sm text-red-700 font-semibold mb-4">
                ⚠️ This will permanently remove the payment from the database. All audit logs for this payment will also be deleted.
              </p>

              <div className="flex gap-2 justify-end">
                <button onClick={() => setPermanentEntry(null)} disabled={permDeleting}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium">
                  Cancel
                </button>
                <button onClick={doPermanentDelete} disabled={permDeleting}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium flex items-center gap-1.5">
                  {permDeleting && <Loader2 size={13} className="animate-spin" />}
                  Permanently Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
