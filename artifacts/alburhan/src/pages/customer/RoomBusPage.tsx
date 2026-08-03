import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bed, Bus, Users, Hash, Info } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

export default function RoomBusPage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber/room-bus");
  const bookingNumber = params?.bookingNumber;
  const [pilgrims, setPilgrims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingNumber) return;
    fetch(`${API}/api/customer/bookings/${bookingNumber}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setPilgrims(d.pilgrims || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingNumber]);

  // Group pilgrims by room
  const rooms = pilgrims.reduce((acc: Record<string, any[]>, p: any) => {
    const key = p.room_number || "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p); return acc;
  }, {});

  // Group pilgrims by bus
  const buses = pilgrims.reduce((acc: Record<string, any[]>, p: any) => {
    const key = p.bus_number || "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(p); return acc;
  }, {});

  return (
    <CustomerPortalLayout title="Room & Bus" bookingNumber={bookingNumber}>
      {loading ? (
        <div className="space-y-4">
          {[1,2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : pilgrims.length === 0 ? (
        <Card className="p-8 text-center">
          <Info size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500">Room and bus allocations will appear here once assigned.</p>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Room allocations */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Bed size={17} className="text-blue-500" />Room Allocations
            </h3>
            {Object.entries(rooms).map(([room, members]) => (
              <div key={room} className="mb-4 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <Hash size={13} className="text-slate-400" />
                  <p className="text-sm font-semibold text-slate-700">
                    {room === "Unassigned" ? "Room not yet assigned" : `Room ${room}`}
                  </p>
                  {(members as any[])[0]?.floor && (
                    <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                      Floor {(members as any[])[0].floor}
                    </Badge>
                  )}
                  {(members as any[])[0]?.room_type && (
                    <Badge variant="outline" className="text-[10px]">
                      {(members as any[])[0].room_type}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1 pl-5">
                  {(members as any[]).map((p: any) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <div className="h-5 w-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        {p.full_name?.[0]}
                      </div>
                      <span>{p.full_name}</span>
                      {p.seat_number && <Badge className="text-[9px] bg-slate-100 text-slate-500">Bed {p.seat_number}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>

          {/* Bus allocations */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Bus size={17} className="text-amber-500" />Bus Allocations
            </h3>
            {Object.entries(buses).map(([bus, members]) => (
              <div key={bus} className="mb-4 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <Bus size={13} className="text-slate-400" />
                  <p className="text-sm font-semibold text-slate-700">
                    {bus === "Unassigned" ? "Bus not yet assigned" : `Bus ${bus}`}
                  </p>
                </div>
                <div className="space-y-1 pl-5">
                  {(members as any[]).map((p: any) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <div className="h-5 w-5 rounded-full bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-600">
                        {p.full_name?.[0]}
                      </div>
                      <span>{p.full_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>

          {/* Summary table */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Users size={17} className="text-slate-500" />Pilgrim Summary
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-100">
                    <th className="text-left pb-2">Name</th>
                    <th className="text-left pb-2">Room</th>
                    <th className="text-left pb-2">Bus</th>
                    <th className="text-left pb-2">Seat</th>
                  </tr>
                </thead>
                <tbody>
                  {pilgrims.map((p: any) => (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-800">{p.full_name}</td>
                      <td className="py-2 text-slate-500">{p.room_number || "—"}</td>
                      <td className="py-2 text-slate-500">{p.bus_number || "—"}</td>
                      <td className="py-2 text-slate-500">{p.seat_number || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </CustomerPortalLayout>
  );
}
