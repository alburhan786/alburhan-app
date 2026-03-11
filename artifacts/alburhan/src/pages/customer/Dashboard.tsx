import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/use-auth";
import { useListBookings, useGetInvoice } from "@workspace/api-client-react";
import { usePayment } from "@/hooks/use-payment";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CreditCard, FileText, Download, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const { data } = useListBookings();
  const bookings = data?.bookings || [];
  const { initiatePayment, isInitializing } = usePayment();
  const { toast } = useToast();

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'approved': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'confirmed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-amber-100 text-amber-800 border-amber-200'; // pending
    }
  };

  const handleDownloadInvoice = async (id: string) => {
    try {
      // Typically you'd generate a PDF here or redirect to a PDF endpoint.
      // For this implementation, we will mock the download action.
      toast({ title: "Downloading Invoice", description: "Your invoice is being generated." });
    } catch (err) {
      toast({ title: "Error", description: "Could not download invoice", variant: "destructive" });
    }
  };

  return (
    <MainLayout>
      <div className="bg-primary pt-12 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        <div className="container mx-auto px-4 relative z-10">
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-white mb-2">Welcome, {user?.name || 'Customer'}</h1>
          <p className="text-primary-foreground/80">Manage your bookings and spiritual journey.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-12 relative z-20 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          <div className="lg:col-span-1 space-y-6">
            <Card className="p-6 shadow-lg border-border/50 rounded-2xl">
              <h3 className="font-bold text-lg mb-4">Profile Info</h3>
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground block">Name</span><span className="font-medium">{user?.name || '-'}</span></div>
                <div><span className="text-muted-foreground block">Mobile</span><span className="font-medium">{user?.mobile}</span></div>
                <div><span className="text-muted-foreground block">Email</span><span className="font-medium">{user?.email || '-'}</span></div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <h2 className="text-2xl font-serif font-bold text-foreground">My Bookings</h2>
            
            {bookings.length === 0 ? (
              <Card className="p-12 text-center bg-white shadow-sm border-dashed">
                <Clock className="w-16 h-16 mx-auto mb-4 text-muted" />
                <h3 className="text-xl font-bold text-foreground mb-2">No bookings yet</h3>
                <p className="text-muted-foreground mb-6">You haven't made any booking requests.</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {bookings.map(booking => (
                  <Card key={booking.id} className="overflow-hidden rounded-2xl shadow-md border-border/50 hover:shadow-lg transition-all">
                    <div className="p-6 border-b border-border bg-muted/10 flex flex-wrap justify-between items-center gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground font-mono mb-1">Booking #{booking.bookingNumber}</div>
                        <h3 className="text-xl font-serif font-bold text-primary">{booking.packageName}</h3>
                      </div>
                      <Badge variant="outline" className={`px-3 py-1 uppercase tracking-wider text-xs font-bold ${getStatusColor(booking.status)}`}>
                        {booking.status}
                      </Badge>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Pilgrims</p>
                        <p className="font-medium">{booking.numberOfPilgrims} Person(s)</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Preferred Date</p>
                        <p className="font-medium">{formatDate(booking.preferredDepartureDate)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                        <p className="font-medium text-lg text-primary">{booking.finalAmount ? formatCurrency(booking.finalAmount) : 'Pending Calculation'}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/20 border-t border-border flex justify-end gap-3">
                      {booking.status === 'approved' && (
                        <Button 
                          onClick={() => initiatePayment(booking.id, booking.customerName, booking.customerEmail || "", booking.customerMobile)}
                          disabled={isInitializing}
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                          <CreditCard className="w-4 h-4 mr-2" /> Pay Now
                        </Button>
                      )}
                      
                      {booking.status === 'confirmed' && (
                        <Button 
                          variant="outline" 
                          onClick={() => handleDownloadInvoice(booking.id)}
                          className="border-primary text-primary hover:bg-primary/5"
                        >
                          <Download className="w-4 h-4 mr-2" /> Invoice
                        </Button>
                      )}

                      {(booking.status === 'approved' || booking.status === 'confirmed') && (
                        <Button variant="ghost" className="text-primary hover:bg-primary/5">
                          <FileText className="w-4 h-4 mr-2" /> Upload Documents
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
