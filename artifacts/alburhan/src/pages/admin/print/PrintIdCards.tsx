import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { PrintHeader } from "./PrintHeader";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  visaNumber?: string; photoUrl?: string; dateOfBirth?: string; mobileIndia?: string;
  bloodGroup?: string; roomNumber?: string; gender?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  hotels?: { makkah?: { name?: string; address?: string }; madinah?: { name?: string; address?: string } };
}

export default function PrintIdCards() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => { setGroup(g); setPilgrims(p); });
  }, [groupId]);

  useEffect(() => {
    if (pilgrims.length > 0) setTimeout(() => window.print(), 800);
  }, [pilgrims]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 4) pages.push(pilgrims.slice(i, i + 4));

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
          width: 85.6mm; height: 53.98mm;
          border: 1.5px solid #0A3D2A; border-radius: 6px; overflow: hidden;
          page-break-inside: avoid; font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
        }
        .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding: 2mm; }
        .page-break { page-break-after: always; }
        .card-header {
          background: linear-gradient(135deg, #0A3D2A 0%, #145a3a 100%);
          color: #fff; padding: 2mm 3mm; display: flex; justify-content: space-between; align-items: center;
          position: relative; overflow: hidden;
        }
        .card-header::after {
          content: ''; position: absolute; right: -8mm; top: -8mm;
          width: 20mm; height: 20mm; background: rgba(201,168,76,0.15);
          border-radius: 50%; pointer-events: none;
        }
        .card-header::before {
          content: ''; position: absolute; right: 4mm; bottom: -6mm;
          width: 14mm; height: 14mm; background: rgba(201,168,76,0.1);
          border-radius: 50%; pointer-events: none;
        }
        .field-label { font-size: 4.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1; }
        .field-value { font-size: 6pt; color: #222; font-weight: 600; line-height: 1.2; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>Print ID Cards</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      {pages.map((page, pi) => (
        <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""}>
          <PrintHeader title="Pilgrim ID Cards" subtitle={`${group.groupName} — ${group.year}`} />
          <div className="cards-grid">
            {page.map(p => (
              <div key={`front-${p.id}`} className="id-card">
                <div className="card-header">
                  <img src={`${BASE}images/logo.png`} alt="" style={{ height: "10mm", objectFit: "contain", zIndex: 1, marginRight: "1.5mm" }} />
                  <div style={{ zIndex: 1, flex: 1 }}>
                    <div style={{ fontSize: "7pt", fontWeight: 700, letterSpacing: "0.5px" }}>AL BURHAN</div>
                    <div style={{ fontSize: "4.5pt", opacity: 0.85, letterSpacing: "0.8px" }}>TOURS & TRAVELS</div>
                  </div>
                  <div style={{ zIndex: 1, textAlign: "right" }}>
                    <div style={{ fontSize: "7pt", color: "#C9A84C", fontWeight: 700 }}>HAJJ {group.year}</div>
                    <div style={{ fontSize: "5.5pt", opacity: 0.8 }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                  </div>
                </div>

                <div style={{ display: "flex", flex: 1, padding: "2mm 2.5mm 1.5mm", gap: "2mm" }}>
                  <div style={{ width: "22mm", flexShrink: 0 }}>
                    {p.photoUrl ? (
                      <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "22mm", height: "26mm", objectFit: "cover", borderRadius: "3px", border: "2px solid #0A3D2A" }} />
                    ) : (
                      <div style={{ width: "22mm", height: "26mm", background: "linear-gradient(135deg, #e8e8e8, #f5f5f5)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "3px", border: "2px solid #ccc", fontSize: "6pt", color: "#aaa" }}>PHOTO</div>
                    )}
                  </div>

                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.8mm", minWidth: 0 }}>
                    <div style={{ fontSize: "8pt", fontWeight: 800, color: "#0A3D2A", lineHeight: 1.15, marginBottom: "0.5mm", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.fullName}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5mm 2mm" }}>
                      <div><div className="field-label">Passport</div><div className="field-value" style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}>{p.passportNumber || "—"}</div></div>
                      <div><div className="field-label">DOB</div><div className="field-value">{p.dateOfBirth || "—"}</div></div>
                      <div><div className="field-label">Mobile</div><div className="field-value">{p.mobileIndia || "—"}</div></div>
                      <div><div className="field-label">Blood Group</div><div className="field-value" style={{ color: "#c0392b" }}>{p.bloodGroup || "—"}</div></div>
                      <div><div className="field-label">Maktab</div><div className="field-value">{group.maktabNumber || "—"}</div></div>
                      <div><div className="field-label">Room</div><div className="field-value">{p.roomNumber || "—"}</div></div>
                    </div>
                  </div>
                </div>

                <div style={{ background: "#f5f5f5", borderTop: "1px solid #e0e0e0", padding: "1mm 3mm", display: "flex", justifyContent: "center", alignItems: "center" }}>
                  {p.passportNumber ? (
                    <div style={{ overflow: "hidden", maxHeight: "8mm" }}>
                      <Barcode value={p.passportNumber} height={14} width={0.8} fontSize={0} />
                    </div>
                  ) : (
                    <div style={{ fontSize: "5pt", color: "#999" }}>{group.groupName} — {group.year}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="cards-grid" style={{ marginTop: "4mm" }}>
            {page.map(p => (
              <div key={`back-${p.id}`} className="id-card" style={{ display: "flex", flexDirection: "column" }}>
                <div className="card-header">
                  <img src={`${BASE}images/logo.png`} alt="" style={{ height: "10mm", objectFit: "contain", zIndex: 1, marginRight: "1.5mm" }} />
                  <div style={{ zIndex: 1 }}>
                    <div style={{ fontSize: "7.5pt", fontWeight: 700 }}>AL BURHAN TOURS & TRAVELS</div>
                    <div style={{ fontSize: "5pt", opacity: 0.8 }}>Burhanpur, M.P., India</div>
                  </div>
                </div>

                <div style={{ flex: 1, padding: "2mm 3mm", fontSize: "6.5pt", lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 700, fontSize: "7.5pt", color: "#0A3D2A", marginBottom: "1.5mm", borderBottom: "1px solid #e0e0e0", paddingBottom: "1mm" }}>{p.fullName} <span style={{ color: "#888", fontWeight: 400 }}>#{p.serialNumber}</span></div>

                  {p.passportNumber && <div><span style={{ color: "#666", fontSize: "5.5pt" }}>Passport: </span><span style={{ fontFamily: "monospace", letterSpacing: "1px", fontWeight: 600 }}>{p.passportNumber}</span></div>}
                  {p.visaNumber && <div><span style={{ color: "#666", fontSize: "5.5pt" }}>Visa: </span><span style={{ fontFamily: "monospace", letterSpacing: "1px" }}>{p.visaNumber}</span></div>}

                  {group.hotels?.makkah && (
                    <div style={{ marginTop: "1.5mm", padding: "1mm 2mm", background: "#f0faf4", borderRadius: "2px", borderLeft: "2px solid #0A3D2A" }}>
                      <div style={{ fontWeight: 700, color: "#0A3D2A", fontSize: "5.5pt" }}>MAKKAH HOTEL</div>
                      <div style={{ fontSize: "6pt" }}>{group.hotels.makkah.name}</div>
                      {group.hotels.makkah.address && <div style={{ fontSize: "5pt", color: "#666" }}>{group.hotels.makkah.address}</div>}
                    </div>
                  )}
                  {group.hotels?.madinah && (
                    <div style={{ marginTop: "1mm", padding: "1mm 2mm", background: "#f0faf4", borderRadius: "2px", borderLeft: "2px solid #0A3D2A" }}>
                      <div style={{ fontWeight: 700, color: "#0A3D2A", fontSize: "5.5pt" }}>MADINAH HOTEL</div>
                      <div style={{ fontSize: "6pt" }}>{group.hotels.madinah.name}</div>
                      {group.hotels.madinah.address && <div style={{ fontSize: "5pt", color: "#666" }}>{group.hotels.madinah.address}</div>}
                    </div>
                  )}
                </div>

                <div style={{ background: "#0A3D2A", color: "#C9A84C", padding: "1.5mm 3mm", fontSize: "5.5pt", textAlign: "center", fontWeight: 600 }}>
                  Emergency Saudi: 0547090786 &nbsp;|&nbsp; India: 0568780786
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
