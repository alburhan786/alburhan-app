import React, { useState, useEffect, useCallback } from "react";
import {
  Building2, RefreshCw, IndianRupee, Package, UserCheck,
  LogOut, TrendingUp, Plus, Pencil, ToggleLeft, ToggleRight,
  Users, X, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { FCMAutoInit } from "@/components/FCMAutoInit";
import { FCMBell } from "@/components/FCMBell";

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
};

type Tab = "overview" | "agents";

interface AgentForm {
  name: string;
  mobile: string;
  email: string;
  commission_rate: string;
  notes: string;
}

const EMPTY_FORM: AgentForm = { name: "", mobile: "", email: "", commission_rate: "0", notes: "" };

// ── Inline Agent Modal ────────────────────────────────────────────────────────
function AgentModal({
  mode, initial, onClose, onSave,
}: {
  mode: "create" | "edit";
  initial?: Partial<AgentForm> & { id?: string };
  onClose: () => void;
  onSave: (form: AgentForm, id?: string) => Promise<void>;
}) {
  const [form, setForm] = useState<AgentForm>({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof AgentForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await onSave(form, initial?.id);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save agent");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-base">{mode === "create" ? "Add New Agent" : "Edit Agent"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
            <input value={form.name} onChange={set("name")} required placeholder="Agent full name"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          {mode === "create" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mobile Number *</label>
              <input value={form.mobile} onChange={set("mobile")} required placeholder="10-digit mobile"
                maxLength={10} inputMode="numeric"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <input value={form.email} onChange={set("email")} type="email" placeholder="agent@example.com"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Commission Rate (%)</label>
            <input value={form.commission_rate} onChange={set("commission_rate")} type="number" min="0" max="100" step="0.5"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Optional notes"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={saving}>
              {saving ? "Saving…" : mode === "create" ? "Create Agent" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BranchPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  // Overview state
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Agents state
  const [agents, setAgents] = useState<any[]>([]);
  const [agentsBranch, setAgentsBranch] = useState<any>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; agent?: any } | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const loadOverview = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/api/portal/branch`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.message || "Failed to load branch data");
        setLoading(false); return;
      }
      setData(await r.json());
    } catch { setError("Network error — please try again"); }
    setLoading(false);
  }, []);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true); setAgentsError("");
    try {
      const r = await fetch(`${API}/api/portal/branch/agents`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setAgentsError(b.message || "Failed to load agents"); setAgentsLoading(false); return; }
      const body = await r.json();
      setAgents(body.agents || []);
      setAgentsBranch(body.branch || null);
    } catch { setAgentsError("Network error"); }
    setAgentsLoading(false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === "agents") loadAgents(); }, [tab, loadAgents]);

  const branch = data?.branch || {};
  const statusMap: Record<string, number> = data?.statusMap || {};
  const total = Object.values(statusMap).reduce((a: number, b: any) => a + Number(b), 0);

  const saveAgent = async (form: AgentForm, id?: string) => {
    const url = id ? `${API}/api/portal/branch/agents/${id}` : `${API}/api/portal/branch/agents`;
    const r = await fetch(url, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: form.name, mobile: form.mobile, email: form.email || null,
        commission_rate: Number(form.commission_rate) || 0,
        notes: form.notes || null,
      }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || body.message || "Failed");
    showToast(id ? "Agent updated successfully" : "Agent created successfully");
    await loadAgents();
  };

  const toggleAgent = async (agentId: string) => {
    const r = await fetch(`${API}/api/portal/branch/agents/${agentId}/toggle`, {
      method: "PUT", credentials: "include",
    });
    const body = await r.json();
    if (!r.ok) { showToast(body.message || "Failed to toggle"); return; }
    showToast(body.is_active ? "Agent activated" : "Agent deactivated");
    await loadAgents();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      <FCMAutoInit userType="branch_manager" />
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm flex items-center gap-2">
          <Check size={14} /> {toastMsg}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <AgentModal
          mode={modal.mode}
          initial={modal.agent ? {
            id: modal.agent.id,
            name: modal.agent.name || "",
            email: modal.agent.email || "",
            commission_rate: String(modal.agent.commission_rate || 0),
            notes: modal.agent.notes || "",
            mobile: modal.agent.mobile || "",
          } : undefined}
          onClose={() => setModal(null)}
          onSave={saveAgent}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-none">Al Burhan Tours & Travels</p>
              <p className="text-xs text-muted-foreground mt-0.5">Branch Manager Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.mobile}</span>
            <FCMBell iconSize={14} />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => logout()}>
              <LogOut size={13} /> Logout
            </Button>
          </div>
        </div>
        {/* Tab Bar */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-0">
          {([
            { key: "overview", label: "Overview", icon: <TrendingUp size={13} /> },
            { key: "agents", label: "My Agents", icon: <Users size={13} /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-emerald-600 text-emerald-700"
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
                <h1 className="text-xl font-bold">{branch.name || "Your Branch"}</h1>
                {branch.city && <p className="text-sm text-muted-foreground">{branch.city}</p>}
              </div>
              <Button onClick={loadOverview} disabled={loading} variant="outline" size="sm" className="gap-1.5">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </Button>
            </div>

            {loading ? (
              <div className="py-20 text-center text-muted-foreground">Loading your branch data…</div>
            ) : error ? (
              <div className="py-16 text-center">
                <Building2 size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-red-500 font-medium">{error}</p>
                <p className="text-sm text-muted-foreground mt-1">Contact admin to link your branch to this mobile number.</p>
                <Button onClick={loadOverview} variant="outline" size="sm" className="mt-4 gap-1.5">
                  <RefreshCw size={13} /> Try Again
                </Button>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: <IndianRupee size={18} className="text-emerald-600 mx-auto mb-1" />, val: fmt(data.totalRevenue || 0), label: "Total Collected", color: "text-emerald-600" },
                    { icon: <Package size={18} className="text-blue-600 mx-auto mb-1" />, val: total, label: "Total Bookings", color: "text-blue-600" },
                    { icon: <UserCheck size={18} className="text-teal-600 mx-auto mb-1" />, val: data.activeAgents || 0, label: "Active Agents", color: "text-teal-600" },
                    { icon: <TrendingUp size={18} className="text-violet-600 mx-auto mb-1" />, val: statusMap.confirmed || 0, label: "Confirmed", color: "text-violet-600" },
                  ].map((c, i) => (
                    <div key={i} className="rounded-2xl border p-4 bg-white text-center">
                      {c.icon}
                      <p className={`text-xl font-bold font-mono ${c.color}`}>{c.val}</p>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                    </div>
                  ))}
                </div>

                {/* Status breakdown */}
                <div className="rounded-2xl border bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm">Booking Status Breakdown</div>
                  {Object.keys(statusMap).length === 0 ? (
                    <p className="px-4 py-8 text-center text-muted-foreground text-sm">No bookings through this branch yet</p>
                  ) : (
                    Object.entries(statusMap).map(([status, cnt]) => (
                      <div key={status} className="flex items-center gap-3 px-4 py-3 border-b last:border-0">
                        <Badge className={`capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-700"}`}>{status}</Badge>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${total > 0 ? Math.round((Number(cnt) / total) * 100) : 0}%` }} />
                        </div>
                        <span className="font-bold font-mono text-sm w-8 text-right">{cnt}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Recent bookings */}
                {data.recentBookings?.length > 0 && (
                  <div className="rounded-2xl border bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/20 font-semibold text-sm">Recent Bookings</div>
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
                              <td className="px-4 py-2.5">
                                <p className="font-medium">{b.customer_name || "—"}</p>
                                <p className="text-xs text-muted-foreground">{b.customer_mobile}</p>
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">{b.package_name || "—"}</td>
                              <td className="px-4 py-2.5">
                                <Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono">{fmt(Number(b.total_amount || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Branch info */}
                <div className="rounded-2xl border bg-white p-5 grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Branch Info</p>
                    <p className="font-semibold">{branch.name}</p>
                    {branch.city && <p className="text-sm text-muted-foreground">{branch.city}</p>}
                    {branch.address && <p className="text-sm text-muted-foreground mt-1">{branch.address}</p>}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Manager</p>
                    <p className="font-semibold">{branch.manager_name || "—"}</p>
                    {branch.manager_mobile && <p className="text-sm text-muted-foreground">{branch.manager_mobile}</p>}
                    {branch.manager_email && <p className="text-sm text-muted-foreground">{branch.manager_email}</p>}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── AGENTS TAB ──────────────────────────────────────────────────── */}
        {tab === "agents" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">My Agents</h1>
                <p className="text-sm text-muted-foreground">{agentsBranch?.name || "Your branch"}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={loadAgents} disabled={agentsLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={13} className={agentsLoading ? "animate-spin" : ""} /> Refresh
                </Button>
                <Button onClick={() => setModal({ mode: "create" })} size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus size={13} /> Add Agent
                </Button>
              </div>
            </div>

            {agentsLoading ? (
              <div className="py-20 text-center text-muted-foreground">Loading agents…</div>
            ) : agentsError ? (
              <div className="py-16 text-center text-red-500">{agentsError}</div>
            ) : agents.length === 0 ? (
              <div className="py-20 text-center">
                <Users size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="font-medium text-muted-foreground">No agents yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add your first agent to get started</p>
                <Button onClick={() => setModal({ mode: "create" })} size="sm" className="mt-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus size={13} /> Add First Agent
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
                  <span className="font-semibold text-sm">{agents.length} Agent{agents.length !== 1 ? "s" : ""}</span>
                  <span className="text-xs text-muted-foreground">{agents.filter(a => a.is_active).length} active</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/10">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Agent</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Mobile</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Commission</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Bookings</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Revenue</th>
                        <th className="text-center px-4 py-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a: any) => (
                        <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/10 ${!a.is_active ? "opacity-50" : ""}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{a.name}</p>
                            {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{a.mobile || "—"}</td>
                          <td className="px-4 py-3 text-right font-mono">{a.commission_rate}%</td>
                          <td className="px-4 py-3 text-right font-mono">{a.total_bookings || 0}</td>
                          <td className="px-4 py-3 text-right font-mono">{fmt(Number(a.total_bookings_amount || 0))}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={a.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}>
                              {a.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setModal({ mode: "edit", agent: a })}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                                title="Edit agent"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => toggleAgent(a.id)}
                                className={`p-1.5 rounded-lg hover:bg-muted ${a.is_active ? "text-emerald-600" : "text-gray-400"}`}
                                title={a.is_active ? "Deactivate" : "Activate"}
                              >
                                {a.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}
