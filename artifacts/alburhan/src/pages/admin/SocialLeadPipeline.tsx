import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";

const API = import.meta.env.VITE_API_URL || "";

const STEPS = [
  { key: "step_enquiry",   label: "Enquiry",       icon: "📩", desc: "FB/IG message received" },
  { key: "step_dup_check", label: "Dedup",         icon: "🔍", desc: "Duplicate check passed" },
  { key: "step_assigned",  label: "Assigned",      icon: "👤", desc: "Executive assigned" },
  { key: "step_followup",  label: "Follow-up",     icon: "📋", desc: "Follow-up sequence created" },
  { key: "step_inbox",     label: "Inbox",         icon: "💬", desc: "In Omnichannel Inbox" },
  { key: "step_c360",      label: "Customer 360",  icon: "🧠", desc: "Profile updated" },
  { key: "step_booking",   label: "Booking",       icon: "✈️", desc: "Converted to booking" },
  { key: "step_analytics", label: "Analytics",     icon: "📊", desc: "Attribution tracked" },
];

const PLATFORM_COLORS: Record<string, string> = {
  facebook_page:      "bg-blue-100 text-blue-700",
  facebook_leads:     "bg-blue-100 text-blue-700",
  facebook_ads:       "bg-blue-100 text-blue-700",
  facebook_messenger: "bg-indigo-100 text-indigo-700",
  instagram:          "bg-pink-100 text-pink-700",
  instagram_dm:       "bg-pink-100 text-pink-700",
  messenger:          "bg-indigo-100 text-indigo-700",
};
const PLATFORM_LABELS: Record<string, string> = {
  facebook_page:      "FB Page",
  facebook_leads:     "FB Leads",
  facebook_ads:       "FB Ads",
  facebook_messenger: "Messenger",
  instagram:          "Instagram",
  instagram_dm:       "IG DM",
  messenger:          "Messenger",
};

const SCORE_COLORS: Record<string, string> = {
  hot:  "bg-red-100 text-red-700",
  warm: "bg-yellow-100 text-yellow-700",
  cold: "bg-blue-100 text-blue-700",
};

function PipelineBar({ lead }: { lead: any }) {
  const done = STEPS.filter(s => lead[s.key]).length;
  const pct = Math.round((done / STEPS.length) * 100);
  const color =
    pct === 100 ? "bg-green-500" :
    pct >= 62   ? "bg-blue-500" :
    pct >= 37   ? "bg-yellow-500" : "bg-gray-300";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{done}/{STEPS.length}</span>
    </div>
  );
}

function StepDots({ lead }: { lead: any }) {
  return (
    <div className="flex gap-1">
      {STEPS.map(s => (
        <div
          key={s.key}
          title={`${s.label}: ${lead[s.key] ? "✓" : "Pending"}`}
          className={`w-3 h-3 rounded-full ${lead[s.key] ? "bg-green-500" : "bg-gray-200"}`}
        />
      ))}
    </div>
  );
}

