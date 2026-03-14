import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useGetAdminStats,
  useListPackages,
  useCreateOfflineBooking,
  useSendBroadcast,
  getBookingsReport,
  getPaymentsReport,
  getCustomersReport,
  type Booking,
  type BroadcastResponse,
  type BroadcastRequestAudience,
  type CreateOfflineBookingRequestPaymentStatus,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";
import { IndianRupee, Users, Package as PackageIcon, Clock, Send, FileText, Plus, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useGetAdminStats();
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);

  if (isLoading) return <AdminLayout><div className="p-8 text-center text-muted-foreground animate-pulse">Loading dashboard...</div></AdminLayout>;
  if (!stats) return <AdminLayout><div>Error loading stats</div></AdminLayout>;

  const statCards = [
    { label: "Total Revenue", value: formatCurrency(stats.totalRevenue), icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "Total Bookings", value: stats.totalBookings, icon: PackageIcon, color: "text-blue-600", bg: "bg-blue-100" },
    { label: "Pending Approvals", value: stats.pendingBookings, icon: Clock, color: "text-amber-600", bg: "bg-amber-100" },
    { label: "Total Customers", value: stats.totalCustomers, icon: Users, color: "text-purple-600", bg: "bg-purple-100" },
  ];

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Real-time statistics and recent activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, i) => (
          <Card key={i} className="p-6 border-none shadow-sm rounded-2xl flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color}`}>
              <stat.icon size={28} />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{stat.label}</p>
              <h3 className="text-2xl font-bold text-foreground">{stat.value}</h3>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-6 border-none shadow-sm rounded-2xl">
          <h3 className="text-lg font-bold mb-4 font-serif">Recent Bookings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-lg">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.recentBookings?.map(booking => (
                  <tr key={booking.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{booking.bookingNumber}</td>
                    <td className="px-4 py-3 font-medium">{booking.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground truncate max-w-[150px]">{booking.packageName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`
                        ${booking.status === 'pending' ? 'bg-amber-100 text-amber-800' : ''}
                        ${booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : ''}
                        ${booking.status === 'approved' ? 'bg-blue-100 text-blue-800' : ''}
                      `}>
                        {booking.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(booking.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6 border-none shadow-sm rounded-2xl bg-primary text-primary-foreground">
          <h3 className="text-lg font-bold mb-4 font-serif text-white">Quick Actions</h3>
          <div className="space-y-3">
            <button onClick={() => setOfflineOpen(true)} className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-3">
              <Plus size={18} />
              <span>Create Offline Booking</span>
            </button>
            <button onClick={() => setBroadcastOpen(true)} className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-3">
              <Send size={18} />
              <span>Send Broadcast Message</span>
            </button>
            <button onClick={() => setReportsOpen(true)} className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-3">
              <FileText size={18} />
              <span>Generate Reports</span>
            </button>
          </div>
        </Card>
      </div>

      <OfflineBookingModal open={offlineOpen} onClose={() => setOfflineOpen(false)} />
      <BroadcastModal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
      <ReportsModal open={reportsOpen} onClose={() => setReportsOpen(false)} />
    </AdminLayout>
  );
}

interface OfflineFormState {
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  packageId: string;
  numberOfPilgrims: number;
  preferredDepartureDate: string;
  notes: string;
  paymentStatus: "pending" | "paid";
  paymentAmount: number;
  paymentMethod: string;
}

const initialOfflineForm: OfflineFormState = {
  customerName: "", customerMobile: "", customerEmail: "", packageId: "",
  numberOfPilgrims: 1, preferredDepartureDate: "", notes: "",
  paymentStatus: "pending", paymentAmount: 0, paymentMethod: "",
};

function OfflineBookingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: packages } = useListPackages();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OfflineFormState>(initialOfflineForm);

  const mutation = useCreateOfflineBooking({
    mutation: {
      onSuccess: (data) => {
        const booking = data as Booking;
        toast({ title: "Booking Created", description: `Booking #${booking.bookingNumber} created successfully.` });
        queryClient.invalidateQueries({ queryKey: ["getAdminStats"] });
        onClose();
        setForm(initialOfflineForm);
      },
      onError: () => { toast({ title: "Error", description: "Failed to create booking.", variant: "destructive" }); },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      data: {
        customerName: form.customerName,
        customerMobile: form.customerMobile,
        customerEmail: form.customerEmail || undefined,
        packageId: form.packageId || undefined,
        numberOfPilgrims: form.numberOfPilgrims,
        preferredDepartureDate: form.preferredDepartureDate || undefined,
        notes: form.notes || undefined,
        paymentStatus: form.paymentStatus as CreateOfflineBookingRequestPaymentStatus,
        paymentAmount: form.paymentAmount || undefined,
        paymentMethod: form.paymentMethod || undefined,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Create Offline Booking</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Customer Name *</Label>
              <Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
            </div>
            <div>
              <Label>Mobile *</Label>
              <Input value={form.customerMobile} onChange={e => setForm(f => ({ ...f, customerMobile: e.target.value }))} required />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
          </div>
          <div>
            <Label>Package</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.packageId} onChange={e => setForm(f => ({ ...f, packageId: e.target.value }))}>
              <option value="">-- Select Package --</option>
              {packages?.map(p => <option key={p.id} value={p.id}>{p.name} (₹{Number(p.pricePerPerson).toLocaleString("en-IN")}/person)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Number of Pilgrims *</Label>
              <Input type="number" min={1} value={form.numberOfPilgrims} onChange={e => setForm(f => ({ ...f, numberOfPilgrims: parseInt(e.target.value) || 1 }))} required />
            </div>
            <div>
              <Label>Departure Date</Label>
              <Input type="date" value={form.preferredDepartureDate} onChange={e => setForm(f => ({ ...f, preferredDepartureDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Payment Status</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.paymentStatus} onChange={e => setForm(f => ({ ...f, paymentStatus: e.target.value as "pending" | "paid" }))}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          {form.paymentStatus === "paid" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Payment Amount</Label>
                <Input type="number" value={form.paymentAmount} onChange={e => setForm(f => ({ ...f, paymentAmount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Input placeholder="Cash / UPI / Bank" value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} />
              </div>
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <textarea className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[60px]" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Creating..." : "Create Booking"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
          <DialogTitle className="font-serif">Send Broadcast Message</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate({ data: { message, audience } }); }} className="space-y-4">
          <div>
            <Label>Audience</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={audience} onChange={e => setAudience(e.target.value as BroadcastRequestAudience)}>
              <option value="all">All Customers</option>
              <option value="pending_payment">Pending Payment (Approved Bookings)</option>
              <option value="confirmed">Confirmed Bookings Only</option>
            </select>
          </div>
          <div>
            <Label>Message *</Label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[120px]"
              placeholder="Type your broadcast message here..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">This message will be sent via SMS and WhatsApp to all recipients in the selected audience.</p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !message.trim()}>
              <Send className="w-4 h-4 mr-2" />
              {mutation.isPending ? "Sending..." : "Send Broadcast"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ReportType = "bookings" | "payments" | "customers";
type OutputFormat = "csv" | "print";

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function openPrintableReport(data: Record<string, unknown>[], title: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const safeTitle = escapeHtml(title);
  const rows = data.map(row =>
    `<tr>${headers.map(h => `<td style="border:1px solid #ddd;padding:6px 10px;font-size:12px">${escapeHtml(String(row[h] ?? ""))}</td>`).join("")}</tr>`
  ).join("");
  const html = `<!DOCTYPE html><html><head><title>${safeTitle}</title><style>body{font-family:Inter,sans-serif;margin:20px}h1{font-family:serif;color:#0A3D2A;font-size:20px}table{border-collapse:collapse;width:100%}th{background:#0A3D2A;color:#fff;padding:8px 10px;font-size:11px;text-transform:uppercase}td{border:1px solid #ddd;padding:6px 10px;font-size:12px}tr:nth-child(even){background:#f9f9f9}@media print{body{margin:0}}</style></head><body><h1>Al Burhan Tours &amp; Travels — ${safeTitle}</h1><p style="font-size:12px;color:#666">Generated: ${escapeHtml(new Date().toLocaleString("en-IN"))}</p><table><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table><script>window.print()</script></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function ReportsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reportType, setReportType] = useState<ReportType>("bookings");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("csv");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      let data: Record<string, unknown>[];
      if (reportType === "payments") {
        data = (await getPaymentsReport()) as Record<string, unknown>[];
      } else if (reportType === "customers") {
        data = (await getCustomersReport()) as Record<string, unknown>[];
      } else {
        const params: { from?: string; to?: string } = {};
        if (dateFrom) params.from = dateFrom;
        if (dateTo) params.to = dateTo;
        data = (await getBookingsReport(params)) as Record<string, unknown>[];
      }

      if (!data.length) {
        toast({ title: "No Data", description: "No records found for the selected criteria." });
        return;
      }

      const reportLabel = reportType === "payments" ? "Payments Report" : reportType === "customers" ? "Customer List" : "Bookings Report";

      if (outputFormat === "print") {
        openPrintableReport(data, reportLabel);
      } else {
        downloadCSV(data, `${reportType}-report-${new Date().toISOString().split("T")[0]}.csv`);
      }

      toast({ title: "Report Generated", description: `${data.length} records exported.` });
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to generate report.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Generate Reports</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Report Type</Label>
            <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={reportType} onChange={e => setReportType(e.target.value as ReportType)}>
              <option value="bookings">Bookings Summary</option>
              <option value="payments">Payment / Revenue Report</option>
              <option value="customers">Customer List</option>
            </select>
          </div>
          {reportType === "bookings" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>From Date</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label>To Date</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <Label>Output Format</Label>
            <div className="flex gap-3 mt-1">
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${outputFormat === "csv" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                onClick={() => setOutputFormat("csv")}
              >
                <FileText className="w-4 h-4" /> Download CSV
              </button>
              <button
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${outputFormat === "print" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                onClick={() => setOutputFormat("print")}
              >
                <Printer className="w-4 h-4" /> Print View
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Leave dates empty to export all records.</p>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={loading}>
              {outputFormat === "print" ? <Printer className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
              {loading ? "Generating..." : outputFormat === "print" ? "Open Print View" : "Download Report"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
