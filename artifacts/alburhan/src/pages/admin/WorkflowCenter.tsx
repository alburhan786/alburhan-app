import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";

const API = import.meta.env.VITE_API_URL || "";
function apiUrl(path: string) { return `${API}${path}`; }

const TABS = [
  { id: "dashboard", label: "📊 Dashboard" },
  { id: "rules", label: "⚙️ Automation Rules" },
  { id: "logs", label: "📋 Execution Logs" },
  { id: "failed", label: "❌ Failed" },
  { id: "timeline", label: "🕐 Timeline" },
];

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  running: "bg-blue-100 text-blue-800",
  pending: "bg-yellow-100 text-yellow-800",
  skipped: "bg-gray-100 text-gray-600",
};

const GROUP_COLORS: Record<string, string> = {
  Bookings: "bg-blue-50 border-blue-200",
  Payments: "bg-green-50 border-green-200",
  Documents: "bg-purple-50 border-purple-200",
  Travel: "bg-orange-50 border-orange-200",
  "Post-Trip": "bg-pink-50 border-pink-200",
  Safety: "bg-red-50 border-red-200",
};

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`p-4 rounded-xl border-2 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-green-500" : "bg-gray-300"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function WorkflowCenter() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">⚡ Workflow Center</h1>
        <p className="text-gray-500 text-sm mt-1">Automate every business event — manage rules, track executions, and monitor customer journeys.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? "bg-indigo-600 text-white" : "bg-white border text-gray-700 hover:bg-gray-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "logs" && <LogsTab statusFilter="all" />}
      {tab === "failed" && <LogsTab statusFilter="failed" />}
      {tab === "timeline" && <TimelineTab />}
    </div>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/workflows/stats"), { credentials: "include" });
      setStats(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!stats) return null;

  const t = stats.today ?? {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Today" value={t.total ?? 0} color="border-indigo-200 bg-indigo-50" />
        <StatCard label="Completed" value={t.completed ?? 0} color="border-green-200 bg-green-50" />
        <StatCard label="Failed" value={t.failed ?? 0} color="border-red-200 bg-red-50" />
        <StatCard label="Running" value={t.running ?? 0} color="border-blue-200 bg-blue-50" />
        <StatCard label="Active Rules" value={stats.rules?.active ?? 0} color="border-purple-200 bg-purple-50" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-700 mb-3">Top Workflows (7 days)</h3>
          {stats.byTrigger?.length === 0 && <p className="text-gray-400 text-sm">No workflow executions yet.</p>}
          <div className="space-y-2">
            {(stats.byTrigger ?? []).map((row: any) => (
              <div key={row.trigger_type} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{row.trigger_type.replace(/_/g, " ")}</div>
                  <div className="flex gap-1 mt-0.5">
                    <div className="h-1.5 rounded bg-green-400" style={{ width: `${(row.count - row.failed) / Math.max(row.count, 1) * 120}px` }} />
                    {row.failed > 0 && <div className="h-1.5 rounded bg-red-400" style={{ width: `${row.failed / Math.max(row.count, 1) * 120}px` }} />}
                  </div>
                </div>
                <span className="text-xs text-gray-500">{row.count} runs</span>
                {row.failed > 0 && <span className="text-xs text-red-600">{row.failed} failed</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-700 mb-3">Recent Failures</h3>
          {stats.recentFailed?.length === 0 && <p className="text-gray-400 text-sm">🎉 No failures today!</p>}
          <div className="space-y-2">
            {(stats.recentFailed ?? []).map((row: any) => (
              <div key={row.id} className="p-2 bg-red-50 border border-red-100 rounded-lg text-sm">
                <div className="font-medium text-red-700">{row.trigger_type.replace(/_/g, " ")}</div>
                {row.customer_name && <div className="text-gray-500 text-xs">{row.customer_name}</div>}
                {row.error_message && <div className="text-red-500 text-xs mt-0.5 truncate">{row.error_message}</div>}
                <div className="text-gray-400 text-xs mt-0.5">Retries: {row.retry_count}/3</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<number | null>(null);
  const [testMobile, setTestMobile] = useState("");
  const [testResult, setTestResult] = useState<{ id: number; msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/workflows/rules"), { credentials: "include" });
      setRules(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id: number, enabled: boolean) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
    await fetch(apiUrl(`/api/workflows/rules/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ enabled }),
    });
  };

  const testRule = async (id: number) => {
    if (!testMobile) { alert("Enter a mobile number to test"); return; }
    setTesting(id);
    try {
      const r = await fetch(apiUrl(`/api/workflows/rules/${id}/test`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mobile: testMobile }),
      });
      const data = await r.json();
      setTestResult({ id, msg: data.message ?? (data.success ? "Test sent!" : "Test failed"), ok: data.success });
      setTimeout(() => setTestResult(null), 4000);
    } catch (e: any) {
      setTestResult({ id, msg: e.message, ok: false });
    }
    setTesting(null);
  };

  const cloneRule = async (id: number) => {
    await fetch(apiUrl(`/api/workflows/rules/${id}/clone`), { method: "POST", credentials: "include" });
    load();
  };

  const deleteRule = async (id: number) => {
    if (!confirm("Delete this rule? This action cannot be undone.")) return;
    await fetch(apiUrl(`/api/workflows/rules/${id}`), { method: "DELETE", credentials: "include" });
    load();
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const grouped: Record<string, any[]> = {};
  for (const r of rules) {
    if (!grouped[r.group_name]) grouped[r.group_name] = [];
    grouped[r.group_name].push(r);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center bg-white border rounded-xl p-3">
        <span className="text-sm text-gray-600 font-medium">Test Mobile:</span>
        <input
          type="tel"
          placeholder="9XXXXXXXXX"
          value={testMobile}
          onChange={e => setTestMobile(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-40"
        />
        <span className="text-xs text-gray-400">Enter a number then click Test on any rule</span>
      </div>

      {Object.entries(grouped).map(([group, groupRules]) => (
        <div key={group} className={`border rounded-xl overflow-hidden ${GROUP_COLORS[group] ?? "bg-gray-50 border-gray-200"}`}>
          <div className="px-4 py-2 font-semibold text-sm text-gray-700 border-b bg-white/60">{group}</div>
          <div className="divide-y">
            {groupRules.map(rule => (
              <div key={rule.id} className="flex flex-wrap items-center gap-3 p-3 bg-white/80 hover:bg-white transition-colors">
                <Toggle checked={rule.enabled} onChange={v => toggle(rule.id, v)} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-800">{rule.name}</div>
                  <div className="text-xs text-gray-500 truncate">{rule.description}</div>
                  <div className="text-xs text-gray-400 mt-0.5 font-mono">{rule.trigger_type}</div>
                </div>
                <div className="flex gap-1">
                  {testResult?.id === rule.id && (
                    <span className={`text-xs px-2 py-1 rounded ${testResult!.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {testResult!.msg}
                    </span>
                  )}
                  <button
                    onClick={() => testRule(rule.id)}
                    disabled={testing === rule.id}
                    className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-50"
                  >
                    {testing === rule.id ? "..." : "Test"}
                  </button>
                  <button
                    onClick={() => cloneRule(rule.id)}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Clone
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LogsTab({ statusFilter }: { statusFilter: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [trigger, setTrigger] = useState("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [retrying, setRetrying] = useState<number | null>(null);
  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter === "all" ? "all" : statusFilter,
        trigger,
        search,
        limit: String(limit),
        offset: String(offset),
      });
      const r = await fetch(apiUrl(`/api/workflows/logs?${params}`), { credentials: "include" });
      const data = await r.json();
      setLogs(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch {}
    setLoading(false);
  }, [statusFilter, trigger, search, offset]);

  useEffect(() => { setOffset(0); }, [trigger, search, statusFilter]);
  useEffect(() => { load(); }, [load]);

  const retry = async (id: number) => {
    setRetrying(id);
    await fetch(apiUrl(`/api/workflows/retry/${id}`), { method: "POST", credentials: "include" });
    await load();
    setRetrying(null);
  };

  const retryAll = async () => {
    await fetch(apiUrl("/api/workflows/retry-all-failed"), { method: "POST", credentials: "include" });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          placeholder="Search customer or booking…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm w-52"
        />
        <select value={trigger} onChange={e => setTrigger(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
          <option value="all">All Triggers</option>
          {["new_booking","booking_approved","booking_rejected","payment_received","payment_reminder_30","payment_reminder_15","payment_reminder_7","payment_reminder_3","payment_reminder_1","visa_approved","visa_rejected","flight_assigned","hotel_assigned","bus_assigned","departure_reminder_7d","departure_reminder_3d","departure_reminder_1d","departure_reminder_12h","departure_reminder_6h","return_reminder","feedback_request","document_expiry_90","document_expiry_60","document_expiry_30","document_expiry_7","medical_emergency"].map(t => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>
        {statusFilter === "failed" && (
          <button onClick={retryAll} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700">
            Retry All Failed
          </button>
        )}
        <span className="text-sm text-gray-500 ml-auto">{total} total</span>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No logs found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left p-2 font-medium text-gray-600">Trigger</th>
                <th className="text-left p-2 font-medium text-gray-600">Customer</th>
                <th className="text-left p-2 font-medium text-gray-600">Booking</th>
                <th className="text-left p-2 font-medium text-gray-600">Status</th>
                <th className="text-left p-2 font-medium text-gray-600">Time (ms)</th>
                <th className="text-left p-2 font-medium text-gray-600">Retries</th>
                <th className="text-left p-2 font-medium text-gray-600">When</th>
                <th className="text-left p-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="p-2 font-mono text-xs text-gray-700">{log.trigger_type.replace(/_/g, " ")}</td>
                  <td className="p-2 text-gray-700">{log.customer_name ?? "—"}</td>
                  <td className="p-2 text-gray-500 font-mono text-xs">{log.booking_id ?? "—"}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[log.status] ?? "bg-gray-100"}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="p-2 text-gray-500">{log.execution_time_ms ?? "—"}</td>
                  <td className="p-2 text-gray-500">{log.retry_count}/3</td>
                  <td className="p-2 text-gray-400 text-xs">{new Date(log.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="p-2">
                    {log.status === "failed" && log.retry_count < 3 && (
                      <button
                        onClick={() => retry(log.id)}
                        disabled={retrying === log.id}
                        className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 disabled:opacity-50"
                      >
                        {retrying === log.id ? "…" : "Retry"}
                      </button>
                    )}
                    {log.error_message && (
                      <span className="text-xs text-red-500 ml-1 truncate max-w-xs block">{log.error_message.substring(0, 40)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 justify-center pt-2">
        <button disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - limit))} className="px-3 py-1 text-sm border rounded disabled:opacity-40">← Prev</button>
        <span className="text-sm text-gray-500 self-center">{Math.floor(offset / limit) + 1} / {Math.max(1, Math.ceil(total / limit))}</span>
        <button disabled={offset + limit >= total} onClick={() => setOffset(o => o + limit)} className="px-3 py-1 text-sm border rounded disabled:opacity-40">Next →</button>
      </div>
    </div>
  );
}

function TimelineTab() {
  const [bookingId, setBookingId] = useState("");
  const [input, setInput] = useState("");
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setBookingId(input.trim());
    try {
      const r = await fetch(apiUrl(`/api/workflows/timeline/${encodeURIComponent(input.trim())}`), { credentials: "include" });
      const data = await r.json();
      setTimeline(data);
    } catch {}
    setLoading(false);
  };

  return (
    <AdminLayout>
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          placeholder="Enter Booking ID or Number…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && load()}
          className="border rounded px-3 py-2 text-sm flex-1 max-w-sm"
        />
        <button onClick={load} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700">
          Load Timeline
        </button>
      </div>

      {loading && <div className="text-center py-8 text-gray-400">Loading...</div>}

      {!loading && bookingId && timeline.length === 0 && (
        <div className="text-center py-12 text-gray-400">No timeline events for this booking yet.</div>
      )}

      {timeline.length > 0 && (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />
          <div className="space-y-4">
            {timeline.map((event, i) => (
              <div key={event.id ?? i} className="flex gap-4 relative">
                <div className="w-10 h-10 flex-shrink-0 rounded-full bg-white border-2 border-indigo-300 flex items-center justify-center text-lg z-10">
                  {event.icon ?? "📌"}
                </div>
                <div className="flex-1 bg-white border rounded-xl p-3 shadow-sm">
                  <div className="font-semibold text-sm text-gray-800">{event.title}</div>
                  {event.description && <div className="text-sm text-gray-500 mt-0.5">{event.description}</div>}
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(event.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </AdminLayout>
  );
}
