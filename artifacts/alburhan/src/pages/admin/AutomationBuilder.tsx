import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

type WorkflowRule = {
  trigger_type: string;
  enabled: boolean;
  channels: string[] | null;
  delay_minutes: number | null;
  stats: { total: number; completed: number; failed: number; last_run: string | null };
};

// ── Trigger catalogue with friendly metadata ───────────────────────────────
const TRIGGER_META: Record<string, { label: string; category: string; description: string; icon: string; defaultChannels: string[] }> = {
  // Bookings
  new_booking:              { label: "New Booking",          category: "Bookings", icon: "📋", description: "Fires when a customer submits a new booking request", defaultChannels: ["whatsapp","sms","email","dashboard"] },
  booking_approved:         { label: "Booking Approved",     category: "Bookings", icon: "✅", description: "Fires when admin approves a pending booking", defaultChannels: ["whatsapp","sms","email","dashboard"] },
  booking_rejected:         { label: "Booking Rejected",     category: "Bookings", icon: "❌", description: "Fires when admin rejects a booking", defaultChannels: ["whatsapp","sms","email"] },
  booking_completed:        { label: "Booking Completed",    category: "Bookings", icon: "🎉", description: "Fires when the journey is marked complete", defaultChannels: ["whatsapp","email","dashboard"] },
  // Payments
  payment_received:         { label: "Payment Received",     category: "Payments", icon: "💰", description: "Fires when any payment is recorded (cash, online, bank transfer)", defaultChannels: ["whatsapp","sms","email","dashboard"] },
  partial_payment_received: { label: "Partial Payment",      category: "Payments", icon: "💸", description: "Fires when a partial payment is received (balance remains)", defaultChannels: ["whatsapp","sms","dashboard"] },
  payment_reminder_30:      { label: "Balance Reminder 30d", category: "Payments", icon: "⏰", description: "Reminds customer about balance due 30 days before departure", defaultChannels: ["whatsapp","sms"] },
  payment_reminder_15:      { label: "Balance Reminder 15d", category: "Payments", icon: "⏰", description: "15 days before departure balance reminder", defaultChannels: ["whatsapp","sms"] },
  payment_reminder_7:       { label: "Balance Reminder 7d",  category: "Payments", icon: "⏰", description: "7 days before departure balance reminder", defaultChannels: ["whatsapp","sms","email"] },
  payment_reminder_3:       { label: "Balance Reminder 3d",  category: "Payments", icon: "🔔", description: "3 days before departure urgent balance reminder", defaultChannels: ["whatsapp","sms"] },
  payment_reminder_1:       { label: "Balance Reminder 1d",  category: "Payments", icon: "🚨", description: "Final 24h balance reminder", defaultChannels: ["whatsapp","sms","email"] },
  balance_overdue:          { label: "Balance Overdue",      category: "Payments", icon: "⚠️", description: "Balance is past due date — urgent notification", defaultChannels: ["whatsapp","sms","email"] },
  // Documents
  invoice_generated:        { label: "Invoice Generated",    category: "Documents", icon: "🧾", description: "Fires when an invoice is created or updated", defaultChannels: ["whatsapp","email","dashboard"] },
  agreement_generated:      { label: "Agreement Ready",      category: "Documents", icon: "📄", description: "Fires when agreement PDF is ready for signing", defaultChannels: ["whatsapp","sms","email"] },
  agreement_signed:         { label: "Agreement Signed",     category: "Documents", icon: "✍️", description: "Fires when customer digitally signs the agreement", defaultChannels: ["whatsapp","email","dashboard"] },
  passport_uploaded:        { label: "Passport Uploaded",    category: "Documents", icon: "🛂", description: "Fires when passport/document is uploaded by admin", defaultChannels: ["dashboard"] },
  document_reminder:        { label: "Document Reminder",    category: "Documents", icon: "📎", description: "Reminds customer to submit required documents", defaultChannels: ["whatsapp","sms"] },
  // Visa & Travel
  visa_approved:            { label: "Visa Approved",        category: "Travel", icon: "🌍", description: "Fires when visa status is marked approved", defaultChannels: ["whatsapp","sms","email","push","dashboard"] },
  visa_rejected:            { label: "Visa Rejected",        category: "Travel", icon: "🚫", description: "Fires when visa is rejected", defaultChannels: ["whatsapp","sms","email"] },
  ticket_issued:            { label: "Ticket Issued",        category: "Travel", icon: "✈️", description: "Fires when flight ticket is issued/uploaded", defaultChannels: ["whatsapp","email","push","dashboard"] },
  flight_assigned:          { label: "Flight Assigned",      category: "Travel", icon: "🛫", description: "Fires when flight details are assigned to a booking", defaultChannels: ["whatsapp","email","dashboard"] },
  hotel_assigned:           { label: "Hotel Assigned",       category: "Travel", icon: "🏨", description: "Fires when hotel is assigned to the pilgrim", defaultChannels: ["whatsapp","email","dashboard"] },
  room_allocation:          { label: "Room Allocated",       category: "Travel", icon: "🚪", description: "Fires when specific room number is allocated", defaultChannels: ["whatsapp","dashboard"] },
  bus_assigned:             { label: "Bus Assigned",         category: "Travel", icon: "🚌", description: "Fires when bus/transport is assigned", defaultChannels: ["whatsapp","dashboard"] },
  // Departure Reminders
  departure_reminder_7d:    { label: "Departure -7 Days",    category: "Reminders", icon: "📅", description: "7 days before departure reminder", defaultChannels: ["whatsapp","sms"] },
  departure_reminder_3d:    { label: "Departure -3 Days",    category: "Reminders", icon: "📅", description: "3 days before departure reminder", defaultChannels: ["whatsapp","sms","email"] },
  departure_reminder_2d:    { label: "Departure -2 Days",    category: "Reminders", icon: "📅", description: "2 days before departure reminder", defaultChannels: ["whatsapp","sms"] },
  departure_reminder_1d:    { label: "Departure -1 Day",     category: "Reminders", icon: "🔔", description: "24 hours before departure reminder", defaultChannels: ["whatsapp","sms","email","push"] },
  departure_reminder_12h:   { label: "Departure -12 Hours",  category: "Reminders", icon: "🔔", description: "12 hours before departure final call", defaultChannels: ["whatsapp","sms"] },
  departure_reminder_6h:    { label: "Departure -6 Hours",   category: "Reminders", icon: "🚨", description: "6 hours before departure — very urgent", defaultChannels: ["whatsapp","sms","push"] },
  departure_reminder_3h:    { label: "Departure -3 Hours",   category: "Reminders", icon: "🚨", description: "3 hours before departure — airport time", defaultChannels: ["whatsapp","sms","push"] },
  // Journey milestones
  welcome_saudi:            { label: "Welcome to Saudi",     category: "Journey", icon: "🕌", description: "Fires when pilgrim arrives in Saudi Arabia", defaultChannels: ["whatsapp","push"] },
  arrival_india:            { label: "Arrived Back India",   category: "Journey", icon: "🏠", description: "Fires when pilgrim lands back in India", defaultChannels: ["whatsapp","push"] },
  hajj_mubarak:             { label: "Hajj Mubarak",         category: "Journey", icon: "🌙", description: "Hajj Mubarak congratulations message", defaultChannels: ["whatsapp","sms"] },
  return_reminder:          { label: "Return Flight",        category: "Journey", icon: "🛬", description: "Return journey details reminder", defaultChannels: ["whatsapp","sms"] },
  feedback_request:         { label: "Feedback Request",     category: "Journey", icon: "⭐", description: "Post-journey feedback request", defaultChannels: ["whatsapp","email"] },
  // Emergency
  medical_emergency:        { label: "Medical Emergency",    category: "Emergency", icon: "🚑", description: "Medical emergency alert to family and admin", defaultChannels: ["whatsapp","sms","push","email"] },
};

