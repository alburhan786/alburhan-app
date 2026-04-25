import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { PrintHeader } from "./PrintHeader";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  photoUrl?: string; busNumber?: string; mobileIndia?: string; mobileSaudi?: string;
  city?: string; relation?: string;
}
interface Group { id: string; groupName: string; year: number; flightNumber?: string; }

export default function PrintBusList() {
  const [, params] = useRoute("/admin/groups/:groupId/print/bus-list");
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
        await downloadPdf(contentRef.current, { filename: `Bus-List-${group?.groupName || "group"}.pdf` });
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
        <PrintHeader title="Bus Seating List" subtitle={`${group.groupName} (${group.year})${group.flightNumber ? ` | Flight: ${group.flightNumber}` : ""}`} company={company} />

        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Inter', Arial, sans-serif", fontSize: "8.5pt" }}>
          <thead>
            <tr>
              <th style={{ background: "#0A3D2A", color: "#fff", padding: "2.5mm 2mm", textAlign: "center", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>Sr.</th>
              <th style={{ background: "#0A3D2A", color: "#fff", padding: "2.5mm 2mm", textAlign: "center", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>Photo</th>
              <th style={{ background: "#0A3D2A", color: "#fff", padding: "2.5mm 3mm", textAlign: "left", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>Name</th>
              <th style={{ background: "#0A3D2A", color: "#fff", padding: "2.5mm 3mm", textAlign: "left", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>Passport</th>
              <th style={{ background: "#0A3D2A", color: "#fff", padding: "2.5mm 2mm", textAlign: "center", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>Bus</th>
              <th style={{ background: "#0A3D2A", color: "#fff", padding: "2.5mm 3mm", textAlign: "left", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>Mobile (India)</th>
              <th style={{ background: "#0A3D2A", color: "#fff", padding: "2.5mm 3mm", textAlign: "left", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>City</th>
              <th style={{ background: "#0A3D2A", color: "#fff", padding: "2.5mm 3mm", textAlign: "left", fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0A3D2A" }}>Relation</th>
            </tr>
          </thead>
          <tbody>
            {pilgrims.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8faf8" }}>
                <td style={{ border: "1px solid #ddd", padding: "1.5mm 2mm", textAlign: "center", fontWeight: 700 }}>{p.serialNumber}</td>
                <td style={{ border: "1px solid #ddd", padding: "1mm", textAlign: "center" }}>
                  {p.photoUrl ? (
                    <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "8mm", height: "10mm", objectFit: "cover", borderRadius: "2px" }} />
                  ) : (
                    <div style={{ width: "8mm", height: "10mm", background: "#eee", borderRadius: "2px", margin: "0 auto" }} />
                  )}
                </td>
                <td style={{ border: "1px solid #ddd", padding: "1.5mm 3mm", fontWeight: 600 }}>{p.fullName}</td>
                <td style={{ border: "1px solid #ddd", padding: "1.5mm 3mm", fontFamily: "monospace", fontSize: "7.5pt" }}>{p.passportNumber || "—"}</td>
                <td style={{ border: "1px solid #ddd", padding: "1.5mm 2mm", textAlign: "center", fontWeight: 700, color: "#0A3D2A" }}>{p.busNumber || "—"}</td>
                <td style={{ border: "1px solid #ddd", padding: "1.5mm 3mm" }}>{p.mobileIndia || "—"}</td>
                <td style={{ border: "1px solid #ddd", padding: "1.5mm 3mm" }}>{p.city || "—"}</td>
                <td style={{ border: "1px solid #ddd", padding: "1.5mm 3mm" }}>{p.relation || "—"}</td>
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
