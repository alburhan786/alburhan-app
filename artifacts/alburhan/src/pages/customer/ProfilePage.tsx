import { useState, useEffect } from "react";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { CheckCircle, Clock, XCircle, Edit3, Save, X } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const EDITABLE_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "full_name", label: "Full Name" },
  { key: "email", label: "Email", type: "email" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "address", label: "Address" },
  { key: "blood_group", label: "Blood Group" },
  { key: "emergency_contact_name", label: "Emergency Contact Name" },
  { key: "emergency_contact_mobile", label: "Emergency Contact Mobile", type: "tel" },
];

function statusIcon(s: string) {
  if (s === "approved") return <CheckCircle size={14} className="text-green-500" />;
  if (s === "rejected") return <XCircle size={14} className="text-red-500" />;
  return <Clock size={14} className="text-amber-500" />;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [editRequests, setEditRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [ovRes, erRes] = await Promise.all([
        fetch(`${API}/api/customer/overview`, { credentials: "include" }),
        fetch(`${API}/api/customer/profile/edit-requests`, { credentials: "include" }),
      ]);
      if (ovRes.ok) { const d = await ovRes.json(); setProfile(d.profile); }
      if (erRes.ok) { const d = await erRes.json(); setEditRequests(d.requests || []); }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function startEdit() {
    if (!profile) return;
    const init: Record<string, string> = {};
    EDITABLE_FIELDS.forEach(f => { init[f.key] = profile[f.key] ?? ""; });
    setFormValues(init);
    setEditing(true);
  }

  async function submitChanges() {
    const changed = EDITABLE_FIELDS.filter(f => formValues[f.key] !== (profile?.[f.key] ?? ""));
    if (!changed.length) { setEditing(false); return; }

    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/customer/profile/edit-request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: changed.map(f => ({ field_name: f.key, new_value: formValues[f.key] })),
        }),
      });
      if (r.ok) {
        toast({ title: "Request submitted", description: "Your changes will be reviewed by our team." });
        setEditing(false);
        load();
      } else {
        toast({ title: "Error", description: "Failed to submit changes", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const hasPending = editRequests.some(r => r.status === "pending");

  return (
    <CustomerPortalLayout title="My Profile">
      <div className="space-y-5">
        {/* Profile card */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-800">Personal Information</h2>
            {!editing && (
              <Button size="sm" variant="outline" onClick={startEdit}
                disabled={hasPending}>
                <Edit3 size={15} className="mr-1" />
                {hasPending ? "Pending review" : "Edit"}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : editing ? (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {EDITABLE_FIELDS.map(f => (
                  <div key={f.key}>
                    <Label className="text-xs text-slate-500 mb-1 block">{f.label}</Label>
                    <Input
                      type={f.type || "text"}
                      value={formValues[f.key] || ""}
                      onChange={e => setFormValues(v => ({ ...v, [f.key]: e.target.value }))}
                      className="h-9 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={submitChanges} disabled={submitting} className="h-9 bg-emerald-600 hover:bg-emerald-700">
                  <Save size={15} className="mr-1" />
                  {submitting ? "Submitting…" : "Submit for Review"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)} className="h-9">
                  <X size={15} className="mr-1" />Cancel
                </Button>
              </div>
              <p className="text-xs text-slate-400">Changes require admin approval before taking effect.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {[
                { label: "Full Name", value: profile?.full_name },
                { label: "Mobile", value: profile?.mobile },
                { label: "Email", value: profile?.email },
                { label: "City", value: profile?.city },
                { label: "State", value: profile?.state },
                { label: "Address", value: profile?.address },
                { label: "Blood Group", value: profile?.blood_group },
                { label: "Emergency Contact", value: profile?.emergency_contact_name },
                { label: "Emergency Mobile", value: profile?.emergency_contact_mobile },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-xs text-slate-400">{item.label}</p>
                  <p className="text-sm font-medium text-slate-800 mt-0.5">{item.value || "—"}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Edit requests history */}
        {editRequests.length > 0 && (
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Change Requests</h3>
            <div className="space-y-3">
              {editRequests.map(r => (
                <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  {statusIcon(r.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-700 capitalize">
                        {r.field_name.replace(/_/g, " ")}
                      </p>
                      <Badge className={
                        r.status === "approved" ? "bg-green-100 text-green-700 text-[10px]" :
                        r.status === "rejected" ? "bg-red-100 text-red-700 text-[10px]" :
                        "bg-amber-100 text-amber-700 text-[10px]"
                      } variant="outline">
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <span className="line-through text-slate-400">{r.old_value || "—"}</span>
                      {" → "}
                      <span className="text-slate-700">{r.new_value}</span>
                    </p>
                    {r.notes && <p className="text-xs text-slate-400 mt-0.5">{r.notes}</p>}
                  </div>
                  <p className="text-[11px] text-slate-400 shrink-0">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </CustomerPortalLayout>
  );
}
