import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, RefreshCw, UserCheck, UserX, Clock, IndianRupee, Phone, Mail, Plus, Briefcase } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(1)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n.toLocaleString("en-IN")}`;

export default function HRDashboard() {
  const [staff, setStaff]           = useState<any[]>([]);
  const [payroll, setPayroll]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        fetch(`${API}/api/staff`,          { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/admin/payroll`,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setStaff(Array.isArray(s) ? s : []);
      setPayroll(Array.isArray(p) ? p : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const activeStaff = staff.filter(s => s.status !== "inactive" && s.status !== "terminated").length;
  const onLeave     = staff.filter(s => s.status === "on_leave" || s.onLeave).length;
  const totalPayroll = payroll.reduce((a, b) => a + (parseFloat(b.salary || b.amount || 0)), 0);

  const DEPT_COLORS: Record<string, string> = {
    operations: "bg-blue-100 text-blue-700",
    finance:    "bg-emerald-100 text-emerald-700",
    sales:      "bg-violet-100 text-violet-700",
    support:    "bg-amber-100 text-amber-700",
    management: "bg-rose-100 text-rose-700",
  };

  const deptMap: Record<string, number> = {};
  for (const s of staff) {
    const d = s.department || s.dept || "General";
    deptMap[d] = (deptMap[d] || 0) + 1;
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Briefcase size={18} className="text-primary" /></div>
              HR Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Human Resources — staff, payroll, attendance, and workforce management</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/payroll"><Button size="sm" className="gap-1.5"><IndianRupee size={13} /> Payroll</Button></Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Users,       label: "Total Staff",    val: staff.length,                  color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: UserCheck,   label: "Active",         val: activeStaff,                   color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Clock,       label: "On Leave",       val: onLeave,                       color: "bg-amber-50 border-amber-200 text-amber-700" },
            { icon: IndianRupee, label: "Monthly Payroll",val: fmt(totalPayroll || 0),        color: "bg-violet-50 border-violet-200 text-violet-700", isStr: true },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{(k as any).isStr ? k.val : k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Department Breakdown */}
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold mb-4">Department Breakdown</h2>
            {Object.keys(deptMap).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No staff data yet.</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(deptMap).map(([dept, count]) => {
                  const pct = staff.length > 0 ? Math.round((count / staff.length) * 100) : 0;
                  const col = DEPT_COLORS[dept.toLowerCase()] || "bg-gray-100 text-gray-700";
                  return (
                    <div key={dept} className="flex items-center gap-3">
                      <Badge className={`text-xs min-w-24 justify-center ${col}`}>{dept}</Badge>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-mono w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Staff Roster */}
          <div className="rounded-2xl border bg-card">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Staff Roster</h2>
              <Link href="/admin/staff"><Button variant="ghost" size="sm">Manage →</Button></Link>
            </div>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading…</div>
            ) : staff.length === 0 ? (
              <div className="py-10 text-center">
                <Users size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm text-muted-foreground">No staff records found.</p>
              </div>
            ) : (
              <div className="divide-y">
                {staff.slice(0, 8).map((s, i) => (
                  <div key={s.id || i} className="px-5 py-3 flex items-center justify-between hover:bg-muted/20">
                    <div>
                      <p className="font-medium text-sm">{s.name || s.staffName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{s.designation || s.role || s.department || "—"}</p>
                    </div>
                    <Badge variant={s.status === "inactive" || s.status === "terminated" ? "destructive" : "default"} className="text-xs capitalize">
                      {s.status || "active"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/staff"><Button variant="outline" size="sm" className="gap-1.5"><Users size={13} /> Staff Management</Button></Link>
            <Link href="/admin/payroll"><Button variant="outline" size="sm" className="gap-1.5"><IndianRupee size={13} /> Payroll</Button></Link>
            <Link href="/admin/user-roles"><Button variant="outline" size="sm" className="gap-1.5"><UserCheck size={13} /> User Roles</Button></Link>
            <Link href="/admin/assets"><Button variant="outline" size="sm" className="gap-1.5"><Briefcase size={13} /> Assets</Button></Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
