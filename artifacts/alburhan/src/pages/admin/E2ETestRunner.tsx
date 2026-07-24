import { useState, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

type Step = {
  id: string; name: string; status: "pending"|"pass"|"fail"|"warn";
  duration_ms: number; detail: string; error: string;
};

type E2EResult = {
  overall: "pass"|"fail"|"warn"; passed: number; failed: number; warned: number; total: number;
  steps: Step[]; executedAt: string; context: any;
};

type ChannelResult = {
  channel: string; ok: boolean; duration_ms: number; detail: string; raw?: any; timestamp: string;
};

const CHANNELS = [
  { id: "sms",       label: "SMS",             emoji: "📱", desc: "Fast2SMS DLT/Quick route" },
  { id: "email",     label: "Email",            emoji: "📧", desc: "SMTP email delivery" },
  { id: "whatsapp",  label: "WhatsApp",         emoji: "💬", desc: "BotBee WhatsApp (WABA)" },
  { id: "dashboard", label: "Dashboard Notif",  emoji: "🔔", desc: "In-app notification" },
  { id: "push",      label: "Push Notification",emoji: "📲", desc: "Web Push (VAPID)" },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "pass")    return <Badge className="bg-green-100 text-green-800 border-green-200">✓ PASS</Badge>;
  if (status === "fail")    return <Badge className="bg-red-100 text-red-800 border-red-200">✗ FAIL</Badge>;
  if (status === "warn")    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">⚠ WARN</Badge>;
  if (status === "pending") return <Badge className="bg-gray-100 text-gray-500">— PENDING</Badge>;
  return <Badge className="bg-gray-100 text-gray-500">{status}</Badge>;
}

