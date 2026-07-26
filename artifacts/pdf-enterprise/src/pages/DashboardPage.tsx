import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { admin, files } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import {
  FileText, Upload, Users, ShieldCheck, TrendingUp,
  Clock, Database, AlertTriangle, Plus, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <div style={{ width: 40, height: 40, background: `${color}20`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={18} color={color} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#d4d8e1" }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#8b9ab5", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#4a5568", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<any>(null);
  const [recentFiles, setRecentFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      admin.stats(),
      files.list({ limit: "6", page: "1" }),
    ]).then(([s, f]) => {
      setStats(s);
      setRecentFiles(f.files || []);
    }).catch(() => toast.error("Failed to load dashboard")).finally(() => setLoading(false));
  }, []);

  function timeAgo(dateStr: string) {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <Layout>
      <div style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#d4d8e1", margin: 0 }}>
              Welcome back, {user?.username} 👋
            </h1>
            <p style={{ fontSize: 13, color: "#4a5568", marginTop: 4 }}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => navigate("/workspace")}
            style={{ padding: "10px 18px" }}
          >
            <Plus size={16} /> Upload PDF
          </button>
        </div>

        {/* Stats grid */}
        {loading ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: "2rem" }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="stat-card" style={{ height: 120, animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: "2rem" }}>
            <StatCard icon={FileText} label="Total Files" value={stats?.totalFiles ?? 0} sub={`${stats?.totalPages ?? 0} pages total`} color="#3b82f6" />
            <StatCard icon={Database} label="Storage Used" value={formatBytes(stats?.totalSize ?? 0)} sub="AES-256 encrypted" color="#10b981" />
            {user?.role === "admin" && (
              <StatCard icon={Users} label="Active Users" value={`${stats?.activeUsers ?? 0}/${stats?.totalUsers ?? 0}`} sub="registered accounts" color="#8b5cf6" />
            )}
            <StatCard icon={ShieldCheck} label="Events Today" value={stats?.auditEventsToday ?? 0} sub="audit log entries" color="#f59e0b" />
            <StatCard icon={TrendingUp} label="Recent Files" value={stats?.recentFiles ?? 0} sub="added this week" color="#ec4899" />
          </div>
        )}

        {/* Quick actions */}
        <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[
            { label: "Upload & Manage", desc: "Browse and manage your PDFs", icon: FileText, href: "/workspace", color: "#3b82f6" },
            { label: "PDF Tools", desc: "Merge, split, compress and more", icon: Upload, href: "/tools", color: "#10b981" },
            { label: "ERP Bridge", desc: "Import agreements & invoices", icon: ArrowRight, href: "/erp", color: "#8b5cf6" },
            { label: "Audit Log", desc: "Review security events", icon: ShieldCheck, href: "/audit", color: "#f59e0b" },
          ].map((item) => (
            <button
              key={item.href}
              className="tool-card text-left"
              onClick={() => navigate(item.href)}
            >
              <div style={{ width: 36, height: 36, background: `${item.color}20`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <item.icon size={18} color={item.color} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#d4d8e1", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "#4a5568" }}>{item.desc}</div>
            </button>
          ))}
        </div>

        {/* Recent Files */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#d4d8e1", margin: 0 }}>Recent Files</h2>
            <button
              style={{ fontSize: 12, color: "#3b82f6", background: "none", padding: "4px 8px" }}
              onClick={() => navigate("/workspace")}
            >
              View all →
            </button>
          </div>
          {recentFiles.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
              <FileText size={40} style={{ margin: "0 auto 12px", color: "#1e2433" }} />
              <p style={{ color: "#4a5568", margin: 0 }}>No files yet. Upload your first PDF!</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Pages</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFiles.map((f) => (
                    <tr
                      key={f.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate("/workspace")}
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          <FileText size={14} color="#3b82f6" />
                          <span style={{ fontWeight: 500 }}>{f.name}</span>
                          {f.has_password && <span className="badge badge-amber" style={{ fontSize: 9 }}>🔒 Protected</span>}
                          {f.erp_source && <span className="badge badge-blue" style={{ fontSize: 9 }}>ERP</span>}
                        </div>
                      </td>
                      <td style={{ color: "#8b9ab5" }}>{f.page_count || "—"}</td>
                      <td style={{ color: "#8b9ab5" }}>{formatBytes(f.size_bytes)}</td>
                      <td style={{ color: "#8b9ab5" }}>
                        <div className="flex items-center gap-1"><Clock size={12} />{timeAgo(f.created_at)}</div>
                      </td>
                      <td style={{ color: "#8b9ab5" }}>{f.owner_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
