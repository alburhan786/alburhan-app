import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById, type CompanyInfo } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  visaNumber?: string; photoUrl?: string; mobileIndia?: string; gender?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number;
  hotels?: { makkah?: { name?: string; address?: string; nameAr?: string; addressAr?: string }; madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string }; aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string } };
}

const DARK = "#0d5040";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

function buildQrData(p: Pilgrim, group: Group, phone: string, phoneSaudi: string): string {
  const lines = [
    `Name: ${p.fullName}`,
    `Passport: ${p.passportNumber || "N/A"}`,
    `Group: ${group.groupName} (${group.year})`,
    `Gender: ${p.gender || "N/A"}`,
  ];
  if (p.mobileIndia) lines.push(`Mobile (India): ${p.mobileIndia}`);
  if (group.hotels?.aziziah?.name) lines.push(`Hotel Makkah 1: ${group.hotels.aziziah.name}`);
  if (group.hotels?.makkah?.name) lines.push(`Hotel Makkah 2: ${group.hotels.makkah.name}`);
  if (group.hotels?.madinah?.name) lines.push(`Hotel Madinah: ${group.hotels.madinah.name}`);
  if (group.maktabNumber) lines.push(`Maktab: ${group.maktabNumber}`);
  lines.push(`Emergency (Saudi): ${phoneSaudi}`);
  lines.push(`Emergency (India): ${phone}`);
  return lines.join("\n");
}

function WaveShapesFront() {
  return (
    <>
      <div style={{
        position: "absolute", top: 0, right: 0, width: "18mm", height: "20mm",
        background: DARK, borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", top: "7mm", right: 0, width: "11mm", height: "11mm",
        background: "rgba(255,255,255,0.08)", borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: "14mm", height: "18mm",
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "0 100% 0 0", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: "5mm", left: 0, width: "8mm", height: "10mm",
        background: "rgba(255,255,255,0.15)", borderRadius: "0 100% 0 0", zIndex: 0,
      }} />
    </>
  );
}

function WaveShapesBack() {
  return (
    <>
      <div style={{
        position: "absolute", top: 0, right: 0, width: "16mm", height: "17mm",
        background: DARK, borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", top: "6mm", right: 0, width: "9mm", height: "9mm",
        background: "rgba(255,255,255,0.08)", borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: "12mm", height: "14mm",
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "0 100% 0 0", zIndex: 0,
      }} />
    </>
  );
}

function HeaderBar({ company }: { company: CompanyInfo }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "1mm 2.5mm", background: "rgba(255,255,255,0.92)",
      borderBottom: `1.5px solid ${GOLD}`, flexShrink: 0,
    }}>
      <div style={{ fontSize: "20pt", lineHeight: 1 }}>🇮🇳</div>
      <div style={{ flex: 1, textAlign: "center", padding: "0 1mm" }}>
        <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, letterSpacing: "0.4px", lineHeight: 1.1 }}>{company.nameShort}</div>
        <div style={{ fontSize: "3pt", fontWeight: 700, color: GOLD, letterSpacing: "0.6px" }}>TOURS & TRAVELS</div>
      </div>
      {company.logoUrl
        ? <img src={company.logoUrl} alt="" style={{ width: "5.5mm", height: "5.5mm", borderRadius: "50%", objectFit: "cover" }} />
        : <div style={{ width: "5.5mm", height: "5.5mm", borderRadius: "50%", background: DARK, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "3pt" }}>{company.nameShort.slice(0, 1)}</div>
      }
    </div>
  );
}

