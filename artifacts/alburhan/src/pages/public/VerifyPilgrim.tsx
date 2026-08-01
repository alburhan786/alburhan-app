import { useEffect, useState } from "react";
import { useRoute } from "wouter";

const DARK = "#0d5040";
const GOLD = "#C9A23F";
const BASE = import.meta.env.BASE_URL || "/";

function apiBase() {
  return BASE.replace(/\/$/, "") + "/api";
}

interface HotelInfo {
  name?: string;
  nameAr?: string;
  address?: string;
  googleMapsLink?: string;
  checkIn?: string;
  checkOut?: string;
}

interface FamilyMember {
  id: string;
  fullName: string;
  salutation?: string | null;
  familyHead?: boolean | null;
  familyRelation?: string | null;
  serialNumber: number;
}

interface FamilyInfo {
  familyId: string;
  memberCount: number;
  headName: string | null;
  members: FamilyMember[];
}

interface PilgrimData {
  id: string;
  fullName: string;
  salutation?: string;
  serialNumber: number;
  passportNumber?: string;
  mobileIndia?: string;
  mobileSaudi?: string;
  photoUrl?: string;
  coverNumber?: string;
  gender?: string;
  bloodGroup?: string;
  city?: string;
  state?: string;
  roomNumber?: string;
  roomType?: string;
  roomHotel?: string;
  familyId?: string | null;
  familyHead?: boolean;
  familyRelation?: string | null;
  family?: FamilyInfo | null;
  group: {
    id: string;
    groupName: string;
    year: number;
    flightNumber?: string;
    departureDate?: string;
    returnDate?: string;
    maktabNumber?: string;
    hotels?: {
      makkah?: HotelInfo;
      madinah?: HotelInfo;
      aziziah?: HotelInfo;
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

function HotelCard({ label, hotel }: { label: string; hotel?: HotelInfo }) {
  if (!hotel?.name) return null;
  return (
    <div style={{ background: "#fefce8", border: `1px solid ${GOLD}40`, borderRadius: "10px", padding: "12px 14px", marginBottom: "8px" }}>
      <div style={{ fontSize: "10px", color: GOLD, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: 700, color: DARK }}>{hotel.name}</div>
      {hotel.nameAr && <div style={{ fontSize: "13px", fontWeight: 600, color: DARK, direction: "rtl", marginTop: "2px" }}>{hotel.nameAr}</div>}
      {hotel.address && <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>{hotel.address}</div>}
      {hotel.checkIn && <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>Check-in: {hotel.checkIn}{hotel.checkOut ? ` · Check-out: ${hotel.checkOut}` : ""}</div>}
      {hotel.googleMapsLink && (
        <a
          href={hotel.googleMapsLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: "6px", fontSize: "11px", color: DARK, fontWeight: 600, textDecoration: "none", background: `${DARK}15`, borderRadius: "6px", padding: "4px 10px" }}
        >
          📍 Open in Maps
        </a>
      )}
    </div>
  );
}

export default function VerifyPilgrim() {
  const [, params] = useRoute("/verify/:id");
  const id = params?.id || "";

  const [data, setData] = useState<PilgrimData | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "error">("loading");

  useEffect(() => {
    if (!id) { setStatus("not_found"); return; }
    fetch(`${apiBase()}/verify/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setStatus("found"); })
      .catch(code => setStatus(code === 404 ? "not_found" : "error"));
  }, [id]);

  const whatsappNumber = "919893989786";
  const callNumber = "+919893225590";

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <div style={{ width: "40px", height: "40px", border: `4px solid ${DARK}20`, borderTop: `4px solid ${DARK}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <div style={{ color: "#888", fontSize: "14px" }}>Verifying pilgrim...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: "#fff", borderRadius: "16px", padding: "40px 24px", textAlign: "center", maxWidth: "360px", width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>❌</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#c0392b", marginBottom: "8px" }}>Invalid QR Code</div>
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "24px" }}>No pilgrim found with this ID. Please contact Al Burhan Tours & Travels.</div>
          <a href={`https://wa.me/${whatsappNumber}`} style={{ display: "block", background: "#25D366", color: "#fff", borderRadius: "10px", padding: "12px", fontWeight: 700, fontSize: "14px", textDecoration: "none" }}>
            Contact on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: "#fff", borderRadius: "16px", padding: "40px 24px", textAlign: "center", maxWidth: "360px", width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>⚠️</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#e67e22", marginBottom: "8px" }}>Server Error</div>
          <div style={{ fontSize: "14px", color: "#888" }}>Please try again later.</div>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const g = data.group;
  const displayName = [data.salutation, data.fullName].filter(Boolean).join(" ");
  const photoSrc = data.photoUrl
    ? data.photoUrl.startsWith("http")
      ? data.photoUrl
      : `${apiBase().replace("/api", "")}${data.photoUrl}`
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0d5040 0%, #1a7a5e 40%, #f5f5f5 60%)", padding: "0 0 40px 0", fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ padding: "24px 20px 60px", textAlign: "center" }}>
        <img src={`${BASE}images/logo.png`} alt="Al Burhan" style={{ height: "52px", objectFit: "contain", marginBottom: "8px" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div style={{ color: "#ffffff90", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase" }}>Al Burhan Tours & Travels</div>
      </div>

      {/* Main Card */}
      <div style={{ margin: "0 16px", background: "#fff", borderRadius: "20px", boxShadow: "0 8px 40px rgba(0,0,0,0.15)", overflow: "hidden", position: "relative", marginTop: "-40px" }}>

        {/* Gold top bar */}
        <div style={{ height: "5px", background: `linear-gradient(90deg, ${GOLD}, #e8c76b, ${GOLD})` }} />

        {/* Pilgrim header section */}
        <div style={{ padding: "24px 20px 16px", borderBottom: `1px solid #f0f0f0` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            {/* Photo */}
            <div style={{ flexShrink: 0 }}>
              {photoSrc ? (
                <img src={photoSrc} alt={data.fullName} style={{ width: "70px", height: "70px", borderRadius: "50%", objectFit: "cover", border: `3px solid ${DARK}` }} />
              ) : (
                <div style={{ width: "70px", height: "70px", borderRadius: "50%", background: `${DARK}15`, border: `3px solid ${DARK}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px" }}>
                  {data.gender?.toLowerCase() === "female" ? "👩" : "👨"}
                </div>
              )}
            </div>
            {/* Name + status */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "11px", color: "#888", marginBottom: "2px" }}>#{String(data.serialNumber).padStart(3, "0")}</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: DARK, lineHeight: 1.2, wordBreak: "break-word" }}>{displayName}</div>
              {g && <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>{g.groupName} · {g.year}</div>}
              {/* Verified badge */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#dcfce7", border: "1.5px solid #16a34a", borderRadius: "20px", padding: "3px 10px", marginTop: "8px" }}>
                <span style={{ fontSize: "11px" }}>✓</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a" }}>VERIFIED</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pilgrim Details */}
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Pilgrim Details</div>
          <InfoRow label="Passport No." value={data.passportNumber} />
          <InfoRow label="Blood Group" value={data.bloodGroup} />
          <InfoRow label="City" value={[data.city, data.state].filter(Boolean).join(", ")} />
          <InfoRow label="Cover No. / Luggage" value={data.coverNumber} />
          <InfoRow label="Maktab No." value={g?.maktabNumber} />
          {data.roomNumber && <InfoRow label="Room No." value={`${data.roomNumber}${data.roomType ? ` (${data.roomType})` : ""}${data.roomHotel ? ` — ${data.roomHotel}` : ""}`} />}
        </div>

        {/* Family Info */}
        {data.family && (
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>👨‍👩‍👧‍👦 Family Group</div>
            <div style={{ background: `${DARK}08`, border: `1px solid ${DARK}20`, borderRadius: "12px", padding: "14px" }}>
              {/* Family ID badge + head */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                <span style={{ background: DARK, color: "#fff", borderRadius: "20px", padding: "3px 12px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px" }}>
                  Family {data.family.familyId}
                </span>
                {data.familyHead && (
                  <span style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}`, color: DARK, borderRadius: "20px", padding: "3px 10px", fontSize: "11px", fontWeight: 700 }}>
                    ⭐ Head
                  </span>
                )}
              </div>
              {data.family.headName && (
                <div style={{ fontSize: "12px", color: "#555", marginBottom: "8px" }}>
                  <span style={{ fontWeight: 600, color: "#333" }}>Head: </span>{data.family.headName}
                </div>
              )}
              {/* Member list */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                {data.family.members.map(m => {
                  const isCurrentPilgrim = m.id === data.id;
                  const memberName = [m.salutation, m.fullName].filter(Boolean).join(" ");
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 10px",
                        borderRadius: "8px",
                        background: isCurrentPilgrim ? `${DARK}15` : "#fff",
                        border: `1px solid ${isCurrentPilgrim ? DARK + "40" : "#f0f0f0"}`,
                      }}
                    >
                      <span style={{ fontSize: "12px", color: "#888", minWidth: "28px" }}>#{String(m.serialNumber).padStart(3, "0")}</span>
                      <span style={{ fontSize: "13px", fontWeight: isCurrentPilgrim ? 700 : 500, color: isCurrentPilgrim ? DARK : "#333", flex: 1 }}>{memberName}</span>
                      {m.familyHead && <span style={{ fontSize: "10px", color: GOLD, fontWeight: 700 }}>HEAD</span>}
                      {m.familyRelation && !m.familyHead && <span style={{ fontSize: "10px", color: "#888" }}>{m.familyRelation}</span>}
                      {isCurrentPilgrim && <span style={{ fontSize: "10px", color: DARK, fontWeight: 700 }}>YOU</span>}
                    </div>
                  );
                })}
              </div>
              {/* View Family button */}
              {data.group && (
                <a
                  href={`${BASE}verify/family/${data.group.id}/${encodeURIComponent(data.family.familyId)}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    background: DARK, color: "#fff", borderRadius: "10px", padding: "10px 14px",
                    textDecoration: "none", fontWeight: 700, fontSize: "13px",
                  }}
                >
                  👨‍👩‍👧‍👦 View Full Family Page
                </a>
              )}
            </div>
          </div>
        )}

        {/* Flight Details */}
        {g && (g.flightNumber || g.departureDate || g.returnDate) && (
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>✈️ Flight Details</div>
            <div style={{ background: `${DARK}08`, border: `1px solid ${DARK}20`, borderRadius: "10px", padding: "12px 14px" }}>
              <InfoRow label="Flight No." value={g.flightNumber} />
              <InfoRow label="Departure" value={g.departureDate} />
              <InfoRow label="Return" value={g.returnDate} />
            </div>
          </div>
        )}

        {/* Hotel Details */}
        {g?.hotels && (g.hotels.aziziah?.name || g.hotels.makkah?.name || g.hotels.madinah?.name) && (
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>🏨 Hotel Details</div>
            <HotelCard label="Hotel Makkah 1 (Aziziah)" hotel={g.hotels.aziziah} />
            <HotelCard label="Hotel Makkah 2" hotel={g.hotels.makkah} />
            <HotelCard label="Hotel Madinah" hotel={g.hotels.madinah} />
          </div>
        )}

        {/* Contact pilgrim */}
        {(data.mobileIndia || data.mobileSaudi) && (
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>📞 Pilgrim Contact</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {data.mobileIndia && (
                <a href={`tel:${data.mobileIndia}`} style={{ flex: 1, minWidth: "130px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: `${DARK}10`, border: `1px solid ${DARK}30`, borderRadius: "10px", padding: "10px", textDecoration: "none", color: DARK, fontSize: "12px", fontWeight: 600 }}>
                  🇮🇳 {data.mobileIndia}
                </a>
              )}
              {data.mobileSaudi && (
                <a href={`tel:${data.mobileSaudi}`} style={{ flex: 1, minWidth: "130px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: `${DARK}10`, border: `1px solid ${DARK}30`, borderRadius: "10px", padding: "10px", textDecoration: "none", color: DARK, fontSize: "12px", fontWeight: 600 }}>
                  🇸🇦 {data.mobileSaudi}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ padding: "0 20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Al Burhan Tours</div>

          <div style={{ display: "flex", gap: "10px" }}>
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Assalamu Alaikum, I am inquiring about pilgrim ${displayName} (${data.passportNumber || ""}), Group: ${g?.groupName || ""} ${g?.year || ""}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#25D366", color: "#fff", borderRadius: "12px", padding: "14px", textDecoration: "none", fontWeight: 700, fontSize: "14px", boxShadow: "0 4px 12px #25D36640" }}
            >
              <span style={{ fontSize: "18px" }}>💬</span> WhatsApp
            </a>
            <a
              href={`tel:${callNumber}`}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: DARK, color: "#fff", borderRadius: "12px", padding: "14px", textDecoration: "none", fontWeight: 700, fontSize: "14px", boxShadow: `0 4px 12px ${DARK}60` }}
            >
              <span style={{ fontSize: "18px" }}>📞</span> Call
            </a>
          </div>

          <button
            onClick={() => window.print()}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: `linear-gradient(135deg, ${GOLD}, #e8c76b)`, color: "#fff", borderRadius: "12px", padding: "14px", border: "none", fontWeight: 700, fontSize: "14px", cursor: "pointer", boxShadow: `0 4px 12px ${GOLD}60`, width: "100%" }}
          >
            <span style={{ fontSize: "18px" }}>🎫</span> Download / Print Ticket
          </button>
        </div>

        {/* Footer */}
        <div style={{ background: `${DARK}08`, borderTop: `1px solid ${DARK}15`, padding: "12px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: "#888" }}>Verified by Al Burhan Tours & Travels</div>
          <div style={{ fontSize: "10px", color: "#aaa", marginTop: "2px" }}>www.alburhantravels.com</div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; }
          a[href^="https://wa.me"], a[href^="tel:"], button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
