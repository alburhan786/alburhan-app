import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

const HIJRI_MAP: Record<number, number> = {
  2023: 1444, 2024: 1445, 2025: 1446, 2026: 1447, 2027: 1448, 2028: 1449,
};
function hijriYear(y: number) { return HIJRI_MAP[y] ?? (y - 579); }

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
        orientation: "landscape",
        format: "a4",
        margin: [6, 6],
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

  function flightLine(): string {
    const parts: string[] = [];
    if (group!.returnDate) parts.push(group!.returnDate);
    if (group!.flightNumber) parts.push(group!.flightNumber);
    parts.push("Jeddah Mumbai");
    return parts.join(" ");
  }

  const hYear = hijriYear(group.year);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 6mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .zz-page {
          display: flex;
          gap: 5mm;
          width: 285mm;
          height: 195mm;
          page-break-after: always;
        }
        .zz-page:last-child { page-break-after: auto; }
        .zz-sticker {
          flex: 1;
          display: flex;
          flex-direction: column;
          font-family: Arial, sans-serif;
          background: #fff;
        }
      `}</style>

      <div className="no-print" style={{
        padding: "12px 20px", background: "#fef3c7", borderBottom: "1px solid #f59e0b",
        display: "flex", gap: "10px", alignItems: "center", justifyContent: "center"
      }}>
        <strong style={{ fontSize: "15px", color: "#0A3D2A", marginRight: "8px" }}>
          🏷️ Zamzam Tags — {group.groupName} ({group.year}) — {pilgrims.length} pilgrims
        </strong>
        <button onClick={handleDownload} disabled={pdfLoading} style={{
          padding: "8px 20px", background: "#0A3D2A", color: "#fff", border: "none",
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

      <div ref={contentRef} style={{ padding: "6mm", background: "#fff" }}>
        {pages.map((page, pageIdx) => (
          <div key={pageIdx} className="zz-page">
            {page.map(p => {
              const displayName = [p.salutation, p.fullName]
                .filter(Boolean).join(" ").toUpperCase();
              const barcodeVal = p.passportNumber || `ZAM${String(p.serialNumber).padStart(3, "0")}`;
              return (
                <div key={p.id} className="zz-sticker">

                  {/* ── Info Card ── */}
                  <div style={{ border: "1px solid #b0b0b0", overflow: "hidden" }}>

                    {/* Company title row */}
                    <div style={{
                      textAlign: "center", padding: "2mm 3mm 1.5mm",
                      borderBottom: "0.5px solid #ccc"
                    }}>
                      <div style={{
                        fontWeight: 900, fontSize: "11pt", letterSpacing: "1.5px",
                        color: "#111", fontFamily: "Arial, sans-serif"
                      }}>
                        AL-BURHAN TOURS &amp; TRAVELS
                      </div>
                    </div>

                    {/* Logo + address */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: "2.5mm",
                      padding: "1.5mm 3mm 1.5mm", borderBottom: "0.5px solid #ccc"
                    }}>
                      <img
                        src={`${BASE}images/logo.png`}
                        alt=""
                        style={{ height: "13mm", width: "13mm", objectFit: "contain", flexShrink: 0 }}
                      />
                      <div style={{ fontSize: "6.5pt", color: "#333", lineHeight: 1.5 }}>
                        <div>BURHANPUR, MADHYA PRADESH,</div>
                        <div>Mob: +917325257213, Email:</div>
                      </div>
                    </div>

                    {/* Gray title bar */}
                    <div style={{
                      background: "#d8d8d8", padding: "1.8mm 3mm", textAlign: "center",
                      borderBottom: "0.5px solid #ccc"
                    }}>
                      <div style={{ fontWeight: 700, fontSize: "9pt", color: "#111", letterSpacing: "0.2px" }}>
                        Zamzam Water Tag Haj-{group.year}/{hYear} Hijri
                      </div>
                    </div>

                    {/* Photo + Person info */}
                    <div style={{ display: "flex", gap: "3mm", padding: "2.5mm 3mm 1.5mm" }}>
                      {/* Passport photo */}
                      <div style={{
                        flexShrink: 0, width: "22mm", height: "28mm",
                        background: "#e0e0e0", overflow: "hidden",
                        border: "0.5px solid #bbb", display: "flex",
                        alignItems: "center", justifyContent: "center"
                      }}>
                        {p.photoUrl ? (
                          <img
                            src={p.photoUrl}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ fontSize: "7pt", color: "#999", textAlign: "center" }}>No<br />Photo</span>
                        )}
                      </div>

                      {/* Name + flight */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: "#c0392b", fontStyle: "italic", fontSize: "7.5pt",
                          fontWeight: 600, marginBottom: "1.5mm"
                        }}>
                          Responsible Person
                        </div>
                        <div style={{
                          fontWeight: 900, fontSize: "10pt", color: "#111",
                          lineHeight: 1.25, wordBreak: "break-word"
                        }}>
                          {displayName}
                        </div>
                        {(group.returnDate || group.flightNumber) && (
                          <div style={{ fontSize: "7pt", color: "#222", marginTop: "1.5mm", lineHeight: 1.4 }}>
                            {flightLine()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Barcode */}
                    <div style={{ display: "flex", justifyContent: "center", padding: "0 3mm 0" }}>
                      <Barcode value={barcodeVal} height={24} width={1.3} fontSize={0} />
                    </div>
                    <div style={{
                      textAlign: "center", fontSize: "6pt", color: "#444",
                      fontFamily: "monospace", padding: "0.5mm 3mm 2mm", letterSpacing: "0.8px"
                    }}>
                      {barcodeVal}
                    </div>

                  </div>

                  {/* ── Huge Bag Number ── */}
                  <div style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#fff",
                  }}>
                    <div style={{
                      fontSize: "160pt",
                      fontWeight: 900,
                      fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif",
                      color: "#fff",
                      WebkitTextStroke: "6px #000",
                      lineHeight: 1,
                      userSelect: "none",
                    }}>
                      {p.serialNumber}
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
