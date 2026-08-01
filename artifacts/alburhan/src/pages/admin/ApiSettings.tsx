import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Shield, Eye, EyeOff, Save, Zap, Send, CheckCircle2,
  XCircle, Loader2, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
  MessageSquare, Mail, Smartphone, Bell, CreditCard, Radio, RefreshCw
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface ProviderField {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password" | "number" | "url" | "textarea";
  required?: boolean;
  isExtra?: boolean;
  colSpan?: "full";
}

interface ProviderDef {
  id: string;
  label: string;
  icon: any;
  color: string;
  description: string;
  apiUrlLabel?: string;
  apiUrlPlaceholder?: string;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  extraFields?: ProviderField[];
  testMessageFields?: ProviderField[];
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "botbee",
    label: "BotBee WhatsApp",
    icon: MessageSquare,
    color: "text-green-600",
    description: "WhatsApp Business API via BotBee. Used for booking confirmations and customer notifications.",
    apiUrlLabel: "API Base URL",
    apiUrlPlaceholder: "https://app.botbee.io/api/v1/whatsapp",
    apiKeyLabel: "API Token",
    apiKeyPlaceholder: "Enter BotBee API token",
    extraFields: [
      { key: "phone_number_id", label: "Phone Number ID", placeholder: "965912196611113", isExtra: true },
      { key: "business_id", label: "Business Account ID", placeholder: "e.g. 987654321", isExtra: true },
      { key: "instance_id", label: "Instance ID", placeholder: "e.g. instance_12345", isExtra: true },
      { key: "webhook_url", label: "Webhook URL (optional)", placeholder: "https://yourdomain.com/webhook/botbee", isExtra: true },
    ],
    testMessageFields: [
      { key: "mobile", label: "Test Mobile Number", placeholder: "91XXXXXXXXXX", type: "text" },
    ],
  },
  {
    id: "fast2sms",
    label: "Fast2SMS DLT SMS",
    icon: Smartphone,
    color: "text-blue-600",
    description: "DLT-compliant bulk SMS via Fast2SMS. Booking confirmations, payment alerts, and reminders.",
    apiUrlLabel: "API URL",
    apiUrlPlaceholder: "https://www.fast2sms.com/dev/bulkV2",
    apiKeyLabel: "Authorization Key",
    apiKeyPlaceholder: "Enter Fast2SMS authorization API key",
    extraFields: [
      { key: "sender_id",              label: "Sender ID (DLT Registered)",     placeholder: "ABURHA",  isExtra: true },
      { key: "otp_template_id",        label: "OTP Template ID",                 placeholder: "164844",  isExtra: true },
      { key: "notify_template_id",     label: "Default / Fallback Template ID",  placeholder: "enter approved DLT template ID", isExtra: true },
      { key: "booking_created_tid",    label: "1. Booking Received Template ID",  placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "booking_confirmed_tid",  label: "2. Booking Approved Template ID",  placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "booking_rejected_tid",   label: "3. Booking Rejected Template ID",  placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "payment_received_tid",   label: "4. Payment Received Template ID",  placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "partial_payment_tid",    label: "5. Partial Payment Template ID",   placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "invoice_created_tid",    label: "6. Invoice Ready Template ID",     placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "pending_payment_tid",    label: "7. Payment Reminder Template ID",  placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "ticket_issued_tid",         label: "8. Flight Ticket Issued Template ID", placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "departure_reminder_tid",    label: "9. Flight Reminder Template ID",      placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "visa_issued_tid",           label: "10. Visa Ready Template ID",          placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "hotel_voucher_issued_tid",  label: "11. Hotel Voucher Ready Template ID", placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "arrival_reminder_tid",   label: "12. Arrival Reminder Template ID", placeholder: "Fast2SMS approved template ID", isExtra: true },
      { key: "eid_greeting_tid",       label: "13. Eid Greeting Template ID",     placeholder: "Fast2SMS approved template ID", isExtra: true },
    ],
    testMessageFields: [
      { key: "mobile", label: "Test Mobile Number", placeholder: "10-digit number", type: "text" },
    ],
  },
  {
    id: "lemin",
    label: "Lemin AI RCS (Jio)",
    icon: Radio,
    color: "text-purple-600",
    description: "Jio RCS rich messaging via Lemin AI. Sends template-based rich messages with interactive content.",
    apiUrlLabel: "API Endpoint",
    apiUrlPlaceholder: "https://rcs.leminai.com/api/send/template",
    apiKeyLabel: "User ID (Developer API Key)",
    apiKeyPlaceholder: "Enter your Lemin AI Developer API Key",
    extraFields: [
      { key: "brand_name",             label: "Brand Name",                       placeholder: "Al Burhan Tours & Travels",  isExtra: true },
      { key: "template_id",            label: "Default Template ID",              placeholder: "1473",                       isExtra: true },
      { key: "booking_created_tid",    label: "Booking Created Template ID",      placeholder: "use default",                isExtra: true },
      { key: "booking_confirmed_tid",  label: "Booking Confirmed Template ID",    placeholder: "use default",                isExtra: true },
      { key: "payment_received_tid",   label: "Payment Received Template ID",     placeholder: "use default",                isExtra: true },
      { key: "pending_payment_tid",    label: "Pending Payment Template ID",      placeholder: "use default",                isExtra: true },
      { key: "invoice_created_tid",    label: "Invoice Created Template ID",      placeholder: "use default",                isExtra: true },
      { key: "ticket_issued_tid",      label: "Ticket Issued Template ID",        placeholder: "use default",                isExtra: true },
      { key: "visa_issued_tid",        label: "Visa Issued Template ID",          placeholder: "use default",                isExtra: true },
      { key: "departure_reminder_tid", label: "Departure Reminder Template ID",   placeholder: "use default",                isExtra: true },
      { key: "arrival_reminder_tid",   label: "Arrival Reminder Template ID",     placeholder: "use default",                isExtra: true },
      { key: "eid_greeting_tid",       label: "Eid Greeting Template ID",         placeholder: "use default",                isExtra: true },
    ],
    testMessageFields: [
      { key: "mobile", label: "Test Mobile Number", placeholder: "10-digit number", type: "text" },
    ],
  },
  {
    id: "smtp",
    label: "SMTP Email",
    icon: Mail,
    color: "text-orange-600",
    description: "Email delivery via SMTP. Used for booking confirmations, invoices, and admin notifications.",
    apiUrlLabel: "SMTP Host",
    apiUrlPlaceholder: "smtp.gmail.com",
    apiKeyLabel: "SMTP Password",
    apiKeyPlaceholder: "Enter SMTP password / app password",
    extraFields: [
      { key: "port", label: "SMTP Port", placeholder: "587", type: "number", isExtra: true },
      { key: "user", label: "SMTP Username / Email", placeholder: "info@alburhantravels.com", isExtra: true },
      { key: "from_email", label: "From Email", placeholder: "info@alburhantravels.com", isExtra: true },
      { key: "from_name", label: "From Name", placeholder: "Al Burhan Tours & Travels", isExtra: true },
    ],
    testMessageFields: [
      { key: "email", label: "Test Email Address", placeholder: "test@example.com", type: "text" },
    ],
  },
  {
    id: "firebase",
    label: "Firebase Push (FCM v1)",
    icon: Bell,
    color: "text-amber-500",
    description: "Push notifications via Firebase Cloud Messaging API v1. Authenticate with a service account JSON — no legacy Server Key required.",
    // No apiUrlLabel — FCM v1 endpoint is fixed (https://fcm.googleapis.com/v1/projects/{id}/messages:send)
    apiKeyLabel: "Private Key (PEM)",
    apiKeyPlaceholder: "Auto-filled from service account JSON below — or paste PEM directly",
    extraFields: [
      { key: "project_id",   label: "Project ID",    placeholder: "your-firebase-project-id",                                            isExtra: true },
      { key: "client_email", label: "Client Email",  placeholder: "firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com",           isExtra: true },
      {
        key: "service_account_json",
        label: "Service Account JSON — paste here to auto-fill all fields",
        placeholder: '{\n  "type": "service_account",\n  "project_id": "your-project-id",\n  "private_key_id": "...",\n  "private_key": "-----BEGIN RSA PRIVATE KEY-----\\n...",\n  "client_email": "firebase-adminsdk-...@your-project.iam.gserviceaccount.com",\n  ...\n}\n\nGet this from Firebase Console → Project Settings → Service Accounts → Generate new private key',
        type: "textarea",
        isExtra: true,
        colSpan: "full",
      },
    ],
    testMessageFields: [
      { key: "device_token", label: "Device FCM Token (copy from Push Center → This Browser)", placeholder: "Paste FCM token here to send a test push", type: "text" },
    ],
  },
  {
    id: "razorpay",
    label: "Razorpay",
    icon: CreditCard,
    color: "text-indigo-600",
    description: "Payment gateway via Razorpay. Used for processing booking payments and refunds.",
    apiUrlLabel: "API URL",
    apiUrlPlaceholder: "https://api.razorpay.com/v1",
    apiKeyLabel: "Key ID",
    apiKeyPlaceholder: "rzp_live_XXXXXXXXXXXX",
    extraFields: [
      { key: "key_secret", label: "Key Secret", placeholder: "Enter Razorpay Key Secret", type: "password", isExtra: true },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "Enter Razorpay Webhook Secret", type: "password", isExtra: true },
    ],
  },
];

