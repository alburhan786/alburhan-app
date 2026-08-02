import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plane, Users, MapPin, Calendar, Hotel, Ship, FileText,
  CreditCard, Shield, BookOpen, ChevronRight, Clock, CheckCircle
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function statusColor(s: string) {
  if (s === "confirmed" || s === "approved") return "bg-green-100 text-green-700";
  if (s === "pending") return "bg-yellow-100 text-yellow-700";
  if (s === "cancelled" || s === "rejected") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export default function BookingDetailPage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber");
  const bookingNumber = params?.bookingNumber;
  const [, navigate] = useLocation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingNumber) return;
    fetch(`${API}/api/customer/bookings/${bookingNumber}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingNumber]);

  const bk = data?.booking;
  const pilgrims = data?.pilgrims || [];

  return (
    <CustomerPortalLayout title="Booking Details" bookingNumber={bookingNumber}>
      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : !bk ? (
        <Card className="p-8 text-center">
          <p className="text-slate-500">Booking not found.</p>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">Booking #{bookingNumber}</p>
                <h2 className="text-lg font-bold text-slate-800">
                  {bk.package_name || "Hajj / Umrah Package"}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5 capitalize">
                  {bk.package_type?.replace(/_/g, " ")} · {bk.duration_days} days
                </p>
              </div>
              <Badge className={`${statusColor(bk.status)} capitalize text-xs`}>{bk.status}</Badge>
            </div>
            <Separator className="my-4" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {bk.group_departure_date && (
                <div>
                  <p className="text-xs text-slate-400">Departure</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1">
                    <Calendar size={13} className="text-emerald-500" />
                    {formatDate(bk.group_departure_date)}
                  </p>
                </div>
              )}
              {bk.group_return_date && (
                <div>
                  <p className="text-xs text-slate-400">Return</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1">
                    <Calendar size={13} className="text-blue-500" />
                    {formatDate(bk.group_return_date)}
                  </p>
                </div>
              )}
              {bk.group_name && (
                <div>
                  <p className="text-xs text-slate-400">Group</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{bk.group_name}</p>
                </div>
              )}
              {bk.flight_number && (
                <div>
                  <p className="text-xs text-slate-400">Flight</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5 flex items-center gap-1">
                    <Plane size={13} className="text-sky-500" />
                    {bk.flight_number}
                  </p>
                </div>
              )}
              {bk.maktab_number && (
                <div>
                  <p className="text-xs text-slate-400">Maktab</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{bk.maktab_number}</p>
                </div>
              )}
              {bk.journey_status && (
                <div>
                  <p className="text-xs text-slate-400">Journey Status</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5 capitalize">
                    {bk.journey_status?.replace(/_/g, " ")}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Quick nav tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { icon: CreditCard, label: "Payments", href: `/customer/booking/${bookingNumber}/payments` },
              { icon: FileText, label: "Invoices", href: `/customer/booking/${bookingNumber}/invoices` },
              { icon: Shield, label: "Agreement", href: `/customer/booking/${bookingNumber}/agreement` },
              { icon: BookOpen, label: "Documents", href: `/customer/booking/${bookingNumber}/documents` },
              { icon: Plane, label: "Flight & Hotel", href: `/customer/booking/${bookingNumber}/flights-hotels` },
              { icon: MapPin, label: "Journey", href: `/customer/booking/${bookingNumber}/timeline` },
            ].map(({ icon: Icon, label, href }) => (
              <button key={href} onClick={() => navigate(href)}
                className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-emerald-200 transition-all text-left">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <Icon size={18} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-0.5">
                    View <ChevronRight size={11} />
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Pilgrims */}
          {pilgrims.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Users size={17} className="text-emerald-600" />
                Pilgrims ({pilgrims.length})
              </h3>
              <div className="space-y-3">
                {pilgrims.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center font-semibold text-emerald-700 text-sm shrink-0">
                      {p.full_name?.[0] || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-xs text-slate-400">
                        {p.gender ? p.gender : "Pilgrim"}
                        {p.nationality ? ` · ${p.nationality}` : ""}
                      </p>
                    </div>
                    {p.visa_status && p.visa_status !== "not_applied" ? (
                      <Badge className="bg-green-100 text-green-700 text-[10px] capitalize">{p.visa_status.replace(/_/g, " ")}</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-700 text-[10px]">Visa Pending</Badge>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Agreement & Docs summary */}
          {(data?.agreement || data?.documentCount > 0) && (
            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Status Summary</h3>
              <div className="space-y-2">
                {data?.agreement && (
                  <div className="flex items-center gap-2 text-sm">
                    {data.agreement.status === "signed"
                      ? <CheckCircle size={15} className="text-green-500" />
                      : <Clock size={15} className="text-amber-500" />}
                    <span className="text-slate-600">
                      Agreement: <span className="font-medium capitalize">{data.agreement.status}</span>
                    </span>
                  </div>
                )}
                {data?.documentCount > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle size={15} className="text-blue-500" />
                    <span className="text-slate-600">
                      {data.documentCount} document{data.documentCount !== 1 ? "s" : ""} uploaded
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </CustomerPortalLayout>
  );
}
