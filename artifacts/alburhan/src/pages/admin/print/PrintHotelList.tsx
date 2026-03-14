import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function PrintHotelList() {
  const [, params] = useRoute("/admin/groups/:groupId/print/hotel-list");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<any>(null);
  const [pilgrims, setPilgrims] = useState<any[]>([]);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => { setGroup(g); setPilgrims(p); });
  }, [groupId]);

  useEffect(() => {
    if (pilgrims.length > 0) setTimeout(() => window.print(), 500);
  }, [pilgrims]);

  if (!group) return <div className="p-8 text-center">Loading...</div>;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        .print-table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9pt; }
        .print-table th, .print-table td { border: 1px solid #333; padding: 2mm 3mm; text-align: left; }
        .print-table th { background: #1a5632; color: #fff; font-size: 8pt; text-transform: uppercase; }
        .print-table tr:nth-child(even) { background: #f8f8f8; }
      `}</style>

      <div className="no-print p-4 bg-amber-50 text-center">
        <button onClick={() => window.print()} className="px-6 py-2 bg-primary text-white rounded-lg font-medium mr-4">Print Hotel Room List</button>
        <button onClick={() => window.history.back()} className="px-6 py-2 border rounded-lg">Back</button>
      </div>

      <div style={{ padding: "4mm", fontFamily: "Arial, sans-serif" }}>
        <div style={{ textAlign: "center", marginBottom: "6mm" }}>
          <div style={{ fontWeight: "bold", fontSize: "16pt", color: "#1a5632" }}>Al Burhan Tours & Travels</div>
          <div style={{ fontSize: "12pt", fontWeight: "bold", marginTop: "2mm" }}>Hotel Room List — {group.groupName} ({group.year})</div>
          {group.hotels?.makkah?.name && <div style={{ fontSize: "9pt", marginTop: "1mm" }}>Makkah: {group.hotels.makkah.name} | Madinah: {group.hotels?.madinah?.name || "—"}</div>}
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Name</th>
              <th>Passport</th>
              <th>Room No.</th>
              <th>Makkah Hotel</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Madinah Hotel</th>
              <th>Check-in</th>
              <th>Check-out</th>
            </tr>
          </thead>
          <tbody>
            {pilgrims.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: "bold" }}>{p.serialNumber}</td>
                <td>{p.fullName}</td>
                <td style={{ fontFamily: "monospace", fontSize: "8pt" }}>{p.passportNumber || "—"}</td>
                <td style={{ fontWeight: "bold" }}>{p.roomNumber || "—"}</td>
                <td>{group.hotels?.makkah?.name || "—"}</td>
                <td>{group.hotels?.makkah?.checkIn || "—"}</td>
                <td>{group.hotels?.makkah?.checkOut || "—"}</td>
                <td>{group.hotels?.madinah?.name || "—"}</td>
                <td>{group.hotels?.madinah?.checkIn || "—"}</td>
                <td>{group.hotels?.madinah?.checkOut || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: "4mm", fontSize: "8pt", textAlign: "center", color: "#666" }}>
          Total Pilgrims: {pilgrims.length} | Generated on {new Date().toLocaleDateString()}
        </div>
      </div>
    </>
  );
}
