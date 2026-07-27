// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Edit2, Save, X, RefreshCw, ToggleLeft, ToggleRight,
  MessageCircle, Facebook, Instagram, Zap, TestTube2, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, Users, Eye,
} from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const PLATFORMS = [
  { key: "facebook",  label: "Facebook",  icon: "👥" },
  { key: "instagram", label: "Instagram", icon: "📸" },
  { key: "youtube",   label: "YouTube",   icon: "▶️" },
  { key: "twitter",   label: "Twitter/X", icon: "🐦" },
];

const MATCH_TYPES = [
  { key: "any",   label: "Any keyword (OR)", desc: "Triggers if comment contains ANY of the keywords" },
  { key: "all",   label: "All keywords (AND)", desc: "Triggers only if comment contains ALL keywords" },
  { key: "exact", label: "Exact match", desc: "Comment must exactly equal one of the keywords" },
];

const TYPES = ["call","email","whatsapp","visit","task","other"];

function RuleForm({ rule, onSave, onCancel }: any) {
  const [form, setForm] = useState({
    rule_name: rule?.rule_name || "",
    platform: rule?.platform || "facebook",
    match_type: rule?.match_type || "any",
    keywords: (rule?.keywords || []).join(", "),
    public_reply: rule?.public_reply || "",
    private_message: rule?.private_message || "",
    create_lead: rule?.create_lead || false,
    lead_source: rule?.lead_source || "facebook",
    assign_to_name: rule?.assign_to_name || "",
    cooldown_minutes: rule?.cooldown_minutes ?? 60,
    is_active: rule?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!form.rule_name.trim()) return toast({ title: "Rule name required", variant: "destructive" });
    const keywords = form.keywords.split(",").map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) return toast({ title: "At least one keyword required", variant: "destructive" });

    setLoading(true);
    try {
      const body = { ...form, keywords, lead_source: form.platform };
      const url = rule?.id
        ? `${BASE_API}/api/crm/comment-automation/${rule.id}`
        : `${BASE_API}/api/crm/comment-automation`;
      const r = await fetch(url, {
        method: rule?.id ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (data.ok) {
        toast({ title: rule?.id ? "Rule updated" : "Rule created" });
        onSave(data.rule);
      } else {
        toast({ title: data.error || "Failed", variant: "destructive" });
      }
    } finally { setLoading(false); }
  };

  const f = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-4">{rule?.id ? "Edit Rule" : "Create Automation Rule"}</h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <Label className="text-xs font-medium text-gray-700 mb-1">Rule Name *</Label>
          <Input className="h-8 text-sm" placeholder="e.g. Hajj inquiry reply" value={form.rule_name} onChange={e => f("rule_name", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs font-medium text-gray-700 mb-1">Platform</Label>
          <select className="w-full h-8 text-sm border border-gray-200 rounded px-2" value={form.platform} onChange={e => f("platform", e.target.value)}>
            {PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <Label className="text-xs font-medium text-gray-700 mb-1">Match Type</Label>
        <div className="flex gap-2">
          {MATCH_TYPES.map(m => (
            <button key={m.key} onClick={() => f("match_type", m.key)}
              className={`flex-1 text-xs border rounded-lg p-2 text-left transition-colors ${form.match_type === m.key ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              <p className="font-medium">{m.label}</p>
              <p className="text-gray-500 mt-0.5" style={{ fontSize: "10px" }}>{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <Label className="text-xs font-medium text-gray-700 mb-1">Keywords *</Label>
        <Input className="h-8 text-sm" placeholder="hajj, umrah, package, booking, price (comma-separated)"
          value={form.keywords} onChange={e => f("keywords", e.target.value)} />
        <p className="text-xs text-gray-400 mt-1">
          Separate multiple keywords with commas. The rule triggers when a comment matches.
        </p>
      </div>

      <div className="mb-4">
        <Label className="text-xs font-medium text-gray-700 mb-1">Public Reply (comment reply)</Label>
        <textarea className="w-full text-sm border border-gray-200 rounded-lg p-2 h-20 resize-none"
          placeholder="Thank you for your interest! Please check your DM for details. 🕌"
          value={form.public_reply} onChange={e => f("public_reply", e.target.value)} />
      </div>

      <div className="mb-4">
        <Label className="text-xs font-medium text-gray-700 mb-1">Private Message (DM / WhatsApp)</Label>
        <textarea className="w-full text-sm border border-gray-200 rounded-lg p-2 h-20 resize-none"
          placeholder="Assalamualaikum! Thank you for your interest in our Hajj/Umrah packages. Our team will reach you shortly."
          value={form.private_message} onChange={e => f("private_message", e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <Label className="text-xs font-medium text-gray-700 mb-1">Cooldown (minutes)</Label>
          <Input type="number" className="h-8 text-sm" value={form.cooldown_minutes} onChange={e => f("cooldown_minutes", Number(e.target.value))} />
          <p className="text-xs text-gray-400 mt-0.5">Same user cooldown</p>
        </div>
        <div>
          <Label className="text-xs font-medium text-gray-700 mb-1">Assign to (name)</Label>
          <Input className="h-8 text-sm" placeholder="Executive name" value={form.assign_to_name} onChange={e => f("assign_to_name", e.target.value)} />
        </div>
        <div className="flex flex-col justify-end">
          <div className="flex items-center gap-2">
            <button onClick={() => f("create_lead", !form.create_lead)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.create_lead ? "bg-indigo-600" : "bg-gray-300"}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${form.create_lead ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
            <Label className="text-xs text-gray-700">Auto-create lead</Label>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button className="flex-1" onClick={handleSave} disabled={loading}>
          <Save size={14} className="mr-1" />{rule?.id ? "Update Rule" : "Create Rule"}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>Cancel</Button>
      </div>
    </div>
  );
}

function RuleCard({ rule, onEdit, onDelete, onToggle }: any) {
  const platform = PLATFORMS.find(p => p.key === rule.platform);
  const matchType = MATCH_TYPES.find(m => m.key === rule.match_type);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${rule.is_active ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{platform?.icon || "💬"}</span>
            <h3 className="font-semibold text-gray-900">{rule.rule_name}</h3>
            <Badge variant={rule.is_active ? "default" : "outline"} className={`text-xs ${rule.is_active ? "bg-green-100 text-green-700" : ""}`}>
              {rule.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {(rule.keywords || []).map((kw: string) => (
              <span key={kw} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">{kw}</span>
            ))}
          </div>
          <p className="text-xs text-gray-500">{platform?.label} · {matchType?.label} · {rule.cooldown_minutes}min cooldown</p>
          {rule.trigger_count > 0 && <p className="text-xs text-green-600 mt-1">Triggered {rule.trigger_count} times</p>}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <button onClick={() => onToggle(rule)} title={rule.is_active ? "Deactivate" : "Activate"}
            className={`${rule.is_active ? "text-green-600 hover:text-red-500" : "text-gray-400 hover:text-green-600"} transition-colors`}>
            {rule.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          </button>
          <button onClick={() => onEdit(rule)} className="text-gray-400 hover:text-indigo-600"><Edit2 size={15} /></button>
          <button onClick={() => onDelete(rule.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-700">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          {rule.public_reply && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">💬 Public Reply</p>
              <p className="text-xs text-gray-700 bg-gray-50 rounded p-2">{rule.public_reply}</p>
            </div>
          )}
          {rule.private_message && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">📨 Private Message</p>
              <p className="text-xs text-gray-700 bg-gray-50 rounded p-2">{rule.private_message}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            {rule.create_lead && <span className="flex items-center gap-1 text-indigo-600"><Users size={10} /> Auto-creates lead</span>}
            {rule.assign_to_name && <span>Assigned to: {rule.assign_to_name}</span>}
            {rule.last_triggered_at && <span>Last: {new Date(rule.last_triggered_at).toLocaleDateString("en-IN")}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommentAutomation() {
  const { toast } = useToast();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [testComment, setTestComment] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState("all");

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/crm/comment-automation`, { credentials: "include" });
      const data = await r.json();
      if (data.ok) setRules(data.rules || []);
    } catch {
      toast({ title: "Failed to load rules", variant: "destructive" });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const deleteRule = async (id: string) => {
    if (!confirm("Delete this automation rule?")) return;
    await fetch(`${BASE_API}/api/crm/comment-automation/${id}`, { method: "DELETE", credentials: "include" });
    setRules(prev => prev.filter(r => r.id !== id));
    toast({ title: "Rule deleted" });
  };

  const toggleRule = async (rule: any) => {
    const r = await fetch(`${BASE_API}/api/crm/comment-automation/${rule.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    const data = await r.json();
    if (data.ok) {
      setRules(prev => prev.map(x => x.id === rule.id ? data.rule : x));
      toast({ title: rule.is_active ? "Rule deactivated" : "Rule activated" });
    }
  };

  const onSaved = (saved: any) => {
    if (editRule?.id) {
      setRules(prev => prev.map(r => r.id === saved.id ? saved : r));
    } else {
      setRules(prev => [saved, ...prev]);
    }
    setShowForm(false);
    setEditRule(null);
  };

  const testCommentMatch = async () => {
    if (!testComment.trim()) return;
    setTestLoading(true);
    try {
      const r = await fetch(`${BASE_API}/api/crm/comment-automation/test`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_text: testComment }),
      });
      const data = await r.json();
      setTestResult(data);
    } finally { setTestLoading(false); }
  };

  const filteredRules = filterPlatform === "all" ? rules : rules.filter(r => r.platform === filterPlatform);
  const activeCount = rules.filter(r => r.is_active).length;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Comment Automation</h1>
            <p className="text-gray-500 text-sm mt-1">
              Auto-reply to comments on social media with keyword triggers
              · <span className="text-green-600 font-medium">{activeCount} active</span> of {rules.length} rules
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRules} disabled={loading}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </Button>
            <Button size="sm" onClick={() => { setEditRule(null); setShowForm(!showForm); }}>
              <Plus size={14} className="mr-1" /> New Rule
            </Button>
          </div>
        </div>

        {/* Create / Edit Form */}
        {(showForm || editRule) && (
          <div className="mb-6">
            <RuleForm
              rule={editRule}
              onSave={onSaved}
              onCancel={() => { setShowForm(false); setEditRule(null); }}
            />
          </div>
        )}

        {/* Comment Test Panel */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2"><TestTube2 size={15} /> Test Comment Matching</h3>
          <p className="text-xs text-indigo-700 mb-3">Enter a sample comment to see which rules would trigger</p>
          <div className="flex gap-2">
            <Input
              className="flex-1 h-9 text-sm"
              placeholder="e.g. 'What is the price for Hajj package 2026?'"
              value={testComment}
              onChange={e => setTestComment(e.target.value)}
              onKeyDown={e => e.key === "Enter" && testCommentMatch()}
            />
            <Button size="sm" onClick={testCommentMatch} disabled={testLoading || !testComment.trim()}>
              {testLoading ? <RefreshCw size={13} className="animate-spin" /> : "Test"}
            </Button>
          </div>

          {testResult && (
            <div className="mt-3">
              {testResult.matched_rules?.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-white rounded-lg px-3 py-2 border border-gray-200">
                  <AlertCircle size={14} className="text-gray-400" />
                  No rules matched for: "<em>{testResult.comment_text}</em>"
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-green-700">{testResult.matched_rules.length} rule(s) matched:</p>
                  {testResult.matched_rules.map((m: any, i: number) => (
                    <div key={i} className="bg-white rounded-lg border border-green-200 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 size={14} className="text-green-600" />
                        <span className="text-sm font-medium text-gray-900">{m.rule_name}</span>
                        <Badge variant="outline" className="text-xs">{m.platform}</Badge>
                      </div>
                      {m.public_reply && (
                        <div className="text-xs mb-1">
                          <span className="text-gray-500">💬 Public: </span>
                          <span className="text-gray-700">{m.public_reply}</span>
                        </div>
                      )}
                      {m.private_message && (
                        <div className="text-xs">
                          <span className="text-gray-500">📨 DM: </span>
                          <span className="text-gray-700">{m.private_message}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Platform filter */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilterPlatform("all")}
            className={`text-xs px-3 py-1 rounded-full border ${filterPlatform === "all" ? "bg-gray-900 text-white border-gray-900" : "text-gray-600 border-gray-200 hover:border-gray-300"}`}
          >
            All platforms ({rules.length})
          </button>
          {PLATFORMS.map(p => {
            const count = rules.filter(r => r.platform === p.key).length;
            return (
              <button key={p.key} onClick={() => setFilterPlatform(p.key)}
                className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1 ${filterPlatform === p.key ? "bg-indigo-600 text-white border-indigo-600" : "text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                {p.icon} {p.label} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>

        {/* Rules list */}
        {loading && rules.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
            <p>Loading rules…</p>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
            <Zap size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No automation rules yet</p>
            <p className="text-gray-400 text-sm mt-1">Create a rule to auto-reply when users comment with specific keywords</p>
            <Button className="mt-4" onClick={() => { setEditRule(null); setShowForm(true); }}>
              <Plus size={14} className="mr-1" /> Create First Rule
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRules.map(rule => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onEdit={(r: any) => { setEditRule(r); setShowForm(false); }}
                onDelete={deleteRule}
                onToggle={toggleRule}
              />
            ))}
          </div>
        )}

        {/* Info callout */}
        <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
          <p className="font-semibold mb-1">ℹ️ How Comment Automation Works</p>
          <ul className="space-y-1 list-disc list-inside text-blue-600">
            <li>When a comment is posted on your connected Facebook/Instagram page, the webhook processes it in real-time</li>
            <li>Matching is case-insensitive. Use "any" match for broad targeting (e.g. "hajj" or "umrah")</li>
            <li>Public reply is posted as a comment reply; Private Message is sent via DM or WhatsApp</li>
            <li>Cooldown prevents spamming the same user (default 60 min between triggers per user)</li>
            <li>"Auto-create lead" saves the commenter as a CRM lead automatically</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
