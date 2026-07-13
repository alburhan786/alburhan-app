import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

interface WorkflowRule {
  id: string;
  name: string;
  trigger_type: string;
  description: string;
  group_name: string;
  enabled: boolean;
}

interface WorkflowLog {
  id: string;
  trigger_type: string;
  status: string;
  customer_name: string;
  customer_mobile: string;
  started_at: string;
  completed_at: string;
  execution_time_ms: number;
  retry_count: number;
  error_message: string;
}

interface Stats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
}

const PIPELINE_STEPS = [
  { step: 1, title: "Customer Enquiry", icon: "💬", triggers: [], color: "blue", desc: "Lead created, sales assigned, follow-up created" },
  { step: 2, title: "Booking Request", icon: "📋", triggers: ["new_booking"], color: "indigo", desc: "Booking ID generated, seat reserved, admin notified" },
  { step: 3, title: "Booking Approved", icon: "✅", triggers: ["booking_approved"], color: "green", desc: "Invoice generated, ledger created, notifications sent" },
  { step: 4, title: "Payment Received", icon: "💰", triggers: ["payment_received"], color: "emerald", desc: "Receipt generated, ledger updated, WhatsApp + Email" },
  { step: 5, title: "Balance Reminders", icon: "⏰", triggers: ["balance_reminder_30", "balance_reminder_15", "balance_reminder_7", "balance_reminder_3", "balance_reminder_1", "balance_overdue"], color: "amber", desc: "30 / 15 / 7 / 3 / 1 day + overdue every 7 days" },
  { step: 6, title: "Document Collection", icon: "📄", triggers: ["document_reminder"], color: "orange", desc: "Remind every 3 days until passport, photo, docs uploaded" },
  { step: 7, title: "Visa", icon: "🛂", triggers: ["visa_approved", "visa_rejected"], color: "purple", desc: "Visa status → WhatsApp + Email + PDF to portal" },
  { step: 8, title: "Flight Assigned", icon: "✈️", triggers: ["flight_assigned"], color: "sky", desc: "Ticket, terminal, baggage rules, reporting time sent" },
  { step: 9, title: "Hotel / Room", icon: "🏨", triggers: ["hotel_assigned"], color: "teal", desc: "Hotel name, room number, Google Maps sent" },
  { step: 10, title: "Bus Assigned", icon: "🚌", triggers: ["bus_assigned"], color: "cyan", desc: "Bus number, seat, driver, reporting time sent" },
  { step: 11, title: "Departure Reminders", icon: "🛫", triggers: ["departure_reminder_7d", "departure_reminder_3d", "departure_reminder_1d", "departure_reminder_12h", "departure_reminder_6h", "departure_reminder_2h"], color: "blue", desc: "7d / 3d / 1d / 12h / 6h / 2h before departure" },
  { step: 12, title: "Airport Check-in", icon: "🎫", triggers: [], color: "slate", desc: "QR attendance, luggage status, boarding reminder" },
  { step: 13, title: "Arrival", icon: "🏠", triggers: [], color: "slate", desc: "Hotel check-in, room confirmation, meal timing" },
  { step: 14, title: "Ziyarat", icon: "🕌", triggers: ["ziyarat_reminder"], color: "violet", desc: "Bus number, departure time, guide, meeting point" },
  { step: 15, title: "Return Flight", icon: "🔄", triggers: ["return_reminder"], color: "blue", desc: "Return flight details, reporting time, baggage rules" },
  { step: 16, title: "Trip Completed", icon: "🎉", triggers: ["booking_completed", "feedback_request"], color: "green", desc: "Thank you + feedback form + Google Review + referral" },
  { step: 17, title: "Loyalty & Rewards", icon: "⭐", triggers: [], color: "yellow", desc: "Auto-calculate points, tier, VIP status, discounts" },
  { step: 18, title: "Admin Alerts", icon: "🔔", triggers: ["medical_emergency"], color: "red", desc: "Popup + sound + browser notification for critical events" },
  { step: 19, title: "Multi-Channel", icon: "📡", triggers: [], color: "slate", desc: "WhatsApp + SMS + Email + RCS + Push — every automation" },
  { step: 20, title: "Document Generation", icon: "🖨️", triggers: [], color: "slate", desc: "Invoice, receipt, visa, ticket, hotel voucher, QR card" },
  { step: 21, title: "Workflow Logs", icon: "📊", triggers: [], color: "slate", desc: "Who, when, status, delivery, errors — all logged" },
  { step: 22, title: "Retry Engine", icon: "🔁", triggers: [], color: "slate", desc: "Auto-retry up to 3 times if WhatsApp / SMS / Email fails" },
  { step: 23, title: "Background Scheduler", icon: "⚙️", triggers: [], color: "slate", desc: "Crons run automatically — balance, document, departure, ziyarat" },
  { step: 24, title: "Reports & Analytics", icon: "📈", triggers: [], color: "slate", desc: "Messages sent, delivery rates, success vs failed stats" },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200 text-blue-700",
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
  green: "bg-green-50 border-green-200 text-green-700",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  amber: "bg-amber-50 border-amber-200 text-amber-700",
  orange: "bg-orange-50 border-orange-200 text-orange-700",
  purple: "bg-purple-50 border-purple-200 text-purple-700",
  sky: "bg-sky-50 border-sky-200 text-sky-700",
  teal: "bg-teal-50 border-teal-200 text-teal-700",
  cyan: "bg-cyan-50 border-cyan-200 text-cyan-700",
  violet: "bg-violet-50 border-violet-200 text-violet-700",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
  red: "bg-red-50 border-red-200 text-red-700",
  slate: "bg-slate-50 border-slate-200 text-slate-600",
};

