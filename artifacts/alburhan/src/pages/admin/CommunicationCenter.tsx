import React, { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "";
function apiUrl(path: string) { return `${API}${path}`; }

const TABS = [
  { id: "dashboard", label: "📊 Dashboard" },
  { id: "test-center", label: "🔬 Test API" },
  { id: "queue", label: "📋 Delivery Logs" },
  { id: "failed", label: "❌ Failed" },
  { id: "campaigns", label: "📢 Campaigns" },
  { id: "scheduled", label: "🕐 Scheduled" },
  { id: "automation", label: "⚙️ Automation" },
  { id: "templates", label: "📝 Templates" },
  { id: "whatsapp", label: "💬 WhatsApp" },
  { id: "sms", label: "📱 SMS" },
  { id: "rcs", label: "🔵 RCS" },
  { id: "email", label: "📧 Email" },
  { id: "push", label: "🔔 Push" },
];

const CH_COLORS: Record<string, string> = {
  whatsapp: "#25D366", sms: "#f59e0b", rcs: "#3b82f6", email: "#8b5cf6", push: "#ef4444",
};

const EVENT_GROUPS: Record<string, string[]> = {
  "Bookings": ["new_booking","booking_approved","booking_cancelled","booking_rejected","booking_completed"],
  "Payments": ["payment_received","partial_payment","payment_due","payment_failed","balance_reminder","refund"],
  "Invoices": ["invoice_generated","receipt_generated","invoice_paid","invoice_cancelled"],
  "Pilgrims & Documents": ["passport_uploaded","passport_expiry","visa_approved","visa_rejected","visa_ready"],
  "Flights": ["ticket_issued","flight_assigned","flight_changed","flight_cancelled"],
  "Hotels": ["hotel_assigned","room_assigned","room_changed"],
  "Transport": ["bus_assigned","seat_changed"],
  "Travel": ["departure_reminder","arrival_reminder","return_reminder"],
  "Attendance & Safety": ["airport_checkin","missing_pilgrim","medical_emergency"],
  "General": ["feedback_request"],
};

const EVENT_LABELS: Record<string, string> = {
  new_booking:"New Booking", booking_approved:"Booking Approved", booking_cancelled:"Booking Cancelled",
  booking_rejected:"Booking Rejected", booking_completed:"Booking Completed",
  payment_received:"Payment Received", partial_payment:"Partial Payment",
  payment_due:"Payment Due", payment_failed:"Payment Failed",
  balance_reminder:"Balance Reminder", refund:"Refund Processed",
  invoice_generated:"Invoice Generated",
  receipt_generated:"Receipt Generated", invoice_paid:"Invoice Paid", invoice_cancelled:"Invoice Cancelled",
  passport_uploaded:"Passport Uploaded", passport_expiry:"Passport Expiry",
  visa_approved:"Visa Approved", visa_rejected:"Visa Rejected", visa_ready:"Visa Issued",
  ticket_issued:"Ticket Issued",
  flight_assigned:"Flight Assigned", flight_changed:"Flight Changed", flight_cancelled:"Flight Cancelled",
  hotel_assigned:"Hotel Confirmation", room_assigned:"Room Allocation", room_changed:"Room Changed",
  bus_assigned:"Bus Assigned", seat_changed:"Seat Changed",
  departure_reminder:"Departure Reminder", arrival_reminder:"Arrival Welcome", return_reminder:"Return Reminder",
  airport_checkin:"Airport Check-In", missing_pilgrim:"Missing Pilgrim", medical_emergency:"Medical Emergency",
  feedback_request:"Feedback Request",
};

const ALL_EVENTS = Object.values(EVENT_GROUPS).flat();
const CHANNELS = ["whatsapp","sms","rcs","email","push"];

function useApi<T>(url: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl(url));
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { load(); }, deps);
  return { data, loading, error, reload: load };
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "sent" ? "#22c55e" : status === "failed" ? "#ef4444" : status === "pending" ? "#f59e0b" : status === "sending" ? "#3b82f6" : "#6b7280";
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
      {status}
    </span>
  );
}

// ── Provider Status Cards ──────────────────────────────────────────────────────
const PROVIDER_META: Record<string, { label: string; icon: string; channel: string }> = {
  botbee:   { label: "WhatsApp (BotBee)",  icon: "💬", channel: "whatsapp" },
  fast2sms: { label: "SMS (Fast2SMS)",      icon: "📱", channel: "sms" },
  lemin:    { label: "RCS (Lemin AI)",      icon: "🔵", channel: "rcs" },
  smtp:     { label: "Email (SMTP)",        icon: "📧", channel: "email" },
  firebase: { label: "Push (Firebase)",     icon: "🔔", channel: "push" },
  razorpay: { label: "Razorpay Payments",   icon: "💳", channel: "" },
};

