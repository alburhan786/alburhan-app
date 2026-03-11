import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListBookings, useApproveBooking, useRejectBooking } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Eye } from "lucide-react";

export default function BookingsManager() {
  const { data, isLoading } = useListBookings();
  const bookings = data?.bookings || [];
  const approveMutation = useApproveBooking();
  const rejectMutation = useRejectBooking();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync({ id });
      toast({ title: "Booking Approved" });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err:any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Reason for rejection:");
    if (reason === null) return;
    try {
      await rejectMutation.mutateAsync({ id, data: { reason } });
      toast({ title: "Booking Rejected" });
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
    } catch (err:any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
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
    </AdminLayout>
  );
}
