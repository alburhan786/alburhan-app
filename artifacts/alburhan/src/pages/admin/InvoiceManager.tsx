import { useState, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListBookings, useCreateOfflineBooking, useSendInvoiceNotification, useListPackages } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Send, Eye, Plus, Search, Download } from "lucide-react";
import { downloadPdf } from "@/lib/pdf-download";

function InvoicePreview({ booking, onClose }: { booking: any; onClose: () => void }) {
  const invoiceRef = useRef<HTMLDivElement>(null);

  function formatINR(amount: number): string {
    return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  }

  function formatInvoiceDate(dateString: string | null | undefined): string {
    if (!dateString) return "N/A";
    try {
      return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(dateString));
    } catch { return dateString || "N/A"; }
  }

  const handleDownload = () => {
    downloadPdf(invoiceRef.current, {
      filename: `Invoice-${booking.invoiceNumber || booking.bookingNumber}.pdf`,
      orientation: "portrait",
      margin: 5,
    });
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between">
          <span>Invoice Preview</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />Download PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.open(`${import.meta.env.BASE_URL}invoice/${booking.bookingNumber}`, '_blank')}>
              <Eye className="w-4 h-4 mr-2" />Full View
            </Button>
          </div>
        </DialogTitle>
      </DialogHeader>
      <div ref={invoiceRef} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-[#0A3D2A] text-white px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-serif font-bold">AL BURHAN TOURS & TRAVELS</h2>
              <p className="text-emerald-200 text-xs mt-1">Shop No 8-5, Khanka Masjid Complex, Sanwara Road, Burhanpur 450331 M.P.</p>
              <p className="text-emerald-200 text-xs">Phone: +91 9893225590 | +91 9893989786</p>
            </div>
            <div className="text-right">
              <div className="text-xl font-serif font-bold text-[#C9A84C]">TAX INVOICE</div>
              <p className="text-emerald-200 text-xs mt-1">Invoice: {booking.invoiceNumber || "N/A"}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Invoice Details</h4>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Invoice No:</span> <span className="font-semibold">{booking.invoiceNumber || "N/A"}</span></p>
                <p><span className="text-gray-500">Date:</span> <span className="font-semibold">{formatInvoiceDate(booking.updatedAt || booking.createdAt)}</span></p>
                <p><span className="text-gray-500">Booking:</span> <span className="font-semibold">{booking.bookingNumber}</span></p>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Bill To</h4>
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{booking.customerName}</p>
                <p><span className="text-gray-500">Mobile:</span> {booking.customerMobile}</p>
                <p><span className="text-gray-500">Pilgrims:</span> {booking.numberOfPilgrims}</p>
              </div>
            </div>
          </div>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Description</th>
                <th className="text-center px-3 py-2 font-semibold text-gray-600">Qty</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">Rate</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-600">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium">{booking.packageName || "Travel Package"}</td>
                <td className="px-3 py-2 text-center">{booking.numberOfPilgrims}</td>
                <td className="px-3 py-2 text-right font-mono">{booking.totalAmount && booking.numberOfPilgrims ? `₹${formatINR(booking.totalAmount / booking.numberOfPilgrims)}` : "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{booking.totalAmount ? `₹${formatINR(booking.totalAmount)}` : "—"}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex justify-end">
            <div className="w-64">
              <div className="flex justify-between py-1 text-sm">
                <span className="text-gray-500">Subtotal:</span>
                <span className="font-mono">₹{booking.totalAmount ? formatINR(booking.totalAmount) : "—"}</span>
              </div>
              <div className="flex justify-between py-1 text-sm border-b border-gray-100">
                <span className="text-gray-500">GST (5%):</span>
                <span className="font-mono">₹{booking.gstAmount ? formatINR(booking.gstAmount) : "—"}</span>
              </div>
              <div className="flex justify-between py-2 text-base font-bold">
                <span>Total:</span>
                <span className="text-[#0A3D2A] font-mono">₹{booking.finalAmount ? formatINR(booking.finalAmount) : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

function OfflineBookingDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { data: packagesData } = useListPackages();
  const packages = packagesData || [];
  const createMutation = useCreateOfflineBooking();
  const { toast } = useToast();

  const [form, setForm] = useState({
    customerName: "",
    customerMobile: "",
    customerEmail: "",
    packageId: "",
    numberOfPilgrims: 1,
    roomType: "" as string,
    advanceAmount: 0,
    paymentStatus: "pending" as string,
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName || !form.customerMobile) {
      toast({ title: "Error", description: "Customer name and mobile are required", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          customerName: form.customerName,
          customerMobile: form.customerMobile,
          customerEmail: form.customerEmail || undefined,
          packageId: form.packageId || undefined,
          numberOfPilgrims: form.numberOfPilgrims,
          roomType: (form.roomType || undefined) as any,
          advanceAmount: form.advanceAmount || undefined,
          paymentStatus: (form.paymentStatus || undefined) as any,
          notes: form.notes || undefined,
        },
      });
      toast({ title: "Offline Booking Created" });
      setOpen(false);
      setForm({ customerName: "", customerMobile: "", customerEmail: "", packageId: "", numberOfPilgrims: 1, roomType: "", advanceAmount: 0, paymentStatus: "pending", notes: "" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#0B3D2E] hover:bg-[#0B3D2E]/90">
          <Plus className="w-4 h-4 mr-2" />New Offline Booking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Offline Booking</DialogTitle>
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
            <Select value={form.packageId} onValueChange={v => setForm(f => ({ ...f, packageId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
              <SelectContent>
                {packages.map((pkg: any) => (
                  <SelectItem key={pkg.id} value={pkg.id}>{pkg.name} - ₹{Number(pkg.pricePerPerson).toLocaleString("en-IN")}/person</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Pilgrims</Label>
              <Input type="number" min={1} value={form.numberOfPilgrims} onChange={e => setForm(f => ({ ...f, numberOfPilgrims: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <Label>Room Type</Label>
              <Select value={form.roomType} onValueChange={v => setForm(f => ({ ...f, roomType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sharing">Sharing</SelectItem>
                  <SelectItem value="double">Double</SelectItem>
                  <SelectItem value="triple">Triple</SelectItem>
                  <SelectItem value="quad">Quad</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Advance Amount (₹)</Label>
              <Input type="number" min={0} value={form.advanceAmount} onChange={e => setForm(f => ({ ...f, advanceAmount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>Payment Status</Label>
              <Select value={form.paymentStatus} onValueChange={v => setForm(f => ({ ...f, paymentStatus: v }))}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." />
          </div>
          <Button type="submit" className="w-full bg-[#0B3D2E] hover:bg-[#0B3D2E]/90" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Booking"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function InvoiceManager() {
  const { data, isLoading } = useListBookings();
  const allBookings = data?.bookings || [];
  const sendInvoiceMutation = useSendInvoiceNotification();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [previewBooking, setPreviewBooking] = useState<any>(null);

  const filteredBookings = allBookings.filter(b => {
    if (filter === "confirmed" && b.status !== "confirmed") return false;
    if (filter === "approved" && b.status !== "approved") return false;
    if (filter === "pending" && b.status !== "pending") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        b.customerName.toLowerCase().includes(q) ||
        b.bookingNumber.toLowerCase().includes(q) ||
        b.customerMobile.includes(q) ||
        (b.invoiceNumber && b.invoiceNumber.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getPaymentBadge = (booking: any) => {
    if (booking.status === "confirmed") {
      return <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-bold uppercase">Paid</Badge>;
    }
    if (booking.status === "approved" && booking.advanceAmount && Number(booking.advanceAmount) > 0) {
      return <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-bold uppercase">Partial</Badge>;
    }
    if (booking.status === "approved") {
      return <Badge className="bg-red-100 text-red-800 border-0 text-[10px] font-bold uppercase">Pending</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px] font-bold uppercase">{booking.status}</Badge>;
  };

  const handleSendInvoice = async (booking: any) => {
    if (booking.status !== "confirmed" || !booking.invoiceNumber) {
      toast({ title: "Cannot send invoice", description: "Invoice is only available for confirmed bookings", variant: "destructive" });
      return;
    }
    try {
      const result = await sendInvoiceMutation.mutateAsync({ id: booking.id });
      toast({
        title: "Invoice Sent",
        description: `WhatsApp: ${result.whatsapp ? "✓" : "✗"} | SMS: ${result.sms ? "✓" : "✗"}`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const confirmedCount = allBookings.filter(b => b.status === "confirmed").length;
  const approvedCount = allBookings.filter(b => b.status === "approved").length;
  const pendingCount = allBookings.filter(b => b.status === "pending").length;
  const totalRevenue = allBookings.filter(b => b.status === "confirmed").reduce((sum, b) => sum + (b.finalAmount || 0), 0);

  return (
    <AdminLayout>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Invoice & Billing</h1>
          <p className="text-muted-foreground mt-1">Manage invoices, offline bookings, and payment tracking.</p>
        </div>
        <OfflineBookingDialog onSuccess={() => queryClient.invalidateQueries({ queryKey: ['/api/bookings'] })} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 border-none shadow-sm rounded-xl">
          <div className="text-xs text-muted-foreground uppercase font-semibold">Confirmed</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{confirmedCount}</div>
        </Card>
        <Card className="p-4 border-none shadow-sm rounded-xl">
          <div className="text-xs text-muted-foreground uppercase font-semibold">Awaiting Payment</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{approvedCount}</div>
        </Card>
        <Card className="p-4 border-none shadow-sm rounded-xl">
          <div className="text-xs text-muted-foreground uppercase font-semibold">Pending Review</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{pendingCount}</div>
        </Card>
        <Card className="p-4 border-none shadow-sm rounded-xl">
          <div className="text-xs text-muted-foreground uppercase font-semibold">Total Revenue</div>
          <div className="text-2xl font-bold text-[#0B3D2E] mt-1">{formatCurrency(totalRevenue)}</div>
        </Card>
      </div>

      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <div className="p-4 flex flex-col md:flex-row gap-3 items-center border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, booking #, mobile, invoice #..."
              className="pl-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {[
              { value: "all", label: "All" },
              { value: "confirmed", label: "Paid" },
              { value: "approved", label: "Awaiting" },
              { value: "pending", label: "Pending" },
            ].map(f => (
              <Button
                key={f.value}
                variant={filter === f.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f.value)}
                className={filter === f.value ? "bg-[#0B3D2E] hover:bg-[#0B3D2E]/90" : ""}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Booking / Invoice</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Package</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr>
              ) : filteredBookings.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No bookings found</td></tr>
              ) : filteredBookings.map(booking => (
                <tr key={booking.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-mono font-bold text-primary text-xs">{booking.bookingNumber}</div>
                    {booking.invoiceNumber && (
                      <div className="font-mono text-xs text-emerald-700 mt-0.5">{booking.invoiceNumber}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">{formatDate(booking.createdAt)}</div>
                    {booking.isOffline && <Badge variant="outline" className="text-[9px] mt-1 px-1.5">Offline</Badge>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-sm">{booking.customerName}</div>
                    <div className="text-xs text-muted-foreground">{booking.customerMobile}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-sm">{booking.packageName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{booking.numberOfPilgrims} Pilgrim(s)</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-mono font-bold text-sm">{booking.finalAmount ? formatCurrency(booking.finalAmount) : "—"}</div>
                    {booking.totalAmount && (
                      <div className="text-xs text-muted-foreground">Base: {formatCurrency(booking.totalAmount)}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">{getPaymentBadge(booking)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {booking.status === "confirmed" && booking.invoiceNumber && (
                        <>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Preview Invoice" onClick={() => setPreviewBooking(booking)}>
                                <FileText size={16} className="text-[#0B3D2E]" />
                              </Button>
                            </DialogTrigger>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View Invoice"
                            onClick={() => window.open(`${import.meta.env.BASE_URL}invoice/${booking.bookingNumber}`, '_blank')}
                          >
                            <Eye size={16} className="text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Send via WhatsApp/SMS"
                            onClick={() => handleSendInvoice(booking)}
                            disabled={sendInvoiceMutation.isPending}
                          >
                            <Send size={16} className="text-green-600" />
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
      </Card>

      {previewBooking && (
        <Dialog open={!!previewBooking} onOpenChange={v => !v && setPreviewBooking(null)}>
          <InvoicePreview booking={previewBooking} onClose={() => setPreviewBooking(null)} />
        </Dialog>
      )}
    </AdminLayout>
  );
}
