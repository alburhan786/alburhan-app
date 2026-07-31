import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { QRCodeCanvas } from "qrcode.react";

const DARK = "#0d5040";
const GOLD = "#C9A23F";
const BASE = import.meta.env.BASE_URL || "/";

function apiBase() {
  return BASE.replace(/\/$/, "") + "/api";
}

interface FamilyMember {
  id: string;
  fullName: string;
  salutation?: string;
  serialNumber: number;
  passportNumber?: string;
  gender?: string;
  relation?: string;
  familyRelation?: string;
  familyHead?: boolean;
  roomNumber?: string;
  roomType?: string;
  roomHotel?: string;
  busNumber?: string;
  seatNumber?: string;
  mobileIndia?: string;
  mobileSaudi?: string;
  photoUrl?: string;
}

interface FamilyData {
  familyId: string;
  groupId: string;
  groupName: string;
  year: number;
  flightNumber?: string | null;
  departureDate?: string | null;
  returnDate?: string | null;
  maktabNumber?: string | null;
  hotels?: Record<string, string>;
  members: FamilyMember[];
  head: FamilyMember | null;
}

function fmt(date?: string | null) {
  if (!date) return null;
  try {
    return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return date;
  }
}

function InfoPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: "80px", padding: "8px 4px", gap: "2px" }}>
      <span style={{ fontSize: "18px" }}>{icon}</span>
      <span style={{ fontSize: "10px", color: GOLD, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
      <span style={{ fontSize: "12px", fontWeight: 700, color: DARK, textAlign: "center", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function MemberRow({ m, apiUrl }: { m: FamilyMember; apiUrl: string }) {
  const name = [m.salutation, m.fullName].filter(Boolean).join(" ");
  const role = m.familyRelation || m.relation;
  const photoSrc = m.photoUrl
    ? m.photoUrl.startsWith("http") ? m.photoUrl : `${apiUrl.replace("/api", "")}${m.photoUrl}`
    : null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ flexShrink: 0 }}>
        {photoSrc ? (
          <img src={photoSrc} alt={m.fullName} style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: `2px solid ${DARK}30` }} />
        ) : (
          <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: `${DARK}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
            {m.gender?.toLowerCase() === "female" ? "👩" : "👨"}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: DARK }}>{name}</span>
          {m.familyHead && (
            <span style={{ fontSize: "10px", background: GOLD, color: "#fff", borderRadius: "10px", padding: "1px 7px", fontWeight: 700, flexShrink: 0 }}>HEAD</span>
          )}
        </div>
        {role && <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{role}</div>}
        {m.passportNumber && <div style={{ fontSize: "11px", color: "#999", marginTop: "1px" }}>🛂 {m.passportNumber}</div>}

        {/* Room */}
        {m.roomNumber && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "5px" }}>
            <span style={{ fontSize: "11px", background: `${DARK}12`, color: DARK, fontWeight: 600, borderRadius: "6px", padding: "2px 7px" }}>
              🏨 Room {m.roomNumber}{m.roomHotel ? ` · ${m.roomHotel}` : ""}
              {m.roomType ? ` (${m.roomType})` : ""}
            </span>
          </div>
        )}

        {/* Bus / Seat */}
        {(m.busNumber || m.seatNumber) && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
            {m.busNumber && (
              <span style={{ fontSize: "11px", background: "#fef9ee", color: "#92400e", fontWeight: 600, borderRadius: "6px", padding: "2px 7px", border: "1px solid #fde68a" }}>
                🚌 Bus {m.busNumber}
              </span>
            )}
            {m.seatNumber && (
              <span style={{ fontSize: "11px", background: "#fef9ee", color: "#92400e", fontWeight: 600, borderRadius: "6px", padding: "2px 7px", border: "1px solid #fde68a" }}>
                💺 Seat {m.seatNumber}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyFamily() {
  const [, params] = useRoute("/verify/family/:groupId/:familyId");
  const groupId = params?.groupId || "";
  const familyId = params?.familyId || "";

  const [data, setData] = useState<FamilyData | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "error">("loading");

  useEffect(() => {
    if (!groupId || !familyId) { setStatus("not_found"); return; }
    fetch(`${apiBase()}/verify/family/${groupId}/${encodeURIComponent(familyId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setStatus("found"); })
      .catch(code => setStatus(code === 404 ? "not_found" : "error"));
  }, [groupId, familyId]);

  const whatsappNumber = "919893989786";
  const currentUrl = window.location.href;

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <div style={{ width: "40px", height: "40px", border: `4px solid ${DARK}20`, borderTop: `4px solid ${DARK}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <div style={{ color: "#888", fontSize: "14px" }}>Loading family details...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: "#fff", borderRadius: "16px", padding: "40px 24px", textAlign: "center", maxWidth: "360px", width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>❌</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#c0392b", marginBottom: "8px" }}>Family Not Found</div>
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "24px" }}>No family found with this ID. Please contact Al Burhan Tours & Travels.</div>
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
  const head = data.head || data.members[0];
  const headName = head ? [head.salutation, head.fullName].filter(Boolean).join(" ") : data.familyId;
  const room = head?.roomNumber;
  const hotel = head?.roomHotel;
  const mobile = head?.mobileIndia || head?.mobileSaudi || data.members.find(m => m.mobileIndia)?.mobileIndia;

  // Collect unique bus numbers from all members
  const buses = [...new Set(data.members.map(m => m.busNumber).filter(Boolean))] as string[];

  // Group info pills
  const infoPills: { icon: string; label: string; value: string }[] = [];
  if (data.flightNumber) infoPills.push({ icon: "✈️", label: "Flight", value: data.flightNumber });
  if (data.departureDate) infoPills.push({ icon: "📅", label: "Departure", value: fmt(data.departureDate)! });
  if (data.returnDate) infoPills.push({ icon: "🏠", label: "Return", value: fmt(data.returnDate)! });
  if (data.maktabNumber) infoPills.push({ icon: "🕌", label: "Maktab", value: data.maktabNumber });

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${DARK} 0%, #1a7a5e 40%, #f5f5f5 60%)`, padding: "0 0 40px 0", fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Header */}
      <div style={{ padding: "24px 20px 60px", textAlign: "center" }}>
        <img src={`${BASE}images/logo.png`} alt="Al Burhan" style={{ height: "52px", objectFit: "contain", marginBottom: "8px" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div style={{ color: "#ffffff90", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase" }}>Al Burhan Tours & Travels</div>
      </div>

      {/* Main Card */}
      <div style={{ margin: "0 16px", background: "#fff", borderRadius: "20px", boxShadow: "0 8px 40px rgba(0,0,0,0.15)", overflow: "hidden", position: "relative", marginTop: "-40px" }}>

        {/* Gold top bar */}
        <div style={{ height: "5px", background: `linear-gradient(90deg, ${GOLD}, #e8c76b, ${GOLD})` }} />

        {/* Family header */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: `${DARK}15`, border: `2px solid ${DARK}30`, borderRadius: "12px", padding: "10px 16px", textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: "9px", color: DARK, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Family</div>
              <div style={{ fontSize: "18px", fontWeight: 900, color: DARK }}>{data.familyId}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "18px", fontWeight: 800, color: DARK, lineHeight: 1.2 }}>{headName}</div>
              <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>{data.groupName} · {data.year}</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{data.members.length} member{data.members.length !== 1 ? "s" : ""}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#dcfce7", border: "1.5px solid #16a34a", borderRadius: "20px", padding: "3px 10px", marginTop: "8px" }}>
                <span style={{ fontSize: "11px" }}>👨‍👩‍👧‍👦</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a" }}>FAMILY VERIFIED</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trip info pills */}
        {infoPills.length > 0 && (
          <div style={{ padding: "14px 20px", background: `${DARK}06`, borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>✈️ Trip Details</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {infoPills.map(p => <InfoPill key={p.label} {...p} />)}
            </div>
          </div>
        )}

        {/* Room info */}
        {room && (
          <div style={{ padding: "14px 20px", background: `${DARK}08`, borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>🏨 Room Assignment</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: DARK }}>Room {room}{hotel ? ` · ${hotel.charAt(0).toUpperCase() + hotel.slice(1)}` : ""}</div>
          </div>
        )}

        {/* Bus info (group-level summary) */}
        {buses.length > 0 && (
          <div style={{ padding: "14px 20px", background: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>🚌 Bus Assignment</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#92400e" }}>
              {buses.length === 1 ? `Bus ${buses[0]}` : buses.map(b => `Bus ${b}`).join(" · ")}
            </div>
          </div>
        )}

        {/* Members */}
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>
            👥 Family Members ({data.members.length})
          </div>
          {data.members.map(m => (
            <MemberRow key={m.id} m={m} apiUrl={apiBase()} />
          ))}
        </div>

        {/* QR Code */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #f0f0f0", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px" }}>Family QR Code</div>
          <QRCodeCanvas value={currentUrl} size={120} fgColor={DARK} bgColor="#ffffff" />
          <div style={{ fontSize: "10px", color: "#aaa" }}>Scan to view family details</div>
        </div>

        {/* Contact */}
        <div style={{ padding: "0 20px 20px", display: "flex", gap: "10px" }}>
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Assalamu Alaikum, inquiring about family ${data.familyId} (${headName}), Group: ${data.groupName} ${data.year}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#25D366", color: "#fff", borderRadius: "12px", padding: "14px", textDecoration: "none", fontWeight: 700, fontSize: "14px" }}
          >
            💬 WhatsApp
          </a>
          {mobile && (
            <a href={`tel:${mobile}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: DARK, color: "#fff", borderRadius: "12px", padding: "14px", textDecoration: "none", fontWeight: 700, fontSize: "14px" }}>
              📞 Call
            </a>
          )}
        </div>

        {/* Footer */}
        <div style={{ background: `${DARK}08`, borderTop: `1px solid ${DARK}15`, padding: "12px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: "#888" }}>Al Burhan Tours & Travels</div>
          <div style={{ fontSize: "10px", color: "#aaa", marginTop: "2px" }}>www.alburhantravels.online</div>
        </div>
      </div>
    </div>
  );
}
