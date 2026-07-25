import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

const STATUS_COLORS: Record<string, string> = {
  active:       "bg-green-100 text-green-800",
  expired:      "bg-red-100 text-red-800",
  draft:        "bg-gray-100 text-gray-700",
  issued:       "bg-blue-100 text-blue-800",
  cancelled:    "bg-red-100 text-red-800",
  reserved:     "bg-yellow-100 text-yellow-800",
  checked_in:   "bg-green-100 text-green-800",
  checked_out:  "bg-gray-100 text-gray-700",
};

export default function HotelOpsCenter() {
  const [tab, setTab] = useState<"contracts" | "vouchers" | "checkins" | "occupancy">("contracts");
  const [contracts, setContracts] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [occupancy, setOccupancy] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Contract form
  const [showContractForm, setShowContractForm] = useState(false);
  const [cHotelName, setCHotelName] = useState("");
  const [cSeason, setCSeason] = useState("");
  const [cValidFrom, setCValidFrom] = useState("");
  const [cValidTo, setCValidTo] = useState("");
  const [cRoomType, setCRoomType] = useState("standard");
  const [cRate, setCRate] = useState("");
  const [cTotalRooms, setCTotalRooms] = useState("");
  const [cMealPlan, setCMealPlan] = useState("bb");
  const [cPayTerms, setCPayTerms] = useState("");

  // Voucher form
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [vHotelName, setVHotelName] = useState("");
  const [vCheckIn, setVCheckIn] = useState("");
  const [vCheckOut, setVCheckOut] = useState("");
  const [vRoomType, setVRoomType] = useState("standard");
  const [vRoomCount, setVRoomCount] = useState(1);
  const [vMealPlan, setVMealPlan] = useState("bb");
  const [vPilgrimCount, setVPilgrimCount] = useState(1);
  const [vRate, setVRate] = useState("");
  const [vSpecial, setVSpecial] = useState("");

  // Check-in form
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [ciHotelName, setCiHotelName] = useState("");
  const [ciGuestNames, setCiGuestNames] = useState("");
  const [ciRoom, setCiRoom] = useState("");
  const [ciExpCheckin, setCiExpCheckin] = useState("");
  const [ciExpCheckout, setCiExpCheckout] = useState("");
  const [ciNotes, setCiNotes] = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  async function loadContracts() { setLoading(true); try { const r = await fetch(`${API}/api/hotel-ops/contracts`, { credentials: "include" }); if (r.ok) setContracts(await r.json()); } finally { setLoading(false); } }
  async function loadVouchers() { setLoading(true); try { const r = await fetch(`${API}/api/hotel-ops/vouchers`, { credentials: "include" }); if (r.ok) setVouchers(await r.json()); } finally { setLoading(false); } }
  async function loadCheckins() { setLoading(true); try { const r = await fetch(`${API}/api/hotel-ops/checkins`, { credentials: "include" }); if (r.ok) setCheckins(await r.json()); } finally { setLoading(false); } }
  async function loadOccupancy() { const r = await fetch(`${API}/api/hotel-ops/occupancy`, { credentials: "include" }); if (r.ok) setOccupancy(await r.json()); }
  async function loadStats() { const r = await fetch(`${API}/api/hotel-ops/stats`, { credentials: "include" }); if (r.ok) setStats(await r.json()); }

  useEffect(() => { loadStats(); loadContracts(); }, []);
  useEffect(() => {
    if (tab === "vouchers") loadVouchers();
    else if (tab === "checkins") loadCheckins();
    else if (tab === "occupancy") loadOccupancy();
  }, [tab]);

  async function submitContract() {
    const r = await fetch(`${API}/api/hotel-ops/contracts`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hotel_name: cHotelName, season: cSeason, valid_from: cValidFrom, valid_to: cValidTo, room_type: cRoomType, rate_per_night: Number(cRate), total_rooms: Number(cTotalRooms), meal_plan: cMealPlan, payment_terms: cPayTerms }) });
    if (r.ok) { flash("✅ Contract created"); setShowContractForm(false); setCHotelName(""); setCRate(""); loadContracts(); }
    else flash("❌ Failed to create contract");
  }

  async function submitVoucher() {
    const r = await fetch(`${API}/api/hotel-ops/vouchers`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hotel_name: vHotelName, check_in_date: vCheckIn, check_out_date: vCheckOut, room_type: vRoomType, room_count: vRoomCount, meal_plan: vMealPlan, pilgrim_count: vPilgrimCount, rate_per_night: Number(vRate) || null, special_requests: vSpecial }) });
    if (r.ok) { flash("✅ Voucher issued"); setShowVoucherForm(false); setVHotelName(""); setVRate(""); loadVouchers(); }
    else flash("❌ Failed to issue voucher");
  }

  async function submitCheckin() {
    const r = await fetch(`${API}/api/hotel-ops/checkins`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hotel_name: ciHotelName, guest_names: ciGuestNames, room_number: ciRoom, expected_checkin: ciExpCheckin, expected_checkout: ciExpCheckout, notes: ciNotes }) });
    if (r.ok) { flash("✅ Check-in record created"); setShowCheckinForm(false); setCiHotelName(""); setCiGuestNames(""); loadCheckins(); }
    else flash("❌ Failed");
  }

  async function doCheckin(id: string) { const r = await fetch(`${API}/api/hotel-ops/checkins/${id}/checkin`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); if (r.ok) { flash("✅ Checked in"); loadCheckins(); } }
  async function doCheckout(id: string) { const r = await fetch(`${API}/api/hotel-ops/checkins/${id}/checkout`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); if (r.ok) { flash("✅ Checked out"); loadCheckins(); } }
  async function cancelVoucher(id: string) { const r = await fetch(`${API}/api/hotel-ops/vouchers/${id}/cancel`, { method: "POST", credentials: "include" }); if (r.ok) { flash("✅ Voucher cancelled"); loadVouchers(); } }

  const nights = (a: string, b: string) => { try { return Math.max(1, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000)); } catch { return 0; } };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🏨 Hotel Operations Center</h1>
            <p className="text-sm text-gray-500 mt-1">Contracts, vouchers, check-in/out & occupancy tracking</p>
          </div>
          <div className="flex gap-2">
            {tab === "contracts" && <button onClick={() => setShowContractForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Contract</button>}
            {tab === "vouchers" && <button onClick={() => setShowVoucherForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Voucher</button>}
            {tab === "checkins" && <button onClick={() => setShowCheckinForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Check-in</button>}
          </div>
        </div>
        {msg && <div className="mt-2 p-3 bg-green-50 text-green-800 rounded-lg text-sm">{msg}</div>}
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4 px-6 py-4">
          {[
            { label: "Active Contracts", value: String(stats.contracts?.active ?? 0), icon: "📄" },
            { label: "Vouchers Issued", value: String(stats.vouchers?.active ?? 0), icon: "🎟️" },
            { label: "Currently Occupied", value: String(stats.checkins?.occupied ?? 0), icon: "🛏️" },
            { label: "Pending Check-in", value: String(stats.checkins?.reserved ?? 0), icon: "⏳" },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1"><span className="text-xl">{k.icon}</span><span className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</span></div>
              <div className="text-2xl font-bold text-gray-900">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="px-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
          {(["contracts", "vouchers", "checkins", "occupancy"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"}`}>
              {t === "contracts" ? "📄 Contracts" : t === "vouchers" ? "🎟️ Vouchers" : t === "checkins" ? "🛏️ Check-in/out" : "📊 Occupancy"}
            </button>
          ))}
        </div>

        {tab === "contracts" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Contract #", "Hotel", "Season", "Valid", "Room Type", "Rate/Night", "Rooms", "Meal", "Status"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {contracts.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-mono text-indigo-600">{c.contract_number}</td>
                    <td className="px-3 py-3 font-medium">{c.hotel_name}</td>
                    <td className="px-3 py-3 text-gray-500">{c.season || "—"}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{c.valid_from} → {c.valid_to}</td>
                    <td className="px-3 py-3 capitalize">{c.room_type}</td>
                    <td className="px-3 py-3 font-semibold">{fmt(c.rate_per_night)}</td>
                    <td className="px-3 py-3">{c.contracted_rooms}/{c.total_rooms}</td>
                    <td className="px-3 py-3 uppercase text-xs">{c.meal_plan}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || "bg-gray-100 text-gray-700"}`}>{c.status}</span></td>
                  </tr>
                ))}
                {!loading && contracts.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No contracts yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "vouchers" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Voucher #", "Hotel", "Check-in", "Check-out", "Nights", "Rooms", "Pax", "Total", "Status", "Actions"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {vouchers.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-mono text-indigo-600">{v.voucher_number}</td>
                    <td className="px-3 py-3 font-medium">{v.hotel_name}</td>
                    <td className="px-3 py-3 text-gray-500">{v.check_in_date}</td>
                    <td className="px-3 py-3 text-gray-500">{v.check_out_date}</td>
                    <td className="px-3 py-3">{v.nights}</td>
                    <td className="px-3 py-3">{v.room_count}</td>
                    <td className="px-3 py-3">{v.pilgrim_count}</td>
                    <td className="px-3 py-3 font-semibold">{v.total_amount ? fmt(v.total_amount) : "—"}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[v.status] || "bg-gray-100 text-gray-700"}`}>{v.status}</span></td>
                    <td className="px-3 py-3">{v.status === "issued" && <button onClick={() => cancelVoucher(v.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Cancel</button>}</td>
                  </tr>
                ))}
                {!loading && vouchers.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No vouchers issued</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "checkins" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Hotel", "Guests", "Room", "Expected In", "Expected Out", "Status", "Actions"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {checkins.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium">{c.hotel_name || "—"}</td>
                    <td className="px-3 py-3">{c.guest_names}</td>
                    <td className="px-3 py-3 font-mono">{c.room_number || "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{c.expected_checkin || "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{c.expected_checkout || "—"}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || "bg-gray-100 text-gray-700"}`}>{c.status}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {c.status === "reserved" && <button onClick={() => doCheckin(c.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Check In</button>}
                        {c.status === "checked_in" && <button onClick={() => doCheckout(c.id)} className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700">Check Out</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && checkins.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No check-in records</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "occupancy" && (
          <div className="space-y-4">
            {occupancy.map((o, i) => (
              <div key={i} className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{o.hotel_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">ID: {o.hotel_id || "—"}</div>
                </div>
                <div className="flex gap-8">
                  <div className="text-center"><div className="text-xs text-gray-500">Reserved</div><div className="text-xl font-bold text-yellow-600">{o.reserved}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500">Occupied</div><div className="text-xl font-bold text-green-600">{o.occupied}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500">Checked Out</div><div className="text-xl font-bold text-gray-500">{o.checked_out}</div></div>
                  <div className="text-center"><div className="text-xs text-gray-500">Total</div><div className="text-xl font-bold">{o.total}</div></div>
                </div>
                <div className="w-32">
                  <div className="text-xs text-gray-500 mb-1">{o.total > 0 ? Math.round((o.occupied / o.total) * 100) : 0}% occupancy</div>
                  <div className="bg-gray-100 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${o.total > 0 ? (o.occupied / o.total) * 100 : 0}%` }} /></div>
                </div>
              </div>
            ))}
            {occupancy.length === 0 && <div className="bg-white rounded-xl border p-8 text-center text-gray-400">No occupancy data yet</div>}
          </div>
        )}
      </div>

      {/* Contract Form */}
      {showContractForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">New Hotel Contract</h2></div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Hotel Name *</label><input value={cHotelName} onChange={e => setCHotelName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Season</label><input value={cSeason} onChange={e => setCSeason(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Hajj 2026" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label><select value={cRoomType} onChange={e => setCRoomType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="standard">Standard</option><option value="deluxe">Deluxe</option><option value="suite">Suite</option><option value="quad">Quad</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Valid From *</label><input type="date" value={cValidFrom} onChange={e => setCValidFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Valid To *</label><input type="date" value={cValidTo} onChange={e => setCValidTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Rate/Night (₹) *</label><input type="number" value={cRate} onChange={e => setCRate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Total Rooms</label><input type="number" value={cTotalRooms} onChange={e => setCTotalRooms(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Meal Plan</label><select value={cMealPlan} onChange={e => setCMealPlan(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="bb">Bed & Breakfast</option><option value="hb">Half Board</option><option value="fb">Full Board</option><option value="ro">Room Only</option></select></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label><input value={cPayTerms} onChange={e => setCPayTerms(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowContractForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitContract} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Create Contract</button>
            </div>
          </div>
        </div>
      )}

      {/* Voucher Form */}
      {showVoucherForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Issue Hotel Voucher</h2></div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Hotel Name *</label><input value={vHotelName} onChange={e => setVHotelName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Check-in *</label><input type="date" value={vCheckIn} onChange={e => setVCheckIn(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Check-out *</label><input type="date" value={vCheckOut} onChange={e => setVCheckOut(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label><select value={vRoomType} onChange={e => setVRoomType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="standard">Standard</option><option value="deluxe">Deluxe</option><option value="suite">Suite</option><option value="quad">Quad</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Rooms</label><input type="number" value={vRoomCount} onChange={e => setVRoomCount(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Pilgrims</label><input type="number" value={vPilgrimCount} onChange={e => setVPilgrimCount(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Rate/Night (₹)</label><input type="number" value={vRate} onChange={e => setVRate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label><input value={vSpecial} onChange={e => setVSpecial(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              {vCheckIn && vCheckOut && vRate && <div className="col-span-2 bg-blue-50 rounded-lg p-3 text-sm text-blue-800">Estimated: {fmt(Number(vRate) * nights(vCheckIn, vCheckOut) * vRoomCount)} ({nights(vCheckIn, vCheckOut)} nights × {vRoomCount} rooms)</div>}
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowVoucherForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitVoucher} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Issue Voucher</button>
            </div>
          </div>
        </div>
      )}

      {/* Check-in Form */}
      {showCheckinForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">New Check-in Record</h2></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Hotel Name *</label><input value={ciHotelName} onChange={e => setCiHotelName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Guest Names *</label><input value={ciGuestNames} onChange={e => setCiGuestNames(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Names separated by comma" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Room Number</label><input value={ciRoom} onChange={e => setCiRoom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Expected Check-in</label><input type="date" value={ciExpCheckin} onChange={e => setCiExpCheckin(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Expected Check-out</label><input type="date" value={ciExpCheckout} onChange={e => setCiExpCheckout(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea value={ciNotes} onChange={e => setCiNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} /></div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowCheckinForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitCheckin} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Create Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
