import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { admin } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Users, Plus, Archive, X, Check, Trash2, RefreshCw, Download, Shield } from "lucide-react";
import { toast } from "sonner";

export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"users" | "backups">("users");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "viewer" });

  if (user?.role !== "admin") {
    return (
      <Layout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
          <Shield size={48} color="#4a5568" />
          <p style={{ color: "#4a5568" }}>Admin access required</p>
          <button className="btn-primary" onClick={() => navigate("/pdf/")}>← Dashboard</button>
        </div>
      </Layout>
    );
  }

  async function loadData() {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([admin.users(), admin.backups()]);
      setUsers(u || []);
      setBackups(b || []);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    try {
      await admin.createUser(newUser);
      toast.success(`User "${newUser.username}" created`);
      setShowCreateUser(false);
      setNewUser({ username: "", email: "", password: "", role: "viewer" });
      loadData();
    } catch (err: any) { toast.error(err.message || "Failed to create user"); }
  }

  async function updateUser(id: string, data: any) {
    try {
      await admin.updateUser(id, data);
      toast.success("User updated");
      setEditUser(null);
      loadData();
    } catch (err: any) { toast.error(err.message); }
  }

  async function deactivateUser(u: any) {
    if (!confirm(`Deactivate user "${u.username}"?`)) return;
    try {
      await admin.deleteUser(u.id);
      toast.success("User deactivated");
      loadData();
    } catch (err: any) { toast.error(err.message); }
  }

  async function createBackup() {
    setBackupLoading(true);
    try {
      await admin.backup();
      toast.success("Backup created successfully");
      loadData();
    } catch (err: any) { toast.error(err.message || "Backup failed"); }
    finally { setBackupLoading(false); }
  }

  function formatBytes(b: number) {
    if (!b) return "0 B";
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  const roleBadge = (role: string) => {
    if (role === "admin") return "badge-red";
    if (role === "editor") return "badge-blue";
    return "badge-gray";
  };

  return (
    <Layout>
      <div style={{ padding: "2rem", maxWidth: 1000, margin: "0 auto" }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#d4d8e1", margin: 0 }}>Admin Panel</h1>
            <p style={{ fontSize: 13, color: "#4a5568", marginTop: 4 }}>Manage users, roles, and system backups</p>
          </div>
          <button className="btn-secondary flex items-center gap-1" style={{ padding: "6px 12px", fontSize: 12 }} onClick={loadData}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {(["users", "backups"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: activeTab === tab ? "#3b82f6" : "#111520",
                color: activeTab === tab ? "white" : "#8b9ab5",
                border: `1px solid ${activeTab === tab ? "#3b82f6" : "#1e2433"}`,
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* USERS TAB */}
        {activeTab === "users" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: 14, color: "#8b9ab5" }}>{users.length} users</span>
              <button className="btn-primary flex items-center gap-1" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => setShowCreateUser(true)}>
                <Plus size={14} /> New User
              </button>
            </div>

            {/* Create user form */}
            {showCreateUser && (
              <div className="card" style={{ marginBottom: "1.5rem", borderColor: "#1e3a5f" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#d4d8e1" }}>Create New User</h3>
                  <button className="btn-secondary" style={{ padding: "4px 8px" }} onClick={() => setShowCreateUser(false)}><X size={13} /></button>
                </div>
                <form onSubmit={createUser}>
                  <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <div><label>Username</label><input required value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} /></div>
                    <div><label>Email</label><input type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></div>
                    <div><label>Password (min 8 chars)</label><input type="password" required minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></div>
                    <div>
                      <label>Role</label>
                      <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button type="submit" className="btn-primary flex items-center gap-1" style={{ padding: "7px 16px" }}>
                      <Check size={14} /> Create
                    </button>
                    <button type="button" className="btn-secondary" style={{ padding: "7px 14px" }} onClick={() => setShowCreateUser(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>2FA</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: "#d4d8e1" }}>{u.username}</div>
                        <div style={{ fontSize: 11, color: "#4a5568" }}>{u.email}</div>
                      </td>
                      <td><span className={`badge ${roleBadge(u.role)}`} style={{ textTransform: "capitalize" }}>{u.role}</span></td>
                      <td>
                        <span className={`badge ${u.totp_enabled ? "badge-green" : "badge-gray"}`}>
                          {u.totp_enabled ? "✓ On" : "Off"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? "badge-green" : "badge-red"}`}>
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ color: "#4a5568", fontSize: 12 }}>
                        {u.last_login ? new Date(u.last_login).toLocaleDateString("en-IN") : "Never"}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {editUser?.id === u.id ? (
                            <>
                              <select
                                value={editUser.role}
                                onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                                style={{ width: 90, padding: "4px 6px", fontSize: 12 }}
                              >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button className="btn-primary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => updateUser(u.id, { role: editUser.role })}>Save</button>
                              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setEditUser(null)}>✕</button>
                            </>
                          ) : (
                            <>
                              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setEditUser({ id: u.id, role: u.role })}>
                                Edit
                              </button>
                              {u.id !== user?.id && u.is_active && (
                                <button className="btn-danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => deactivateUser(u)}>
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* BACKUPS TAB */}
        {activeTab === "backups" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: 14, color: "#8b9ab5" }}>{backups.length} backups</span>
              <button
                className="btn-primary flex items-center gap-1"
                style={{ padding: "7px 14px", fontSize: 13 }}
                onClick={createBackup}
                disabled={backupLoading}
              >
                {backupLoading ? (
                  <div style={{ width: 14, height: 14, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                ) : (
                  <Archive size={14} />
                )}
                {backupLoading ? "Creating…" : "Create Backup"}
              </button>
            </div>

            <div style={{ background: "#0d1a0d", border: "1px solid #14532d", borderRadius: 10, padding: "12px 14px", marginBottom: "1.5rem", fontSize: 12, color: "#86efac" }}>
              💾 Backups create an encrypted ZIP archive of all stored PDF files. Download and store them offline for disaster recovery.
            </div>

            {backups.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem" }}>
                <Archive size={40} style={{ margin: "0 auto 12px", color: "#1e2433" }} />
                <p style={{ color: "#4a5568" }}>No backups yet. Create your first backup.</p>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead><tr><th>Filename</th><th>Files</th><th>Size</th><th>Triggered By</th><th>Created</th><th>Download</th></tr></thead>
                  <tbody>
                    {backups.map((b) => (
                      <tr key={b.id}>
                        <td style={{ fontFamily: "monospace", fontSize: 12, color: "#8b9ab5" }}>{b.filename}</td>
                        <td>{b.file_count}</td>
                        <td>{formatBytes(b.size_bytes)}</td>
                        <td style={{ color: "#4a5568" }}>{b.triggered_by}</td>
                        <td style={{ fontSize: 12, color: "#4a5568" }}>{new Date(b.created_at).toLocaleString("en-IN")}</td>
                        <td>
                          <a href={admin.downloadBackup(b.id)} download className="btn-secondary flex items-center gap-1" style={{ padding: "5px 10px", fontSize: 12, display: "inline-flex" }}>
                            <Download size={12} /> Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
