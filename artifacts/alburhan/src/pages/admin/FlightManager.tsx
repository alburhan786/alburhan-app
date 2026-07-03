import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Plane, Pencil, Trash2, ChevronDown, ChevronRight, ArrowRight, Users } from "lucide-react";
import { useParams } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

const FLIGHT_TYPES = [
  { value: "outbound", label: "Outbound (India → Saudi)", color: "bg-blue-100 text-blue-800" },
  { value: "return",   label: "Return (Saudi → India)",   color: "bg-green-100 text-green-800" },
  { value: "internal", label: "Internal (e.g. Jeddah → Madinah)", color: "bg-amber-100 text-amber-800" },
];

const STATUSES = [
  { value: "scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-800" },
  { value: "delayed",   label: "Delayed",   color: "bg-amber-100 text-amber-800" },
  { value: "departed",  label: "Departed",  color: "bg-purple-100 text-purple-800" },
  { value: "landed",    label: "Landed",    color: "bg-green-100 text-green-800" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-800" },
];

const MEAL_TYPES = ["Standard","Vegetarian","Vegan","Halal","Kosher","Child Meal","Diabetic","Low Fat"];

interface Flight {
  id: string;
  groupId: string;
  flightType: string;
  airline?: string | null;
  flightNumber?: string | null;
  pnr?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  baggageAllowance?: string | null;
  mealType?: string | null;
  status?: string | null;
  notes?: string | null;
  pilgrimsAssigned?: string[];
  ticketNumbers?: Record<string, string>;
  createdAt: string;
}

interface Group {
  id: string;
  name: string;
  type?: string | null;
  year?: string | null;
}

const EMPTY_FORM = {
  flightType: "outbound", airline: "", flightNumber: "", pnr: "",
  departureAirport: "", arrivalAirport: "", departureDate: "", departureTime: "",
  arrivalDate: "", arrivalTime: "", baggageAllowance: "23 kg", mealType: "Halal",
  status: "scheduled", notes: "",
};

const typeMap = Object.fromEntries(FLIGHT_TYPES.map(t => [t.value, t]));
const statusMap = Object.fromEntries(STATUSES.map(s => [s.value, s]));

export default function FlightManager() {
  const params = useParams<{ groupId?: string }>();
  const urlGroupId = params?.groupId;
  const { toast } = useToast();

  const [flights, setFlights] = useState<Flight[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("outbound");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formGroupId, setFormGroupId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [groupNameMap, setGroupNameMap] = useState<Record<string, string>>({});

  async function loadGroups() {
    try {
      const r = await fetch(`${API}/api/groups`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        const list: Group[] = Array.isArray(data) ? data : (data.groups || []);
        setGroups(list);
        const map: Record<string, string> = {};
        list.forEach(g => { map[g.id] = g.name; });
        setGroupNameMap(map);
      }
    } catch {}
  }

  async function load() {
    setLoading(true);
    try {
      const url = urlGroupId
        ? `${API}/api/flights?groupId=${urlGroupId}`
        : `${API}/api/flights`;
      const r = await fetch(url, { credentials: "include" });
      if (r.ok) setFlights(await r.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadGroups();
    load();
  }, [urlGroupId]);

  const shown = flights.filter(f => f.flightType === activeType);

  function openAdd() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, flightType: activeType });
    setFormGroupId(urlGroupId || "");
    setShowModal(true);
  }

  function openEdit(f: Flight) {
    setEditId(f.id);
    setForm({
      flightType: f.flightType,
      airline: f.airline || "",
      flightNumber: f.flightNumber || "",
      pnr: f.pnr || "",
      departureAirport: f.departureAirport || "",
      arrivalAirport: f.arrivalAirport || "",
      departureDate: f.departureDate || "",
      departureTime: f.departureTime || "",
      arrivalDate: f.arrivalDate || "",
      arrivalTime: f.arrivalTime || "",
      baggageAllowance: f.baggageAllowance || "23 kg",
      mealType: f.mealType || "Halal",
      status: f.status || "scheduled",
      notes: f.notes || "",
    });
    setFormGroupId(f.groupId || urlGroupId || "");
    setShowModal(true);
  }

  async function save() {
    const effectiveGroupId = urlGroupId || formGroupId;
    if (!effectiveGroupId) {
      toast({
        title: "Group required",
        description: "Please select a Hajj Group before adding a flight.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const body = { ...form, groupId: effectiveGroupId };
      const url = editId ? `${API}/api/flights/${editId}` : `${API}/api/flights`;
      const method = editId ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to save flight");
      }
      toast({ title: editId ? "Flight updated" : "Flight added" });
      setShowModal(false);
      await load();
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this flight segment?")) return;
    await fetch(`${API}/api/flights/${id}`, { method: "DELETE", credentials: "include" });
    toast({ title: "Deleted" });
    await load();
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const currentGroupName = urlGroupId ? (groupNameMap[urlGroupId] || urlGroupId) : null;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Flight Management</h1>
            <p className="text-sm text-muted-foreground">
              {currentGroupName ? (
                <span className="flex items-center gap-1.5">
                  <Users size={13} /> Group: <strong>{currentGroupName}</strong>
                </span>
              ) : "All groups"}
            </p>
          </div>
          <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openAdd}>
            <Plus size={14} className="mr-1.5" />Add Flight
          </Button>
        </div>

        {/* Type tabs */}
        <div className="flex gap-2 flex-wrap">
          {FLIGHT_TYPES.map(t => {
            const count = flights.filter(f => f.flightType === t.value).length;
            return (
              <button key={t.value} onClick={() => setActiveType(t.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${activeType === t.value ? "bg-[#0d5040] text-white border-[#0d5040]" : "bg-white text-gray-600 hover:border-[#0d5040]/40"}`}>
                <Plane size={13} />
                {t.label.split("(")[0].trim()}
                {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeType === t.value ? "bg-white/20" : "bg-muted"}`}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Flight cards */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-xl border">
            <Plane size={32} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-muted-foreground text-sm">No {FLIGHT_TYPES.find(t => t.value === activeType)?.label.split("(")[0]} flights yet</p>
            <Button size="sm" className="mt-3 bg-[#0d5040]" onClick={openAdd}>
              <Plus size={13} className="mr-1" />Add Flight
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map(f => {
              const isExp = expanded.has(f.id);
              const st = statusMap[f.status || "scheduled"];
              const typ = typeMap[f.flightType];
              return (
                <div key={f.id} className="bg-white rounded-xl border overflow-hidden">
                  <div className="p-4 flex items-start gap-4">
                    <div className="shrink-0 w-12 h-12 bg-[#0d5040]/10 rounded-xl flex items-center justify-center">
                      <Plane size={22} className="text-[#0d5040]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base">{f.airline || "—"}</span>
                        {f.flightNumber && <span className="text-sm text-muted-foreground">· {f.flightNumber}</span>}
                        {f.pnr && <Badge variant="outline" className="text-[10px] font-mono">PNR: {f.pnr}</Badge>}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st?.color || "bg-gray-100"}`}>{st?.label || f.status}</span>
                        {!urlGroupId && groupNameMap[f.groupId] && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0d5040]/10 text-[#0d5040] font-medium flex items-center gap-1">
                            <Users size={9} /> {groupNameMap[f.groupId]}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1.5 text-sm">
                        <span className="font-mono font-bold">{f.departureAirport || "—"}</span>
                        <ArrowRight size={14} className="text-muted-foreground" />
                        <span className="font-mono font-bold">{f.arrivalAirport || "—"}</span>
                      </div>

                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                        {f.departureDate && <span>Dep: <strong>{f.departureDate}</strong>{f.departureTime && ` ${f.departureTime}`}</span>}
                        {f.arrivalDate && <span>Arr: <strong>{f.arrivalDate}</strong>{f.arrivalTime && ` ${f.arrivalTime}`}</span>}
                        {f.baggageAllowance && <span>🧳 {f.baggageAllowance}</span>}
                        {f.mealType && <span>🍽️ {f.mealType}</span>}
                      </div>

                      {(f.pilgrimsAssigned?.length ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">👥 {f.pilgrimsAssigned!.length} pilgrims assigned</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleExpand(f.id)}>
                        {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(f)}>
                        <Pencil size={13} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => remove(f.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>

                  {isExp && (
                    <div className="border-t bg-muted/30 px-4 py-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div><span className="text-muted-foreground">Flight Type</span><p className="font-medium mt-0.5">{typ?.label.split("(")[0]}</p></div>
                      <div><span className="text-muted-foreground">Baggage</span><p className="font-medium mt-0.5">{f.baggageAllowance || "—"}</p></div>
                      <div><span className="text-muted-foreground">Meal</span><p className="font-medium mt-0.5">{f.mealType || "—"}</p></div>
                      <div><span className="text-muted-foreground">Status</span><p className="font-medium mt-0.5">{st?.label || f.status}</p></div>
                      {f.notes && <div className="col-span-full"><span className="text-muted-foreground">Notes</span><p className="mt-0.5">{f.notes}</p></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Flight" : "Add Flight"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">

            {/* Group selector — shown when NOT launched from a specific group */}
            {!urlGroupId && (
              <div>
                <label className="text-xs font-semibold text-[#0d5040] uppercase tracking-wide">
                  Hajj Group <span className="text-red-500">*</span>
                </label>
                {groups.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground italic">Loading groups…</p>
                ) : (
                  <select
                    value={formGroupId}
                    onChange={e => setFormGroupId(e.target.value)}
                    className={`mt-1 w-full h-9 px-2 rounded border text-sm bg-background ${!formGroupId ? "border-red-300" : "border-input"}`}
                  >
                    <option value="">— Select Hajj Group —</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name}{g.year ? ` (${g.year})` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {!formGroupId && (
                  <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                    ⚠ Please select a Hajj Group before adding a flight.
                  </p>
                )}
              </div>
            )}

            {/* Group label when launched from a group page */}
            {urlGroupId && currentGroupName && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d5040]/5 border border-[#0d5040]/20 text-sm">
                <Users size={14} className="text-[#0d5040]" />
                <span className="text-muted-foreground">Group:</span>
                <span className="font-semibold text-[#0d5040]">{currentGroupName}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-medium">Flight Type</label>
              <select value={form.flightType} onChange={e => setForm(f => ({...f, flightType: e.target.value}))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                {FLIGHT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Airline</label>
                <Input value={form.airline} onChange={e => setForm(f => ({...f, airline: e.target.value}))} placeholder="Air India, IndiGo…" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Flight Number</label>
                <Input value={form.flightNumber} onChange={e => setForm(f => ({...f, flightNumber: e.target.value}))} placeholder="AI-123" className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">PNR</label>
              <Input value={form.pnr} onChange={e => setForm(f => ({...f, pnr: e.target.value}))} placeholder="ABC123" className="mt-1 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Departure Airport</label>
                <Input value={form.departureAirport} onChange={e => setForm(f => ({...f, departureAirport: e.target.value}))} placeholder="BOM, DEL, HYD…" className="mt-1 font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium">Arrival Airport</label>
                <Input value={form.arrivalAirport} onChange={e => setForm(f => ({...f, arrivalAirport: e.target.value}))} placeholder="JED, MED, RUH…" className="mt-1 font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Departure Date</label>
                <Input type="date" value={form.departureDate} onChange={e => setForm(f => ({...f, departureDate: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Departure Time</label>
                <Input type="time" value={form.departureTime} onChange={e => setForm(f => ({...f, departureTime: e.target.value}))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Arrival Date</label>
                <Input type="date" value={form.arrivalDate} onChange={e => setForm(f => ({...f, arrivalDate: e.target.value}))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Arrival Time</label>
                <Input type="time" value={form.arrivalTime} onChange={e => setForm(f => ({...f, arrivalTime: e.target.value}))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Baggage Allowance</label>
                <Input value={form.baggageAllowance} onChange={e => setForm(f => ({...f, baggageAllowance: e.target.value}))} placeholder="23 kg" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Meal Type</label>
                <select value={form.mealType} onChange={e => setForm(f => ({...f, mealType: e.target.value}))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  {MEAL_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Any additional notes…" rows={2} className="mt-1 w-full rounded border px-3 py-2 text-sm resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-[#0d5040] hover:bg-[#0a3d30]"
                onClick={save}
                disabled={saving || (!urlGroupId && !formGroupId)}
                title={!urlGroupId && !formGroupId ? "Select a group first" : undefined}
              >
                {saving ? "Saving…" : editId ? "Update" : "Add Flight"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
