import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  Star, AlertTriangle, CheckCircle, Clock, Users, TrendingUp,
  Filter, ChevronRight, X, MessageSquare, RefreshCw, BarChart2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "";

interface Feedback {
  id: string;
  pilgrimMobile: string;
  pilgrimName: string | null;
  bookingId: string | null;
  companyId: string | null;
  groupName: string | null;
  ratingOverall: number | null;
  ratingAccommodationMakkah1: number | null;
  ratingAccommodationMakkah2: number | null;
  ratingAccommodationMadinah: number | null;
  ratingTransportation: number | null;
  ratingFood: number | null;
  ratingGuide: number | null;
  ratingVisaDocumentation: number | null;
  comment: string | null;
  whatDidYouLike: string | null;
  suggestions: string | null;
  wouldRecommend: string | null;
  isComplaint: boolean;
  status: "open" | "in_progress" | "resolved";
  assignedTo: string | null;
  internalNotes: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  avgRating: string | null;
  complaintsCount: number;
  openComplaints: number;
  inProgressComplaints: number;
  resolved: number;
  resolvedToday: number;
  ratingDistribution: { rating: number; cnt: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700 border-red-200",
  in_progress: "bg-amber-100 text-amber-700 border-amber-200",
  resolved: "bg-green-100 text-green-700 border-green-200",
};

function StarDisplay({ value, small }: { value: number | null; small?: boolean }) {
  if (!value) return <span className="text-gray-400 text-xs">N/A</span>;
  const size = small ? 12 : 16;
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} fill={n <= value ? "#F59E0B" : "none"} stroke={n <= value ? "#F59E0B" : "#D1D5DB"} />
      ))}
      <span className={`ml-1 font-medium ${small ? "text-xs" : "text-sm"} text-gray-600`}>{value}/5</span>
    </span>
  );
}

function RatingBar({ label, cnt, max }: { label: string; cnt: number; max: number }) {
  const pct = max > 0 ? (cnt / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium w-8 text-gray-600">{label}★</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-6 text-right">{cnt}</span>
    </div>
  );
}

