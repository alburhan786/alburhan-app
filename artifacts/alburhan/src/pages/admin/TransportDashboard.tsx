import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bus, RefreshCw, MapPin, Users, CheckCircle2, PlusCircle, Wrench, Navigation } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function TransportDashboard() {
  const [buses, setBuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const b = await fetch(`${API}/api/buses`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setBuses(Array.isArray(b) ? b : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const active = buses.filter(b => b.status === "active" || !b.status).length;
  const inMaintenance = buses.filter(b => b.status === "maintenance").length;
  const totalCapacity = buses.reduce((a, b) => a + (parseInt(b.capacity || b.seats || 0)), 0);

  const STATUS_COLOR: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    maintenance: "bg-amber-100 text-amber-700",
    inactive: "bg-red-100 text-red-700",
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Bus size={18} className="text-primary" /></div>
              Transport Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Fleet management — buses, vehicles, routes and pilgrim transport</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/buses"><Button size="sm" className="gap-1.5"><PlusCircle size={13} /> Manage Fleet</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Bus,          label: "Total Vehicles",   val: buses.length,    color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: CheckCircle2, label: "Active",           val: active,          color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Wrench,       label: "Maintenance",      val: inMaintenance,   color: "bg-amber-50 border-amber-200 text-amber-700" },
            { icon: Users,        label: "Total Capacity",   val: totalCapacity,   color: "bg-violet-50 border-violet-200 text-violet-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Fleet Register</h2>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : buses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bus size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No vehicles registered yet</p>
              <Link href="/admin/buses"><Button size="sm" className="mt-3">Add Vehicle</Button></Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="pb-2 text-left font-medium">Vehicle</th>
                    <th className="pb-2 text-left font-medium">Registration</th>
                    <th className="pb-2 text-left font-medium">Capacity</th>
                    <th className="pb-2 text-left font-medium">Type</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {buses.slice(0, 10).map((b, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 font-medium">{b.name || b.vehicle_name || `Vehicle ${i + 1}`}</td>
                      <td className="py-2 text-muted-foreground">{b.registration || b.reg_number || "—"}</td>
                      <td className="py-2">{b.capacity || b.seats || "—"} seats</td>
                      <td className="py-2 text-muted-foreground">{b.type || b.vehicle_type || "Bus"}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLOR[b.status || "active"] || "bg-gray-100 text-gray-600"}`}>
                          {b.status || "active"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Manage Buses", href: "/admin/buses", icon: Bus },
            { label: "Group Tracking", href: "/admin/group-tracking", icon: Navigation },
            { label: "Pilgrim Ops", href: "/admin/pilgrim-ops", icon: MapPin },
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
