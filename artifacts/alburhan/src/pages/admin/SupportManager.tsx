import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, Send, Search, Filter, ChevronRight, ArrowLeft, Lock } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open:     { label: "Open",     color: "bg-blue-100 text-blue-800 border-blue-200" },
  pending:  { label: "Pending",  color: "bg-amber-100 text-amber-800 border-amber-200" },
  resolved: { label: "Resolved", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  closed:   { label: "Closed",   color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "text-gray-500" },
  normal: { label: "Normal", color: "text-blue-600" },
  high:   { label: "High",   color: "text-orange-600 font-semibold" },
  urgent: { label: "URGENT", color: "text-red-600 font-bold animate-pulse" },
};

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SupportManager() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketDetail, setTicketDetail] = useState<{ ticket: any; messages: any[] } | null>(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const [r, sr] = await Promise.all([
        fetch(`${BASE_API}/api/support/admin/tickets?${params}`, { credentials: "include" }),
        fetch(`${BASE_API}/api/support/admin/stats`, { credentials: "include" }),
      ]);
      if (r.ok) setTickets(await r.json());
      if (sr.ok) setStats(await sr.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(); }, [statusFilter, search]);

  const fetchDetail = async (ticket: any) => {
    setSelectedTicket(ticket);
    try {
      const r = await fetch(`${BASE_API}/api/support/admin/tickets/${ticket.id}`, { credentials: "include" });
      if (r.ok) setTicketDetail(await r.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [ticketDetail?.messages]);

  const updateStatus = async (status: string) => {
    if (!ticketDetail) return;
    setUpdatingStatus(true);
    try {
      const r = await fetch(`${BASE_API}/api/support/admin/tickets/${ticketDetail.ticket.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `Ticket marked as ${status}` });
      fetchDetail({ ...ticketDetail.ticket, status });
      fetchTickets();
    } catch {
      toast({ title: "Error updating status", variant: "destructive" });
    } finally { setUpdatingStatus(false); }
  };

  const sendReply = async () => {
    if (!replyText.trim() || !ticketDetail) return;
    setSendingReply(true);
    try {
      const fd = new FormData();
      fd.append("message", replyText.trim());
      fd.append("isInternal", String(isInternal));
      const r = await fetch(`${BASE_API}/api/support/admin/tickets/${ticketDetail.ticket.id}/messages`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!r.ok) throw new Error("Failed to send");
      setReplyText("");
      setIsInternal(false);
      fetchDetail(ticketDetail.ticket);
      fetchTickets();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSendingReply(false); }
  };

  const statusCfg = (s: string) => STATUS_CONFIG[s] || STATUS_CONFIG.open;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Support Center</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage customer support tickets</p>
          </div>
          {/* Stats */}
          <div className="flex gap-3">
            {[
              { label: "Open", value: stats.open_count, color: "text-blue-600" },
              { label: "Pending", value: stats.pending_count, color: "text-amber-600" },
              { label: "Urgent", value: stats.urgent_count, color: "text-red-600" },
              { label: "Today", value: stats.today_count, color: "text-emerald-600" },
            ].map(s => (
              <div key={s.label} className="text-center px-3 py-2 rounded-xl border bg-background">
                <p className={`text-xl font-bold ${s.color}`}>{s.value ?? 0}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Ticket list */}
          <div className="lg:col-span-2 space-y-3">
            {/* Filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 text-sm"
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
              ) : tickets.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No tickets found.</div>
              ) : (
                tickets.map((ticket: any) => {
                  const cfg = statusCfg(ticket.status);
                  const pCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
                  const isSelected = selectedTicket?.id === ticket.id;
                  return (
                    <button
                      key={ticket.id}
                      className={`w-full text-left rounded-xl border p-3 transition-all ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}
                      onClick={() => fetchDetail(ticket)}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{ticket.subject}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{ticket.customer_name} · {ticket.ticket_number}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] px-1.5 ${cfg.color}`}>{cfg.label}</Badge>
                            <span className={`text-[10px] ${pCfg.color}`}>{pCfg.label}</span>
                            {ticket.unread_count > 0 && (
                              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {ticket.unread_count} new
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground shrink-0">{formatDate(ticket.updated_at)}</p>
                      </div>
                      {ticket.last_message && (
                        <p className="text-xs text-muted-foreground mt-1.5 truncate opacity-70">{ticket.last_message}</p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Ticket Detail */}
          <div className="lg:col-span-3">
            {!selectedTicket ? (
              <div className="rounded-2xl border border-dashed border-border h-full flex flex-col items-center justify-center py-20 text-center">
                <MessageSquare size={40} className="text-muted-foreground/40 mb-3" />
                <p className="font-medium text-muted-foreground">Select a ticket to view</p>
              </div>
            ) : ticketDetail ? (
              <div className="rounded-2xl border border-border overflow-hidden flex flex-col h-full max-h-[calc(100vh-200px)]">
                {/* Header */}
                <div className="p-4 bg-muted/30 border-b">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{ticketDetail.ticket.subject}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                        <span>{ticketDetail.ticket.ticket_number}</span>
                        <span>·</span>
                        <span>{ticketDetail.ticket.customer_name}</span>
                        {ticketDetail.ticket.customer_mobile && <span>({ticketDetail.ticket.customer_mobile})</span>}
                        <span>·</span>
                        <span className="capitalize">{ticketDetail.ticket.category}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {ticketDetail.ticket.status !== "resolved" && (
                        <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300 h-8 text-xs"
                          disabled={updatingStatus} onClick={() => updateStatus("resolved")}>
                          <CheckCircle size={13} className="mr-1" /> Resolve
                        </Button>
                      )}
                      {ticketDetail.ticket.status !== "closed" && (
                        <Button size="sm" variant="outline" className="text-gray-600 h-8 text-xs"
                          disabled={updatingStatus} onClick={() => updateStatus("closed")}>
                          <XCircle size={13} className="mr-1" /> Close
                        </Button>
                      )}
                      {ticketDetail.ticket.status === "closed" && (
                        <Button size="sm" variant="outline" className="text-blue-600 h-8 text-xs"
                          disabled={updatingStatus} onClick={() => updateStatus("open")}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/5">
                  {ticketDetail.messages.map((msg: any) => {
                    const isAdmin = msg.sender_type === "admin";
                    return (
                      <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                          msg.is_internal
                            ? "bg-yellow-50 border border-yellow-200 rounded-bl-sm"
                            : isAdmin
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-background border rounded-bl-sm"
                        }`}>
                          <p className={`text-[11px] font-semibold mb-1 ${msg.is_internal ? "text-yellow-700" : isAdmin ? "text-primary-foreground/80" : "text-primary"}`}>
                            {msg.is_internal ? "🔒 Internal Note" : msg.sender_name || "—"}
                          </p>
                          <p className="whitespace-pre-wrap">{msg.message}</p>
                          {msg.attachment_url && (
                            <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
                              className="block mt-1 underline text-[12px] opacity-80">
                              📎 Attachment
                            </a>
                          )}
                          <p className={`text-[10px] mt-1 ${isAdmin && !msg.is_internal ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            {formatDate(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply */}
                {ticketDetail.ticket.status !== "closed" && (
                  <div className="p-3 border-t bg-background space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={isInternal}
                          onChange={e => setIsInternal(e.target.checked)}
                        />
                        <Lock size={12} /> Internal note (not visible to customer)
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <textarea
                        className={`flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                          isInternal ? "bg-yellow-50 border-yellow-200" : "bg-background border-border"
                        }`}
                        rows={3}
                        placeholder={isInternal ? "Internal note…" : "Reply to customer…"}
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                      />
                      <Button size="sm" className="self-end px-3" disabled={!replyText.trim() || sendingReply} onClick={sendReply}>
                        <Send size={15} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border h-full flex items-center justify-center py-20">
                <div className="text-muted-foreground text-sm">Loading…</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