function FrontCard({ p, group, company }: { p: Pilgrim; group: Group; company: CompanyInfo }) {
  return (
    <div style={{
      width: "86mm", height: "54mm",
      border: "1px solid #ddd", borderRadius: "3px", overflow: "hidden",
      fontFamily: "'Inter', Arial, sans-serif", background: "#fff",
      position: "relative", flexShrink: 0,
      pageBreakInside: "avoid",
    }}>
      <WaveShapesFront />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <HeaderBar company={company} />

        <div style={{ display: "flex", flex: 1, padding: "1.5mm 2mm 0", gap: "2mm", minHeight: 0 }}>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: "0.5mm" }}>
            {p.photoUrl ? (
              <img src={`${API}${p.photoUrl}`} alt="" style={{
                width: "18mm", height: "22mm", objectFit: "cover",
                objectPosition: "top center", borderRadius: "2px",
                border: `2px solid ${GOLD}`,
              }} />
            ) : (
              <div style={{
                width: "18mm", height: "22mm", background: "#f0f0f0",
                borderRadius: "2px", border: `2px solid ${GOLD}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "4pt", color: "#aaa",
              }}>PHOTO</div>
            )}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.6mm", minWidth: 0 }}>
            <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2, wordBreak: "break-word", textTransform: "uppercase" }}>
              {p.fullName || "—"}
            </div>
            <div style={{ fontSize: "4pt", color: GOLD, fontWeight: 700, letterSpacing: "0.3px" }}>HAJJ {group.year}</div>
            <div style={{ fontSize: "4.5pt", color: "#555" }}>
              <span style={{ color: "#999", fontSize: "4pt" }}>S.No. </span>
              <span style={{ fontWeight: 700, color: DARK }}>#{String(p.serialNumber).padStart(3, "0")}</span>
            </div>
            <div style={{ fontSize: "4.5pt", color: "#555" }}>
              <span style={{ color: "#999", fontSize: "4pt" }}>Passport </span>
              <span style={{ fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.3px" }}>{p.passportNumber || "—"}</span>
            </div>
            <div style={{ fontSize: "4.5pt", color: "#555" }}>
              <span style={{ color: "#999", fontSize: "4pt" }}>Mobile </span>
              <span style={{ fontWeight: 600 }}>{p.mobileIndia || "—"}</span>
            </div>
          </div>

          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "0.5mm" }}>
            <div style={{ background: "#fff", padding: "1.5px", borderRadius: "2px", border: `1.5px solid ${DARK}` }}>
              <QRCodeSVG value={buildQrData(p, group, company.phone, company.phoneSaudi)} size={34} level="M" fgColor={DARK} />
            </div>
            <div style={{ fontSize: "3pt", color: DARK, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.4px", marginTop: "0.5mm" }}>SCAN</div>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3 }}>
          <div style={{ display: "flex", justifyContent: "flex-start", overflow: "hidden", paddingLeft: "2mm", marginBottom: "0.3mm" }}>
            {p.passportNumber ? (
              <Barcode value={p.passportNumber} height={10} width={0.85} fontSize={0} />
            ) : (
              <div style={{ fontSize: "4pt", color: "#999" }}>{group.groupName}</div>
            )}
          </div>
          <div style={{
            background: DARK, color: GOLD, padding: "0.8mm 2mm",
            fontSize: "3.5pt", textAlign: "center", fontWeight: 800, letterSpacing: "0.1px",
            WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
          } as React.CSSProperties}>
            {company.name} &nbsp;|&nbsp; 🇮🇳 {company.phone} &nbsp;|&nbsp; 🇸🇦 {company.phoneSaudi}
          </div>
        </div>
      </div>
    </div>
  );
}

function BackCard({ p, group, company, showFeedbackQr, bookingMap }: {
  p: Pilgrim; group: Group; company: CompanyInfo; showFeedbackQr: boolean; bookingMap: Record<string, string>;
}) {
  return (
    <div style={{
      width: "86mm", height: "54mm",
      border: "1px solid #ddd", borderRadius: "3px", overflow: "hidden",
      fontFamily: "'Inter', Arial, sans-serif", background: "#fff",
      position: "relative", flexShrink: 0,
      pageBreakInside: "avoid",
    }}>
      <WaveShapesBack />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>
        <HeaderBar company={company} />

        <div style={{ display: "flex", flex: 1, padding: "1mm 2mm", gap: "2mm", minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1mm", fontSize: "4.5pt", lineHeight: 1.35 }}>
            <div>
              <span style={{ color: "#999", fontSize: "4pt" }}>Passport No. </span>
              <span style={{ fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.3px" }}>{p.passportNumber || "—"}</span>
            </div>
            <div>
              <span style={{ color: "#999", fontSize: "4pt" }}>Maktab: </span>
              <span style={{ fontWeight: 700, color: DARK }}>{group.maktabNumber || "—"}</span>
            </div>
            {group.hotels?.makkah?.name && (
              <div>
                <span style={{ color: "#999", fontSize: "4pt" }}>Makkah Hotel: </span>
                <span style={{ fontWeight: 600 }}>{group.hotels.makkah.name}</span>
                {group.hotels.makkah.nameAr && <div style={{ fontWeight: 600, direction: "rtl", textAlign: "right", fontSize: "4pt" }}>{group.hotels.makkah.nameAr}</div>}
                {group.hotels.makkah.address && <div style={{ fontSize: "3.5pt", color: "#888" }}>{group.hotels.makkah.address}</div>}
              </div>
            )}
            {group.hotels?.madinah?.name && (
              <div>
                <span style={{ color: "#999", fontSize: "4pt" }}>Madinah Hotel: </span>
                <span style={{ fontWeight: 600 }}>{group.hotels.madinah.name}</span>
                {group.hotels.madinah.nameAr && <div style={{ fontWeight: 600, direction: "rtl", textAlign: "right", fontSize: "4pt" }}>{group.hotels.madinah.nameAr}</div>}
                {group.hotels.madinah.address && <div style={{ fontSize: "3.5pt", color: "#888" }}>{group.hotels.madinah.address}</div>}
              </div>
            )}
          </div>

          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.5mm" }}>
            {showFeedbackQr ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                  <div style={{ background: "#fff", padding: "1.5px", borderRadius: "2px", border: `1px solid ${GOLD}` }}>
                    <QRCodeSVG value={buildQrData(p, group, company.phone, company.phoneSaudi)} size={26} level="M" />
                  </div>
                  <div style={{ fontSize: "3pt", color: "#888", fontWeight: 600, textTransform: "uppercase" }}>Emergency</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                  <div style={{ background: "#fff", padding: "1.5px", borderRadius: "2px", border: `1.5px solid ${DARK}` }}>
                    <QRCodeSVG
                      value={p.mobileIndia && bookingMap[p.mobileIndia]
                        ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                        : `${PROD_DOMAIN}/feedback`}
                      size={26} level="M" fgColor={DARK}
                    />
                  </div>
                  <div style={{ fontSize: "3pt", color: DARK, fontWeight: 700, textTransform: "uppercase" }}>Rate Trip</div>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                <div style={{ background: "#fff", padding: "1.5px", borderRadius: "2px", border: `2px solid ${DARK}` }}>
                  <QRCodeSVG value={buildQrData(p, group, company.phone, company.phoneSaudi)} size={34} level="M" fgColor={DARK} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "3.5pt", color: "#777", padding: "0 2mm", marginBottom: "0.3mm" }}>
            <div>Group: <b style={{ color: DARK }}>{group.groupName}</b></div>
            <div><b style={{ color: DARK }}>{p.fullName}</b></div>
            <div>Year: <b style={{ color: DARK }}>{group.year}</b></div>
          </div>
          <div style={{
            background: DARK, color: "#fff", padding: "0.8mm 2mm",
            fontSize: "3.5pt", fontWeight: 900, textAlign: "center", lineHeight: 1.4,
            WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
          } as React.CSSProperties}>
            <div>{company.address}</div>
            <div style={{ color: GOLD }}>🇮🇳 {company.phone} &nbsp;|&nbsp; 🇸🇦 {company.phoneSaudi}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintIdCards() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const [bookingMap, setBookingMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/feedback/admin/group-bookings/${groupId}`, { credentials: "include" }).then(r => r.ok ? r.json() : {}),
    ]).then(([g, p, bm]) => { setGroup(g); setPilgrims(p); setBookingMap(bm || {}); });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 9) pages.push(pilgrims.slice(i, i + 9));

  const allPrintPages: Array<{ type: "front" | "back"; pilgrimPage: Pilgrim[]; pageIdx: number }> = [];
  pages.forEach((pp, pi) => {
    allPrintPages.push({ type: "front", pilgrimPage: pp, pageIdx: pi });
    allPrintPages.push({ type: "back", pilgrimPage: pp, pageIdx: pi });
  });

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 5mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; }
          .print-page:last-child { page-break-after: auto; }
        }
        * { box-sizing: border-box; }
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 86mm);
          gap: 4mm 5mm;
          justify-content: center;
          padding: 2mm;
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, userSelect: "none" }}>
          <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} style={{ width: "15px", height: "15px", cursor: "pointer" }} />
          Show Feedback QR
        </label>
        <div className="no-print" style={{ fontSize: "12px", color: "#666", padding: "4px 8px", background: "#fff", borderRadius: "6px", border: "1px solid #ddd" }}>
          9 cards/page · A4 Landscape · 86×54mm
        </div>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div>
        {allPrintPages.map((ap, idx) => (
          <div key={`${ap.type}-${ap.pageIdx}`} className={idx < allPrintPages.length - 1 ? "print-page" : ""}>
            <div className="no-print" style={{ textAlign: "center", fontSize: "11px", color: "#888", padding: "4px 0 2px", fontStyle: "italic" }}>
              {ap.type === "front" ? `▶ FRONT — Page ${ap.pageIdx + 1}` : `◀ BACK — Page ${ap.pageIdx + 1}`}
            </div>
            <div className="cards-grid">
              {ap.pilgrimPage.map(p =>
                ap.type === "front" ? (
                  <FrontCard key={`front-${p.id}`} p={p} group={group} company={company} />
                ) : (
                  <BackCard key={`back-${p.id}`} p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} />
                )
              )}
              {Array.from({ length: 9 - ap.pilgrimPage.length }).map((_, i) => (
                <div key={`ph-${ap.type}-${i}`} style={{
                  width: "86mm", height: "54mm",
                  border: "1px dashed #ddd", borderRadius: "3px", opacity: 0.2,
                }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
