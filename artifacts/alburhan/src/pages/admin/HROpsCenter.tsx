import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";
const fmt = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

const LEAVE_STATUS: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};
const SLIP_STATUS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  paid:  "bg-green-100 text-green-800",
};

export default function HROpsCenter() {
  const [tab, setTab] = useState<"leaves" | "balances" | "slips" | "types">("leaves");
  const [leaves, setLeaves] = useState<any[]>([]);
  const [slips, setSlips] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [selectedEmp, setSelectedEmp] = useState("");
  const [balances, setBalances] = useState<any[]>([]);

  // Leave request form
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [lEmpId, setLEmpId] = useState("");
  const [lTypeId, setLTypeId] = useState("");
  const [lTypeName, setLTypeName] = useState("");
  const [lFrom, setLFrom] = useState("");
  const [lTo, setLTo] = useState("");
  const [lReason, setLReason] = useState("");
  const [lHalfDay, setLHalfDay] = useState(false);

  // Salary slip form
  const [showSlipForm, setShowSlipForm] = useState(false);
  const [sEmpId, setSEmpId] = useState("");
  const [sMonth, setSMonth] = useState(new Date().getMonth() + 1);
  const [sYear, setSYear] = useState(new Date().getFullYear());
  const [sBasic, setSBasic] = useState("");
  const [sHRA, setSHRA] = useState("");
  const [sConv, setSConv] = useState("");
  const [sOtherAllow, setSOtherAllow] = useState("");
  const [sPF, setSPF] = useState("");
  const [sESI, setSESI] = useState("");
  const [sTDS, setSTDS] = useState("");
  const [sAdvDed, setSAdvDed] = useState("");
  const [sDaysPresent, setSDaysPresent] = useState("26");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  async function loadLeaves() {
    setLoading(true);
    try { const r = await fetch(`${API}/api/hr-ops/leaves`, { credentials: "include" }); if (r.ok) setLeaves(await r.json()); }
    finally { setLoading(false); }
  }
  async function loadSlips(empId?: string) {
    const p = empId ? `?employee_id=${empId}` : "";
    const r = await fetch(`${API}/api/hr-ops/salary-slips${p}`, { credentials: "include" });
    if (r.ok) setSlips(await r.json());
  }
  async function loadLeaveTypes() { const r = await fetch(`${API}/api/hr-ops/leave-types`, { credentials: "include" }); if (r.ok) setLeaveTypes(await r.json()); }
  async function loadEmployees() { const r = await fetch(`${API}/api/payroll/employees`, { credentials: "include" }); if (r.ok) setEmployees(await r.json()); }
  async function loadBalances(empId: string) { if (!empId) return; const r = await fetch(`${API}/api/hr-ops/leave-balances/${empId}`, { credentials: "include" }); if (r.ok) setBalances(await r.json()); }
  async function loadStats() { const r = await fetch(`${API}/api/hr-ops/stats`, { credentials: "include" }); if (r.ok) setStats(await r.json()); }

  useEffect(() => { loadStats(); loadLeaveTypes(); loadEmployees(); }, []);
  useEffect(() => { if (tab === "leaves") loadLeaves(); else if (tab === "slips") loadSlips(); }, [tab]);

  async function submitLeave() {
    const type = leaveTypes.find(t => t.id === lTypeId);
    const r = await fetch(`${API}/api/hr-ops/leaves`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: lEmpId, leave_type_id: lTypeId, leave_type_name: type?.name || lTypeName, from_date: lFrom, to_date: lTo, reason: lReason, half_day: lHalfDay }),
    });
    if (r.ok) { flash("✅ Leave request submitted"); setShowLeaveForm(false); setLEmpId(""); setLFrom(""); setLTo(""); loadLeaves(); }
    else flash("❌ Failed to submit leave request");
  }

  async function submitSlip() {
    const gross = Number(sBasic) + Number(sHRA) + Number(sConv) + Number(sOtherAllow);
    const deductions = Number(sPF) + Number(sESI) + Number(sTDS) + Number(sAdvDed);
    const r = await fetch(`${API}/api/hr-ops/salary-slips/generate`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: sEmpId, month: sMonth, year: sYear, basic_salary: Number(sBasic), hra: Number(sHRA), conveyance: Number(sConv), other_allowances: Number(sOtherAllow), pf_deduction: Number(sPF), esi_deduction: Number(sESI), tds_deduction: Number(sTDS), advance_deduction: Number(sAdvDed), days_present: Number(sDaysPresent) }),
    });
    if (r.ok) { flash("✅ Salary slip generated"); setShowSlipForm(false); setSEmpId(""); setSBasic(""); loadSlips(); }
    else flash("❌ Failed to generate slip");
  }

  async function approveLeave(id: string) { const r = await fetch(`${API}/api/hr-ops/leaves/${id}/approve`, { method: "POST", credentials: "include" }); if (r.ok) { flash("✅ Approved"); loadLeaves(); } }
  async function rejectLeave(id: string) { const reason = prompt("Rejection reason:"); if (reason === null) return; const r = await fetch(`${API}/api/hr-ops/leaves/${id}/reject`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }); if (r.ok) { flash("✅ Rejected"); loadLeaves(); } }
  async function paySlip(id: string) { const r = await fetch(`${API}/api/hr-ops/salary-slips/${id}/pay`, { method: "POST", credentials: "include" }); if (r.ok) { flash("✅ Marked as paid"); loadSlips(); } }

  const gross = (Number(sBasic) + Number(sHRA) + Number(sConv) + Number(sOtherAllow));
  const deductions = (Number(sPF) + Number(sESI) + Number(sTDS) + Number(sAdvDed));
  const net = gross - deductions;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">👥 HR Operations Center</h1>
            <p className="text-sm text-gray-500 mt-1">Leave management, salary slips & HR analytics</p>
          </div>
          <div className="flex gap-2">
            {tab === "leaves" && <button onClick={() => setShowLeaveForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Leave Request</button>}
            {tab === "slips" && <button onClick={() => setShowSlipForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">+ Generate Slip</button>}
          </div>
        </div>
        {msg && <div className="mt-2 p-3 bg-green-50 text-green-800 rounded-lg text-sm">{msg}</div>}
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4 px-6 py-4">
          {[
            { label: "Active Employees", value: String(stats.employees?.active ?? 0), icon: "👥" },
            { label: "Pending Leaves", value: String(stats.leaves?.pending ?? 0), icon: "⏳" },
            { label: "Approved Leaves", value: String(stats.leaves?.approved ?? 0), icon: "✅" },
            { label: "Payroll This Month", value: fmt(stats.payroll_this_month?.total_payroll ?? 0), icon: "💰" },
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
          {(["leaves", "balances", "slips", "types"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"}`}>
              {t === "leaves" ? "📅 Leave Requests" : t === "balances" ? "📊 Leave Balances" : t === "slips" ? "💰 Salary Slips" : "⚙️ Leave Types"}
            </button>
          ))}
        </div>

        {/* Leave Requests */}
        {tab === "leaves" && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{["Employee", "Dept", "Type", "From", "To", "Days", "Reason", "Status", "Actions"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {leaves.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-medium">{l.employee_name || l.employee_id}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{l.department || "—"}</td>
                    <td className="px-3 py-3">{l.leave_type_name || "—"}</td>
                    <td className="px-3 py-3 text-gray-600">{l.from_date}</td>
                    <td className="px-3 py-3 text-gray-600">{l.to_date}</td>
                    <td className="px-3 py-3 font-semibold">{l.half_day ? "0.5" : l.days}</td>
                    <td className="px-3 py-3 text-gray-500 max-w-xs truncate">{l.reason || "—"}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEAVE_STATUS[l.status] || "bg-gray-100 text-gray-700"}`}>{l.status}</span></td>
                    <td className="px-3 py-3">
                      {l.status === "pending" && (
                        <div className="flex gap-1">
                          <button onClick={() => approveLeave(l.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Approve</button>
                          <button onClick={() => rejectLeave(l.id)} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && leaves.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No leave requests</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Leave Balances */}
        {tab === "balances" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border shadow-sm p-4 flex gap-3">
              <select value={selectedEmp} onChange={e => { setSelectedEmp(e.target.value); loadBalances(e.target.value); }} className="border rounded-lg px-3 py-2 text-sm flex-1">
                <option value="">Select Employee...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.department || "No Dept"}</option>)}
              </select>
            </div>
            {balances.length > 0 ? (
              <div className="grid grid-cols-3 gap-4">
                {balances.map(b => (
                  <div key={b.id} className="bg-white rounded-xl border shadow-sm p-4">
                    <div className="font-semibold text-gray-900 mb-2">{b.type_name || b.leave_type_name}</div>
                    <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">Allocated</span><span className="font-medium">{b.allocated} days</span></div>
                    <div className="flex justify-between text-sm mb-1"><span className="text-gray-500">Used</span><span className="text-red-600 font-medium">{b.used} days</span></div>
                    <div className="flex justify-between text-sm mb-3"><span className="text-gray-500">Pending</span><span className="text-yellow-600 font-medium">{b.pending} days</span></div>
                    <div className="flex justify-between text-sm font-semibold border-t pt-2">
                      <span>Balance</span>
                      <span className={b.balance > 0 ? "text-green-600" : "text-red-600"}>{b.balance} days</span>
                    </div>
                    <div className="mt-2 bg-gray-100 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: `${b.allocated > 0 ? Math.max(0, (b.balance / b.allocated)) * 100 : 0}%` }} />
                    </div>
                    <div className="flex gap-2 mt-2 text-xs text-gray-400">
                      {b.is_paid && <span className="bg-green-50 text-green-700 px-1 rounded">Paid</span>}
                      {b.carry_forward && <span className="bg-blue-50 text-blue-700 px-1 rounded">Carry-forward</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400">Select an employee to view leave balances</div>
            )}
          </div>
        )}

        {/* Salary Slips */}
        {tab === "slips" && (
          <>
            <div className="mb-3 flex gap-2">
              <select value={selectedEmp} onChange={e => { setSelectedEmp(e.target.value); loadSlips(e.target.value || undefined); }} className="border rounded-lg px-3 py-2 text-sm">
                <option value="">All Employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>{["Employee", "Dept", "Period", "Basic", "Gross", "Deductions", "Net Salary", "Status", "Actions"].map(h => <th key={h} className="px-3 py-3 text-left font-medium text-gray-700">{h}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {slips.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium">{s.employee_name || s.employee_id}</td>
                      <td className="px-3 py-3 text-xs text-gray-500">{s.department || "—"}</td>
                      <td className="px-3 py-3 font-mono text-gray-600">{`${s.year}-${String(s.month).padStart(2, "0")}`}</td>
                      <td className="px-3 py-3">{fmt(s.basic_salary)}</td>
                      <td className="px-3 py-3 font-semibold text-green-600">{fmt(s.gross_salary)}</td>
                      <td className="px-3 py-3 text-red-600">{fmt(s.total_deductions)}</td>
                      <td className="px-3 py-3 font-bold">{fmt(s.net_salary)}</td>
                      <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SLIP_STATUS[s.status] || "bg-gray-100 text-gray-700"}`}>{s.status}</span></td>
                      <td className="px-3 py-3">{s.status === "draft" && <button onClick={() => paySlip(s.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Mark Paid</button>}</td>
                    </tr>
                  ))}
                  {slips.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No salary slips generated</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Leave Types */}
        {tab === "types" && (
          <div className="space-y-3">
            {leaveTypes.map(t => (
              <div key={t.id} className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{t.name}</div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    {t.is_paid && <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">Paid</span>}
                    {t.carry_forward && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Carry-forward</span>}
                    {!t.is_paid && <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded">Unpaid</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-indigo-600">{t.days_allowed}</div>
                  <div className="text-xs text-gray-400">days/year</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leave Form Modal */}
      {showLeaveForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">New Leave Request</h2></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label><select value={lEmpId} onChange={e => setLEmpId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select employee</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.department || ""}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label><select value={lTypeId} onChange={e => { setLTypeId(e.target.value); setLTypeName(leaveTypes.find(t => t.id === e.target.value)?.name || ""); }} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select type</option>{leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.days_allowed} days)</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">From Date *</label><input type="date" value={lFrom} onChange={e => setLFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">To Date *</label><input type="date" value={lTo} onChange={e => setLTo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div><label className="flex items-center gap-2 text-sm font-medium text-gray-700"><input type="checkbox" checked={lHalfDay} onChange={e => setLHalfDay(e.target.checked)} className="rounded" /> Half Day</label></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Reason</label><textarea value={lReason} onChange={e => setLReason(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} /></div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowLeaveForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitLeave} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Submit Request</button>
            </div>
          </div>
        </div>
      )}

      {/* Salary Slip Form Modal */}
      {showSlipForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-4">
            <div className="p-6 border-b"><h2 className="text-xl font-bold">Generate Salary Slip</h2></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1"><label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label><select value={sEmpId} onChange={e => setSEmpId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">Select</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Month</label><select value={sMonth} onChange={e => setSMonth(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm">{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString("en", { month: "long" })}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Year</label><input type="number" value={sYear} onChange={e => setSYear(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-green-700 uppercase">💰 Earnings</p>
                  {[["Basic", sBasic, setSBasic], ["HRA", sHRA, setSHRA], ["Conveyance", sConv, setSConv], ["Other Allowances", sOtherAllow, setSOtherAllow]].map(([l, v, s]) => (
                    <div key={l as string}><label className="block text-xs font-medium text-gray-600 mb-1">{l as string}</label><input type="number" value={v as string} onChange={e => (s as any)(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  ))}
                  <div className="bg-green-50 rounded-lg p-2 text-sm font-semibold text-green-700">Gross: {fmt(gross)}</div>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-red-700 uppercase">💸 Deductions</p>
                  {[["PF (Employee)", sPF, setSPF], ["ESI", sESI, setSESI], ["TDS", sTDS, setSTDS], ["Advance Recovery", sAdvDed, setSAdvDed]].map(([l, v, s]) => (
                    <div key={l as string}><label className="block text-xs font-medium text-gray-600 mb-1">{l as string}</label><input type="number" value={v as string} onChange={e => (s as any)(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
                  ))}
                  <div className="bg-red-50 rounded-lg p-2 text-sm font-semibold text-red-700">Deductions: {fmt(deductions)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Days Present</label><input type="number" value={sDaysPresent} onChange={e => setSDaysPresent(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className={`rounded-xl p-4 text-center ${net >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <div className="text-sm font-medium text-gray-700">Net Salary</div>
                <div className={`text-3xl font-bold ${net >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(net)}</div>
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => setShowSlipForm(false)} className="flex-1 border text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={submitSlip} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Generate Slip</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
