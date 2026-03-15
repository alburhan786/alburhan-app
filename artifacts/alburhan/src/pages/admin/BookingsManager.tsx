import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListBookings, useApproveBooking, useRejectBooking } from "@workspace/api-client-react";
import type { Booking, Pilgrim } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye, ExternalLink } from "lucide-react";

function BookingDetailModal({ booking, open, onClose }: { booking: Booking | null; open: boolean; onClose: () => void }) {
  if (!booking) return null;

  const pilgrims = Array.isArray(booking.pilgrims) ? booking.pilgrims : [];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Booking Details</span>
            <Badge variant="outline" className="uppercase text-[10px] font-bold">{booking.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Booking Info</h4>
              <div className="space-y-1.5 text-sm">
                <p><span className="text-muted-foreground">Booking #:</span> <span className="font-mono font-bold">{booking.bookingNumber}</span></p>
                <p><span className="text-muted-foreground">Date:</span> {formatDate(booking.createdAt)}</p>
                {booking.invoiceNumber && <p><span className="text-muted-foreground">Invoice:</span> <span className="font-mono font-bold text-emerald-700">{booking.invoiceNumber}</span></p>}
                {booking.isOffline && <p><Badge variant="outline" className="text-[9px]">Offline Booking</Badge></p>}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Customer</h4>
              <div className="space-y-1.5 text-sm">
                <p className="font-bold text-base">{booking.customerName}</p>
                <p><span className="text-muted-foreground">Mobile:</span> {booking.customerMobile}</p>
                {booking.customerEmail && <p><span className="text-muted-foreground">Email:</span> {booking.customerEmail}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Package</h4>
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">{booking.packageName || "—"}</p>
                <p><span className="text-muted-foreground">Pilgrims:</span> {booking.numberOfPilgrims}</p>
                {booking.roomType && <p><span className="text-muted-foreground">Room:</span> <span className="capitalize">{booking.roomType}</span></p>}
                {booking.preferredDepartureDate && <p><span className="text-muted-foreground">Departure:</span> {formatDate(booking.preferredDepartureDate)}</p>}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Payment</h4>
              <div className="space-y-1.5 text-sm">
                {booking.totalAmount && <p><span className="text-muted-foreground">Base Amount:</span> <span className="font-mono">{formatCurrency(booking.totalAmount)}</span></p>}
                {booking.gstAmount && <p><span className="text-muted-foreground">GST:</span> <span className="font-mono">{formatCurrency(booking.gstAmount)}</span></p>}
                {booking.finalAmount && <p><span className="text-muted-foreground">Total:</span> <span className="font-mono font-bold text-[#0B3D2E]">{formatCurrency(booking.finalAmount)}</span></p>}
                {booking.razorpayPaymentId && <p><span className="text-muted-foreground">Razorpay:</span> <span className="font-mono text-xs">{booking.razorpayPaymentId}</span></p>}
              </div>
            </div>
          </div>

          {booking.rejectionReason && (
            <div>
              <h4 className="text-xs font-semibold text-red-600 uppercase mb-2">Rejection Reason</h4>
              <p className="text-sm bg-red-50 rounded-lg p-3 text-red-800">{booking.rejectionReason}</p>
            </div>
          )}

          {booking.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Notes</h4>
              <p className="text-sm bg-muted rounded-lg p-3">{booking.notes}</p>
            </div>
          )}

          {pilgrims.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Pilgrims ({pilgrims.length})</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Passport</th>
                      <th className="px-3 py-2 text-left">DOB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pilgrims.map((p: Pilgrim, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{p.name || "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{p.passportNumber || "—"}</td>
                        <td className="px-3 py-2 text-xs">{p.dateOfBirth || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {booking.status === "confirmed" && booking.invoiceNumber && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`${import.meta.env.BASE_URL}invoice/${booking.bookingNumber}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />View Invoice
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BookingsManager() {
  const { data, isLoading } = useListBookings();
  const bookings = data?.bookings || [];
  const approveMutation = useApproveBooking();
  const rejectMutation = useRejectBooking();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync({ id });
      toast({ title: "Booking Approved" });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to approve booking";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Reason for rejection:");
    if (reason === null) return;
    try {
      await rejectMutation.mutateAsync({ id, data: { reason } });
      toast({ title: "Booking Rejected" });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reject booking";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-emerald-100 text-emerald-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-amber-100 text-amber-800';
    }
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Bookings Management</h1>
        <p className="text-muted-foreground mt-1">Review and process customer booking requests.</p>
      </div>

      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Booking ID / Date</th>
                <th className="px-6 py-4">Customer Info</th>
                <th className="px-6 py-4">Package</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
              ) : bookings.map(booking => (
                <tr key={booking.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-mono font-bold text-primary">{booking.bookingNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">{formatDate(booking.createdAt)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold">{booking.customerName}</div>
                    <div className="text-xs text-muted-foreground">{booking.customerMobile}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{booking.packageName}</div>
                    <div className="text-xs text-muted-foreground">{booking.numberOfPilgrims} Pilgrim(s)</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className={`px-2.5 py-1 uppercase tracking-wider text-[10px] font-bold border-0 ${getStatusColor(booking.status)}`}>
                      {booking.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => setDetailBooking(booking)} title="View Details">
                        <Eye size={18} />
                      </Button>
                      {booking.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="icon" className="text-emerald-600 hover:bg-emerald-50" onClick={() => handleApprove(booking.id)} title="Approve">
                            <CheckCircle size={18} />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600 hover:bg-red-50" onClick={() => handleReject(booking.id)} title="Reject">
                            <XCircle size={18} />
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

      <BookingDetailModal booking={detailBooking} open={!!detailBooking} onClose={() => setDetailBooking(null)} />
    </AdminLayout>
  );
}
