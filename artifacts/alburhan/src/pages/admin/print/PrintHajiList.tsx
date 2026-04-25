import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { PrintHeader } from "./PrintHeader";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string;
  serialNumber: number;
  fullName: string;
  salutation?: string;
  gender?: string;
  dateOfBirth?: string;
  passportNumber?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  passportPlaceOfIssue?: string;
  visaNumber?: string;
  mobileIndia?: string;
  bloodGroup?: string;
  photoUrl?: string;
}

interface Group {
  id: string;
  groupName: string;
  year: number;
  departureDate?: string;
  returnDate?: string;
  flightNumber?: string;
  maktabNumber?: string;
}

function deriveTitle(gender?: string): string {
  if (!gender) return "";
  const g = gender.toLowerCase();
  if (g === "female") return "Mrs.";
  if (g === "male") return "Mr.";
  return "";
}

export default function PrintHajiList() {
  const [, params] = useRoute("/admin/groups/:groupId/print/haji-list");
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
      await downloadPdf(contentRef.current, {
        filename: `Haji-List-${group?.groupName || "group"}-${group?.year || ""}.pdf`,
        orientation: "landscape",
      });
    } finally {
      setPdfLoading(false);
    }
  }, [group, pdfLoading]);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => {
      setGroup(g);
      setPilgrims(Array.isArray(p) ? p : []);
    });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const thStyle: React.CSSProperties = {
    background: "#0A3D2A",
    color: "#fff",
    padding: "2.5mm 2mm",
    textAlign: "center",
    fontSize: "6.5pt",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    border: "1px solid #0A3D2A",
    fontWeight: 700,
  };
  const tdStyle: React.CSSProperties = {
    border: "1px solid #d4ddd4",
    padding: "1.5mm 2mm",
    fontSize: "7.5pt",
    verticalAlign: "middle",
  };

  const groupMeta = [
    group.departureDate ? `Departure: ${group.departureDate}` : null,
    group.returnDate ? `Return: ${group.returnDate}` : null,
    group.flightNumber ? `Flight: ${group.flightNumber}` : null,
    group.maktabNumber ? `Maktab No: ${group.maktabNumber}` : null,
    `Total Pilgrims: ${pilgrims.length}`,
  ].filter(Boolean).join("   |   ");

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 7mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#f0fdf4", borderBottom: "2px solid #0A3D2A", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", opacity: pdfLoading ? 0.6 : 1 }}>
          {pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}
        </button>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#C9A23F", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          🖨 Print
        </button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>
          Back
        </button>
      </div>

      <div ref={contentRef}>
        <div style={{ padding: "5mm", fontFamily: "'Inter', Arial, sans-serif" }}>
          <PrintHeader title="HAJI LIST" subtitle={`${group.groupName} (${group.year})`} company={company} />

          {groupMeta && (
            <div style={{
              display: "flex",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: "0 6mm",
              fontSize: "8pt",
              color: "#444",
              lineHeight: 1.8,
              marginTop: "-4mm",
              marginBottom: "4mm",
              background: "#f5faf7",
              padding: "2mm 4mm",
              borderRadius: "2mm",
              border: "1px solid #d4ddd4",
            }}>
              {groupMeta.split("   |   ").map((item, i) => {
                const colonIdx = item.indexOf(":");
                const label = colonIdx >= 0 ? item.slice(0, colonIdx) : item;
                const value = colonIdx >= 0 ? item.slice(colonIdx) : "";
                return (
                  <span key={i}>
                    {i > 0 && <span style={{ color: "#C9A23F", margin: "0 2mm" }}>|</span>}
                    <b style={{ color: "#0A3D2A" }}>{label}</b>{value}
                  </span>
                );
              })}
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "6.5%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "8.5%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8.5%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8.5%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}>S.No.</th>
                <th style={thStyle}>Photo</th>
                <th style={thStyle}>Title</th>
                <th style={{ ...thStyle, textAlign: "left", paddingLeft: "3mm" }}>Full Name</th>
                <th style={thStyle}>Date of Birth</th>
                <th style={thStyle}>Passport No.</th>
                <th style={thStyle}>Issue Date</th>
                <th style={thStyle}>Place of Issue</th>
                <th style={thStyle}>Expiry Date</th>
                <th style={thStyle}>Visa No.</th>
                <th style={thStyle}>Mobile</th>
                <th style={thStyle}>Blood Grp</th>
              </tr>
            </thead>
            <tbody>
              {pilgrims.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: "12mm", fontSize: "9pt" }}>
                    No pilgrims registered in this group.
                  </td>
                </tr>
              ) : pilgrims.map((p, i) => {
                const title = p.salutation || deriveTitle(p.gender);
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f5faf7" }}>
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, fontSize: "9pt", color: "#0A3D2A" }}>
                      {p.serialNumber}
                    </td>
                    <td style={{ ...tdStyle, padding: "1mm", textAlign: "center" }}>
                      {p.photoUrl ? (
                        <img
                          src={`${API}${p.photoUrl}`}
                          alt=""
                          style={{ width: "10mm", height: "13mm", objectFit: "cover", borderRadius: "1mm", display: "block", margin: "auto" }}
                        />
                      ) : (
                        <div style={{ width: "10mm", height: "13mm", background: "#e8f0e8", borderRadius: "1mm", margin: "auto", border: "1px dashed #aaa" }} />
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "7pt", color: "#555" }}>
                      {title}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, fontSize: "8pt" }}>
                      {p.fullName}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "7.5pt" }}>
                      {p.dateOfBirth || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontFamily: "monospace", fontSize: "7pt", letterSpacing: "0.3px", fontWeight: 600 }}>
                      {p.passportNumber || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "7pt" }}>
                      {p.passportIssueDate || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "7pt" }}>
                      {p.passportPlaceOfIssue || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "7pt", color: p.passportExpiryDate ? "#000" : "#aaa" }}>
                      {p.passportExpiryDate || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontFamily: "monospace", fontSize: "7pt", color: "#1a2744" }}>
                      {p.visaNumber || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "7pt" }}>
                      {p.mobileIndia || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", fontSize: "7pt", fontWeight: 600, color: "#C9A23F" }}>
                      {p.bloodGroup || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{
            marginTop: "5mm",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: "8pt",
            color: "#888",
            borderTop: "1px solid #d4ddd4",
            paddingTop: "3mm",
          }}>
            <div>
              Total Pilgrims: <b style={{ color: "#0A3D2A", fontSize: "9pt" }}>{pilgrims.length}</b>
            </div>
            <div>Generated: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</div>
          </div>

          <div style={{ marginTop: "10mm", display: "flex", justifyContent: "space-between", paddingTop: "10mm" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #333", width: "60mm", paddingTop: "2mm", fontSize: "8pt", color: "#555" }}>
                Authorized Signatory
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #333", width: "60mm", paddingTop: "2mm", fontSize: "8pt", color: "#555" }}>
                Tour Operator Stamp
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
