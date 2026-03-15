import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; photoUrl?: string;
  mobileIndia?: string; mobileSaudi?: string; city?: string;
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

const GROUP_COLORS: Record<string, string> = {
  A: "#1A7A4A",
  B: "#2563EB",
  C: "#D97706",
  D: "#DC2626",
};

function getGroupColor(groupName: string): string {
  const last = groupName.trim().slice(-1).toUpperCase();
  return GROUP_COLORS[last] || "#6B7280";
}

function buildQrData(p: Pilgrim, group: Group): string {
  return [
    `Name: ${p.fullName}`,
    `Passport: ${p.passportNumber || "N/A"}`,
    `Group: ${group.groupName}`,
    `Maktab: ${group.maktabNumber || "N/A"}`,
    `Bus: ${p.busNumber || "N/A"}`,
    `Hotel Makkah: ${group.hotels?.makkah?.name || "N/A"}`,
    `Hotel Madinah: ${group.hotels?.madinah?.name || "N/A"}`,
    `India: ${p.mobileIndia || "N/A"}`,
    `Saudi: ${p.mobileSaudi || "N/A"}`,
    `Emergency: +91 9893225590`,
  ].join("\n");
}

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
    if (pilgrims.length === 0) return;
    const t = setTimeout(() => handleDownload(), 1200);
    return () => clearTimeout(t);
  }, [pilgrims]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const groupColor = getGroupColor(group.groupName);
  const groupLabel = group.groupName.toUpperCase();

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
          width: 150mm; height: 200mm;
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

            <div style={{ position: "relative", zIndex: 1, padding: "4mm 6mm 2mm", display: "flex", alignItems: "center", gap: "4mm" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5mm", flexShrink: 0 }}>
                <img src={`${BASE}images/logo.png`} alt="" style={{ height: "20mm", objectFit: "contain" }} />
                <img src={`${BASE}images/india_flag.jpg`} alt="" style={{ width: "14mm", height: "14mm", borderRadius: "50%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: "14pt", color: "#1A7A4A", letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.1 }}>AL-BURHAN</div>
                <div style={{ fontWeight: 700, fontSize: "8pt", color: GOLD, letterSpacing: "1.5px", textTransform: "uppercase" }}>TOURS & TRAVELS</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "22pt", fontWeight: 800, color: "#fff" }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                <div style={{ fontSize: "8pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
              </div>
            </div>

            <div style={{ background: groupColor, padding: "2mm 6mm", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: "11pt", letterSpacing: "1px" }}>GROUP: {groupLabel}</span>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "10pt" }}>BUS: {p.busNumber || "—"}</span>
            </div>

            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "3mm 6mm 2mm", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5mm", width: "100%", marginBottom: "2mm" }}>
                <div style={{ flexShrink: 0 }}>
                  {p.photoUrl ? (
                    <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "34mm", height: "34mm", objectFit: "cover", borderRadius: "50%", border: `3px solid ${GOLD}`, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }} />
                  ) : (
                    <div style={{ width: "34mm", height: "34mm", background: "#f0f0f0", borderRadius: "50%", border: `3px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10pt", color: "#aaa" }}>PHOTO</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "26pt", fontWeight: 900, color: DARK, lineHeight: 1.1, wordBreak: "break-word", textTransform: "uppercase" }}>{p.fullName}</div>
                </div>
              </div>

              <div style={{ width: "100%", display: "flex", gap: "3mm", marginBottom: "2mm" }}>
                <div style={{ flex: 1, background: "#f0fdf4", border: `1.5px solid ${DARK}`, borderRadius: "4px", padding: "2mm 4mm", textAlign: "center" }}>
                  <div style={{ fontSize: "7pt", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>PASSPORT</div>
                  <div style={{ fontSize: "16pt", fontWeight: 900, fontFamily: "monospace", letterSpacing: "1px", color: DARK }}>{p.passportNumber || "—"}</div>
                </div>
                <div style={{ flex: 1, background: "#f0fdf4", border: `1.5px solid ${DARK}`, borderRadius: "4px", padding: "2mm 4mm", textAlign: "center" }}>
                  <div style={{ fontSize: "7pt", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>MAKTAB</div>
                  <div style={{ fontSize: "16pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
                </div>
              </div>

              <div style={{ width: "100%", display: "flex", gap: "3mm", marginBottom: "2mm" }}>
                <div style={{ flex: 1, background: "#fefce8", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "2mm 4mm" }}>
                  <div style={{ fontSize: "6.5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>HOTEL MAKKAH</div>
                  <div style={{ fontWeight: 700, fontSize: "10pt", color: "#222" }}>{group.hotels?.makkah?.name || "—"}</div>
                </div>
                <div style={{ flex: 1, background: "#fefce8", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "2mm 4mm" }}>
                  <div style={{ fontSize: "6.5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>HOTEL MADINAH</div>
                  <div style={{ fontWeight: 700, fontSize: "10pt", color: "#222" }}>{group.hotels?.madinah?.name || "—"}</div>
                </div>
              </div>

              <div style={{
                width: "100%", background: "#f9f9f9", borderRadius: "4px",
                padding: "2mm 4mm", marginBottom: "2mm",
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1mm 4mm",
              }}>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>City</div>
                  <div style={{ fontWeight: 700, fontSize: "9pt" }}>{p.city || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>India Mobile</div>
                  <div style={{ fontWeight: 700, fontSize: "9pt" }}>{p.mobileIndia || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Saudi Mobile</div>
                  <div style={{ fontWeight: 700, fontSize: "9pt" }}>{p.mobileSaudi || "—"}</div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "5mm", marginTop: "auto", paddingBottom: "1mm" }}>
                <QRCodeSVG value={buildQrData(p, group)} size={80} level="M" />
                <Barcode value={p.passportNumber || `H${String(p.serialNumber).padStart(3, "0")}`} height={40} width={2} fontSize={0} />
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "2mm 5mm", fontSize: "8pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
              Mohammed Altaf: 0547090786 | Mohammed Wasim: 0568780786
            </div>
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
