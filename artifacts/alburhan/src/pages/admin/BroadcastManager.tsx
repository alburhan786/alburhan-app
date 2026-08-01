import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { Send, RefreshCw, Megaphone, Users, Clock, RotateCcw, CheckCircle2, MessageSquare, Smartphone, Bell, Radio } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const BROADCAST_TYPES = [
  { value: "mina_update",    label: "🕌 Mina Update" },
  { value: "tawaf_update",   label: "🕋 Tawaf Update" },
  { value: "madinah_update", label: "🟢 Madinah Update" },
  { value: "flight_update",  label: "✈️ Flight Update" },
  { value: "bus_update",     label: "🚌 Bus Update" },
  { value: "food_update",    label: "🍽️ Food Update" },
  { value: "ziyarat_update", label: "🗺️ Ziyarat Update" },
  { value: "general",        label: "📢 General Announcement" },
];

const AUDIENCE_OPTIONS = [
  { value: "all",            label: "All Customers" },
  { value: "hajj_2026",     label: "Hajj 2026 Group" },
  { value: "hajj_2027",     label: "Hajj 2027 Group" },
  { value: "confirmed",      label: "Confirmed Bookings" },
  { value: "approved",       label: "Approved (Pending Payment)" },
  { value: "partially_paid", label: "Partially Paid" },
];

const TYPE_BADGE_COLOR: Record<string, string> = {
  mina_update:    "bg-amber-100 text-amber-800",
  tawaf_update:   "bg-emerald-100 text-emerald-800",
  madinah_update: "bg-green-100 text-green-800",
  flight_update:  "bg-sky-100 text-sky-800",
  bus_update:     "bg-indigo-100 text-indigo-800",
  food_update:    "bg-orange-100 text-orange-800",
  ziyarat_update: "bg-violet-100 text-violet-800",
  general:        "bg-gray-100 text-gray-800",
};

interface BroadcastRecord {
  id: string;
  title: string;
  message: string;
  type: string;
  audience: string;
  channels: string[];
  recipientCount: number;
  sentAt: string;
  sentBy?: string;
}

