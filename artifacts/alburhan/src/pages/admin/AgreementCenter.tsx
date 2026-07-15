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
}

interface AuditLog {
  id: string;
  action: string;
  details: any;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:             { bg: "#e8e8e8", text: "#555555" },
  pending_signature: { bg: "#FFF3CD", text: "#856404" },
  signed:            { bg: "#D4EDDA", text: "#155724" },
  cancelled:         { bg: "#F8D7DA", text: "#721C24" },
};

const STATUS_LABELS: Record<string, string> = {
  draft:             "Draft",
  pending_signature: "Pending",
  signed:            "Signed",
  cancelled:         "Cancelled",
};

const STATUS_ICONS: Record<string, string> = {
  draft:             "📄",
  pending_signature: "⏳",
  signed:            "✅",
  cancelled:         "❌",
};

const G = "#0B5D3B";
const GOLD = "#C8A951";

export default function AgreementCenter() {
  const { toast } = useToast();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Agreement | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [cancelModal, setCancelModal] = useState<{ id: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ found: number; created: number } | null>(null);

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
    } catch (e: any) {
      toast({ title: "Error", description: "Failed to load agreements", variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
      if (auditRes.ok) { const d = await auditRes.json(); setAuditLogs(d.logs || []); }
    } catch {}
    finally { setAuditLoading(false); }
  };

  const doAction = async (action: string, id: string, extra?: any) => {
    setActionLoading(action + id);
    try {
      const urlMap: Record<string, string> = {
        cancel:           `${API}/api/agreements/${id}/cancel`,
        regenerate:       `${API}/api/agreements/${id}/regenerate`,
        resend_email:     `${API}/api/agreements/${id}/resend-email`,
        resend_whatsapp:  `${API}/api/agreements/${id}/resend-whatsapp`,
      };
      const r = await fetch(urlMap[action], {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extra || {}),
      });
      const d = await r.json();
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
        toast({ title: "Status Updated", description: `Agreement set to ${STATUS_LABELS[newStatus] || newStatus}` });
        loadAgreements(page);
        if (selected?.id === id && d.agreement) setSelected(d.agreement);
      } else {
        toast({ title: "Error", description: d.error || "Update failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally { setStatusUpdating(false); }
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
        toast({ title: `Created ${d.created} of ${d.found} agreements`, description: d.created > 0 ? "Agreements generated for approved bookings" : "All approved bookings already have agreements" });
        loadAgreements(1);
      } else {
        toast({ title: "Backfill failed", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Backfill request failed", variant: "destructive" });
    } finally { setBackfilling(false); }
  };

  const downloadPdf = (id: string, number: string) => {
    const a = document.createElement("a");
    a.href = `${API}/api/agreements/${id}/pdf`;
    a.download = `Agreement-${number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isLoading = (key: string) => actionLoading === key;

  const signed   = agreements.filter(a => a.status === "signed").length;
  const pending  = agreements.filter(a => a.status === "pending_signature" || a.status === "draft").length;
  const cancelled = agreements.filter(a => a.status === "cancelled").length;

  return (
    <AdminLayout>
      <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: "bold", color: G, margin: 0 }}>⚖️ Agreement Center</h1>
            <p style={{ color: "#666", fontSize: 13, margin: "4px 0 0" }}>
              Digital Hajj Agreements — {total} total
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {backfillResult && (
              <span style={{ fontSize: 12, color: "#155724", background: "#d4edda", padding: "4px 10px", borderRadius: 20 }}>
                ✓ Created {backfillResult.created}/{backfillResult.found} agreements
              </span>
            )}
            <button
              onClick={backfill}
              disabled={backfilling}
              title="Create agreements for all approved bookings that don't have one"
              style={{ background: GOLD, color: "#1a0a00", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: backfilling ? "not-allowed" : "pointer", fontWeight: 600, opacity: backfilling ? 0.7 : 1 }}
            >
              {backfilling ? "⏳ Generating…" : "⚡ Generate Missing Agreements"}
            </button>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total",     value: total,     ...STATUS_COLORS.signed    },
            { label: "Signed",    value: signed,    ...STATUS_COLORS.signed    },
            { label: "Pending",   value: pending,   ...STATUS_COLORS.pending_signature },
            { label: "Cancelled", value: cancelled, ...STATUS_COLORS.cancelled },
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
            placeholder="Search Agreement ID, Booking ID, Customer Name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240, border: "1px solid #ddd", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ border: "1px solid #ddd", borderRadius: 6, padding: "8px 12px", fontSize: 13, minWidth: 150 }}
          >
            <option value="">All Status</option>
            <option value="pending_signature">Pending</option>
            <option value="signed">Signed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="submit"
            style={{ background: G, color: "white", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: "pointer" }}>
            🔍 Search
          </button>
          {(search || statusFilter) && (
            <button type="button" onClick={() => { setSearch(""); setStatusFilter(""); setTimeout(() => loadAgreements(1), 0); }}
              style={{ background: "#f5f5f5", color: "#555", border: "1px solid #ddd", borderRadius: 6, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
              Clear
            </button>
          )}
        </form>

        {/* ── Main layout: table + detail panel ── */}
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
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 48, color: "#888" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
                      Loading agreements…
                    </td></tr>
                  ) : agreements.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 56, color: "#888" }}>
                      <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>No agreements found</div>
                      <div style={{ fontSize: 12, marginBottom: 16 }}>
                        {statusFilter || search ? "Try clearing the filters." : "Approve a booking to automatically create an agreement, or click 'Generate Missing Agreements' above."}
                      </div>
                      {!statusFilter && !search && (
                        <button onClick={backfill} disabled={backfilling}
                          style={{ background: GOLD, color: "#1a0a00", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                          {backfilling ? "Generating…" : "⚡ Generate Now"}
                        </button>
                      )}
                    </td></tr>
                  ) : agreements.map(ag => {
                    const sc = STATUS_COLORS[ag.status] || { bg: "#eee", text: "#555" };
                    const isActive = selected?.id === ag.id;
                    return (
                      <tr key={ag.id}
                        onClick={() => loadDetail(ag)}
                        style={{ borderBottom: "1px solid #f0f0f0", background: isActive ? "#f0f7f0" : "white", cursor: "pointer" }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLTableRowElement).style.background = "#f9f9f9"; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLTableRowElement).style.background = "white"; }}
                      >
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 700, color: G, fontSize: 12 }}>{ag.agreement_number}</div>
                          <div style={{ color: "#aaa", fontSize: 10, marginTop: 2 }}>ID: {ag.id.slice(0, 8)}…</div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 600 }}>{ag.booking_number}</div>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div>{ag.customer_name}</div>
                          <div style={{ color: "#888", fontSize: 11 }}>{ag.customer_mobile}</div>
                        </td>
                        <td style={{ padding: "10px 12px", maxWidth: 160 }}>
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
                            <button
                              onClick={e => { e.stopPropagation(); loadDetail(ag); }}
                              title="View Details"
                              style={btnStyle(G)}
                            >👁 View</button>
                            <button
                              onClick={e => { e.stopPropagation(); downloadPdf(ag.id, ag.agreement_number); }}
                              title="Download PDF"
                              style={btnStyle("#1a5276")}
                            >⬇ PDF</button>
                            <button
                              onClick={e => { e.stopPropagation(); doAction("resend_email", ag.id); }}
                              title="Send Email"
                              disabled={isLoading("resend_email" + ag.id)}
                              style={btnStyle("#1565C0")}
                            >✉</button>
                            <button
                              onClick={e => { e.stopPropagation(); doAction("resend_whatsapp", ag.id); }}
                              title="Send WhatsApp"
                              disabled={isLoading("resend_whatsapp" + ag.id)}
                              style={btnStyle("#25D366")}
                            >📱</button>
                            {ag.status !== "cancelled" ? (
                              <button
                                onClick={e => { e.stopPropagation(); setCancelModal({ id: ag.id }); }}
                                title="Cancel"
                                style={btnStyle("#CC0000")}
                              >✕</button>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); doAction("regenerate", ag.id); }}
                                title="Regenerate"
                                disabled={isLoading("regenerate" + ag.id)}
                                style={btnStyle(GOLD, "#1a0a00")}
                              >↻</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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
            <div style={{ width: 370, flexShrink: 0, border: "1px solid #ddd", borderRadius: 10, overflow: "hidden", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>

              {/* Panel header */}
              <div style={{ background: G, padding: "14px 18px", position: "sticky", top: 0, zIndex: 2 }}>
                <div style={{ color: GOLD, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>Agreement Detail</div>
                <div style={{ color: "white", fontWeight: 700, fontSize: 15, marginTop: 2 }}>{selected.agreement_number}</div>
                <div style={{ color: "#a8d5be", fontSize: 11, marginTop: 2 }}>{selected.booking_number} · {selected.customer_name}</div>
                <button onClick={() => setSelected(null)}
                  style={{ position: "absolute", top: 12, right: 14, background: "transparent", border: "none", color: "#a8d5be", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>
                  ×
                </button>
              </div>

              <div style={{ padding: "16px 18px" }}>

                {/* Status badge */}
                <div style={{ marginBottom: 14 }}>
                  <span style={{
                    background: (STATUS_COLORS[selected.status] || { bg: "#eee" }).bg,
                    color: (STATUS_COLORS[selected.status] || { text: "#555" }).text,
                    borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700,
                  }}>
                    {STATUS_ICONS[selected.status]} {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                </div>

                {/* Info rows */}
                {([
                  ["Booking Ref",   selected.booking_number],
                  ["Customer",      selected.customer_name],
                  ["Mobile",        selected.customer_mobile || "—"],
                  ["Email",         selected.customer_email || "—"],
                  ["Package",       selected.package_name || "—"],
                  ["Total Amount",  `₹${Number(selected.final_amount || 0).toLocaleString("en-IN")}`],
                  ["Amount Paid",   `₹${Number(selected.paid_amount || 0).toLocaleString("en-IN")}`],
                  ["OTP Verified",  selected.otp_verified ? "✅ Yes" : "❌ No"],
                  ["Signed At",     selected.signed_at ? new Date(selected.signed_at).toLocaleString("en-IN") : "Not signed"],
                  ["Created At",    new Date(selected.created_at).toLocaleString("en-IN")],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f5f5f5", fontSize: 12 }}>
                    <span style={{ color: "#777", minWidth: 90 }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: "right", maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
                  </div>
                ))}

                {/* Cancelled reason */}
                {selected.status === "cancelled" && selected.cancelled_reason && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#fff3f3", borderRadius: 6, fontSize: 12, color: "#721c24", borderLeft: "3px solid #CC0000" }}>
                    <strong>Cancellation Reason:</strong> {selected.cancelled_reason}
                  </div>
                )}

                {/* ── Status Update ── */}
                <div style={{ marginTop: 16, padding: "12px", background: "#f9f6f0", borderRadius: 8, border: "1px solid #e8e0d0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Update Status</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["pending_signature", "signed", "cancelled"] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(selected.id, s)}
                        disabled={statusUpdating || selected.status === s}
                        style={{
                          flex: 1, padding: "6px 4px", fontSize: 11, fontWeight: 600, borderRadius: 5,
                          border: selected.status === s ? `2px solid ${(STATUS_COLORS[s] || { text: "#555" }).text}` : "1px solid #ddd",
                          background: selected.status === s ? (STATUS_COLORS[s] || { bg: "#eee" }).bg : "white",
                          color: selected.status === s ? (STATUS_COLORS[s] || { text: "#555" }).text : "#555",
                          cursor: statusUpdating || selected.status === s ? "not-allowed" : "pointer",
                          opacity: statusUpdating && selected.status !== s ? 0.6 : 1,
                        }}
                      >
                        {s === "pending_signature" ? "⏳ Pending" : s === "signed" ? "✅ Signed" : "❌ Cancel"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Signature Preview ── */}
                {selected.signature_data && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Customer Signature</div>
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

                {/* ── Action Buttons ── */}
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={() => downloadPdf(selected.id, selected.agreement_number)}
                    style={panelBtnStyle(G)}>
                    ⬇ Download PDF
                  </button>
                  <button onClick={() => doAction("resend_email", selected.id)} disabled={!!actionLoading}
                    style={panelBtnStyle("#1565C0")}>
                    ✉ Send Email
                  </button>
                  <button onClick={() => doAction("resend_whatsapp", selected.id)} disabled={!!actionLoading}
                    style={panelBtnStyle("#25D366")}>
                    📱 Send WhatsApp
                  </button>
                  {selected.status !== "cancelled" ? (
                    <button onClick={() => setCancelModal({ id: selected.id })} disabled={!!actionLoading}
                      style={panelBtnStyle("#CC0000")}>
                      ✕ Cancel Agreement
                    </button>
                  ) : (
                    <button onClick={() => doAction("regenerate", selected.id)} disabled={!!actionLoading}
                      style={panelBtnStyle(GOLD, "#1a0a00")}>
                      ↻ Regenerate Agreement
                    </button>
                  )}
                </div>

                {/* ── Audit Trail ── */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontWeight: 700, color: G, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>📋 Audit Trail</div>
                  {auditLoading ? (
                    <div style={{ color: "#888", fontSize: 12, textAlign: "center", padding: 16 }}>Loading logs…</div>
                  ) : auditLogs.length === 0 ? (
                    <div style={{ color: "#aaa", fontSize: 12, padding: "12px 0" }}>No audit logs yet</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {auditLogs.map(log => (
                        <div key={log.id} style={{ background: "#f9f9f9", borderRadius: 6, padding: "8px 10px", fontSize: 11, borderLeft: "3px solid #e0e0e0" }}>
                          <div style={{ fontWeight: 700, color: "#333", textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {log.action.replace(/_/g, " ")}
                          </div>
                          <div style={{ color: "#888", marginTop: 2 }}>
                            {new Date(log.created_at).toLocaleString("en-IN")}
                          </div>
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
            <p style={{ color: "#555", fontSize: 13, marginBottom: 14 }}>Please provide a reason for cancellation:</p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation…"
              rows={3}
              style={{ width: "100%", border: "1px solid #ddd", borderRadius: 6, padding: "8px", fontSize: 13, boxSizing: "border-box", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => { setCancelModal(null); setCancelReason(""); }}
                style={{ flex: 1, background: "#f5f5f5", color: "#555", border: "1px solid #ddd", borderRadius: 6, padding: "9px", cursor: "pointer", fontSize: 13 }}>
                Go Back
              </button>
              <button
                onClick={() => doAction("cancel", cancelModal.id, { reason: cancelReason })}
                disabled={!cancelReason.trim()}
                style={{ flex: 1, background: "#CC0000", color: "white", border: "none", borderRadius: 6, padding: "9px", cursor: cancelReason.trim() ? "pointer" : "not-allowed", fontWeight: 600, fontSize: 13, opacity: cancelReason.trim() ? 1 : 0.5 }}>
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function btnStyle(bg: string, color = "white"): React.CSSProperties {
  return {
    background: bg, color, border: "none", borderRadius: 4,
    padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600,
    whiteSpace: "nowrap" as const,
  };
}

function panelBtnStyle(bg: string, color = "white"): React.CSSProperties {
  return {
    background: bg, color, border: "none", borderRadius: 6,
    padding: "9px", fontSize: 13, cursor: "pointer", fontWeight: 600, width: "100%",
  };
}
