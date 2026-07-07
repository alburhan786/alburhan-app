import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  Send, MessageSquare, Layers, Mail, Smartphone,
  CheckCircle2, XCircle, Loader2, Copy, RefreshCw, Clock, ChevronDown
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-green-600", bg: "bg-green-50", active: "bg-green-600", pill: "bg-green-100 text-green-800" },
  { id: "sms",      label: "SMS / DLT", icon: Smartphone,    color: "text-amber-600", bg: "bg-amber-50", active: "bg-amber-600", pill: "bg-amber-100 text-amber-800" },
  { id: "rcs",      label: "RCS",        icon: Layers,        color: "text-blue-600",  bg: "bg-blue-50",  active: "bg-blue-600",  pill: "bg-blue-100 text-blue-800" },
  { id: "email",    label: "Email",      icon: Mail,          color: "text-purple-600",bg: "bg-purple-50",active: "bg-purple-600",pill: "bg-purple-100 text-purple-800"},
] as const;

type ChannelId = typeof CHANNELS[number]["id"];

const SAMPLE_VARS: Record<string, string> = {
  customer_name: "Ahmad Khan",
  booking_id: "BK-2026-1234",
  package_name: "Hajj Premium 2026",
  departure_date: "12 Apr 2026",
  amount: "₹1,80,000",
  balance: "₹90,000",
  invoice_number: "INV-2026-5678",
  visa_status: "Approved",
  flight_number: "6E 210",
  hotel_name: "Dar Al Eiman Grand",
  room_number: "412",
  bus_number: "BUS-07",
  utr_number: "UTR123456789",
  payment_status: "Partial",
  booking_number: "ALB-001234",
};

interface Template { id: string; name: string; channel: string; subject?: string; body: string; html_body?: string; event_type?: string; }
interface TestLog { id: string; channel: ChannelId; recipient: string; message: string; status: "sent"|"failed"|"pending"; request: any; response: any; timestamp: Date; }

function applyVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

