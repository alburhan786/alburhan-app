import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

interface Inquiry {
  id: string;
  name: string;
  mobile?: string;
  email?: string;
  message?: string;
  packageInterest?: string;
  isRead?: boolean;
  createdAt?: string;
}

export default function InquiryManager() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [selected, setSelected] = useState<Inquiry | null>(null);

  const fetchInquiries = () => {
    fetch(`${API}/api/admin/inquiries`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { setInquiries(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchInquiries(); }, []);

  const markRead = async (id: string) => {
    await fetch(`${API}/api/admin/inquiries/${id}/read`, { method: "PATCH", credentials: "include" });
    setInquiries(prev => prev.map(q => q.id === id ? { ...q, isRead: true } : q));
    if (selected?.id === id) setSelected(s => s ? { ...s, isRead: true } : null);
  };

  const filtered = inquiries.filter(q =>
    filter === "all" ? true : filter === "unread" ? !q.isRead : q.isRead
  );
  const unreadCount = inquiries.filter(q => !q.isRead).length;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", fontFamily: "Inter, sans-serif", overflow: "hidden" }}>

      {/* Sidebar: List */}
      <div style={{ width: "380px", flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", background: "#fff" }}>
        <div style={{ padding: "20px", borderBottom: "1px solid #eee" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0A3D2A", margin: 0 }}>Inquiries</h1>
          {unreadCount > 0 && (
            <span style={{ display: "inline-block", marginTop: "4px", background: "#c0392b", color: "#fff", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px" }}>
              {unreadCount} unread
            </span>
          )}
          <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
            {(["all", "unread", "read"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "4px 12px", borderRadius: "20px", border: "1.5px solid", borderColor: filter === f ? "#0A3D2A" : "#ddd", background: filter === f ? "#0A3D2A" : "#fff", color: filter === f ? "#fff" : "#555", fontSize: "12px", fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#999" }}>No inquiries found.</div>
          ) : filtered.map(q => (
            <div
              key={q.id}
              onClick={() => { setSelected(q); if (!q.isRead) markRead(q.id); }}
              style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", background: selected?.id === q.id ? "#f0f9f4" : q.isRead ? "#fff" : "#fffbeb", borderLeft: selected?.id === q.id ? "4px solid #0A3D2A" : "4px solid transparent", transition: "background 0.15s" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: q.isRead ? 500 : 700, fontSize: "14px", color: "#222" }}>{q.name}</div>
                {!q.isRead && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#c0392b" }} />}
              </div>
              {q.packageInterest && (
                <div style={{ fontSize: "11px", color: "#0A3D2A", fontWeight: 600, marginTop: "2px" }}>{q.packageInterest}</div>
              )}
              <div style={{ fontSize: "12px", color: "#777", marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {q.message || "No message"}
              </div>
              <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>
                {q.createdAt ? new Date(q.createdAt).toLocaleString("en-IN") : ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      <div style={{ flex: 1, padding: "32px", overflowY: "auto", background: "#fafafa" }}>
        {!selected ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#aaa" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📩</div>
            <div style={{ fontSize: "16px" }}>Select an inquiry to view details</div>
          </div>
        ) : (
          <div style={{ maxWidth: "600px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
              <div>
                <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#0A3D2A", margin: 0 }}>{selected.name}</h2>
                <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>
                  {selected.createdAt ? new Date(selected.createdAt).toLocaleString("en-IN") : ""}
                </div>
              </div>
              {!selected.isRead && (
                <button onClick={() => markRead(selected.id)} style={{ padding: "8px 16px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
                  Mark as Read
                </button>
              )}
            </div>

            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #eee", padding: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                <div><div style={{ fontSize: "11px", color: "#999", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Mobile</div><div style={{ fontSize: "15px", fontWeight: 600, color: "#222" }}>{selected.mobile || "—"}</div></div>
                <div><div style={{ fontSize: "11px", color: "#999", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Email</div><div style={{ fontSize: "15px", color: "#222" }}>{selected.email || "—"}</div></div>
                <div><div style={{ fontSize: "11px", color: "#999", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Package Interest</div><div style={{ fontSize: "15px", fontWeight: 600, color: "#0A3D2A" }}>{selected.packageInterest || "—"}</div></div>
                <div><div style={{ fontSize: "11px", color: "#999", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Status</div><div style={{ fontSize: "13px" }}><span style={{ padding: "3px 10px", borderRadius: "20px", fontWeight: 600, background: selected.isRead ? "#e8f5e9" : "#fff3e0", color: selected.isRead ? "#2e7d32" : "#f57c00" }}>{selected.isRead ? "Read" : "Unread"}</span></div></div>
              </div>

              {selected.message && (
                <div>
                  <div style={{ fontSize: "11px", color: "#999", fontWeight: 600, textTransform: "uppercase", marginBottom: "8px" }}>Message</div>
                  <div style={{ fontSize: "15px", color: "#333", lineHeight: 1.6, background: "#fafafa", padding: "14px", borderRadius: "8px", border: "1px solid #eee" }}>{selected.message}</div>
                </div>
              )}

              {selected.mobile && (
                <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                  <a href={`tel:${selected.mobile}`} style={{ padding: "10px 18px", background: "#0A3D2A", color: "#fff", borderRadius: "8px", fontWeight: 600, fontSize: "14px", textDecoration: "none" }}>📞 Call</a>
                  <a href={`https://wa.me/91${selected.mobile.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ padding: "10px 18px", background: "#25D366", color: "#fff", borderRadius: "8px", fontWeight: 600, fontSize: "14px", textDecoration: "none" }}>💬 WhatsApp</a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
