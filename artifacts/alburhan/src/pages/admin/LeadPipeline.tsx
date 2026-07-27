// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Search, Plus, ChevronRight, Phone, Mail, User,
  Calendar, Clock, AlertCircle, CheckCircle2, X, ArrowRight,
  BarChart3, Filter, Flame, Thermometer, Snowflake, Star,
  MessageCircle, FileText, ChevronDown, ChevronUp, Activity,
  Users, TrendingUp, Target, Edit2, Save,
} from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

// ── 26-stage pipeline config ──────────────────────────────────────────────────
const STAGES = [
  { key: "new_lead",                label: "New Lead",                color: "#6366f1", emoji: "🆕" },
  { key: "auto_response_sent",      label: "Auto Response",           color: "#8b5cf6", emoji: "🤖" },
  { key: "assigned",                label: "Assigned",                color: "#a855f7", emoji: "👤" },
  { key: "contact_attempted",       label: "Contact Attempted",       color: "#ec4899", emoji: "📞" },
  { key: "contacted",               label: "Contacted",               color: "#f59e0b", emoji: "✅" },
  { key: "interested",              label: "Interested",              color: "#f97316", emoji: "🔥" },
  { key: "package_shared",          label: "Package Shared",          color: "#10b981", emoji: "📦" },
  { key: "quotation_sent",          label: "Quotation Sent",          color: "#06b6d4", emoji: "📋" },
  { key: "passport_awaited",        label: "Passport Awaited",        color: "#3b82f6", emoji: "🛂" },
  { key: "documents_received",      label: "Documents Received",      color: "#0ea5e9", emoji: "📁" },
  { key: "advance_payment_pending", label: "Advance Pending",         color: "#f59e0b", emoji: "💳" },
  { key: "advance_paid",            label: "Advance Paid",            color: "#84cc16", emoji: "💰" },
  { key: "agreement_pending",       label: "Agreement Pending",       color: "#eab308", emoji: "📝" },
  { key: "agreement_signed",        label: "Agreement Signed",        color: "#22c55e", emoji: "✍️" },
  { key: "visa_processing",         label: "Visa Processing",         color: "#14b8a6", emoji: "🛂" },
  { key: "ticket_pending",          label: "Ticket Pending",          color: "#f97316", emoji: "✈️" },
  { key: "ticket_issued",           label: "Ticket Issued",           color: "#10b981", emoji: "🎫" },
  { key: "hotel_confirmed",         label: "Hotel Confirmed",         color: "#06b6d4", emoji: "🏨" },
  { key: "balance_payment_pending", label: "Balance Pending",         color: "#fb923c", emoji: "💸" },
  { key: "full_payment_received",   label: "Full Payment",            color: "#22c55e", emoji: "🏆" },
  { key: "travel_ready",            label: "Travel Ready",            color: "#16a34a", emoji: "🧳" },
  { key: "travel_completed",        label: "Travel Completed",        color: "#15803d", emoji: "🕌" },
  { key: "review_requested",        label: "Review Requested",        color: "#8b5cf6", emoji: "⭐" },
  { key: "future_remarketing",      label: "Future Remarketing",      color: "#6366f1", emoji: "🔄" },
  { key: "lost",                    label: "Lost",                    color: "#ef4444", emoji: "❌" },
  { key: "spam",                    label: "Spam",                    color: "#6b7280", emoji: "🚫" },
];

const SCORE_ICON: Record<string, React.ReactNode> = {
  hot:  <Flame size={12} className="text-red-500" />,
  warm: <Thermometer size={12} className="text-orange-400" />,
  cold: <Snowflake size={12} className="text-blue-400" />,
};

