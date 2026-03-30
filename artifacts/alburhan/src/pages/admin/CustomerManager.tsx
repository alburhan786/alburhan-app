import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Link } from "wouter";
import { ArrowLeft, Search, Users } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt?: string;
  totalBookings?: number;
  totalPaid?: number;
}

export default function CustomerManager() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API}/api/admin/customers`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { setCustomers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = customers.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/admin">
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
            <ArrowLeft size={15} /> Back to Dashboard
          </button>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold">Customer Manager</h1>
            <p className="text-muted-foreground mt-1 text-sm">All registered customers who have made bookings</p>
          </div>
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-green-800 font-semibold text-sm">
            <Users size={16} /> {customers.length} Customers
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground animate-pulse">Loading customers...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search ? "No customers match your search." : "No customers found."}
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden shadow-sm bg-white">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#0A3D2A] text-white">
                <th className="px-5 py-3 font-semibold">#</th>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Phone</th>
                <th className="px-5 py-3 font-semibold">Bookings</th>
                <th className="px-5 py-3 font-semibold">Total Paid</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c, i) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">{c.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.email || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.phone || "—"}</td>
                  <td className="px-5 py-3">
                    <span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full font-semibold text-xs">
                      {c.totalBookings ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#0A3D2A] font-semibold">
                    {c.totalPaid ? `₹${Number(c.totalPaid).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
