import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

export default function GroupOpsCenter() {
  const [tab, setTab] = useState<"tent" | "rooms" | "manifest" | "broadcast">("tent");
  const [groupId, setGroupId] = useState("");
  const [tentAllocations, setTentAllocations] = useState<any[]>([]);
  const [roomMatrix, setRoomMatrix] = useState<any>(null);
  const [manifestData, setManifestData] = useState<any>(null);
  const [broadcastLogs, setBroadcastLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [stats, setStats] = useState<any>(null);

  // Tent allocation form
  const [pilgrimId, setPilgrimId] = useState("");
  const [minacamp, setMinacamp] = useState("");
  const [tentNum, setTentNum] = useState("");
  const [bedNum, setBedNum] = useState("");
  const [maktabNum, setMaktabNum] = useState("");
  const [maktabName, setMaktabName] = useState("");
  const [maktabArea, setMaktabArea] = useState("");
  const [arafatCamp, setArafatCamp] = useState("");
  const [allocNotes, setAllocNotes] = useState("");

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 5000); };

  async function loadTentAllocations() {
    if (!groupId.trim()) return;
    setLoading(true);
    try { const r = await fetch(`${API}/api/group-ops/tent-allocations/${groupId}`, { credentials: "include" }); if (r.ok) setTentAllocations(await r.json()); }
    finally { setLoading(false); }
  }

  async function loadRoomMatrix() {
    if (!groupId.trim()) return;
    const r = await fetch(`${API}/api/group-ops/room-sharing/${groupId}`, { credentials: "include" });
    if (r.ok) setRoomMatrix(await r.json());
  }

  async function loadManifest() {
    if (!groupId.trim()) return;
    setLoading(true);
    try { const r = await fetch(`${API}/api/group-ops/manifest/${groupId}`, { credentials: "include" }); if (r.ok) setManifestData(await r.json()); else flash("❌ Failed to load manifest"); }
    finally { setLoading(false); }
  }

  async function loadBroadcastLogs() {
    if (!groupId.trim()) return;
    const r = await fetch(`${API}/api/group-ops/broadcast-logs/${groupId}`, { credentials: "include" });
    if (r.ok) setBroadcastLogs(await r.json());
  }

  async function loadStats() { const r = await fetch(`${API}/api/group-ops/stats`, { credentials: "include" }); if (r.ok) setStats(await r.json()); }

  useEffect(() => { loadStats(); }, []);

  async function handleLoad() {
    if (tab === "tent") await loadTentAllocations();
    else if (tab === "rooms") await loadRoomMatrix();
    else if (tab === "manifest") await loadManifest();
    else { await loadBroadcastLogs(); }
  }

  async function submitAllocation() {
    const r = await fetch(`${API}/api/group-ops/tent-allocations`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId, pilgrim_id: pilgrimId, mina_camp: minacamp, tent_number: tentNum, bed_number: bedNum, maktab_number: maktabNum, maktab_name: maktabName, maktab_area: maktabArea, arafat_camp: arafatCamp, notes: allocNotes }),
    });
    if (r.ok) { flash("✅ Allocation saved"); setShowForm(false); setPilgrimId(""); setTentNum(""); setBedNum(""); loadTentAllocations(); }
    else flash("❌ Failed to save allocation");
  }

  async function doBroadcast() {
    if (!groupId.trim() || !broadcastMsg.trim()) { flash("❌ Group ID and message required"); return; }
    setBroadcasting(true);
    try {
      const r = await fetch(`${API}/api/group-ops/broadcast/${groupId}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: broadcastMsg }) });
      const d = await r.json();
      flash(`✅ Sent to ${d.sent} pilgrims${d.failed ? ` (${d.failed} failed)` : ""}`);
      setBroadcastMsg("");
      await loadBroadcastLogs();
    } finally { setBroadcasting(false); }
  }

  async function deleteAllocation(id: string) {
    const r = await fetch(`${API}/api/group-ops/tent-allocations/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { flash("✅ Allocation removed"); loadTentAllocations(); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🕌 Group Operations Center</h1>
            <p className="text-sm text-gray-500 mt-1">Tent/Maktab allocations, room sharing matrix, manifest & broadcast</p>
          </div>
          {tab === "tent" && groupId && <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Allocate Pilgrim</button>}
        </div>
        {msg && <div className="mt-2 p-3 bg-green-50 text-green-800 rounded-lg text-sm">{msg}</div>}
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4 px-6 py-4">
          {[
            { label: "Tent Allocations", value: String(stats.tents?.allocated ?? 0), icon: "⛺" },
            { label: "Groups with Tents", value: String(stats.tents?.groups ?? 0), icon: "👥" },
            { label: "Maktabs Assigned", value: String(stats.maktabs?.total ?? 0), icon: "🕌" },
            { label: "Total Rooms", value: String(stats.rooms?.total_rooms ?? 0), icon: "🛏️" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1"><span className="text-xl">{k.icon}</span><span className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</span></div>
              <div className="text-2xl font-bold text-gray-900">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="px-6">
        {/* Group ID Input */}
        <div className="bg-white rounded-xl border shadow-sm p-4 mb-4 flex gap-3">
          <input value={groupId} onChange={e => setGroupId(e.target.value)} placeholder="Enter Group ID (Hajj Group UUID)" className="border rounded-lg px-3 py-2 text-sm flex-1" />
          <button onClick={handleLoad} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700">🔍 Load Group Data</button>
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
          {(["tent", "rooms", "manifest", "broadcast"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"}`}>
              {t === "tent" ? "⛺ Tent/Maktab" : t === "rooms" ? "🛏️ Room Matrix" : t === "manifest" ? "📋 Manifest" : "📢 Broadcast"}
            </button>
          ))}
        </div>

        {/* Tent Allocations */}
        {tab === "tent" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{["Pilgrim", "Mobile", "Camp", "Tent", "Bed", "Maktab #", "Maktab Name", "Area", "Actions"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {tentAllocations.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium">{a.pilgrim_name || a.pilgrim_id}</td>
                    <td className="px-3 py-3 text-gray-500">{a.mobile_india || "—"}</td>
                    <td className="px-3 py-3">{a.mina_camp || "—"}</td>
                    <td className="px-3 py-3 font-mono">{a.tent_number || "—"}</td>
                    <td className="px-3 py-3 font-mono">{a.bed_number || "—"}</td>
                    <td className="px-3 py-3 font-mono text-indigo-600">{a.maktab_number || "—"}</td>
                    <td className="px-3 py-3">{a.maktab_name || "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{a.maktab_area || "—"}</td>
                    <td className="px-3 py-3"><button onClick={() => deleteAllocation(a.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">Remove</button></td>
                  </tr>
                ))}
                {!loading && tentAllocations.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">{groupId ? "No tent allocations for this group" : "Enter a Group ID above"}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Room Sharing Matrix */}
        {tab === "rooms" && (
          <div className="space-y-4">
            {roomMatrix?.rooms?.map((room: any, i: number) => (
              <div key={i} className="bg-white rounded-xl border shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-700 font-bold">{room.room_number || "?"}</div>
                    <div>
                      <div className="font-semibold text-gray-900">Room {room.room_number}</div>
                      <div className="text-xs text-gray-400">Floor {room.floor || "?"} · Capacity {room.capacity}</div>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${room.occupied >= room.capacity ? "bg-red-100 text-red-700" : room.occupied > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {room.occupied}/{room.capacity} occupied
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(room.pilgrims || []).map((p: any, j: number) => (
                    <div key={j} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 text-sm">
                      <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">{(p.name || "?")[0]}</div>
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.passport || "—"}</div>
                      </div>
                    </div>
                  ))}
                  {(room.pilgrims || []).length === 0 && <div className="text-sm text-gray-400 italic">Empty room</div>}
                </div>
              </div>
            ))}
            {!roomMatrix && <div className="bg-white rounded-xl border p-8 text-center text-gray-400">Enter a Group ID and click Load Group Data</div>}
          </div>
        )}

        {/* Manifest */}
        {tab === "manifest" && (
          <div className="space-y-4">
            {manifestData ? (
              <>
                <div className="bg-white rounded-xl border shadow-sm p-4 grid grid-cols-3 gap-4">
                  <div className="text-center"><div className="text-xs text-gray-500">Total Pilgrims</div><div className="text-2xl font-bold">{manifestData.summary?.total ?? 0}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500">Tent Allocated</div><div className="text-2xl font-bold text-green-600">{manifestData.summary?.tent_allocated ?? 0}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500">Room Assigned</div><div className="text-2xl font-bold text-blue-600">{manifestData.summary?.room_assigned ?? 0}</div></div>
                </div>
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b"><tr>{["Name", "Passport", "Mobile", "Tent", "Bed", "Maktab", "Room", "Booking"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
                    <tbody className="divide-y">
                      {manifestData.pilgrims?.map((p: any, i: number) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-3 font-medium">{p.full_name}</td>
                          <td className="px-3 py-3 font-mono text-xs">{p.passport_number || "—"}</td>
                          <td className="px-3 py-3">{p.mobile_india || "—"}</td>
                          <td className="px-3 py-3 font-mono">{p.tent_number || "—"}</td>
                          <td className="px-3 py-3 font-mono">{p.bed_number || "—"}</td>
                          <td className="px-3 py-3 font-mono text-indigo-600">{p.maktab_number || "—"}</td>
                          <td className="px-3 py-3 font-mono">{p.room_number || "—"}</td>
                          <td className="px-3 py-3 text-gray-500">{p.booking_number || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400">Enter a Group ID and click Load Group Data</div>
            )}
          </div>
        )}

        {/* Broadcast */}
        {tab === "broadcast" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-4">📢 Send WhatsApp Broadcast to Group</h3>
              <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} rows={5} className="w-full border rounded-lg px-3 py-2 text-sm mb-4" placeholder="Type your message to all pilgrims in this group..." />
              <div className="flex items-center gap-3">
                <button onClick={doBroadcast} disabled={broadcasting || !groupId || !broadcastMsg.trim()} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {broadcasting ? "Sending..." : "📱 Send WhatsApp Broadcast"}
                </button>
                <span className="text-xs text-gray-400">Messages will be sent to all pilgrims with mobile numbers</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="p-4 border-b font-semibold text-gray-800 text-sm">📋 Broadcast History</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>{["Time", "Message", "Sent", "Failed"].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {broadcastLogs.map((l, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-sm truncate">{l.message}</td>
                      <td className="px-4 py-3 text-green-600 font-semibold">{l.sent_count}</td>
                      <td className="px-4 py-3 text-red-500">{l.failed_count || 0}</td>
                    </tr>
                  ))}
                  {broadcastLogs.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No broadcasts sent yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Allocation Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Tent/Maktab Allocation</h2></div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Pilgrim ID *</label><input value={pilgrimId} onChange={e => setPilgrimId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Mina Camp</label><input value={minacamp} onChange={e => setMinacamp(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Tent Number</label><input value={tentNum} onChange={e => setTentNum(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Bed Number</label><input value={bedNum} onChange={e => setBedNum(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Maktab Number</label><input value={maktabNum} onChange={e => setMaktabNum(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Maktab Name</label><input value={maktabName} onChange={e => setMaktabName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Maktab Area</label><input value={maktabArea} onChange={e => setMaktabArea(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Arafat Camp</label><input value={arafatCamp} onChange={e => setArafatCamp(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><input value={allocNotes} onChange={e => setAllocNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitAllocation} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Save Allocation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
