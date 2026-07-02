import { useEffect, useState } from "react";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const DARK = "#0d5040";
const GOLD = "#C9A23F";
const BASE = import.meta.env.BASE_URL || "/";
const HOTEL_LABELS: Record<string, string> = { makkah: "Makkah", madinah: "Madinah", aziziah: "Aziziah" };

function QrImg({ value, size = 90 }: { value: string; size?: number }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&color=0d5040&bgcolor=ffffff`;
  return <img src={src} alt="QR" width={size} height={size} style={{ display: "block" }} />;
}

interface FamilyMember {
  id: string;
  serialNumber: number;
  fullName: string;
  salutation?: string;
  passportNumber?: string;
  familyHead?: boolean;
  familyRelation?: string;
  relation?: string;
  gender?: string;
  roomNumber?: string;
  roomHotel?: string;
  busNumber?: string;
  mobileIndia?: string;
}

interface FamilyData {
  familyId: string;
  members: FamilyMember[];
  head: FamilyMember | null;
}

interface Group {
  groupName: string;
  year: number;
  flightNumber?: string;
  maktabNumber?: string;
}

export default function PrintFamilySheet() {
  const [, params] = useRoute("/admin/groups/:groupId/families/:familyId/print");
  const groupId = params?.groupId || "";
  const familyId = decodeURIComponent(params?.familyId || "");

  const [family, setFamily] = useState<FamilyData | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || !familyId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/families`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, families]) => {
      setGroup(g);
      const fam = (families as FamilyData[]).find(f => f.familyId === familyId);
      setFamily(fam || null);
      setLoading(false);
      if (fam) setTimeout(() => window.print(), 900);
    }).catch(() => setLoading(false));
  }, [groupId, familyId]);

  const familyQrUrl = `${window.location.origin}${BASE.replace(/\/$/, "")}/verify/family/${groupId}/${encodeURIComponent(familyId)}`;

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px", fontFamily: "Arial, sans-serif", color: "#888" }}>
        Loading family sheet…
      </div>
    );
  }

  if (!family) {
    return (
      <div style={{ textAlign: "center", padding: "60px", fontFamily: "Arial, sans-serif", color: "#c0392b" }}>
        Family not found.
      </div>
    );
  }

  const head = family.head || family.members[0];
  const headName = head ? [head.salutation, head.fullName].filter(Boolean).join(" ") : familyId;

  return (
    <div style={{ fontFamily: "Arial, sans-serif", background: "#fff", minHeight: "100vh" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { size: A4; margin: 12mm 15mm; }
        }
        body { margin: 0; padding: 20px; }
      `}</style>

      <div className="no-print" style={{ textAlign: "right", marginBottom: "14px" }}>
        <button
          onClick={() => window.print()}
          style={{ background: DARK, color: "#fff", border: "none", borderRadius: "8px", padding: "9px 22px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}
        >
          🖨 Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ marginLeft: "8px", background: "#f0f0f0", color: "#555", border: "none", borderRadius: "8px", padding: "9px 16px", cursor: "pointer", fontSize: "14px" }}
        >
          Close
        </button>
      </div>

      <div style={{ maxWidth: "720px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${GOLD}`, paddingBottom: "14px", marginBottom: "18px" }}>
          <div>
            <img
              src={`${BASE}images/logo.png`} alt="Al Burhan"
              style={{ height: "46px", objectFit: "contain", marginBottom: "4px" }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div style={{ fontSize: "10px", color: "#888" }}>Al Burhan Tours &amp; Travels · alburhantravels.com</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#333" }}>{group?.groupName} {group?.year}</div>
            {group?.maktabNumber && <div style={{ fontSize: "11px", color: "#888" }}>Maktab: {group.maktabNumber}</div>}
            {group?.flightNumber && <div style={{ fontSize: "11px", color: "#888" }}>Flight: {group.flightNumber}</div>}
          </div>
        </div>

        {/* Family summary card */}
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", background: `${DARK}08`, borderRadius: "10px", padding: "16px", marginBottom: "20px", border: `1px solid ${DARK}20` }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <div style={{ background: GOLD, color: "#fff", borderRadius: "8px", padding: "6px 16px", textAlign: "center", minWidth: "56px" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", opacity: 0.85 }}>Family</div>
                <div style={{ fontSize: "22px", fontWeight: 900, lineHeight: 1.1 }}>{familyId}</div>
              </div>
              <div>
                <div style={{ fontSize: "19px", fontWeight: 800, color: DARK, lineHeight: 1.2 }}>{headName}</div>
                <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                  {family.members.length} member{family.members.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
            {head?.roomNumber && (
              <div style={{ fontSize: "13px", marginBottom: "4px" }}>
                <span style={{ fontWeight: 700, color: DARK }}>Room: {head.roomNumber}</span>
                {head.roomHotel && (
                  <span style={{ color: "#666", marginLeft: "6px" }}>· {HOTEL_LABELS[head.roomHotel] || head.roomHotel}</span>
                )}
              </div>
            )}
            {head?.busNumber && (
              <div style={{ fontSize: "12px", color: "#555", marginBottom: "2px" }}>🚌 Bus: {head.busNumber}</div>
            )}
            {group?.flightNumber && (
              <div style={{ fontSize: "12px", color: "#555", marginBottom: "2px" }}>✈ Flight: {group.flightNumber}</div>
            )}
            {head?.mobileIndia && (
              <div style={{ fontSize: "12px", color: "#555" }}>📞 {head.mobileIndia}</div>
            )}
          </div>
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <QrImg value={familyQrUrl} size={90} />
            <div style={{ fontSize: "9px", color: "#aaa", marginTop: "4px" }}>Scan to verify family</div>
          </div>
        </div>

        {/* Member table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
          <thead>
            <tr style={{ background: DARK, color: "#fff" }}>
              {["S.No", "Name", "Passport", "Relation", "Room", "Bus", "Mobile (India)"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {family.members.map((m, idx) => {
              const name = [m.salutation, m.fullName].filter(Boolean).join(" ");
              const hotelInitial = m.roomHotel ? (HOTEL_LABELS[m.roomHotel]?.[0] || m.roomHotel[0]) : "";
              return (
                <tr key={m.id} style={{ background: idx % 2 === 0 ? "#f9f9f9" : "#fff", borderBottom: "1px solid #e8e8e8" }}>
                  <td style={{ padding: "7px 10px", color: "#555", verticalAlign: "middle" }}>
                    <span style={{ fontWeight: 600 }}>{m.serialNumber}</span>
                    {m.familyHead && (
                      <span style={{ fontSize: "8px", background: GOLD, color: "#fff", borderRadius: "5px", padding: "1px 5px", marginLeft: "5px", fontWeight: 700 }}>HEAD</span>
                    )}
                  </td>
                  <td style={{ padding: "7px 10px", fontWeight: m.familyHead ? 700 : 400, color: DARK, verticalAlign: "middle" }}>{name}</td>
                  <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: "10.5px", verticalAlign: "middle" }}>{m.passportNumber || "—"}</td>
                  <td style={{ padding: "7px 10px", verticalAlign: "middle" }}>{m.familyRelation || m.relation || "—"}</td>
                  <td style={{ padding: "7px 10px", verticalAlign: "middle" }}>
                    {m.roomNumber
                      ? <span style={{ fontWeight: 600 }}>{m.roomNumber}{hotelInitial ? ` (${hotelInitial})` : ""}</span>
                      : "—"}
                  </td>
                  <td style={{ padding: "7px 10px", verticalAlign: "middle" }}>{m.busNumber || "—"}</td>
                  <td style={{ padding: "7px 10px", verticalAlign: "middle" }}>{m.mobileIndia || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ marginTop: "28px", paddingTop: "10px", borderTop: `1px solid ${GOLD}40`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "9px", color: "#bbb" }}>Al Burhan Tours &amp; Travels · www.alburhantravels.com</div>
          <div style={{ fontSize: "9px", color: "#bbb" }}>Printed: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
        </div>
      </div>
    </div>
  );
}
