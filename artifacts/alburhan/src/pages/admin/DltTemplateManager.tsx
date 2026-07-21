import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Save, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Info, Smartphone } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface DltField {
  key: string;
  label: string;
  event: string;
  senderReq: "ABURHA";
}

const DLT_FIELDS: DltField[] = [
  { key: "otp_template_id",          label: "OTP (Login / Verification)",        event: "otp",                      senderReq: "ABURHA" },
  { key: "booking_created_tid",      label: "1. Booking Received",               event: "booking_created",           senderReq: "ABURHA" },
  { key: "booking_confirmed_tid",    label: "2. Booking Approved",               event: "booking_approved",          senderReq: "ABURHA" },
  { key: "booking_rejected_tid",     label: "3. Booking Rejected",               event: "booking_rejected",          senderReq: "ABURHA" },
  { key: "payment_received_tid",     label: "4. Full Payment Received",          event: "payment_received",          senderReq: "ABURHA" },
  { key: "partial_payment_tid",      label: "5. Partial Payment",                event: "partial_payment",           senderReq: "ABURHA" },
  { key: "invoice_created_tid",      label: "6. Invoice Ready",                  event: "invoice_generated",         senderReq: "ABURHA" },
  { key: "pending_payment_tid",      label: "7. Payment Reminder",               event: "payment_due",               senderReq: "ABURHA" },
  { key: "ticket_issued_tid",        label: "8. Flight Ticket Issued",           event: "ticket_issued",             senderReq: "ABURHA" },
  { key: "departure_reminder_tid",   label: "9. Departure Reminder",             event: "departure_reminder",        senderReq: "ABURHA" },
  { key: "visa_issued_tid",          label: "10. Visa Issued",                   event: "visa_approved",             senderReq: "ABURHA" },
  { key: "hotel_voucher_issued_tid", label: "11. Hotel Voucher Issued",          event: "hotel_voucher_issued",      senderReq: "ABURHA" },
  { key: "arrival_reminder_tid",     label: "12. Arrival Reminder",              event: "arrival_reminder",          senderReq: "ABURHA" },
  { key: "eid_greeting_tid",         label: "13. Eid / Special Occasion Greeting", event: "eid_greeting",            senderReq: "ABURHA" },
];

export default function DltTemplateManager() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<{ sender_id?: string; notify_template_id?: string }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/api-settings/fast2sms`, { credentials: "include" });
      const d = await r.json();
      const extra: Record<string, string> = d.extraFields || {};
      setValues(extra);
      setOriginal(extra);
      setMeta({ sender_id: extra.sender_id, notify_template_id: extra.notify_template_id });
    } catch {
      toast({ title: "Failed to load settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        apiKey: values.apiKey || original.apiKey || "",
        apiUrl: values.apiUrl || original.apiUrl || "",
        extraFields: values,
      };
      const r = await fetch(`${API}/api/api-settings/fast2sms`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "DLT template IDs saved", description: "All changes saved to Fast2SMS settings." });
      setOriginal(values);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const configuredCount = DLT_FIELDS.filter(f => values[f.key]?.trim()).length;
  const missingCount = DLT_FIELDS.length - configuredCount;
  const hasChanges = JSON.stringify(values) !== JSON.stringify(original);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto p-4 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-600" />
              DLT Template Manager
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Fast2SMS DLT-registered template IDs. All SMS must use Sender ID{" "}
              <span className="font-mono font-bold text-blue-700">ABURHA</span>{" "}
              with DLT route only.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save All"}
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="font-semibold text-green-800">{configuredCount}</span>
            <span className="text-green-700">configured</span>
          </div>
          {missingCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="font-semibold text-red-800">{missingCount}</span>
              <span className="text-red-700">missing — SMS blocked for these events</span>
            </div>
          )}
          {missingCount === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-800 font-semibold">All events covered ✓</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <Info className="w-4 h-4 text-blue-600" />
            <span className="text-blue-800">Sender: <span className="font-mono font-bold">{meta.sender_id || "ABURHA"}</span></span>
          </div>
        </div>

        {/* DLT compliance info */}
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-amber-800">
            <strong>DLT Compliance:</strong> Each event must have a TRAI-registered template ID from your DLT portal
            (Jio Trueconnect / BSNL). SMS without a template ID will be <strong>blocked</strong> to prevent
            DLT violations. Register templates at your telecom operator's DLT portal before adding IDs here.
          </div>
        </div>

        {/* Template ID table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="grid grid-cols-12 gap-0 bg-muted/50 border-b border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="col-span-5">Event</div>
            <div className="col-span-5">DLT Template ID</div>
            <div className="col-span-2 text-center">Status</div>
          </div>
          <div className="divide-y divide-border">
            {DLT_FIELDS.map((field) => {
              const val = values[field.key] || "";
              const isFilled = val.trim().length > 0;
              const changed = val !== (original[field.key] || "");
              return (
                <div
                  key={field.key}
                  className={`grid grid-cols-12 gap-0 px-4 py-3 items-center transition-colors ${
                    !isFilled ? "bg-red-50/40" : changed ? "bg-amber-50/40" : ""
                  }`}
                >
                  <div className="col-span-5 pr-4">
                    <p className="text-sm font-medium text-foreground">{field.label}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{field.event}</p>
                  </div>
                  <div className="col-span-5 pr-4">
                    <input
                      type="text"
                      value={val}
                      onChange={e => handleChange(field.key, e.target.value)}
                      placeholder="Enter DLT template ID…"
                      className={`w-full text-sm font-mono px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors ${
                        !isFilled
                          ? "border-red-300 bg-red-50 placeholder-red-400"
                          : changed
                          ? "border-amber-400 bg-amber-50"
                          : "border-border bg-background"
                      }`}
                    />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {isFilled ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> OK
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        <XCircle className="w-3 h-3" /> Missing
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {hasChanges && (
          <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-300 rounded-lg">
            <span className="text-sm text-amber-800 font-medium">⚠️ You have unsaved changes</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save Now"}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
