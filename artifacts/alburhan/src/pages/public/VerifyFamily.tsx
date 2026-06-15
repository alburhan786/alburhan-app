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
  familyHead?: boolean;
  roomNumber?: string;
  roomHotel?: string;
  mobileIndia?: string;
  mobileSaudi?: string;
  photoUrl?: string;
}

interface FamilyData {
  familyId: string;
  groupId: string;
  groupName: string;
  year: number;
  members: FamilyMember[];
  head: FamilyMember | null;
}

function MemberRow({ m, apiUrl }: { m: FamilyMember; apiUrl: string }) {
  const name = [m.salutation, m.fullName].filter(Boolean).join(" ");
  const photoSrc = m.photoUrl
    ? m.photoUrl.startsWith("http") ? m.photoUrl : `${apiUrl.replace("/api", "")}${m.photoUrl}`
    : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <div style={{ flexShrink: 0 }}>
        {photoSrc ? (
          <img src={photoSrc} alt={m.fullName} style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", border: `2px solid ${DARK}30` }} />
        ) : (
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: `${DARK}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
            {m.gender?.toLowerCase() === "female" ? "👩" : "👨"}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: DARK }}>{name}</span>
          {m.familyHead && <span style={{ fontSize: "10px", background: GOLD, color: "#fff", borderRadius: "10px", padding: "1px 7px", fontWeight: 700 }}>HEAD</span>}
        </div>
        <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
          {m.relation && <span>{m.relation}</span>}
          {m.passportNumber && <span style={{ marginLeft: m.relation ? "8px" : "0" }}>· {m.passportNumber}</span>}
        </div>
        {m.roomNumber && (
          <div style={{ fontSize: "11px", color: DARK, marginTop: "2px", fontWeight: 600 }}>
            Room {m.roomNumber}{m.roomHotel ? ` · ${m.roomHotel}` : ""}
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
    fetch(`${apiBase()}/groups/${groupId}/families/${encodeURIComponent(familyId)}/public`)
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
            <div style={{ background: `${DARK}15`, border: `2px solid ${DARK}30`, borderRadius: "12px", padding: "10px 16px", textAlign: "center" }}>
              <div style={{ fontSize: "9px", color: DARK, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Family</div>
              <div style={{ fontSize: "18px", fontWeight: 900, color: DARK }}>{data.familyId}</div>
            </div>
            <div style={{ flex: 1 }}>
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

        {/* Room info */}
        {room && (
          <div style={{ padding: "14px 20px", background: `${DARK}08`, borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>🏨 Room Assignment</div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: DARK }}>Room {room}{hotel ? ` · ${hotel.charAt(0).toUpperCase() + hotel.slice(1)}` : ""}</div>
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
          <div style={{ fontSize: "10px", color: "#aaa", marginTop: "2px" }}>www.alburhantravels.com</div>
        </div>
      </div>
    </div>
  );
}
