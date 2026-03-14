import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  roomNumber?: string;
}
interface Group {
  id: string; groupName: string; year: number;
  hotels?: { makkah?: { name?: string; address?: string; checkIn?: string; checkOut?: string }; madinah?: { name?: string; address?: string; checkIn?: string; checkOut?: string } };
}

export default function PrintHotelList() {
  const [, params] = useRoute("/admin/groups/:groupId/print/hotel-list");
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

  const thStyle: React.CSSProperties = { background: "#0A3D2A", color: "#fff", padding: "3mm 3mm", textAlign: "left", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" };
  const tdStyle: React.CSSProperties = { border: "1px solid #ddd", padding: "2mm 3mm", fontSize: "8.5pt" };

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

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>Print Hotel Room List</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div style={{ padding: "4mm", fontFamily: "'Inter', Arial, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "5mm", borderBottom: "3px solid #0A3D2A", paddingBottom: "4mm" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "18pt", color: "#0A3D2A" }}>Al Burhan Tours & Travels</div>
            <div style={{ fontSize: "13pt", fontWeight: 700, marginTop: "1mm" }}>Hotel Room List — {group.groupName} ({group.year})</div>
          </div>
          <div style={{ textAlign: "right", fontSize: "8pt", color: "#666", lineHeight: 1.6 }}>
            {group.hotels?.makkah?.name && <div>Makkah: <b>{group.hotels.makkah.name}</b></div>}
            {group.hotels?.madinah?.name && <div>Madinah: <b>{group.hotels.madinah.name}</b></div>}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Sr.</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Passport</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Room No.</th>
              <th style={thStyle}>Makkah Hotel</th>
              <th style={thStyle}>Check-in</th>
              <th style={thStyle}>Check-out</th>
              <th style={thStyle}>Madinah Hotel</th>
              <th style={thStyle}>Check-in</th>
              <th style={thStyle}>Check-out</th>
            </tr>
          </thead>
          <tbody>
            {pilgrims.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f5faf7" }}>
                <td style={{ ...tdStyle, fontWeight: 700, textAlign: "center" }}>{p.serialNumber}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{p.fullName}</td>
                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "7.5pt" }}>{p.passportNumber || "—"}</td>
                <td style={{ ...tdStyle, fontWeight: 700, textAlign: "center", color: "#0A3D2A", fontSize: "10pt" }}>{p.roomNumber || "—"}</td>
                <td style={tdStyle}>{group.hotels?.makkah?.name || "—"}</td>
                <td style={tdStyle}>{group.hotels?.makkah?.checkIn || "—"}</td>
                <td style={tdStyle}>{group.hotels?.makkah?.checkOut || "—"}</td>
                <td style={tdStyle}>{group.hotels?.madinah?.name || "—"}</td>
                <td style={tdStyle}>{group.hotels?.madinah?.checkIn || "—"}</td>
                <td style={tdStyle}>{group.hotels?.madinah?.checkOut || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: "4mm", fontSize: "8pt", textAlign: "center", color: "#888", borderTop: "1px solid #e0e0e0", paddingTop: "3mm" }}>
          Total Pilgrims: <b>{pilgrims.length}</b> &nbsp;|&nbsp; Generated: {new Date().toLocaleDateString("en-IN")}
        </div>
      </div>
    </>
  );
}
