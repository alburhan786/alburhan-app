import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, MapPin, Users, Clock, Activity } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const CITIES = ["Makkah", "Madinah", "Jeddah", "Mina", "Arafat", "Muzdalifah", "Taif", "Transit", "India"];
const ACTIVITIES = [
  "Arrival at Airport", "Hotel Check-in", "Rest", "Tawaf", "Sa'i", "Ziarat Makkah", "Ziarat Madinah",
  "Rauza Sharif Visit", "Jumma Prayer", "Wuquf at Arafat", "Muzdalifah Night", "Rami al-Jamarat",
  "Qurbani", "Halq/Taqsir", "Tawaf al-Ifadah", "Tawaf al-Wida", "Departure to Airport",
  "In-flight", "Free Time", "Group Meeting", "Medical Check", "Market Visit"
];
const CITY_COLORS: Record<string, string> = {
  Makkah: "bg-emerald-100 text-emerald-700", Madinah: "bg-teal-100 text-teal-700",
  Jeddah: "bg-blue-100 text-blue-700", Mina: "bg-amber-100 text-amber-700",
  Arafat: "bg-orange-100 text-orange-700", Muzdalifah: "bg-violet-100 text-violet-700",
  India: "bg-rose-100 text-rose-700", Transit: "bg-gray-100 text-gray-700",
};

export default function GroupTracking() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<any[]>([]);
  const [tracking, setTracking] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [gr, tr] = await Promise.all([
        fetch(`${BASE_API}/api/groups`, { credentials: "include" }),
        fetch(`${BASE_API}/api/enterprise/group-tracking`, { credentials: "include" }),
      ]);
      if (gr.ok) {
        const gData = await gr.json();
        setGroups(Array.isArray(gData) ? gData : gData.groups || []);
      }
      if (tr.ok) {
        const tData = await tr.json();
        const map: Record<string, any> = {};
        tData.forEach((t: any) => { map[t.group_id] = t; });
        setTracking(map);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (groupId: string) => {
    const t = tracking[groupId] || {};
    setForm({ currentCity: t.current_city || "Makkah", currentActivity: t.current_activity || "", nextActivity: t.next_activity || "", notes: t.notes || "", meetingPoint: t.meeting_point || "" });
    setEditing(groupId);
  };

  const handleSave = async (groupId: string) => {
    setSaving(groupId);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/group-tracking/${groupId}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (r.ok) {
        const d = await r.json();
        setTracking(t => ({ ...t, [groupId]: d }));
        setEditing(null);
        toast({ title: "Group status updated — customers will see this live" });
      } else toast({ title: "Failed to save", variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(null);
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Activity size={22} /> Live Group Tracking</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Set real-time group location & activity — visible to pilgrims on their dashboard</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5"><RefreshCw size={13} /> Refresh</Button>
        </div>

        {/* Info banner */}
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
          <p className="text-sm text-primary font-semibold">📡 Live Status</p>
          <p className="text-xs text-muted-foreground mt-0.5">Any update you make here is immediately visible to customers in their booking dashboard. Update regularly so pilgrims and families can stay informed.</p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading groups…</div>
        ) : groups.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Users size={36} className="mx-auto mb-2 opacity-30" />
            <p>No groups found. Create groups first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(g => {
              const t = tracking[g.id];
              const isEditing = editing === g.id;
              const cityColor = CITY_COLORS[t?.current_city] || "bg-gray-100 text-gray-600";
              return (
                <div key={g.id} className="rounded-2xl border bg-background overflow-hidden">
                  {/* Group header */}
                  <div className="px-4 py-3 flex items-center justify-between bg-muted/20 border-b">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                        {(g.group_name || g.name || "G").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-sm">{g.group_name || g.name || `Group ${g.id.slice(-4)}`}</p>
                        <p className="text-xs text-muted-foreground">{g.member_count || 0} pilgrims · Departs {g.departure_date ? new Date(g.departure_date).toLocaleDateString("en-IN") : "TBD"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {t?.current_city && <Badge variant="outline" className={`text-xs ${cityColor}`}><MapPin size={11} className="mr-1" />{t.current_city}</Badge>}
                      <Button size="sm" variant={isEditing ? "default" : "outline"} onClick={() => isEditing ? setEditing(null) : startEdit(g.id)} className="text-xs h-7 px-3">
                        {isEditing ? "Cancel" : "Update Status"}
                      </Button>
                    </div>
                  </div>

                  {/* Current status display */}
                  {!isEditing && t && (
                    <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Current City</p>
                        <p className="text-sm font-semibold mt-0.5">{t.current_city || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Current Activity</p>
                        <p className="text-sm font-semibold mt-0.5">{t.current_activity || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Next Activity</p>
                        <p className="text-sm font-semibold mt-0.5">{t.next_activity || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Meeting Point</p>
                        <p className="text-sm font-semibold mt-0.5">{t.meeting_point || "—"}</p>
                      </div>
                      {t.notes && (
                        <div className="col-span-full">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Notes</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.notes}</p>
                        </div>
                      )}
                      {t.updated_at && <p className="col-span-full text-[10px] text-muted-foreground">Last updated: {new Date(t.updated_at).toLocaleString("en-IN")}</p>}
                    </div>
                  )}

                  {!isEditing && !t && (
                    <div className="px-4 py-3 text-sm text-muted-foreground italic">No status set yet. Click "Update Status" to add live tracking.</div>
                  )}

                  {/* Edit form */}
                  {isEditing && (
                    <div className="px-4 py-4 space-y-3 border-t">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Current City</Label>
                          <select value={form.currentCity} onChange={e => setForm(f => ({ ...f, currentCity: e.target.value }))} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Current Activity</Label>
                          <select value={form.currentActivity} onChange={e => setForm(f => ({ ...f, currentActivity: e.target.value }))} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                            <option value="">— Select —</option>
                            {ACTIVITIES.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Next Activity</Label>
                          <select value={form.nextActivity} onChange={e => setForm(f => ({ ...f, nextActivity: e.target.value }))} className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm">
                            <option value="">— Select —</option>
                            {ACTIVITIES.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Meeting Point</Label>
                          <Input value={form.meetingPoint} onChange={e => setForm(f => ({ ...f, meetingPoint: e.target.value }))} placeholder="e.g. Hotel lobby 9:00 AM" className="h-9" />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <Label className="text-xs">Notes / Instructions for Pilgrims</Label>
                          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any important update for pilgrims…"
                            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button size="sm" onClick={() => handleSave(g.id)} disabled={saving === g.id} className="gap-1.5">
                          {saving === g.id ? <RefreshCw size={13} className="animate-spin" /> : <Activity size={13} />}
                          Save & Publish Live
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
