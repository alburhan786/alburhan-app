import { useEffect, useState } from "react";
import { useRoute } from "wouter";

const DARK = "#0d5040";
const GOLD = "#C9A23F";
const BASE = import.meta.env.BASE_URL || "/";
const API_URL = import.meta.env.VITE_API_URL || "";

function apiBase() {
  return BASE.replace(/\/$/, "") + "/api";
}

interface PilgrimData {
  id: string;
  barcodeId?: string;
  fullName: string;
  salutation?: string;
  serialNumber: number;
  passportNumber?: string;
  mobileIndia?: string;
  mobileSaudi?: string;
  photoUrl?: string;
  gender?: string;
  bloodGroup?: string;
  city?: string;
  state?: string;
  roomNumber?: string;
  roomType?: string;
  roomHotel?: string;
  busNumber?: string;
  coverNumber?: string;
  group: {
    id: string;
    groupName: string;
    year: number;
    flightNumber?: string;
    departureDate?: string;
    returnDate?: string;
    maktabNumber?: string;
    hotels?: {
      makkah?: { name?: string; nameAr?: string; address?: string; checkIn?: string; checkOut?: string };
      madinah?: { name?: string; nameAr?: string; address?: string; checkIn?: string; checkOut?: string };
      aziziah?: { name?: string; nameAr?: string; address?: string; checkIn?: string; checkOut?: string };
    };
  } | null;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0", gap: "8px" }}>
      <span style={{ fontSize: "12px", color: "#888", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "#222", textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function ScanPilgrim() {
  const [, params] = useRoute("/scan/:barcodeId");
  const barcodeId = params?.barcodeId || "";
  const [pilgrim, setPilgrim] = useState<PilgrimData | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "invalid">("loading");

  useEffect(() => {
    if (!barcodeId) { setStatus("invalid"); return; }
    fetch(`${apiBase()}/scan/${encodeURIComponent(barcodeId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { setPilgrim(data); setStatus("found"); })
      .catch(() => setStatus("invalid"));
  }, [barcodeId]);

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "Arial, sans-serif" }}>
        <div style={{ textAlign: "center", color: DARK }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</div>
          <div style={{ fontWeight: 600 }}>Scanning barcode...</div>
        </div>
      </div>
    );
  }

  if (status === "invalid" || !pilgrim) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fef2f2", fontFamily: "Arial, sans-serif", padding: "20px" }}>
        <div style={{ textAlign: "center", maxWidth: "340px" }}>
          <div style={{ fontSize: "56px", marginBottom: "12px" }}>❌</div>
          <div style={{ fontSize: "22px", fontWeight: 900, color: "#dc2626", marginBottom: "8px" }}>Invalid Barcode</div>
          <div style={{ fontSize: "14px", color: "#666", marginBottom: "4px" }}>No pilgrim found for:</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#dc2626", fontFamily: "monospace", background: "#fee2e2", borderRadius: "8px", padding: "8px 16px", display: "inline-block" }}>{barcodeId}</div>
          <div style={{ marginTop: "24px", fontSize: "12px", color: "#999" }}>If this is a valid ID card, please contact Al Burhan Tours & Travels.</div>
        </div>
      </div>
    );
  }

  const g = pilgrim.group;
  const serial = String(pilgrim.serialNumber).padStart(3, "0");

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div style={{ background: DARK, padding: "20px 16px 16px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "4px" }}>
          <span style={{ fontSize: "24px" }}>🇮🇳</span>
          <div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: "18px", letterSpacing: "1px" }}>AL BURHAN</div>
            <div style={{ color: GOLD, fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px" }}>TOURS & TRAVELS</div>
          </div>
        </div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", marginTop: "4px" }}>Barcode Scan — Hajj {g?.year || ""}</div>
      </div>

      {/* Verified badge */}
      <div style={{ background: "#16a34a", color: "#fff", textAlign: "center", padding: "8px", fontSize: "13px", fontWeight: 700, letterSpacing: "0.3px" }}>
        ✅ VERIFIED PILGRIM
      </div>

      <div style={{ maxWidth: "420px", margin: "0 auto", padding: "16px" }}>

        {/* Pilgrim card */}
        <div style={{ background: "#fff", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", marginBottom: "12px" }}>
          <div style={{ background: `linear-gradient(135deg, ${DARK}, #1a7a60)`, padding: "20px 20px 16px", display: "flex", alignItems: "center", gap: "16px" }}>
            {pilgrim.photoUrl ? (
              <img src={`${API_URL}${pilgrim.photoUrl}`} alt="" style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover", border: `3px solid ${GOLD}`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", flexShrink: 0 }}>
                {pilgrim.gender === "female" ? "👩" : "👨"}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: GOLD, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {pilgrim.salutation || (pilgrim.gender === "female" ? "Hajjah" : "Haji")}
              </div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: "17px", lineHeight: 1.2, textTransform: "uppercase" }}>
                {pilgrim.fullName}
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", marginTop: "4px" }}>
                Serial #{serial} · {g?.groupName || ""}
              </div>
            </div>
          </div>

          <div style={{ padding: "12px 16px" }}>
            <InfoRow label="Barcode ID" value={pilgrim.barcodeId} />
            <InfoRow label="Passport No." value={pilgrim.passportNumber} />
            <InfoRow label="Blood Group" value={pilgrim.bloodGroup} />
            <InfoRow label="Mobile (India)" value={pilgrim.mobileIndia} />
            <InfoRow label="Mobile (Saudi)" value={pilgrim.mobileSaudi} />
            <InfoRow label="City / State" value={[pilgrim.city, pilgrim.state].filter(Boolean).join(", ")} />
          </div>
        </div>

        {/* Hajj Details */}
        {g && (
          <div style={{ background: "#fff", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: "12px" }}>
            <div style={{ background: `${DARK}12`, padding: "10px 16px", borderBottom: `1px solid ${DARK}20` }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: DARK, textTransform: "uppercase", letterSpacing: "0.5px" }}>Hajj Details</div>
            </div>
            <div style={{ padding: "8px 16px 12px" }}>
              <InfoRow label="Group" value={g.groupName} />
              <InfoRow label="Year" value={String(g.year)} />
              <InfoRow label="Flight" value={g.flightNumber} />
              <InfoRow label="Departure" value={g.departureDate} />
              <InfoRow label="Return" value={g.returnDate} />
              <InfoRow label="Maktab No." value={g.maktabNumber} />
              {pilgrim.busNumber && <InfoRow label="Bus No." value={pilgrim.busNumber} />}
              {pilgrim.roomNumber && <InfoRow label="Room" value={`${pilgrim.roomNumber}${pilgrim.roomHotel ? ` (${pilgrim.roomHotel})` : ""}`} />}
              {pilgrim.coverNumber && <InfoRow label="Cover No." value={pilgrim.coverNumber} />}
            </div>
          </div>
        )}

        {/* Hotels */}
        {g?.hotels && (g.hotels.aziziah?.name || g.hotels.makkah?.name || g.hotels.madinah?.name) && (
          <div style={{ background: "#fff", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", marginBottom: "12px" }}>
            <div style={{ background: `${GOLD}18`, padding: "10px 16px", borderBottom: `1px solid ${GOLD}40` }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.5px" }}>Hotels</div>
            </div>
            <div style={{ padding: "8px 16px 12px" }}>
              {g.hotels.aziziah?.name && <InfoRow label="Makkah (Aziziah)" value={g.hotels.aziziah.name} />}
              {g.hotels.makkah?.name && <InfoRow label="Makkah" value={g.hotels.makkah.name} />}
              {g.hotels.madinah?.name && <InfoRow label="Madinah" value={g.hotels.madinah.name} />}
            </div>
          </div>
        )}

        {/* Contact */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {pilgrim.mobileIndia && (
            <a href={`tel:${pilgrim.mobileIndia}`} style={{ flex: 1, background: DARK, color: "#fff", borderRadius: "12px", padding: "12px", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: "13px" }}>
              📞 Call (India)
            </a>
          )}
          {pilgrim.mobileSaudi && (
            <a href={`tel:${pilgrim.mobileSaudi}`} style={{ flex: 1, background: "#16a34a", color: "#fff", borderRadius: "12px", padding: "12px", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: "13px" }}>
              📞 Call (Saudi)
            </a>
          )}
        </div>

        <div style={{ textAlign: "center", color: "#bbb", fontSize: "11px", marginBottom: "24px" }}>
          Al Burhan Tours & Travels · alburhantravels.online
        </div>
      </div>
    </div>
  );
}
