/**
 * Admin → AI Assistant Control Center
 * Kill switch, token management, conversation stats, and audit log viewer.
 * Only super_admin may change security controls.
 */
import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Bot, Key, Activity, ShieldAlert, RefreshCw, Plus, Trash2,
  CheckCircle2, XCircle, Clock, AlertTriangle, BarChart3, MessageSquare,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ServiceToken {
  id: string;
  token_name: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  notes: string | null;
}
interface ConvStats {
  total: number;
  ai_active: number;
  human_required: number;
  human_active: number;
  closed: number;
  today: number;
}
interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_id: string | null;
  ip_address: string | null;
  result: string;
  error_code: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function AIAssistantControlCenter() {
  const { toast } = useToast();
  const [tab, setTab] = useState("overview");

  // AI enabled state
  const [aiStatus, setAiStatus] = useState<{ enabled: boolean; env_set: boolean } | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Tokens
  const [tokens, setTokens] = useState<ServiceToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [newTokenDialog, setNewTokenDialog] = useState(false);
  const [newTokenForm, setNewTokenForm] = useState({ name: "", scopes: "packages:read,leads:create,leads:update,support:create,conversations:create,knowledge:read", notes: "" });
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  // Conversations
  const [convStats, setConvStats] = useState<ConvStats | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(0);

  // ── Fetch AI status ─────────────────────────────────────────────────────
  const fetchAiStatus = useCallback(async () => {
    setAiStatusLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/ai-automation/status`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setAiStatus(d); }
    } catch {}
    setAiStatusLoading(false);
  }, []);

  // ── Fetch tokens ────────────────────────────────────────────────────────
  const fetchTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/ai-automation/tokens`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setTokens(d.tokens || []); }
    } catch {}
    setTokensLoading(false);
  }, []);

  // ── Fetch conversation stats ─────────────────────────────────────────────
  const fetchConvStats = useCallback(async () => {
    setConvsLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/ai-automation/conversations`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setConvStats(d.stats); setConversations(d.conversations || []); }
    } catch {}
    setConvsLoading(false);
  }, []);

  // ── Fetch audit logs ─────────────────────────────────────────────────────
  const fetchAuditLogs = useCallback(async (page = 0) => {
    setAuditLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/ai-automation/audit?offset=${page * 50}`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setAuditLogs(d.logs || []); setAuditPage(page); }
    } catch {}
    setAuditLoading(false);
  }, []);

  useEffect(() => { fetchAiStatus(); fetchTokens(); fetchConvStats(); fetchAuditLogs(); }, []);

  // ── Toggle AI kill switch ───────────────────────────────────────────────
  const handleToggleAI = async (enabled: boolean) => {
    setToggleLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/ai-automation/toggle`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const d = await r.json();
      if (r.ok) {
        toast({ title: enabled ? "AI Assistant enabled" : "AI Assistant disabled", description: d.message || "" });
        fetchAiStatus();
      } else {
        toast({ title: "Failed", description: d.message || d.error || "Could not toggle AI", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    setToggleLoading(false);
  };

  // ── Create token ────────────────────────────────────────────────────────
  const handleCreateToken = async () => {
    if (!newTokenForm.name.trim()) { toast({ title: "Token name required", variant: "destructive" }); return; }
    try {
      const scopeArr = newTokenForm.scopes.split(",").map(s => s.trim()).filter(Boolean);
      const r = await fetch(`${API}/api/admin/ai-automation/tokens`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTokenForm.name.trim(), scopes: scopeArr, notes: newTokenForm.notes }),
      });
      const d = await r.json();
      if (r.ok) {
        setCreatedToken(d.raw_token);
        fetchTokens();
        setNewTokenForm({ name: "", scopes: "packages:read,leads:create,leads:update,support:create,conversations:create,knowledge:read", notes: "" });
      } else {
        toast({ title: "Failed to create token", description: d.message || d.error, variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
  };

  // ── Revoke token ────────────────────────────────────────────────────────
  const handleRevokeToken = async (tokenId: string, name: string) => {
    if (!confirm(`Revoke token "${name}"? This cannot be undone.`)) return;
    try {
      const r = await fetch(`${API}/api/admin/ai-automation/tokens/${tokenId}/revoke`, {
        method: "POST", credentials: "include",
      });
      if (r.ok) { toast({ title: `Token "${name}" revoked` }); fetchTokens(); }
      else { const d = await r.json(); toast({ title: "Failed", description: d.message || d.error, variant: "destructive" }); }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
  };

  // ── Return conversation to AI ──────────────────────────────────────────
  const handleReturnToAI = async (conversationKey: string) => {
    try {
      const r = await fetch(`${API}/api/admin/ai-automation/conversations/${conversationKey}/return-to-ai`, {
        method: "POST", credentials: "include",
      });
      if (r.ok) { toast({ title: "Returned to AI" }); fetchConvStats(); }
    } catch {}
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout breadcrumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Control Center" }]}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Bot className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Assistant Control Center</h1>
              <p className="text-sm text-muted-foreground">Manage the external AI automation API (n8n integration)</p>
            </div>
          </div>
          {/* Global kill switch */}
          <div className="flex items-center gap-3 bg-white border rounded-xl px-4 py-2 shadow-sm">
            {aiStatusLoading ? (
              <Skeleton className="w-32 h-6" />
            ) : (
              <>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-medium text-muted-foreground">AI Assistant</span>
                  <span className={`text-xs font-semibold ${aiStatus?.enabled ? "text-green-600" : "text-red-500"}`}>
                    {aiStatus?.enabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <Switch
                  checked={aiStatus?.enabled ?? false}
                  onCheckedChange={handleToggleAI}
                  disabled={toggleLoading || !aiStatus?.env_set}
                />
              </>
            )}
          </div>
        </div>

        {/* Env var warning */}
        {aiStatus && !aiStatus.env_set && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">AI_ASSISTANT_ENABLED environment variable not set</p>
              <p className="text-xs text-amber-700 mt-1">
                The AI automation API requires <code className="bg-amber-100 px-1 rounded">AI_ASSISTANT_ENABLED=true</code> in the
                server environment secrets before any requests can be processed. Set this in Replit Secrets, then restart the API server.
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-1 inline" />Overview</TabsTrigger>
            <TabsTrigger value="tokens"><Key className="w-4 h-4 mr-1 inline" />Service Tokens</TabsTrigger>
            <TabsTrigger value="conversations"><MessageSquare className="w-4 h-4 mr-1 inline" />Conversations</TabsTrigger>
            <TabsTrigger value="audit"><Activity className="w-4 h-4 mr-1 inline" />Audit Log</TabsTrigger>
          </TabsList>

          {/* ── Overview ─────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Active Conversations", value: convStats?.ai_active ?? "—", icon: <Bot className="w-5 h-5 text-green-500" />, color: "bg-green-50" },
                { label: "Waiting for Human", value: convStats?.human_required ?? "—", icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, color: "bg-amber-50" },
                { label: "Total Today", value: convStats?.today ?? "—", icon: <Clock className="w-5 h-5 text-blue-500" />, color: "bg-blue-50" },
                { label: "Total All Time", value: convStats?.total ?? "—", icon: <BarChart3 className="w-5 h-5 text-violet-500" />, color: "bg-violet-50" },
              ].map(s => (
                <Card key={s.label} className={`p-4 ${s.color} border-0`}>
                  <div className="flex items-center justify-between mb-2">{s.icon}</div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </Card>
              ))}
            </div>

            <Card className="p-4">
              <h3 className="font-semibold mb-3 text-sm">Available API Endpoints</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  { method: "GET",   path: "/api/automation/health",                         scope: "—",                   desc: "Health check (no auth)" },
                  { method: "GET",   path: "/api/automation/packages",                        scope: "packages:read",       desc: "List Hajj/Umrah packages" },
                  { method: "GET",   path: "/api/automation/packages/:id",                    scope: "packages:read",       desc: "Single package detail" },
                  { method: "POST",  path: "/api/automation/leads",                           scope: "leads:create",        desc: "Create or update lead" },
                  { method: "PATCH", path: "/api/automation/leads/:leadNumber",               scope: "leads:update",        desc: "Patch allowed lead fields" },
                  { method: "POST",  path: "/api/automation/support-tickets",                 scope: "support:create",      desc: "Create support ticket" },
                  { method: "POST",  path: "/api/automation/conversations/upsert",            scope: "conversations:create", desc: "Upsert AI conversation" },
                  { method: "POST",  path: "/api/automation/conversations/:key/messages",     scope: "conversations:create", desc: "Add message to conversation" },
                  { method: "POST",  path: "/api/automation/conversations/:key/handoff",      scope: "support:create",      desc: "Handoff to human agent" },
                  { method: "GET",   path: "/api/automation/knowledge",                       scope: "knowledge:read",      desc: "Query knowledge base" },
                ].map(e => (
                  <div key={e.path} className="flex items-start gap-2 p-2 rounded-lg bg-muted/40 text-xs">
                    <Badge variant="outline" className={`shrink-0 font-mono text-[10px] px-1 ${
                      e.method === "GET" ? "text-blue-600" : e.method === "POST" ? "text-green-600" : "text-amber-600"
                    }`}>{e.method}</Badge>
                    <div className="min-w-0">
                      <code className="font-mono text-[10px] text-foreground break-all">{e.path}</code>
                      <p className="text-muted-foreground mt-0.5">{e.desc} <span className="text-violet-600">· {e.scope}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* ── Service Tokens ────────────────────────────────────────────── */}
          <TabsContent value="tokens" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Service Tokens</h3>
                <p className="text-xs text-muted-foreground">Tokens authenticate n8n and other external services. Never share raw tokens.</p>
              </div>
              <Button size="sm" onClick={() => setNewTokenDialog(true)}><Plus className="w-4 h-4 mr-1" />New Token</Button>
            </div>

            {tokensLoading ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
            ) : tokens.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No service tokens yet.</p>
                <p className="text-xs mt-1">Create one to authenticate your n8n workflows.</p>
              </Card>
            ) : (
              tokens.map(tok => (
                <Card key={tok.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{tok.token_name}</span>
                        <Badge variant={tok.is_active ? "default" : "destructive"} className="text-[10px]">
                          {tok.is_active ? "active" : "revoked"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {tok.scopes.map(s => (
                          <Badge key={s} variant="secondary" className="text-[10px] font-mono">{s}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(tok.created_at).toLocaleDateString()} ·{" "}
                        {tok.last_used_at ? `Last used ${new Date(tok.last_used_at).toLocaleString()}` : "Never used"}
                        {tok.expires_at && ` · Expires ${new Date(tok.expires_at).toLocaleDateString()}`}
                      </p>
                      {tok.notes && <p className="text-xs text-muted-foreground mt-1 italic">{tok.notes}</p>}
                    </div>
                    {tok.is_active && (
                      <Button variant="destructive" size="sm" onClick={() => handleRevokeToken(tok.id, tok.token_name)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" />Revoke
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}

            {/* Create token dialog */}
            <Dialog open={newTokenDialog} onOpenChange={v => { setNewTokenDialog(v); if (!v) setCreatedToken(null); }}>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Service Token</DialogTitle></DialogHeader>
                {createdToken ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />Token created. Copy it now — it will never be shown again.
                    </div>
                    <div className="bg-muted rounded-lg p-3 font-mono text-xs break-all select-all border border-green-300">
                      {createdToken}
                    </div>
                    <p className="text-xs text-muted-foreground">Store this in the N8N_SERVICE_TOKEN environment secret or your n8n credential store.</p>
                    <DialogFooter>
                      <Button onClick={() => { navigator.clipboard.writeText(createdToken!); toast({ title: "Copied!" }); }}>Copy Token</Button>
                      <Button variant="outline" onClick={() => { setNewTokenDialog(false); setCreatedToken(null); }}>Done</Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Token Name *</Label>
                      <Input placeholder="e.g. n8n-main, whatsapp-bot" value={newTokenForm.name} onChange={e => setNewTokenForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Scopes (comma-separated)</Label>
                      <Input value={newTokenForm.scopes} onChange={e => setNewTokenForm(f => ({ ...f, scopes: e.target.value }))} />
                      <p className="text-xs text-muted-foreground">Available: packages:read, leads:read, leads:create, leads:update, support:create, conversations:create, knowledge:read</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes (optional)</Label>
                      <Input placeholder="Which system uses this token?" value={newTokenForm.notes} onChange={e => setNewTokenForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewTokenDialog(false)}>Cancel</Button>
                      <Button onClick={handleCreateToken}>Create Token</Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ── Conversations ─────────────────────────────────────────────── */}
          <TabsContent value="conversations" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">AI Conversations</h3>
              <Button variant="outline" size="sm" onClick={fetchConvStats}>
                <RefreshCw className="w-4 h-4 mr-1" />Refresh
              </Button>
            </div>

            {convsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
            ) : conversations.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No conversations yet.</p>
              </Card>
            ) : (
              conversations.map((conv: any) => (
                <Card key={conv.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">{conv.conversation_key}</span>
                        <Badge variant={
                          conv.status === "ai_active" ? "default" :
                          conv.status === "human_required" ? "destructive" :
                          conv.status === "human_active" ? "secondary" : "outline"
                        } className="text-[10px]">{conv.status}</Badge>
                        <Badge variant="outline" className="text-[10px]">{conv.channel}</Badge>
                      </div>
                      <p className="text-sm">{conv.customer_name || "Unknown"} · {conv.mobile_masked || ""} · {conv.language?.toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">Started {new Date(conv.created_at).toLocaleString()}</p>
                    </div>
                    {conv.status === "human_required" && (
                      <Button size="sm" variant="outline" onClick={() => handleReturnToAI(conv.conversation_key)}>
                        <Bot className="w-3.5 h-3.5 mr-1" />Return to AI
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Audit Log ────────────────────────────────────────────────── */}
          <TabsContent value="audit" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Automation Audit Log</h3>
              <Button variant="outline" size="sm" onClick={() => fetchAuditLogs(0)}>
                <RefreshCw className="w-4 h-4 mr-1" />Refresh
              </Button>
            </div>

            {auditLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
            ) : auditLogs.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No audit log entries yet.</p>
              </Card>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        {["Time", "Action", "Entity", "Request ID", "IP", "Result"].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(e => (
                        <tr key={e.id} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(e.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono">{e.action}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.entity_type}{e.entity_id ? ` · ${e.entity_id.substring(0, 8)}` : ""}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{e.request_id || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.ip_address || "—"}</td>
                          <td className="px-3 py-2">
                            {e.result === "success"
                              ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" />ok</span>
                              : <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" />{e.error_code || "fail"}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <Button variant="outline" size="sm" disabled={auditPage === 0} onClick={() => fetchAuditLogs(auditPage - 1)}>Previous</Button>
                  <span className="text-xs text-muted-foreground">Page {auditPage + 1}</span>
                  <Button variant="outline" size="sm" disabled={auditLogs.length < 50} onClick={() => fetchAuditLogs(auditPage + 1)}>Next</Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
