import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

interface Commission {
  id: string;
  booking_number: string;
  agent_id: string;
  agent_name: string;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: "pending" | "approved" | "paid" | "rejected";
  approved_by?: string;
  approved_at?: string;
  paid_at?: string;
  payment_mode?: string;
  notes?: string;
  created_at: string;
}

interface AgentSummary {
  id: string;
  name: string;
  commission_rate: number;
  total_entries: number;
  pending_amount: number;
  approved_amount: number;
  paid_amount: number;
  total_earned: number;
  wallet_balance: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  paid:     "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function fmt(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0 });
}

export default function CommissionManager() {
  const [tab, setTab] = useState<"list" | "summary" | "wallet">("summary");
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<AgentSummary[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentDetail, setAgentDetail] = useState<any>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<Commission | null>(null);
  const [payMode, setPayMode] = useState("bank_transfer");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [msg, setMsg] = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  async function loadSummary() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/commissions/summary`, { credentials: "include" });
      setSummary(await r.json());
    } finally { setLoading(false); }
  }

  async function loadCommissions() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterFrom)   params.set("from", filterFrom);
    if (filterTo)     params.set("to", filterTo);
    try {
      const r = await fetch(`${API}/api/commissions?${params}`, { credentials: "include" });
      setCommissions(await r.json());
    } finally { setLoading(false); }
  }

  async function loadAgentDetail(agentId: string) {
    const r = await fetch(`${API}/api/commissions/agent/${agentId}`, { credentials: "include" });
    setAgentDetail(await r.json());
  }

  useEffect(() => { loadSummary(); }, []);
  useEffect(() => { if (tab === "list") loadCommissions(); }, [tab]);

  async function bulkSync() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/commissions/bulk-sync`, { method: "POST", credentials: "include" });
      const d = await r.json();
      flash(`✅ Synced ${d.created} commission entries`);
      await loadSummary();
    } finally { setLoading(false); }
  }

  async function doAction(id: string, action: "approve" | "reject") {
    setActionId(id);
    try {
      const r = await fetch(`${API}/api/commissions/${id}/${action}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (r.ok) { flash(`✅ Commission ${action}d`); loadCommissions(); }
      else flash("❌ Action failed");
    } finally { setActionId(null); }
  }

  async function submitPay() {
    if (!payModal) return;
    const r = await fetch(`${API}/api/commissions/${payModal!.id}/pay`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_mode: payMode, payment_reference: payRef, notes: payNotes }),
    });
    if (r.ok) {
      flash("✅ Commission paid & wallet credited");
      setPayModal(null);
      loadCommissions();
      loadSummary();
    } else flash("❌ Payment failed");
  }

  const totalPending  = summary.reduce((s, a) => s + Number(a.pending_amount), 0);
  const totalApproved = summary.reduce((s, a) => s + Number(a.approved_amount), 0);
  const totalPaid     = summary.reduce((s, a) => s + Number(a.paid_amount), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commission Management</h1>
            <p className="text-sm text-gray-500 mt-1">Agent commission tracking, approval & wallet management</p>
          </div>
          <button onClick={bulkSync} disabled={loading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {loading ? "Syncing..." : "🔄 Sync All Commissions"}
          </button>
        </div>
        {msg && <div className="mt-3 p-3 bg-green-50 text-green-800 rounded-lg text-sm">{msg}</div>}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4">
        {[
          { label: "Pending Approval", value: fmt(totalPending), color: "text-yellow-600", icon: "⏳" },
          { label: "Approved (Unpaid)", value: fmt(totalApproved), color: "text-blue-600", icon: "✅" },
          { label: "Total Paid", value: fmt(totalPaid), color: "text-green-600", icon: "💰" },
          { label: "Active Agents", value: String(summary.filter(a => a.total_entries > 0).length), color: "text-purple-600", icon: "👥" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{k.icon}</span>
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{k.label}</span>
            </div>
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
          {(["summary", "list", "wallet"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"}`}>
              {t === "summary" ? "📊 Agent Summary" : t === "list" ? "📋 All Commissions" : "💳 Wallet"}
            </button>
          ))}
        </div>

        {/* Summary Tab */}
        {tab === "summary" && (
          <div className="space-y-4">
            {summary.map(agent => (
              <div key={agent.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    if (expandedAgent === agent.id) { setExpandedAgent(null); setAgentDetail(null); }
                    else { setExpandedAgent(agent.id); loadAgentDetail(agent.id); }
                  }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-600">
                      {agent.name[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{agent.name}</div>
                      <div className="text-xs text-gray-500">{agent.commission_rate}% rate · {agent.total_entries} entries</div>
                    </div>
                  </div>
                  <div className="flex gap-6 text-right">
                    <div><div className="text-xs text-gray-500">Pending</div><div className="font-semibold text-yellow-600">{fmt(agent.pending_amount)}</div></div>
                    <div><div className="text-xs text-gray-500">Approved</div><div className="font-semibold text-blue-600">{fmt(agent.approved_amount)}</div></div>
                    <div><div className="text-xs text-gray-500">Paid</div><div className="font-semibold text-green-600">{fmt(agent.paid_amount)}</div></div>
                    <div><div className="text-xs text-gray-500">Wallet</div><div className={`font-semibold ${Number(agent.wallet_balance) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(agent.wallet_balance)}</div></div>
                  </div>
                </div>
                {expandedAgent === agent.id && agentDetail && (
                  <div className="border-t bg-gray-50 p-4">
                    <div className="text-sm font-medium text-gray-700 mb-3">Recent Commissions</div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {(agentDetail?.commissions || []).slice(0, 10).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between bg-white rounded-lg p-3 border text-sm">
                          <div>
                            <span className="font-medium">{c.booking_number}</span>
                            <span className="text-gray-500 ml-2">{c.commission_rate}% of {fmt(c.base_amount)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{fmt(c.commission_amount)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                            {c.status === "pending" && (
                              <button onClick={() => doAction(c.id, "approve")} disabled={actionId === c.id}
                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Approve</button>
                            )}
                            {c.status === "approved" && (
                              <button onClick={() => setPayModal(c)}
                                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Pay</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!loading && summary.length === 0 && (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400">No agents found. Run a bulk sync first.</div>
            )}
          </div>
        )}

        {/* List Tab */}
        {tab === "list" && (
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="p-4 border-b flex gap-3 flex-wrap">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
              </select>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" />
              <button onClick={loadCommissions} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700">
                🔍 Filter
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Booking", "Agent", "Base Amount", "Rate", "Commission", "Status", "Date", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {commissions.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-indigo-600">{c.booking_number}</td>
                      <td className="px-4 py-3 font-medium">{c.agent_name}</td>
                      <td className="px-4 py-3">{fmt(c.base_amount)}</td>
                      <td className="px-4 py-3">{c.commission_rate}%</td>
                      <td className="px-4 py-3 font-semibold">{fmt(c.commission_amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {c.status === "pending" && <>
                            <button onClick={() => doAction(c.id, "approve")} disabled={actionId === c.id}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Approve</button>
                            <button onClick={() => doAction(c.id, "reject")} disabled={actionId === c.id}
                              className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50">Reject</button>
                          </>}
                          {c.status === "approved" && (
                            <button onClick={() => setPayModal(c)}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Pay</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && commissions.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No commissions found. Adjust filters or sync first.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Wallet Tab */}
        {tab === "wallet" && (
          <div className="space-y-4">
            {summary.map(agent => (
              <div key={agent.id} className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-600">{agent.name[0]}</div>
                  <div>
                    <div className="font-semibold text-gray-900">{agent.name}</div>
                    <div className="text-xs text-gray-500">{agent.commission_rate}% commission rate</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">Wallet Balance</div>
                  <div className={`text-2xl font-bold ${Number(agent.wallet_balance) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmt(agent.wallet_balance)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pay Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">Pay Commission</h2>
              <p className="text-sm text-gray-500 mt-1">{payModal.agent_name} — {payModal.booking_number}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-sm text-gray-600">Commission Amount</div>
                <div className="text-3xl font-bold text-green-600">{fmt(payModal.commission_amount)}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                <select value={payMode} onChange={e => setPayMode(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="upi">UPI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference / UTR</label>
                <input value={payRef} onChange={e => setPayRef(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Transaction reference" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input value={payNotes} onChange={e => setPayNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optional notes" />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setPayModal(null)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={submitPay} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                ✅ Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
