import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

const STATUS_COLORS: Record<string, string> = {
  active:    "bg-green-100 text-green-800",
  ticketed:  "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
  changed:   "bg-yellow-100 text-yellow-800",
  checked_in: "bg-teal-100 text-teal-800",
  delivered:  "bg-purple-100 text-purple-800",
};

export default function FlightOpsCenter() {
  const [tab, setTab] = useState<"airlines" | "pnr" | "baggage" | "manifest">("airlines");
  const [airlines, setAirlines] = useState<any[]>([]);
  const [pnrs, setPnrs] = useState<any[]>([]);
  const [baggage, setBaggage] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // PNR filters
  const [pnrStatus, setPnrStatus] = useState("");
  const [pnrFrom, setPnrFrom] = useState("");
  const [pnrTo, setPnrTo] = useState("");

  // Airline form
  const [showAirlineForm, setShowAirlineForm] = useState(false);
  const [airlineName, setAirlineName] = useState("");
  const [airlineIata, setAirlineIata] = useState("");
  const [airlineCountry, setAirlineCountry] = useState("");
  const [airlineContact, setAirlineContact] = useState("");

  // PNR form
  const [showPNRForm, setShowPNRForm] = useState(false);
  const [pnrNum, setPnrNum] = useState("");
  const [pnrFlight, setPnrFlight] = useState("");
  const [pnrSector, setPnrSector] = useState("");
  const [pnrAirlineId, setPnrAirlineId] = useState("");
  const [pnrDepDate, setPnrDepDate] = useState("");
  const [pnrDepTime, setPnrDepTime] = useState("");
  const [pnrArrTime, setPnrArrTime] = useState("");
  const [pnrSeats, setPnrSeats] = useState(0);
  const [pnrFare, setPnrFare] = useState("");

  // Manifest
  const [manifestGroupId, setManifestGroupId] = useState("");
  const [manifestData, setManifestData] = useState<any>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  async function loadAirlines() { const r = await fetch(`${API}/api/flight-ops/airlines`, { credentials: "include" }); setAirlines(await r.json()); }
  async function loadPNRs() {
    setLoading(true);
    const p = new URLSearchParams();
    if (pnrStatus) p.set("status", pnrStatus);
    if (pnrFrom) p.set("from", pnrFrom);
    if (pnrTo) p.set("to", pnrTo);
    try { const r = await fetch(`${API}/api/flight-ops/pnr?${p}`, { credentials: "include" }); if (r.ok) setPnrs(await r.json()); }
    finally { setLoading(false); }
  }
  async function loadBaggage() { const r = await fetch(`${API}/api/flight-ops/baggage`, { credentials: "include" }); if (r.ok) setBaggage(await r.json()); }
  async function loadStats() { const r = await fetch(`${API}/api/flight-ops/stats`, { credentials: "include" }); if (r.ok) setStats(await r.json()); }

  useEffect(() => { loadStats(); loadAirlines(); }, []);
  useEffect(() => { if (tab === "pnr") loadPNRs(); else if (tab === "baggage") loadBaggage(); }, [tab]);

  async function submitAirline() {
    const r = await fetch(`${API}/api/flight-ops/airlines`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: airlineName, iata_code: airlineIata, country: airlineCountry, contact: airlineContact }) });
    if (r.ok) { flash("✅ Airline added"); setShowAirlineForm(false); setAirlineName(""); setAirlineIata(""); loadAirlines(); }
    else flash("❌ Failed to add airline");
  }

  async function submitPNR() {
    const airline = airlines.find(a => a.id === pnrAirlineId);
    const r = await fetch(`${API}/api/flight-ops/pnr`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pnr_number: pnrNum, airline_id: pnrAirlineId || null, airline_name: airline?.name || "", flight_number: pnrFlight, sector: pnrSector, departure_date: pnrDepDate, departure_time: pnrDepTime, arrival_time: pnrArrTime, seat_count: pnrSeats, fare_amount: pnrFare || null }),
    });
    if (r.ok) { flash("✅ PNR created"); setShowPNRForm(false); setPnrNum(""); setPnrFlight(""); loadPNRs(); }
    else flash("❌ Failed to create PNR");
  }

  async function issuePNR(id: string) {
    const ref = prompt("Enter ticket numbers (comma separated):");
    if (ref === null) return;
    const r = await fetch(`${API}/api/flight-ops/pnr/${id}/issue-tickets`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_numbers: ref }) });
    if (r.ok) { flash("✅ Tickets issued"); loadPNRs(); } else flash("❌ Failed");
  }

  async function cancelPNR(id: string) {
    const reason = prompt("Cancellation reason:");
    if (reason === null) return;
    const r = await fetch(`${API}/api/flight-ops/pnr/${id}/cancel`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    if (r.ok) { flash("✅ PNR cancelled"); loadPNRs(); }
  }

  async function loadManifest() {
    if (!manifestGroupId.trim()) return;
    const r = await fetch(`${API}/api/flight-ops/manifest/${manifestGroupId}`, { credentials: "include" });
    if (r.ok) setManifestData(await r.json()); else flash("❌ Group not found");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">✈️ Flight Operations Center</h1>
            <p className="text-sm text-gray-500 mt-1">Airline master, PNR management, tickets & flight manifest</p>
          </div>
          <div className="flex gap-2">
            {tab === "airlines" && <button onClick={() => setShowAirlineForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Airline</button>}
            {tab === "pnr" && <button onClick={() => setShowPNRForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ PNR Record</button>}
          </div>
        </div>
        {msg && <div className="mt-2 p-3 bg-green-50 text-green-800 rounded-lg text-sm">{msg}</div>}
      </div>

      {/* KPI row */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 px-6 py-4">
          {[
            { label: "Airlines", value: `${stats.airlines?.active ?? 0} active`, icon: "🏢" },
            { label: "PNR Records", value: String(stats.pnr?.total ?? 0), icon: "🎫" },
            { label: "Ticketed", value: String(stats.pnr?.ticketed ?? 0), icon: "✅" },
            { label: "Total Seats", value: String(stats.pnr?.total_seats ?? 0), icon: "💺" },
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
          {(["airlines", "pnr", "baggage", "manifest"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"}`}>
              {t === "airlines" ? "🏢 Airlines" : t === "pnr" ? "🎫 PNR" : t === "baggage" ? "🧳 Baggage" : "📋 Manifest"}
            </button>
          ))}
        </div>

        {/* Airlines Tab */}
        {tab === "airlines" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["IATA", "Name", "Country", "Contact", "Status"].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {airlines.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-600">{a.iata_code || "—"}</td>
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-gray-500">{a.country || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{a.contact || "—"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${a.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{a.is_active ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
                {airlines.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No airlines. Add your first airline.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* PNR Tab */}
        {tab === "pnr" && (
          <>
            <div className="flex gap-2 mb-3 flex-wrap">
              {["", "active", "ticketed", "cancelled"].map(s => (
                <button key={s} onClick={() => { setPnrStatus(s); setTimeout(loadPNRs, 0); }} className={`px-3 py-1.5 rounded-lg text-sm border ${pnrStatus === s ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700"}`}>{s || "All"}</button>
              ))}
              <input type="date" value={pnrFrom} onChange={e => setPnrFrom(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
              <input type="date" value={pnrTo} onChange={e => setPnrTo(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
              <button onClick={loadPNRs} className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm">Filter</button>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>{["PNR", "Flight", "Sector", "Date", "Time", "Seats", "Pax", "Status", "Actions"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {pnrs.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 font-mono font-bold text-indigo-600">{p.pnr_number}</td>
                      <td className="px-3 py-3 font-medium">{p.flight_number}</td>
                      <td className="px-3 py-3 text-gray-600">{p.sector || "—"}</td>
                      <td className="px-3 py-3 text-gray-600">{p.departure_date || "—"}</td>
                      <td className="px-3 py-3 text-gray-600">{p.departure_time || "—"}</td>
                      <td className="px-3 py-3">{p.seat_count}</td>
                      <td className="px-3 py-3">{p.passenger_count ?? 0}</td>
                      <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-700"}`}>{p.status}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          {p.status === "active" && <button onClick={() => issuePNR(p.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">Issue</button>}
                          {p.status !== "cancelled" && <button onClick={() => cancelPNR(p.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Cancel</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && pnrs.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No PNR records found</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Baggage Tab */}
        {tab === "baggage" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Tag #", "PNR", "Flight", "Pieces", "Weight (kg)", "Status", "Last Scan"].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {baggage.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-600">{b.tag_number}</td>
                    <td className="px-4 py-3">{b.pnr_number || "—"}</td>
                    <td className="px-4 py-3">{b.flight_number || "—"}</td>
                    <td className="px-4 py-3">{b.pieces}</td>
                    <td className="px-4 py-3">{b.weight_kg || "—"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}`}>{b.status}</span></td>
                    <td className="px-4 py-3 text-gray-500">{b.last_scan_location || "—"}</td>
                  </tr>
                ))}
                {baggage.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No baggage records</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Manifest Tab */}
        {tab === "manifest" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-4 flex gap-3">
              <input value={manifestGroupId} onChange={e => setManifestGroupId(e.target.value)} placeholder="Enter Group ID" className="border rounded-lg px-3 py-2 text-sm flex-1" />
              <button onClick={loadManifest} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">📋 Generate Manifest</button>
            </div>
            {manifestData && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="p-4 border-b">
                  <h3 className="font-semibold text-gray-900">Flight Manifest — {manifestData.pnrs?.length ?? 0} PNRs · {manifestData.passengers?.length ?? 0} Passengers</h3>
                  <p className="text-xs text-gray-400 mt-1">Generated: {new Date(manifestData.generated_at).toLocaleString()}</p>
                </div>
                {manifestData.pnrs?.map((pnr: any) => (
                  <div key={pnr.id} className="border-b p-4">
                    <div className="flex items-center gap-4 mb-2">
                      <span className="font-mono font-bold text-indigo-600">{pnr.pnr_number}</span>
                      <span className="font-medium">{pnr.flight_number}</span>
                      <span className="text-gray-500">{pnr.sector}</span>
                      <span className="text-gray-500">{pnr.departure_date}</span>
                      <span className="text-sm text-gray-400">{pnr.pax_count} pax</span>
                    </div>
                    <div className="space-y-1">
                      {manifestData.passengers?.filter((p: any) => p.pnr_number === pnr.pnr_number).map((p: any, i: number) => (
                        <div key={i} className="flex gap-6 text-sm bg-gray-50 rounded px-3 py-2">
                          <span className="text-gray-400 w-6">{i + 1}.</span>
                          <span className="font-medium w-40">{p.pilgrim_name || "—"}</span>
                          <span className="text-gray-500 w-32 font-mono">{p.passport_number || "—"}</span>
                          <span className="text-gray-500">Seat: {p.seat_number || "—"}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-700"}`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Airline Form Modal */}
      {showAirlineForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Add Airline</h2></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Airline Name *</label><input value={airlineName} onChange={e => setAirlineName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">IATA Code</label><input value={airlineIata} onChange={e => setAirlineIata(e.target.value.toUpperCase())} maxLength={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. AI" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Country</label><input value={airlineCountry} onChange={e => setAirlineCountry(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Contact</label><input value={airlineContact} onChange={e => setAirlineContact(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowAirlineForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitAirline} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Add Airline</button>
            </div>
          </div>
        </div>
      )}

      {/* PNR Form Modal */}
      {showPNRForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">New PNR Record</h2></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">PNR Number *</label><input value={pnrNum} onChange={e => setPnrNum(e.target.value.toUpperCase())} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Flight Number *</label><input value={pnrFlight} onChange={e => setPnrFlight(e.target.value.toUpperCase())} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. AI-131" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Airline</label>
                  <select value={pnrAirlineId} onChange={e => setPnrAirlineId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Select airline</option>
                    {airlines.map(a => <option key={a.id} value={a.id}>{a.iata_code ? `[${a.iata_code}] ` : ""}{a.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Sector</label><input value={pnrSector} onChange={e => setPnrSector(e.target.value.toUpperCase())} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. DEL-JED" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Departure Date</label><input type="date" value={pnrDepDate} onChange={e => setPnrDepDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Dep. Time</label><input type="time" value={pnrDepTime} onChange={e => setPnrDepTime(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Arr. Time</label><input type="time" value={pnrArrTime} onChange={e => setPnrArrTime(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Seat Count</label><input type="number" value={pnrSeats} onChange={e => setPnrSeats(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Fare (₹)</label><input type="number" value={pnrFare} onChange={e => setPnrFare(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowPNRForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitPNR} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Create PNR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
