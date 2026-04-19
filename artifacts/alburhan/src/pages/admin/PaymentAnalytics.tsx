import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useQuery } from "@tanstack/react-query";
import { IndianRupee, TrendingUp, Clock, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

type AnalyticsData = {
  todayCollection: number;
  monthlyRevenue: number;
  totalPending: number;
  totalOverdue: number;
  overdueCount: number;
  statusBreakdown: Record<string, number>;
  bookings: Array<{
    id: string;
    bookingNumber: string;
    customerName: string;
    customerMobile: string;
    status: string;
    finalAmount: number | null;
    paidAmount: number;
    remainingAmount: number | null;
    invoiceNumber: string | null;
    createdAt: string;
    updatedAt: string;
    isOffline: boolean;
  }>;
};

type SortKey = "bookingNumber" | "customerName" | "finalAmount" | "paidAmount" | "remainingAmount" | "updatedAt";
type FilterTab = "all" | "confirmed" | "partially_paid" | "approved" | "pending" | "overdue";

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  confirmed:     { label: "Paid",      bg: "bg-emerald-100", text: "text-emerald-800" },
  partially_paid:{ label: "Partial",   bg: "bg-amber-100",   text: "text-amber-800" },
  approved:      { label: "Approved",  bg: "bg-blue-100",    text: "text-blue-800" },
  pending:       { label: "Pending",   bg: "bg-gray-100",    text: "text-gray-700" },
  rejected:      { label: "Rejected",  bg: "bg-red-100",     text: "text-red-800" },
  cancelled:     { label: "Cancelled", bg: "bg-gray-100",    text: "text-gray-500" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function KpiCard({ label, value, icon: Icon, iconBg, iconColor, sub }: {
  label: string; value: string; icon: React.ElementType;
  iconBg: string; iconColor: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={18} className={iconColor} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 font-mono">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function PaymentAnalytics() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["payment-analytics"],
    queryFn: () =>
      fetch(`${API}/api/payments/analytics`, { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error("Failed to load analytics");
        return r.json();
      }),
    refetchInterval: 60_000,
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="inline ml-1 text-[#0B3D2E]" />
      : <ChevronDown size={13} className="inline ml-1 text-[#0B3D2E]" />;
  };

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const filtered = (data?.bookings || []).filter(b => {
    const matchSearch =
      !search ||
      b.customerName.toLowerCase().includes(search.toLowerCase()) ||
      b.bookingNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.customerMobile.includes(search);

    if (!matchSearch) return false;

    if (filter === "all") return true;
    if (filter === "overdue") {
      return (
        (b.status === "approved" || b.status === "partially_paid") &&
        new Date(b.createdAt).getTime() < thirtyDaysAgo &&
        (b.remainingAmount ?? 0) > 0
      );
    }
    return b.status === filter;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: any = a[sortKey];
    let bv: any = b[sortKey];
    if (sortKey === "updatedAt" || sortKey === "bookingNumber") {
      av = String(av ?? "");
      bv = String(bv ?? "");
    } else {
      av = Number(av ?? 0);
      bv = Number(bv ?? 0);
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const today = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const todayDate = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "confirmed", label: "Paid" },
    { key: "partially_paid", label: "Partial" },
    { key: "approved", label: "Approved" },
    { key: "pending", label: "Pending" },
    { key: "overdue", label: "Overdue" },
  ];

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0B3D2E]">Payment Analytics</h1>
            <p className="text-sm text-gray-500 mt-0.5">Real-time payment overview — {today}</p>
          </div>
          <Link href="/admin/bookings">
            <button className="text-sm text-[#0B3D2E] border border-[#0B3D2E] rounded-lg px-4 py-2 hover:bg-[#0B3D2E] hover:text-white transition-colors font-medium">
              Manage Bookings →
            </button>
          </Link>
        </div>

        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-pulse h-24" />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            Failed to load analytics data. Please refresh.
          </div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                label={`Today's Collection (${todayDate})`}
                value={fmt(data.todayCollection)}
                icon={IndianRupee}
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                sub="Manual + online payments recorded today"
              />
              <KpiCard
                label="Monthly Revenue"
                value={fmt(data.monthlyRevenue)}
                icon={TrendingUp}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                sub={today}
              />
              <KpiCard
                label="Total Pending"
                value={fmt(data.totalPending)}
                icon={Clock}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
                sub="Outstanding across all open bookings"
              />
              <KpiCard
                label="Overdue (>30 days)"
                value={fmt(data.totalOverdue)}
                icon={AlertTriangle}
                iconBg="bg-red-50"
                iconColor="text-red-600"
                sub={`${data.overdueCount} booking${data.overdueCount !== 1 ? "s" : ""} overdue`}
              />
            </div>

            {/* Status Breakdown Bar */}
            {Object.keys(data.statusBreakdown).length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Booking Status Breakdown</p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(data.statusBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([status, count]) => {
                      const cfg = STATUS_CONFIG[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700" };
                      return (
                        <button
                          key={status}
                          onClick={() => setFilter(status as FilterTab)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${cfg.bg} ${cfg.text} border-transparent hover:border-gray-300`}
                        >
                          {cfg.label}
                          <span className="bg-white bg-opacity-60 rounded-full px-1.5 py-0.5 text-xs font-bold">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Bookings Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Filters + Search */}
              <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setFilter(t.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        filter === t.key
                          ? "bg-[#0B3D2E] text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Search name, booking, mobile..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/20"
                />
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th
                        className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]"
                        onClick={() => toggleSort("bookingNumber")}
                      >
                        Booking <SortIcon k="bookingNumber" />
                      </th>
                      <th
                        className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]"
                        onClick={() => toggleSort("customerName")}
                      >
                        Customer <SortIcon k="customerName" />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">
                        Status
                      </th>
                      <th
                        className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]"
                        onClick={() => toggleSort("finalAmount")}
                      >
                        Total <SortIcon k="finalAmount" />
                      </th>
                      <th
                        className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]"
                        onClick={() => toggleSort("paidAmount")}
                      >
                        Paid <SortIcon k="paidAmount" />
                      </th>
                      <th
                        className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]"
                        onClick={() => toggleSort("remainingAmount")}
                      >
                        Remaining <SortIcon k="remainingAmount" />
                      </th>
                      <th
                        className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#0B3D2E]"
                        onClick={() => toggleSort("updatedAt")}
                      >
                        Updated <SortIcon k="updatedAt" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sorted.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                          No bookings match this filter.
                        </td>
                      </tr>
                    ) : (
                      sorted.map(b => {
                        const isOverdue =
                          (b.status === "approved" || b.status === "partially_paid") &&
                          new Date(b.createdAt).getTime() < thirtyDaysAgo &&
                          (b.remainingAmount ?? 0) > 0;

                        return (
                          <tr
                            key={b.id}
                            className={`hover:bg-gray-50 transition-colors ${isOverdue ? "bg-red-50/40" : ""}`}
                          >
                            <td className="px-4 py-3">
                              <div className="font-mono text-xs font-bold text-[#0B3D2E]">
                                {b.bookingNumber}
                              </div>
                              {b.isOffline && (
                                <span className="text-xs text-gray-400">Offline</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{b.customerName}</div>
                              <div className="text-xs text-gray-400">{b.customerMobile}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <StatusBadge status={b.status} />
                                {isOverdue && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                    Overdue
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {b.finalAmount != null ? fmt(b.finalAmount) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm text-emerald-700 font-semibold">
                              {fmt(b.paidAmount)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {b.remainingAmount != null && b.remainingAmount > 0 ? (
                                <span className={`font-bold ${isOverdue ? "text-red-600" : "text-amber-600"}`}>
                                  {fmt(b.remainingAmount)}
                                </span>
                              ) : b.remainingAmount === 0 ? (
                                <span className="text-emerald-600 font-semibold">Paid ✓</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-400">
                              {b.updatedAt
                                ? new Date(b.updatedAt).toLocaleDateString("en-IN", {
                                    day: "numeric", month: "short", year: "numeric",
                                  })
                                : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {sorted.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                  Showing {sorted.length} booking{sorted.length !== 1 ? "s" : ""}
                  {filter !== "all" ? ` (${TABS.find(t => t.key === filter)?.label} filter)` : ""}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
