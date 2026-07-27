// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Phone, Mail, Search, RefreshCw, Edit2, Trash2,
  MessageCircle, X, ChevronDown, ChevronUp, Target, Shield,
  Flame, TrendingUp, BarChart3, Users, Star, Calendar, Clock,
  CheckCircle, AlertTriangle, Zap, Send, Filter, Download,
  UserCheck, ArrowUpDown, Eye, Activity, Tag, Globe,
  Upload, Brain, History
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

// ── Constants ──────────────────────────────────────────────────────────────────
const SOURCES = [
  "manual","whatsapp","facebook","facebook_lead_ad","instagram","instagram_lead_ad",
  "facebook_messenger","instagram_dm","facebook_comment","instagram_comment",
  "website","website_chat","google_business","email","sms","phone","referral",
  "walk-in","travel_agent","google_ads","youtube","other",
];

const PACKAGES = ["Hajj 2025","Hajj 2026","Umrah Economy","Umrah Premium","Ramadan Umrah",
  "Ziyarat Iraq","Baitul Muqaddas","Syria Jordan Tour","Air Ticket","Visa Assistance"];

const PRIORITIES = ["low","normal","high","urgent"];
const PIPELINE_STAGES = [
  "new_lead","auto_response_sent","assigned","contact_attempted","contacted","interested",
  "package_shared","quotation_sent","passport_awaited","documents_received",
  "advance_payment_pending","advance_paid","agreement_pending","agreement_signed",
  "visa_processing","ticket_pending","ticket_issued","hotel_confirmed",
  "balance_payment_pending","full_payment_received","travel_ready","travel_completed",
  "review_requested","future_remarketing","lost","spam",
];

const SOURCE_ICON: Record<string,string> = {
  whatsapp:"💬", facebook:"👥", facebook_lead_ad:"📢", instagram:"📸",
  instagram_lead_ad:"📸", facebook_messenger:"💬", instagram_dm:"📸",
  website:"🌐", website_chat:"💭", google_business:"🏢", email:"✉️",
  sms:"📱", phone:"📞", referral:"🤝", "walk-in":"🚶", travel_agent:"🧳",
  google_ads:"🔍", youtube:"▶️", manual:"✏️", other:"📋",
};

const SCORE_META: Record<string,{label:string;color:string;bg:string;icon:string}> = {
  hot:  { label:"Hot",  color:"text-red-700",    bg:"bg-red-100",    icon:"🔥" },
  warm: { label:"Warm", color:"text-orange-700", bg:"bg-orange-100", icon:"🌡️" },
  cold: { label:"Cold", color:"text-sky-700",    bg:"bg-sky-100",    icon:"❄️" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (s:string) => s?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()) || "";
const fmtDate = (d:string) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); } catch { return d; }
};
const fmtTime = (d:string) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}); } catch { return d; }
};
const timeAgo = (d:string) => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
};

async function apiFetch(url:string, opts:RequestInit={}) {
  const r = await fetch(`${API}${url}`, { credentials:"include", ...opts });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error||e.message||`HTTP ${r.status}`); }
  return r.json();
}

