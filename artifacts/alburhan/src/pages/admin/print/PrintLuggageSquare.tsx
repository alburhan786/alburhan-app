import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

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
    aziziah?: { name?: string; address?: string };
  };
}

const DARK = "#0A3D2A";
const GOLD = "#C9A84C";

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

function buildQrData(p: Pilgrim, group: Group, phone: string): string {
  return [
    `Name: ${p.fullName}`,
    `Passport: ${p.passportNumber || "N/A"}`,
    `Group: ${group.groupName}`,
    `Maktab: ${group.maktabNumber || "N/A"}`,
    `Bus: ${p.busNumber || "N/A"}`,
    `Hotel Makkah 1: ${group.hotels?.aziziah?.name || "N/A"}`,
    `Hotel Makkah 2: ${group.hotels?.makkah?.name || "N/A"}`,
    `Hotel Madinah: ${group.hotels?.madinah?.name || "N/A"}`,
    `India: ${p.mobileIndia || "N/A"}`,
    `Saudi: ${p.mobileSaudi || "N/A"}`,
    `Emergency: ${phone}`,
  ].join("\n");
}

export default function PrintLuggageSquare() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage-square");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
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

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .sq-sticker {
          width: 100mm; height: 100mm;
          border: 1.5px solid ${DARK}; border-radius: 5px; overflow: hidden;
          page-break-inside: avoid;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
        }
        .sq-row {
          display: flex; gap: 0; align-items: flex-start;
          page-break-after: always;
        }
        .sq-row:last-child { page-break-after: auto; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
        {pages.map((page, pageIdx) => (
          <div key={pageIdx} className="sq-row">
            {page.map(p => (
              <div key={p.id} className="sq-sticker">
                <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
                  <div style={{
                    position: "absolute", top: "-8mm", right: "-6mm",
                    width: "38mm", height: "38mm",
                    background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
                  }} />

                  <div style={{ position: "relative", zIndex: 1, padding: "2mm 3.5mm 1mm", display: "flex", alignItems: "center", gap: "2mm" }}>
                    {company.logoUrl
                      ? <img src={company.logoUrl} alt="" style={{ height: "10mm", objectFit: "contain", flexShrink: 0 }} />
                      : <div style={{ height: "10mm", width: "10mm", flexShrink: 0, background: DARK, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "6pt" }}>{company.nameShort.slice(0, 1)}</div>
                    }
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: "8pt", color: "#1A7A4A", letterSpacing: "0.8px", textTransform: "uppercase", lineHeight: 1.1 }}>{company.nameShort}</div>
                      <div style={{ fontWeight: 700, fontSize: "5.5pt", color: GOLD, letterSpacing: "1px", textTransform: "uppercase" }}>TOURS & TRAVELS</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "20pt", fontWeight: 900, color: "#fff", lineHeight: 1 }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                      <div style={{ fontSize: "5pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
                    </div>
                  </div>

                  <div style={{ background: groupColor, padding: "1mm 3.5mm", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
                    <span style={{ color: "#fff", fontWeight: 800, fontSize: "7.5pt", letterSpacing: "0.8px" }}>GROUP: {groupLabel}</span>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: "7pt" }}>BUS: {p.busNumber || "—"}</span>
                  </div>

                  <div style={{ position: "relative", zIndex: 1, padding: "1.5mm 3.5mm 1mm", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: "2.5mm", alignItems: "flex-start", marginBottom: "1mm" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12pt", fontWeight: 900, color: DARK, lineHeight: 1.15, textTransform: "uppercase", wordBreak: "break-word" }}>{p.fullName}</div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {p.photoUrl ? (
                          <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "15mm", height: "15mm", objectFit: "cover", borderRadius: "50%", border: `2px solid ${GOLD}` }} />
                        ) : (
                          <div style={{ width: "15mm", height: "15mm", background: "#f0f0f0", borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5pt", color: "#aaa" }}>PHOTO</div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "2mm", marginBottom: "1mm" }}>
                      <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "0.8mm 2mm", textAlign: "center" }}>
                        <div style={{ fontSize: "5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>PASSPORT</div>
                        <div style={{ fontSize: "12pt", fontWeight: 900, fontFamily: "monospace", letterSpacing: "0.5px", color: DARK }}>{p.passportNumber || "—"}</div>
                      </div>
                      <div style={{ flex: 1, background: "#f0fdf4", border: `1px solid ${DARK}`, borderRadius: "3px", padding: "0.8mm 2mm", textAlign: "center" }}>
                        <div style={{ fontSize: "5pt", color: "#666", textTransform: "uppercase", fontWeight: 600 }}>MAKTAB</div>
                        <div style={{ fontSize: "10pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.8mm 2mm", marginBottom: "1mm", fontSize: "6.5pt" }}>
                      <div>
                        <div style={{ fontSize: "4.5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>HOTEL MAKKAH 1</div>
                        <div style={{ fontWeight: 700, color: "#222", fontSize: "6pt" }}>{group.hotels?.aziziah?.name || "—"}</div>
                        {group.hotels?.aziziah?.address && <div style={{ fontSize: "4.5pt", color: "#666", lineHeight: 1.2 }}>{group.hotels.aziziah.address}</div>}
                      </div>
                      <div>
                        <div style={{ fontSize: "4.5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>HOTEL MAKKAH 2</div>
                        <div style={{ fontWeight: 700, color: "#222", fontSize: "6pt" }}>{group.hotels?.makkah?.name || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "4.5pt", color: "#999", textTransform: "uppercase", fontWeight: 600 }}>HOTEL MADINAH</div>
                        <div style={{ fontWeight: 700, color: "#222", fontSize: "6pt" }}>{group.hotels?.madinah?.name || "—"}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "2.5mm", marginTop: "auto" }}>
                      <QRCodeSVG value={buildQrData(p, group, company.phone)} size={48} level="M" />
                      <Barcode value={p.passportNumber || `H${String(p.serialNumber).padStart(3, "0")}`} height={20} width={1.3} fontSize={0} />
                    </div>
                  </div>

                  <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "1.2mm 3mm", fontSize: "6pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
                    Emergency: {company.phoneSaudi} | {company.phone}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
