import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";
const DARK_GREEN = "#0B3D2E";
const GOLD = "#C9A23F";

interface Pilgrim {
  id: string;
  serialNumber: number;
  fullName: string;
  salutation?: string;
  photoUrl?: string;
  passportNumber?: string;
  mobileIndia?: string;
  address?: string;
  city?: string;
}

interface Group {
  id: string;
  groupName: string;
  year: number;
  flightNumber?: string;
  returnDate?: string;
}

function buildQr(p: Pilgrim, group: Group): string {
  const lines = [
    `Name: ${p.fullName}`,
    `Serial: ${String(p.serialNumber).padStart(3, "0")}`,
    `Group: ${group.groupName} ${group.year}`,
    ...(group.flightNumber ? [`Flight: ${group.flightNumber}`] : []),
    ...(group.returnDate ? [`Return: ${group.returnDate}`] : []),
    ...(p.passportNumber ? [`Passport No: ${p.passportNumber}`] : []),
    ...(p.mobileIndia ? [`Mobile: ${p.mobileIndia}`] : []),
    `Emergency: 0547090786`,
    ...([p.address, p.city].filter(Boolean).length ? [`Address: ${[p.address, p.city].filter(Boolean).join(", ")}`] : []),
  ];
  return lines.join("\n");
}

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
      await downloadPdf(contentRef.current, {
        filename: `Zamzam-Tags-${group?.groupName || "group"}.pdf`,
        orientation: "portrait",
        format: "a4",
        margin: [5, 5],
        scale: 2,
      });
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
          @page { size: A4 portrait; margin: 5mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .zz-page {
          display: flex;
          flex-direction: column;
          gap: 4mm;
          width: 200mm;
          height: 284mm;
          page-break-after: always;
        }
        .zz-page:last-child { page-break-after: auto; }
        .zz-sticker {
          flex: 1;
          display: flex;
          flex-direction: row;
          font-family: Arial, sans-serif;
          background: #fff;
          border: 1.5px solid #ccc;
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }
      `}</style>

      <div className="no-print" style={{
        padding: "12px 20px", background: "#fef3c7", borderBottom: "1px solid #f59e0b",
        display: "flex", gap: "10px", alignItems: "center", justifyContent: "center",
        flexWrap: "wrap"
      }}>
        <strong style={{ fontSize: "15px", color: DARK_GREEN, marginRight: "8px" }}>
          🏷️ Zamzam Tags — {group.groupName} ({group.year}) — {pilgrims.length} pilgrims
        </strong>
        <button onClick={handleDownload} disabled={pdfLoading} style={{
          padding: "8px 20px", background: DARK_GREEN, color: "#fff", border: "none",
          borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "13px",
          opacity: pdfLoading ? 0.6 : 1
        }}>
          {pdfLoading ? "Generating..." : "⬇ Download PDF"}
        </button>
        <button onClick={() => window.print()} style={{
          padding: "8px 18px", background: "#1a2744", color: "#fff", border: "none",
          borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "13px"
        }}>
          🖨 Print
        </button>
        <button onClick={() => window.history.back()} style={{
          padding: "8px 14px", border: "1px solid #ccc", borderRadius: "7px",
          cursor: "pointer", background: "#fff", fontSize: "13px"
        }}>
          ← Back
        </button>
      </div>

      <div ref={contentRef} style={{ background: "#fff" }}>
        {pages.map((page, pageIdx) => (
          <div key={pageIdx} className="zz-page">
            {page.map(p => {
              const displayName = [p.salutation, p.fullName]
                .filter(Boolean).join(" ").toUpperCase();
              const serial = String(p.serialNumber).padStart(3, "0");
              const barcodeVal = p.passportNumber || `ZAM${serial}`;

              return (
                <div key={p.id} className="zz-sticker">

                  {/* ── Decorative corner circle top-right ── */}
                  <div style={{
                    position: "absolute", top: "-10mm", right: "-10mm",
                    width: "28mm", height: "28mm",
                    background: DARK_GREEN, borderRadius: "50%", zIndex: 0,
                  }} />

                  {/* ══ LEFT COLUMN: branding + photo + serial ══ */}
                  <div style={{
                    width: "62mm", flexShrink: 0,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "3mm 2mm 3mm 3mm",
                    borderRight: `1.5px solid ${GOLD}`,
                    background: "#fafff8",
                    position: "relative", zIndex: 1,
                  }}>
                    {/* Flag + Logo + Company */}
                    <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "2mm", width: "100%" }}>
                      <img src={`${BASE}images/india_flag.jpg`} alt="" style={{ width: "13mm", height: "13mm", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      <img src={`${BASE}images/logo.png`} alt="" style={{ height: "22mm", width: "22mm", objectFit: "contain", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 900, fontSize: "13pt", color: GOLD, letterSpacing: "0.3px", lineHeight: 1.1 }}>AL-BURHAN</div>
                        <div style={{ fontWeight: 700, fontSize: "9pt", color: DARK_GREEN, letterSpacing: "0.3px", lineHeight: 1.2 }}>TOURS &amp; TRAVELS</div>
                      </div>
                    </div>

                    {/* Circular Photo */}
                    <div style={{
                      width: "44mm", height: "44mm", borderRadius: "50%",
                      border: `3px solid ${GOLD}`,
                      overflow: "hidden", background: "#dce3dc",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: "1.5mm",
                    }}>
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <svg width="100%" height="100%" viewBox="0 0 76 76">
                          <circle cx="38" cy="30" r="16" fill="#b0b8b0" />
                          <ellipse cx="38" cy="62" rx="26" ry="18" fill="#b0b8b0" />
                        </svg>
                      )}
                    </div>

                    {/* Serial Number */}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>SERIAL NO.</div>
                      <div style={{
                        fontSize: "52pt", fontWeight: 900, color: DARK_GREEN,
                        lineHeight: 1, letterSpacing: "-1px",
                        fontFamily: "'Arial Black', Arial, sans-serif",
                        WebkitTextStroke: "3px white", paintOrder: "stroke fill",
                      }}>
                        #{serial}
                      </div>
                    </div>
                  </div>

                  {/* ══ RIGHT COLUMN: content ══ */}
                  <div style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    padding: "3mm 3mm 3mm 4mm", position: "relative", zIndex: 1, minWidth: 0,
                  }}>
                    {/* ZAMZAM Title */}
                    <div style={{ marginBottom: "1mm" }}>
                      <div style={{
                        fontSize: "26pt", fontWeight: 900, color: DARK_GREEN,
                        letterSpacing: "6px", lineHeight: 1, textTransform: "uppercase",
                        fontFamily: "'Arial Black', Arial, sans-serif"
                      }}>
                        ZAMZAM
                      </div>
                      <div style={{ fontSize: "7pt", color: "#999", letterSpacing: "3px", textTransform: "uppercase", fontStyle: "italic", fontWeight: 600 }}>
                        HOLY WATER
                      </div>
                    </div>

                    {/* Gold Divider */}
                    <div style={{ height: "0.7mm", background: GOLD, marginBottom: "1.5mm" }} />

                    {/* Pilgrim Name */}
                    <div style={{
                      fontSize: "17pt", fontWeight: 900, color: "#111",
                      lineHeight: 1.2, wordBreak: "break-word", textTransform: "uppercase",
                      fontFamily: "'Arial Black', Arial, sans-serif", marginBottom: "1.5mm"
                    }}>
                      {displayName}
                    </div>

                    {/* Green Badge */}
                    <div style={{ marginBottom: "1.5mm" }}>
                      <div style={{
                        display: "inline-block",
                        background: DARK_GREEN, color: "#fff", borderRadius: "99px",
                        padding: "1.5mm 5mm", fontSize: "9pt", fontWeight: 800,
                        letterSpacing: "0.3px", lineHeight: 1.4
                      }}>
                        Al Burhan Tours And Travels — {group.year}
                      </div>
                    </div>

                    {/* Flight Info */}
                    {(group.flightNumber || group.returnDate) && (
                      <div style={{ marginBottom: "1.5mm", fontSize: "10pt", fontWeight: 800, color: DARK_GREEN, lineHeight: 1.5 }}>
                        {group.flightNumber && (
                          <span>✈ <b>Flight:</b> {group.flightNumber}</span>
                        )}
                        {group.flightNumber && group.returnDate && <span style={{ margin: "0 2mm" }}>|</span>}
                        {group.returnDate && (
                          <span>🗓 <b>Return:</b> {group.returnDate}</span>
                        )}
                      </div>
                    )}

                    {/* Contact Info */}
                    <div style={{ fontSize: "9.5pt", lineHeight: 1.6, color: "#333", flex: 1 }}>
                      {p.passportNumber && (
                        <div><span style={{ fontWeight: 800, color: DARK_GREEN }}>Passport No: </span><span style={{ fontWeight: 700 }}>{p.passportNumber}</span></div>
                      )}
                      {p.mobileIndia && (
                        <div><span style={{ fontWeight: 800, color: DARK_GREEN }}>Mobile: </span><span style={{ fontWeight: 700 }}>{p.mobileIndia}</span></div>
                      )}
                      <div><span style={{ fontWeight: 800, color: "#b91c1c" }}>Emergency: </span><span style={{ fontWeight: 900, color: "#b91c1c" }}>0547090786</span></div>
                      {(p.address || p.city) && (
                        <div style={{ fontSize: "11pt", fontWeight: 900, color: DARK_GREEN, marginTop: "1mm" }}>
                          <span>Address: </span>{[p.address, p.city].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>

                    {/* Bottom: Barcode + QR */}
                    <div style={{
                      display: "flex", alignItems: "flex-end",
                      justifyContent: "space-between", gap: "2mm", marginTop: "1mm"
                    }}>
                      <div>
                        <Barcode value={barcodeVal} height={28} width={1.2} fontSize={0} />
                        <div style={{ fontSize: "5pt", color: "#555", fontFamily: "monospace", marginTop: "0.5mm", letterSpacing: "0.5px" }}>
                          {barcodeVal}
                        </div>
                      </div>
                      <QRCodeSVG value={buildQr(p, group)} size={130} level="M" fgColor={DARK_GREEN} />
                    </div>
                  </div>

                </div>
              );
            })}
            {page.length === 1 && <div style={{ flex: 1 }} />}
          </div>
        ))}
      </div>
    </>
  );
}
