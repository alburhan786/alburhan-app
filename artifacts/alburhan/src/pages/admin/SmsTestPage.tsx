import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  TestTube2, Send, RefreshCw, CheckCircle2, XCircle,
  ShieldCheck, AlertTriangle, Smartphone, Clock,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface SenderIdRow { id: string; sender_id: string; status: string; default_sender: boolean; }

interface DltConfig {
  otp_template_id?: string;
  booking_created_tid?: string;
  booking_confirmed_tid?: string;
  booking_rejected_tid?: string;
  payment_received_tid?: string;
  partial_payment_tid?: string;
  invoice_created_tid?: string;
  pending_payment_tid?: string;
  ticket_issued_tid?: string;
  departure_reminder_tid?: string;
  visa_issued_tid?: string;
  hotel_voucher_issued_tid?: string;
  arrival_reminder_tid?: string;
  eid_greeting_tid?: string;
  [key: string]: string | undefined;
}

const DLT_EVENTS = [
  { label: "OTP (Login / Verification)",     key: "otp_template_id",         vars: "Al Burhan|123456|5 minutes|" },
  { label: "1. Booking Received",            key: "booking_created_tid",     vars: "Test Customer|ABT-001|Hajj Package|" },
  { label: "2. Booking Approved",            key: "booking_confirmed_tid",   vars: "Test Customer|ABT-001|Hajj Package|" },
  { label: "3. Booking Rejected",            key: "booking_rejected_tid",    vars: "Test Customer|ABT-001|Please contact us|" },
  { label: "4. Full Payment Received",       key: "payment_received_tid",    vars: "Test Customer|ABT-001|50000|" },
  { label: "5. Partial Payment",             key: "partial_payment_tid",     vars: "Test Customer|ABT-001|your package|25000|25000|" },
  { label: "6. Invoice Ready",               key: "invoice_created_tid",     vars: "Test Customer|ABT-001|INV-001|" },
  { label: "7. Payment Reminder",            key: "pending_payment_tid",     vars: "Test Customer|ABT-001|25000|" },
  { label: "8. Flight Ticket Issued",        key: "ticket_issued_tid",       vars: "Test Customer|ABT-001|AI302|" },
  { label: "9. Departure Reminder",          key: "departure_reminder_tid",  vars: "Test Customer|ABT-001|01 Jan 2025|" },
  { label: "10. Visa Issued",               key: "visa_issued_tid",          vars: "Test Customer|ABT-001|Approved|" },
  { label: "11. Hotel Voucher Issued",      key: "hotel_voucher_issued_tid", vars: "Test Customer|ABT-001|Your Hotel|" },
  { label: "12. Arrival Reminder",          key: "arrival_reminder_tid",    vars: "Test Customer|ABT-001|As scheduled|" },
  { label: "13. Eid / Special Greeting",    key: "eid_greeting_tid",        vars: "Test Customer|Al Burhan Tours & Travels||" },
];

