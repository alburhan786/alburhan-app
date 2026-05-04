import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { Barcode } from "@/components/print/Barcode";
import { getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";
const MASHARIQ_EN = "Mashariq Al-Masiyah Company";
const MASHARIQ_AR = "شركة مشارق الماسية";
const INDIA_PHONES = ["9893989786", "9893225590"];
const SAUDI_EMERGENCY = ["0547090786", "0568780786"];
const DARK = "#0d5040";
const GOLD = "#C9A23F";
const SHORT_ADDRESS = "Shop No. 8, Khanka Masjid Complex, Shanwara Road, Burhanpur";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; mobileSaudi?: string;
  city?: string; busNumber?: string; roomNumber?: string; seatNumber?: string;
  barcodeId?: string; salutation?: string; gender?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  hotels?: {
    makkah?:  { name?: string; nameAr?: string; address?: string };
    madinah?: { name?: string; nameAr?: string; address?: string };
    aziziah?: { name?: string; nameAr?: string; address?: string };
  };
}

function buildVerifyUrl(id: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

function FrontCard({ p, group }: { p: Pilgrim; group: Group }) {
  const company = getCompanyById("alburhan");
  const serial = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = p.barcodeId || p.passportNumber || `HAJ${serial}`;
  const barcodeFormat = p.barcodeId ? "CODE128" : "CODE39";
  const verifyUrl = buildVerifyUrl(p.id);

  return (
    <div className="pro-card">
      <div style={{ background: DARK, padding: "1.5mm 2.5mm", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
        <div>
          <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>AL BURHAN TOURS AND TRAVELS</div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.2 }}>HAJJ {group.year}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "4pt", color: "rgba(255,255,255,0.6)", lineHeight: 1.2 }}>alburhantravels.com</div>
          <div style={{ fontSize: "9pt", fontWeight: 900, color: GOLD, lineHeight: 1 }}>#{serial}</div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: "20mm", flexShrink: 0, borderRight: `1px solid ${GOLD}40`, overflow: "hidden", background: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {p.photoUrl
            ? <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: "20pt" }}>👤</div>}
        </div>

        <div style={{ flex: 1, padding: "1.5mm 2mm", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
          <div>
            <div style={{ fontSize: "9.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2, wordBreak: "break-word", textTransform: "uppercase" }}>
              {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
            </div>
            {p.passportNumber && (
              <div style={{ fontSize: "6.5pt", fontWeight: 700, color: "#444", marginTop: "0.8mm" }}>
                <span style={{ color: "#888", fontWeight: 400 }}>Passport: </span>{p.passportNumber}
              </div>
            )}
            {p.city && <div style={{ fontSize: "5.5pt", color: "#666", marginTop: "0.5mm" }}>{p.city}</div>}
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "2mm" }}>
            <div>
              {INDIA_PHONES.map((ph, i) => (
                <div key={i} style={{ fontSize: "7pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.5px" }}>{ph}</div>
              ))}
              <div style={{ fontSize: "3.5pt", color: "#888", textTransform: "uppercase", letterSpacing: "0.3px" }}>Office (India)</div>
            </div>
            <div style={{ display: "flex", gap: "1.5mm" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ background: "#fff", padding: "1px", borderRadius: "2px", border: `1px solid ${DARK}40` }}>
                  <QRCodeSVG value={verifyUrl} size={24} level="L" fgColor={DARK} />
                </div>
                <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", marginTop: "0.3mm" }}>Verify</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <Barcode value={barcodeVal} format={barcodeFormat} width={0.8} height={18} fontSize={4} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: DARK, flexShrink: 0, padding: "1.2mm 2.5mm" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3mm" }}>
            {SAUDI_EMERGENCY.map((ph, i) => (
              <div key={i} style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.2, letterSpacing: "0.5px" }}>{ph}</div>
            ))}
            <div style={{ fontSize: "3pt", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Emergency (Saudi)</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Pilgrim Mobile</div>
            <div style={{ fontSize: "8.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{p.mobileIndia || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackCard({ p, group }: { p: Pilgrim; group: Group }) {
  const company = getCompanyById("alburhan");
  const saudiPhones = (company.phoneSaudi || "").split(/[|,]/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="pro-card">
      <div style={{ background: DARK, padding: "1mm 2.5mm", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
        <div>
          <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>AL BURHAN TOURS AND TRAVELS</div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.2 }}>HAJJ {group.year}</div>
        </div>
        <div style={{ fontSize: "3.5pt", fontWeight: 700, color: "rgba(255,255,255,0.6)", lineHeight: 1.3, textAlign: "right", flexShrink: 0 }}>{company.phone}</div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ width: "43mm", flexShrink: 0, padding: "1.2mm 2mm 1mm", borderRight: `1px solid ${GOLD}40`, display: "flex", flexDirection: "column", gap: "1mm" }}>
          {group.maktabNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Service Center No.</div>
              <div style={{ fontSize: "13pt", fontWeight: 900, color: DARK, lineHeight: 1 }}>{group.maktabNumber}</div>
            </div>
          )}
          <div style={{ background: `${GOLD}20`, borderRadius: "2px", padding: "1mm 1.5mm", borderLeft: `2.5px solid ${GOLD}` }}>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.2px" }}>{MASHARIQ_EN}</div>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.35, direction: "rtl", textAlign: "right" }}>{MASHARIQ_AR}</div>
            <div style={{ fontSize: "2.8pt", color: "#777", textTransform: "uppercase", lineHeight: 1, marginTop: "0.3mm" }}>Pilgrim Service Company</div>
          </div>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 900, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.5mm" }}>🆘 Emergency (Saudi)</div>
            {saudiPhones.map((num, i) => (
              <div key={i} style={{ fontSize: "9.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.5px" }}>{num}</div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, padding: "1.2mm 1.5mm", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2mm", flex: 1 }}>
            {([
              ["Hotel Makkah 1", group.hotels?.aziziah?.name, group.hotels?.aziziah?.nameAr, group.hotels?.aziziah?.address],
              ["Hotel Makkah 2", group.hotels?.makkah?.name,  group.hotels?.makkah?.nameAr,  group.hotels?.makkah?.address],
              ["Hotel Madinah",  group.hotels?.madinah?.name,  group.hotels?.madinah?.nameAr,  group.hotels?.madinah?.address],
            ] as [string, string|undefined, string|undefined, string|undefined][]).map(([lbl, val, valAr, addr]) => val ? (
              <div key={lbl}>
                <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>{lbl}</div>
                <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, lineHeight: 1.2 }}>{val}</div>
                {valAr && <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.2, direction: "rtl", textAlign: "right" }}>{valAr}</div>}
                {addr && <div style={{ fontSize: "4pt", fontWeight: 700, color: "#555", lineHeight: 1.2 }}>{addr}</div>}
              </div>
            ) : null)}
          </div>
        </div>
      </div>

      <div style={{ background: DARK, flexShrink: 0, padding: "1.5mm 2.5mm" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "2mm" }}>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", lineHeight: 1, marginBottom: "0.5mm" }}>{p.fullName}</div>
            <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.35, letterSpacing: "0.2px" }}>{SHORT_ADDRESS}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.3mm" }}>🆘 Emergency</div>
            <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[1]}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintSingleCard() {
  const [, params] = useRoute("/admin/groups/:groupId/print/single-card/:pilgrimId");
  const groupId = params?.groupId || "";
  const pilgrimId = params?.pilgrimId || "";

  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrim, setPilgrim] = useState<Pilgrim | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!groupId || !pilgrimId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, all]) => {
      setGroup(g);
      const found = (Array.isArray(all) ? all : []).find((p: Pilgrim) => p.id === pilgrimId);
      if (found) setPilgrim(found);
      else setError("Pilgrim not found");
    }).catch(() => setError("Failed to load data"));
  }, [groupId, pilgrimId]);

  if (error) return <div style={{ padding: "40px", textAlign: "center", color: "red", fontFamily: "Arial" }}>{error}</div>;
  if (!group || !pilgrim) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .single-page {
            width: 210mm; height: 297mm;
            display: flex; align-items: center; justify-content: center;
            page-break-after: always; break-after: page;
          }
          .single-page:last-child { page-break-after: auto; break-after: auto; }
        }
        * { box-sizing: border-box; }
        .pro-card {
          width: 90mm; height: 60mm;
          border: 1px solid #ccc; border-radius: 3px;
          overflow: hidden; font-family: Arial, sans-serif;
          background: #fff; display: flex; flex-direction: column;
        }
        .single-page {
          width: 210mm; min-height: 297mm;
          display: flex; align-items: center; justify-content: center;
          page-break-after: always; break-after: page;
        }
        .single-page:last-child { page-break-after: auto; break-after: auto; }
        @media screen {
          body { background: #e5e7eb; }
          .single-page {
            background: white;
            box-shadow: 0 4px 24px rgba(0,0,0,0.15);
            margin: 20px auto;
            border-radius: 4px;
          }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "12px 20px", background: DARK, color: "#fff",
        display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
        boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
      }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: "15px" }}>🖨 Print ID Card — {pilgrim.fullName}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)" }}>Page 1 = FRONT · Page 2 = BACK · Same person guaranteed</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={() => window.history.back()} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "7px", cursor: "pointer", fontSize: "13px" }}>
            ← Back
          </button>
          <button onClick={() => window.print()} style={{ padding: "10px 28px", background: GOLD, color: "#000", border: "none", borderRadius: "8px", fontWeight: 900, cursor: "pointer", fontSize: "15px" }}>
            🖨 PRINT NOW
          </button>
        </div>
      </div>

      {/* ── Big instruction banner ── */}
      <div className="no-print" style={{
        marginTop: "70px",
        padding: "14px 24px",
        background: "#fef9c3",
        borderBottom: "2px solid #facc15",
        textAlign: "center",
        fontSize: "14px",
        fontWeight: 700,
        color: "#854d0e",
      }}>
        ⚙️ In the print dialog: enable <strong>Two-sided printing</strong> → Flip on <strong>Short Edge</strong>
        &nbsp;·&nbsp; Page 1 = <strong>{pilgrim.fullName} FRONT</strong>
        &nbsp;·&nbsp; Page 2 = <strong>{pilgrim.fullName} BACK</strong>
        &nbsp;·&nbsp; Printer puts them on <strong>same physical paper</strong> ✅
      </div>

      {/* ── Page 1: FRONT ── */}
      <div style={{ textAlign: "center", padding: "6px 0 2px", fontSize: "11px", color: "#666", fontFamily: "Arial" }} className="no-print">
        ↓ Page 1 · {pilgrim.fullName} · FRONT
      </div>
      <div className="single-page">
        <FrontCard p={pilgrim} group={group} />
      </div>

      {/* ── Page 2: BACK ── */}
      <div style={{ textAlign: "center", padding: "6px 0 2px", fontSize: "11px", color: "#666", fontFamily: "Arial" }} className="no-print">
        ↓ Page 2 · {pilgrim.fullName} · BACK (prints on the physical back of Page 1)
      </div>
      <div className="single-page">
        <BackCard p={pilgrim} group={group} />
      </div>
    </>
  );
}