export default function AutomationCenter() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, failed: 0, running: 0, pending: 0 });
  const [tab, setTab] = useState<"pipeline" | "rules" | "logs">("pipeline");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [rulesRes, logsRes] = await Promise.all([
          fetch(`${API}/api/workflows/rules`, { credentials: "include" }),
          fetch(`${API}/api/workflows/logs?limit=30`, { credentials: "include" }),
        ]);
        if (rulesRes.ok) setRules(await rulesRes.json());
        if (logsRes.ok) {
          const data = await logsRes.json();
          setLogs(data.logs || []);
          if (data.stats) setStats(data.stats);
        }
      } catch {}
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const toggleRule = async (rule: WorkflowRule) => {
    setTogglingId(rule.id);
    try {
      const res = await fetch(`${API}/api/workflows/rules/${rule.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      }
    } catch {}
    setTogglingId(null);
  };

  const triggerStatus = (triggerType: string) => {
    const rule = rules.find(r => r.trigger_type === triggerType);
    if (!rule) return "unknown";
    return rule.enabled ? "active" : "disabled";
  };

  const stepStatus = (step: typeof PIPELINE_STEPS[0]) => {
    if (step.triggers.length === 0) return "system";
    const allActive = step.triggers.every(t => triggerStatus(t) === "active");
    const anyActive = step.triggers.some(t => triggerStatus(t) === "active");
    return allActive ? "active" : anyActive ? "partial" : "disabled";
  };

  const recentForTriggers = (triggers: string[]) => {
    if (!triggers.length) return [];
    return logs.filter(l => triggers.includes(l.trigger_type)).slice(0, 3);
  };

  const enabledCount = rules.filter(r => r.enabled).length;
  const totalRules = rules.length;

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Automation Center</h1>
        <p className="text-slate-500 mt-1">24-step end-to-end business automation engine — every customer and staff action triggers automatic workflows</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Logs", value: stats.total, color: "text-slate-700" },
          { label: "Completed", value: stats.completed, color: "text-green-600" },
          { label: "Failed", value: stats.failed, color: "text-red-600" },
          { label: "Active Rules", value: enabledCount, color: "text-blue-600" },
          { label: "Total Rules", value: totalRules, color: "text-slate-600" },
        ].map(s => (
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
            <div className={`text-2xl font-bold ${s.color}`}>{loading ? "—" : s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        {(["pipeline", "rules", "logs"] as const).map(t => (
          <button
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t === "pipeline" ? "🔗 Pipeline View" : t === "rules" ? "⚙️ Automation Rules" : "📊 Recent Logs"}
          </button>
        ))}
      </div>

      {/* Pipeline View */}
      {tab === "pipeline" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PIPELINE_STEPS.map(step => {
            const status = stepStatus(step);
            const recent = recentForTriggers(step.triggers);
            const cls = colorMap[step.color] || colorMap.slate;
            return (
              <div className={`border rounded-xl p-4 ${cls} relative`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{step.icon}</span>
                    <div>
                      <div className="font-semibold text-sm">
                        <span className="opacity-60 mr-1">Step {step.step}.</span>
                        {step.title}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    status === "active" ? "bg-green-100 text-green-700" :
                    status === "partial" ? "bg-amber-100 text-amber-700" :
                    status === "system" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>
                    {status === "active" ? "✓ Active" : status === "partial" ? "⚡ Partial" : status === "system" ? "⚙ System" : "○ Off"}
                  </span>
                </div>
                <p className="text-xs opacity-75 mb-3">{step.desc}</p>
                {step.triggers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {step.triggers.map(t => {
                      const rule = rules.find(r => r.trigger_type === t);
                      return (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${rule?.enabled ? "bg-green-200 text-green-800" : "bg-slate-200 text-slate-500"}`}>
                          {t.replace(/_/g, " ")}
                        </span>
                      );
                    })}
                  </div>
                )}
                {recent.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {recent.map(log => (
                      <div className="flex items-center gap-1 text-xs opacity-70">
                        <span>{log.status === "completed" ? "✓" : log.status === "failed" ? "✗" : "⟳"}</span>
                        <span className="truncate">{log.customer_name}</span>
                        <span className="ml-auto shrink-0">{new Date(log.started_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rules View */}
      {tab === "rules" && (
        <div className="space-y-4">
          {Object.entries(
            rules.reduce((acc, r) => {
              if (!acc[r.group_name]) acc[r.group_name] = [];
              acc[r.group_name].push(r);
              return acc;
            }, {} as Record<string, WorkflowRule[]>)
          ).map(([group, groupRules]) => (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">{group}</h3>
                <span className="text-xs text-slate-500">{groupRules.filter(r => r.enabled).length}/{groupRules.length} active</span>
              </div>
              <div className="divide-y divide-slate-100">
                {groupRules.map(rule => (
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-slate-800">{rule.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{rule.description}</div>
                      <code className="text-xs text-slate-400 font-mono">{rule.trigger_type}</code>
                    </div>
                    <button
                      onClick={() => toggleRule(rule)}
                      disabled={togglingId === rule.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${rule.enabled ? "bg-blue-600" : "bg-slate-300"} ${togglingId === rule.id ? "opacity-50" : ""}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${rule.enabled ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Logs View */}
      {tab === "logs" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Trigger", "Customer", "Status", "Time", "Duration", "Retries"].map(h => (
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No workflow logs yet</td></tr>
              ) : logs.map(log => (
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <code className="text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{log.trigger_type}</code>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{log.customer_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      log.status === "completed" ? "bg-green-100 text-green-700" :
                      log.status === "failed" ? "bg-red-100 text-red-700" :
                      log.status === "running" ? "bg-blue-100 text-blue-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {log.status === "completed" ? "✓" : log.status === "failed" ? "✗" : "⟳"} {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(log.started_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{log.execution_time_ms ? `${log.execution_time_ms}ms` : "—"}</td>
                  <td className="px-4 py-3">
                    {log.retry_count > 0 ? (
                      <span className="text-xs text-amber-600 font-medium">{log.retry_count}x</span>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
