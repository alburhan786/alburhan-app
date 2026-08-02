import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { Plane, Hotel, Calendar, MapPin, Phone, Star, Clock } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

export default function FlightHotelPage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber/flights-hotels");
  const bookingNumber = params?.bookingNumber;
  const [bookingData, setBookingData] = useState<any>(null);
  const [journeyData, setJourneyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingNumber) return;
    fetch(`${API}/api/customer/bookings/${bookingNumber}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(async d => {
        if (d?.ok) {
          setBookingData(d);
          if (d.booking?.id) {
            const jRes = await fetch(`${API}/api/customer/journey/${d.booking.id}`, { credentials: "include" });
            if (jRes.ok) { const jd = await jRes.json(); setJourneyData(jd); }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingNumber]);

  const bk = bookingData?.booking;
  const groupHotels = bk?.group_hotels || [];
  const pilgrims = journeyData?.pilgrims || [];

  // Unique flight(s) across pilgrims
  const flights: any[] = [];
  const flightIds = new Set<string>();
  pilgrims.forEach((p: any) => {
    if (p.flight && !flightIds.has(p.flight.flight_number)) {
      flightIds.add(p.flight.flight_number);
      flights.push(p.flight);
    }
  });

  // Group hotels from pilgrim data
  const hotelMap = new Map<string, any>();
  pilgrims.forEach((p: any) => {
    if (p.h_id && !hotelMap.has(p.h_id)) {
      hotelMap.set(p.h_id, p);
    }
  });
  const pilgrimHotels = [...hotelMap.values()];

  return (
    <CustomerPortalLayout title="Flight & Hotel" bookingNumber={bookingNumber}>
      {loading ? (
        <div className="space-y-4">
          {[1,2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Flight info */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Plane size={17} className="text-sky-500" />Flight Details
            </h3>

            {/* From group booking */}
            {bk?.flight_number && (
              <div className="p-4 rounded-xl bg-sky-50 border border-sky-100 mb-3">
                <p className="text-xs text-sky-500 font-medium uppercase mb-2">Group Flight</p>
                <p className="text-xl font-bold text-slate-800">{bk.flight_number}</p>
                <div className="flex items-center gap-4 mt-2">
                  {bk.group_departure_date && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <Calendar size={13} className="text-slate-400" />
                      Departs: {formatDate(bk.group_departure_date)}
                    </div>
                  )}
                  {bk.group_return_date && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <Calendar size={13} className="text-slate-400" />
                      Returns: {formatDate(bk.group_return_date)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* From journey pilgrim data */}
            {flights.map((f: any, i: number) => (
              <div key={i} className="p-4 rounded-xl bg-sky-50 border border-sky-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-slate-800 text-lg">{f.flight_number}</p>
                  <Badge className="bg-sky-100 text-sky-700 text-xs">{f.airline || "Airline"}</Badge>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-800">{f.origin}</p>
                    <p className="text-xs text-slate-400">{f.departure_date ? formatDate(f.departure_date) : ""}</p>
                    <p className="text-xs text-slate-400">{f.departure_time || ""}</p>
                  </div>
                  <div className="flex-1 flex items-center gap-1">
                    <div className="flex-1 h-px bg-slate-200" />
                    <Plane size={14} className="text-sky-400" />
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-800">{f.destination}</p>
                    <p className="text-xs text-slate-400">{f.arrival_date ? formatDate(f.arrival_date) : ""}</p>
                    <p className="text-xs text-slate-400">{f.arrival_time || ""}</p>
                  </div>
                </div>
              </div>
            ))}

            {!bk?.flight_number && flights.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">
                Flight details will appear here once assigned.
              </p>
            )}
          </Card>

          {/* Hotels */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Hotel size={17} className="text-purple-500" />Hotel Details
            </h3>

            {/* Pilgrim-specific hotels */}
            {pilgrimHotels.length > 0 ? (
              <div className="space-y-4">
                {pilgrimHotels.map((p: any) => (
                  <div key={p.h_id} className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{p.hotel_name}</p>
                        <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin size={12} />{p.hotel_city}
                        </p>
                      </div>
                      {p.hotel_stars && (
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: parseInt(p.hotel_stars) }).map((_, i) => (
                            <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      {p.check_in_date && (
                        <div>
                          <p className="text-xs text-slate-400">Check-in</p>
                          <p className="text-sm font-medium text-slate-700">{formatDate(p.check_in_date)}</p>
                        </div>
                      )}
                      {p.check_out_date && (
                        <div>
                          <p className="text-xs text-slate-400">Check-out</p>
                          <p className="text-sm font-medium text-slate-700">{formatDate(p.check_out_date)}</p>
                        </div>
                      )}
                      {p.hotel_phone && (
                        <div className="col-span-2">
                          <p className="text-xs text-slate-400">Hotel Phone</p>
                          <a href={`tel:${p.hotel_phone}`}
                            className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                            <Phone size={12} />{p.hotel_phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : groupHotels.length > 0 ? (
              <div className="space-y-3">
                {groupHotels.map((h: any, i: number) => (
                  <div key={i} className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                    <p className="font-semibold text-slate-800">{h.name || h.hotel_name || "Hotel"}</p>
                    {h.city && <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={12} />{h.city}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-6">
                Hotel details will appear here once assigned.
              </p>
            )}
          </Card>
        </div>
      )}
    </CustomerPortalLayout>
  );
}
