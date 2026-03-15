import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim { id: string; serialNumber: number; fullName: string; photoUrl?: string; }
interface Group { id: string; groupName: string; year: number; }

const DARK = "#0A3D2A";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

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

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .zamzam-sticker {
          width: 150mm; height: 190mm;
          border: 1.5px solid ${DARK}; border-radius: 6px; overflow: hidden;
          page-break-inside: avoid; page-break-after: always;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
          margin: 0 auto 5mm;
        }
        .zamzam-sticker:last-child { page-break-after: auto; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>⬇ Download PDF / Print Zamzam Stickers</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
        <span style={{ fontSize: "11px", color: "#666", marginRight: "12px" }}>(In print dialog, select "Save as PDF" to download)</span>
      </div>

      {pilgrims.map(p => (
        <div key={p.id} className="zamzam-sticker">
          <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{
              position: "absolute", top: "-15mm", right: "-10mm",
              width: "70mm", height: "70mm",
              background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
            }} />
            <div style={{
              position: "absolute", bottom: "-10mm", left: "-8mm",
              width: "55mm", height: "55mm",
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
              borderRadius: "0 60% 0 0", zIndex: 0,
            }} />

            <div style={{ position: "relative", zIndex: 1, padding: "5mm 6mm 2mm", display: "flex", alignItems: "center", gap: "4mm" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2mm", flexShrink: 0 }}>
                <img src={`${BASE}images/logo.png`} alt="" style={{ height: "24mm", objectFit: "contain" }} />
                <img src={`${BASE}images/india_flag.jpg`} alt="" style={{ width: "18mm", height: "18mm", borderRadius: "50%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 900, fontSize: "15pt", color: "#1A7A4A", letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.1 }}>AL-BURHAN</div>
                <div style={{ fontWeight: 700, fontSize: "9pt", color: GOLD, letterSpacing: "1.5px", textTransform: "uppercase" }}>TOURS & TRAVELS</div>
              </div>
            </div>
            <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "0 6mm 2mm" }}>
              <div style={{ fontSize: "28pt", fontWeight: 900, letterSpacing: "5px", color: DARK, lineHeight: 1 }}>ZAMZAM</div>
              <div style={{ fontSize: "9pt", color: GOLD, fontWeight: 700, letterSpacing: "2px", marginTop: "2mm" }}>HOLY WATER</div>
            </div>

            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", flex: 1, padding: "2mm 6mm" }}>
              <div style={{ marginBottom: "4mm" }}>
                {p.photoUrl ? (
                  <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "42mm", height: "42mm", objectFit: "cover", borderRadius: "50%", border: `3px solid ${GOLD}`, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }} />
                ) : (
                  <div style={{ width: "42mm", height: "42mm", background: "#f0f0f0", borderRadius: "50%", border: `3px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10pt", color: "#aaa" }}>PHOTO</div>
                )}
              </div>

              <div style={{ fontSize: "7pt", color: "#888", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "1mm" }}>Serial No.</div>
              <div style={{ fontSize: "26pt", fontWeight: 800, color: DARK, lineHeight: 1, marginBottom: "4mm" }}>#{String(p.serialNumber).padStart(3, "0")}</div>

              <div style={{ width: "60%", height: "1px", background: "#e0e0e0", marginBottom: "4mm" }} />

              <div style={{ fontSize: "16pt", fontWeight: 700, color: "#333", lineHeight: 1.2, textAlign: "center", marginBottom: "3mm", maxWidth: "130mm", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.fullName}</div>
              <div style={{ fontSize: "10pt", color: "#666", marginBottom: "4mm" }}>{group.groupName} — {group.year}</div>

              <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Barcode value={`ZAM${String(p.serialNumber).padStart(3, "0")}`} height={30} width={1.8} fontSize={0} />
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "2.5mm 5mm", fontSize: "8pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
              AL BURHAN TOURS & TRAVELS — BURHANPUR &nbsp;|&nbsp; Mohammed Altaf: 0547090786 | Mohammed Wasim: 0568780786
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
