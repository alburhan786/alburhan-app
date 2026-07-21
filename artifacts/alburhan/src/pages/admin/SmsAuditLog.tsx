import { useState, useEffect, useCallback } from "react";
import { MessageSquare, CheckCircle, XCircle, Clock, RefreshCw, Download, Shield } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function useApi<T>(url: string, deps: unknown[] = []) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}${url}`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch {}
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => { load(); }, [load, ...deps]);
  return { data, loading, reload: load };
}

interface SmsLog {
  id: string;
  date_time: string;
  booking_id: string;
  booking_number: string;
  customer_name: string;
  mobile_number: string;
  sender_id: string;
  route: string;
  dlt_template_id: string;
  event_type: string;
  delivery_status: "sent" | "failed";
  failure_reason: string | null;
  http_status: number | null;
  retry_count: number | null;
  provider: string;
}

interface AuditData {
  generated_at: string;
  policy: { required_sender_id: string; required_route: string; fallback_allowed: boolean };
  summary: { status: string; event_type: string; count: number; last_sent: string }[];
  total: number;
  logs: SmsLog[];
}

const EVENT_LABELS: Record<string, string> = {
  booking_created:    "Booking Received",
  booking_confirmed:  "Booking Approved",
  booking_rejected:   "Booking Rejected",
  payment_received:   "Payment Received",
  partial_payment:    "Partial Payment",
  pending_payment:    "Payment Reminder",
  invoice_created:    "Invoice Ready",
  ticket_issued:      "Flight Ticket Issued",
  visa_ready:         "Visa Ready",
  hotel_voucher:      "Hotel Voucher Ready",
  departure_reminder: "Departure Reminder",
  arrival_reminder:   "Arrival Reminder",
};

export default function SmsAuditLog() {
  const [status, setStatus]   = useState("");
  const [from, setFrom]       = useState("");
  const [to, setTo]           = useState("");
  const [page, setPage]       = useState(0);
  const limit = 100;

  const qs = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
  if (status) qs.set("status", status);
  if (from)   qs.set("from", from);
  if (to)     qs.set("to", to);

  const { data, loading, reload } = useApi<AuditData>(`/api/admin/sms-audit?${qs}`, [qs.toString()]);

  const totalSent   = data?.summary.filter(s => s.status === "sent").reduce((a, b) => a + b.count, 0) ?? 0;
  const totalFailed = data?.summary.filter(s => s.status === "failed").reduce((a, b) => a + b.count, 0) ?? 0;
  const deliveryRate = totalSent + totalFailed > 0
    ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
    : 0;

  function exportCsv() {
    if (!data?.logs.length) return;
    const headers = ["Date/Time","Booking","Customer","Mobile","Sender ID","Route","Template ID","Event","Status","Failure Reason"];
    const rows = data.logs.map(l => [
      new Date(l.date_time).toLocaleString("en-IN"),
      l.booking_number || l.booking_id || "",
      l.customer_name || "",
      l.mobile_number || "",
      l.sender_id || "ABURHA",
      l.route || "DLT",
      l.dlt_template_id || "",
      EVENT_LABELS[l.event_type] || l.event_type || "",
      l.delivery_status,
      l.failure_reason || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sms-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>SMS Audit Log</h1>
          <p style={{ color: "#666", margin: "4px 0 0", fontSize: 14 }}>
            All SMS messages sent — sender, route, template ID and delivery status
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={reload}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={exportCsv}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Policy badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 16px", marginBottom: 20, fontSize: 13 }}>
        <Shield size={16} color="#16a34a" />
        <span style={{ color: "#15803d", fontWeight: 600 }}>Production SMS Policy:</span>
        <span style={{ color: "#166534" }}>
          Sender ID = <strong>ABURHA</strong> &nbsp;·&nbsp; Route = <strong>DLT Only</strong> &nbsp;·&nbsp; No fallback allowed
        </span>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Sent",     value: totalSent,     icon: <CheckCircle size={20} color="#16a34a" />, color: "#16a34a" },
          { label: "Failed",         value: totalFailed,   icon: <XCircle size={20} color="#dc2626" />,    color: "#dc2626" },
          { label: "Delivery Rate",  value: `${deliveryRate}%`, icon: <MessageSquare size={20} color="#2563eb" />, color: "#2563eb" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{c.label}</span>
              {c.icon}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}

        {/* Per-event summary */}
        {(data?.summary ?? []).filter(s => s.status === "sent").map(s => (
          <div key={s.event_type} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{EVENT_LABELS[s.event_type] || s.event_type}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{s.count}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>sent</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(0); }}
          style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
        >
          <option value="">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <input
          type="date" value={from}
          onChange={e => { setFrom(e.target.value); setPage(0); }}
          style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
          placeholder="From"
        />
        <input
          type="date" value={to}
          onChange={e => { setTo(e.target.value); setPage(0); }}
          style={{ padding: "7px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }}
          placeholder="To"
        />
        {(status || from || to) && (
          <button
            onClick={() => { setStatus(""); setFrom(""); setTo(""); setPage(0); }}
            style={{ padding: "7px 14px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13, color: "#666" }}
          >
            Clear
          </button>
        )}
        <span style={{ alignSelf: "center", color: "#6b7280", fontSize: 13 }}>
          {loading ? "Loading…" : `${data?.total ?? 0} records`}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {["Date & Time","Booking","Customer","Mobile","Sender ID","Route","Template ID","Event","Status","Failure Reason"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
                <Clock size={20} style={{ marginRight: 8 }} />Loading audit log…
              </td></tr>
            )}
            {!loading && !data?.logs.length && (
              <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>No SMS log entries found.</td></tr>
            )}
            {(data?.logs ?? []).map((log, i) => (
              <tr key={log.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "8px 14px", whiteSpace: "nowrap", color: "#374151" }}>
                  {new Date(log.date_time).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td style={{ padding: "8px 14px", fontFamily: "monospace", color: "#374151" }}>
                  {log.booking_number || log.booking_id?.slice(0, 8) || "—"}
                </td>
                <td style={{ padding: "8px 14px", color: "#374151" }}>{log.customer_name || "—"}</td>
                <td style={{ padding: "8px 14px", fontFamily: "monospace", color: "#374151" }}>{log.mobile_number || "—"}</td>
                <td style={{ padding: "8px 14px" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: log.sender_id === "ABURHA" ? "#f0fdf4" : "#fef2f2",
                    color: log.sender_id === "ABURHA" ? "#15803d" : "#dc2626",
                    padding: "2px 8px", borderRadius: 4, fontWeight: 600, fontSize: 12,
                  }}>
                    {log.sender_id === "ABURHA" ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {log.sender_id || "ABURHA"}
                  </span>
                </td>
                <td style={{ padding: "8px 14px" }}>
                  <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 4, fontWeight: 600, fontSize: 12 }}>
                    {log.route || "DLT"}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: log.dlt_template_id && log.dlt_template_id !== "not_configured" ? "#374151" : "#ef4444" }}>
                  {log.dlt_template_id || "not configured"}
                </td>
                <td style={{ padding: "8px 14px", color: "#374151" }}>
                  {EVENT_LABELS[log.event_type] || log.event_type || "—"}
                </td>
                <td style={{ padding: "8px 14px" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: log.delivery_status === "sent" ? "#f0fdf4" : "#fef2f2",
                    color: log.delivery_status === "sent" ? "#15803d" : "#dc2626",
                    padding: "3px 10px", borderRadius: 12, fontWeight: 600, fontSize: 12,
                  }}>
                    {log.delivery_status === "sent" ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {log.delivery_status === "sent" ? "Sent" : "Failed"}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", color: "#ef4444", fontSize: 12, maxWidth: 220 }}>
                  {log.failure_reason || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(data?.total ?? 0) > limit && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={{ padding: "6px 16px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", cursor: page === 0 ? "not-allowed" : "pointer", color: page === 0 ? "#9ca3af" : "#374151" }}
          >
            Previous
          </button>
          <span style={{ alignSelf: "center", color: "#6b7280", fontSize: 13 }}>
            Page {page + 1} of {Math.ceil((data?.total ?? 0) / limit)}
          </span>
          <button
            disabled={(page + 1) * limit >= (data?.total ?? 0)}
            onClick={() => setPage(p => p + 1)}
            style={{ padding: "6px 16px", border: "1px solid #ddd", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
