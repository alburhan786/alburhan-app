import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Phone, Mail, Search, RefreshCw, UserPlus, Edit2, Trash2,
  MessageCircle, ChevronRight, X, Send, Calendar, TrendingUp,
  BarChart3, Settings, CheckCircle, Clock, AlertTriangle, Instagram,
  Facebook, MessageSquare, Globe, Zap, Users, Star, Save,
} from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

// ── Constants ─────────────────────────────────────────────────────────────────
const SOURCES = [
  "website", "whatsapp", "instagram", "facebook", "messenger",
  "telegram", "phone", "walk-in", "referral", "email",
  "facebook_ads", "google_ads", "rcs", "sms", "google", "other",
];

const STATUSES = [
  "new", "contacted", "follow_up", "interested", "quotation_sent",
  "negotiation", "documents_pending", "payment_pending",
  "booked", "confirmed", "completed", "lost", "cancelled",
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-sky-100 text-sky-700 border-sky-200",
  contacted: "bg-blue-100 text-blue-700 border-blue-200",
  follow_up: "bg-amber-100 text-amber-700 border-amber-200",
  interested: "bg-violet-100 text-violet-700 border-violet-200",
  quotation_sent: "bg-orange-100 text-orange-700 border-orange-200",
  negotiation: "bg-yellow-100 text-yellow-700 border-yellow-200",
  documents_pending: "bg-cyan-100 text-cyan-700 border-cyan-200",
  payment_pending: "bg-pink-100 text-pink-700 border-pink-200",
  booked: "bg-emerald-100 text-emerald-700 border-emerald-200",
  confirmed: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-teal-100 text-teal-700 border-teal-200",
  lost: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

const SOURCE_ICONS: Record<string, string> = {
  website: "🌐", whatsapp: "💬", instagram: "📸", facebook: "👥",
  messenger: "💬", telegram: "✈️", phone: "📞", "walk-in": "🚶",
  referral: "🤝", email: "✉️", facebook_ads: "📢", google_ads: "🔍",
  rcs: "📡", sms: "📱", google: "🔍", other: "📋",
};

const PLATFORM_ICONS: Record<string, string> = {
  telegram_bot: "✈️", telegram_channel: "✈️",
  facebook_page: "👥", facebook_messenger: "💬", facebook_leads: "📢",
  instagram: "📸", instagram_dm: "📸",
  whatsapp_meta: "💬", whatsapp_botbee: "💬",
  website_contact: "🌐", website_booking: "🌐", website_support: "🌐",
  website_inquiry: "🌐", website_livechat: "🌐", website_ai_chat: "🤖",
  fast2sms: "📱", smtp_email: "✉️",
};

const PLATFORMS_FOR_RULES = [
  { value: "telegram_bot", label: "Telegram Bot" },
  { value: "facebook_page", label: "Facebook Page" },
  { value: "facebook_messenger", label: "Facebook Messenger" },
  { value: "facebook_leads", label: "Facebook Lead Ads" },
  { value: "instagram", label: "Instagram Business" },
  { value: "instagram_dm", label: "Instagram DMs" },
  { value: "whatsapp_meta", label: "WhatsApp Cloud API" },
  { value: "website_contact", label: "Website Contact Form" },
  { value: "website_inquiry", label: "Website Inquiry" },
  { value: "website_livechat", label: "Website Live Chat" },
  { value: "fast2sms", label: "SMS (Fast2SMS)" },
  { value: "smtp_email", label: "Email (SMTP)" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtStatus(s: string) {
  return s?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || s;
}
function fmtDate(d: string) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
}
function fmtTime(d: string) {
  if (!d) return "";
  try { return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return d; }
}
function platformLabel(p: string) {
  return p?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "";
}

// ── Empty form ────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: "", mobile: "", email: "", source: "website", message: "",
  packageInterest: "", assignedName: "", assignedBranch: "",
  followUpDate: "", notes: "", budget: "", status: "new", priority: "normal",
  instagramUsername: "", facebookName: "", telegramUsername: "",
};

// ═══════════════════════════════════════════════════════════════════
// LEAD FORM
// ═══════════════════════════════════════════════════════════════════
function LeadForm({ initial, onSave, onCancel, saving }: { initial?: any; onSave: (d: any) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <div className="rounded-2xl border p-5 bg-background space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Full Name *</Label>
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Customer name" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mobile</Label>
          <Input value={form.mobile} onChange={e => set("mobile", e.target.value)} placeholder="+91 9876543210" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@example.com" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Source</Label>
          <select value={form.source} onChange={e => set("source", e.target.value)} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_ICONS[s]} {fmtStatus(s)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <select value={form.status} onChange={e => set("status", e.target.value)} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
            {STATUSES.map(s => <option key={s} value={s}>{fmtStatus(s)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Package Interest</Label>
          <Input value={form.packageInterest} onChange={e => set("packageInterest", e.target.value)} placeholder="Hajj 2026, Umrah..." className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Budget (₹)</Label>
          <Input value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="250000" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Assigned Staff</Label>
          <Input value={form.assignedName} onChange={e => set("assignedName", e.target.value)} placeholder="Staff name" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Follow-Up Date</Label>
          <Input type="date" value={form.followUpDate} onChange={e => set("followUpDate", e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <select value={form.priority} onChange={e => set("priority", e.target.value)} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Branch</Label>
          <Input value={form.assignedBranch} onChange={e => set("assignedBranch", e.target.value)} placeholder="Branch name" className="h-9" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Message / Enquiry</Label>
          <textarea value={form.message} onChange={e => set("message", e.target.value)} placeholder="What did the customer enquire about?"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Internal Notes</Label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Internal notes (not visible to customer)"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-14 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving || !form.name.trim()} className="gap-1.5">
          {saving && <RefreshCw size={13} className="animate-spin" />}
          {initial ? "Update Lead" : "Add Lead"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONVERSATION PANEL
// ═══════════════════════════════════════════════════════════════════
function ConversationPanel({ lead, onClose, onStatusChange }: { lead: any; onClose: () => void; onStatusChange: (id: string, status: string) => void }) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(lead.status);
  const [followUp, setFollowUp] = useState(lead.follow_up_date?.slice(0, 10) || "");
  const [notes, setNotes] = useState(lead.notes || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE_API}/api/enterprise/leads/${lead.id}/conversations`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { messages: [], outgoing: [] })
      .then(d => { setConversations(d.messages || []); setOutgoing(d.outgoing || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lead.id]);

  const allMessages = [
    ...conversations.map((m: any) => ({ ...m, direction: "incoming", ts: new Date(m.created_at).getTime() })),
    ...outgoing.map((m: any) => ({ ...m, direction: "outgoing", ts: new Date(m.created_at).getTime() })),
  ].sort((a, b) => a.ts - b.ts);

  const saveUpdate = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/leads/${lead.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, followUpDate: followUp || null, notes }),
      });
      if (r.ok) {
        toast({ title: "Lead updated" });
        onStatusChange(lead.id, status);
      } else toast({ title: "Failed", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(false);
  };

  const msgTypeBadge = (type: string) => {
    if (type === "photo") return "📷 Photo";
    if (type === "voice") return "🎙️ Voice";
    if (type === "document") return "📎 File";
    if (type === "lead") return "📢 Lead Ad";
    if (type === "attachment") return "📎 Attachment";
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-2xl bg-background h-full flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">
            {PLATFORM_ICONS[lead.platform] || SOURCE_ICONS[lead.source] || "📋"}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base truncate">{lead.name}</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              {lead.mobile && <span>📞 {lead.mobile}</span>}
              {lead.email && <span>✉️ {lead.email}</span>}
              {lead.platform && <span className="capitalize">{platformLabel(lead.platform)}</span>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="px-5 py-3 border-b bg-muted/30 flex gap-2 flex-wrap">
          {lead.mobile && (
            <>
              <a href={`tel:${lead.mobile}`} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-background hover:bg-muted transition-colors">
                <Phone size={12} /> Call
              </a>
              <a href={`https://wa.me/${lead.mobile?.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-colors">
                💬 WhatsApp
              </a>
              <a href={`sms:${lead.mobile}`} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-background hover:bg-muted transition-colors">
                📱 SMS
              </a>
            </>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-background hover:bg-muted transition-colors">
              <Mail size={12} /> Email
            </a>
          )}
          {lead.telegram_username && (
            <a href={`https://t.me/${lead.telegram_username?.replace("@","")}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition-colors">
              ✈️ Telegram
            </a>
          )}
          {lead.instagram_username && (
            <a href={`https://instagram.com/${lead.instagram_username}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100 transition-colors">
              📸 Instagram
            </a>
          )}
        </div>

        {/* Body — tabs: conversations | update */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Conversation Thread */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Conversation History ({allMessages.length} messages)
            </p>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
            ) : allMessages.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground text-sm">
                <MessageCircle size={28} className="mx-auto mb-2 opacity-30" />
                No messages yet. Messages from social channels appear here automatically.
              </div>
            ) : (
              <div className="space-y-2">
                {allMessages.map((m: any, i: number) => (
                  <div key={m.id || i} className={`flex ${m.direction === "outgoing" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      m.direction === "outgoing"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm"
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] opacity-70">{PLATFORM_ICONS[m.platform] || "💬"} {platformLabel(m.platform)}</span>
                        {m.direction === "outgoing" && <span className="text-[10px] opacity-70">Outgoing</span>}
                      </div>
                      {msgTypeBadge(m.message_type) && (
                        <span className="text-xs opacity-70">{msgTypeBadge(m.message_type)}</span>
                      )}
                      <p className="leading-snug">{m.message_text || m.message}</p>
                      <p className="text-[10px] opacity-60 mt-1 text-right">{fmtTime(m.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Update Lead */}
          <div className="rounded-2xl border p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Update Lead</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                  {STATUSES.map(s => <option key={s} value={s}>{fmtStatus(s)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Follow-Up Date</Label>
                <Input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Notes</Label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-14 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Add notes…" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={saveUpdate} disabled={saving} className="gap-1.5">
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                Save Update
              </Button>
            </div>
          </div>

          {/* Lead Info */}
          <div className="rounded-2xl border p-4 space-y-2 text-sm">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Lead Info</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {lead.source && <div><span className="text-muted-foreground text-xs">Source:</span> <span>{SOURCE_ICONS[lead.source]} {fmtStatus(lead.source)}</span></div>}
              {lead.platform && <div><span className="text-muted-foreground text-xs">Platform:</span> <span>{platformLabel(lead.platform)}</span></div>}
              {lead.package_interest && <div><span className="text-muted-foreground text-xs">Package:</span> <span>{lead.package_interest}</span></div>}
              {lead.budget && <div><span className="text-muted-foreground text-xs">Budget:</span> <span>₹{Number(lead.budget).toLocaleString("en-IN")}</span></div>}
              {lead.assigned_name && <div><span className="text-muted-foreground text-xs">Assigned:</span> <span>👤 {lead.assigned_name}</span></div>}
              {lead.assigned_branch && <div><span className="text-muted-foreground text-xs">Branch:</span> <span>{lead.assigned_branch}</span></div>}
              {lead.conversation_count > 0 && <div><span className="text-muted-foreground text-xs">Messages:</span> <span>💬 {lead.conversation_count}</span></div>}
              <div><span className="text-muted-foreground text-xs">Added:</span> <span>{fmtDate(lead.created_at)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CRM DASHBOARD
// ═══════════════════════════════════════════════════════════════════
function CrmDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_API}/api/enterprise/lead-stats`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-16 text-center text-muted-foreground">Loading dashboard…</div>;
  if (!stats) return <div className="py-8 text-center text-muted-foreground">Could not load stats.</div>;

  const sourceColors: Record<string, string> = {
    whatsapp: "bg-green-500", instagram: "bg-pink-500", facebook: "bg-blue-600",
    messenger: "bg-blue-400", telegram: "bg-sky-500", website: "bg-indigo-500",
    email: "bg-orange-500", phone: "bg-amber-500", other: "bg-gray-400",
  };

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Leads", value: stats.total, icon: <Users size={16} />, color: "text-foreground" },
          { label: "Today's Leads", value: stats.today, icon: <Calendar size={16} />, color: "text-primary" },
          { label: "Conversion Rate", value: `${stats.conversion_rate}%`, icon: <TrendingUp size={16} />, color: "text-emerald-700" },
          { label: "Active (24h)", value: stats.active_today, icon: <Zap size={16} />, color: "text-amber-700" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border p-4 bg-background">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">{s.icon} <span className="text-xs">{s.label}</span></div>
            <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Follow-ups row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border p-4 bg-amber-50">
          <div className="flex items-center gap-2 text-amber-700 mb-1"><Clock size={15} /> <span className="text-xs font-semibold">Follow-Up Today</span></div>
          <p className="text-3xl font-bold font-mono text-amber-700">{stats.follow_ups?.today ?? 0}</p>
        </div>
        <div className="rounded-2xl border p-4 bg-red-50">
          <div className="flex items-center gap-2 text-red-700 mb-1"><AlertTriangle size={15} /> <span className="text-xs font-semibold">Overdue</span></div>
          <p className="text-3xl font-bold font-mono text-red-700">{stats.follow_ups?.overdue ?? 0}</p>
        </div>
      </div>

      {/* Status breakdown */}
      {stats.by_status?.length > 0 && (
        <div className="rounded-2xl border p-5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Leads by Status</p>
          <div className="flex flex-wrap gap-2">
            {stats.by_status.map((s: any) => (
              <div key={s.status} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs ${STATUS_COLORS[s.status] || "bg-gray-100 text-gray-600"}`}>
                {fmtStatus(s.status)} <span className="font-bold">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source breakdown */}
      {stats.by_source?.length > 0 && (
        <div className="rounded-2xl border p-5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Leads by Source (30 days)</p>
          <div className="space-y-2">
            {stats.by_source.map((s: any) => {
              const max = Math.max(...stats.by_source.map((x: any) => x.count), 1);
              const pct = Math.round((s.count / max) * 100);
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="text-sm w-24 truncate flex-shrink-0">{SOURCE_ICONS[s.source]} {fmtStatus(s.source)}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div className={`h-2 rounded-full ${sourceColors[s.source] || "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-mono font-bold w-6 text-right">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ASSIGNMENT RULES
// ═══════════════════════════════════════════════════════════════════
function AssignmentRules() {
  const { toast } = useToast();
  const [rules, setRules] = useState<any[]>([]);
  const [editing, setEditing] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_API}/api/social-media/assignment-rules`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        setRules(d);
        const map: Record<string, any> = {};
        for (const r of d) map[r.platform] = { ...r };
        // Pre-fill all platforms
        for (const p of PLATFORMS_FOR_RULES) {
          if (!map[p.value]) map[p.value] = { platform: p.value, assigned_name: "", branch_name: "", auto_reply_text: "", is_active: true };
        }
        setEditing(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (platform: string) => {
    setSaving(platform);
    try {
      const r = await fetch(`${BASE_API}/api/social-media/assignment-rules/${platform}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing[platform]),
      });
      if (r.ok) toast({ title: "Rule saved" });
      else toast({ title: "Failed to save", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(null);
  };

  const upd = (platform: string, key: string, val: any) =>
    setEditing(e => ({ ...e, [platform]: { ...e[platform], [key]: val } }));

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading rules…</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-sky-50 p-4 text-sm text-sky-800">
        <strong>Auto Lead Assignment:</strong> When a message arrives on any channel, the system automatically assigns the lead to the configured staff member and branch.
      </div>
      {PLATFORMS_FOR_RULES.map(p => {
        const rule = editing[p.value] || {};
        const isSaving = saving === p.value;
        return (
          <div key={p.value} className="rounded-2xl border p-4 space-y-3 bg-background">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{PLATFORM_ICONS[p.value] || "📋"}</span>
                <span className="font-semibold text-sm">{p.label}</span>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={rule.is_active !== false} onChange={e => upd(p.value, "is_active", e.target.checked)} className="rounded" />
                Active
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Assign to Staff</Label>
                <Input value={rule.assigned_name || ""} onChange={e => upd(p.value, "assigned_name", e.target.value)} placeholder="Staff name" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Branch</Label>
                <Input value={rule.branch_name || ""} onChange={e => upd(p.value, "branch_name", e.target.value)} placeholder="Branch name" className="h-8 text-sm" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Auto Reply Message (optional)</Label>
                <Input value={rule.auto_reply_text || ""} onChange={e => upd(p.value, "auto_reply_text", e.target.value)}
                  placeholder="Wa'alaikum Assalam! Thank you for contacting Al Burhan Tours…" className="h-8 text-sm" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => save(p.value)} disabled={isSaving} className="gap-1.5 h-7 text-xs">
                {isSaving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                Save Rule
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function LeadManager() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"dashboard" | "leads" | "rules">("leads");
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const [viewLead, setViewLead] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/leads`, { credentials: "include" });
      if (r.ok) setLeads(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form: any) => {
    setSaving(true);
    try {
      const url = editLead ? `${BASE_API}/api/enterprise/leads/${editLead.id}` : `${BASE_API}/api/enterprise/leads`;
      const method = editLead ? "PATCH" : "POST";
      const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) { toast({ title: editLead ? "Lead updated" : "Lead added" }); setShowForm(false); setEditLead(null); load(); }
      else toast({ title: "Failed", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(false);
  };

  const quickStatus = async (id: string, status: string) => {
    await fetch(`${BASE_API}/api/enterprise/leads/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setLeads(ls => ls.map(l => l.id === id ? { ...l, status } : l));
    if (viewLead?.id === id) setViewLead((v: any) => ({ ...v, status }));
  };

  const deleteLead = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    await fetch(`${BASE_API}/api/enterprise/leads/${id}`, { method: "DELETE", credentials: "include" });
    setLeads(ls => ls.filter(l => l.id !== id));
    if (viewLead?.id === id) setViewLead(null);
  };

  const today = new Date().toISOString().slice(0, 10);
  const totalConverted = leads.filter(l => l.status === "converted" || l.status === "booked" || l.status === "confirmed" || l.status === "completed").length;
  const convRate = leads.length > 0 ? Math.round((totalConverted / leads.length) * 100) : 0;
  const followUpToday = leads.filter(l => l.follow_up_date?.slice(0, 10) === today && !["converted","lost","cancelled","completed"].includes(l.status)).length;

  const filtered = leads.filter(l => {
    if (filterStatus !== "all" && l.status !== filterStatus) return false;
    if (filterSource !== "all" && l.source !== filterSource) return false;
    if (filterPlatform !== "all" && l.platform !== filterPlatform) return false;
    if (search) {
      const q = search.toLowerCase();
      const searchable = [l.name, l.mobile, l.email, l.telegram_username, l.instagram_username, l.facebook_name, l.package_interest].join(" ").toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  const uniquePlatforms = [...new Set(leads.map((l: any) => l.platform).filter(Boolean))];

  const TABS = [
    { key: "dashboard", label: "CRM Dashboard", icon: <BarChart3 size={14} /> },
    { key: "leads", label: `All Leads (${leads.length})`, icon: <Users size={14} /> },
    { key: "rules", label: "Assignment Rules", icon: <Settings size={14} /> },
  ] as const;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lead Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">CRM — Auto-created from all social channels</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RefreshCw size={13} /> Refresh
            </Button>
            {tab === "leads" && (
              <Button size="sm" onClick={() => { setShowForm(true); setEditLead(null); }} className="gap-1.5">
                <Plus size={13} /> Add Lead
              </Button>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Leads", value: leads.length, color: "text-foreground" },
            { label: "Follow-Up Today", value: followUpToday, color: followUpToday > 0 ? "text-amber-700" : "text-foreground" },
            { label: "Converted / Booked", value: totalConverted, color: "text-emerald-700" },
            { label: "Conv. Rate", value: `${convRate}%`, color: "text-primary" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border p-3 text-center bg-background">
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-2xl border p-1 bg-muted/20 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${tab === t.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab: CRM Dashboard */}
        {tab === "dashboard" && <CrmDashboard />}

        {/* Tab: Assignment Rules */}
        {tab === "rules" && <AssignmentRules />}

        {/* Tab: All Leads */}
        {tab === "leads" && (
          <>
            {showForm && <LeadForm onSave={handleSave} onCancel={() => setShowForm(false)} saving={saving} />}
            {editLead && (
              <LeadForm
                initial={{
                  name: editLead.name, mobile: editLead.mobile||"", email: editLead.email||"",
                  source: editLead.source, message: editLead.message||"",
                  packageInterest: editLead.package_interest||"", assignedName: editLead.assigned_name||"",
                  assignedBranch: editLead.assigned_branch||"", followUpDate: editLead.follow_up_date?.slice(0,10)||"",
                  notes: editLead.notes||"", budget: editLead.budget||"", status: editLead.status,
                  priority: editLead.priority||"normal",
                  instagramUsername: editLead.instagram_username||"",
                  facebookName: editLead.facebook_name||"",
                  telegramUsername: editLead.telegram_username||"",
                }}
                onSave={handleSave} onCancel={() => setEditLead(null)} saving={saving}
              />
            )}

            {/* Filters */}
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Name, mobile, email, username…" className="pl-8 h-9 text-sm" />
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="all">All Status</option>
                {STATUSES.map(s => <option key={s} value={s}>{fmtStatus(s)}</option>)}
              </select>
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                <option value="all">All Sources</option>
                {SOURCES.map(s => <option key={s} value={s}>{SOURCE_ICONS[s]} {fmtStatus(s)}</option>)}
              </select>
              {uniquePlatforms.length > 0 && (
                <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
                  <option value="all">All Platforms</option>
                  {uniquePlatforms.map(p => <option key={p} value={p}>{PLATFORM_ICONS[p]} {platformLabel(p)}</option>)}
                </select>
              )}
            </div>

            {loading ? (
              <div className="py-16 text-center text-muted-foreground">Loading leads…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <UserPlus size={36} className="mx-auto mb-2 opacity-30" />
                <p className="font-medium">No leads found.</p>
                <p className="text-sm mt-1">Leads are auto-created when messages arrive from any connected channel.</p>
              </div>
            ) : (
              <div className="rounded-2xl border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/30 border-b flex justify-between items-center">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{filtered.length} Leads</p>
                  <p className="text-xs text-muted-foreground">Sorted by latest activity</p>
                </div>
                <div className="divide-y">
                  {filtered.map(l => {
                    const isFollowUpToday = l.follow_up_date?.slice(0, 10) === today && !["converted","lost","cancelled","completed"].includes(l.status);
                    const isOverdue = l.follow_up_date && l.follow_up_date.slice(0, 10) < today && !["converted","lost","cancelled","completed"].includes(l.status);
                    const hasConvos = l.conversation_count > 0;
                    return (
                      <div key={l.id}
                        className={`px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer ${isOverdue ? "bg-red-50/40" : isFollowUpToday ? "bg-amber-50/30" : ""}`}
                        onClick={() => setViewLead(l)}>
                        <div className="flex items-start gap-3">
                          {/* Platform icon */}
                          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
                            {PLATFORM_ICONS[l.platform] || SOURCE_ICONS[l.source] || "📋"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm">{l.name}</p>
                              <Badge variant="outline" className={`text-[10px] py-0 h-4 ${STATUS_COLORS[l.status] || "bg-gray-100 text-gray-600"}`}>
                                {fmtStatus(l.status)}
                              </Badge>
                              {l.priority === "urgent" && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-red-100 text-red-700 border-red-200">🚨 Urgent</Badge>}
                              {l.priority === "high" && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-orange-100 text-orange-700 border-orange-200">⚡ High</Badge>}
                              {isFollowUpToday && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">Follow-up Today</Badge>}
                              {isOverdue && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-red-100 text-red-700 border-red-200">Overdue</Badge>}
                              {hasConvos && <Badge variant="outline" className="text-[10px] py-0 h-4 bg-sky-100 text-sky-700 border-sky-200">💬 {l.conversation_count}</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              {l.mobile && <span className="flex items-center gap-1"><Phone size={10} /> {l.mobile}</span>}
                              {l.email && <span className="flex items-center gap-1"><Mail size={10} /> {l.email}</span>}
                              {l.telegram_username && <span>✈️ {l.telegram_username}</span>}
                              {l.instagram_username && <span>📸 {l.instagram_username}</span>}
                              {l.package_interest && <span>📦 {l.package_interest}</span>}
                              {l.assigned_name && <span>👤 {l.assigned_name}</span>}
                              {l.follow_up_date && <span>📅 {fmtDate(l.follow_up_date)}</span>}
                              {l.platform && <span className="text-[10px] bg-muted rounded-md px-1.5 py-0.5">{platformLabel(l.platform)}</span>}
                            </div>
                            {l.message && <p className="text-xs text-muted-foreground mt-0.5 italic truncate">"{l.message.slice(0, 80)}"</p>}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            {l.mobile && (
                              <a href={`https://wa.me/${l.mobile?.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                                className="w-7 h-7 rounded-lg border border-green-200 hover:bg-green-50 text-green-700 flex items-center justify-center text-xs" title="WhatsApp">
                                💬
                              </a>
                            )}
                            {!["converted","lost","cancelled"].includes(l.status) && (
                              <button onClick={() => quickStatus(l.id, "booked")}
                                className="w-7 h-7 rounded-lg border border-emerald-200 hover:bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs" title="Mark Booked">
                                <CheckCircle size={12} />
                              </button>
                            )}
                            <button onClick={() => { setEditLead(l); setShowForm(false); }}
                              className="w-7 h-7 rounded-lg border hover:bg-muted flex items-center justify-center" title="Edit">
                              <Edit2 size={12} />
                            </button>
                            <button onClick={() => deleteLead(l.id)}
                              className="w-7 h-7 rounded-lg border hover:bg-red-50 text-red-500 flex items-center justify-center" title="Delete">
                              <Trash2 size={12} />
                            </button>
                            <button className="w-7 h-7 rounded-lg border hover:bg-muted flex items-center justify-center text-muted-foreground" title="View conversations">
                              <ChevronRight size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Conversation Panel */}
      {viewLead && (
        <ConversationPanel
          lead={viewLead}
          onClose={() => setViewLead(null)}
          onStatusChange={quickStatus}
        />
      )}
    </AdminLayout>
  );
}