export default function E2ETestRunner() {
  const { can } = usePermissions();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<E2EResult | null>(null);
  const [channelResults, setChannelResults] = useState<Record<string, ChannelResult>>({});
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testMobile, setTestMobile] = useState("");
  const [testEmail, setTestEmail]   = useState("");

  const runE2E = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const resp = await fetch(`${API}/api/admin/e2e/run`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      setResult(data);
    } catch (e: any) {
      setResult({ overall: "fail", passed: 0, failed: 1, warned: 0, total: 1,
        steps: [{ id: "net", name: "Network", status: "fail", duration_ms: 0, detail: "", error: e.message }],
        executedAt: new Date().toISOString(), context: {} });
    }
    setRunning(false);
  }, []);

  const testChannel = useCallback(async (ch: string) => {
    setTestingChannel(ch);
    try {
      const resp = await fetch(`${API}/api/admin/e2e/channel/${ch}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: testMobile || undefined, email: testEmail || undefined }),
      });
      const data = await resp.json();
      setChannelResults(prev => ({ ...prev, [ch]: data }));
    } catch (e: any) {
      setChannelResults(prev => ({ ...prev, [ch]: { channel: ch, ok: false, duration_ms: 0, detail: e.message, timestamp: new Date().toISOString() } }));
    }
    setTestingChannel(null);
  }, [testMobile, testEmail]);

  if (!can("system:health")) {
    return <AdminLayout><div className="p-8 text-gray-500">Access restricted.</div></AdminLayout>;
  }

  const overallColor = result?.overall === "pass" ? "green" : result?.overall === "warn" ? "yellow" : result?.overall === "fail" ? "red" : "gray";

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">End-to-End Test Runner</h1>
            <p className="text-gray-500 text-sm mt-1">Real functional tests against live database and APIs — no simulation</p>
          </div>
          <Button
            onClick={runE2E}
            disabled={running}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 font-semibold rounded-lg"
          >
            {running ? "⏳ Running Tests..." : "▶ Run Full E2E Test"}
          </Button>
        </div>

        {/* Overall Score */}
        {result && (
          <div className={`rounded-xl border-2 p-6 ${
            overallColor === "green" ? "border-green-300 bg-green-50" :
            overallColor === "red"   ? "border-red-300 bg-red-50" :
            overallColor === "yellow"? "border-yellow-300 bg-yellow-50" : "border-gray-300 bg-gray-50"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold">
                  {result.overall === "pass" ? "✅ ALL TESTS PASSED" :
                   result.overall === "fail" ? "❌ TESTS FAILED" : "⚠️ TESTS WITH WARNINGS"}
                </div>
                <div className="text-gray-600 mt-1">
                  {result.passed}/{result.total} steps passed
                  {result.failed > 0 && <span className="text-red-600 ml-2">• {result.failed} failed</span>}
                  {result.warned > 0 && <span className="text-yellow-600 ml-2">• {result.warned} warnings</span>}
                </div>
                {result.context?.customerName && (
                  <div className="text-sm text-gray-500 mt-1">
                    Tested with: {result.context.customerName} | {result.context.packageName}
                  </div>
                )}
              </div>
              <div className="text-right text-sm text-gray-400">
                <div>{new Date(result.executedAt).toLocaleString("en-IN")}</div>
                <div>Test data auto-cleaned up</div>
              </div>
            </div>
          </div>
        )}

        {/* Step Results */}
        {result && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-800">
              Workflow Steps
            </div>
            <div className="divide-y divide-gray-50">
              {result.steps.map(step => (
                <div key={step.id} className={`px-5 py-3.5 flex items-start gap-4 ${step.status === "fail" ? "bg-red-50" : step.status === "warn" ? "bg-yellow-50" : ""}`}>
                  <div className="w-32 flex-shrink-0 pt-0.5">
                    <StatusBadge status={step.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 text-sm">{step.name}</div>
                    {step.detail && <div className="text-xs text-gray-500 mt-0.5">{step.detail}</div>}
                    {step.error  && <div className="text-xs text-red-600 mt-0.5 font-mono bg-red-50 rounded px-2 py-1">{step.error}</div>}
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0 pt-0.5">{step.duration_ms}ms</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Channel Tests */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="font-semibold text-gray-800">Notification Channel Tests</div>
            <p className="text-xs text-gray-500 mt-0.5">Test each channel with a real API call — verifies actual delivery</p>
          </div>

          <div className="px-5 py-4 border-b border-gray-100 flex gap-3 flex-wrap items-center">
            <input
              type="tel" value={testMobile} onChange={e => setTestMobile(e.target.value)}
              placeholder="Test mobile (10 digits)"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <input
              type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
              placeholder="Test email address"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <Button
              onClick={() => CHANNELS.forEach(c => testChannel(c.id))}
              disabled={!!testingChannel}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-1.5 rounded-lg"
            >
              Test All Channels
            </Button>
          </div>

          <div className="divide-y divide-gray-50">
            {CHANNELS.map(ch => {
              const cr = channelResults[ch.id];
              const isTesting = testingChannel === ch.id;
              return (
                <div key={ch.id} className={`px-5 py-4 flex items-center gap-4 ${cr ? (cr.ok ? "bg-green-50/30" : "bg-red-50/30") : ""}`}>
                  <div className="text-2xl">{ch.emoji}</div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{ch.label}</div>
                    <div className="text-xs text-gray-500">{ch.desc}</div>
                    {cr && (
                      <div className={`text-xs mt-1 ${cr.ok ? "text-green-700" : "text-red-600"}`}>
                        {cr.detail} {cr.duration_ms > 0 && <span className="text-gray-400">({cr.duration_ms}ms)</span>}
                      </div>
                    )}
                    {cr?.raw && !cr.ok && (
                      <div className="text-xs text-gray-400 mt-0.5 font-mono bg-gray-100 rounded px-2 py-1">
                        {JSON.stringify(cr.raw).slice(0, 200)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {cr && <StatusBadge status={cr.ok ? "pass" : "fail"} />}
                    <Button
                      onClick={() => testChannel(ch.id)}
                      disabled={isTesting || !!testingChannel}
                      className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs px-3 py-1.5 rounded-lg"
                    >
                      {isTesting ? "Testing..." : "Test"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Info Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <strong>About E2E Tests:</strong> These tests create real database records (booking, invoice, payment, receipt), verify each step passes, then automatically clean up all test data. No permanent changes are made. Channel tests send real API requests to actual providers.
        </div>
      </div>
    </AdminLayout>
  );
}
