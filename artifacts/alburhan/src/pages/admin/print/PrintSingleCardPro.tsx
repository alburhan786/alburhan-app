import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { downloadAsPdf, downloadAsPng, fetchAsDataUrl } from "@/lib/downloadUtils";
import { QRCodeCanvas } from "qrcode.react";
import { Barcode } from "@/components/print/Barcode";
import { getCompanyById } from "@/lib/companies";

const API  = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "") || "";
const PROD_DOMAIN   = "https://alburhantravels.com";
const MASHARIQ_EN   = "Mashariq Al-Masiyah Company";
const MASHARIQ_AR   = "شركة مشارق الماسية";
const INDIA_PHONES  = ["9893989786", "9893225590"];
const SAUDI_EMERGENCY = ["0547090786", "0568780786"];
const DARK  = "#0d5040";
const GOLD  = "#C9A23F";
const SHORT_ADDRESS = "Shop No. 8, Khanka Masjid Complex, Shanwara Road, Burhanpur";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; mobileIndia?: string; mobileSaudi?: string;
  city?: string; busNumber?: string; roomNumber?: string; seatNumber?: string;
  barcodeId?: string; salutation?: string; gender?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number;
  hotels?: {
    groupLeader?: string;
    makkah?:  { name?: string; address?: string; nameAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string };
  };
}

