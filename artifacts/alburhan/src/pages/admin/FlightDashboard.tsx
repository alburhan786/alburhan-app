import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plane, RefreshCw, Calendar, MapPin, Clock, Users, PlusCircle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function FlightDashboard() {
  const [flights, setFlights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const f = await fetch(`${API}/api/flights`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setFlights(Array.isArray(f) ? f : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const confirmed = flights.filter(f => f.status === "confirmed" || f.confirmed).length;
  const upcoming = flights.filter(f => {
    const d = new Date(f.departure_date || f.date || 0);
    return d >= new Date();
  }).length;
  const totalSeats = flights.reduce((a, f) => a + (parseInt(f.seats || f.capacity || 0)), 0);

  const STATUS_COLOR: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    cancelled: "bg-red-100 text-red-700",
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Plane size={18} className="text-primary" /></div>
              Flight Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Flight operations — bookings, schedules, and seat allocation</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/flights"><Button size="sm" className="gap-1.5"><PlusCircle size={13} /> Manage Flights</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Plane,        label: "Total Flights",   val: flights.length,  color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: CheckCircle2, label: "Confirmed",       val: confirmed,       color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Calendar,     label: "Upcoming",        val: upcoming,        color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: Users,        label: "Total Seats",     val: totalSeats,      color: "bg-amber-50 border-amber-200 text-amber-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Flight Schedule</h2>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : flights.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Plane size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No flights scheduled yet</p>
              <Link href="/admin/flights"><Button size="sm" className="mt-3">Add Flight</Button></Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="pb-2 text-left font-medium">Flight</th>
                    <th className="pb-2 text-left font-medium">Route</th>
                    <th className="pb-2 text-left font-medium">Date</th>
                    <th className="pb-2 text-left font-medium">Seats</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {flights.slice(0, 10).map((f, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 font-medium">{f.flight_number || f.airline || `FL-${i + 1}`}</td>
                      <td className="py-2 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin size={11} />{f.origin || f.from || "—"} → {f.destination || f.to || "—"}
                        </span>
                      </td>
                      <td className="py-2 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />{f.departure_date || f.date ? new Date(f.departure_date || f.date).toLocaleDateString() : "—"}
                        </span>
                      </td>
                      <td className="py-2">{f.seats || f.capacity || "—"}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLOR[f.status || "pending"] || "bg-gray-100 text-gray-600"}`}>
                          {f.status || "pending"}
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
            { label: "Manage Flights", href: "/admin/flights", icon: Plane },
            { label: "Group Tracking", href: "/admin/group-tracking", icon: Users },
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
