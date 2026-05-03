import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; photoUrl?: string;
  mobileIndia?: string; mobileSaudi?: string; city?: string;
  passportNumber?: string; busNumber?: string;
}
interface Group {
  id: string; groupName: string; year: number; maktabNumber?: string;
  startingSerialNumber?: number;
  hotels?: {
    groupLeader?: string;
    makkah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    madinah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
    aziziah?: { name?: string; address?: string; nameAr?: string; addressAr?: string };
  };
}

const DARK = "#0d5040";
const GOLD = "#C9A84C";
const GOLD_LIGHT = "#E8D48B";

const GROUP_COLORS: Record<string, string> = {
  A: "#1a7a5e",
  B: "#2563EB",
  C: "#D97706",
  D: "#DC2626",
};

function getGroupColor(groupName: string): string {
  const last = groupName.trim().slice(-1).toUpperCase();
  return GROUP_COLORS[last] || "#6B7280";
}

function buildQrData(p: Pilgrim, group: Group, phone: string): string {
  return [
    `Name: ${p.fullName}`,
    `Passport: ${p.passportNumber || "N/A"}`,
    `Group: ${group.groupName}`,
    `Maktab: ${group.maktabNumber || "N/A"}`,
    `Bus: ${p.busNumber || "N/A"}`,
    `Hotel Makkah 1: ${group.hotels?.aziziah?.name || "N/A"}`,
    `Hotel Makkah 2: ${group.hotels?.makkah?.name || "N/A"}`,
    `Hotel Madinah: ${group.hotels?.madinah?.name || "N/A"}`,
    `Makkah 1 Address: ${group.hotels?.aziziah?.address || "N/A"}`,
    `Group Leader: ${group.hotels?.groupLeader || "N/A"}`,
    `India: ${p.mobileIndia || "N/A"}`,
    `Saudi: ${p.mobileSaudi || "N/A"}`,
    `Emergency: ${phone}`,
  ].join("\n");
}

