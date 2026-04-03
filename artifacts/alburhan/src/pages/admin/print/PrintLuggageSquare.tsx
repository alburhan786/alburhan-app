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
  mobileIndia?: string; mobileSaudi?: string;
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
        .sq-sticker {
          width: 100mm; height: 110mm;
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
      {pilgrims.map(p => (
        <div key={p.id} className="sq-sticker">
          <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{
              position: "absolute", top: "-8mm", right: "-6mm",
              width: "40mm", height: "40mm",
              background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
            }} />

            <div style={{ position: "relative", zIndex: 1, padding: "2.5mm 4mm 1.5mm", display: "flex", alignItems: "center", gap: "2mm" }}>
              <img src={`${BASE}images/logo.png`} alt="" style={{ height: "11mm", objectFit: "contain", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: "9pt", color: "#1A7A4A", letterSpacing: "0.8px", textTransform: "uppercase", lineHeight: 1.1 }}>AL-BURHAN</div>
                <div style={{ fontWeight: 700, fontSize: "6pt", color: GOLD, letterSpacing: "1px", textTransform: "uppercase" }}>TOURS & TRAVELS</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "13pt", fontWeight: 800, color: "#fff" }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                <div style={{ fontSize: "5.5pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
              </div>
            </div>

            <div style={{ background: groupColor, padding: "1.5mm 4mm", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: "8pt", letterSpacing: "0.8px" }}>GROUP: {groupLabel}</span>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: "7.5pt" }}>BUS: {p.busNumber || "—"}</span>
            </div>

            <div style={{ position: "relative", zIndex: 1, padding: "2mm 4mm 1mm", flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: "3mm", alignItems: "flex-start", marginBottom: "1.5mm" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14pt", fontWeight: 900, color: DARK, lineHeight: 1.15, textTransform: "uppercase", wordBreak: "break-word" }}>{p.fullName}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {p.photoUrl ? (
                    <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "18mm", height: "18mm", objectFit: "cover", borderRadius: "50%", border: `2px solid ${GOLD}` }} />
                  ) : (
                    <div style={{ width: "18mm", height: "18mm", background: "#f0f0f0", borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5pt", color: "#aaa" }}>PHOTO</div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: "2mm", marginBottom: "1.5mm" }}>
                <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "1mm 2mm", textAlign: "center" }}>
                  <div style={{ fontSize: "5.5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>PASSPORT</div>
                  <div style={{ fontSize: "14pt", fontWeight: 900, fontFamily: "monospace", letterSpacing: "0.8px", color: DARK }}>{p.passportNumber || "—"}</div>
                </div>
                <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "1mm 2mm", textAlign: "center" }}>
                  <div style={{ fontSize: "5.5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>MAKTAB</div>
                  <div style={{ fontSize: "11pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1mm 3mm", marginBottom: "1.5mm", fontSize: "7pt" }}>
                <div>
                  <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>HOTEL MAKKAH</div>
                  <div style={{ fontWeight: 700, color: "#222" }}>{group.hotels?.makkah?.name || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>HOTEL MADINAH</div>
                  <div style={{ fontWeight: 700, color: "#222" }}>{group.hotels?.madinah?.name || "—"}</div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "3mm", marginTop: "auto" }}>
                <QRCodeSVG value={buildQrData(p, group)} size={55} level="M" />
                <Barcode value={p.passportNumber || `H${String(p.serialNumber).padStart(3, "0")}`} height={22} width={1.5} fontSize={0} />
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "1.5mm 3mm", fontSize: "6pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
              Emergency: +91 9893225590 | +91 9893989786
            </div>
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
