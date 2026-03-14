import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { PrintHeader } from "./PrintHeader";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; photoUrl?: string;
  mobileIndia?: string; mobileSaudi?: string; city?: string; relation?: string;
}
interface Group { id: string; groupName: string; year: number; }

export default function PrintLuggage() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage");
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

  const relations = ["Self", "Wife", "Husband", "Mother", "Father", "Son", "Daughter", "Brother", "Sister"];
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .sticker {
          width: 100%; border: 2px solid #0A3D2A; border-radius: 8px; overflow: hidden;
          page-break-inside: avoid; font-family: 'Inter', Arial, sans-serif;
        }
        .stickers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; padding: 3mm; }
        .page-break { page-break-after: always; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>Print Luggage Stickers</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      {pages.map((page, pi) => (
        <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""}>
          <PrintHeader title="Luggage Stickers" subtitle={`${group.groupName} — ${group.year}`} />
          <div className="stickers-grid">
            {page.map(p => (
              <div key={p.id} className="sticker">
                <div style={{ background: "linear-gradient(135deg, #0A3D2A, #145a3a)", color: "#fff", padding: "3mm 4mm", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
                    <img src={`${BASE}images/logo.png`} alt="" style={{ height: "12mm", objectFit: "contain" }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "11pt", letterSpacing: "0.5px" }}>Al Burhan Tours & Travels</div>
                      <div style={{ fontSize: "7pt", opacity: 0.8 }}>Burhanpur, M.P.</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "16pt", fontWeight: 800, color: "#C9A84C" }}>#{p.serialNumber}</div>
                    <div style={{ fontSize: "7pt", opacity: 0.8 }}>{group.year}</div>
                  </div>
                </div>

                <div style={{ display: "flex", padding: "4mm", gap: "4mm" }}>
                  <div style={{ width: "28mm", flexShrink: 0 }}>
                    {p.photoUrl ? (
                      <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "28mm", height: "34mm", objectFit: "cover", borderRadius: "4px", border: "2px solid #0A3D2A" }} />
                    ) : (
                      <div style={{ width: "28mm", height: "34mm", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "2px solid #ccc", fontSize: "7pt", color: "#aaa" }}>PHOTO</div>
                    )}
                  </div>

                  <div style={{ flex: 1, fontSize: "9pt", lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 800, fontSize: "13pt", color: "#0A3D2A", marginBottom: "2mm", lineHeight: 1.2 }}>{p.fullName}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5mm 3mm", fontSize: "8.5pt" }}>
                      <span style={{ color: "#666" }}>Group:</span><span style={{ fontWeight: 600 }}>{group.groupName}</span>
                      <span style={{ color: "#666" }}>City:</span><span style={{ fontWeight: 600 }}>{p.city || "—"}</span>
                      <span style={{ color: "#666" }}>India:</span><span style={{ fontWeight: 600 }}>{p.mobileIndia || "—"}</span>
                      <span style={{ color: "#666" }}>Saudi:</span><span style={{ fontWeight: 600 }}>{p.mobileSaudi || "—"}</span>
                    </div>
                  </div>
                </div>

                <div style={{ padding: "0 4mm 3mm" }}>
                  <div style={{ display: "flex", gap: "2mm", flexWrap: "wrap" }}>
                    {relations.map(r => (
                      <span key={r} style={{
                        padding: "1mm 3mm", borderRadius: "3px", fontSize: "7pt",
                        background: p.relation === r ? "#0A3D2A" : "#f5f5f5",
                        color: p.relation === r ? "#fff" : "#888",
                        fontWeight: p.relation === r ? 700 : 400,
                        border: p.relation === r ? "none" : "1px solid #ddd",
                      }}>{r}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
