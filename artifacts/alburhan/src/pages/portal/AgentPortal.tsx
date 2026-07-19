import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, BookOpen, Plus, Users, Percent, TrendingUp, CreditCard,
  FileText, Upload, Receipt, ShieldCheck, Plane, Bell, UserCircle, Settings,
  LogOut, RefreshCw, IndianRupee, Package, Building2, Check, X, AlertCircle,
  ChevronDown, Menu, ChevronRight, Download, Clock, CheckCircle2, XCircle,
  Eye, Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

const API = import.meta.env.VITE_API_URL || "";

type Section =
  | "dashboard" | "bookings" | "new-booking" | "customers"
  | "commission" | "earnings" | "payment-status" | "documents"
  | "upload-docs" | "invoices" | "visa" | "tickets"
  | "notifications" | "profile" | "settings";

const MENU_GROUPS = [
  {
    label: "Main",
    items: [
      { key: "dashboard" as Section, label: "Dashboard", icon: LayoutDashboard },
      { key: "bookings" as Section, label: "My Bookings", icon: BookOpen },
      { key: "new-booking" as Section, label: "New Booking", icon: Plus },
      { key: "customers" as Section, label: "My Customers", icon: Users },
    ],
  },
  {
    label: "Financial",
    items: [
      { key: "commission" as Section, label: "Commission Summary", icon: Percent },
      { key: "earnings" as Section, label: "Earnings", icon: TrendingUp },
      { key: "payment-status" as Section, label: "Payment Status", icon: CreditCard },
    ],
  },
  {
    label: "Documents",
    items: [
      { key: "documents" as Section, label: "Documents", icon: FileText },
      { key: "upload-docs" as Section, label: "Upload Documents", icon: Upload },
      { key: "invoices" as Section, label: "Invoice Downloads", icon: Receipt },
    ],
  },
  {
    label: "Travel Status",
    items: [
      { key: "visa" as Section, label: "Visa Status", icon: ShieldCheck },
      { key: "tickets" as Section, label: "Ticket Status", icon: Plane },
    ],
  },
  {
    label: "Account",
    items: [
      { key: "notifications" as Section, label: "Notifications", icon: Bell },
      { key: "profile" as Section, label: "Profile", icon: UserCircle },
      { key: "settings" as Section, label: "Settings", icon: Settings },
    ],
  },
];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-700",
  approved:  "bg-blue-100 text-blue-700",
  pending:   "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-700",
  rejected:  "bg-red-100 text-red-700",
  partially_paid: "bg-orange-100 text-orange-700",
};

const DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "pan_card", label: "PAN Card" },
  { value: "passport_photo", label: "Passport Photo" },
  { value: "flight_ticket", label: "Flight Ticket" },
  { value: "visa", label: "Visa" },
  { value: "vaccination_certificate", label: "Vaccination Certificate" },
  { value: "medical_certificate", label: "Medical Certificate" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
];

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function LoadingBox() {
  return <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>;
}

function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="py-16 text-center">
      <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
      <p className="text-red-500 text-sm font-medium mb-3">{msg}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5"><RefreshCw size={12} /> Retry</Button>
    </div>
  );
}

function EmptyBox({ label }: { label: string }) {
  return <div className="py-16 text-center text-muted-foreground text-sm">{label}</div>;
}

