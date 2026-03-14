import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  visaNumber?: string; photoUrl?: string; mobileIndia?: string; gender?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  hotels?: { makkah?: { name?: string; address?: string }; madinah?: { name?: string; address?: string } };
}

const DARK = "#0A3D2A";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

function WaveFront({ side }: { side: "front" | "back" }) {
  return (
    <>
      <div style={{
        position: "absolute",
        top: side === "front" ? "-8mm" : "-8mm",
        right: side === "front" ? "-6mm" : undefined,
        left: side === "back" ? "-6mm" : undefined,
        width: "28mm",
        height: "28mm",
        background: DARK,
        borderRadius: side === "front" ? "0 0 0 50%" : "0 0 50% 0",
        zIndex: 0,
      }} />
      <div style={{
        position: "absolute",
        bottom: side === "front" ? "-6mm" : "-6mm",
        left: side === "front" ? "-4mm" : undefined,
        right: side === "back" ? "-4mm" : undefined,
        width: "22mm",
        height: "22mm",
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
        borderRadius: side === "front" ? "0 50% 0 0" : "50% 0 0 0",
        zIndex: 0,
      }} />
    </>
  );
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
    if (pilgrims.length > 0) setTimeout(() => window.print(), 800);
  }, [pilgrims]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .id-card {
          width: 80mm; height: 50mm;
          border: 1px solid #ccc; border-radius: 4px; overflow: hidden;
          page-break-inside: avoid; font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
        }
        .cards-row { display: flex; gap: 6mm; justify-content: center; margin-bottom: 6mm; }
        .page-break { page-break-after: always; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>Print ID Cards</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      {pages.map((page, pi) => (
        <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""} style={{ padding: "10mm 0" }}>
          <div className="cards-row">
            {page.map(p => (
              <div key={`front-${p.id}`} className="id-card">
                <WaveFront side="front" />

                <div style={{ position: "relative", zIndex: 1, display: "flex", height: "100%", padding: "3mm" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "24mm", flexShrink: 0 }}>
                    <img src={`${BASE}images/logo.png`} alt="" style={{ height: "7mm", objectFit: "contain", marginBottom: "1.5mm" }} />
                    {p.photoUrl ? (
                      <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "20mm", height: "20mm", objectFit: "cover", borderRadius: "50%", border: `2px solid ${GOLD}` }} />
                    ) : (
                      <div style={{ width: "20mm", height: "20mm", background: "#f0f0f0", borderRadius: "50%", border: `2px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "6pt", color: "#aaa" }}>PHOTO</div>
                    )}
                    <div style={{ fontSize: "5pt", color: GOLD, fontWeight: 700, marginTop: "1mm" }}>HAJJ {group.year}</div>
                  </div>

                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: "2mm" }}>
                    <div style={{ fontSize: "4pt", color: "#999", letterSpacing: "1px", textTransform: "uppercase" }}>AL BURHAN TOURS</div>
                    <div style={{ fontSize: "8pt", fontWeight: 800, color: DARK, lineHeight: 1.2, marginBottom: "1.5mm", marginTop: "0.5mm", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "48mm" }}>{p.fullName}</div>

                    <div style={{ fontSize: "5.5pt", lineHeight: 1.8 }}>
                      <div style={{ display: "flex", gap: "1mm" }}>
                        <span style={{ color: "#888", fontSize: "5pt", minWidth: "12mm" }}>Passport</span>
                        <span style={{ fontWeight: 600, fontFamily: "monospace", letterSpacing: "0.5px" }}>{p.passportNumber || "—"}</span>
                      </div>
                      <div style={{ display: "flex", gap: "1mm" }}>
                        <span style={{ color: "#888", fontSize: "5pt", minWidth: "12mm" }}>Maktab</span>
                        <span style={{ fontWeight: 600 }}>{group.maktabNumber || "—"}</span>
                      </div>
                      <div style={{ display: "flex", gap: "1mm" }}>
                        <span style={{ color: "#888", fontSize: "5pt", minWidth: "12mm" }}>Mobile</span>
                        <span style={{ fontWeight: 600 }}>{p.mobileIndia || "—"}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.passportNumber ? (
                        <Barcode value={p.passportNumber} height={14} width={1} fontSize={0} />
                      ) : (
                        <div style={{ fontSize: "5pt", color: "#999" }}>{group.groupName}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ position: "absolute", top: "2mm", right: "3mm", fontSize: "8pt", fontWeight: 800, color: DARK }}>
                    #{String(p.serialNumber).padStart(3, "0")}
                  </div>
                </div>

                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: DARK, color: GOLD, padding: "0.6mm 2mm", fontSize: "4pt", textAlign: "center", fontWeight: 600, zIndex: 2 }}>
                  Emergency: 0547090786 / 0568780786
                </div>
              </div>
            ))}
            {page.length < 2 && <div className="id-card" style={{ border: "1px dashed #ddd", opacity: 0.3 }} />}
          </div>

          <div className="cards-row">
            {page.map(p => (
              <div key={`back-${p.id}`} className="id-card">
                <WaveFront side="back" />
                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", padding: "3mm" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginBottom: "2mm" }}>
                    <img src={`${BASE}images/logo.png`} alt="" style={{ height: "8mm", objectFit: "contain" }} />
                    <div>
                      <div style={{ fontSize: "6pt", fontWeight: 700, color: DARK }}>AL BURHAN TOURS & TRAVELS</div>
                      <div style={{ fontSize: "4pt", color: "#888" }}>Burhanpur, M.P., India</div>
                    </div>
                  </div>

                  <div style={{ fontSize: "6.5pt", fontWeight: 700, color: DARK, marginBottom: "1mm" }}>
                    {p.fullName} <span style={{ color: "#888", fontWeight: 400, fontSize: "5.5pt" }}>#{p.serialNumber}</span>
                  </div>

                  {p.passportNumber && (
                    <div style={{ fontSize: "5.5pt", marginBottom: "0.5mm" }}>
                      <span style={{ color: "#666" }}>Passport: </span>
                      <span style={{ fontFamily: "monospace", letterSpacing: "0.5px", fontWeight: 600 }}>{p.passportNumber}</span>
                    </div>
                  )}
                  {p.visaNumber && (
                    <div style={{ fontSize: "5.5pt", marginBottom: "0.5mm" }}>
                      <span style={{ color: "#666" }}>Visa: </span>
                      <span style={{ fontFamily: "monospace", letterSpacing: "0.5px" }}>{p.visaNumber}</span>
                    </div>
                  )}

                  <div style={{ flex: 1, display: "flex", gap: "2mm", marginTop: "1mm" }}>
                    {group.hotels?.makkah && (
                      <div style={{ flex: 1, padding: "1mm 1.5mm", background: "#f0faf4", borderRadius: "2px", borderLeft: `1.5px solid ${DARK}` }}>
                        <div style={{ fontWeight: 700, color: DARK, fontSize: "4.5pt" }}>MAKKAH</div>
                        <div style={{ fontSize: "5pt", lineHeight: 1.3 }}>{group.hotels.makkah.name}</div>
                        {group.hotels.makkah.address && <div style={{ fontSize: "4pt", color: "#666" }}>{group.hotels.makkah.address}</div>}
                      </div>
                    )}
                    {group.hotels?.madinah && (
                      <div style={{ flex: 1, padding: "1mm 1.5mm", background: "#f0faf4", borderRadius: "2px", borderLeft: `1.5px solid ${DARK}` }}>
                        <div style={{ fontWeight: 700, color: DARK, fontSize: "4.5pt" }}>MADINAH</div>
                        <div style={{ fontSize: "5pt", lineHeight: 1.3 }}>{group.hotels.madinah.name}</div>
                        {group.hotels.madinah.address && <div style={{ fontSize: "4pt", color: "#666" }}>{group.hotels.madinah.address}</div>}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: DARK, color: GOLD, padding: "0.6mm 2mm", fontSize: "4pt", textAlign: "center", fontWeight: 600, zIndex: 2 }}>
                  Emergency Saudi: 0547090786 &nbsp;|&nbsp; India: 0568780786
                </div>
              </div>
            ))}
            {page.length < 2 && <div className="id-card" style={{ border: "1px dashed #ddd", opacity: 0.3 }} />}
          </div>
        </div>
      ))}
    </>
  );
}