function buildVerifyUrl(id: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

interface CardProps {
  p: Pilgrim;
  group: Group;
  company: ReturnType<typeof getCompanyById>;
  photoDataUrl: string;
}

function FrontCard({ p, group, company, photoDataUrl }: CardProps) {
  const serial = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = p.barcodeId || p.passportNumber || `HAJ${serial}`;
  const barcodeFormat = p.barcodeId ? "CODE128" : "CODE39";

  return (
    <div className="pro-card">
      <div style={{ background: DARK, flexShrink: 0, padding: "1.2mm 2mm 1mm", display: "flex", alignItems: "center", gap: "2mm" }}>
        <div style={{ fontSize: "26pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>AL BURHAN TOURS AND TRAVELS</div>
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: GOLD, letterSpacing: "1px", lineHeight: 1.2 }}>HAJJ {group.year}</div>
        </div>
        {company.logoUrl ? (
          <div style={{ width: "10mm", height: "10mm", borderRadius: "50%", background: "#fff", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            <img src={company.logoUrl} alt="" style={{ width: "88%", height: "88%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{ width: "10mm", height: "10mm", borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", color: DARK, fontWeight: 900, fontSize: "6pt", flexShrink: 0 }}>AB</div>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ width: "19mm", flexShrink: 0, background: "#f0f7f2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0.8mm", borderRight: `1.5px solid ${GOLD}` }}>
          {p.photoUrl ? (
            <img src={photoDataUrl || `${API}${p.photoUrl}`} alt="" style={{ width: "16mm", height: "19mm", objectFit: "cover", objectPosition: "top center", border: `2px solid ${GOLD}`, borderRadius: "2px" }} />
          ) : (
            <div style={{ width: "16mm", height: "19mm", background: "#e0e8e4", border: `2px solid ${GOLD}`, borderRadius: "2px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "3pt", color: "#888", fontWeight: 700 }}>
              <div style={{ fontSize: "9pt", color: GOLD }}>👤</div>
              <div>PHOTO</div>
            </div>
          )}
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: DARK, marginTop: "0.5mm" }}>#{serial}</div>
        </div>

        <div style={{ flex: 1, padding: "1.2mm 1mm 0.5mm 2mm", display: "flex", flexDirection: "column", overflow: "hidden", gap: "0.9mm" }}>
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK, textTransform: "uppercase", lineHeight: 1.2, wordBreak: "break-word", borderBottom: `1px solid ${GOLD}50`, paddingBottom: "0.6mm" }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>
          {p.passportNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Passport No.</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, letterSpacing: "0.8px", lineHeight: 1.1 }}>{p.passportNumber}</div>
            </div>
          )}
          {p.mobileIndia && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Mobile (India)</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{p.mobileIndia}</div>
            </div>
          )}
          {group.maktabNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Service Ctr. No.</div>
              <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{group.maktabNumber}</div>
            </div>
          )}
          <div style={{ marginTop: "auto", borderTop: `1px solid ${GOLD}40`, paddingTop: "0.5mm" }}>
            <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Company (India)</div>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>{INDIA_PHONES[0]} | {INDIA_PHONES[1]}</div>
          </div>
        </div>

        <div style={{ width: "22mm", flexShrink: 0, padding: "1.5mm 1.5mm 0.5mm", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", borderLeft: `1px solid ${GOLD}50` }}>
          <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `2.5px solid ${DARK}` }}>
            <QRCodeCanvas value={buildVerifyUrl(p.id)} size={56} level="M" fgColor={DARK} />
          </div>
          <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", marginTop: "0.5mm", letterSpacing: "0.2px", textAlign: "center" }}>SCAN TO VERIFY</div>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: "0 1.5mm 0.3mm", background: "#fff" }}>
        <Barcode value={barcodeVal} format={barcodeFormat} height={22} displayValue fontSize={5} />
      </div>

      <div style={{ background: DARK, flexShrink: 0, padding: "1.5mm 2.5mm" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8mm" }}>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.3px" }}>{p.salutation ? `${p.salutation} ` : ""}{p.fullName}</div>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Mobile No.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>🆘 Emergency (Saudi)</div>
            <div style={{ fontSize: "7.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "7.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[1]}</div>
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

function BackCard({ p, group, company }: CardProps) {
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
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>{MASHARIQ_EN}</div>
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

/* ─── Crop mark helper ─────────────────────────────────────────────────────── */
function CropMarks() {
  const gap = "3mm";
  const len = "5mm";
  const w   = "0.4px";
  const col = "#333";

  const mk = (top: string, left: string, width: string, height: string): React.CSSProperties => ({
    position: "absolute", background: col,
    top, left, width, height,
  });

  return (
    <>
      {/* Top-left */}
      <div style={mk(`calc(${gap} * -1)`,            "0",                         w,   len)} />
      <div style={mk(`calc(${len} * -1 - ${gap})`,   `calc(${gap} * -1)`,         len, w  )} />
      {/* Top-right */}
      <div style={mk(`calc(${gap} * -1)`,            "calc(100%)",                w,   len)} />
      <div style={mk(`calc(${len} * -1 - ${gap})`,   `calc(100% - ${gap} + 0px)`, len, w  )} />
      {/* Bottom-left */}
      <div style={mk("calc(100%)",                   "0",                         w,   len)} />
      <div style={mk(`calc(100% + ${gap})`,          `calc(${gap} * -1)`,         len, w  )} />
      {/* Bottom-right */}
      <div style={mk("calc(100%)",                   "calc(100%)",                w,   len)} />
      <div style={mk(`calc(100% + ${gap})`,          `calc(100% - ${gap} + 0px)`, len, w  )} />
    </>
  );
}

/* ─── Main page ────────────────────────────────────────────────────────────── */
export default function PrintSingleCardPro() {
  const [, frontParams] = useRoute("/admin/groups/:groupId/print/card-front/:pilgrimId");
  const [, backParams]  = useRoute("/admin/groups/:groupId/print/card-back/:pilgrimId");
  const params    = frontParams || backParams;
  const groupId   = params?.groupId   || "";
  const pilgrimId = params?.pilgrimId || "";
  const side: "front" | "back" = frontParams ? "front" : "back";

  const [, navigate] = useLocation();

  const [group,    setGroup]    = useState<Group    | null>(null);
  const [pilgrim,  setPilgrim]  = useState<Pilgrim  | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [error,    setError]    = useState("");
  const [dlState,  setDlState]  = useState<string | null>(null);

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef  = useRef<HTMLDivElement>(null);

  const frontUrl = `${BASE}/admin/groups/${groupId}/print/card-front/${pilgrimId}`;
  const backUrl  = `${BASE}/admin/groups/${groupId}/print/card-back/${pilgrimId}`;

  useEffect(() => {
    if (!groupId || !pilgrimId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(async ([g, all]) => {
      setGroup(g);
      const found = (Array.isArray(all) ? all : []).find((p: Pilgrim) => p.id === pilgrimId);
      if (found) {
        setPilgrim(found);
        if (found.photoUrl) {
          const d = await fetchAsDataUrl(`${API}${found.photoUrl}`);
          setPhotoDataUrl(d || `${API}${found.photoUrl}`);
        }
      } else {
        setError("Pilgrim not found");
      }
    }).catch(() => setError("Failed to load data"));
  }, [groupId, pilgrimId]);

  const dl = async (dlSide: "front" | "back", fmt: "pdf" | "png") => {
    const el = dlSide === "front" ? frontRef.current : backRef.current;
    if (!el) return;
    const key = `${dlSide}-${fmt}`;
    setDlState(key);
    const safeName = pilgrim?.fullName?.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "card";
    try {
      if (fmt === "pdf") await downloadAsPdf(el,  `id-card-${dlSide}-${safeName}`);
      else               await downloadAsPng(el,  `id-card-${dlSide}-${safeName}`);
    } finally { setDlState(null); }
  };

  const printSide = (printTarget: "front" | "back") => {
    if (printTarget !== side) {
      navigate(printTarget === "front" ? frontUrl : backUrl);
      setTimeout(() => window.print(), 600);
    } else {
      window.print();
    }
  };

  if (error) return <div style={{ padding: "60px", textAlign: "center", color: "red", fontFamily: "Arial", fontSize: "16px" }}>{error}</div>;
  if (!group || !pilgrim) return <div style={{ padding: "60px", textAlign: "center", fontFamily: "Arial", fontSize: "16px" }}>Loading...</div>;

  const safeName  = pilgrim.fullName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const company   = getCompanyById((group as any).companyId || "alburhan");
  const cardProps: CardProps = { p: pilgrim, group, company, photoDataUrl };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0; padding: 0; background: white !important;
          }
          .no-print    { display: none !important; }
          .hidden-card { display: none !important; }
          .a4-page {
            width: 210mm; height: 297mm;
            display: flex; align-items: center; justify-content: center;
            box-shadow: none !important; margin: 0 !important;
          }
          .crop-mark { display: block !important; }
        }

        * { box-sizing: border-box; }

        .pro-card {
          width: 85mm;
          height: 54mm;
          overflow: hidden;
          font-family: Arial, sans-serif;
          background: #fff;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }

        .a4-page {
          width: 210mm;
          height: 297mm;
          background: white;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-wrapper {
          position: relative;
          display: inline-flex;
        }

        .crop-mark {
          position: absolute;
          background: #1a1a1a;
        }

        /* dashed border around the safe-area */
        .cut-guide {
          position: absolute;
          inset: -3mm;
          border: 1.2px dashed #aaa;
          border-radius: 1px;
          pointer-events: none;
        }

        /* corner labels */
        .cut-label {
          position: absolute;
          font-size: 5px;
          color: #aaa;
          font-family: Arial, sans-serif;
          white-space: nowrap;
          letter-spacing: 0.3px;
        }

        @media screen {
          body { background: #475569; font-family: Arial, sans-serif; padding: 0; margin: 0; }
          .a4-page {
            box-shadow: 0 8px 50px rgba(0,0,0,0.35);
            margin: 80px auto 60px;
          }
        }
      `}</style>

      {/* ─── Fixed Toolbar ───────────────────────────────────────────────── */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
        background: DARK, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
        boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
      }}>
        {/* Pilgrim info */}
        <div>
          <div style={{ fontWeight: 900, fontSize: "14px", color: "#fff" }}>{pilgrim.fullName}</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>
            #{String(pilgrim.serialNumber).padStart(3,"0")} · {group.groupName} · {group.year}
          </div>
        </div>

        {/* Side toggle */}
        <div className="no-print" style={{ display: "flex", gap: "4px", background: "rgba(0,0,0,0.25)", borderRadius: "8px", padding: "3px" }}>
          <a href={frontUrl} style={{
            padding: "7px 16px", borderRadius: "6px", fontWeight: 700, fontSize: "13px",
            textDecoration: "none", cursor: "pointer",
            background: side === "front" ? GOLD : "transparent",
            color: side === "front" ? DARK : "rgba(255,255,255,0.7)",
          }}>FRONT</a>
          <a href={backUrl} style={{
            padding: "7px 16px", borderRadius: "6px", fontWeight: 700, fontSize: "13px",
            textDecoration: "none", cursor: "pointer",
            background: side === "back" ? GOLD : "transparent",
            color: side === "back" ? DARK : "rgba(255,255,255,0.7)",
          }}>BACK</a>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Print buttons */}
          <button onClick={() => printSide("front")} style={{
            padding: "9px 20px", background: "#fff", color: DARK,
            border: "none", borderRadius: "7px", fontWeight: 900, cursor: "pointer", fontSize: "13px",
          }}>🖨 Print Front</button>
          <button onClick={() => printSide("back")} style={{
            padding: "9px 20px", background: GOLD, color: DARK,
            border: "none", borderRadius: "7px", fontWeight: 900, cursor: "pointer", fontSize: "13px",
          }}>🖨 Print Back</button>

          {/* Front downloads */}
          <button onClick={() => dl("front","pdf")} disabled={!!dlState} style={{
            padding: "9px 14px",
            background: dlState === "front-pdf" ? "#6b7280" : "#1d4ed8",
            color: "#fff", border: "none", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "12px",
          }}>{dlState === "front-pdf" ? "⏳..." : "⬇ Front PDF"}</button>
          <button onClick={() => dl("front","png")} disabled={!!dlState} style={{
            padding: "9px 14px",
            background: dlState === "front-png" ? "#6b7280" : "#059669",
            color: "#fff", border: "none", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "12px",
          }}>{dlState === "front-png" ? "⏳..." : "⬇ Front PNG"}</button>

          {/* Back downloads */}
          <button onClick={() => dl("back","pdf")} disabled={!!dlState} style={{
            padding: "9px 14px",
            background: dlState === "back-pdf" ? "#6b7280" : "#7c3aed",
            color: "#fff", border: "none", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "12px",
          }}>{dlState === "back-pdf" ? "⏳..." : "⬇ Back PDF"}</button>
          <button onClick={() => dl("back","png")} disabled={!!dlState} style={{
            padding: "9px 14px",
            background: dlState === "back-png" ? "#6b7280" : "#b45309",
            color: "#fff", border: "none", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "12px",
          }}>{dlState === "back-png" ? "⏳..." : "⬇ Back PNG"}</button>

          <button onClick={() => window.history.back()} style={{
            padding: "9px 14px", background: "rgba(255,255,255,0.15)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)", borderRadius: "7px", cursor: "pointer", fontSize: "12px",
          }}>← Back</button>
        </div>
      </div>

      {/* ─── Print instruction banner ────────────────────────────────────── */}
      <div className="no-print" style={{
        position: "fixed", top: "58px", left: 0, right: 0, zIndex: 299,
        padding: "8px 20px", background: "#fef9c3", borderBottom: "2px solid #fbbf24",
        fontSize: "12px", fontWeight: 700, color: "#92400e",
        display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center",
      }}>
        <span>📐 Card: 85 × 54 mm · A4 Portrait</span>
        <span>🖨 Print at 100% — No Scaling</span>
        <span>✂ Cut along dashed guide · Leave crop marks</span>
        <span style={{ marginLeft: "auto", background: side === "front" ? "#dcfce7" : "#eff6ff", padding: "3px 12px", borderRadius: "20px", border: `1px solid ${side === "front" ? "#86efac" : "#93c5fd"}`, color: side === "front" ? "#166534" : "#1d4ed8" }}>
          Showing: {side === "front" ? "▶ FRONT SIDE" : "▶ BACK SIDE"}
        </span>
      </div>

      {/* ─── A4 Page ─────────────────────────────────────────────────────── */}
      <div className="a4-page">

        {/* ── Active card with crop marks ── */}
        <div className="card-wrapper">
          {/* Dashed cut guide (outside the card) */}
          <div className="cut-guide no-print" />
          <div className="cut-label no-print" style={{ top: "calc(-3mm - 6px)", left: "50%", transform: "translateX(-50%)" }}>
            ✂ CUT LINE — {side === "front" ? "FRONT" : "BACK"} · 85 × 54 mm · Print Actual Size (100%)
          </div>

          {/* Crop marks — 4 corners */}
          <CropMarks />

          {/* The card itself */}
          {side === "front" ? (
            <div ref={frontRef}><FrontCard {...cardProps} /></div>
          ) : (
            <div ref={backRef}><BackCard {...cardProps} /></div>
          )}
        </div>

      </div>

      {/* ─── Hidden "other side" card — always rendered for download ─────── */}
      <div className="hidden-card" style={{ position: "fixed", top: "-99999px", left: "-99999px" }}>
        {side === "front" ? (
          <div ref={backRef}><BackCard {...cardProps} /></div>
        ) : (
          <div ref={frontRef}><FrontCard {...cardProps} /></div>
        )}
      </div>
    </>
  );
}
