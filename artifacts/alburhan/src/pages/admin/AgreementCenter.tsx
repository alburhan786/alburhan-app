import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

interface Agreement {
  id: string;
  agreement_number: string;
  booking_id: string;
  booking_number: string;
  customer_name: string;
  customer_mobile: string;
  customer_email?: string;
  package_name: string;
  status: string;
  signed_at: string | null;
  otp_verified: boolean;
  pdf_generated: boolean;
  created_at: string;
  final_amount: string;
  paid_amount: string;
  signature_data?: string;
  verification_token?: string;
  verification_url?: string;
  cancelled_reason?: string;
  signed_ip?: string;
  signed_user_agent?: string;
  hotel_info?: Record<string, string>;
  flight_info?: Record<string, string>;
  // KYC
  passport_number?: string;
  date_of_birth?: string;
  blood_group?: string;
  gender?: string;
  aadhaar?: string;
  pan?: string;
  emergency_contact_name?: string;
  emergency_contact_mobile?: string;
}

interface AuditLog {
  id: string;
  action: string;
  details: any;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

interface DetailsForm {
  makkahHotel: string;
  madinahHotel: string;
  checkIn: string;
  checkOut: string;
  roomSharing: string;
  distance: string;
  airline: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  transit: string;
  baggage: string;
}

const EMPTY_FORM: DetailsForm = {
  makkahHotel: "", madinahHotel: "", checkIn: "", checkOut: "",
  roomSharing: "", distance: "",
  airline: "", flightNumber: "", departure: "", arrival: "", transit: "", baggage: "",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:             { bg: "#e8e8e8", text: "#555555" },
  pending_signature: { bg: "#FFF3CD", text: "#856404" },
  signed:            { bg: "#D4EDDA", text: "#155724" },
  cancelled:         { bg: "#F8D7DA", text: "#721C24" },
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", pending_signature: "Pending", signed: "Signed", cancelled: "Cancelled",
};
const STATUS_ICONS: Record<string, string> = {
  draft: "📄", pending_signature: "⏳", signed: "✅", cancelled: "❌",
};

const G    = "#0B3D2E";
const GOLD = "#C9A23F";

export default function AgreementCenter() {
  const { toast } = useToast();

  const [agreements,    setAgreements]    = useState<Agreement[]>([]);
  const [total,         setTotal]         = useState(0);
  const [pages,         setPages]         = useState(1);
  const [page,          setPage]          = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("");
  const [selected,      setSelected]      = useState<Agreement | null>(null);
  const [auditLogs,     setAuditLogs]     = useState<AuditLog[]>([]);
  const [auditLoading,  setAuditLoading]  = useState(false);
  const [cancelModal,   setCancelModal]   = useState<{ id: string } | null>(null);
  const [cancelReason,  setCancelReason]  = useState("");
  const [reviseModal,   setReviseModal]   = useState<{ id: string } | null>(null);
  const [reviseReason,  setReviseReason]  = useState("");
  const [revisingId,    setRevisingId]    = useState<string | null>(null);
  const [reviseCorrections, setReviseCorrections] = useState<{
    hotel_info: Record<string,string>;
    flight_info: Record<string,string>;
    tcs_amount: string;
    gst_amount: string;
    discount_amount: string;
  }>({ hotel_info: {}, flight_info: {}, tcs_amount: "", gst_amount: "", discount_amount: "" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusUpdating,setStatusUpdating]= useState(false);
  const [backfilling,   setBackfilling]   = useState(false);
  const [backfillResult,setBackfillResult]= useState<{ found: number; created: number } | null>(null);
  const [kycAlert,      setKycAlert]      = useState<{ message: string; missingFields: string[]; bookingId?: string } | null>(null);

  // Hotel / Flight edit modal
  const [detailsModal, setDetailsModal] = useState<{ id: string } | null>(null);
  const [detailsForm,  setDetailsForm]  = useState<DetailsForm>(EMPTY_FORM);
  const [savingDetails,setSavingDetails]= useState(false);

  const loadAgreements = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const r = await fetch(`${API}/api/agreements?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setAgreements(d.agreements || []);
      setTotal(d.total || 0);
      setPages(d.pages || 1);
    } catch {
      toast({ title: "Error", description: "Failed to load agreements", variant: "destructive" });
    } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { loadAgreements(1); }, []);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); loadAgreements(1); };

  const loadDetail = async (ag: Agreement) => {
    setSelected(ag);
    setAuditLogs([]);
    setAuditLoading(true);
    try {
      const [detailRes, auditRes] = await Promise.all([
        fetch(`${API}/api/agreements/${ag.id}`, { credentials: "include" }),
        fetch(`${API}/api/agreements/${ag.id}/audit`, { credentials: "include" }),
      ]);
      if (detailRes.ok) { const d = await detailRes.json(); setSelected(d); }
      if (auditRes.ok)  { const d = await auditRes.json(); setAuditLogs(d.logs || []); }
    } catch {}
    finally { setAuditLoading(false); }
  };

  const doAction = async (action: string, id: string, extra?: any, bookingId?: string) => {
    setActionLoading(action + id);
    setKycAlert(null);
    try {
      const urlMap: Record<string, string> = {
        cancel:          `${API}/api/agreements/${id}/cancel`,
        regenerate:      `${API}/api/agreements/${id}/regenerate`,
        resend_email:    `${API}/api/agreements/${id}/resend-email`,
        resend_whatsapp: `${API}/api/agreements/${id}/resend-whatsapp`,
      };
      const r = await fetch(urlMap[action], {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extra || {}),
      });
      const d = await r.json();
      // 422: KYC validation failure — show inline alert instead of generic toast
      if (r.status === 422 && d.missingFields) {
        setKycAlert({ message: d.error, missingFields: d.missingFields, bookingId });
        return;
      }
      if (d.ok) {
        toast({ title: "Success", description: "Action completed successfully" });
        loadAgreements(page);
        if (selected?.id === id) loadDetail(selected);
        setCancelModal(null);
        setCancelReason("");
      } else {
        toast({ title: "Error", description: d.error || "Action failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    setStatusUpdating(true);
    try {
      const r = await fetch(`${API}/api/agreements/${id}/status`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: "Status Updated", description: `Set to ${STATUS_LABELS[newStatus] || newStatus}` });
        loadAgreements(page);
        if (selected?.id === id && d.agreement) setSelected(d.agreement);
      } else {
        toast({ title: "Error", description: d.error || "Update failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally { setStatusUpdating(false); }
  };

  const openDetailsModal = (ag: Agreement) => {
    const hi = ag.hotel_info  || {};
    const fi = ag.flight_info || {};
    setDetailsForm({
      makkahHotel:  hi.makkahHotel  || "",
      madinahHotel: hi.madinahHotel || "",
      checkIn:      hi.checkIn      || "",
      checkOut:     hi.checkOut     || "",
      roomSharing:  hi.roomSharing  || "",
      distance:     hi.distance     || "",
      airline:      fi.airline      || "",
      flightNumber: fi.flightNumber || "",
      departure:    fi.departure    || "",
      arrival:      fi.arrival      || "",
      transit:      fi.transit      || "",
      baggage:      fi.baggage      || "",
    });
    setDetailsModal({ id: ag.id });
  };

  const saveDetails = async () => {
    if (!detailsModal) return;
    setSavingDetails(true);
    try {
      const r = await fetch(`${API}/api/agreements/${detailsModal.id}/details`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailsForm),
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: "Saved", description: "Hotel & flight details updated on agreement" });
        setDetailsModal(null);
        if (selected?.id === detailsModal.id) loadDetail(selected);
      } else {
        toast({ title: "Error", description: d.error || "Save failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally { setSavingDetails(false); }
  };

  const backfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const r = await fetch(`${API}/api/agreements/backfill-approved`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (d.ok) {
        setBackfillResult({ found: d.found, created: d.created });
        toast({ title: `Created ${d.created}/${d.found}`, description: d.created > 0 ? "Agreements generated" : "All already have agreements" });
        loadAgreements(1);
      } else {
        toast({ title: "Backfill failed", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Backfill failed", variant: "destructive" });
    } finally { setBackfilling(false); }
  };

  const downloadPdf = async (id: string, number: string, bookingId?: string) => {
    setActionLoading("pdf" + id);
    setKycAlert(null);
    try {
      const r = await fetch(`${API}/api/agreements/${id}/pdf`, { credentials: "include" });
      if (r.status === 422) {
        const d = await r.json();
        if (d.missingFields) {
          setKycAlert({ message: d.error, missingFields: d.missingFields, bookingId });
          return;
        }
        throw new Error(d.error || "PDF blocked — missing data");
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Agreement-${number}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "PDF Error", description: err?.message || "Failed to generate PDF", variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  const isLoading = (key: string) => actionLoading === key;
  const signed    = agreements.filter(a => a.status === "signed").length;
  const pending   = agreements.filter(a => a.status === "pending_signature" || a.status === "draft").length;
  const cancelled = agreements.filter(a => a.status === "cancelled").length;

  return (
    <AdminLayout>
      <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── KYC Validation Alert ── */}
        {kycAlert && (
          <div style={{ background: "#FFF3CD", border: "2px solid #FFC107", borderRadius: 8, padding: "14px 18px", marginBottom: 18, position: "relative" }}>
            <button onClick={() => setKycAlert(null)} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", color: "#856404", fontSize: 20, lineHeight: 1 }}>×</button>
            <div style={{ fontWeight: 700, color: "#856404", fontSize: 14, marginBottom: 6 }}>
              ⚠️ Agreement blocked — customer profile is incomplete
            </div>
            <div style={{ color: "#856404", fontSize: 13, marginBottom: 8 }}>{kycAlert.message}</div>
            <div style={{ fontWeight: 600, color: "#6d4c00", fontSize: 12, marginBottom: 4 }}>Required fields missing:</div>
            <ul style={{ margin: "0 0 12px", paddingLeft: 20, color: "#856404", fontSize: 13 }}>
              {kycAlert.missingFields.map(f => <li key={f}>{f}</li>)}
            </ul>
            <div style={{ display: "flex", gap: 8 }}>
              <a href={kycAlert.bookingId ? `/admin/customers?booking=${kycAlert.bookingId}` : "/admin/customers"}
                style={{ display: "inline-block", background: "#856404", color: "white", padding: "6px 14px", borderRadius: 6, textDecoration: "none", fontSize: 12, fontWeight: 600 }}>
                ✏️ Edit Customer Profile
              </a>
              <button onClick={() => setKycAlert(null)} style={{ background: "none", border: "1px solid #856404", color: "#856404", padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: "bold", color: G, margin: 0 }}>⚖️ Agreement Center</h1>
            <p style={{ color: "#666", fontSize: 13, margin: "4px 0 0" }}>
              Premium Digital Hajj Agreements — {total} total
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {backfillResult && (
              <span style={{ fontSize: 12, color: "#155724", background: "#d4edda", padding: "4px 10px", borderRadius: 20 }}>
                ✓ Created {backfillResult.created}/{backfillResult.found}
              </span>
            )}
            <button onClick={backfill} disabled={backfilling}
              style={{ background: GOLD, color: "#1a0a00", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: backfilling ? "not-allowed" : "pointer", fontWeight: 600, opacity: backfilling ? 0.7 : 1 }}>
              {backfilling ? "⏳ Generating…" : "⚡ Generate Missing Agreements"}
            </button>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total",     value: total,    bg: "#e8f4f0", text: G },
            { label: "Signed",    value: signed,   bg: "#D4EDDA", text: "#155724" },
            { label: "Pending",   value: pending,  bg: "#FFF3CD", text: "#856404" },
            { label: "Cancelled", value: cancelled,bg: "#F8D7DA", text: "#721C24" },
          ].map(c => (
            <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.text}30`, borderRadius: 8, padding: "14px 18px" }}>
              <div style={{ color: c.text, fontSize: 24, fontWeight: "bold" }}>{c.value}</div>
              <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* ── Search & filters ── */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <input
            placeholder="Search Agreement ID, Booking, Customer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240, border: "1px solid #ddd", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: "8px 12px", fontSize: 13, minWidth: 150 }}>
            <option value="">All Status</option>
            <option value="pending_signature">Pending</option>
            <option value="signed">Signed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="submit" style={{ background: G, color: "white", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: "pointer" }}>
            🔍 Search
          </button>
          {(search || statusFilter) && (
            <button type="button" onClick={() => { setSearch(""); setStatusFilter(""); setTimeout(() => loadAgreements(1), 0); }}
              style={{ background: "#f5f5f5", color: "#555", border: "1px solid #ddd", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
              Clear
            </button>
          )}
        </form>

        {/* ── Main layout ── */}
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>

          {/* Table */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f7f4ee" }}>
                    {["Agreement ID", "Booking", "Customer", "Package", "Status", "Created", "Actions"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e0e0e0", fontWeight: 600, color: "#555", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 48, color: "#888" }}>⏳ Loading…</td></tr>
                  ) : agreements.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 56, color: "#888" }}>
                      <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>No agreements found</div>
                      {!statusFilter && !search && (
                        <button onClick={backfill} disabled={backfilling}
                          style={{ background: GOLD, color: "#1a0a00", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                          ⚡ Generate Now
                        </button>
                      )}
                    </td></tr>
                  ) : agreements.map(ag => {
                    const sc = STATUS_COLORS[ag.status] || { bg: "#eee", text: "#555" };
                    const isActive = selected?.id === ag.id;
                    return (
                      <tr key={ag.id} onClick={() => loadDetail(ag)}
                        style={{ borderBottom: "1px solid #f0f0f0", background: isActive ? "#f0f7f0" : "white", cursor: "pointer" }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLTableRowElement).style.background = "#f9f9f9"; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLTableRowElement).style.background = "white"; }}
                      >
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 700, color: G, fontSize: 12 }}>{ag.agreement_number}</div>
                          <div style={{ color: "#aaa", fontSize: 10, marginTop: 2 }}>ID: {ag.id.slice(0, 8)}…</div>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{ag.booking_number}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div>{ag.customer_name}</div>
                          <div style={{ color: "#888", fontSize: 11 }}>{ag.customer_mobile}</div>
                        </td>
                        <td style={{ padding: "10px 12px", maxWidth: 150 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ag.package_name || "—"}</div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: sc.bg, color: sc.text, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {STATUS_ICONS[ag.status]} {STATUS_LABELS[ag.status] || ag.status}
                          </span>
                          {ag.otp_verified && <div style={{ fontSize: 10, color: G, marginTop: 3 }}>✓ OTP Verified</div>}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#888", fontSize: 12, whiteSpace: "nowrap" }}>
                          {new Date(ag.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            <button onClick={e => { e.stopPropagation(); loadDetail(ag); }} style={btnStyle(G)}>👁</button>
                            <button onClick={e => { e.stopPropagation(); downloadPdf(ag.id, ag.agreement_number, ag.booking_id); }} disabled={isLoading("pdf" + ag.id)} style={btnStyle("#1a5276")}>⬇ PDF</button>
                            <button onClick={e => { e.stopPropagation(); openDetailsModal(ag); }} title="Edit Hotel & Flight" style={btnStyle(GOLD, "#1a0a00")}>✏ Details</button>
                            <button onClick={e => { e.stopPropagation(); doAction("resend_email", ag.id); }} disabled={isLoading("resend_email" + ag.id)} style={btnStyle("#1565C0")}>✉</button>
                            <button onClick={e => { e.stopPropagation(); doAction("resend_whatsapp", ag.id); }} disabled={isLoading("resend_whatsapp" + ag.id)} style={btnStyle("#25D366")}>📱</button>
                            {ag.status !== "cancelled" ? (
                              <button onClick={e => { e.stopPropagation(); setCancelModal({ id: ag.id }); }} style={btnStyle("#CC0000")}>✕</button>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); doAction("regenerate", ag.id, {}, ag.booking_id); }} disabled={isLoading("regenerate" + ag.id)} style={btnStyle(GOLD, "#1a0a00")}>↻</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "center" }}>
                {Array.from({ length: pages }, (_, i) => (
                  <button key={i} onClick={() => { setPage(i + 1); loadAgreements(i + 1); }}
                    style={{ background: page === i + 1 ? G : "white", color: page === i + 1 ? "white" : "#333", border: `1px solid ${page === i + 1 ? G : "#ddd"}`, borderRadius: 4, padding: "5px 12px", cursor: "pointer", fontSize: 13 }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Detail Panel ── */}
          {selected && (
            <div style={{ width: 380, flexShrink: 0, border: "1px solid #ddd", borderRadius: 10, overflow: "hidden", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>

              <div style={{ background: G, padding: "14px 18px", position: "sticky", top: 0, zIndex: 2 }}>
                <div style={{ color: GOLD, fontSize: 10, letterSpacing: 1.5 }}>AGREEMENT DETAIL</div>
                <div style={{ color: "white", fontWeight: 700, fontSize: 15, marginTop: 2 }}>{selected.agreement_number}</div>
                <div style={{ color: "#a8d5be", fontSize: 11, marginTop: 2 }}>{selected.booking_number} · {selected.customer_name}</div>
                <button onClick={() => setSelected(null)}
                  style={{ position: "absolute", top: 12, right: 14, background: "transparent", border: "none", color: "#a8d5be", fontSize: 18, cursor: "pointer" }}>
                  ×
                </button>
              </div>

              <div style={{ padding: "16px 18px" }}>

                {/* Status badge */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{ background: (STATUS_COLORS[selected.status] || { bg: "#eee" }).bg, color: (STATUS_COLORS[selected.status] || { text: "#555" }).text, borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700 }}>
                    {STATUS_ICONS[selected.status]} {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                </div>

                {/* Customer info */}
                {([
                  ["Booking Ref",  selected.booking_number],
                  ["Customer",     selected.customer_name],
                  ["Mobile",       selected.customer_mobile || "—"],
                  ["Email",        selected.customer_email  || "—"],
                  ["Package",      selected.package_name    || "—"],
                  ["Total",        `₹${Number(selected.final_amount || 0).toLocaleString("en-IN")}`],
                  ["Paid",         `₹${Number(selected.paid_amount  || 0).toLocaleString("en-IN")}`],
                  ["OTP Verified", selected.otp_verified ? "✅ Yes" : "❌ No"],
                  ["Signed At",    selected.signed_at ? new Date(selected.signed_at).toLocaleString("en-IN") : "Not signed"],
                  ["Signer IP",    selected.signed_ip || "—"],
                  ["Device/Browser", (() => {
                    const ua = selected.signed_user_agent || "";
                    if (!ua) return "—";
                    if (ua.includes("Edg")) return "Edge";
                    if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
                    if (ua.includes("Firefox")) return "Firefox";
                    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
                    if (ua.includes("Mobile")) return "Mobile Browser";
                    return ua.substring(0, 40);
                  })()],
                  ["Created",      new Date(selected.created_at).toLocaleString("en-IN")],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f5f5f5", fontSize: 12 }}>
                    <span style={{ color: "#777", minWidth: 90 }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: "right", maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
                  </div>
                ))}

                {/* KYC info (if available) */}
                {(selected.passport_number || selected.blood_group || selected.gender) && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "#f0f7f0", borderRadius: 8, border: "1px solid #c0d8c0" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: G, marginBottom: 6 }}>KYC DATA</div>
                    {selected.passport_number && <div style={{ fontSize: 11, color: "#444" }}>Passport: <strong>{selected.passport_number}</strong></div>}
                    {selected.blood_group     && <div style={{ fontSize: 11, color: "#444" }}>Blood Group: <strong>{selected.blood_group}</strong></div>}
                    {selected.gender          && <div style={{ fontSize: 11, color: "#444" }}>Gender: <strong>{selected.gender}</strong></div>}
                    {selected.emergency_contact_name && <div style={{ fontSize: 11, color: "#444" }}>Emergency: <strong>{selected.emergency_contact_name} ({selected.emergency_contact_mobile})</strong></div>}
                  </div>
                )}

                {/* Hotel/Flight info */}
                {(selected.hotel_info || selected.flight_info) && (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: "#fff8e7", borderRadius: 8, border: "1px solid #f0cc70" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#7B4700" }}>HOTEL & FLIGHT</div>
                      <button onClick={() => openDetailsModal(selected)} style={{ background: "none", border: "1px solid #C9A23F", color: "#7B4700", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer" }}>
                        ✏ Edit
                      </button>
                    </div>
                    {selected.hotel_info?.makkahHotel  && <div style={{ fontSize: 11, color: "#444" }}>Makkah: <strong>{selected.hotel_info.makkahHotel}</strong></div>}
                    {selected.hotel_info?.madinahHotel && <div style={{ fontSize: 11, color: "#444" }}>Madinah: <strong>{selected.hotel_info.madinahHotel}</strong></div>}
                    {selected.hotel_info?.roomSharing  && <div style={{ fontSize: 11, color: "#444" }}>Sharing: <strong>{selected.hotel_info.roomSharing}</strong></div>}
                    {selected.flight_info?.airline     && <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>Airline: <strong>{selected.flight_info.airline}</strong></div>}
                    {selected.flight_info?.flightNumber && <div style={{ fontSize: 11, color: "#444" }}>Flight: <strong>{selected.flight_info.flightNumber}</strong></div>}
                    {selected.flight_info?.departure   && <div style={{ fontSize: 11, color: "#444" }}>Departure: <strong>{selected.flight_info.departure}</strong></div>}
                  </div>
                )}

                {/* Hotel/Flight edit button (if not yet filled) */}
                {!selected.hotel_info && !selected.flight_info && (
                  <button onClick={() => openDetailsModal(selected)}
                    style={{ marginTop: 10, width: "100%", background: "#FFF8E7", color: "#7B4700", border: "1px dashed #C9A23F", borderRadius: 6, padding: "8px", fontSize: 12, cursor: "pointer" }}>
                    ✏ Add Hotel & Flight Details
                  </button>
                )}

                {/* Cancelled reason */}
                {selected.status === "cancelled" && selected.cancelled_reason && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#fff3f3", borderRadius: 6, fontSize: 12, color: "#721c24", borderLeft: "3px solid #CC0000" }}>
                    <strong>Reason:</strong> {selected.cancelled_reason}
                  </div>
                )}

                {/* Status update */}
                <div style={{ marginTop: 16, padding: "12px", background: "#f9f6f0", borderRadius: 8, border: "1px solid #e8e0d0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 8 }}>Update Status</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["pending_signature", "signed", "cancelled"] as const).map(s => (
                      <button key={s} onClick={() => updateStatus(selected.id, s)}
                        disabled={statusUpdating || selected.status === s}
                        style={{
                          flex: 1, padding: "6px 4px", fontSize: 11, fontWeight: 600, borderRadius: 5,
                          border: selected.status === s ? `2px solid ${(STATUS_COLORS[s] || { text: "#555" }).text}` : "1px solid #ddd",
                          background: selected.status === s ? (STATUS_COLORS[s] || { bg: "#eee" }).bg : "white",
                          color: selected.status === s ? (STATUS_COLORS[s] || { text: "#555" }).text : "#555",
                          cursor: statusUpdating || selected.status === s ? "not-allowed" : "pointer",
                        }}>
                        {s === "pending_signature" ? "⏳" : s === "signed" ? "✅" : "❌"} {s === "pending_signature" ? "Pending" : s === "signed" ? "Signed" : "Cancel"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Signature preview */}
                {selected.signature_data && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 6 }}>Customer Signature</div>
                    <img src={selected.signature_data} alt="Signature"
                      style={{ border: "1px solid #ddd", borderRadius: 6, maxWidth: "100%", background: "#FAFFFE", padding: 4 }} />
                  </div>
                )}

                {/* Verification link */}
                {selected.verification_url && (
                  <div style={{ marginTop: 12 }}>
                    <a href={selected.verification_url} target="_blank" rel="noreferrer"
                      style={{ color: G, fontSize: 12, textDecoration: "underline" }}>
                      🔍 Verify Agreement (QR Link)
                    </a>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  <button onClick={() => downloadPdf(selected.id, selected.agreement_number, (selected as any).booking_id)}
                    disabled={isLoading("pdf" + selected.id)} style={panelBtnStyle(G)}>
                    {isLoading("pdf" + selected.id) ? "⏳ Checking data…" : "⬇ Download Premium PDF (6-Page)"}
                  </button>
                  <button onClick={() => openDetailsModal(selected)} style={panelBtnStyle(GOLD, "#1a0a00")}>
                    ✏ Edit Hotel & Flight Details
                  </button>
                  <button onClick={() => doAction("resend_email", selected.id)} disabled={!!actionLoading} style={panelBtnStyle("#1565C0")}>
                    ✉ Send Email with PDF
                  </button>
                  <button onClick={() => doAction("resend_whatsapp", selected.id)} disabled={!!actionLoading} style={panelBtnStyle("#25D366")}>
                    📱 Send WhatsApp with PDF
                  </button>
                  {selected.status !== "cancelled" && selected.status !== "superseded" && (
                    <button onClick={() => setReviseModal({ id: selected.id })} disabled={!!actionLoading} style={panelBtnStyle("#5c35a0")}>
                      🔄 Issue Correction (Revise)
                    </button>
                  )}
                  {selected.status !== "cancelled" ? (
                    <button onClick={() => setCancelModal({ id: selected.id })} disabled={!!actionLoading} style={panelBtnStyle("#CC0000")}>
                      ✕ Cancel Agreement
                    </button>
                  ) : (
                    <button onClick={() => doAction("regenerate", selected.id, {}, (selected as any).booking_id)} disabled={!!actionLoading} style={panelBtnStyle(GOLD, "#1a0a00")}>
                      ↻ Regenerate Agreement
                    </button>
                  )}
                </div>

                {/* Audit trail */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontWeight: 700, color: G, fontSize: 12, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 10 }}>📋 Audit Trail</div>
                  {auditLoading ? (
                    <div style={{ color: "#888", fontSize: 12, textAlign: "center", padding: 16 }}>Loading logs…</div>
                  ) : auditLogs.length === 0 ? (
                    <div style={{ color: "#aaa", fontSize: 12, padding: "12px 0" }}>No audit logs yet</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                      {auditLogs.map(log => (
                        <div key={log.id} style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 10px", fontSize: 11, borderLeft: "3px solid #e0e0e0" }}>
                          <div style={{ fontWeight: 700, color: "#333", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                            {log.action.replace(/_/g, " ")}
                          </div>
                          <div style={{ color: "#888", marginTop: 2 }}>{new Date(log.created_at).toLocaleString("en-IN")}</div>
                          {log.ip_address && <div style={{ color: "#aaa", fontSize: 10 }}>IP: {log.ip_address}</div>}
                          {log.details && typeof log.details === "object" && Object.keys(log.details).length > 0 && (
                            <div style={{ color: "#666", marginTop: 2, fontSize: 10 }}>
                              {Object.entries(log.details).map(([k, v]) =>
                                k !== "adminId" ? <span key={k} style={{ marginRight: 8 }}>{k}: {String(v)}</span> : null
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Cancel Modal ── */}
      {cancelModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "white", borderRadius: 10, padding: 28, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ color: "#CC0000", marginBottom: 12, fontSize: 16 }}>❌ Cancel Agreement</h3>
            <p style={{ color: "#555", fontSize: 13, marginBottom: 14 }}>Please provide a reason:</p>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation…" rows={3}
              style={{ width: "100%", border: "1px solid #ddd", borderRadius: 6, padding: "8px", fontSize: 13, boxSizing: "border-box" as const, resize: "vertical" as const }} />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => { setCancelModal(null); setCancelReason(""); }}
                style={{ flex: 1, background: "#f5f5f5", color: "#555", border: "1px solid #ddd", borderRadius: 6, padding: "9px", cursor: "pointer", fontSize: 13 }}>
                Go Back
              </button>
              <button onClick={() => doAction("cancel", cancelModal.id, { reason: cancelReason })}
                disabled={!cancelReason.trim()}
                style={{ flex: 1, background: "#CC0000", color: "white", border: "none", borderRadius: 6, padding: "9px", cursor: cancelReason.trim() ? "pointer" : "not-allowed", fontWeight: 600, fontSize: 13, opacity: cancelReason.trim() ? 1 : 0.5 }}>
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revise (Correction) Modal ── */}
      {reviseModal && (
        <div onClick={() => { setReviseModal(null); setReviseReason(""); setReviseCorrections({ hotel_info: {}, flight_info: {}, tcs_amount: "", gst_amount: "", discount_amount: "" }); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "white", borderRadius: 10, padding: 28, width: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ color: "#5c35a0", marginBottom: 8, fontSize: 16 }}>🔄 Issue Agreement Correction</h3>
            <p style={{ color: "#555", fontSize: 13, marginBottom: 4 }}>
              This supersedes the current agreement and issues a corrected revision. The customer receives
              a fresh signing link. The old agreement is preserved in audit history.
            </p>
            <p style={{ color: "#856404", background: "#FFF3CD", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
              ⚠️ Supports hotel, flight, and financial (TCS/GST/discount) corrections.
              For name or package amount changes, update the booking/customer profile first, then use Regenerate.
            </p>

            <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#333", marginBottom: 4 }}>
              Correction reason <span style={{ color: "#CC0000" }}>*</span>
            </label>
            <textarea value={reviseReason} onChange={e => setReviseReason(e.target.value)}
              placeholder="e.g. Hotel changed from Hilton to Marriott, departure date corrected from 10 Jun to 12 Jun…" rows={3}
              style={{ width: "100%", border: "1px solid #ddd", borderRadius: 6, padding: "8px", fontSize: 13, boxSizing: "border-box" as const, resize: "vertical" as const, marginBottom: 14 }} />

            {/* Hotel corrections */}
            <div style={{ fontWeight: 700, color: "#0B3D2E", fontSize: 12, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.8 }}>🕌 Hotel Corrections (leave blank to keep current)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[
                ["makkahHotel", "Makkah Hotel"], ["madinahHotel", "Madinah Hotel"],
                ["makkahCheckIn", "Makkah Check-in"], ["makkahCheckOut", "Makkah Check-out"],
                ["madinahCheckIn", "Madinah Check-in"], ["madinahCheckOut", "Madinah Check-out"],
                ["makkahDistance", "Makkah Distance"], ["madinahDistance", "Madinah Distance"],
                ["roomSharing", "Room Sharing"],
              ].map(([k, label]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>{label}</div>
                  <input placeholder={label}
                    value={reviseCorrections.hotel_info[k] || ""}
                    onChange={e => setReviseCorrections(p => ({ ...p, hotel_info: { ...p.hotel_info, [k]: e.target.value } }))}
                    style={{ width: "100%", border: "1px solid #ddd", borderRadius: 4, padding: "5px 8px", fontSize: 12, boxSizing: "border-box" as const }} />
                </div>
              ))}
            </div>

            {/* Flight corrections */}
            <div style={{ fontWeight: 700, color: "#0B3D2E", fontSize: 12, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.8 }}>✈️ Flight Corrections (leave blank to keep current)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                ["airline", "Airline"], ["flightNumber", "Flight No."],
                ["departure", "Departure"], ["arrival", "Arrival"],
                ["transit", "Transit"], ["baggage", "Baggage"],
              ].map(([k, label]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>{label}</div>
                  <input placeholder={label}
                    value={reviseCorrections.flight_info[k] || ""}
                    onChange={e => setReviseCorrections(p => ({ ...p, flight_info: { ...p.flight_info, [k]: e.target.value } }))}
                    style={{ width: "100%", border: "1px solid #ddd", borderRadius: 4, padding: "5px 8px", fontSize: 12, boxSizing: "border-box" as const }} />
                </div>
              ))}
            </div>

            {/* Financial corrections */}
            <div style={{ fontWeight: 700, color: "#0B3D2E", fontSize: 12, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: 0.8 }}>💰 Financial Corrections (leave blank to keep current)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {([["tcs_amount","TCS Amount (₹)"],["gst_amount","GST Amount (₹)"],["discount_amount","Discount (₹)"]] as [keyof typeof reviseCorrections, string][]).map(([k, label]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>{label}</div>
                  <input type="number" min="0" placeholder="0"
                    value={reviseCorrections[k] as string}
                    onChange={e => setReviseCorrections(p => ({ ...p, [k]: e.target.value }))}
                    style={{ width: "100%", border: "1px solid #ddd", borderRadius: 4, padding: "5px 8px", fontSize: 12, boxSizing: "border-box" as const }} />
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setReviseModal(null); setReviseReason(""); setReviseCorrections({ hotel_info: {}, flight_info: {}, tcs_amount: "", gst_amount: "", discount_amount: "" }); }}
                style={{ flex: 1, background: "#f5f5f5", color: "#555", border: "1px solid #ddd", borderRadius: 6, padding: "9px", cursor: "pointer", fontSize: 13 }}>
                Go Back
              </button>
              <button
                disabled={!reviseReason.trim() || !!revisingId}
                onClick={async () => {
                  if (!reviseReason.trim()) return;
                  setRevisingId(reviseModal.id);
                  // Build corrections — only include fields that were changed
                  const cleanHotel  = Object.fromEntries(Object.entries(reviseCorrections.hotel_info).filter(([, v]) => v.trim()));
                  const cleanFlight = Object.fromEntries(Object.entries(reviseCorrections.flight_info).filter(([, v]) => v.trim()));
                  const corrections: Record<string, unknown> = {};
                  if (Object.keys(cleanHotel).length)  corrections.hotel_info  = cleanHotel;
                  if (Object.keys(cleanFlight).length) corrections.flight_info = cleanFlight;
                  // Financial: include when non-empty (0 is a valid correction)
                  if (reviseCorrections.tcs_amount.trim()      !== "") corrections.tcs_amount      = Number(reviseCorrections.tcs_amount);
                  if (reviseCorrections.gst_amount.trim()      !== "") corrections.gst_amount      = Number(reviseCorrections.gst_amount);
                  if (reviseCorrections.discount_amount.trim() !== "") corrections.discount_amount = Number(reviseCorrections.discount_amount);
                  try {
                    const r = await fetch(`${API}/api/agreements/${reviseModal.id}/revise`, {
                      method: "POST", credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        correctionReason: reviseReason,
                        corrections: Object.keys(corrections).length ? corrections : undefined,
                      }),
                    });
                    const d = await r.json();
                    if (d.ok) {
                      toast({ title: "Correction issued", description: "New revision created. Customer notified with a fresh signing link." });
                      setReviseModal(null); setReviseReason("");
                      setReviseCorrections({ hotel_info: {}, flight_info: {}, tcs_amount: "", gst_amount: "", discount_amount: "" });
                      loadAgreements(page);
                      if (selected) setSelected(null);
                    } else {
                      toast({ title: "Revise failed", description: d.error || "Unknown error", variant: "destructive" });
                    }
                  } catch {
                    toast({ title: "Error", description: "Network error", variant: "destructive" });
                  } finally { setRevisingId(null); }
                }}
                style={{ flex: 1, background: revisingId ? "#aaa" : "#5c35a0", color: "white", border: "none", borderRadius: 6, padding: "9px", cursor: reviseReason.trim() && !revisingId ? "pointer" : "not-allowed", fontWeight: 600, fontSize: 13 }}>
                {revisingId ? "⏳ Revising…" : "🔄 Issue Correction"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hotel & Flight Details Modal ── */}
      {detailsModal && (
        <div onClick={() => setDetailsModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}>

            <div style={{ background: G, borderRadius: "12px 12px 0 0", padding: "18px 22px", position: "relative" }}>
              <div style={{ color: GOLD, fontSize: 10, letterSpacing: 2 }}>AGREEMENT DETAILS</div>
              <div style={{ color: "white", fontWeight: 700, fontSize: 16, marginTop: 2 }}>Edit Hotel & Flight Details</div>
              <div style={{ color: "#a8d5be", fontSize: 12, marginTop: 2 }}>These details appear on the printed PDF agreement</div>
              <button onClick={() => setDetailsModal(null)}
                style={{ position: "absolute", top: 12, right: 14, background: "transparent", border: "none", color: "#a8d5be", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>
                ×
              </button>
            </div>

            <div style={{ padding: "22px 24px" }}>

              {/* Hotel section */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: G, fontSize: 13, marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #c0d8c0" }}>
                  🕌 Accommodation Details
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {([
                    ["makkahHotel",  "Makkah Hotel Name",     "e.g. Hilton Makkah Convention"],
                    ["madinahHotel", "Madinah Hotel Name",    "e.g. Anwar Al Madinah Mövenpick"],
                    ["checkIn",     "Hotel Check-In Date",   "e.g. 01 Jun 2026"],
                    ["checkOut",    "Hotel Check-Out Date",  "e.g. 25 Jun 2026"],
                    ["roomSharing", "Room Sharing Type",     "e.g. Quad / Triple / Double"],
                    ["distance",    "Distance from Haram",   "e.g. 800m from Masjid al-Haram"],
                  ] as [keyof DetailsForm, string, string][]).map(([field, label, placeholder]) => (
                    <div key={field} style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>{label}</label>
                      <input
                        value={detailsForm[field]}
                        onChange={e => setDetailsForm(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ border: "1px solid #ddd", borderRadius: 6, padding: "7px 10px", fontSize: 12 }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Flight section */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: G, fontSize: 13, marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #c0d8c0" }}>
                  ✈ Flight Details
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {([
                    ["airline",      "Airline Name",         "e.g. Air India / IndiGo"],
                    ["flightNumber", "Flight Number",        "e.g. AI-111 / 6E-2202"],
                    ["departure",    "Departure Details",    "e.g. BOM → JED, 15 May 04:30"],
                    ["arrival",      "Arrival Details",      "e.g. JED, 15 May 07:30 (local)"],
                    ["transit",      "Transit / Layover",    "e.g. Dubai — 2hr layover"],
                    ["baggage",      "Baggage Allowance",    "e.g. 23 kg + 7 kg cabin"],
                  ] as [keyof DetailsForm, string, string][]).map(([field, label, placeholder]) => (
                    <div key={field} style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>{label}</label>
                      <input
                        value={detailsForm[field]}
                        onChange={e => setDetailsForm(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ border: "1px solid #ddd", borderRadius: 6, padding: "7px 10px", fontSize: 12 }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: "#FFF8E7", border: "1px solid #F0CC70", borderRadius: 6, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#7B4700" }}>
                💡 After saving, download the PDF to see the updated agreement with hotel and flight details on Page 1.
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => setDetailsModal(null)}
                  style={{ flex: 1, background: "#f5f5f5", color: "#555", border: "1px solid #ddd", borderRadius: 6, padding: "10px", cursor: "pointer", fontSize: 13 }}>
                  Cancel
                </button>
                <button onClick={saveDetails} disabled={savingDetails}
                  style={{ flex: 2, background: G, color: "white", border: "none", borderRadius: 6, padding: "10px", cursor: savingDetails ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13, opacity: savingDetails ? 0.7 : 1 }}>
                  {savingDetails ? "Saving…" : "💾 Save Hotel & Flight Details"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function btnStyle(bg: string, color = "white"): React.CSSProperties {
  return { background: bg, color, border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" as const };
}

function panelBtnStyle(bg: string, color = "white"): React.CSSProperties {
  return { background: bg, color, border: "none", borderRadius: 6, padding: "9px", fontSize: 13, cursor: "pointer", fontWeight: 600, width: "100%" };
}
