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
const W = "85mm";
const H = "55mm";

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
  lines.push(`Emergency (Saudi): 0547090786 / 0568780786`);
  lines.push(`Emergency (India): +91 9893989786`);
  return lines.join("\n");
}

function BulletRow({ label, value, badge }: { label: string; value?: string; badge?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5mm", minHeight: "4.5mm" }}>
      <span style={{
        width: "3mm", height: "3mm", borderRadius: "50%",
        background: GOLD, flexShrink: 0, display: "inline-block",
      }} />
      <span style={{ fontSize: "4.5pt", color: "#777", textTransform: "uppercase", letterSpacing: "0.3px", minWidth: "13mm", flexShrink: 0 }}>
        {label}
      </span>
      {badge ? (
        <span style={{
          background: DARK, color: GOLD, fontSize: "5pt", fontWeight: 900,
          padding: "0.3mm 1.5mm", borderRadius: "3px", lineHeight: 1.4,
        }}>
          {value || "—"}
        </span>
      ) : (
        <span style={{ fontSize: "5pt", fontWeight: 800, color: DARK, lineHeight: 1.3 }}>
          {value || ""}
        </span>
      )}
    </div>
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
    ]).then(([g, p]) => { setGroup(g); setPilgrims(Array.isArray(p) ? p : []); });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

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
          border: 1px solid #bbb; border-radius: 4px; overflow: hidden;
          page-break-inside: avoid; font-family: Arial, sans-serif;
          background: #fff; position: relative; display: flex; flex-direction: column;
        }
        .pro-cards-row { display: flex; gap: 5mm; justify-content: center; margin-bottom: 3mm; }
        .pro-page-break { page-break-after: always; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px", opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}</button>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#fff", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", marginRight: "12px" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef} style={{ background: "#fff", padding: "4mm" }}>
        {pages.map((page, pi) => (
          <div key={pi} className={pi < pages.length - 1 ? "pro-page-break" : ""} style={{ marginBottom: "4mm" }}>

            {/* ══ FRONT FACES ══ */}
            <div className="pro-cards-row">
              {page.map(p => {
                const serial = String(p.serialNumber).padStart(3, "0");
                const barcodeVal = p.passportNumber || `HAJ${serial}`;
                return (
                  <div key={`f-${p.id}`} className="pro-card">

                    {/* ── Header bar ── */}
                    <div style={{
                      background: DARK, display: "flex", alignItems: "center",
                      justifyContent: "space-between", padding: "1.5mm 3mm",
                      flexShrink: 0, minHeight: "7mm",
                    }}>
                      <span style={{ fontSize: "4.5pt", fontWeight: 800, color: "#fff", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                        Al Burhan Tours And Travels
                      </span>
                      <span style={{ fontSize: "4pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", textTransform: "uppercase", background: "rgba(255,255,255,0.1)", padding: "0.5mm 1.5mm", borderRadius: "2px" }}>
                        Hajj Pilgrim
                      </span>
                    </div>

                    {/* ── Body row ── */}
                    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

                      {/* Left sidebar */}
                      <div style={{
                        width: "28mm", flexShrink: 0, background: "#f0f7f2",
                        display: "flex", flexDirection: "column", alignItems: "center",
                        padding: "2mm 1.5mm", gap: "1mm",
                        borderRight: `1.5px solid ${GOLD}`,
                      }}>
                        <img
                          src={`${BASE}images/logo.png`}
                          alt=""
                          style={{ width: "13mm", height: "13mm", objectFit: "contain" }}
                        />
                        <div style={{ textAlign: "center", lineHeight: 1.15 }}>
                          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.3px" }}>AL BURHAN</div>
                          <div style={{ fontSize: "3.5pt", fontWeight: 700, color: DARK, letterSpacing: "0.3px" }}>TOURS &amp; TRAVELS</div>
                          <div style={{ fontSize: "3.5pt", fontWeight: 800, color: DARK, marginTop: "0.3mm" }}>HAJJ {group.year}</div>
                        </div>
                        {/* Photo */}
                        <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {p.photoUrl ? (
                            <img
                              src={`${API}${p.photoUrl}`}
                              alt=""
                              style={{ width: "21mm", height: "26mm", objectFit: "cover", border: `2px solid ${GOLD}`, borderRadius: "2px" }}
                            />
                          ) : (
                            <div style={{
                              width: "21mm", height: "26mm", background: "#e8ede8",
                              border: `2px solid ${GOLD}`, borderRadius: "2px",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "4.5pt", color: "#aaa", fontWeight: 700, letterSpacing: "0.5px",
                            }}>PHOTO</div>
                          )}
                        </div>
                      </div>

                      {/* Right content */}
                      <div style={{ flex: 1, padding: "1.5mm 2.5mm 1mm 2.5mm", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
                        {/* Serial */}
                        <div style={{
                          fontSize: "20pt", fontWeight: 900, color: GOLD,
                          lineHeight: 1, letterSpacing: "0.5px",
                          fontFamily: "'Arial Black', Arial, sans-serif",
                        }}>
                          NO: {serial}
                        </div>
                        {/* Name */}
                        <div style={{
                          fontSize: "8pt", fontWeight: 900, color: DARK,
                          textTransform: "uppercase", lineHeight: 1.2,
                          wordBreak: "break-word", marginBottom: "1mm",
                          maxWidth: "calc(100% - 18mm)",
                        }}>
                          {p.fullName}
                        </div>

                        {/* Bullet list */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3mm" }}>
                          <BulletRow label="Passport No." value={p.passportNumber} />
                          <BulletRow label="Bus No." value={p.busNumber} />
                          <BulletRow label="Maktab" value={group.maktabNumber} badge />
                          <BulletRow label="India Mobile" value={p.mobileIndia} />
                          <BulletRow label="Saudi Mobile" value={p.mobileSaudi} />
                        </div>

                        {/* QR code — absolute bottom-right */}
                        <div style={{ position: "absolute", bottom: "1mm", right: "1.5mm" }}>
                          <QRCodeSVG value={buildQrData(p, group)} size={44} level="M" fgColor={DARK} />
                        </div>
                      </div>
                    </div>

                    {/* ── Barcode + footer strip ── */}
                    <div style={{ flexShrink: 0, borderTop: "0.5px solid #ddd" }}>
                      <div style={{ display: "flex", justifyContent: "center", padding: "0.5mm 3mm 0" }}>
                        <Barcode value={barcodeVal} height={10} width={0.75} fontSize={0} />
                      </div>
                      <div style={{
                        textAlign: "center", fontSize: "3.5pt", color: "#b91c1c",
                        fontWeight: 700, padding: "0.3mm 2mm 1mm", letterSpacing: "0.3px",
                      }}>
                        #{serial} | Emergency: 0547090786 | 0568780786
                      </div>
                    </div>

                  </div>
                );
              })}
              {Array.from({ length: 2 - page.length }).map((_, i) => (
                <div key={`ph-f-${i}`} className="pro-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
              ))}
            </div>

            {/* ══ BACK FACES ══ */}
            <div className="pro-cards-row">
              {page.map(p => {
                const serial = String(p.serialNumber).padStart(3, "0");
                return (
                  <div key={`b-${p.id}`} className="pro-card">

                    {/* ── Header bar ── */}
                    <div style={{
                      background: DARK, padding: "2mm 3mm", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      minHeight: "8mm",
                    }}>
                      <span style={{
                        fontSize: "5pt", fontWeight: 900, color: "#fff",
                        textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "center", lineHeight: 1.3,
                      }}>
                        Hajj Pilgrim Identification — Al Burhan Tours And Travels
                      </span>
                    </div>

                    {/* ── Body ── */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "2mm 3mm 1mm", position: "relative", overflow: "hidden" }}>

                      {/* Two-column: maktab/bus | emergency */}
                      <div style={{ display: "flex", gap: "3mm", marginBottom: "1.5mm" }}>
                        {/* Left col */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Maktab No.</div>
                          <div style={{ fontSize: "16pt", fontWeight: 900, color: DARK, lineHeight: 1 }}>
                            {group.maktabNumber || "—"}
                          </div>
                          <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginTop: "1mm" }}>Bus No.</div>
                          <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK }}>{p.busNumber || "—"}</div>
                        </div>
                        {/* Right col */}
                        <div style={{ flex: 1.2 }}>
                          <div style={{ fontSize: "4pt", fontWeight: 800, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px" }}>Emergency</div>
                          <div style={{ fontSize: "4pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.2px", lineHeight: 1.2 }}>Saudi</div>
                          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>0547090786</div>
                          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>0568780786</div>
                          <div style={{ fontSize: "4pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.2px", lineHeight: 1.2, marginTop: "0.5mm" }}>India</div>
                          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>+91 9893989786</div>
                        </div>
                      </div>

                      {/* Hotels */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.8mm" }}>
                        <div>
                          <div style={{ fontSize: "3.5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Hotel Makkah</div>
                          <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{group.hotels?.makkah?.name || "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "3.5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Hotel Madinah</div>
                          <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{group.hotels?.madinah?.name || "—"}</div>
                        </div>
                      </div>

                      {/* India flag — absolute bottom-right */}
                      <img
                        src={`${BASE}images/india_flag.jpg`}
                        alt=""
                        style={{
                          position: "absolute", bottom: "1mm", right: "2mm",
                          width: "10mm", height: "10mm", borderRadius: "50%", objectFit: "cover",
                          border: `1.5px solid ${GOLD}`,
                        }}
                      />

                      {/* Pilgrim name */}
                      <div style={{ marginTop: "auto", paddingTop: "1mm" }}>
                        <div style={{ fontSize: "3.5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Pilgrim</div>
                        <div style={{
                          fontSize: "11pt", fontWeight: 900, color: DARK,
                          textTransform: "uppercase", lineHeight: 1.15,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          maxWidth: "calc(100% - 14mm)",
                        }}>
                          {p.fullName}
                        </div>
                      </div>
                    </div>

                    {/* ── Footer ── */}
                    <div style={{
                      background: DARK, padding: "1.2mm 3mm", flexShrink: 0,
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "3pt", color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>
                        Khanka Masjid Complex, Sanwara Rd, Burhanpur 450331 M.P.
                      </div>
                      <div style={{ fontSize: "3.5pt", color: GOLD, fontWeight: 800, letterSpacing: "0.2px", lineHeight: 1.4 }}>
                        AL BURHAN TOURS &amp; TRAVELS | +91 9893989786
                      </div>
                    </div>

                  </div>
                );
              })}
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
