import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, RefreshCw, MapPin, BedDouble, Users, CheckCircle2, PlusCircle, Star } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function HotelDashboard() {
  const [hotels, setHotels] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [h, a] = await Promise.all([
        fetch(`${API}/api/hotels`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/allocations`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setHotels(Array.isArray(h) ? h : []);
      setAllocations(Array.isArray(a) ? a : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const makkah = hotels.filter(h => (h.city || h.location || "").toLowerCase().includes("makkah") || (h.city || h.location || "").toLowerCase().includes("mecca")).length;
  const madinah = hotels.filter(h => (h.city || h.location || "").toLowerCase().includes("madinah") || (h.city || h.location || "").toLowerCase().includes("medina")).length;
  const totalRooms = hotels.reduce((a, h) => a + (parseInt(h.total_rooms || h.rooms || 0)), 0);

  const STAR_COLOR: Record<string, string> = {
    "5": "bg-amber-100 text-amber-700",
    "4": "bg-blue-100 text-blue-700",
    "3": "bg-emerald-100 text-emerald-700",
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 size={18} className="text-primary" /></div>
              Hotel Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Hotel management — properties, rooms, and pilgrim allocation</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/hotels"><Button size="sm" className="gap-1.5"><PlusCircle size={13} /> Manage Hotels</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Building2,   label: "Total Hotels",      val: hotels.length,   color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: MapPin,      label: "Makkah",            val: makkah,          color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: MapPin,      label: "Madinah",           val: madinah,         color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: BedDouble,   label: "Total Rooms",       val: totalRooms,      color: "bg-amber-50 border-amber-200 text-amber-700" },
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
            <h2 className="font-semibold text-sm mb-3">Hotels by City</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : hotels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hotels added yet</p>
            ) : (
              <div className="space-y-2">
                {hotels.slice(0, 8).map((h, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{h.name || h.hotel_name || `Hotel ${i + 1}`}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={10} />{h.city || h.location || "Location not set"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {h.star_rating && (
                        <Badge variant="outline" className={`text-xs ${STAR_COLOR[String(h.star_rating)] || "bg-gray-100 text-gray-600"}`}>
                          <Star size={9} className="mr-1" />{h.star_rating}★
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{h.total_rooms || h.rooms || 0} rooms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">Room Allocations</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : allocations.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <BedDouble size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No allocations yet</p>
                <Link href="/admin/allocations"><Button size="sm" variant="outline" className="mt-2">Manage Allocations</Button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {allocations.slice(0, 6).map((a, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{a.hotel_name || a.hotel || "Hotel"}</p>
                      <p className="text-xs text-muted-foreground">Room {a.room_number || a.room || "—"}</p>
                    </div>
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">
                      <Users size={9} className="mr-1" />{a.pilgrim_count || a.count || 1} pilgrims
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Manage Hotels", href: "/admin/hotels", icon: Building2 },
            { label: "Room Allocations", href: "/admin/allocations", icon: BedDouble },
            { label: "Pilgrim Ops", href: "/admin/pilgrim-ops", icon: Users },
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
