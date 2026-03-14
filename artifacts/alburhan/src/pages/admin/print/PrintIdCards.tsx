import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  visaNumber?: string; photoUrl?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  hotels?: { makkah?: { name?: string; address?: string }; madinah?: { name?: string; address?: string } };
}

export default function PrintIdCards() {
  const [, params] = useRoute("/admin/groups/:groupId/print/id-cards");
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
    if (pilgrims.length > 0) setTimeout(() => window.print(), 500);
  }, [pilgrims]);

  if (!group) return <div className="p-8 text-center">Loading...</div>;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        .id-card { width: 85.6mm; height: 53.98mm; border: 1px solid #ccc; border-radius: 4px; overflow: hidden; page-break-inside: avoid; font-family: Arial, sans-serif; }
        .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
        .page-break { page-break-after: always; }
      `}</style>

      <div className="no-print p-4 bg-amber-50 text-center">
        <button onClick={() => window.print()} className="px-6 py-2 bg-primary text-white rounded-lg font-medium mr-4">Print ID Cards</button>
        <button onClick={() => window.history.back()} className="px-6 py-2 border rounded-lg">Back</button>
      </div>

      {(() => {
        const pages: Pilgrim[][] = [];
        for (let i = 0; i < pilgrims.length; i += 4) {
          pages.push(pilgrims.slice(i, i + 4));
        }
        return pages.map((page, pi) => (
          <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""}>
            <div className="cards-grid" style={{ padding: "2mm" }}>
              {page.map(p => (
                <div key={`front-${p.id}`} className="id-card" style={{ display: "flex", flexDirection: "column", fontSize: "7pt", background: "#fff" }}>
                  <div style={{ background: "#1a5632", color: "#fff", padding: "1.5mm 3mm", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: "bold", fontSize: "8pt" }}>Al Burhan Tours & Travels</div>
                    <div style={{ fontSize: "6pt" }}>#{p.serialNumber}</div>
                  </div>
                  <div style={{ display: "flex", flex: 1, padding: "1.5mm" }}>
                    <div style={{ width: "20mm", marginRight: "2mm", flexShrink: 0 }}>
                      {p.photoUrl ? (
                        <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "20mm", height: "25mm", objectFit: "cover", border: "1px solid #ddd" }} />
                      ) : (
                        <div style={{ width: "20mm", height: "25mm", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #ddd", fontSize: "6pt", color: "#999" }}>Photo</div>
                      )}
                    </div>
                    <div style={{ flex: 1, fontSize: "6pt", lineHeight: 1.3, overflow: "hidden" }}>
                      <div style={{ fontWeight: "bold", fontSize: "7.5pt", marginBottom: "0.5mm" }}>{p.fullName}</div>
                      {p.passportNumber && (
                        <div style={{ marginBottom: "0.5mm" }}>
                          <div style={{ fontSize: "5pt", color: "#666" }}>PASSPORT</div>
                          <div style={{ overflow: "hidden", maxHeight: "8mm" }}><Barcode value={p.passportNumber} height={14} width={0.8} fontSize={5} /></div>
                        </div>
                      )}
                      {group.hotels?.makkah?.name && <div style={{ fontSize: "5.5pt" }}>Makkah: {group.hotels.makkah.name}</div>}
                      {group.hotels?.makkah?.address && <div style={{ fontSize: "5pt", color: "#555" }}>{group.hotels.makkah.address}</div>}
                      {group.hotels?.madinah?.name && <div style={{ fontSize: "5.5pt" }}>Madinah: {group.hotels.madinah.name}</div>}
                      {group.hotels?.madinah?.address && <div style={{ fontSize: "5pt", color: "#555" }}>{group.hotels.madinah.address}</div>}
                    </div>
                  </div>
                  <div style={{ background: "#f8f8f8", padding: "1mm 3mm", borderTop: "1px solid #eee", fontSize: "5.5pt", display: "flex", justifyContent: "space-between" }}>
                    <span>Emergency: 0547090786</span>
                    <span>India: 0568780786</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="cards-grid" style={{ padding: "2mm", marginTop: "4mm" }}>
              {page.map(p => (
                <div key={`back-${p.id}`} className="id-card" style={{ display: "flex", flexDirection: "column", fontSize: "7pt", background: "#fff" }}>
                  <div style={{ background: "#1a5632", color: "#fff", padding: "1.5mm 3mm", fontWeight: "bold", fontSize: "7.5pt" }}>
                    Al Burhan Tours & Travels
                  </div>
                  <div style={{ flex: 1, padding: "2mm", fontSize: "6.5pt", lineHeight: 1.5 }}>
                    <div style={{ fontWeight: "bold", marginBottom: "1mm" }}>{p.fullName} (#{p.serialNumber})</div>
                    {p.passportNumber && (
                      <div style={{ marginBottom: "1mm" }}>
                        <span style={{ fontSize: "5.5pt", color: "#666" }}>PP: </span>
                        <span style={{ fontFamily: "monospace", letterSpacing: "1px" }}>{p.passportNumber}</span>
                      </div>
                    )}
                    {p.visaNumber && (
                      <div style={{ marginBottom: "1.5mm" }}>
                        <div style={{ fontSize: "5pt", color: "#666" }}>VISA</div>
                        <div style={{ overflow: "hidden", maxHeight: "8mm" }}><Barcode value={p.visaNumber} height={14} width={0.8} fontSize={5} /></div>
                      </div>
                    )}
                    {group.hotels?.makkah && (
                      <div style={{ marginBottom: "1.5mm" }}>
                        <div style={{ fontWeight: "bold", color: "#1a5632", fontSize: "6pt" }}>Makkah Hotel:</div>
                        <div>{group.hotels.makkah.name}</div>
                        {group.hotels.makkah.address && <div style={{ fontSize: "6pt", color: "#555" }}>{group.hotels.makkah.address}</div>}
                      </div>
                    )}
                    {group.hotels?.madinah && (
                      <div>
                        <div style={{ fontWeight: "bold", color: "#1a5632", fontSize: "6pt" }}>Madinah Hotel:</div>
                        <div>{group.hotels.madinah.name}</div>
                        {group.hotels.madinah.address && <div style={{ fontSize: "6pt", color: "#555" }}>{group.hotels.madinah.address}</div>}
                      </div>
                    )}
                  </div>
                  <div style={{ background: "#f8f8f8", padding: "1mm 3mm", borderTop: "1px solid #eee", fontSize: "5.5pt", textAlign: "center" }}>
                    {group.groupName} — {group.year} | Maktab: {group.maktabNumber || "N/A"}
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
