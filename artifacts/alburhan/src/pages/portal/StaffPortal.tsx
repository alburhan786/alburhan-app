import React, { useState, useEffect } from "react";
import {
  IdCard, LogOut, RefreshCw, Phone, Calendar, Shield, User,
  Building2, Heart, Clock, Mail, MapPin, Briefcase, Star,
  ChevronRight, Bell, FileText, Headphones, CheckSquare,
  Users, BookOpen, CreditCard, Printer, HelpCircle, LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { FCMAutoInit } from "@/components/FCMAutoInit";
import { FCMBell } from "@/components/FCMBell";

const API = import.meta.env.VITE_API_URL || "";

type Tab = "overview" | "profile" | "documents" | "help";

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <Icon size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, sub, color }: { icon: React.ElementType; label: string; sub: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 cursor-default ${color}`}>
      <Icon size={18} className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-none">{label}</p>
        <p className="text-xs mt-0.5 opacity-70">{sub}</p>
      </div>
      <ChevronRight size={14} className="opacity-40" />
    </div>
  );
}

export default function StaffPortal() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/portal/staff`, { credentials: "include" });
      // 404/403 = no staff record yet — show "not found" state, not a blocking error
      if (r.status === 404 || r.status === 403) { setData({}); setLoading(false); return; }
      if (!r.ok) { setError("Failed to load staff data"); setLoading(false); return; }
      setData(await r.json());
    } catch {
      setError("Network error — please try again");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const m = data?.member || {};
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "profile", label: "My Profile", icon: User },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "help", label: "Help & Support", icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <FCMAutoInit userType="staff" />
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-800 to-slate-700 text-white sticky top-0 z-20 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                <IdCard size={18} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-sm leading-none">Al Burhan Tours & Travels</p>
                <p className="text-xs text-slate-300 mt-0.5">Staff Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FCMBell iconSize={14} />
              <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <RefreshCw size={14} className={loading ? "animate-spin text-slate-300" : "text-slate-300"} />
              </button>
              <Button variant="outline" size="sm" className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs" onClick={() => logout()}>
                <LogOut size={12} /> Logout
              </Button>
            </div>
          </div>

          {/* Welcome bar */}
          {m.full_name && (
            <div className="mt-3 pb-1 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                {m.photo_url
                  ? <img src={m.photo_url} alt={m.full_name} className="w-full h-full object-cover" />
                  : <User size={22} className="text-white/60" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base leading-none truncate">Assalamu Alaikum, {m.full_name.split(" ")[0]}!</p>
                <p className="text-xs text-slate-300 mt-1">{today}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {m.staff_id && <Badge className="bg-white/15 text-white border-white/20 font-mono text-[10px]">{m.staff_id}</Badge>}
                <Badge className={`text-[10px] ${m.status === "active" ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" : "bg-red-500/20 text-red-300 border-red-400/30"}`}>
                  {m.status || "—"}
                </Badge>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-3 -mb-3 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === t.id ? "bg-gray-50 text-slate-800" : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                <t.icon size={12} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {loading ? (
          <div className="py-20 text-center text-gray-400">
            <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-gray-300" />
            <p className="text-sm">Loading your profile…</p>
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <Button onClick={load} size="sm" className="mt-3">Retry</Button>
          </div>
        ) : !m.id ? (
          <div className="py-20 text-center text-gray-400">
            <User size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Staff record not found</p>
            <p className="text-xs mt-1">Contact your administrator to set up your staff profile</p>
          </div>
        ) : (
          <>
            {/* ── OVERVIEW TAB ────────────────────── */}
            {tab === "overview" && (
              <div className="space-y-4">
                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    label="Department"
                    value={m.department || "—"}
                    icon={Building2}
                    color="bg-blue-50 text-blue-600"
                  />
                  <StatCard
                    label="Designation"
                    value={m.designation || "—"}
                    icon={Briefcase}
                    color="bg-purple-50 text-purple-600"
                  />
                  <StatCard
                    label="Role"
                    value={(m.role || "Staff").replace(/_/g, " ")}
                    icon={Shield}
                    color="bg-slate-50 text-slate-600"
                  />
                  <StatCard
                    label="Blood Group"
                    value={m.blood_group || "—"}
                    icon={Heart}
                    color="bg-red-50 text-red-600"
                  />
                </div>

                {/* Status card */}
                <div className={`rounded-xl border p-4 flex items-center gap-4 ${m.status === "active" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${m.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    <CheckSquare size={22} />
                  </div>
                  <div>
                    <p className={`font-bold text-sm ${m.status === "active" ? "text-emerald-800" : "text-amber-800"}`}>
                      Status: {(m.status || "unknown").toUpperCase()}
                    </p>
                    <p className={`text-xs mt-0.5 ${m.status === "active" ? "text-emerald-600" : "text-amber-600"}`}>
                      {m.status === "active"
                        ? "Your account is active and you're cleared for work today."
                        : "Please contact your manager regarding your account status."}
                    </p>
                    {m.valid_upto && (
                      <p className="text-[11px] text-gray-500 mt-1">Valid until: {m.valid_upto}</p>
                    )}
                  </div>
                </div>

                {/* Key info */}
                <div className="rounded-xl border bg-white p-4 divide-y divide-gray-50">
                  <InfoRow icon={Calendar} label="Joining Date" value={m.joining_date} />
                  <InfoRow icon={Phone} label="Mobile" value={m.mobile_india} />
                  <InfoRow icon={Mail} label="Email" value={m.email} />
                  <InfoRow icon={MapPin} label="Address" value={m.address} />
                  {m.employee_code && <InfoRow icon={Star} label="Employee Code" value={m.employee_code} />}
                </div>

                {/* Quick links */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-0.5">Quick Actions</p>
                  <div className="space-y-2">
                    <QuickLink icon={Headphones} label="Customer Support" sub="Handle customer inquiries and issues" color="bg-blue-50 text-blue-700 border-blue-100" />
                    <QuickLink icon={Users} label="Pilgrims & Groups" sub="View pilgrim assignments and groups" color="bg-emerald-50 text-emerald-700 border-emerald-100" />
                    <QuickLink icon={BookOpen} label="Bookings" sub="Check and verify customer bookings" color="bg-violet-50 text-violet-700 border-violet-100" />
                    <QuickLink icon={Bell} label="Notifications" sub="View sent notifications and messages" color="bg-amber-50 text-amber-700 border-amber-100" />
                    <QuickLink icon={Printer} label="Print Center" sub="Print ID cards, luggage tags and more" color="bg-slate-50 text-slate-700 border-slate-200" />
                  </div>
                </div>
              </div>
            )}

            {/* ── PROFILE TAB ────────────────────── */}
            {tab === "profile" && (
              <div className="space-y-4">
                {/* Identity card */}
                <div className="rounded-xl border bg-white p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-20 h-20 rounded-xl border-2 border-gray-100 overflow-hidden flex-shrink-0 bg-gray-50 flex items-center justify-center">
                      {m.photo_url
                        ? <img src={m.photo_url} alt={m.full_name} className="w-full h-full object-cover" />
                        : <User size={32} className="text-gray-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold text-gray-900 leading-tight">{m.full_name}</h2>
                      {m.designation && <p className="text-gray-500 text-sm mt-0.5">{m.designation}</p>}
                      {m.department && <p className="text-gray-400 text-xs">{m.department}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {m.staff_id && <Badge variant="outline" className="font-mono text-[11px]">{m.staff_id}</Badge>}
                        {m.employee_code && <Badge variant="outline" className="font-mono text-[11px]">{m.employee_code}</Badge>}
                        <Badge className={`text-[11px] ${m.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                          {m.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Personal Details</p>
                  <div className="divide-y divide-gray-50">
                    <InfoRow icon={Phone} label="Mobile" value={m.mobile_india} />
                    <InfoRow icon={Mail} label="Email" value={m.email} />
                    <InfoRow icon={Calendar} label="Date of Birth" value={m.date_of_birth} />
                    <InfoRow icon={Heart} label="Blood Group" value={m.blood_group} />
                    <InfoRow icon={MapPin} label="Address" value={m.address} />
                    <InfoRow icon={Shield} label="Role" value={(m.role || "").replace(/_/g, " ")} />
                    <InfoRow icon={Briefcase} label="Designation" value={m.designation} />
                    <InfoRow icon={Building2} label="Department" value={m.department} />
                    <InfoRow icon={Calendar} label="Joining Date" value={m.joining_date} />
                    <InfoRow icon={Clock} label="Valid Upto" value={m.valid_upto} />
                  </div>
                </div>

                {/* Emergency contact */}
                {(m.emergency_contact || m.emergency_mobile) && (
                  <div className="rounded-xl border bg-red-50 border-red-100 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Heart size={14} className="text-red-500" />
                      <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">Emergency Contact</p>
                    </div>
                    <div className="divide-y divide-red-100">
                      <InfoRow icon={User} label="Name" value={m.emergency_contact} />
                      <InfoRow icon={Phone} label="Mobile" value={m.emergency_mobile} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── DOCUMENTS TAB ────────────────────── */}
            {tab === "documents" && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-white p-5 text-center py-10">
                  <FileText size={36} className="text-gray-200 mx-auto mb-3" />
                  <p className="font-semibold text-gray-600">My Documents</p>
                  <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                    Your documents (ID proofs, contracts, certificates) will appear here once uploaded by your manager.
                  </p>
                  <p className="text-xs text-gray-400 mt-3">Contact your administrator to upload documents</p>
                </div>

                {/* Staff details card */}
                <div className="rounded-xl border bg-white p-4">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Staff Identifiers</p>
                  <div className="grid grid-cols-2 gap-3">
                    {m.staff_id && (
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Staff ID</p>
                        <p className="font-mono font-bold text-gray-800 mt-0.5">{m.staff_id}</p>
                      </div>
                    )}
                    {m.employee_code && (
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Employee Code</p>
                        <p className="font-mono font-bold text-gray-800 mt-0.5">{m.employee_code}</p>
                      </div>
                    )}
                    {m.joining_date && (
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Joining Date</p>
                        <p className="font-medium text-gray-800 mt-0.5 text-sm">{m.joining_date}</p>
                      </div>
                    )}
                    {m.valid_upto && (
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Valid Upto</p>
                        <p className="font-medium text-gray-800 mt-0.5 text-sm">{m.valid_upto}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── HELP & SUPPORT TAB ────────────────────── */}
            {tab === "help" && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-white p-5 space-y-4">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Company Contacts</p>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Building2 size={16} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-blue-900">Al Burhan Tours & Travels</p>
                        <p className="text-xs text-blue-600">Head Office</p>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 flex items-center gap-3">
                      <Headphones size={16} className="text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-400">Admin Support</p>
                        <p className="font-medium text-sm">Contact your branch manager</p>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 flex items-center gap-3">
                      <Phone size={16} className="text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-400">Your Registered Mobile</p>
                        <p className="font-medium text-sm">{user?.mobile || "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-amber-50 border-amber-100 p-4">
                  <div className="flex items-start gap-3">
                    <Bell size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-sm text-amber-900">Notice</p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        For system access issues, password resets, or technical support, please contact your branch admin or the IT team directly. Do not share your OTP with anyone.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">My Account</p>
                  <div className="divide-y divide-gray-50">
                    <InfoRow icon={Phone} label="Registered Mobile" value={user?.mobile} />
                    <InfoRow icon={Shield} label="Access Role" value="Staff" />
                    <InfoRow icon={IdCard} label="Staff Name" value={m.full_name} />
                  </div>
                  <Button
                    onClick={() => logout()}
                    variant="outline"
                    className="w-full mt-4 gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <LogOut size={14} /> Sign Out
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

