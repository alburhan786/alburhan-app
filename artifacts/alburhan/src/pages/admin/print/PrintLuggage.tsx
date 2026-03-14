import { useState, useEffect } from "react";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function PrintLuggage() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage");
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

  const relations = ["Self", "Wife", "Husband", "Mother", "Father", "Son", "Daughter", "Brother", "Sister"];

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        .sticker { width: 100%; border: 2px solid #1a5632; border-radius: 6px; overflow: hidden; page-break-inside: avoid; font-family: Arial, sans-serif; margin-bottom: 4mm; }
        .stickers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
        .page-break { page-break-after: always; }
      `}</style>

      <div className="no-print p-4 bg-amber-50 text-center">
        <button onClick={() => window.print()} className="px-6 py-2 bg-primary text-white rounded-lg font-medium mr-4">Print Luggage Stickers</button>
        <button onClick={() => window.history.back()} className="px-6 py-2 border rounded-lg">Back</button>
      </div>

      {(() => {
        const pages: any[][] = [];
        for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));
        return pages.map((page, pi) => (
          <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""}>
            <div className="stickers-grid" style={{ padding: "2mm" }}>
              {page.map(p => (
                <div key={p.id} className="sticker">
                  <div style={{ background: "#1a5632", color: "#fff", padding: "3mm 4mm", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "bold", fontSize: "11pt" }}>Al Burhan Tours & Travels</div>
                      <div style={{ fontSize: "7pt", opacity: 0.8 }}>Mumbai</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "14pt", fontWeight: "bold" }}>#{p.serialNumber}</div>
                      <div style={{ fontSize: "7pt" }}>{group.year}</div>
                    </div>
                  </div>
                  <div style={{ padding: "4mm", fontSize: "9pt", lineHeight: 1.6 }}>
                    <div style={{ fontWeight: "bold", fontSize: "12pt", marginBottom: "2mm", color: "#1a5632" }}>{p.fullName}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1mm 4mm" }}>
                      <div>Group: <b>{group.groupName}</b></div>
                      <div>City: <b>{p.city || "—"}</b></div>
                      <div>India: <b>{p.mobileIndia || "—"}</b></div>
                      <div>Saudi: <b>{p.mobileSaudi || "—"}</b></div>
                    </div>
                    <div style={{ display: "flex", gap: "2mm", flexWrap: "wrap", marginTop: "3mm" }}>
                      {relations.map(r => (
                        <span key={r} style={{
                          padding: "1mm 3mm", border: "1px solid #ccc", borderRadius: "3px", fontSize: "7pt",
                          background: p.relation === r ? "#1a5632" : "#fff",
                          color: p.relation === r ? "#fff" : "#666",
                          fontWeight: p.relation === r ? "bold" : "normal",
                        }}>{r}</span>
                      ))}
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
