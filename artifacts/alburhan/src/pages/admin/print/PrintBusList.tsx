import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function PrintBusList() {
  const [, params] = useRoute("/admin/groups/:groupId/print/bus-list");
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
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        .print-table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9pt; }
        .print-table th, .print-table td { border: 1px solid #333; padding: 2mm 3mm; text-align: left; }
        .print-table th { background: #1a5632; color: #fff; font-size: 8pt; text-transform: uppercase; }
        .print-table tr:nth-child(even) { background: #f8f8f8; }
      `}</style>

      <div className="no-print p-4 bg-amber-50 text-center">
        <button onClick={() => window.print()} className="px-6 py-2 bg-primary text-white rounded-lg font-medium mr-4">Print Bus List</button>
        <button onClick={() => window.history.back()} className="px-6 py-2 border rounded-lg">Back</button>
      </div>

      <div style={{ padding: "4mm", fontFamily: "Arial, sans-serif" }}>
        <div style={{ textAlign: "center", marginBottom: "6mm" }}>
          <div style={{ fontWeight: "bold", fontSize: "16pt", color: "#1a5632" }}>Al Burhan Tours & Travels</div>
          <div style={{ fontSize: "12pt", fontWeight: "bold", marginTop: "2mm" }}>Bus List — {group.groupName} ({group.year})</div>
          {group.flightNumber && <div style={{ fontSize: "9pt", marginTop: "1mm" }}>Flight: {group.flightNumber}</div>}
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Name</th>
              <th>Passport</th>
              <th>Bus No.</th>
              <th>Group</th>
              <th>Mobile (India)</th>
              <th>Mobile (Saudi)</th>
              <th>City</th>
              <th>Relation</th>
            </tr>
          </thead>
          <tbody>
            {pilgrims.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: "bold" }}>{p.serialNumber}</td>
                <td>{p.fullName}</td>
                <td style={{ fontFamily: "monospace", fontSize: "8pt" }}>{p.passportNumber || "—"}</td>
                <td style={{ fontWeight: "bold" }}>{p.busNumber || "—"}</td>
                <td>{group.groupName}</td>
                <td>{p.mobileIndia || "—"}</td>
                <td>{p.mobileSaudi || "—"}</td>
                <td>{p.city || "—"}</td>
                <td>{p.relation || "—"}</td>
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
