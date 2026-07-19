import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, AlertTriangle, Clock, Send, FileText, Shield, User, Phone } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const WINDOWS = [
  { label: "7 Days", days: 7, color: "text-red-700 bg-red-50 border-red-200", badge: "bg-red-100 text-red-700" },
  { label: "30 Days", days: 30, color: "text-orange-700 bg-orange-50 border-orange-200", badge: "bg-orange-100 text-orange-700" },
  { label: "90 Days", days: 90, color: "text-amber-700 bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-700" },
  { label: "180 Days", days: 180, color: "text-blue-700 bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-700" },
];

const DOC_TYPES = [
  { key: "passport", label: "Passport", icon: <FileText size={14} /> },
  { key: "visa", label: "Visa", icon: <Shield size={14} /> },
  { key: "medical", label: "Medical", icon: <User size={14} /> },
];

export default function DocumentExpiryCenter() {
  const { toast } = useToast();
  const [selectedDays, setSelectedDays] = useState(90);
  const [selectedType, setSelectedType] = useState("passport");
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/document-expiry?days=${selectedDays}&type=${selectedType}`, { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        setRecords(d.records || []);
        setSummary(d.summary || {});
      }
    } catch { toast({ title: "Failed to load expiry data", variant: "destructive" }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [selectedDays, selectedType]);

  const sendReminder = async (pilgrimId: string, bookingId: string, channel: string) => {
    const key = `${pilgrimId}-${channel}`;
    setSending(key);
    try {
      const r = await fetch(`${BASE_API}/api/admin/document-expiry/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pilgrimId, bookingId, type: selectedType, channel }),
      });
      const d = await r.json();
      if (d.ok) toast({ title: `Reminder sent via ${channel}` });
      else toast({ title: d.error || "Failed to send", variant: "destructive" });
    } catch { toast({ title: "Error sending reminder", variant: "destructive" }); }
    setSending(null);
  };

  const daysRemaining = (dateStr: string) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    return diff;
  };

  const urgencyStyle = (days: number | null) => {
    if (days === null) return "bg-muted/30 text-muted-foreground";
    if (days <= 7) return "bg-red-100 text-red-700 border-red-200";
    if (days <= 30) return "bg-orange-100 text-orange-700 border-orange-200";
    if (days <= 90) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-blue-100 text-blue-700 border-blue-200";
  };

  const win = WINDOWS.find(w => w.days === selectedDays)!;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
                <Clock size={18} className="text-red-700" />
              </div>
              Document Expiry Center
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monitor and send expiry reminders for all pilgrim documents</p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {WINDOWS.map(w => (
            <button key={w.days} onClick={() => setSelectedDays(w.days)}
              className={`rounded-2xl border p-3 text-center transition-all ${selectedDays === w.days ? w.color + " ring-2 ring-offset-1 ring-current" : "bg-muted/20 text-muted-foreground border-transparent hover:bg-muted/40"}`}>
              <p className="text-xl font-bold font-mono">{summary[`d${w.days}`] || 0}</p>
              <p className="text-xs mt-0.5 font-semibold">Within {w.label}</p>
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex gap-2">
          {DOC_TYPES.map(t => (
            <button key={t.key} onClick={() => setSelectedType(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${selectedType === t.key ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Clock size={32} className="mx-auto mb-2 animate-pulse text-red-300" />
            <p>Scanning document expiry dates…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-10 text-center">
            <Shield size={36} className="text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-emerald-800">No Expiring Documents</p>
            <p className="text-sm text-emerald-600 mt-1">No {selectedType} documents expiring within {selectedDays} days</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <div className="bg-muted/30 px-4 py-2 border-b flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {records.length} {DOC_TYPES.find(t => t.key === selectedType)?.label} expiring within {selectedDays} days
              </p>
              <Badge variant="outline" className={`text-[10px] ${win.badge}`}>{win.label} window</Badge>
            </div>
            <div className="divide-y">
              {records.map((rec, i) => {
                const expiryField = selectedType === "passport" ? rec.passport_expiry_date : selectedType === "visa" ? rec.visa_expiry_date : rec.medical_expiry_date;
                const days = daysRemaining(expiryField);
                return (
                  <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/10 transition-colors">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                      {(rec.pilgrim_name || rec.customer_name || "?").charAt(0).toUpperCase()}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{rec.pilgrim_name || "—"}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-xs text-muted-foreground">{rec.customer_name}</span>
                        {rec.booking_number && <span className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">{rec.booking_number}</span>}
                        {rec.passport_number && selectedType === "passport" && <span className="text-xs text-muted-foreground">PP: {rec.passport_number}</span>}
                        {rec.customer_mobile && <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Phone size={10} />{rec.customer_mobile}</span>}
                      </div>
                    </div>
                    {/* Expiry */}
                    <div className="text-center flex-shrink-0">
                      <p className="text-xs text-muted-foreground">Expires</p>
                      <p className="font-bold text-sm">{expiryField ? new Date(expiryField).toLocaleDateString("en-IN") : "—"}</p>
                      {days !== null && (
                        <Badge variant="outline" className={`text-[10px] mt-0.5 ${urgencyStyle(days)}`}>
                          {days <= 0 ? "EXPIRED" : `${days}d left`}
                        </Badge>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1"
                        disabled={sending === `${rec.pilgrim_id}-whatsapp`}
                        onClick={() => sendReminder(rec.pilgrim_id, rec.booking_id, "whatsapp")}>
                        <Send size={10} /> WA
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1"
                        disabled={sending === `${rec.pilgrim_id}-sms`}
                        onClick={() => sendReminder(rec.pilgrim_id, rec.booking_id, "sms")}>
                        <Send size={10} /> SMS
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
