/**
 * MyBookingPage — lists all bookings for the customer.
 * Linked from /customer/my-booking (the fallback when no primaryBooking exists).
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plane, Calendar, ChevronRight, Package, CreditCard } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function statusColor(s: string) {
  if (s === "confirmed" || s === "approved") return "bg-green-100 text-green-700";
  if (s === "pending") return "bg-yellow-100 text-yellow-700";
  if (s === "cancelled" || s === "rejected") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export default function MyBookingPage() {
  const [, navigate] = useLocation();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/customer/overview`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setBookings(d.bookings || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <CustomerPortalLayout title="My Bookings">
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : bookings.length === 0 ? (
          <Card className="p-10 text-center">
            <Package size={40} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-600 font-medium">No Bookings Found</p>
            <p className="text-sm text-slate-400 mt-1">Contact us to make a booking.</p>
          </Card>
        ) : (
          bookings.map(b => {
            const pct = b.total_amount > 0
              ? Math.min(100, Math.round((b.paid_amount / b.total_amount) * 100)) : 0;
            return (
              <Card key={b.id}
                className="p-5 cursor-pointer hover:shadow-md transition-shadow border border-slate-200"
                onClick={() => navigate(`/customer/booking/${b.booking_number}`)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-800">{b.package_name || "Hajj / Umrah"}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Booking #{b.booking_number}</p>
                  </div>
                  <Badge className={`${statusColor(b.status)} capitalize text-xs`}>{b.status}</Badge>
                </div>

                <div className="flex flex-wrap gap-4 mb-4 text-sm text-slate-500">
                  {b.group_departure_date && (
                    <span className="flex items-center gap-1">
                      <Plane size={13} className="text-emerald-500" />
                      {formatDate(b.group_departure_date)}
                    </span>
                  )}
                  {b.group_name && (
                    <span className="flex items-center gap-1 text-xs">
                      Group: {b.group_name}
                    </span>
                  )}
                </div>

                {b.total_amount > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Payment progress</span>
                      <span>{formatCurrency(b.paid_amount)} / {formatCurrency(b.total_amount)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full">
                      <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-amber-400"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={e => { e.stopPropagation(); navigate(`/customer/booking/${b.booking_number}/payments`); }}>
                      <CreditCard size={11} className="mr-1" />Payments
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={e => { e.stopPropagation(); navigate(`/customer/booking/${b.booking_number}/timeline`); }}>
                      <Plane size={11} className="mr-1" />Journey
                    </Button>
                  </div>
                  <ChevronRight size={15} className="text-slate-300" />
                </div>
              </Card>
            );
          })
        )}
      </div>
    </CustomerPortalLayout>
  );
}
