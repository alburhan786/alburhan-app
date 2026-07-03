import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plane, BookOpen, Wallet, CheckCircle, Clock, AlertTriangle,
  UsersRound, Home, BarChart2, RefreshCw, TrendingUp, UserCheck, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

interface OpsData {
  totalPilgrims: number;
  pilgrimsInFamily: number;
  totalFamilies: number;
  totalGroups: number;
  totalFlights: number;
  todayDepartures: number;
  totalBookings: number;
  pendingBookings: number;
  partialBookings: number;
  confirmedBookings: number;
  pendingBalance: number;
  attendancePresent: number;
  attendanceAbsent: number;
}

const ZERO: OpsData = {
  totalPilgrims: 0, pilgrimsInFamily: 0, totalFamilies: 0, totalGroups: 0,
  totalFlights: 0, todayDepartures: 0, totalBookings: 0, pendingBookings: 0,
  partialBookings: 0, confirmedBookings: 0, pendingBalance: 0,
  attendancePresent: 0, attendanceAbsent: 0,
};

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  bg: string;
  alert?: boolean;
  href?: string;
}

function StatCard({ icon: Icon, label, value, sub, color, bg, alert, href }: StatCardProps) {
  const inner = (
    <div className={`rounded-2xl border p-5 flex flex-col gap-3 transition-shadow hover:shadow-md ${alert ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon size={20} className={color} />
        </div>
        {alert && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold uppercase tracking-wide">Action Needed</span>}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );

  if (href) return <a href={href} className="block">{inner}</a>;
  return inner;
}

export default function OperationsDashboard() {
  const [data, setData] = useState<OpsData>(ZERO);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/operations`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      const d = await r.json();
      setData(d);
      setLastUpdated(new Date());
    } catch (e: any) {
      toast({ title: "Could not load operations data", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const attendanceTotal = data.attendancePresent + data.attendanceAbsent;
  const attendancePct = attendanceTotal > 0 ? Math.round((data.attendancePresent / attendanceTotal) * 100) : 0;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Operations Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : "Live operational overview"}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* Top row — pilgrims & groups */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Pilgrims & Groups</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={Users}
                  label="Total Pilgrims"
                  value={data.totalPilgrims.toLocaleString()}
                  sub={`${data.pilgrimsInFamily} in families`}
                  color="text-[#0d5040]" bg="bg-[#0d5040]/10"
                  href="/admin/groups"
                />
                <StatCard
                  icon={Home}
                  label="Families Registered"
                  value={data.totalFamilies.toLocaleString()}
                  sub={`Across ${data.totalGroups} groups`}
                  color="text-purple-600" bg="bg-purple-50"
                  href="/admin/family-ledger"
                />
                <StatCard
                  icon={UsersRound}
                  label="Hajj Groups"
                  value={data.totalGroups.toLocaleString()}
                  color="text-blue-600" bg="bg-blue-50"
                  href="/admin/groups"
                />
                <StatCard
                  icon={UserCheck}
                  label="Attendance"
                  value={`${attendancePct}%`}
                  sub={`${data.attendancePresent} present · ${data.attendanceAbsent} absent`}
                  color="text-emerald-600" bg="bg-emerald-50"
                />
              </div>
            </div>

            {/* Flights row */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Flights</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={Plane}
                  label="Total Flight Segments"
                  value={data.totalFlights.toLocaleString()}
                  color="text-sky-600" bg="bg-sky-50"
                  href="/admin/flights"
                />
                <StatCard
                  icon={Calendar}
                  label="Departures Today"
                  value={data.todayDepartures.toLocaleString()}
                  alert={data.todayDepartures > 0}
                  color="text-orange-600" bg="bg-orange-50"
                  href="/admin/flights"
                />
              </div>
            </div>

            {/* Bookings & Finance */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Bookings & Payments</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={BookOpen}
                  label="Total Bookings"
                  value={data.totalBookings.toLocaleString()}
                  color="text-indigo-600" bg="bg-indigo-50"
                  href="/admin/bookings"
                />
                <StatCard
                  icon={Clock}
                  label="Pending / Partial"
                  value={`${data.pendingBookings + data.partialBookings}`}
                  sub={`${data.pendingBookings} pending · ${data.partialBookings} partial`}
                  alert={(data.pendingBookings + data.partialBookings) > 0}
                  color="text-amber-600" bg="bg-amber-50"
                  href="/admin/bookings"
                />
                <StatCard
                  icon={CheckCircle}
                  label="Confirmed Bookings"
                  value={data.confirmedBookings.toLocaleString()}
                  color="text-emerald-600" bg="bg-emerald-50"
                  href="/admin/bookings"
                />
                <StatCard
                  icon={Wallet}
                  label="Pending Balance"
                  value={fmt(data.pendingBalance)}
                  alert={data.pendingBalance > 0}
                  color="text-red-600" bg="bg-red-50"
                  href="/admin/payments"
                />
              </div>
            </div>

            {/* Quick links */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Manage Bookings", href: "/admin/bookings", icon: BookOpen },
                  { label: "Payment Management", href: "/admin/payments", icon: Wallet },
                  { label: "Accounting", href: "/admin/accounting", icon: BarChart2 },
                  { label: "Family Ledger", href: "/admin/family-ledger", icon: Home },
                  { label: "Flights", href: "/admin/flights", icon: Plane },
                  { label: "Hajj Groups", href: "/admin/groups", icon: UsersRound },
                  { label: "Reports", href: "/admin/reports", icon: TrendingUp },
                ].map(q => (
                  <a
                    key={q.href}
                    href={q.href}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium text-gray-700 bg-white hover:bg-[#0d5040] hover:text-white hover:border-[#0d5040] transition-all"
                  >
                    <q.icon size={14} />
                    {q.label}
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
