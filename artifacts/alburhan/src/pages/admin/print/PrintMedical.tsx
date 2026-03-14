import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { PrintHeader } from "./PrintHeader";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  dateOfBirth?: string; gender?: string; bloodGroup?: string; photoUrl?: string;
  mobileIndia?: string; address?: string; city?: string; state?: string; coverNumber?: string;
}
interface Group { id: string; groupName: string; year: number; }

export default function PrintMedical() {
  const [, params] = useRoute("/admin/groups/:groupId/print/medical");
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

  function calcAge(dob: string | undefined): string {
    if (!dob) return "—";
    const parts = dob.split("/");
    if (parts.length === 3) return String(new Date().getFullYear() - parseInt(parts[2], 10));
    return "—";
  }

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
        .med-sticker {
          width: 100%; border: 2.5px solid #c0392b; border-radius: 8px; overflow: hidden;
          page-break-inside: avoid; font-family: 'Inter', Arial, sans-serif;
        }
        .med-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; padding: 3mm; }
        .page-break { page-break-after: always; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#c0392b", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>Print Medical Stickers</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      {pages.map((page, pi) => (
        <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""}>
          <PrintHeader title="Medical Information" subtitle={`${group.groupName} — ${group.year}`} />
          <div className="med-grid">
            {page.map(p => (
              <div key={p.id} className="med-sticker">
                <div style={{ background: "linear-gradient(135deg, #c0392b, #e74c3c)", color: "#fff", padding: "3mm 4mm", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
                    <img src={`${BASE}images/logo.png`} alt="" style={{ height: "10mm", objectFit: "contain" }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "10pt", letterSpacing: "0.5px" }}>Al Burhan Tours & Travels</div>
                      <div style={{ fontSize: "7pt", opacity: 0.85, fontWeight: 600, letterSpacing: "1px" }}>MEDICAL INFORMATION</div>
                    </div>
                  </div>
                  <div style={{ fontSize: "8pt", fontWeight: 700 }}>{p.coverNumber || `#${p.serialNumber}`}</div>
                </div>

                <div style={{ display: "flex", padding: "3mm 4mm", gap: "4mm" }}>
                  <div style={{ width: "24mm", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "2mm" }}>
                    {p.photoUrl ? (
                      <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "24mm", height: "28mm", objectFit: "cover", borderRadius: "4px", border: "2px solid #c0392b" }} />
                    ) : (
                      <div style={{ width: "24mm", height: "28mm", background: "#fdf2f2", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "2px solid #e0b4b4", fontSize: "6pt", color: "#c0392b" }}>PHOTO</div>
                    )}
                    <div style={{
                      width: "24mm", height: "12mm", background: "#c0392b", color: "#fff",
                      borderRadius: "4px", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ fontSize: "5pt", opacity: 0.85, letterSpacing: "0.5px" }}>BLOOD GROUP</div>
                      <div style={{ fontSize: "14pt", fontWeight: 800, lineHeight: 1 }}>{p.bloodGroup || "—"}</div>
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    {p.passportNumber && (
                      <div style={{ marginBottom: "2mm", padding: "1.5mm", background: "#fafafa", borderRadius: "3px", textAlign: "center", overflow: "hidden" }}>
                        <Barcode value={p.passportNumber} height={18} width={1} fontSize={6} displayValue />
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1mm 3mm", fontSize: "8pt" }}>
                      <span style={{ fontWeight: 700 }}>Name:</span><span>{p.fullName}</span>
                      <span style={{ fontWeight: 700 }}>Age:</span><span>{calcAge(p.dateOfBirth)}</span>
                      <span style={{ fontWeight: 700 }}>Gender:</span><span>{p.gender || "—"}</span>
                      <span style={{ fontWeight: 700 }}>Contact:</span><span>{p.mobileIndia || "—"}</span>
                      <span style={{ fontWeight: 700 }}>Address:</span><span style={{ fontSize: "7pt" }}>{[p.address, p.city, p.state].filter(Boolean).join(", ") || "—"}</span>
                    </div>
                  </div>
                </div>

                <div style={{ margin: "0 4mm 3mm", padding: "2mm 3mm", background: "#fdf2f2", borderRadius: "4px", border: "1px solid #f5c6cb", fontSize: "7.5pt" }}>
                  <div style={{ fontWeight: 700, color: "#c0392b", marginBottom: "1mm", fontSize: "6.5pt", letterSpacing: "0.5px" }}>EMERGENCY CONTACTS</div>
                  <div>Saudi: <b>0547090786</b> &nbsp;|&nbsp; India: <b>0568780786</b></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
