import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, RefreshCw, AlertTriangle, CheckCircle2, Clock, Upload, FolderOpen, FileCheck } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function DocumentsDashboard() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetch(`${API}/api/documents`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
      setDocs(Array.isArray(d) ? d : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const now = new Date();
  const expiringSoon = docs.filter(d => {
    const exp = new Date(d.expiry_date || d.expires_at || 0);
    const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  }).length;
  const expired = docs.filter(d => {
    const exp = new Date(d.expiry_date || d.expires_at || 0);
    return exp < now && d.expiry_date;
  }).length;
  const valid = docs.length - expired;

  const TYPE_LABELS: Record<string, string> = {
    passport: "Passport",
    visa: "Visa",
    id_card: "ID Card",
    medical: "Medical",
    agreement: "Agreement",
    other: "Other",
  };

  const typeMap: Record<string, number> = {};
  for (const d of docs) {
    const t = d.document_type || d.type || "other";
    typeMap[t] = (typeMap[t] || 0) + 1;
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><FileText size={18} className="text-primary" /></div>
              Document Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Centralized document hub — passports, visas, agreements, and expiry tracking</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <Link href="/admin/document-expiry"><Button size="sm" className="gap-1.5"><AlertTriangle size={13} /> Expiry Tracker</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: FileText,    label: "Total Documents",  val: docs.length,    color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: CheckCircle2,label: "Valid",            val: valid,          color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Clock,       label: "Expiring (30d)",   val: expiringSoon,   color: "bg-amber-50 border-amber-200 text-amber-700" },
            { icon: AlertTriangle,label: "Expired",         val: expired,        color: "bg-red-50 border-red-200 text-red-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">Documents by Type</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : Object.keys(typeMap).length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(typeMap).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm">{TYPE_LABELS[type] || type}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-full bg-primary/20 w-24 overflow-hidden">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (count / docs.length) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold text-sm mb-3">Recent Documents</h2>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : docs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet</p>
            ) : (
              <div className="space-y-2">
                {docs.slice(0, 6).map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{d.title || d.document_name || `Document ${i + 1}`}</p>
                      <p className="text-xs text-muted-foreground">{d.document_type || d.type || "—"} • {d.customer_name || d.pilgrim_name || "—"}</p>
                    </div>
                    <Badge variant="outline" className={`text-xs ${new Date(d.expiry_date || 0) < now && d.expiry_date ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {new Date(d.expiry_date || 0) < now && d.expiry_date ? "Expired" : "Valid"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Expiry Tracker", href: "/admin/document-expiry", icon: AlertTriangle },
            { label: "Agreements", href: "/admin/agreements", icon: FileCheck },
            { label: "Visa Tracker", href: "/admin/visa", icon: FolderOpen },
            { label: "Print Center", href: "/admin/print-center", icon: Upload },
          ].map(a => (
            <Link key={a.href} href={a.href}>
              <div className="rounded-xl border bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-3">
                <a.icon size={16} className="text-primary" />
                <span className="text-sm font-medium">{a.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
