import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; photoUrl?: string;
  mobileIndia?: string; mobileSaudi?: string; city?: string;
  passportNumber?: string;
}
interface Group { id: string; groupName: string; year: number; maktabNumber?: string; }

const DARK = "#0A3D2A";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

export default function PrintLuggage() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);

    const contentRef = useRef<HTMLDivElement>(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const handleDownload = useCallback(async () => {
      if (!contentRef.current || pdfLoading) return;
      setPdfLoading(true);
      try {
        await downloadPdf(contentRef.current, { filename: `Luggage-Stickers-${group?.groupName || "group"}.pdf` });
      } finally { setPdfLoading(false); }
    }, [group, pdfLoading]);
  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => { setGroup(g); setPilgrims(p); });
  }, [groupId]);

  useEffect(() => {
    const t = setTimeout(() => handleDownload(), 1200);
    return () => clearTimeout(t);
  }, [pilgrims]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .luggage-sticker {
          width: 150mm; height: 190mm;
          border: 1.5px solid ${DARK}; border-radius: 6px; overflow: hidden;
          page-break-inside: avoid; page-break-after: always;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
          margin: 0 auto 5mm;
        }
        .luggage-sticker:last-child { page-break-after: auto; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px", opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
      {pilgrims.map(p => (
        <div key={p.id} className="luggage-sticker">
          <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{
              position: "absolute", top: "-15mm", right: "-10mm",
              width: "70mm", height: "70mm",
              background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
            }} />
            <div style={{
              position: "absolute", bottom: "-10mm", left: "-8mm",
              width: "55mm", height: "55mm",
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
              borderRadius: "0 60% 0 0", zIndex: 0,
            }} />

            <div style={{ position: "relative", zIndex: 1, padding: "5mm 6mm 3mm", display: "flex", alignItems: "center", gap: "4mm" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2mm", flexShrink: 0 }}>
                <img src={`${BASE}images/logo.png`} alt="" style={{ height: "24mm", objectFit: "contain" }} />
                <img src={`${BASE}images/india_flag.jpg`} alt="" style={{ width: "18mm", height: "18mm", borderRadius: "50%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: "15pt", color: "#1A7A4A", letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.1 }}>AL-BURHAN</div>
                <div style={{ fontWeight: 700, fontSize: "9pt", color: GOLD, letterSpacing: "1.5px", textTransform: "uppercase" }}>TOURS & TRAVELS</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "22pt", fontWeight: 800, color: "#fff" }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                <div style={{ fontSize: "8pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "4mm 6mm 2mm", flex: 1 }}>
              <div style={{ marginBottom: "3mm" }}>
                {p.photoUrl ? (
                  <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "42mm", height: "42mm", objectFit: "cover", borderRadius: "50%", border: `3px solid ${GOLD}`, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }} />
                ) : (
                  <div style={{ width: "42mm", height: "42mm", background: "#f0f0f0", borderRadius: "50%", border: `3px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10pt", color: "#aaa" }}>PHOTO</div>
                )}
              </div>

              <div style={{ fontSize: "18pt", fontWeight: 800, color: DARK, textAlign: "center", lineHeight: 1.2, marginBottom: "4mm", maxWidth: "130mm", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.fullName}</div>

              <div style={{
                width: "100%", background: "#f9f9f9", borderRadius: "4px",
                padding: "3mm 5mm", marginBottom: "3mm",
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2mm 6mm",
                fontSize: "10pt",
              }}>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Passport</div>
                  <div style={{ fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.5px" }}>{p.passportNumber || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Maktab</div>
                  <div style={{ fontWeight: 700 }}>{group.maktabNumber || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>City</div>
                  <div style={{ fontWeight: 700 }}>{p.city || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Group</div>
                  <div style={{ fontWeight: 700 }}>{group.groupName}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>India Mobile</div>
                  <div style={{ fontWeight: 700 }}>{p.mobileIndia || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Saudi Mobile</div>
                  <div style={{ fontWeight: 700 }}>{p.mobileSaudi || "—"}</div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: "auto", paddingBottom: "2mm" }}>
                <Barcode value={p.passportNumber || `H${String(p.serialNumber).padStart(3, "0")}`} height={40} width={2} fontSize={0} />
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "2.5mm 5mm", fontSize: "8pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
              Mohammed Altaf: 0547090786 | Mohammed Wasim: 0568780786
            </div>
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
