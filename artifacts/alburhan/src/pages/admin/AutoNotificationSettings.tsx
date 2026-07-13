import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plane, FileText, Bell, BellRing, CheckCircle2, XCircle, RefreshCcw,
  Send, Clock, Wifi, MessageSquare, Mail, Radio, AlertTriangle,
  Play, RotateCcw, IndianRupee, FlaskConical
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const SCHEDULE_SLOTS = [
  { slot: "7 Days Before",   icon: "📅", color: "text-blue-600",  bg: "bg-blue-50" },
  { slot: "3 Days Before",   icon: "📅", color: "text-indigo-600",bg: "bg-indigo-50" },
  { slot: "2 Days Before",   icon: "⏰", color: "text-purple-600",bg: "bg-purple-50" },
  { slot: "1 Day Before",    icon: "⏰", color: "text-orange-600",bg: "bg-orange-50" },
  { slot: "12 Hours Before", icon: "🔔", color: "text-amber-600", bg: "bg-amber-50" },
  { slot: "6 Hours Before",  icon: "🔔", color: "text-red-600",   bg: "bg-red-50" },
  { slot: "3 Hours Before",  icon: "🚨", color: "text-rose-600",  bg: "bg-rose-50" },
];

const CHANNELS = [
  { key: "whatsapp_enabled", label: "WhatsApp", icon: MessageSquare, color: "text-green-600", bg: "bg-green-50" },
  { key: "sms_enabled",      label: "SMS (DLT)", icon: Send,          color: "text-blue-600",  bg: "bg-blue-50" },
  { key: "email_enabled",    label: "Email",     icon: Mail,          color: "text-purple-600",bg: "bg-purple-50" },
  { key: "rcs_enabled",      label: "RCS",       icon: Radio,         color: "text-cyan-600",  bg: "bg-cyan-50" },
];

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${checked ? "bg-sky-500" : "bg-gray-200"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export default function AutoNotificationSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [runningFlight, setRunningFlight] = useState(false);
  const [retryingDocs, setRetryingDocs] = useState(false);
  const [testMobile, setTestMobile] = useState("");
  const [testChannel, setTestChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [testingNotif, setTestingNotif] = useState(false);

  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/auto-notifications/auto-settings"],
    queryFn: () => fetch(`${API}/api/auto-notifications/auto-settings`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: flightStats } = useQuery<any>({
    queryKey: ["/api/auto-notifications/flight-reminder/stats"],
    queryFn: () => fetch(`${API}/api/auto-notifications/flight-reminder/stats`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60000,
  });

  const { data: docStats } = useQuery<any>({
    queryKey: ["/api/auto-notifications/document-notify/stats"],
    queryFn: () => fetch(`${API}/api/auto-notifications/document-notify/stats`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60000,
  });

  const updateSetting = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      fetch(`${API}/api/auto-notifications/auto-settings`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/auto-notifications/auto-settings"] }),
    onError: () => toast({ title: "Error", description: "Failed to save setting", variant: "destructive" }),
  });

  function getSetting(key: string, defaultValue = "true"): boolean {
    const v = settings[key];
    if (v === undefined) return defaultValue === "true";
    return v === "true";
  }

  function toggle(key: string) {
    const current = getSetting(key);
    updateSetting.mutate({ key, value: current ? "false" : "true" });
  }

  async function runFlightRemindersNow() {
    setRunningFlight(true);
    try {
      const r = await fetch(`${API}/api/auto-notifications/flight-reminder/run-now`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json();
      toast({
        title: d.processed > 0 ? `✅ Sent to ${d.processed} pilgrim(s)` : "No departures in window",
        description: d.message || "Check notification logs for results.",
      });
      qc.invalidateQueries({ queryKey: ["/api/auto-notifications/flight-reminder/stats"] });
    } catch {
      toast({ title: "Error", description: "Failed to trigger", variant: "destructive" });
    }
    setRunningFlight(false);
  }

  async function sendTestNotification() {
    if (!testMobile.trim()) {
      toast({ title: "Mobile required", description: "Enter a mobile number to send a test notification.", variant: "destructive" });
      return;
    }
    setTestingNotif(true);
    try {
      const r = await fetch(`${API}/api/auto-notifications/test-notification`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: testMobile.trim(), channel: testChannel }),
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: "✅ Test Sent", description: d.message || `Test ${testChannel} sent successfully.` });
      } else {
        toast({ title: "Test Failed", description: d.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Test notification failed", variant: "destructive" });
    }
    setTestingNotif(false);
  }

  async function retryFailedDocs() {
    setRetryingDocs(true);
    try {
      const r = await fetch(`${API}/api/auto-notifications/document-notify/retry-failed`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json();
      toast({ title: "Retry Initiated", description: d.message || `Retrying ${d.retrying || 0} document(s)` });
      qc.invalidateQueries({ queryKey: ["/api/auto-notifications/document-notify/stats"] });
    } catch {
      toast({ title: "Error", description: "Retry failed", variant: "destructive" });
    }
    setRetryingDocs(false);
  }

  const flightEnabled = getSetting("flight_reminders_enabled");
  const docNotifyEnabled = getSetting("doc_notifications_enabled");
  const paymentReminderEnabled = getSetting("payment_reminder_enabled");

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
            <BellRing className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Auto Notification Settings</h1>
            <p className="text-sm text-muted-foreground">Flight reminders, document alerts &amp; channel configuration</p>
          </div>
        </div>

        {/* Channel Toggles */}
        <Card className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Notification Channels</span>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {CHANNELS.map(ch => {
              const Icon = ch.icon;
              const enabled = getSetting(ch.key);
              return (
                <div key={ch.key} className={`rounded-xl border p-3 flex flex-col items-center gap-2 ${enabled ? "border-green-200 bg-green-50/50" : "border-gray-200 bg-gray-50/50"}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${ch.bg}`}>
                    <Icon className={`w-4 h-4 ${ch.color}`} />
                  </div>
                  <p className="text-xs font-semibold text-foreground">{ch.label}</p>
                  <ToggleSwitch checked={enabled} onChange={() => toggle(ch.key)} />
                  <p className={`text-[10px] font-semibold ${enabled ? "text-green-600" : "text-gray-400"}`}>
                    {enabled ? "Active" : "Disabled"}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── PAYMENT REMINDER SECTION ─────────────────────────────────── */}
        <Card className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="px-5 py-3 border-b bg-amber-50/50 flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-sm text-amber-900">Payment Reminder Automation</span>
            </div>
            <ToggleSwitch checked={paymentReminderEnabled} onChange={() => toggle("payment_reminder_enabled")} />
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-muted-foreground">
              Automatically reminds customers of pending balance payments before the due date.
              Runs daily at 08:30 IST.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {["30 Days", "15 Days", "7 Days", "3 Days", "1 Day"].map((d, i) => (
                <div key={i} className={`rounded-lg border p-2 text-center ${paymentReminderEnabled ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                  <p className={`text-[10px] font-bold ${paymentReminderEnabled ? "text-amber-700" : "text-gray-400"}`}>{d} Before</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* ── FLIGHT REMINDER SECTION ──────────────────────────────────── */}
        <Card className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="px-5 py-3 border-b bg-sky-50/50 flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Plane className="w-4 h-4 text-sky-600" />
              <span className="font-semibold text-sm text-sky-900">Flight Reminder Automation</span>
            </div>
            <ToggleSwitch checked={flightEnabled} onChange={() => toggle("flight_reminders_enabled")} />
          </div>

          <div className="p-5 space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-center">
                <p className="text-2xl font-bold text-sky-900 font-mono">{flightStats?.total ?? "–"}</p>
                <p className="text-[10px] text-sky-600 font-semibold uppercase mt-0.5">Total Sent</p>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-900 font-mono">{flightStats?.upcomingFlights?.length ?? "–"}</p>
                <p className="text-[10px] text-emerald-600 font-semibold uppercase mt-0.5">Upcoming Flights</p>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-xs font-bold text-amber-900 font-mono leading-tight">
                  {flightStats?.lastSent ? new Date(flightStats.lastSent).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never"}
                </p>
                <p className="text-[10px] text-amber-600 font-semibold uppercase mt-0.5">Last Sent</p>
              </div>
            </div>

            {/* Reminder schedule */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Reminder Schedule</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SCHEDULE_SLOTS.map((s, i) => (
                  <div key={i} className={`rounded-lg border p-2 text-center ${s.bg}`}>
                    <p className="text-base">{s.icon}</p>
                    <p className={`text-[10px] font-bold ${s.color} mt-0.5`}>{s.slot}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Message template preview */}
            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4">
              <p className="text-[10px] font-bold text-sky-700 uppercase tracking-wide mb-2">Message Template Preview</p>
              <pre className="text-[11px] text-sky-900 whitespace-pre-wrap font-sans leading-relaxed">
{`Assalamu Alaikum {Customer Name},

This is a reminder that your Hajj/Umrah flight is scheduled on {Flight Date}.

Flight Number: {Flight Number}
Departure: {Departure Airport}
Arrival: {Arrival Airport}
Reporting Time: {Reporting Time}
Terminal: {Terminal}

Please report at the airport at least 4 hours before departure.

May Allah accept your journey.

Al Burhan Tours & Travels
+91 9893225590`}
              </pre>
            </div>

            {/* Upcoming departures */}
            {flightStats?.upcomingFlights?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Upcoming Departures (next 14 days)</p>
                <div className="space-y-2">
                  {flightStats.upcomingFlights.map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                      <Plane className="w-4 h-4 text-sky-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {f.flight_number || "N/A"} — {f.departure_airport || "?"} → {f.arrival_airport || "?"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {f.departure_date ? new Date(f.departure_date).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Unknown date"} · {f.pilgrim_count} pilgrim(s)
                        </p>
                      </div>
                      <span className="text-[9px] font-bold bg-sky-100 text-sky-700 rounded-full px-2 py-0.5 shrink-0">UPCOMING</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Run Now button */}
            <Button
              onClick={runFlightRemindersNow}
              disabled={runningFlight || !flightEnabled}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white gap-2"
            >
              {runningFlight ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {runningFlight ? "Running…" : "Run Flight Reminders Now"}
            </Button>

            {/* Recent logs */}
            {flightStats?.recentLogs?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Recent Activity</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {flightStats.recentLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border text-xs">
                      {log.status === "sent" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      <span className="font-medium truncate flex-1">{log.customer_name || log.recipient}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0">{log.channel?.toUpperCase()}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0">
                        {log.created_at ? new Date(log.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── DOCUMENT NOTIFICATION SECTION ─────────────────────────────── */}
        <Card className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="px-5 py-3 border-b bg-emerald-50/50 flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold text-sm text-emerald-900">Document Upload Notifications</span>
            </div>
            <ToggleSwitch checked={docNotifyEnabled} onChange={() => toggle("doc_notifications_enabled")} />
          </div>

          <div className="p-5 space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-900 font-mono">{docStats?.totalSent ?? "–"}</p>
                <p className="text-[10px] text-emerald-600 font-semibold uppercase mt-0.5">Notifications Sent</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center">
                <p className="text-2xl font-bold text-red-900 font-mono">{docStats?.failedCount ?? "–"}</p>
                <p className="text-[10px] text-red-600 font-semibold uppercase mt-0.5">Pending / Failed</p>
              </div>
            </div>

            {/* Supported document types */}
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Supported Document Types</p>
              <div className="flex flex-wrap gap-1.5">
                {["Flight Ticket", "Visa", "Hotel Voucher", "Tax Invoice", "Payment Receipt", "Tour Itinerary",
                  "Room Allotment", "Bus Allotment", "Insurance", "Hajj ID Card", "Passport Copy",
                  "Vaccination Certificate", "Ziyarat Schedule", "Emergency Contact Card", "Luggage Tag",
                  "Travel Contract", "Any PDF / Image"].map(t => (
                  <span key={t} className="text-[10px] bg-emerald-100 text-emerald-700 font-medium rounded-full px-2.5 py-0.5 border border-emerald-200">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* What happens on upload */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-1.5">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-2">What happens on every upload</p>
              {[
                "✓ Document saved to secure storage",
                "✓ Instantly visible in Customer Dashboard",
                "✓ WhatsApp notification sent (PDF/image attached)",
                "✓ SMS notification sent via DLT",
                "✓ Email notification sent with attachment",
                "✓ Notification log recorded",
                "✓ Document marked as Delivered",
              ].map((line, i) => (
                <p key={i} className="text-xs text-emerald-800">{line}</p>
              ))}
            </div>

            {/* Message template */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-2">Message Template Preview</p>
              <pre className="text-[11px] text-emerald-900 whitespace-pre-wrap font-sans leading-relaxed">
{`Assalamu Alaikum {Customer Name},

Your {Document Name} has been uploaded successfully.

Booking ID: {Booking ID}
Package: {Package Name}

Please log in to your Al Burhan Tours & Travels Dashboard
to download or view your document.

Dashboard:
https://alburhantravels.com/dashboard

For assistance:
+91 9893225590

JazakAllah Khair.
Al Burhan Tours & Travels`}
              </pre>
            </div>

            {/* Retry failed */}
            {(docStats?.failedCount ?? 0) > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800">{docStats.failedCount} document(s) not notified</p>
                  <p className="text-[10px] text-amber-600">These were uploaded but notification may have failed</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-100 gap-1.5 shrink-0"
                  onClick={retryFailedDocs}
                  disabled={retryingDocs}
                >
                  {retryingDocs ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Retry
                </Button>
              </div>
            )}

            {/* Recent logs */}
            {docStats?.recentLogs?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Recent Activity</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {docStats.recentLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border text-xs">
                      {log.status === "sent" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      <span className="font-medium truncate flex-1">{log.customer_name || log.recipient}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0">{log.channel?.toUpperCase()}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0">
                        {log.created_at ? new Date(log.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ── TEST NOTIFICATION SECTION ─────────────────────────────────── */}
        <Card className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="px-5 py-3 border-b bg-violet-50/50 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-600" />
            <span className="font-semibold text-sm text-violet-900">Test Notification</span>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs text-muted-foreground">
              Send a test notification to any mobile number to verify the notification system is working.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTestChannel("whatsapp")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${testChannel === "whatsapp" ? "bg-green-600 text-white border-green-600" : "bg-white text-muted-foreground border-gray-200 hover:bg-green-50"}`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setTestChannel("sms")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${testChannel === "sms" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-muted-foreground border-gray-200 hover:bg-blue-50"}`}
              >
                <Send className="w-3.5 h-3.5" /> SMS
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Mobile number (e.g. 9893225590)"
                value={testMobile}
                onChange={e => setTestMobile(e.target.value)}
                className="flex-1 text-sm"
                maxLength={15}
              />
              <Button
                onClick={sendTestNotification}
                disabled={testingNotif || !testMobile.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 shrink-0"
              >
                {testingNotif ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {testingNotif ? "Sending…" : "Send Test"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Cron info */}
        <div className="flex items-start gap-3 p-4 rounded-xl border bg-muted/20">
          <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Automatic Schedule</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Flight reminders run every hour, checking for departures in 7d/3d/2d/1d/12h/6h/3h windows.
              Failed notifications are automatically retried every 10 seconds (max 3 attempts).
              Document notifications fire immediately on upload.
            </p>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
