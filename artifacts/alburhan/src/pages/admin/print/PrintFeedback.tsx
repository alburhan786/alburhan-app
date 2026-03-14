import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { PrintHeader } from "./PrintHeader";

const API = import.meta.env.VITE_API_URL || "";

interface Group { id: string; groupName: string; year: number; departureDate?: string; returnDate?: string; }

const categories = [
  "Accommodation — Makkah",
  "Accommodation — Madinah",
  "Transportation",
  "Food & Meals",
  "Guide / Tour Leader Service",
  "Visa & Documentation Processing",
  "Overall Experience",
];

export default function PrintFeedback() {
  const [, params] = useRoute("/admin/groups/:groupId/print/feedback");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);

  useEffect(() => {
    if (!groupId) return;
    fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()).then(setGroup);
  }, [groupId]);

  useEffect(() => {
    if (group) setTimeout(() => window.print(), 800);
  }, [group]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>Print Feedback Form</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div style={{ padding: "2mm", fontFamily: "'Inter', Arial, sans-serif", maxWidth: "210mm", margin: "0 auto" }}>
        <PrintHeader title="Customer Feedback Form" subtitle={`${group.groupName} — ${group.year}${group.departureDate ? ` | ${group.departureDate}` : ""}${group.returnDate ? ` to ${group.returnDate}` : ""}`} />

        <div style={{ marginBottom: "6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm", fontSize: "10pt" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Pilgrim Name:</span>
              <div style={{ flex: 1, borderBottom: "1px solid #999", minHeight: "7mm" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Mobile:</span>
              <div style={{ flex: 1, borderBottom: "1px solid #999", minHeight: "7mm" }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: "6mm" }}>
          <div style={{ fontSize: "9pt", color: "#666", marginBottom: "3mm" }}>
            Please rate each aspect of your trip on a scale of 1 to 5 (1 = Poor, 5 = Excellent). Mark the appropriate box.
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
            <thead>
              <tr>
                <th style={{ background: "#0A3D2A", color: "#fff", padding: "3mm 4mm", textAlign: "left", fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>Service Category</th>
                {[1, 2, 3, 4, 5].map(n => (
                  <th key={n} style={{ background: "#0A3D2A", color: "#fff", padding: "3mm 2mm", textAlign: "center", fontSize: "8pt", width: "14mm", border: "1px solid #0A3D2A" }}>
                    <div>{n}</div>
                    <div style={{ fontSize: "5pt", opacity: 0.8, marginTop: "0.5mm" }}>
                      {n === 1 ? "Poor" : n === 2 ? "Fair" : n === 3 ? "Good" : n === 4 ? "V.Good" : "Excellent"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, i) => (
                <tr key={cat} style={{ background: i % 2 === 0 ? "#fff" : "#f5faf7" }}>
                  <td style={{ border: "1px solid #ddd", padding: "3mm 4mm", fontWeight: 600 }}>{cat}</td>
                  {[1, 2, 3, 4, 5].map(n => (
                    <td key={n} style={{ border: "1px solid #ddd", padding: "3mm 2mm", textAlign: "center" }}>
                      <div style={{ width: "6mm", height: "6mm", border: "1.5px solid #888", borderRadius: "2px", margin: "0 auto" }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginBottom: "6mm" }}>
          <div style={{ fontWeight: 700, fontSize: "10pt", marginBottom: "2mm" }}>What did you like most about the trip?</div>
          <div style={{ border: "1px solid #ccc", borderRadius: "4px", minHeight: "22mm", padding: "2mm" }} />
        </div>

        <div style={{ marginBottom: "6mm" }}>
          <div style={{ fontWeight: 700, fontSize: "10pt", marginBottom: "2mm" }}>Areas for improvement / Suggestions:</div>
          <div style={{ border: "1px solid #ccc", borderRadius: "4px", minHeight: "22mm", padding: "2mm" }} />
        </div>

        <div style={{ marginBottom: "6mm" }}>
          <div style={{ fontWeight: 700, fontSize: "10pt", marginBottom: "2mm" }}>Would you recommend Al Burhan Tours & Travels to others?</div>
          <div style={{ display: "flex", gap: "8mm", fontSize: "10pt", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
              <div style={{ width: "5mm", height: "5mm", border: "1.5px solid #888", borderRadius: "2px" }} />
              Yes, definitely
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
              <div style={{ width: "5mm", height: "5mm", border: "1.5px solid #888", borderRadius: "2px" }} />
              Maybe
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
              <div style={{ width: "5mm", height: "5mm", border: "1.5px solid #888", borderRadius: "2px" }} />
              No
            </label>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12mm", paddingTop: "8mm" }}>
          <div>
            <div style={{ fontSize: "9pt", color: "#666", marginBottom: "1mm" }}>Date: _______________</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ borderTop: "1px solid #333", width: "60mm", paddingTop: "2mm", fontSize: "8pt" }}>Pilgrim Signature</div>
          </div>
        </div>

        <div style={{ marginTop: "8mm", textAlign: "center", fontSize: "7pt", color: "#aaa", borderTop: "1px solid #e0e0e0", paddingTop: "3mm" }}>
          Thank you for your valuable feedback. It helps us serve you better. — Al Burhan Tours & Travels, Burhanpur
        </div>
      </div>
    </>
  );
}
