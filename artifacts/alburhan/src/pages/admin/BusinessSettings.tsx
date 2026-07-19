import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Save, Settings, Building2, FileText, Bell, RefreshCw } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background p-5 space-y-4">
      <h2 className="font-bold text-sm flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
        {icon} {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, name, value, onChange, type = "text", placeholder = "" }: any) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <input type={type} name={name} value={value || ""} onChange={onChange} placeholder={placeholder}
        className="w-full h-9 px-3 rounded-xl border bg-muted/20 text-sm focus:outline-none focus:border-primary transition-colors" />
    </div>
  );
}

function TextArea({ label, name, value, onChange, placeholder = "" }: any) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <textarea name={name} value={value || ""} onChange={onChange} placeholder={placeholder} rows={3}
        className="w-full px-3 py-2 rounded-xl border bg-muted/20 text-sm focus:outline-none focus:border-primary transition-colors resize-none" />
    </div>
  );
}

const DEFAULTS = {
  company_name: "Al Burhan Tours & Travels",
  company_tagline: "Your Trusted Hajj & Umrah Partner",
  company_address: "",
  company_phone: "",
  company_email: "",
  company_website: "https://alburhantravels.com",
  gst_number: "",
  pan_number: "",
  currency: "INR",
  currency_symbol: "₹",
  timezone: "Asia/Kolkata",
  invoice_prefix: "INV",
  receipt_prefix: "RCP",
  booking_prefix: "ABT",
  agreement_prefix: "AGR",
  ticket_prefix: "TKT",
  logo_url: "",
  signature_url: "",
  footer_note: "Thank you for choosing Al Burhan Tours & Travels. May Allah accept your pilgrimage.",
  whatsapp_greeting: "Assalamu Alaikum! Welcome to Al Burhan Tours & Travels.",
  sms_sender_id: "ALBRHN",
};

type SettingsData = typeof DEFAULTS;

export default function BusinessSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsData>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/business-settings`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setSettings({ ...DEFAULTS, ...d });
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setSettings(s => ({ ...s, [e.target.name]: e.target.value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/business-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      const d = await r.json();
      if (d.ok) toast({ title: "Settings saved successfully" });
      else toast({ title: d.error || "Failed to save", variant: "destructive" });
    } catch { toast({ title: "Error saving settings", variant: "destructive" }); }
    setSaving(false);
  };

  if (loading) return (
    <AdminLayout>
      <div className="py-20 text-center text-muted-foreground">
        <Settings size={32} className="mx-auto mb-2 animate-spin text-primary/40" />
        <p>Loading settings…</p>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Settings size={18} className="text-primary" />
              </div>
              Business Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Company details, prefixes, branding & templates</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} /> Reset
            </Button>
            <Button onClick={save} disabled={saving} size="sm" className="gap-1.5">
              <Save size={13} /> {saving ? "Saving…" : "Save All"}
            </Button>
          </div>
        </div>

        {/* Company Details */}
        <Section title="Company Details" icon={<Building2 size={14} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company Name" name="company_name" value={settings.company_name} onChange={handleChange} placeholder="Al Burhan Tours & Travels" />
            <Field label="Tagline" name="company_tagline" value={settings.company_tagline} onChange={handleChange} placeholder="Your Trusted Partner" />
            <Field label="Phone" name="company_phone" value={settings.company_phone} onChange={handleChange} placeholder="+91 XXXXX XXXXX" />
            <Field label="Email" name="company_email" value={settings.company_email} onChange={handleChange} type="email" placeholder="info@alburhantravels.com" />
            <Field label="Website" name="company_website" value={settings.company_website} onChange={handleChange} placeholder="https://alburhantravels.com" />
            <Field label="GST Number" name="gst_number" value={settings.gst_number} onChange={handleChange} placeholder="29ABCDE1234F1Z5" />
            <Field label="PAN Number" name="pan_number" value={settings.pan_number} onChange={handleChange} placeholder="ABCDE1234F" />
          </div>
          <TextArea label="Office Address" name="company_address" value={settings.company_address} onChange={handleChange} placeholder="Full office address…" />
        </Section>

        {/* Branding */}
        <Section title="Branding" icon={<Building2 size={14} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Logo URL" name="logo_url" value={settings.logo_url} onChange={handleChange} placeholder="https://…/logo.png" />
            <Field label="Digital Signature URL" name="signature_url" value={settings.signature_url} onChange={handleChange} placeholder="https://…/signature.png" />
          </div>
          {settings.logo_url && (
            <div className="rounded-xl border p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground mb-2">Logo Preview</p>
              <img src={settings.logo_url} alt="Logo" className="h-12 object-contain" onError={(e: any) => e.target.style.display = "none"} />
            </div>
          )}
        </Section>

        {/* Document Prefixes */}
        <Section title="Document Prefixes & Numbering" icon={<FileText size={14} />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field label="Booking Prefix" name="booking_prefix" value={settings.booking_prefix} onChange={handleChange} placeholder="ABT" />
            <Field label="Invoice Prefix" name="invoice_prefix" value={settings.invoice_prefix} onChange={handleChange} placeholder="INV" />
            <Field label="Receipt Prefix" name="receipt_prefix" value={settings.receipt_prefix} onChange={handleChange} placeholder="RCP" />
            <Field label="Agreement Prefix" name="agreement_prefix" value={settings.agreement_prefix} onChange={handleChange} placeholder="AGR" />
            <Field label="Ticket Prefix" name="ticket_prefix" value={settings.ticket_prefix} onChange={handleChange} placeholder="TKT" />
          </div>
        </Section>

        {/* Regional */}
        <Section title="Regional Settings" icon={<Settings size={14} />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Currency</label>
              <select name="currency" value={settings.currency} onChange={handleChange}
                className="w-full h-9 px-3 rounded-xl border bg-muted/20 text-sm focus:outline-none focus:border-primary">
                <option value="INR">INR — Indian Rupee</option>
                <option value="USD">USD — US Dollar</option>
                <option value="SAR">SAR — Saudi Riyal</option>
                <option value="AED">AED — UAE Dirham</option>
              </select>
            </div>
            <Field label="Currency Symbol" name="currency_symbol" value={settings.currency_symbol} onChange={handleChange} placeholder="₹" />
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Time Zone</label>
              <select name="timezone" value={settings.timezone} onChange={handleChange}
                className="w-full h-9 px-3 rounded-xl border bg-muted/20 text-sm focus:outline-none focus:border-primary">
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Riyadh">Asia/Riyadh (AST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </Section>

        {/* Notification Templates */}
        <Section title="Notification Templates" icon={<Bell size={14} />}>
          <Field label="SMS Sender ID" name="sms_sender_id" value={settings.sms_sender_id} onChange={handleChange} placeholder="ALBRHN" />
          <TextArea label="WhatsApp Greeting Message" name="whatsapp_greeting" value={settings.whatsapp_greeting} onChange={handleChange} placeholder="Welcome message for new customers…" />
          <TextArea label="Invoice / Document Footer Note" name="footer_note" value={settings.footer_note} onChange={handleChange} placeholder="Thank you note printed on invoices and documents…" />
        </Section>

        {/* Save */}
        <Button onClick={save} disabled={saving} className="w-full gap-2" size="lg">
          <Save size={16} /> {saving ? "Saving Settings…" : "Save All Settings"}
        </Button>
      </div>
    </AdminLayout>
  );
}
