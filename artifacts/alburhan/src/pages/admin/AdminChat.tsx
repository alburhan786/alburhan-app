import React, { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Loader2, Sparkles, RefreshCw } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

interface Message {
  role: "user" | "assistant";
  text: string;
  data?: any[];
  dataType?: string;
  timestamp: Date;
}

const QUICK_QUERIES = [
  "Show pending visas",
  "Show overdue payments",
  "Today's departures",
  "Missing passports",
  "Unsigned agreements",
  "Open support tickets",
  "Revenue this month",
  "Pending bookings",
  "Expiring passports",
  "Lead follow-ups due",
  "Top packages by booking",
  "Upcoming flights this week",
];

function DataTable({ rows, type }: { rows: any[]; type: string }) {
  if (!rows || rows.length === 0) return null;
  const keys = Object.keys(rows[0]).filter(k => k !== "id" && k !== "booking_id" && k !== "pilgrim_id").slice(0, 5);
  const fmtVal = (v: any) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number" && v > 10000) return `₹${v.toLocaleString("en-IN")}`;
    if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(v).toLocaleDateString("en-IN");
    return String(v).slice(0, 40);
  };
  return (
    <div className="mt-3 rounded-xl border overflow-hidden text-xs">
      <div className="grid bg-muted/40 px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider gap-2"
        style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}>
        {keys.map(k => <span key={k}>{k.replace(/_/g, " ")}</span>)}
      </div>
      {rows.slice(0, 10).map((row, i) => (
        <div key={i} className="grid px-3 py-2 border-t gap-2 hover:bg-muted/10"
          style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}>
          {keys.map(k => <span key={k} className="truncate">{fmtVal(row[k])}</span>)}
        </div>
      ))}
      {rows.length > 10 && <p className="px-3 py-1.5 text-muted-foreground border-t">+{rows.length - 10} more</p>}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${isUser ? "bg-primary text-primary-foreground" : "bg-violet-100 text-violet-700"}`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`flex-1 max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-3 text-sm ${isUser ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted/60 rounded-tl-sm"}`}>
          <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
          {msg.data && msg.data.length > 0 && <DataTable rows={msg.data} type={msg.dataType || ""} />}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          {msg.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

export default function AdminChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Assalamu Alaikum! I'm your Al Burhan ERP assistant. Ask me about bookings, payments, visas, departures, agreements, or any operational data.\n\nTry: \"Show pending visas\" or \"Revenue this month\"",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (query?: string) => {
    const q = (query || input).trim();
    if (!q || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", text: q, timestamp: new Date() };
    setMessages(m => [...m, userMsg]);
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: q }),
      });
      const d = await r.json();
      setMessages(m => [...m, {
        role: "assistant",
        text: d.reply || "I couldn't process that query.",
        data: d.data || [],
        dataType: d.dataType,
        timestamp: new Date(),
      }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "Connection error. Please try again.", timestamp: new Date() }]);
    }
    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clear = () => setMessages([{
    role: "assistant",
    text: "Chat cleared. Ask me anything about Al Burhan ERP operations!",
    timestamp: new Date(),
  }]);

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col h-[calc(100vh-72px)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                <Sparkles size={16} className="text-violet-700" />
              </div>
              Admin AI Assistant
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Ask about operations, bookings, payments, visas and more</p>
          </div>
          <Button onClick={clear} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={12} /> Clear
          </Button>
        </div>

        {/* Quick query chips */}
        <div className="flex gap-2 flex-wrap mb-3 flex-shrink-0">
          {QUICK_QUERIES.slice(0, 6).map(q => (
            <button key={q} onClick={() => send(q)} disabled={loading}
              className="px-3 py-1 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors disabled:opacity-50 whitespace-nowrap">
              {q}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
          {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
          {loading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-violet-100 flex items-center justify-center">
                <Bot size={14} className="text-violet-700" />
              </div>
              <div className="bg-muted/60 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Querying database…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 pt-3 flex-shrink-0 border-t mt-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder="Ask anything… e.g. 'Show pending visas' or 'Revenue this month'"
            rows={2}
            className="flex-1 rounded-2xl border px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-primary transition-colors bg-background"
          />
          <Button onClick={() => send()} disabled={loading || !input.trim()} className="rounded-2xl px-4 self-end h-10 gap-1.5">
            <Send size={14} /> Send
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          Press Enter to send · Shift+Enter for new line · All queries run against live database
        </p>
      </div>
    </AdminLayout>
  );
}
