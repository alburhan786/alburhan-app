import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone, RefreshCw, Star, CheckCircle2, XCircle,
  ShieldCheck, AlertTriangle, Info, Calendar, Building2,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface SenderIdRow {
  id: string;
  sender_id: string;
  status: "active" | "inactive";
  default_sender: boolean;
  header_type: string | null;
  creator: string | null;
  header_classification: string | null;
  valid_till: string | null;
  registration_date: string | null;
  operator_status: string | null;
  global_status: string | null;
  created_at: string;
  updated_at: string;
}

export default function SenderIdManager() {
  const { toast } = useToast();
  const [senderIds, setSenderIds] = useState<SenderIdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [togglingStatus, setTogglingStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/sms-settings/sender-ids`, { credentials: "include" });
      const d = await r.json();
      if (d.ok) setSenderIds(d.senderIds || []);
      else toast({ title: "Failed to load sender IDs", description: d.error, variant: "destructive" });
    } catch {
      toast({ title: "Network error", description: "Could not load sender IDs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setDefault = async (row: SenderIdRow) => {
    if (row.default_sender) return;
    setSettingDefault(row.id);
    try {
      const r = await fetch(`${API}/api/sms-settings/sender-ids/${row.id}/set-default`, {
        method: "PUT",
        credentials: "include",
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: "Default sender updated", description: `${row.sender_id} is now the default sender ID` });
        load();
      } else {
        toast({ title: "Failed", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSettingDefault(null);
    }
  };

  const toggleStatus = async (row: SenderIdRow) => {
    setTogglingStatus(row.id);
    const newStatus = row.status === "active" ? "inactive" : "active";
    try {
      const r = await fetch(`${API}/api/sms-settings/sender-ids/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      const d = await r.json();
      if (d.ok) {
        toast({ title: `Sender ID ${newStatus}`, description: `${row.sender_id} set to ${newStatus}` });
        load();
      } else {
        toast({ title: "Failed", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setTogglingStatus(null);
    }
  };

  const defaultRow = senderIds.find(s => s.default_sender);
  const activeCount = senderIds.filter(s => s.status === "active").length;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-4 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-blue-600" />
              Sender ID Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              DLT-approved sender headers registered with TRAI. All SMS must use one of these Sender IDs.
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 border border-border px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="font-semibold text-green-800">{activeCount}</span>
            <span className="text-green-700">active sender IDs</span>
          </div>
          {defaultRow && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <Star className="w-4 h-4 text-blue-600 fill-blue-600" />
              <span className="text-blue-800">Default: <span className="font-mono font-bold">{defaultRow.sender_id}</span></span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm">
            <ShieldCheck className="w-4 h-4 text-purple-600" />
            <span className="text-purple-800">Route: <span className="font-semibold">DLT Only</span></span>
          </div>
        </div>

        {/* Policy info */}
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-amber-800">
            <strong>DLT Compliance:</strong> All 5 sender IDs are registered with TRAI via Jio Trueconnect / BSNL DLT portal.
            SMS sent with any sender ID not in this list will be automatically blocked. Only <strong>active</strong> sender IDs are permitted.
          </div>
        </div>

        {/* Sender ID table */}
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="grid grid-cols-12 gap-0 bg-muted/50 border-b border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div className="col-span-2">Sender ID</div>
            <div className="col-span-2">Header Type</div>
            <div className="col-span-2">Creator</div>
            <div className="col-span-1 text-center">DLT Status</div>
            <div className="col-span-1 text-center">Operator</div>
            <div className="col-span-2 text-center">Active?</div>
            <div className="col-span-2 text-center">Default</div>
          </div>

          <div className="divide-y divide-border">
            {senderIds.map(row => (
              <div
                key={row.id}
                className={`grid grid-cols-12 gap-0 px-4 py-3 items-center transition-colors hover:bg-muted/30 ${
                  row.default_sender ? "bg-blue-50/30" : ""
                }`}
              >
                {/* Sender ID */}
                <div className="col-span-2 flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-foreground">{row.sender_id}</span>
                  {row.default_sender && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
                      <Star className="w-2.5 h-2.5 fill-blue-700" /> Default
                    </span>
                  )}
                </div>

                {/* Header Type */}
                <div className="col-span-2">
                  <div className="text-sm text-foreground">{row.header_type || "—"}</div>
                  <div className="text-xs text-muted-foreground">{row.header_classification || ""}</div>
                </div>

                {/* Creator */}
                <div className="col-span-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="w-3 h-3" />
                    <span className="truncate">{row.creator || "—"}</span>
                  </div>
                  {row.valid_till && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Calendar className="w-3 h-3" />
                      <span>Valid till {new Date(row.valid_till).toLocaleDateString("en-IN")}</span>
                    </div>
                  )}
                </div>

                {/* DLT Global Status */}
                <div className="col-span-1 flex justify-center">
                  {row.global_status === "Approved" ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Approved
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      <Info className="w-3 h-3" /> {row.global_status || "Unknown"}
                    </span>
                  )}
                </div>

                {/* Operator Status */}
                <div className="col-span-1 flex justify-center">
                  {row.operator_status === "Registered" ? (
                    <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      Registered
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                      {row.operator_status || "Unknown"}
                    </span>
                  )}
                </div>

                {/* Active toggle */}
                <div className="col-span-2 flex justify-center">
                  <button
                    onClick={() => toggleStatus(row)}
                    disabled={togglingStatus === row.id || (row.default_sender && row.status === "active")}
                    title={row.default_sender && row.status === "active" ? "Cannot deactivate the default sender ID" : `Click to ${row.status === "active" ? "deactivate" : "activate"}`}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      row.status === "active"
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-red-100 text-red-800 hover:bg-red-200"
                    }`}
                  >
                    {togglingStatus === row.id ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : row.status === "active" ? (
                      <><CheckCircle2 className="w-3 h-3" /> Active</>
                    ) : (
                      <><XCircle className="w-3 h-3" /> Inactive</>
                    )}
                  </button>
                </div>

                {/* Set as Default */}
                <div className="col-span-2 flex justify-center">
                  {row.default_sender ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                      <Star className="w-3 h-3 fill-blue-700" /> Current Default
                    </span>
                  ) : (
                    <button
                      onClick={() => setDefault(row)}
                      disabled={settingDefault === row.id || row.status !== "active"}
                      title={row.status !== "active" ? "Activate this sender ID first" : "Set as default sender ID for all SMS"}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border border-border hover:bg-muted transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {settingDefault === row.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <><Star className="w-3 h-3" /> Set Default</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info panel */}
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-blue-800 space-y-1">
            <p>
              <strong>Per-template sender IDs</strong> can be assigned in{" "}
              <a href="/admin/dlt-templates" className="underline hover:text-blue-900">DLT Template Manager</a> — each event can use a different sender ID.
            </p>
            <p>
              <strong>Changing the default</strong> also updates the global Fast2SMS sender_id in API Settings automatically.
            </p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
