import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell, Play, RefreshCw, CheckCircle, XCircle,
  CalendarClock, Users, Clock, IndianRupee, Send, Loader2, AlarmCheck, History,
  TrendingDown, AlertTriangle, Activity
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function fmt(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function relDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none ${checked ? "bg-emerald-500" : "bg-gray-300"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-8" : "translate-x-1"}`} />
    </button>
  );
}

interface ReminderLog {
  id: string;
  booking_id: string;
  booking_number: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  balance: number;
  channel: string;
  status: string;
  triggered_by: string;
  notes: string | null;
  sent_at: string;
}

interface UpcomingDueDate {
  id: string;
  booking_number: string;
  customer_name: string;
  customer_mobile: string;
  due_date: string;
  balance: number;
}

interface Stats {
  enabled: boolean;
  total: number;
  totalFailed: number;
  successRate: number;
  lastSent: string | null;
  lastActivity: string | null;
  eligibleCount: number;
  todayCount: number;
  overdueAmount: number;
  recentLogs: ReminderLog[];
  upcomingDueDates: UpcomingDueDate[];
  schedule: Array<{ label: string; key: string }>;
}

const SCHEDULE = [
  { label: "7 days before due date",  key: "7d",   color: "bg-blue-100 text-blue-700"   },
  { label: "3 days before due date",  key: "3d",   color: "bg-yellow-100 text-yellow-700" },
  { label: "1 day before due date",   key: "1d",   color: "bg-orange-100 text-orange-700" },
  { label: "On due date",             key: "due",  color: "bg-red-100 text-red-700"     },
  { label: "Every 3 days after due",  key: "post", color: "bg-rose-100 text-rose-700"   },
];

function nextReminderLabel(dueDate: string): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const todayIST = new Date(now.getTime() + istOffset);
  const dueDateIST = new Date(new Date(dueDate).getTime() + istOffset);

  const todayMid = Date.UTC(todayIST.getUTCFullYear(), todayIST.getUTCMonth(), todayIST.getUTCDate());
  const dueMid   = Date.UTC(dueDateIST.getUTCFullYear(), dueDateIST.getUTCMonth(), dueDateIST.getUTCDate());
  const diff     = Math.round((dueMid - todayMid) / 86400000);

  if (diff === 7) return "7d reminder TODAY";
  if (diff === 6) return "7d reminder in 1 day";
  if (diff > 3)  return `${diff - 7 < 0 ? 0 : diff}d → next slot in ${diff > 7 ? diff - 7 : diff - 3}d`;
  if (diff === 3) return "3d reminder TODAY";
  if (diff === 2) return "3d reminder in 1 day";
  if (diff === 1) return "1d reminder TODAY";
  if (diff === 0) return "Due-date reminder TODAY";
  if (diff < 0)  return `Overdue — next post-due: ${(-diff) % 3 === 0 ? "TODAY" : `in ${3 - ((-diff) % 3)}d`}`;
  return `Due in ${diff} days`;
}