function timeAgo(ts: string) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Lead Card ─────────────────────────────────────────────────────────────────
function LeadCard({ lead, stages, onMoveStage, onSelect }: any) {
  const [showMover, setShowMover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowMover(false);
    };
    if (showMover) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMover]);

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-3 mb-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => onSelect(lead)}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">{lead.name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown"}</p>
          {lead.lead_number && <p className="text-xs text-gray-400">{lead.lead_number}</p>}
        </div>
        <div className="flex items-center gap-1 ml-1 flex-shrink-0">
          {lead.score && SCORE_ICON[lead.score]}
          {lead.pending_followups > 0 && (
            <span className="text-xs bg-red-100 text-red-700 rounded px-1">{lead.pending_followups}</span>
          )}
        </div>
      </div>

      {lead.mobile && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <Phone size={10} />{lead.mobile}
        </p>
      )}
      {lead.package_interest && (
        <p className="text-xs text-gray-500 truncate">{lead.package_interest}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1">
          {lead.budget && (
            <span className="text-xs bg-green-50 text-green-700 px-1 rounded">₹{Number(lead.budget).toLocaleString()}</span>
          )}
          {lead.source && (
            <span className="text-xs text-gray-400">{lead.source}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {lead.activity_count > 0 && (
            <span className="text-xs text-gray-400 flex items-center gap-0.5"><Activity size={9} />{lead.activity_count}</span>
          )}
          <span className="text-xs text-gray-400">{timeAgo(lead.pipeline_updated_at || lead.updated_at)}</span>
        </div>
      </div>

      {/* Move stage button */}
      <div className="relative mt-2" ref={ref}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMover(!showMover); }}
          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ArrowRight size={10} /> Move stage
        </button>
        {showMover && (
          <div className="absolute z-50 bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-xl w-52 max-h-64 overflow-y-auto">
            {stages.map((s: any) => (
              <button
                key={s.key}
                onClick={(e) => { e.stopPropagation(); onMoveStage(lead.id, s.key); setShowMover(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${s.key === lead.pipeline_stage ? "bg-indigo-50 text-indigo-700 font-semibold" : ""}`}
              >
                <span>{s.emoji}</span> {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lead Detail Panel ─────────────────────────────────────────────────────────
function LeadDetailPanel({ lead, onClose, onRefresh }: any) {
  const { toast } = useToast();
  const [activities, setActivities] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [noteText, setNoteText] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [addingFollowup, setAddingFollowup] = useState(false);
  const [followupForm, setFollowupForm] = useState({ title: "", type: "call", due_at: "" });
  const [tab, setTab] = useState<"activity"|"followup">("activity");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lead?.id) return;
    Promise.all([
      fetch(`${BASE_API}/api/crm/leads/${lead.id}/activities`, { credentials: "include" }).then(r => r.json()),
      fetch(`${BASE_API}/api/crm/leads/${lead.id}/followups`, { credentials: "include" }).then(r => r.json()),
    ]).then(([a, f]) => {
      if (a.ok) setActivities(a.activities || []);
      if (f.ok) setFollowups(f.followups || []);
    }).catch(() => {});
  }, [lead?.id]);

  const addNote = async () => {
    if (!noteText.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/crm/leads/${lead.id}/activities`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: activityType, content: noteText }),
      });
      const data = await r.json();
      if (data.ok) {
        setActivities(prev => [data.activity, ...prev]);
        setNoteText("");
        toast({ title: "Activity logged" });
      }
    } finally { setLoading(false); }
  };

  const addFollowup = async () => {
    if (!followupForm.title.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/crm/leads/${lead.id}/followups`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(followupForm),
      });
      const data = await r.json();
      if (data.ok) {
        setFollowups(prev => [data.followup, ...prev]);
        setFollowupForm({ title: "", type: "call", due_at: "" });
        setAddingFollowup(false);
        toast({ title: "Follow-up scheduled" });
      }
    } finally { setLoading(false); }
  };

  const completeFollowup = async (fid: string) => {
    await fetch(`${BASE_API}/api/crm/leads/${lead.id}/followups/${fid}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    setFollowups(prev => prev.map(f => f.id === fid ? { ...f, status: "completed" } : f));
  };

  const ACT_ICONS: Record<string, string> = {
    note: "📝", call: "📞", email: "📧", sms: "💬", whatsapp: "💚",
    stage_change: "🔄", followup_created: "📅", followup_completed: "✅",
    message: "💬", system: "⚙️",
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div>
          <h3 className="font-semibold text-gray-900">{lead.name || "Lead Detail"}</h3>
          <p className="text-xs text-gray-500">{lead.lead_number} · {lead.mobile || lead.email}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      {/* Lead info strip */}
      <div className="px-4 py-2 border-b bg-white flex flex-wrap gap-2 text-xs">
        {lead.source && <Badge variant="outline">{lead.source}</Badge>}
        {lead.score && <Badge variant="outline" className="flex items-center gap-1">{SCORE_ICON[lead.score]} {lead.score}</Badge>}
        {lead.budget && <span className="text-green-700 font-medium">₹{Number(lead.budget).toLocaleString()}</span>}
        {lead.package_interest && <span className="text-gray-600 truncate max-w-[200px]">{lead.package_interest}</span>}
        {lead.travel_month && <span className="text-indigo-600">{lead.travel_month}</span>}
        {lead.num_travellers > 1 && <span className="text-gray-500">{lead.num_travellers} travellers</span>}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(["activity","followup"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium ${tab===t ? "border-b-2 border-indigo-600 text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}>
            {t === "activity" ? `Activity (${activities.length})` : `Follow-ups (${followups.filter(f => f.status==="pending").length} pending)`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "activity" && (
          <div className="p-3">
            {/* Add note */}
            <div className="mb-3 bg-gray-50 rounded-lg p-3">
              <div className="flex gap-1 mb-2 flex-wrap">
                {["note","call","email","sms","whatsapp","message"].map(t => (
                  <button key={t} onClick={() => setActivityType(t)}
                    className={`text-xs px-2 py-0.5 rounded-full border ${activityType===t ? "bg-indigo-600 text-white border-indigo-600" : "text-gray-600 border-gray-300"}`}>
                    {ACT_ICONS[t]} {t}
                  </button>
                ))}
              </div>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Log a note, call, or message..."
                className="w-full text-xs border border-gray-200 rounded p-2 h-16 resize-none"
              />
              <Button size="sm" className="mt-1 w-full h-7 text-xs" onClick={addNote} disabled={loading || !noteText.trim()}>
                Log Activity
              </Button>
            </div>

            {/* Activity timeline */}
            <div className="space-y-2">
              {activities.map(a => (
                <div key={a.id} className="flex gap-2 text-xs">
                  <span className="mt-0.5 flex-shrink-0">{ACT_ICONS[a.type] || "📌"}</span>
                  <div className="flex-1 border-b border-gray-100 pb-2">
                    <p className="text-gray-700">{a.content}</p>
                    <p className="text-gray-400 mt-0.5">{a.performed_by_name || "Admin"} · {timeAgo(a.created_at)}</p>
                  </div>
                </div>
              ))}
              {activities.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No activity yet</p>}
            </div>
          </div>
        )}

        {tab === "followup" && (
          <div className="p-3">
            {/* Add followup */}
            {!addingFollowup ? (
              <button onClick={() => setAddingFollowup(true)}
                className="w-full text-xs border-2 border-dashed border-gray-200 rounded-lg py-2 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 mb-3 flex items-center justify-center gap-1">
                <Plus size={12} /> Schedule Follow-up
              </button>
            ) : (
              <div className="mb-3 bg-gray-50 rounded-lg p-3 space-y-2">
                <Input placeholder="Follow-up title" className="h-7 text-xs"
                  value={followupForm.title} onChange={e => setFollowupForm(p => ({...p, title: e.target.value}))} />
                <div className="flex gap-2">
                  <select className="flex-1 text-xs border border-gray-200 rounded px-2 h-7"
                    value={followupForm.type} onChange={e => setFollowupForm(p => ({...p, type: e.target.value}))}>
                    {["call","email","whatsapp","visit","task","other"].map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input type="datetime-local" className="flex-1 text-xs border border-gray-200 rounded px-2 h-7"
                    value={followupForm.due_at} onChange={e => setFollowupForm(p => ({...p, due_at: e.target.value}))} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={addFollowup} disabled={loading}>Save</Button>
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setAddingFollowup(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Followups list */}
            <div className="space-y-2">
              {followups.map(f => (
                <div key={f.id} className={`border rounded-lg p-2 text-xs ${f.status==="completed" ? "opacity-50 bg-gray-50" : "bg-white"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{f.title}</p>
                      <p className="text-gray-500">{f.type} {f.due_at ? `· ${new Date(f.due_at).toLocaleString("en-IN", {dateStyle:"short",timeStyle:"short"})}` : ""}</p>
                    </div>
                    {f.status === "pending" && (
                      <button onClick={() => completeFollowup(f.id)}
                        className="text-green-600 hover:text-green-800 flex items-center gap-1 ml-2">
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                  </div>
                  {f.due_at && new Date(f.due_at) < new Date() && f.status==="pending" && (
                    <p className="text-red-500 flex items-center gap-1 mt-1"><AlertCircle size={10} /> Overdue</p>
                  )}
                </div>
              ))}
              {followups.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No follow-ups scheduled</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LeadPipeline() {
  const { toast } = useToast();
  const [stageMap, setStageMap] = useState<Record<string, any[]>>({});
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [view, setView] = useState<"kanban"|"list">("kanban");
  const [filterStages, setFilterStages] = useState<string[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set(["spam"]));

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const r = await fetch(`${BASE_API}/api/crm/pipeline?${params}`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) {
        setStageMap(data.stageMap || {});
        setStageCounts(data.stageCounts || {});
      }
    } catch {
      toast({ title: "Failed to load pipeline", variant: "destructive" });
    } finally { setLoading(false); }
  }, [search]);

  const fetchDashboard = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_API}/api/crm/dashboard`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) setDashboard(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPipeline();
    fetchDashboard();
  }, [fetchPipeline]);

  const moveStage = async (leadId: string, stage: string) => {
    try {
      const r = await fetch(`${BASE_API}/api/crm/leads/${leadId}/stage`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: `Moved to ${STAGES.find(s => s.key === stage)?.label}` });
        fetchPipeline();
        if (selectedLead?.id === leadId) setSelectedLead((p: any) => ({ ...p, pipeline_stage: stage }));
      }
    } catch {
      toast({ title: "Failed to move stage", variant: "destructive" });
    }
  };

  const toggleCollapse = (key: string) => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const visibleStages = filterStages.length > 0
    ? STAGES.filter(s => filterStages.includes(s.key))
    : STAGES;

  const totalLeads = Object.values(stageCounts).reduce((a, b) => a + b, 0);

  return (
    <AdminLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Lead Pipeline</h1>
            <p className="text-sm text-gray-500">26-stage CRM pipeline · {totalLeads} total leads</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search leads..."
                className="h-8 pl-7 w-48 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchPipeline()}
              />
            </div>
            <button
              onClick={() => setView(v => v === "kanban" ? "list" : "kanban")}
              className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 hover:bg-gray-50"
            >
              {view === "kanban" ? "List View" : "Kanban View"}
            </button>
            <Button size="sm" variant="outline" className="h-8" onClick={fetchPipeline} disabled={loading}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>

        {/* Summary bar */}
        {dashboard && (
          <div className="flex gap-4 px-4 py-2 bg-gray-50 border-b text-sm flex-shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1 text-gray-700">
              <Users size={14} className="text-indigo-500" /> <span className="font-semibold">{dashboard.summary?.total}</span> Total
            </div>
            <div className="flex items-center gap-1 text-green-700">
              <TrendingUp size={14} /> <span className="font-semibold">{dashboard.summary?.conversionRate}%</span> Conv.
            </div>
            <div className="flex items-center gap-1 text-red-600">
              <AlertCircle size={14} /> <span className="font-semibold">{dashboard.summary?.overdueFollowups || 0}</span> Overdue
            </div>
            <div className="flex items-center gap-1 text-orange-600">
              <Clock size={14} /> <span className="font-semibold">{dashboard.summary?.pendingFollowups}</span> Pending F/U
            </div>
            <div className="flex-1" />
            {dashboard.summary?.wonCount > 0 && (
              <div className="flex items-center gap-1 text-green-700">
                <Target size={14} /> <span className="font-semibold">{dashboard.summary?.wonCount}</span> Won
              </div>
            )}
          </div>
        )}

        {/* Stage filter pills */}
        <div className="flex gap-1 px-4 py-2 border-b overflow-x-auto flex-shrink-0 bg-white">
          {STAGES.map(s => {
            const count = stageCounts[s.key] || 0;
            const active = filterStages.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => setFilterStages(prev =>
                  prev.includes(s.key) ? prev.filter(x => x !== s.key) : [...prev, s.key]
                )}
                className={`flex-shrink-0 text-xs px-2 py-1 rounded-full border flex items-center gap-1 transition-colors ${
                  active ? "border-transparent text-white" : "text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                style={active ? { backgroundColor: s.color } : {}}
              >
                {s.emoji} {s.label} {count > 0 && <span className="font-semibold">{count}</span>}
              </button>
            );
          })}
          {filterStages.length > 0 && (
            <button onClick={() => setFilterStages([])} className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 px-1">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Kanban board */}
        {view === "kanban" && (
          <div className="flex-1 overflow-x-auto overflow-y-hidden flex gap-3 p-4 bg-gray-100">
            {visibleStages.map(stage => {
              const leads = stageMap[stage.key] || [];
              const count = stageCounts[stage.key] || 0;
              const collapsed = collapsedStages.has(stage.key);

              return (
                <div key={stage.key} className={`flex-shrink-0 flex flex-col rounded-xl bg-gray-50 border border-gray-200 transition-all ${collapsed ? "w-12" : "w-64"}`}>
                  {/* Stage header */}
                  <div
                    className="flex items-center justify-between p-2 rounded-t-xl cursor-pointer"
                    style={{ backgroundColor: stage.color + "20", borderBottom: `2px solid ${stage.color}` }}
                    onClick={() => toggleCollapse(stage.key)}
                  >
                    {collapsed ? (
                      <div className="w-full flex flex-col items-center gap-1">
                        <span className="text-sm">{stage.emoji}</span>
                        <span className="text-xs font-bold" style={{ color: stage.color }}>{count}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span>{stage.emoji}</span>
                          <span className="font-semibold text-xs text-gray-800 truncate">{stage.label}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs font-bold rounded-full px-1.5 py-0.5 text-white" style={{ backgroundColor: stage.color }}>{count}</span>
                          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Lead cards */}
                  {!collapsed && (
                    <div className="flex-1 overflow-y-auto p-2 min-h-[200px] max-h-[calc(100vh-280px)]">
                      {leads.map(lead => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          stages={STAGES}
                          onMoveStage={moveStage}
                          onSelect={setSelectedLead}
                        />
                      ))}
                      {leads.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-6">No leads</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* List view */}
        {view === "list" && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {["Lead","Mobile","Source","Stage","Score","Budget","Follow-up","Updated"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleStages.flatMap(s => (stageMap[s.key] || []).map(lead => {
                    const stage = STAGES.find(st => st.key === lead.pipeline_stage);
                    return (
                      <tr key={lead.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedLead(lead)}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900 truncate max-w-[140px]">{lead.name}</p>
                          <p className="text-xs text-gray-400">{lead.lead_number}</p>
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{lead.mobile}</td>
                        <td className="px-3 py-2 text-xs"><Badge variant="outline">{lead.source}</Badge></td>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: stage?.color }}>
                            {stage?.emoji} {stage?.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{lead.score && <span className="flex items-center gap-1">{SCORE_ICON[lead.score]} {lead.score}</span>}</td>
                        <td className="px-3 py-2 text-xs text-green-700">{lead.budget ? `₹${Number(lead.budget).toLocaleString()}` : "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {lead.pending_followups > 0 && (
                            <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">{lead.pending_followups} pending</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400">{timeAgo(lead.updated_at)}</td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Lead detail panel */}
      {selectedLead && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedLead(null)} />
          <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} onRefresh={fetchPipeline} />
        </>
      )}
    </AdminLayout>
  );
}
