import { useState, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, QrCode, BarChart2, Bus, Plane, MapPin, MoreHorizontal, Share2, Copy, Check } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const EVENT_TYPES = [
  { value: "bus", label: "Bus Boarding", icon: Bus, color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "airport", label: "Airport", icon: Plane, color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "ziyarat", label: "Ziyarat", icon: MapPin, color: "bg-green-100 text-green-700 border-green-200" },
  { value: "other", label: "Other", icon: MoreHorizontal, color: "bg-gray-100 text-gray-700 border-gray-200" },
];

function typeInfo(type: string) {
  return EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[3];
}

function StatusBar({ present, total }: { present: number; total: number }) {
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{present}/{total}</span>
    </div>
  );
}

export default function AttendanceManager() {
  const [, params] = useRoute("/admin/groups/:groupId/attendance");
  const groupId = params?.groupId;
  const { toast } = useToast();

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("bus");
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyScannerLink = (ev: any) => {
    const base = window.location.origin + (import.meta.env.BASE_URL || "").replace(/\/$/, "");
    const url = `${base}/attendance-scan/${groupId}/${ev.id}?token=${ev.scanToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(ev.id);
      toast({ title: "Scanner link copied!", description: "Share this link with field staff" });
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    });
  };

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/attendance/events`, { credentials: "include" });
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Failed to load events", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    fetchEvents();
    fetch(`${API}/api/groups/${groupId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setGroupName(d?.groupName || ""))
      .catch(() => {});
  }, [groupId, fetchEvents]);

  const createEvent = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/attendance/events`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      });
      if (!res.ok) throw new Error();
      setNewName("");
      setNewType("bus");
      setShowCreate(false);
      await fetchEvents();
      toast({ title: "Event created" });
    } catch {
      toast({ title: "Failed to create event", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const deleteEvent = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its attendance records?`)) return;
    try {
      await fetch(`${API}/api/groups/${groupId}/attendance/events/${id}/delete`, {
        method: "POST",
        credentials: "include",
      });
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast({ title: "Event deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href={`/admin/groups/${groupId}/pilgrims`}>
          <Button variant="ghost" size="sm" className="gap-1 mb-2">
            <ArrowLeft size={16} /> Back to Group
          </Button>
        </Link>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">Attendance</h1>
            <p className="text-muted-foreground mt-1">{groupName} · {events.length} event{events.length !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5 bg-[#0d5040] hover:bg-[#0d5040]/90">
            <Plus size={15} /> New Event
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="border rounded-xl p-5 mb-6 bg-white shadow-sm">
          <h2 className="font-semibold mb-4">Create Attendance Event</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Event name (e.g. Makkah Bus Boarding)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createEvent()}
              className="flex-1"
              autoFocus
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Button onClick={createEvent} disabled={creating || !newName.trim()} className="bg-[#0d5040] hover:bg-[#0d5040]/90">
              {creating ? "Creating…" : "Create"}
            </Button>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground animate-pulse">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <QrCode size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No attendance events yet</p>
          <p className="text-sm mt-1">Create your first event to start scanning pilgrims</p>
          <Button className="mt-4 bg-[#0d5040] hover:bg-[#0d5040]/90" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1.5" /> Create Event
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((ev) => {
            const ti = typeInfo(ev.type);
            const Icon = ti.icon;
            return (
              <div key={ev.id} className="border rounded-xl p-5 bg-white hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium border rounded-md px-2 py-0.5 ${ti.color}`}>
                      <Icon size={11} /> {ti.label}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteEvent(ev.id, ev.name)}
                    className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <h3 className="font-semibold text-base mt-2 mb-1 leading-snug">{ev.name}</h3>
                <StatusBar present={ev.present} total={ev.total} />

                <div className="flex gap-1 mt-1 text-xs text-muted-foreground">
                  <span className="text-emerald-600 font-medium">{ev.present} present</span>
                  <span>·</span>
                  <span className="text-red-500 font-medium">{ev.missing} missing</span>
                  <span>·</span>
                  <span>{ev.total} total</span>
                </div>

                <div className="flex gap-2 mt-4">
                  <Link href={`/admin/groups/${groupId}/attendance/${ev.id}/scan`} className="flex-1">
                    <Button size="sm" className="w-full gap-1.5 bg-[#0d5040] hover:bg-[#0d5040]/90">
                      <QrCode size={13} /> Scan
                    </Button>
                  </Link>
                  <Link href={`/admin/groups/${groupId}/attendance/${ev.id}/report`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full gap-1.5">
                      <BarChart2 size={13} /> Report
                    </Button>
                  </Link>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full mt-1.5 gap-1.5 text-xs text-muted-foreground hover:text-[#0d5040]"
                  onClick={() => copyScannerLink(ev)}
                >
                  {copiedId === ev.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copiedId === ev.id ? "Link Copied!" : "Copy Field Staff Scanner Link"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
