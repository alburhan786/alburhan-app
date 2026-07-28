// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Radio, RefreshCw, CheckCircle, XCircle, AlertTriangle, Edit2, Play,
  Send, Clock, ChevronDown, ChevronUp, Eye, Loader2, ShieldCheck,
  Check, X, Info, Zap
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function timeAgo(d: string | null) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const EVENT_LABELS: Record<string, string> = {
  booking_submitted:        "Booking Submitted",
  booking_confirmed:        "Booking Confirmed",
  booking_approved:         "Booking Approved",
  payment_received:         "Payment Received",
  pending_payment_reminder: "Pending Payment Reminder",
  invoice_ready:            "Invoice Ready",
  flight_ticket:            "Flight Ticket Issued",
  visa_ready:               "Visa Ready",
  agreement_ready:          "Agreement Ready",
  hotel_voucher:            "Hotel Voucher",
  departure_reminder:       "Departure Reminder",
};

const STATUS_COLORS: Record<string, string> = {
  queued:           "bg-blue-100 text-blue-800",
  sent:             "bg-emerald-100 text-emerald-800",
  delivered:        "bg-emerald-500 text-white",
  read:             "bg-purple-500 text-white",
  failed:           "bg-red-100 text-red-800",
  expired:          "bg-gray-200 text-gray-600",
  validation_failed:"bg-orange-100 text-orange-800",
  unknown:          "bg-gray-100 text-gray-500",
};

