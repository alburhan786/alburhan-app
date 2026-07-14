import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

interface Agreement {
  id: string;
  agreementNumber: string;
  bookingNumber: string;
  customerName: string;
  customerMobile: string;
  packageName: string;
  status: string;
  signedAt: string | null;
  otpVerified: boolean;
  pdfGenerated: boolean;
  createdAt: string;
  finalAmount: string;
  paidAmount: string;
}

interface AuditLog {
  id: string;
  action: string;
  details: any;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#888",
  pending_signature: "#C9A23F",
  signed: "#0B3D2E",
  cancelled: "#CC0000",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_signature: "Pending Signature",
  signed: "Signed",
  cancelled: "Cancelled",
};

export default function AgreementCenter() {
  const { toast } = useToast();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [cancelModal, setCancelModal] = useState<{ id: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadAgreements = async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const r = await fetch(`${API}/api/agreements?${params}`, { credentials: "include" });
      const d = await r.json();
      setAgreements(d.agreements || []);
      setTotal(d.total || 0);
      setPages(d.pages || 1);
    } catch { toast({ title: "Error", description: "Failed to load agreements", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAgreements(1); }, []);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); loadAgreements(1); };

  const loadDetail = async (id: string) => {
    try {
      const r = await fetch(`${API}/api/agreements/${id}`, { credentials: "include" });
      const d = await r.json();
      setSelected(d);
    } catch { toast({ title: "Error", description: "Failed to load agreement detail", variant: "destructive" }); }
  };

  const loadAuditLogs = async (id: string) => {
    setAuditLoading(true);
    try {
      const r = await fetch(`${API}/api/agreements/${id}/audit`, { credentials: "include" });
      const d = await r.json();
      setAuditLogs(d.logs || []);
    } catch {}
    finally { setAuditLoading(false); }
  };

  const doAction = async (action: string, id: string, extra?: any) => {
    setActionLoading(action + id);
    try {
      const methodMap: Record<string, string> = { cancel: "POST", regenerate: "POST", resend_email: "POST", resend_whatsapp: "POST" };
      const urlMap: Record<string, string> = {
        cancel: `${API}/api/agreements/${id}/cancel`,
        regenerate: `${API}/api/agreements/${id}/regenerate`,
        resend_email: `${API}/api/agreements/${id}/resend-email`,
        resend_whatsapp: `${API}/api/agreements/${id}/resend-whatsapp`,
      };
      const r = await fetch(urlMap[action], {
        method: methodMap[action], credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extra || {}),
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: "Success", description: `Action completed successfully` });
        loadAgreements(page);
        if (selected?.id === id) await loadDetail(id);
        setCancelModal(null);
        setCancelReason("");
      } else {
        toast({ title: "Error", description: d.error || "Action failed", variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Network error", variant: "destructive" }); }
    finally { setActionLoading(null); }
  };

  const downloadPdf = (id: string, number: string) => {
    const a = document.createElement("a");
    a.href = `${API}/api/agreements/${id}/pdf`;
    a.download = `Agreement-${number}.pdf`;
    a.click();
  };

  return (
    <AdminLayout>
      <div style={{ padding: "24px", maxWidth: 1300, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: "bold", color: "#0B3D2E", margin: 0 }}>⚖️ Agreement Center</h1>
            <p style={{ color: "#666", fontSize: 14, margin: "4px 0 0" }}>
              Manage all Hajj digital agreements — {total} total
            </p>
          </div>
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <input
            placeholder="Search by Agreement ID, Booking ID, Customer Name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240, border: "1px solid #DDD", borderRadius: 6, padding: "8px 12px", fontSize: 14 }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ border: "1px solid #DDD", borderRadius: 6, padding: "8px 12px", fontSize: 14, minWidth: 160 }}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_signature">Pending Signature</option>
            <option value="signed">Signed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="submit" style={{ background: "#0B3D2E", color: "white", border: "none", borderRadius: 6, padding: "8px 20px", fontSize: 14, cursor: "pointer" }}>
            Search
          </button>
        </form>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total", value: total, color: "#0B3D2E", bg: "#E8F5E9" },
            { label: "Signed", value: agreements.filter(a => a.status === "signed").length, color: "#0B3D2E", bg: "#E8F5E9" },
            { label: "Pending", value: agreements.filter(a => a.status === "pending_signature" || a.status === "draft").length, color: "#C9A23F", bg: "#FFF8E7" },
            { label: "Cancelled", value: agreements.filter(a => a.status === "cancelled").length, color: "#CC0000", bg: "#FFEBEE" },
          ].map(c => (
            <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}30`, borderRadius: 8, padding: "14px 18px" }}>
              <div style={{ color: c.color, fontSize: 22, fontWeight: "bold" }}>{c.value}</div>
              <div style={{ color: "#666", fontSize: 13 }}>{c.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Table */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ border: "1px solid #E0E0E0", borderRadius: 8, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F5F5F5" }}>
                    {["Agreement ID", "Booking", "Customer", "Status", "Signed At", "Actions"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #E0E0E0", fontWeight: 600, color: "#555", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#888" }}>Loading...</td></tr>
                  ) : agreements.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#888" }}>No agreements found</td></tr>
                  ) : agreements.map(ag => (
                    <tr key={ag.id} style={{ borderBottom: "1px solid #F0F0F0", background: selected?.id === ag.id ? "#F0F7F0" : "white" }}
                      onClick={() => { loadDetail(ag.id); loadAuditLogs(ag.id); }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 600, color: "#0B3D2E", cursor: "pointer" }}>{ag.agreementNumber}</div>
                        <div style={{ color: "#888", fontSize: 11 }}>{new Date(ag.createdAt).toLocaleDateString("en-IN")}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{ag.bookingNumber}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div>{ag.customerName}</div>
                        <div style={{ color: "#888", fontSize: 11 }}>{ag.customerMobile}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          background: STATUS_COLORS[ag.status] + "20",
                          color: STATUS_COLORS[ag.status],
                          borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 600
                        }}>{STATUS_LABELS[ag.status] || ag.status}</span>
                        {ag.otpVerified && <div style={{ fontSize: 10, color: "#0B3D2E", marginTop: 2 }}>✓ OTP Verified</div>}
                      </td>
                      <td style={{ padding: "10px 12px", color: ag.signedAt ? "#0B3D2E" : "#888" }}>
                        {ag.signedAt ? new Date(ag.signedAt).toLocaleString("en-IN") : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={e => { e.stopPropagation(); downloadPdf(ag.id, ag.agreementNumber); }}
                            title="Download PDF" style={{ background: "#0B3D2E", color: "white", border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>⬇ PDF</button>
                          <button onClick={e => { e.stopPropagation(); doAction("resend_email", ag.id); }}
                            title="Resend Email" style={{ background: "#1565C0", color: "white", border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>✉ Email</button>
                          <button onClick={e => { e.stopPropagation(); doAction("resend_whatsapp", ag.id); }}
                            title="Resend WhatsApp" style={{ background: "#25D366", color: "white", border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>📱 WA</button>
                          {ag.status !== "cancelled" && (
                            <button onClick={e => { e.stopPropagation(); setCancelModal({ id: ag.id }); }}
                              title="Cancel" style={{ background: "#CC0000", color: "white", border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>✕</button>
                          )}
                          {ag.status === "cancelled" && (
                            <button onClick={e => { e.stopPropagation(); doAction("regenerate", ag.id); }}
                              title="Regenerate" style={{ background: "#C9A23F", color: "white", border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>↻ Regen</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
                {Array.from({ length: pages }, (_, i) => (
                  <button key={i} onClick={() => { setPage(i + 1); loadAgreements(i + 1); }}
                    style={{ background: page === i + 1 ? "#0B3D2E" : "white", color: page === i + 1 ? "white" : "#333", border: "1px solid #DDD", borderRadius: 4, padding: "6px 12px", cursor: "pointer" }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selected && (
            <div style={{ width: 380, flexShrink: 0, border: "1px solid #DDD", borderRadius: 8, overflow: "hidden", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ background: "#0B3D2E", padding: "14px 18px" }}>
                <div style={{ color: "#C9A23F", fontSize: 11, letterSpacing: 1 }}>AGREEMENT DETAIL</div>
                <div style={{ color: "white", fontWeight: 600, fontSize: 15, marginTop: 2 }}>{selected.agreementNumber}</div>
              </div>
              <div style={{ padding: "16px 18px" }}>
                {/* Key info */}
                {[
                  ["Booking", selected.bookingNumber],
                  ["Customer", selected.customerName],
                  ["Mobile", selected.customerMobile],
                  ["Package", selected.packageName],
                  ["Status", STATUS_LABELS[selected.status] || selected.status],
                  ["Signed At", selected.signedAt ? new Date(selected.signedAt).toLocaleString("en-IN") : "Not signed"],
                  ["OTP Verified", selected.otpVerified ? "✅ Yes" : "❌ No"],
                  ["Total Amount", `₹${Number(selected.finalAmount || 0).toLocaleString("en-IN")}`],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F5F5F5", fontSize: 13 }}>
                    <span style={{ color: "#666" }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: "right", maxWidth: 200 }}>{v}</span>
                  </div>
                ))}

                {/* Signature preview */}
                {selected.signatureData && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Customer Signature:</div>
                    <img src={selected.signatureData} alt="Signature" style={{ border: "1px solid #DDD", borderRadius: 4, maxWidth: "100%", background: "#FAFFFE" }} />
                  </div>
                )}

                {/* Verification URL */}
                {selected.verificationUrl && (
                  <div style={{ marginTop: 12 }}>
                    <a href={selected.verificationUrl} target="_blank" rel="noreferrer"
                      style={{ color: "#0B3D2E", fontSize: 12, textDecoration: "underline" }}>
                      🔍 Verify Agreement (QR Link)
                    </a>
                  </div>
                )}

                {/* Actions */}
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={() => downloadPdf(selected.id, selected.agreementNumber)}
                    style={{ background: "#0B3D2E", color: "white", border: "none", borderRadius: 6, padding: "9px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                    ⬇ Download PDF
                  </button>
                  <button onClick={() => doAction("resend_email", selected.id)} disabled={actionLoading?.includes(selected.id)}
                    style={{ background: "#1565C0", color: "white", border: "none", borderRadius: 6, padding: "9px", fontSize: 13, cursor: "pointer" }}>
                    ✉ Resend Email
                  </button>
                  <button onClick={() => doAction("resend_whatsapp", selected.id)} disabled={actionLoading?.includes(selected.id)}
                    style={{ background: "#25D366", color: "white", border: "none", borderRadius: 6, padding: "9px", fontSize: 13, cursor: "pointer" }}>
                    📱 Resend WhatsApp
                  </button>
                  {selected.status !== "cancelled" && (
                    <button onClick={() => setCancelModal({ id: selected.id })}
                      style={{ background: "#CC0000", color: "white", border: "none", borderRadius: 6, padding: "9px", fontSize: 13, cursor: "pointer" }}>
                      ✕ Cancel Agreement
                    </button>
                  )}
                  {selected.status === "cancelled" && (
                    <button onClick={() => doAction("regenerate", selected.id)}
                      style={{ background: "#C9A23F", color: "white", border: "none", borderRadius: 6, padding: "9px", fontSize: 13, cursor: "pointer" }}>
                      ↻ Regenerate Agreement
                    </button>
                  )}
                </div>

                {/* Audit Trail */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontWeight: 600, color: "#0B3D2E", fontSize: 13, marginBottom: 10 }}>📋 Audit Trail</div>
                  {auditLoading ? (
                    <div style={{ color: "#888", fontSize: 13 }}>Loading logs...</div>
                  ) : auditLogs.length === 0 ? (
                    <div style={{ color: "#888", fontSize: 13 }}>No audit logs</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {auditLogs.map(log => (
                        <div key={log.id} style={{ background: "#F5F5F5", borderRadius: 6, padding: "8px 10px", fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: "#333" }}>{log.action.replace(/_/g, " ").toUpperCase()}</div>
                          <div style={{ color: "#888", marginTop: 2 }}>{new Date(log.createdAt).toLocaleString("en-IN")}</div>
                          {log.ipAddress && <div style={{ color: "#888" }}>IP: {log.ipAddress}</div>}
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

      {/* Cancel Modal */}
      {cancelModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "white", borderRadius: 10, padding: 28, width: 400 }}>
            <h3 style={{ color: "#CC0000", marginBottom: 16 }}>Cancel Agreement</h3>
            <p style={{ color: "#555", fontSize: 14, marginBottom: 16 }}>Please provide a reason for cancellation:</p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation..."
              rows={3}
              style={{ width: "100%", border: "1px solid #DDD", borderRadius: 6, padding: "8px", fontSize: 14, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button onClick={() => { setCancelModal(null); setCancelReason(""); }}
                style={{ flex: 1, background: "#F5F5F5", color: "#555", border: "1px solid #DDD", borderRadius: 6, padding: "9px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => doAction("cancel", cancelModal.id, { reason: cancelReason })}
                style={{ flex: 1, background: "#CC0000", color: "white", border: "none", borderRadius: 6, padding: "9px", cursor: "pointer", fontWeight: 600 }}>
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
