import { useState, useEffect } from "react";

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
    <div style={{ padding: "24px", fontFamily: "Inter, sans-serif" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#0A3D2A", margin: 0 }}>Customer Manager</h1>
        <p style={{ color: "#666", marginTop: "4px", fontSize: "14px" }}>All registered customers who have made bookings</p>
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", border: "1.5px solid #ddd", fontSize: "14px", outline: "none" }}
        />
        <div style={{ padding: "10px 16px", background: "#f0f9f4", borderRadius: "8px", border: "1.5px solid #c3e6cb", color: "#0A3D2A", fontWeight: 600, fontSize: "14px", display: "flex", alignItems: "center" }}>
          Total: {customers.length}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#999" }}>Loading customers...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#999" }}>
          {search ? "No customers found matching your search." : "No customers found."}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #eee", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#0A3D2A", color: "#fff" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>#</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Name</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Email</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Phone</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Bookings</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Total Paid</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "12px 16px", color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "#222" }}>{c.name}</td>
                  <td style={{ padding: "12px 16px", color: "#555" }}>{c.email || "—"}</td>
                  <td style={{ padding: "12px 16px", color: "#555" }}>{c.phone || "—"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ background: "#e8f5e9", color: "#2e7d32", padding: "2px 10px", borderRadius: "20px", fontWeight: 600, fontSize: "12px" }}>
                      {c.totalBookings ?? 0}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#0A3D2A", fontWeight: 600 }}>
                    {c.totalPaid ? `₹${Number(c.totalPaid).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#888", fontSize: "12px" }}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
