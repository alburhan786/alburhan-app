import React, { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, Plus, Clock, CheckCircle, AlertCircle, XCircle, ChevronRight, Send, Paperclip, ArrowLeft } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  open:     { label: "Open",     color: "bg-blue-100 text-blue-800 border-blue-200",    icon: MessageSquare },
  pending:  { label: "Pending",  color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  resolved: { label: "Resolved", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle },
  closed:   { label: "Closed",   color: "bg-gray-100 text-gray-600 border-gray-200",   icon: XCircle },
};

const CATEGORIES = [
  { value: "general",  label: "General Inquiry" },
  { value: "payment",  label: "Payment Issue" },
  { value: "booking",  label: "Booking Help" },
  { value: "document", label: "Document Issue" },
  { value: "visa",     label: "Visa Query" },
  { value: "flight",   label: "Flight / Ticket" },
  { value: "hotel",    label: "Hotel / Room" },
  { value: "other",    label: "Other" },
];

const PRIORITIES = [
  { value: "low",    label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SupportCenter() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketDetail, setTicketDetail] = useState<{ ticket: any; messages: any[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);

  // New ticket form
  const [formSubject, setFormSubject] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formPriority, setFormPriority] = useState("normal");
  const [formMessage, setFormMessage] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reply
  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sendingReply, setSendingReply] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const r = await fetch(`${BASE_API}/api/support/tickets`, { credentials: "include" });
      if (r.ok) setTickets(await r.json());
    } catch { /* ignore */ } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => { fetchTickets(); }, []);

  const fetchTicketDetail = async (ticket: any) => {
    setSelectedTicket(ticket);
    setLoadingDetail(true);
    try {
      const r = await fetch(`${BASE_API}/api/support/tickets/${ticket.id}`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setTicketDetail(data);
        // Refresh ticket list to update unread count
        fetchTickets();
      }
    } catch { /* ignore */ } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [ticketDetail?.messages]);

  const handleCreateTicket = async () => {
    if (!formSubject.trim() || !formMessage.trim()) {
      toast({ title: "Please fill in subject and message", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("subject", formSubject.trim());
      fd.append("category", formCategory);
      fd.append("priority", formPriority);
      fd.append("message", formMessage.trim());
      if (formFile) fd.append("attachment", formFile);

      const r = await fetch(`${BASE_API}/api/support/tickets`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create ticket");
      }
      const ticket = await r.json();
      toast({ title: `Ticket ${ticket.ticketNumber} created!`, description: "We'll respond within 24 hours." });
      setShowNewTicket(false);
      setFormSubject(""); setFormCategory("general"); setFormPriority("normal");
      setFormMessage(""); setFormFile(null);
      fetchTickets();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !ticketDetail) return;
    setSendingReply(true);
    try {
      const fd = new FormData();
      fd.append("message", replyText.trim());
      if (replyFile) fd.append("attachment", replyFile);

      const r = await fetch(`${BASE_API}/api/support/tickets/${ticketDetail.ticket.id}/messages`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send reply");
      }
      setReplyText("");
      setReplyFile(null);
      // Refresh detail
      fetchTicketDetail(ticketDetail.ticket);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingReply(false);
    }
  };

  const statusCfg = (s: string) => STATUS_CONFIG[s] || STATUS_CONFIG.open;

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <a href={(import.meta.env.BASE_URL || "/") + "customer/dashboard"} className="hover:text-primary flex items-center gap-1">
                <ArrowLeft size={14} /> Dashboard
              </a>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Support Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Raise a ticket and we'll help you within 24 hours.
            </p>
          </div>
          <Button onClick={() => setShowNewTicket(true)} className="gap-2">
            <Plus size={16} /> New Ticket
          </Button>
        </div>

        {/* Ticket Detail View */}
        {selectedTicket && ticketDetail && (
          <div className="rounded-2xl border border-border overflow-hidden">
            {/* Ticket header */}
            <div className="flex items-start gap-3 p-4 bg-muted/40 border-b">
              <button
                onClick={() => { setSelectedTicket(null); setTicketDetail(null); }}
                className="text-muted-foreground hover:text-foreground mt-0.5"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{ticketDetail.ticket.subject}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">{ticketDetail.ticket.ticket_number}</span>
                  <Badge variant="outline" className={`text-[11px] px-2 ${statusCfg(ticketDetail.ticket.status).color}`}>
                    {statusCfg(ticketDetail.ticket.status).label}
                  </Badge>
                  <span className="text-xs text-muted-foreground capitalize">{ticketDetail.ticket.category}</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="p-4 space-y-3 max-h-[440px] overflow-y-auto bg-muted/10">
              {loadingDetail ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Loading messages…</div>
              ) : ticketDetail.messages.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No messages yet.</div>
              ) : (
                ticketDetail.messages
                  .filter(m => !m.is_internal)
                  .map((msg: any) => {
                    const isCustomer = msg.sender_type === "customer";
                    return (
                      <div key={msg.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                          isCustomer
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-background border rounded-bl-sm"
                        }`}>
                          {!isCustomer && (
                            <p className="text-[11px] font-semibold text-primary mb-1">{msg.sender_name || "Support Team"}</p>
                          )}
                          <p className="whitespace-pre-wrap">{msg.message}</p>
                          {msg.attachment_url && (
                            <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
                              className="block mt-2 underline text-[12px] opacity-80">
                              📎 View Attachment
                            </a>
                          )}
                          <p className={`text-[10px] mt-1 ${isCustomer ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {formatDate(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            {ticketDetail.ticket.status !== "closed" ? (
              <div className="p-4 border-t bg-background flex gap-2 items-end">
                <div className="flex-1">
                  <textarea
                    className="w-full resize-none rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    rows={3}
                    placeholder="Type your message…"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                  />
                  {replyFile && (
                    <p className="text-xs text-muted-foreground mt-1">📎 {replyFile.name}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="cursor-pointer text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted/50 transition-colors">
                    <Paperclip size={18} />
                    <input type="file" className="hidden" onChange={e => setReplyFile(e.target.files?.[0] || null)} />
                  </label>
                  <Button
                    size="sm"
                    className="px-3"
                    disabled={!replyText.trim() || sendingReply}
                    onClick={handleSendReply}
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3 border-t bg-muted/30 text-center text-sm text-muted-foreground">
                This ticket is closed. <button className="text-primary underline" onClick={() => setShowNewTicket(true)}>Open a new ticket</button>
              </div>
            )}
          </div>
        )}

        {/* Ticket List */}
        {!selectedTicket && (
          <>
            {loadingTickets ? (
              <div className="py-12 text-center text-muted-foreground">Loading tickets…</div>
            ) : tickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center space-y-3">
                <MessageSquare size={36} className="mx-auto text-muted-foreground/50" />
                <div>
                  <p className="font-semibold text-foreground">No support tickets yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Have a question or issue? We're here to help.
                  </p>
                </div>
                <Button onClick={() => setShowNewTicket(true)} className="gap-2">
                  <Plus size={16} /> Raise a Ticket
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket: any) => {
                  const cfg = statusCfg(ticket.status);
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={ticket.id}
                      className="w-full text-left rounded-2xl border border-border bg-background hover:bg-muted/30 hover:border-primary/30 transition-all p-4"
                      onClick={() => fetchTicketDetail(ticket)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{ticket.subject}</span>
                            {ticket.unread_count > 0 && (
                              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                                {ticket.unread_count} new
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">{ticket.ticket_number}</span>
                            <Badge variant="outline" className={`text-[11px] px-2 gap-1 ${cfg.color}`}>
                              <Icon size={11} />
                              {cfg.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize">{ticket.category?.replace("_", " ")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {formatDate(ticket.updated_at)} · {ticket.message_count || 0} message(s)
                          </p>
                        </div>
                        <ChevronRight size={18} className="text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* New Ticket Dialog */}
        <Dialog open={showNewTicket} onOpenChange={setShowNewTicket}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Raise a Support Ticket</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Subject *</Label>
                <Input
                  value={formSubject}
                  onChange={e => setFormSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  maxLength={120}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                  >
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formPriority}
                    onChange={e => setFormPriority(e.target.value)}
                  >
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Message *</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  rows={5}
                  value={formMessage}
                  onChange={e => setFormMessage(e.target.value)}
                  placeholder="Describe your issue in detail…"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Attachment (optional)</Label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer flex items-center gap-2 text-sm text-primary hover:underline">
                    <Paperclip size={15} />
                    {formFile ? formFile.name : "Attach file (PDF/image, max 10MB)"}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf"
                      onChange={e => setFormFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {formFile && (
                    <button onClick={() => setFormFile(null)} className="text-xs text-destructive">Remove</button>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShowNewTicket(false)}>Cancel</Button>
                <Button
                  className="flex-1"
                  disabled={!formSubject.trim() || !formMessage.trim() || submitting}
                  onClick={handleCreateTicket}
                >
                  {submitting ? "Submitting…" : "Submit Ticket"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