export default function TestNotifications() {
  const { toast } = useToast();
  const [channel, setChannel] = useState<ChannelId>("whatsapp");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTplId, setSelectedTplId] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [customSubject, setCustomSubject] = useState("Test Notification from Al Burhan");
  const [recipient, setRecipient] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({ ...SAMPLE_VARS });
  const [testing, setTesting] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [showRaw, setShowRaw] = useState<Record<string, boolean>>({});

  const loadTemplates = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/notification-center/templates?channel=${channel}`, { credentials: "include" });
      const d = await r.json();
      setTemplates(d.templates || []);
      setSelectedTplId("");
    } catch { /* silent */ }
  }, [channel]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const selectedTpl = templates.find(t => t.id === selectedTplId);

  const previewMessage = (() => {
    const raw = selectedTpl ? selectedTpl.body : customMessage;
    return applyVars(raw, vars);
  })();

  const sendTest = async () => {
    if (!recipient) { toast({ title: "Enter a recipient (phone/email)", variant: "destructive" }); return; }
    const message = selectedTpl ? selectedTpl.body : customMessage;
    if (!message) { toast({ title: "Enter a message or select a template", variant: "destructive" }); return; }

    setTesting(true);
    const logEntry: TestLog = {
      id: Math.random().toString(36).slice(2),
      channel, recipient, message: previewMessage, status: "pending",
      request: null, response: null, timestamp: new Date(),
    };
    setLogs(prev => [logEntry, ...prev]);

    try {
      const payload: any = {
        channel, recipient, message: previewMessage,
        templateId: selectedTplId || undefined,
      };
      if (channel === "email") {
        payload.subject = applyVars(selectedTpl?.subject || customSubject, vars);
        payload.html_body = selectedTpl?.html_body ? applyVars(selectedTpl.html_body, vars) : undefined;
      }
      logEntry.request = payload;

      const r = await fetch(`${API}/api/notification-center/test-send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      logEntry.response = d;
      logEntry.status = d.ok ? "sent" : "failed";

      setLogs(prev => prev.map(l => l.id === logEntry.id ? { ...logEntry } : l));
      toast({ title: d.ok ? `✓ Test ${channel.toUpperCase()} sent!` : `✗ ${channel.toUpperCase()} failed`, variant: d.ok ? "default" : "destructive" });
    } catch (e: any) {
      logEntry.response = { error: e.message };
      logEntry.status = "failed";
      setLogs(prev => prev.map(l => l.id === logEntry.id ? { ...logEntry } : l));
    } finally { setTesting(false); }
  };

  const copyJson = (obj: any) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    toast({ title: "Copied to clipboard" });
  };

  const ch = CHANNELS.find(c => c.id === channel)!;
  const isEmail = channel === "email";

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Send className="w-6 h-6 text-indigo-500" />
            Test Notifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">Fire test messages on any channel and inspect the full API request/response</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left — Compose */}
          <div className="space-y-4">
            {/* Channel Selector */}
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Select Channel</p>
              <div className="grid grid-cols-2 gap-2">
                {CHANNELS.map(c => (
                  <button key={c.id} onClick={() => setChannel(c.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${channel === c.id ? `${c.active} text-white shadow` : `${c.bg} ${c.color} hover:opacity-80`}`}>
                    <c.icon className="w-4 h-4" />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient */}
            <div className="bg-white border rounded-xl p-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                {isEmail ? "Email Address" : "Phone Number (10-digit)"}
              </label>
              <input
                type={isEmail ? "email" : "tel"}
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder={isEmail ? "test@example.com" : "9876543210"}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Template Selector */}
            <div className="bg-white border rounded-xl p-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Template</label>
              <select value={selectedTplId} onChange={e => setSelectedTplId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm mb-3">
                <option value="">— Custom message —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} {t.event_type ? `(${t.event_type})` : ""}</option>)}
              </select>

              {isEmail && !selectedTpl && (
                <div className="mb-3">
                  <label className="text-xs text-gray-500 block mb-1">Subject</label>
                  <input value={customSubject} onChange={e => setCustomSubject(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              )}

              {!selectedTpl && (
                <textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)}
                  rows={4} className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                  placeholder={`Type your ${channel} test message here…`} />
              )}
            </div>

            {/* Variable Overrides */}
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Variable Values</p>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {Object.entries(SAMPLE_VARS).map(([k]) => (
                  <div key={k}>
                    <label className="text-xs text-gray-500 block mb-0.5">{`{{${k}}}`}</label>
                    <input value={vars[k] || ""} onChange={e => setVars(p => ({ ...p, [k]: e.target.value }))}
                      className="w-full border rounded px-2 py-1 text-xs" />
                  </div>
                ))}
              </div>
            </div>

            {/* Send */}
            <button onClick={sendTest} disabled={testing}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 ${ch.active}`}>
              {testing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              Send Test {ch.label}
            </button>
          </div>

          {/* Right — Preview + Logs */}
          <div className="space-y-4">
            {/* Message Preview */}
            <div className="bg-white border rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Message Preview</p>
              {channel === "rcs" && (
                <div className="bg-gray-100 rounded-xl p-3 max-w-xs">
                  <div className="bg-white rounded-lg p-3 shadow-sm">
                    <p className="text-sm text-gray-800">{previewMessage || <span className="text-gray-400">No message</span>}</p>
                  </div>
                </div>
              )}
              {channel === "whatsapp" && (
                <div className="bg-[#e5ddd5] rounded-xl p-3 max-w-xs">
                  <div className="bg-[#dcf8c6] rounded-lg p-3 shadow-sm">
                    <p className="text-sm text-gray-800">{previewMessage || <span className="text-gray-400">No message</span>}</p>
                    <p className="text-right text-xs text-gray-400 mt-1">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              )}
              {channel === "sms" && (
                <div className="bg-gray-800 rounded-xl p-4 max-w-xs">
                  <p className="text-white text-sm leading-relaxed">{previewMessage || <span className="text-gray-500">No message</span>}</p>
                  <p className="text-gray-400 text-xs mt-2">{(previewMessage || "").length} chars · {Math.ceil((previewMessage || "").length / 160)} SMS</p>
                </div>
              )}
              {channel === "email" && (
                <div className="border rounded-lg overflow-hidden" style={{ height: 200 }}>
                  {(selectedTpl?.html_body || previewMessage) ? (
                    <iframe
                      srcDoc={selectedTpl?.html_body ? applyVars(selectedTpl.html_body, vars) : `<div style="font-family:sans-serif;padding:20px">${previewMessage}</div>`}
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                      title="Email preview"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">No content</div>
                  )}
                </div>
              )}
            </div>

            {/* Test Logs */}
            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Test History</p>
                {logs.length > 0 && (
                  <button onClick={() => setLogs([])} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
                )}
              </div>
              {logs.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No tests run yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {logs.map(log => (
                    <div key={log.id} className="border rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 p-3 bg-gray-50">
                        {log.status === "sent"
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          : log.status === "failed"
                          ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          : <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CHANNELS.find(c => c.id === log.channel)?.pill}`}>
                              {log.channel.toUpperCase()}
                            </span>
                            <span className="text-xs text-gray-600 truncate">{log.recipient}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {log.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                        <button onClick={() => setShowRaw(p => ({ ...p, [log.id]: !p[log.id] }))}
                          className="text-xs text-gray-400 flex items-center gap-1">
                          Raw <ChevronDown className={`w-3 h-3 transition-transform ${showRaw[log.id] ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                      {showRaw[log.id] && (
                        <div className="p-3 space-y-2 border-t bg-gray-900">
                          {log.request && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-400 font-mono">REQUEST</span>
                                <button onClick={() => copyJson(log.request)} className="text-gray-500 hover:text-gray-300"><Copy className="w-3 h-3" /></button>
                              </div>
                              <pre className="text-xs text-green-400 overflow-x-auto font-mono">{JSON.stringify(log.request, null, 2)}</pre>
                            </div>
                          )}
                          {log.response && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-400 font-mono">RESPONSE</span>
                                <button onClick={() => copyJson(log.response)} className="text-gray-500 hover:text-gray-300"><Copy className="w-3 h-3" /></button>
                              </div>
                              <pre className={`text-xs overflow-x-auto font-mono ${log.status === "sent" ? "text-cyan-400" : "text-red-400"}`}>
                                {JSON.stringify(log.response, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
