import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { erp } from "@/lib/api";
import { Link2, Search, Download, CheckCircle, AlertCircle, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";

type ERPDoc = {
  id: string; type: string; name: string; label: string;
  createdAt: string; status: string; customerName: string; hasPdf: boolean;
};

export default function ERPBridgePage() {
  const [docs, setDocs] = useState<ERPDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [erpStatus, setErpStatus] = useState<any>(null);
  const [importing, setImporting] = useState<string | null>(null);

  async function loadDocs() {
    setLoading(true);
    try {
      const params: any = { type: typeFilter };
      if (search) params.search = search;
      const res = await erp.documents(params);
      setDocs(res.documents || []);
    } catch { toast.error("Failed to fetch ERP documents"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    erp.status().then(setErpStatus).catch(() => setErpStatus({ connected: false }));
    loadDocs();
  }, []);

  useEffect(() => { loadDocs(); }, [typeFilter]);

  async function handleImport(doc: ERPDoc) {
    setImporting(doc.id);
    try {
      await erp.import(doc.type, doc.id);
      toast.success(`"${doc.name}" imported successfully!`);
    } catch (err: any) { toast.error(err.message || "Import failed"); }
    finally { setImporting(null); }
  }

  const filtered = docs.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.label.toLowerCase().includes(search.toLowerCase()) ||
    (d.customerName || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div style={{ padding: "2rem", maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#d4d8e1", margin: 0 }}>ERP Bridge</h1>
            <p style={{ fontSize: 13, color: "#4a5568", marginTop: 4 }}>Import agreements, invoices, and documents from the main ERP system</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {erpStatus?.connected
                ? <><CheckCircle size={14} color="#4ade80" /><span style={{ fontSize: 12, color: "#4ade80" }}>ERP Connected</span></>
                : <><AlertCircle size={14} color="#f87171" /><span style={{ fontSize: 12, color: "#f87171" }}>ERP Offline</span></>
              }
            </div>
            <button className="btn-secondary flex items-center gap-1" style={{ padding: "6px 12px", fontSize: 12 }} onClick={loadDocs}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* Status card */}
        {!erpStatus?.connected && (
          <div style={{ background: "#1c1003", border: "1px solid #451a03", borderRadius: 10, padding: "14px 16px", marginBottom: "1.5rem", fontSize: 13, color: "#fbbf24" }}>
            <strong>ERP not reachable.</strong> The main API server may not be running. Documents listed here are cached from the last successful connection.
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5" style={{ flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <input
              type="text"
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#4a5568" }} />
          </div>
          {["all", "agreements", "invoices", "documents"].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: typeFilter === t ? "#3b82f6" : "#111520",
                color: typeFilter === t ? "white" : "#8b9ab5",
                border: `1px solid ${typeFilter === t ? "#3b82f6" : "#1e2433"}`,
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Document list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem" }}>
            <div style={{ width: 24, height: 24, border: "2px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <p style={{ color: "#4a5568" }}>Loading ERP documents…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem" }}>
            <FileText size={40} style={{ margin: "0 auto 12px", color: "#1e2433" }} />
            <p style={{ color: "#4a5568" }}>
              {erpStatus?.connected ? "No documents found" : "Cannot fetch documents — ERP is offline"}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={`${doc.type}-${doc.id}`}>
                    <td>
                      <div className="flex items-center gap-2">
                        <FileText size={13} color="#3b82f6" />
                        <div>
                          <div style={{ fontWeight: 600, color: "#d4d8e1" }}>{doc.label}</div>
                          <div style={{ fontSize: 11, color: "#4a5568" }}>{doc.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${doc.type === "agreements" ? "badge-blue" : doc.type === "invoices" ? "badge-green" : "badge-gray"}`}>
                        {doc.type}
                      </span>
                    </td>
                    <td style={{ color: "#8b9ab5", fontSize: 12 }}>{doc.customerName || "—"}</td>
                    <td>
                      {doc.status && <span className="badge badge-gray" style={{ textTransform: "capitalize" }}>{doc.status}</span>}
                    </td>
                    <td style={{ color: "#8b9ab5", fontSize: 12 }}>
                      {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td>
                      <button
                        className="btn-primary flex items-center gap-1"
                        style={{ padding: "5px 12px", fontSize: 12 }}
                        onClick={() => handleImport(doc)}
                        disabled={importing === doc.id || !erpStatus?.connected}
                        title={!erpStatus?.connected ? "ERP offline" : "Import to PDF Enterprise"}
                      >
                        {importing === doc.id ? (
                          <div style={{ width: 12, height: 12, border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        ) : (
                          <Download size={12} />
                        )}
                        {importing === doc.id ? "Importing…" : "Import"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
