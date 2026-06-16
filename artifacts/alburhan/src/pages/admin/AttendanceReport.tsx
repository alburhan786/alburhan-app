import { useState, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, Users, CheckCircle2, XCircle, AlertCircle, QrCode, ChevronDown, ChevronRight } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

function StatusPill({ status }: { status: string }) {
  if (status === "complete") return <Badge className="bg-emerald-500 text-white text-xs">Complete ✓</Badge>;
  if (status === "missing") return <Badge className="bg-red-500 text-white text-xs">Missing ✗</Badge>;
  return <Badge className="bg-amber-500 text-white text-xs">Partial</Badge>;
}

export default function AttendanceReport() {
  const [, params] = useRoute("/admin/groups/:groupId/attendance/:eventId/report");
  const groupId = params?.groupId;
  const eventId = params?.eventId;
  const { toast } = useToast();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "missing" | "partial">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [eventName, setEventName] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, eventsRes] = await Promise.all([
        fetch(`${API}/api/groups/${groupId}/attendance/events/${eventId}/summary`, { credentials: "include" }),
        fetch(`${API}/api/groups/${groupId}/attendance/events`, { credentials: "include" }),
      ]);
      const summaryData = await summaryRes.json();
      const eventsData = await eventsRes.json();
      setData(summaryData);
      const ev = eventsData.find((e: any) => e.id === eventId);
      if (ev) setEventName(ev.name);
    } catch {
      toast({ title: "Failed to load report", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [groupId, eventId, toast]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/attendance/events/${eventId}/export`, { credentials: "include" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${eventName || "attendance"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleMarkAll = async () => {
    if (!confirm("Mark all pilgrims as present for this event?")) return;
    setMarkingAll(true);
    try {
      await fetch(`${API}/api/groups/${groupId}/attendance/events/${eventId}/mark-all-present`, {
        method: "POST",
        credentials: "include",
      });
      await fetchSummary();
      toast({ title: "All marked as present" });
    } catch {
      toast({ title: "Failed", variant: "destructive" });
    } finally {
      setMarkingAll(false);
    }
  };

  const toggleExpand = (familyId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(familyId)) next.delete(familyId);
      else next.add(familyId);
      return next;
    });
  };

  const filteredRows = data?.rows?.filter((row: any) => {
    if (filter === "all") return true;
    if (filter === "missing") return row.status === "missing";
    if (filter === "partial") return row.status === "partial" || row.status === "missing";
    return true;
  }) || [];

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href={`/admin/groups/${groupId}/attendance`}>
          <Button variant="ghost" size="sm" className="gap-1 mb-2">
            <ArrowLeft size={16} /> Back to Events
          </Button>
        </Link>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">Attendance Report</h1>
            <p className="text-muted-foreground mt-1">{eventName}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href={`/admin/groups/${groupId}/attendance/${eventId}/scan`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <QrCode size={13} /> Scanner
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleMarkAll} disabled={markingAll}>
              <CheckCircle2 size={13} /> {markingAll ? "Marking…" : "Mark All Present"}
            </Button>
            <Button size="sm" className="gap-1.5 bg-[#0d5040] hover:bg-[#0d5040]/90" onClick={handleExport} disabled={exporting}>
              <Download size={13} /> {exporting ? "Exporting…" : "Export Excel"}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground animate-pulse">Loading report…</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border rounded-xl p-4 bg-white text-center shadow-sm">
              <div className="text-2xl font-bold text-[#0d5040]">{data?.presentCount ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-500" /> Present
              </div>
            </div>
            <div className="border rounded-xl p-4 bg-white text-center shadow-sm">
              <div className="text-2xl font-bold text-red-500">{data?.missingCount ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <XCircle size={12} className="text-red-400" /> Missing
              </div>
            </div>
            <div className="border rounded-xl p-4 bg-white text-center shadow-sm">
              <div className="text-2xl font-bold">{data?.totalCount ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <Users size={12} /> Total
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 mb-4 border-b">
            {(["all", "missing", "partial"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                  filter === f ? "border-[#0d5040] text-[#0d5040]" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "partial" ? "Incomplete" : f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "missing" && data?.rows && (
                  <span className="ml-1 bg-red-100 text-red-600 text-xs rounded-full px-1.5">
                    {data.rows.filter((r: any) => r.status === "missing").length}
                  </span>
                )}
                {f === "partial" && data?.rows && (
                  <span className="ml-1 bg-amber-100 text-amber-600 text-xs rounded-full px-1.5">
                    {data.rows.filter((r: any) => r.status === "missing" || r.status === "partial").length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Family Table */}
          <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Family</th>
                  <th className="text-center px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Members</th>
                  <th className="text-center px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Present</th>
                  <th className="text-center px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Missing</th>
                  <th className="text-center px-3 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">No results for this filter</td>
                  </tr>
                ) : (
                  filteredRows.map((row: any) => (
                    <>
                      <tr
                        key={row.familyId}
                        onClick={() => toggleExpand(row.familyId)}
                        className={`border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                          row.status === "missing" ? "bg-red-50/50" : row.status === "partial" ? "bg-amber-50/30" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {expanded.has(row.familyId) ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                            <div>
                              <p className="font-medium leading-snug">{row.headName || "—"}</p>
                              <p className="text-xs text-muted-foreground">{row.familyId?.startsWith("solo_") ? "Solo pilgrim" : `Family ${row.familyId}`}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center px-3 py-3 text-muted-foreground">{row.total}</td>
                        <td className="text-center px-3 py-3 text-emerald-600 font-semibold">{row.present}</td>
                        <td className={`text-center px-3 py-3 font-semibold ${row.missing > 0 ? "text-red-500" : "text-muted-foreground"}`}>{row.missing}</td>
                        <td className="text-center px-3 py-3"><StatusPill status={row.status} /></td>
                      </tr>

                      {expanded.has(row.familyId) && row.members.map((m: any) => (
                        <tr key={m.id} className="border-b bg-gray-50/50">
                          <td className="pl-12 pr-4 py-2.5 text-sm text-muted-foreground" colSpan={4}>
                            <span className={m.attendanceStatus === "present" ? "text-emerald-700" : "text-red-500"}>
                              {m.attendanceStatus === "present" ? "✓" : "✗"} {m.fullName}
                            </span>
                            {m.familyHead && <span className="ml-2 text-xs bg-[#0d5040]/10 text-[#0d5040] rounded px-1.5 py-0.5">Head</span>}
                          </td>
                          <td className="text-center px-3 py-2.5">
                            {m.attendanceStatus === "present"
                              ? <Badge className="bg-emerald-100 text-emerald-700 text-xs border-0">Present</Badge>
                              : <Badge className="bg-red-100 text-red-600 text-xs border-0">Missing</Badge>}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredRows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3 text-right">
              Showing {filteredRows.length} {filteredRows.length === 1 ? "family" : "families"}
            </p>
          )}
        </>
      )}
    </AdminLayout>
  );
}
