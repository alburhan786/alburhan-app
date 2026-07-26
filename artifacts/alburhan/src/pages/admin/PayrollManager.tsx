import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, RefreshCw, Download, FileText, Users, Calculator } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = import.meta.env.VITE_API_URL || "";
const COMPANY = "Al Burhan Tours & Travels";
const COMPANY_ADDRESS = "Contact: +91 98939 89786 | alburhantravels.online";

function fmt(n: number) {
  return "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

const TABS = ["employees", "payroll", "advances", "register"] as const;
type Tab = typeof TABS[number];

const DEPARTMENTS = ["Management", "Operations", "Sales", "Finance", "IT", "Admin", "Field Staff", "Other"];
const DESIGNATIONS = ["Manager", "Assistant Manager", "Executive", "Senior Executive", "Officer", "Staff", "Supervisor", "Other"];

const EMPTY_EMP = {
  name: "", designation: "", department: "", mobile: "", email: "",
  bank_account: "", ifsc: "", pan: "", pf_number: "", esi_number: "",
  joining_date: "", basic_salary: "", hra: "", notes: "",
  allowances: { transport: "", medical: "", special: "" },
};

const EMPTY_RUN = {
  employee_id: "", month: new Date().toISOString().slice(0, 7),
  present_days: "26", working_days: "26",
  advance_deduction: "0", tds_deduction: "0", other_deductions: "0", notes: "",
};

const EMPTY_ADVANCE = {
  employee_id: "", amount: "", date: new Date().toISOString().slice(0, 10), reason: "",
};

export default function PayrollManager() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("employees");
  const [employees, setEmployees] = useState<any[]>([]);
  const [register, setRegister] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [editEmpId, setEditEmpId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState(EMPTY_EMP);
  const [runForm, setRunForm] = useState(EMPTY_RUN);
  const [advanceForm, setAdvanceForm] = useState(EMPTY_ADVANCE);
  const [advances, setAdvances] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [regMonth, setRegMonth] = useState(new Date().toISOString().slice(0, 7));

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/payroll/employees`, { credentials: "include" });
      if (r.ok) setEmployees(await r.json());
    } catch (e: any) {
      toast({ title: "Failed to load employees", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  const loadRegister = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/payroll/register?month=${regMonth}`, { credentials: "include" });
      if (r.ok) setRegister(await r.json());
    } catch (e: any) {
      toast({ title: "Failed to load register", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [regMonth, toast]);

  const loadAdvances = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/payroll/advances`, { credentials: "include" });
      if (r.ok) setAdvances(await r.json());
    } catch (e: any) {
      toast({ title: "Failed to load advances", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (tab === "register") loadRegister();
    if (tab === "advances") loadAdvances();
  }, [tab, loadRegister, loadAdvances]);

  function openAddEmp() { setEditEmpId(null); setEmpForm(EMPTY_EMP); setShowEmpModal(true); }
  function openEditEmp(emp: any) {
    setEditEmpId(emp.id);
    setEmpForm({
      name: emp.name || "", designation: emp.designation || "", department: emp.department || "",
      mobile: emp.mobile || "", email: emp.email || "", bank_account: emp.bank_account || "",
      ifsc: emp.ifsc || "", pan: emp.pan || "", pf_number: emp.pf_number || "",
      esi_number: emp.esi_number || "", joining_date: emp.joining_date || "",
      basic_salary: String(emp.basic_salary || ""), hra: String(emp.hra || ""),
      notes: emp.notes || "", allowances: emp.allowances || { transport: "", medical: "", special: "" },
    });
    setShowEmpModal(true);
  }
  function openRunPayroll(emp?: any) {
    setRunForm({ ...EMPTY_RUN, employee_id: emp?.id || "" });
    setShowRunModal(true);
  }

  async function saveEmployee() {
    if (!empForm.name || !empForm.basic_salary) {
      toast({ title: "Name and basic salary are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const url = editEmpId ? `${API}/api/payroll/employees/${editEmpId}` : `${API}/api/payroll/employees`;
      const r = await fetch(url, {
        method: editEmpId ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(empForm),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: editEmpId ? "Employee updated" : "Employee added" });
      setShowEmpModal(false);
      await loadEmployees();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function runPayroll() {
    if (!runForm.employee_id || !runForm.month) {
      toast({ title: "Employee and month required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/payroll/run`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runForm),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      toast({ title: `Payroll processed — Net: ${fmt(data.net_salary)}` });
      setShowRunModal(false);
      if (tab === "register") await loadRegister();
      else setTab("register");
    } catch (e: any) {
      toast({ title: "Payroll failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function deleteEmployee(id: string, name: string) {
    if (!confirm(`Deactivate "${name}"?`)) return;
    const r = await fetch(`${API}/api/payroll/employees/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { toast({ title: "Employee deactivated" }); await loadEmployees(); }
    else toast({ title: "Failed", variant: "destructive" });
  }

  function exportRegister() {
    const rows = register.map(r => ({
      "Month": r.month, "Employee": r.employee_name, "Designation": r.designation || "",
      "Department": r.department || "", "Working Days": r.working_days, "Present Days": r.present_days,
      "Basic (₹)": r.basic_salary, "HRA (₹)": r.hra, "Gross (₹)": r.gross_salary,
      "PF Deduction (₹)": r.pf_deduction, "ESI Deduction (₹)": r.esi_deduction,
      "TDS (₹)": r.tds_deduction, "Advance (₹)": r.advance_deduction,
      "Other Deductions (₹)": r.other_deductions, "Total Deductions (₹)": r.total_deductions,
      "Net Salary (₹)": r.net_salary,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Salary Register");
    XLSX.writeFile(wb, `salary-register-${regMonth}.xlsx`);
  }

  async function printPayslip(runId: string) {
    try {
      const r = await fetch(`${API}/api/payroll/payslip/${runId}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      const W = doc.internal.pageSize.getWidth();
      let y = 12;
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text(COMPANY, W / 2, y, { align: "center" }); y += 5;
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text(COMPANY_ADDRESS, W / 2, y, { align: "center" }); y += 5;
      doc.setFontSize(10); doc.setFont("helvetica", "bold");
      doc.text(`SALARY SLIP — ${d.month}`, W / 2, y, { align: "center" }); y += 7;
      // Employee details
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      const empInfo = [
        ["Name:", d.employee_name, "Designation:", d.designation || "—"],
        ["Department:", d.department || "—", "PAN:", d.pan || "—"],
        ["PF No.:", d.pf_number || "—", "ESI No.:", d.esi_number || "—"],
        ["Bank A/C:", d.bank_account || "—", "IFSC:", d.ifsc || "—"],
        ["Working Days:", String(d.working_days), "Present Days:", String(d.present_days)],
      ];
      empInfo.forEach(row => {
        doc.setFont("helvetica", "bold"); doc.text(row[0], 12, y);
        doc.setFont("helvetica", "normal"); doc.text(row[1], 38, y);
        doc.setFont("helvetica", "bold"); doc.text(row[2], 85, y);
        doc.setFont("helvetica", "normal"); doc.text(row[3], 110, y);
        y += 5;
      });
      y += 2;
      // Earnings vs Deductions table
      const allowances = d.allowances || {};
      const earnRows: any[] = [
        ["Basic Salary", fmt(d.basic_salary)],
        ["HRA", fmt(d.hra)],
      ];
      Object.entries(allowances).forEach(([k, v]) => {
        if (v && parseFloat(String(v)) > 0) earnRows.push([k.charAt(0).toUpperCase() + k.slice(1) + " Allowance", fmt(parseFloat(String(v)))]);
      });
      earnRows.push(["GROSS SALARY", fmt(d.gross_salary)]);
      const dedRows: any[] = [
        ["PF (Employer 12%)", fmt(d.pf_deduction)],
        ["ESI (0.75%)", fmt(d.esi_deduction)],
        ["TDS", fmt(d.tds_deduction)],
        ["Advance Recovery", fmt(d.advance_deduction)],
        ["Other Deductions", fmt(d.other_deductions)],
        ["TOTAL DEDUCTIONS", fmt(d.total_deductions)],
      ];
      const maxRows = Math.max(earnRows.length, dedRows.length);
      const tableBody = Array.from({ length: maxRows }, (_, i) => [
        earnRows[i]?.[0] || "", earnRows[i]?.[1] || "",
        dedRows[i]?.[0] || "", dedRows[i]?.[1] || "",
      ]);
      (autoTable as any)(doc, {
        startY: y,
        head: [["Earnings", "Amount", "Deductions", "Amount"]],
        body: tableBody,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [13, 80, 64] },
        columnStyles: { 1: { halign: "right" }, 3: { halign: "right" } },
        margin: { left: 10, right: 10 },
      });
      y = (doc as any).lastAutoTable.finalY + 5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(`NET SALARY: ${fmt(d.net_salary)}`, W / 2, y, { align: "center" });
      y += 6;
      doc.setFontSize(7); doc.setFont("helvetica", "italic");
      doc.text("This is a computer-generated payslip and does not require a signature.", W / 2, y, { align: "center" });
      doc.save(`payslip-${d.employee_name}-${d.month}.pdf`);
    } catch (e: any) {
      toast({ title: "Failed to generate payslip", description: e.message, variant: "destructive" });
    }
  }

  async function saveAdvance() {
    if (!advanceForm.employee_id || !advanceForm.amount || !advanceForm.date) {
      toast({ title: "Employee, amount and date are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/payroll/advances`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(advanceForm),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Advance recorded — will auto-deduct in next payroll run" });
      setShowAdvanceModal(false);
      setAdvanceForm(EMPTY_ADVANCE);
      await loadAdvances();
    } catch (e: any) {
      toast({ title: "Failed to record advance", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function cancelAdvance(id: string) {
    if (!confirm("Cancel this advance?")) return;
    const r = await fetch(`${API}/api/payroll/advances/${id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (r.ok) { toast({ title: "Advance cancelled" }); await loadAdvances(); }
    else toast({ title: "Failed to cancel advance", variant: "destructive" });
  }

  const tabLabels: Record<Tab, string> = {
    employees: "Employees",
    payroll: "Run Payroll",
    advances: "Advances",
    register: "Salary Register",
  };

  const runPreview = (() => {
    const emp = employees.find(e => e.id === runForm.employee_id);
    if (!emp) return null;
    const wd = parseFloat(runForm.working_days || "26") || 26;
    const pd = parseFloat(runForm.present_days || "26") || 26;
    const ratio = Math.min(pd / wd, 1);
    const basic = parseFloat(emp.basic_salary || 0) * ratio;
    const hra = parseFloat(emp.hra || 0) * ratio;
    const allowTotal = Object.values(emp.allowances as Record<string, any> || {}).reduce((s: number, v: any) => s + parseFloat(v || 0), 0) * ratio;
    const gross = basic + hra + allowTotal;
    const pf = basic <= 15000 ? basic * 0.12 : 1800;
    const esi = gross <= 21000 ? gross * 0.0075 : 0;
    const tds = parseFloat(runForm.tds_deduction || "0");
    const advance = parseFloat(runForm.advance_deduction || "0");
    const other = parseFloat(runForm.other_deductions || "0");
    const totalDed = pf + esi + tds + advance + other;
    const net = Math.max(0, gross - totalDed);
    return { basic, hra, gross, pf, esi, tds, advance, other, totalDed, net };
  })();

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0d5040]">Payroll Management</h1>
            <p className="text-sm text-muted-foreground">Employee salaries, payslips & salary register</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadEmployees(); if (tab === "register") loadRegister(); }} disabled={loading}>
              <RefreshCw size={14} className={`mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            {tab === "employees" && (
              <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={openAddEmp}>
                <Plus size={14} className="mr-1.5" />Add Employee
              </Button>
            )}
            {tab === "payroll" && (
              <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]" onClick={() => openRunPayroll()}>
                <Calculator size={14} className="mr-1.5" />Process Payroll
              </Button>
            )}
            {tab === "register" && (
              <>
                <Input type="month" value={regMonth} onChange={e => setRegMonth(e.target.value)} className="h-8 text-sm w-36" />
                <Button variant="outline" size="sm" onClick={loadRegister}><RefreshCw size={14} /></Button>
                <Button variant="outline" size="sm" onClick={exportRegister} disabled={!register.length}>
                  <Download size={14} className="mr-1.5" />Export Excel
                </Button>
              </>
            )}
            {tab === "advances" && (
              <Button size="sm" className="bg-[#0d5040] hover:bg-[#0a3d30]"
                onClick={() => { setAdvanceForm(EMPTY_ADVANCE); setShowAdvanceModal(true); }}>
                <Plus size={14} className="mr-1.5" />Record Advance
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-[#0d5040]" : "text-muted-foreground hover:text-foreground"}`}>
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        {tab === "employees" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Total Employees</p>
              <p className="text-2xl font-bold text-[#0d5040] mt-1">{employees.length}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Total Monthly CTC</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{fmt(employees.reduce((s, e) => s + parseFloat(e.total_salary || 0), 0))}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Avg. Salary</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{employees.length ? fmt(employees.reduce((s, e) => s + parseFloat(e.total_salary || 0), 0) / employees.length) : "—"}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Departments</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{new Set(employees.map(e => e.department).filter(Boolean)).size}</p>
            </div>
          </div>
        )}

        {/* ADVANCES TAB */}
        {tab === "advances" && (
          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground">Loading…</div>
            ) : advances.length === 0 ? (
              <div className="py-16 text-center">
                <FileText size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No salary advances recorded yet</p>
                <Button size="sm" className="mt-3 bg-[#0d5040]"
                  onClick={() => { setAdvanceForm(EMPTY_ADVANCE); setShowAdvanceModal(true); }}>
                  <Plus size={13} className="mr-1" />Record First Advance
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Employee</th>
                      <th className="px-4 py-2.5 text-left">Date</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      <th className="px-4 py-2.5 text-left">Reason</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {advances.map(adv => (
                      <tr key={adv.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-medium">{adv.employee_name}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{adv.date}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{fmt(parseFloat(adv.amount))}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{adv.reason || "—"}</td>
                        <td className="px-4 py-2.5">
                          {adv.status === "pending" && (
                            <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-0">Pending — Auto-deduct</Badge>
                          )}
                          {adv.status === "deducted" && (
                            <Badge className="text-[10px] bg-green-100 text-green-800 border-0">Deducted</Badge>
                          )}
                          {adv.status === "cancelled" && (
                            <Badge className="text-[10px] bg-gray-100 text-gray-500 border-0">Cancelled</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {adv.status === "pending" && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:bg-red-50"
                              onClick={() => cancelAdvance(adv.id)}>
                              Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t font-semibold text-xs">
                    <tr>
                      <td colSpan={2} className="px-4 py-2.5">
                        Pending: {advances.filter(a => a.status === "pending").length} | Total Pending:
                      </td>
                      <td className="px-4 py-2.5 text-right text-yellow-700">
                        {fmt(advances.filter(a => a.status === "pending").reduce((s, a) => s + parseFloat(a.amount || 0), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* EMPLOYEES TAB */}
        {tab === "employees" && (
          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground">Loading…</div>
            ) : employees.length === 0 ? (
              <div className="py-16 text-center">
                <Users size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No employees added yet</p>
                <Button size="sm" className="mt-3 bg-[#0d5040]" onClick={openAddEmp}><Plus size={13} className="mr-1" />Add First Employee</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Name</th>
                      <th className="px-4 py-2.5 text-left">Designation</th>
                      <th className="px-4 py-2.5 text-left">Department</th>
                      <th className="px-4 py-2.5 text-left">Mobile</th>
                      <th className="px-4 py-2.5 text-right">Basic</th>
                      <th className="px-4 py-2.5 text-right">HRA</th>
                      <th className="px-4 py-2.5 text-right">Gross CTC</th>
                      <th className="px-4 py-2.5 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {employees.map(emp => (
                      <tr key={emp.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-medium text-sm">{emp.name}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{emp.designation || "—"}</td>
                        <td className="px-4 py-2.5 text-xs">
                          {emp.department ? <Badge className="text-[10px] bg-blue-100 text-blue-800 border-0">{emp.department}</Badge> : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{emp.mobile || "—"}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{fmt(parseFloat(emp.basic_salary))}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{fmt(parseFloat(emp.hra))}</td>
                        <td className="px-4 py-2.5 text-right font-bold">{fmt(parseFloat(emp.total_salary))}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openRunPayroll(emp)}>
                              <Calculator size={11} className="mr-1" />Pay
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditEmp(emp)}><Pencil size={12} /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteEmployee(emp.id, emp.name)}><Trash2 size={12} /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* RUN PAYROLL TAB */}
        {tab === "payroll" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-5 space-y-3">
              <h3 className="font-semibold text-sm">Process Monthly Payroll</h3>
              <div>
                <label className="text-xs font-medium">Employee *</label>
                <select value={runForm.employee_id} onChange={e => setRunForm(f => ({ ...f, employee_id: e.target.value }))}
                  className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  <option value="">— Select Employee —</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} — {fmt(parseFloat(emp.total_salary))}/mo</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium">Month *</label>
                  <Input type="month" value={runForm.month} onChange={e => setRunForm(f => ({ ...f, month: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium">Working Days</label>
                  <Input type="number" value={runForm.working_days} onChange={e => setRunForm(f => ({ ...f, working_days: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium">Present Days</label>
                  <Input type="number" value={runForm.present_days} onChange={e => setRunForm(f => ({ ...f, present_days: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium">TDS (₹)</label>
                  <Input type="number" value={runForm.tds_deduction} onChange={e => setRunForm(f => ({ ...f, tds_deduction: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium">Advance (₹)</label>
                  <Input type="number" value={runForm.advance_deduction} onChange={e => setRunForm(f => ({ ...f, advance_deduction: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium">Other Ded. (₹)</label>
                  <Input type="number" value={runForm.other_deductions} onChange={e => setRunForm(f => ({ ...f, other_deductions: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Notes</label>
                <Input value={runForm.notes} onChange={e => setRunForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" className="mt-1 h-9 text-sm" />
              </div>
              <Button className="w-full bg-[#0d5040] hover:bg-[#0a3d30]" onClick={runPayroll} disabled={saving}>
                {saving ? "Processing…" : "Process & Save Payroll"}
              </Button>
            </div>

            {/* Preview */}
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-sm mb-3">Payslip Preview</h3>
              {!runPreview ? (
                <p className="text-muted-foreground text-sm">Select an employee to preview the payslip</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Earnings</p>
                    <div className="flex justify-between text-xs"><span>Basic Salary</span><span className="font-medium">{fmt(runPreview.basic)}</span></div>
                    <div className="flex justify-between text-xs"><span>HRA</span><span className="font-medium">{fmt(runPreview.hra)}</span></div>
                    <div className="flex justify-between text-xs font-semibold border-t pt-1.5 mt-1.5"><span>Gross Salary</span><span>{fmt(runPreview.gross)}</span></div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Deductions</p>
                    <div className="flex justify-between text-xs"><span>PF (12% of basic)</span><span className="font-medium text-red-600">{fmt(runPreview.pf)}</span></div>
                    <div className="flex justify-between text-xs"><span>ESI (0.75%)</span><span className="font-medium text-red-600">{fmt(runPreview.esi)}</span></div>
                    <div className="flex justify-between text-xs"><span>TDS</span><span className="font-medium text-red-600">{fmt(runPreview.tds)}</span></div>
                    <div className="flex justify-between text-xs"><span>Advance</span><span className="font-medium text-red-600">{fmt(runPreview.advance)}</span></div>
                    <div className="flex justify-between text-xs"><span>Other</span><span className="font-medium text-red-600">{fmt(runPreview.other)}</span></div>
                    <div className="flex justify-between text-xs font-semibold border-t pt-1.5 mt-1.5 text-red-700"><span>Total Deductions</span><span>{fmt(runPreview.totalDed)}</span></div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 flex justify-between items-center">
                    <span className="font-bold">NET SALARY</span>
                    <span className="text-xl font-bold text-green-700">{fmt(runPreview.net)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SALARY REGISTER TAB */}
        {tab === "register" && (
          <div className="bg-white rounded-xl border overflow-hidden">
            {loading ? (
              <div className="py-16 text-center text-muted-foreground">Loading…</div>
            ) : register.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                No payroll runs for {regMonth}. Process payroll from the "Run Payroll" tab.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Employee</th>
                      <th className="px-3 py-2.5 text-left">Dept</th>
                      <th className="px-3 py-2.5 text-center">Days</th>
                      <th className="px-3 py-2.5 text-right">Basic</th>
                      <th className="px-3 py-2.5 text-right">Gross</th>
                      <th className="px-3 py-2.5 text-right">PF</th>
                      <th className="px-3 py-2.5 text-right">ESI</th>
                      <th className="px-3 py-2.5 text-right">Ded.</th>
                      <th className="px-3 py-2.5 text-right">Net</th>
                      <th className="px-3 py-2.5 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {register.map(r => (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium text-sm">{r.employee_name}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.department || "—"}</td>
                        <td className="px-3 py-2.5 text-center text-xs">{r.present_days}/{r.working_days}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(parseFloat(r.basic_salary))}</td>
                        <td className="px-3 py-2.5 text-right text-xs">{fmt(parseFloat(r.gross_salary))}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-red-600">{fmt(parseFloat(r.pf_deduction))}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-red-600">{fmt(parseFloat(r.esi_deduction))}</td>
                        <td className="px-3 py-2.5 text-right text-xs text-red-600">{fmt(parseFloat(r.total_deductions))}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-green-700">{fmt(parseFloat(r.net_salary))}</td>
                        <td className="px-3 py-2.5">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => printPayslip(r.id)}>
                            <FileText size={11} className="mr-1" />Payslip
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t font-semibold text-xs">
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5">TOTAL ({register.length})</td>
                      <td className="px-3 py-2.5 text-right">{fmt(register.reduce((s, r) => s + parseFloat(r.basic_salary || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(register.reduce((s, r) => s + parseFloat(r.gross_salary || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-red-600">{fmt(register.reduce((s, r) => s + parseFloat(r.pf_deduction || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-red-600">{fmt(register.reduce((s, r) => s + parseFloat(r.esi_deduction || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-red-600">{fmt(register.reduce((s, r) => s + parseFloat(r.total_deductions || 0), 0))}</td>
                      <td className="px-3 py-2.5 text-right text-green-700">{fmt(register.reduce((s, r) => s + parseFloat(r.net_salary || 0), 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Record Advance Modal */}
      <Dialog open={showAdvanceModal} onOpenChange={setShowAdvanceModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Salary Advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium">Employee *</label>
              <select value={advanceForm.employee_id}
                onChange={e => setAdvanceForm(f => ({ ...f, employee_id: e.target.value }))}
                className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                <option value="">— Select Employee —</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.department || "—"})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Amount (₹) *</label>
                <Input type="number" min="0" value={advanceForm.amount}
                  onChange={e => setAdvanceForm(f => ({ ...f, amount: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Date *</label>
                <Input type="date" value={advanceForm.date}
                  onChange={e => setAdvanceForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Reason</label>
              <Input value={advanceForm.reason}
                onChange={e => setAdvanceForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Medical emergency" className="mt-1" />
            </div>
            <p className="text-xs text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-2">
              This advance will be automatically deducted from the employee's next payroll run.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowAdvanceModal(false)}>Cancel</Button>
              <Button size="sm" className="bg-[#0d5040]" onClick={saveAdvance} disabled={saving}>
                {saving ? "Saving…" : "Record Advance"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Employee Modal */}
      <Dialog open={showEmpModal} onOpenChange={setShowEmpModal}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEmpId ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Full Name *</label>
                <Input value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Mobile</label>
                <Input value={empForm.mobile} onChange={e => setEmpForm(f => ({ ...f, mobile: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Designation</label>
                <select value={empForm.designation} onChange={e => setEmpForm(f => ({ ...f, designation: e.target.value }))}
                  className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  <option value="">— Select —</option>
                  {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Department</label>
                <select value={empForm.department} onChange={e => setEmpForm(f => ({ ...f, department: e.target.value }))}
                  className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                  <option value="">— Select —</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium">Basic Salary *</label>
                <Input type="number" value={empForm.basic_salary} onChange={e => setEmpForm(f => ({ ...f, basic_salary: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">HRA</label>
                <Input type="number" value={empForm.hra} onChange={e => setEmpForm(f => ({ ...f, hra: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Joining Date</label>
                <Input type="date" value={empForm.joining_date} onChange={e => setEmpForm(f => ({ ...f, joining_date: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Allowances</p>
            <div className="grid grid-cols-3 gap-3">
              {(["transport", "medical", "special"] as const).map(k => (
                <div key={k}>
                  <label className="text-xs font-medium capitalize">{k}</label>
                  <Input type="number" value={(empForm.allowances as any)[k] || ""} onChange={e => setEmpForm(f => ({ ...f, allowances: { ...f.allowances, [k]: e.target.value } }))} placeholder="0" className="mt-1" />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground font-medium">Bank & Statutory Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Bank Account</label>
                <Input value={empForm.bank_account} onChange={e => setEmpForm(f => ({ ...f, bank_account: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">IFSC</label>
                <Input value={empForm.ifsc} onChange={e => setEmpForm(f => ({ ...f, ifsc: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">PAN</label>
                <Input value={empForm.pan} onChange={e => setEmpForm(f => ({ ...f, pan: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">Email</label>
                <Input type="email" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">PF Number</label>
                <Input value={empForm.pf_number} onChange={e => setEmpForm(f => ({ ...f, pf_number: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">ESI Number</label>
                <Input value={empForm.esi_number} onChange={e => setEmpForm(f => ({ ...f, esi_number: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <Input value={empForm.notes} onChange={e => setEmpForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-[#0d5040]" onClick={saveEmployee} disabled={saving}>{saving ? "Saving…" : "Save Employee"}</Button>
              <Button variant="outline" onClick={() => setShowEmpModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Process Payroll Quick Modal (from employee row) */}
      <Dialog open={showRunModal} onOpenChange={setShowRunModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Process Payroll</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium">Employee</label>
              <select value={runForm.employee_id} onChange={e => setRunForm(f => ({ ...f, employee_id: e.target.value }))}
                className="mt-1 w-full h-9 px-2 rounded border text-sm bg-background">
                <option value="">— Select —</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium">Month</label>
                <Input type="month" value={runForm.month} onChange={e => setRunForm(f => ({ ...f, month: e.target.value }))} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Working</label>
                <Input type="number" value={runForm.working_days} onChange={e => setRunForm(f => ({ ...f, working_days: e.target.value }))} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">Present</label>
                <Input type="number" value={runForm.present_days} onChange={e => setRunForm(f => ({ ...f, present_days: e.target.value }))} className="mt-1 h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium">Advance (₹)</label>
                <Input type="number" value={runForm.advance_deduction} onChange={e => setRunForm(f => ({ ...f, advance_deduction: e.target.value }))} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium">TDS (₹)</label>
                <Input type="number" value={runForm.tds_deduction} onChange={e => setRunForm(f => ({ ...f, tds_deduction: e.target.value }))} className="mt-1 h-9 text-sm" />
              </div>
            </div>
            {runPreview && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm font-medium">Net Salary</span>
                <span className="text-lg font-bold text-green-700">{fmt(runPreview.net)}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button className="flex-1 bg-[#0d5040]" onClick={runPayroll} disabled={saving}>{saving ? "Processing…" : "Process Payroll"}</Button>
              <Button variant="outline" onClick={() => setShowRunModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
