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
  city?: string; busNumber?: string; roomNumber?: string; seatNumber?: string;
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
const H = "85mm";

const GROUP_COLOR_MAP: Record<string, { bg: string; label: string }> = {
  VIP: { bg: "#c0392b", label: "VIP" },
  A: { bg: "#1A7A4A", label: "GROUP A" },
  B: { bg: "#2563EB", label: "GROUP B" },
  C: { bg: "#D97706", label: "GROUP C" },
  D: { bg: "#DC2626", label: "GROUP D" },
};

function getGroupColor(groupName: string): { bg: string; label: string } {
  const upper = groupName.trim().toUpperCase();
  if (upper.includes("VIP")) return GROUP_COLOR_MAP.VIP;
  const last = upper.slice(-1);
  return GROUP_COLOR_MAP[last] || { bg: "#6B7280", label: upper };
}

function buildQrData(p: Pilgrim, group: Group): string {
  const lines = [
    `Name: ${p.fullName}`,
    `Passport: ${p.passportNumber || "N/A"}`,
    `Group: ${group.groupName} (${group.year})`,
  ];
  if (p.mobileIndia) lines.push(`Mobile (India): ${p.mobileIndia}`);
  if (p.mobileSaudi) lines.push(`Mobile (Saudi): ${p.mobileSaudi}`);
  if (group.hotels?.makkah?.name) lines.push(`Hotel Makkah: ${group.hotels.makkah.name}`);
  if (group.hotels?.madinah?.name) lines.push(`Hotel Madinah: ${group.hotels.madinah.name}`);
  if (p.roomNumber) lines.push(`Room: ${p.roomNumber}`);
  if (p.busNumber) lines.push(`Bus: ${p.busNumber}`);
  if (p.seatNumber) lines.push(`Seat: ${p.seatNumber}`);
  if (group.hotels?.groupLeader) lines.push(`Group Leader: ${group.hotels.groupLeader}`);
  lines.push(`Emergency (Saudi): Mohammed Altaf 0547090786 | Mohammed Wasim 0568780786`);
  lines.push(`Emergency (India): +91 9893989786`);
  return lines.join("\n");
}

