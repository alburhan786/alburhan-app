import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { PrintHeader } from "./PrintHeader";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  roomNumber?: string; roomType?: string; busNumber?: string; photoUrl?: string;
}
interface Group {
  id: string; groupName: string; year: number;
  hotels?: {
    makkah?: { name?: string; address?: string; checkIn?: string; checkOut?: string };
    madinah?: { name?: string; address?: string; checkIn?: string; checkOut?: string };
  };
}


export default function PrintHotelList() {
  const [, params] = useRoute("/admin/groups/:groupId/print/hotel-list");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);

  const contentRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!contentRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadPdf(contentRef.current, { filename: `Hotel-Room-List-${group?.groupName || "group"}.pdf`, orientation: "landscape" });
    } finally { setPdfLoading(false); }
  }, [group, pdfLoading]);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => { setGroup(g); setPilgrims(p); });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const thStyle: React.CSSProperties = { background: "#0A3D2A", color: "#fff", padding: "2.5mm 2.5mm", textAlign: "left", fontSize: "7pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" };
  const tdStyle: React.CSSProperties = { border: "1px solid #ddd", padding: "2mm 2.5mm", fontSize: "8pt" };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}</button>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#1a2744", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
        <div style={{ padding: "4mm", fontFamily: "'Inter', Arial, sans-serif" }}>
          <PrintHeader title="Hotel Room List" subtitle={`${group.groupName} (${group.year})`} company={company} />

          {/* Hotel summary bar */}
          {(group.hotels?.makkah?.name || group.hotels?.madinah?.name) && (
            <div style={{ display: "flex", gap: "6mm", justifyContent: "flex-end", fontSize: "8pt", color: "#333", lineHeight: 1.7, marginTop: "-3mm", marginBottom: "4mm" }}>
              {group.hotels?.makkah?.name && (
                <div>Makkah 2: <b style={{ color: "#0A3D2A" }}>{group.hotels.makkah.name}</b>
                  {group.hotels.makkah.checkIn && <span style={{ color: "#888" }}> (Check-in: {group.hotels.makkah.checkIn})</span>}
                </div>
              )}
              {group.hotels?.madinah?.name && (
                <div>Madinah: <b style={{ color: "#0A3D2A" }}>{group.hotels.madinah.name}</b>
                  {group.hotels.madinah.checkIn && <span style={{ color: "#888" }}> (Check-in: {group.hotels.madinah.checkIn})</span>}
                </div>
              )}
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Sr.</th>
                <th style={thStyle}>Photo</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Passport</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Room No.</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Bus No.</th>
                <th style={thStyle}>Makkah 2 Hotel</th>
                <th style={thStyle}>Makkah 2 Check-in</th>
                <th style={thStyle}>Makkah 2 Check-out</th>
                <th style={thStyle}>Madinah Hotel</th>
                <th style={thStyle}>Madinah Check-in</th>
                <th style={thStyle}>Madinah Check-out</th>
              </tr>
            </thead>
            <tbody>
              {pilgrims.map((p, i) => (
                <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f5faf7" }}>
                  <td style={{ ...tdStyle, fontWeight: 700, textAlign: "center" }}>{p.serialNumber}</td>
                  <td style={{ ...tdStyle, padding: "1mm 2mm" }}>
                    {p.photoUrl ? (
                      <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "8mm", height: "10mm", objectFit: "cover", borderRadius: "2px" }} />
                    ) : (
                      <div style={{ width: "8mm", height: "10mm", background: "#f0f0f0", borderRadius: "2px" }} />
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.fullName}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "7.5pt" }}>{p.passportNumber || "—"}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, textAlign: "center", color: "#0A3D2A", fontSize: "10pt" }}>{p.roomNumber || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: "#1a2744" }}>{p.busNumber || "—"}</td>
                  <td style={tdStyle}>{group.hotels?.makkah?.name || "—"}</td>
                  <td style={{ ...tdStyle, color: "#C9A23F", fontWeight: 600 }}>{group.hotels?.makkah?.checkIn || "—"}</td>
                  <td style={tdStyle}>{group.hotels?.makkah?.checkOut || "—"}</td>
                  <td style={tdStyle}>{group.hotels?.madinah?.name || "—"}</td>
                  <td style={{ ...tdStyle, color: "#C9A23F", fontWeight: 600 }}>{group.hotels?.madinah?.checkIn || "—"}</td>
                  <td style={tdStyle}>{group.hotels?.madinah?.checkOut || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: "4mm", fontSize: "8pt", textAlign: "center", color: "#888", borderTop: "1px solid #e0e0e0", paddingTop: "3mm" }}>
            Total Pilgrims: <b>{pilgrims.length}</b> &nbsp;|&nbsp; Generated: {new Date().toLocaleDateString("en-IN")}
          </div>
        </div>
      </div>
    </>
  );
}
