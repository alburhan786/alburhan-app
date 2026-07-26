import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { admin } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollText, Search, RefreshCw, Shield, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

export default function AuditPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(1);

  async function loadLogs() {
    setLoading(true);
    try {
      if (user?.role === "admin") {
        const params: any = { page: String(page), limit: "100" };
        if (search) params.action = search;
        if (severity) params.severity = severity;
        const res = await admin.audit(params);
        setLogs(res.logs || []);
        setTotal(res.total || 0);
      } else {
        const res = await admin.myAudit();
        setLogs(Array.isArray(res) ? res : []);
        setTotal(res.length || 0);
      }
    } catch { toast.error("Failed to load audit logs"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadLogs(); }, [page, severity]);
  useEffect(() => {
    const t = setTimeout(loadLogs, 350);
    return () => clearTimeout(t);
  }, [search]);

  function severityIcon(s: string) {
    if (s === "critical") return <AlertTriangle size={12} className="severity-critical" />;
    if (s === "warning") return <Shield size={12} className="severity-warning" />;
    return <Info size={12} className="severity-info" />;
  }

  function actionBadge(action: string) {
    if (action.includes("delete") || action.includes("disable") || action.includes("critical")) return "badge-red";
    if (action.includes("login") || action.includes("2fa") || action.includes("password")) return "badge-amber";
    if (action.includes("upload") || action.includes("create")) return "badge-green";
    return "badge-blue";
  }

  const filtered = logs.filter((l) =>
    !search ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.username?.toLowerCase().includes(search.toLowerCase()) ||
    l.resource_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#d4d8e1", margin: 0 }}>Audit Log</h1>
            <p style={{ fontSize: 13, color: "#4a5568", marginTop: 4 }}>
              {user?.role === "admin" ? `System-wide security events (${total} total)` : "Your personal activity log"}
            </p>
          </div>
          <button className="btn-secondary flex items-center gap-1" style={{ padding: "6px 12px", fontSize: 12 }} onClick={loadLogs}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5" style={{ flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <input
              type="text"
              placeholder="Search action, user, file…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#4a5568" }} />
          </div>
          {user?.role === "admin" && (
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ width: "auto", minWidth: 130 }}>
              <option value="">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem" }}>
            <div style={{ width: 24, height: 24, border: "2px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <p style={{ color: "#4a5568" }}>Loading logs…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem" }}>
            <ScrollText size={40} style={{ margin: "0 auto 12px", color: "#1e2433" }} />
            <p style={{ color: "#4a5568" }}>No audit events found</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Action</th>
                  {user?.role === "admin" && <th>User</th>}
                  <th>Resource</th>
                  <th>IP Address</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td>{severityIcon(l.severity)}</td>
                    <td>
                      <span className={`badge ${actionBadge(l.action)}`} style={{ textTransform: "none" }}>
                        {l.action.replace(/_/g, " ")}
                      </span>
                    </td>
                    {user?.role === "admin" && <td style={{ color: "#8b9ab5" }}>{l.username || "—"}</td>}
                    <td>
                      <div style={{ color: "#8b9ab5", fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.resource_name || l.resource_type || "—"}
                      </div>
                    </td>
                    <td style={{ color: "#4a5568", fontSize: 11, fontFamily: "monospace" }}>{l.ip_address || "—"}</td>
                    <td style={{ color: "#4a5568", fontSize: 11, whiteSpace: "nowrap" }}>
                      {new Date(l.created_at).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