export default function BroadcastManager() {
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");
  const [audience, setAudience] = useState("all");
  const [channels, setChannels] = useState<string[]>(["whatsapp", "dashboard"]);
  const [rcsRichMode, setRcsRichMode] = useState(false);
  const [rcsUrl, setRcsUrl] = useState("");
  const [rcsAgent, setRcsAgent] = useState<"jio" | "vi">("jio");
  const [sending, setSending] = useState(false);

  const [history, setHistory] = useState<BroadcastRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  function toggleChannel(ch: string) {
    setChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${BASE_API}/api/broadcasts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load history");
      setHistory(await res.json());
      setHistoryLoaded(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast({ title: "Missing fields", description: "Title and message are required.", variant: "destructive" });
      return;
    }
    if (channels.length === 0) {
      toast({ title: "Select channel", description: "Choose at least one delivery channel.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${BASE_API}/api/broadcasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, message, type, audience, channels, rcsUrl: rcsUrl.trim() || undefined, rcsAgent, rcsRichMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send");
      toast({ title: "Broadcast Sent!", description: data.message });
      setTitle("");
      setMessage("");
      if (historyLoaded) loadHistory();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function handleResend(id: string) {
    setResendingId(id);
    try {
      const res = await fetch(`${BASE_API}/api/broadcasts/${id}/resend`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Resend failed");
      toast({ title: "Resent!", description: data.message });
      loadHistory();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResendingId(null);
    }
  }

  const typeLabel = (t: string) => BROADCAST_TYPES.find(x => x.value === t)?.label ?? t;
  const audienceLabel = (a: string) => AUDIENCE_OPTIONS.find(x => x.value === a)?.label ?? a;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Broadcast Messages</h1>
            <p className="text-sm text-muted-foreground">Send updates via WhatsApp, SMS, RCS, and Dashboard</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Compose Form */}
          <Card className="lg:col-span-3 p-6 space-y-5">
            <h2 className="font-bold text-base flex items-center gap-2 text-primary">
              <Send className="w-4 h-4" /> Compose Message
            </h2>
            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <Label htmlFor="title" className="text-xs font-semibold mb-1">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Mina Bus Schedule Update"
                  className="text-sm"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold mb-1">Message Type</Label>
                <select
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  value={type}
                  onChange={e => setType(e.target.value)}
                >
                  {BROADCAST_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold mb-1">Audience</Label>
                <select
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  value={audience}
                  onChange={e => setAudience(e.target.value)}
                >
                  {AUDIENCE_OPTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="message" className="text-xs font-semibold mb-1">Message *</Label>
                <textarea
                  id="message"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Type your update here..."
                  className="w-full border border-input rounded-md px-3 py-2 text-sm min-h-[140px] resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
                <p className="text-[11px] text-muted-foreground mt-1">{message.length} characters</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {["{name}", "{phone}", "{group}", "{bus}", "{hotel}"].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMessage(prev => prev + v)}
                      className="text-[10px] font-mono bg-muted border border-border text-muted-foreground px-1.5 py-0.5 rounded hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                  <span className="text-[10px] text-muted-foreground/60 self-center ml-0.5">— click to insert variable</span>
                </div>
              </div>

              {/* WhatsApp Preview */}
              {(title || message) && (
                <div className="rounded-xl bg-[#e9fbe7] border border-[#c8e6c9] p-3">
                  <p className="text-[10px] font-bold text-[#388e3c] mb-1.5">WhatsApp Preview</p>
                  <p className="text-xs text-gray-800 whitespace-pre-wrap">
                    🕋 <strong>{title || "Title"}</strong>{"\n\n"}{message || "Your message..."}{"\n\n"}<em>Al Burhan Tours & Travels</em>
                  </p>
                </div>
              )}

              {/* Channel Selection */}
              <div>
                <Label className="text-xs font-semibold mb-2">Send via</Label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { id: "whatsapp",  label: "WhatsApp", icon: MessageSquare, color: "border-green-300 bg-green-50 text-green-700" },
                    { id: "sms",       label: "SMS",      icon: Smartphone,    color: "border-blue-300 bg-blue-50 text-blue-700" },
                    { id: "rcs",       label: "RCS",      icon: Radio,         color: "border-violet-300 bg-violet-50 text-violet-700" },
                    { id: "dashboard", label: "Dashboard",icon: Bell,          color: "border-purple-300 bg-purple-50 text-purple-700" },
                  ].map(ch => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => toggleChannel(ch.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        channels.includes(ch.id)
                          ? ch.color + " border-opacity-100"
                          : "border-border bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <ch.icon size={14} />
                      {ch.label}
                      {channels.includes(ch.id) && <CheckCircle2 size={13} className="ml-0.5" />}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  RCS fails → WhatsApp fallback → SMS fallback (automatic cascade).
                </p>
              </div>

              {/* RCS Rich Options — shown only when RCS is selected */}
              {channels.includes("rcs") && (
                <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-violet-800 flex items-center gap-1.5">
                      <Radio size={13} /> RCS Options
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-violet-600">Rich Mode</span>
                      <button
                        type="button"
                        onClick={() => setRcsRichMode(v => !v)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${rcsRichMode ? "bg-violet-600" : "bg-gray-300"}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rcsRichMode ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                      <span className={`text-[11px] font-semibold ${rcsRichMode ? "text-violet-700" : "text-muted-foreground"}`}>
                        {rcsRichMode ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>

                  {rcsRichMode ? (
                    <>
                      <div>
                        <Label className="text-xs font-semibold text-violet-800 mb-1">Button URL</Label>
                        <Input
                          value={rcsUrl}
                          onChange={e => setRcsUrl(e.target.value)}
                          placeholder="https://alburhantravels.com/invoice/INV123"
                          className="text-sm border-violet-200 focus:ring-violet-400"
                        />
                        <p className="text-[10px] text-violet-600 mt-1">Invoice, hotel map, ticket download link, etc.</p>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-violet-800 mb-1">Network Agent</Label>
                        <div className="flex gap-2">
                          {(["jio", "vi"] as const).map(ag => (
                            <button
                              key={ag}
                              type="button"
                              onClick={() => setRcsAgent(ag)}
                              className={`px-4 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all capitalize ${
                                rcsAgent === ag
                                  ? "bg-violet-600 border-violet-600 text-white"
                                  : "border-violet-200 text-violet-700 bg-white"
                              }`}
                            >
                              {ag === "jio" ? "Jio" : "VI"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white border border-violet-200 p-2.5">
                        <p className="text-[10px] font-semibold text-violet-700 mb-1">Rich RCS Preview</p>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{title || "Title"}{"\n"}{message || "Your message..."}</p>
                        {rcsUrl && <div className="mt-2 bg-violet-100 text-violet-800 text-[11px] font-semibold rounded px-2 py-1 text-center">🔗 View Details →</div>}
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-violet-600">Plain text RCS — no button link. Toggle Rich Mode ON to add a URL button.</p>
                  )}
                </div>
              )}

              <Button
                type="submit"
                disabled={sending || channels.length === 0}
                className="w-full bg-primary text-white hover:bg-primary/90 font-semibold"
              >
                {sending ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Send Now</>
                )}
              </Button>
            </form>
          </Card>

          {/* Stats panel */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4 bg-primary text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-3">Delivery Channels</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-accent shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">WhatsApp</p>
                    <p className="text-[11px] text-white/60">Via BotBee API</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-accent shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">SMS</p>
                    <p className="text-[11px] text-white/60">Via Fast2SMS quick route</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Radio className="w-5 h-5 text-accent shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">RCS</p>
                    <p className="text-[11px] text-white/60">Via Lemin AI — falls back to SMS</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-accent shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">Dashboard</p>
                    <p className="text-[11px] text-white/60">Customer notification panel</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Message Types</p>
              <div className="flex flex-wrap gap-1.5">
                {BROADCAST_TYPES.map(t => (
                  <span key={t.value} className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE_COLOR[t.value]}`}>
                    {t.label}
                  </span>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* History */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base flex items-center gap-2 text-primary">
              <Clock className="w-4 h-4" /> Message History
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHistory}
              disabled={loadingHistory}
              className="text-xs gap-1.5"
            >
              {loadingHistory ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {historyLoaded ? "Refresh" : "Load History"}
            </Button>
          </div>

          {!historyLoaded ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Click "Load History" to see past broadcasts</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Megaphone className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No broadcasts sent yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map(b => (
                <div key={b.id} className="border border-border rounded-xl p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-sm truncate">{b.title}</p>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE_COLOR[b.type] || "bg-gray-100 text-gray-700"}`}>
                          {typeLabel(b.type)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{b.message}</p>
                      <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Users size={11} /> {b.recipientCount} recipients</span>
                        <span>· {audienceLabel(b.audience)}</span>
                        <span>· {formatDate(b.sentAt)}</span>
                        <span className="flex gap-1">
                          {b.channels?.map(ch => (
                            <span key={ch} className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium capitalize">{ch}</span>
                          ))}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 text-xs gap-1.5"
                      disabled={resendingId === b.id}
                      onClick={() => handleResend(b.id)}
                    >
                      {resendingId === b.id ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Resend
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
