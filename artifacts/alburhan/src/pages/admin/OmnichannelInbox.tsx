import React, { useState, useEffect, useRef, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Search, RefreshCw, X, Send, Phone, Mail, MessageCircle, Users,
  ChevronDown, Filter, Check, AlertTriangle, Clock, Star, Archive,
  MoreVertical, StickyNote, UserPlus, Calendar, Zap, Tag, Edit2,
  ArrowLeft, Info, CheckCheck, Bell, Sparkles, Paperclip, Mic, MicOff,
  FileText, Image as ImageIcon, StopCircle,
} from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

// ── Constants ─────────────────────────────────────────────────────────────────
const PLATFORM_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  whatsapp_botbee:  { label: "WhatsApp BotBee",  icon: "💬", color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  whatsapp_meta:    { label: "WhatsApp Cloud",    icon: "💬", color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  whatsapp:         { label: "WhatsApp",          icon: "💬", color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  facebook_page:    { label: "Facebook",          icon: "👥", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  facebook_messenger: { label: "Messenger",       icon: "💬", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  messenger:        { label: "Messenger",         icon: "💬", color: "text-blue-600",   bg: "bg-blue-50 border-blue-200" },
  facebook_leads:   { label: "FB Lead Ads",       icon: "📢", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  facebook:         { label: "Facebook",          icon: "👥", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  instagram:        { label: "Instagram",         icon: "📸", color: "text-pink-700",   bg: "bg-pink-50 border-pink-200" },
  instagram_dm:     { label: "Instagram DM",      icon: "📸", color: "text-pink-700",   bg: "bg-pink-50 border-pink-200" },
  telegram_bot:     { label: "Telegram",          icon: "✈️", color: "text-sky-700",    bg: "bg-sky-50 border-sky-200" },
  telegram_channel: { label: "Telegram Channel",  icon: "✈️", color: "text-sky-700",    bg: "bg-sky-50 border-sky-200" },
  telegram:         { label: "Telegram",          icon: "✈️", color: "text-sky-700",    bg: "bg-sky-50 border-sky-200" },
  website_contact:  { label: "Website",           icon: "🌐", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  website_inquiry:  { label: "Website",           icon: "🌐", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  website_livechat: { label: "Live Chat",         icon: "💭", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  website_ai_chat:  { label: "AI Chat",           icon: "🤖", color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  website:          { label: "Website",           icon: "🌐", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  fast2sms:         { label: "SMS",               icon: "📱", color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  sms:              { label: "SMS",               icon: "📱", color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  smtp_email:       { label: "Email",             icon: "✉️", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  email:            { label: "Email",             icon: "✉️", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  internal:         { label: "Note",              icon: "📝", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
};

const STATUSES = ["new","contacted","follow_up","interested","quotation_sent","negotiation",
  "documents_pending","payment_pending","booked","confirmed","completed","lost","cancelled"];
const STATUS_COLORS: Record<string, string> = {
  new: "bg-sky-100 text-sky-700", contacted: "bg-blue-100 text-blue-700",
  follow_up: "bg-amber-100 text-amber-700", interested: "bg-violet-100 text-violet-700",
  quotation_sent: "bg-orange-100 text-orange-700", negotiation: "bg-yellow-100 text-yellow-700",
  documents_pending: "bg-cyan-100 text-cyan-700", payment_pending: "bg-pink-100 text-pink-700",
  booked: "bg-emerald-100 text-emerald-700", confirmed: "bg-green-100 text-green-700",
  completed: "bg-teal-100 text-teal-700", lost: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

function fmtStatus(s: string) { return s?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || ""; }
function fmtTime(d: string) {
  if (!d) return "";
  const dt = new Date(d);
  const now = new Date();
  const diff = now.getTime() - dt.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
  if (diff < 86400000) return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return dt.toLocaleDateString("en-IN", { weekday: "short" });
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function fmtFull(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function initials(name: string) {
  return (name || "?").split(" ").slice(0,2).map(w => w[0]?.toUpperCase()).join("");
}
function getPlatformMeta(conv: any) {
  return PLATFORM_META[conv.platform] || PLATFORM_META[conv.source] || { label: conv.source || "Unknown", icon: "📋", color: "text-gray-600", bg: "bg-gray-50 border-gray-200" };
}

// ── Conversation List Item ────────────────────────────────────────────────────
function ConvItem({ conv, active, onClick }: { conv: any; active: boolean; onClick: () => void }) {
  const pm = getPlatformMeta(conv);
  const hasUnread = conv.unread_count > 0;
  return (
    <button onClick={onClick} className={`w-full text-left px-4 py-3 border-b transition-all hover:bg-muted/30 ${active ? "bg-primary/5 border-l-2 border-l-primary" : ""} ${hasUnread ? "bg-sky-50/40" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
            {initials(conv.name)}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 text-xs leading-none">{pm.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className={`text-sm truncate ${hasUnread ? "font-bold" : "font-medium"}`}>{conv.name}</p>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtTime(conv.last_message_at || conv.created_at)}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.last_message || conv.message || "No messages yet"}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${pm.bg} ${pm.color}`}>{pm.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${STATUS_COLORS[conv.status] || "bg-gray-100 text-gray-600"}`}>{fmtStatus(conv.status)}</span>
            {conv.priority === "urgent" && <span className="text-[10px] text-red-600">🚨</span>}
            {conv.priority === "high" && <span className="text-[10px] text-orange-500">⚡</span>}
            {hasUnread && <span className="ml-auto text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold">{conv.unread_count}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────
function MsgBubble({ msg }: { msg: any }) {
  const isOut = msg.direction === "outgoing";
  const isNote = msg.is_internal_note;
  const pm = PLATFORM_META[msg.platform] || { icon: "💬", label: msg.platform };

  if (isNote) {
    return (
      <div className="flex justify-center my-1">
        <div className="max-w-[85%] bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-2.5 text-sm">
          <div className="flex items-center gap-1.5 mb-1 text-yellow-700 text-[10px] font-semibold">
            <StickyNote size={10} /> Internal Note — {msg.sender_name || msg.replied_by}
          </div>
          <p className="text-yellow-900 whitespace-pre-wrap">{msg.message_text}</p>
          <p className="text-[10px] text-yellow-600 mt-1">{fmtFull(msg.created_at)}</p>
        </div>
      </div>
    );
  }

  /** Render the message body based on media type */
  const renderBody = () => {
    const type = msg.message_type;
    const mediaUrl = msg.media_url;
    const text = msg.message_text || msg.message || "";

    if (type === "image" || type === "photo") {
      return (
        <div className="space-y-1.5">
          {mediaUrl ? (
            <a href={`https://cdn.botbee.io/${mediaUrl}`} target="_blank" rel="noreferrer"
              className="block rounded-xl overflow-hidden border border-white/20 max-w-[220px]">
              <img
                src={`https://cdn.botbee.io/${mediaUrl}`}
                alt={text || "Image"}
                className="w-full max-h-48 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </a>
          ) : (
            <div className="flex items-center gap-1.5 opacity-70"><ImageIcon size={14} /> Photo</div>
          )}
          {text && text !== "Photo" && <p className="text-sm leading-relaxed break-words">{text}</p>}
        </div>
      );
    }

    if (type === "audio" || type === "voice") {
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs opacity-80 font-medium">
            <Mic size={12} /> {type === "voice" ? "Voice Note" : "Audio"}
          </div>
          {mediaUrl ? (
            <audio controls className="w-full max-w-[220px] h-9 rounded-lg" preload="none">
              <source src={`https://cdn.botbee.io/${mediaUrl}`} type="audio/ogg" />
              <source src={`https://cdn.botbee.io/${mediaUrl}`} type="audio/mpeg" />
              Your browser does not support audio.
            </audio>
          ) : (
            <p className="text-sm opacity-70">🎙️ Voice Note</p>
          )}
        </div>
      );
    }

    if (type === "document" || type === "video") {
      const icon = type === "video" ? "🎥" : "📎";
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <FileText size={14} className="opacity-70 flex-shrink-0" />
            {mediaUrl ? (
              <a href={`https://cdn.botbee.io/${mediaUrl}`} target="_blank" rel="noreferrer"
                className="text-sm underline underline-offset-2 break-all hover:opacity-80">
                {text || `${icon} Download`}
              </a>
            ) : (
              <span className="text-sm opacity-70">{icon} {text || "File"}</span>
            )}
          </div>
        </div>
      );
    }

    if (type === "location") {
      return <p className="text-sm opacity-70">📍 {text || "Location shared"}</p>;
    }

    if (type === "sticker") {
      return <p className="text-2xl">{text || "🖼️"}</p>;
    }

    // Default: plain text
    return <p className="leading-relaxed break-words whitespace-pre-wrap">{text}</p>;
  };

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-1`}>
      <div className={`max-w-[78%] ${isOut
        ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
        : "bg-muted rounded-2xl rounded-tl-sm"
      } px-4 py-2.5 text-sm shadow-sm`}>
        {!isOut && (
          <div className="flex items-center gap-1.5 mb-1 text-[10px] opacity-70">
            <span>{pm.icon}</span> <span>{pm.label}</span>
            {msg.sender_name && <span>· {msg.sender_name}</span>}
          </div>
        )}
        {isOut && (
          <div className="text-[10px] opacity-70 mb-1">
            {pm.icon} {msg.replied_by || "Admin"} via {pm.label}
          </div>
        )}
        {renderBody()}
        <div className="flex items-center justify-end gap-1 mt-1">
          <p className="text-[10px] opacity-60">{fmtFull(msg.created_at)}</p>
          {isOut && msg.status === "sent" && <CheckCheck size={10} className="opacity-60" />}
          {isOut && msg.status === "read" && <CheckCheck size={10} className="text-blue-300" />}
        </div>
      </div>
    </div>
  );
}

// ── Right Sidebar ─────────────────────────────────────────────────────────────
function RightSidebar({ conv, onUpdate, onRefresh }: { conv: any; onUpdate: (data: any) => void; onRefresh: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(conv.status);
  const [priority, setPriority] = useState(conv.priority || "normal");
  const [assignedName, setAssignedName] = useState(conv.assigned_name || "");
  const [followUp, setFollowUp] = useState(conv.follow_up_date?.slice(0,10) || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(conv.status); setPriority(conv.priority || "normal");
    setAssignedName(conv.assigned_name || ""); setFollowUp(conv.follow_up_date?.slice(0,10) || "");
  }, [conv.id]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE_API}/api/inbox/conversations/${conv.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, priority, assignedName, followUpDate: followUp || null }),
      });
      if (r.ok) { toast({ title: "Updated" }); onRefresh(); }
      else toast({ title: "Failed", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(false);
  };

  const pm = getPlatformMeta(conv);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5 text-sm">
      {/* Customer Card */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold mx-auto">
          {initials(conv.name)}
        </div>
        <div>
          <p className="font-bold text-base">{conv.name}</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-md border ${pm.bg} ${pm.color}`}>{pm.icon} {pm.label}</span>
        </div>
        <div className="flex justify-center gap-2">
          {conv.mobile && (
            <a href={`tel:${conv.mobile}`} className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-muted transition-colors" title="Call">
              <Phone size={13} />
            </a>
          )}
          {conv.mobile && (
            <a href={`https://wa.me/${conv.mobile?.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
              className="w-8 h-8 rounded-full border border-green-200 bg-green-50 text-green-700 flex items-center justify-center hover:bg-green-100 transition-colors" title="WhatsApp">
              💬
            </a>
          )}
          {conv.email && (
            <a href={`mailto:${conv.email}`} className="w-8 h-8 rounded-full border flex items-center justify-center hover:bg-muted transition-colors" title="Email">
              <Mail size={13} />
            </a>
          )}
          {conv.telegram_username && (
            <a href={`https://t.me/${conv.telegram_username?.replace("@","")}`} target="_blank" rel="noreferrer"
              className="w-8 h-8 rounded-full border border-sky-200 bg-sky-50 text-sky-700 flex items-center justify-center hover:bg-sky-100 transition-colors" title="Telegram">
              ✈️
            </a>
          )}
        </div>
      </div>

      {/* Contact Info */}
      <div className="rounded-xl border p-3 space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Contact</p>
        {conv.mobile && <div className="flex items-center gap-2"><Phone size={11} className="text-muted-foreground" /> <span className="text-xs">{conv.mobile}</span></div>}
        {conv.email && <div className="flex items-center gap-2"><Mail size={11} className="text-muted-foreground" /> <span className="text-xs truncate">{conv.email}</span></div>}
        {conv.telegram_username && <div className="flex items-center gap-2"><span className="text-xs">✈️</span> <span className="text-xs">{conv.telegram_username}</span></div>}
        {conv.instagram_username && <div className="flex items-center gap-2"><span className="text-xs">📸</span> <span className="text-xs">@{conv.instagram_username}</span></div>}
        {conv.facebook_name && <div className="flex items-center gap-2"><span className="text-xs">👥</span> <span className="text-xs">{conv.facebook_name}</span></div>}
      </div>

      {/* Lead Info */}
      <div className="rounded-xl border p-3 space-y-2">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Lead Info</p>
        {conv.package_interest && <div className="text-xs">📦 <span className="font-medium">{conv.package_interest}</span></div>}
        {conv.budget && <div className="text-xs">💰 ₹{Number(conv.budget).toLocaleString("en-IN")}</div>}
        {conv.source && <div className="text-xs">📌 Source: <span className="font-medium capitalize">{conv.source}</span></div>}
        {conv.assigned_branch && <div className="text-xs">🏢 Branch: <span className="font-medium">{conv.assigned_branch}</span></div>}
        <div className="text-xs">💬 Messages: <span className="font-medium">{conv.total_messages || conv.conversation_count || 0}</span></div>
      </div>

      {/* Update Section */}
      <div className="rounded-xl border p-3 space-y-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Update</p>
        <div className="space-y-1">
          <Label className="text-[10px]">Status</Label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs">
            {STATUSES.map(s => <option key={s} value={s}>{fmtStatus(s)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Priority</Label>
          <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs">
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High ⚡</option>
            <option value="urgent">Urgent 🚨</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Assigned Staff</Label>
          <Input value={assignedName} onChange={e => setAssignedName(e.target.value)} className="h-8 text-xs" placeholder="Staff name" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Follow-up Date</Label>
          <Input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} className="h-8 text-xs" />
        </div>
        <Button size="sm" onClick={save} disabled={saving} className="w-full h-7 text-xs gap-1">
          {saving ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} />}
          Save
        </Button>
      </div>

      {/* Quick Links */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Quick Links</p>
        {conv.conversion_booking_id && (
          <a href={`/admin/bookings?id=${conv.conversion_booking_id}`} className="text-xs flex items-center gap-1.5 text-primary hover:underline">
            📋 Booking #{conv.conversion_booking_id}
          </a>
        )}
        <a href={`/admin/leads`} className="text-xs flex items-center gap-1.5 text-primary hover:underline">
          👤 View in Lead Manager
        </a>
      </div>
    </div>
  );
}

// ── Omni Dashboard (shown when no conversation is selected) ───────────────────
const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  lead:         { icon: "🎯", color: "text-violet-700", label: "Lead" },
  message:      { icon: "💬", color: "text-blue-700",   label: "Message" },
  notification: { icon: "🔔", color: "text-amber-700",  label: "Notification" },
  timeline:     { icon: "📋", color: "text-emerald-700", label: "Booking Event" },
};

const CHANNEL_ICONS: Record<string, string> = {
  facebook: "📘", instagram: "📸", telegram: "✈️",
  whatsapp: "💬", whatsapp_api: "💬", website: "🌐", email: "✉️", sms: "📱",
};

function OmniDashboard({ onSelectFilter }: { onSelectFilter: (f: any) => void }) {
  const [stats, setStats] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    fetch(`${BASE_API}/api/admin/omni-stats`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const statCards = stats ? [
    { label: "Unread Messages",  value: stats.unread,        icon: "📬", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",   filter: { status: "unread" } },
    { label: "Pending Reply",    value: stats.pendingReply,  icon: "⏳", color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",  filter: { status: "in_progress" } },
    { label: "Missed (2h+)",     value: stats.missed,        icon: "⚠️", color: "text-red-700",    bg: "bg-red-50 border-red-200",      filter: {} },
    { label: "Missed Calls",     value: stats.missedCalls,   icon: "📵", color: "text-orange-700", bg: "bg-orange-50 border-orange-200",filter: {} },
    { label: "Today's Leads",    value: stats.todayLeads,    icon: "🎯", color: "text-violet-700", bg: "bg-violet-50 border-violet-200",filter: {} },
    { label: "Today's Bookings", value: stats.todayBookings, icon: "📋", color: "text-green-700",  bg: "bg-green-50 border-green-200",  filter: {} },
    { label: "Leads This Week",  value: stats.weekLeads,     icon: "📈", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200",filter: {} },
    { label: "Msgs This Week",   value: stats.weekMessages,  icon: "💬", color: "text-sky-700",    bg: "bg-sky-50 border-sky-200",      filter: {} },
  ] : [];

  return (
    <div className="flex-1 overflow-y-auto bg-muted/5 p-4 space-y-5 hidden md:block">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Omni-Channel Dashboard</h2>
          <p className="text-xs text-muted-foreground mt-0.5">All channels in one inbox — WhatsApp, Telegram, Facebook, Instagram, Website, Email, SMS</p>
        </div>
        <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border hover:bg-muted transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* Stat Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-4 bg-background animate-pulse">
              <div className="h-6 w-1/2 bg-muted rounded mb-2" />
              <div className="h-8 w-1/3 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {statCards.map(s => (
            <button
              key={s.label}
              className={`border rounded-xl p-4 text-left transition-all hover:shadow-md bg-background ${s.bg}`}
              onClick={() => s.filter && Object.keys(s.filter).length && onSelectFilter(s.filter)}
            >
              <div className="text-xl mb-1">{s.icon}</div>
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Per-Channel Unread Breakdown */}
      {stats?.unreadByChannel && Object.keys(stats.unreadByChannel).length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-2">Unread by Channel</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.unreadByChannel as Record<string, number>).map(([platform, cnt]) => (
              <button
                key={platform}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-background hover:bg-muted/40 transition-colors text-xs font-semibold"
                onClick={() => onSelectFilter({ platform })}
              >
                <span>{CHANNEL_ICONS[platform] || "📣"}</span>
                <span className="capitalize">{platform.replace(/_/g, " ")}</span>
                <span className="ml-1 bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{cnt}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Campaign Performance Summary */}
      {stats?.campaignPerf && (
        <div className="border rounded-xl bg-background p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📣</span>
            <h3 className="text-sm font-bold">Campaign Performance (Last 30 Days)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-xl font-bold font-mono text-purple-700">{stats.campaignPerf.totalCampaigns}</div>
              <div className="text-[10px] text-muted-foreground">Total Campaigns</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold font-mono text-green-700">{stats.campaignPerf.sentCampaigns}</div>
              <div className="text-[10px] text-muted-foreground">Sent</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold font-mono text-blue-700">{(stats.campaignPerf.totalReach || 0).toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Total Reach</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold font-mono text-amber-700">₹{(stats.campaignPerf.totalRevenue || 0).toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Revenue Generated</div>
            </div>
          </div>
          {stats.campaignPerf.lastCampaignName && (
            <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
              Last campaign: <span className="font-semibold text-foreground">{stats.campaignPerf.lastCampaignName}</span>
              {stats.campaignPerf.lastCampaignChannel && (
                <span className="ml-2 capitalize bg-muted px-1.5 py-0.5 rounded">{stats.campaignPerf.lastCampaignChannel}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Live Activity Feed */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold">Live Activity Feed</h3>
          <span className="text-[10px] text-muted-foreground bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">● Live · refreshes every 30s</span>
        </div>
        <div className="border rounded-xl overflow-hidden bg-background divide-y max-h-[420px] overflow-y-auto">
          {!stats?.activity?.length ? (
            <div className="py-10 text-center text-muted-foreground text-sm">No activity yet. Messages and leads will appear here.</div>
          ) : (
            stats.activity.map((ev: any, i: number) => {
              const m = TYPE_META[ev.type] || { icon: "📋", color: "text-gray-600", label: ev.type };
              return (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <span className="text-lg flex-shrink-0 mt-0.5">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold truncate">{ev.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${m.color} bg-white border-current/20`}>{m.label}</span>
                      {ev.subtitle && <span className="text-[10px] text-muted-foreground capitalize">{String(ev.subtitle).replace(/_/g, " ")}</span>}
                    </div>
                    {ev.meta && <p className="text-xs text-muted-foreground truncate mt-0.5">{ev.meta}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                    {ev.ts ? fmtTime(ev.ts) : ""}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function OmnichannelInbox() {
  const { toast } = useToast();

  // State: lists
  const [conversations, setConversations] = useState<any[]>([]);
  const [totalConvs, setTotalConvs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({});

  // State: active conversation
  const [activeConv, setActiveConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  // State: filters
  const [search, setSearch] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterTab, setFilterTab] = useState<"all"|"unread"|"followup"|"mine">("all");

  // State: reply
  const [replyText, setReplyText] = useState("");
  const [replyChannel, setReplyChannel] = useState("whatsapp");
  const [sendingReply, setSendingReply] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [showRightBar, setShowRightBar] = useState(true);

  // State: file attachment
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State: voice recorder
  const [recording, setRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recChunksRef = useRef<Blob[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // ── Load conversations ──────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPlatform !== "all") params.set("platform", filterPlatform);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterTab === "unread" || filterUnread) params.set("unread", "true");
      if (search) params.set("search", search);
      params.set("limit", "80");
      const r = await fetch(`${BASE_API}/api/inbox/conversations?${params}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setConversations(d.conversations || []);
        setTotalConvs(d.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [filterPlatform, filterStatus, filterTab, filterUnread, search]);

  // ── Load stats ──────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_API}/api/inbox/stats`, { credentials: "include" });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  useEffect(() => { loadConversations(); loadStats(); }, [loadConversations, loadStats]);

  // ── SSE: Real-time inbox updates ─────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        es = new EventSource(`${BASE_API}/api/inbox/stream`, { withCredentials: true });
        es.addEventListener("connected", () => console.log("[Inbox SSE] connected"));
        es.addEventListener("new_message", (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            // Refresh conversation list and messages if the active conv matches
            loadConversations();
            setActiveConv((cur: any) => {
              if (cur && (cur.id === data.lead_id || cur.mobile === data.mobile)) {
                // Reload messages for this conversation
                fetch(`${BASE_API}/api/inbox/conversations/${cur.id}/messages`, { credentials: "include" })
                  .then(r => r.json()).then(d => setMessages(d.messages || [])).catch(() => {});
              }
              return cur;
            });
          } catch {}
        });
        es.onerror = () => {
          es?.close();
          // Reconnect after 10 seconds
          reconnectTimer = setTimeout(connect, 10000);
        };
      } catch {}
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── File attachment handler ──────────────────────────────────────
  const handleFileAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 20 MB", variant: "destructive" });
      return;
    }
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("caption", replyText.trim() || "");
      const r = await fetch(`${BASE_API}/api/inbox/conversations/${activeConv.id}/media`, {
        method: "POST", credentials: "include", body: form,
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        toast({ title: "File sent ✓" });
        setReplyText("");
        // Reload messages
        const mr = await fetch(`${BASE_API}/api/inbox/conversations/${activeConv.id}/messages`, { credentials: "include" });
        if (mr.ok) { const md = await mr.json(); setMessages(md.messages || []); }
      } else {
        toast({ title: "Send failed", description: d.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [activeConv, replyText, toast]);

  // ── Voice recorder handlers ──────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!activeConv) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      recorder.start(100);
      recorderRef.current = recorder;
      setRecording(true);
      setRecDuration(0);
      recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000);
    } catch {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  }, [activeConv, toast]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecording(false);

    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
      recorder.stop();
      recorder.stream.getTracks().forEach(t => t.stop());
    });

    const blob = new Blob(recChunksRef.current, { type: recorder.mimeType });
    if (blob.size < 1000) { toast({ title: "Recording too short", variant: "destructive" }); return; }

    const ext = recorder.mimeType.includes("ogg") ? "ogg" : "webm";
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append("audio", blob, `voice_${Date.now()}.${ext}`);
      const r = await fetch(`${BASE_API}/api/inbox/conversations/${activeConv.id}/voice`, {
        method: "POST", credentials: "include", body: form,
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        toast({ title: "Voice note sent ✓" });
        const mr = await fetch(`${BASE_API}/api/inbox/conversations/${activeConv.id}/messages`, { credentials: "include" });
        if (mr.ok) { const md = await mr.json(); setMessages(md.messages || []); }
      } else {
        toast({ title: "Send failed", description: d.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setUploadingFile(false);
  }, [activeConv, toast]);

  // ── Open conversation ───────────────────────────────────────────
  const openConversation = async (conv: any) => {
    setActiveConv(conv);
    setMsgLoading(true);
    setMessages([]); setOutgoing([]);
    // Update unread in list immediately
    setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
    try {
      const r = await fetch(`${BASE_API}/api/inbox/conversations/${conv.id}/messages`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages || []);
        setOutgoing(d.outgoing || []);
        // Set smart default reply channel
        if (d.lead?.platform?.includes("telegram")) setReplyChannel("telegram");
        else if (d.lead?.email && !d.lead?.mobile) setReplyChannel("email");
        else setReplyChannel("whatsapp");
      }
    } catch {}
    setMsgLoading(false);
  };

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, outgoing]);

  // ── Build combined + sorted message thread ──────────────────────
  const allMessages = [
    ...messages.map((m: any) => ({ ...m, _sort: new Date(m.created_at).getTime() })),
    ...outgoing.map((m: any) => ({ ...m, direction: "outgoing", _sort: new Date(m.created_at).getTime() })),
  ].sort((a, b) => a._sort - b._sort);

  // ── AI Suggest ──────────────────────────────────────────────────
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const fetchAiSuggest = async () => {
    if (!activeConv) return;
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const r = await fetch(`${BASE_API}/api/inbox/conversations/${activeConv.id}/ai-suggest`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (d.suggestions?.length) setAiSuggestions(d.suggestions);
    } catch {}
    setAiLoading(false);
  };

  // ── Send reply ──────────────────────────────────────────────────
  const sendReply = async () => {
    if (!replyText.trim() || !activeConv) return;
    setSendingReply(true);
    try {
      const endpoint = noteMode ? "note" : "reply";
      const body = noteMode ? { text: replyText } : { message: replyText, channel: replyChannel };
      const r = await fetch(`${BASE_API}/api/inbox/conversations/${activeConv.id}/${endpoint}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        toast({ title: noteMode ? "Note added" : "Message sent" });
        setReplyText("");
        // Reload messages
        const msgR = await fetch(`${BASE_API}/api/inbox/conversations/${activeConv.id}/messages`, { credentials: "include" });
        if (msgR.ok) { const d = await msgR.json(); setMessages(d.messages || []); setOutgoing(d.outgoing || []); }
        loadConversations();
      } else {
        const err = await r.json().catch(() => ({}));
        toast({ title: err.error || "Send failed", variant: "destructive" });
      }
    } catch { toast({ title: "Error sending", variant: "destructive" }); }
    setSendingReply(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendReply();
  };

  // ── Close / Reopen conversation ─────────────────────────────────
  const closeConv = async (id: string) => {
    await fetch(`${BASE_API}/api/inbox/conversations/${id}/close`, { method: "POST", credentials: "include" });
    toast({ title: "Conversation closed" });
    setActiveConv(null);
    loadConversations();
  };

  // ── Tab filter quick-apply ──────────────────────────────────────
  const TAB_FILTERS: { key: typeof filterTab; label: string; badge?: number }[] = [
    { key: "all",      label: "All" },
    { key: "unread",   label: "Unread", badge: stats.unread },
    { key: "followup", label: "Follow-up", badge: stats.follow_ups_today },
    { key: "mine",     label: "Mine" },
  ];

  const PLATFORM_FILTERS = [
    "all", "whatsapp", "instagram", "facebook", "messenger", "telegram",
    "website", "email", "sms",
  ];

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">

        {/* ── LEFT: Conversation List ─────────────────────────────── */}
        <div className={`flex flex-col border-r bg-background ${activeConv ? "hidden md:flex" : "flex"} w-full md:w-[300px] lg:w-[320px] xl:w-[340px] flex-shrink-0`}>
          {/* Header */}
          <div className="px-4 py-3 border-b space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-bold text-base">Omnichannel Inbox</h1>
                <p className="text-[10px] text-muted-foreground">{totalConvs} conversations · {stats.unread || 0} unread</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { loadConversations(); loadStats(); }} className="w-7 h-7 p-0">
                <RefreshCw size={13} />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…" className="pl-8 h-8 text-xs" />
            </div>

            {/* Quick tabs */}
            <div className="flex gap-1">
              {TAB_FILTERS.map(t => (
                <button key={t.key} onClick={() => setFilterTab(t.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${filterTab === t.key ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                  {t.badge ? <span className={`text-[9px] px-1 rounded-full ${filterTab === t.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground"}`}>{t.badge}</span> : null}
                </button>
              ))}
            </div>

            {/* Platform filter chips */}
            <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              {PLATFORM_FILTERS.map(p => (
                <button key={p} onClick={() => setFilterPlatform(p)}
                  className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] border transition-all ${filterPlatform === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                  {p === "all" ? "All" : (PLATFORM_META[p]?.icon || "") + " " + (PLATFORM_META[p]?.label || p)}
                </button>
              ))}
            </div>
          </div>

          {/* Stats mini-row */}
          <div className="px-4 py-2 bg-muted/20 border-b flex gap-3 text-[10px] text-muted-foreground">
            <span>📥 {stats.today_messages || 0} messages today</span>
            <span>👤 {stats.today_leads || 0} new leads</span>
            <span>📅 {stats.follow_ups_today || 0} follow-ups</span>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <MessageCircle size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No conversations</p>
                <p className="text-xs mt-1">Messages from all channels appear here automatically</p>
              </div>
            ) : (
              conversations.map(c => (
                <ConvItem key={c.id} conv={c} active={activeConv?.id === c.id} onClick={() => openConversation(c)} />
              ))
            )}
          </div>
        </div>

        {/* ── CENTER: Chat Window ─────────────────────────────────── */}
        {activeConv ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Chat header */}
            <div className="px-4 py-3 border-b bg-background flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setActiveConv(null)} className="md:hidden w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
                <ArrowLeft size={16} />
              </button>
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {initials(activeConv.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm">{activeConv.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPlatformMeta(activeConv).bg} ${getPlatformMeta(activeConv).color}`}>
                    {getPlatformMeta(activeConv).icon} {getPlatformMeta(activeConv).label}
                  </span>
                  <Badge variant="outline" className={`text-[10px] h-4 py-0 ${STATUS_COLORS[activeConv.status] || "bg-gray-100 text-gray-600"}`}>
                    {fmtStatus(activeConv.status)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeConv.mobile || activeConv.email || activeConv.telegram_username || "No contact info"}
                </p>
              </div>
              {/* Header actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {activeConv.mobile && (
                  <a href={`tel:${activeConv.mobile}`} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" title="Call">
                    <Phone size={14} />
                  </a>
                )}
                {activeConv.mobile && (
                  <a href={`https://wa.me/${activeConv.mobile?.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                    className="w-8 h-8 rounded-lg hover:bg-green-50 text-green-700 flex items-center justify-center" title="WhatsApp">
                    💬
                  </a>
                )}
                <button onClick={() => setShowRightBar(b => !b)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center" title="Toggle profile">
                  <Info size={14} />
                </button>
                <button onClick={() => closeConv(activeConv.id)} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" title="Close conversation">
                  <Archive size={14} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-muted/5">
              {msgLoading ? (
                <div className="py-16 text-center text-muted-foreground text-sm">Loading messages…</div>
              ) : allMessages.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <MessageCircle size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="font-medium">No messages yet</p>
                  <p className="text-xs mt-1">Messages from all channels appear here automatically.</p>
                </div>
              ) : (
                allMessages.map((m: any, i: number) => <MsgBubble key={m.id || i} msg={m} />)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Area */}
            <div className="border-t bg-background p-4 flex-shrink-0">
              {/* AI Suggestions */}
              {aiSuggestions.length > 0 && !noteMode && (
                <div className="mb-2 space-y-1.5">
                  <p className="text-[10px] font-semibold text-violet-700 flex items-center gap-1">
                    <Sparkles size={10} /> AI Suggestions — click to use
                  </p>
                  {aiSuggestions.map((s, i) => (
                    <button key={i} onClick={() => { setReplyText(s); setAiSuggestions([]); }}
                      className="w-full text-left text-xs px-3 py-2 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 transition-colors text-violet-900 leading-relaxed">
                      {s}
                    </button>
                  ))}
                  <button onClick={() => setAiSuggestions([])} className="text-[10px] text-muted-foreground hover:text-foreground">
                    Dismiss
                  </button>
                </div>
              )}

              {/* Channel + mode selectors */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="flex gap-1">
                  <button onClick={() => setNoteMode(false)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${!noteMode ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    Reply
                  </button>
                  <button onClick={() => setNoteMode(true)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${noteMode ? "bg-yellow-100 text-yellow-800 border-yellow-300" : "hover:bg-muted"}`}>
                    📝 Note
                  </button>
                </div>
                {!noteMode && (
                  <select value={replyChannel} onChange={e => setReplyChannel(e.target.value)}
                    className="h-7 rounded-lg border border-input bg-background px-2 text-xs">
                    {activeConv.mobile && <option value="whatsapp">💬 WhatsApp</option>}
                    {activeConv.mobile && <option value="sms">📱 SMS</option>}
                    {activeConv.email && <option value="email">✉️ Email</option>}
                    {(activeConv.platform?.includes("telegram") || activeConv.telegram_username) && <option value="telegram">✈️ Telegram</option>}
                  </select>
                )}
                {!noteMode && (
                  <button onClick={fetchAiSuggest} disabled={aiLoading}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50">
                    {aiLoading
                      ? <RefreshCw size={10} className="animate-spin" />
                      : <Sparkles size={10} />}
                    AI Suggest
                  </button>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">Ctrl+Enter to send</span>
              </div>

              {/* Textarea */}
              <div className={`rounded-xl border overflow-hidden ${noteMode ? "border-yellow-300 bg-yellow-50" : ""}`}>
                <textarea
                  ref={replyRef}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={noteMode ? "Add internal note (visible to staff only)…" : `Type your ${replyChannel} message…`}
                  className={`w-full px-4 py-3 text-sm resize-none focus:outline-none bg-transparent ${noteMode ? "placeholder:text-yellow-600" : ""}`}
                  rows={3}
                />
                <div className="flex items-center justify-between px-3 py-2 border-t gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">{replyText.length} chars</span>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={handleFileAttach}
                    />

                    {/* File attachment button — only for WhatsApp in reply mode */}
                    {!noteMode && replyChannel === "whatsapp" && (
                      <button
                        title="Attach file (image, PDF, doc)"
                        disabled={uploadingFile}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground disabled:opacity-40 transition-colors"
                      >
                        {uploadingFile
                          ? <RefreshCw size={13} className="animate-spin" />
                          : <Paperclip size={13} />}
                      </button>
                    )}

                    {/* Voice recorder button — only for WhatsApp in reply mode */}
                    {!noteMode && replyChannel === "whatsapp" && (
                      <button
                        title={recording ? `Stop recording (${recDuration}s)` : "Record voice note"}
                        disabled={uploadingFile}
                        onClick={recording ? stopRecording : startRecording}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                          recording
                            ? "bg-red-100 text-red-600 hover:bg-red-200 animate-pulse"
                            : "hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {recording ? <StopCircle size={13} /> : <Mic size={13} />}
                      </button>
                    )}

                    {recording && (
                      <span className="text-xs text-red-600 font-medium tabular-nums">
                        🔴 {recDuration}s
                      </span>
                    )}
                  </div>

                  <Button size="sm" onClick={sendReply} disabled={sendingReply || !replyText.trim()} className="gap-1.5 h-7 text-xs">
                    {sendingReply ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                    {noteMode ? "Add Note" : "Send"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Omni Dashboard */
          <OmniDashboard onSelectFilter={(f: any) => {
            if (f.platform) setFilterPlatform(f.platform);
            if (f.status === "unread") { setFilterUnread(true); setFilterTab("unread"); }
            else if (f.status) setFilterStatus(f.status);
          }} />
        )}

        {/* ── RIGHT: Customer Profile ─────────────────────────────── */}
        {activeConv && showRightBar && (
          <div className="hidden lg:flex flex-col border-l bg-background w-[260px] xl:w-[280px] flex-shrink-0 overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer Profile</p>
              <button onClick={() => setShowRightBar(false)} className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center">
                <X size={12} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <RightSidebar
                conv={activeConv}
                onUpdate={() => {}}
                onRefresh={() => { openConversation(activeConv); loadConversations(); }}
              />
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
