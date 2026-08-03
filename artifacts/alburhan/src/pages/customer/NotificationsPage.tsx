import { useState, useEffect, useCallback } from "react";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { Bell, CheckCheck, Archive, ExternalLink, ChevronLeft, ChevronRight, Filter } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const TYPE_COLOR: Record<string, string> = {
  info:    "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  error:   "bg-red-100 text-red-700",
  admin:   "bg-purple-100 text-purple-700",
};

export default function NotificationsPage() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async (p: number, f: "all" | "unread") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (f === "unread") params.set("unread", "true");
      const r = await fetch(`${API}/api/customer/notifications?${params}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setNotifications(d.notifications || []);
        setTotal(d.total || 0);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(page, filter); }, [page, filter, load]);

  async function markRead(id: string) {
    await fetch(`${API}/api/customer/notifications/${id}/read`, { method: "PUT", credentials: "include" });
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    await fetch(`${API}/api/customer/notifications/read-all`, { method: "PUT", credentials: "include" });
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })));
    toast({ title: "All marked as read" });
  }

  async function archive(id: string) {
    await fetch(`${API}/api/customer/notifications/${id}/archive`, { method: "PUT", credentials: "include" });
    setNotifications(ns => ns.filter(n => n.id !== id));
    setTotal(t => t - 1);
  }

  const hasUnread = notifications.some(n => !n.is_read);
  const totalPages = Math.ceil(total / 20);

  return (
    <CustomerPortalLayout title="Notifications">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"}
              onClick={() => { setPage(1); setFilter("all"); }}
              className={`h-8 text-xs ${filter === "all" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
              All
            </Button>
            <Button size="sm" variant={filter === "unread" ? "default" : "outline"}
              onClick={() => { setPage(1); setFilter("unread"); }}
              className={`h-8 text-xs ${filter === "unread" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
              Unread
            </Button>
          </div>
          {hasUnread && (
            <Button size="sm" variant="outline" onClick={markAllRead} className="h-8 text-xs">
              <CheckCheck size={13} className="mr-1" />Mark all read
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : notifications.length === 0 ? (
          <Card className="p-10 text-center">
            <Bell size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500">
              {filter === "unread" ? "You're all caught up!" : "No notifications yet."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <Card
                key={n.id}
                onClick={() => { if (!n.is_read) markRead(n.id); }}
                className={`p-4 transition-colors cursor-pointer ${
                  !n.is_read ? "border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/40" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex gap-3 items-start">
                  {!n.is_read && (
                    <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                      {n.type && n.type !== "info" && (
                        <Badge className={`${TYPE_COLOR[n.type] || "bg-slate-100 text-slate-600"} text-[10px]`}>
                          {n.type}
                        </Badge>
                      )}
                      {n.priority === "high" && (
                        <Badge className="bg-red-100 text-red-700 text-[10px]">High priority</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{n.message}</p>
                    {n.category && n.category !== "general" && (
                      <p className="text-xs text-slate-400 mt-1 capitalize">{n.category.replace(/_/g, " ")}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{formatDate(n.created_at)}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {n.action_url && (
                      <a href={n.action_url} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded">
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button onClick={e => { e.stopPropagation(); archive(n.id); }}
                      className="p-1.5 text-slate-300 hover:text-slate-500 rounded">
                      <Archive size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
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
