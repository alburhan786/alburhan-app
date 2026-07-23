// @ts-nocheck
import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Send, RefreshCw, Megaphone, CheckCircle, XCircle, Plus, Clock, BarChart2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const BASE_API = import.meta.env.VITE_API_URL || "";

const SEGMENTS = [
  { id: "all", label: "All Customers", desc: "Everyone registered" },
  { id: "confirmed", label: "Confirmed Bookings", desc: "Paid & confirmed" },
  { id: "hajj", label: "Hajj Customers", desc: "Hajj package bookings" },
  { id: "umrah", label: "Umrah Customers", desc: "Umrah package bookings" },
  { id: "pending_payment", label: "Pending Payment", desc: "Approved, awaiting payment" },
  { id: "leads", label: "Leads", desc: "Enquiries & prospects" },
];

const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: "💬", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "sms", label: "SMS", icon: "📱", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "email", label: "Email", icon: "✉️", color: "bg-violet-50 text-violet-700 border-violet-200" },
  { id: "facebook", label: "Facebook", icon: "📘", color: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "instagram", label: "Instagram", icon: "📸", color: "bg-pink-50 text-pink-700 border-pink-200" },
  { id: "telegram", label: "Telegram", icon: "✈️", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
];

const CHANNEL_FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "sms", label: "SMS", icon: "📱" },
  { id: "email", label: "Email", icon: "✉️" },
  { id: "facebook", label: "Facebook", icon: "📘" },
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "telegram", label: "Telegram", icon: "✈️" },
];

function statusBadge(s: string) {
  if (s === "sent") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg"><CheckCircle size={11} /> Sent</span>;
  if (s === "failed") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-lg"><XCircle size={11} /> Failed</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg"><Clock size={11} /> Draft</span>;
}

