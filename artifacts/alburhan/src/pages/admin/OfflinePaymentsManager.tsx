import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Eye, CheckCircle, XCircle, AlertTriangle, RefreshCw, Settings,
  Download, Building2, FileText, Clock, Search, Loader2, Copy, X,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const STATUS_COLORS: Record<string, string> = {
  pending:              "bg-amber-100 text-amber-800 border-amber-300",
  approved:             "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected:             "bg-red-100 text-red-800 border-red-300",
  correction_requested: "bg-orange-100 text-orange-800 border-orange-300",
};
const STATUS_LABELS: Record<string, string> = {
  pending:              "Pending Verification",
  approved:             "Verified",
  rejected:             "Rejected",
  correction_requested: "Need Clarification",
};
const STATUS_ICONS: Record<string, React.ElementType> = {
  pending:              Clock,
  approved:             CheckCircle,
  rejected:             XCircle,
  correction_requested: AlertTriangle,
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
  paid_amount?: string;
  payment_date: string;
  payment_time?: string;
  bank_name?: string;
  branch_name?: string;
  payment_method: string;
  utr_number: string;
  sender_account_last4?: string;
  remarks?: string;
  proof_url?: string;
  payment_reference?: string;
  admin_remarks?: string;
  status: string;
  rejection_reason?: string;
  verified_at?: string;
  verified_by_name?: string;
  created_at: string;
};

type BankSettings = {
  bank_name: string; branch: string; account_name: string; account_number: string;
  ifsc_code: string; swift_code: string; upi_id: string; qr_code_url: string;
};

const TABS = [
  { key: "all",                 label: "All",                icon: Building2 },
  { key: "pending",             label: "Pending Verification", icon: Clock },
  { key: "approved",            label: "Verified",           icon: CheckCircle },
  { key: "rejected",            label: "Rejected",           icon: XCircle },
  { key: "correction_requested",label: "Need Clarification", icon: AlertTriangle },
] as const;

