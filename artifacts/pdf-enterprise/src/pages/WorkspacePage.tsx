import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { files as filesApi, pdf as pdfApi } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText, Upload, Search, Trash2, Download, Eye, ChevronRight,
  FolderPlus, Clock, Shield, AlertTriangle, CheckCircle, X,
  RefreshCw, Tag, Info, RotateCcw, History, Edit3
} from "lucide-react";
import { toast } from "sonner";

function formatBytes(b: number) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type PdfFile = {
  id: string; name: string; original_name: string; size_bytes: number;
  page_count: number; folder_id: string | null; owner_name: string;
  checksum: string; erp_source: string | null; has_password: boolean;
  tags: string[]; description: string | null; current_version: number;
  created_at: string; updated_at: string; folder_name: string | null;
};

export default function WorkspacePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [fileList, setFileList] = useState<PdfFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<PdfFile | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [showTamper, setShowTamper] = useState(false);
  const [tamperResult, setTamperResult] = useState<any>(null);
  const [tamperLoading, setTamperLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadFiles(q = search) {
    setLoading(true);
    try {
      const res = await filesApi.list({ search: q, limit: "100" });
      setFileList(res.files || []);
      setTotal(res.total || 0);
    } catch { toast.error("Failed to load files"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadFiles(); }, []);
  useEffect(() => {
    const t = setTimeout(() => loadFiles(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await filesApi.upload(fd);
      toast.success("File uploaded and encrypted");
      loadFiles();
      setShowUpload(false);
    } catch (err: any) { toast.error(err.message || "Upload failed"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function handleDelete(f: PdfFile) {
    if (!confirm(`Delete "${f.name}"? This is a soft delete — admins can permanently delete.`)) return;
    try {
      await filesApi.delete(f.id);
      toast.success("File deleted");
      if (selectedFile?.id === f.id) { setSelectedFile(null); setViewUrl(null); }
      loadFiles();
    } catch (err: any) { toast.error(err.message || "Delete failed"); }
  }

  function handleView(f: PdfFile) {
    setSelectedFile(f);
    setViewUrl(filesApi.viewUrl(f.id));
    setShowVersions(false);
    setShowTamper(false);
  }

  async function handleVersions(f: PdfFile) {
    try {
      const v = await filesApi.versions(f.id);
      setVersions(v);
      setShowVersions(true);
      setShowTamper(false);
    } catch { toast.error("Failed to load versions"); }
  }

  async function handleTamperCheck(f: PdfFile) {
    setTamperLoading(true);
    setShowTamper(true);
    setTamperResult(null);
    try {
      const res = await filesApi.tamperCheck(f.id);
      setTamperResult(res);
    } catch { toast.error("Tamper check failed"); setShowTamper(false); }
    finally { setTamperLoading(false); }
  }

  return (
    <Layout>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* File list panel */}
        <div style={{ width: 340, borderRight: "1px solid #1e2433", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          {/* Toolbar */}
          <div style={{ padding: "14px 12px", borderBottom: "1px solid #1e2433", display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 14, fontWeight: 700, color: "#d4d8e1" }}>Files ({total})</span>
              <div className="flex items-center gap-1">
                <button className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => loadFiles()}>
                  <RefreshCw size={12} />
                </button>
                <button className="btn-primary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => fileInputRef.current?.click()}>
                  <Upload size={12} />
                </button>
              </div>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search files…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 32, paddingTop: 6, paddingBottom: 6 }}
              />
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#4a5568" }} />
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleUpload} />

          {/* File list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} style={{ height: 64, background: "#111520", borderRadius: 8, marginBottom: 6, animation: "pulse 1.5s infinite" }} />
              ))
            ) : fileList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
                <FileText size={36} style={{ margin: "0 auto 10px", color: "#1e2433" }} />
                <p style={{ color: "#4a5568", fontSize: 13 }}>No files found</p>
                <button className="btn-primary" style={{ marginTop: 12, padding: "8px 16px", fontSize: 13 }} onClick={() => fileInputRef.current?.click()}>
                  Upload First PDF
                </button>
              </div>
            ) : fileList.map((f) => (
              <div
                key={f.id}
                className="file-card"
                onClick={() => handleView(f)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 10px",
                  borderRadius: 8, cursor: "pointer", marginBottom: 4,
                  background: selectedFile?.id === f.id ? "#1a2a4a" : "#0d1117",
                  border: `1px solid ${selectedFile?.id === f.id ? "#3b82f6" : "#1e2433"}`,
                }}
              >
                <div style={{ width: 32, height: 32, background: "#1e3a5f", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <FileText size={14} color="#3b82f6" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#d4d8e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>
                    {f.page_count || "?"} pages · {formatBytes(f.size_bytes)} · {timeAgo(f.updated_at)}
                  </div>
                  <div className="flex items-center gap-1 mt-1" style={{ flexWrap: "wrap" }}>
                    {f.has_password && <span className="badge badge-amber" style={{ fontSize: 9 }}>🔒 Protected</span>}
                    {f.erp_source && <span className="badge badge-blue" style={{ fontSize: 9 }}>ERP</span>}
                    {f.current_version > 1 && <span className="badge badge-gray" style={{ fontSize: 9 }}>v{f.current_version}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel: viewer + actions */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {selectedFile ? (
            <>
              {/* File header */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e2433", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#d4d8e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {selectedFile.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#4a5568" }}>
                    {selectedFile.page_count} pages · {formatBytes(selectedFile.size_bytes)} · v{selectedFile.current_version} · {selectedFile.owner_name}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <button
                    className="btn-primary flex items-center gap-1"
                    style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700 }}
                    onClick={() => navigate(`/editor/${selectedFile.id}`)}
                  >
                    <Edit3 size={13} /> Open in Editor
                  </button>
                  <a
                    href={filesApi.downloadUrl(selectedFile.id)}
                    download={selectedFile.original_name}
                    className="btn-secondary flex items-center gap-1"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                  >
                    <Download size={13} /> Download
                  </a>
                  <button
                    className="btn-secondary flex items-center gap-1"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => handleVersions(selectedFile)}
                  >
                    <History size={13} /> History
                  </button>
                  <button
                    className="btn-secondary flex items-center gap-1"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => handleTamperCheck(selectedFile)}
                  >
                    <Shield size={13} /> Verify
                  </button>
                  <button
                    className="btn-danger flex items-center gap-1"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => handleDelete(selectedFile)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Viewer or panels */}
              <div style={{ flex: 1, overflow: "hidden" }}>
                {showVersions ? (
                  <div style={{ padding: "1.5rem" }}>
                    <div className="flex items-center gap-3 mb-4">
                      <button className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setShowVersions(false)}>← Back</button>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#d4d8e1", margin: 0 }}>Version History</h3>
                    </div>
                    <div className="table-container">
                      <table>
                        <thead><tr><th>Version</th><th>Operation</th><th>Size</th><th>Created By</th><th>Date</th></tr></thead>
                        <tbody>
                          {versions.map((v) => (
                            <tr key={v.id}>
                              <td><span className="badge badge-blue">v{v.version}</span></td>
                              <td style={{ textTransform: "capitalize" }}>{v.operation?.replace(/_/g, " ") || "upload"}</td>
                              <td>{formatBytes(v.size_bytes)}</td>
                              <td>{v.created_by_name || "—"}</td>
                              <td>{new Date(v.created_at).toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : showTamper ? (
                  <div style={{ padding: "1.5rem" }}>
                    <div className="flex items-center gap-3 mb-4">
                      <button className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setShowTamper(false)}>← Back</button>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: "#d4d8e1", margin: 0 }}>Tamper Detection</h3>
                    </div>
                    {tamperLoading ? (
                      <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
                        <div className="flex items-center justify-center gap-2">
                          <div style={{ width: 20, height: 20, border: "2px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                          <span style={{ color: "#8b9ab5" }}>Computing SHA-256 hash…</span>
                        </div>
                      </div>
                    ) : tamperResult && (
                      <div className="card">
                        <div className="flex items-center gap-3 mb-4">
                          {tamperResult.tampered ? (
                            <div className="flex items-center gap-2" style={{ color: "#ef4444" }}>
                              <AlertTriangle size={24} /> <span style={{ fontSize: 18, fontWeight: 700 }}>⚠ FILE TAMPERED</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2" style={{ color: "#4ade80" }}>
                              <CheckCircle size={24} /> <span style={{ fontSize: 18, fontWeight: 700 }}>✓ File Integrity Verified</span>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div>
                            <label style={{ marginBottom: 2 }}>Status</label>
                            <div style={{ fontSize: 14, fontWeight: 600, color: tamperResult.tampered ? "#ef4444" : "#4ade80" }}>{tamperResult.status}</div>
                          </div>
                          <div>
                            <label style={{ marginBottom: 2 }}>Stored Hash (SHA-256)</label>
                            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#8b9ab5", wordBreak: "break-all", background: "#0d1117", padding: "8px 10px", borderRadius: 6 }}>{tamperResult.storedHash}</div>
                          </div>
                          <div>
                            <label style={{ marginBottom: 2 }}>Current Hash</label>
                            <div style={{ fontSize: 11, fontFamily: "monospace", color: tamperResult.tampered ? "#ef4444" : "#4ade80", wordBreak: "break-all", background: "#0d1117", padding: "8px 10px", borderRadius: 6 }}>{tamperResult.currentHash}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <iframe
                    key={viewUrl}
                    src={viewUrl || ""}
                    className="pdf-viewer-frame"
                    title={selectedFile.name}
                    style={{ border: "none", width: "100%", height: "100%", background: "#1a1f2e" }}
                  />
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
              <div style={{ width: 80, height: 80, background: "#111520", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed #1e2433" }}>
                <FileText size={36} color="#1e2433" />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: "#4a5568", margin: 0 }}>Select a file to preview</p>
                <p style={{ fontSize: 13, color: "#2d3748", marginTop: 4 }}>or upload a new PDF</p>
              </div>
              <button className="btn-primary flex items-center gap-2" style={{ padding: "10px 20px" }} onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} /> Upload PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
