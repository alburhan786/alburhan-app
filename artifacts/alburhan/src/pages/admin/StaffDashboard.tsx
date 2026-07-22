import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, RefreshCw, UserCheck, UserX, Clock, IndianRupee, Shield, Award, UserPlus } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function StaffDashboard() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetch(`${API}/api/staff`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setStaff(Array.isArray(s) ? s : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const active = staff.filter(s => s.status === "active" || !s.status).length;
  const onLeave = staff.filter(s => s.status === "on_leave").length;
  const inactive = staff.filter(s => s.status === "inactive" || s.status === "terminated").length;

  const deptMap: Record<string, number> = {};
  for (const s of staff) {
    const d = s.department || s.dept || "General";
    deptMap[d] = (deptMap[d] || 0) + 1;
  }

  const ROLE_COLORS: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    on_leave: "bg-amber-100 text-amber-700",
    inactive: "bg-red-100 text-red-700",
    terminated: "bg-gray-100 text-gray-600",
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Users size={18} className="text-primary" /></div>
              Staff Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Workforce overview — staff records, roles, attendance and performance</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/staff"><Button size="sm" className="gap-1.5"><UserPlus size={13} /> Manage Staff</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Users,     label: "Total Staff",   val: staff.length, color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: UserCheck, label: "Active",        val: active,       color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Clock,     label: "On Leave",      val: onLeave,      color: "bg-amber-50 border-amber-200 text-amber-700" },
            { icon: UserX,     label: "Inactive",      val: inactive,     color: "bg-red-50 border-red-200 text-red-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">Staff by Department</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : Object.keys(deptMap).length === 0 ? (
              <p className="text-sm text-muted-foreground">No department data available</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(deptMap).map(([dept, count]) => (
                  <div key={dept} className="flex items-center justify-between">
                    <span className="text-sm">{dept}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-full bg-primary/20 w-20 overflow-hidden">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (count / staff.length) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">Recent Staff</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff records yet</p>
            ) : (
              <div className="space-y-2">
                {staff.slice(0, 6).map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{s.name || s.full_name || "Staff Member"}</p>
                      <p className="text-xs text-muted-foreground">{s.department || s.role || "—"}</p>
                    </div>
                    <Badge className={`text-xs ${ROLE_COLORS[s.status || "active"] || "bg-gray-100 text-gray-600"}`} variant="outline">
                      {s.status || "active"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Staff Records", href: "/admin/staff", icon: Users },
            { label: "HR Dashboard", href: "/admin/hr", icon: Award },
            { label: "Payroll", href: "/admin/payroll", icon: IndianRupee },
            { label: "Permissions", href: "/admin/permissions", icon: Shield },
          ].map(a => (
            <Link key={a.href} href={a.href}>
              <div className="rounded-xl border bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-3">
                <a.icon size={16} className="text-primary" />
                <span className="text-sm font-medium">{a.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
