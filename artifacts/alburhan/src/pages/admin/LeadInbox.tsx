// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, Send, Lock, Phone, Mail, User, Clock, AlertCircle, ArrowRight, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

function timeAgo(dateString: string) {
  if (!dateString) return "";
  const diff = Date.now() - new Date(dateString).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function LeadInbox() {
  const { toast } = useToast();
  const [leads, setLeads] = useState([]);
  const [tab, setTab] = useState("open");
  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [conversation, setConversation] = useState([]);
  const [leadDetail, setLeadDetail] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [stats, setStats] = useState({ open: 0, total: 0 });
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/inbox/stats`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingLeads(true);
    fetch(`${API}/api/inbox/leads?status=${tab}&page=0`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(d => setLeads(Array.isArray(d) ? d : []))
      .catch(() => setLeads([]))
      .finally(() => setLoadingLeads(false));
  }, [tab]);

  useEffect(() => {
    if (!selectedLeadId) return;
    setLoadingConv(true);
    fetch(`${API}/api/inbox/conversation/${selectedLeadId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setConversation(d.messages || []);
          setLeadDetail(d.lead || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConv(false));
  }, [selectedLeadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  const handleSend = async (isNote = false) => {
    if (!messageText.trim() || !selectedLeadId) return;
    setSending(true);
    const endpoint = isNote ? `/api/inbox/conversation/${selectedLeadId}/note` : `/api/inbox/conversation/${selectedLeadId}/reply`;
    const body = isNote ? { note: messageText } : { message: messageText, channel };
    
    try {
      const r = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error("Failed to send");
      const newMsg = await r.json();
      setConversation(prev => [...prev, newMsg]);
      setMessageText("");
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  const filteredLeads = leads.filter(l => l.name?.toLowerCase().includes(search.toLowerCase()) || l.mobile?.includes(search));

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-[#0A3D2A]">Lead Inbox</h1>
            <p className="text-sm text-muted-foreground">Manage conversations with your leads across channels</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-[#0A3D2A]/10 px-4 py-2 rounded-xl text-center">
              <div className="text-xl font-bold text-[#0A3D2A]">{stats.open}</div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Open</div>
            </div>
            <div className="bg-[#0A3D2A]/10 px-4 py-2 rounded-xl text-center">
              <div className="text-xl font-bold text-[#0A3D2A]">{stats.total}</div>
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total</div>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex flex-1 gap-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
          
          {/* Left Panel */}
          <div className="w-[30%] flex flex-col border-r bg-muted/10 shrink-0">
            <div className="p-4 border-b space-y-3 bg-white">
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="open">Open</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..." className="pl-9 h-9" />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {loadingLeads ? (
                <div className="p-8 text-center text-muted-foreground">Loading leads...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No leads found in this view.</div>
              ) : (
                <div className="divide-y">
                  {filteredLeads.map(l => (
                    <button
                      key={l.id}
                      onClick={() => setSelectedLeadId(l.id)}
                      className={`w-full text-left p-4 hover:bg-[#0A3D2A]/5 transition-colors ${selectedLeadId === l.id ? "bg-[#0A3D2A]/10 border-l-4 border-l-[#0A3D2A]" : ""}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-semibold text-sm truncate pr-2">{l.name}</div>
                        {l.unread_count > 0 && <Badge variant="destructive" className="h-5 min-w-5 justify-center rounded-full px-1">{l.unread_count}</Badge>}
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground mb-2">
                        <span className="truncate flex items-center gap-1"><Phone size={10} /> {l.mobile}</span>
                        <span>{timeAgo(l.last_message_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider h-5">{l.source || 'Manual'}</Badge>
                        <span className="text-xs truncate opacity-70 flex-1">{l.last_message_preview || 'No messages yet'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel */}
          {selectedLeadId ? (
            <div className="flex-1 flex overflow-hidden bg-[#fafafa]">
              {/* Chat Area */}
              <div className="flex-1 flex flex-col min-w-0 border-r">
                {/* Chat Header */}
                <div className="h-16 px-6 border-b bg-white flex items-center justify-between shrink-0 shadow-sm z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#0A3D2A] text-[#C9A84C] flex items-center justify-center font-bold text-lg">
                      {leadDetail?.name?.charAt(0) || 'L'}
                    </div>
                    <div>
                      <div className="font-bold text-base leading-tight">{leadDetail?.name || 'Loading...'}</div>
                      <div className="text-xs text-muted-foreground">{leadDetail?.mobile}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted-foreground">
                    {sidebarOpen ? 'Hide Info' : 'Show Info'}
                  </Button>
                </div>

                {/* AI Next Action Chip */}
                {leadDetail?.ai_next_action && (
                  <div className="bg-[#C9A84C]/10 border-b border-[#C9A84C]/20 px-6 py-2 flex items-center gap-2 text-sm text-[#0A3D2A] shrink-0">
                    <Brain size={14} className="text-[#C9A84C]" />
                    <span className="font-medium text-[#C9A84C]">AI Suggestion:</span> {leadDetail.ai_next_action}
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {loadingConv ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground">Loading conversation...</div>
                  ) : conversation.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                      <MessageSquare size={48} className="opacity-20 mb-4" />
                      <p>No messages yet. Send the first message below.</p>
                    </div>
                  ) : (
                    conversation.map((msg, i) => {
                      const isIncoming = msg.direction === 'incoming';
                      const isNote = msg.type === 'note';
                      return (
                        <div key={i} className={`flex flex-col max-w-[75%] ${isNote ? 'mx-auto max-w-[85%]' : isIncoming ? 'items-start self-start' : 'items-end self-end ml-auto'}`}>
                          <div className={`
                            px-4 py-2.5 rounded-2xl text-sm relative
                            ${isNote ? 'bg-amber-100 text-amber-900 border border-amber-200' : 
                              isIncoming ? 'bg-white border text-foreground rounded-tl-sm' : 
                              'bg-[#0A3D2A] text-white rounded-tr-sm'}
                          `}>
                            {isNote && <Lock size={12} className="absolute -left-2 -top-2 text-amber-600 bg-amber-100 rounded-full p-0.5" />}
                            {msg.text || msg.message}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5 px-1">
                            <span>{new Date(msg.created_at || msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {!isNote && <span>• {msg.platform || msg.channel || 'System'}</span>}
                            {msg.sender_name && <span>• {msg.sender_name}</span>}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Compose */}
                <div className="p-4 bg-white border-t shrink-0">
                  <div className="flex gap-2 mb-2">
                    <select value={channel} onChange={e => setChannel(e.target.value)} className="h-8 rounded-lg border text-xs px-2 bg-muted/20 outline-none">
                      <option value="whatsapp">WhatsApp</option>
                      <option value="sms">SMS</option>
                    </select>
                  </div>
                  <div className="flex gap-2 relative">
                    <textarea 
                      value={messageText} 
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      placeholder={`Type a message... (Enter to send as ${channel})`}
                      className="flex-1 min-h-[80px] max-h-32 resize-y rounded-xl border bg-muted/10 p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#0A3D2A]"
                    />
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <Button variant="outline" size="sm" onClick={() => handleSend(true)} disabled={sending || !messageText.trim()} className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200 gap-1.5">
                      <Lock size={14} /> Add Internal Note
                    </Button>
                    <Button onClick={() => handleSend(false)} disabled={sending || !messageText.trim()} className="bg-[#0A3D2A] hover:bg-[#0A3D2A]/90 gap-2">
                      <Send size={14} /> Send {channel}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              {sidebarOpen && (
                <div className="w-[280px] border-l bg-white shrink-0 overflow-y-auto">
                  <div className="p-6 space-y-6">
                    <div className="text-center pb-6 border-b">
                      <div className="w-20 h-20 mx-auto rounded-full bg-[#0A3D2A]/10 text-[#0A3D2A] flex items-center justify-center font-bold text-3xl mb-3">
                        {leadDetail?.name?.charAt(0) || 'L'}
                      </div>
                      <h2 className="text-lg font-bold">{leadDetail?.name}</h2>
                      <div className="flex justify-center mt-2 gap-2">
                        <Badge variant="outline" className="text-xs uppercase bg-[#C9A84C]/10 text-[#0A3D2A] border-[#C9A84C]/30">
                          {leadDetail?.stage || 'New Lead'}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Contact Info</div>
                        <div className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted/20">
                          <Phone size={14} className="text-muted-foreground" /> {leadDetail?.mobile || '-'}
                        </div>
                        {leadDetail?.email && (
                          <div className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted/20">
                            <Mail size={14} className="text-muted-foreground" /> {leadDetail.email}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Lead Details</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-muted/20 p-2 rounded-lg">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Source</div>
                            <div className="text-xs font-semibold capitalize">{leadDetail?.source || '-'}</div>
                          </div>
                          <div className="bg-muted/20 p-2 rounded-lg">
                            <div className="text-[10px] text-muted-foreground mb-0.5">Assigned</div>
                            <div className="text-xs font-semibold">{leadDetail?.assigned_to_name || 'Unassigned'}</div>
                          </div>
                          <div className="bg-[#0A3D2A]/5 p-2 rounded-lg col-span-2 border border-[#0A3D2A]/10">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="text-[10px] text-[#0A3D2A]/60 mb-0.5 font-bold uppercase">AI Score</div>
                                <div className="text-sm font-bold text-[#0A3D2A]">{leadDetail?.ai_score || leadDetail?.score || 'N/A'}</div>
                              </div>
                              <Brain size={20} className="text-[#C9A84C] opacity-50" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {leadDetail?.notes && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Lead Notes</div>
                          <div className="text-xs bg-amber-50 text-amber-900 p-3 rounded-lg border border-amber-100">
                            {leadDetail.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#fafafa] text-muted-foreground">
              <div className="w-20 h-20 rounded-full bg-[#0A3D2A]/5 flex items-center justify-center mb-4">
                <MessageSquare size={32} className="text-[#0A3D2A]/40" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Select a conversation</h3>
              <p className="text-sm">Choose a lead from the left panel to view and reply to messages.</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
