import React, { useState, useEffect, useCallback } from "react";
import {
  UserCheck, RefreshCw, IndianRupee, Package, Building2, LogOut,
  Percent, TrendingUp, Plus, FileText, Upload, X, Check,
  ChevronDown, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700",
  approved: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
  partially_paid: "bg-orange-100 text-orange-700",
};

const DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "pan_card", label: "PAN Card" },
  { value: "passport_photo", label: "Passport Photo" },
  { value: "flight_ticket", label: "Flight Ticket" },
  { value: "visa", label: "Visa" },
  { value: "vaccination_certificate", label: "Vaccination Certificate" },
  { value: "medical_certificate", label: "Medical Certificate" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
];

type Tab = "overview" | "new-booking" | "commissions" | "documents";

export default function AgentPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"ok" | "err">("ok");

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToastMsg(msg); setToastType(type);
    setTimeout(() => setToastMsg(""), 4000);
  };

  // ── Overview ─────────────────────────────────────────────────────────────
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/api/portal/agent`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.message || "Failed to load"); setLoading(false); return; }
      setData(await r.json());
    } catch { setError("Network error"); }
    setLoading(false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const agent = data?.agent || {};
  const statusMap: Record<string, number> = data?.statusMap || {};
  const overviewTotal = Object.values(statusMap).reduce((a: number, b: any) => a + Number(b), 0);

  // ── New Booking ───────────────────────────────────────────────────────────
  const [packages, setPackages] = useState<any[]>([]);
  const [pkgsLoading, setPkgsLoading] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    customer_name: "", customer_mobile: "", customer_email: "",
    package_id: "", number_of_pilgrims: "1", preferred_departure_date: "", notes: "", room_type: "",
  });
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{ bookingNumber: string } | null>(null);

  const loadPackages = useCallback(async () => {
    setPkgsLoading(true);
    try {
      const r = await fetch(`${API}/api/portal/agent/packages`, { credentials: "include" });
      if (r.ok) { const b = await r.json(); setPackages(b.packages || []); }
    } catch {}
    setPkgsLoading(false);
  }, []);

  useEffect(() => { if (tab === "new-booking") loadPackages(); }, [tab, loadPackages]);

  const setBF = (k: keyof typeof bookingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setBookingForm(f => ({ ...f, [k]: e.target.value }));

  const submitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingSaving(true);
    try {
      const r = await fetch(`${API}/api/portal/agent/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...bookingForm,
          number_of_pilgrims: Number(bookingForm.number_of_pilgrims) || 1,
        }),
      });
      const body = await r.json();
      if (!r.ok) { showToast(body.error || body.message || "Failed to create booking", "err"); setBookingSaving(false); return; }
      setBookingSuccess({ bookingNumber: body.bookingNumber });
      setBookingForm({ customer_name: "", customer_mobile: "", customer_email: "", package_id: "", number_of_pilgrims: "1", preferred_departure_date: "", notes: "", room_type: "" });
      loadOverview();
    } catch { showToast("Network error", "err"); }
    setBookingSaving(false);
  };

  // ── Commissions ───────────────────────────────────────────────────────────
  const [commData, setCommData] = useState<any>(null);
  const [commLoading, setCommLoading] = useState(false);
  const [commError, setCommError] = useState("");

  const loadCommissions = useCallback(async () => {
    setCommLoading(true); setCommError("");
    try {
      const r = await fetch(`${API}/api/portal/agent/commissions`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setCommError(b.message || "Failed"); setCommLoading(false); return; }
      setCommData(await r.json());
    } catch { setCommError("Network error"); }
    setCommLoading(false);
  }, []);

  useEffect(() => { if (tab === "commissions") loadCommissions(); }, [tab, loadCommissions]);

  // ── Documents ─────────────────────────────────────────────────────────────
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [docsList, setDocsList] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState("other");
  const [uploading, setUploading] = useState(false);

  const loadMyBookings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/portal/agent`, { credentials: "include" });
      if (r.ok) { const b = await r.json(); setMyBookings(b.recentBookings || []); }
    } catch {}
  }, []);

  useEffect(() => { if (tab === "documents") loadMyBookings(); }, [tab, loadMyBookings]);

  const loadDocs = useCallback(async (bookingId: string) => {
    if (!bookingId) return;
    setDocsLoading(true);
    try {
      const r = await fetch(`${API}/api/portal/agent/documents/${bookingId}`, { credentials: "include" });
      if (r.ok) { const b = await r.json(); setDocsList(b.documents || []); }
    } catch {}
    setDocsLoading(false);
  }, []);

  useEffect(() => { if (selectedBookingId) loadDocs(selectedBookingId); }, [selectedBookingId, loadDocs]);

  const uploadDocument = async () => {
    if (!uploadFile || !selectedBookingId) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("document_type", uploadDocType);
    try {
      const r = await fetch(`${API}/api/portal/agent/documents/${selectedBookingId}`, {
        method: "POST", credentials: "include", body: fd,
      });
      const body = await r.json();
      if (!r.ok) { showToast(body.error || body.message || "Upload failed", "err"); setUploading(false); return; }
      showToast("Document uploaded successfully");
      setUploadFile(null);
      await loadDocs(selectedBookingId);
    } catch { showToast("Upload failed", "err"); }
    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm flex items-center gap-2 text-white ${toastType === "ok" ? "bg-blue-600" : "bg-red-500"}`}>
          {toastType === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {toastMsg}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <UserCheck size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-none">Al Burhan Tours & Travels</p>
              <p className="text-xs text-muted-foreground mt-0.5">Agent Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.mobile}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => logout()}>
              <LogOut size={13} /> Logout
            </Button>
          </div>
        </div>
        {/* Tab Bar */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto pb-0">
          {([
            { key: "overview", label: "Overview", icon: <TrendingUp size={13} /> },
            { key: "new-booking", label: "New Booking", icon: <Plus size={13} /> },
            { key: "commissions", label: "Commissions", icon: <Percent size={13} /> },
            { key: "documents", label: "Documents", icon: <FileText size={13} /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── OVERVIEW TAB ────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">{agent.name || "Your Dashboard"}</h1>
                {agent.branch_name && <p className="text-sm text-muted-foreground">{agent.branch_name}{agent.branch_city ? `, ${agent.branch_city}` : ""}</p>}
              </div>
              <Button onClick={loadOverview} disabled={loading} variant="outline" size="sm" className="gap-1.5">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
            </div>

            {loading ? (
              <div className="py-20 text-center text-muted-foreground">Loading your data…</div>
            ) : error ? (
              <div className="py-16 text-center">
                <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
                <p className="text-red-500 font-medium">{error}</p>
                <Button onClick={loadOverview} variant="outline" size="sm" className="mt-4 gap-1.5"><RefreshCw size={13} /> Retry</Button>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: <Package size={18} className="text-blue-600 mx-auto mb-1" />, val: overviewTotal, label: "Total Bookings", color: "text-blue-600" },
                    { icon: <TrendingUp size={18} className="text-emerald-600 mx-auto mb-1" />, val: statusMap.confirmed || 0, label: "Confirmed", color: "text-emerald-600" },
                    { icon: <IndianRupee size={18} className="text-violet-600 mx-auto mb-1" />, val: fmt(data.totalRevenue || 0), label: "Revenue Generated", color: "text-violet-600" },
                    { icon: <Percent size={18} className="text-amber-600 mx-auto mb-1" />, val: fmt(data.commissionEarned || 0), label: "Commission Est.", color: "text-amber-600" },
                  ].map((c, i) => (
                    <div key={i} className="rounded-2xl border p-4 bg-white text-center">
                      {c.icon}
                      <p className={`text-xl font-bold font-mono ${c.color}`}>{c.val}</p>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                    </div>
                  ))}
                </div>

                {/* Agent info */}
                <div className="rounded-2xl border bg-white p-5">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">My Details</p>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div><p className="text-xs text-muted-foreground">Name</p><p className="font-semibold">{agent.name || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Mobile</p><p className="font-semibold">{agent.mobile || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Commission Rate</p><p className="font-semibold">{agent.commission_rate || 0}%</p></div>
                    {agent.branch_name && (
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Branch</p>
                          <p className="font-semibold">{agent.branch_name}</p>
                          {agent.branch_city && <p className="text-xs text-muted-foreground">{agent.branch_city}</p>}
                        </div>
                      </div>
                    )}
                    {agent.email && <div><p className="text-xs text-muted-foreground">Email</p><p className="font-semibold text-sm">{agent.email}</p></div>}
                  </div>
                </div>

                {/* Status breakdown */}
                <div className="rounded-2xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm">Booking Status Breakdown</div>
                  {Object.keys(statusMap).length === 0 ? (
                    <p className="px-4 py-8 text-center text-muted-foreground text-sm">No bookings through you yet. Use the "New Booking" tab to get started.</p>
                  ) : (
                    Object.entries(statusMap).map(([status, cnt]) => (
                      <div key={status} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
                        <Badge className={`capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"}`}>{status}</Badge>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${overviewTotal > 0 ? Math.round((Number(cnt) / overviewTotal) * 100) : 0}%` }} />
                        </div>
                        <span className="font-bold font-mono text-sm w-8 text-right">{cnt}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Recent bookings */}
                {data.recentBookings?.length > 0 && (
                  <div className="rounded-2xl border bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm">My Bookings</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/10">
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Booking #</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Customer</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Package</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recentBookings.map((b: any) => (
                            <tr key={b.id} className="border-b last:border-0 hover:bg-muted/10">
                              <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                              <td className="px-4 py-2.5"><p className="font-medium">{b.customer_name || "—"}</p><p className="text-xs text-muted-foreground">{b.customer_mobile}</p></td>
                              <td className="px-4 py-2.5 text-muted-foreground">{b.package_name || "—"}</td>
                              <td className="px-4 py-2.5"><Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge></td>
                              <td className="px-4 py-2.5 text-right font-mono">{fmt(Number(b.total_amount || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── NEW BOOKING TAB ──────────────────────────────────────────────── */}
        {tab === "new-booking" && (
          <>
            <div>
              <h1 className="text-xl font-bold">Create New Booking</h1>
              <p className="text-sm text-muted-foreground">Register a customer booking on their behalf</p>
            </div>

            {bookingSuccess && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <Check size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-emerald-700">Booking Created!</p>
                  <p className="text-sm text-emerald-600 mt-0.5">Booking Number: <span className="font-mono font-bold">{bookingSuccess.bookingNumber}</span></p>
                  <p className="text-xs text-emerald-600 mt-1">The booking has been submitted and is pending admin approval.</p>
                </div>
                <button onClick={() => setBookingSuccess(null)} className="text-emerald-500 hover:text-emerald-700"><X size={16} /></button>
              </div>
            )}

            <form onSubmit={submitBooking} className="space-y-4">
              {/* Customer details */}
              <div className="rounded-2xl border bg-white p-5 space-y-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer Details</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
                    <input value={bookingForm.customer_name} onChange={setBF("customer_name")} required
                      placeholder="Customer full name"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Mobile Number *</label>
                    <input value={bookingForm.customer_mobile} onChange={setBF("customer_mobile")} required
                      placeholder="10-digit mobile" maxLength={10} inputMode="numeric"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Email (optional)</label>
                    <input value={bookingForm.customer_email} onChange={setBF("customer_email")} type="email"
                      placeholder="customer@example.com"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Package & trip details */}
              <div className="rounded-2xl border bg-white p-5 space-y-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Package & Trip Details</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Package</label>
                    <div className="relative mt-1">
                      <select value={bookingForm.package_id} onChange={setBF("package_id")}
                        className="w-full border rounded-lg px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                        <option value="">— Select a package (optional) —</option>
                        {pkgsLoading ? <option disabled>Loading packages…</option> : null}
                        {packages.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.price_per_person > 0 ? `— ₹${Number(p.price_per_person).toLocaleString("en-IN")}/person` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Number of Pilgrims *</label>
                    <input value={bookingForm.number_of_pilgrims} onChange={setBF("number_of_pilgrims")}
                      type="number" min="1" max="50" required
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Preferred Departure Date</label>
                    <input value={bookingForm.preferred_departure_date} onChange={setBF("preferred_departure_date")}
                      type="date"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Room Type</label>
                    <div className="relative mt-1">
                      <select value={bookingForm.room_type} onChange={setBF("room_type")}
                        className="w-full border rounded-lg px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                        <option value="">— Select room type —</option>
                        <option value="quad">Quad Sharing</option>
                        <option value="triple">Triple Sharing</option>
                        <option value="double">Double Sharing</option>
                        <option value="single">Single Room</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Notes / Special Requests</label>
                    <textarea value={bookingForm.notes} onChange={setBF("notes")} rows={2}
                      placeholder="Any special requirements or notes"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={bookingSaving} className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 h-11 text-base">
                {bookingSaving ? <><RefreshCw size={15} className="animate-spin" /> Creating…</> : <><Plus size={15} /> Create Booking</>}
              </Button>
            </form>
          </>
        )}

        {/* ── COMMISSIONS TAB ───────────────────────────────────────────────── */}
        {tab === "commissions" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">My Commissions</h1>
                <p className="text-sm text-muted-foreground">Commission @ {commData?.commissionRate || 0}% on collected payments</p>
              </div>
              <Button onClick={loadCommissions} disabled={commLoading} variant="outline" size="sm" className="gap-1.5">
                <RefreshCw size={13} className={commLoading ? "animate-spin" : ""} /> Refresh
              </Button>
            </div>

            {commLoading ? (
              <div className="py-20 text-center text-muted-foreground">Loading commissions…</div>
            ) : commError ? (
              <div className="py-16 text-center text-red-500">{commError}</div>
            ) : (
              <>
                {/* Summary card */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border p-4 bg-white text-center">
                    <Percent size={18} className="text-amber-600 mx-auto mb-1" />
                    <p className="text-xl font-bold font-mono text-amber-600">{commData?.commissionRate || 0}%</p>
                    <p className="text-xs text-muted-foreground">Commission Rate</p>
                  </div>
                  <div className="rounded-2xl border p-4 bg-white text-center">
                    <IndianRupee size={18} className="text-emerald-600 mx-auto mb-1" />
                    <p className="text-xl font-bold font-mono text-emerald-600">{fmt(commData?.totalCommission || 0)}</p>
                    <p className="text-xs text-muted-foreground">Total Earned</p>
                  </div>
                  <div className="rounded-2xl border p-4 bg-white text-center sm:block hidden">
                    <Package size={18} className="text-blue-600 mx-auto mb-1" />
                    <p className="text-xl font-bold font-mono text-blue-600">{commData?.bookings?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Bookings</p>
                  </div>
                </div>

                {/* Per-booking breakdown */}
                <div className="rounded-2xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm">Per-Booking Commission Breakdown</div>
                  {!commData?.bookings?.length ? (
                    <p className="px-4 py-8 text-center text-muted-foreground text-sm">No bookings yet. Create a booking to start earning commissions.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/10">
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Booking #</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Customer</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground">Paid</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground">Commission</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commData.bookings.map((b: any) => (
                            <tr key={b.id} className="border-b last:border-0 hover:bg-muted/10">
                              <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                              <td className="px-4 py-2.5">
                                <p className="font-medium">{b.customer_name || "—"}</p>
                                <p className="text-xs text-muted-foreground">{b.customer_mobile}</p>
                              </td>
                              <td className="px-4 py-2.5">
                                <Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono">{fmt(Number(b.paid_amount || 0))}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-amber-600 font-bold">
                                {Number(b.commission_amount) > 0 ? fmt(Number(b.commission_amount)) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 bg-amber-50">
                            <td colSpan={4} className="px-4 py-3 font-bold text-sm text-right">Total Commission Earned:</td>
                            <td className="px-4 py-3 text-right font-bold font-mono text-amber-700">{fmt(commData.totalCommission || 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ── DOCUMENTS TAB ─────────────────────────────────────────────────── */}
        {tab === "documents" && (
          <>
            <div>
              <h1 className="text-xl font-bold">Documents</h1>
              <p className="text-sm text-muted-foreground">Upload and view documents for your customers' bookings</p>
            </div>

            {/* Select booking */}
            <div className="rounded-2xl border bg-white p-5 space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Booking</p>
              <div className="relative">
                <select
                  value={selectedBookingId}
                  onChange={e => { setSelectedBookingId(e.target.value); setDocsList([]); }}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                >
                  <option value="">— Choose a booking —</option>
                  {myBookings.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.booking_number} — {b.customer_name || b.customer_mobile} ({b.status})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              {myBookings.length === 0 && (
                <p className="text-xs text-muted-foreground">No bookings found. Create a booking first from the "New Booking" tab.</p>
              )}
            </div>

            {selectedBookingId && (
              <>
                {/* Upload section */}
                <div className="rounded-2xl border bg-white p-5 space-y-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Upload Document</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Document Type</label>
                      <div className="relative mt-1">
                        <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                          {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Choose File</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={e => setUploadFile(e.target.files?.[0] || null)}
                        className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 focus:outline-none"
                      />
                    </div>
                  </div>
                  {uploadFile && (
                    <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-blue-700">{uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB)</span>
                      <button onClick={() => setUploadFile(null)} className="text-blue-400 hover:text-blue-600"><X size={14} /></button>
                    </div>
                  )}
                  <Button
                    onClick={uploadDocument}
                    disabled={!uploadFile || uploading}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  >
                    {uploading ? <><RefreshCw size={14} className="animate-spin" /> Uploading…</> : <><Upload size={14} /> Upload Document</>}
                  </Button>
                </div>

                {/* Documents list */}
                <div className="rounded-2xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm flex items-center justify-between">
                    <span>Uploaded Documents</span>
                    <button onClick={() => loadDocs(selectedBookingId)} className="text-muted-foreground hover:text-foreground">
                      <RefreshCw size={13} className={docsLoading ? "animate-spin" : ""} />
                    </button>
                  </div>
                  {docsLoading ? (
                    <p className="px-4 py-8 text-center text-muted-foreground text-sm">Loading documents…</p>
                  ) : docsList.length === 0 ? (
                    <p className="px-4 py-8 text-center text-muted-foreground text-sm">No documents uploaded for this booking yet.</p>
                  ) : (
                    <div className="divide-y">
                      {docsList.map((d: any) => (
                        <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/10">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <FileText size={15} className="text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{d.file_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{d.document_type?.replace(/_/g, " ")} · {new Date(d.created_at).toLocaleDateString("en-IN")}</p>
                          </div>
                          {d.file_url && (
                            <a href={`${API}${d.file_url}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline flex-shrink-0">View</a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

      </main>
    </div>
  );
}
