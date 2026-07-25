import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

const TRIP_STATUS: Record<string, string> = {
  scheduled:   "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed:   "bg-green-100 text-green-800",
  cancelled:   "bg-red-100 text-red-800",
};

export default function TransportOpsCenter() {
  const [tab, setTab] = useState<"vehicles" | "drivers" | "trips" | "fuel" | "maintenance">("vehicles");
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [fuel, setFuel] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Vehicle form
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vReg, setVReg] = useState("");
  const [vType, setVType] = useState("bus");
  const [vMake, setVMake] = useState("");
  const [vModel, setVModel] = useState("");
  const [vYear, setVYear] = useState("");
  const [vCapacity, setVCapacity] = useState("40");
  const [vFuelType, setVFuelType] = useState("diesel");
  const [vInsExp, setVInsExp] = useState("");
  const [vPermitExp, setVPermitExp] = useState("");

  // Driver form
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [dName, setDName] = useState("");
  const [dMobile, setDMobile] = useState("");
  const [dLicense, setDLicense] = useState("");
  const [dLicenseExp, setDLicenseExp] = useState("");
  const [dBadge, setDBadge] = useState("");

  // Trip form
  const [showTripForm, setShowTripForm] = useState(false);
  const [tripVehicle, setTripVehicle] = useState("");
  const [tripDriver, setTripDriver] = useState("");
  const [tripDate, setTripDate] = useState(new Date().toISOString().split("T")[0]);
  const [tripFrom, setTripFrom] = useState("");
  const [tripTo, setTripTo] = useState("");
  const [tripDepTime, setTripDepTime] = useState("");
  const [tripPax, setTripPax] = useState("");

  // Fuel form
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelVehicle, setFuelVehicle] = useState("");
  const [fuelDate, setFuelDate] = useState(new Date().toISOString().split("T")[0]);
  const [fuelLiters, setFuelLiters] = useState("");
  const [fuelRate, setFuelRate] = useState("");
  const [fuelOdo, setFuelOdo] = useState("");
  const [fuelStation, setFuelStation] = useState("");

  // Maintenance form
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [maintVehicle, setMaintVehicle] = useState("");
  const [maintDate, setMaintDate] = useState(new Date().toISOString().split("T")[0]);
  const [maintType, setMaintType] = useState("routine");
  const [maintDesc, setMaintDesc] = useState("");
  const [maintCost, setMaintCost] = useState("");
  const [maintVendor, setMaintVendor] = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      if (tab === "vehicles") { const r = await fetch(`${API}/api/transport-ops/vehicles`, { credentials: "include" }); if (r.ok) setVehicles(await r.json()); }
      else if (tab === "drivers") { const r = await fetch(`${API}/api/transport-ops/drivers`, { credentials: "include" }); if (r.ok) setDrivers(await r.json()); }
      else if (tab === "trips") { const r = await fetch(`${API}/api/transport-ops/trips`, { credentials: "include" }); if (r.ok) setTrips(await r.json()); }
      else if (tab === "fuel") { const r = await fetch(`${API}/api/transport-ops/fuel`, { credentials: "include" }); if (r.ok) setFuel(await r.json()); }
      else if (tab === "maintenance") { const r = await fetch(`${API}/api/transport-ops/maintenance`, { credentials: "include" }); if (r.ok) setMaintenance(await r.json()); }
    } finally { setLoading(false); }
  };

  async function loadStats() { const r = await fetch(`${API}/api/transport-ops/stats`, { credentials: "include" }); if (r.ok) setStats(await r.json()); }

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { load(); }, [tab]);

  const post = async (url: string, body: any) => fetch(`${API}${url}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function submitVehicle() {
    const r = await post("/api/transport-ops/vehicles", { reg_number: vReg, type: vType, make: vMake, model: vModel, year: Number(vYear) || null, capacity: Number(vCapacity), fuel_type: vFuelType, insurance_expiry: vInsExp || null, permit_expiry: vPermitExp || null });
    if (r.ok) { flash("✅ Vehicle added"); setShowVehicleForm(false); setVReg(""); setVMake(""); load(); } else { const e = await r.json(); flash(`❌ ${e.error}`); }
  }
  async function submitDriver() {
    const r = await post("/api/transport-ops/drivers", { name: dName, mobile: dMobile, license_number: dLicense, license_expiry: dLicenseExp || null, badge_number: dBadge });
    if (r.ok) { flash("✅ Driver added"); setShowDriverForm(false); setDName(""); setDMobile(""); load(); } else flash("❌ Failed to add driver");
  }
  async function submitTrip() {
    const r = await post("/api/transport-ops/trips", { vehicle_id: tripVehicle || null, driver_id: tripDriver || null, trip_date: tripDate, from_location: tripFrom, to_location: tripTo, departure_time: tripDepTime, passenger_count: Number(tripPax) || 0 });
    if (r.ok) { flash("✅ Trip scheduled"); setShowTripForm(false); setTripFrom(""); setTripTo(""); load(); } else flash("❌ Failed to schedule trip");
  }
  async function submitFuel() {
    const r = await post("/api/transport-ops/fuel", { vehicle_id: fuelVehicle, date: fuelDate, liters: Number(fuelLiters), rate_per_liter: Number(fuelRate) || null, odometer: Number(fuelOdo) || null, fuel_station: fuelStation });
    if (r.ok) { flash("✅ Fuel logged"); setShowFuelForm(false); setFuelLiters(""); setFuelStation(""); load(); } else flash("❌ Failed to log fuel");
  }
  async function submitMaint() {
    const r = await post("/api/transport-ops/maintenance", { vehicle_id: maintVehicle, date: maintDate, type: maintType, description: maintDesc, cost: Number(maintCost) || null, vendor: maintVendor });
    if (r.ok) { flash("✅ Maintenance logged"); setShowMaintForm(false); setMaintDesc(""); setMaintCost(""); load(); } else flash("❌ Failed to log maintenance");
  }
  async function startTrip(id: string) { const r = await post(`/api/transport-ops/trips/${id}/start`, {}); if (r.ok) { flash("🚌 Trip started"); load(); } }
  async function completeTrip(id: string) { const r = await post(`/api/transport-ops/trips/${id}/complete`, {}); if (r.ok) { flash("✅ Trip completed"); load(); } }

  const expiring = (date: string) => { if (!date) return false; return new Date(date) < new Date(Date.now() + 30 * 86400000); };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🚌 Transport Operations</h1>
            <p className="text-sm text-gray-500 mt-1">Vehicles, drivers, trips, fuel & maintenance management</p>
          </div>
          <div className="flex gap-2">
            {tab === "vehicles" && <button onClick={() => setShowVehicleForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Vehicle</button>}
            {tab === "drivers" && <button onClick={() => setShowDriverForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Driver</button>}
            {tab === "trips" && <button onClick={() => setShowTripForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Schedule Trip</button>}
            {tab === "fuel" && <button onClick={() => setShowFuelForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Log Fuel</button>}
            {tab === "maintenance" && <button onClick={() => setShowMaintForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Log Maintenance</button>}
          </div>
        </div>
        {msg && <div className="mt-2 p-3 bg-green-50 text-green-800 rounded-lg text-sm">{msg}</div>}
      </div>

      {stats && (
        <div className="grid grid-cols-5 gap-3 px-6 py-4">
          {[
            { label: "Active Vehicles", value: String(stats.vehicles?.active ?? 0), icon: "🚌" },
            { label: "Active Drivers", value: String(stats.drivers?.active ?? 0), icon: "👨‍✈️" },
            { label: "Scheduled Trips", value: String(stats.trips?.scheduled ?? 0), icon: "📅" },
            { label: "Fuel Cost (30d)", value: fmt(stats.fuel_last30d?.total_cost ?? 0), icon: "⛽" },
            { label: "Maint. Cost (30d)", value: fmt(stats.maintenance_last30d?.total_cost ?? 0), icon: "🔧" },
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
          {(["vehicles", "drivers", "trips", "fuel", "maintenance"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"}`}>
              {t === "vehicles" ? "🚌 Vehicles" : t === "drivers" ? "👨‍✈️ Drivers" : t === "trips" ? "🗺️ Trips" : t === "fuel" ? "⛽ Fuel" : "🔧 Maintenance"}
            </button>
          ))}
        </div>

        {tab === "vehicles" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Reg #", "Type", "Make/Model", "Capacity", "Fuel", "Driver", "Ins. Expiry", "Permit Expiry", "Status"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {vehicles.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-mono font-bold text-indigo-600">{v.reg_number}</td>
                    <td className="px-3 py-3 capitalize">{v.type}</td>
                    <td className="px-3 py-3">{[v.make, v.model].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-3 py-3">{v.capacity}</td>
                    <td className="px-3 py-3 capitalize text-gray-500">{v.fuel_type}</td>
                    <td className="px-3 py-3 text-gray-500">{v.driver_name || "—"}</td>
                    <td className={`px-3 py-3 text-xs ${expiring(v.insurance_expiry) ? "text-red-600 font-semibold" : "text-gray-500"}`}>{v.insurance_expiry || "—"}</td>
                    <td className={`px-3 py-3 text-xs ${expiring(v.permit_expiry) ? "text-red-600 font-semibold" : "text-gray-500"}`}>{v.permit_expiry || "—"}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{v.is_active ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
                {!loading && vehicles.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No vehicles registered</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "drivers" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Name", "Mobile", "License #", "License Expiry", "Badge", "Assigned Vehicle", "Status"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {drivers.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium">{d.name}</td>
                    <td className="px-3 py-3">{d.mobile}</td>
                    <td className="px-3 py-3 font-mono text-gray-600">{d.license_number || "—"}</td>
                    <td className={`px-3 py-3 text-xs ${expiring(d.license_expiry) ? "text-red-600 font-semibold" : "text-gray-500"}`}>{d.license_expiry || "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{d.badge_number || "—"}</td>
                    <td className="px-3 py-3 font-mono text-gray-600">{d.assigned_vehicle || "—"}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{d.is_active ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
                {!loading && drivers.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No drivers registered</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "trips" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Date", "Vehicle", "Driver", "From", "To", "Dep. Time", "Pax", "Status", "Actions"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {trips.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-gray-600">{t.trip_date}</td>
                    <td className="px-3 py-3 font-mono text-indigo-600">{t.vehicle_reg || "—"}</td>
                    <td className="px-3 py-3">{t.driver_name || "—"}</td>
                    <td className="px-3 py-3 text-gray-600">{t.from_location || "—"}</td>
                    <td className="px-3 py-3 text-gray-600">{t.to_location || "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{t.departure_time || "—"}</td>
                    <td className="px-3 py-3">{t.passenger_count}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TRIP_STATUS[t.status] || "bg-gray-100 text-gray-700"}`}>{t.status}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {t.status === "scheduled" && <button onClick={() => startTrip(t.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Start</button>}
                        {t.status === "in_progress" && <button onClick={() => completeTrip(t.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded">Complete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && trips.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No trips scheduled</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "fuel" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Date", "Vehicle", "Liters", "Rate/L", "Amount", "Odometer", "Station", "Recorded By"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {fuel.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-gray-600">{f.date}</td>
                    <td className="px-3 py-3 font-mono text-indigo-600">{f.reg_number || "—"}</td>
                    <td className="px-3 py-3 font-semibold">{f.liters}L</td>
                    <td className="px-3 py-3">{f.rate_per_liter ? `₹${f.rate_per_liter}` : "—"}</td>
                    <td className="px-3 py-3 font-semibold text-red-600">{f.amount ? fmt(f.amount) : "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{f.odometer ? `${f.odometer} km` : "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{f.fuel_station || "—"}</td>
                    <td className="px-3 py-3 text-gray-400">{f.recorded_by || "—"}</td>
                  </tr>
                ))}
                {!loading && fuel.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No fuel logs yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "maintenance" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Date", "Vehicle", "Type", "Description", "Cost", "Vendor", "Next Service"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {maintenance.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-gray-600">{m.date}</td>
                    <td className="px-3 py-3 font-mono text-indigo-600">{m.reg_number || "—"}</td>
                    <td className="px-3 py-3 capitalize text-gray-600">{m.type}</td>
                    <td className="px-3 py-3 max-w-xs truncate">{m.description}</td>
                    <td className="px-3 py-3 font-semibold text-red-600">{m.cost ? fmt(m.cost) : "—"}</td>
                    <td className="px-3 py-3 text-gray-500">{m.vendor || "—"}</td>
                    <td className={`px-3 py-3 text-xs ${expiring(m.next_service_date) ? "text-red-600 font-semibold" : "text-gray-500"}`}>{m.next_service_date || "—"}</td>
                  </tr>
                ))}
                {!loading && maintenance.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No maintenance records</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vehicle Form */}
      {showVehicleForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Register Vehicle</h2></div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Reg. Number *</label><input value={vReg} onChange={e => setVReg(e.target.value.toUpperCase())} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="MH-01-AB-1234" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><select value={vType} onChange={e => setVType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="bus">Bus</option><option value="mini_bus">Mini Bus</option><option value="car">Car</option><option value="van">Van</option><option value="suv">SUV</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Make</label><input value={vMake} onChange={e => setVMake(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Model</label><input value={vModel} onChange={e => setVModel(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Year</label><input type="number" value={vYear} onChange={e => setVYear(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label><input type="number" value={vCapacity} onChange={e => setVCapacity(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label><select value={vFuelType} onChange={e => setVFuelType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="diesel">Diesel</option><option value="petrol">Petrol</option><option value="cng">CNG</option><option value="electric">Electric</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Insurance Expiry</label><input type="date" value={vInsExp} onChange={e => setVInsExp(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Permit Expiry</label><input type="date" value={vPermitExp} onChange={e => setVPermitExp(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowVehicleForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitVehicle} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Register</button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Form */}
      {showDriverForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Add Driver</h2></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input value={dName} onChange={e => setDName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Mobile *</label><input value={dMobile} onChange={e => setDMobile(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">License #</label><input value={dLicense} onChange={e => setDLicense(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label><input type="date" value={dLicenseExp} onChange={e => setDLicenseExp(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Badge Number</label><input value={dBadge} onChange={e => setDBadge(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowDriverForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitDriver} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Add Driver</button>
            </div>
          </div>
        </div>
      )}

      {/* Trip Form */}
      {showTripForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Schedule Trip</h2></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Vehicle</label><select value={tripVehicle} onChange={e => setTripVehicle(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select...</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.reg_number}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Driver</label><select value={tripDriver} onChange={e => setTripDriver(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select...</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Trip Date *</label><input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Departure Time</label><input type="time" value={tripDepTime} onChange={e => setTripDepTime(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">From</label><input value={tripFrom} onChange={e => setTripFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">To</label><input value={tripTo} onChange={e => setTripTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Passengers</label><input type="number" value={tripPax} onChange={e => setTripPax(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowTripForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitTrip} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Schedule Trip</button>
            </div>
          </div>
        </div>
      )}

      {/* Fuel Form */}
      {showFuelForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Log Fuel</h2></div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Vehicle *</label><select value={fuelVehicle} onChange={e => setFuelVehicle(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select vehicle</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.reg_number}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" value={fuelDate} onChange={e => setFuelDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Liters *</label><input type="number" value={fuelLiters} onChange={e => setFuelLiters(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Rate/Liter (₹)</label><input type="number" value={fuelRate} onChange={e => setFuelRate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Odometer (km)</label><input type="number" value={fuelOdo} onChange={e => setFuelOdo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Station</label><input value={fuelStation} onChange={e => setFuelStation(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              {fuelLiters && fuelRate && <div className="col-span-2 bg-blue-50 rounded-lg p-2 text-sm text-blue-800">Total: {fmt(Number(fuelLiters) * Number(fuelRate))}</div>}
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowFuelForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitFuel} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Log Fuel</button>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Form */}
      {showMaintForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Log Maintenance</h2></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Vehicle *</label><select value={maintVehicle} onChange={e => setMaintVehicle(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select vehicle</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.reg_number}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" value={maintDate} onChange={e => setMaintDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label><select value={maintType} onChange={e => setMaintType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="routine">Routine</option><option value="repair">Repair</option><option value="emergency">Emergency</option><option value="inspection">Inspection</option></select></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description *</label><textarea value={maintDesc} onChange={e => setMaintDesc(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Cost (₹)</label><input type="number" value={maintCost} onChange={e => setMaintCost(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label><input value={maintVendor} onChange={e => setMaintVendor(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowMaintForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitMaint} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Log Maintenance</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
