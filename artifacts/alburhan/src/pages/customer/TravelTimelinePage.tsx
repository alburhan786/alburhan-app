import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import {
  Plane, Hotel, Stamp, CheckCircle2, Clock, AlertCircle,
  MapPin, Navigation, Map, Building
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const JOURNEY_STEPS = [
  { key: "booking_confirmed",    label: "Booking Confirmed",      icon: CheckCircle2 },
  { key: "documents_submitted",  label: "Documents Submitted",    icon: CheckCircle2 },
  { key: "visa_applied",         label: "Visa Applied",           icon: Stamp },
  { key: "visa_received",        label: "Visa Received",          icon: Stamp },
  { key: "ticket_issued",        label: "Ticket Issued",          icon: Plane },
  { key: "departed",             label: "Departed from India",    icon: Plane },
  { key: "arrived_in_saudi",     label: "Arrived in Saudi Arabia",icon: MapPin },
  { key: "hajj_rituals_started", label: "Rituals Started",        icon: Navigation },
  { key: "returning",            label: "Returning to India",     icon: Plane },
  { key: "completed",            label: "Journey Completed",      icon: CheckCircle2 },
];

function stepStatus(journeyStatus: string, stepKey: string): "done" | "current" | "pending" {
  const order = JOURNEY_STEPS.map(s => s.key);
  const current = order.indexOf(journeyStatus);
  const step = order.indexOf(stepKey);
  if (step < current) return "done";
  if (step === current) return "current";
  return "pending";
}

export default function TravelTimelinePage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber/timeline");
  const bookingNumber = params?.bookingNumber;
  const [booking, setBooking] = useState<any>(null);
  const [journeyData, setJourneyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingNumber) return;
    let bkId: string | null = null;

    fetch(`${API}/api/customer/bookings/${bookingNumber}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.ok) {
          setBooking(d.booking);
          bkId = d.booking?.id;
          if (bkId) {
            return fetch(`${API}/api/customer/journey/${bkId}`, { credentials: "include" })
              .then(r2 => r2.ok ? r2.json() : null)
              .then(d2 => { if (d2) setJourneyData(d2); });
          }
        }
        return undefined;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingNumber]);

  const currentStatus = booking?.journey_status || "booking_confirmed";
  const pilgrims = journeyData?.pilgrims || [];

  return (
    <CustomerPortalLayout title="Journey Timeline" bookingNumber={bookingNumber}>
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Journey stepper */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-5">Journey Progress</h3>
            <div className="relative">
              {JOURNEY_STEPS.map((step, idx) => {
                const status = stepStatus(currentStatus, step.key);
                const isLast = idx === JOURNEY_STEPS.length - 1;
                const Icon = step.icon;
                return (
                  <div key={step.key} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors ${
                        status === "done"    ? "bg-emerald-500 border-emerald-500" :
                        status === "current" ? "bg-white border-emerald-500 ring-2 ring-emerald-200" :
                        "bg-white border-slate-200"
                      }`}>
                        <Icon size={15} className={
                          status === "done"    ? "text-white" :
                          status === "current" ? "text-emerald-600" :
                          "text-slate-300"
                        } />
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 flex-1 my-0.5 min-h-[24px] ${
                          status === "done" ? "bg-emerald-400" : "bg-slate-100"
                        }`} />
                      )}
                    </div>
                    <div className="pb-5 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${
                          status === "done"    ? "text-emerald-700" :
                          status === "current" ? "text-slate-900" :
                          "text-slate-400"
                        }`}>
                          {step.label}
                        </p>
                        {status === "current" && (
                          <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5">Current</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Pilgrim details: visa, flight, hotel */}
          {pilgrims.map((p: any) => (
            <Card key={p.id} className="p-5">
              <h4 className="font-semibold text-slate-800 mb-4">{p.full_name}</h4>

              <div className="space-y-4">
                {/* Visa — status/type only; numbers and dates are not returned */}
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-50">
                    <Stamp size={16} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Visa Status</p>
                    <p className="text-sm font-medium text-slate-800 capitalize">
                      {p.visa_status && p.visa_status !== "not_applied"
                        ? p.visa_status.replace(/_/g, " ")
                        : "Not applied yet"}
                      {p.visa_type ? <span className="text-slate-400 font-normal"> · {p.visa_type}</span> : ""}
                    </p>
                  </div>
                </div>

                {/* Flight */}
                {p.flight && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-sky-50">
                      <Plane size={16} className="text-sky-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Flight</p>
                      <p className="text-sm font-medium text-slate-800">{p.flight.airline} {p.flight.flight_number}</p>
                      <p className="text-xs text-slate-500">
                        {p.flight.origin} → {p.flight.destination}
                        {p.flight.departure_date ? ` · ${formatDate(p.flight.departure_date)}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                {/* Hotel */}
                {p.hotel_name && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-purple-50">
                      <Building size={16} className="text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Hotel</p>
                      <p className="text-sm font-medium text-slate-800">{p.hotel_name}</p>
                      <p className="text-xs text-slate-500">
                        {p.hotel_city}
                        {p.check_in_date ? ` · Check-in: ${formatDate(p.check_in_date)}` : ""}
                        {p.check_out_date ? ` · Check-out: ${formatDate(p.check_out_date)}` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}

          {/* Group hotels from booking */}
          {(booking?.group_hotels || []).length > 0 && pilgrims.length === 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Hotel size={17} className="text-purple-600" />Group Hotels
              </h3>
              <div className="space-y-3">
                {booking.group_hotels.map((h: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-sm font-medium text-slate-800">{h.name || h.hotel_name || "Hotel"}</p>
                    {h.city && <p className="text-xs text-slate-500">{h.city}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </CustomerPortalLayout>
  );
}