function ConvertModal({ lead, onClose, onConverted }: { lead: any; onClose: () => void; onConverted: () => void }) {
  const [packages, setPackages] = useState<any[]>([]);
  const [packageId, setPackageId] = useState("");
  const [amount, setAmount] = useState("");
  const [travellers, setTravellers] = useState("1");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`${API}/api/packages?limit=50`, { credentials: "include" })
      .then(r => r.json()).then(d => setPackages(d.packages || d.data || [])).catch(() => {});
  }, []);

  async function convert() {
    if (!packageId) { setErr("Select a package"); return; }
    if (!amount || isNaN(Number(amount))) { setErr("Enter a valid amount"); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch(`${API}/api/leads/${lead.id}/convert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_id: packageId,
          total_amount: Number(amount),
          num_travellers: Number(travellers),
          notes: `Converted from ${lead.platform || lead.source} enquiry`,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Conversion failed");
      onConverted();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-1">Convert to Booking</h2>
        <p className="text-sm text-gray-500 mb-4">Lead: <strong>{lead.name}</strong></p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Package</label>
            <select
              value={packageId}
              onChange={e => setPackageId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select package…</option>
              {packages.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} — ₹{p.price?.toLocaleString()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Total Amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Enter total amount"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Travellers</label>
            <input
              type="number"
              min="1"
              value={travellers}
              onChange={e => setTravellers(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {err && <p className="text-red-600 text-sm mt-3">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button
            onClick={convert}
            disabled={saving}
            className="flex-1 bg-green-600 text-white rounded-lg py-2 font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Converting…" : "✅ Convert to Booking"}
          </button>
          <button
            onClick={onClose}
            className="px-4 border rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadDrawer({ lead, onClose, onRefresh }: { lead: any; onClose: () => void; onRefresh: () => void }) {
  const [showConvert, setShowConvert] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [loadingAct, setLoadingAct] = useState(true);

  useEffect(() => {
    if (!lead) return;
    Promise.all([
      fetch(`${API}/api/crm/leads/${lead.id}/activities`, { credentials: "include" }).then(r => r.json()).catch(() => ({ activities: [] })),
      fetch(`${API}/api/crm/leads/${lead.id}/followups`, { credentials: "include" }).then(r => r.json()).catch(() => ({ followups: [] })),
    ]).then(([a, f]) => {
      setActivities(a.activities || []);
      setFollowups(f.followups || []);
    }).finally(() => setLoadingAct(false));
  }, [lead]);

  const pctDone = STEPS.filter(s => lead[s.key]).length;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">{lead.name}</h2>
            <p className="text-sm text-gray-500">{lead.lead_number || lead.id} · {lead.mobile || "No mobile"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-6">
          {/* Pipeline progress */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-gray-700">Pipeline Progress</h3>
              <span className="text-sm font-medium text-blue-600">{pctDone}/{STEPS.length} steps complete</span>
            </div>
            <div className="space-y-2">
              {STEPS.map((s, i) => {
                const done = lead[s.key];
                return (
                  <div key={s.key} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${done ? "bg-green-50" : "bg-gray-50"}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${done ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                      {done ? "✓" : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${done ? "text-green-700" : "text-gray-500"}`}>{s.icon} {s.label}</p>
                      <p className="text-xs text-gray-400">{s.desc}</p>
                    </div>
                    {done && <span className="text-green-600 text-xs font-medium">Done</span>}
                    {!done && <span className="text-gray-400 text-xs">Pending</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lead details */}
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Source</span><p className="font-medium capitalize">{lead.source || "—"}</p></div>
            <div><span className="text-gray-500">Platform</span><p className="font-medium">{PLATFORM_LABELS[lead.platform] || lead.platform || "—"}</p></div>
            <div><span className="text-gray-500">Score</span><p className="font-medium capitalize">{lead.score || "cold"}</p></div>
            <div><span className="text-gray-500">Stage</span><p className="font-medium capitalize">{(lead.pipeline_stage || "new_lead").replace(/_/g, " ")}</p></div>
            <div><span className="text-gray-500">Assigned To</span><p className="font-medium">{lead.assigned_name || "Unassigned"}</p></div>
            <div><span className="text-gray-500">Messages</span><p className="font-medium">{lead.conversation_count || 0}</p></div>
            {lead.campaign_name && <div className="col-span-2"><span className="text-gray-500">Campaign</span><p className="font-medium">{lead.campaign_name}</p></div>}
            {lead.facebook_name && <div><span className="text-gray-500">FB Name</span><p className="font-medium">{lead.facebook_name}</p></div>}
            {lead.instagram_username && <div><span className="text-gray-500">IG Handle</span><p className="font-medium">@{lead.instagram_username}</p></div>}
          </div>

          {/* Follow-ups */}
          {followups.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Follow-ups ({followups.length})</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {followups.slice(0, 5).map((f: any) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs bg-blue-50 rounded-lg px-3 py-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${f.status === "completed" ? "bg-green-500" : f.status === "pending" ? "bg-yellow-500" : "bg-gray-300"}`} />
                    <span className="flex-1 text-gray-700 truncate">{f.title?.replace("LD-SEQ-", "").replace(/_/g, " ")}</span>
                    <span className="text-gray-400">{f.due_at ? new Date(f.due_at).toLocaleDateString() : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent activity */}
          {!loadingAct && activities.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Activity Timeline</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activities.slice(0, 8).map((a: any) => (
                  <div key={a.id} className="flex gap-2 text-xs">
                    <span className="text-gray-400 w-20 flex-shrink-0">{new Date(a.created_at).toLocaleDateString()}</span>
                    <span className="text-gray-600">{a.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            {!lead.step_booking && (
              <button
                onClick={() => setShowConvert(true)}
                className="w-full bg-green-600 text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-green-700"
              >
                ✈️ Convert to Booking
              </button>
            )}
            {lead.step_booking && (
              <div className="w-full bg-green-50 text-green-700 rounded-xl py-2.5 font-semibold text-sm text-center border border-green-200">
                ✅ Already Converted to Booking
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`/admin/inbox?lead=${lead.id}`}
                className="text-center border rounded-xl py-2 text-sm font-medium hover:bg-gray-50"
              >
                💬 Open in Inbox
              </a>
              <a
                href={`/admin/customer360?lead=${lead.id}`}
                className="text-center border rounded-xl py-2 text-sm font-medium hover:bg-gray-50"
              >
                🧠 Customer 360
              </a>
            </div>
            <a
              href={`/admin/crm?lead=${lead.id}`}
              className="block text-center border rounded-xl py-2 text-sm font-medium hover:bg-gray-50"
            >
              📊 Open in CRM
            </a>
          </div>
        </div>
      </div>

      {showConvert && (
        <ConvertModal
          lead={lead}
          onClose={() => setShowConvert(false)}
          onConverted={() => { setShowConvert(false); onRefresh(); onClose(); }}
        />
      )}
    </>
  );
}

export default function SocialLeadPipeline() {
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, assigned: 0, with_followup: 0, converted: 0, today: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState({ platform: "all", status: "all", search: "" });

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/social-media/lead-pipeline`, { credentials: "include" });
      const d = await r.json();
      setLeads(d.leads || []);
      setStats(d.stats || { total: 0, assigned: 0, with_followup: 0, converted: 0, today: 0 });
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = leads.filter(l => {
    if (filter.platform !== "all" && l.platform !== filter.platform && l.source !== filter.platform) return false;
    if (filter.status === "converted" && !l.step_booking) return false;
    if (filter.status === "pending" && l.step_booking) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!l.name?.toLowerCase().includes(q) && !l.mobile?.includes(q) && !l.facebook_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Social Lead Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">End-to-end journey: Facebook/Instagram enquiry → CRM → Follow-up → Booking</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "Total Leads",    value: stats.total,       color: "text-gray-900",  bg: "bg-white" },
            { label: "Today",          value: stats.today,       color: "text-blue-600",  bg: "bg-blue-50" },
            { label: "Assigned",       value: stats.assigned,    color: "text-indigo-600",bg: "bg-indigo-50" },
            { label: "With Follow-up", value: stats.with_followup, color: "text-yellow-700", bg: "bg-yellow-50" },
            { label: "Converted",      value: stats.converted,   color: "text-green-700", bg: "bg-green-50" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 border`}>
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Pipeline legend */}
        <div className="bg-white rounded-xl border p-4 mb-5 overflow-x-auto">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Pipeline Steps</p>
          <div className="flex items-center gap-0 min-w-max">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center">
                <div className="flex flex-col items-center text-center px-2">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-lg mb-1">{s.icon}</div>
                  <p className="text-xs font-medium text-gray-700 whitespace-nowrap">{s.label}</p>
                  <p className="text-xs text-gray-400 whitespace-nowrap">{s.desc}</p>
                </div>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-gray-300 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            placeholder="Search name / mobile…"
            value={filter.search}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm w-52"
          />
          <select
            value={filter.platform}
            onChange={e => setFilter(f => ({ ...f, platform: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Platforms</option>
            <option value="facebook_page">Facebook Page</option>
            <option value="facebook_leads">Facebook Leads</option>
            <option value="facebook_messenger">Messenger</option>
            <option value="instagram">Instagram</option>
            <option value="instagram_dm">Instagram DM</option>
          </select>
          <select
            value={filter.status}
            onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="pending">Not Converted</option>
            <option value="converted">Converted</option>
          </select>
          <button onClick={load} className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50">↻ Refresh</button>
        </div>

        {/* Lead table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p className="font-medium">No social leads yet</p>
              <p className="text-sm mt-1">Facebook/Instagram enquiries will appear here automatically</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Lead</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Platform</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Score</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Assigned</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[220px]">Pipeline</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Steps</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(lead => (
                    <tr
                      key={lead.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelected(lead)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-[160px]">{lead.name}</p>
                        <p className="text-gray-400 text-xs">{lead.mobile || lead.facebook_name || "—"}</p>
                        {lead.lead_number && <p className="text-gray-400 text-xs">{lead.lead_number}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_COLORS[lead.platform] || "bg-gray-100 text-gray-600"}`}>
                          {PLATFORM_LABELS[lead.platform] || lead.platform || lead.source || "—"}
                        </span>
                        {lead.campaign_name && (
                          <p className="text-gray-400 text-xs mt-0.5 truncate max-w-[100px]">{lead.campaign_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${SCORE_COLORS[lead.score] || "bg-gray-100 text-gray-500"}`}>
                          {lead.score || "cold"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.step_assigned ? (
                          <p className="text-gray-700 text-xs">{lead.assigned_name || "—"}</p>
                        ) : (
                          <span className="text-gray-400 text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <PipelineBar lead={lead} />
                      </td>
                      <td className="px-4 py-3">
                        <StepDots lead={lead} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(lead); }}
                          className="text-blue-600 text-xs font-medium hover:underline"
                        >
                          View →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3 text-right">Showing {filtered.length} of {leads.length} social leads</p>
      </div>

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onRefresh={load}
        />
      )}
    </AdminLayout>
  );
}
