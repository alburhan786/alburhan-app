import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Save, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Info, Smartphone, ShieldAlert, ShieldCheck, ToggleLeft, ToggleRight, Clock } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface DltField {
  key: string;
  label: string;
  event: string;
  senderKey: string;
}

const DLT_FIELDS: DltField[] = [
  { key: "otp_template_id",           label: "OTP — Login / Registration",           event: "otp",                  senderKey: "otp_sender" },
  { key: "forgot_password_otp_tid",   label: "OTP — Forgot Password",                event: "forgot_password_otp",  senderKey: "forgot_password_otp_sender" },
  { key: "booking_created_tid",       label: "1. Booking Received",                  event: "booking_created",      senderKey: "booking_created_sender" },
  { key: "booking_confirmed_tid",     label: "2. Booking Approved / Confirmed",      event: "booking_approved",     senderKey: "booking_confirmed_sender" },
  { key: "booking_rejected_tid",      label: "3. Booking Rejected",                  event: "booking_rejected",     senderKey: "booking_rejected_sender" },
  { key: "payment_received_tid",      label: "4. Full Payment Received",             event: "payment_received",     senderKey: "payment_received_sender" },
  { key: "partial_payment_tid",       label: "5. Partial Payment",                   event: "partial_payment",      senderKey: "partial_payment_sender" },
  { key: "invoice_created_tid",       label: "6. Invoice Generated",                 event: "invoice_generated",    senderKey: "invoice_created_sender" },
  { key: "agreement_ready_tid",       label: "7a. Agreement Ready",                  event: "agreement_ready",      senderKey: "agreement_ready_sender" },
  { key: "agreement_signed_tid",      label: "7b. Agreement Signed",                 event: "agreement_signed",     senderKey: "agreement_signed_sender" },
  { key: "pending_payment_tid",       label: "8. Payment Reminder",                  event: "payment_due",          senderKey: "pending_payment_sender" },
  { key: "ticket_issued_tid",         label: "9. Flight Ticket Issued",              event: "ticket_issued",        senderKey: "ticket_issued_sender" },
  { key: "visa_issued_tid",           label: "10. Visa Issued",                      event: "visa_approved",        senderKey: "visa_issued_sender" },
  { key: "hotel_voucher_issued_tid",  label: "11. Hotel Voucher Issued",             event: "hotel_voucher_issued", senderKey: "hotel_voucher_sender" },
  { key: "departure_reminder_tid",    label: "12. Departure Reminder",               event: "departure_reminder",   senderKey: "departure_reminder_sender" },
  { key: "arrival_reminder_tid",      label: "13. Arrival Reminder",                 event: "arrival_reminder",     senderKey: "arrival_reminder_sender" },
  { key: "welcome_saudi_arabia_tid",  label: "14. Welcome to Saudi Arabia",          event: "welcome_saudi_arabia", senderKey: "welcome_saudi_arabia_sender" },
  { key: "return_reminder_tid",       label: "15. Return Reminder",                  event: "return_reminder",      senderKey: "return_reminder_sender" },
  { key: "eid_greeting_tid",          label: "16. Eid / Special Occasion Greeting",  event: "eid_greeting",         senderKey: "eid_greeting_sender" },
];

interface SenderIdRow { id: string; sender_id: string; status: string; default_sender: boolean; }

interface EmergencyState {
  enabled: boolean;
  reason: string | null;
  enabledAt: string | null;
  enabledBy: string | null;
}

