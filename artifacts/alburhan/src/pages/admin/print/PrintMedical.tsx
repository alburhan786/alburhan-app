import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function PrintMedical() {
  const [, params] = useRoute("/admin/groups/:groupId/print/medical");
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

  function calcAge(dob: string | undefined): string {
    if (!dob) return "—";
    const parts = dob.split("/");
    if (parts.length === 3) {
      const birthYear = parseInt(parts[2], 10);
      return String(new Date().getFullYear() - birthYear);
    }
    return "—";
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        .med-sticker { width: 100%; border: 2px solid #c0392b; border-radius: 6px; overflow: hidden; page-break-inside: avoid; font-family: Arial, sans-serif; margin-bottom: 4mm; }
        .med-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
        .page-break { page-break-after: always; }
      `}</style>

      <div className="no-print p-4 bg-amber-50 text-center">
        <button onClick={() => window.print()} className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium mr-4">Print Medical Stickers</button>
        <button onClick={() => window.history.back()} className="px-6 py-2 border rounded-lg">Back</button>
      </div>

      {(() => {
        const pages: any[][] = [];
        for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));
        return pages.map((page, pi) => (
          <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""}>
            <div className="med-grid" style={{ padding: "2mm" }}>
              {page.map(p => (
                <div key={p.id} className="med-sticker">
                  <div style={{ background: "#c0392b", color: "#fff", padding: "3mm 4mm", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "bold", fontSize: "10pt" }}>Al Burhan Tours & Travels</div>
                      <div style={{ fontSize: "7pt", opacity: 0.8 }}>MEDICAL INFORMATION</div>
                    </div>
                    <div style={{ fontSize: "8pt", fontWeight: "bold" }}>
                      {p.coverNumber || `#${p.serialNumber}`}
                    </div>
                  </div>
                  <div style={{ padding: "4mm", fontSize: "9pt", lineHeight: 1.7 }}>
                    {p.passportNumber && (
                      <div style={{ marginBottom: "2mm", fontFamily: "monospace", letterSpacing: "2px", fontSize: "10pt", textAlign: "center", padding: "2mm", background: "#f8f8f8", borderRadius: "3px" }}>
                        {p.passportNumber}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1mm 4mm", fontSize: "8.5pt" }}>
                      <span style={{ fontWeight: "bold" }}>Name:</span><span>{p.fullName}</span>
                      <span style={{ fontWeight: "bold" }}>Age:</span><span>{calcAge(p.dateOfBirth)}</span>
                      <span style={{ fontWeight: "bold" }}>Gender:</span><span>{p.gender || "—"}</span>
                      <span style={{ fontWeight: "bold" }}>Blood Group:</span>
                      <span style={{ color: "#c0392b", fontWeight: "bold", fontSize: "10pt" }}>{p.bloodGroup || "—"}</span>
                      <span style={{ fontWeight: "bold" }}>Contact:</span><span>{p.mobileIndia || "—"}</span>
                      <span style={{ fontWeight: "bold" }}>Address:</span><span>{[p.address, p.city, p.state].filter(Boolean).join(", ") || "—"}</span>
                    </div>
                    <div style={{ marginTop: "3mm", padding: "2mm 3mm", background: "#fdf2f2", borderRadius: "3px", fontSize: "7.5pt", border: "1px solid #f5c6cb" }}>
                      <div style={{ fontWeight: "bold", color: "#c0392b", marginBottom: "1mm" }}>EMERGENCY CONTACTS</div>
                      <div>Saudi: <b>0547090786</b> &nbsp;|&nbsp; India: <b>0568780786</b></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ));
      })()}
    </>
  );
}