interface ProviderState {
  enabled: boolean;
  api_url: string;
  api_key: string;
  extra_fields: Record<string, string>;
  api_key_masked: string | null;
  updated_at: string | null;
  updated_by: string | null;
  loaded: boolean;
}

const defaultState = (): ProviderState => ({
  enabled: true,
  api_url: "",
  api_key: "",
  extra_fields: {},
  api_key_masked: null,
  updated_at: null,
  updated_by: null,
  loaded: false,
});

interface TestResult {
  ok: boolean;
  message?: string;
  response?: any;
}

export default function ApiSettings() {
  const { isSuper: isSuperAdmin, loaded: permissionsLoaded } = usePermissions();
  const { toast } = useToast();

  const [states, setStates] = useState<Record<string, ProviderState>>(() =>
    Object.fromEntries(PROVIDERS.map(p => [p.id, defaultState()]))
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [sendingTest, setSendingTest] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult | null>>({});
  const [sendTestResults, setSendTestResults] = useState<Record<string, any>>({});
  const [testMsgInputs, setTestMsgInputs] = useState<Record<string, Record<string, string>>>({});
  const [testAllInputs, setTestAllInputs] = useState({ mobile: "", email: "" });
  const [testAllLoading, setTestAllLoading] = useState(false);
  const [testAllResults, setTestAllResults] = useState<Array<{ channel: string; ok: boolean; provider: string; httpStatus?: number; errorMessage?: string; responsePayload?: unknown }> | null>(null);
  const [fast2smsStatus, setFast2smsStatus] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loadingStatus, setLoadingStatus] = useState(false);

  async function loadFast2smsStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch(`${API}/api/api-settings/fast2sms/status`, { credentials: "include" });
      const data = await res.json();
      setFast2smsStatus(data);
    } catch (err: any) {
      setFast2smsStatus({ error: err.message });
    } finally {
      setLoadingStatus(false);
    }
  }
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ ok: boolean; message?: string; httpStatus?: number; responsePayload?: unknown } | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch(`${API}/api/api-settings`, { credentials: "include" })
      .then(r => r.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        setStates(prev => {
          const updated = { ...prev };
          for (const row of rows) {
            updated[row.provider] = {
              enabled: row.enabled,
              api_url: row.api_url || "",
              api_key: "",
              extra_fields: row.extra_fields || {},
              api_key_masked: row.api_key_masked,
              updated_at: row.updated_at,
              updated_by: row.updated_by,
              loaded: true,
            };
          }
          return updated;
        });
      })
      .catch(() => {});
  }, [isSuperAdmin]);

  if (!permissionsLoaded) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </AdminLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Shield className="w-12 h-12 text-gray-300" />
          <p className="text-lg font-semibold text-gray-500">Super Admin Access Required</p>
          <p className="text-sm text-gray-400">This page is restricted to Super Administrators only.</p>
        </div>
      </AdminLayout>
    );
  }

  function update(pid: string, partial: Partial<ProviderState>) {
    setStates(prev => ({ ...prev, [pid]: { ...prev[pid], ...partial } }));
  }

  function updateExtra(pid: string, key: string, val: string) {
    setStates(prev => ({
      ...prev,
      [pid]: { ...prev[pid], extra_fields: { ...prev[pid].extra_fields, [key]: val } },
    }));
  }

  async function save(pid: string) {
    setSaving(p => ({ ...p, [pid]: true }));
    try {
      const s = states[pid];

      // ── Firebase pre-save validation ────────────────────────────────────────
      if (pid === "firebase" && s.api_key && !s.api_key.startsWith("****")) {
        const errors: string[] = [];
        const pk = s.api_key.replace(/\\n/g, "\n").trim();

        if (!pk.startsWith("-----BEGIN PRIVATE KEY-----")) {
          errors.push(
            `Private Key must start with '-----BEGIN PRIVATE KEY-----'. ` +
            `Got: "${s.api_key.slice(0, 60)}..."`
          );
        } else if (!pk.endsWith("-----END PRIVATE KEY-----")) {
          errors.push("Private Key must end with '-----END PRIVATE KEY-----'");
        } else if (s.api_key.replace(/\s/g, "").length < 1000) {
          errors.push(
            `Private Key is too short (${s.api_key.length} chars). ` +
            `A valid RSA-2048 service account key is typically >1600 chars.`
          );
        }

        const pid2 = s.extra_fields["project_id"] || "";
        if (pid2 && (pid2.includes('"') || pid2.includes(","))) {
          errors.push("Project ID must not contain quotes or commas");
        }

        const email = s.extra_fields["client_email"] || "";
        if (email && !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email)) {
          errors.push(
            `Client Email must be a service-account address ending in .iam.gserviceaccount.com`
          );
        }

        if (errors.length > 0) {
          setValidationErrors(prev => ({ ...prev, firebase: errors.join(" · ") }));
          setSaving(p => ({ ...p, [pid]: false }));
          return;
        }
      }
      setValidationErrors(prev => ({ ...prev, [pid]: "" }));

      // Strip the transient service_account_json textarea from the save body —
      // it's cleared after parse and should never be persisted long-term
      const extraToSave =
        pid === "firebase"
          ? Object.fromEntries(
              Object.entries(s.extra_fields).filter(([k]) => k !== "service_account_json")
            )
          : s.extra_fields;

      const body: any = {
        enabled: s.enabled,
        api_url: s.api_url || null,
        extra_fields: extraToSave,
      };
      // Only include api_key if it was actually typed (non-empty, not a masked placeholder)
      if (s.api_key && !s.api_key.startsWith("****")) body.api_key = s.api_key;

      const res = await fetch(`${API}/api/api-settings/${pid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Save failed");
      toast({ title: "Saved", description: data.message });
      // Reload masked view
      fetch(`${API}/api/api-settings`, { credentials: "include" })
        .then(r => r.json())
        .then((rows: any[]) => {
          if (!Array.isArray(rows)) return;
          const row = rows.find(r => r.provider === pid);
          if (row) update(pid, {
            api_key: "",
            api_key_masked: row.api_key_masked,
            extra_fields: row.extra_fields || {},
            updated_at: row.updated_at,
            updated_by: row.updated_by,
          });
        }).catch(() => {});
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(p => ({ ...p, [pid]: false }));
    }
  }

  async function testConnection(pid: string) {
    setTesting(p => ({ ...p, [pid]: true }));
    setTestResults(p => ({ ...p, [pid]: null }));
    try {
      const res = await fetch(`${API}/api/api-settings/${pid}/test`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setTestResults(p => ({ ...p, [pid]: data }));
    } catch (err: any) {
      setTestResults(p => ({ ...p, [pid]: { ok: false, message: err.message } }));
    } finally {
      setTesting(p => ({ ...p, [pid]: false }));
    }
  }

  async function sendTestMessage(pid: string) {
    const inputs = testMsgInputs[pid] || {};
    setSendingTest(p => ({ ...p, [pid]: true }));
    setSendTestResults(p => ({ ...p, [pid]: null }));
    try {
      const res = await fetch(`${API}/api/api-settings/${pid}/send-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(inputs),
      });
      const data = await res.json();
      setSendTestResults(p => ({ ...p, [pid]: data }));
      if (pid !== "botbee") {
        if (data.ok) {
          toast({ title: "Test Message Sent", description: data.message || "Message delivered successfully" });
        } else {
          toast({ title: "Send Failed", description: data.message || data.errorMessage || "Test message failed", variant: "destructive" });
        }
      }
    } catch (err: any) {
      setSendTestResults(p => ({ ...p, [pid]: { ok: false, errorMessage: err.message } }));
      if (pid !== "botbee") toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingTest(p => ({ ...p, [pid]: false }));
    }
  }

  async function setLeminWebhook() {
    setSettingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await fetch(`${API}/api/api-settings/lemin/set-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: "https://alburhantravels.com/api/webhook/rcs" }),
      });
      const data = await res.json();
      setWebhookResult(data);
      toast({
        title: data.ok ? "Webhook Registered" : "Webhook Failed",
        description: data.ok ? "Lemin AI webhook URL registered for Jio RCS." : (data.message || "Registration failed"),
        variant: data.ok ? "default" : "destructive",
      });
    } catch (err: any) {
      setWebhookResult({ ok: false, message: err.message });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSettingWebhook(false);
    }
  }

  async function sendTestAll() {
    if (!testAllInputs.mobile) {
      toast({ title: "Mobile required", description: "Enter a mobile number to test.", variant: "destructive" });
      return;
    }
    setTestAllLoading(true);
    setTestAllResults(null);
    try {
      const res = await fetch(`${API}/api/api-settings/send-test-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mobile: testAllInputs.mobile, email: testAllInputs.email || undefined }),
      });
      const data = await res.json();
      setTestAllResults(data.channels ?? []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTestAllLoading(false);
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">API Settings</h1>
            <p className="text-sm text-gray-500">Manage provider credentials — stored encrypted in the database</p>
          </div>
        </div>

        {PROVIDERS.map(provider => {
          const Icon = provider.icon;
          const s = states[provider.id];
          const isOpen = expanded[provider.id];
          const testR = testResults[provider.id];
          const def = PROVIDERS.find(p => p.id === provider.id)!;

          return (
            <div key={provider.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Provider Header */}
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(p => ({ ...p, [provider.id]: !p[provider.id] }))}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${provider.color}`} />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{provider.label}</span>
                      {s.api_key_masked && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Configured</span>
                      )}
                      {!s.api_key_masked && s.loaded && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Not configured</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{provider.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Enable toggle */}
                  <button
                    onClick={e => { e.stopPropagation(); update(provider.id, { enabled: !s.enabled }); }}
                    className="flex items-center gap-1.5 text-xs font-medium"
                  >
                    {s.enabled
                      ? <ToggleRight className="w-5 h-5 text-green-500" />
                      : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                    <span className={s.enabled ? "text-green-600" : "text-gray-400"}>
                      {s.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </button>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {/* Expanded Content */}
              {isOpen && (
                <div className="border-t border-gray-100 p-4 space-y-4">
                  {/* BotBee WABA configuration warning */}
                  {provider.id === "botbee" && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="text-base shrink-0">⚠️</span>
                        <div>
                          <p className="text-xs font-bold text-amber-800">WhatsApp Template Sending — Action Required</p>
                          <p className="text-xs text-amber-700 mt-1">
                            Template messages (booking approval, payment receipt, etc.) are currently failing with <span className="font-mono font-semibold">"Message template not found"</span> from BotBee's API. Plain-text WhatsApp messages are working fine as a fallback.
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-amber-800 space-y-1 pl-6">
                        <p className="font-semibold">To fix this, ask BotBee support to:</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-amber-700">
                          <li>Confirm that templates (approve, bookingsubmitted, etc.) are linked to Phone Number ID <span className="font-mono font-bold">965912196611113</span></li>
                          <li>Re-sync or re-approve the templates under the current WABA (WhatsApp Business Account)</li>
                          <li>Verify the Meta access token in the templates has not expired</li>
                        </ol>
                        <p className="mt-1 text-amber-600 italic">Until fixed, plain-text WhatsApp messages are sent as fallback — customers receive notifications but without the formatted template design.</p>
                      </div>
                    </div>
                  )}

                  {/* Last updated info */}
                  {s.updated_at && (
                    <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                      Last updated {new Date(s.updated_at).toLocaleString("en-IN")} by {s.updated_by || "admin"}
                    </div>
                  )}

                  {/* API URL */}
                  {def.apiUrlLabel && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{def.apiUrlLabel}</label>
                      <input
                        type="url"
                        value={s.api_url}
                        onChange={e => update(provider.id, { api_url: e.target.value })}
                        placeholder={def.apiUrlPlaceholder}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>
                  )}

                  {/* API Key */}
                  {def.apiKeyLabel && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {def.apiKeyLabel}
                        {s.api_key_masked && (
                          <span className="ml-2 text-gray-400 font-normal font-mono">Current: {s.api_key_masked}</span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type={showKey[provider.id] ? "text" : "password"}
                          value={s.api_key}
                          onChange={e => update(provider.id, { api_key: e.target.value })}
                          placeholder={s.api_key_masked ? "Leave blank to keep current" : def.apiKeyPlaceholder}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(p => ({ ...p, [provider.id]: !p[provider.id] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showKey[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Extra Fields */}
                  {def.extraFields && def.extraFields.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {def.extraFields.map(field => (
                        <div
                          key={field.key}
                          className={field.colSpan === "full" ? "sm:col-span-2" : ""}
                        >
                          <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                          {field.type === "textarea" ? (
                            <textarea
                              rows={8}
                              value={s.extra_fields[field.key] || ""}
                              onChange={e => updateExtra(provider.id, field.key, e.target.value)}
                              placeholder={field.placeholder || ""}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono resize-y"
                              spellCheck={false}
                            />
                          ) : (
                            <div className="relative">
                              <input
                                type={field.type === "password" && !showKey[`${provider.id}_${field.key}`] ? "password" : (field.type || "text")}
                                value={s.extra_fields[field.key] || ""}
                                onChange={e => updateExtra(provider.id, field.key, e.target.value)}
                                placeholder={s.extra_fields[field.key]?.startsWith("****") ? "Leave blank to keep current" : (field.placeholder || "")}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                              />
                              {field.type === "password" && (
                                <button
                                  type="button"
                                  onClick={() => setShowKey(p => ({ ...p, [`${provider.id}_${field.key}`]: !p[`${provider.id}_${field.key}`] }))}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  {showKey[`${provider.id}_${field.key}`] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Firebase: Parse JSON button */}
                      {provider.id === "firebase" && (
                        <div className="sm:col-span-2 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              const raw = (s.extra_fields["service_account_json"] || "").trim();
                              if (!raw) {
                                toast({ title: "Paste service account JSON first", variant: "destructive" });
                                return;
                              }

                              // Step 1: parse the JSON — never use regex or line-matching
                              let parsed: any;
                              try {
                                parsed = JSON.parse(raw);
                              } catch {
                                toast({
                                  title: "JSON parse error",
                                  description: "Could not parse the pasted text as valid JSON. Paste the complete file contents from Firebase Console.",
                                  variant: "destructive",
                                });
                                return;
                              }

                              // Step 2: verify this is a Firebase service account JSON (not some other JSON)
                              if (parsed.type !== "service_account") {
                                toast({
                                  title: "Wrong JSON type",
                                  description: `Expected "type": "service_account". Got: "${parsed.type ?? "(missing)"}". Download the file from Firebase Console → Project Settings → Service Accounts → Generate new private key.`,
                                  variant: "destructive",
                                });
                                return;
                              }

                              // Step 3: extract exactly three fields by name (JSON.parse ensures correct types)
                              const projectId:   string = typeof parsed.project_id   === "string" ? parsed.project_id   : "";
                              const clientEmail: string = typeof parsed.client_email === "string" ? parsed.client_email : "";
                              const privateKey:  string = typeof parsed.private_key  === "string" ? parsed.private_key  : "";

                              // Step 3: validate each extracted value
                              if (!projectId) {
                                toast({ title: "Missing project_id", description: "The JSON has no project_id field.", variant: "destructive" });
                                return;
                              }
                              if (projectId.includes('"') || projectId.includes(",")) {
                                toast({ title: "Invalid project_id", description: `Must not contain quotes or commas. Got: "${projectId}"`, variant: "destructive" });
                                return;
                              }
                              if (!clientEmail) {
                                toast({ title: "Missing client_email", description: "The JSON has no client_email field.", variant: "destructive" });
                                return;
                              }
                              if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(clientEmail)) {
                                toast({ title: "Invalid client_email", description: `Must end in .iam.gserviceaccount.com. Got: "${clientEmail}"`, variant: "destructive" });
                                return;
                              }
                              if (!privateKey) {
                                toast({ title: "Missing private_key", description: "The JSON has no private_key field.", variant: "destructive" });
                                return;
                              }
                              // Normalise escaped newlines the same way the backend does
                              const normalizedKey = privateKey.replace(/\\n/g, "\n").trim();
                              if (!normalizedKey.startsWith("-----BEGIN PRIVATE KEY-----")) {
                                toast({
                                  title: "Invalid private_key",
                                  description: `Must start with '-----BEGIN PRIVATE KEY-----'. Got: "${normalizedKey.slice(0, 60)}"`,
                                  variant: "destructive",
                                });
                                return;
                              }
                              if (!normalizedKey.endsWith("-----END PRIVATE KEY-----")) {
                                toast({
                                  title: "Invalid private_key",
                                  description: "Must end with '-----END PRIVATE KEY-----'.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              if (privateKey.replace(/\s/g, "").length < 1000) {
                                toast({
                                  title: "private_key too short",
                                  description: `Got ${privateKey.length} chars. A valid RSA-2048 key is typically >1600 chars. Check you pasted the full JSON file.`,
                                  variant: "destructive",
                                });
                                return;
                              }

                              // Step 4: commit to state — only the three validated fields, nothing else
                              setStates(prev => ({
                                ...prev,
                                firebase: {
                                  ...prev["firebase"],
                                  api_key: privateKey,          // private_key (PEM string with \n sequences)
                                  extra_fields: {
                                    ...prev["firebase"].extra_fields,
                                    project_id:           projectId,
                                    client_email:         clientEmail,
                                    service_account_json: "",   // clear textarea after successful parse
                                  },
                                },
                              }));
                              setValidationErrors(prev => ({ ...prev, firebase: "" }));
                              toast({
                                title: "✅ Parsed successfully",
                                description: `Project: ${projectId} · ${clientEmail}`,
                              });
                            }}
                            className="flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            Parse JSON → Fill Fields
                          </button>
                          <p className="text-[10px] text-gray-400">
                            Uses <code className="bg-gray-100 px-1 rounded">JSON.parse()</code> to extract exactly <code className="bg-gray-100 px-1 rounded">project_id</code>, <code className="bg-gray-100 px-1 rounded">client_email</code>, and <code className="bg-gray-100 px-1 rounded">private_key</code>.
                            Validates PEM markers and key length before filling. The textarea is cleared after a successful parse.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Firebase: FCM v1 info banner */}
                  {provider.id === "firebase" && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 space-y-1.5">
                      <p className="font-semibold flex items-center gap-1.5">🔐 Firebase Admin SDK (service account) authentication</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-blue-700">
                        <li>No legacy Server Key required — FCM v1 uses OAuth2 with a service account</li>
                        <li>Get your JSON from <span className="font-mono font-semibold">Firebase Console → Project Settings → Service Accounts → Generate new private key</span></li>
                        <li>Alternatively, set environment variables: <span className="font-mono">FIREBASE_PROJECT_ID</span>, <span className="font-mono">FIREBASE_CLIENT_EMAIL</span>, <span className="font-mono">FIREBASE_PRIVATE_KEY</span></li>
                        <li>After saving, click <strong>Test Connection</strong> to validate credentials against Google OAuth2</li>
                        <li>Supports <strong>Android</strong> (high-priority), <strong>iOS / APNs</strong>, and <strong>Web Push</strong> in a single message</li>
                      </ul>
                    </div>
                  )}

                  {/* Firebase validation error banner */}
                  {validationErrors[provider.id] && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                      <span className="shrink-0 font-bold mt-0.5">✕</span>
                      <span>{validationErrors[provider.id]}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                    {/* Save */}
                    <button
                      onClick={() => save(provider.id)}
                      disabled={saving[provider.id] || !!validationErrors[provider.id]}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving[provider.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save
                    </button>

                    {/* Test Connection */}
                    <button
                      onClick={() => testConnection(provider.id)}
                      disabled={testing[provider.id]}
                      className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {testing[provider.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Test Connection
                    </button>

                    {/* Test Result Badge */}
                    {testR && (
                      <span className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg ${testR.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {testR.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {testR.message || (testR.ok ? "Connected" : "Failed")}
                      </span>
                    )}

                    {/* Fast2SMS — Show Current Status button */}
                    {provider.id === "fast2sms" && (
                      <button
                        onClick={loadFast2smsStatus}
                        disabled={loadingStatus}
                        className="flex items-center gap-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loadingStatus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        Show Current Status
                      </button>
                    )}

                    {/* Lemin — Set Webhook button */}
                    {provider.id === "lemin" && (
                      <>
                        <button
                          onClick={setLeminWebhook}
                          disabled={settingWebhook}
                          className="flex items-center gap-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {settingWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          Set Webhook
                        </button>
                        {webhookResult && (
                          <span className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg ${webhookResult.ok ? "bg-purple-100 text-purple-700" : "bg-red-100 text-red-700"}`}>
                            {webhookResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {webhookResult.ok ? "Webhook registered" : (webhookResult.message || "Failed")}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Fast2SMS — Current Status Panel */}
                  {provider.id === "fast2sms" && fast2smsStatus && (
                    <div className="rounded-lg p-3 space-y-1.5 bg-blue-50 border border-blue-100 text-xs">
                      {fast2smsStatus.error ? (
                        <p className="text-red-600 font-medium">{fast2smsStatus.error}</p>
                      ) : (
                        <>
                          <div className="flex justify-between"><span className="text-gray-500">API Key Loaded</span><span className={`font-semibold ${fast2smsStatus.apiKeyLoaded ? "text-green-700" : "text-red-600"}`}>{fast2smsStatus.apiKeyLoaded ? `Yes (${fast2smsStatus.apiKeyMasked})` : "No"}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Sender ID</span><span className="font-semibold text-gray-700">{fast2smsStatus.senderId}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">OTP Template ID</span><span className="font-semibold text-gray-700">{fast2smsStatus.otpTemplateId}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Wallet Balance</span><span className="font-semibold text-gray-700">{fast2smsStatus.walletBalance != null ? `₹${fast2smsStatus.walletBalance}` : (fast2smsStatus.walletError || "—")}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Last Test</span><span className="font-semibold text-gray-700">{fast2smsStatus.lastTestTime ? new Date(fast2smsStatus.lastTestTime).toLocaleString() : "Never"} ({fast2smsStatus.lastTestStatus})</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Last OTP SMS</span><span className="font-semibold text-gray-700">{fast2smsStatus.lastSmsAt ? new Date(fast2smsStatus.lastSmsAt).toLocaleString() : "Never"} — {fast2smsStatus.lastSmsStatus || "—"}</span></div>
                          <div className="flex justify-between pt-1 border-t border-blue-100"><span className="text-gray-500">OTP Sending</span><span className={`font-semibold ${fast2smsStatus.otpSendingEnabled ? "text-green-700" : "text-red-600"}`}>{fast2smsStatus.otpSendingEnabled ? "Enabled" : "Disabled"}</span></div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Test Message Section */}
                  {def.testMessageFields && def.testMessageFields.length > 0 && (
                    <div className={`rounded-lg p-3 space-y-2 ${provider.id === "botbee" ? "bg-green-50 border border-green-100" : "bg-gray-50"}`}>
                      <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5" />
                        {provider.id === "botbee" ? "Test WhatsApp" : "Send Test Message"}
                      </p>
                      {provider.id === "botbee" && (
                        <p className="text-xs text-gray-500">
                          Sends: <span className="font-medium text-gray-700">"✅ WhatsApp Integration Successful. Al Burhan Tours & Travels Notification System is Connected."</span>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 items-end">
                        {def.testMessageFields.map(field => (
                          <div key={field.key} className="flex-1 min-w-[160px]">
                            <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                            <input
                              type={field.type || "text"}
                              value={(testMsgInputs[provider.id] || {})[field.key] || ""}
                              onChange={e => setTestMsgInputs(p => ({
                                ...p,
                                [provider.id]: { ...(p[provider.id] || {}), [field.key]: e.target.value },
                              }))}
                              placeholder={field.placeholder}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            />
                          </div>
                        ))}
                        <button
                          onClick={() => sendTestMessage(provider.id)}
                          disabled={sendingTest[provider.id]}
                          className={`flex items-center gap-1.5 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0 ${provider.id === "botbee" ? "bg-[#25D366] hover:bg-[#1ebe5d]" : "bg-green-600 hover:bg-green-700"}`}
                        >
                          {sendingTest[provider.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          {provider.id === "botbee" ? "Send Test WhatsApp" : "Send"}
                        </button>
                      </div>

                      {/* Fast2SMS rich result panel */}
                      {provider.id === "fast2sms" && sendTestResults["fast2sms"] && (() => {
                        const r = sendTestResults["fast2sms"];
                        return (
                          <div className={`mt-3 rounded-lg border-2 overflow-hidden ${r.ok ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
                            <div className="flex items-center gap-3 px-3 py-2 border-b border-inherit">
                              <span className="text-base">{r.ok ? "✅" : "❌"}</span>
                              <div className="flex-1">
                                <span className={`font-bold text-sm ${r.ok ? "text-blue-800" : "text-red-800"}`}>
                                  {r.ok ? "SMS Delivered" : "Delivery Failed"}
                                </span>
                                {r.httpStatus && (
                                  <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded ${r.httpStatus < 300 ? "bg-blue-200 text-blue-800" : "bg-red-200 text-red-800"}`}>
                                    HTTP {r.httpStatus}
                                  </span>
                                )}
                              </div>
                              {r.logged && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">📋 Logged</span>}
                            </div>
                            {(r.messageId || r.requestPayload?.template_id) && (
                              <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit bg-white/60">
                                {r.messageId && <><span className="text-xs font-semibold text-gray-500 shrink-0">Request ID:</span><code className="text-xs font-mono text-blue-700 font-bold">{r.messageId}</code></>}
                                {r.requestPayload?.template_id && <><span className="text-xs font-semibold text-gray-500 shrink-0 ml-4">Template ID:</span><code className="text-xs font-mono text-gray-700">{r.requestPayload.template_id}</code></>}
                              </div>
                            )}
                            {r.errorMessage && (
                              <div className="px-3 py-2 border-b border-inherit bg-white/60">
                                <span className="text-xs font-semibold text-red-600">Error: </span>
                                <span className="text-xs text-red-700">{r.errorMessage}</span>
                              </div>
                            )}
                            <div className="px-3 py-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">API Response</p>
                              <pre className="bg-gray-900 text-blue-300 text-[10px] font-mono rounded-lg p-2.5 overflow-auto max-h-36 whitespace-pre-wrap break-all">
                                {JSON.stringify(r.responsePayload ?? r, null, 2)}
                              </pre>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Lemin RCS rich result panel */}
                      {provider.id === "lemin" && sendTestResults["lemin"] && (() => {
                        const r = sendTestResults["lemin"];
                        return (
                          <div className={`mt-3 rounded-lg border-2 overflow-hidden ${r.ok ? "border-purple-200 bg-purple-50" : "border-red-200 bg-red-50"}`}>
                            <div className="flex items-center gap-3 px-3 py-2 border-b border-inherit">
                              <span className="text-base">{r.ok ? "✅" : "❌"}</span>
                              <div className="flex-1">
                                <span className={`font-bold text-sm ${r.ok ? "text-purple-800" : "text-red-800"}`}>
                                  {r.ok ? "RCS Delivered" : "Delivery Failed"}
                                </span>
                                {r.httpStatus && (
                                  <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded ${r.httpStatus < 300 ? "bg-purple-200 text-purple-800" : "bg-red-200 text-red-800"}`}>
                                    HTTP {r.httpStatus}
                                  </span>
                                )}
                              </div>
                              {r.logged && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">📋 Logged</span>}
                            </div>
                            {r.messageId && (
                              <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit bg-white/60">
                                <span className="text-xs font-semibold text-gray-500 shrink-0">Message ID:</span>
                                <code className="text-xs font-mono text-purple-700 font-bold break-all">{r.messageId}</code>
                              </div>
                            )}
                            {r.errorMessage && (
                              <div className="px-3 py-2 border-b border-inherit bg-white/60">
                                <span className="text-xs font-semibold text-red-600">Error: </span>
                                <span className="text-xs text-red-700">{r.errorMessage}</span>
                              </div>
                            )}
                            <div className="px-3 py-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">API Response</p>
                              <pre className="bg-gray-900 text-purple-300 text-[10px] font-mono rounded-lg p-2.5 overflow-auto max-h-36 whitespace-pre-wrap break-all">
                                {JSON.stringify(r.responsePayload ?? r, null, 2)}
                              </pre>
                            </div>
                          </div>
                        );
                      })()}

                      {/* BotBee rich result panel */}
                      {provider.id === "botbee" && sendTestResults["botbee"] && (() => {
                        const r = sendTestResults["botbee"];
                        return (
                          <div className={`mt-3 rounded-lg border-2 overflow-hidden ${r.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                            {/* Status row */}
                            <div className="flex items-center gap-3 px-3 py-2 border-b border-inherit">
                              <span className="text-base">{r.ok ? "✅" : "❌"}</span>
                              <div className="flex-1">
                                <span className={`font-bold text-sm ${r.ok ? "text-green-800" : "text-red-800"}`}>
                                  {r.ok ? "Delivered" : "Failed"}
                                </span>
                                {r.httpStatus && (
                                  <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded ${r.httpStatus < 300 ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
                                    HTTP {r.httpStatus}
                                  </span>
                                )}
                              </div>
                              {r.logged && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">📋 Logged</span>
                              )}
                            </div>
                            {/* Message ID */}
                            {r.messageId && (
                              <div className="flex items-center gap-2 px-3 py-2 border-b border-inherit bg-white/60">
                                <span className="text-xs font-semibold text-gray-500 shrink-0">Message ID:</span>
                                <code className="text-xs font-mono text-green-700 font-bold break-all">{r.messageId}</code>
                              </div>
                            )}
                            {/* Error message */}
                            {r.errorMessage && (
                              <div className="px-3 py-2 border-b border-inherit bg-white/60">
                                <span className="text-xs font-semibold text-red-600">Error: </span>
                                <span className="text-xs text-red-700">{r.errorMessage}</span>
                              </div>
                            )}
                            {/* API Response */}
                            <div className="px-3 py-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">API Response</p>
                              <pre className="bg-gray-900 text-green-300 text-[10px] font-mono rounded-lg p-2.5 overflow-auto max-h-36 whitespace-pre-wrap break-all">
                                {JSON.stringify(r.responsePayload ?? r, null, 2)}
                              </pre>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Test All Channels ──────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Send className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-sm">Send Test Notification — All Channels</p>
              <p className="text-xs text-gray-500">Fire WhatsApp + SMS + RCS + Email simultaneously. Results appear below in real time.</p>
            </div>
            <a href="/admin/notification-logs" className="text-xs text-indigo-600 hover:underline font-medium">View Delivery Logs →</a>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Mobile Number <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={testAllInputs.mobile}
                  onChange={e => setTestAllInputs(p => ({ ...p, mobile: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Email Address <span className="text-gray-400 font-normal">(optional, for email test)</span></label>
                <input
                  type="email"
                  placeholder="test@example.com"
                  value={testAllInputs.email}
                  onChange={e => setTestAllInputs(p => ({ ...p, email: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
            <button
              onClick={sendTestAll}
              disabled={testAllLoading || !testAllInputs.mobile}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {testAllLoading ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Sending to all channels…</>
              ) : (
                <><Send className="w-4 h-4" /> Send Test to All Channels</>
              )}
            </button>

            {/* Real-time per-channel results */}
            {testAllResults && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                {testAllResults.map(r => {
                  const chMeta: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
                    whatsapp: { icon: "💬", label: "WhatsApp", color: "text-green-800", bg: "bg-green-50",   border: "border-green-200" },
                    sms:      { icon: "📱", label: "SMS",      color: "text-blue-800",  bg: "bg-blue-50",    border: "border-blue-200" },
                    rcs:      { icon: "📡", label: "RCS",      color: "text-purple-800",bg: "bg-purple-50",  border: "border-purple-200" },
                    email:    { icon: "✉️",  label: "Email",    color: "text-orange-800",bg: "bg-orange-50",  border: "border-orange-200" },
                  };
                  const m = chMeta[r.channel] || { icon: "🔔", label: r.channel, color: "text-gray-800", bg: "bg-gray-50", border: "border-gray-200" };
                  return (
                    <div key={r.channel} className={`rounded-lg border-2 p-2.5 ${r.ok ? m.bg + " " + m.border : "bg-red-50 border-red-200"}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-base">{r.ok ? "✅" : "❌"}</span>
                        <span className={`text-xs font-bold ${r.ok ? m.color : "text-red-700"}`}>{m.label}</span>
                      </div>
                      <div className="text-xs text-gray-500">{r.provider}</div>
                      {r.httpStatus && (
                        <span className={`text-[10px] font-bold px-1 rounded ${r.httpStatus < 300 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          HTTP {r.httpStatus}
                        </span>
                      )}
                      {!r.ok && r.errorMessage && (
                        <p className="text-[10px] text-red-600 mt-0.5 truncate" title={r.errorMessage}>{r.errorMessage}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Security Note */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
          <Shield className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
          <div>
            <span className="font-semibold">Encrypted storage:</span> All API keys and secrets are encrypted using AES-256-GCM before being stored in the database. Keys are never logged or exposed in full — only the last 4 characters are shown. Changes take effect immediately without a server restart.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
