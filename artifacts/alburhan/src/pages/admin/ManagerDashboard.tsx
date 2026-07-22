import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Link } from "wouter";
import {
  BookOpen, Users, UsersRound, CreditCard, Clock, CheckCircle,
  AlertTriangle, TrendingUp, BarChart2, Package, RefreshCw,
  Plane, Building2, Plus, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

interface Stats {
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  partialBookings: number;
  totalCustomers: number;
  totalGroups: number;
  totalPilgrims: number;
  pendingBalance: number;
  totalPackages: number;
  totalFlights: number;
  totalHotels: number;
}

const ZERO: Stats = {
  totalBookings: 0, pendingBookings: 0, confirmedBookings: 0,
  partialBookings: 0, totalCustomers: 0, totalGroups: 0,
  totalPilgrims: 0, pendingBalance: 0, totalPackages: 0,
  totalFlights: 0, totalHotels: 0,
};

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  href?: string;
}

function StatCard({ icon: Icon, label, value, sub, color, href }: StatCardProps) {
  const inner = (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow ${href ? "cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1 opacity-70">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function ManagerDashboard() {
  const [stats, setStats] = useState<Stats>(ZERO);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [bRes, cRes, gRes, pkRes] = await Promise.allSettled([
        fetch(`${API}/api/bookings/stats`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/api/customers/stats`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/api/groups/stats`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch(`${API}/api/packages/stats`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
      ]);

      const b = bRes.status === "fulfilled" ? bRes.value : null;
      const c = cRes.status === "fulfilled" ? cRes.value : null;
      const g = gRes.status === "fulfilled" ? gRes.value : null;
      const pk = pkRes.status === "fulfilled" ? pkRes.value : null;

      setStats({
        totalBookings:    b?.total ?? b?.totalBookings ?? 0,
        pendingBookings:  b?.pending ?? b?.pendingBookings ?? 0,
        confirmedBookings:b?.confirmed ?? b?.confirmedBookings ?? 0,
        partialBookings:  b?.partial ?? b?.partialBookings ?? 0,
        totalCustomers:   c?.total ?? c?.totalCustomers ?? 0,
        totalGroups:      g?.total ?? g?.totalGroups ?? 0,
        totalPilgrims:    g?.totalPilgrims ?? 0,
        pendingBalance:   b?.pendingBalance ?? 0,
        totalPackages:    pk?.total ?? pk?.totalPackages ?? 0,
        totalFlights:     g?.totalFlights ?? 0,
        totalHotels:      g?.totalHotels ?? 0,
      });
    } catch {
      // keep zeros
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manager Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Bookings, customers, and group overview</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Link href="/admin/bookings">
              <Button size="sm" className="bg-primary text-white hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" /> New Booking
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCard icon={BookOpen}    label="Total Bookings"     value={stats.totalBookings}    color="bg-blue-100 text-blue-700"   href="/admin/bookings" />
          <StatCard icon={Clock}       label="Pending"            value={stats.pendingBookings}  color="bg-amber-100 text-amber-700" href="/admin/bookings" />
          <StatCard icon={CheckCircle} label="Confirmed"          value={stats.confirmedBookings}color="bg-green-100 text-green-700" href="/admin/bookings" />
          <StatCard icon={AlertTriangle}label="Partial"           value={stats.partialBookings}  color="bg-orange-100 text-orange-700"href="/admin/bookings"/>
          <StatCard icon={Users}       label="Customers"          value={stats.totalCustomers}   color="bg-violet-100 text-violet-700"href="/admin/customers"/>
          <StatCard icon={UsersRound}  label="Groups"             value={stats.totalGroups}      color="bg-teal-100 text-teal-700"   href="/admin/groups" />
          <StatCard icon={TrendingUp}  label="Pilgrims"           value={stats.totalPilgrims}    color="bg-sky-100 text-sky-700"     href="/admin/groups" />
          <StatCard icon={CreditCard}  label="Pending Balance"    value={fmt(stats.pendingBalance)}color="bg-red-100 text-red-700" />
          <StatCard icon={Package}     label="Packages"           value={stats.totalPackages}    color="bg-indigo-100 text-indigo-700"href="/admin/packages"/>
          <StatCard icon={Plane}       label="Flights"            value={stats.totalFlights}     color="bg-cyan-100 text-cyan-700"   href="/admin/flights"/>
          <StatCard icon={Building2}   label="Hotels"             value={stats.totalHotels}      color="bg-rose-100 text-rose-700"   href="/admin/hotels"/>
          <StatCard icon={BarChart2}   label="Reports"            value="View"                   color="bg-gray-100 text-gray-700"   href="/admin/reports"/>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Bookings",    href: "/admin/bookings",    icon: BookOpen },
              { label: "Customers",   href: "/admin/customers",   icon: Users },
              { label: "Groups",      href: "/admin/groups",      icon: UsersRound },
              { label: "Packages",    href: "/admin/packages",    icon: Package },
              { label: "Reports",     href: "/admin/reports",     icon: BarChart2 },
              { label: "Flights",     href: "/admin/flights",     icon: Plane },
              { label: "Hotels",      href: "/admin/hotels",      icon: Building2 },
              { label: "Leads",       href: "/admin/leads",       icon: TrendingUp },
              { label: "Tasks",       href: "/admin/tasks",       icon: CheckCircle },
              { label: "Inquiries",   href: "/admin/inquiries",   icon: Eye },
            ].map(({ label, href, icon: Icon }) => (
              <Link key={href} href={href}>
                <div className="flex flex-col items-center gap-2 p-3 rounded-xl border hover:bg-muted/50 cursor-pointer transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                  <span className="text-xs font-medium text-center">{label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
