import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Users, CheckCircle, XCircle, Clock, Search, RefreshCw, Phone, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE_API = import.meta.env.VITE_API_URL || "";

function AttendanceBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ElementType }> = {
    present: { color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
    absent: { color: "bg-red-100 text-red-700", icon: XCircle },
    missing: { color: "bg-amber-100 text-amber-700", icon: Clock },
  };
  const { color, icon: Icon } = map[status] || { color: "bg-gray-100 text-gray-600", icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${color}`}>
      <Icon size={11} /> {status || "—"}
    </span>
  );
}

export default function GuidePanel() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [pilgrims, setPilgrims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [eventName, setEventName] = useState("Flight Boarding");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE_API}/api/admin/groups`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setGroups(Array.isArray(d) ? d : d.groups || []); })
      .catch(() => {});
  }, []);

  const loadPilgrims = async (groupId: string) => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/pilgrims?groupId=${groupId}`, { credentials: "include" });
      const d = r.ok ? await r.json() : [];
      const list: any[] = Array.isArray(d) ? d : d.pilgrims || [];
      setPilgrims(list);

      // Load attendance for the event
      const ar = await fetch(`${BASE_API}/api/admin/attendance?groupId=${groupId}&event=${encodeURIComponent(eventName)}`, { credentials: "include" });
      if (ar.ok) {
        const aData = await ar.json();
        const map: Record<string, string> = {};
        for (const log of aData.logs || aData || []) {
          map[log.pilgrim_id || log.pilgrimId] = log.status;
        }
        setAttendance(map);
      }
    } catch { toast({ title: "Failed to load pilgrims", variant: "destructive" }); }
    setLoading(false);
  };

  const markAttendance = async (pilgrimId: string, status: string) => {
    setSaving(pilgrimId);
    try {
      const r = await fetch(`${BASE_API}/api/admin/attendance`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: selectedGroup, pilgrimId, eventName, status }),
      });
      if (r.ok) {
        setAttendance(prev => ({ ...prev, [pilgrimId]: status }));
      } else {
        const d = await r.json().catch(() => ({}));
        toast({ title: "Failed to mark attendance", description: d.error || "Please try again", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    }
    setSaving(null);
  };

  const filtered = pilgrims.filter(p =>
    !searchQ || (p.full_name || p.fullName || "").toLowerCase().includes(searchQ.toLowerCase()) ||
    (p.mobile_india || p.mobileIndia || "").includes(searchQ)
  );

  const presentCount = Object.values(attendance).filter(s => s === "present").length;
  const absentCount = Object.values(attendance).filter(s => s === "absent").length;

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Guide Panel</h1>
          <p className="text-sm text-muted-foreground mt-1">View your assigned group, take attendance, contact pilgrims</p>
        </div>

        {/* Group selector */}
        <div className="rounded-2xl border p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Select Group</label>
            <select
              className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={selectedGroup}
              onChange={e => { setSelectedGroup(e.target.value); if (e.target.value) loadPilgrims(e.target.value); }}
            >
              <option value="">Choose a group…</option>
              {groups.map((g: any) => (
                <option key={g.id} value={g.id}>{g.group_name || g.groupName} ({g.year || ""})</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Attendance Event</label>
            <select
              className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={eventName}
              onChange={e => { setEventName(e.target.value); if (selectedGroup) loadPilgrims(selectedGroup); }}
            >
              {["Flight Boarding", "Hotel Check-in Makkah", "Hotel Check-in Madinah", "Bus Boarding", "Departure", "Arrived"].map(ev => (
                <option key={ev} value={ev}>{ev}</option>
              ))}
            </select>
          </div>
          {selectedGroup && (
            <Button size="sm" variant="outline" onClick={() => loadPilgrims(selectedGroup)} disabled={loading} className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          )}
        </div>

        {selectedGroup && pilgrims.length > 0 && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total", value: pilgrims.length, color: "bg-blue-100 text-blue-700" },
                { label: "Present", value: presentCount, color: "bg-emerald-100 text-emerald-700" },
                { label: "Absent", value: absentCount, color: "bg-red-100 text-red-700" },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl p-4 text-center ${s.color}`}>
                  <p className="text-3xl font-bold font-mono">{s.value}</p>
                  <p className="text-xs font-semibold mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search pilgrim by name or mobile…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="pl-9 h-10 text-sm"
              />
            </div>

            {/* Pilgrim list */}
            <div className="rounded-2xl border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {filtered.length} Pilgrims — {eventName}
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700 hover:bg-emerald-50"
                    onClick={() => filtered.forEach(p => markAttendance(p.id, "present"))}>
                    ✓ Mark All Present
                  </Button>
                </div>
              </div>
              <div className="divide-y">
                {filtered.map((p: any, idx) => {
                  const id = p.id;
                  const name = p.full_name || p.fullName || "—";
                  const mobile = p.mobile_india || p.mobileIndia || "";
                  const serial = p.serial_number || p.serialNumber || idx + 1;
                  const curStatus = attendance[id];

                  return (
                    <div key={id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {serial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {mobile && <p className="text-xs text-muted-foreground">{mobile}</p>}
                          {p.visa_status && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4">{p.visa_status}</Badge>
                          )}
                        </div>
                      </div>
                      <AttendanceBadge status={curStatus} />
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => markAttendance(id, "present")}
                          disabled={saving === id}
                          className={`w-8 h-8 rounded-lg border text-xs flex items-center justify-center transition-colors ${
                            curStatus === "present" ? "bg-emerald-500 text-white border-emerald-500" : "border-border hover:bg-emerald-50 text-emerald-700"
                          }`}
                          title="Mark Present"
                        >
                          {saving === id ? "…" : "✓"}
                        </button>
                        <button
                          onClick={() => markAttendance(id, "absent")}
                          disabled={saving === id}
                          className={`w-8 h-8 rounded-lg border text-xs flex items-center justify-center transition-colors ${
                            curStatus === "absent" ? "bg-red-500 text-white border-red-500" : "border-border hover:bg-red-50 text-red-700"
                          }`}
                          title="Mark Absent"
                        >
                          ✕
                        </button>
                        {mobile && (
                          <a
                            href={`tel:${mobile}`}
                            className="w-8 h-8 rounded-lg border border-border hover:bg-blue-50 text-blue-700 flex items-center justify-center"
                            title={`Call ${mobile}`}
                          >
                            <Phone size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {selectedGroup && !loading && pilgrims.length === 0 && (
          <div className="py-16 text-center text-muted-foreground">
            <Users size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No pilgrims found in this group.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