function Card({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 text-center">
      <div className="mb-1">{icon}</div>
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function AgentPortal() {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<Section>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("section") as Section;
    const valid: Section[] = ["dashboard","bookings","new-booking","customers","commission","earnings","payment-status","documents","upload-docs","invoices","visa","tickets","notifications","profile","settings"];
    return (s && valid.includes(s)) ? s : "dashboard";
  });
  const navRef = useRef<HTMLElement>(null);
  const activeNavRef = useRef<HTMLButtonElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "ok" as "ok" | "err" });

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(t => ({ ...t, msg: "" })), 4000);
  };

  const nav = (s: Section) => { setSection(s); setSidebarOpen(false); };

  // ── Overview (dashboard) data ───────────────────────────────────────────────
  const [dash, setDash] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashErr, setDashErr] = useState("");

  const loadDash = useCallback(async () => {
    setDashLoading(true); setDashErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setDashErr(b.message || "Failed to load"); return; }
      setDash(await r.json());
    } catch { setDashErr("Network error"); }
    setDashLoading(false);
  }, []);

  useEffect(() => { loadDash(); }, [loadDash]);

  // Auto-scroll active sidebar item into view when section changes
  useEffect(() => {
    if (activeNavRef.current && navRef.current) {
      activeNavRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [section]);

  // ── Bookings data ────────────────────────────────────────────────────────────
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsErr, setBookingsErr] = useState("");
  const loadedSections = useRef(new Set<Section>());

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true); setBookingsErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent/bookings`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setBookingsErr(b.message || "Failed"); return; }
      const d = await r.json(); setBookings(d.bookings || []);
    } catch { setBookingsErr("Network error"); }
    setBookingsLoading(false);
  }, []);

  // ── Packages (for new booking) ───────────────────────────────────────────────
  const [packages, setPackages] = useState<any[]>([]);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    customer_name: "", customer_mobile: "", customer_email: "",
    package_id: "", number_of_pilgrims: "1", preferred_departure_date: "", notes: "", room_type: "",
  });
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{ bookingNumber: string } | null>(null);

  const loadPackages = useCallback(async () => {
    setPkgLoading(true);
    try {
      const r = await fetch(`${API}/api/portal/agent/packages`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setPackages(d.packages || []); }
    } catch {}
    setPkgLoading(false);
  }, []);

  // ── Customers ────────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<any[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [custErr, setCustErr] = useState("");

  const loadCustomers = useCallback(async () => {
    setCustLoading(true); setCustErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent/customers`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setCustErr(b.message || "Failed"); return; }
      const d = await r.json(); setCustomers(d.customers || []);
    } catch { setCustErr("Network error"); }
    setCustLoading(false);
  }, []);

  // ── Commission ───────────────────────────────────────────────────────────────
  const [commData, setCommData] = useState<any>(null);
  const [commLoading, setCommLoading] = useState(false);
  const [commErr, setCommErr] = useState("");

  const loadComm = useCallback(async () => {
    setCommLoading(true); setCommErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent/commissions`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setCommErr(b.message || "Failed"); return; }
      setCommData(await r.json());
    } catch { setCommErr("Network error"); }
    setCommLoading(false);
  }, []);

  // ── Payment Status ────────────────────────────────────────────────────────────
  const [pymtData, setPymtData] = useState<any[]>([]);
  const [pymtLoading, setPymtLoading] = useState(false);
  const [pymtErr, setPymtErr] = useState("");

  const loadPymt = useCallback(async () => {
    setPymtLoading(true); setPymtErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent/payment-status`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setPymtErr(b.message || "Failed"); return; }
      const d = await r.json(); setPymtData(d.bookings || []);
    } catch { setPymtErr("Network error"); }
    setPymtLoading(false);
  }, []);

  // ── Documents ────────────────────────────────────────────────────────────────
  const [docsBookings, setDocsBookings] = useState<any[]>([]);
  const [docsBookingId, setDocsBookingId] = useState("");
  const [docsList, setDocsList] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState("other");
  const [uploading, setUploading] = useState(false);

  const loadDocsBookings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/portal/agent/bookings`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setDocsBookings(d.bookings || []); }
    } catch {}
  }, []);

  const loadDocs = useCallback(async (bookingId: string) => {
    if (!bookingId) return;
    setDocsLoading(true);
    try {
      const r = await fetch(`${API}/api/portal/agent/documents/${bookingId}`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setDocsList(d.documents || []); }
    } catch {}
    setDocsLoading(false);
  }, []);

  useEffect(() => { if (docsBookingId) loadDocs(docsBookingId); }, [docsBookingId, loadDocs]);

  // ── Invoices ─────────────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invErr, setInvErr] = useState("");

  const loadInvoices = useCallback(async () => {
    setInvLoading(true); setInvErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent/invoices`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setInvErr(b.message || "Failed"); return; }
      const d = await r.json(); setInvoices(d.invoices || []);
    } catch { setInvErr("Network error"); }
    setInvLoading(false);
  }, []);

  // ── Visa ─────────────────────────────────────────────────────────────────────
  const [visaData, setVisaData] = useState<any[]>([]);
  const [visaLoading, setVisaLoading] = useState(false);
  const [visaErr, setVisaErr] = useState("");

  const loadVisa = useCallback(async () => {
    setVisaLoading(true); setVisaErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent/visa`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setVisaErr(b.message || "Failed"); return; }
      const d = await r.json(); setVisaData(d.bookings || []);
    } catch { setVisaErr("Network error"); }
    setVisaLoading(false);
  }, []);

  // ── Tickets ──────────────────────────────────────────────────────────────────
  const [ticketData, setTicketData] = useState<any[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketErr, setTicketErr] = useState("");

  const loadTickets = useCallback(async () => {
    setTicketLoading(true); setTicketErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent/tickets`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setTicketErr(b.message || "Failed"); return; }
      const d = await r.json(); setTicketData(d.bookings || []);
    } catch { setTicketErr("Network error"); }
    setTicketLoading(false);
  }, []);

  // ── Notifications ────────────────────────────────────────────────────────────
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifErr, setNotifErr] = useState("");

  const loadNotifs = useCallback(async () => {
    setNotifLoading(true); setNotifErr("");
    try {
      const r = await fetch(`${API}/api/portal/agent/notifications`, { credentials: "include" });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setNotifErr(b.message || "Failed"); return; }
      const d = await r.json(); setNotifs(d.notifications || []);
    } catch { setNotifErr("Network error"); }
    setNotifLoading(false);
  }, []);

  // ── Profile Update ───────────────────────────────────────────────────────────
  const [profForm, setProfForm] = useState({ email: "", city: "" });
  const [profSaving, setProfSaving] = useState(false);
  const agent = dash?.agent || {};

  useEffect(() => {
    if (dash?.agent) {
      setProfForm({ email: dash.agent.email || "", city: dash.agent.city || "" });
    }
  }, [dash]);

  // ── Section lazy-load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadedSections.current.has(section)) return;
    loadedSections.current.add(section);
    if (section === "bookings") loadBookings();
    else if (section === "new-booking") loadPackages();
    else if (section === "customers") loadCustomers();
    else if (section === "commission" || section === "earnings") loadComm();
    else if (section === "payment-status") loadPymt();
    else if (section === "documents" || section === "upload-docs") loadDocsBookings();
    else if (section === "invoices") loadInvoices();
    else if (section === "visa") loadVisa();
    else if (section === "tickets") loadTickets();
    else if (section === "notifications") loadNotifs();
  }, [section, loadBookings, loadPackages, loadCustomers, loadComm, loadPymt,
      loadDocsBookings, loadInvoices, loadVisa, loadTickets, loadNotifs]);

  // ── New Booking submit ────────────────────────────────────────────────────────
  const setBF = (k: keyof typeof bookingForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setBookingForm(f => ({ ...f, [k]: e.target.value }));

  const submitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingSaving(true);
    try {
      const r = await fetch(`${API}/api/portal/agent/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...bookingForm, number_of_pilgrims: Number(bookingForm.number_of_pilgrims) || 1 }),
      });
      const body = await r.json();
      if (!r.ok) { showToast(body.error || body.message || "Failed", "err"); setBookingSaving(false); return; }
      setBookingSuccess({ bookingNumber: body.bookingNumber });
      setBookingForm({ customer_name: "", customer_mobile: "", customer_email: "", package_id: "", number_of_pilgrims: "1", preferred_departure_date: "", notes: "", room_type: "" });
      loadedSections.current.delete("bookings");
      loadedSections.current.delete("dashboard");
      loadDash();
    } catch { showToast("Network error", "err"); }
    setBookingSaving(false);
  };

  // ── Upload Document ───────────────────────────────────────────────────────────
  const uploadDocument = async () => {
    if (!uploadFile || !docsBookingId) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("document_type", uploadDocType);
    try {
      const r = await fetch(`${API}/api/portal/agent/documents/${docsBookingId}`, {
        method: "POST", credentials: "include", body: fd,
      });
      const body = await r.json();
      if (!r.ok) { showToast(body.error || body.message || "Upload failed", "err"); setUploading(false); return; }
      showToast("Document uploaded successfully");
      setUploadFile(null);
      await loadDocs(docsBookingId);
    } catch { showToast("Upload failed", "err"); }
    setUploading(false);
  };

  // ── Profile save ──────────────────────────────────────────────────────────────
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfSaving(true);
    try {
      const r = await fetch(`${API}/api/portal/agent/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profForm),
      });
      const body = await r.json();
      if (!r.ok) { showToast(body.message || "Failed to save", "err"); setProfSaving(false); return; }
      showToast("Profile updated");
      loadDash();
    } catch { showToast("Network error", "err"); }
    setProfSaving(false);
  };

  // ── Derived dashboard stats ───────────────────────────────────────────────────
  const statusMap: Record<string, number> = dash?.statusMap || {};
  const totalBookings = Object.values(statusMap).reduce((a: number, b: any) => a + Number(b), 0);
  const confirmedCount = (statusMap.confirmed || 0) + (statusMap.approved || 0);
  const pendingCount = statusMap.pending || 0;
  const totalRevenue = Number(dash?.totalRevenue || 0);
  const commEarned = Number(dash?.commissionEarned || 0);
  const recentBookings: any[] = dash?.recentBookings || [];
  const upcoming = recentBookings
    .filter((b: any) => b.preferred_departure_date && new Date(b.preferred_departure_date) >= new Date())
    .sort((a: any, b: any) => new Date(a.preferred_departure_date).getTime() - new Date(b.preferred_departure_date).getTime())
    .slice(0, 5);

  // ── RENDER ────────────────────────────────────────────────────────────────────
  const sectionTitle = MENU_GROUPS.flatMap(g => g.items).find(i => i.key === section)?.label || "Dashboard";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Toast */}
      {toast.msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm flex items-center gap-2 text-white ${toast.type === "ok" ? "bg-blue-600" : "bg-red-500"}`}>
          {toast.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {toast.msg}
        </div>
      )}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────────────────── */}
      <aside className={`fixed lg:sticky top-0 h-screen w-64 bg-white border-r z-30 flex flex-col transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        {/* Brand */}
        <div className="px-4 py-4 border-b flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <UserCircle size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">Al Burhan Travels</p>
            <p className="text-xs text-blue-600 font-medium">Agent Portal</p>
          </div>
        </div>

        {/* Agent info */}
        <div className="px-4 py-3 border-b bg-blue-50">
          <p className="font-semibold text-sm truncate">{agent.name || user?.mobile || "Agent"}</p>
          {agent.branch_name && <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><Building2 size={10} /> {agent.branch_name}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">Commission: {agent.commission_rate || 0}%</p>
        </div>

        {/* Nav */}
        <nav ref={navRef} className="flex-1 overflow-y-auto py-2">
          {MENU_GROUPS.map(group => (
            <div key={group.label} className="mb-1">
              <p className="px-4 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">{group.label}</p>
              {group.items.map(item => {
                const Icon = item.icon;
                const active = section === item.key;
                return (
                  <button
                    key={item.key}
                    ref={active ? activeNavRef : undefined}
                    onClick={() => nav(item.key)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors
                      ${active
                        ? "bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600"
                        : "text-gray-700 hover:bg-gray-100"
                      }`}
                  >
                    <Icon size={16} className={active ? "text-blue-600" : "text-gray-500"} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-4 py-3 border-t">
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2 text-sm text-red-500 hover:text-red-700 py-2 px-2 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-base">{sectionTitle}</h1>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block">{user?.mobile}</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto">

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* DASHBOARD */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "dashboard" && (
            <div className="space-y-5 max-w-5xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Welcome back,</p>
                  <p className="font-bold text-lg">{agent.name || "Agent"}</p>
                </div>
                <Button onClick={loadDash} disabled={dashLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={dashLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>

              {dashLoading ? <LoadingBox /> : dashErr ? <ErrorBox msg={dashErr} onRetry={loadDash} /> : (
                <>
                  {/* 8 stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card icon={<Package size={18} className="text-blue-600 mx-auto" />} label="Total Bookings" value={totalBookings} color="text-blue-600" />
                    <Card icon={<Clock size={18} className="text-amber-500 mx-auto" />} label="Pending Bookings" value={pendingCount} color="text-amber-500" />
                    <Card icon={<CheckCircle2 size={18} className="text-emerald-600 mx-auto" />} label="Confirmed" value={confirmedCount} color="text-emerald-600" />
                    <Card icon={<IndianRupee size={18} className="text-violet-600 mx-auto" />} label="Revenue Generated" value={fmt(totalRevenue)} color="text-violet-600" />
                    <Card icon={<Percent size={18} className="text-blue-500 mx-auto" />} label="Commission Earned" value={fmt(commEarned)} color="text-blue-500" />
                    <Card icon={<Wallet size={18} className="text-orange-500 mx-auto" />} label="Pending Commission" value={fmt(Math.max(0, commEarned * 0.3))} color="text-orange-500" />
                    <Card icon={<BookOpen size={18} className="text-teal-600 mx-auto" />} label="Recent Bookings" value={Math.min(recentBookings.length, 20)} color="text-teal-600" />
                    <Card icon={<Plane size={18} className="text-indigo-600 mx-auto" />} label="Upcoming Departures" value={upcoming.length} color="text-indigo-600" />
                  </div>

                  {/* Recent Bookings */}
                  {recentBookings.length > 0 && (
                    <div className="rounded-xl border bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b flex items-center justify-between">
                        <p className="font-semibold text-sm">Recent Bookings</p>
                        <button onClick={() => nav("bookings")} className="text-xs text-blue-600 hover:underline flex items-center gap-1">View all <ChevronRight size={12} /></button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-muted/10 text-muted-foreground text-xs">
                            <th className="px-4 py-2 text-left">Booking #</th>
                            <th className="px-4 py-2 text-left">Customer</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-right">Amount</th>
                          </tr></thead>
                          <tbody>
                            {recentBookings.slice(0, 8).map((b: any) => (
                              <tr key={b.id} className="border-b last:border-0 hover:bg-muted/5">
                                <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                                <td className="px-4 py-2.5"><p className="font-medium text-xs">{b.customer_name || "—"}</p><p className="text-xs text-muted-foreground">{b.customer_mobile}</p></td>
                                <td className="px-4 py-2.5"><Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge></td>
                                <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(Number(b.total_amount || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Upcoming Departures */}
                  {upcoming.length > 0 && (
                    <div className="rounded-xl border bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b">
                        <p className="font-semibold text-sm flex items-center gap-2"><Plane size={14} className="text-indigo-600" /> Upcoming Departures</p>
                      </div>
                      <div className="divide-y">
                        {upcoming.map((b: any) => (
                          <div key={b.id} className="px-4 py-3 flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{b.customer_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{b.booking_number}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-indigo-600">{fmtDate(b.preferred_departure_date)}</p>
                              <Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* MY BOOKINGS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "bookings" && (
            <div className="space-y-4 max-w-5xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{bookings.length} booking{bookings.length !== 1 ? "s" : ""} total</p>
                <Button onClick={() => { loadedSections.current.delete("bookings"); loadBookings(); }} disabled={bookingsLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={bookingsLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              {bookingsLoading ? <LoadingBox /> : bookingsErr ? <ErrorBox msg={bookingsErr} onRetry={loadBookings} /> : bookings.length === 0 ? <EmptyBox label="No bookings yet. Create your first booking!" /> : (
                <div className="rounded-xl border bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 text-left">Booking #</th>
                        <th className="px-4 py-2.5 text-left">Customer</th>
                        <th className="px-4 py-2.5 text-left">Package</th>
                        <th className="px-4 py-2.5 text-left">Departure</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                      </tr></thead>
                      <tbody>
                        {bookings.map((b: any) => (
                          <tr key={b.id} className="border-b last:border-0 hover:bg-muted/5">
                            <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                            <td className="px-4 py-2.5"><p className="font-medium text-xs">{b.customer_name || "—"}</p><p className="text-xs text-muted-foreground">{b.customer_mobile}</p></td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{b.package_name || "—"}</td>
                            <td className="px-4 py-2.5 text-xs">{fmtDate(b.preferred_departure_date)}</td>
                            <td className="px-4 py-2.5"><Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge></td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(Number(b.total_amount || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* NEW BOOKING */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "new-booking" && (
            <div className="max-w-xl space-y-4">
              <p className="text-sm text-muted-foreground">Register a customer booking on their behalf</p>

              {bookingSuccess && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex gap-3">
                  <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-emerald-700 text-sm">Booking Created!</p>
                    <p className="text-sm text-emerald-600 mt-0.5">Booking #: <span className="font-mono font-bold">{bookingSuccess.bookingNumber}</span></p>
                    <p className="text-xs text-emerald-500 mt-1">Pending admin approval.</p>
                  </div>
                  <button onClick={() => setBookingSuccess(null)}><X size={15} className="text-emerald-400" /></button>
                </div>
              )}

              <form onSubmit={submitBooking} className="space-y-4">
                <div className="rounded-xl border bg-white p-5 space-y-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer Details</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
                      <input value={bookingForm.customer_name} onChange={setBF("customer_name")} required placeholder="Customer full name"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Mobile Number *</label>
                      <input value={bookingForm.customer_mobile} onChange={setBF("customer_mobile")} required placeholder="10-digit mobile" maxLength={10} inputMode="numeric"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Email (optional)</label>
                      <input value={bookingForm.customer_email} onChange={setBF("customer_email")} type="email" placeholder="customer@example.com"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-5 space-y-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Package & Trip Details</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Package</label>
                      <div className="relative mt-1">
                        <select value={bookingForm.package_id} onChange={setBF("package_id")}
                          className="w-full border rounded-lg px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                          <option value="">— Select a package —</option>
                          {pkgLoading ? <option disabled>Loading…</option> : null}
                          {packages.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name}{p.price_per_person > 0 ? ` — ₹${Number(p.price_per_person).toLocaleString("en-IN")}/person` : ""}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Pilgrims *</label>
                      <input value={bookingForm.number_of_pilgrims} onChange={setBF("number_of_pilgrims")} type="number" min="1" max="50" required
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Departure Date</label>
                      <input value={bookingForm.preferred_departure_date} onChange={setBF("preferred_departure_date")} type="date"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Room Type</label>
                      <div className="relative mt-1">
                        <select value={bookingForm.room_type} onChange={setBF("room_type")}
                          className="w-full border rounded-lg px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                          <option value="">— Select —</option>
                          {["single", "double", "triple", "quad", "quint"].map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">Notes</label>
                      <textarea value={bookingForm.notes} onChange={setBF("notes")} rows={3} placeholder="Any special requirements…"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={bookingSaving} className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
                  {bookingSaving ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> : <><Plus size={14} /> Create Booking</>}
                </Button>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* MY CUSTOMERS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "customers" && (
            <div className="space-y-4 max-w-4xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{customers.length} customer{customers.length !== 1 ? "s" : ""}</p>
                <Button onClick={() => { loadedSections.current.delete("customers"); loadCustomers(); }} disabled={custLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={custLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              {custLoading ? <LoadingBox /> : custErr ? <ErrorBox msg={custErr} onRetry={loadCustomers} /> : customers.length === 0 ? <EmptyBox label="No customers yet." /> : (
                <div className="rounded-xl border bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 text-left">Name</th>
                        <th className="px-4 py-2.5 text-left">Mobile</th>
                        <th className="px-4 py-2.5 text-left">Email</th>
                        <th className="px-4 py-2.5 text-center">Bookings</th>
                        <th className="px-4 py-2.5 text-left">Last Booking</th>
                      </tr></thead>
                      <tbody>
                        {customers.map((c: any) => (
                          <tr key={c.id} className="border-b last:border-0 hover:bg-muted/5">
                            <td className="px-4 py-2.5 font-medium">{c.name || "—"}</td>
                            <td className="px-4 py-2.5 font-mono text-xs">{c.mobile}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.email || "—"}</td>
                            <td className="px-4 py-2.5 text-center"><Badge className="bg-blue-100 text-blue-700">{c.booking_count}</Badge></td>
                            <td className="px-4 py-2.5 text-xs">{fmtDate(c.last_booking_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* COMMISSION SUMMARY */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "commission" && (
            <div className="space-y-4 max-w-4xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Commission rate: <strong>{agent.commission_rate || 0}%</strong></p>
                <Button onClick={() => { loadedSections.current.delete("commission"); loadComm(); }} disabled={commLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={commLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              {commLoading ? <LoadingBox /> : commErr ? <ErrorBox msg={commErr} onRetry={loadComm} /> : !commData ? <EmptyBox label="No commission data." /> : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Card icon={<Percent size={18} className="text-blue-600 mx-auto" />} label="Commission Rate" value={`${commData.commissionRate}%`} color="text-blue-600" />
                    <Card icon={<IndianRupee size={18} className="text-emerald-600 mx-auto" />} label="Total Commission" value={fmt(commData.totalCommission || 0)} color="text-emerald-600" />
                    <Card icon={<Package size={18} className="text-violet-600 mx-auto" />} label="Total Bookings" value={(commData.bookings || []).length} color="text-violet-600" />
                  </div>
                  {(commData.bookings || []).length > 0 && (
                    <div className="rounded-xl border bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b font-semibold text-sm">Per-Booking Commission</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                            <th className="px-4 py-2.5 text-left">Booking #</th>
                            <th className="px-4 py-2.5 text-left">Customer</th>
                            <th className="px-4 py-2.5 text-left">Status</th>
                            <th className="px-4 py-2.5 text-right">Paid</th>
                            <th className="px-4 py-2.5 text-right">Commission</th>
                          </tr></thead>
                          <tbody>
                            {commData.bookings.map((b: any) => (
                              <tr key={b.id} className="border-b last:border-0 hover:bg-muted/5">
                                <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                                <td className="px-4 py-2.5 text-xs">{b.customer_name || "—"}</td>
                                <td className="px-4 py-2.5"><Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge></td>
                                <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(Number(b.paid_amount || 0))}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">{fmt(Number(b.commission_amount || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* EARNINGS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "earnings" && (
            <div className="space-y-4 max-w-4xl">
              {commLoading ? <LoadingBox /> : commErr ? <ErrorBox msg={commErr} onRetry={loadComm} /> : !commData ? <EmptyBox label="No earnings data." /> : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card icon={<IndianRupee size={18} className="text-violet-600 mx-auto" />} label="Total Revenue" value={fmt(totalRevenue)} color="text-violet-600" />
                    <Card icon={<Percent size={18} className="text-blue-600 mx-auto" />} label="Commission Earned" value={fmt(commData.totalCommission || 0)} color="text-blue-600" />
                    <Card icon={<TrendingUp size={18} className="text-emerald-600 mx-auto" />} label="Avg. per Booking" value={(commData.bookings || []).length > 0 ? fmt((commData.totalCommission || 0) / (commData.bookings || []).length) : "₹0"} color="text-emerald-600" />
                    <Card icon={<Package size={18} className="text-amber-600 mx-auto" />} label="Bookings" value={(commData.bookings || []).length} color="text-amber-600" />
                  </div>
                  <div className="rounded-xl border bg-white p-5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Earnings Breakdown</p>
                    <div className="space-y-3">
                      {(commData.bookings || []).filter((b: any) => Number(b.commission_amount) > 0).slice(0, 15).map((b: any) => (
                        <div key={b.id} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{b.customer_name || "—"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{b.booking_number}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-600">{fmt(Number(b.commission_amount || 0))}</p>
                            <Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge>
                          </div>
                        </div>
                      ))}
                      {(commData.bookings || []).filter((b: any) => Number(b.commission_amount) > 0).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No earnings yet.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* PAYMENT STATUS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "payment-status" && (
            <div className="space-y-4 max-w-5xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Payment status for all bookings</p>
                <Button onClick={() => { loadedSections.current.delete("payment-status"); loadPymt(); }} disabled={pymtLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={pymtLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              {pymtLoading ? <LoadingBox /> : pymtErr ? <ErrorBox msg={pymtErr} onRetry={loadPymt} /> : pymtData.length === 0 ? <EmptyBox label="No bookings yet." /> : (
                <div className="rounded-xl border bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 text-left">Booking #</th>
                        <th className="px-4 py-2.5 text-left">Customer</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                        <th className="px-4 py-2.5 text-right">Paid</th>
                        <th className="px-4 py-2.5 text-right">Balance</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                      </tr></thead>
                      <tbody>
                        {pymtData.map((b: any) => {
                          const total = Number(b.total_amount || 0);
                          const paid = Number(b.paid_amount || 0);
                          const bal = Number(b.balance_due || 0);
                          const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
                          return (
                            <tr key={b.id} className="border-b last:border-0 hover:bg-muted/5">
                              <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                              <td className="px-4 py-2.5 text-xs"><p className="font-medium">{b.customer_name || "—"}</p><p className="text-muted-foreground">{b.customer_mobile}</p></td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(total)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">
                                {fmt(paid)}
                                <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1 ml-auto"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                              </td>
                              <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${bal > 0 ? "text-red-500" : "text-emerald-600"}`}>{fmt(bal)}</td>
                              <td className="px-4 py-2.5"><Badge className={`capitalize text-xs ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* DOCUMENTS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "documents" && (
            <div className="space-y-4 max-w-3xl">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Select Booking</label>
                <div className="relative mt-1">
                  <select value={docsBookingId} onChange={e => setDocsBookingId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                    <option value="">— Select a booking to view documents —</option>
                    {docsBookings.map((b: any) => <option key={b.id} value={b.id}>{b.booking_number} — {b.customer_name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
              {docsBookingId && (
                docsLoading ? <LoadingBox /> : docsList.length === 0 ? <EmptyBox label="No documents for this booking." /> : (
                  <div className="rounded-xl border bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b font-semibold text-sm">{docsList.length} Document{docsList.length !== 1 ? "s" : ""}</div>
                    <div className="divide-y">
                      {docsList.map((d: any) => (
                        <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium capitalize">{(d.document_type || "").replace(/_/g, " ")}</p>
                            <p className="text-xs text-muted-foreground">{d.file_name} · {fmtDate(d.created_at)}</p>
                          </div>
                          {d.file_url && (
                            <a href={`${API}${d.file_url}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs">
                              <Eye size={13} /> View
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* UPLOAD DOCUMENTS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "upload-docs" && (
            <div className="space-y-4 max-w-xl">
              <p className="text-sm text-muted-foreground">Upload documents for a customer booking</p>
              <div className="rounded-xl border bg-white p-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Booking *</label>
                  <div className="relative mt-1">
                    <select value={docsBookingId} onChange={e => setDocsBookingId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                      <option value="">— Select booking —</option>
                      {docsBookings.map((b: any) => <option key={b.id} value={b.id}>{b.booking_number} — {b.customer_name}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Document Type</label>
                  <div className="relative mt-1">
                    <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8">
                      {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">File *</label>
                  <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="mt-1 w-full text-sm border rounded-lg px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                </div>
                <Button onClick={uploadDocument} disabled={uploading || !uploadFile || !docsBookingId} className="w-full gap-2">
                  {uploading ? <><RefreshCw size={14} className="animate-spin" /> Uploading…</> : <><Upload size={14} /> Upload Document</>}
                </Button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* INVOICE DOWNLOADS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "invoices" && (
            <div className="space-y-4 max-w-4xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</p>
                <Button onClick={() => { loadedSections.current.delete("invoices"); loadInvoices(); }} disabled={invLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={invLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              {invLoading ? <LoadingBox /> : invErr ? <ErrorBox msg={invErr} onRetry={loadInvoices} /> : invoices.length === 0 ? <EmptyBox label="No invoices generated yet." /> : (
                <div className="rounded-xl border bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 text-left">Invoice #</th>
                        <th className="px-4 py-2.5 text-left">Booking #</th>
                        <th className="px-4 py-2.5 text-left">Customer</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                        <th className="px-4 py-2.5 text-right">Paid</th>
                        <th className="px-4 py-2.5 text-left">Status</th>
                        <th className="px-4 py-2.5 text-center">Download</th>
                      </tr></thead>
                      <tbody>
                        {invoices.map((inv: any) => (
                          <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/5">
                            <td className="px-4 py-2.5 font-mono text-xs">{inv.invoice_number || "—"}</td>
                            <td className="px-4 py-2.5 font-mono text-xs">{inv.booking_number}</td>
                            <td className="px-4 py-2.5 text-xs">{inv.customer_name || "—"}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs">{fmt(Number(inv.total || 0))}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-xs text-emerald-600">{fmt(Number(inv.paid || 0))}</td>
                            <td className="px-4 py-2.5"><Badge className={`capitalize text-xs ${inv.invoice_status === "paid" ? "bg-emerald-100 text-emerald-700" : inv.invoice_status === "partial" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>{inv.invoice_status || "draft"}</Badge></td>
                            <td className="px-4 py-2.5 text-center">
                              {Number(inv.paid) > 0 ? (
                                <a href={`${API}/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                                  <Download size={13} /> PDF
                                </a>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* VISA STATUS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "visa" && (
            <div className="space-y-4 max-w-4xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Visa document status for all bookings</p>
                <Button onClick={() => { loadedSections.current.delete("visa"); loadVisa(); }} disabled={visaLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={visaLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              {visaLoading ? <LoadingBox /> : visaErr ? <ErrorBox msg={visaErr} onRetry={loadVisa} /> : visaData.length === 0 ? <EmptyBox label="No bookings found." /> : (
                <div className="rounded-xl border bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 text-left">Booking #</th>
                        <th className="px-4 py-2.5 text-left">Customer</th>
                        <th className="px-4 py-2.5 text-left">Departure</th>
                        <th className="px-4 py-2.5 text-left">Visa Status</th>
                        <th className="px-4 py-2.5 text-center">Doc</th>
                      </tr></thead>
                      <tbody>
                        {visaData.map((b: any) => (
                          <tr key={`${b.booking_id}-${b.doc_id || "none"}`} className="border-b last:border-0 hover:bg-muted/5">
                            <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                            <td className="px-4 py-2.5 text-xs"><p className="font-medium">{b.customer_name || "—"}</p><p className="text-muted-foreground">{b.customer_mobile}</p></td>
                            <td className="px-4 py-2.5 text-xs">{fmtDate(b.preferred_departure_date)}</td>
                            <td className="px-4 py-2.5">
                              {b.doc_id
                                ? <Badge className="bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit"><CheckCircle2 size={11} /> Uploaded</Badge>
                                : <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1 w-fit"><Clock size={11} /> Pending</Badge>
                              }
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {b.doc_id && b.file_url ? (
                                <a href={`${API}${b.file_url}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1 justify-center">
                                  <Eye size={13} /> View
                                </a>
                              ) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* TICKET STATUS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "tickets" && (
            <div className="space-y-4 max-w-4xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Flight ticket status for all bookings</p>
                <Button onClick={() => { loadedSections.current.delete("tickets"); loadTickets(); }} disabled={ticketLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={ticketLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              {ticketLoading ? <LoadingBox /> : ticketErr ? <ErrorBox msg={ticketErr} onRetry={loadTickets} /> : ticketData.length === 0 ? <EmptyBox label="No bookings found." /> : (
                <div className="rounded-xl border bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 text-left">Booking #</th>
                        <th className="px-4 py-2.5 text-left">Customer</th>
                        <th className="px-4 py-2.5 text-left">Departure</th>
                        <th className="px-4 py-2.5 text-left">Ticket Status</th>
                        <th className="px-4 py-2.5 text-center">Doc</th>
                      </tr></thead>
                      <tbody>
                        {ticketData.map((b: any) => (
                          <tr key={`${b.id}-${b.doc_id || "none"}`} className="border-b last:border-0 hover:bg-muted/5">
                            <td className="px-4 py-2.5 font-mono text-xs">{b.booking_number}</td>
                            <td className="px-4 py-2.5 text-xs"><p className="font-medium">{b.customer_name || "—"}</p><p className="text-muted-foreground">{b.customer_mobile}</p></td>
                            <td className="px-4 py-2.5 text-xs">{fmtDate(b.preferred_departure_date)}</td>
                            <td className="px-4 py-2.5">
                              {b.ticket_status
                                ? <Badge className={`capitalize text-xs ${b.ticket_status === "issued" ? "bg-emerald-100 text-emerald-700" : b.ticket_status === "pending" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>{b.ticket_status}</Badge>
                                : b.doc_id
                                  ? <Badge className="bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit"><CheckCircle2 size={11} /> Uploaded</Badge>
                                  : <Badge className="bg-gray-100 text-gray-700 flex items-center gap-1 w-fit"><Clock size={11} /> Not Issued</Badge>
                              }
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {b.doc_id && b.file_url ? (
                                <a href={`${API}${b.file_url}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1 justify-center">
                                  <Eye size={13} /> View
                                </a>
                              ) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* NOTIFICATIONS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "notifications" && (
            <div className="space-y-4 max-w-3xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{notifs.length} recent notification{notifs.length !== 1 ? "s" : ""}</p>
                <Button onClick={() => { loadedSections.current.delete("notifications"); loadNotifs(); }} disabled={notifLoading} variant="outline" size="sm" className="gap-1.5">
                  <RefreshCw size={12} className={notifLoading ? "animate-spin" : ""} /> Refresh
                </Button>
              </div>
              {notifLoading ? <LoadingBox /> : notifErr ? <ErrorBox msg={notifErr} onRetry={loadNotifs} /> : notifs.length === 0 ? <EmptyBox label="No notifications yet." /> : (
                <div className="rounded-xl border bg-white divide-y">
                  {notifs.map((n: any) => (
                    <div key={n.id} className="px-4 py-3 flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.status === "sent" || n.status === "delivered" ? "bg-emerald-500" : n.status === "failed" ? "bg-red-400" : "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize">{(n.event_type || "").replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">{n.booking_number && `${n.booking_number} · `}{n.customer_name && `${n.customer_name} · `}{n.channel?.toUpperCase()}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-muted-foreground">{fmtDate(n.sent_at || n.created_at)}</p>
                        <Badge className={`capitalize text-xs mt-0.5 ${n.status === "sent" || n.status === "delivered" ? "bg-emerald-100 text-emerald-700" : n.status === "failed" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>{n.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* PROFILE */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "profile" && (
            <div className="space-y-4 max-w-xl">
              <div className="rounded-xl border bg-white p-5 space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Agent Information</p>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Name</p><p className="font-semibold">{agent.name || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Mobile</p><p className="font-semibold font-mono">{agent.mobile || user?.mobile}</p></div>
                  <div><p className="text-xs text-muted-foreground">Commission Rate</p><p className="font-semibold">{agent.commission_rate || 0}%</p></div>
                  {agent.branch_name && <div><p className="text-xs text-muted-foreground">Branch</p><p className="font-semibold">{agent.branch_name}{agent.branch_city ? `, ${agent.branch_city}` : ""}</p></div>}
                </div>
              </div>
              <form onSubmit={saveProfile} className="rounded-xl border bg-white p-5 space-y-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Update Profile</p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input value={profForm.email} onChange={e => setProfForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="agent@example.com"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">City</label>
                  <input value={profForm.city} onChange={e => setProfForm(f => ({ ...f, city: e.target.value }))} placeholder="Your city"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <Button type="submit" disabled={profSaving} className="gap-2">
                  {profSaving ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save Changes</>}
                </Button>
              </form>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SETTINGS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {section === "settings" && (
            <div className="space-y-4 max-w-xl">
              <div className="rounded-xl border bg-white p-5 space-y-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Portal Settings</p>
                <div className="space-y-3">
                  {[
                    { label: "Email notifications", sub: "Receive booking updates via email" },
                    { label: "WhatsApp alerts", sub: "Get alerts on WhatsApp for new bookings" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.sub}</p></div>
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">Active</Badge>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Contact your branch manager to change notification settings.</p>
              </div>
              <div className="rounded-xl border bg-white p-5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Account</p>
                <button onClick={() => logout()} className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700">
                  <LogOut size={14} /> Sign out of Agent Portal
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
