import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  dateOfBirth?: string; gender?: string; city?: string;
}
interface Group {
  id: string; groupName: string; year: number; departureDate?: string;
  returnDate?: string; flightNumber?: string; departureCity?: string;
}

export default function PrintAirlineList() {
  const [, params] = useRoute("/admin/groups/:groupId/print/airline-list");
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

  const thStyle: React.CSSProperties = { background: "#1a2744", color: "#fff", padding: "3mm 3mm", textAlign: "left", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #1a2744" };
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
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#1a2744", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>Print Airline Passenger List</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div style={{ padding: "4mm", fontFamily: "'Inter', Arial, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "5mm", borderBottom: "3px solid #1a2744", paddingBottom: "4mm" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "18pt", color: "#0A3D2A" }}>Al Burhan Tours & Travels</div>
            <div style={{ fontSize: "13pt", fontWeight: 700, marginTop: "1mm", color: "#1a2744" }}>Airline Passenger Manifest</div>
          </div>
          <div style={{ textAlign: "right", fontSize: "8.5pt", color: "#333", lineHeight: 1.8 }}>
            <div>Group: <b>{group.groupName}</b></div>
            {group.flightNumber && <div>Flight: <b style={{ color: "#1a2744", fontSize: "10pt" }}>{group.flightNumber}</b></div>}
            {group.departureDate && <div>Departure: <b>{group.departureDate}</b></div>}
            <div>From: <b>{group.departureCity || "Mumbai (BOM)"}</b></div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "center" }}>S.No.</th>
              <th style={thStyle}>Pilgrim Name</th>
              <th style={thStyle}>Passport No.</th>
              <th style={thStyle}>Date of Birth</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Gender</th>
              <th style={thStyle}>Nationality</th>
              <th style={thStyle}>City</th>
              <th style={thStyle}>Seat Pref.</th>
              <th style={thStyle}>Flight No.</th>
              <th style={thStyle}>Departure Date</th>
            </tr>
          </thead>
          <tbody>
            {pilgrims.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f0f4fa" }}>
                <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{p.serialNumber}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{p.fullName}</td>
                <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "8pt", letterSpacing: "0.5px" }}>{p.passportNumber || "—"}</td>
                <td style={tdStyle}>{p.dateOfBirth || "—"}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{p.gender || "—"}</td>
                <td style={tdStyle}>Indian</td>
                <td style={tdStyle}>{p.city || "—"}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>—</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{group.flightNumber || "—"}</td>
                <td style={tdStyle}>{group.departureDate || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: "6mm", display: "flex", justifyContent: "space-between", fontSize: "8pt", color: "#888", borderTop: "1px solid #e0e0e0", paddingTop: "3mm" }}>
          <div>Total Passengers: <b>{pilgrims.length}</b></div>
          <div>Generated: {new Date().toLocaleDateString("en-IN")}</div>
        </div>

        <div style={{ marginTop: "10mm", display: "flex", justifyContent: "space-between", paddingTop: "12mm" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1px solid #333", width: "60mm", paddingTop: "2mm", fontSize: "8pt" }}>Authorized Signatory</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1px solid #333", width: "60mm", paddingTop: "2mm", fontSize: "8pt" }}>Tour Operator Stamp</div>
          </div>
        </div>
      </div>
    </>
  );
}
