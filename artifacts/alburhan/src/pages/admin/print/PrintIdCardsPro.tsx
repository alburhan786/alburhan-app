import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; mobileSaudi?: string;
  city?: string; busNumber?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  hotels?: {
    groupLeader?: string;
    makkah?: { name?: string; address?: string; googleMapsLink?: string };
    madinah?: { name?: string; address?: string; googleMapsLink?: string };
  };
}

const DARK = "#0B3D2E";
const GOLD = "#C9A23F";
const GOLD_LIGHT = "#E8D48B";
const W = "85mm";
const H = "54mm";

function buildQrData(p: Pilgrim, group: Group): string {
  const lines = [
    `Name: ${p.fullName}`,
    `Passport: ${p.passportNumber || "N/A"}`,
    `Group: ${group.groupName}`,
  ];
  if (group.hotels?.makkah?.name)
    lines.push(`Hotel: ${group.hotels.makkah.name}`);
  if (group.hotels?.makkah?.address)
    lines.push(`Address: ${group.hotels.makkah.address}`);
  if (group.hotels?.makkah?.googleMapsLink)
    lines.push(`Location: ${group.hotels.makkah.googleMapsLink}`);
  if (p.busNumber)
    lines.push(`Bus: ${p.busNumber}`);
  lines.push(`Emergency: +91 9893225590`);
  return lines.join("\n");
}

function FrontWaves() {
  return (
    <>
      <div style={{
        position: "absolute", top: 0, right: 0, width: "28mm", height: "30mm",
        background: DARK, borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", top: "8mm", right: 0, width: "18mm", height: "18mm",
        background: "rgba(255,255,255,0.07)", borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: "22mm", height: "22mm",
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "0 100% 0 0", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: "5mm", left: 0, width: "12mm", height: "12mm",
        background: "rgba(255,255,255,0.12)", borderRadius: "0 100% 0 0", zIndex: 0,
      }} />
    </>
  );
}

function BackWaves() {
  return (
    <>
      <div style={{
        position: "absolute", top: 0, left: 0, width: "24mm", height: "26mm",
        background: DARK, borderRadius: "0 0 100% 0", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", top: "7mm", left: 0, width: "15mm", height: "15mm",
        background: "rgba(255,255,255,0.07)", borderRadius: "0 0 100% 0", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: 0, right: 0, width: "20mm", height: "20mm",
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "100% 0 0 0", zIndex: 0,
      }} />
    </>
  );
}

