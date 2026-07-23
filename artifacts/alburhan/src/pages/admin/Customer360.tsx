import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  User, Phone, Mail, MapPin, Search, ExternalLink, ChevronRight,
  MessageSquare, Send, FileText, CreditCard, Plane, Building2,
  Bus, Star, Activity, Brain, Zap, Clock, CheckCircle, XCircle,
  AlertCircle, Download, Eye, Upload, RefreshCw, Plus, Target,
  TrendingUp, Shield, Heart, Calendar, Hash, Globe, UserCheck,
  Package, Receipt, Landmark, Camera, Edit3, StickyNote, Award,
  BookOpen, BarChart3, Layers, Users, ArrowRight, ArrowLeft, Info, Tag,
  CheckSquare, Smartphone, AtSign, Share2
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

// ── Types ──────────────────────────────────────────────────────────────────
interface Profile360 {
  user: any;
  bookings: any[];
  payments: any[];
  documents: any[];
  communications: any[];
  leads: any[];
  agreements: any[];
  invoices: any[];
  loyalty: any;
  timeline: any[];
  travel: { pilgrims: any[]; flights: any[] };
  health: any;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: any) => {
  const v = parseFloat(n || 0);
  return isNaN(v) ? "₹0" : `₹${v.toLocaleString("en-IN")}`;
};
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtTime = (d: any) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const statusColor = (s: string) => {
  const m: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800", approved: "bg-blue-100 text-blue-800",
    pending: "bg-yellow-100 text-yellow-800", cancelled: "bg-red-100 text-red-800",
    rejected: "bg-red-100 text-red-800", partially_paid: "bg-orange-100 text-orange-800",
    signed: "bg-green-100 text-green-800", draft: "bg-gray-100 text-gray-600",
    converted: "bg-purple-100 text-purple-800", received: "bg-green-100 text-green-800",
    in_process: "bg-blue-100 text-blue-800", applied: "bg-yellow-100 text-yellow-800",
  };
  return m[s] || "bg-gray-100 text-gray-700";
};

const platformIcon = (p: string) => {
  const icons: Record<string, string> = {
    whatsapp: "🟢", telegram: "🔵", instagram: "🟣", facebook: "🔷",
    messenger: "🔵", sms: "📱", email: "📧", website_contact: "🌐",
    website_livechat: "💬", rcs: "📲", internal: "🔒", notification: "🔔",
  };
  return icons[p] || "💬";
};

const tierColor = (t: string) => {
  const m: Record<string, string> = {
    platinum: "text-purple-700 bg-purple-50", gold: "text-yellow-700 bg-yellow-50",
    silver: "text-gray-600 bg-gray-50", bronze: "text-orange-700 bg-orange-50",
  };
  return m[t] || "text-gray-600 bg-gray-50";
};

