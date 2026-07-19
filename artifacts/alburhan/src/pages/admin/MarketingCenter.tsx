import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Send, RefreshCw, Megaphone, Users, CheckCircle, XCircle, Plus, Clock } from "lucide-react";

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
];

function statusBadge(s: string) {
  if (s === "sent") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg"><CheckCircle size={11} /> Sent</span>;
  if (s === "failed") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-lg"><XCircle size={11} /> Failed</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg"><Clock size={11} /> Draft</span>;
}

export default function MarketingCenter() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", message: "", channel: "whatsapp", segment: "confirmed" });

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
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (r.ok) {
        toast({ title: "Campaign created" });
        setShowForm(false);
        setForm({ name: "", message: "", channel: "whatsapp", segment: "confirmed" });
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

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Marketing Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Create and send targeted campaigns via WhatsApp & SMS</p>
          </div>
          <Button onClick={() => setShowForm(s => !s)} className="gap-1.5">
            <Plus size={15} /> New Campaign
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="rounded-2xl border p-5 bg-background space-y-4">
            <h2 className="font-semibold">Create Campaign</h2>
            <div className="space-y-1.5">
              <Label className="text-xs">Campaign Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Hajj 2026 Reminder" className="h-9" />
            </div>

            {/* Channel */}
            <div className="space-y-2">
              <Label className="text-xs">Channel</Label>
              <div className="flex gap-2">
                {CHANNELS.map(ch => (
                  <button key={ch.id} onClick={() => setForm(f => ({ ...f, channel: ch.id }))}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${form.channel === ch.id ? ch.color + " ring-2 ring-offset-1 ring-current" : "border-border text-muted-foreground hover:bg-muted/50"}`}>
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

            {/* Message */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Message</Label>
                <span className={`text-[10px] ${charCount > 160 ? "text-amber-600" : "text-muted-foreground"}`}>{charCount} chars {form.channel === "sms" && charCount > 160 ? `(${Math.ceil(charCount/160)} SMS)` : ""}</span>
              </div>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder={`Enter your ${form.channel === "whatsapp" ? "WhatsApp" : "SMS"} message…\n\nYou can use customer name, booking number etc.`}
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
        {campaigns.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Campaigns", value: campaigns.length, color: "text-foreground" },
              { label: "Total Sent", value: campaigns.filter(c => c.status === "sent").length, color: "text-emerald-700" },
              { label: "Drafts", value: campaigns.filter(c => c.status === "draft").length, color: "text-amber-700" },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border p-3 text-center bg-background">
                <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Campaign list */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Megaphone size={36} className="mx-auto mb-2 opacity-30" />
            <p>No campaigns yet. Create your first campaign above.</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Campaign History</p>
            </div>
            <div className="divide-y">
              {campaigns.map(c => (
                <div key={c.id} className="px-4 py-3 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10 text-lg flex-shrink-0">
                    {c.channel === "whatsapp" ? "💬" : c.channel === "sms" ? "📱" : "✉️"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground capitalize">{SEGMENTS.find(s => s.id === c.segment)?.label || c.segment}</span>
                      {c.status === "sent" && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs font-semibold text-emerald-700">{c.sent_count}/{c.total_recipients} delivered</span>
                          {c.failed_count > 0 && <span className="text-xs text-red-600">{c.failed_count} failed</span>}
                        </>
                      )}
                      {c.sent_at && <span className="text-xs text-muted-foreground">{new Date(c.sent_at).toLocaleDateString("en-IN")}</span>}
                    </div>
                  </div>
                  {statusBadge(c.status)}
                  {c.status === "draft" && (
                    <Button size="sm" className="gap-1.5 flex-shrink-0" onClick={() => handleSend(c.id, c.name)} disabled={sending === c.id}>
                      {sending === c.id ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                      Send Now
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
