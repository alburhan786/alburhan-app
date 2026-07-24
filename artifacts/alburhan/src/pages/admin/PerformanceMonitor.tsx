import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

type PerfData = {
  generatedAt: string; responseTime_ms: number;
  memory: { heapUsed_mb: number; heapTotal_mb: number; rss_mb: number; system_used_mb: number; system_total_mb: number; pct: number };
  cpu: { user_ms: number; system_ms: number; load_avg: number[]; cpu_count: number; load_1m_pct: number };
  database: { response_ms: number; status: string };
  queue: { pending: number; exhausted: number; sent: number };
  notifications: { total_24h: number; sent_24h: number; last_hour: number };
  storage: { document_count: number; total_bytes: number; total_mb: number };
  errors: { last_hour: number };
};

function Gauge({ value, max = 100, label, color }: { value: number; max?: number; label: string; color: string }) {
  const pct = Math.min(Math.round(value / max * 100), 100);
  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center w-24 h-24">
        <svg className="absolute w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="38" fill="none" stroke="#f3f4f6" strokeWidth="10" />
          <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${pct * 2.39} 239`} strokeLinecap="round" />
        </svg>
        <div className="text-center z-10">
          <div className="text-xl font-bold text-gray-800">{value}</div>
          <div className="text-xs text-gray-400">/ {max}</div>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok")   return <Badge className="bg-green-100 text-green-700 border-green-200">✓ OK</Badge>;
  if (status === "warn") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">⚠ SLOW</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200">✗ ERROR</Badge>;
}

function MetricRow({ label, value, unit = "", status }: { label: string; value: string | number; unit?: string; status?: "ok"|"warn"|"error" }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        {status && <StatusBadge status={status} />}
        <span className="text-sm font-semibold text-gray-800">{value}{unit && <span className="text-gray-400 font-normal ml-1">{unit}</span>}</span>
      </div>
    </div>
  );
}

export default function PerformanceMonitor() {
  const { can } = usePermissions();
  const [data, setData]       = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const timerRef = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/performance`, { credentials: "include" });
      const d = await r.json();
      setData(d);
      setHistory(prev => [...prev.slice(-19), d.database?.response_ms || 0]);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(load, 10000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, load]);

  if (!can("system:health")) {
    return <AdminLayout><div className="p-8 text-gray-500">Access restricted.</div></AdminLayout>;
  }

  const memPct  = data?.memory.pct || 0;
  const cpuPct  = data?.cpu.load_1m_pct || 0;
  const dbMs    = data?.database.response_ms || 0;

  const memColor  = memPct > 90 ? "#ef4444" : memPct > 75 ? "#f59e0b" : "#22c55e";
  const cpuColor  = cpuPct > 90 ? "#ef4444" : cpuPct > 70 ? "#f59e0b" : "#22c55e";
  const dbColor   = dbMs  > 500 ? "#ef4444" : dbMs  > 100 ? "#f59e0b" : "#22c55e";

  const histMax = Math.max(...history, 50);

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Performance Monitor</h1>
            <p className="text-gray-500 text-sm mt-1">
              {data ? `Last updated: ${new Date(data.generatedAt).toLocaleTimeString("en-IN")}` : "Loading..."}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded" />
              Auto-refresh (10s)
            </label>
            <Button onClick={load} disabled={loading} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-4 py-2">
              {loading ? "⏳" : "🔄"} Refresh
            </Button>
          </div>
        </div>

        {/* Gauge Row */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex justify-around items-center">
            <Gauge value={memPct} max={100} label="System Memory %" color={memColor} />
            <Gauge value={cpuPct} max={100} label="CPU Load %" color={cpuColor} />
            <Gauge value={dbMs} max={500} label="DB Response ms" color={dbColor} />
            <Gauge value={data?.queue.pending || 0} max={10} label="Queue Pending" color="#6366f1" />
            <Gauge value={data?.errors.last_hour || 0} max={20} label="Errors/Hour" color="#ef4444" />
          </div>
        </div>

        {/* Detail Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Memory */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>🧠</span> Memory
            </div>
            {data ? <>
              <MetricRow label="Heap Used"      value={data.memory.heapUsed_mb}   unit="MB" />
              <MetricRow label="Heap Total"     value={data.memory.heapTotal_mb}  unit="MB" />
              <MetricRow label="RSS"            value={data.memory.rss_mb}        unit="MB" />
              <MetricRow label="System Used"    value={data.memory.system_used_mb} unit="MB" />
              <MetricRow label="System Total"   value={data.memory.system_total_mb} unit="MB" />
              <MetricRow label="Usage"          value={`${data.memory.pct}%`} status={data.memory.pct > 90 ? "error" : data.memory.pct > 75 ? "warn" : "ok"} />
            </> : <div className="text-gray-400 text-sm">Loading...</div>}
          </div>

          {/* CPU */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>⚡</span> CPU
            </div>
            {data ? <>
              <MetricRow label="Load Avg 1m"  value={data.cpu.load_avg[0]?.toFixed(2) || "0"} status={cpuPct > 90 ? "error" : cpuPct > 70 ? "warn" : "ok"} />
              <MetricRow label="Load Avg 5m"  value={data.cpu.load_avg[1]?.toFixed(2) || "0"} />
              <MetricRow label="Load Avg 15m" value={data.cpu.load_avg[2]?.toFixed(2) || "0"} />
              <MetricRow label="CPU Cores"    value={data.cpu.cpu_count} />
              <MetricRow label="Load %"       value={`${data.cpu.load_1m_pct}%`} />
            </> : <div className="text-gray-400 text-sm">Loading...</div>}
          </div>

          {/* Database */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>🗄️</span> Database
            </div>
            {data ? <>
              <MetricRow label="Response Time"  value={data.database.response_ms} unit="ms"
                status={data.database.status as any} />
              <MetricRow label="API Response"   value={data.responseTime_ms} unit="ms" />
            </> : <div className="text-gray-400 text-sm">Loading...</div>}

            {/* DB response history sparkline */}
            {history.length > 1 && (
              <div className="mt-3">
                <div className="text-xs text-gray-400 mb-1">DB Response History</div>
                <div className="flex items-end gap-0.5 h-12">
                  {history.map((v, i) => (
                    <div key={i} className="flex-1 rounded-t"
                      style={{ height: `${Math.max(4, (v / histMax) * 100)}%`, background: v > 500 ? "#ef4444" : v > 100 ? "#f59e0b" : "#22c55e" }}
                      title={`${v}ms`} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Queue */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>📬</span> Notification Queue
            </div>
            {data ? <>
              <MetricRow label="Pending"   value={data.queue.pending}   status={data.queue.pending > 50 ? "error" : data.queue.pending > 10 ? "warn" : "ok"} />
              <MetricRow label="Exhausted" value={data.queue.exhausted} status={data.queue.exhausted > 5 ? "warn" : "ok"} />
              <MetricRow label="Delivered" value={data.queue.sent} />
            </> : <div className="text-gray-400 text-sm">Loading...</div>}
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>🔔</span> Notification Throughput
            </div>
            {data ? <>
              <MetricRow label="Sent (Last Hour)" value={data.notifications.last_hour} />
              <MetricRow label="Sent (24h)"        value={data.notifications.sent_24h} />
              <MetricRow label="Total (24h)"       value={data.notifications.total_24h} />
              <MetricRow label="Delivery Rate"     value={data.notifications.total_24h > 0 ? `${Math.round(data.notifications.sent_24h / data.notifications.total_24h * 100)}%` : "N/A"} />
            </> : <div className="text-gray-400 text-sm">Loading...</div>}
          </div>

          {/* Storage */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>📦</span> Object Storage
            </div>
            {data ? <>
              <MetricRow label="Documents"    value={data.storage.document_count} />
              <MetricRow label="Storage Used" value={data.storage.total_mb} unit="MB" />
              <MetricRow label="Avg per Doc"  value={data.storage.document_count > 0 ? `${Math.round(data.storage.total_mb / data.storage.document_count * 1024)}` : "0"} unit="KB" />
            </> : <div className="text-gray-400 text-sm">Loading...</div>}
          </div>
        </div>

        {/* System Status Summary */}
        {data && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="font-semibold text-gray-800 mb-3">System Status Summary</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Memory",      status: data.memory.pct > 90 ? "error" : data.memory.pct > 75 ? "warn" : "ok", value: `${data.memory.pct}% used` },
                { label: "CPU",         status: cpuPct > 90 ? "error" : cpuPct > 70 ? "warn" : "ok",   value: `${cpuPct}% load` },
                { label: "Database",    status: data.database.status as any,                            value: `${data.database.response_ms}ms` },
                { label: "Queue",       status: data.queue.pending > 50 ? "error" : data.queue.pending > 10 ? "warn" : "ok", value: `${data.queue.pending} pending` },
                { label: "API Response",status: data.responseTime_ms < 200 ? "ok" : data.responseTime_ms < 1000 ? "warn" : "error", value: `${data.responseTime_ms}ms` },
                { label: "Error Rate",  status: data.errors.last_hour > 20 ? "error" : data.errors.last_hour > 5 ? "warn" : "ok", value: `${data.errors.last_hour}/hr` },
                { label: "Notif Queue", status: data.queue.exhausted > 5 ? "warn" : "ok", value: `${data.queue.exhausted} exhausted` },
                { label: "Storage",     status: "ok", value: `${data.storage.total_mb} MB` },
              ].map(item => (
                <div key={item.label} className={`rounded-lg p-3 border ${
                  item.status === "error" ? "border-red-200 bg-red-50" :
                  item.status === "warn"  ? "border-yellow-200 bg-yellow-50" : "border-green-200 bg-green-50"
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600">{item.label}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="text-sm font-semibold text-gray-800">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