export default function SmsTestPage() {
  const { toast } = useToast();
  const [senderIds, setSenderIds] = useState<SenderIdRow[]>([]);
  const [dltConfig, setDltConfig] = useState<DltConfig>({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  const [selectedSender, setSelectedSender] = useState("");
  const [selectedEventKey, setSelectedEventKey] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState("");
  const [mobile, setMobile] = useState("");

  const [result, setResult] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sidR, dltR] = await Promise.all([
        fetch(`${API}/api/sms-settings/sender-ids`, { credentials: "include" }),
        fetch(`${API}/api/api-settings/fast2sms`, { credentials: "include" }),
      ]);
      const sidD = await sidR.json();
      const dltD = await dltR.json();
      if (sidD.ok) {
        setSenderIds(sidD.senderIds || []);
        const def = sidD.senderIds?.find((s: SenderIdRow) => s.default_sender);
        if (def) setSelectedSender(def.sender_id);
        else if (sidD.senderIds?.length) setSelectedSender(sidD.senderIds[0].sender_id);
      }
      if (dltR.ok) setDltConfig(dltD.extraFields || {});
    } catch {
      toast({ title: "Failed to load settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEventChange = (key: string) => {
    setSelectedEventKey(key);
    const ev = DLT_EVENTS.find(e => e.key === key);
    if (ev) {
      setTemplateId(dltConfig[key] || "");
      setVariables(ev.vars);
    }
  };

  const handleTest = async () => {
    if (!selectedSender || !templateId || !mobile) {
      toast({ title: "Fill in all required fields", description: "Sender ID, Template ID, and Mobile Number are required", variant: "destructive" });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const varsArr = variables.split("|").filter((v, i, arr) => i < arr.length - 1 || v.trim());
      const r = await fetch(`${API}/api/sms-settings/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ senderId: selectedSender, templateId, mobile, variables: varsArr }),
      });
      const d = await r.json();
      setResult(d);
      if (d.ok) {
        toast({ title: "Test SMS sent successfully!", description: `Delivered via ${selectedSender}/DLT` });
      } else {
        toast({ title: "Test SMS failed", description: d.test?.errorMessage || d.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

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
      <div className="max-w-3xl mx-auto p-4 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TestTube2 className="w-5 h-5 text-purple-600" />
            SMS Test Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send a live test SMS using a DLT-approved Sender ID and registered Template ID.
          </p>
        </div>

        {/* Policy badge */}
        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
          <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span className="text-green-800">
            <strong>DLT Only:</strong> All test SMS use <strong>route=dlt</strong>. Quick / Promotional routes are blocked.
          </span>
        </div>

        {/* Test form */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="bg-muted/40 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Test Configuration</h2>
          </div>
          <div className="p-4 space-y-4">
            {/* Sender ID */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Sender ID <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSender}
                onChange={e => setSelectedSender(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              >
                <option value="">— Select Sender ID —</option>
                {senderIds.filter(s => s.status === "active").map(s => (
                  <option key={s.id} value={s.sender_id}>
                    {s.sender_id} {s.default_sender ? "(Default)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Only active, TRAI-registered sender IDs are shown.</p>
            </div>

            {/* Event selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Event / Template (optional — pre-fills Template ID & Variables)
              </label>
              <select
                value={selectedEventKey}
                onChange={e => handleEventChange(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              >
                <option value="">— Select an event to pre-fill —</option>
                {DLT_EVENTS.map(ev => (
                  <option key={ev.key} value={ev.key}>
                    {ev.label} {dltConfig[ev.key] ? "✓" : "(not configured)"}
                  </option>
                ))}
              </select>
            </div>

            {/* Template ID */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                DLT Template ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
                placeholder="e.g. 1507162862434082671"
                className="w-full text-sm font-mono border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              />
            </div>

            {/* Variables */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Variable Values (pipe-separated)
              </label>
              <input
                type="text"
                value={variables}
                onChange={e => setVariables(e.target.value)}
                placeholder="Value1|Value2|Value3|"
                className="w-full text-sm font-mono border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate variable values with | (pipe). Must match the number of {"{#var#}"} placeholders in your DLT template.
              </p>
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-muted/30 text-sm text-muted-foreground">
                  <Smartphone className="w-4 h-4" /> +91
                </div>
                <input
                  type="tel"
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  placeholder="9876543210"
                  maxLength={10}
                  className="flex-1 text-sm font-mono border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                />
              </div>
            </div>

            {/* Send button */}
            <button
              onClick={handleTest}
              disabled={testing || !selectedSender || !templateId || !mobile}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {testing ? "Sending test SMS…" : "Send Test SMS (DLT)"}
            </button>
          </div>
        </div>

        {/* Result panel */}
        {result && (
          <div className={`border rounded-xl bg-card overflow-hidden ${result.ok ? "border-green-300" : "border-red-300"}`}>
            <div className={`flex items-center gap-3 px-4 py-3 border-b ${result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              {result.ok
                ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                : <XCircle className="w-5 h-5 text-red-600" />}
              <span className={`font-semibold text-sm ${result.ok ? "text-green-800" : "text-red-800"}`}>
                {result.ok ? "Test SMS Delivered Successfully" : "Test SMS Failed"}
              </span>
              {result.test?.durationMs && (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" /> {result.test.durationMs}ms
                </span>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* Key info */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Sender ID Used", value: result.test?.senderIdUsed, mono: true, ok: true },
                  { label: "Route", value: result.test?.route?.toUpperCase(), mono: true, ok: result.test?.route === "dlt" },
                  { label: "Template ID", value: result.test?.templateId, mono: true, ok: !!result.test?.templateId },
                  { label: "HTTP Status", value: result.test?.httpStatus, mono: false, ok: result.test?.httpStatus === 200 },
                ].map(item => (
                  <div key={item.label} className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className={`text-sm ${item.mono ? "font-mono" : "font-semibold"} ${!item.ok ? "text-red-600" : ""}`}>
                      {item.value ?? "—"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Error message */}
              {result.test?.errorMessage && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{result.test.errorMessage}</span>
                </div>
              )}

              {/* Validation checklist */}
              {result.validations && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Validation Checks</p>
                  {Object.entries(result.validations).map(([k, v]) => {
                    const labels: Record<string, string> = {
                      senderIdRegistered: "Sender ID registered in system",
                      senderIdActive: "Sender ID active",
                      senderIdDltApproved: "Sender ID DLT approved",
                      templateIdProvided: "Template ID provided",
                      routeDlt: "Route = DLT (not Quick/Promo)",
                      noFallback: "No Quick route fallback",
                    };
                    return (
                      <div key={k} className="flex items-center gap-2 text-sm">
                        {v ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
                        <span className={v ? "text-foreground" : "text-red-700"}>{labels[k] || k}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Raw API response */}
              {result.test?.apiResponse && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Raw API Response
                  </summary>
                  <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(result.test.apiResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