function fmtCurrency(v: any) {
  const n = parseFloat(v || 0);
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

// ── ROI Update Modal ──────────────────────────────────────────────────────────
function RoiModal({ campaign, onClose, onSaved }: { campaign: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    interested_count: String(campaign.interested_count || 0),
    bookings_generated: String(campaign.bookings_generated || 0),
    revenue_generated: String(campaign.revenue_generated || 0),
    roi_percent: String(campaign.roi_percent || 0),
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/campaigns/${campaign.id}/stats`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interested_count: parseInt(form.interested_count) || 0,
          bookings_generated: parseInt(form.bookings_generated) || 0,
          revenue_generated: parseFloat(form.revenue_generated) || 0,
          roi_percent: parseFloat(form.roi_percent) || 0,
        }),
      });
      if (r.ok) {
        toast({ title: "ROI stats updated" });
        onSaved();
      } else {
        toast({ title: "Failed to update", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Update ROI Stats</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1 truncate">{campaign.name}</p>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {[
            { key: "interested_count", label: "Interested Leads", placeholder: "0" },
            { key: "bookings_generated", label: "Bookings Generated", placeholder: "0" },
            { key: "revenue_generated", label: "Revenue Generated (₹)", placeholder: "0.00" },
            { key: "roi_percent", label: "ROI %", placeholder: "0.00" },
          ].map(f => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                className="mt-1 h-9 text-sm"
                type="number"
                min="0"
                placeholder={f.placeholder}
                value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <RefreshCw size={13} className="animate-spin mr-1" /> : null}
            Save ROI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketingCenter() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("all");
  const [roiTarget, setRoiTarget] = useState<any>(null);
  const [form, setForm] = useState({ name: "", message: "", channel: "whatsapp", segment: "confirmed", subject: "" });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/campaigns`, { credentials: "include" });
      if (r.ok) setCampaigns(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.message.trim()) {
      toast({ title: "Name and message are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/campaigns`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        toast({ title: "Campaign created" });
        setShowForm(false);
        setForm({ name: "", message: "", channel: "whatsapp", segment: "confirmed", subject: "" });
        load();
      } else { toast({ title: "Failed", variant: "destructive" }); }
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSaving(false);
  };

  const handleSend = async (id: string, name: string) => {
    if (!confirm(`Send campaign "${name}"? This will dispatch messages to all recipients.`)) return;
    setSending(id);
    try {
      const r = await fetch(`${BASE_API}/api/enterprise/campaigns/${id}/send`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      });
      const d = r.ok ? await r.json() : null;
      if (d?.ok) {
        toast({ title: `Campaign sent! ${d.sent}/${d.total} delivered` });
        load();
      } else { toast({ title: "Failed to send", variant: "destructive" }); }
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setSending(null);
  };

  const charCount = form.message.length;

  const filtered = channelFilter === "all" ? campaigns : campaigns.filter(c => c.channel === channelFilter);

  const totals = {
    campaigns: filtered.length,
    sent: filtered.filter(c => c.status === "sent").length,
    drafts: filtered.filter(c => c.status === "draft").length,
    reach: filtered.reduce((a, c) => a + (parseInt(c.total_recipients) || 0), 0),
    delivered: filtered.reduce((a, c) => a + (parseInt(c.sent_count) || 0), 0),
    revenue: filtered.reduce((a, c) => a + (parseFloat(c.revenue_generated) || 0), 0),
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Marketing Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Create and send targeted campaigns via WhatsApp, SMS, Email & Social</p>
          </div>
          <Button onClick={() => setShowForm(s => !s)} className="gap-1.5">
            <Plus size={15} /> New Campaign
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="rounded-2xl border p-5 bg-background space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Create Campaign</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center"><X size={14} /></button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Campaign Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Hajj 2026 Reminder" className="h-9" />
            </div>

            {/* Channel */}
            <div className="space-y-2">
              <Label className="text-xs">Channel</Label>
              <div className="flex gap-2 flex-wrap">
                {CHANNELS.map(ch => (
                  <button key={ch.id} onClick={() => setForm(f => ({ ...f, channel: ch.id }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${form.channel === ch.id ? ch.color + " ring-2 ring-offset-1 ring-current" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
                    <span>{ch.icon}</span> {ch.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Segment */}
            <div className="space-y-2">
              <Label className="text-xs">Target Audience</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SEGMENTS.map(seg => (
                  <button key={seg.id} onClick={() => setForm(f => ({ ...f, segment: seg.id }))}
                    className={`text-left px-3 py-2 rounded-xl border text-xs transition-all ${form.segment === seg.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/50"}`}>
                    <p className="font-semibold">{seg.label}</p>
                    <p className={`text-[10px] mt-0.5 ${form.segment === seg.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{seg.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Email subject (only if email channel) */}
            {form.channel === "email" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Email Subject</Label>
                <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Important Update for Your Hajj Journey" className="h-9" />
              </div>
            )}

            {/* Message */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Message</Label>
                <span className={`text-[10px] ${charCount > 160 ? "text-amber-600" : "text-muted-foreground"}`}>{charCount} chars {form.channel === "sms" && charCount > 160 ? `(${Math.ceil(charCount / 160)} SMS)` : ""}</span>
              </div>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder={`Enter your ${form.channel} message…`}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving} className="gap-1.5">
                {saving ? <RefreshCw size={13} className="animate-spin" /> : null} Save Campaign
              </Button>
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "Campaigns", value: totals.campaigns, color: "text-foreground" },
            { label: "Sent", value: totals.sent, color: "text-emerald-700" },
            { label: "Drafts", value: totals.drafts, color: "text-amber-700" },
            { label: "Total Reach", value: totals.reach.toLocaleString(), color: "text-blue-700" },
            { label: "Delivered", value: totals.delivered.toLocaleString(), color: "text-indigo-700" },
            { label: "Revenue", value: fmtCurrency(totals.revenue), color: "text-green-700" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border p-3 text-center bg-background">
              <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Channel filter tabs */}
        <div className="flex gap-1.5 flex-wrap">
          {CHANNEL_FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setChannelFilter(tab.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${channelFilter === tab.id ? "bg-gray-900 text-white border-gray-900" : "bg-background text-muted-foreground border-border hover:border-gray-400"}`}
            >
              {tab.icon ? `${tab.icon} ` : ""}{tab.label}
              {tab.id !== "all" && (
                <span className="ml-1 opacity-60">({campaigns.filter(c => c.channel === tab.id).length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Campaign list */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading campaigns…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Megaphone size={36} className="mx-auto mb-2 opacity-30" />
            <p>{campaigns.length === 0 ? "No campaigns yet. Create your first campaign above." : "No campaigns match the selected channel filter."}</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Campaign History</p>
              <p className="text-xs text-muted-foreground">{filtered.length} campaigns</p>
            </div>
            <div className="divide-y">
              {filtered.map(c => {
                const deliveryPct = c.total_recipients > 0 ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
                const hasRoi = (c.bookings_generated > 0 || c.revenue_generated > 0 || c.interested_count > 0);
                return (
                  <div key={c.id} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 text-lg flex-shrink-0">
                        {c.channel === "whatsapp" ? "💬" : c.channel === "sms" ? "📱" : c.channel === "email" ? "✉️" : c.channel === "facebook" ? "📘" : c.channel === "instagram" ? "📸" : c.channel === "telegram" ? "✈️" : "📣"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">{c.name}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{c.channel}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground capitalize">{SEGMENTS.find(s => s.id === c.segment)?.label || c.segment}</span>
                          {c.status === "sent" && c.total_recipients > 0 && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs font-semibold text-emerald-700">{c.sent_count}/{c.total_recipients} delivered ({deliveryPct}%)</span>
                              {c.failed_count > 0 && <span className="text-xs text-red-600">{c.failed_count} failed</span>}
                            </>
                          )}
                          {c.sent_at && <span className="text-xs text-muted-foreground">{new Date(c.sent_at).toLocaleDateString("en-IN")}</span>}
                        </div>
                        {/* ROI row */}
                        {hasRoi && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {c.interested_count > 0 && <span className="text-violet-600 font-medium">{c.interested_count} interested</span>}
                            {c.bookings_generated > 0 && <span className="text-blue-600 font-medium">{c.bookings_generated} bookings</span>}
                            {c.revenue_generated > 0 && <span className="text-green-600 font-medium">{fmtCurrency(c.revenue_generated)} revenue</span>}
                            {c.roi_percent > 0 && <span className="text-amber-600 font-bold">ROI {c.roi_percent}%</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {statusBadge(c.status)}
                        {c.status === "sent" && (
                          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setRoiTarget(c)}>
                            <BarChart2 size={12} /> ROI
                          </Button>
                        )}
                        {c.status === "draft" && (
                          <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => handleSend(c.id, c.name)} disabled={sending === c.id}>
                            {sending === c.id ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                            Send
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Delivery progress bar for sent campaigns */}
                    {c.status === "sent" && c.total_recipients > 0 && (
                      <div className="mt-2 ml-13">
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${deliveryPct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ROI Modal */}
      {roiTarget && (
        <RoiModal
          campaign={roiTarget}
          onClose={() => setRoiTarget(null)}
          onSaved={() => { setRoiTarget(null); load(); }}
        />
      )}
    </AdminLayout>
  );
}