export default function PaymentReminderSettings() {
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/payments/reminders/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      const data = await res.json() as Stats;
      setStats(data);
    } catch (err) {
      toast({ title: "Error", description: "Failed to load reminder stats", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      const res = await fetch(`${API}/api/payments/reminders/${enabled ? "enable" : "disable"}`, {
        method: "POST", credentials: "include",
      });
      if (!res.ok) throw new Error("Toggle failed");
      setStats(s => s ? { ...s, enabled } : null);
      toast({ title: enabled ? "Reminders Enabled" : "Reminders Disabled", description: enabled ? "Payment reminders will run daily at 9 AM IST" : "Automatic reminders are paused" });
    } catch {
      toast({ title: "Error", description: "Failed to toggle reminders", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${API}/api/payments/reminders/run-now`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Run failed");
      toast({ title: "Reminders Running", description: "Daily reminder job started — eligible customers will be notified shortly" });
      setTimeout(() => loadStats(), 3000);
    } catch {
      toast({ title: "Error", description: "Failed to start reminder run", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bell className="w-6 h-6 text-primary" /> Payment Reminder Settings
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Automatically notify customers with pending balances via WhatsApp, SMS, Email & RCS
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {loading && !stats ? (
          <div className="text-center py-16 text-muted-foreground animate-pulse">Loading reminder settings…</div>
        ) : (
          <>
            {/* Control Card */}
            <Card className="p-6 border border-border rounded-2xl space-y-5">
              <h2 className="font-semibold text-base flex items-center gap-2"><AlarmCheck className="w-5 h-5 text-primary" /> Global Controls</h2>

              <div className="flex items-center justify-between bg-muted/40 rounded-xl p-4 border">
                <div>
                  <p className="font-semibold text-sm">Automatic Payment Reminders</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Runs every day at <strong>9:00 AM IST</strong> · Sends via WhatsApp, SMS, Email & RCS
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold ${stats?.enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {stats?.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <ToggleSwitch
                    checked={stats?.enabled ?? false}
                    onChange={handleToggle}
                    disabled={toggling}
                  />
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                <Button
                  onClick={handleRunNow}
                  disabled={running || !stats?.enabled}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  {running ? "Running…" : "Send Reminders Now"}
                </Button>
                {!stats?.enabled && (
                  <p className="text-xs text-muted-foreground self-center">Enable reminders above to trigger a run</p>
                )}
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Sent", value: stats?.total ?? 0, icon: Send, color: "text-blue-600", bg: "bg-blue-100" },
                { label: "Today's Reminders", value: stats?.todayCount ?? 0, icon: Activity, color: "text-indigo-600", bg: "bg-indigo-100" },
                { label: "Pending Payments", value: stats?.eligibleCount ?? 0, icon: Users, color: "text-orange-600", bg: "bg-orange-100" },
                { label: "Amount Overdue", value: stats ? fmt(stats.overdueAmount) : "—", icon: IndianRupee, color: "text-red-600", bg: "bg-red-100" },
                { label: "Failed Reminders", value: stats?.totalFailed ?? 0, icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-100" },
                { label: "Success Rate", value: stats ? `${stats.successRate}%` : "—", icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-100" },
                { label: "Last Successful", value: stats?.lastSent ? relDate(stats.lastSent) : "—", icon: CheckCircle, color: "text-teal-600", bg: "bg-teal-100" },
                { label: "Upcoming Due Dates", value: stats?.upcomingDueDates?.length ?? 0, icon: CalendarClock, color: "text-purple-600", bg: "bg-purple-100" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <Card key={label} className="p-4 rounded-2xl border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
                  </div>
                  <p className="font-bold text-foreground text-lg font-mono truncate">{value}</p>
                </Card>
              ))}
            </div>

            {/* Reminder Schedule */}
            <Card className="p-6 rounded-2xl border border-border">
              <h2 className="font-semibold text-base flex items-center gap-2 mb-4"><CalendarClock className="w-5 h-5 text-primary" /> Reminder Schedule</h2>
              <div className="space-y-2">
                {SCHEDULE.map(({ label, key, color }) => (
                  <div key={key} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-muted/30 border border-border/50">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm flex-1">{label}</span>
                    <Badge className={`text-[11px] font-mono ${color} border-0`}>{key}</Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <strong>Note:</strong> Reminders stop automatically when the customer's balance reaches ₹0. Duplicate reminders for the same schedule slot are prevented.
              </p>
            </Card>

            {/* Message Preview */}
            <Card className="p-6 rounded-2xl border border-border">
              <h2 className="font-semibold text-base flex items-center gap-2 mb-4"><Send className="w-5 h-5 text-primary" /> Message Template</h2>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 font-mono text-sm whitespace-pre-line text-green-900">
{`Assalamu Alaikum {Customer Name},

Your pending payment of Rs {Balance Amount} for your Hajj/Umrah booking is due.

Please complete your payment to confirm your seat.

For assistance:
+91 9893225590

Warm Regards,
Al Burhan Tours & Travels`}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-3 py-2 border">
                  <span className="font-semibold text-foreground">Sender ID:</span> ABURHA (Fast2SMS DLT)
                </div>
                <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-3 py-2 border">
                  <span className="font-semibold text-foreground">Channels:</span> WhatsApp · SMS · Email · RCS
                </div>
              </div>
            </Card>

            {/* Upcoming Due Dates */}
            {(stats?.upcomingDueDates?.length ?? 0) > 0 && (
              <Card className="p-6 rounded-2xl border border-border">
                <h2 className="font-semibold text-base flex items-center gap-2 mb-4">
                  <CalendarClock className="w-5 h-5 text-primary" /> Upcoming Due Dates
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-[11px] text-muted-foreground uppercase">
                        <th className="text-left pb-2 px-1">Customer</th>
                        <th className="text-left pb-2 px-1">Booking</th>
                        <th className="text-left pb-2 px-1">Due Date</th>
                        <th className="text-right pb-2 px-1">Balance</th>
                        <th className="text-left pb-2 px-1">Next Reminder</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {stats?.upcomingDueDates?.map(b => (
                        <tr key={b.id} className="hover:bg-muted/30">
                          <td className="py-2 px-1">
                            <p className="font-medium">{b.customer_name}</p>
                            <p className="text-[11px] text-muted-foreground">{b.customer_mobile}</p>
                          </td>
                          <td className="py-2 px-1 font-mono text-xs text-muted-foreground">{b.booking_number}</td>
                          <td className="py-2 px-1 text-xs">{new Date(b.due_date).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td>
                          <td className="py-2 px-1 text-right font-mono text-orange-700 font-semibold">{fmt(b.balance)}</td>
                          <td className="py-2 px-1">
                            <span className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">{nextReminderLabel(b.due_date)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Recent Logs */}
            <Card className="p-6 rounded-2xl border border-border">
              <h2 className="font-semibold text-base flex items-center gap-2 mb-4"><History className="w-5 h-5 text-primary" /> Recent Reminder Activity</h2>
              {(stats?.recentLogs?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No reminders sent yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-[11px] text-muted-foreground uppercase">
                        <th className="text-left pb-2 px-1">Customer</th>
                        <th className="text-left pb-2 px-1">Booking</th>
                        <th className="text-right pb-2 px-1">Balance</th>
                        <th className="text-left pb-2 px-1">Type</th>
                        <th className="text-left pb-2 px-1">Triggered By</th>
                        <th className="text-left pb-2 px-1">Status</th>
                        <th className="text-left pb-2 px-1">Sent At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {stats?.recentLogs?.map(log => {
                        const typeMatch = log.notes?.match(/type:(\S+)/);
                        const reminderType = typeMatch?.[1] || "manual";
                        return (
                          <tr key={log.id} className="hover:bg-muted/30">
                            <td className="py-2 px-1">
                              <p className="font-medium text-xs">{log.customer_name || "—"}</p>
                              <p className="text-[10px] text-muted-foreground">{log.customer_mobile || ""}</p>
                            </td>
                            <td className="py-2 px-1 font-mono text-[11px] text-muted-foreground">{log.booking_number || "—"}</td>
                            <td className="py-2 px-1 text-right font-mono text-orange-700 text-xs font-semibold">{log.balance ? fmt(Number(log.balance)) : "—"}</td>
                            <td className="py-2 px-1">
                              <span className="text-[10px] font-mono bg-muted border border-border rounded px-1 py-0.5">{reminderType}</span>
                            </td>
                            <td className="py-2 px-1 text-xs text-muted-foreground capitalize">{log.triggered_by}</td>
                            <td className="py-2 px-1">
                              {log.status === "sent"
                                ? <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px]"><CheckCircle className="w-3 h-3" /> sent</span>
                                : <span className="inline-flex items-center gap-1 text-red-600 text-[11px]"><XCircle className="w-3 h-3" /> failed</span>
                              }
                            </td>
                            <td className="py-2 px-1 text-[11px] text-muted-foreground whitespace-nowrap">{relDate(log.sent_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
