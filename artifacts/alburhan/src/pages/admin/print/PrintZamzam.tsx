import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim { id: string; serialNumber: number; fullName: string; photoUrl?: string; mobileIndia?: string; }
interface Group { id: string; groupName: string; year: number; }

const DARK = "#0A3D2A";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

export default function PrintZamzam() {
  const [, params] = useRoute("/admin/groups/:groupId/print/zamzam");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);

  const contentRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!contentRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadPdf(contentRef.current, { filename: `Zamzam-Stickers-${group?.groupName || "group"}.pdf` });
    } finally { setPdfLoading(false); }
  }, [group, pdfLoading]);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => { setGroup(g); setPilgrims(p); });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .zamzam-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5mm;
        }
        .zamzam-sticker {
          border: 1.5px solid ${DARK};
          border-radius: 5px;
          overflow: hidden;
          break-inside: avoid;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff;
          position: relative;
          height: 270mm;
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px", opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}</button>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#fff", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", marginRight: "12px" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
        <div className="zamzam-grid">
          {pilgrims.map(p => (
            <div key={p.id} className="zamzam-sticker">
              <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                {/* Decorative corner top-right */}
                <div style={{
                  position: "absolute", top: "-12mm", right: "-8mm",
                  width: "45mm", height: "45mm",
                  background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
                }} />
                {/* Decorative corner bottom-left */}
                <div style={{
                  position: "absolute", bottom: "-8mm", left: "-6mm",
                  width: "35mm", height: "35mm",
                  background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
                  borderRadius: "0 60% 0 0", zIndex: 0,
                }} />

                {/* Header: Logo + Brand */}
                <div style={{ position: "relative", zIndex: 1, padding: "4mm 4mm 2mm", display: "flex", alignItems: "center", gap: "3mm" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5mm", flexShrink: 0 }}>
                    <img src={`${BASE}images/logo.png`} alt="" style={{ height: "16mm", objectFit: "contain" }} />
                    <img src={`${BASE}images/india_flag.jpg`} alt="" style={{ width: "12mm", height: "12mm", borderRadius: "50%", objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontWeight: 900, fontSize: "10pt", color: "#1A7A4A", letterSpacing: "0.5px", textTransform: "uppercase", lineHeight: 1.15 }}>AL-BURHAN</div>
                    <div style={{ fontWeight: 700, fontSize: "6.5pt", color: GOLD, letterSpacing: "1px", textTransform: "uppercase" }}>TOURS & TRAVELS</div>
                    <div style={{ fontWeight: 600, fontSize: "5.5pt", color: "#666", marginTop: "1mm" }}>Burhanpur, M.P. — Est. 1985</div>
                  </div>
                </div>

                {/* ZAMZAM Title */}
                <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "1mm 4mm 1.5mm" }}>
                  <div style={{ fontSize: "20pt", fontWeight: 900, letterSpacing: "4px", color: DARK, lineHeight: 1 }}>ZAMZAM</div>
                  <div style={{ fontSize: "7pt", color: GOLD, fontWeight: 700, letterSpacing: "2px", marginTop: "1mm" }}>HOLY WATER</div>
                </div>

                {/* Divider */}
                <div style={{ position: "relative", zIndex: 1, height: "0.5mm", background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, margin: "0 6mm 2mm" }} />

                {/* Photo */}
                <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center", padding: "2mm 4mm" }}>
                  {p.photoUrl ? (
                    <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "32mm", height: "32mm", objectFit: "cover", borderRadius: "50%", border: `2.5px solid ${GOLD}`, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }} />
                  ) : (
                    <div style={{ width: "32mm", height: "32mm", background: "#f0f0f0", borderRadius: "50%", border: `2.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "7pt", color: "#aaa" }}>PHOTO</div>
                  )}
                </div>

                {/* Serial Number */}
                <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 4mm" }}>
                  <div style={{ fontSize: "6pt", color: "#888", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "0.5mm" }}>Serial No.</div>
                  <div style={{ fontSize: "22pt", fontWeight: 900, color: DARK, lineHeight: 1, marginBottom: "2mm" }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                </div>

                {/* Divider */}
                <div style={{ position: "relative", zIndex: 1, height: "0.5px", background: "#e0e0e0", margin: "0 8mm 2.5mm" }} />

                {/* Pilgrim Name */}
                <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 3mm 2mm" }}>
                  <div style={{ fontSize: "13pt", fontWeight: 900, color: "#222", lineHeight: 1.2, textTransform: "uppercase" }}>{p.fullName}</div>
                </div>

                {/* Group Name */}
                <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center", padding: "0 4mm 3mm" }}>
                  <div style={{ background: DARK, color: GOLD, padding: "1mm 4mm", borderRadius: "3px", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "0.5px", textAlign: "center" }}>
                    {group.groupName} — {group.year}
                  </div>
                </div>

                {/* Barcode + QR */}
                <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "5mm", flex: 1, padding: "2mm 4mm" }}>
                  <Barcode value={`ZAM${String(p.serialNumber).padStart(3, "0")}`} height={28} width={1.4} fontSize={0} />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <QRCodeSVG
                      value={`Name: ${p.fullName}\nSerial: ${String(p.serialNumber).padStart(3, "0")}\nGroup: ${group.groupName} ${group.year}\nMobile: ${p.mobileIndia || "N/A"}\nEmergency: 0547090786`}
                      size={36}
                      level="M"
                      fgColor={DARK}
                    />
                    <div style={{ fontSize: "5pt", color: "#888", marginTop: "1mm" }}>0547090786</div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "2mm 4mm", fontSize: "6.5pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
                  AL BURHAN TOURS & TRAVELS — BURHANPUR &nbsp;|&nbsp; +91 9893989786
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