function DetailDrawer({ feedback, onClose, onUpdate }: { feedback: Feedback; onClose: () => void; onUpdate: () => void }) {
  const [assignedTo, setAssignedTo] = useState(feedback.assignedTo || "");
  const [notes, setNotes] = useState(feedback.internalNotes || "");
  const [saving, setSaving] = useState(false);

  const STAFF = ["Md. Shoaib", "Aslam Khan", "Irfan Bhai", "Manager", "Other"];
  const CATEGORY_LABELS: Record<string, string> = {
    ratingAccommodationMakkah1: "Accommodation (Aziziah)",
    ratingAccommodationMakkah2: "Accommodation (Makkah 2)",
    ratingAccommodationMadinah: "Accommodation (Madinah)",
    ratingTransportation: "Transportation",
    ratingFood: "Food & Meals",
    ratingGuide: "Guide / Tour Leader",
    ratingVisaDocumentation: "Visa & Documentation",
    ratingOverall: "Overall Experience",
  };

  async function updateStatus(status: string) {
    setSaving(true);
    try {
      await fetch(`${API}/api/feedback/admin/${feedback.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      onUpdate();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await fetch(`${API}/api/feedback/admin/${feedback.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assignedTo, internalNotes: notes }),
      });
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-bold text-lg">{feedback.pilgrimName || "Anonymous Pilgrim"}</h3>
            <p className="text-sm text-gray-500">{feedback.pilgrimMobile}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_COLORS[feedback.status]}`}>
              {STATUS_LABELS[feedback.status]}
            </span>
            {feedback.isComplaint && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-red-50 text-red-600 border-red-200">
                ⚠ Complaint
              </span>
            )}
            {feedback.bookingId && (
              <span className="text-xs font-mono px-3 py-1 rounded-full border bg-gray-50 text-gray-600">
                {feedback.bookingId}
              </span>
            )}
            {feedback.groupName && (
              <span className="text-xs px-3 py-1 rounded-full border bg-blue-50 text-blue-600 border-blue-200">
                {feedback.groupName}
              </span>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Ratings</p>
            <div className="space-y-2">
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                const val = feedback[key as keyof Feedback] as number | null;
                if (!val) return null;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{label}</span>
                    <StarDisplay value={val} small />
                  </div>
                );
              })}
            </div>
          </div>

          {feedback.whatDidYouLike && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">What They Liked</p>
              <p className="text-sm bg-green-50 rounded-lg p-3 text-gray-700">{feedback.whatDidYouLike}</p>
            </div>
          )}

          {(feedback.comment || feedback.suggestions) && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Comments / Suggestions</p>
              <p className="text-sm bg-amber-50 rounded-lg p-3 text-gray-700">{feedback.comment || feedback.suggestions}</p>
            </div>
          )}

          {feedback.wouldRecommend && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Would recommend?</span>
              <span className={`text-sm font-semibold ${feedback.wouldRecommend === "yes" ? "text-green-600" : feedback.wouldRecommend === "no" ? "text-red-600" : "text-amber-600"}`}>
                {feedback.wouldRecommend === "yes" ? "✓ Yes" : feedback.wouldRecommend === "no" ? "✗ No" : "Maybe"}
              </span>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Assign To</p>
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-600"
            >
              <option value="">Unassigned</option>
              {STAFF.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Internal Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add internal notes for your team..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-600 resize-none"
            />
            <Button size="sm" onClick={saveNotes} disabled={saving} className="mt-2 bg-green-700 hover:bg-green-800 text-white">
              {saving ? "Saving..." : "Save Notes"}
            </Button>
          </div>

          <div className="text-xs text-gray-400">
            Submitted: {new Date(feedback.createdAt).toLocaleString("en-IN")}
          </div>
        </div>

        {feedback.isComplaint && feedback.status !== "resolved" && (
          <div className="p-5 border-t bg-gray-50 space-y-2">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Update Status</p>
            <div className="flex gap-2">
              {feedback.status === "open" && (
                <Button
                  size="sm"
                  onClick={() => updateStatus("in_progress")}
                  disabled={saving}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Mark In Progress
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => updateStatus("resolved")}
                disabled={saving}
                className="flex-1 bg-green-700 hover:bg-green-800 text-white"
              >
                Mark Resolved
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FeedbackManager() {
  type TabId = "overview" | "list" | "complaints";
  const [tab, setTab] = useState<TabId>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Feedback | null>(null);
  const [filters, setFilters] = useState({ status: "", companyId: "", isComplaint: "", minRating: "" });

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/feedback/admin/stats`, { credentials: "include" });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  const fetchList = useCallback(async (complaintsOnly = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (complaintsOnly) params.set("isComplaint", "true");
      else {
        if (filters.status) params.set("status", filters.status);
        if (filters.companyId) params.set("companyId", filters.companyId);
        if (filters.isComplaint) params.set("isComplaint", filters.isComplaint);
        if (filters.minRating) params.set("minRating", filters.minRating);
      }
      params.set("limit", "100");
      const r = await fetch(`${API}/api/feedback/admin/list?${params}`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setFeedbackList(data.data);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (tab === "list") fetchList(false);
    if (tab === "complaints") fetchList(true);
    if (tab === "overview") fetchList(false);
  }, [tab, fetchList]);

  const maxRatingCount = stats ? Math.max(...stats.ratingDistribution.map(r => Number(r.cnt))) : 0;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Feedback & Complaints</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage pilgrim feedback and resolve complaints</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchStats(); if (tab !== "overview") fetchList(tab === "complaints"); }}
            className="gap-2"
          >
            <RefreshCw size={14} />
            Refresh
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={16} className="text-blue-500" />
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Feedback</span>
              </div>
              <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Star size={16} className="text-amber-500" />
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Avg Rating</span>
              </div>
              <p className="text-3xl font-bold text-gray-800">{stats.avgRating ? `${stats.avgRating}★` : "N/A"}</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-500" />
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Open Complaints</span>
              </div>
              <p className="text-3xl font-bold text-red-600">{stats.openComplaints}</p>
              <p className="text-xs text-gray-400 mt-1">{stats.complaintsCount} total complaints</p>
            </div>
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Resolved</span>
              </div>
              <p className="text-3xl font-bold text-green-600">{stats.resolved}</p>
              <p className="text-xs text-gray-400 mt-1">{stats.resolvedToday} today</p>
            </div>
          </div>
        )}

        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { id: "overview", label: "Overview", icon: BarChart2 },
            { id: "list", label: "All Feedback", icon: MessageSquare },
            { id: "complaints", label: "Complaints", icon: AlertTriangle },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as TabId)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? "bg-white shadow-sm text-primary" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <t.icon size={15} />
              {t.label}
              {t.id === "complaints" && stats && stats.openComplaints > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {stats.openComplaints}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "overview" && stats && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-amber-500" />
                Rating Distribution
              </h3>
              <div className="space-y-3">
                {[5, 4, 3, 2, 1].map(r => {
                  const row = stats.ratingDistribution.find(d => d.rating === r);
                  return (
                    <RatingBar key={r} label={String(r)} cnt={Number(row?.cnt || 0)} max={maxRatingCount} />
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border shadow-sm p-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Clock size={16} className="text-blue-500" />
                Complaint Pipeline
              </h3>
              <div className="space-y-4">
                {[
                  { label: "Open", count: stats.openComplaints, color: "bg-red-500", textColor: "text-red-600" },
                  { label: "In Progress", count: stats.inProgressComplaints, color: "bg-amber-500", textColor: "text-amber-600" },
                  { label: "Resolved", count: stats.resolved, color: "bg-green-500", textColor: "text-green-600" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 w-24">{item.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color}`}
                        style={{ width: `${stats.complaintsCount > 0 ? (item.count / stats.complaintsCount) * 100 : 0}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold ${item.textColor} w-6 text-right`}>{item.count}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Submissions</h4>
                {feedbackList.slice(0, 5).map(fb => (
                  <div key={fb.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{fb.pilgrimName || fb.pilgrimMobile}</p>
                      <p className="text-xs text-gray-400">{new Date(fb.createdAt).toLocaleDateString("en-IN")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarDisplay value={fb.ratingOverall} small />
                      {fb.isComplaint && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Complaint</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {(tab === "list" || tab === "complaints") && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {tab === "list" && (
              <div className="p-4 border-b flex flex-wrap gap-3 items-center">
                <Filter size={15} className="text-gray-400" />
                <select
                  value={filters.status}
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-green-600"
                >
                  <option value="">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <select
                  value={filters.companyId}
                  onChange={e => setFilters(f => ({ ...f, companyId: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-green-600"
                >
                  <option value="">All Companies</option>
                  <option value="alburhan">Al Burhan</option>
                  <option value="horizon">Horizon</option>
                </select>
                <select
                  value={filters.isComplaint}
                  onChange={e => setFilters(f => ({ ...f, isComplaint: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-green-600"
                >
                  <option value="">All Types</option>
                  <option value="true">Complaints Only</option>
                  <option value="false">Positive Only</option>
                </select>
                <select
                  value={filters.minRating}
                  onChange={e => setFilters(f => ({ ...f, minRating: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-green-600"
                >
                  <option value="">Min Rating</option>
                  <option value="5">5★ Only</option>
                  <option value="4">4★ & above</option>
                  <option value="3">3★ & above</option>
                  <option value="2">2★ & above</option>
                </select>
                <span className="text-sm text-gray-400 ml-auto">{total} records</span>
              </div>
            )}

            {loading ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : feedbackList.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">No feedback found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pilgrim</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Booking</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rating</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Comment</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {feedbackList.map(fb => (
                      <tr
                        key={fb.id}
                        onClick={() => setSelected(fb)}
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${fb.isComplaint ? "bg-red-50/30" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{fb.pilgrimName || "Anonymous"}</div>
                          <div className="text-xs text-gray-400">{fb.pilgrimMobile}</div>
                          {fb.isComplaint && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 mt-0.5">
                              <AlertTriangle size={10} /> Complaint
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {fb.bookingId ? (
                            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{fb.bookingId}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                          {fb.groupName && <div className="text-xs text-gray-400 mt-1">{fb.groupName}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <StarDisplay value={fb.ratingOverall} small />
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-gray-600 text-xs line-clamp-2">{fb.comment || fb.whatDidYouLike || fb.suggestions || <span className="text-gray-300">—</span>}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[fb.status]}`}>
                            {STATUS_LABELS[fb.status]}
                          </span>
                          {fb.assignedTo && <div className="text-xs text-gray-400 mt-1">→ {fb.assignedTo}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(fb.createdAt).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          <ChevronRight size={16} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && (
        <DetailDrawer
          feedback={selected}
          onClose={() => setSelected(null)}
          onUpdate={() => {
            fetchStats();
            fetchList(tab === "complaints");
          }}
        />
      )}
    </AdminLayout>
  );
}
