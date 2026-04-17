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
}

interface Group {
  id: string;
  groupName: string;
  year: number;
  flightNumber?: string;
  returnDate?: string;
}

function buildQr(p: Pilgrim, group: Group): string {
  return [
    `Name: ${p.fullName}`,
    `Serial: ${String(p.serialNumber).padStart(3, "0")}`,
    `Group: ${group.groupName} ${group.year}`,
    ...(group.flightNumber ? [`Flight: ${group.flightNumber}`] : []),
    `Emergency: 0547090786`,
  ].join("\n");
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
          gap: 4mm;
          width: 200mm;
          height: 284mm;
          page-break-after: always;
          align-items: stretch;
        }
        .zz-page:last-child { page-break-after: auto; }
        .zz-sticker {
          flex: 1;
          display: flex;
          flex-direction: column;
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

                  {/* ── Decorative corner circle ── */}
                  <div style={{
                    position: "absolute", top: "-14mm", right: "-14mm",
                    width: "32mm", height: "32mm",
                    background: DARK_GREEN, borderRadius: "50%",
                    zIndex: 0,
                  }} />

                  {/* ── Header ── */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: "2mm",
                    padding: "3.5mm 4mm 3mm", position: "relative", zIndex: 1
                  }}>
                    <img
                      src={`${BASE}images/india_flag.jpg`}
                      alt=""
                      style={{ width: "9mm", height: "9mm", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                    <img
                      src={`${BASE}images/logo.png`}
                      alt=""
                      style={{ height: "16mm", width: "16mm", objectFit: "contain", flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 900, fontSize: "9pt", color: GOLD,
                        letterSpacing: "0.5px", lineHeight: 1.1
                      }}>
                        AL-BURHAN
                      </div>
                      <div style={{
                        fontWeight: 900, fontSize: "7.5pt", color: DARK_GREEN,
                        letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.2
                      }}>
                        TOURS &amp; TRAVELS
                      </div>
                    </div>
                  </div>

                  {/* ── ZAMZAM Title ── */}
                  <div style={{ textAlign: "center", padding: "1mm 4mm 0" }}>
                    <div style={{
                      fontSize: "28pt", fontWeight: 900, color: DARK_GREEN,
                      letterSpacing: "7px", lineHeight: 1, textTransform: "uppercase",
                      fontFamily: "'Arial Black', Arial, sans-serif"
                    }}>
                      ZAMZAM
                    </div>
                    <div style={{
                      fontSize: "6.5pt", color: "#999", letterSpacing: "3px",
                      textTransform: "uppercase", marginTop: "1mm", fontStyle: "italic",
                      fontWeight: 600
                    }}>
                      HOLY WATER
                    </div>
                  </div>

                  {/* ── Gold Divider ── */}
                  <div style={{ height: "0.7mm", background: GOLD, margin: "3mm 4mm" }} />

                  {/* ── Circular Photo ── */}
                  <div style={{ display: "flex", justifyContent: "center", padding: "0 4mm" }}>
                    <div style={{
                      width: "38mm", height: "38mm", borderRadius: "50%",
                      border: `3.5px solid ${GOLD}`,
                      overflow: "hidden", background: "#dce3dc",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <svg width="100%" height="100%" viewBox="0 0 76 76">
                          <circle cx="38" cy="30" r="16" fill="#b0b8b0" />
                          <ellipse cx="38" cy="62" rx="26" ry="18" fill="#b0b8b0" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* ── Serial Number ── */}
                  <div style={{ textAlign: "center", padding: "3mm 4mm 0" }}>
                    <div style={{
                      fontSize: "5.5pt", color: "#999", textTransform: "uppercase",
                      letterSpacing: "2px", fontWeight: 700
                    }}>
                      SERIAL NO.
                    </div>
                    <div style={{
                      fontSize: "46pt", fontWeight: 900, color: DARK_GREEN,
                      lineHeight: 1.05, letterSpacing: "-1px",
                      fontFamily: "'Arial Black', Arial, sans-serif"
                    }}>
                      #{serial}
                    </div>
                  </div>

                  {/* ── Pilgrim Name ── */}
                  <div style={{ textAlign: "center", padding: "1mm 5mm 2.5mm" }}>
                    <div style={{
                      fontSize: "13pt", fontWeight: 900, color: "#111",
                      lineHeight: 1.2, wordBreak: "break-word", textTransform: "uppercase",
                      fontFamily: "'Arial Black', Arial, sans-serif"
                    }}>
                      {displayName}
                    </div>
                  </div>

                  {/* ── Green Badge ── */}
                  <div style={{ display: "flex", justifyContent: "center", padding: "0 4mm" }}>
                    <div style={{
                      background: DARK_GREEN, color: "#fff", borderRadius: "99px",
                      padding: "2mm 7mm", fontSize: "7pt", fontWeight: 800,
                      textAlign: "center", letterSpacing: "0.3px", lineHeight: 1.4
                    }}>
                      Al Burhan Tours And Travels — {group.year}
                    </div>
                  </div>

                  {/* White flex spacer */}
                  <div style={{ flex: 1 }} />

                  {/* ── Bottom: Barcode + QR ── */}
                  <div style={{
                    display: "flex", alignItems: "flex-end",
                    justifyContent: "space-between",
                    padding: "0 4mm 3.5mm", gap: "2mm"
                  }}>
                    <div>
                      <Barcode value={barcodeVal} height={30} width={1.1} fontSize={0} />
                      <div style={{
                        fontSize: "5pt", color: "#555", fontFamily: "monospace",
                        marginTop: "0.5mm", letterSpacing: "0.5px"
                      }}>
                        {barcodeVal}
                      </div>
                    </div>
                    <QRCodeSVG
                      value={buildQr(p, group)}
                      size={90}
                      level="M"
                      fgColor={DARK_GREEN}
                    />
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
