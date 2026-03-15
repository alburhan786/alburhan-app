import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; photoUrl?: string;
  passportNumber?: string; busNumber?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  hotels?: {
    makkah?: { name?: string };
    madinah?: { name?: string };
  };
}

const DARK = "#0A3D2A";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

export default function PrintLuggageSquare() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage-square");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);

    const contentRef = useRef<HTMLDivElement>(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const handleDownload = useCallback(async () => {
      if (!contentRef.current || pdfLoading) return;
      setPdfLoading(true);
      try {
        await downloadPdf(contentRef.current, { filename: `Square-Stickers-${group?.groupName || "group"}.pdf` });
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
        .sq-sticker {
          width: 100mm; height: 100mm;
          border: 1.5px solid ${DARK}; border-radius: 5px; overflow: hidden;
          page-break-inside: avoid; page-break-after: always;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
          margin: 0 auto 5mm;
        }
        .sq-sticker:last-child { page-break-after: auto; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px", opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
      {pilgrims.map(p => {
        const qrVal = p.passportNumber || `H${String(p.serialNumber).padStart(3, "0")}`;
        return (
          <div key={p.id} className="sq-sticker">
            <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
              <div style={{
                position: "absolute", top: "-8mm", right: "-6mm",
                width: "40mm", height: "40mm",
                background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
              }} />
              <div style={{
                position: "absolute", bottom: "-6mm", left: "-5mm",
                width: "30mm", height: "30mm",
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
                borderRadius: "0 60% 0 0", zIndex: 0,
              }} />

              <div style={{ position: "relative", zIndex: 1, padding: "3mm 4mm 2mm", display: "flex", alignItems: "center", gap: "3mm", borderBottom: `1px solid ${GOLD}` }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm", flexShrink: 0 }}>
                  <img src={`${BASE}images/logo.png`} alt="" style={{ height: "14mm", objectFit: "contain" }} />
                  <img src={`${BASE}images/india_flag.jpg`} alt="" style={{ width: "10mm", height: "10mm", borderRadius: "50%", objectFit: "cover" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: "11pt", color: "#1A7A4A", letterSpacing: "0.8px", textTransform: "uppercase", lineHeight: 1.1 }}>AL-BURHAN</div>
                  <div style={{ fontWeight: 700, fontSize: "7pt", color: GOLD, letterSpacing: "1.2px", textTransform: "uppercase" }}>TOURS & TRAVELS</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "14pt", fontWeight: 800, color: "#fff" }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                  <div style={{ fontSize: "6pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
                </div>
              </div>

              <div style={{ position: "relative", zIndex: 1, padding: "2mm 4mm", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", gap: "3mm", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "auto 1fr", gap: "1.5mm 3mm", fontSize: "8pt", lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700, color: DARK, textTransform: "uppercase", fontSize: "6.5pt" }}>Name</div>
                    <div style={{ fontWeight: 800, fontSize: "10pt", color: "#222" }}>{p.fullName}</div>

                    <div style={{ fontWeight: 700, color: DARK, textTransform: "uppercase", fontSize: "6.5pt" }}>Passport</div>
                    <div style={{ fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.5px" }}>{p.passportNumber || "—"}</div>

                    <div style={{ fontWeight: 700, color: DARK, textTransform: "uppercase", fontSize: "6.5pt" }}>Group No.</div>
                    <div style={{ fontWeight: 700 }}>{group.maktabNumber || "—"}</div>

                    <div style={{ fontWeight: 700, color: DARK, textTransform: "uppercase", fontSize: "6.5pt" }}>Bus No.</div>
                    <div style={{ fontWeight: 700 }}>{p.busNumber || "—"}</div>

                    <div style={{ fontWeight: 700, color: DARK, textTransform: "uppercase", fontSize: "6.5pt" }}>Hotel Makkah</div>
                    <div style={{ fontWeight: 600, fontSize: "7.5pt" }}>{group.hotels?.makkah?.name || "—"}</div>

                    <div style={{ fontWeight: 700, color: DARK, textTransform: "uppercase", fontSize: "6.5pt" }}>Hotel Madinah</div>
                    <div style={{ fontWeight: 600, fontSize: "7.5pt" }}>{group.hotels?.madinah?.name || "—"}</div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {p.photoUrl ? (
                      <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "22mm", height: "22mm", objectFit: "cover", borderRadius: "50%", border: `2px solid ${GOLD}`, boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }} />
                    ) : (
                      <div style={{ width: "22mm", height: "22mm", background: "#f0f0f0", borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "6pt", color: "#aaa" }}>PHOTO</div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "4mm", marginTop: "2mm" }}>
                  <QRCodeSVG value={qrVal} size={60} level="M" />
                  <Barcode value={qrVal} height={25} width={1.5} fontSize={0} />
                </div>
              </div>

              <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "1.5mm 3mm", fontSize: "6.5pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
                Emergency: +91 9893225590 &nbsp;|&nbsp; +91 9893989786
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}
