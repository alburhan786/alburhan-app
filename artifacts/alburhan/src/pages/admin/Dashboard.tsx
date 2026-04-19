import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useGetAdminStats,
  useSendBroadcast,
  getBookingsReport,
  getPaymentsReport,
  getCustomersReport,
  type BroadcastResponse,
  type BroadcastRequestAudience,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  IndianRupee, Users, Package as PackageIcon, Clock, Send, FileText,
  CheckCircle, XCircle, ScanLine, Printer, ClipboardPlus, BarChart2,
  BookOpen, UsersRound, MessageSquare, ImageIcon, Wallet, TrendingUp,
  ShieldCheck, Megaphone, PieChart
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL || "/";

function StatCard({ label, value, icon: Icon, bg, color, sub }: {
  label: string; value: string | number; icon: React.ElementType;
  bg: string; color: string; sub?: string;
}) {
  return (
    <Card className="p-5 border-none shadow-sm rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon size={18} className={color} />
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground font-mono">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

const MODULE_CARDS = [
  { icon: ClipboardPlus, label: "Offline Booking", desc: "Create walk-in bookings", href: "/admin/offline-bookings", color: "bg-amber-50 text-amber-700", border: "border-amber-200" },
  { icon: ScanLine, label: "QR Tracker", desc: "Find pilgrim by QR / name", href: "/admin/qr-tracker", color: "bg-sky-50 text-sky-700", border: "border-sky-200" },
  { icon: Printer, label: "Print Center", desc: "All print options by group", href: "/admin/print-center", color: "bg-violet-50 text-violet-700", border: "border-violet-200" },
  { icon: BarChart2, label: "Reports", desc: "Export bookings & revenue", href: "/admin/reports", color: "bg-emerald-50 text-emerald-700", border: "border-emerald-200" },
  { icon: BookOpen, label: "Bookings", desc: "Approve & manage bookings", href: "/admin/bookings", color: "bg-blue-50 text-blue-700", border: "border-blue-200" },
  { icon: UsersRound, label: "Hajj Groups", desc: "Manage groups & pilgrims", href: "/admin/groups", color: "bg-teal-50 text-teal-700", border: "border-teal-200" },
  { icon: PackageIcon, label: "Packages", desc: "Tour packages & pricing", href: "/admin/packages", color: "bg-purple-50 text-purple-700", border: "border-purple-200" },
  { icon: Users, label: "Customers", desc: "Customer records & info", href: "/admin/customers", color: "bg-rose-50 text-rose-700", border: "border-rose-200" },
  { icon: FileText, label: "Invoices", desc: "Billing & payment status", href: "/admin/invoices", color: "bg-orange-50 text-orange-700", border: "border-orange-200" },
  { icon: PieChart, label: "Payment Analytics", desc: "Today's collection & overdue", href: "/admin/payment-analytics", color: "bg-green-50 text-green-700", border: "border-green-200" },
  { icon: MessageSquare, label: "Inquiries", desc: "Customer inquiries", href: "/admin/inquiries", color: "bg-pink-50 text-pink-700", border: "border-pink-200" },
  { icon: ImageIcon, label: "Gallery", desc: "Homepage banner images", href: "/admin/gallery", color: "bg-lime-50 text-lime-700", border: "border-lime-200" },
  { icon: ShieldCheck, label: "KYC Management", desc: "Review & verify documents", href: "/admin/kyc", color: "bg-indigo-50 text-indigo-700", border: "border-indigo-200" },
  { icon: Megaphone, label: "Broadcast Messages", desc: "Send SMS & WhatsApp blasts", href: "/admin/broadcast", color: "bg-cyan-50 text-cyan-700", border: "border-cyan-200" },
];

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-blue-100 text-blue-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return map[status] || "bg-gray-100 text-gray-600";
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);

  if (isLoading) return <AdminLayout><div className="p-12 text-center text-muted-foreground animate-pulse">Loading dashboard...</div></AdminLayout>;
  if (!stats) return <AdminLayout><div className="p-12 text-center text-red-500">Failed to load stats.</div></AdminLayout>;

  const statCards = [
    { label: "Total Revenue", value: formatCurrency(stats.totalRevenue), icon: IndianRupee, bg: "bg-emerald-100", color: "text-emerald-600", sub: "Collected payments" },
    { label: "Total Bookings", value: stats.totalBookings, icon: BookOpen, bg: "bg-blue-100", color: "text-blue-600", sub: "All time" },
    { label: "Confirmed", value: stats.confirmedBookings ?? 0, icon: CheckCircle, bg: "bg-teal-100", color: "text-teal-600", sub: "Paid & confirmed" },
    { label: "Pending Approval", value: stats.pendingBookings, icon: Clock, bg: "bg-amber-100", color: "text-amber-600", sub: "Awaiting action" },
    { label: "Total Customers", value: stats.totalCustomers, icon: Users, bg: "bg-purple-100", color: "text-purple-600", sub: "Registered users" },
    { label: "Rejected", value: stats.rejectedBookings ?? 0, icon: XCircle, bg: "bg-red-100", color: "text-red-500", sub: "Declined bookings" },
  ];

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Hajj Management Dashboard</h1>
          <p className="text-muted-foreground mt-1">Al Burhan Tours & Travels · Admin Portal</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBroadcastOpen(true)} className="flex items-center gap-2">
            <Send size={14} /> Broadcast
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReportsOpen(true)} className="flex items-center gap-2">
            <FileText size={14} /> Reports
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat, i) => (
          <StatCard key={i} {...stat} />
        ))}
      </div>

      {/* Modules Grid */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-[#0B3D2E]" />
          <h2 className="font-bold text-foreground">System Modules</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {MODULE_CARDS.map((mod) => (
            <Link key={mod.href} href={mod.href}>
              <div className={`bg-white rounded-2xl border-2 ${mod.border} p-4 hover:shadow-md transition-shadow cursor-pointer group`}>
                <div className={`w-10 h-10 rounded-xl ${mod.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <mod.icon size={20} />
                </div>
                <p className="font-bold text-foreground text-sm leading-tight">{mod.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{mod.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom section: Recent Bookings + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 border-none shadow-sm rounded-2xl">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold font-serif">Recent Bookings</h3>
            <Link href="/admin/bookings">
              <button className="text-xs text-[#0B3D2E] hover:underline font-semibold">View All →</button>
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-3 py-2 rounded-tl-lg">Ref</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Package</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 rounded-tr-lg">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.recentBookings?.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-xs">No bookings yet.</td></tr>
                ) : stats.recentBookings?.map(booking => (
                  <tr key={booking.id} className="hover:bg-muted/20">
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs font-bold text-[#0B3D2E]">{booking.bookingNumber}</div>
                      {(booking as any).isOffline && <span className="text-[9px] text-amber-600 bg-amber-50 px-1 rounded">OFFLINE</span>}
                    </td>
                    <td className="px-3 py-3 font-medium text-sm">{booking.customerName}</td>
                    <td className="px-3 py-3 text-muted-foreground text-xs truncate max-w-[120px]">{booking.packageName || "—"}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={`px-2 py-0.5 text-[10px] font-bold uppercase border-0 ${getStatusBadge(booking.status)}`}>
                        {booking.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">{formatDate(booking.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6 border-none shadow-sm rounded-2xl bg-[#0B3D2E] text-primary-foreground">
          <h3 className="text-base font-bold mb-4 font-serif text-white flex items-center gap-2">
            <Wallet size={18} className="text-accent" /> Quick Actions
          </h3>
          <div className="space-y-2.5">
            {[
              { icon: ClipboardPlus, label: "New Offline Booking", href: "/admin/offline-bookings" },
              { icon: ScanLine, label: "QR Pilgrim Tracker", href: "/admin/qr-tracker" },
              { icon: Printer, label: "Print Center", href: "/admin/print-center" },
              { icon: BarChart2, label: "Generate Reports", href: "/admin/reports" },
              { icon: UsersRound, label: "Manage Hajj Groups", href: "/admin/groups" },
            ].map((item, i) => (
              <Link key={i} href={item.href}>
                <button className="w-full text-left px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-3 text-sm text-white font-medium">
                  <item.icon size={16} className="text-accent" />
                  {item.label}
                </button>
              </Link>
            ))}
            <div className="pt-1 border-t border-white/10">
              <button
                onClick={() => setBroadcastOpen(true)}
                className="w-full text-left px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-3 text-sm text-white font-medium"
              >
                <Send size={16} className="text-accent" /> Send Broadcast
              </button>
            </div>
          </div>
        </Card>
      </div>

      <BroadcastModal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
      <ReportsModal open={reportsOpen} onClose={() => setReportsOpen(false)} />
    </AdminLayout>
  );
}

function BroadcastModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<BroadcastRequestAudience>("all");

  const mutation = useSendBroadcast({
    mutation: {
      onSuccess: (data) => {
        const result = data as BroadcastResponse;
        toast({ title: "Broadcast Sent", description: result.message });
        setMessage("");
        onClose();
      },
      onError: () => { toast({ title: "Error", description: "Failed to send broadcast.", variant: "destructive" }); },
    },
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2"><Send size={18} /> Send Broadcast</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate({ data: { message, audience } }); }} className="space-y-4">
          <div>
            <Label>Audience</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={audience} onChange={e => setAudience(e.target.value as BroadcastRequestAudience)}>
              <option value="all">All Customers</option>
              <option value="pending_payment">Pending Payment</option>
              <option value="confirmed">Confirmed Bookings</option>
            </select>
          </div>
          <div>
            <Label>Message *</Label>
            <textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1 min-h-[120px]" placeholder="Type broadcast message..." value={message} onChange={e => setMessage(e.target.value)} required />
            <p className="text-xs text-muted-foreground mt-1">Sent via SMS and WhatsApp.</p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !message.trim()}>
              <Send className="w-4 h-4 mr-2" /> {mutation.isPending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ReportType = "bookings" | "payments" | "customers";

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [headers.join(","), ...data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reportType, setReportType] = useState<ReportType>("bookings");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async (format: "csv" | "print") => {
    setLoading(true);
    try {
      let data: Record<string, unknown>[];
      if (reportType === "payments") data = (await getPaymentsReport()) as unknown as Record<string, unknown>[];
      else if (reportType === "customers") data = (await getCustomersReport()) as unknown as Record<string, unknown>[];
      else data = (await getBookingsReport({ from: dateFrom || undefined, to: dateTo || undefined })) as unknown as Record<string, unknown>[];
      if (!data.length) { toast({ title: "No Data", description: "No records found." }); return; }
      if (format === "csv") {
        downloadCSV(data, `${reportType}-${new Date().toISOString().split("T")[0]}.csv`);
        toast({ title: "Report Downloaded", description: `${data.length} records exported.` });
      } else {
        const headers = Object.keys(data[0]);
        const rows = data.map(row => `<tr>${headers.map(h => `<td style="border:1px solid #ddd;padding:6px 10px;font-size:11px">${String(row[h] ?? "")}</td>`).join("")}</tr>`).join("");
        const html = `<!DOCTYPE html><html><head><title>Report</title></head><body><h2 style="font-family:serif;color:#0B3D2E">Al Burhan Tours &amp; Travels</h2><table style="border-collapse:collapse;width:100%"><thead><tr>${headers.map(h => `<th style="background:#0B3D2E;color:#fff;padding:8px 10px;font-size:10px;text-align:left">${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><script>window.print()</script></body></html>`;
        const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
      }
      onClose();
    } catch { toast({ title: "Error", description: "Failed to generate report.", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2"><BarChart2 size={18} /> Generate Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Report Type</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={reportType} onChange={e => setReportType(e.target.value as ReportType)}>
              <option value="bookings">Bookings Summary</option>
              <option value="payments">Payments / Revenue</option>
              <option value="customers">Customer List</option>
            </select>
          </div>
          {reportType === "bookings" && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label><input type="date" className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
              <div><Label>To</Label><input type="date" className="w-full border rounded-md px-3 py-2 text-sm mt-1" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="outline" onClick={() => handleGenerate("print")} disabled={loading}><Printer className="w-4 h-4 mr-2" /> Print</Button>
            <Button onClick={() => handleGenerate("csv")} disabled={loading}><FileText className="w-4 h-4 mr-2" /> Download CSV</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