function ProofPreview({ payment }: { payment: OfflinePayment }) {
  const [enlarged, setEnlarged] = useState(false);
  if (!payment.proof_url) return <p className="text-sm text-muted-foreground italic">No receipt uploaded</p>;

  const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(payment.proof_url) ||
    ["image/jpeg","image/jpg","image/png","image/webp"].some(t => payment.proof_url?.includes(t));
  const isPdf = /\.pdf(\?|$)/i.test(payment.proof_url) || payment.proof_url?.includes("pdf");
  const proofSrc = payment.proof_url.startsWith("http") ? payment.proof_url : `${API}${payment.proof_url}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <a href={proofSrc} target="_blank" rel="noreferrer" download
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/5 transition-colors">
          <Download size={12} /> Download Receipt
        </a>
        <a href={proofSrc} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          <Eye size={12} /> Open in new tab
        </a>
      </div>
      {isImage && (
        <>
          <img
            src={proofSrc}
            alt="Payment receipt"
            className="rounded-xl border max-h-52 object-contain cursor-zoom-in w-full"
            onClick={() => setEnlarged(true)}
          />
          {enlarged && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setEnlarged(false)}>
              <button className="absolute top-4 right-4 text-white" onClick={() => setEnlarged(false)}><X size={24} /></button>
              <img src={proofSrc} alt="Enlarged receipt" className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl" />
            </div>
          )}
        </>
      )}
      {isPdf && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <FileText size={28} className="text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">PDF Receipt</p>
            <p className="text-xs text-muted-foreground">Click the download button above to view</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OfflinePaymentsManager() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<OfflinePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OfflinePayment | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [adminRemarks, setAdminRemarks] = useState("");
  const [acting, setActing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bankSettings, setBankSettings] = useState<BankSettings>({
    bank_name: "", branch: "", account_name: "Al Burhan Tours & Travels",
    account_number: "", ifsc_code: "", swift_code: "", upi_id: "", qr_code_url: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, need_clarification: 0, total_approved_amount: "0" });

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/offline-payments`, { credentials: "include" });
      const d = await r.json();
      setPayments(d.payments || []);
    } catch { } finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/offline-payments/admin/stats`, { credentials: "include" });
      const d = await r.json();
      setStats(d);
    } catch { }
  }, []);

  const loadBankSettings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/offline-payments/bank-settings`, { credentials: "include" });
      const d = await r.json();
      setBankSettings({
        bank_name: d.bank_name || "", branch: d.branch || "",
        account_name: d.account_name || "Al Burhan Tours & Travels",
        account_number: d.account_number || "", ifsc_code: d.ifsc_code || "",
        swift_code: d.swift_code || "", upi_id: d.upi_id || "", qr_code_url: d.qr_code_url || "",
      });
    } catch { }
  }, []);

  useEffect(() => { loadPayments(); loadBankSettings(); loadStats(); }, []);

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

  const handleApprove = async () => {
    if (!selected) return;
    setActing(true);
    try {
      const r = await fetch(`${API}/api/offline-payments/${selected.id}/approve`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminRemarks }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "✅ Payment approved!", description: "Ledger updated. Customer notified via WhatsApp, SMS & Email." });
      setApproveOpen(false); setViewOpen(false); setAdminRemarks("");
      loadPayments(); loadStats();
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
        body: JSON.stringify({ reason, adminRemarks }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Payment rejected", description: "Customer notified with reason." });
      setRejectOpen(false); setViewOpen(false); setReason(""); setAdminRemarks("");
      loadPayments(); loadStats();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const handleClarification = async () => {
    if (!selected || !reason.trim()) return;
    setActing(true);
    try {
      const r = await fetch(`${API}/api/offline-payments/${selected.id}/request-correction`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reason, adminRemarks }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      toast({ title: "Clarification requested", description: "Customer notified." });
      setClarificationOpen(false); setViewOpen(false); setReason(""); setAdminRemarks("");
      loadPayments(); loadStats();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setActing(false); }
  };

  const copyRef = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: "Copied!" });
  };

  const filtered = payments
    .filter(p => activeTab === "all" || p.status === activeTab)
    .filter(p => !search || [p.customer_name, p.mobile, p.utr_number, p.booking_number, p.payment_reference].some(v => v?.toLowerCase().includes(search.toLowerCase())));

  const tabCount = (key: string) =>
    key === "all" ? payments.length : payments.filter(p => p.status === key).length;

  const totalVerified = Number(stats.total_approved_amount || 0);

  return (
    <AdminLayout>
      <div className="space-y-5 p-1">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Offline Payment Verification</h1>
            <p className="text-muted-foreground text-xs mt-0.5">Bank Transfer · NEFT · RTGS · IMPS · UPI · Cash Deposit · Cheque</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { loadPayments(); loadStats(); }}>
              <RefreshCw size={12} className="mr-1.5" /> Refresh
            </Button>
            <Button size="sm" className="h-8 text-xs bg-primary text-white" onClick={() => setSettingsOpen(true)}>
              <Settings size={12} className="mr-1.5" /> Bank Settings
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Pending Verification", value: stats.pending, color: "text-amber-700 bg-amber-50 border-amber-200" },
            { label: "Verified", value: stats.approved, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
            { label: "Rejected", value: stats.rejected, color: "text-red-700 bg-red-50 border-red-200" },
            { label: "Total Verified Amount", value: `₹${Number(totalVerified).toLocaleString("en-IN")}`, color: "text-primary bg-primary/5 border-primary/20" },
          ].map(s => (
            <Card key={s.label} className={`p-4 border ${s.color}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{s.label}</p>
              <p className="text-xl font-bold mt-1">{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Tabs + Search */}
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <div className="flex gap-1 flex-wrap">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const count = tabCount(tab.key);
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full font-medium border transition-all ${activeTab === tab.key ? "bg-primary text-white border-primary shadow-sm" : "bg-white border-gray-200 text-gray-600 hover:border-primary/40"}`}>
                  <Icon size={11} />{tab.label}
                  <span className={`ml-0.5 ${activeTab === tab.key ? "opacity-80" : "opacity-60"}`}>({count})</span>
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search name, UTR, ref…" value={search} onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 text-xs border rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-primary/40" />
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden border">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading payments…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No payments found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {["Reference", "Booking", "Customer", "Package", "Amount", "Method", "UTR", "Date", "Receipt", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(p => {
                    const StatusIcon = STATUS_ICONS[p.status] || Clock;
                    return (
                      <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5">
                          {p.payment_reference ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[10px] text-primary font-semibold">{p.payment_reference}</span>
                              <button onClick={() => copyRef(p.payment_reference!)} className="text-gray-400 hover:text-primary"><Copy size={9} /></button>
                            </div>
                          ) : <span className="text-muted-foreground text-[10px]">—</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-primary font-semibold">#{p.booking_number || p.booking_id.slice(0, 8)}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-xs">{p.customer_name}</p>
                          <p className="text-muted-foreground text-[10px]">{p.mobile}</p>
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-muted-foreground max-w-[100px] truncate">{p.package_name || "—"}</td>
                        <td className="px-3 py-2.5 font-semibold text-primary text-xs whitespace-nowrap">₹{Number(p.amount_paid).toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2.5 text-xs">{p.payment_method}</td>
                        <td className="px-3 py-2.5 font-mono text-[10px] max-w-[100px] truncate">{p.utr_number}</td>
                        <td className="px-3 py-2.5 text-[10px] text-muted-foreground whitespace-nowrap">{p.payment_date}</td>
                        <td className="px-3 py-2.5">
                          {p.proof_url ? (
                            <a href={p.proof_url.startsWith("http") ? p.proof_url : `${API}${p.proof_url}`}
                              target="_blank" rel="noreferrer" download
                              className="text-primary hover:text-primary/80 flex items-center gap-1 text-[10px] font-medium">
                              <Download size={10} /> Receipt
                            </a>
                          ) : <span className="text-muted-foreground text-[10px]">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 flex items-center gap-1 w-fit ${STATUS_COLORS[p.status] || ""}`}>
                            <StatusIcon size={9} />
                            {STATUS_LABELS[p.status] || p.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 flex-wrap">
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => { setSelected(p); setViewOpen(true); }}>
                              <Eye size={9} className="mr-0.5" /> View
                            </Button>
                            {p.status === "pending" && (
                              <>
                                <Button size="sm" className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setSelected(p); setAdminRemarks(""); setApproveOpen(true); }}>
                                  <CheckCircle size={9} className="mr-0.5" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setSelected(p); setReason(""); setRejectOpen(true); }}>
                                  <XCircle size={9} className="mr-0.5" /> Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── View Detail Modal ── */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Building2 size={18} className="text-primary" />
              Payment Details
              {selected?.payment_reference && (
                <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">{selected.payment_reference}</span>
              )}
              {selected && (
                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status] || selected.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                {[
                  ["Booking", `#${selected.booking_number || selected.booking_id.slice(0, 8)}`],
                  ["Package", selected.package_name || "—"],
                  ["Customer", selected.customer_name],
                  ["Mobile", selected.mobile],
                  ["Email", selected.email || "—"],
                  ["Amount Paid", `₹${Number(selected.amount_paid).toLocaleString("en-IN")}`],
                  ["Total Booking Amount", selected.final_amount ? `₹${Number(selected.final_amount).toLocaleString("en-IN")}` : "—"],
                  ["Balance Due", (selected.final_amount && selected.paid_amount) ? `₹${Math.max(0, Number(selected.final_amount) - Number(selected.paid_amount)).toLocaleString("en-IN")}` : "—"],
                  ["Payment Date", selected.payment_date],
                  ["Payment Time", selected.payment_time || "—"],
                  ["Payment Method", selected.payment_method],
                  ["UTR / Ref Number", selected.utr_number],
                  ["Sender Bank", selected.bank_name || "—"],
                  ["Branch", selected.branch_name || "—"],
                  ["Sender A/C Last 4", selected.sender_account_last4 || "—"],
                  ["Submitted At", new Date(selected.created_at).toLocaleString("en-IN")],
                ].map(([label, val]) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="font-semibold text-sm mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
              {selected.remarks && (
                <div className="bg-muted/30 rounded-lg p-2.5 text-sm">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Customer Remarks</p>
                  <p>{selected.remarks}</p>
                </div>
              )}

              {/* Receipt Preview */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment Receipt</p>
                <ProofPreview payment={selected} />
              </div>

              {/* Admin Remarks */}
              {selected.admin_remarks && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                  <p className="font-semibold text-xs mb-0.5">Admin Remarks</p>
                  {selected.admin_remarks}
                </div>
              )}

              {/* Rejection / Clarification Reason */}
              {selected.rejection_reason && (
                <div className={`rounded-lg p-3 text-sm border ${selected.status === "correction_requested" ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  <p className="font-semibold text-xs mb-0.5">{selected.status === "correction_requested" ? "Clarification Request" : "Rejection Reason"}</p>
                  {selected.rejection_reason}
                </div>
              )}

              {/* Verified by */}
              {selected.verified_by_name && (
                <div className="text-xs text-muted-foreground">
                  {selected.status === "approved" ? "✅ Verified" : "Actioned"} by{" "}
                  <strong>{selected.verified_by_name}</strong>{" "}
                  {selected.verified_at ? `on ${new Date(selected.verified_at).toLocaleString("en-IN")}` : ""}
                </div>
              )}

              {/* Action buttons inside modal */}
              {selected.status === "pending" && (
                <div className="flex gap-2 pt-2 flex-wrap border-t">
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setAdminRemarks(""); setApproveOpen(true); }}>
                    <CheckCircle size={14} className="mr-1.5" /> Approve Payment
                  </Button>
                  <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => { setReason(""); setClarificationOpen(true); }}>
                    <AlertTriangle size={14} className="mr-1.5" /> Request More Information
                  </Button>
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setReason(""); setRejectOpen(true); }}>
                    <XCircle size={14} className="mr-1.5" /> Reject Payment
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Approve Modal ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-emerald-700 flex items-center gap-2"><CheckCircle size={18} />Approve Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {selected && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm">
                <p className="font-semibold">{selected.customer_name}</p>
                <p className="text-muted-foreground text-xs">₹{Number(selected.amount_paid).toLocaleString("en-IN")} via {selected.payment_method} · UTR: {selected.utr_number}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">Approving will update the payment ledger, reduce customer balance, and send WhatsApp + SMS + Email + Dashboard notifications.</p>
            <div>
              <Label className="text-xs">Admin Remarks (optional — shown to customer)</Label>
              <textarea
                className="w-full mt-1 border border-border rounded-lg p-2.5 text-sm h-20 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="e.g. Payment received and verified. Thank you."
                value={adminRemarks}
                onChange={e => setAdminRemarks(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleApprove} disabled={acting}>
                {acting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <CheckCircle size={14} className="mr-1.5" />}
                Approve & Notify Customer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reject Modal ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-red-600 flex items-center gap-2"><XCircle size={18} />Reject Payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">The customer will receive a WhatsApp + SMS + Email notification with this reason.</p>
            <div>
              <Label className="text-xs">Rejection Reason <span className="text-red-500">*</span></Label>
              <textarea
                className="w-full mt-1 border border-border rounded-lg p-2.5 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                placeholder="e.g. UTR number does not match, payment amount incorrect…"
                value={reason} onChange={e => setReason(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Admin Internal Note (optional)</Label>
              <textarea
                className="w-full mt-1 border border-border rounded-lg p-2.5 text-sm h-16 focus:outline-none focus:ring-2 focus:ring-red-500/40"
                placeholder="Internal note visible in admin panel only…"
                value={adminRemarks} onChange={e => setAdminRemarks(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleReject} disabled={acting || !reason.trim()}>
                {acting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <XCircle size={14} className="mr-1.5" />}
                Reject & Notify
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Need Clarification Modal ── */}
      <Dialog open={clarificationOpen} onOpenChange={setClarificationOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-orange-600 flex items-center gap-2"><AlertTriangle size={18} />Request More Information</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">The customer will be asked to provide additional information or a clearer receipt.</p>
            <div>
              <Label className="text-xs">Message to Customer <span className="text-red-500">*</span></Label>
              <textarea
                className="w-full mt-1 border border-border rounded-lg p-2.5 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                placeholder="e.g. Please upload a clearer image of the bank transfer receipt…"
                value={reason} onChange={e => setReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setClarificationOpen(false)}>Cancel</Button>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleClarification} disabled={acting || !reason.trim()}>
                {acting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <AlertTriangle size={14} className="mr-1.5" />}
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bank Settings Modal ── */}
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
                <Input className="mt-1 h-9 text-sm" value={(bankSettings as any)[key]}
                  onChange={e => setBankSettings(prev => ({ ...prev, [key]: e.target.value }))} />
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