// ── Health Score Bar ───────────────────────────────────────────────────────
function ScoreBar({ label, value, color = "bg-emerald-500" }: { label: string; value: number; color?: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Search Page ────────────────────────────────────────────────────────────
function SearchPage({ onSelect }: { onSelect: (type: "user" | "lead", id: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ users: any[]; leads: any[] }>({ users: [], leads: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults({ users: [], leads: [] }); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`${API}/api/customer360/search?q=${encodeURIComponent(q)}`);
        if (r.ok) setResults(await r.json());
      } finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const total = results.users.length + results.leads.length;

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 mb-4">
            <UserCheck size={32} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Customer 360° Profile</h1>
          <p className="text-gray-500 mt-1">Search by name, mobile, email, or passport number</p>
        </div>
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search customers and leads…"
            className="w-full pl-12 pr-4 py-4 text-lg border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {loading && <RefreshCw size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
        </div>

        {total > 0 && (
          <div className="mt-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {results.users.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Customers ({results.users.length})
                </div>
                {results.users.map(u => (
                  <button key={u.id} onClick={() => onSelect("user", u.mobile)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 text-left border-b border-gray-100 last:border-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                      {u.photo_url ? <img src={u.photo_url} className="w-9 h-9 rounded-full object-cover" /> : u.name?.charAt(0) || "C"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{u.name}</div>
                      <div className="text-sm text-gray-500">{u.mobile} · {u.email || "No email"}</div>
                    </div>
                    {u.passport_number && <span className="text-xs text-gray-400">{u.passport_number}</span>}
                    <ChevronRight size={14} className="text-gray-400 shrink-0" />
                  </button>
                ))}
              </>
            )}
            {results.leads.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Leads ({results.leads.length})
                </div>
                {results.leads.map(l => (
                  <button key={l.id} onClick={() => onSelect("lead", l.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left border-b border-gray-100 last:border-0">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                      {l.name?.charAt(0) || "L"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{l.name}</div>
                      <div className="text-sm text-gray-500">{l.mobile} · <span className="capitalize">{l.source}</span></div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(l.status)}`}>{l.status}</span>
                    <ChevronRight size={14} className="text-gray-400 shrink-0" />
                  </button>
                ))}
              </>
            )}
          </div>
        )}
        {q.length >= 2 && !loading && total === 0 && (
          <div className="mt-4 text-center py-8 text-gray-500">
            No customers or leads found for "{q}"
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Customer360() {
  const [selectedType, setSelectedType] = useState<"user" | "lead" | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [data, setData] = useState<Profile360 | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [replyText, setReplyText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const [sendingReply, setSendingReply] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [commsFilter, setCommsFilter] = useState("all");
  const [timelineFull, setTimelineFull] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  const loadProfile = useCallback(async (type: "user" | "lead", id: string) => {
    setLoading(true);
    setData(null);
    try {
      const url = type === "lead"
        ? `${API}/api/customer360/lead/${id}`
        : `${API}/api/customer360/user/${id}`;
      const r = await fetch(url);
      if (r.ok) setData(await r.json());
    } finally { setLoading(false); }
  }, []);

  const handleSelect = useCallback((type: "user" | "lead", id: string) => {
    setSelectedType(type);
    setSelectedId(id);
    setActiveTab("overview");
    loadProfile(type, id);
  }, [loadProfile]);

  const addNote = async () => {
    if (!noteText || !data?.user?.mobile) return;
    setAddingNote(true);
    try {
      await fetch(`${API}/api/customer360/user/${data.user.mobile}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText, category: noteCategory }),
      });
      setNoteText("");
      loadProfile("user", data.user.mobile);
    } finally { setAddingNote(false); }
  };

  const createTask = async () => {
    if (!taskTitle.trim() || !data?.user?.mobile) return;
    setCreatingTask(true);
    try {
      const r = await fetch(`${API}/api/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle.trim(),
          notes: taskNotes.trim() || undefined,
          due_date: taskDueDate || undefined,
          customer_mobile: data.user.mobile,
          customer_name: data.user.name || undefined,
          status: "pending",
        }),
      });
      if (r.ok) {
        const created = await r.json();
        setTasks(prev => [created, ...prev]);
        setTaskTitle(""); setTaskDueDate(""); setTaskNotes(""); setShowTaskForm(false);
      }
    } finally { setCreatingTask(false); }
  };

  const sendWhatsApp = async () => {
    if (!replyText || !data?.user?.mobile) return;
    setSendingReply(true);
    try {
      await fetch(`${API}/api/inbox/conversations/${data.leads[0]?.id || "none"}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: replyText, channel: "whatsapp", mobile: data.user.mobile }),
      });
      setReplyText("");
      loadProfile("user", data.user.mobile);
    } finally { setSendingReply(false); }
  };

  useEffect(() => {
    if (activeTab !== "comms") return;
    const uid = data?.user?.id;
    const mobile = data?.user?.mobile;
    if (!uid && !mobile) return;
    setTimelineLoading(true);
    const url = uid
      ? `${API}/api/customers/${uid}/timeline-full?limit=100`
      : `${API}/api/customer360/user/${encodeURIComponent(mobile!)}/timeline-full?limit=100`;
    fetch(url, { credentials: "include" })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setTimelineFull(Array.isArray(d.items) ? d.items : []))
      .catch(() => {})
      .finally(() => setTimelineLoading(false));
  }, [activeTab, data?.user?.id, data?.user?.mobile]);

  useEffect(() => {
    if (activeTab !== "tasks" || !data?.user?.mobile) return;
    setTasksLoading(true);
    fetch(`${API}/api/tasks`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const mobile = data!.user!.mobile;
        const all: any[] = Array.isArray(d) ? d : (d.tasks || []);
        const last9 = mobile.replace(/\D/g, "").slice(-9);
        setTasks(all.filter((t: any) =>
          (t.customer_mobile && t.customer_mobile.replace(/\D/g, "").endsWith(last9)) ||
          (t.notes && t.notes.includes(last9))
        ));
      })
      .catch(() => {})
      .finally(() => setTasksLoading(false));
  }, [activeTab, data?.user?.mobile]);

  // ── AI suggestions (rule-based) ──────────────────────────────────────────
  const aiSuggestions = data ? (() => {
    const tips: { icon: string; color: string; text: string }[] = [];
    const { user, bookings, payments, documents, leads, travel, invoices } = data;

    if (!user && leads.length > 0) tips.push({ icon: "🎯", color: "blue", text: "Lead not yet converted to a booking — consider following up." });

    const confirmed = bookings.filter(b => ["confirmed", "approved"].includes(b.status));
    const pendingPay = confirmed.filter(b => parseFloat(b.final_amount) > parseFloat(b.paid_amount));
    if (pendingPay.length > 0) {
      const amt = pendingPay.reduce((s, b) => s + parseFloat(b.final_amount) - parseFloat(b.paid_amount), 0);
      tips.push({ icon: "💰", color: "red", text: `Outstanding payment of ₹${amt.toLocaleString("en-IN")} pending across ${pendingPay.length} booking(s).` });
    }

    const passports = documents.filter(d => d.document_type === "passport");
    if (confirmed.length > 0 && passports.length === 0) tips.push({ icon: "📋", color: "orange", text: "Passport not uploaded — required before visa processing." });

    const visas = travel.pilgrims.filter(p => p.visa_status === "not_applied" || !p.visa_status);
    if (visas.length > 0) tips.push({ icon: "🛂", color: "yellow", text: `Visa not applied for ${visas.length} pilgrim(s).` });

    const unassignedFlights = confirmed.filter(b => b.group_id && !travel.flights.length);
    if (unassignedFlights.length > 0) tips.push({ icon: "✈️", color: "blue", text: "Flight not assigned for confirmed booking." });

    const loyalty = data.loyalty;
    if (loyalty && loyalty.total_points > 500) tips.push({ icon: "⭐", color: "purple", text: `Customer has ${loyalty.total_points} loyalty points — suggest redemption offer.` });

    if (bookings.length >= 2) tips.push({ icon: "🎁", color: "green", text: "Repeat customer — eligible for loyalty discount on next booking." });

    const overdue = invoices.filter(i => i.balance > 0 && i.due_date && new Date(i.due_date) < new Date());
    if (overdue.length > 0) tips.push({ icon: "⚠️", color: "red", text: `${overdue.length} invoice(s) overdue — send payment reminder.` });

    if (tips.length === 0) tips.push({ icon: "✅", color: "green", text: "Everything looks good! Customer profile is complete and up-to-date." });

    return tips;
  })() : [];

  const tabs = [
    { id: "overview",   label: "Overview",        icon: User },
    { id: "bookings",   label: "Bookings",         icon: Package,       badge: data?.bookings.length },
    { id: "payments",   label: "Payments",         icon: CreditCard,    badge: data?.payments.length },
    { id: "comms",      label: "Communication",    icon: MessageSquare, badge: data?.communications.length },
    { id: "tasks",      label: "Tasks",            icon: CheckSquare },
    { id: "lead",       label: "Lead History",     icon: Target,        badge: data?.leads.length },
    { id: "travel",     label: "Travel",           icon: Plane },
    { id: "documents",  label: "Documents",        icon: FileText,      badge: data?.documents.length },
    { id: "timeline",   label: "Timeline",         icon: Activity,      badge: data?.timeline.length },
    { id: "ai",         label: "AI Insights",      icon: Brain,         badge: aiSuggestions.length },
  ];

  if (!selectedId) {
    return (
      <AdminLayout>
        <SearchPage onSelect={handleSelect} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        {/* ── Top Bar ── */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setSelectedId(""); setSelectedType(null); setData(null); }}
            className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1">
            ← Back
          </button>
          <span className="text-gray-300">|</span>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && searchQ.length >= 2) {
                setSearchQ(""); setSelectedId(""); setSelectedType(null); setData(null);
              }}}
              placeholder="Search another customer…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          {data?.user && (
            <span className="text-sm font-medium text-gray-700">{data.user.name} · {data.user.mobile}</span>
          )}
          <button onClick={() => selectedType && loadProfile(selectedType, selectedId)}
            className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={24} className="animate-spin text-emerald-500" />
          </div>
        )}

        {!loading && data && (
          <div className="flex gap-0 h-full">
            {/* ── Left Profile Card ── */}
            <div className="w-72 shrink-0 bg-white border-r border-gray-200 overflow-y-auto" style={{ minHeight: "calc(100vh - 120px)" }}>
              {/* Profile Header */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-3xl font-bold mb-3 overflow-hidden shadow-md">
                    {data.user?.photo_url
                      ? <img src={data.user.photo_url} className="w-20 h-20 object-cover" />
                      : (data.user?.name || data.leads[0]?.name || "?").charAt(0)}
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">
                    {data.user?.name || data.leads[0]?.name || "Unknown"}
                  </h2>
                  <p className="text-sm text-gray-500">{data.user?.mobile || data.leads[0]?.mobile}</p>
                  {data.loyalty && (
                    <span className={`mt-2 text-xs font-semibold px-3 py-1 rounded-full capitalize ${tierColor(data.loyalty.tier)}`}>
                      {data.loyalty.tier} · {data.loyalty.total_points} pts
                    </span>
                  )}
                  {!data.user && data.leads[0] && (
                    <span className="mt-2 text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full">Lead Only</span>
                  )}
                </div>
              </div>

              {/* Health Score */}
              {data.health && (
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Health Score</span>
                    <span className={`text-lg font-bold ${data.health.overall >= 70 ? "text-emerald-600" : data.health.overall >= 40 ? "text-yellow-600" : "text-red-500"}`}>
                      {data.health.overall}%
                    </span>
                  </div>
                  <ScoreBar label="Lead" value={data.health.leadScore} color="bg-blue-500" />
                  <ScoreBar label="Booking" value={data.health.bookingScore} color="bg-emerald-500" />
                  <ScoreBar label="Payment" value={data.health.paymentScore} color="bg-green-500" />
                  <ScoreBar label="Profile" value={data.health.profileScore} color="bg-purple-500" />
                  <ScoreBar label="Documents" value={data.health.docScore} color="bg-orange-500" />
                  <ScoreBar label="Communication" value={data.health.commScore} color="bg-teal-500" />
                </div>
              )}

              {/* Contact Info */}
              <div className="p-4 border-b border-gray-100 space-y-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contact</div>
                {data.user?.email && <div className="flex items-center gap-2 text-sm"><Mail size={13} className="text-gray-400 shrink-0" /><span className="truncate text-gray-700">{data.user.email}</span></div>}
                {data.user?.blood_group_full && <div className="flex items-center gap-2 text-sm"><Heart size={13} className="text-gray-400 shrink-0" /><span className="text-gray-700">Blood: {data.user.blood_group_full}</span></div>}
                {data.user?.gender && <div className="flex items-center gap-2 text-sm"><User size={13} className="text-gray-400 shrink-0" /><span className="text-gray-700 capitalize">{data.user.gender}</span></div>}
                {data.user?.date_of_birth && <div className="flex items-center gap-2 text-sm"><Calendar size={13} className="text-gray-400 shrink-0" /><span className="text-gray-700">{fmtDate(data.user.date_of_birth)}</span></div>}
                {data.user?.nationality && <div className="flex items-center gap-2 text-sm"><Globe size={13} className="text-gray-400 shrink-0" /><span className="text-gray-700">{data.user.nationality}</span></div>}
                {data.user?.address && <div className="flex items-start gap-2 text-sm"><MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" /><span className="text-gray-700 leading-tight">{data.user.address}{data.user.city ? `, ${data.user.city}` : ""}</span></div>}
                {data.user?.passport_number && <div className="flex items-center gap-2 text-sm"><Shield size={13} className="text-gray-400 shrink-0" /><span className="text-gray-700 font-mono">{data.user.passport_number}</span></div>}
                {data.user?.aadhar_number && <div className="flex items-center gap-2 text-sm"><Hash size={13} className="text-gray-400 shrink-0" /><span className="text-gray-700 font-mono">Aadhaar: {data.user.aadhar_number}</span></div>}
                {data.user?.pan_number && <div className="flex items-center gap-2 text-sm"><Hash size={13} className="text-gray-400 shrink-0" /><span className="text-gray-700 font-mono">PAN: {data.user.pan_number}</span></div>}
                {data.user?.emergency_contact_name && (
                  <div className="flex items-start gap-2 text-sm"><Phone size={13} className="text-gray-400 shrink-0 mt-0.5" />
                    <span className="text-gray-700">Emergency: {data.user.emergency_contact_name} {data.user.emergency_contact_mobile ? `· ${data.user.emergency_contact_mobile}` : ""}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm"><Clock size={13} className="text-gray-400 shrink-0" />
                  <span className="text-gray-500">Since {fmtDate(data.user?.created_at || data.leads[0]?.created_at)}</span>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="p-4 border-b border-gray-100">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Summary</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Bookings", value: data.bookings.length, color: "bg-emerald-50 text-emerald-700" },
                    { label: "Payments", value: data.payments.length, color: "bg-blue-50 text-blue-700" },
                    { label: "Documents", value: data.documents.length, color: "bg-orange-50 text-orange-700" },
                    { label: "Messages", value: data.communications.length, color: "bg-purple-50 text-purple-700" },
                  ].map(s => (
                    <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
                      <div className="text-xl font-bold">{s.value}</div>
                      <div className="text-xs">{s.label}</div>
                    </div>
                  ))}
                </div>
                {data.bookings.length > 0 && (() => {
                  const total = data.bookings.reduce((s, b) => s + parseFloat(b.paid_amount || 0), 0);
                  return (
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl text-center">
                      <div className="text-base font-bold text-gray-900">{fmt(total)}</div>
                      <div className="text-xs text-gray-500">Total Revenue</div>
                    </div>
                  );
                })()}
              </div>

              {/* Quick Actions */}
              <div className="p-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quick Actions</div>
                <div className="space-y-1.5">
                  {data.user?.mobile && <>
                    <a href={`tel:${data.user.mobile}`} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <Phone size={13} className="text-green-500" /> Call Customer
                    </a>
                    <a href={`https://wa.me/91${data.user.mobile}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <MessageSquare size={13} className="text-green-500" /> WhatsApp
                    </a>
                    {data.user.email && <a href={`mailto:${data.user.email}`} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <Mail size={13} className="text-blue-500" /> Send Email
                    </a>}
                  </>}
                  <a href="/admin/bookings/new" className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                    <Plus size={13} className="text-emerald-500" /> Create Booking
                  </a>
                  {data.bookings[0] && <>
                    <a href={`/admin/payments?booking=${data.bookings[0].id}`} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <CreditCard size={13} className="text-indigo-500" /> Collect Payment
                    </a>
                    <a href={`/admin/invoices?booking=${data.bookings[0].id}`} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <Receipt size={13} className="text-purple-500" /> Generate Invoice
                    </a>
                    <a href={`/admin/agreements?booking=${data.bookings[0].id}`} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <FileText size={13} className="text-orange-500" /> Agreement
                    </a>
                    <a href={`/admin/documents?booking=${data.bookings[0].id}`} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <Upload size={13} className="text-teal-500" /> Upload Document
                    </a>
                    <a href={`/admin/certificates?booking=${data.bookings[0].id}`} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <Award size={13} className="text-yellow-500" /> Certificate
                    </a>
                  </>}
                  {data.leads[0] && !data.bookings.length && (
                    <a href={`/admin/leads?open=${data.leads[0].id}`} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                      <ArrowRight size={13} className="text-blue-500" /> Open in Lead Manager
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right Content ── */}
            <div className="flex-1 overflow-y-auto" style={{ minHeight: "calc(100vh - 120px)" }}>
              {/* Tab Bar */}
              <div className="bg-white border-b border-gray-200 px-4 flex gap-0 overflow-x-auto">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === t.id
                        ? "border-emerald-500 text-emerald-700"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}>
                    <t.icon size={14} />
                    {t.label}
                    {t.badge != null && t.badge > 0 && (
                      <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === t.id ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {/* ── OVERVIEW ── */}
                {activeTab === "overview" && (
                  <div className="space-y-5">
                    {/* Customer ID + IDs row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Customer ID", value: data.user?.id?.slice(0, 12) || "—" },
                        { label: "Latest Booking", value: data.bookings[0]?.booking_number || "—" },
                        { label: "Agreement", value: data.agreements[0]?.agreement_number || "—" },
                        { label: "KYC Status", value: data.user?.kyc_status || "pending" },
                      ].map(item => (
                        <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                          <div className="text-xs text-gray-400 mb-1">{item.label}</div>
                          <div className={`text-sm font-semibold ${item.label === "KYC Status" ? statusColor(item.value) + " px-2 py-0.5 rounded-full inline-block" : "text-gray-900"}`}>
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Profile Completeness Bar */}
                    {data.user && (() => {
                      const fields = [
                        { label: "Name",             ok: !!data.user.name },
                        { label: "Email",            ok: !!data.user.email },
                        { label: "Gender",           ok: !!data.user.gender },
                        { label: "Date of Birth",    ok: !!data.user.date_of_birth },
                        { label: "Nationality",      ok: !!data.user.nationality },
                        { label: "Address",          ok: !!data.user.address },
                        { label: "Passport",         ok: !!data.user.passport_number },
                        { label: "Aadhaar",          ok: !!data.user.aadhar_number },
                        { label: "PAN",              ok: !!data.user.pan_number },
                        { label: "Blood Group",      ok: !!data.user.blood_group_full },
                        { label: "Emergency Contact",ok: !!data.user.emergency_contact_name },
                      ];
                      const done = fields.filter(f => f.ok).length;
                      const pct = Math.round((done / fields.length) * 100);
                      const missing = fields.filter(f => !f.ok);
                      return (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                              <UserCheck size={15} className="text-emerald-500" /> Profile Completeness
                            </h3>
                            <span className={`text-lg font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                              {pct}%
                            </span>
                          </div>
                          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {fields.map(f => (
                              <span key={f.label} className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${f.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                                {f.ok ? <CheckCircle size={9} /> : <AlertCircle size={9} />} {f.label}
                              </span>
                            ))}
                          </div>
                          {missing.length > 0 && (
                            <div className="mt-3 text-xs text-gray-400">
                              Missing: {missing.map(f => f.label).join(", ")} — update in{" "}
                              <a href="/admin/customers" className="text-emerald-600 hover:underline">Customer Settings</a>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Loyalty Card */}
                    {data.loyalty && (
                      <div className={`rounded-2xl p-5 ${tierColor(data.loyalty.tier)} border`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">Loyalty Status</div>
                            <div className="text-2xl font-bold capitalize">{data.loyalty.tier} Member</div>
                            <div className="text-sm mt-1 opacity-80">{data.loyalty.total_points} points · {data.loyalty.bookings_count} bookings · {fmt(data.loyalty.total_spent)} spent</div>
                          </div>
                          <Star size={40} className="opacity-30" />
                        </div>
                      </div>
                    )}

                    {/* Recent Bookings Summary */}
                    {data.bookings.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                          <h3 className="font-semibold text-gray-800">Recent Bookings</h3>
                          <button onClick={() => setActiveTab("bookings")} className="text-xs text-emerald-600 hover:underline">View All</button>
                        </div>
                        {data.bookings.slice(0, 3).map(b => (
                          <div key={b.id} className="px-5 py-3 border-b border-gray-50 flex items-center gap-3">
                            <Package size={14} className="text-gray-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{b.package_name}</div>
                              <div className="text-xs text-gray-500">{b.booking_number} · {fmtDate(b.created_at)}</div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(b.status)}`}>{b.status}</span>
                            <span className="text-sm font-semibold text-gray-900">{fmt(b.paid_amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Admin Notes */}
                    {data.user?.admin_notes && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-1 text-yellow-700 font-semibold text-sm">
                          <StickyNote size={14} /> Admin Notes
                        </div>
                        <p className="text-sm text-yellow-800">{data.user.admin_notes}</p>
                      </div>
                    )}

                    {/* Add Note */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Edit3 size={14} /> Add Note</h3>
                      <select value={noteCategory} onChange={e => setNoteCategory(e.target.value)}
                        className="w-full mb-2 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500">
                        {["general", "sales", "operations", "finance", "manager"].map(c => (
                          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)} Note</option>
                        ))}
                      </select>
                      <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                        rows={3} placeholder="Type your note here…"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
                      <button onClick={addNote} disabled={!noteText || addingNote}
                        className="mt-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                        {addingNote ? "Saving…" : "Save Note"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── BOOKINGS ── */}
                {activeTab === "bookings" && (
                  <div className="space-y-3">
                    {data.bookings.length === 0 && <div className="text-center py-12 text-gray-400">No bookings found</div>}
                    {data.bookings.map(b => (
                      <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="font-bold text-gray-900">{b.package_name}</div>
                            <div className="text-sm text-gray-500 mt-0.5">{b.booking_number} · {fmtDate(b.created_at)}</div>
                          </div>
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor(b.status)}`}>{b.status}</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div><div className="text-xs text-gray-400">Total</div><div className="font-semibold">{fmt(b.final_amount)}</div></div>
                          <div><div className="text-xs text-gray-400">Paid</div><div className="font-semibold text-green-600">{fmt(b.paid_amount)}</div></div>
                          <div><div className="text-xs text-gray-400">Balance</div><div className={`font-semibold ${parseFloat(b.final_amount) > parseFloat(b.paid_amount) ? "text-red-500" : "text-green-600"}`}>{fmt(parseFloat(b.final_amount) - parseFloat(b.paid_amount))}</div></div>
                          <div><div className="text-xs text-gray-400">Pilgrims</div><div className="font-semibold">{b.number_of_pilgrims}</div></div>
                          <div><div className="text-xs text-gray-400">Departure</div><div className="font-semibold">{fmtDate(b.preferred_departure_date)}</div></div>
                          <div><div className="text-xs text-gray-400">Room</div><div className="font-semibold capitalize">{b.room_type || "—"}</div></div>
                          <div><div className="text-xs text-gray-400">Journey</div><div className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${statusColor(b.journey_status || "pending")}`}>{b.journey_status || "not started"}</div></div>
                          <div><div className="text-xs text-gray-400">Invoice</div><div className="font-semibold text-xs">{b.invoice_number || "—"}</div></div>
                        </div>
                        {b.notes && <div className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{b.notes}</div>}
                        <div className="mt-3 flex gap-2">
                          <a href={`/admin/bookings/${b.id}`} className="text-xs text-emerald-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> View Booking</a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── PAYMENTS & INVOICES ── */}
                {activeTab === "payments" && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">Payment Transactions ({data.payments.length})</div>
                      {data.payments.length === 0 && <div className="text-center py-8 text-gray-400">No payments</div>}
                      {data.payments.map(p => (
                        <div key={p.id} className="px-5 py-3 border-b border-gray-50 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                            <CreditCard size={14} className="text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{p.booking_number} · {p.package_name}</div>
                            <div className="text-xs text-gray-500">{fmtDate(p.payment_date)} · {p.payment_mode} {p.reference_number ? `· ${p.reference_number}` : ""}</div>
                          </div>
                          <div className="text-sm font-bold text-green-600">{fmt(p.amount)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">Invoices ({data.invoices.length})</div>
                      {data.invoices.length === 0 && <div className="text-center py-8 text-gray-400">No invoices</div>}
                      {data.invoices.map(i => (
                        <div key={i.id} className="px-5 py-3 border-b border-gray-50 flex items-center gap-3">
                          <Receipt size={14} className="text-gray-400 shrink-0" />
                          <div className="flex-1">
                            <div className="text-sm font-medium">{i.invoice_number} {i.booking_number ? `· ${i.booking_number}` : ""}</div>
                            <div className="text-xs text-gray-500">{fmtDate(i.invoice_date)} · Due {fmtDate(i.due_date)}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="font-bold">{fmt(i.total)}</div>
                            <div className={i.balance > 0 ? "text-red-500 text-xs" : "text-green-600 text-xs"}>
                              {i.balance > 0 ? `Due: ${fmt(i.balance)}` : "Paid"}
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(i.invoice_status)}`}>{i.invoice_status}</span>
                        </div>
                      ))}
                    </div>
                    {data.agreements.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">Agreements ({data.agreements.length})</div>
                        {data.agreements.map(a => (
                          <div key={a.id} className="px-5 py-3 border-b border-gray-50 flex items-center gap-3">
                            <FileText size={14} className="text-gray-400 shrink-0" />
                            <div className="flex-1">
                              <div className="text-sm font-medium">{a.agreement_number} {a.booking_number ? `· ${a.booking_number}` : ""}</div>
                              <div className="text-xs text-gray-500">{fmtDate(a.created_at)} {a.signed_at ? `· Signed ${fmtDate(a.signed_at)}` : ""}</div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(a.status)}`}>{a.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── COMMUNICATIONS ── */}
                {activeTab === "comms" && (() => {
                  const CH_META: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
                    whatsapp:  { label: "WhatsApp",  bg: "bg-green-100",  text: "text-green-700",  icon: <MessageSquare size={12} /> },
                    sms:       { label: "SMS",        bg: "bg-blue-100",   text: "text-blue-700",   icon: <Smartphone size={12} /> },
                    email:     { label: "Email",      bg: "bg-purple-100", text: "text-purple-700", icon: <AtSign size={12} /> },
                    facebook:  { label: "Facebook",   bg: "bg-blue-100",   text: "text-blue-800",   icon: <Share2 size={12} /> },
                    instagram: { label: "Instagram",  bg: "bg-pink-100",   text: "text-pink-700",   icon: <Star size={12} /> },
                    telegram:  { label: "Telegram",   bg: "bg-teal-100",   text: "text-teal-700",   icon: <Send size={12} /> },
                    rcs:       { label: "RCS",        bg: "bg-indigo-100", text: "text-indigo-700", icon: <MessageSquare size={12} /> },
                    web:       { label: "Web",        bg: "bg-slate-100",  text: "text-slate-700",  icon: <Globe size={12} /> },
                    system:    { label: "System",     bg: "bg-gray-100",   text: "text-gray-600",   icon: <Activity size={12} /> },
                  };
                  const statusBadge = (s: string | null) => {
                    if (!s) return null;
                    const m: Record<string, string> = {
                      delivered: "bg-green-100 text-green-700", sent: "bg-blue-100 text-blue-700",
                      failed: "bg-red-100 text-red-600", read: "bg-purple-100 text-purple-700",
                      pending: "bg-yellow-100 text-yellow-700",
                    };
                    return <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${m[s.toLowerCase()] || "bg-gray-100 text-gray-500"}`}>{s}</span>;
                  };

                  const CHANNELS = ["all", "whatsapp", "sms", "email", "facebook", "instagram", "telegram", "system"];
                  const feed = timelineFull.length > 0 ? timelineFull : data.communications.map(m => ({
                    id: m.id, type: m.platform || m.channel || "system",
                    direction: (m.dir === "out" || m.dir === "outgoing") ? "out" : "in",
                    content: m.message_text || m.message || "", status: m.status,
                    event_type: m.event_type, is_internal_note: m.is_internal_note, created_at: m.created_at,
                  }));
                  const filtered = commsFilter === "all" ? feed : feed.filter(m => (m.type || "").toLowerCase().includes(commsFilter));

                  return (
                    <div className="space-y-4">
                      {/* Reply Box */}
                      {data.user?.mobile && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                          <div className="flex gap-2 mb-2">
                            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                              rows={2} placeholder="Type a reply via WhatsApp…"
                              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
                            <button onClick={sendWhatsApp} disabled={!replyText || sendingReply}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm">
                              <Send size={13} /> {sendingReply ? "…" : "Send"}
                            </button>
                          </div>
                          <div className="text-xs text-gray-400">Sends via WhatsApp to {data.user.mobile}</div>
                        </div>
                      )}

                      {/* Channel filter chips */}
                      <div className="flex gap-2 flex-wrap">
                        {CHANNELS.map(ch => (
                          <button key={ch} onClick={() => setCommsFilter(ch)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                              commsFilter === ch
                                ? "bg-emerald-600 text-white"
                                : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-700"
                            }`}>
                            {ch === "all" ? `All (${feed.length})` : ch}
                          </button>
                        ))}
                      </div>

                      {/* Unified Feed */}
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                          <span className="font-semibold text-gray-800">
                            {commsFilter === "all" ? "All Channels" : CH_META[commsFilter]?.label || commsFilter}
                            <span className="ml-2 text-sm font-normal text-gray-400">({filtered.length})</span>
                          </span>
                          {timelineLoading && <RefreshCw size={13} className="animate-spin text-gray-400" />}
                        </div>
                        {filtered.length === 0 && !timelineLoading && (
                          <div className="text-center py-10 text-gray-400">No messages for this channel</div>
                        )}
                        <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                          {filtered.map((m, idx) => {
                            const ch = CH_META[(m.type || "").toLowerCase()] || CH_META.system;
                            const isOut = m.direction === "out";
                            return (
                              <div key={m.id || idx} className={`px-5 py-3 flex gap-3 ${isOut ? "bg-emerald-50/30" : ""}`}>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${ch.bg} ${ch.text}`}>
                                  {ch.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ch.bg} ${ch.text}`}>{ch.label}</span>
                                    <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isOut ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                                      {isOut ? <ArrowRight size={9} /> : <ArrowLeft size={9} />}
                                      {isOut ? "Sent" : "Received"}
                                    </span>
                                    {m.is_internal_note && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Note</span>}
                                    {statusBadge(m.status)}
                                    <span className="text-[10px] text-gray-400 ml-auto">{fmtTime(m.created_at)}</span>
                                  </div>
                                  <p className="text-sm text-gray-800 leading-relaxed line-clamp-3">{m.content || "—"}</p>
                                  {m.event_type && <div className="text-[10px] text-gray-400 mt-1 font-mono">{m.event_type}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── LEAD HISTORY ── */}
                {activeTab === "lead" && (
                  <div className="space-y-3">
                    {data.leads.length === 0 && <div className="text-center py-12 text-gray-400">No lead records</div>}
                    {data.leads.map(l => (
                      <div key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div>
                            <div className="font-bold text-gray-900">{l.name}</div>
                            <div className="text-sm text-gray-500">{l.source?.replace(/_/g, " ")} {l.platform ? `· ${l.platform}` : ""} · {fmtDate(l.created_at)}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor(l.status)}`}>{l.status}</span>
                            {l.lead_score > 0 && <span className="text-xs text-gray-500">Score: {l.lead_score}</span>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
                          <div><div className="text-xs text-gray-400">Package Interest</div><div className="font-medium">{l.package_interest || "—"}</div></div>
                          <div><div className="text-xs text-gray-400">Budget</div><div className="font-medium">{l.budget || "—"}</div></div>
                          <div><div className="text-xs text-gray-400">Priority</div><div className="font-medium capitalize">{l.priority || "normal"}</div></div>
                          <div><div className="text-xs text-gray-400">Assigned To</div><div className="font-medium">{l.assigned_name || l.assigned_to || "—"}</div></div>
                          <div><div className="text-xs text-gray-400">Follow-up</div><div className="font-medium">{fmtDate(l.follow_up_date)}</div></div>
                          <div><div className="text-xs text-gray-400">Conversations</div><div className="font-medium">{l.conversation_count || 0}</div></div>
                        </div>
                        {l.message && <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-3">{l.message}</div>}
                        {l.notes && <div className="text-sm text-gray-500 border-l-2 border-gray-200 pl-3">{l.notes}</div>}
                        {l.converted_at && (
                          <div className="mt-2 text-xs text-green-600 font-medium">✓ Converted to booking on {fmtDate(l.converted_at)}</div>
                        )}
                        <div className="mt-3 flex gap-3">
                          <a href={`/admin/leads?open=${l.id}`} className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                            <ExternalLink size={11} /> Open Lead
                          </a>
                          {!l.converted_at && (
                            <a href="/admin/bookings/new" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                              <ArrowRight size={11} /> Convert to Booking
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── TRAVEL ── */}
                {activeTab === "travel" && (
                  <div className="space-y-4">
                    {/* Flights */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800 flex items-center gap-2">
                        <Plane size={14} /> Flights ({data.travel.flights.length})
                      </div>
                      {data.travel.flights.length === 0 && <div className="text-center py-6 text-gray-400">No flights assigned</div>}
                      {data.travel.flights.map((f, i) => (
                        <div key={i} className="px-5 py-4 border-b border-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-semibold text-gray-900">{f.airline} {f.flight_number}</div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${f.flight_type === "outbound" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                              {f.flight_type}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><div className="text-xs text-gray-400">From</div><div className="font-medium">{f.departure_airport}</div></div>
                            <div><div className="text-xs text-gray-400">To</div><div className="font-medium">{f.arrival_airport}</div></div>
                            <div><div className="text-xs text-gray-400">Departure</div><div className="font-medium">{fmtDate(f.departure_date)} {f.departure_time}</div></div>
                            <div><div className="text-xs text-gray-400">PNR</div><div className="font-mono font-bold">{f.pnr || "—"}</div></div>
                            <div><div className="text-xs text-gray-400">Baggage</div><div className="font-medium">{f.baggage_allowance || "—"}</div></div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Visa / Hotel / Bus from Pilgrims */}
                    {data.travel.pilgrims.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800 flex items-center gap-2">
                          <Users size={14} /> Pilgrims · Visa · Hotel · Bus
                        </div>
                        {data.travel.pilgrims.map((p, i) => (
                          <div key={i} className="px-5 py-4 border-b border-gray-50">
                            <div className="font-semibold text-gray-900 mb-3">{p.full_name} <span className="font-mono text-sm text-gray-500">{p.passport_number}</span></div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <div className="text-xs text-gray-400">Visa Status</div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(p.visa_status || "not_applied")}`}>{p.visa_status || "not applied"}</span>
                              </div>
                              <div><div className="text-xs text-gray-400">Visa No.</div><div className="font-mono font-medium">{p.visa_number || "—"}</div></div>
                              <div><div className="text-xs text-gray-400">Applied</div><div>{fmtDate(p.visa_applied_date)}</div></div>
                              <div><div className="text-xs text-gray-400">Received</div><div>{fmtDate(p.visa_received_date)}</div></div>
                              <div><div className="text-xs text-gray-400">Hotel</div><div className="font-medium">{p.room_hotel || "—"}</div></div>
                              <div><div className="text-xs text-gray-400">Room</div><div className="font-medium">{p.room_number || "—"} {p.room_type ? `(${p.room_type})` : ""}</div></div>
                              <div><div className="text-xs text-gray-400">Bus</div><div className="font-medium">{p.bus_number || "—"}</div></div>
                              <div><div className="text-xs text-gray-400">Seat</div><div className="font-medium">{p.seat_number || "—"}</div></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {data.travel.flights.length === 0 && data.travel.pilgrims.length === 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
                        No travel data available. Assign flights and hotels from the booking page.
                      </div>
                    )}
                  </div>
                )}

                {/* ── DOCUMENTS ── */}
                {activeTab === "documents" && (
                  <div className="space-y-3">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">
                        Documents ({data.documents.length})
                      </div>
                      {data.documents.length === 0 && <div className="text-center py-8 text-gray-400">No documents uploaded</div>}
                      <div className="divide-y divide-gray-50">
                        {data.documents.map(d => (
                          <div key={d.id} className="px-5 py-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                              <FileText size={14} className="text-orange-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 capitalize">{d.document_type?.replace(/_/g, " ")}</div>
                              <div className="text-xs text-gray-500">{d.file_name} · {d.booking_number} · {fmtDate(d.created_at)}</div>
                            </div>
                            <div className="flex gap-2">
                              {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer"
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Eye size={13} /></a>}
                              {d.file_url && <a href={d.file_url} download
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Download size={13} /></a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {data.bookings[0] && (
                      <a href={`/admin/documents?booking=${data.bookings[0].id}`}
                        className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                        <Upload size={14} /> Upload New Document
                      </a>
                    )}
                  </div>
                )}

                {/* ── TIMELINE ── */}
                {activeTab === "timeline" && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">
                      Customer Timeline ({data.timeline.length})
                    </div>
                    {data.timeline.length === 0 && <div className="text-center py-8 text-gray-400">No timeline events</div>}
                    <div className="px-5 py-4 relative">
                      <div className="absolute left-9 top-4 bottom-4 w-0.5 bg-gray-100" />
                      {data.timeline.map((e, idx) => (
                        <div key={e.id || idx} className="flex gap-4 mb-5 relative">
                          <div className="w-8 h-8 rounded-full bg-emerald-50 border-2 border-white shadow flex items-center justify-center shrink-0 z-10">
                            <Activity size={12} className="text-emerald-500" />
                          </div>
                          <div className="flex-1 pb-1">
                            <div className="font-medium text-sm text-gray-900">{e.title}</div>
                            {e.description && <div className="text-xs text-gray-600 mt-0.5">{e.description}</div>}
                            <div className="text-xs text-gray-400 mt-1">{fmtTime(e.created_at)} · {e.event_type?.replace(/_/g, " ")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── TASKS ── */}
                {activeTab === "tasks" && (
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <CheckSquare size={15} className="text-emerald-500" />
                        Tasks linked to this customer
                      </h3>
                      <button onClick={() => setShowTaskForm(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition-colors">
                        <Plus size={12} /> New Task
                      </button>
                    </div>

                    {/* Inline creation form */}
                    {showTaskForm && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
                        <div className="font-semibold text-emerald-800 text-sm">Create Task for {data?.user?.name || data?.user?.mobile}</div>
                        <input
                          autoFocus
                          value={taskTitle}
                          onChange={e => setTaskTitle(e.target.value)}
                          placeholder="Task title *"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Due Date</label>
                            <input
                              type="date"
                              value={taskDueDate}
                              onChange={e => setTaskDueDate(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 mb-1 block">Customer Mobile</label>
                            <input value={data?.user?.mobile || ""} disabled
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
                          </div>
                        </div>
                        <textarea
                          value={taskNotes}
                          onChange={e => setTaskNotes(e.target.value)}
                          rows={2}
                          placeholder="Notes (optional)"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none bg-white"
                        />
                        <div className="flex items-center gap-2">
                          <button onClick={createTask} disabled={!taskTitle.trim() || creatingTask}
                            className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                            {creatingTask ? <RefreshCw size={12} className="animate-spin" /> : <CheckSquare size={12} />}
                            {creatingTask ? "Creating…" : "Create Task"}
                          </button>
                          <button onClick={() => { setShowTaskForm(false); setTaskTitle(""); setTaskDueDate(""); setTaskNotes(""); }}
                            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {tasksLoading && (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw size={20} className="animate-spin text-emerald-500" />
                      </div>
                    )}
                    {!tasksLoading && tasks.length === 0 && !showTaskForm && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                        <CheckSquare size={28} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-gray-500 font-medium">No tasks linked to this customer</p>
                        <p className="text-sm text-gray-400 mt-1 mb-4">Create one above or visit the full task manager</p>
                        <a href="/admin/tasks" className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:underline">
                          Open Task Manager
                        </a>
                      </div>
                    )}
                    {tasks.map(t => (
                      <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900">{t.title}</div>
                            {t.description && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{t.description}</p>}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${statusColor(t.status || "pending")}`}>
                            {t.status || "pending"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                          {t.due_date && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} /> Due {fmtDate(t.due_date)}
                            </span>
                          )}
                          {t.assigned_name && <span>👤 {t.assigned_name}</span>}
                          {t.priority && (
                            <span className={`capitalize px-2 py-0.5 rounded-full ${
                              t.priority === "high" ? "bg-red-50 text-red-600" :
                              t.priority === "medium" ? "bg-yellow-50 text-yellow-700" :
                              "bg-gray-50 text-gray-600"
                            }`}>
                              {t.priority}
                            </span>
                          )}
                          {t.notes && <span className="text-gray-400 truncate max-w-xs">{t.notes}</span>}
                        </div>
                      </div>
                    ))}
                    {tasks.length > 0 && (
                      <a href="/admin/tasks"
                        className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                        View All in Task Manager
                      </a>
                    )}
                  </div>
                )}

                {/* ── AI INSIGHTS ── */}
                {activeTab === "ai" && (
                  <div className="space-y-3">
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                          <Brain size={20} className="text-indigo-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900">AI Enterprise Assistant</h3>
                          <p className="text-xs text-gray-500">Automated analysis for {data.user?.name || data.leads[0]?.name || "this customer"}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {aiSuggestions.map((s, i) => (
                          <div key={i} className={`flex items-start gap-3 bg-white rounded-xl p-4 shadow-sm border ${
                            s.color === "red" ? "border-red-100" : s.color === "green" ? "border-green-100" : s.color === "orange" ? "border-orange-100" : "border-blue-100"
                          }`}>
                            <span className="text-xl shrink-0">{s.icon}</span>
                            <p className="text-sm text-gray-700">{s.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Customer Health Breakdown */}
                    {data.health && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><BarChart3 size={16} /> Customer Health Score</h3>
                        <div className="flex items-center gap-4 mb-5">
                          <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-2xl font-bold ${
                            data.health.overall >= 70 ? "border-emerald-500 text-emerald-600" :
                            data.health.overall >= 40 ? "border-yellow-500 text-yellow-600" : "border-red-400 text-red-500"
                          }`}>
                            {data.health.overall}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-700 mb-1">
                              {data.health.overall >= 70 ? "Excellent" : data.health.overall >= 40 ? "Needs Attention" : "Critical"} Customer
                            </div>
                            <div className="text-xs text-gray-500">
                              Based on lead activity, booking history, payment behaviour, communication frequency, and document completeness.
                            </div>
                          </div>
                        </div>
                        <ScoreBar label="Lead Activity" value={data.health.leadScore} color="bg-blue-500" />
                        <ScoreBar label="Booking Engagement" value={data.health.bookingScore} color="bg-emerald-500" />
                        <ScoreBar label="Payment Reliability" value={data.health.paymentScore} color="bg-green-500" />
                        <ScoreBar label="Profile Completeness" value={data.health.profileScore} color="bg-purple-500" />
                        <ScoreBar label="Document Completeness" value={data.health.docScore} color="bg-orange-500" />
                        <ScoreBar label="Communication Frequency" value={data.health.commScore} color="bg-teal-500" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
