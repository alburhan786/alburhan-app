import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  CreditCard, FileText, Plane, AlertCircle, CheckCircle,
  Clock, Bell, ChevronRight, User, BookOpen, Phone,
  ArrowRight, IndianRupee, TrendingUp, Package
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface OverviewData {
  profile: any;
  bookings: any[];
  unreadCount: number;
  pendingEdits: number;
  recentNotifications: any[];
}

function statusColor(s: string) {
  if (s === "confirmed" || s === "approved") return "bg-green-100 text-green-700";
  if (s === "pending") return "bg-yellow-100 text-yellow-700";
  if (s === "cancelled" || s === "rejected") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function BookingCard({ b }: { b: any }) {
  const pct = b.total_amount > 0 ? Math.min(100, Math.round((b.paid_amount / b.total_amount) * 100)) : 0;
  const bookingNumber = b.booking_number;
  const [, navigate] = useLocation();

  return (
    <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer border border-slate-200"
      onClick={() => navigate(`/customer/booking/${bookingNumber}`)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{b.package_name || "Hajj / Umrah Package"}</p>
          <p className="text-xs text-slate-400 mt-0.5">#{bookingNumber}</p>
        </div>
        <Badge className={`${statusColor(b.status)} text-xs capitalize`}>{b.status}</Badge>
      </div>

      {b.group_departure_date && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
          <Plane size={13} className="text-emerald-500" />
          <span>Departure: {formatDate(b.group_departure_date || b.preferred_departure_date)}</span>
        </div>
      )}

      {b.total_amount > 0 && (
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Payment</span>
            <span>{formatCurrency(b.paid_amount)} / {formatCurrency(b.total_amount)}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-amber-400"}`}
              style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-1">{pct}% paid</p>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs"
          onClick={e => { e.stopPropagation(); navigate(`/customer/booking/${bookingNumber}/payments`); }}>
          <CreditCard size={13} className="mr-1" />Payments
        </Button>
        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs"
          onClick={e => { e.stopPropagation(); navigate(`/customer/booking/${bookingNumber}/timeline`); }}>
          <Plane size={13} className="mr-1" />Journey
        </Button>
      </div>
    </Card>
  );
}

function QuickLink({ icon: Icon, label, href, badge }: {
  icon: React.ComponentType<any>; label: string; href: string; badge?: number;
}) {
  return (
    <Link href={href}>
      <a className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-slate-200 hover:shadow-md hover:border-emerald-200 transition-all">
        <div className="relative">
          <Icon size={22} className="text-emerald-600" />
          {badge && badge > 0 ? (
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </div>
        <span className="text-xs font-medium text-slate-600 text-center leading-tight">{label}</span>
      </a>
    </Link>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/customer/overview`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const primaryBooking = data?.bookings?.[0];

  return (
    <CustomerPortalLayout title="My Overview" bookingNumber={primaryBooking?.booking_number}>
      {/* Greeting */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">
          Assalamu Alaikum, {data?.profile?.full_name?.split(" ")[0] ?? user?.name?.split(" ")[0] ?? "Pilgrim"} 🌙
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">Welcome to your Hajj & Umrah portal</p>
      </div>

      {/* Quick actions grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-5 gap-3 mb-6">
        <QuickLink icon={User}       label="Profile"       href="/customer/profile" badge={data?.pendingEdits} />
        <QuickLink icon={Bell}       label="Notifications" href="/customer/notifications" badge={data?.unreadCount} />
        <QuickLink icon={BookOpen}   label="Resources"     href="/customer/resources" />
        <QuickLink icon={Phone}      label="Emergency"     href="/customer/emergency" />
        <QuickLink icon={FileText}   label="Support"       href="/customer/support" />
      </div>

      {/* Bookings */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">My Bookings</h3>
          {data?.bookings && data.bookings.length > 1 && (
            <Link href="/customer/my-booking">
              <a className="text-xs text-emerald-600 flex items-center gap-1 hover:underline">
                View all <ChevronRight size={13} />
              </a>
            </Link>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : !data?.bookings?.length ? (
          <Card className="p-8 text-center border-dashed border-2">
            <Package size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm">No bookings found</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {data.bookings.map(b => <BookingCard key={b.id} b={b} />)}
          </div>
        )}
      </section>

      {/* Recent Notifications */}
      {data?.recentNotifications?.length ? (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Recent Updates</h3>
            <Link href="/customer/notifications">
              <a className="text-xs text-emerald-600 flex items-center gap-1 hover:underline">
                See all <ChevronRight size={13} />
              </a>
            </Link>
          </div>
          <div className="space-y-2">
            {data.recentNotifications.map(n => (
              <Card key={n.id} className={`p-3.5 flex gap-3 items-start ${!n.is_read ? "border-emerald-200 bg-emerald-50/30" : ""}`}>
                <div className={`mt-0.5 rounded-full p-1 ${!n.is_read ? "bg-emerald-100" : "bg-slate-100"}`}>
                  <Bell size={13} className={!n.is_read ? "text-emerald-600" : "text-slate-400"} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{formatDate(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                )}
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </CustomerPortalLayout>
  );
}
