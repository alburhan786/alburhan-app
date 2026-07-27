// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, RefreshCw, UserCheck, Settings, ArrowUpDown,
  CheckCircle, Users, Zap, Target, Globe, Info,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const fmt = (s:string) => s?.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())||"";

async function apiFetch(url:string, opts:RequestInit={}) {
  const r = await fetch(`${API}${url}`, { credentials:"include", ...opts });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error||e.message||`HTTP ${r.status}`); }
  return r.json();
}

const METHODS = [
  { value:"round_robin", label:"Round Robin", desc:"Distribute evenly across team members" },
  { value:"least_active", label:"Least Active", desc:"Assign to member with fewest open leads" },
  { value:"specific_user", label:"Specific User", desc:"Always assign to one person" },
];

const SOURCE_OPTIONS = [
  "whatsapp","facebook","facebook_lead_ad","instagram","instagram_lead_ad",
  "facebook_messenger","instagram_dm","website","google_business","email","phone","referral","manual",
];

const PACKAGE_OPTIONS = [
  "Hajj","Umrah","Ramadan Umrah","Ziyarat","Air Ticket","Visa",
];

// ── Rule Form ──────────────────────────────────────────────────────────────────
function RuleForm({ initial, onSave, onCancel, saving, users }:{
  initial?:any; onSave:(d:any)=>void; onCancel:()=>void; saving:boolean; users:any[];
}) {
  const [form, setForm] = useState({
    rule_name: initial?.rule_name||"",
    priority: initial?.priority||10,
    method: initial?.method||"round_robin",
    sla_minutes: initial?.sla_minutes||120,
    is_active: initial?.is_active!==false,
    assign_to_user_id: initial?.assign_to_user_id||"",
    assign_to_branch: initial?.assign_to_branch||"",
    team_user_ids: initial?.team_user_ids||[],
    conditions: {
      source: initial?.conditions?.source||"",
      package: initial?.conditions?.package||"",
      city: initial?.conditions?.city||"",
      state: initial?.conditions?.state||"",
    },
  });

  const set = (k:string, v:any) => setForm(f=>({...f,[k]:v}));
  const setCond = (k:string, v:any) => setForm(f=>({...f,conditions:{...f.conditions,[k]:v}}));

  const toggleTeamMember = (uid:string) => {
    setForm(f=>({...f, team_user_ids: f.team_user_ids.includes(uid)
      ? f.team_user_ids.filter((id:string)=>id!==uid)
      : [...f.team_user_ids, uid]
    }));
  };

  return (
    <div className="rounded-2xl border bg-background p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Settings size={16}/></div>
        <h3 className="font-bold text-base">{initial?"Edit Rule":"New Assignment Rule"}</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs font-semibold">Rule Name *</Label>
          <Input value={form.rule_name} onChange={e=>set("rule_name",e.target.value)} placeholder="e.g. Hajj Team, Mumbai Branch" className="h-9"/>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Priority</Label>
          <Input type="number" value={form.priority} onChange={e=>set("priority",parseInt(e.target.value)||10)} className="h-9"/>
          <p className="text-[10px] text-muted-foreground">Lower = higher priority. First matching rule wins.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">SLA (minutes)</Label>
          <Input type="number" value={form.sla_minutes} onChange={e=>set("sla_minutes",parseInt(e.target.value)||120)} className="h-9"/>
          <p className="text-[10px] text-muted-foreground">Alert if lead not contacted within this time</p>
        </div>

        {/* Method */}
        <div className="col-span-2 space-y-2">
          <Label className="text-xs font-semibold">Assignment Method</Label>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(m=>(
              <button key={m.value} type="button" onClick={()=>set("method",m.value)}
                className={`p-3 rounded-xl border text-left transition-all ${form.method===m.value?"border-primary bg-primary/5":"hover:bg-muted"}`}>
                <div className="text-xs font-bold">{m.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Team members for round_robin / least_active */}
        {(form.method==="round_robin"||form.method==="least_active") && (
          <div className="col-span-2 space-y-2">
            <Label className="text-xs font-semibold">Team Members</Label>
            {users.length===0 ? (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-3">No staff users found. Add admin/sales users first.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {users.map((u:any)=>(
                  <label key={u.id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${form.team_user_ids.includes(u.id)?"border-primary bg-primary/5":""}`}>
                    <input type="checkbox" checked={form.team_user_ids.includes(u.id)} onChange={()=>toggleTeamMember(u.id)} className="rounded"/>
                    <div>
                      <div className="text-xs font-medium">{u.name||"Unnamed"}</div>
                      <div className="text-[10px] text-muted-foreground">{fmt(u.admin_role)}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Specific user */}
        {form.method==="specific_user" && (
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-semibold">Assign To</Label>
            <select value={form.assign_to_user_id} onChange={e=>set("assign_to_user_id",e.target.value)} className="w-full h-9 rounded-xl border bg-background px-3 text-sm">
              <option value="">— Select user —</option>
              {users.map((u:any)=><option key={u.id} value={u.id}>{u.name||"Unnamed"} ({fmt(u.admin_role)})</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Branch (optional)</Label>
          <Input value={form.assign_to_branch} onChange={e=>set("assign_to_branch",e.target.value)} placeholder="Burhanpur Branch" className="h-9"/>
        </div>

        {/* Conditions */}
        <div className="col-span-2">
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Target size={12}/> Matching Conditions (leave blank = match all)</p>
          <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-xl p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Source</Label>
              <select value={form.conditions.source} onChange={e=>setCond("source",e.target.value)} className="w-full h-8 rounded-lg border bg-background px-2 text-xs">
                <option value="">Any source</option>
                {SOURCE_OPTIONS.map(s=><option key={s} value={s}>{fmt(s)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Package Interest contains</Label>
              <select value={form.conditions.package} onChange={e=>setCond("package",e.target.value)} className="w-full h-8 rounded-lg border bg-background px-2 text-xs">
                <option value="">Any package</option>
                {PACKAGE_OPTIONS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">City contains</Label>
              <Input value={form.conditions.city} onChange={e=>setCond("city",e.target.value)} placeholder="Mumbai, Delhi…" className="h-8 text-xs"/>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State contains</Label>
              <Input value={form.conditions.state} onChange={e=>setCond("state",e.target.value)} placeholder="Maharashtra…" className="h-8 text-xs"/>
            </div>
          </div>
        </div>

        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" id="is_active" checked={form.is_active} onChange={e=>set("is_active",e.target.checked)} className="rounded"/>
          <label htmlFor="is_active" className="text-sm cursor-pointer">Rule is active</label>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={()=>onSave(form)} disabled={saving||!form.rule_name.trim()} className="gap-1.5">
          {saving&&<RefreshCw size={12} className="animate-spin"/>}
          {initial?"Update Rule":"Create Rule"}
        </Button>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AssignmentRules() {
  const { toast } = useToast();
  const [rules, setRules] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesD, usersD] = await Promise.all([
        apiFetch("/api/leads/assignment-rules"),
        apiFetch("/api/admin/users?limit=100").catch(()=>({ users:[] })),
      ]);
      setRules(rulesD.rules||[]);
      // Only show staff with names
      const staffUsers = (usersD.users||[]).filter((u:any)=>u.name&&u.is_active);
      setUsers(staffUsers);
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setLoading(false);
  },[toast]);

  useEffect(()=>{ load(); },[load]);

  const saveRule = async (form:any) => {
    setSaving(true);
    try {
      const body = {
        ...form,
        conditions: Object.fromEntries(Object.entries(form.conditions).filter(([,v])=>v)),
      };
      if (editRule) {
        await apiFetch(`/api/leads/assignment-rules/${editRule.id}`,{
          method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body),
        });
        toast({ title:"Rule updated" });
      } else {
        await apiFetch("/api/leads/assignment-rules",{
          method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body),
        });
        toast({ title:"Rule created" });
      }
      setShowForm(false); setEditRule(null); load();
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
    setSaving(false);
  };

  const deleteRule = async (id:string) => {
    if (!confirm("Delete this assignment rule?")) return;
    try {
      await apiFetch(`/api/leads/assignment-rules/${id}`,{ method:"DELETE" });
      toast({ title:"Rule deleted" });
      load();
    } catch(e:any){ toast({ title:"Error", description:e.message, variant:"destructive" }); }
  };

  const toggleActive = async (rule:any) => {
    try {
      await apiFetch(`/api/leads/assignment-rules/${rule.id}`,{
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ is_active: !rule.is_active }),
      });
      setRules(rs=>rs.map(r=>r.id===rule.id?{...r,is_active:!r.is_active}:r));
    } catch {}
  };

  const methodIcon:Record<string,string> = { round_robin:"🔄", least_active:"📊", specific_user:"👤" };

  return (
    <AdminLayout>
      <div className="space-y-5 p-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Lead Assignment Rules</h1>
            <p className="text-sm text-muted-foreground">Automatic lead routing based on source, package, city, and more</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={load}><RefreshCw size={13}/> Refresh</Button>
            <Button size="sm" className="h-8 gap-1.5" onClick={()=>{ setEditRule(null); setShowForm(v=>!v); }}>
              <Plus size={13}/> New Rule
            </Button>
          </div>
        </div>

        {/* Info banner */}
        <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 flex gap-3">
          <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5"/>
          <div className="text-sm text-blue-800">
            <strong>How it works:</strong> Rules are evaluated by priority (lowest number first). The first matching rule assigns the lead.
            If no rule matches, the lead is assigned to the most active admin. SLA alerts fire when leads are uncontacted past the time limit.
          </div>
        </div>

        {/* Form */}
        {(showForm||editRule) && (
          <RuleForm
            initial={editRule}
            onSave={saveRule}
            onCancel={()=>{ setShowForm(false); setEditRule(null); }}
            saving={saving}
            users={users}
          />
        )}

        {/* Rules list */}
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground"><RefreshCw size={22} className="animate-spin mr-2"/>Loading…</div>
        ) : rules.length===0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center">
            <UserCheck size={40} className="mx-auto mb-3 opacity-20"/>
            <p className="font-semibold text-muted-foreground">No assignment rules yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create rules to automatically route leads to the right team members</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={()=>setShowForm(true)}><Plus size={13}/> Create First Rule</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.sort((a:any,b:any)=>a.priority-b.priority).map((rule:any)=>(
              <div key={rule.id} className={`rounded-2xl border bg-background p-4 ${!rule.is_active?"opacity-60":""}`}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
                    {methodIcon[rule.method]||"📋"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{rule.rule_name}</span>
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">Priority {rule.priority}</span>
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{fmt(rule.method)}</span>
                      {rule.is_active
                        ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Active</span>
                        : <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Inactive</span>
                      }
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1.5">
                      {rule.team_user_ids?.length>0 && <span>👥 {rule.team_user_ids.length} team members</span>}
                      {rule.sla_minutes && <span>⏱️ SLA: {rule.sla_minutes}min</span>}
                      {rule.assign_to_branch && <span>🏢 {rule.assign_to_branch}</span>}
                    </div>

                    {/* Conditions */}
                    {rule.conditions && Object.entries(rule.conditions).filter(([,v])=>v).length>0 && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {Object.entries(rule.conditions).filter(([,v])=>v).map(([k,v])=>(
                          <span key={k} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                            {fmt(k)}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button onClick={()=>toggleActive(rule)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${rule.is_active?"bg-green-50 text-green-700 border-green-200":"bg-gray-100 text-gray-500"}`}>
                      {rule.is_active?"Disable":"Enable"}
                    </button>
                    <button onClick={()=>{ setEditRule(rule); setShowForm(false); }}
                      className="text-xs px-2.5 py-1 rounded-lg border hover:bg-muted transition-colors">Edit</button>
                    <button onClick={()=>deleteRule(rule.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
