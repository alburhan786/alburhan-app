import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import {
  MessageSquare, CheckCircle, XCircle, Clock, Smartphone,
  Mail, Phone, Wifi, ChevronLeft, ChevronRight
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const CHANNEL_ICONS: Record<string, React.ComponentType<any>> = {
  whatsapp: Smartphone,
  sms: Phone,
  email: Mail,
  rcs: Wifi,
  push: Smartphone,
};

const STATUS_COLOR: Record<string, string> = {
  delivered: "bg-green-100 text-green-700",
  sent:       "bg-blue-100 text-blue-700",
  failed:     "bg-red-100 text-red-700",
  pending:    "bg-amber-100 text-amber-700",
  read:       "bg-emerald-100 text-emerald-700",
};

function eventLabel(eventType: string) {
  return (eventType || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function CommunicationsPage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber/communications");
  const bookingNumber = params?.bookingNumber;
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  async function load(p: number) {
    setLoading(true);
    try {
      const r = await fetch(
        `${API}/api/customer/bookings/${bookingNumber}/communications?page=${p}`,
        { credentials: "include" }
      );
      if (r.ok) {
        const d = await r.json();
        setLogs(d.logs || []);
        setTotal(d.total || 0);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (bookingNumber) load(page);
  }, [bookingNumber, page]);

  const totalPages = Math.ceil(total / 20);

  return (
    <CustomerPortalLayout title="Communications" bookingNumber={bookingNumber}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{total} message{total !== 1 ? "s" : ""}</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : logs.length === 0 ? (
          <Card className="p-8 text-center">
            <MessageSquare size={36} className="mx-auto text-slate-200 mb-2" />
            <p className="text-slate-500">No messages yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {logs.map(log => {
              const Icon = CHANNEL_ICONS[log.channel] || MessageSquare;
              const statusClass = STATUS_COLOR[log.status] || "bg-slate-100 text-slate-600";
              return (
                <Card key={log.id} className="p-4 flex gap-3 items-start">
                  <div className="p-2 rounded-full bg-slate-100 shrink-0">
                    <Icon size={14} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-800">
                        {eventLabel(log.event_type)}
                      </p>
                      <Badge className={`${statusClass} text-[10px] capitalize`}>
                        {log.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {log.channel}
                      </Badge>
                    </div>
                    {log.delivery_status && log.delivery_status !== log.status && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Delivery: <span className="capitalize">{log.delivery_status}</span>
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDate(log.sent_at || log.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {log.status === "delivered" || log.status === "read"
                      ? <CheckCircle size={15} className="text-green-400" />
                      : log.status === "failed"
                      ? <XCircle size={15} className="text-red-400" />
                      : <Clock size={15} className="text-amber-400" />
                    }
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button size="sm" variant="outline" onClick={() => setPage(p => p - 1)}
              disabled={page === 1} className="h-8">
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages} className="h-8">
              <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </div>
    </CustomerPortalLayout>
  );
}