export default function DltTemplateManager() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [senderIds, setSenderIds] = useState<SenderIdRow[]>([]);
  const [globalSender, setGlobalSender] = useState("ABURHA");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Emergency fallback state
  const [emergency, setEmergency] = useState<EmergencyState>({ enabled: false, reason: null, enabledAt: null, enabledBy: null });
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencySaving, setEmergencySaving] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dltR, sidR, emR] = await Promise.all([
        fetch(`${API}/api/sms-settings/dlt-config`, { credentials: "include" }),
        fetch(`${API}/api/sms-settings/sender-ids`, { credentials: "include" }),
        fetch(`${API}/api/sms-settings/emergency-fallback`, { credentials: "include" }),
      ]);
      const dltD = await dltR.json();
      const sidD = await sidR.json();
      const emD = await emR.json().catch(() => ({}));

      const config: Record<string, string> = dltD.config || {};
      setValues(config);
      setOriginal(config);
      setGlobalSender(config.sender_id || dltD.globalSender || "ABURHA");

      if (sidD.ok) setSenderIds(sidD.senderIds || []);
      if (emD.ok !== undefined) setEmergency(emD);
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
      const r = await fetch(`${API}/api/sms-settings/dlt-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ config: values }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || await r.text());
      toast({ title: "DLT settings saved", description: "Template IDs saved to notification_templates. SMS will use new IDs immediately." });
      await load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyToggle = async (enable: boolean) => {
    if (enable && !emergencyReason.trim()) {
      toast({ title: "Reason required", description: "Please enter a reason for enabling emergency fallback.", variant: "destructive" });
      return;
    }
    setEmergencySaving(true);
    try {
      const r = await fetch(`${API}/api/sms-settings/emergency-fallback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: enable, reason: enable ? emergencyReason.trim() : undefined }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Failed");
      toast({
        title: enable ? "⚠ Emergency fallback ENABLED" : "Emergency fallback disabled",
        description: enable
          ? `SMS will use Quick Route until DLT templates are configured or this is disabled.`
          : "SMS now requires DLT templates for all events.",
        variant: enable ? "destructive" : "default",
      });
      setShowEmergencyConfirm(false);
      setEmergencyReason("");
      const emR = await fetch(`${API}/api/sms-settings/emergency-fallback`, { credentials: "include" });
      const emD = await emR.json();
      if (emD.ok !== undefined) setEmergency(emD);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setEmergencySaving(false);
    }
  };

  const configuredCount = DLT_FIELDS.filter(f => values[f.key]?.trim()).length;
  const missingCount = DLT_FIELDS.length - configuredCount;
  const hasChanges = JSON.stringify(values) !== JSON.stringify(original);
  const activeSenders = senderIds.filter(s => s.status === "active");

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
      <div className="max-w-5xl mx-auto p-4 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-600" />
              DLT Template Manager
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Map each SMS event to a TRAI-registered DLT Template ID and Sender ID.
              All SMS uses <strong>route=dlt</strong> — no Quick/Promotional fallback.
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
            <span className="text-blue-800">Default Sender: <span className="font-mono font-bold">{globalSender}</span></span>
          </div>
        </div>

        {/* DLT compliance info */}
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-amber-800">
            <strong>DLT Compliance:</strong> Each event must have a TRAI-registered template ID from your DLT portal
            (Jio Trueconnect / BSNL). The <strong>Sender ID</strong> column lets you assign a different DLT-approved
            sender to each event — defaults to the global sender if not set. Register templates at your telecom
            operator's DLT portal before adding IDs here.
          </div>
        </div>

        {/* Template ID table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="grid grid-cols-12 gap-0 bg-muted/50 border-b border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="col-span-4">Event</div>
            <div className="col-span-4">DLT Template ID</div>
            <div className="col-span-2">Sender ID</div>
            <div className="col-span-2 text-center">Status</div>
          </div>
          <div className="divide-y divide-border">
            {DLT_FIELDS.map((field) => {
              const val = values[field.key] || "";
              const senderVal = values[field.senderKey] || "";
              const isFilled = val.trim().length > 0;
              const changed = val !== (original[field.key] || "") || senderVal !== (original[field.senderKey] || "");
              const effectiveSender = senderVal || globalSender;
              return (
                <div
                  key={field.key}
                  className={`grid grid-cols-12 gap-0 px-4 py-3 items-center transition-colors ${
                    !isFilled ? "bg-red-50/40" : changed ? "bg-amber-50/40" : ""
                  }`}
                >
                  {/* Event label */}
                  <div className="col-span-4 pr-3">
                    <p className="text-sm font-medium text-foreground">{field.label}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{field.event}</p>
                  </div>

                  {/* Template ID input */}
                  <div className="col-span-4 pr-3">
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

                  {/* Sender ID dropdown */}
                  <div className="col-span-2 pr-3">
                    {activeSenders.length > 0 ? (
                      <select
                        value={senderVal}
                        onChange={e => handleChange(field.senderKey, e.target.value)}
                        className="w-full text-xs font-mono px-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                        title={`Effective sender: ${effectiveSender}`}
                      >
                        <option value="">Default ({globalSender})</option>
                        {activeSenders.map(s => (
                          <option key={s.id} value={s.sender_id}>
                            {s.sender_id}{s.default_sender ? " ★" : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground">{effectiveSender}</span>
                    )}
                  </div>

                  {/* Status */}
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

        {/* ── Emergency SMS Fallback ─────────────────────────────────────────── */}
        <div className={`rounded-xl border-2 p-5 space-y-4 ${emergency.enabled ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {emergency.enabled
                ? <ShieldAlert className="w-6 h-6 text-red-600 mt-0.5 shrink-0" />
                : <ShieldCheck className="w-6 h-6 text-gray-400 mt-0.5 shrink-0" />}
              <div>
                <h2 className={`text-base font-bold ${emergency.enabled ? "text-red-800" : "text-gray-800"}`}>
                  Emergency SMS Fallback
                  {emergency.enabled && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white animate-pulse">
                      ACTIVE
                    </span>
                  )}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  When enabled, SMS events without a DLT template will use <strong>Quick Route</strong> (unregistered message, may not be TRAI-compliant).
                  Use only as a temporary measure while DLT templates are being approved.
                </p>
              </div>
            </div>
            {/* Toggle button — only show if not in confirm mode */}
            {!showEmergencyConfirm && (
              <button
                onClick={() => emergency.enabled ? handleEmergencyToggle(false) : setShowEmergencyConfirm(true)}
                disabled={emergencySaving}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shrink-0 ${
                  emergency.enabled
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }`}
              >
                {emergencySaving
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : emergency.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {emergencySaving ? "Saving…" : emergency.enabled ? "Disable Fallback" : "Enable Emergency Fallback"}
              </button>
            )}
          </div>

          {/* Active state info */}
          {emergency.enabled && emergency.reason && (
            <div className="flex flex-wrap gap-4 text-sm text-red-700 bg-red-100 rounded-lg px-4 py-3 border border-red-200">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <strong>Reason:</strong> {emergency.reason}
              </span>
              {emergency.enabledBy && (
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <strong>By:</strong> {emergency.enabledBy}
                </span>
              )}
              {emergency.enabledAt && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  {new Date(emergency.enabledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              )}
            </div>
          )}

          {/* Enable confirmation form */}
          {showEmergencyConfirm && !emergency.enabled && (
            <div className="space-y-3 border border-red-200 bg-red-50/60 rounded-lg p-4">
              <div className="flex items-start gap-2.5 p-3 bg-red-700 text-white rounded-lg">
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide">⚠ WARNING</p>
                  <p className="text-sm mt-0.5">
                    You are switching from the approved DLT route to Emergency SMS.
                    This should only be used during provider outages.
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-600">
                Your name, IP address, device, date, time and reason will be recorded. This action is audited.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={emergencyReason}
                  onChange={e => setEmergencyReason(e.target.value)}
                  placeholder="e.g. DLT templates under re-approval, critical customer comms needed"
                  className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEmergencyToggle(true)}
                  disabled={emergencySaving || !emergencyReason.trim()}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {emergencySaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  Confirm — Enable Emergency Fallback
                </button>
                <button
                  onClick={() => { setShowEmergencyConfirm(false); setEmergencyReason(""); }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Normal (disabled) info */}
          {!emergency.enabled && !showEmergencyConfirm && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
              DLT-only mode is active. SMS events without a configured template will <strong>fail silently</strong> (not use Quick Route).
            </p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