function ProviderStatusRow() {
  const [providers, setProviders] = useState<any[]>([]);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/api-settings"), { credentials: "include" });
      if (res.ok) setProviders(await res.json());
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const runTest = async (provider: string) => {
    setTesting(provider);
    try {
      const res = await fetch(apiUrl(`/api/api-settings/${provider}/test`), { method: "POST", credentials: "include" });
      const d = await res.json();
      setProviders(prev => prev.map(p => p.provider === provider ? { ...p, status: d.ok ? "connected" : "failed", last_tested: new Date().toISOString(), _testMsg: d.message } : p));
    } catch { setProviders(prev => prev.map(p => p.provider === provider ? { ...p, status: "failed" } : p)); }
    setTesting(null);
  };

  const STATUS_COLOR: Record<string, string> = { connected: "#22c55e", failed: "#ef4444", unknown: "#9ca3af" };

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontWeight: 700, color: "#111827", margin: 0 }}>🔌 Provider Connectivity</h3>
        <button onClick={load} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "#374151" }}>↻ Refresh</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        {Object.entries(PROVIDER_META).map(([id, meta]) => {
          const p = providers.find(x => x.provider === id);
          const status: string = p?.status || "unknown";
          const color = STATUS_COLOR[status] || "#9ca3af";
          const lastTested = p?.last_tested ? new Date(p.last_tested).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : null;
          return (
            <div key={id} style={{ background: "#fff", border: `1px solid ${color}44`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 1px 3px #0001" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 20 }}>{meta.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#374151", marginTop: 2 }}>{meta.label}</div>
                </div>
                <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 12, padding: "2px 10px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {status === "connected" ? "✅ Connected" : status === "failed" ? "❌ Failed" : "— Unknown"}
                </span>
              </div>
              {lastTested && <div style={{ fontSize: 10, color: "#9ca3af" }}>Tested: {lastTested}</div>}
              <button onClick={() => runTest(id)} disabled={testing === id}
                style={{ background: testing === id ? "#f3f4f6" : "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 0", cursor: "pointer", fontSize: 11, color: "#374151", fontWeight: 600 }}>
                {testing === id ? "Testing…" : "Test Now"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const { data, loading, reload } = useApi<any>("/api/notification-center/stats");
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading stats…</div>;
  if (!data) return null;
  const cards = [
    { label: "Today Sent", val: data.sent, color: "#3b82f6", icon: "📤" },
    { label: "Delivered", val: data.delivered, color: "#22c55e", icon: "✅" },
    { label: "Failed", val: data.failed, color: "#ef4444", icon: "❌" },
    { label: "Pending", val: data.pending, color: "#f59e0b", icon: "⏳" },
    { label: "Delivery Rate", val: `${data.deliveryRate}%`, color: "#8b5cf6", icon: "📊" },
    { label: "Campaigns", val: data.campaignCount ?? 0, color: "#06b6d4", icon: "📢" },
  ];
  return (
    <div>
      <ProviderStatusRow />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16, marginBottom: 28 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 18px", boxShadow: "0 1px 4px #0001" }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{c.icon}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: c.color }}>{c.val}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <h3 style={{ fontWeight: 700, marginBottom: 12, color: "#111827" }}>Channel Health — Today</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 20 }}>
        {CHANNELS.map(ch => {
          const s = data.channelStats?.[ch] || {};
          const total = (s.sent || 0) + (s.failed || 0);
          const rate = total > 0 ? Math.round((s.sent || 0) / total * 100) : 0;
          return (
            <div key={ch} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: CH_COLORS[ch], fontSize: 12, textTransform: "uppercase" }}>{ch}</span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{total} msgs</span>
              </div>
              <div style={{ background: "#f3f4f6", borderRadius: 6, height: 8, marginBottom: 8 }}>
                <div style={{ background: CH_COLORS[ch], height: 8, borderRadius: 6, width: `${rate}%`, transition: "width .5s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}>
                <span>✅ {s.sent || 0}</span>
                <span>❌ {s.failed || 0}</span>
                <strong style={{ color: rate >= 80 ? "#22c55e" : "#ef4444" }}>{rate}%</strong>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "right" }}>
        <button onClick={reload} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontSize: 13 }}>🔄 Refresh</button>
      </div>
    </div>
  );
}

// ── Error Detail Panel ────────────────────────────────────────────────────────
function ErrorDetailPanel({ log, onClose }: { log: any; onClose: () => void }) {
  const pr = log.provider_response || {};
  const provider = log.provider_name || pr.provider || "—";
  const httpStatus = log.http_status || pr.httpStatus;
  const endpoint = log.api_endpoint || pr.endpoint || "—";
  const errorCode = log.error_code || pr.errorCode || "—";
  const errorMessage = pr.errorMessage || pr.error || "—";
  const reqPayload = log.request_payload || pr.requestPayload;
  const respPayload = pr.responsePayload;

  const field = (label: string, value: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "4px 12px", marginBottom: 6, fontSize: 12 }}>
      <span style={{ color: "#6b7280", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "#111827", wordBreak: "break-all" }}>{value}</span>
    </div>
  );

  const statusColor = httpStatus && httpStatus < 300 ? "#166534" : httpStatus && httpStatus < 500 ? "#92400e" : "#991b1b";
  const statusBg = httpStatus && httpStatus < 300 ? "#dcfce7" : httpStatus && httpStatus < 500 ? "#fef3c7" : "#fef2f2";

  return (
    <tr>
      <td colSpan={9} style={{ padding: 0, background: "#fafafa", borderBottom: "2px solid #e5e7eb" }}>
        <div style={{ padding: "16px 20px", borderLeft: "4px solid #ef4444" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#111827" }}>{provider}</span>
              {httpStatus && (
                <span style={{ background: statusBg, color: statusColor, border: `1px solid ${statusColor}33`, borderRadius: 6, padding: "2px 10px", fontWeight: 700, fontSize: 12 }}>
                  HTTP {httpStatus}
                </span>
              )}
              {errorCode && errorCode !== "—" && (
                <span style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 6, padding: "2px 10px", fontWeight: 600, fontSize: 12 }}>
                  Code: {errorCode}
                </span>
              )}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: 2 }}>✕</button>
          </div>

          {errorMessage !== "—" && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#991b1b", fontWeight: 600 }}>
              ❌ {errorMessage}
            </div>
          )}

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
            {field("Provider", <strong>{provider}</strong>)}
            {field("API Endpoint", <code style={{ background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{endpoint}</code>)}
            {field("HTTP Status", httpStatus ? <span style={{ color: statusColor, fontWeight: 700 }}>HTTP {httpStatus}</span> : "—")}
            {field("Error Code", errorCode)}
            {field("Error Message", errorMessage)}
            {field("Retry Count", `${log.retry_count || 0} / 3`)}
            {field("Timestamp", new Date(log.created_at).toLocaleString("en-IN"))}
            {log.booking_id && field("Booking ID", log.booking_id)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".04em" }}>Request Payload</div>
              <pre style={{ background: "#1e293b", color: "#e2e8f0", borderRadius: 8, padding: "12px 14px", fontSize: 11, margin: 0, overflow: "auto", maxHeight: 220, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {reqPayload ? JSON.stringify(reqPayload, null, 2) : "—"}
              </pre>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".04em" }}>Response Payload</div>
              <pre style={{ background: "#1e293b", color: "#e2e8f0", borderRadius: 8, padding: "12px 14px", fontSize: 11, margin: 0, overflow: "auto", maxHeight: 220, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {respPayload ? JSON.stringify(respPayload, null, 2) : pr ? JSON.stringify(pr, null, 2) : "—"}
              </pre>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Delivery Logs ─────────────────────────────────────────────────────────────
function DeliveryLogs({ filterStatus }: { filterStatus?: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(filterStatus || "");
  const [channel, setChannel] = useState("");
  const [eventType, setEventType] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const LIMIT = 30;

  const qs = new URLSearchParams({
    limit: String(LIMIT), offset: String(page * LIMIT),
    ...(status && { status }), ...(channel && { channel }),
    ...(eventType && { event_type: eventType }), ...(search && { search }),
  }).toString();

  const { data, loading, reload } = useApi<any>(`/api/notification-center/logs?${qs}`, [qs]);
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (id: string) => {
    setRetrying(id);
    await fetch(apiUrl(`/api/notification-center/retry/${id}`), { method: "POST" });
    setRetrying(null); reload();
  };
  const retryAll = async () => {
    if (!confirm("Retry all failed messages (max 3 retries each)?")) return;
    await fetch(apiUrl("/api/notification-center/retry-all-failed"), { method: "POST" });
    reload();
  };
  const toggleExpand = (id: string) => setExpanded(prev => prev === id ? null : id);
  const exportCsv = () => {
    const exportQs = new URLSearchParams({
      ...(status && { status }), ...(channel && { channel }), ...(search && { customer: search }),
    }).toString();
    window.open(apiUrl(`/api/communication/logs/export?${exportQs}`), "_blank");
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search recipient / message…"
          style={{ flex: 1, minWidth: 160, border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 }} />
        {!filterStatus && (
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}>
            <option value="">All Status</option>
            {["sent","failed","pending"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={channel} onChange={e => { setChannel(e.target.value); setPage(0); }}
          style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}>
          <option value="">All Channels</option>
          {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={eventType} onChange={e => { setEventType(e.target.value); setPage(0); }}
          style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}>
          <option value="">All Events</option>
          {ALL_EVENTS.map(e => <option key={e} value={e}>{EVENT_LABELS[e] || e}</option>)}
        </select>
        {filterStatus === "failed" && (
          <button onClick={retryAll} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ⟳ Retry All
          </button>
        )}
        <button onClick={reload} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, padding: "7px 12px", cursor: "pointer" }}>🔄</button>
        <button onClick={exportCsv} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          ⬇ Export CSV
        </button>
      </div>

      {loading ? <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading…</div> : (
        <>
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#fff" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Time","Recipient","Channel","Provider","Event","Status","Retries","Action"].map(h => (
                    <th key={h} style={{ padding: "9px 10px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                  <th style={{ padding: "9px 10px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}></th>
                </tr>
              </thead>
              <tbody>
                {(data?.logs || []).length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>No logs found</td></tr>
                )}
                {(data?.logs || []).map((log: any) => {
                  const pr = log.provider_response || {};
                  const providerName = log.provider_name || pr.provider || "—";
                  const httpStatus = log.http_status || pr.httpStatus;
                  const isExpanded = expanded === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #f3f4f6", background: isExpanded ? "#fef9f9" : undefined }}>
                        <td style={{ padding: "8px 10px", color: "#6b7280", whiteSpace: "nowrap" }}>
                          {new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td style={{ padding: "8px 10px" }}>{log.recipient}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ background: CH_COLORS[log.channel] + "22", color: CH_COLORS[log.channel], borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700 }}>{log.channel}</span>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>{providerName}</span>
                          {httpStatus && (
                            <span style={{ marginLeft: 4, fontSize: 10, color: httpStatus < 300 ? "#166534" : "#991b1b", background: httpStatus < 300 ? "#dcfce7" : "#fef2f2", borderRadius: 3, padding: "1px 5px" }}>
                              {httpStatus}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{EVENT_LABELS[log.event_type] || log.event_type}</td>
                        <td style={{ padding: "8px 10px" }}><StatusBadge status={log.status} /></td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>{log.retry_count || 0}<span style={{ color: "#9ca3af" }}>/3</span></td>
                        <td style={{ padding: "8px 10px" }}>
                          {log.status === "failed" && (log.retry_count || 0) < 3 && (
                            <button onClick={() => retry(log.id)} disabled={retrying === log.id}
                              style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 4, padding: "3px 9px", cursor: "pointer", fontSize: 11, marginRight: 4 }}>
                              {retrying === log.id ? "…" : "⟳ Retry"}
                            </button>
                          )}
                          {(log.retry_count || 0) >= 3 && log.status === "failed" && (
                            <span style={{ fontSize: 10, color: "#ef4444", marginRight: 4 }}>Max retries</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {log.status === "failed" && (
                            <button onClick={() => toggleExpand(log.id)}
                              style={{ background: isExpanded ? "#fef2f2" : "#fff", color: isExpanded ? "#991b1b" : "#374151", border: `1px solid ${isExpanded ? "#fecaca" : "#d1d5db"}`, borderRadius: 4, padding: "3px 9px", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                              {isExpanded ? "✕ Close" : "🔍 View Error"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && <ErrorDetailPanel log={log} onClose={() => setExpanded(null)} />}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 13, color: "#6b7280" }}>
            <span>Total: {data?.total ?? 0} entries</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                style={{ border: "1px solid #d1d5db", borderRadius: 4, padding: "4px 12px", cursor: page === 0 ? "not-allowed" : "pointer", opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
              <span>Page {page + 1}</span>
              <button disabled={(data?.logs?.length || 0) < LIMIT} onClick={() => setPage(p => p + 1)}
                style={{ border: "1px solid #d1d5db", borderRadius: 4, padding: "4px 12px", cursor: "pointer" }}>Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Campaign Manager ──────────────────────────────────────────────────────────
function CampaignManager() {
  const { data: aud } = useApi<any>("/api/notification-center/campaigns/audiences");
  const { data: campData, loading: campLoading, reload: reloadCamps } = useApi<any>("/api/notification-center/campaigns");
  const [form, setForm] = useState({ name: "", audience_type: "all_pilgrims", audience_id: "", channel: "whatsapp", message: "" });
  const [preview, setPreview] = useState<{ count: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  const AUDIENCE_TYPES = [
    { value: "all_pilgrims", label: "All Pilgrims", count: aud?.counts?.all_pilgrims },
    { value: "outstanding_payments", label: "Outstanding Payments", count: aud?.counts?.outstanding_payments },
    { value: "visa_pending", label: "Visa Pending", count: aud?.counts?.visa_pending },
    { value: "group", label: "By Hajj Group" },
    { value: "bus", label: "By Bus" },
  ];

  const needsId = ["group","bus"].includes(form.audience_type);

  const getPreview = async () => {
    setPreviewing(true); setPreview(null);
    try {
      const res = await fetch(apiUrl("/api/notification-center/campaigns/preview"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience_type: form.audience_type, audience_id: form.audience_id }),
      });
      setPreview(await res.json());
    } catch { setPreview(null); }
    setPreviewing(false);
  };

  const send = async () => {
    if (!form.message.trim()) { alert("Message is required"); return; }
    if (needsId && !form.audience_id) { alert("Please select a group or bus"); return; }
    if (!confirm(`Send to ${preview?.count ?? "?"} recipients via ${form.channel.toUpperCase()}?`)) return;
    setSending(true); setResult(null);
    const res = await fetch(apiUrl("/api/notification-center/campaigns"), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const d = await res.json(); setResult(d); setSending(false); reloadCamps();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
      <div>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>📢 New Campaign</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Campaign Name (optional)</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Visa Ready Alert — June 2026"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Audience *</label>
            <select value={form.audience_type} onChange={e => setForm(p => ({ ...p, audience_type: e.target.value, audience_id: "" }))}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
              {AUDIENCE_TYPES.map(a => (
                <option key={a.value} value={a.value}>
                  {a.label}{a.count != null ? ` (${a.count} recipients)` : ""}
                </option>
              ))}
            </select>
          </div>

          {form.audience_type === "group" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Select Group *</label>
              <select value={form.audience_id} onChange={e => setForm(p => ({ ...p, audience_id: e.target.value }))}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
                <option value="">— Select Group —</option>
                {(aud?.groups || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          {form.audience_type === "bus" && (
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Select Bus *</label>
              <select value={form.audience_id} onChange={e => setForm(p => ({ ...p, audience_id: e.target.value }))}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
                <option value="">— Select Bus —</option>
                {(aud?.buses || []).map((b: any) => <option key={b.id} value={b.id}>{b.bus_number}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Channel *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["whatsapp","sms","rcs","email"].map(ch => (
                <button key={ch} onClick={() => setForm(p => ({ ...p, channel: ch }))}
                  style={{ flex: 1, background: form.channel === ch ? CH_COLORS[ch] : "#f3f4f6", color: form.channel === ch ? "#fff" : "#374151", border: "none", borderRadius: 6, padding: "9px 4px", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all .2s" }}>
                  {ch.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Message *</label>
            <textarea rows={6} value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
              placeholder="Type your broadcast message here…&#10;&#10;Use Assalamu Alaikum to greet your pilgrims."
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{form.message.length} characters</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={getPreview} disabled={previewing || (needsId && !form.audience_id)}
              style={{ background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 6, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              {previewing ? "…" : "👁 Preview Count"}
            </button>
            {preview && (
              <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 8, padding: "9px 16px", color: "#166534", fontWeight: 700, fontSize: 15 }}>
                👤 {preview.count} recipients
              </div>
            )}
          </div>

          {result && (
            <div style={{ background: result.campaignId ? "#ecfdf5" : "#fef2f2", border: `1px solid ${result.campaignId ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, padding: 12, fontSize: 13, color: result.campaignId ? "#166534" : "#991b1b" }}>
              {result.message || result.error}
            </div>
          )}

          <button onClick={send} disabled={sending || !form.message.trim() || (needsId && !form.audience_id)}
            style={{ background: sending ? "#9ca3af" : "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: 12, cursor: "pointer", fontWeight: 800, fontSize: 15, transition: "background .2s" }}>
            {sending ? "⏳ Sending Campaign…" : "📤 Send Campaign"}
          </button>
        </div>
      </div>

      <div>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>📋 Campaign History</h3>
        {campLoading ? (
          <div style={{ color: "#9ca3af", textAlign: "center", padding: 32 }}>Loading…</div>
        ) : (campData?.campaigns || []).length === 0 ? (
          <div style={{ color: "#9ca3af", textAlign: "center", padding: 40, background: "#f8fafc", borderRadius: 10 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📢</div>
            No campaigns sent yet
          </div>
        ) : (campData?.campaigns || []).map((c: any) => (
          <div key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 10, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <strong style={{ fontSize: 13 }}>{c.name}</strong>
              <StatusBadge status={c.status} />
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
              {new Date(c.created_at).toLocaleString("en-IN")} · {c.audience_type.replace(/_/g," ")} ·{" "}
              <span style={{ color: CH_COLORS[c.channel], fontWeight: 700 }}>{c.channel.toUpperCase()}</span>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 12, marginBottom: 6 }}>
              <span>📊 Total: <strong>{c.total_count}</strong></span>
              <span style={{ color: "#22c55e" }}>✅ {c.sent_count}</span>
              <span style={{ color: "#ef4444" }}>❌ {c.failed_count}</span>
              {c.total_count > 0 && <span style={{ color: "#8b5cf6" }}>📈 {Math.round(c.sent_count / c.total_count * 100)}%</span>}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "#f8fafc", padding: "4px 8px", borderRadius: 4 }}>
              {c.message}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Automation Rules ──────────────────────────────────────────────────────────
function AutomationRules() {
  const { data, loading, reload } = useApi<any>("/api/notification-center/settings");
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      const m: Record<string, boolean> = {};
      for (const s of data.settings) m[`${s.event_type}_${s.channel}`] = s.enabled;
      setLocal(m);
    }
  }, [data]);

  const toggle = (event: string, ch: string) => setLocal(prev => ({ ...prev, [`${event}_${ch}`]: !prev[`${event}_${ch}`] }));

  const save = async () => {
    setSaving(true);
    const settings = ALL_EVENTS.flatMap(event => CHANNELS.map(ch => ({ event_type: event, channel: ch, enabled: local[`${event}_${ch}`] ?? false })));
    await fetch(apiUrl("/api/notification-center/settings"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); reload();
  };

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>Enable which channels fire for each event. Changes apply immediately on save.</p>
        <button onClick={save} disabled={saving}
          style={{ background: saved ? "#22c55e" : "#3b82f6", color: "#fff", border: "none", borderRadius: 6, padding: "9px 22px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          {saving ? "Saving…" : saved ? "✅ Saved!" : "💾 Save Rules"}
        </button>
      </div>
      {Object.entries(EVENT_GROUPS).map(([group, events]) => (
        <div key={group} style={{ marginBottom: 24 }}>
          <h4 style={{ fontWeight: 700, color: "#374151", padding: "6px 0", borderBottom: "2px solid #e5e7eb", marginBottom: 0, fontSize: 13 }}>{group}</h4>
          <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "7px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>Event</th>
                  {CHANNELS.map(ch => (
                    <th key={ch} style={{ padding: "7px 12px", textAlign: "center", fontWeight: 700, color: CH_COLORS[ch], borderBottom: "1px solid #e5e7eb" }}>{ch.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "7px 12px", color: "#374151" }}>{EVENT_LABELS[ev] || ev}</td>
                    {CHANNELS.map(ch => {
                      const on = local[`${ev}_${ch}`] ?? false;
                      return (
                        <td key={ch} style={{ padding: "7px 12px", textAlign: "center" }}>
                          <button onClick={() => toggle(ev, ch)}
                            style={{ background: on ? CH_COLORS[ch] : "#e5e7eb", color: on ? "#fff" : "#9ca3af", border: "none", borderRadius: 12, padding: "3px 14px", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all .2s" }}>
                            {on ? "ON" : "OFF"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Templates ─────────────────────────────────────────────────────────────────
function Templates() {
  const { data, loading, reload } = useApi<any>("/api/notification-center/templates");
  const blank = { name: "", event_type: "", channel: "whatsapp", subject: "", body: "" };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const VARS = ["{{customer_name}}","{{booking_id}}","{{amount}}","{{balance}}","{{hotel}}","{{flight}}","{{room}}","{{bus}}","{{package_name}}","{{departure_date}}","{{visa_number}}"];

  const save = async () => {
    if (!form.name || !form.body) { alert("Name and body are required"); return; }
    setSaving(true);
    const url = editing ? `/api/notification-center/templates/${editing.id}` : "/api/notification-center/templates";
    await fetch(apiUrl(url), { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setEditing(null); setForm(blank); reload();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await fetch(apiUrl(`/api/notification-center/templates/${id}`), { method: "DELETE" }); reload();
  };

  const startEdit = (t: any) => { setEditing(t); setForm({ name: t.name, event_type: t.event_type || "", channel: t.channel, subject: t.subject || "", body: t.body }); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 24 }}>
      <div>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{editing ? "✏️ Edit Template" : "➕ New Template"}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input placeholder="Template name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={form.event_type} onChange={e => setForm(p => ({ ...p, event_type: e.target.value }))}
              style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
              <option value="">All Events</option>
              {ALL_EVENTS.map(ev => <option key={ev} value={ev}>{EVENT_LABELS[ev] || ev}</option>)}
            </select>
            <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}
              style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input placeholder="Email subject (optional)" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }} />
          <textarea rows={7} placeholder="Message body *" value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13, resize: "vertical" }} />
          <div style={{ background: "#f0f4ff", borderRadius: 6, padding: 8, fontSize: 11 }}>
            <strong style={{ color: "#374151" }}>Click to insert:</strong>{" "}
            {VARS.map(v => (
              <code key={v} onClick={() => setForm(p => ({ ...p, body: p.body + v }))}
                style={{ cursor: "pointer", background: "#dbeafe", color: "#1d4ed8", padding: "1px 5px", borderRadius: 3, marginRight: 4, marginBottom: 4, display: "inline-block" }}>{v}</code>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving || !form.name || !form.body}
              style={{ flex: 1, background: editing ? "#f59e0b" : "#3b82f6", color: "#fff", border: "none", borderRadius: 6, padding: "9px", cursor: "pointer", fontWeight: 700 }}>
              {saving ? "Saving…" : editing ? "Update Template" : "Create Template"}
            </button>
            {editing && (
              <button onClick={() => { setEditing(null); setForm(blank); }}
                style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "9px 16px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
            )}
          </div>
        </div>
      </div>
      <div>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>Saved Templates ({data?.templates?.length || 0})</h3>
        {loading ? <div style={{ color: "#9ca3af" }}>Loading…</div> : (data?.templates || []).length === 0 ? (
          <div style={{ color: "#9ca3af", textAlign: "center", padding: 32, background: "#f8fafc", borderRadius: 10 }}>No templates yet</div>
        ) : (data?.templates || []).map((t: any) => (
          <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 8, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <strong style={{ fontSize: 13 }}>{t.name}</strong>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ background: CH_COLORS[t.channel] + "22", color: CH_COLORS[t.channel], borderRadius: 4, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{t.channel}</span>
                <button onClick={() => startEdit(t)} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, padding: "2px 9px", cursor: "pointer", fontSize: 11 }}>Edit</button>
                <button onClick={() => del(t.id)} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 4, padding: "2px 9px", cursor: "pointer", fontSize: 11 }}>Del</button>
              </div>
            </div>
            {t.event_type && <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Event: {EVENT_LABELS[t.event_type] || t.event_type}</div>}
            <div style={{ fontSize: 12, color: "#374151", background: "#f8fafc", padding: "6px 8px", borderRadius: 4, maxHeight: 70, overflow: "hidden" }}>{t.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Scheduled Messages ────────────────────────────────────────────────────────
function ScheduledMessages() {
  const { data, loading, reload } = useApi<any>("/api/notification-center/scheduled");
  const blank = { event_type: "departure_reminder", channel: "whatsapp", recipient: "", customer_name: "", message: "", scheduled_at: "" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);

  const save = async () => {
    if (!form.recipient || !form.message || !form.scheduled_at) { alert("Recipient, message and time are required"); return; }
    setSaving(true);
    await fetch(apiUrl("/api/notification-center/scheduled"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false); setForm(blank); reload();
  };

  const cancel = async (id: string) => {
    if (!confirm("Cancel this scheduled notification?")) return;
    await fetch(apiUrl(`/api/notification-center/scheduled/${id}`), { method: "DELETE" }); reload();
  };

  const processDue = async () => {
    setProcessing(true);
    const r = await fetch(apiUrl("/api/notification-center/process-scheduled"), { method: "POST" });
    const d = await r.json();
    alert(`Processed ${d.processed} due messages. Sent: ${d.sent}`);
    setProcessing(false); reload();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 24 }}>
      <div>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>📅 Schedule Message</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <select value={form.event_type} onChange={e => setForm(p => ({ ...p, event_type: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
            {ALL_EVENTS.map(ev => <option key={ev} value={ev}>{EVENT_LABELS[ev] || ev}</option>)}
          </select>
          <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
            {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Recipient mobile / email *" value={form.recipient} onChange={e => setForm(p => ({ ...p, recipient: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }} />
          <input placeholder="Customer name" value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }} />
          <textarea rows={4} placeholder="Message *" value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13, resize: "vertical" }} />
          <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
            style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13 }} />
          <button onClick={save} disabled={saving}
            style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, padding: "9px", cursor: "pointer", fontWeight: 700 }}>
            {saving ? "Saving…" : "📅 Schedule Message"}
          </button>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>Scheduled ({data?.scheduled?.length || 0})</h3>
          <button onClick={processDue} disabled={processing}
            style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            {processing ? "…" : "⚡ Send Due Now"}
          </button>
        </div>
        {loading ? <div style={{ color: "#9ca3af" }}>Loading…</div> : (data?.scheduled || []).length === 0 ? (
          <div style={{ color: "#9ca3af", textAlign: "center", padding: 32, background: "#f8fafc", borderRadius: 10 }}>No scheduled messages</div>
        ) : (data?.scheduled || []).map((s: any) => (
          <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 8, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{s.customer_name || s.recipient}</span>
              <StatusBadge status={s.status} />
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
              {new Date(s.scheduled_at).toLocaleString("en-IN")} ·{" "}
              <span style={{ color: CH_COLORS[s.channel], fontWeight: 700 }}>{s.channel.toUpperCase()}</span> ·{" "}
              {EVENT_LABELS[s.event_type] || s.event_type}
            </div>
            <div style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#374151" }}>{s.message}</div>
            {s.status === "pending" && (
              <button onClick={() => cancel(s.id)} style={{ marginTop: 6, background: "#ef4444", color: "#fff", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 11 }}>Cancel</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WhatsApp Tab ──────────────────────────────────────────────────────────────
function WhatsAppTab() {
  const [mobile, setMobile] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusData, setStatusData] = useState<any>(null);

  const { data, loading } = useApi<any>(
    `/api/notification-center/logs?channel=whatsapp&limit=20`,
    [refreshKey]
  );

  const logs = data?.logs || [];
  const sent = logs.filter((l: any) => l.status === "sent").length;
  const failed = logs.filter((l: any) => l.status === "failed").length;
  const rate = (sent + failed) > 0 ? Math.round(sent / (sent + failed) * 100) : 0;

  useEffect(() => {
    fetch(apiUrl("/api/whatsapp/status"), { credentials: "include" })
      .then(r => r.json()).then(setStatusData).catch(() => {});
  }, []);

  const sendTest = async () => {
    if (!mobile.trim()) return;
    setSending(true);
    setTestResult(null);
    try {
      const res = await fetch(apiUrl("/api/whatsapp/test"), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: mobile.trim(), message: message.trim() || undefined }),
      });
      const d = await res.json();
      setTestResult(d);
      setRefreshKey(k => k + 1);
    } catch (e: any) {
      setTestResult({ ok: false, errorMessage: e.message });
    }
    setSending(false);
  };

  const configured = statusData?.configured !== false;

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Provider card */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 22, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", boxShadow: "0 1px 3px #0001" }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20, color: "#25D366", margin: "0 0 6px" }}>💬 WhatsApp</h2>
          <p style={{ color: "#374151", fontWeight: 600, margin: "0 0 4px" }}>Provider: BotBee WhatsApp Business API</p>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0, maxWidth: 500 }}>
            Sends messages via BotBee's WhatsApp Business API using BOTBEE_API_KEY + BOTBEE_PHONE_NUMBER_ID.
            Supports text, templates, interactive buttons, and file delivery.
          </p>
          {statusData?.phoneNumberId && (
            <p style={{ color: "#9ca3af", fontSize: 12, margin: "6px 0 0" }}>Phone Number ID: {statusData.phoneNumberId}</p>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 20 }}>
          <span style={{ display: "inline-block", background: configured ? "#dcfce7" : "#fef3c7", color: configured ? "#166534" : "#92400e", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
            {configured ? "✅ Configured" : "⚠️ Needs Setup"}
          </span>
          <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
            <div style={{ textAlign: "center" }}><div style={{ fontWeight: 800, color: "#22c55e", fontSize: 26 }}>{sent}</div><div style={{ color: "#6b7280", fontSize: 11 }}>Sent</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontWeight: 800, color: "#ef4444", fontSize: 26 }}>{failed}</div><div style={{ color: "#6b7280", fontSize: 11 }}>Failed</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontWeight: 800, color: "#25D366", fontSize: 26 }}>{rate}%</div><div style={{ color: "#6b7280", fontSize: 11 }}>Rate</div></div>
          </div>
        </div>
      </div>

      {/* Test Send section */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 22, marginBottom: 20, boxShadow: "0 1px 3px #0001" }}>
        <h3 style={{ fontWeight: 800, fontSize: 15, color: "#111827", margin: "0 0 4px" }}>📲 Send Test WhatsApp</h3>
        <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 18px" }}>
          Send a live test message via BotBee. Every test is logged in Delivery Logs with the full provider response.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>Mobile Number *</label>
            <input
              value={mobile} onChange={e => setMobile(e.target.value)}
              placeholder="91XXXXXXXXXX or 10-digit"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" }}
              onKeyDown={e => e.key === "Enter" && sendTest()}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>Custom Message <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span></label>
            <input
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Leave blank for default test message"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
        </div>
        <button
          onClick={sendTest}
          disabled={sending || !mobile.trim()}
          style={{
            background: sending || !mobile.trim() ? "#d1fae5" : "#25D366",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 28px", cursor: sending || !mobile.trim() ? "not-allowed" : "pointer",
            fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8,
          }}
        >
          {sending ? (
            <><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />Sending…</>
          ) : "💬 Send Test"}
        </button>

        {testResult && (
          <div style={{
            marginTop: 16, borderRadius: 10,
            border: `2px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}`,
            background: testResult.ok ? "#f0fdf4" : "#fef2f2",
            overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}` }}>
              <span style={{ fontSize: 22 }}>{testResult.ok ? "✅" : "❌"}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: testResult.ok ? "#166534" : "#991b1b" }}>
                  {testResult.ok ? "Delivered Successfully" : "Delivery Failed"}
                </div>
                {testResult.httpStatus && (
                  <span style={{ fontSize: 11, background: testResult.httpStatus < 300 ? "#dcfce7" : "#fee2e2", color: testResult.httpStatus < 300 ? "#166534" : "#991b1b", borderRadius: 4, padding: "1px 7px", fontWeight: 700 }}>
                    HTTP {testResult.httpStatus}
                  </span>
                )}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                {testResult.logged && <span style={{ fontSize: 11, background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>📋 Logged</span>}
                <span style={{ fontSize: 12, color: "#6b7280" }}>via {testResult.provider || "BotBee"}</span>
              </div>
            </div>
            {testResult.errorMessage && (
              <div style={{ padding: "10px 18px", background: "#fef2f2", borderBottom: "1px solid #fecaca" }}>
                <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 600 }}>Error: </span>
                <span style={{ fontSize: 12, color: "#991b1b" }}>{testResult.errorMessage}</span>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <div style={{ padding: "12px 18px", borderRight: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Request Payload</div>
                <pre style={{ background: "#1e293b", color: "#e2e8f0", borderRadius: 6, padding: "10px 12px", fontSize: 10, margin: 0, overflow: "auto", maxHeight: 180, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {JSON.stringify(testResult.requestPayload || {}, null, 2)}
                </pre>
              </div>
              <div style={{ padding: "12px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Provider Response</div>
                <pre style={{ background: "#1e293b", color: "#e2e8f0", borderRadius: 6, padding: "10px 12px", fontSize: 10, margin: 0, overflow: "auto", maxHeight: 180, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {JSON.stringify(testResult.responsePayload || testResult, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auto-trigger events info */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontWeight: 700, fontSize: 14, margin: "0 0 12px", color: "#374151" }}>⚡ Auto-Triggered Events</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            ["Booking Submitted","new_booking","#dbeafe","#1d4ed8"],
            ["Booking Approved","booking_approved","#dcfce7","#166534"],
            ["Payment Received","payment_received","#dcfce7","#166534"],
            ["Partial Payment","partial_payment","#fef3c7","#92400e"],
            ["Balance Reminder","balance_reminder","#fef3c7","#92400e"],
            ["Invoice Generated","invoice_generated","#f3f4f6","#374151"],
            ["Ticket Issued","ticket_issued","#ede9fe","#5b21b6"],
            ["Visa Issued","visa_ready","#dcfce7","#166534"],
            ["Hotel Confirmation","hotel_assigned","#dbeafe","#1d4ed8"],
            ["Room Allocation","room_assigned","#dbeafe","#1d4ed8"],
            ["Departure Reminder","departure_reminder","#fef3c7","#92400e"],
            ["Arrival Welcome","arrival_reminder","#dcfce7","#166534"],
            ["Feedback Request","feedback_request","#f3f4f6","#374151"],
            ["Cancellation","booking_cancelled","#fee2e2","#991b1b"],
            ["Refund","refund","#fee2e2","#991b1b"],
          ].map(([label, , bg, color]) => (
            <div key={label} style={{ background: bg, color, borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600 }}>
              💬 {label}
            </div>
          ))}
        </div>
      </div>

      {/* Recent messages */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Recent WhatsApp Messages</h3>
          <button onClick={() => setRefreshKey(k => k + 1)} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, color: "#374151" }}>
            ↺ Refresh
          </button>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading…</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Time","Recipient","Event","Status","Provider"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 32, color: "#9ca3af" }}>No WhatsApp messages yet</td></tr>
              ) : logs.map((log: any) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                    {new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{log.recipient}</td>
                  <td style={{ padding: "8px 12px", color: "#374151" }}>{EVENT_LABELS[log.event_type] || log.event_type}</td>
                  <td style={{ padding: "8px 12px" }}><StatusBadge status={log.status} /></td>
                  <td style={{ padding: "8px 12px", color: "#6b7280", fontSize: 11 }}>
                    {log.provider_name || "BotBee"}
                    {log.http_status && (
                      <span style={{ marginLeft: 4, background: log.http_status < 300 ? "#dcfce7" : "#fef2f2", color: log.http_status < 300 ? "#166534" : "#991b1b", borderRadius: 3, padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>
                        {log.http_status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Channel Info Tab ──────────────────────────────────────────────────────────
function ChannelTab({ channel }: { channel: string }) {
  const INFO: Record<string, { provider: string; configured: boolean; desc: string }> = {
    whatsapp: { provider: "BotBee WhatsApp Business", configured: true, desc: "Sends messages via BotBee's WhatsApp Business API using BOTBEE_API_KEY + BOTBEE_BUSINESS_ID." },
    sms: { provider: "Fast2SMS (DLT)", configured: true, desc: "DLT-compliant SMS via Fast2SMS. Uses FAST2SMS_API_KEY for transactional messages." },
    rcs: { provider: "Lemin RCS", configured: true, desc: "Rich Communication Services. Falls back gracefully if the device doesn't support RCS." },
    email: { provider: "SMTP", configured: false, desc: "Transactional email via SMTP. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in environment secrets." },
    push: { provider: "Firebase FCM", configured: false, desc: "Firebase Cloud Messaging push notifications. Requires FIREBASE_ADMIN_CRED environment secret." },
  };
  const info = INFO[channel] || { provider: channel, configured: false, desc: "" };

  const { data, loading } = useApi<any>(`/api/notification-center/logs?channel=${channel}&limit=30`, [channel]);

  const todaySent = (data?.logs || []).filter((l: any) => l.status === "sent").length;
  const todayFailed = (data?.logs || []).filter((l: any) => l.status === "failed").length;
  const rate = (todaySent + todayFailed) > 0 ? Math.round(todaySent / (todaySent + todayFailed) * 100) : 0;

  return (
    <div>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 22, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 20, color: CH_COLORS[channel], marginBottom: 6 }}>{channel.toUpperCase()}</h2>
            <p style={{ color: "#374151", fontWeight: 600, marginBottom: 4 }}>Provider: {info.provider}</p>
            <p style={{ color: "#6b7280", fontSize: 13, maxWidth: 500 }}>{info.desc}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ display: "inline-block", background: info.configured ? "#dcfce7" : "#fef3c7", color: info.configured ? "#166534" : "#92400e", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
              {info.configured ? "✅ Configured" : "⚠️ Needs Setup"}
            </span>
            <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
              <div style={{ textAlign: "center" }}><div style={{ fontWeight: 800, color: "#22c55e", fontSize: 22 }}>{todaySent}</div><div style={{ color: "#6b7280", fontSize: 11 }}>Sent</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontWeight: 800, color: "#ef4444", fontSize: 22 }}>{todayFailed}</div><div style={{ color: "#6b7280", fontSize: 11 }}>Failed</div></div>
              <div style={{ textAlign: "center" }}><div style={{ fontWeight: 800, color: CH_COLORS[channel], fontSize: 22 }}>{rate}%</div><div style={{ color: "#6b7280", fontSize: 11 }}>Rate</div></div>
            </div>
          </div>
        </div>
      </div>

      <h4 style={{ fontWeight: 700, marginBottom: 10 }}>Recent {channel.toUpperCase()} Messages</h4>
      {loading ? <div style={{ color: "#9ca3af", padding: 20 }}>Loading…</div> : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#fff" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Time","Recipient","Event","Status"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.logs || []).slice(0,20).map((log: any) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 10px", color: "#6b7280" }}>{new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td style={{ padding: "8px 10px" }}>{log.recipient}</td>
                  <td style={{ padding: "8px 10px" }}>{EVENT_LABELS[log.event_type] || log.event_type}</td>
                  <td style={{ padding: "8px 10px" }}><StatusBadge status={log.status} /></td>
                </tr>
              ))}
              {(data?.logs || []).length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "#9ca3af" }}>No {channel} messages yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Test API ──────────────────────────────────────────────────────────────────
const TEST_PROVIDERS = [
  { id: "botbee",   label: "💬 WhatsApp",      channel: "whatsapp", needsMobile: true,  needsEmail: false },
  { id: "fast2sms", label: "📱 SMS",            channel: "sms",      needsMobile: true,  needsEmail: false },
  { id: "lemin",    label: "🔵 RCS",            channel: "rcs",      needsMobile: true,  needsEmail: false },
  { id: "smtp",     label: "📧 Email",          channel: "email",    needsMobile: false, needsEmail: true  },
  { id: "firebase", label: "🔔 Push (FCM)",     channel: "push",     needsMobile: false, needsEmail: false },
];

function TestCenter() {
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [results, setResults] = useState<Record<string, any>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const send = async (providerId: string) => {
    setSending(p => ({ ...p, [providerId]: true }));
    setResults(p => ({ ...p, [providerId]: null }));
    setExpanded(providerId);
    try {
      const body: any = {};
      if (mobile) body.mobile = mobile;
      if (email) body.email = email;
      const res = await fetch(apiUrl(`/api/api-settings/${providerId}/send-test`), {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResults(p => ({ ...p, [providerId]: data }));
    } catch (e: any) {
      setResults(p => ({ ...p, [providerId]: { ok: false, errorMessage: e.message } }));
    }
    setSending(p => ({ ...p, [providerId]: false }));
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: "0 1px 4px #0001" }}>
        <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "#111827" }}>🔬 Test API</h3>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20, marginTop: 0 }}>
          Fire a live test to any provider. Full raw JSON response is shown. Every test is logged in <strong>Delivery Logs</strong>.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>Mobile Number</label>
            <input
              value={mobile} onChange={e => setMobile(e.target.value)}
              placeholder="91XXXXXXXXXX (WhatsApp / SMS / RCS)"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>Email Address</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="test@example.com"
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "9px 12px", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TEST_PROVIDERS.map(p => {
            const res = results[p.id];
            const busy = sending[p.id];
            const isOpen = expanded === p.id;
            const disabled = busy || (p.needsMobile && !mobile.trim()) || (p.needsEmail && !email.trim());
            const httpStatus = res?.httpStatus;
            const statusColor = !res ? "#374151" : res.ok ? "#166534" : "#991b1b";
            const statusBg = !res ? "#f8fafc" : res.ok ? "#f0fdf4" : "#fef2f2";
            const statusBorder = !res ? "#e5e7eb" : res.ok ? "#bbf7d0" : "#fecaca";

            return (
              <div key={p.id} style={{ border: `1px solid ${statusBorder}`, borderRadius: 10, overflow: "hidden", background: statusBg }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                  <button
                    onClick={() => send(p.id)} disabled={disabled}
                    style={{ background: disabled ? "#e5e7eb" : "#2563eb", color: disabled ? "#9ca3af" : "#fff", border: "none", borderRadius: 7, padding: "9px 20px", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", minWidth: 150 }}
                  >
                    {busy ? "Sending…" : `Send ${p.label}`}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {!res && !busy && (p.needsMobile ? !mobile.trim() : p.needsEmail ? !email.trim() : false) && (
                      <span style={{ color: "#9ca3af", fontSize: 12 }}>Enter {p.needsMobile ? "mobile" : "email"} above to enable</span>
                    )}
                    {res && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ background: res.ok ? "#dcfce7" : "#fef2f2", color: statusColor, border: `1px solid ${statusBorder}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                          {res.ok ? "✅ Sent" : "❌ Failed"}
                        </span>
                        {httpStatus && (
                          <span style={{ background: httpStatus < 300 ? "#dcfce7" : "#fef2f2", color: httpStatus < 300 ? "#166534" : "#991b1b", border: "1px solid", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            HTTP {httpStatus}
                          </span>
                        )}
                        {res.errorMessage && <span style={{ fontSize: 12, color: "#991b1b", fontWeight: 600 }}>{res.errorMessage}</span>}
                        {res.message && !res.errorMessage && <span style={{ fontSize: 12, color: "#374151" }}>{res.message}</span>}
                        {res.logged && <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", borderRadius: 4, padding: "2px 7px" }}>📋 Logged</span>}
                      </div>
                    )}
                  </div>
                  {res && (
                    <button onClick={() => setExpanded(isOpen ? null : p.id)}
                      style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>
                      {isOpen ? "▲ Hide JSON" : "▼ Show JSON"}
                    </button>
                  )}
                </div>

                {isOpen && res && (
                  <div style={{ borderTop: `1px solid ${statusBorder}`, background: "#fff" }}>
                    <div style={{ padding: "12px 14px 4px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "6px 16px", fontSize: 12, marginBottom: 10 }}>
                        {[
                          ["Provider", res.provider],
                          ["HTTP Status", httpStatus ? `HTTP ${httpStatus}` : "—"],
                          ["API Endpoint", res.endpoint],
                          ["Error Code", res.errorCode || "—"],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <span style={{ color: "#6b7280", fontWeight: 600 }}>{k}: </span>
                            <span style={{ color: "#111827", wordBreak: "break-all" }}>{v || "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                      <div style={{ padding: "0 14px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".04em" }}>Request Payload</div>
                        <pre style={{ background: "#1e293b", color: "#e2e8f0", borderRadius: 8, padding: "12px 14px", fontSize: 11, margin: 0, overflow: "auto", maxHeight: 260, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {res.requestPayload ? JSON.stringify(res.requestPayload, null, 2) : "—"}
                        </pre>
                      </div>
                      <div style={{ padding: "0 14px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".04em" }}>Raw Provider Response</div>
                        <pre style={{ background: "#1e293b", color: "#e2e8f0", borderRadius: 8, padding: "12px 14px", fontSize: 11, margin: 0, overflow: "auto", maxHeight: 260, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {res.responsePayload ? JSON.stringify(res.responsePayload, null, 2) : JSON.stringify(res, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 18, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e" }}>
          ⚠️ Test messages use live API credentials and are sent to real recipients. Every test is automatically logged in Delivery Logs. Ensure credentials are saved in <strong>Settings → API Settings</strong> before testing.
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function CommunicationCenter() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "20px 32px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>📡 Communication Center</h1>
        <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>Enterprise Notification Engine · 33 Events · WhatsApp · SMS · RCS · Email · Push</p>
      </div>

      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", overflowX: "auto" }}>
        <div style={{ display: "flex", padding: "0 24px", gap: 0, minWidth: "max-content" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: "none", border: "none", padding: "12px 14px", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#2563eb" : "#6b7280", borderBottom: tab === t.id ? "3px solid #2563eb" : "3px solid transparent", whiteSpace: "nowrap", transition: "color .2s" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
        {tab === "dashboard" && <Dashboard />}
        {tab === "test-center" && <TestCenter />}
        {tab === "queue" && <DeliveryLogs />}
        {tab === "failed" && <DeliveryLogs filterStatus="failed" />}
        {tab === "campaigns" && <CampaignManager />}
        {tab === "scheduled" && <ScheduledMessages />}
        {tab === "automation" && <AutomationRules />}
        {tab === "templates" && <Templates />}
        {tab === "whatsapp" && <WhatsAppTab />}
        {tab === "sms" && <ChannelTab channel="sms" />}
        {tab === "rcs" && <ChannelTab channel="rcs" />}
        {tab === "email" && <ChannelTab channel="email" />}
        {tab === "push" && <ChannelTab channel="push" />}
      </div>
    </div>
  );
}
