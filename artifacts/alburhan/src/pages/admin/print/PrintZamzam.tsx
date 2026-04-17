import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string;
  serialNumber: number;
  fullName: string;
  photoUrl?: string;
  passportNumber?: string;
  mobileIndia?: string;
}
interface Group {
  id: string;
  groupName: string;
  year: number;
  maktabNumber?: string;
  flightNumber?: string;
  returnDate?: string;
}

const DARK = "#0A3D2A";
const GOLD = "#C9A84C";

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
      await downloadPdf(contentRef.current, { filename: `Zamzam-Tags-${group?.groupName || "group"}.pdf` });
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

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  function buildQr(p: Pilgrim): string {
    return [
      `Name: ${p.fullName}`,
      `Serial: ${String(p.serialNumber).padStart(3, "0")}`,
      `Group: ${group!.groupName} ${group!.year}`,
      `Maktab: ${group!.maktabNumber || "N/A"}`,
      ...(group!.flightNumber ? [`Flight: ${group!.flightNumber}`] : []),
      ...(group!.returnDate ? [`Return Date: ${group!.returnDate}`] : []),
      `Emergency: 0547090786`,
    ].join("\n");
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .zz-row {
          display: flex;
          gap: 5mm;
          align-items: flex-start;
          page-break-after: always;
        }
        .zz-row:last-child { page-break-after: auto; }
        .zz-tag {
          flex: 1;
          border: 2px solid ${DARK};
          border-radius: 4px;
          overflow: hidden;
          font-family: 'Arial', sans-serif;
          background: #fff;
          display: flex;
          flex-direction: column;
          min-height: 125mm;
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px", opacity: pdfLoading ? 0.6 : 1 }}>
          {pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}
        </button>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#fff", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", marginRight: "12px" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
        {pages.map((page, pageIdx) => (
          <div key={pageIdx} className="zz-row">
            {page.map(p => (
              <div key={p.id} className="zz-tag">

                {/* ── Company Header ── */}
                <div style={{ display: "flex", alignItems: "center", gap: "2mm", padding: "2.5mm 3mm 2mm" }}>
                  <img src={`${BASE}images/logo.png`} alt="" style={{ height: "12mm", objectFit: "contain", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: "9pt", color: DARK, letterSpacing: "0.3px", lineHeight: 1.1, textTransform: "uppercase" }}>AL-BURHAN</div>
                    <div style={{ fontWeight: 700, fontSize: "5.5pt", color: GOLD, letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.2 }}>TOURS & TRAVELS</div>
                    <div style={{ fontSize: "5pt", color: "#555", lineHeight: 1.3 }}>Khanka Masjid Complex, Burhanpur M.P.</div>
                    <div style={{ fontSize: "5pt", color: "#555", lineHeight: 1.3 }}>+91 9893989786 | 0547090786</div>
                  </div>
                  <img src={`${BASE}images/india_flag.jpg`} alt="" style={{ width: "9mm", height: "9mm", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                </div>

                {/* ── Title Bar ── */}
                <div style={{ background: DARK, padding: "2mm 3mm", textAlign: "center" }}>
                  <div style={{ color: GOLD, fontWeight: 900, fontSize: "8.5pt", letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.1 }}>
                    ZAMZAM WATER TAG
                  </div>
                  <div style={{ color: "#a8d5c2", fontWeight: 700, fontSize: "6pt", letterSpacing: "0.5px", marginTop: "0.5mm" }}>
                    HAJJ {group.year}
                    {group.maktabNumber && <span style={{ marginLeft: "3mm" }}>MAKTAB: {group.maktabNumber}</span>}
                  </div>
                </div>

                {/* ── Responsible Person ── */}
                <div style={{ padding: "2.5mm 3mm 0" }}>
                  <div style={{ fontSize: "4.5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, lineHeight: 1 }}>
                    RESPONSIBLE PERSON
                  </div>
                  <div style={{ fontSize: "12pt", fontWeight: 900, color: DARK, lineHeight: 1.2, textTransform: "uppercase", wordBreak: "break-word", marginTop: "0.5mm" }}>
                    {p.fullName}
                  </div>
                </div>

                {/* ── Group / Flight Info ── */}
                <div style={{ padding: "1.5mm 3mm 0", display: "flex", flexDirection: "column", gap: "0.8mm" }}>
                  <div style={{ fontSize: "6.5pt", fontWeight: 700, color: "#333" }}>
                    <span style={{ color: "#888", fontWeight: 600 }}>Group: </span>{group.groupName}
                  </div>
                  {group.flightNumber && (
                    <div style={{ fontSize: "6.5pt", fontWeight: 700, color: "#333" }}>
                      <span style={{ color: "#888", fontWeight: 600 }}>Flight: </span>{group.flightNumber}
                      {group.returnDate && <span style={{ color: "#888", fontWeight: 600, marginLeft: "2mm" }}>Date: </span>}
                      {group.returnDate && <span>{group.returnDate}</span>}
                    </div>
                  )}
                </div>

                {/* ── Thin Divider ── */}
                <div style={{ height: "0.5px", background: "#ddd", margin: "2mm 3mm" }} />

                {/* ── Barcode ── */}
                <div style={{ display: "flex", justifyContent: "center", padding: "0 3mm" }}>
                  <Barcode
                    value={p.passportNumber || `ZAM${String(p.serialNumber).padStart(3, "0")}`}
                    height={20}
                    width={1.3}
                    fontSize={0}
                  />
                </div>
                {p.passportNumber && (
                  <div style={{ textAlign: "center", fontSize: "5pt", color: "#555", fontFamily: "monospace", marginTop: "0.5mm", paddingBottom: "1mm" }}>
                    {p.passportNumber}
                  </div>
                )}

                {/* ── Thick Divider ── */}
                <div style={{ height: "1px", background: DARK, margin: "1.5mm 3mm" }} />

                {/* ── Bag Number + QR ── */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2mm 3mm 3mm" }}>
                  <div>
                    <div style={{ fontSize: "5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, lineHeight: 1 }}>
                      ZAMZAM BAG NO.
                    </div>
                    <div style={{ fontSize: "32pt", fontWeight: 900, color: DARK, lineHeight: 1, letterSpacing: "-1px" }}>
                      #{String(p.serialNumber).padStart(3, "0")}
                    </div>
                    <div style={{ fontSize: "5pt", color: "#888", marginTop: "0.5mm" }}>
                      {group.groupName} · HAJJ {group.year}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm" }}>
                    <QRCodeSVG
                      value={buildQr(p)}
                      size={60}
                      level="M"
                      fgColor={DARK}
                    />
                    <div style={{ fontSize: "5pt", color: "#888", textAlign: "center" }}>
                      0547090786
                    </div>
                  </div>
                </div>

                {/* ── Footer ── */}
                <div style={{ background: DARK, color: GOLD, padding: "1.5mm 3mm", fontSize: "5.5pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
                  AL BURHAN TOURS &amp; TRAVELS &nbsp;|&nbsp; Emergency: 0547090786
                </div>

              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