function FrontWaves({ groupColor }: { groupColor: string }) {
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
        position: "absolute", bottom: 0, left: 0, right: 0, height: "3mm",
        background: groupColor, zIndex: 2,
      }} />
      <div style={{
        position: "absolute", bottom: "3mm", left: 0, width: "22mm", height: "22mm",
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "0 100% 0 0", zIndex: 0,
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

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const { bg: groupColor, label: groupLabel } = getGroupColor(group.groupName);
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
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#fff", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", marginRight: "12px" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
      {pages.map((page, pi) => (
        <div key={pi} className={pi < pages.length - 1 ? "pro-page-break" : ""} style={{ padding: "4mm 0" }}>

          {/* FRONT FACES */}
          <div className="pro-cards-row">
            {page.map(p => (
              <div key={`f-${p.id}`} className="pro-card">
                <FrontWaves groupColor={groupColor} />

                {/* Group color badge top-left */}
                <div style={{
                  position: "absolute", top: "2mm", left: "2mm", zIndex: 3,
                  background: groupColor, color: "#fff",
                  padding: "0.8mm 2mm", borderRadius: "2px",
                  fontSize: "4.5pt", fontWeight: 800, letterSpacing: "0.5px",
                }}>
                  {groupLabel}
                </div>

                <div style={{ position: "relative", zIndex: 1, display: "flex", height: "100%", padding: "2.5mm 3mm 0" }}>

                  {/* Left column: logo + photo + name */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "26mm", flexShrink: 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "1mm", marginTop: "3mm" }}>
                      <img src={BASE + "images/logo.png"} alt="" style={{ width: "14mm", height: "14mm", objectFit: "contain", marginBottom: "0.5mm" }} />
                      <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, letterSpacing: "0.5px", lineHeight: 1.1, textAlign: "center" }}>AL BURHAN</div>
                      <div style={{ fontSize: "3.5pt", fontWeight: 700, color: GOLD, letterSpacing: "0.5px", textAlign: "center" }}>TOURS & TRAVELS</div>
                      <div style={{ fontSize: "4pt", fontWeight: 800, color: DARK, marginTop: "0.3mm", textAlign: "center" }}>HAJJ {group.year}</div>
                    </div>

                    {/* Passport-style photo */}
                    <div style={{ marginBottom: "1mm" }}>
                      {p.photoUrl ? (
                        <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "22mm", height: "30mm", objectFit: "cover", borderRadius: "2px", border: `2px solid ${GOLD}` }} />
                      ) : (
                        <div style={{ width: "22mm", height: "30mm", background: "#f0f0f0", borderRadius: "2px", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5pt", color: "#aaa" }}>PHOTO</div>
                      )}
                    </div>
                  </div>

                  {/* Right column: fields + pilgrim number + QR */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingLeft: "2mm", minWidth: 0 }}>

                    {/* Big Pilgrim Number */}
                    <div style={{
                      background: DARK, color: GOLD, borderRadius: "3px",
                      padding: "1mm 2mm", marginBottom: "1.5mm", textAlign: "center",
                    }}>
                      <div style={{ fontSize: "3.5pt", fontWeight: 700, letterSpacing: "1px", opacity: 0.8, textTransform: "uppercase" }}>HAJJ PILGRIM</div>
                      <div style={{ fontSize: "13pt", fontWeight: 900, lineHeight: 1, letterSpacing: "1px" }}>
                        NO: {String(p.serialNumber).padStart(3, "0")}
                      </div>
                    </div>

                    <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK, lineHeight: 1.15, textTransform: "uppercase", wordBreak: "break-word", marginBottom: "1mm" }}>{p.fullName}</div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1mm", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>Passport No.</div><div style={{ ...valueStyle, fontFamily: "monospace", letterSpacing: "0.5px", fontSize: "7pt", fontWeight: 900 }}>{p.passportNumber || "—"}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>Bus No.</div><div style={valueStyle}>{p.busNumber || "—"}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm" }}>
                        <div style={bulletDot} />
                        <div><div style={labelStyle}>Maktab</div><div style={{ ...valueStyle, background: DARK, color: GOLD, padding: "0 1.5mm", borderRadius: "2px", display: "inline-block", fontSize: "7pt", fontWeight: 900 }}>{group.maktabNumber || "—"}</div></div>
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

                  </div>{/* end right column */}

                </div>{/* end content row */}

                {/* QR code — absolutely placed above footer, z-index above footer bar */}
                <div style={{ position: "absolute", bottom: "10mm", right: "3mm", zIndex: 3, background: "#fff", padding: "1px", borderRadius: "2px" }}>
                  <QRCodeSVG
                    value={buildQrData(p, group)}
                    size={38}
                    level="M"
                  />
                </div>

                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2 }}>
                  <div style={{ display: "flex", justifyContent: "center", overflow: "hidden", padding: "0 4mm" }}>
                    <Barcode value={`${p.passportNumber || "N/A"}-${String(p.serialNumber).padStart(3, "0")}`} height={10} width={0.9} fontSize={0} />
                  </div>
                  <div style={{ background: DARK, padding: "1.5mm 2mm", marginTop: "0.5mm" }}>
                    <div style={{ color: "#aaa", fontSize: "3.8pt", textAlign: "center", letterSpacing: "0.5px", marginBottom: "0.8mm" }}>
                      #{String(p.serialNumber).padStart(3, "0")} · EMERGENCY CONTACT (SAUDI)
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", gap: "6mm" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ color: GOLD, fontSize: "6pt", fontWeight: 900, lineHeight: 1.2 }}>Mohammed Altaf</div>
                        <div style={{ color: "#fff", fontSize: "6pt", fontWeight: 900, lineHeight: 1.2 }}>0547090786</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ color: GOLD, fontSize: "6pt", fontWeight: 900, lineHeight: 1.2 }}>Mohammed Wasim</div>
                        <div style={{ color: "#fff", fontSize: "6pt", fontWeight: 900, lineHeight: 1.2 }}>0568780786</div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            ))}
            {Array.from({ length: 2 - page.length }).map((_, i) => (
              <div key={`ph-f-${i}`} className="pro-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
            ))}
          </div>

          {/* BACK FACES */}
          <div className="pro-cards-row">
            {page.map(p => (
              <div key={`b-${p.id}`} className="pro-card">
                <BackWaves />
                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", padding: "2.5mm 3mm 0" }}>

                  <div style={{ background: groupColor, color: "#fff", padding: "1.5mm 3mm", borderRadius: "3px", textAlign: "center", marginBottom: "2mm", fontSize: "6pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>
                    Hajj Pilgrim Identification — {groupLabel}
                  </div>

                  <div style={{ display: "flex", gap: "2mm", paddingBottom: "14mm" }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.5mm", minWidth: 0 }}>
                      <div>
                        <div style={{ fontSize: "5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Maktab No.</div>
                        <div style={{ display: "inline-block", background: DARK, color: GOLD, fontSize: "8pt", fontWeight: 900, padding: "0.5mm 2mm", borderRadius: "2px", marginTop: "0.5mm" }}>{group.maktabNumber || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Bus No.</div>
                        <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK }}>{p.busNumber || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Hotel Makkah</div>
                        <div style={{ fontSize: "9pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>{group.hotels?.makkah?.name || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Hotel Madinah</div>
                        <div style={{ fontSize: "9pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>{group.hotels?.madinah?.name || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Group Leader</div>
                        <div style={{ fontSize: "7pt", fontWeight: 800, color: DARK, lineHeight: 1.3 }}>{group.hotels?.groupLeader || "—"}</div>
                      </div>
                    </div>

                    <div style={{ width: "22mm", flexShrink: 0, display: "flex", flexDirection: "column", gap: "1mm", alignItems: "center" }}>
                      <div style={{ fontSize: "5pt", fontWeight: 800, color: DARK, textTransform: "uppercase", letterSpacing: "0.3px", textAlign: "center" }}>Emergency</div>
                      <div style={{ lineHeight: 1.5, color: "#333", textAlign: "center" }}>
                        <div style={{ fontSize: "4pt", color: "#888" }}>SAUDI</div>
                        <div style={{ fontWeight: 900, fontSize: "5.5pt" }}>Mohammed Altaf</div>
                        <div style={{ fontWeight: 900, fontSize: "5.5pt" }}>0547090786</div>
                        <div style={{ fontWeight: 900, fontSize: "5.5pt", marginTop: "0.5mm" }}>Mohammed Wasim</div>
                        <div style={{ fontWeight: 900, fontSize: "5.5pt" }}>0568780786</div>
                        <div style={{ fontSize: "4pt", color: "#888", marginTop: "0.5mm" }}>INDIA</div>
                        <div style={{ fontWeight: 900, fontSize: "5.5pt" }}>+91 9893989786</div>
                      </div>
                      <div style={{ marginTop: "2mm", display: "flex", justifyContent: "center" }}>
                        <img src={BASE + "images/india_flag.jpg"} alt="" style={{ width: "10mm", height: "10mm", borderRadius: "50%", objectFit: "cover", border: `2px solid ${GOLD}` }} />
                      </div>
                      <div style={{ fontSize: "4pt", fontWeight: 700, color: "#666", textAlign: "center", marginTop: "1mm" }}>🇮🇳 INDIA GROUP</div>
                    </div>
                  </div>

                </div>

                {/* Back footer: pilgrim name + address — absolute so it always shows */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3 }}>
                  <div style={{ background: DARK, padding: "1.2mm 3mm", textAlign: "center" }}>
                    <div style={{ fontSize: "3.5pt", color: "#fff", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1 }}>PILGRIM</div>
                    <div style={{ fontSize: "9pt", fontWeight: 900, color: GOLD, lineHeight: 1.2, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.fullName}</div>
                  </div>
                  <div style={{ background: DARK, color: "#fff", padding: "1mm 2mm", fontSize: "3.5pt", textAlign: "center", lineHeight: 1.5, borderTop: `0.5px solid ${GOLD}` }}>
                    <div>Khanka Masjid Complex, Sanwara Rd, Burhanpur 450331 M.P.</div>
                    <div style={{ color: GOLD, fontWeight: 800, fontSize: "4pt", letterSpacing: "0.2px" }}>AL BURHAN TOURS & TRAVELS | +91 9893989786</div>
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