export default function PrintLuggage() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => { setGroup(g); setPilgrims(p); });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const groupColor = getGroupColor(group.groupName);
  const groupLabel = group.groupName.toUpperCase();

  /* 2 pilgrims per A4 page */
  const pages: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pages.push(pilgrims.slice(i, i + 2));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .luggage-pair {
          display: flex; flex-direction: column; gap: 5mm;
          page-break-after: always; page-break-inside: avoid;
          margin-bottom: 5mm;
        }
        .luggage-pair:last-child { page-break-after: auto; }
        .luggage-sticker {
          width: 190mm; height: 128mm;
          border: 1.5px solid ${DARK}; border-radius: 6px; overflow: hidden;
          page-break-inside: avoid;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div>
      {pages.map((pair, pi) => (
        <div key={pi} className="luggage-pair">
          {pair.map(p => (
          <div key={p.id} className="luggage-sticker">
            <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
              {/* Background decorations */}
              <div style={{
                position: "absolute", top: "-10mm", right: "-8mm",
                width: "45mm", height: "45mm",
                background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
              }} />
              <div style={{
                position: "absolute", bottom: "-7mm", left: "-6mm",
                width: "35mm", height: "35mm",
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
                borderRadius: "0 60% 0 0", zIndex: 0,
              }} />

              {/* Header */}
              <div style={{ position: "relative", zIndex: 1, padding: "2mm 4mm 1.5mm", display: "flex", alignItems: "center", gap: "3mm" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm", flexShrink: 0 }}>
                  {company.logoUrl
                    ? <img src={company.logoUrl} alt="" style={{ height: "13mm", objectFit: "contain" }} />
                    : <div style={{ height: "13mm", width: "13mm", background: DARK, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "8pt" }}>{company.nameShort.slice(0, 1)}</div>
                  }
                  <div style={{ fontSize: "28pt", lineHeight: 1 }}>🇮🇳</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: "9pt", color: "#1a7a5e", letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.1 }}>{company.nameShort}</div>
                  <div style={{ fontWeight: 700, fontSize: "5.5pt", color: GOLD, letterSpacing: "1px", textTransform: "uppercase" }}>TOURS &amp; TRAVELS</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "14pt", fontWeight: 800, color: "#fff" }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                  <div style={{ fontSize: "5.5pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
                </div>
              </div>

              {/* Group / Bus bar */}
              <div style={{ background: groupColor, padding: "1.2mm 4mm", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 1 }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: "7pt", letterSpacing: "1px" }}>GROUP: {groupLabel}</span>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "7pt" }}>BUS: {p.busNumber || "—"}</span>
              </div>

              {/* Body */}
              <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", padding: "2mm 4mm 1.5mm", flex: 1 }}>
                {/* Photo + Name row */}
                <div style={{ display: "flex", alignItems: "center", gap: "3mm", width: "100%", marginBottom: "1.5mm" }}>
                  <div style={{ flexShrink: 0 }}>
                    {p.photoUrl ? (
                      <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "22mm", height: "22mm", objectFit: "cover", borderRadius: "50%", border: `2.5px solid ${GOLD}`, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }} />
                    ) : (
                      <div style={{ width: "22mm", height: "22mm", background: "#f0f0f0", borderRadius: "50%", border: `2.5px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "6pt", color: "#aaa" }}>PHOTO</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "16pt", fontWeight: 900, color: DARK, lineHeight: 1.1, wordBreak: "break-word", textTransform: "uppercase" }}>{p.fullName}</div>
                  </div>
                </div>

                {/* Passport + Maktab */}
                <div style={{ width: "100%", display: "flex", gap: "2mm", marginBottom: "1.5mm" }}>
                  <div style={{ flex: 1, background: "#f0fdf4", border: `1.5px solid ${DARK}`, borderRadius: "4px", padding: "1mm 2mm", textAlign: "center" }}>
                    <div style={{ fontSize: "5pt", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>PASSPORT</div>
                    <div style={{ fontSize: "10pt", fontWeight: 900, fontFamily: "monospace", letterSpacing: "1px", color: DARK }}>{p.passportNumber || "—"}</div>
                  </div>
                  <div style={{ flex: 1, background: "#f0fdf4", border: `1.5px solid ${DARK}`, borderRadius: "4px", padding: "1mm 2mm", textAlign: "center" }}>
                    <div style={{ fontSize: "5pt", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>MAKTAB</div>
                    <div style={{ fontSize: "10pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
                  </div>
                </div>

                {/* Hotels */}
                <div style={{ width: "100%", display: "flex", gap: "1.5mm", marginBottom: "1.5mm" }}>
                  {([
                    ["HOTEL MAKKAH 1", group.hotels?.aziziah],
                    ["HOTEL MAKKAH 2", group.hotels?.makkah],
                    ["HOTEL MADINAH",  group.hotels?.madinah],
                  ] as [string, { name?: string; address?: string; nameAr?: string; addressAr?: string } | undefined][]).map(([lbl, h]) => (
                    <div key={lbl} style={{ flex: 1, background: "#fefce8", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "1mm 2mm" }}>
                      <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.4px", fontWeight: 600 }}>{lbl}</div>
                      <div style={{ fontWeight: 700, fontSize: "6pt", color: "#222", lineHeight: 1.2 }}>{h?.name || "—"}</div>
                      {h?.nameAr && <div style={{ fontWeight: 700, fontSize: "5.5pt", color: "#222", direction: "rtl", textAlign: "right", lineHeight: 1.2 }}>{h.nameAr}</div>}
                      {h?.address && <div style={{ fontSize: "4pt", color: "#666", lineHeight: 1.2 }}>{h.address}</div>}
                    </div>
                  ))}
                </div>

                {/* City + Mobiles + QR/Barcode row */}
                <div style={{ display: "flex", gap: "3mm", alignItems: "flex-end", marginTop: "auto" }}>
                  <div style={{ flex: 1, background: "#f9f9f9", borderRadius: "4px", padding: "1mm 2mm", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5mm 2mm" }}>
                    <div>
                      <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.4px" }}>City</div>
                      <div style={{ fontWeight: 700, fontSize: "6pt" }}>{p.city || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.4px" }}>India Mobile</div>
                      <div style={{ fontWeight: 700, fontSize: "6pt" }}>{p.mobileIndia || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "4pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.4px" }}>Saudi Mobile</div>
                      <div style={{ fontWeight: 700, fontSize: "6pt" }}>{p.mobileSaudi || "—"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "3mm", flexShrink: 0 }}>
                    <QRCodeSVG value={buildQrData(p, group, company.phone)} size={52} level="M" />
                    <Barcode value={p.passportNumber || `H${String(p.serialNumber).padStart(3, "0")}`} height={26} width={1.5} fontSize={0} />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "1.5mm 4mm", fontSize: "6pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px", flexShrink: 0 }}>
                {company.name} | {company.phone}
              </div>
            </div>
          </div>
          ))}
        </div>
      ))}
      </div>
    </>
  );
}