const CATEGORIES = ["Bookings","Payments","Documents","Travel","Reminders","Journey","Emergency"];
const CHANNELS   = ["whatsapp","sms","email","push","rcs","dashboard"];

function ChannelToggle({ ch, enabled, onChange }: { ch: string; enabled: boolean; onChange: (v: boolean) => void }) {
  const icons: Record<string,string> = { whatsapp:"💬", sms:"📱", email:"📧", push:"🔔", rcs:"📡", dashboard:"🖥️" };
  return (
    <button onClick={() => onChange(!enabled)} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
      enabled ? "bg-blue-100 text-blue-800 border border-blue-300" : "bg-gray-100 text-gray-400 border border-gray-200"
    }`}>
      {icons[ch] || "📨"} {ch}
    </button>
  );
}

export default function AutomationBuilder() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const [rules, setRules]       = useState<WorkflowRule[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null);
  const [category, setCategory] = useState("All");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Local edits state
  const [edits, setEdits] = useState<Record<string, Partial<WorkflowRule>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/comms/workflows`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        const rulesArr: WorkflowRule[] = d.rules || [];
        // Add any triggers from catalogue that aren't yet in DB
        const existing = new Set(rulesArr.map(r => r.trigger_type));
        for (const t of Object.keys(TRIGGER_META)) {
          if (!existing.has(t)) {
            rulesArr.push({ trigger_type: t, enabled: true, channels: TRIGGER_META[t].defaultChannels, delay_minutes: 0, stats: { total: 0, completed: 0, failed: 0, last_run: null } });
          }
        }
        setRules(rulesArr);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (trigger: string) => {
    const edit = edits[trigger];
    if (!edit) return;
    setSaving(trigger);
    try {
      const current = rules.find(r => r.trigger_type === trigger);
      const payload = { enabled: edit.enabled ?? current?.enabled ?? true, channels: edit.channels ?? current?.channels, delay_minutes: edit.delay_minutes ?? current?.delay_minutes };
      const r = await fetch(`${API}/api/comms/workflows/${trigger}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        toast({ title: "Workflow saved", description: `${TRIGGER_META[trigger]?.label || trigger} updated` });
        setEdits(p => { const n = { ...p }; delete n[trigger]; return n; });
        load();
      } else {
        toast({ title: "Save failed", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(null);
  };

  const toggleEnabled = (trigger: string, val: boolean) => {
    setRules(prev => prev.map(r => r.trigger_type === trigger ? { ...r, enabled: val } : r));
    setEdits(p => ({ ...p, [trigger]: { ...p[trigger], enabled: val } }));
  };

  const toggleChannel = (trigger: string, ch: string, val: boolean) => {
    setRules(prev => prev.map(r => {
      if (r.trigger_type !== trigger) return r;
      const chs = r.channels || TRIGGER_META[trigger]?.defaultChannels || [];
      return { ...r, channels: val ? [...chs.filter(c => c !== ch), ch] : chs.filter(c => c !== ch) };
    }));
    const current = rules.find(r => r.trigger_type === trigger);
    const chs = current?.channels || TRIGGER_META[trigger]?.defaultChannels || [];
    setEdits(p => ({ ...p, [trigger]: { ...p[trigger], channels: val ? [...chs.filter(c => c !== ch), ch] : chs.filter(c => c !== ch) } }));
  };

  const filtered = rules.filter(r => {
    const meta = TRIGGER_META[r.trigger_type];
    if (category !== "All" && meta?.category !== category) return false;
    if (search && !r.trigger_type.includes(search.toLowerCase()) && !meta?.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const enabledCount  = rules.filter(r => r.enabled).length;
  const disabledCount = rules.filter(r => !r.enabled).length;

  if (!can("system:health")) {
    return <AdminLayout><div className="p-8 text-gray-500">Access restricted.</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="p-5 max-w-6xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Automation Builder</h1>
            <p className="text-gray-500 text-sm mt-0.5">Configure which events trigger which communication channels — no code required</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span><span className="text-green-700 font-bold">{enabledCount}</span> active</span>
            <span><span className="text-gray-400 font-bold">{disabledCount}</span> paused</span>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <strong>How it works:</strong> When an ERP event fires (e.g. "New Booking"), the Automation Engine checks which channels are enabled and sends notifications through the active providers. Toggle switches to enable/disable. Check boxes to add/remove channels.
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search workflows..."
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          {["All", ...CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                category === cat ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}>{cat}</button>
          ))}
        </div>

        {/* Workflow list */}
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading workflows...</div>
        ) : (
          <div className="space-y-2">
            {CATEGORIES.filter(cat => category === "All" || category === cat).map(cat => {
              const catRules = filtered.filter(r => (TRIGGER_META[r.trigger_type]?.category || "Other") === cat);
              if (catRules.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1.5 mt-3">{cat}</div>
                  <div className="space-y-1.5">
                    {catRules.map(rule => {
                      const meta    = TRIGGER_META[rule.trigger_type] || { label: rule.trigger_type, icon: "⚙️", description: "", defaultChannels: [] };
                      const isOpen  = expanded === rule.trigger_type;
                      const isDirty = !!edits[rule.trigger_type];
                      const channels = rule.channels || meta.defaultChannels;
                      return (
                        <div key={rule.trigger_type} className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${rule.enabled ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                          {/* Row header */}
                          <div className="flex items-center gap-3 px-4 py-3">
                            {/* Enable toggle */}
                            <button onClick={() => toggleEnabled(rule.trigger_type, !rule.enabled)}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-colors ${
                                rule.enabled ? "bg-blue-600 border-blue-600" : "bg-gray-200 border-gray-200"
                              }`}>
                              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${rule.enabled ? "translate-x-4" : "translate-x-0"}`} />
                            </button>

                            <span className="text-xl">{meta.icon}</span>

                            <div className="flex-1 min-w-0" onClick={() => setExpanded(isOpen ? null : rule.trigger_type)}>
                              <div className="font-medium text-gray-800 text-sm cursor-pointer">{meta.label}</div>
                              <div className="text-xs text-gray-400 truncate">{meta.description}</div>
                            </div>

                            {/* Channels preview */}
                            <div className="hidden md:flex gap-1 flex-wrap">
                              {CHANNELS.map(ch => {
                                const active = channels.includes(ch);
                                return (
                                  <span key={ch} className={`text-xs px-1.5 py-0.5 rounded ${active && rule.enabled ? "bg-blue-100 text-blue-700" : "text-gray-200"}`}>
                                    {ch === "whatsapp" ? "💬" : ch === "sms" ? "📱" : ch === "email" ? "📧" : ch === "push" ? "🔔" : ch === "rcs" ? "📡" : "🖥️"}
                                  </span>
                                );
                              })}
                            </div>

                            {/* Stats badge */}
                            {rule.stats.total > 0 && (
                              <Badge className="bg-gray-100 text-gray-600 text-xs hidden lg:flex">
                                {rule.stats.completed}/{rule.stats.total}
                              </Badge>
                            )}

                            {isDirty && (
                              <Button onClick={() => save(rule.trigger_type)} disabled={saving === rule.trigger_type}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg">
                                {saving === rule.trigger_type ? "Saving..." : "Save"}
                              </Button>
                            )}

                            <button onClick={() => setExpanded(isOpen ? null : rule.trigger_type)} className="text-gray-400 hover:text-gray-600 text-sm">
                              {isOpen ? "▲" : "▼"}
                            </button>
                          </div>

                          {/* Expanded config */}
                          {isOpen && (
                            <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Channel selector */}
                                <div>
                                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Notification Channels</div>
                                  <div className="flex flex-wrap gap-2">
                                    {CHANNELS.map(ch => (
                                      <ChannelToggle key={ch} ch={ch} enabled={channels.includes(ch)}
                                        onChange={val => toggleChannel(rule.trigger_type, ch, val)} />
                                    ))}
                                  </div>
                                  <div className="text-xs text-gray-400 mt-2">
                                    Channels are tried in order: WhatsApp → SMS → Email → Push. If one fails, the next is tried.
                                  </div>
                                </div>

                                {/* Stats */}
                                <div>
                                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Execution Stats (30d)</div>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between"><span className="text-gray-500">Total runs</span><span className="font-medium">{rule.stats.total}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="font-medium text-green-700">{rule.stats.completed}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Failed</span><span className={`font-medium ${rule.stats.failed > 0 ? "text-red-600" : "text-green-700"}`}>{rule.stats.failed}</span></div>
                                    {rule.stats.last_run && (
                                      <div className="flex justify-between"><span className="text-gray-500">Last run</span><span className="text-gray-600 text-xs">{new Date(rule.stats.last_run).toLocaleString("en-IN")}</span></div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Internal trigger name */}
                              <div className="mt-3 flex items-center gap-2">
                                <span className="text-xs text-gray-400">Trigger ID:</span>
                                <code className="text-xs bg-gray-200 px-2 py-0.5 rounded font-mono text-gray-700">{rule.trigger_type}</code>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
