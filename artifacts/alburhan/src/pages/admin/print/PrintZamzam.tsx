import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim { id: string; serialNumber: number; fullName: string; }
interface Group { id: string; groupName: string; year: number; }

export default function PrintZamzam() {
  const [, params] = useRoute("/admin/groups/:groupId/print/zamzam");
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
  for (let i = 0; i < pilgrims.length; i += 6) pages.push(pilgrims.slice(i, i + 6));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .zamzam-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; padding: 3mm; }
        .page-break { page-break-after: always; }
        .zamzam-sticker {
          border: 2px solid #0A3D2A; border-radius: 8px; overflow: hidden;
          page-break-inside: avoid; font-family: 'Inter', Arial, sans-serif; height: 88mm;
          display: flex; flex-direction: column;
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>Print Zamzam Stickers</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      {pages.map((page, pi) => (
        <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""}>
          <div className="zamzam-grid">
            {page.map(p => (
              <div key={p.id} className="zamzam-sticker">
                <div style={{
                  background: "linear-gradient(135deg, #0A3D2A, #1a6b45)",
                  color: "#fff", padding: "5mm 5mm 4mm", textAlign: "center", position: "relative", overflow: "hidden",
                }}>
                  <div style={{ position: "absolute", top: "-4mm", right: "-4mm", width: "20mm", height: "20mm", background: "rgba(201,168,76,0.15)", borderRadius: "50%" }} />
                  <div style={{ position: "absolute", bottom: "-6mm", left: "-4mm", width: "16mm", height: "16mm", background: "rgba(201,168,76,0.1)", borderRadius: "50%" }} />
                  <img src={`${BASE}images/logo.png`} alt="" style={{ height: "8mm", objectFit: "contain", position: "relative", marginBottom: "1mm" }} />
                  <div style={{ fontSize: "22pt", fontWeight: 900, letterSpacing: "4px", lineHeight: 1, position: "relative" }}>ZAMZAM</div>
                  <div style={{ fontSize: "6pt", opacity: 0.8, marginTop: "1.5mm", letterSpacing: "1px", position: "relative" }}>HOLY WATER</div>
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "4mm 5mm", textAlign: "center" }}>
                  <div style={{ fontSize: "6pt", color: "#888", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "1mm" }}>Serial No.</div>
                  <div style={{ fontSize: "20pt", fontWeight: 800, color: "#0A3D2A", lineHeight: 1 }}>#{String(p.serialNumber).padStart(3, "0")}</div>

                  <div style={{ width: "80%", height: "1px", background: "#e0e0e0", margin: "4mm 0" }} />

                  <div style={{ fontSize: "12pt", fontWeight: 700, color: "#333", lineHeight: 1.2, marginBottom: "2mm" }}>{p.fullName}</div>
                  <div style={{ fontSize: "8pt", color: "#666" }}>{group.groupName} — {group.year}</div>
                </div>

                <div style={{ background: "#0A3D2A", color: "#C9A84C", padding: "2mm", textAlign: "center", fontSize: "6pt", fontWeight: 600, letterSpacing: "0.5px" }}>
                  AL BURHAN TOURS & TRAVELS — BURHANPUR
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