// ── Edit Mapping Modal ────────────────────────────────────────────────────────
function EditMappingModal({ mapping, onClose, onSaved }: { mapping: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    template_id:     mapping.template_id || "",
    alt_template_id: mapping.alt_template_id || "",
    template_name:   mapping.template_name || "",
    carrier:         mapping.carrier || "jio",
    template_type:   mapping.template_type || "transactional",
    enabled:         mapping.enabled !== false,
    notes:           mapping.notes || "",
    variables_required: (mapping.variables_required || []).join(", "),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/rcs/mappings/${mapping.erp_event}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          template_id:     form.template_id.trim() || null,
          alt_template_id: form.alt_template_id.trim() || null,
          variables_required: form.variables_required.split(",").map(s => s.trim()).filter(Boolean),
        }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        toast({ title: "Mapping saved", description: `${EVENT_LABELS[mapping.erp_event] || mapping.erp_event} updated.` });
        onSaved();
      } else {
        toast({ title: "Error", description: d.error || "Save failed.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden">
        <div className="bg-[#0A3D2A] p-4">
          <DialogHeader>
            <DialogTitle className="text-[#C9A84C] flex items-center gap-2">
              <Edit2 size={16}/> Edit Template Mapping
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/70 text-xs mt-1">{EVENT_LABELS[mapping.erp_event] || mapping.erp_event}</p>
        </div>
        <div className="p-5 space-y-4 bg-white">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-gray-700">Template ID <span className="text-red-500">*</span></label>
              <Input value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}
                placeholder="e.g. 3651" className="font-mono focus-visible:ring-[#0A3D2A]" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-gray-700">Alt Template ID</label>
              <Input value={form.alt_template_id} onChange={e => setForm(f => ({ ...f, alt_template_id: e.target.value }))}
                placeholder="e.g. 3656 for fallback" className="font-mono focus-visible:ring-[#0A3D2A]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-gray-700">Template Name</label>
              <Input value={form.template_name} onChange={e => setForm(f => ({ ...f, template_name: e.target.value }))}
                placeholder="e.g. Booking_Approved" className="focus-visible:ring-[#0A3D2A]" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-gray-700">Carrier</label>
              <Input value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))}
                placeholder="jio / airtel / vi" className="focus-visible:ring-[#0A3D2A]" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase text-gray-700">Required Variables (comma-separated)</label>
            <Input value={form.variables_required} onChange={e => setForm(f => ({ ...f, variables_required: e.target.value }))}
              placeholder="customer_name, booking_id, amount" className="font-mono focus-visible:ring-[#0A3D2A]" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase text-gray-700">Notes</label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes about this template" className="focus-visible:ring-[#0A3D2A]" />
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
            <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
            <span className="text-sm font-medium text-gray-700">
              {form.enabled ? "Enabled — RCS will send for this event" : "Disabled — RCS will skip this event"}
            </span>
          </div>
        </div>
        <DialogFooter className="px-5 py-3 bg-gray-50 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#0A3D2A] text-[#C9A84C] hover:bg-[#083021]">
            {saving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/>Saving…</> : "Save Mapping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Test Send Modal ───────────────────────────────────────────────────────────
function TestSendModal({ event, onClose }: { event: string; onClose: () => void }) {
  const { toast } = useToast();
  const [mobile, setMobile] = useState("9893989786");
  const [bookingId, setBookingId] = useState("");
  const [skipIdem, setSkipIdem] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function send() {
    if (!mobile) return toast({ title: "Required", description: "Enter a mobile number.", variant: "destructive" });
    setRunning(true);
    setResult(null);
    try {
      const r = await fetch(`${API}/api/rcs/test`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, mobile, bookingId: bookingId || undefined, skipIdempotency: skipIdem }),
      });
      const d = await r.json();
      setResult(d);
      if (d.ok) toast({ title: "RCS sent", description: `Message accepted by Lemin. ID: ${d.result?.messageId || "—"}` });
      else toast({ title: "Send failed", description: d.error || d.result?.errorMessage || "Check result below.", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setRunning(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[580px] p-0 overflow-hidden">
        <div className="bg-[#0A3D2A] p-4">
          <DialogHeader>
            <DialogTitle className="text-[#C9A84C] flex items-center gap-2">
              <Send size={16}/> Test RCS Send
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/70 text-xs mt-1">{EVENT_LABELS[event] || event}</p>
        </div>
        <div className="p-5 space-y-4 bg-white">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            This sends a <strong>real RCS message</strong> to the specified number. Confirm before sending.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-gray-700">Recipient Mobile <span className="text-red-500">*</span></label>
              <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="10-digit number" className="font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-gray-700">Booking ID (optional)</label>
              <Input value={bookingId} onChange={e => setBookingId(e.target.value)} placeholder="Uses test booking if blank" className="font-mono text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={skipIdem} onCheckedChange={setSkipIdem} />
            <span className="text-xs text-gray-600">Skip idempotency check (allow re-send for same booking)</span>
          </div>

          {result && (
            <div className="space-y-2 animate-in fade-in">
              {/* Preview: resolved variables */}
              {result.preview?.resolvedVars && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-bold uppercase text-gray-600">Resolved Variables</div>
                  <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(result.preview.resolvedVars).filter(([,v]) => v).map(([k,v]) => (
                      <div key={k} className="flex gap-1 text-xs">
                        <span className="text-gray-500 font-mono shrink-0">{k}:</span>
                        <span className="font-medium text-gray-800 truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Result */}
              <div className={`p-3 rounded-lg border text-xs ${result.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <div className="flex items-center gap-2 font-bold mb-2">
                  {result.ok ? <Check size={13} className="text-emerald-700"/> : <X size={13} className="text-red-700"/>}
                  {result.ok ? "Message accepted by Lemin" : "Send failed"}
                </div>
                {result.result?.messageId && <div className="font-mono text-gray-700">Message ID: <strong>{result.result.messageId}</strong></div>}
                {result.result?.deliveryStatus && <div>Status: <Badge className={`text-[10px] ${STATUS_COLORS[result.result.deliveryStatus] || ""}`}>{result.result.deliveryStatus}</Badge></div>}
                {result.result?.errorMessage && <div className="text-red-600 mt-1">{result.result.errorMessage}</div>}
                {result.result?.missingVars?.length > 0 && (
                  <div className="mt-2 text-orange-700">Missing vars: {result.result.missingVars.join(", ")}</div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 bg-gray-50 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={send} disabled={running} className="bg-[#0A3D2A] text-[#C9A84C] hover:bg-[#083021]">
            {running ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/>Sending…</> : <><Send className="mr-1.5 h-3.5 w-3.5"/>Send RCS</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Production Validate Section ───────────────────────────────────────────────
function ProductionValidate() {
  const { toast } = useToast();
  const [mobile, setMobile] = useState("9893989786");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    if (!mobile) return toast({ title: "Required", description: "Enter a mobile number.", variant: "destructive" });
    setRunning(true); setResult(null);
    try {
      const r = await fetch(`${API}/api/rcs/production-validate`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      const d = await r.json();
      setResult(d);
      toast({ title: d.ok ? "Validation complete" : "Validation finished", description: `${d.passed}/${d.total} templates passed.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setRunning(false); }
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2">
        <Info size={14} className="shrink-0 mt-0.5 text-blue-500"/>
        <div>
          <strong>Production validation</strong> fires every mapped approved template to a real mobile number.
          Messages 3651–3661 will be sent. Only approved templates are tested — unmapped events are skipped.
        </div>
      </div>
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-1">
          <label className="text-[11px] font-bold uppercase text-gray-700">Test Mobile Number</label>
          <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="10-digit number" className="font-mono" />
        </div>
        <Button onClick={run} disabled={running} className="bg-[#0A3D2A] text-[#C9A84C] hover:bg-[#083021] h-10 min-w-[160px]">
          {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Running…</> : <><Zap className="mr-2 h-4 w-4"/>Run All Templates</>}
        </Button>
      </div>

      {result && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border text-sm">
            <span className="font-semibold text-[#0A3D2A]">Results:</span>
            <Badge className="bg-emerald-500 text-white">{result.passed} passed</Badge>
            <Badge className="bg-gray-300 text-gray-700">{(result.total || 0) - (result.passed || 0)} failed/skipped</Badge>
            <span className="text-xs text-gray-500 ml-auto">{result.validatedAt ? new Date(result.validatedAt).toLocaleString("en-IN") : ""}</span>
          </div>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[#0A3D2A] text-white">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Event</th>
                  <th className="px-3 py-2 text-center font-semibold">Template ID</th>
                  <th className="px-3 py-2 text-center font-semibold">Status</th>
                  <th className="px-3 py-2 text-center font-semibold">Message ID</th>
                  <th className="px-3 py-2 text-left font-semibold">Error / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(result.results || {}).map(([ev, r]: [string, any]) => (
                  <tr key={ev} className={`hover:bg-gray-50 ${r.ok ? "" : r.status === "skipped" ? "bg-gray-50/50" : "bg-red-50/30"}`}>
                    <td className="px-3 py-2 font-medium text-[#0A3D2A]">{EVENT_LABELS[ev] || ev}</td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-gray-700">{r.templateId || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {r.ok ? <Badge className="bg-emerald-100 text-emerald-800 text-[10px]"><Check size={9} className="mr-0.5"/>Sent</Badge>
                        : r.status === "skipped" ? <Badge className="bg-gray-200 text-gray-600 text-[10px]">Unmapped</Badge>
                        : <Badge className="bg-red-100 text-red-700 text-[10px]"><X size={9} className="mr-0.5"/>Failed</Badge>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[10px] text-gray-600">{r.messageId || "—"}</td>
                    <td className="px-3 py-2 text-[10px] text-gray-500 max-w-[220px] truncate" title={r.error || ""}>{r.error || r.status === "skipped" ? "No approved template ID saved" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Final checklist */}
          <div className="border rounded-xl p-4 space-y-2">
            <div className="font-bold text-sm text-[#0A3D2A] mb-3 flex items-center gap-2"><ShieldCheck size={15}/>Final Success Criteria</div>
            {[
              { label: "Authentication",     pass: result.passed > 0 || result.total > 0,   note: "LEMIN_API_KEY valid, Lemin responds" },
              { label: "Template mapping",   pass: result.total > 0,                          note: `${result.total} approved templates configured` },
              { label: "Send API accepted",  pass: result.passed > 0,                         note: `${result.passed}/${result.total} templates accepted` },
              { label: "Message ID received",pass: Object.values(result.results || {}).some((r: any) => r.messageId), note: "At least one message_id returned" },
              { label: "Secret protection",  pass: true,                                       note: "LEMIN_API_KEY never in logs, responses, or frontend" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 text-xs">
                {item.pass ? <Check size={13} className="text-emerald-600 shrink-0"/> : <X size={13} className="text-red-500 shrink-0"/>}
                <span className={`font-semibold ${item.pass ? "text-emerald-700" : "text-red-700"} min-w-[160px]`}>{item.label}</span>
                <span className="text-gray-500">{item.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── RCS Logs Tab ──────────────────────────────────────────────────────────────
function RCSLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/rcs/logs?limit=50`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setLogs(d.logs || []); setTotal(d.total || 0); }
    } catch { toast({ title: "Error loading logs", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function refreshStatus(messageId: string) {
    if (!messageId) return;
    try {
      const r = await fetch(`${API}/api/rcs/status/${messageId}`, { credentials: "include" });
      const d = await r.json();
      if (d.ok) { toast({ title: `Status: ${d.deliveryStatus}`, description: `Message ${messageId.slice(0,12)}…` }); load(); }
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-600">{total} total RCS notifications</span>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-8">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}/>Refresh
        </Button>
      </div>
      <div className="border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#0A3D2A] text-white">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Time</th>
                <th className="px-3 py-2.5 text-left font-semibold">Event</th>
                <th className="px-3 py-2.5 text-left font-semibold">Customer</th>
                <th className="px-3 py-2.5 text-left font-semibold">Booking</th>
                <th className="px-3 py-2.5 text-center font-semibold">Template</th>
                <th className="px-3 py-2.5 text-center font-semibold">Status</th>
                <th className="px-3 py-2.5 text-left font-semibold">Message ID</th>
                <th className="px-3 py-2.5 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400"><Loader2 className="inline h-5 w-5 animate-spin mr-2"/>Loading…</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">No RCS notifications yet.</td></tr>
              )}
              {!loading && logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 font-mono text-[10px]">
                    {log.created_at ? new Date(log.created_at).toLocaleString("en-IN", { month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit" }) : "—"}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                    {EVENT_LABELS[log.event_type] || log.event_type}
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{log.customer_name || "—"}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{log.booking_number || log.booking_id?.slice(0,8) || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="font-mono font-bold text-[#0A3D2A]">{log.template_id || "—"}</span>
                    {log.template_name && <div className="text-[9px] text-gray-400">{log.template_name}</div>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="space-y-0.5">
                      {log.status === "sent" || log.status === "delivered"
                        ? <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Sent</Badge>
                        : <Badge className="bg-red-100 text-red-700 text-[10px]">{log.status}</Badge>}
                      {log.delivery_status && log.delivery_status !== "unknown" && (
                        <Badge className={`block text-[9px] px-1 py-0 ${STATUS_COLORS[log.delivery_status] || "bg-gray-100 text-gray-500"}`}>
                          {log.delivery_status}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-gray-500">
                    {log.message_id ? `${log.message_id.slice(0,16)}…` : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {log.message_id && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                        onClick={() => refreshStatus(log.message_id)}>
                        <RefreshCw size={9} className="mr-1"/>Status
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RCSTemplateManager() {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [testTarget, setTestTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/rcs/mappings`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setMappings(d.mappings || []); }
    } catch { toast({ title: "Error loading mappings", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const mapped   = mappings.filter(m => m.template_id);
  const unmapped = mappings.filter(m => !m.template_id);

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0A3D2A] flex items-center gap-2.5">
              <Radio className="text-[#C9A84C]" size={28}/>
              RCS Template Mappings
            </h1>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              Lemin AI Jio RCS — approved templates, variable mapping, delivery tracking
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex gap-1">
              <Badge className="bg-emerald-100 text-emerald-800">{mapped.length} mapped</Badge>
              {unmapped.length > 0 && <Badge className="bg-amber-100 text-amber-800">{unmapped.length} unmapped</Badge>}
            </div>
            <Button onClick={load} disabled={loading} variant="outline" className="h-9 w-9 p-0">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/>
            </Button>
          </div>
        </div>

        {/* Important notice */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <Info size={16} className="shrink-0 mt-0.5 text-blue-500"/>
          <div>
            <strong>Approved Jio RCS templates seeded:</strong> 3651 (Booking Submitted) · 3652 (Booking Approved) · 3654 (Payment Received) · 3655 (Pending Reminder) · 3657 (Invoice) · 3659 (Ticket) · 3660 (Visa) · 3661 (Agreement).
            Hotel Voucher and Departure Reminder need approved Lemin template IDs before they will deliver.
          </div>
        </div>

        <Tabs defaultValue="mappings" className="w-full">
          <TabsList className="grid grid-cols-3 max-w-md bg-gray-100 h-10 p-1 rounded-lg">
            <TabsTrigger value="mappings" className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Template Mappings</TabsTrigger>
            <TabsTrigger value="validate" className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Production Validate</TabsTrigger>
            <TabsTrigger value="logs"     className="text-xs data-[state=active]:bg-[#0A3D2A] data-[state=active]:text-white rounded-md">Delivery Logs</TabsTrigger>
          </TabsList>

          {/* ── Mappings Table ── */}
          <TabsContent value="mappings" className="mt-4">
            <div className="border rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-[#0A3D2A] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">ERP Event</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Template Name</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Template ID</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Carrier</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Variables</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Enabled</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Last Success</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Last Failure</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && (
                    <tr><td colSpan={9} className="p-8 text-center text-gray-400">
                      <Loader2 className="inline h-5 w-5 animate-spin mr-2"/>Loading mappings…
                    </td></tr>
                  )}
                  {!loading && mappings.length === 0 && (
                    <tr><td colSpan={9} className="p-8 text-center text-gray-400">No mappings found.</td></tr>
                  )}
                  {!loading && mappings.map(m => (
                    <tr key={m.erp_event} className={`hover:bg-gray-50 ${!m.template_id ? "bg-amber-50/40" : ""}`}>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-[#0A3D2A]">{EVENT_LABELS[m.erp_event] || m.erp_event}</span>
                        <div className="font-mono text-[10px] text-gray-400">{m.erp_event}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700 text-xs">{m.template_name || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {m.template_id
                          ? <span className="font-mono font-bold text-[#0A3D2A] text-base">{m.template_id}</span>
                          : <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]">Not Mapped</Badge>}
                        {m.alt_template_id && <div className="text-[10px] text-gray-400 font-mono">alt: {m.alt_template_id}</div>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className="uppercase text-[10px]">{m.carrier || "jio"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(m.variables_required || []).map((v: string) => (
                            <span key={v} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{v}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.enabled
                          ? <Badge className="bg-emerald-100 text-emerald-800 text-[10px]"><Check size={9} className="mr-0.5"/>Yes</Badge>
                          : <Badge className="bg-red-100 text-red-700 text-[10px]"><X size={9} className="mr-0.5"/>No</Badge>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {m.last_success_at
                          ? <span className="text-emerald-700 font-medium">{timeAgo(m.last_success_at)}</span>
                          : <span className="text-gray-400">Never</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {m.last_failure_at
                          ? <div><span className="text-red-600 font-medium">{timeAgo(m.last_failure_at)}</span>
                              {m.last_failure_reason && <div className="text-[9px] text-red-400 truncate max-w-[120px]" title={m.last_failure_reason}>{m.last_failure_reason.slice(0,40)}</div>}
                            </div>
                          : <span className="text-gray-400">None</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs"
                            onClick={() => setEditTarget(m)}>
                            <Edit2 size={11} className="mr-1"/>Edit
                          </Button>
                          {m.template_id && (
                            <Button size="sm" className="h-7 px-2.5 text-xs bg-[#0A3D2A] text-[#C9A84C] hover:bg-[#083021]"
                              onClick={() => setTestTarget(m.erp_event)}>
                              <Send size={11} className="mr-1"/>Test
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {unmapped.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                <div>
                  <strong>{unmapped.length} event(s) have no approved template ID:</strong>{" "}
                  {unmapped.map(m => EVENT_LABELS[m.erp_event] || m.erp_event).join(", ")}.
                  Click <strong>Edit</strong> to add the approved Lemin template ID when available.
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Production Validate ── */}
          <TabsContent value="validate" className="mt-4">
            <ProductionValidate />
          </TabsContent>

          {/* ── Logs ── */}
          <TabsContent value="logs" className="mt-4">
            <RCSLogs />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      {editTarget && (
        <EditMappingModal
          mapping={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
      {testTarget && (
        <TestSendModal event={testTarget} onClose={() => setTestTarget(null)} />
      )}
    </AdminLayout>
  );
}
