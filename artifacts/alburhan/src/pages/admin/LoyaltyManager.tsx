import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

interface LoyaltyMember {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_mobile: string;
  total_points: number;
  redeemed_points: number;
  available_points: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  bookings_count: number;
  total_spent: number;
  last_activity: string;
}

interface Stats {
  total_members: number;
  total_points_issued: number;
  total_points_redeemed: number;
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

const TIER_CONFIG = {
  bronze: { label: "Bronze", color: "bg-amber-100 text-amber-800 border-amber-200", icon: "🥉", min: 0, max: 499 },
  silver: { label: "Silver", color: "bg-slate-100 text-slate-700 border-slate-300", icon: "🥈", min: 500, max: 1999 },
  gold: { label: "Gold", color: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: "🥇", min: 2000, max: 4999 },
  platinum: { label: "Platinum", color: "bg-purple-100 text-purple-800 border-purple-300", icon: "💎", min: 5000, max: Infinity },
};

export default function LoyaltyManager() {
  const [members, setMembers] = useState<LoyaltyMember[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [awardModal, setAwardModal] = useState<LoyaltyMember | null>(null);
  const [awardPoints, setAwardPoints] = useState("");
  const [awardReason, setAwardReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [membersRes, statsRes] = await Promise.all([
        fetch(`${API}/api/loyalty`, { credentials: "include" }),
        fetch(`${API}/api/loyalty/stats`, { credentials: "include" }),
      ]);
      if (membersRes.ok) setMembers(await membersRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {}
    setLoading(false);
  };

  const syncLoyalty = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/loyalty/sync`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ type: "success", text: data.message || "Sync complete" });
        await loadAll();
      } else {
        setMsg({ type: "error", text: data.message || "Sync failed" });
      }
    } catch {
      setMsg({ type: "error", text: "Network error" });
    }
    setSyncing(false);
    setTimeout(() => setMsg(null), 3000);
  };

  const awardPointsToMember = async () => {
    if (!awardModal || !awardPoints) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/loyalty/award`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: awardModal.customer_id,
          customer_name: awardModal.customer_name,
          customer_mobile: awardModal.customer_mobile,
          points: parseInt(awardPoints),
          reason: awardReason || "Manual award",
          source: "admin",
        }),
      });
      if (res.ok) {
        setMsg({ type: "success", text: `${awardPoints} points awarded to ${awardModal.customer_name}` });
        setAwardModal(null);
        setAwardPoints("");
        setAwardReason("");
        await loadAll();
      } else {
        const d = await res.json();
        setMsg({ type: "error", text: d.message || "Failed to award points" });
      }
    } catch {
      setMsg({ type: "error", text: "Network error" });
    }
    setSaving(false);
    setTimeout(() => setMsg(null), 3000);
  };

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    const matchesSearch = !q || m.customer_name?.toLowerCase().includes(q) || m.customer_mobile?.includes(q);
    const matchesTier = tierFilter === "all" || m.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const tierProgress = (member: LoyaltyMember) => {
    const cfg = TIER_CONFIG[member.tier];
    const next = cfg.max === Infinity ? member.total_points : cfg.max;
    const pct = Math.min(100, ((member.total_points - cfg.min) / (next - cfg.min)) * 100);
    return pct;
  };

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Loyalty & Rewards</h1>
          <p className="text-slate-500 mt-1">Track repeat customers, reward points, tier status, and VIP benefits</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncLoyalty}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? "⏳ Syncing..." : "🔄 Sync from Bookings"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${msg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.type === "success" ? "✓" : "✗"} {msg.text}
        </div>
      )}

      {/* Tier Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center col-span-2 md:col-span-1 lg:col-span-1">
            <div className="text-2xl font-bold text-slate-800">{stats.total_members}</div>
            <div className="text-xs text-slate-500 mt-0.5">Total Members</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.total_points_issued.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-0.5">Points Issued</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.total_points_redeemed.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-0.5">Redeemed</div>
          </div>
          {(["bronze", "silver", "gold", "platinum"] as const).map(tier => (
            <div className={`border rounded-xl p-4 text-center ${TIER_CONFIG[tier].color}`}>
              <div className="text-xl">{TIER_CONFIG[tier].icon}</div>
              <div className="text-xl font-bold">{(stats as any)[tier]}</div>
              <div className="text-xs mt-0.5">{TIER_CONFIG[tier].label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Points Guide */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h3 className="font-semibold text-slate-700 mb-2 text-sm">Points System</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { icon: "📋", label: "Per Booking", pts: "+100 pts" },
            { icon: "💰", label: "Per ₹1,000 Paid", pts: "+10 pts" },
            { icon: "🔁", label: "Repeat Customer", pts: "+150 pts" },
            { icon: "📣", label: "Referral", pts: "+200 pts" },
          ].map(item => (
            <div className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2">
              <span className="text-base">{item.icon}</span>
              <div>
                <div className="font-medium text-slate-700">{item.pts}</div>
                <div className="text-slate-500">{item.label}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-3 flex-wrap text-xs text-slate-600">
          {(["bronze", "silver", "gold", "platinum"] as const).map(tier => (
            <span className={`px-2 py-0.5 rounded border font-medium ${TIER_CONFIG[tier].color}`}>
              {TIER_CONFIG[tier].icon} {TIER_CONFIG[tier].label}: {tier === "platinum" ? "5000+" : `${TIER_CONFIG[tier].min}–${TIER_CONFIG[tier].max}`} pts
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search customer..."
          value={search}
          onInput={(e: any) => setSearch(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-64"
        />
        <select
          value={tierFilter}
          onChange={(e: any) => setTierFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="all">All Tiers</option>
          <option value="platinum">💎 Platinum</option>
          <option value="gold">🥇 Gold</option>
          <option value="silver">🥈 Silver</option>
          <option value="bronze">🥉 Bronze</option>
        </select>
        <span className="ml-auto text-sm text-slate-500 self-center">{filtered.length} members</span>
      </div>

      {/* Members Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {["Customer", "Tier", "Points", "Available", "Bookings", "Total Spent", "Last Activity", "Actions"].map(h => (
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="text-slate-400 text-4xl mb-2">⭐</div>
                  <div className="text-slate-500 font-medium">No loyalty members yet</div>
                  <div className="text-slate-400 text-xs mt-1">Click "Sync from Bookings" to auto-calculate points for all customers</div>
                </td>
              </tr>
            ) : filtered.map(member => {
              const cfg = TIER_CONFIG[member.tier] || TIER_CONFIG.bronze;
              const progress = tierProgress(member);
              return (
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{member.customer_name || "—"}</div>
                    <div className="text-xs text-slate-500">{member.customer_mobile}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <div className="mt-1.5 w-20 bg-slate-200 rounded-full h-1">
                        <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-blue-600">{member.total_points.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-green-600">{(member.available_points || 0).toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{member.bookings_count}</td>
                  <td className="px-4 py-3 text-slate-700">₹{parseFloat(member.total_spent as any || 0).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {member.last_activity ? new Date(member.last_activity).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setAwardModal(member)}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100"
                    >
                      + Award
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Award Modal */}
      {awardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Award Points</h3>
            <p className="text-slate-500 text-sm mb-4">Awarding to: <strong>{awardModal.customer_name}</strong></p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Points to Award</label>
                <input
                  type="number"
                  value={awardPoints}
                  onInput={(e: any) => setAwardPoints(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={awardReason}
                  onInput={(e: any) => setAwardReason(e.target.value)}
                  placeholder="e.g. Early booking bonus"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setAwardModal(null); setAwardPoints(""); setAwardReason(""); }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={awardPointsToMember}
                disabled={saving || !awardPoints}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Awarding..." : "Award Points"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
