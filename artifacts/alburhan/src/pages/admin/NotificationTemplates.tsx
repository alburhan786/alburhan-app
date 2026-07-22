import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Send, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Info } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface TemplateStat {
  sent: number;
  failed: number;
  total: number;
  successRate: number | null;
  last_used: string | null;
}

interface Template {
  key: string;
  displayName: string;
  id: string;
  name: string;
  envVar: string;
  language: string;
  eventTypes: string[];
  description: string;
  stats: TemplateStat;
  health: "healthy" | "warning" | "failing" | "untested";
}

function HealthBadge({ health }: { health: Template["health"] }) {
  if (health === "healthy")   return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1"><CheckCircle2 className="h-3 w-3" />Healthy</Badge>;
  if (health === "warning")   return <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1"><AlertTriangle className="h-3 w-3" />Warning</Badge>;
  if (health === "failing")   return <Badge className="bg-red-100 text-red-800 border-red-200 gap-1"><XCircle className="h-3 w-3" />Failing</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border-gray-200 gap-1"><HelpCircle className="h-3 w-3" />Untested</Badge>;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

export default function NotificationTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [testMobile, setTestMobile] = useState("");
  const [testing, setTesting]     = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/whatsapp/template-status`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setTemplates(d.templates || []);
    } catch (e: any) {
      toast({ title: "Failed to load templates", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const testTemplate = async (key: string) => {
    if (!testMobile.trim()) {
      toast({ title: "Mobile required", description: "Enter a WhatsApp number to test", variant: "destructive" });
      return;
    }
    setTesting(key);
    setTestResults(prev => ({ ...prev, [key]: undefined as any }));
    try {
      const r = await fetch(`${API}/api/whatsapp/template-test/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mobile: testMobile.trim() }),
      });
      const d = await r.json();
      const ok = r.ok && d.ok;
      setTestResults(prev => ({ ...prev, [key]: { ok, msg: d.ok ? `✅ Sent to ${testMobile}` : `❌ ${d.errorMessage || d.message || "Failed"}` } }));
      toast({
        title: ok ? "Template sent!" : "Template failed",
        description: d.ok ? `Delivered via template "${d.templateName}"` : (d.errorMessage || d.message || "Check BotBee"),
        variant: ok ? "default" : "destructive",
      });
      if (ok) loadTemplates();
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [key]: { ok: false, msg: `❌ ${e.message}` } }));
    } finally {
      setTesting(null);
    }
  };

  const healthyCount  = templates.filter(t => t.health === "healthy").length;
  const failingCount  = templates.filter(t => t.health === "failing").length;
  const warningCount  = templates.filter(t => t.health === "warning").length;
  const untestedCount = templates.filter(t => t.health === "untested").length;

  return (
    <AdminLayout>
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notification Templates</h1>
          <p className="text-sm text-gray-500 mt-1">WhatsApp template health — all names from environment variables</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadTemplates} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Healthy",  count: healthyCount,  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
          { label: "Warning",  count: warningCount,  cls: "bg-amber-50 text-amber-700 border-amber-200" },
          { label: "Failing",  count: failingCount,  cls: "bg-red-50 text-red-700 border-red-200" },
          { label: "Untested", count: untestedCount, cls: "bg-gray-50 text-gray-600 border-gray-200" },
        ].map(({ label, count, cls }) => (
          <Card key={label} className={`border ${cls}`}>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{count}</div>
              <div className="text-sm font-medium mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Test mobile input */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">Test Mobile Number:</span>
            <Input
              className="max-w-xs"
              placeholder="9867114562"
              value={testMobile}
              onChange={e => setTestMobile(e.target.value)}
            />
            <span className="text-xs text-gray-400">Enter a WhatsApp number, then click "Test" on any template</span>
          </div>
        </CardContent>
      </Card>

      {/* Template table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Configured Templates ({templates.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading templates…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-700">Template</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Name (BotBee)</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">ID</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Sent</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Failed</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Rate</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Last Used</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Test</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t, idx) => {
                    const testRes = testResults[t.key];
                    return (
                      <tr key={t.key} className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{t.displayName}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{t.description}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {t.eventTypes.map(ev => (
                              <span key={ev} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">{ev}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-800">{t.name}</code>
                          <div className="text-xs text-gray-400 mt-1 font-mono">{t.envVar}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-600">{t.id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <HealthBadge health={t.health} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-medium text-emerald-700">{t.stats.sent}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${t.stats.failed > 0 ? "text-red-600" : "text-gray-400"}`}>{t.stats.failed}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {t.stats.successRate !== null ? (
                            <span className={`font-medium ${t.stats.successRate >= 80 ? "text-emerald-600" : t.stats.successRate >= 40 ? "text-amber-600" : "text-red-600"}`}>
                              {t.stats.successRate}%
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(t.stats.last_used)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 px-2"
                              disabled={testing === t.key || !testMobile.trim()}
                              onClick={() => testTemplate(t.key)}
                            >
                              {testing === t.key ? (
                                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Send className="h-3 w-3 mr-1" />
                              )}
                              Test
                            </Button>
                            {testRes && (
                              <div className={`text-xs px-1 ${testRes.ok ? "text-emerald-600" : "text-red-600"}`}>
                                {testRes.msg}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Env var configuration guide */}
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Configuring Template Names
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-amber-700 space-y-1">
          <p>To override any template name, set the corresponding environment variable in your deployment:</p>
          {templates.map(t => (
            <div key={t.key} className="font-mono bg-amber-100 px-2 py-0.5 rounded mt-1">
              {t.envVar}=&quot;{t.name}&quot;
            </div>
          ))}
          <p className="mt-2 text-amber-600">After setting the env var, redeploy the API server for the change to take effect.</p>
        </CardContent>
      </Card>
    </div>
    </AdminLayout>
  );
}
