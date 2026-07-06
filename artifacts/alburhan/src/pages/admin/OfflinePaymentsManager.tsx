import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, CheckCircle, XCircle, AlertTriangle, RefreshCw, Settings, Download, Building2, ExternalLink } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  correction_requested: "bg-orange-100 text-orange-800 border-orange-300",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "🟡 Pending",
  approved: "✅ Approved",
  rejected: "🔴 Rejected",
  correction_requested: "🟠 Correction Needed",
};

type OfflinePayment = {
  id: string;
  booking_id: string;
  booking_number?: string;
  package_name?: string;
  customer_name: string;
  mobile: string;
  email?: string;
  amount_paid: string;
  final_amount?: string;
  payment_date: string;
  payment_time?: string;
  bank_name?: string;
  branch_name?: string;
  payment_method: string;
  utr_number: string;
  sender_account_last4?: string;
  remarks?: string;
  proof_url?: string;
  status: string;
  rejection_reason?: string;
  verified_at?: string;
  verified_by_name?: string;
  created_at: string;
};

type BankSettings = {
  bank_name: string;
  branch: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  swift_code: string;
  upi_id: string;
  qr_code_url: string;
};

export default function OfflinePaymentsManager() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<OfflinePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OfflinePayment | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bankSettings, setBankSettings] = useState<BankSettings>({ bank_name: "", branch: "", account_name: "Al Burhan Tours & Travels", account_number: "", ifsc_code: "", swift_code: "", upi_id: "", qr_code_url: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const loadPayments = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/offline-payments`, { credentials: "include" });
      const d = await r.json();
      setPayments(d.payments || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const loadBankSettings = async () => {
    try {
      const r = await fetch(`${API}/api/offline-payments/bank-settings`, { credentials: "include" });
      const d = await r.json();
      setBankSettings({
        bank_name: d.bank_name || "",
        branch: d.branch || "",
        account_name: d.account_name || "Al Burhan Tours & Travels",
        account_number: d.account_number || "",
        ifsc_code: d.ifsc_code || "",
        swift_code: d.swift_code || "",
        upi_id: d.upi_id || "",
        qr_code_url: d.qr_code_url || "",
      });
    } catch { /* ignore */ }
  };

  useEffect(() => { loadPayments(); loadBankSettings(); }, []);

  const saveBankSettings = async () => {
    setSavingSettings(true);
    try {
      const r = await fetch(`${API}/api/offline-payments/bank-settings`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bankSettings),
      });
      if (!r.ok) throw new Error("Save failed");
      toast({ title: "Bank settings saved!" });
      setSettingsOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSavingSettings(false); }
  };

  const handleApprove = async (p: OfflinePayment) => {
    setActing(true);
    try {
      const r = await fetch(`${API}/api/offline-payments/${p.id}/approve`, { method: "POST", credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Payment approved!", description: "Customer notified via WhatsApp & Email. Invoice generated." });
      setViewOpen(false);
      loadPayments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleReject = async () => {
    if (!selected || !reason.trim()) return;
    setActing(true);
    try {
      const r = await fetch(`${API}/api/offline-payments/${selected.id}/reject`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Payment rejected", description: "Customer notified with reason." });
      setRejectOpen(false); setViewOpen(false); setReason("");
      loadPayments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleRequestCorrection = async () => {
    if (!selected || !reason.trim()) return;
    setActing(true);
    try {
      const r = await fetch(`${API}/api/offline-payments/${selected.id}/request-correction`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reason }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Correction requested", description: "Customer notified." });
      setCorrectionOpen(false); setViewOpen(false); setReason("");
      loadPayments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const filtered = filterStatus === "all" ? payments : payments.filter(p => p.status === filterStatus);

  const stats = {
    pending: payments.filter(p => p.status === "pending").length,
    approved: payments.filter(p => p.status === "approved").length,
    rejected: payments.filter(p => p.status === "rejected").length,
    total_approved: payments.filter(p => p.status === "approved").reduce((s, p) => s + Number(p.amount_paid), 0),
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-serif font-bold">Offline Payments</h1>
            <p className="text-muted-foreground text-sm">Bank Transfer / NEFT / RTGS / IMPS submissions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadPayments}><RefreshCw size={14} className="mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={() => setSettingsOpen(true)} className="bg-primary text-white"><Settings size={14} className="mr-1.5" /> Bank Settings</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Pending", value: stats.pending, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
            { label: "Approved", value: stats.approved, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
            { label: "Rejected", value: stats.rejected, color: "text-red-600 bg-red-50 border-red-200" },
            { label: "Total Verified", value: `₹${stats.total_approved.toLocaleString("en-IN")}`, color: "text-primary bg-primary/5 border-primary/20" },
          ].map(s => (
            <Card key={s.label} className={`p-4 border ${s.color}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap">
          {["all", "pending", "approved", "rejected", "correction_requested"].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium border transition-all ${filterStatus === s ? "bg-primary text-white border-primary" : "bg-white border-gray-200 text-gray-600 hover:border-primary/40"}`}
            >
              {s === "all" ? "All" : STATUS_LABELS[s] || s}
              {s !== "all" && <span className="ml-1 opacity-70">({payments.filter(p => p.status === s).length})</span>}
            </button>
          ))}
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">Loading payments…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No payments found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {["Booking", "Customer", "Package", "Amount", "Method", "UTR", "Date", "Proof", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">#{p.booking_number || p.booking_id.slice(0, 8)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-xs">{p.customer_name}</p>
                        <p className="text-muted-foreground text-xs">{p.mobile}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px] truncate">{p.package_name || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-primary text-xs">₹{Number(p.amount_paid).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-xs">{p.payment_method}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.utr_number}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.payment_date}</td>
                      <td className="px-4 py-3">
                        {p.proof_url ? (
                          <a href={`${API}${p.proof_url}`} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1">
                            <ExternalLink size={10} /> View
                          </a>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] || ""}`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => { setSelected(p); setViewOpen(true); }}>
                            <Eye size={11} className="mr-1" /> View
                          </Button>
                          {p.status === "pending" && (
                            <>
                              <Button size="sm" className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(p)} disabled={acting}>
                                <CheckCircle size={11} className="mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setSelected(p); setReason(""); setRejectOpen(true); }}>
                                <XCircle size={11} className="mr-1" /> Reject
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => { setSelected(p); setReason(""); setCorrectionOpen(true); }}>
                                <AlertTriangle size={11} className="mr-1" /> Correction
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* View Detail Modal */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={18} className="text-primary" />
              Bank Transfer Details
              {selected && <Badge variant="outline" className={STATUS_COLORS[selected.status]}>{STATUS_LABELS[selected.status]}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Booking", `#${selected.booking_number || selected.booking_id.slice(0, 8)}`],
                  ["Customer", selected.customer_name],
                  ["Mobile", selected.mobile],
                  ["Email", selected.email || "—"],
                  ["Amount Paid", `₹${Number(selected.amount_paid).toLocaleString("en-IN")}`],
                  ["Total Amount", selected.final_amount ? `₹${Number(selected.final_amount).toLocaleString("en-IN")}` : "—"],
                  ["Payment Date", selected.payment_date],
                  ["Payment Time", selected.payment_time || "—"],
                  ["Bank Name", selected.bank_name || "—"],
                  ["Branch", selected.branch_name || "—"],
                  ["Payment Method", selected.payment_method],
                  ["UTR Number", selected.utr_number],
                  ["Sender Acct Last 4", selected.sender_account_last4 || "—"],
                  ["Submitted At", new Date(selected.created_at).toLocaleString("en-IN")],
                ].map(([label, val]) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-semibold text-sm mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
              {selected.remarks && (
                <div className="bg-muted/30 rounded-lg p-2.5 text-sm">
                  <p className="text-xs text-muted-foreground">Remarks</p>
                  <p>{selected.remarks}</p>
                </div>
              )}
              {selected.proof_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Payment Proof</p>
                  {selected.proof_url.match(/\.(jpg|jpeg|png)$/i) ? (
                    <img src={`${API}${selected.proof_url}`} alt="proof" className="rounded-lg border max-h-64 object-contain" />
                  ) : (
                    <a href={`${API}${selected.proof_url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-primary hover:underline text-sm">
                      <Download size={14} /> Download Proof PDF
                    </a>
                  )}
                </div>
              )}
              {selected.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <strong>Rejection/Correction Reason:</strong> {selected.rejection_reason}
                </div>
              )}
              {selected.verified_by_name && (
                <div className="text-xs text-muted-foreground">
                  Verified by {selected.verified_by_name} at {selected.verified_at ? new Date(selected.verified_at).toLocaleString("en-IN") : "—"}
                </div>
              )}
              {selected.status === "pending" && (
                <div className="flex gap-2 pt-2 flex-wrap">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(selected)} disabled={acting}>
                    <CheckCircle size={14} className="mr-1.5" /> Approve & Notify
                  </Button>
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setRejectOpen(true); setReason(""); }}>
                    <XCircle size={14} className="mr-1.5" /> Reject
                  </Button>
                  <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => { setCorrectionOpen(true); setReason(""); }}>
                    <AlertTriangle size={14} className="mr-1.5" /> Request Correction
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-red-600">Reject Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">The customer will receive a WhatsApp message with this reason.</p>
            <div>
              <Label>Rejection Reason <span className="text-red-500">*</span></Label>
              <textarea
                className="w-full mt-1 border border-border rounded-lg p-2.5 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="e.g. UTR number does not match, payment amount incorrect…"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleReject} disabled={acting || !reason.trim()}>
                Reject & Notify
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Correction Modal */}
      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-orange-600">Request Correction</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">The customer will be asked to resubmit with the correct details.</p>
            <div>
              <Label>Correction Message <span className="text-red-500">*</span></Label>
              <textarea
                className="w-full mt-1 border border-border rounded-lg p-2.5 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="e.g. Please upload a clearer image of the transfer receipt…"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCorrectionOpen(false)}>Cancel</Button>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleRequestCorrection} disabled={acting || !reason.trim()}>
                Request & Notify
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bank Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 size={18} className="text-primary" /> Bank Settings</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">These details appear on the customer payment page. Changes take effect immediately.</p>
            {[
              { label: "Account Name", key: "account_name" },
              { label: "Bank Name", key: "bank_name" },
              { label: "Branch", key: "branch" },
              { label: "Account Number", key: "account_number" },
              { label: "IFSC Code", key: "ifsc_code" },
              { label: "SWIFT Code (Optional)", key: "swift_code" },
              { label: "UPI ID (Optional)", key: "upi_id" },
              { label: "QR Code Image URL (Optional)", key: "qr_code_url" },
            ].map(({ label, key }) => (
              <div key={key}>
                <Label className="text-xs">{label}</Label>
                <Input
                  className="mt-1 h-9 text-sm"
                  value={(bankSettings as any)[key]}
                  onChange={e => setBankSettings(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button className="bg-primary text-white" onClick={saveBankSettings} disabled={savingSettings}>
                {savingSettings ? "Saving…" : "Save Settings"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
