import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { downloadAsPdf, fetchAsDataUrl } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
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

  // 2 pilgrims per A4 page
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .zz-page { box-shadow: none !important; margin: 0 !important; }
        }
        * { box-sizing: border-box; }

        /* A4 usable: 297 - 10mm margins = 287mm tall, 210 - 16mm = 194mm wide */
        /* 2 stickers + 7mm gap = 287mm  =>  each sticker = 140mm */
        .zz-page {
          width: 194mm;
          height: 287mm;
          display: flex;
          flex-direction: column;
          gap: 7mm;
          page-break-after: always;
          break-after: page;
        }
        .zz-page:last-child { page-break-after: auto; break-after: auto; }

        .zz-sticker {
          width: 194mm;
          height: 140mm;
          flex-shrink: 0;
          display: flex;
          flex-direction: row;
          font-family: Arial, sans-serif;
          background: #fff;
          border: 1.5px solid #bbb;
          border-radius: 4px;
          overflow: hidden;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        @media screen {
          .zz-page {
            margin: 0 auto 12mm;
            background: white;
            padding: 5mm 8mm;
            box-shadow: 0 2px 16px rgba(0,0,0,0.13);
          }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{
        padding: "12px 20px", background: "#fef3c7", borderBottom: "1px solid #f59e0b",
        display: "flex", gap: "10px", alignItems: "center", justifyContent: "center", flexWrap: "wrap",
      }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <strong style={{ fontSize: "15px", color: DARK_GREEN }}>
          🏷️ Zamzam Tags — {group.groupName} ({group.year}) — {pilgrims.length} pilgrims
        </strong>
        <button onClick={() => window.print()} style={{
          padding: "8px 20px", background: DARK_GREEN, color: "#fff", border: "none",
          borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "13px",
        }}>🖨 Print</button>
        <button
          onClick={async () => {
            if (!contentRef.current) return;
            setDl("pdf");
            try { await downloadAsPdf(contentRef.current, `zamzam-${group.groupName}`); }
            finally { setDl(null); }
          }}
          disabled={!!dlState}
          style={{ padding: "8px 16px", background: dlState ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
          {dlState ? "⏳..." : "⬇ PDF"}
        </button>
        <button onClick={() => window.history.back()} style={{
          padding: "8px 14px", border: "1px solid #ccc", borderRadius: "7px", cursor: "pointer", background: "#fff", fontSize: "13px",
        }}>← Back</button>
      </div>

      <div ref={contentRef} style={{ background: "#f5f5f0", padding: "8mm" }}>
        {pages.map((page, pageIdx) => (
          <div key={pageIdx} className="zz-page">
            {page.map(p => {
              const displayName = [p.salutation, p.fullName].filter(Boolean).join(" ").toUpperCase();
              const serial = String(p.serialNumber).padStart(3, "0");
              const barcodeVal = p.passportNumber || `ZAM${serial}`;

              return (
                <div key={p.id} className="zz-sticker">

                  {/* ══ LEFT COLUMN ══ */}
                  <div style={{
                    width: "58mm", flexShrink: 0,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "4mm 2mm 3mm 3mm",
                    borderRight: `2px solid ${GOLD}`,
                    background: "#fafff8",
                  }}>
                    {/* Flag + Logo */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2mm", marginBottom: "2mm" }}>
                      <div style={{ fontSize: "28pt", lineHeight: 1 }}>🇮🇳</div>
                      {company.logoUrl
                        ? <img src={company.logoUrl} alt="" style={{ width: "18mm", height: "18mm", objectFit: "contain" }} />
                        : <div style={{ width: "18mm", height: "18mm", background: DARK_GREEN, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "10pt" }}>{company.nameShort.slice(0, 2)}</div>
                      }
                    </div>

                    {/* Circular Photo */}
                    <div style={{
                      width: "32mm", height: "32mm", borderRadius: "50%",
                      border: `3px solid ${GOLD}`, overflow: "hidden",
                      background: "#dce3dc", display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: "2mm",
                    }}>
                      {p.photoUrl ? (
                        <img src={photoDataUrls[p.id] || `${API}${p.photoUrl}`} alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }} />
                      ) : (
                        <svg width="100%" height="100%" viewBox="0 0 64 64">
                          <circle cx="32" cy="24" r="14" fill="#b0b8b0" />
                          <ellipse cx="32" cy="54" rx="22" ry="16" fill="#b0b8b0" />
                        </svg>
                      )}
                    </div>

                    {/* Serial Number */}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>SERIAL NO.</div>
                      <div style={{
                        fontSize: "28pt", fontWeight: 900, color: DARK_GREEN,
                        lineHeight: 1, letterSpacing: "-1px",
                        fontFamily: "'Arial Black', Arial, sans-serif",
                      }}>#{serial}</div>
                    </div>

                    {/* Branding */}
                    <div style={{
                      marginTop: "auto", borderTop: `1px solid ${GOLD}`,
                      paddingTop: "2mm", width: "100%", textAlign: "center",
                    }}>
                      <div style={{ fontWeight: 900, fontSize: "9pt", color: GOLD, letterSpacing: "0.5px", lineHeight: 1.1 }}>{company.nameShort}</div>
                      <div style={{ fontWeight: 700, fontSize: "7pt", color: DARK_GREEN, letterSpacing: "0.5px" }}>TOURS &amp; TRAVELS</div>
                    </div>
                  </div>

                  {/* ══ RIGHT COLUMN ══ */}
                  <div style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    padding: "4mm 3mm 3mm 4mm", minWidth: 0,
                  }}>
                    {/* ZAMZAM Title */}
                    <div style={{ marginBottom: "1mm" }}>
                      <div style={{
                        fontSize: "20pt", fontWeight: 900, color: DARK_GREEN,
                        letterSpacing: "5px", lineHeight: 1,
                        fontFamily: "'Arial Black', Arial, sans-serif",
                      }}>ZAMZAM</div>
                      <div style={{ fontSize: "6pt", color: "#999", letterSpacing: "3px", textTransform: "uppercase", fontStyle: "italic", fontWeight: 600, marginTop: "1mm" }}>
                        HOLY WATER
                      </div>
                    </div>

                    {/* Gold Divider */}
                    <div style={{ height: "0.7mm", background: GOLD, margin: "1.5mm 0" }} />

                    {/* Pilgrim Name */}
                    <div style={{
                      fontSize: "13pt", fontWeight: 900, color: "#111",
                      lineHeight: 1.2, wordBreak: "break-word", textTransform: "uppercase",
                      fontFamily: "'Arial Black', Arial, sans-serif", marginBottom: "2mm",
                    }}>
                      {displayName}
                    </div>

                    {/* Green Badge */}
                    <div style={{ marginBottom: "2mm" }}>
                      <div style={{
                        display: "inline-block",
                        background: DARK_GREEN, color: "#fff", borderRadius: "99px",
                        padding: "1mm 4mm", fontSize: "8pt", fontWeight: 800, lineHeight: 1.4,
                      }}>
                        {company.name} — {group.year}
                      </div>
                    </div>

                    {/* Flight Info */}
                    {(group.flightNumber || group.returnDate) && (
                      <div style={{ fontSize: "10pt", fontWeight: 900, color: DARK_GREEN, lineHeight: 1.5, marginBottom: "1mm" }}>
                        {group.flightNumber && <span>✈ <b>Flight:</b> {group.flightNumber}</span>}
                        {group.flightNumber && group.returnDate && <span style={{ margin: "0 2mm" }}>|</span>}
                        {group.returnDate && <span>🗓 <b>Return:</b> {group.returnDate}</span>}
                      </div>
                    )}

                    {/* Contact Info */}
                    <div style={{ fontSize: "10pt", lineHeight: 1.6, color: "#333" }}>
                      {p.passportNumber && (
                        <div><span style={{ fontWeight: 900, color: DARK_GREEN }}>Passport No: </span><span style={{ fontWeight: 900 }}>{p.passportNumber}</span></div>
                      )}
                      {p.mobileIndia && (
                        <div><span style={{ fontWeight: 900, color: DARK_GREEN }}>Mobile: </span><span style={{ fontWeight: 900 }}>{p.mobileIndia}</span></div>
                      )}
                      <div><span style={{ fontWeight: 900, color: "#b91c1c" }}>Emergency: </span><span style={{ fontWeight: 900, color: "#b91c1c" }}>{company.phoneSaudi}</span></div>
                      <div style={{ marginTop: "1.5mm", background: "#f0fdf4", border: `1.5px solid ${DARK_GREEN}`, borderRadius: "3px", padding: "1mm 2.5mm" }}>
                        <div style={{ fontSize: "5pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>HOME ADDRESS</div>
                        <div style={{ fontSize: "9pt", fontWeight: 900, color: DARK_GREEN, lineHeight: 1.3 }}>
                          {[p.address, p.city].filter(Boolean).join(", ") || "—"}
                        </div>
                      </div>
                    </div>

                    {/* Bottom: Barcode + QR — always visible, never cut */}
                    <div style={{
                      marginTop: "auto",
                      display: "flex", alignItems: "flex-end",
                      justifyContent: "space-between", gap: "3mm",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Barcode value={barcodeVal} height={30} width={1.4} fontSize={0} />
                        <div style={{ fontSize: "5pt", color: "#555", fontFamily: "monospace", marginTop: "0.5mm", letterSpacing: "0.5px" }}>
                          {barcodeVal}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <QRCodeCanvas value={buildVerifyUrl(p.id)} size={80} level="M" fgColor={DARK_GREEN} bgColor="#ffffff" />
                      </div>
                    </div>
                  </div>

                </div>
              );
            })}
            {/* Spacer when only 1 pilgrim on last page */}
            {page.length === 1 && <div style={{ flex: 1 }} />}
          </div>
        ))}
      </div>
    </>
  );
}
