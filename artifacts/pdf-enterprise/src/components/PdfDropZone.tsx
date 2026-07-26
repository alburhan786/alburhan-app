import { useEffect, useRef, useState } from "react";
import { Upload, X, GripVertical, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export interface UploadedFile {
  localId: string;
  name: string;
  size: number;
  fileId?: string;
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface Props {
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  disabled?: boolean;
  label?: string;
  allowReorder?: boolean;
}

function fmt(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

const UPLOAD_URL = `${import.meta.env.BASE_URL}api/files/upload`;

export default function PdfDropZone({ onFilesChange, maxFiles, disabled, label, allowReorder = true }: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [zoneOver, setZoneOver] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragSrc = useRef<number | null>(null);

  useEffect(() => { onFilesChange(files); }, [files]);

  const multiOk = maxFiles == null || maxFiles > 1;

  function uploadOne(localId: string, rawFile: File) {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", rawFile);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 90);
      setFiles((prev) => prev.map((f) => f.localId === localId ? { ...f, status: "uploading", progress: pct } : f));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        setFiles((prev) => prev.map((f) =>
          f.localId === localId ? { ...f, status: "done", progress: 100, fileId: data.id } : f
        ));
      } else {
        let msg = "Upload failed";
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
        setFiles((prev) => prev.map((f) => f.localId === localId ? { ...f, status: "error", error: msg } : f));
      }
    };

    xhr.onerror = () => {
      setFiles((prev) => prev.map((f) => f.localId === localId ? { ...f, status: "error", error: "Network error" } : f));
    };

    xhr.open("POST", UPLOAD_URL);
    xhr.withCredentials = true;
    xhr.send(fd);
  }

  function addRaw(rawFiles: File[]) {
    const pdfs = rawFiles.filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (!pdfs.length) return;

    setFiles((prev) => {
      const remaining = maxFiles != null ? maxFiles - prev.length : pdfs.length;
      const toAdd = pdfs.slice(0, Math.max(remaining, 0));
      if (!toAdd.length) return prev;

      const newEntries: UploadedFile[] = toAdd.map((f) => ({
        localId: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        status: "uploading" as const,
        progress: 0,
      }));

      setTimeout(() => toAdd.forEach((raw, i) => uploadOne(newEntries[i].localId, raw)), 0);
      return [...prev, ...newEntries];
    });
  }

  function remove(localId: string) {
    setFiles((prev) => prev.filter((f) => f.localId !== localId));
  }

  function reorder(src: number, dst: number) {
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(src, 1);
      next.splice(dst, 0, moved);
      return next;
    });
  }

  const canAddMore = !disabled && (maxFiles == null || files.length < maxFiles);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {canAddMore && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setZoneOver(true); }}
          onDragLeave={() => setZoneOver(false)}
          onDrop={(e) => { e.preventDefault(); setZoneOver(false); addRaw(Array.from(e.dataTransfer.files)); }}
          style={{
            border: `2px dashed ${zoneOver ? "#3b82f6" : "#2a3347"}`,
            borderRadius: 12,
            padding: "2rem 1.5rem",
            textAlign: "center",
            cursor: "pointer",
            background: zoneOver ? "#0f1e3a" : "#0d1117",
            transition: "all 0.2s",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple={multiOk}
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files) { addRaw(Array.from(e.target.files)); e.target.value = ""; } }}
          />
          <Upload
            size={32}
            color={zoneOver ? "#3b82f6" : "#374151"}
            style={{ margin: "0 auto 12px", display: "block", transition: "color 0.2s" }}
          />
          <div style={{ fontSize: 15, fontWeight: 700, color: "#d4d8e1", marginBottom: 4 }}>
            {label || (multiOk ? "Drag & drop PDF files here" : "Drag & drop a PDF file here")}
          </div>
          <div style={{ fontSize: 12, color: "#4a5568", marginBottom: 14 }}>
            PDF only · Up to 500 MB per file{multiOk ? " · Multiple files supported" : ""}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            style={{
              padding: "9px 24px",
              background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
              boxShadow: "0 2px 8px rgba(37,99,235,0.35)",
            }}
          >
            Choose PDF File{multiOk ? "s" : ""}
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {allowReorder && multiOk && files.length > 1 && (
            <div style={{ fontSize: 11, color: "#4a5568", paddingLeft: 4 }}>
              Drag rows to reorder · files will be processed in this order
            </div>
          )}
          {files.map((f, i) => (
            <div
              key={f.localId}
              draggable={allowReorder && multiOk}
              onDragStart={() => { dragSrc.current = i; }}
              onDragOver={(e) => { if (!allowReorder || !multiOk) return; e.preventDefault(); setDragOverIdx(i); }}
              onDrop={(e) => {
                if (!allowReorder || !multiOk) return;
                e.preventDefault();
                if (dragSrc.current !== null && dragSrc.current !== i) reorder(dragSrc.current, i);
                dragSrc.current = null;
                setDragOverIdx(null);
              }}
              onDragEnd={() => { dragSrc.current = null; setDragOverIdx(null); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: dragOverIdx === i ? "#1a2a4a" : "#111827",
                border: `1px solid ${dragOverIdx === i ? "#3b82f6" : "#1e2433"}`,
                borderRadius: 8,
                padding: "9px 10px",
                transition: "all 0.15s",
                cursor: allowReorder && multiOk ? "grab" : "default",
              }}
            >
              {allowReorder && multiOk && (
                <GripVertical size={14} color="#374151" style={{ flexShrink: 0 }} />
              )}
              {multiOk && (
                <span style={{ fontSize: 11, color: "#4a5568", minWidth: 18, textAlign: "center", fontWeight: 600 }}>
                  {i + 1}
                </span>
              )}
              <FileText size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#d4d8e1",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {f.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
                  <span style={{ fontSize: 11, color: "#374151" }}>{fmt(f.size)}</span>
                  {f.status === "uploading" && <span style={{ fontSize: 11, color: "#60a5fa" }}>Uploading {f.progress}%…</span>}
                  {f.status === "done" && <span style={{ fontSize: 11, color: "#10b981" }}>✓ Ready</span>}
                  {f.status === "error" && <span style={{ fontSize: 11, color: "#ef4444" }}>{f.error}</span>}
                </div>
                {f.status === "uploading" && (
                  <div style={{ marginTop: 5, background: "#1e2433", borderRadius: 4, height: 3, overflow: "hidden" }}>
                    <div style={{
                      width: `${f.progress}%`,
                      background: "linear-gradient(90deg, #1d4ed8, #3b82f6)",
                      height: "100%",
                      borderRadius: 4,
                      transition: "width 0.3s",
                    }} />
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                {f.status === "uploading" && <Loader2 size={14} color="#3b82f6" className="animate-spin" />}
                {f.status === "done" && <CheckCircle2 size={14} color="#10b981" />}
                {f.status === "error" && <AlertCircle size={14} color="#ef4444" />}
              </div>
              <button
                onClick={() => remove(f.localId)}
                title="Remove file"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: 3, color: "#374151", display: "flex", flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
