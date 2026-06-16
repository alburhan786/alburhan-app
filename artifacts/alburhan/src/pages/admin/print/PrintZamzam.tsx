import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { downloadAsPdf, fetchAsDataUrl } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";
const DARK_GREEN = "#0d5040";
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
  startingSerialNumber?: number;
  flightNumber?: string;
  returnDate?: string;
}

function buildVerifyUrl(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

export default function PrintZamzam() {
  const [, params] = useRoute("/admin/groups/:groupId/print/zamzam");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
  const [dlState, setDl] = useState<string | null>(null);
  const [photoDataUrls, setPhotoDataUrls] = useState<Record<string, string>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(async ([g, p]) => {
      setGroup(g);
      const list: Pilgrim[] = Array.isArray(p) ? p : [];
      setPilgrims(list);
      const entries = await Promise.all(
        list.filter(x => x.photoUrl).map(async x => {
          const d = await fetchAsDataUrl(`${API}${x.photoUrl}`);
          return [x.id, d] as [string, string];
        })
      );
      setPhotoDataUrls(Object.fromEntries(entries.filter(([, v]) => v)));
    });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body {
            margin: 0 !important; padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .zz-wrap  { padding: 0 !important; background: white !important; }
          .zz-page  { box-shadow: none !important; margin: 0 !important; }
        }
        * { box-sizing: border-box; }

        /*
          Full A4: 210mm × 297mm (@page margin 0).
          2 stickers per page, each 200mm × 133mm.
          Layout: 2×133 + gap(7mm) = 273mm content, centred → 12mm top/bottom safe margin.
          Width: 200mm centred → 5mm each side safe margin.
        */
        .zz-page {
          display: flex;
          flex-direction: column;
          gap: 7mm;
          align-items: center;
          justify-content: center;
          width: 210mm;
          height: 297mm;
          page-break-after: always;
          break-after: always;
          page-break-inside: avoid;
          overflow: hidden;
          flex-shrink: 0;
        }
        .zz-page:last-child { page-break-after: auto; break-after: auto; }
        @media screen {
          .zz-page {
            box-shadow: 0 8px 40px rgba(0,0,0,0.45);
            margin: 20px auto;
          }
          .zz-page:last-child { margin-bottom: 20px; }
        }

        .zz-sticker {
          width: 200mm;
          height: 133mm;
          flex-shrink: 0;
          display: flex;
          flex-direction: row;
          font-family: Arial, sans-serif;
          background: #fff;
          border: 1.5px solid #ccc;
          border-radius: 3px;
          overflow: hidden;
          position: relative;
          page-break-inside: avoid;
          break-inside: avoid;
        }
      `}</style>

      <div className="no-print" style={{
        padding: "12px 20px", background: "#fef3c7", borderBottom: "1px solid #f59e0b",
        display: "flex", gap: "10px", alignItems: "center", justifyContent: "center",
        flexWrap: "wrap"
      }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <strong style={{ fontSize: "15px", color: DARK_GREEN, marginRight: "8px" }}>
          🏷️ Zamzam Tags — {group.groupName} ({group.year}) — {pilgrims.length} pilgrims
        </strong>
        <button onClick={() => window.print()} style={{
          padding: "8px 20px", background: DARK_GREEN, color: "#fff", border: "none",
          borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "13px"
        }}>🖨 Print</button>
        <button onClick={async () => { if (!contentRef.current) return; setDl("pdf"); try { await downloadAsPdf(contentRef.current, `zamzam-${group.groupName}`); } finally { setDl(null); } }}
          disabled={!!dlState} style={{ padding: "8px 16px", background: dlState === "pdf" ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
          {dlState === "pdf" ? "⏳..." : "⬇ PDF"}
        </button>
        <button onClick={() => window.history.back()} style={{
          padding: "8px 14px", border: "1px solid #ccc", borderRadius: "7px",
          cursor: "pointer", background: "#fff", fontSize: "13px"
        }}>← Back</button>
      </div>

      <div ref={contentRef} className="zz-wrap" style={{ background: "#4b5563" }}>
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
                    {/* Top: Big flag + Big logo only (no text) */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3mm", marginBottom: "2mm" }}>
                      <div style={{ fontSize: "52pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
                      {company.logoUrl
                        ? <img src={company.logoUrl} alt="" style={{ width: "28mm", height: "28mm", objectFit: "contain", flexShrink: 0 }} />
                        : <div style={{ width: "28mm", height: "28mm", flexShrink: 0, background: DARK_GREEN, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "14pt" }}>{company.nameShort.slice(0, 1)}</div>
                      }
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
                        <img src={photoDataUrls[p.id] || (p.photoUrl ? `${API}${p.photoUrl}` : "")} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                        fontSize: "72pt", fontWeight: 900, color: DARK_GREEN,
                        lineHeight: 1, letterSpacing: "-2px",
                        fontFamily: "'Arial Black', Arial, sans-serif",
                        WebkitTextStroke: "4px white", paintOrder: "stroke fill",
                      }}>
                        #{serial}
                      </div>
                    </div>

                    {/* Bottom Branding: text only (no logo, no flag) */}
                    <div style={{
                      marginTop: "2mm", borderTop: `1px solid ${GOLD}`,
                      paddingTop: "2mm", width: "100%", textAlign: "center",
                    }}>
                      <div style={{ fontWeight: 900, fontSize: "11pt", color: GOLD, letterSpacing: "0.5px", lineHeight: 1.1 }}>{company.nameShort}</div>
                      <div style={{ fontWeight: 700, fontSize: "8pt", color: DARK_GREEN, letterSpacing: "0.5px", lineHeight: 1.2 }}>TOURS &amp; TRAVELS</div>
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
                      <div style={{ fontSize: "7pt", color: "#999", letterSpacing: "3px", textTransform: "uppercase", fontStyle: "italic", fontWeight: 600, marginTop: "2.5mm" }}>
                        HOLY WATER
                      </div>
                    </div>

                    {/* Gold Divider */}
                    <div style={{ height: "0.7mm", background: GOLD, marginBottom: "1.5mm" }} />

                    {/* Pilgrim Name */}
                    <div style={{
                      fontSize: "17pt", fontWeight: 900, color: "#111",
                      lineHeight: 1.2, wordBreak: "break-word", textTransform: "uppercase",
                      fontFamily: "'Arial Black', Arial, sans-serif", marginBottom: "4mm"
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
                        {company.name} — {group.year}
                      </div>
                    </div>

                    {/* Flight Info */}
                    {(group.flightNumber || group.returnDate) && (
                      <div style={{ marginBottom: "1.5mm", fontSize: "13pt", fontWeight: 900, color: DARK_GREEN, lineHeight: 1.5 }}>
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
                    <div style={{ fontSize: "12pt", lineHeight: 1.7, color: "#333", flex: 1 }}>
                      {p.passportNumber && (
                        <div><span style={{ fontWeight: 900, color: DARK_GREEN }}>Passport No: </span><span style={{ fontWeight: 900 }}>{p.passportNumber}</span></div>
                      )}
                      {p.mobileIndia && (
                        <div><span style={{ fontWeight: 900, color: DARK_GREEN }}>Mobile: </span><span style={{ fontWeight: 900 }}>{p.mobileIndia}</span></div>
                      )}
                      <div><span style={{ fontWeight: 900, color: "#b91c1c" }}>Emergency: </span><span style={{ fontWeight: 900, color: "#b91c1c" }}>{company.phoneSaudi}</span></div>
                      <div style={{ marginTop: "2mm", background: "#f0fdf4", border: `1.5px solid ${DARK_GREEN}`, borderRadius: "4px", padding: "1.5mm 3mm" }}>
                        <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>HOME ADDRESS</div>
                        <div style={{ fontSize: "11pt", fontWeight: 900, color: DARK_GREEN, lineHeight: 1.3 }}>
                          {[p.address, p.city].filter(Boolean).join(", ") || "—"}
                        </div>
                      </div>
                    </div>

                    {/* Bottom: Barcode + QR */}
                    <div style={{
                      display: "flex", alignItems: "flex-end",
                      justifyContent: "space-between", gap: "2mm", marginTop: "1mm"
                    }}>
                      <div>
                        <Barcode value={barcodeVal} height={42} width={1.6} fontSize={0} />
                        <div style={{ fontSize: "5pt", color: "#555", fontFamily: "monospace", marginTop: "0.5mm", letterSpacing: "0.5px" }}>
                          {barcodeVal}
                        </div>
                      </div>
                      <QRCodeCanvas value={buildVerifyUrl(p.id)} size={140} level="M" fgColor={DARK_GREEN} />
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
