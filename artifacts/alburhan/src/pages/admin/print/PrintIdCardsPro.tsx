import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { downloadMultiPagePdf, downloadPagesAsJpg, downloadPagesAsPng, downloadAsPdf, downloadAsJpg, downloadAsPng, fetchAsDataUrl, downloadElementAsSvg, downloadCardsAsSheet } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";
const PROD_DOMAIN = "https://alburhantravels.com";

const MASHARIQ_EN = "Mashariq Al-Masiyah Company";
const MASHARIQ_AR = "شركة مشارق الماسية";

// Company India phones (shown big on front)
const INDIA_PHONES = ["9893989786", "9893225590"];
// Emergency Saudi phones (shown in front footer white)
const SAUDI_EMERGENCY = ["0547090786", "0568780786"];

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
    makkah?:  { name?: string; address?: string; nameAr?: string; addressAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
  };
}

const DARK = "#0d5040";
const GOLD = "#C9A23F";
const SHORT_ADDRESS = "Shop No. 8, Khanka Masjid Complex, Shanwara Road, Burhanpur";

function buildVerifyUrl(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

interface CardProps {
  p: Pilgrim; group: Group;
  company: ReturnType<typeof getCompanyById>;
  showFeedbackQr: boolean; bookingMap: Record<string, string>;
  photoDataUrls: Record<string, string>;
}

function FrontCard({ p, group, company, photoDataUrls }: CardProps) {
  const serial = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = (p.barcodeId || p.passportNumber || `HAJ${serial}`)
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9\-. ]/g, "")
    .trim();
  const barcodeFormat = "CODE128";

  return (
    <div className="pro-card">

      {/* ── Header ── */}
      <div style={{
        background: DARK, flexShrink: 0,
        padding: "0.8mm 2mm 0.6mm", display: "flex", alignItems: "center", gap: "1.5mm",
      }}>
        {/* Indian flag */}
        <div style={{ fontSize: "20pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>

        {/* Company + year */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>
            AL BURHAN TOURS AND TRAVELS
          </div>
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: GOLD, letterSpacing: "1px", lineHeight: 1.2 }}>
            HAJJ {group.year}
          </div>
        </div>

        {/* Logo circle */}
        {company.logoUrl ? (
          <div style={{
            width: "10mm", height: "10mm", borderRadius: "50%",
            background: "#fff", border: `2px solid ${GOLD}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", flexShrink: 0,
          }}>
            <img src={company.logoUrl} alt="" style={{ width: "88%", height: "88%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{
            width: "10mm", height: "10mm", borderRadius: "50%",
            background: GOLD, display: "flex", alignItems: "center",
            justifyContent: "center", color: DARK, fontWeight: 900, fontSize: "6pt", flexShrink: 0,
          }}>AB</div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Photo sidebar */}
        <div style={{
          width: "20mm", flexShrink: 0, background: DARK,
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "flex-start", padding: "2mm 1mm 1mm",
          borderRight: `2px solid ${GOLD}`,
        }}>
          {/* Gold frame wrapper */}
          <div style={{
            padding: "1.5px",
            background: `linear-gradient(135deg, ${GOLD} 0%, #E8D48B 50%, ${GOLD} 100%)`,
            borderRadius: "3px",
            boxShadow: `0 0 4px ${GOLD}99`,
          }}>
            {p.photoUrl ? (
              <img src={photoDataUrls[p.id] || `${API}${p.photoUrl}`} alt=""
                style={{ width: "15mm", height: "18mm", objectFit: "cover", objectPosition: "top center", display: "block", borderRadius: "2px" }} />
            ) : (
              <div style={{
                width: "15mm", height: "18mm", background: "#e0e8e4",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                fontSize: "3pt", color: "#888", fontWeight: 700, borderRadius: "2px",
              }}>
                <div style={{ fontSize: "9pt", color: GOLD }}>👤</div>
                <div>PHOTO</div>
              </div>
            )}
          </div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GOLD, marginTop: "0.8mm", letterSpacing: "0.3px" }}>#{serial}</div>
        </div>

        {/* Info column */}
        <div style={{ flex: 1, padding: "1.2mm 1mm 0.5mm 2mm", display: "flex", flexDirection: "column", overflow: "hidden", gap: "0.9mm" }}>

          {/* Pilgrim name */}
          <div style={{
            fontSize: "6.5pt", fontWeight: 900, color: DARK,
            textTransform: "uppercase", lineHeight: 1.2, wordBreak: "break-word",
            borderBottom: `1px solid ${GOLD}50`, paddingBottom: "0.6mm",
          }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>

          {/* Passport No — BIG BOLD */}
          {p.passportNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Passport No.</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, letterSpacing: "0.8px", lineHeight: 1.1 }}>{p.passportNumber}</div>
            </div>
          )}

          {/* Mobile India — BIG BOLD */}
          {p.mobileIndia && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Mobile (India)</div>
              <div style={{ fontSize: "7pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{p.mobileIndia}</div>
            </div>
          )}

          {/* Service Center — always shown, BIG BOLD highlighted */}
          <div style={{ background: `${GOLD}22`, borderRadius: "2px", padding: "0.5mm 1mm", border: `1px solid ${GOLD}60` }}>
            <div style={{ fontSize: "2.8pt", color: "#888", textTransform: "uppercase", lineHeight: 1 }}>Service Ctr. No.</div>
            <div style={{ fontSize: "9pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{group.maktabNumber || "—"}</div>
          </div>

          {/* Company India phones — big bold */}
          <div style={{ marginTop: "auto", borderTop: `1px solid ${GOLD}40`, paddingTop: "0.5mm" }}>
            <div style={{ fontSize: "2.5pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Company (India)</div>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3 }}>
              {INDIA_PHONES[0]} &nbsp;|&nbsp; {INDIA_PHONES[1]}
            </div>
          </div>
        </div>

        {/* QR column — TOP RIGHT */}
        <div style={{
          width: "20mm", flexShrink: 0, padding: "1mm 1mm 0.5mm",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          borderLeft: `1px solid ${GOLD}50`,
        }}>
          <div style={{ background: "#fff", padding: "2px", borderRadius: "3px", border: `1.5px solid #000` }}>
            <QRCodeCanvas value={buildVerifyUrl(p.id)} size={52} level="M" fgColor="#000000" bgColor="#ffffff" />
          </div>
          <div style={{ fontSize: "2.5pt", color: "#888", textTransform: "uppercase", marginTop: "0.5mm", letterSpacing: "0.2px", textAlign: "center" }}>SCAN TO VERIFY</div>
        </div>
      </div>

      {/* ── Barcode ── */}
      <div style={{ flexShrink: 0, padding: "1mm 1.5mm 0.2mm", background: "#fff", borderTop: `2px solid ${GOLD}` }}>
        <Barcode value={barcodeVal} format={barcodeFormat} width={1.5} height={14} displayValue fontSize={5} />
      </div>

      {/* ── Footer — Mobile + Emergency numbers BIG BOLD WHITE SQUARE ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1mm 2.5mm" } as React.CSSProperties}>
        {/* Row 1: label + mobile */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8mm" }}>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>
          <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>Mobile No.</div>
        </div>
        {/* Row 2: emergency | mobile */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
          <div>
            <div style={{ fontSize: "3.5pt", fontWeight: 900, color: "#ff2020", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1, marginBottom: "0.4mm" }}>🆘 EMERGENCY (SAUDI)</div>
            <div style={{ fontSize: "9pt", fontWeight: 900, color: "#fff", lineHeight: 1.2, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "9pt", fontWeight: 900, color: "#fff", lineHeight: 1.2, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[1]}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Pilgrim Mobile</div>
            <div style={{ fontSize: "9pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>
              {p.mobileIndia || "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackCard({ p, group, company, showFeedbackQr, bookingMap }: CardProps) {
  const saudiPhones = (company.phoneSaudi || "").split(/[|,]/).map(s => s.trim()).filter(Boolean);

  return (
    <div className="pro-card">

      {/* ── Header ── */}
      <div style={{
        background: DARK, padding: "1mm 2.5mm", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm",
      }}>
        <div>
          <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.1 }}>
            AL BURHAN TOURS AND TRAVELS
          </div>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1.2 }}>
            HAJJ {group.year}
          </div>
        </div>
        <div style={{ fontSize: "3.5pt", fontWeight: 700, color: "rgba(255,255,255,0.6)", lineHeight: 1.3, textAlign: "right", flexShrink: 0 }}>
          {company.phone}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left: service info */}
        <div style={{
          width: "43mm", flexShrink: 0, padding: "1.2mm 2mm 1mm",
          borderRight: `1px solid ${GOLD}40`,
          display: "flex", flexDirection: "column", gap: "1mm",
        }}>
          {/* Maktab big */}
          {group.maktabNumber && (
            <div>
              <div style={{ fontSize: "2.8pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>Service Center No.</div>
              <div style={{ fontSize: "13pt", fontWeight: 900, color: DARK, lineHeight: 1 }}>{group.maktabNumber}</div>
            </div>
          )}

          {/* Mashariq — EN + AR */}
          <div style={{
            background: `${GOLD}20`, borderRadius: "2px", padding: "1mm 1.5mm",
            borderLeft: `2.5px solid ${GOLD}`,
          }}>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.2px" }}>{MASHARIQ_EN}</div>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.35, direction: "rtl", textAlign: "right", fontFamily: "Arial, sans-serif" }}>{MASHARIQ_AR}</div>
            <div style={{ fontSize: "2.8pt", color: "#777", textTransform: "uppercase", lineHeight: 1, marginTop: "0.3mm" }}>Pilgrim Service Company</div>
          </div>

          {/* Saudi emergency — BIG */}
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 900, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, marginBottom: "0.5mm" }}>
              🆘 Emergency (Saudi)
            </div>
            {saudiPhones.map((num, i) => (
              <div key={i} style={{ fontSize: "9.5pt", fontWeight: 900, color: DARK, lineHeight: 1.3, letterSpacing: "0.5px" }}>{num}</div>
            ))}
          </div>
        </div>

        {/* Right: hotels + feedback QR */}
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

          {showFeedbackQr && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginTop: "auto" }}>
              <div style={{ background: "#fff", padding: "1px", borderRadius: "2px", border: `1.5px solid ${DARK}` }}>
                <QRCodeCanvas
                  value={p.mobileIndia && bookingMap[p.mobileIndia]
                    ? `${PROD_DOMAIN}/feedback?booking_id=${bookingMap[p.mobileIndia]}`
                    : `${PROD_DOMAIN}/feedback`}
                  size={26} level="L" fgColor={DARK}
                />
              </div>
              <div style={{ fontSize: "2.8pt", color: "#888", textTransform: "uppercase", marginTop: "0.3mm" }}>Rate Trip</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer — Address + Emergency BIG BOLD WHITE SQUARE ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1.5mm 2.5mm" } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "2mm" }}>
          {/* Left: address */}
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", lineHeight: 1, marginBottom: "0.5mm" }}>
              {p.fullName}
            </div>
            <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.35, letterSpacing: "0.2px" }}>
              {SHORT_ADDRESS}
            </div>
          </div>
          {/* Right: emergency Saudi */}
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

/* ── Corner crop marks around each card ───────────────────────────────────── */
function CropMarkCard({ children }: { children: React.ReactNode }) {
  const G = "1mm"; const L = "4mm"; const W = "0.5px"; const C = "#444";
  const hm = (top: string, left: string): React.CSSProperties => ({
    position:"absolute", background:C, top, left, width:L, height:W, pointerEvents:"none", zIndex:10,
  });
  const vm = (top: string, left: string): React.CSSProperties => ({
    position:"absolute", background:C, top, left, width:W, height:L, pointerEvents:"none", zIndex:10,
  });
  return (
    <div style={{ position:"relative", display:"inline-block" }}>
      {/* Top-left */}
      <div style={hm(`calc(-1*${G})`, `calc(-1*${L} - ${G})`)} />
      <div style={vm(`calc(-1*${L} - ${G})`, `calc(-1*${G})`)} />
      {/* Top-right */}
      <div style={hm(`calc(-1*${G})`, `calc(100% + ${G})`)} />
      <div style={vm(`calc(-1*${L} - ${G})`, `calc(100% + ${G})`)} />
      {/* Bottom-left */}
      <div style={hm(`calc(100% + ${G})`, `calc(-1*${L} - ${G})`)} />
      <div style={vm(`calc(100% + ${G})`, `calc(-1*${G})`)} />
      {/* Bottom-right */}
      <div style={hm(`calc(100% + ${G})`, `calc(100% + ${G})`)} />
      <div style={vm(`calc(100% + ${G})`, `calc(100% + ${G})`)} />
      {children}
    </div>
  );
}

/* ── Portrait card for Grid9 mode (70mm × 99mm ≈ 2.76" × 3.9") ────────── */
function FrontCardPortrait({ p, group, company, photoDataUrls }: CardProps) {
  const serial = String(p.serialNumber).padStart(3, "0");
  const barcodeVal = (p.barcodeId || p.passportNumber || `HAJ${serial}`)
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9\-. ]/g, "")
    .trim();

  return (
    <div className="pro-card-portrait">

      {/* ── Header ── */}
      <div style={{
        background: DARK, flexShrink: 0,
        padding: "1.2mm 2mm 1mm", display: "flex", alignItems: "center", gap: "1.5mm",
      }}>
        <div style={{ fontSize: "18pt", lineHeight: 1, flexShrink: 0 }}>🇮🇳</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.4px", lineHeight: 1.15 }}>
            AL BURHAN TOURS AND TRAVELS
          </div>
          <div style={{ fontSize: "6pt", fontWeight: 900, color: GOLD, letterSpacing: "1px", lineHeight: 1.2 }}>
            HAJJ {group.year}
          </div>
        </div>
        {company.logoUrl ? (
          <div style={{
            width: "10mm", height: "10mm", borderRadius: "50%",
            background: "#fff", border: `2px solid ${GOLD}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", flexShrink: 0,
          }}>
            <img src={company.logoUrl} alt="" style={{ width: "88%", height: "88%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{
            width: "10mm", height: "10mm", borderRadius: "50%", background: GOLD,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: DARK, fontWeight: 900, fontSize: "6pt", flexShrink: 0,
          }}>AB</div>
        )}
      </div>

      {/* ── Gold strip: Serial + Maktab ── */}
      <div style={{
        background: GOLD, flexShrink: 0,
        padding: "0.6mm 2mm", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK }}>Serial No: {serial}</span>
        {group.maktabNumber && (
          <span style={{ fontSize: "6.5pt", fontWeight: 900, color: DARK }}>Maktab: {group.maktabNumber}</span>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Photo sidebar */}
        <div style={{
          width: "22mm", flexShrink: 0, background: DARK,
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "flex-start", padding: "2mm 1.2mm 1mm",
          borderRight: `2px solid ${GOLD}`,
        }}>
          <div style={{
            padding: "1.5px",
            background: `linear-gradient(135deg, ${GOLD} 0%, #E8D48B 50%, ${GOLD} 100%)`,
            borderRadius: "3px", boxShadow: `0 0 4px ${GOLD}99`,
          }}>
            {p.photoUrl ? (
              <img src={photoDataUrls[p.id] || `${API}${p.photoUrl}`} alt=""
                style={{ width: "18mm", height: "24mm", objectFit: "cover", objectPosition: "top center", display: "block", borderRadius: "2px" }} />
            ) : (
              <div style={{
                width: "18mm", height: "24mm", background: "#e0e8e4",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                fontSize: "3pt", color: "#888", fontWeight: 700, borderRadius: "2px",
              }}>
                <div style={{ fontSize: "10pt", color: GOLD }}>👤</div>
                <div>PHOTO</div>
              </div>
            )}
          </div>

          {/* QR below photo */}
          <div style={{ marginTop: "2mm", background: "#fff", padding: "2px", borderRadius: "2px", border: `1.5px solid ${GOLD}` }}>
            <QRCodeCanvas value={buildVerifyUrl(p.id)} size={44} level="M" fgColor="#000" bgColor="#fff" />
          </div>
          <div style={{ fontSize: "3pt", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", marginTop: "0.5mm", textAlign: "center" }}>SCAN TO VERIFY</div>
        </div>

        {/* Info column */}
        <div style={{ flex: 1, padding: "2mm 1.5mm 1mm 2mm", display: "flex", flexDirection: "column", gap: "1.2mm", overflow: "hidden" }}>

          {/* Name */}
          <div style={{
            fontSize: "8pt", fontWeight: 900, color: DARK,
            textTransform: "uppercase", lineHeight: 1.25, wordBreak: "break-word",
            borderBottom: `1px solid ${GOLD}50`, paddingBottom: "1mm",
          }}>
            {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
          </div>

          {/* Passport */}
          {p.passportNumber && (
            <div>
              <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Passport No.</div>
              <div style={{ fontSize: "8pt", fontWeight: 900, color: DARK, letterSpacing: "0.8px", lineHeight: 1.15 }}>{p.passportNumber}</div>
            </div>
          )}

          {/* Mobile India */}
          {p.mobileIndia && (
            <div>
              <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Mobile (India)</div>
              <div style={{ fontSize: "7.5pt", fontWeight: 900, color: DARK, lineHeight: 1.15 }}>{p.mobileIndia}</div>
            </div>
          )}

          {/* City / Bus / Room */}
          {(p.city || p.busNumber || p.roomNumber) && (
            <div style={{ display: "flex", gap: "2mm", flexWrap: "wrap" }}>
              {p.city && <div><div style={{ fontSize: "3pt", color: "#999" }}>City</div><div style={{ fontSize: "6pt", fontWeight: 700, color: DARK }}>{p.city}</div></div>}
              {p.busNumber && <div><div style={{ fontSize: "3pt", color: "#999" }}>Bus</div><div style={{ fontSize: "6pt", fontWeight: 700, color: DARK }}>{p.busNumber}</div></div>}
              {p.roomNumber && <div><div style={{ fontSize: "3pt", color: "#999" }}>Room</div><div style={{ fontSize: "6pt", fontWeight: 700, color: DARK }}>{p.roomNumber}</div></div>}
            </div>
          )}

          {/* Maktab / Service center */}
          <div style={{ background: `${GOLD}22`, borderRadius: "2px", padding: "1mm 1.5mm", border: `1px solid ${GOLD}60` }}>
            <div style={{ fontSize: "3pt", color: "#888", textTransform: "uppercase", lineHeight: 1 }}>Service Centre No.</div>
            <div style={{ fontSize: "12pt", fontWeight: 900, color: DARK, lineHeight: 1.1 }}>{group.maktabNumber || "—"}</div>
          </div>

          {/* Company India phones */}
          <div style={{ marginTop: "auto", borderTop: `1px solid ${GOLD}40`, paddingTop: "0.8mm" }}>
            <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", lineHeight: 1 }}>Company (India)</div>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: DARK, lineHeight: 1.4 }}>
              {INDIA_PHONES[0]} &nbsp;|&nbsp; {INDIA_PHONES[1]}
            </div>
          </div>
        </div>
      </div>

      {/* ── Barcode ── */}
      <div style={{ flexShrink: 0, padding: "1mm 2mm 0.5mm", background: "#fff", borderTop: `2px solid ${GOLD}` }}>
        <Barcode value={barcodeVal} format="CODE128" width={1.4} height={14} displayValue fontSize={5} />
      </div>

      {/* ── Footer ── */}
      <div style={{ background: DARK, flexShrink: 0, padding: "1.2mm 2mm" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", lineHeight: 1, marginBottom: "0.4mm" }}>
              {p.salutation ? `${p.salutation} ` : ""}{p.fullName}
            </div>
            <div style={{ fontSize: "5pt", fontWeight: 900, color: "#fff", lineHeight: 1.35, letterSpacing: "0.2px" }}>
              {SHORT_ADDRESS}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "3pt", fontWeight: 700, color: "#f87171", textTransform: "uppercase", lineHeight: 1, marginBottom: "0.4mm" }}>🆘 Emergency (Saudi)</div>
            <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[0]}</div>
            <div style={{ fontSize: "8pt", fontWeight: 900, color: "#fff", lineHeight: 1.25, letterSpacing: "0.5px" }}>{SAUDI_EMERGENCY[1]}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

type PrintMode = "grid9" | "grid8" | "sidebyside" | "duplex" | "strip" | "sheets";

export default function PrintIdCardsPro() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards-pro");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const [bookingMap, setBookingMap] = useState<Record<string, string>>({});
  const [printMode, setPrintMode] = useState<PrintMode>("grid9");
  const [dlState, setDlState] = useState<string | null>(null);
  const [photoDataUrls, setPhotoDataUrls] = useState<Record<string, string>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Inject @page size into <head> — body-level <style> tags are ignored by Safari
  useEffect(() => {
    const id = "pro-id-page-size";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); }
    const landscape = printMode === "grid9" || printMode === "strip" || printMode === "sheets";
    const margins = (printMode === "grid9" || printMode === "grid8") ? "0mm" : "8mm";
    el.textContent = `@media print { @page { size: ${landscape ? "A4 landscape" : "A4 portrait"}; margin: ${margins}; } }`;
    return () => { document.getElementById(id)?.remove(); };
  }, [printMode]);
  // Refs set directly on each page div during render — avoids querySelectorAll timing issues
  const pageElsRef = useRef<HTMLElement[]>([]);
  // Per-pilgrim card element refs for SVG export
  const frontCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const backCardRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Grid9 dedicated print: opens a fresh popup window with guaranteed landscape @page
  const printGrid9 = () => {
    const pages = Array.from(contentRef.current?.querySelectorAll(".grid9-page") ?? []) as HTMLElement[];
    if (pages.length === 0) { alert("Cards not loaded yet — please wait and try again."); return; }

    // Convert canvas elements (QR, barcode) to <img> data URLs so they survive the copy
    const clonePage = (src: HTMLElement) => {
      const clone = src.cloneNode(true) as HTMLElement;
      const srcCanvases = Array.from(src.querySelectorAll("canvas"));
      const cloneCanvases = Array.from(clone.querySelectorAll("canvas"));
      srcCanvases.forEach((canvas, i) => {
        const img = document.createElement("img");
        img.src = (canvas as HTMLCanvasElement).toDataURL("image/png");
        img.style.width = canvas.style.width || canvas.offsetWidth + "px";
        img.style.height = canvas.style.height || canvas.offsetHeight + "px";
        img.style.display = "block";
        cloneCanvases[i]?.parentNode?.replaceChild(img, cloneCanvases[i]);
      });
      return clone.outerHTML;
    };

    const pagesHtml = pages.map(clonePage).join("\n");
    const win = window.open("", "_blank", "width=1,height=1");
    if (!win) { alert("Popup blocked — please allow popups for this site and try again."); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { margin: 0; padding: 0; background: white; width: 297mm; }
  .no-print { display: none !important; }
  .pro-card {
    width: 99mm; height: 70mm; border: none;
    overflow: hidden; font-family: Arial, sans-serif; background: #fff;
    display: flex; flex-direction: column; flex-shrink: 0;
  }
  .grid9-page {
    width: 297mm; height: 210mm; display: flex; align-items: center;
    justify-content: center; page-break-after: always; break-after: page;
    page-break-inside: avoid; break-inside: avoid; overflow: hidden;
  }
  .grid9-page:last-child { page-break-after: auto; break-after: auto; }
  .grid9-grid {
    display: grid; grid-template-columns: repeat(3, 99mm);
    grid-template-rows: repeat(3, 70mm); gap: 0;
    width: 297mm; height: 210mm; flex-shrink: 0;
  }
  .grid9-cell {
    width: 99mm; height: 70mm; position: relative;
    border: 0.4pt dashed #999; box-sizing: border-box;
    overflow: hidden;
  }
  .cut-corner { position: absolute; width: 4mm; height: 4mm; z-index: 10; }
  .cut-corner.tl { top:0; left:0; border-top:1pt solid #333; border-left:1pt solid #333; }
  .cut-corner.tr { top:0; right:0; border-top:1pt solid #333; border-right:1pt solid #333; }
  .cut-corner.bl { bottom:0; left:0; border-bottom:1pt solid #333; border-left:1pt solid #333; }
  .cut-corner.br { bottom:0; right:0; border-bottom:1pt solid #333; border-right:1pt solid #333; }
</style></head><body>${pagesHtml}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  // Grid8 dedicated print: opens popup with A4 portrait @page, 8 cards (2×4, 100×68mm)
  const printGrid8 = () => {
    const pages = Array.from(contentRef.current?.querySelectorAll(".grid8-page") ?? []) as HTMLElement[];
    if (pages.length === 0) { alert("Cards not loaded yet — please wait and try again."); return; }

    const clonePage = (src: HTMLElement) => {
      const clone = src.cloneNode(true) as HTMLElement;
      const srcCanvases = Array.from(src.querySelectorAll("canvas"));
      const cloneCanvases = Array.from(clone.querySelectorAll("canvas"));
      srcCanvases.forEach((canvas, i) => {
        const img = document.createElement("img");
        img.src = (canvas as HTMLCanvasElement).toDataURL("image/png");
        img.style.width = canvas.style.width || canvas.offsetWidth + "px";
        img.style.height = canvas.style.height || canvas.offsetHeight + "px";
        img.style.display = "block";
        cloneCanvases[i]?.parentNode?.replaceChild(img, cloneCanvases[i]);
      });
      return clone.outerHTML;
    };

    const pagesHtml = pages.map(clonePage).join("\n");
    const win = window.open("", "_blank", "width=1,height=1");
    if (!win) { alert("Popup blocked — please allow popups for this site and try again."); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { margin: 0; padding: 0; background: white; width: 210mm; }
  .pro-card {
    width: 100mm; height: 68mm; border: none;
    overflow: hidden; font-family: Arial, sans-serif; background: #fff;
    display: flex; flex-direction: column; flex-shrink: 0;
  }
  .grid8-page {
    width: 210mm; height: 297mm; display: flex; align-items: center;
    justify-content: center; page-break-after: always; break-after: page;
    page-break-inside: avoid; break-inside: avoid; overflow: hidden;
  }
  .grid8-page:last-child { page-break-after: auto; break-after: auto; }
  .grid8-grid {
    display: grid;
    grid-template-columns: repeat(2, 100mm);
    grid-template-rows: repeat(4, 68mm);
    gap: 0; width: 200mm; height: 272mm; flex-shrink: 0;
  }
  .grid8-cell {
    width: 100mm; height: 68mm; position: relative;
    border: 0.4pt dashed #999; box-sizing: border-box;
  }
  .cut-corner { position: absolute; width: 3mm; height: 3mm; }
  .cut-corner.tl { top: -1px; left: -1px; border-top: 1pt solid #333; border-left: 1pt solid #333; }
  .cut-corner.tr { top: -1px; right: -1px; border-top: 1pt solid #333; border-right: 1pt solid #333; }
  .cut-corner.bl { bottom: -1px; left: -1px; border-bottom: 1pt solid #333; border-left: 1pt solid #333; }
  .cut-corner.br { bottom: -1px; right: -1px; border-bottom: 1pt solid #333; border-right: 1pt solid #333; }
  @media print { .no-print { display: none !important; } }
</style></head><body>${pagesHtml}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  const dlCards = async (fmt: "pdf" | "jpg" | "png") => {
    const pageEls = pageElsRef.current.filter(Boolean);
    setDlState(fmt);
    try {
      const name = `id-cards-pro-${group?.groupName || "group"}`;
      const els = pageEls.length > 0 ? pageEls : (contentRef.current ? [contentRef.current] : []);
      if (els.length === 0) return;
      if (fmt === "pdf") await downloadMultiPagePdf(els, name);
      else if (fmt === "png") await downloadPagesAsPng(els, name);
      else await downloadPagesAsJpg(els, name);
    } finally { setDlState(null); }
  };

  const dlPilgrimSvg = async (p: Pilgrim) => {
    const frontEl = frontCardRefs.current.get(p.id);
    const backEl = backCardRefs.current.get(p.id);
    const safeName = p.fullName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    if (frontEl) await downloadElementAsSvg(frontEl, `id-card-front-${safeName}.svg`);
    await new Promise(r => setTimeout(r, 300));
    if (backEl) await downloadElementAsSvg(backEl, `id-card-back-${safeName}.svg`);
  };

  const dlAllSvg = async () => {
    setDlState("svg");
    try {
      for (const p of pilgrims) {
        await dlPilgrimSvg(p);
        await new Promise(r => setTimeout(r, 400));
      }
    } finally { setDlState(null); }
  };

  const dlPilgrimPng = async (p: Pilgrim) => {
    const frontEl = frontCardRefs.current.get(p.id);
    const backEl  = backCardRefs.current.get(p.id);
    const safeName = p.fullName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    if (frontEl) await downloadAsPng(frontEl, `id-card-front-${safeName}.png`);
    await new Promise(r => setTimeout(r, 300));
    if (backEl)  await downloadAsPng(backEl,  `id-card-back-${safeName}.png`);
  };

  const dlAllPng = async () => {
    setDlState("png-singles");
    try {
      for (const p of pilgrims) {
        await dlPilgrimPng(p);
        await new Promise(r => setTimeout(r, 400));
      }
    } finally { setDlState(null); }
  };

  const dlPilgrimBoth = async (p: Pilgrim) => {
    const frontEl = frontCardRefs.current.get(p.id);
    const backEl  = backCardRefs.current.get(p.id);
    if (!frontEl && !backEl) return;
    const safeName = p.fullName.replace(/[^a-z0-9]/gi, "-").toLowerCase();

    // Build a temporary off-screen container with front stacked above back
    const wrap = document.createElement("div");
    wrap.style.cssText = [
      "position:fixed",
      "top:-99999px",
      "left:-99999px",
      "width:101.6mm",
      "background:#ffffff",
      "display:flex",
      "flex-direction:column",
      "gap:0",
    ].join(";");

    if (frontEl) wrap.appendChild(frontEl.cloneNode(true) as HTMLElement);
    if (backEl)  wrap.appendChild(backEl.cloneNode(true)  as HTMLElement);

    document.body.appendChild(wrap);
    await new Promise(r => setTimeout(r, 120));
    try {
      await downloadAsPng(wrap, `id-card-${safeName}.png`);
    } finally {
      document.body.removeChild(wrap);
    }
  };

  const dlAllBoth = async () => {
    setDlState("png-both");
    try {
      for (const p of pilgrims) {
        await dlPilgrimBoth(p);
        await new Promise(r => setTimeout(r, 400));
      }
    } finally { setDlState(null); }
  };

  const dlFrontSheet = async () => {
    setDlState("front-sheet");
    try {
      const els = pilgrims.map(p => frontCardRefs.current.get(p.id)).filter(Boolean) as HTMLElement[];
      const name = `id-cards-fronts-${group?.groupName || "group"}.png`;
      await downloadCardsAsSheet(els, name, 2);
    } finally { setDlState(null); }
  };

  const dlBackSheet = async () => {
    setDlState("back-sheet");
    try {
      const els = pilgrims.map(p => backCardRefs.current.get(p.id)).filter(Boolean) as HTMLElement[];
      const name = `id-cards-backs-${group?.groupName || "group"}.png`;
      await downloadCardsAsSheet(els, name, 2);
    } finally { setDlState(null); }
  };

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/feedback/admin/group-bookings/${groupId}`, { credentials: "include" }).then(r => r.ok ? r.json() : {}),
    ]).then(async ([g, p, bm]) => {
      setGroup(g);
      const list: Pilgrim[] = Array.isArray(p) ? p : [];
      setPilgrims(list);
      setBookingMap(bm || {});
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

  // Side-by-side: 4 pairs per A4 portrait page
  // Strip: 3 pilgrims per A4 landscape page (fronts top, backs bottom)
  // Duplex: 1 card per page, front then back (2 pages per person)
  const PAIRS_PER_PAGE = 4;
  const STRIP_PER_PAGE = 3;
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += PAIRS_PER_PAGE)
    pages.push(pilgrims.slice(i, i + PAIRS_PER_PAGE));
  const stripPages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += STRIP_PER_PAGE)
    stripPages.push(pilgrims.slice(i, i + STRIP_PER_PAGE));

  const isSBS    = printMode === "sidebyside";
  const isStrip  = printMode === "strip";
  const isSheets = printMode === "sheets";
  const isGrid9  = printMode === "grid9";
  const isGrid8  = printMode === "grid8";

  // Grid8: 8 fronts per A4 portrait page (2×4, 100×68mm)
  const GRID8_PER_PAGE = 8;
  const grid8Pages: (Pilgrim | null)[][] = [];
  for (let i = 0; i < pilgrims.length; i += GRID8_PER_PAGE) {
    const chunk: (Pilgrim | null)[] = pilgrims.slice(i, i + GRID8_PER_PAGE);
    while (chunk.length < GRID8_PER_PAGE) chunk.push(null);
    grid8Pages.push(chunk);
  }

  // Grid9: 4 fronts per A4 landscape page (2×2)
  const GRID9_PER_PAGE = 9;
  const grid9Pages: (Pilgrim | null)[][] = [];
  for (let i = 0; i < pilgrims.length; i += GRID9_PER_PAGE) {
    const chunk: (Pilgrim | null)[] = pilgrims.slice(i, i + GRID9_PER_PAGE);
    while (chunk.length < GRID9_PER_PAGE) chunk.push(null);
    grid9Pages.push(chunk);
  }

  // Sheets: chunks of 3 per row for the grid pages
  const SHEETS_PER_ROW = 3;
  const sheetsRows: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += SHEETS_PER_ROW)
    sheetsRows.push(pilgrims.slice(i, i + SHEETS_PER_ROW));

  // Reset on every render so stale elements from previous data don't linger
  pageElsRef.current = [];

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
          .id-print-page { box-shadow: none !important; margin-bottom: 0 !important; }
          /* Zero out outer wrapper padding so all 4 rows land on one page */
          .id-print-content { padding: 0 !important; gap: 0 !important; background: white !important; }
        }
        * { box-sizing: border-box; }

        .pro-card {
          width: 99mm;
          height: 70mm;
          border: 1px solid #ccc;
          border-radius: 3px;
          overflow: hidden;
          font-family: Arial, sans-serif;
          background: #fff;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* ── Side-by-side page: 4 rows, each row = front | cut | back ── */
        /* 4 × 55mm + 3 × 3mm gap = 229mm — well within A4's 281mm usable height */
        .id-print-page {
          width: 190mm;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 3mm;
          page-break-after: always;
          break-after: page;
        }
        .id-print-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        /* One row = front card + cut line + back card */
        .card-pair-row {
          display: flex;
          align-items: center;
          gap: 0;
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* Dashed cut line between front and back */
        .cut-line {
          width: 8mm;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        .cut-line-inner {
          width: 1px;
          height: 70mm;
          border-left: 1px dashed #333;
          position: relative;
        }
        .cut-scissors-v {
          position: absolute;
          font-size: 9px;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(90deg);
          background: #fff;
          padding: 1px 2px;
          color: #444;
          line-height: 1;
          pointer-events: none;
        }
        /* Vertical cut lines between cards in strip/sheets */
        .v-cut-line {
          width: 5mm;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          height: 70mm;
        }
        .v-cut-line-inner {
          height: 100%;
          border-left: 1px dashed #333;
          position: relative;
        }
        .v-cut-scissors {
          position: absolute;
          font-size: 8px;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(90deg);
          background: #fff;
          padding: 1px;
          color: #555;
          line-height: 1;
          pointer-events: none;
        }

        /* Single-card pages for duplex mode */
        .duplex-page {
          width: 99mm;
          margin: 0 auto;
          page-break-after: always;
          break-after: page;
        }
        .duplex-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        /* ── Strip page: 3 per row, fronts top, backs bottom (A4 landscape) ── */
        /* 3 × 76.2mm + 2 × 5mm gaps = 238.6mm — fits A4 landscape usable 281mm */
        .strip-page {
          width: 238.6mm;
          margin: 0 auto;
          page-break-after: always;
          break-after: page;
        }
        .strip-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        .strip-row {
          display: flex;
          flex-direction: row;
          justify-content: center;
          gap: 5mm;
        }
        .h-cut-line {
          width: 100%;
          margin: 4mm 0;
          border-top: 1px dashed #333;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }
        .h-cut-label {
          position: absolute;
          background: #f5f5f0;
          padding: 0 8px;
          font-size: 8px;
          color: #666;
          font-style: italic;
          white-space: nowrap;
          left: 8mm;
        }
        .h-cut-scissors {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          font-size: 10px;
          background: #f5f5f0;
          padding: 0 2px;
          color: #333;
          line-height: 1;
        }

        /* ── Sheets page: all fronts on p1, all backs on p2 (A4 landscape) ── */
        .sheets-page {
          width: 280mm;
          margin: 0 auto;
          page-break-after: always;
          break-after: page;
        }
        .sheets-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        .sheets-grid {
          display: flex;
          flex-direction: column;
          gap: 4mm;
        }
        .sheets-row {
          display: flex;
          flex-direction: row;
          justify-content: flex-start;
          gap: 5mm;
        }
        .sheets-header {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          margin-bottom: 3mm;
          border-radius: 4px;
        }

        /* ── Grid8: 8 landscape cards per A4 portrait page (2×4, 100×68mm) with cut guides ── */
        .grid8-page {
          width: 210mm; height: 297mm; display: flex; align-items: center;
          justify-content: center; page-break-after: always; break-after: page;
          page-break-inside: avoid; break-inside: avoid; overflow: hidden;
          background: white;
        }
        .grid8-page:last-child { page-break-after: auto; break-after: auto; }
        .grid8-grid {
          display: grid;
          grid-template-columns: repeat(2, 100mm);
          grid-template-rows: repeat(4, 68mm);
          gap: 0; width: 200mm; height: 272mm; flex-shrink: 0;
        }
        .grid8-cell {
          width: 100mm; height: 68mm; position: relative;
          border: 0.4pt dashed #aaa; box-sizing: border-box;
        }
        .grid8-cell .pro-card { width: 100mm !important; height: 68mm !important; border: none !important; }
        .cut-corner { position: absolute; width: 3mm; height: 3mm; z-index: 2; }
        .cut-corner.tl { top: -1px; left: -1px; border-top: 0.8pt solid #555; border-left: 0.8pt solid #555; }
        .cut-corner.tr { top: -1px; right: -1px; border-top: 0.8pt solid #555; border-right: 0.8pt solid #555; }
        .cut-corner.bl { bottom: -1px; left: -1px; border-bottom: 0.8pt solid #555; border-left: 0.8pt solid #555; }
        .cut-corner.br { bottom: -1px; right: -1px; border-bottom: 0.8pt solid #555; border-right: 0.8pt solid #555; }
        @media print {
          .grid8-page { box-shadow: none !important; }
        }

        /* ── Grid4: 4 landscape cards (4"×3") per A4 landscape page (2×2, 101.6×76.2mm) ── */
        /* Each page-div is the full A4 landscape size: 297×210mm                           */
        /* This forces the browser to start a new print page after each one                  */
        .grid9-page {
          width: 297mm;
          height: 210mm;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .grid9-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        .grid9-grid {
          display: grid;
          grid-template-columns: repeat(3, 99mm);
          grid-template-rows: repeat(3, 70mm);
          gap: 0;
          width: 297mm;
          height: 210mm;
          flex-shrink: 0;
        }
        .grid9-cell {
          width: 99mm; height: 70mm; position: relative;
          border: 0.4pt dashed #aaa; box-sizing: border-box;
        }
        .grid9-cell .pro-card { width: 99mm !important; height: 70mm !important; border: none !important; }

        @media print {
          .strip-page    { box-shadow: none !important; }
          .sheets-page   { box-shadow: none !important; }
          .grid9-page    { box-shadow: none !important; margin: 0 !important; }
          .h-cut-label   { background: white !important; }
          .h-cut-scissors{ background: white !important; }
          .sheets-header { display: none !important; }
          .cut-line      { display: flex !important; }
          .v-cut-line    { display: flex !important; }
          .cut-btn       { display: none !important; }
        }

        @media screen {
          .id-print-page {
            background: white;
            padding: 8mm;
            box-shadow: 0 2px 16px rgba(0,0,0,0.12);
            border-radius: 4px;
          }
          .duplex-page {
            background: white;
            padding: 8mm;
            box-shadow: 0 2px 16px rgba(0,0,0,0.12);
            border-radius: 4px;
          }
          .strip-page {
            background: white;
            padding: 8mm;
            box-shadow: 0 2px 16px rgba(0,0,0,0.12);
            border-radius: 4px;
          }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print" style={{
        padding: "14px 20px", background: "#fef3c7",
        display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
        borderBottom: "2px solid #d1d5db",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "15px", color: DARK }}>ID Card Print</div>
          <div style={{ fontSize: "12px", color: "#555" }}>
            {isGrid8  ? "Grid 8 · 8 cards per A4 portrait · 100×68mm · 2 cols × 4 rows · dashed cut guides"
             : isGrid9  ? "Grid 9 · 9 cards per A4 landscape · 99×70mm · 3 cols × 3 rows · dashed cut guides"
             : isSheets ? "Sheets · All fronts = Page 1 · All backs = Page 2 · A4 landscape"
             : isStrip ? "Strip 3 · 3 fronts on top · 3 backs on bottom · A4 landscape"
             : isSBS   ? "Side-by-side · Front | Back on same sheet · Cut & stack"
             :           "Duplex mode · Front on page N, Back on page N+1"}
          </div>
        </div>
        {/* Mode toggle */}
        <div style={{ display: "flex", gap: "4px", background: "#e5e7eb", borderRadius: "8px", padding: "3px" }}>
          {(["grid8", "grid9", "sheets", "strip", "sidebyside", "duplex"] as PrintMode[]).map(m => (
            <button key={m} onClick={() => setPrintMode(m)} style={{
              padding: "6px 12px", border: "none", borderRadius: "6px", cursor: "pointer",
              fontSize: "12px", fontWeight: 700,
              background: printMode === m ? DARK : "transparent",
              color: printMode === m ? "#fff" : "#374151",
            }}>
              {m === "grid8" ? "✂ Grid 8" : m === "grid9" ? "✂ Grid 9" : m === "sheets" ? "Sheets" : m === "strip" ? "Strip 3" : m === "sidebyside" ? "Side-by-Side" : "Duplex"}
            </button>
          ))}
        </div>

        <select value={companyId} onChange={e => setCompanyId(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>

        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px", fontWeight: 500, userSelect: "none" }}>
          <input type="checkbox" checked={showFeedbackQr} onChange={e => setShowFeedbackQr(e.target.checked)} style={{ width: "15px", height: "15px" }} />
          Feedback QR
        </label>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={() => isGrid8 ? printGrid8() : isGrid9 ? printGrid9() : window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}>
            🖨 Print {isGrid8 ? "(Grid 8 · A4 Portrait)" : isGrid9 ? "(Grid 9 · A4 Landscape)" : ""}
          </button>
          <button onClick={() => dlCards("pdf")} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "pdf" ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "pdf" ? "⏳..." : "⬇ PDF"}
          </button>
          <button onClick={() => dlCards("png")} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "png" ? "#6b7280" : "#059669", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "png" ? "⏳..." : "⬇ PNG"}
          </button>
          <button onClick={() => dlCards("jpg")} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "jpg" ? "#6b7280" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "jpg" ? "⏳..." : "⬇ JPG"}
          </button>
          <button onClick={dlAllBoth} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "png-both" ? "#6b7280" : "#be185d", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "png-both" ? "⏳ PNG..." : "⬇ PNG Per Person"}
          </button>
          <button onClick={dlFrontSheet} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "front-sheet" ? "#6b7280" : "#0e7490", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "front-sheet" ? "⏳ Fronts..." : "⬇ All Fronts PNG"}
          </button>
          <button onClick={dlBackSheet} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "back-sheet" ? "#6b7280" : "#0d5040", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "back-sheet" ? "⏳ Backs..." : "⬇ All Backs PNG"}
          </button>
          <button onClick={dlAllPng} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "png-singles" ? "#6b7280" : "#475569", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "12px" }}>
            {dlState === "png-singles" ? "⏳ PNG..." : "⬇ PNG (individual)"}
          </button>
          <button onClick={dlAllSvg} disabled={!!dlState} style={{ padding: "10px 18px", background: dlState === "svg" ? "#6b7280" : "#b45309", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
            {dlState === "svg" ? "⏳ SVG..." : "⬇ SVG"}
          </button>
          <button onClick={() => window.history.back()} style={{ padding: "10px 18px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff", fontSize: "13px" }}>← Back</button>
        </div>
      </div>

      {/* ── Instruction bar ── */}
      <div className="no-print" style={{
        padding: "10px 20px", fontSize: "13px", fontWeight: 600,
        background: isGrid8 ? "#fdf4ff" : isGrid9 ? "#f0fdf4" : isSheets ? "#f0f9ff" : isStrip ? "#fefce8" : isSBS ? "#f0fdf4" : "#eff6ff",
        borderBottom: `2px solid ${isGrid8 ? "#e879f9" : isGrid9 ? "#86efac" : isSheets ? "#7dd3fc" : isStrip ? "#fde047" : isSBS ? "#86efac" : "#93c5fd"}`,
        color: isGrid8 ? "#701a75" : isGrid9 ? "#14532d" : isSheets ? "#0c4a6e" : isStrip ? "#854d0e" : isSBS ? "#15803d" : "#1d4ed8",
        display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center",
      }}>
        {isGrid8 ? (
          <>
            <span>✅ 8 FRONT cards per A4 portrait · 100×68mm · 2 cols × 4 rows · dashed cut lines printed on sheet</span>
            <span>🖨 Printer → A4 Portrait · One-sided · Scale 100% · Margins None · Print Backgrounds ON → ✂ Cut along dashed lines → Laminate</span>
          </>
        ) : isGrid9 ? (
          <>
            <span>✅ 9 FRONT cards per A4 landscape · 99×70mm · 3 cols × 3 rows · dashed cut lines on sheet</span>
            <span>🖨 Printer → A4 Landscape · One-sided · Scale 100% · Margins None · Print Backgrounds ON → ✂ Cut along dashed lines → Laminate</span>
          </>
        ) : isSheets ? (
          <>
            <span>✅ Page 1 = ALL front cards · Page 2 = ALL back cards (same order)</span>
            <span>🖨 Print both pages → ✂ Cut each page into individual cards → Pair front + back → Laminate</span>
            <span>💡 For duplex: print page 1 → re-feed → print page 2 (flip on short edge)</span>
          </>
        ) : isStrip ? (
          <>
            <span>✅ Each A4 page = {STRIP_PER_PAGE} pilgrims (front cards on top, back cards on bottom)</span>
            <span>🖨 Print → ✂ Cut along the dashed line → Stack back strip below front strip and cut vertically for individual paired cards → Laminate</span>
          </>
        ) : isSBS ? (
          <>
            <span>✅ Each row = one person's FRONT card + BACK card side by side</span>
            <span>✂ Cut along the dashed line · Stack front &amp; back together · Laminate</span>
            <span>📄 No duplex setting needed — works on any printer</span>
          </>
        ) : (
          <>
            <span>✅ Each person: Page 1 = FRONT · Page 2 = BACK (consecutive pages)</span>
            <span>🖨 In print dialog: enable <strong>Two-sided</strong> → <strong>Flip on short edge</strong></span>
            <span>⚠ Mohammed Altaf front (page 1) + Mohammed Altaf back (page 2) = Sheet 1</span>
          </>
        )}
      </div>

      {/* ── Content ── */}
      <div ref={contentRef} className="id-print-content" style={{ background: "#f5f5f0", padding: "8mm", display: "flex", flexDirection: "column", gap: "8mm" }}>

        {isGrid8 ? (
          /* ── GRID8 MODE: 8 front cards per A4 portrait page (2×4, 100×68mm) with cut guides ── */
          grid8Pages.map((cells, pi) => (
            <div key={pi}>
              <div className="no-print" style={{ fontSize: "11px", color: "#701a75", fontWeight: 700, marginBottom: "3mm" }}>
                ✂ Sheet {pi + 1} of {grid8Pages.length} — 8 FRONT cards (100mm × 68mm) · A4 Portrait · cut along dashed lines
              </div>
              <div className="grid8-page" ref={el => { if (el) pageElsRef.current[pi] = el as HTMLElement; }}>
                <div className="grid8-grid">
                  {cells.map((p, i) => (
                    <div key={i} className="grid8-cell">
                      <span className="cut-corner tl" />
                      <span className="cut-corner tr" />
                      <span className="cut-corner bl" />
                      <span className="cut-corner br" />
                      {p ? (
                        <div ref={el => { if (el) frontCardRefs.current.set(p.id, el as HTMLElement); }}>
                          <FrontCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                        </div>
                      ) : (
                        <div className="pro-card" style={{ background: "#f9fafb" }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        ) : isGrid9 ? (
          /* ── GRID9 MODE: 9 front cards per A4 landscape page (3×3, 99×70mm) with cut guides ── */
          grid9Pages.map((cells, pi) => (
            <div key={pi}>
              <div className="no-print" style={{ fontSize: "11px", color: "#14532d", fontWeight: 700, marginBottom: "3mm" }}>
                ✂ Sheet {pi + 1} of {grid9Pages.length} — 9 FRONT cards (99mm × 70mm) · A4 Landscape · cut along dashed lines
              </div>
              <div className="grid9-page" ref={el => { if (el) pageElsRef.current[pi] = el as HTMLElement; }}>
                <div className="grid9-grid">
                  {cells.map((p, i) => (
                    <div key={i} className="grid9-cell">
                      <span className="cut-corner tl" />
                      <span className="cut-corner tr" />
                      <span className="cut-corner bl" />
                      <span className="cut-corner br" />
                      {p ? (
                        <div ref={el => { if (el) frontCardRefs.current.set(p.id, el as HTMLElement); }}>
                          <FrontCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                        </div>
                      ) : (
                        <div className="pro-card" style={{ background: "#f9fafb" }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        ) : isSheets ? (
          /* ── SHEETS MODE: All fronts = Page 1, All backs = Page 2, A4 landscape ── */
          <>
            {/* Page 1: All fronts */}
            <div>
              <div className="no-print" style={{ fontSize: "11px", color: "#1d4ed8", fontWeight: 700, marginBottom: "3mm" }}>
                📄 PAGE 1 — FRONT SIDE (all {pilgrims.length} pilgrims)
              </div>
              <div className="sheets-page" ref={el => { if (el) pageElsRef.current[0] = el as HTMLElement; }}>
                <div className="sheets-header no-print" style={{ background: "#dbeafe", color: "#1e40af" }}>
                  ▼ FRONT SIDE — {pilgrims.length} cards
                </div>
                <div className="sheets-grid">
                  {sheetsRows.map((row, ri) => (
                    <div key={ri}>
                      {ri > 0 && <div className="h-cut-line" style={{ margin:"3mm 0" }}><span className="h-cut-scissors">✂</span></div>}
                      <div className="sheets-row" style={{ gap: 0 }}>
                        {row.map((p, ci) => (
                          <div key={p.id} style={{ display:"flex", alignItems:"center" }}>
                            {ci > 0 && (
                              <div className="v-cut-line">
                                <div className="v-cut-line-inner" />
                                <span className="v-cut-scissors">✂</span>
                              </div>
                            )}
                            <CropMarkCard>
                              <div ref={el => { if (el) frontCardRefs.current.set(p.id, el as HTMLElement); }}>
                                <FrontCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                              </div>
                            </CropMarkCard>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Page 2: All backs */}
            <div>
              <div className="no-print" style={{ fontSize: "11px", color: "#c2410c", fontWeight: 700, marginBottom: "3mm" }}>
                📄 PAGE 2 — BACK SIDE (same order)
              </div>
              <div className="sheets-page" ref={el => { if (el) pageElsRef.current[1] = el as HTMLElement; }}>
                <div className="sheets-header no-print" style={{ background: "#fee2e2", color: "#991b1b" }}>
                  ▲ BACK SIDE — {pilgrims.length} cards (same left-to-right order)
                </div>
                <div className="sheets-grid">
                  {sheetsRows.map((row, ri) => (
                    <div key={ri}>
                      {ri > 0 && <div className="h-cut-line" style={{ margin:"3mm 0" }}><span className="h-cut-scissors">✂</span></div>}
                      <div className="sheets-row" style={{ gap: 0 }}>
                        {row.map((p, ci) => (
                          <div key={p.id} style={{ display:"flex", alignItems:"center" }}>
                            {ci > 0 && (
                              <div className="v-cut-line">
                                <div className="v-cut-line-inner" />
                                <span className="v-cut-scissors">✂</span>
                              </div>
                            )}
                            <CropMarkCard>
                              <div ref={el => { if (el) backCardRefs.current.set(p.id, el as HTMLElement); }}>
                                <BackCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                              </div>
                            </CropMarkCard>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : isStrip ? (
          /* ── STRIP MODE: 3 fronts on top, cut line, 3 backs on bottom, A4 landscape ── */
          stripPages.map((pagePilgrims, pi) => (
            <div key={pi}>
              <div className="no-print" style={{ fontSize: "11px", color: "#999", marginBottom: "3mm", fontStyle: "italic" }}>
                ▼ FRONT SIDE — {pagePilgrims.map(p => p.fullName.split(" ")[0]).join(", ")}
              </div>
              <div className="strip-page" ref={el => { if (el) pageElsRef.current[pi] = el as HTMLElement; }}>
                {/* Front strip */}
                <div className="strip-row" style={{ gap: 0 }}>
                  {pagePilgrims.map((p, ci) => (
                    <div key={p.id} style={{ display:"flex", alignItems:"center" }}>
                      {ci > 0 && (
                        <div className="v-cut-line">
                          <div className="v-cut-line-inner" />
                          <span className="v-cut-scissors">✂</span>
                        </div>
                      )}
                      <CropMarkCard>
                        <div ref={el => { if (el) frontCardRefs.current.set(p.id, el as HTMLElement); }}>
                          <FrontCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                        </div>
                      </CropMarkCard>
                    </div>
                  ))}
                </div>

                {/* Horizontal cut line */}
                <div className="h-cut-line">
                  <span className="h-cut-scissors">✂</span>
                  <span className="h-cut-label no-print">
                    Cut here — stack back strip below front strip, then cut vertically for paired cards
                  </span>
                </div>

                {/* Back strip */}
                <div className="no-print" style={{ fontSize: "11px", color: "#c2410c", marginBottom: "2mm", fontStyle: "italic", fontWeight: 700 }}>
                  ▲ BACK SIDE — SAME {pagePilgrims.length} PILGRIMS (SAME LEFT-TO-RIGHT ORDER)
                </div>
                <div className="strip-row" style={{ gap: 0 }}>
                  {pagePilgrims.map((p, ci) => (
                    <div key={p.id} style={{ display:"flex", alignItems:"center" }}>
                      {ci > 0 && (
                        <div className="v-cut-line">
                          <div className="v-cut-line-inner" />
                          <span className="v-cut-scissors">✂</span>
                        </div>
                      )}
                      <CropMarkCard>
                        <div ref={el => { if (el) backCardRefs.current.set(p.id, el as HTMLElement); }}>
                          <BackCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                        </div>
                      </CropMarkCard>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        ) : isSBS ? (
          /* ── SIDE-BY-SIDE MODE: 4 rows per A4 ── */
          pages.map((pagePilgrims, pi) => (
            <div key={pi}>
              <div className="no-print" style={{ fontSize: "11px", color: "#999", marginBottom: "3mm", fontStyle: "italic" }}>
                Page {pi + 1} · {pagePilgrims.length} cards (Front | Back side by side) · Cut dashed line after printing
              </div>
              <div className="id-print-page" ref={el => { if (el) pageElsRef.current[pi] = el as HTMLElement; }}>
                {pagePilgrims.map(p => (
                  <div key={p.id} className="card-pair-row">
                    {/* FRONT */}
                    <CropMarkCard>
                      <div ref={el => { if (el) frontCardRefs.current.set(p.id, el as HTMLElement); }}>
                        <FrontCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                      </div>
                    </CropMarkCard>
                    {/* Cut line — visible on screen AND print */}
                    <div className="cut-line">
                      <div className="cut-line-inner" />
                      <span className="cut-scissors-v">✂</span>
                      {/* Action buttons — screen only */}
                      <a className="cut-btn"
                        href={`${BASE}admin/groups/${groupId}/print/card-front/${p.id}`}
                        target="_blank" rel="noopener noreferrer"
                        title="Open single-card print page"
                        style={{
                          position:"absolute", top:"50%", left:"50%",
                          transform:"translate(-50%,-80%)",
                          background:DARK, color:"#fff", border:"none",
                          borderRadius:"4px", padding:"3px 5px", fontSize:"7px",
                          cursor:"pointer", fontWeight:700, whiteSpace:"nowrap",
                          writingMode:"vertical-rl", textDecoration:"none", display:"block",
                        }}
                      >🖨</a>
                      <button className="cut-btn"
                        onClick={() => dlPilgrimPng(p)}
                        title="Download PNG"
                        style={{
                          position:"absolute", top:"50%", left:"50%",
                          transform:"translate(-50%,-10%)",
                          background:"#0e7490", color:"#fff", border:"none",
                          borderRadius:"4px", padding:"3px 5px", fontSize:"8px",
                          cursor:"pointer", fontWeight:700, whiteSpace:"nowrap",
                          writingMode:"vertical-rl",
                        }}
                      >PNG</button>
                      <button className="cut-btn"
                        onClick={() => dlPilgrimSvg(p)}
                        title="Download SVG"
                        style={{
                          position:"absolute", top:"50%", left:"50%",
                          transform:"translate(-50%,20%)",
                          background:"#b45309", color:"#fff", border:"none",
                          borderRadius:"4px", padding:"3px 5px", fontSize:"8px",
                          cursor:"pointer", fontWeight:700, whiteSpace:"nowrap",
                          writingMode:"vertical-rl",
                        }}
                      >SVG</button>
                    </div>
                    {/* BACK */}
                    <CropMarkCard>
                      <div ref={el => { if (el) backCardRefs.current.set(p.id, el as HTMLElement); }}>
                        <BackCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                      </div>
                    </CropMarkCard>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          /* ── DUPLEX MODE: front page then back page per person ── */
          pilgrims.map((p, idx) => [
            <div key={`df-${p.id}`}>
              <div className="no-print" style={{ fontSize: "11px", color: "#999", marginBottom: "3mm", fontStyle: "italic", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>{p.fullName} — FRONT (Page {idx * 2 + 1})</span>
                <button onClick={() => dlPilgrimSvg(p)} style={{ background: "#b45309", color: "#fff", border: "none", borderRadius: "4px", padding: "2px 8px", fontSize: "10px", cursor: "pointer", fontWeight: 700 }}>⬇ SVG</button>
              </div>
              <div className="duplex-page" ref={el => { if (el) pageElsRef.current[idx * 2] = el as HTMLElement; }}>
                <div ref={el => { if (el) frontCardRefs.current.set(p.id, el as HTMLElement); }}>
                  <FrontCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                </div>
              </div>
            </div>,
            <div key={`db-${p.id}`}>
              <div className="no-print" style={{ fontSize: "11px", color: "#999", marginBottom: "3mm", fontStyle: "italic" }}>
                {p.fullName} — BACK (Page {idx * 2 + 2})
              </div>
              <div className="duplex-page" ref={el => { if (el) pageElsRef.current[idx * 2 + 1] = el as HTMLElement; }}>
                <div ref={el => { if (el) backCardRefs.current.set(p.id, el as HTMLElement); }}>
                  <BackCard p={p} group={group} company={company} showFeedbackQr={showFeedbackQr} bookingMap={bookingMap} photoDataUrls={photoDataUrls} />
                </div>
              </div>
            </div>,
          ])
        )}
      </div>
    </>
  );
}