export default function PrintIdCardsPro() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards-pro");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!contentRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadPdf(contentRef.current, { filename: `Pro-ID-Cards-${group?.groupName || "group"}.pdf` });
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

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  const labelStyle: React.CSSProperties = { fontSize: "4.5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 };
  const valueStyle: React.CSSProperties = { fontSize: "5.5pt", fontWeight: 700, color: "#222", lineHeight: 1.3 };
  const bulletDot: React.CSSProperties = { width: "2.5mm", height: "2.5mm", borderRadius: "50%", background: GOLD, flexShrink: 0, marginTop: "0.5mm" };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .pro-card {
          width: ${W}; height: ${H};
          border: 1px solid #ccc; border-radius: 4px; overflow: hidden;
          page-break-inside: avoid; font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
        }
        .pro-cards-row { display: flex; gap: 6mm; justify-content: center; margin-bottom: 4mm; }
        .pro-page-break { page-break-after: always; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px", opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
      {pages.map((page, pi) => (
        <div key={pi} className={pi < pages.length - 1 ? "pro-page-break" : ""} style={{ padding: "4mm 0" }}>

          <div className="pro-cards-row">
            {page.map(p => (
              <div key={`f-${p.id}`} className="pro-card">
                <FrontWaves />
                <div style={{ position: "relative", zIndex: 1, display: "flex", height: "100%", padding: "2.5mm 3mm 0" }}>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "28mm", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1.5mm", marginBottom: "1mm" }}>
                      <img src={BASE + "images/logo.png"} alt="" style={{ width: "7mm", height: "7mm", objectFit: "contain" }} />
                      <div>
                        <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, letterSpacing: "0.3px", lineHeight: 1.1 }}>AL BURHAN</div>
                        <div style={{ fontSize: "3.5pt", fontWeight: 700, color: GOLD, letterSpacing: "0.4px" }}>TOURS & TRAVELS</div>
                        <div style={{ fontSize: "4pt", fontWeight: 800, color: DARK, marginTop: "0.3mm" }}>HAJJ {group.year}</div>
                      </div>
                    </div>

                    <div style={{ marginBottom: "1mm" }}>
                      {p.photoUrl ? (
                        <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "25mm", height: "25mm", objectFit: "cover", borderRadius: "50%", border: `2px solid ${GOLD}` }} />
                      ) : (
                        <div style={{ width: "25mm", height: "25mm", background: "#f0f0f0", borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5pt", color: "#aaa" }}>PHOTO</div>
                      )}
                    </div>

                    <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, textAlign: "center", lineHeight: 1.15, textTransform: "uppercase", wordBreak: "break-word", maxWidth: "26mm" }}>{p.fullName}</div>
                  </div>

                  <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: "2mm", minWidth: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.2mm", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>Passport No.</div><div style={{ ...valueStyle, fontFamily: "monospace", letterSpacing: "0.5px" }}>{p.passportNumber || "—"}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>City</div><div style={valueStyle}>{p.city || "—"}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>Group</div><div style={valueStyle}>{group.groupName}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>Bus No.</div><div style={valueStyle}>{p.busNumber || "—"}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>India Mobile</div><div style={valueStyle}>{p.mobileIndia || "—"}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>Saudi Mobile</div><div style={valueStyle}>{p.mobileSaudi || "—"}</div></div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1mm" }}>
                      <QRCodeSVG value={buildQrData(p, group)} size={52} level="M" />
                    </div>
                  </div>

                </div>

                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2 }}>
                  <div style={{ display: "flex", justifyContent: "center", overflow: "hidden", marginBottom: "0.5mm", padding: "0 3mm" }}>
                    <Barcode value={`${p.passportNumber || "N/A"}-${String(p.serialNumber).padStart(3, "0")}`} height={12} width={1.0} fontSize={0} />
                  </div>
                  <div style={{ background: DARK, color: GOLD, padding: "1mm 2mm", fontSize: "3.8pt", textAlign: "center", fontWeight: 700, letterSpacing: "0.2px" }}>
                    #{String(p.serialNumber).padStart(3, "0")} | Altaf: 0547090786 | Wasim: 0568780786
                  </div>
                </div>

              </div>
            ))}
            {Array.from({ length: 2 - page.length }).map((_, i) => (
              <div key={`ph-f-${i}`} className="pro-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
            ))}
          </div>

          <div className="pro-cards-row">
            {page.map(p => (
              <div key={`b-${p.id}`} className="pro-card">
                <BackWaves />
                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", padding: "2.5mm 3mm 0" }}>

                  <div style={{ background: DARK, color: GOLD, padding: "1.5mm 3mm", borderRadius: "3px", textAlign: "center", marginBottom: "2mm", fontSize: "6pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>
                    Hajj Pilgrim Identification
                  </div>

                  <div style={{ display: "flex", gap: "3mm", flex: 1 }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.5mm" }}>
                      <div>
                        <div style={labelStyle}>Maktab No.</div>
                        <div style={valueStyle}>{group.maktabNumber || "—"}</div>
                      </div>
                      <div>
                        <div style={labelStyle}>Hotel Makkah</div>
                        <div style={valueStyle}>{group.hotels?.makkah?.name || "—"}</div>
                        {group.hotels?.makkah?.address && <div style={{ fontSize: "4pt", color: "#888", lineHeight: 1.3 }}>{group.hotels.makkah.address}</div>}
                      </div>
                      <div>
                        <div style={labelStyle}>Hotel Madinah</div>
                        <div style={valueStyle}>{group.hotels?.madinah?.name || "—"}</div>
                        {group.hotels?.madinah?.address && <div style={{ fontSize: "4pt", color: "#888", lineHeight: 1.3 }}>{group.hotels.madinah.address}</div>}
                      </div>
                      <div>
                        <div style={labelStyle}>Group Leader</div>
                        <div style={valueStyle}>{group.hotels?.groupLeader || "—"}</div>
                      </div>
                    </div>

                    <div style={{ width: "30mm", flexShrink: 0, display: "flex", flexDirection: "column", gap: "1mm" }}>
                      <div style={{ fontSize: "4.5pt", fontWeight: 800, color: DARK, textTransform: "uppercase", letterSpacing: "0.3px" }}>Emergency Contacts</div>
                      <div style={{ fontSize: "5pt", lineHeight: 1.6, color: "#333" }}>
                        <div style={{ fontWeight: 700 }}>+91 9893225590</div>
                        <div style={{ fontWeight: 700 }}>+91 9893989786</div>
                        <div style={{ fontWeight: 700 }}>0547090786</div>
                        <div style={{ fontWeight: 700 }}>0568780786</div>
                      </div>
                      <div style={{ marginTop: "auto", display: "flex", justifyContent: "center" }}>
                        <img src={BASE + "images/india_flag.jpg"} alt="" style={{ width: "8mm", height: "8mm", borderRadius: "50%", objectFit: "cover" }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "auto" }}>
                    <div style={{ fontSize: "6pt", fontWeight: 700, color: DARK, textAlign: "center", marginBottom: "0.5mm" }}>{p.fullName}</div>
                    <div style={{ background: DARK, color: "#fff", padding: "1mm 2mm", fontSize: "3.5pt", textAlign: "center", lineHeight: 1.5, borderRadius: "0 0 3px 3px", margin: "0 -3mm" }}>
                      <div>Khanka Masjid Complex, Sanwara Rd, Burhanpur 450331 M.P.</div>
                      <div style={{ color: GOLD, fontWeight: 800, fontSize: "4pt", letterSpacing: "0.2px" }}>AL BURHAN TOURS & TRAVELS | +91 9893225590</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {Array.from({ length: 2 - page.length }).map((_, i) => (
              <div key={`ph-b-${i}`} className="pro-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
            ))}
          </div>

        </div>
      ))}
      </div>
    </>
  );
}
