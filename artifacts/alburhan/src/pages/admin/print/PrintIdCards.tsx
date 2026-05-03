import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById, type CompanyInfo } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";
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

function buildVerifyUrl(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

function WaveShapes() {
  return (
    <>
      <div style={{
        position: "absolute", top: 0, right: 0, width: "22mm", height: "32mm",
        background: DARK, borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", top: "10mm", right: 0, width: "16mm", height: "16mm",
        background: "rgba(255,255,255,0.08)", borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: "18mm", height: "24mm",
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "0 100% 0 0", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: "6mm", left: 0, width: "10mm", height: "12mm",
        background: "rgba(255,255,255,0.15)", borderRadius: "0 100% 0 0", zIndex: 0,
      }} />
    </>
  );
}

function WaveShapesBack() {
  return (
    <>
      <div style={{
        position: "absolute", top: 0, right: 0, width: "22mm", height: "28mm",
        background: DARK, borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", top: "8mm", right: 0, width: "14mm", height: "14mm",
        background: "rgba(255,255,255,0.08)", borderRadius: "0 0 0 100%", zIndex: 0,
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: "16mm", height: "20mm",
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`, borderRadius: "0 100% 0 0", zIndex: 0,
      }} />
    </>
  );
}

function LogoHeader({ size, company, showTopFlag }: { size?: "small"; company: CompanyInfo; showTopFlag?: boolean }) {
  const isSmall = size === "small";
  const flagImgSize = isSmall ? "6mm" : "8mm";
  const nameSize = isSmall ? "7pt" : "8pt";
  const tagSize = isSmall ? "3.5pt" : "4.5pt";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isSmall ? "1mm" : "1.5mm" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ fontSize: isSmall ? "26pt" : "32pt", lineHeight: 1 }}>🇮🇳</div>
      </div>
      <div style={{ flex: 1, textAlign: "center", minWidth: 0, background: "rgba(255,255,255,0.92)", borderRadius: "2px", padding: "0.5mm 1mm" }}>
        <div style={{ fontSize: nameSize, fontWeight: 900, color: DARK, letterSpacing: "0.5px", lineHeight: 1.1 }}>{company.nameShort}</div>
        <div style={{ fontSize: tagSize, fontWeight: 700, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.2 }}>TOURS & TRAVELS</div>
      </div>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3mm" }}>
        {company.logoUrl
          ? <img src={company.logoUrl} alt="" style={{ width: flagImgSize, height: flagImgSize, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: flagImgSize, height: flagImgSize, borderRadius: "50%", background: DARK, display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "4pt" }}>{company.nameShort.slice(0, 1)}</div>
        }
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
  for (let i = 0; i < pilgrims.length; i += 3) pages.push(pilgrims.slice(i, i + 3));

  const bulletDot: React.CSSProperties = {
    width: "3mm", height: "3mm", borderRadius: "50%", background: GOLD,
    flexShrink: 0, marginTop: "0.8mm",
  };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .id-card {
          width: 50mm; height: 80mm;
          border: 1px solid #ddd; border-radius: 4px; overflow: hidden;
          page-break-inside: avoid; font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
        }
        .cards-row { display: flex; gap: 5mm; justify-content: center; margin-bottom: 5mm; }
        .page-break { page-break-after: always; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, userSelect: "none" }}>
          <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} style={{ width: "15px", height: "15px", cursor: "pointer" }} />
          Show Feedback QR
        </label>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div>
      {pages.map((page, pi) => (
        <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""} style={{ padding: "6mm 0" }}>
          <div className="cards-row">
            {page.map(p => (
              <div key={`front-${p.id}`} className="id-card">
                <WaveShapes />

                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", padding: "2.5mm 3mm 0" }}>
                  <LogoHeader company={company} showTopFlag />

                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5mm" }}>
                    {p.photoUrl ? (
                      <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "22mm", height: "22mm", objectFit: "cover", borderRadius: "50%", border: `2.5px solid ${GOLD}` }} />
                    ) : (
                      <div style={{ width: "22mm", height: "22mm", background: "#f0f0f0", borderRadius: "50%", border: `2.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "6pt", color: "#aaa" }}>PHOTO</div>
                    )}
                  </div>

                  <div style={{ textAlign: "center", marginBottom: "1mm" }}>
                    <div style={{ fontSize: "7.5pt", fontWeight: 900, color: DARK, lineHeight: 1.25, wordBreak: "break-word", textTransform: "uppercase" }}>{p.fullName || "—"}</div>
                    <div style={{ fontSize: "5.5pt", color: GOLD, fontWeight: 700, marginTop: "0.5mm" }}>HAJJ {group.year}</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.8mm", fontSize: "5.5pt", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
                      <div style={bulletDot} />
                      <div><span style={{ color: "#888", fontSize: "4.5pt" }}>Serial No. </span><span style={{ fontWeight: 700, color: DARK }}>#{String(p.serialNumber).padStart(3, "0")}</span></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
                      <div style={bulletDot} />
                      <div><span style={{ color: "#888", fontSize: "4.5pt" }}>Passport No. </span><span style={{ fontWeight: 600, fontFamily: "monospace", letterSpacing: "0.3px" }}>{p.passportNumber || "—"}</span></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
                      <div style={bulletDot} />
                      <div><span style={{ color: "#888", fontSize: "4.5pt" }}>Mobile (India) </span><span style={{ fontWeight: 600 }}>{p.mobileIndia || "—"}</span></div>
                    </div>
                  </div>

                  <div style={{ marginTop: "auto", paddingBottom: "14mm" }} />
                </div>

                {/* QR code — above footer bar, right-aligned */}
                <div style={{ position: "absolute", bottom: "14mm", right: "2mm", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                  <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `2px solid ${DARK}` }}>
                    <QRCodeSVG value={buildVerifyUrl(p.id)} size={44} level="M" fgColor={DARK} />
                  </div>
                  <div style={{ fontSize: "3pt", color: DARK, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.4px", background: "#fff", padding: "0.3mm 1mm", borderRadius: "2px" }}>SCAN</div>
                </div>

                {/* Barcode + footer — absolute at bottom */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2 }}>
                  <div style={{ display: "flex", justifyContent: "flex-start", overflow: "hidden", paddingLeft: "2mm", marginBottom: "0.5mm" }}>
                    {p.passportNumber ? (
                      <Barcode value={p.passportNumber} height={14} width={1.0} fontSize={0} />
                    ) : (
                      <div style={{ fontSize: "5pt", color: "#999" }}>{group.groupName}</div>
                    )}
                  </div>
                  <div style={{ background: DARK, color: GOLD, padding: "1mm 2mm", fontSize: "4pt", textAlign: "center", fontWeight: 800, letterSpacing: "0.2px" }}>
                    {company.name} | 🇮🇳 {company.phone} | 🇸🇦 {company.phoneSaudi}
                  </div>
                </div>
              </div>
            ))}
            {Array.from({ length: 3 - page.length }).map((_, i) => (
              <div key={`ph-f-${i}`} className="id-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
            ))}
          </div>

          <div className="cards-row">
            {page.map(p => (
              <div key={`back-${p.id}`} className="id-card">
                <WaveShapesBack />

                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", padding: "2.5mm 3mm 0" }}>
                  <LogoHeader size="small" company={company} />

                  <div style={{ display: "flex", flexDirection: "column", gap: "1.2mm", fontSize: "5.5pt", lineHeight: 1.4 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
                      <div style={bulletDot} />
                      <div><span style={{ color: "#888", fontSize: "4.5pt" }}>Passport No. </span><span style={{ fontFamily: "monospace", letterSpacing: "0.3px", fontWeight: 600 }}>{p.passportNumber || "—"}</span></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
                      <div style={bulletDot} />
                      <div><span style={{ color: "#888", fontSize: "4.5pt" }}>Maktab: </span><span style={{ fontWeight: 600 }}>{group.maktabNumber || "—"}</span></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
                      <div style={bulletDot} />
                      <div>
                        <span style={{ color: "#888", fontSize: "4.5pt" }}>Makkah 2 Hotel: </span>
                        <span style={{ fontWeight: 600 }}>{group.hotels?.makkah?.name || "—"}</span>
                        {group.hotels?.makkah?.nameAr && <div style={{ fontWeight: 600, fontSize: "4.5pt", direction: "rtl", textAlign: "right" }}>{group.hotels.makkah.nameAr}</div>}
                        {group.hotels?.makkah?.address && <div style={{ fontSize: "4pt", color: "#888", marginTop: "0.3mm" }}>{group.hotels.makkah.address}</div>}
                        {group.hotels?.makkah?.addressAr && <div style={{ fontSize: "4pt", color: "#888", direction: "rtl", textAlign: "right" }}>{group.hotels.makkah.addressAr}</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5mm" }}>
                      <div style={bulletDot} />
                      <div>
                        <span style={{ color: "#888", fontSize: "4.5pt" }}>Madinah Hotel: </span>
                        <span style={{ fontWeight: 600 }}>{group.hotels?.madinah?.name || "—"}</span>
                        {group.hotels?.madinah?.nameAr && <div style={{ fontWeight: 600, fontSize: "4.5pt", direction: "rtl", textAlign: "right" }}>{group.hotels.madinah.nameAr}</div>}
                        {group.hotels?.madinah?.address && <div style={{ fontSize: "4pt", color: "#888", marginTop: "0.3mm" }}>{group.hotels.madinah.address}</div>}
                        {group.hotels?.madinah?.addressAr && <div style={{ fontSize: "4pt", color: "#888", direction: "rtl", textAlign: "right" }}>{group.hotels.madinah.addressAr}</div>}
                      </div>
                    </div>
                  </div>

                  {/* QR code area */}
                  {showFeedbackQr ? (
                    <div style={{ display: "flex", justifyContent: "center", gap: "3mm", marginTop: "2mm", marginBottom: "1mm" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                        <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `1px solid ${GOLD}` }}>
                          <QRCodeSVG value={buildVerifyUrl(p.id)} size={36} level="M" />
                        </div>
                        <div style={{ fontSize: "3pt", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Emergency Info</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                        <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `1.5px solid #0d5040` }}>
                          <QRCodeSVG
                            value={p.mobileIndia && bookingMap[p.mobileIndia]
                              ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                              : `${PROD_DOMAIN}/feedback`}
                            size={52} level="L" fgColor="#0d5040"
                          />
                        </div>
                        <div style={{ fontSize: "3pt", color: "#0d5040", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>Rate Your Trip</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "center", marginTop: "2mm", marginBottom: "1mm" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm" }}>
                        <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `2px solid ${DARK}` }}>
                          <QRCodeSVG value={buildVerifyUrl(p.id)} size={56} level="M" fgColor={DARK} />
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* Back footer — absolute */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "4.5pt", color: "#666", padding: "0 3mm", marginBottom: "1mm" }}>
                    <div>Group: <b style={{ color: DARK }}>{group.groupName}</b></div>
                    <div><b style={{ color: DARK }}>{p.fullName}</b></div>
                    <div>Year: <b style={{ color: DARK }}>{group.year}</b></div>
                  </div>
                  <div style={{
                    background: DARK, color: "#fff", padding: "1.5mm 2mm",
                    fontSize: "5pt", fontWeight: 900, textAlign: "center", lineHeight: 1.5,
                    WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                  } as React.CSSProperties}>
                    <div style={{ color: "#fff", fontWeight: 900 }}>{company.address}</div>
                    <div style={{ color: GOLD, fontWeight: 900, fontSize: "5pt", letterSpacing: "0.2px" }}>
                      🇮🇳 {company.phone} &nbsp;|&nbsp; 🇸🇦 {company.phoneSaudi}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {Array.from({ length: 3 - page.length }).map((_, i) => (
              <div key={`ph-b-${i}`} className="id-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
            ))}
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