// ── Score Badge ────────────────────────────────────────────────────────────────
function ScoreBadge({ score }:{ score?:string }) {
  const m = SCORE_META[score||"cold"] || SCORE_META.cold;
  return (
    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.bg} ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

// ── Priority Badge ─────────────────────────────────────────────────────────────
function PriorityBadge({ priority }:{ priority?:string }) {
  const cls: Record<string,string> = {
    urgent:"bg-red-100 text-red-700 border-red-200",
    high:"bg-orange-100 text-orange-700 border-orange-200",
    normal:"bg-blue-100 text-blue-700 border-blue-200",
    low:"bg-gray-100 text-gray-600 border-gray-200",
  };
  return priority && priority !== "normal" ? (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${cls[priority]||cls.normal}`}>
      {priority.toUpperCase()}
    </span>
  ) : null;
}

// ── Stats Cards ────────────────────────────────────────────────────────────────
function StatsCards({ stats }:{ stats:any }) {
  if (!stats) return null;
  const t = stats.totals || {};
  const cards = [
    { label:"Total Leads", value:t.total||0, icon:<Users size={18}/>, color:"from-blue-500 to-blue-600" },
    { label:"Active", value:t.active||0, icon:<Zap size={18}/>, color:"from-indigo-500 to-indigo-600" },
    { label:"Today", value:stats.todayLeads||0, icon:<Calendar size={18}/>, color:"from-green-500 to-green-600" },
    { label:"Converted", value:t.converted||0, icon:<CheckCircle size={18}/>, color:"from-emerald-500 to-emerald-600" },
    { label:"Overdue Tasks", value:stats.overdueFollowups||0, icon:<AlertTriangle size={18}/>, color:"from-amber-500 to-amber-600" },
    { label:"Lost", value:t.lost||0, icon:<X size={18}/>, color:"from-red-500 to-red-600" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      {cards.map(c => (
        <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.color} text-white p-4 flex items-center gap-3`}>
          <div className="opacity-80">{c.icon}</div>
          <div>
            <div className="text-xl font-bold">{c.value.toLocaleString("en-IN")}</div>
            <div className="text-[10px] opacity-80">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Lead Form ──────────────────────────────────────────────────────────────────
function LeadForm({ initial, onSave, onCancel, saving }:{
  initial?:any; onSave:(d:any)=>void; onCancel:()=>void; saving:boolean;
}) {
  const [form, setForm] = useState({
    name: initial?.name||"",
    first_name: initial?.first_name||"",
    last_name: initial?.last_name||"",
    mobile: initial?.mobile||"",
    whatsapp_number: initial?.whatsapp_number||"",
    email: initial?.email||"",
    city: initial?.city||"",
    state: initial?.state||"",
    country: initial?.country||"India",
    source: initial?.source||"manual",
    package_interest: initial?.package_interest||"",
    budget: initial?.budget||"",
    message: initial?.message||"",
    travel_month: initial?.travel_month||"",
    num_travellers: initial?.num_travellers||1,
    priority: initial?.priority||"normal",
    notes: initial?.notes||"",
    consent_whatsapp: initial?.consent_whatsapp !== false,
    consent_sms: initial?.consent_sms !== false,
  });
  const [showMore, setShowMore] = useState(false);
  const set = (k:string, v:any) => setForm(f=>({...f,[k]:v}));

  return (
    <div className="rounded-2xl border bg-background p-5 space-y-4 max-h-[80vh] overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs font-semibold">Full Name *</Label>
          <Input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="Customer full name" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mobile</Label>
          <Input value={form.mobile} onChange={e=>set("mobile",e.target.value)} placeholder="9876543210" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">WhatsApp (if different)</Label>
          <Input value={form.whatsapp_number} onChange={e=>set("whatsapp_number",e.target.value)} placeholder="9876543210" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="customer@email.com" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Source *</Label>
          <select value={form.source} onChange={e=>set("source",e.target.value)} className="w-full h-9 rounded-xl border bg-background px-3 text-sm">
            {SOURCES.map(s=><option key={s} value={s}>{SOURCE_ICON[s]||"📋"} {fmt(s)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Package Interest</Label>
          <select value={form.package_interest} onChange={e=>set("package_interest",e.target.value)} className="w-full h-9 rounded-xl border bg-background px-3 text-sm">
            <option value="">— Select Package —</option>
            {PACKAGES.map(p=><option key={p} value={p}>{p}</option>)}
            <option value="custom">Other / Custom</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Budget (₹)</Label>
          <Input value={form.budget} onChange={e=>set("budget",e.target.value)} placeholder="e.g. 2,50,000" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Travel Month</Label>
          <Input value={form.travel_month} onChange={e=>set("travel_month",e.target.value)} placeholder="March 2025, Ramadan..." className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">No. of Travellers</Label>
          <Input type="number" min={1} value={form.num_travellers} onChange={e=>set("num_travellers",parseInt(e.target.value)||1)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <select value={form.priority} onChange={e=>set("priority",e.target.value)} className="w-full h-9 rounded-xl border bg-background px-3 text-sm">
            {PRIORITIES.map(p=><option key={p} value={p}>{fmt(p)}</option>)}
          </select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Enquiry Message</Label>
          <textarea value={form.message} onChange={e=>set("message",e.target.value)} placeholder="What did the customer enquire about?"
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>

      <button type="button" onClick={()=>setShowMore(v=>!v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Shield size={12}/> Additional fields (city, consents, notes)
        {showMore ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
      </button>
      {showMore && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">City</Label>
            <Input value={form.city} onChange={e=>set("city",e.target.value)} placeholder="Mumbai, Delhi..." className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">State</Label>
            <Input value={form.state} onChange={e=>set("state",e.target.value)} placeholder="Maharashtra..." className="h-9" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Internal Notes</Label>
            <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Notes visible only to staff"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-14 focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="col-span-2 flex gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={form.consent_whatsapp} onChange={e=>set("consent_whatsapp",e.target.checked)} className="rounded" />
              WhatsApp consent
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={form.consent_sms} onChange={e=>set("consent_sms",e.target.checked)} className="rounded" />
              SMS consent
            </label>
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={()=>onSave(form)} disabled={saving||!form.name.trim()} className="gap-1.5">
          {saving && <RefreshCw size={13} className="animate-spin"/>}
          {initial ? "Update Lead" : "Add Lead"}
        </Button>
      </div>
    </div>
  );
}

// ── Activity Feed ──────────────────────────────────────────────────────────────
function ActivityFeed({ leadId }:{ leadId:string }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    apiFetch(`/api/crm/leads/${leadId}/activities`)
      .then(d=>setActivities(d.activities||[]))
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[leadId]);

  const iconFor = (type:string) => {
    const m:Record<string,string> = {
      lead_created:"✨",assignment:"👤",stage_change:"🔄",followup_created:"📅",
      followup_completed:"✅",call:"📞",message:"💬",email:"✉️",whatsapp:"💬",
      note:"📝",update:"✏️",conversion:"🎉",opt_out:"🚫",sla_alert:"⚠️",
      sla_escalation:"🔴",auto_followup:"🤖",duplicate_enquiry:"🔁",
    };
    return m[type]||"📌";
  };

  if (loading) return <div className="text-xs text-muted-foreground py-4 text-center">Loading activity…</div>;
  if (!activities.length) return (
    <div className="text-xs text-muted-foreground py-4 text-center">No activity yet</div>
  );

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {activities.map((a:any)=>(
        <div key={a.id} className="flex gap-2.5 text-xs">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-sm">{iconFor(a.type)}</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground/80 leading-tight">{a.content}</div>
            <div className="text-muted-foreground mt-0.5">{timeAgo(a.created_at)} · {a.performed_by_name||"System"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Follow-up Tasks Panel ──────────────────────────────────────────────────────
function FollowupPanel({ leadId }:{ leadId:string }) {
  const { toast } = useToast();
  const [followups, setFollowups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title:"", due_at:"", type:"call", description:"" });

  const load = useCallback(()=>{
    apiFetch(`/api/crm/leads/${leadId}/followups`)
      .then(d=>setFollowups(d.followups||[]))
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[leadId]);

  useEffect(()=>{ load(); },[load]);

  const addFollowup = async () => {
    if (!form.title.trim()) return;
    try {
      await apiFetch(`/api/crm/leads/${leadId}/followups`,{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify(form),
      });
      setForm({ title:"", due_at:"", type:"call", description:"" });
      setAdding(false);
      toast({ title:"Follow-up scheduled" });
      load();
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
  };

  const completeFollowup = async (fid:string) => {
    try {
      await apiFetch(`/api/crm/leads/${leadId}/followups/${fid}`,{
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ status:"completed" }),
      });
      toast({ title:"Marked complete" });
      load();
    } catch {}
  };

  const visibleFollowups = followups.filter(f=>!f.title?.startsWith("LD-SEQ-"));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Follow-up Tasks ({visibleFollowups.length})</p>
        <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={()=>setAdding(v=>!v)}>
          <Plus size={11}/> Add Task
        </Button>
      </div>

      {adding && (
        <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
          <Input placeholder="Task title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="h-8 text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="h-8 rounded-lg border bg-background px-2 text-xs">
              <option value="call">📞 Call</option>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="email">✉️ Email</option>
              <option value="meeting">🤝 Meeting</option>
              <option value="other">📋 Other</option>
            </select>
            <Input type="datetime-local" value={form.due_at} onChange={e=>setForm(f=>({...f,due_at:e.target.value}))} className="h-8 text-xs" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs gap-1 flex-1" onClick={addFollowup}><CheckCircle size={11}/> Save</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? <div className="text-xs text-muted-foreground text-center py-3">Loading…</div> : (
        <div className="space-y-2">
          {visibleFollowups.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">No tasks yet</div>}
          {visibleFollowups.map((f:any)=>(
            <div key={f.id} className={`flex gap-2.5 rounded-xl border px-3 py-2 text-xs ${f.status==="completed"?"opacity-50 bg-muted/30":f.due_at&&new Date(f.due_at)<new Date()?"bg-red-50 border-red-200":""}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{f.title}</div>
                {f.due_at && <div className="text-muted-foreground mt-0.5">{fmtTime(f.due_at)}</div>}
              </div>
              {f.status==="pending" && (
                <button onClick={()=>completeFollowup(f.id)} className="text-green-600 hover:text-green-700 flex-shrink-0">
                  <CheckCircle size={14}/>
                </button>
              )}
              {f.status==="completed" && <CheckCircle size={14} className="text-green-500 flex-shrink-0"/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Lead Detail Panel (slide-in) ───────────────────────────────────────────────
function LeadDetailPanel({ lead, onClose, onUpdated }:{
  lead:any; onClose:()=>void; onUpdated:(l:any)=>void;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview"|"activity"|"tasks"|"edit"|"audit">("overview");
  const [stage, setStage] = useState(lead.pipeline_stage||"new_lead");
  const [savingStage, setSavingStage] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [score, setScore] = useState({ score: lead.score||"cold" });
  const [converting, setConverting] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(()=>{
    setLoading(true);
    apiFetch(`/api/leads/${lead.id}`)
      .then(d=>{ setDetail(d); setScore({ score: d.lead?.score||"cold" }); setStage(d.lead?.pipeline_stage||"new_lead"); })
      .catch(()=>{ setDetail({ lead }); })
      .finally(()=>setLoading(false));
  },[lead.id]);

  useEffect(() => {
    if (tab === "audit") {
      apiFetch(`/api/leads/${lead.id}/audit-log`)
        .then(d => setAuditLogs(Array.isArray(d) ? d : []))
        .catch(() => setAuditLogs([]));
    }
  }, [tab, lead.id]);

  const updateStage = async (newStage:string) => {
    setSavingStage(true);
    try {
      await apiFetch(`/api/crm/leads/${lead.id}/stage`,{
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ stage: newStage }),
      });
      setStage(newStage);
      toast({ title:"Stage updated" });
      onUpdated({ ...lead, pipeline_stage: newStage });
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setSavingStage(false);
  };

  const recomputeScore = async () => {
    setScoring(true);
    try {
      const d = await apiFetch(`/api/leads/${lead.id}/score`,{ method:"POST" });
      setScore(d);
      toast({ title:`Lead score: ${d.score} (${d.score_points} pts)` });
      onUpdated({ ...lead, score: d.score, ai_score: d.ai_score, ai_next_action: d.ai_next_action });
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setScoring(false);
  };

  const convertToBooking = async () => {
    setConverting(true);
    try {
      const d = await apiFetch(`/api/leads/${lead.id}/create-booking`,{
        method:"POST", headers:{"Content-Type":"application/json"}
      });
      toast({ title:"Lead converted to booking" });
      onUpdated({ ...lead, status:"converted", converted_booking_id: d.bookingId || d.id });
      window.location.href = `/admin/bookings?open=${d.bookingId || d.id}`;
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setConverting(false);
  };

  const L = detail?.lead || lead;
  const scoreMeta = SCORE_META[score.score] || SCORE_META.cold;
  const canConvert = ["qualified","proposal","negotiation","won"].includes(stage) && !L.converted_booking_id;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-xl bg-background h-full flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center gap-3 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">
            {SOURCE_ICON[L.source]||"📋"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-base truncate">{L.name}</h2>
              <ScoreBadge score={score.score}/>
              <PriorityBadge priority={L.priority}/>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
              {L.lead_number && <span className="font-mono text-primary/70">{L.lead_number}</span>}
              {L.mobile && <span>📞 {L.mobile}</span>}
              {L.email && <span>✉️ {L.email}</span>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X size={16}/></button>
        </div>

        {/* Quick actions */}
        <div className="px-4 py-2.5 border-b bg-muted/20 flex gap-1.5 flex-wrap">
          {L.mobile && <>
            <a href={`tel:${L.mobile}`} className="text-xs px-2.5 py-1.5 rounded-lg border bg-background hover:bg-muted transition-colors flex items-center gap-1"><Phone size={11}/> Call</a>
            <a href={`https://wa.me/${L.mobile?.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
              className="text-xs px-2.5 py-1.5 rounded-lg border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-colors">💬 WhatsApp</a>
          </>}
          {L.email && <a href={`mailto:${L.email}`} className="text-xs px-2.5 py-1.5 rounded-lg border bg-background hover:bg-muted transition-colors flex items-center gap-1"><Mail size={11}/> Email</a>}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 ml-auto" onClick={recomputeScore} disabled={scoring}>
            {scoring?<RefreshCw size={11} className="animate-spin"/>:<Target size={11}/>} Score
          </Button>
          {canConvert && (
            <Button size="sm" className="h-7 text-xs gap-1 bg-[#0A3D2A] hover:bg-[#0A3D2A]/90 text-[#C9A84C]" onClick={convertToBooking} disabled={converting}>
              {converting?<RefreshCw size={11} className="animate-spin"/>:<Plus size={11}/>}
              Create Booking
            </Button>
          )}
        </div>

        {/* Stage selector */}
        <div className="px-4 py-2.5 border-b flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Stage:</span>
          <select value={stage} onChange={e=>updateStage(e.target.value)} disabled={savingStage}
            className="flex-1 h-7 rounded-lg border bg-background px-2 text-xs">
            {PIPELINE_STAGES.map(s=><option key={s} value={s}>{fmt(s)}</option>)}
          </select>
          {savingStage && <RefreshCw size={12} className="animate-spin text-primary"/>}
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {(["overview","activity","tasks","edit","audit"] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab===t?"border-b-2 border-primary text-primary":"text-muted-foreground hover:text-foreground"}`}>
              {t==="overview"?"Overview":t==="activity"?"Activity":t==="tasks"?"Tasks":t==="audit"?"Audit Log":"Edit"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm"><RefreshCw size={20} className="animate-spin mr-2"/>Loading…</div>
          ) : tab==="audit" ? (
            <div className="space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2"><History size={16} /> Audit Timeline</h3>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No audit logs found.</p>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
                  {auditLogs.map((log: any, i) => (
                    <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border bg-white text-muted-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                        <Activity size={16} />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded border bg-white shadow-sm">
                        <div className="flex items-center justify-between space-x-2 mb-1">
                          <div className="font-bold text-sm">{log.user || "System"}</div>
                          <time className="text-xs font-medium text-muted-foreground">{fmtTime(log.timestamp)}</time>
                        </div>
                        <div className="text-sm text-muted-foreground">{log.action}</div>
                        {(log.old || log.new) && (
                          <div className="mt-2 text-xs bg-muted/50 p-2 rounded flex flex-col gap-1">
                            {log.old && <div className="text-red-600 line-through truncate">{log.old}</div>}
                            {log.new && <div className="text-green-600 truncate">{log.new}</div>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : tab==="overview" ? (
            <div className="space-y-4">
              {/* Score card */}
              <div className={`rounded-xl border p-3 ${scoreMeta.bg}`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{scoreMeta.icon}</span>
                  <div>
                    <p className={`text-xs font-bold ${scoreMeta.color}`}>Lead Score</p>
                    <p className={`text-base font-bold ${scoreMeta.color}`}>{scoreMeta.label}</p>
                  </div>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { label:"Package", value:L.package_interest },
                  { label:"Budget", value:L.budget ? `₹${L.budget}` : null },
                  { label:"Travellers", value:L.num_travellers },
                  { label:"Travel Month", value:L.travel_month },
                  { label:"Source", value:fmt(L.source) },
                  { label:"City/State", value:[L.city,L.state].filter(Boolean).join(", ")||null },
                  { label:"Assigned To", value:L.assigned_name||L.assigned_to },
                  { label:"Branch", value:L.assigned_branch },
                  { label:"Last Contact", value:fmtTime(L.last_communication_at) },
                  { label:"Created", value:fmtDate(L.created_at) },
                  { label:"Campaign", value:L.campaign_name },
                ].filter(r=>r.value).map(r=>(
                  <div key={r.label} className="rounded-lg bg-muted/40 px-3 py-2">
                    <div className="text-muted-foreground text-[10px]">{r.label}</div>
                    <div className="font-medium text-foreground truncate">{r.value}</div>
                  </div>
                ))}
              </div>

              {/* Message */}
              {L.message && (
                <div className="rounded-xl border p-3 bg-blue-50/50">
                  <p className="text-xs text-muted-foreground mb-1">Enquiry Message</p>
                  <p className="text-sm">{L.message}</p>
                </div>
              )}

              {/* Notes */}
              {L.notes && (
                <div className="rounded-xl border p-3 bg-amber-50/50">
                  <p className="text-xs text-muted-foreground mb-1">Internal Notes</p>
                  <p className="text-sm">{L.notes}</p>
                </div>
              )}

              {/* Consents */}
              {detail?.consents?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Communication Consents</p>
                  <div className="flex gap-2 flex-wrap">
                    {detail.consents.map((c:any)=>(
                      <span key={c.channel} className={`text-[10px] px-2 py-1 rounded-full border font-medium ${c.status==="opted_in"?"bg-green-50 text-green-700 border-green-200":"bg-red-50 text-red-700 border-red-200"}`}>
                        {c.channel}: {c.status==="opted_in"?"✅ In":"❌ Out"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : tab==="activity" ? (
            <ActivityFeed leadId={lead.id}/>
          ) : tab==="tasks" ? (
            <FollowupPanel leadId={lead.id}/>
          ) : (
            <EditLeadInline lead={L} onSaved={(updated)=>{ onUpdated(updated); setDetail(d=>({...d,lead:updated})); }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Lead Inline ───────────────────────────────────────────────────────────
function EditLeadInline({ lead, onSaved }:{ lead:any; onSaved:(l:any)=>void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: lead.name||"",
    mobile: lead.mobile||"",
    email: lead.email||"",
    city: lead.city||"",
    state: lead.state||"",
    source: lead.source||"",
    package_interest: lead.package_interest||"",
    budget: lead.budget||"",
    travel_month: lead.travel_month||"",
    num_travellers: lead.num_travellers||1,
    priority: lead.priority||"normal",
    notes: lead.notes||"",
  });
  const [saving, setSaving] = useState(false);
  const set = (k:string, v:any) => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    setSaving(true);
    try {
      const d = await apiFetch(`/api/leads/${lead.id}`,{
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify(form),
      });
      toast({ title:"Lead updated" });
      onSaved(d.lead);
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1"><Label className="text-xs">Name</Label><Input value={form.name} onChange={e=>set("name",e.target.value)} className="h-8 text-sm"/></div>
        <div className="space-y-1"><Label className="text-xs">Mobile</Label><Input value={form.mobile} onChange={e=>set("mobile",e.target.value)} className="h-8 text-sm"/></div>
        <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e=>set("email",e.target.value)} className="h-8 text-sm"/></div>
        <div className="space-y-1"><Label className="text-xs">City</Label><Input value={form.city} onChange={e=>set("city",e.target.value)} className="h-8 text-sm"/></div>
        <div className="space-y-1"><Label className="text-xs">State</Label><Input value={form.state} onChange={e=>set("state",e.target.value)} className="h-8 text-sm"/></div>
        <div className="space-y-1"><Label className="text-xs">Package</Label>
          <select value={form.package_interest} onChange={e=>set("package_interest",e.target.value)} className="w-full h-8 rounded-lg border bg-background px-2 text-xs">
            <option value="">— Select —</option>
            {PACKAGES.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label className="text-xs">Budget</Label><Input value={form.budget} onChange={e=>set("budget",e.target.value)} className="h-8 text-sm"/></div>
        <div className="space-y-1"><Label className="text-xs">Priority</Label>
          <select value={form.priority} onChange={e=>set("priority",e.target.value)} className="w-full h-8 rounded-lg border bg-background px-2 text-xs">
            {PRIORITIES.map(p=><option key={p} value={p}>{fmt(p)}</option>)}
          </select>
        </div>
        <div className="col-span-2 space-y-1"><Label className="text-xs">Notes</Label>
          <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary"/>
        </div>
      </div>
      <Button size="sm" className="w-full gap-1.5" onClick={save} disabled={saving}>
        {saving?<RefreshCw size={12} className="animate-spin"/>:<CheckCircle size={12}/>} Save Changes
      </Button>
    </div>
  );
}

// ── Lead Card ──────────────────────────────────────────────────────────────────
function LeadCard({ lead, onSelect, onDelete, onUpdated }:{ lead:any; onSelect:(l:any)=>void; onDelete:(id:string)=>void; onUpdated:(l:any)=>void }) {
  const { toast } = useToast();
  const [scoring, setScoring] = useState(false);
  const overdue = lead.followup_due_at && new Date(lead.followup_due_at) < new Date();

  const handleAiScore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setScoring(true);
    try {
      const res = await fetch(`${API}/api/leads/${lead.id}/ai-score`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to get AI score");
      const data = await res.json();
      toast({ title: `AI Score: ${data.ai_score}` });
      onUpdated({ ...lead, ai_score: data.ai_score, ai_next_action: data.ai_next_action });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setScoring(false);
  };

  const getAiScoreColor = (score: number) => {
    if (!score) return "bg-gray-100 text-gray-700 border-gray-200";
    if (score >= 70) return "bg-green-100 text-green-700 border-green-200";
    if (score >= 45) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  return (
    <div className={`rounded-2xl border bg-background p-4 hover:shadow-md transition-all cursor-pointer group ${overdue?"border-red-200 bg-red-50/30":""}`}
      onClick={()=>onSelect(lead)}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
          {SOURCE_ICON[lead.source]||"📋"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{lead.name}</span>
            <ScoreBadge score={lead.score}/>
            <PriorityBadge priority={lead.priority}/>
            {lead.ai_score ? (
              <div className="relative group/ai">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${getAiScoreColor(lead.ai_score)}`}>
                  <Brain size={10} className="mr-1"/> {lead.ai_score}
                </span>
                {lead.ai_next_action && (
                  <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-xs bg-black text-white rounded opacity-0 group-hover/ai:opacity-100 pointer-events-none transition-opacity">
                    {lead.ai_next_action}
                  </div>
                )}
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-1 hover:bg-muted" onClick={handleAiScore} disabled={scoring}>
                {scoring ? <RefreshCw size={10} className="animate-spin" /> : <Brain size={10} />} Score
              </Button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
            {lead.lead_number && <span className="font-mono text-primary/70">{lead.lead_number}</span>}
            {lead.mobile && <span>📞 {lead.mobile}</span>}
            <span className="capitalize">{fmt(lead.source)}</span>
            {lead.pipeline_stage && lead.pipeline_stage !== "new_lead" && (
              <span className="bg-muted px-1.5 py-0.5 rounded text-[9px]">{fmt(lead.pipeline_stage)}</span>
            )}
          </div>
          {lead.package_interest && (
            <div className="text-[11px] text-primary/80 mt-1 font-medium">📦 {lead.package_interest}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground">{timeAgo(lead.created_at)}</span>
          {lead.assigned_name && (
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">👤 {lead.assigned_name}</span>
          )}
          {overdue && (
            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle size={9}/> Overdue
            </span>
          )}
        </div>
      </div>
      {lead.message && (
        <div className="mt-2.5 text-[11px] text-muted-foreground line-clamp-2 bg-muted/30 rounded-lg px-2 py-1.5">
          {lead.message}
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-3 text-[10px] text-muted-foreground">
        {lead.activity_count > 0 && <span><Activity size={10} className="inline mr-1"/>{lead.activity_count} events</span>}
        {lead.pending_tasks > 0 && <span><Calendar size={10} className="inline mr-1"/>{lead.pending_tasks} tasks</span>}
        {lead.city && <span><Globe size={10} className="inline mr-1"/>{lead.city}</span>}
        <button onClick={e=>{ e.stopPropagation(); onDelete(lead.id); }}
          className="ml-auto opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-all p-1 rounded hover:bg-red-50">
          <Trash2 size={12}/>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function LeadManager() {
  const { toast } = useToast();

  // Data state
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  // UI state
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterScore, setFilterScore] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);

  const searchTimeout = useRef<any>(null);

  const loadLeads = useCallback(async (p=1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), limit:"30",
        sortBy, sortDir,
        ...(search&&{search}),
        ...(filterSource!=="all"&&{source:filterSource}),
        ...(filterScore!=="all"&&{score:filterScore}),
        ...(filterStage!=="all"&&{stage:filterStage}),
        ...(filterPriority!=="all"&&{priority:filterPriority}),
      });
      const d = await apiFetch(`/api/leads?${params}`);
      setLeads(d.leads||[]);
      setTotal(d.total||0);
      setPages(d.pages||1);
      setPage(p);
    } catch(e:any){ toast({ title:"Error loading leads", description:e.message, variant:"destructive" }); }
    setLoading(false);
  },[search,filterSource,filterScore,filterStage,filterPriority,sortBy,sortDir]);

  const loadStats = useCallback(async () => {
    apiFetch("/api/leads/stats").then(setStats).catch(()=>{});
  },[]);

  useEffect(()=>{ loadStats(); },[loadStats]);

  useEffect(()=>{
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(()=>loadLeads(1), 400);
    return ()=>clearTimeout(searchTimeout.current);
  },[loadLeads]);

  const createLead = async (form:any) => {
    setSaving(true);
    try {
      const d = await apiFetch("/api/leads/create",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          name: form.name, mobile: form.mobile, whatsapp_number: form.whatsapp_number,
          email: form.email, city: form.city, state: form.state, country: form.country,
          source: form.source, package_interest: form.package_interest,
          budget: form.budget, message: form.message, travel_month: form.travel_month,
          num_travellers: form.num_travellers, priority: form.priority, notes: form.notes,
          consent_whatsapp: form.consent_whatsapp, consent_sms: form.consent_sms,
        }),
      });
      toast({ title: d.isDuplicate ? "⚠️ Duplicate — existing lead updated" : "✅ Lead created",
        description: d.isDuplicate ? "This contact already exists. New enquiry added to timeline." : `Lead #${d.lead?.lead_number}` });
      setShowForm(false);
      loadLeads(1);
      loadStats();
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setSaving(false);
  };

  const deleteLead = async (id:string) => {
    if (!confirm("Mark this lead as spam? This will hide it from the main view.")) return;
    try {
      await apiFetch(`/api/leads/${id}`,{ method:"DELETE" });
      toast({ title:"Lead marked as spam" });
      setLeads(ls=>ls.filter(l=>l.id!==id));
      loadStats();
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
  };

  const onLeadUpdated = (updated:any) => {
    setLeads(ls=>ls.map(l=>l.id===updated.id?{...l,...updated}:l));
  };

  const toggleSort = (field:string) => {
    if (sortBy===field) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortBy(field); setSortDir("desc"); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API}/api/leads/import/excel`, {
        method: "POST",
        credentials: "include",
        body: formData
      });
      if (!res.ok) throw new Error("Import failed");
      const data = await res.json();
      toast({ title: `Imported ${data.imported || 0} leads, skipped ${data.skipped || 0}` });
      loadLeads(1);
      loadStats();
    } catch (err: any) {
      toast({ title: "Error importing", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleExport = () => {
    window.location.href = `${API}/api/leads/export/excel`;
  };

  return (
    <AdminLayout>
      <div className="space-y-4 p-4 max-w-[1400px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Lead Manager</h1>
            <p className="text-sm text-muted-foreground">{total.toLocaleString("en-IN")} leads · Smart assignment · Auto follow-up</p>
          </div>
          <div className="flex gap-2">
            <Label htmlFor="import-excel" className="cursor-pointer">
              <div className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
                <Upload size={13} /> Import
              </div>
            </Label>
            <input id="import-excel" type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImport} />
            
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleExport}>
              <Download size={13}/> Export
            </Button>
            
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={()=>{ loadLeads(page); loadStats(); }}>
              <RefreshCw size={13}/> Refresh
            </Button>
            <Button size="sm" className="gap-1.5 h-8 bg-[#0A3D2A] hover:bg-[#0A3D2A]/90 text-[#C9A84C]" onClick={()=>setShowForm(v=>!v)}>
              <Plus size={13}/> New Lead
            </Button>
          </div>
        </div>

        {/* Stats */}
        <StatsCards stats={stats}/>

        {/* Create form */}
        {showForm && (
          <LeadForm onSave={createLead} onCancel={()=>setShowForm(false)} saving={saving}/>
        )}

        {/* Filters + Search */}
        <div className="rounded-2xl border bg-background p-3 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, mobile, email, lead#…"
                className="pl-8 h-8 text-sm"/>
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={()=>setShowFilters(v=>!v)}>
              <Filter size={13}/> Filters {showFilters?"▲":"▼"}
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <select value={filterSource} onChange={e=>setFilterSource(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-xs">
                <option value="all">All Sources</option>
                {SOURCES.map(s=><option key={s} value={s}>{SOURCE_ICON[s]||"📋"} {fmt(s)}</option>)}
              </select>
              <select value={filterScore} onChange={e=>setFilterScore(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-xs">
                <option value="all">All Scores</option>
                <option value="hot">🔥 Hot</option>
                <option value="warm">🌡️ Warm</option>
                <option value="cold">❄️ Cold</option>
              </select>
              <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-xs">
                <option value="all">All Stages</option>
                {PIPELINE_STAGES.map(s=><option key={s} value={s}>{fmt(s)}</option>)}
              </select>
              <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} className="h-8 rounded-lg border bg-background px-2 text-xs">
                <option value="all">All Priorities</option>
                {PRIORITIES.map(p=><option key={p} value={p}>{fmt(p)}</option>)}
              </select>
            </div>
          )}

          {/* Sort bar */}
          <div className="flex gap-1 flex-wrap pt-1">
            <span className="text-xs text-muted-foreground self-center mr-1">Sort:</span>
            {[
              { key:"created_at", label:"Date" },
              { key:"score", label:"Score" },
              { key:"name", label:"Name" },
              { key:"last_communication_at", label:"Last Contact" },
            ].map(s=>(
              <button key={s.key} onClick={()=>toggleSort(s.key)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${sortBy===s.key?"bg-primary text-primary-foreground border-primary":"bg-background hover:bg-muted"}`}>
                {s.label} {sortBy===s.key&&<ArrowUpDown size={10}/>}
              </button>
            ))}
          </div>
        </div>

        {/* Lead list */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <RefreshCw size={24} className="animate-spin mr-3"/> Loading leads…
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center">
            <Users size={40} className="mx-auto mb-3 opacity-20"/>
            <p className="font-semibold text-muted-foreground">No leads found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Add your first lead or adjust filters</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={()=>setShowForm(true)}><Plus size={13}/> Add Lead</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {leads.map(lead=>(
              <LeadCard key={lead.id} lead={lead} onSelect={setSelectedLead} onDelete={deleteLead}/>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={()=>loadLeads(page-1)} disabled={page<=1||loading}>← Prev</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {pages} · {total.toLocaleString("en-IN")} leads</span>
            <Button size="sm" variant="outline" onClick={()=>loadLeads(page+1)} disabled={page>=pages||loading}>Next →</Button>
          </div>
        )}
      </div>

      {/* Lead detail slide-in */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={()=>setSelectedLead(null)}
          onUpdated={(updated)=>{ onLeadUpdated(updated); setSelectedLead(l=>({...l,...updated})); }}
        />
      )}
    </AdminLayout>
  );
}
