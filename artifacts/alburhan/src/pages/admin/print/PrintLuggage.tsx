import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { downloadAsPdf, downloadAsJpg, fetchAsDataUrl } from "@/lib/downloadUtils";
import { Barcode } from "@/components/print/Barcode";
import { QRCodeCanvas } from "qrcode.react";
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

function buildHotelMapUrl(name?: string, address?: string): string {
  const q = [name, address].filter(Boolean).join(" ");
  return `https://maps.google.com/?q=${encodeURIComponent(q)}`;
}

function buildVerifyUrl(id: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}verify/${id}`;
}

export default function PrintLuggage() {
  const [, params] = useRoute("/admin/groups/:groupId/print/luggage");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [photoDataUrls, setPhotoDataUrls] = useState<Record<string, string>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  const dl = async (fmt: "pdf" | "jpg") => {
    if (!contentRef.current) return;
    setDownloading(fmt);
    try {
      const name = `luggage-stickers-${group?.groupName || "group"}`;
      if (fmt === "pdf") await downloadAsPdf(contentRef.current, name);
      else await downloadAsJpg(contentRef.current, name);
    } finally { setDownloading(null); }
  };

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(async ([g, p]) => {
      setGroup(g);
      const list: Pilgrim[] = Array.isArray(p) ? p : p;
      setPilgrims(list);
      const entries = await Promise.all(
        (Array.isArray(list) ? list : []).filter(x => x.photoUrl).map(async x => {
          const d = await fetchAsDataUrl(`${API}${x.photoUrl}`);
          return [x.id, d] as [string, string];
        })
      );
      setPhotoDataUrls(Object.fromEntries(entries.filter(([, v]) => v)));
    });
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const groupColor = getGroupColor(group.groupName);
  const groupLabel = group.groupName.toUpperCase();

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .luggage-sticker {
          width: 150mm; height: 200mm;
          border: 1.5px solid ${DARK}; border-radius: 6px; overflow: hidden;
          page-break-inside: avoid; page-break-after: always;
          font-family: 'Inter', Arial, sans-serif;
          background: #fff; position: relative;
          margin: 0 auto 5mm;
        }
        .luggage-sticker:last-child { page-break-after: auto; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
        <button onClick={() => dl("pdf")} disabled={!!downloading} style={{ padding: "10px 20px", background: downloading === "pdf" ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          {downloading === "pdf" ? "⏳..." : "⬇ PDF"}
        </button>
        <button onClick={() => dl("jpg")} disabled={!!downloading} style={{ padding: "10px 20px", background: downloading === "jpg" ? "#6b7280" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          {downloading === "jpg" ? "⏳..." : "⬇ JPG"}
        </button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
      {pilgrims.map(p => (
        <div key={p.id} className="luggage-sticker">
          <div style={{ position: "relative", overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{
              position: "absolute", top: "-15mm", right: "-10mm",
              width: "70mm", height: "70mm",
              background: DARK, borderRadius: "0 0 0 60%", zIndex: 0,
            }} />
            <div style={{
              position: "absolute", bottom: "-10mm", left: "-8mm",
              width: "55mm", height: "55mm",
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
              borderRadius: "0 60% 0 0", zIndex: 0,
            }} />

            <div style={{ position: "relative", zIndex: 1, padding: "4mm 6mm 2mm", display: "flex", alignItems: "center", gap: "4mm" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5mm", flexShrink: 0 }}>
                {company.logoUrl
                  ? <img src={company.logoUrl} alt="" style={{ height: "20mm", objectFit: "contain" }} />
                  : <div style={{ height: "20mm", width: "20mm", background: DARK, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "12pt" }}>{company.nameShort.slice(0, 1)}</div>
                }
                <div style={{ fontSize: "44pt", lineHeight: 1 }}>🇮🇳</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: "14pt", color: "#1a7a5e", letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.1 }}>{company.nameShort}</div>
                <div style={{ fontWeight: 700, fontSize: "8pt", color: GOLD, letterSpacing: "1.5px", textTransform: "uppercase" }}>TOURS &amp; TRAVELS</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "22pt", fontWeight: 800, color: "#fff" }}>#{String(p.serialNumber).padStart(3, "0")}</div>
                <div style={{ fontSize: "8pt", color: "#fff", opacity: 0.9 }}>HAJJ {group.year}</div>
              </div>
            </div>

            <div style={{ background: groupColor, padding: "2mm 6mm", display: "flex", justifyContent: "center", alignItems: "center", position: "relative", zIndex: 1 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: "11pt", letterSpacing: "1px" }}>GROUP: {groupLabel}</span>
            </div>

            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "3mm 6mm 2mm", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5mm", width: "100%", marginBottom: "2mm" }}>
                <div style={{ flexShrink: 0 }}>
                  {p.photoUrl ? (
                    <img src={photoDataUrls[p.id] || `${API}${p.photoUrl}`} alt="" style={{ width: "34mm", height: "34mm", objectFit: "cover", borderRadius: "50%", border: `3px solid ${GOLD}`, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }} />
                  ) : (
                    <div style={{ width: "34mm", height: "34mm", background: "#f0f0f0", borderRadius: "50%", border: `3px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10pt", color: "#aaa" }}>PHOTO</div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "26pt", fontWeight: 900, color: DARK, lineHeight: 1.1, wordBreak: "break-word", textTransform: "uppercase" }}>{p.fullName}</div>
                </div>
              </div>

              <div style={{ width: "100%", display: "flex", gap: "3mm", marginBottom: "2mm" }}>
                <div style={{ flex: 1, background: "#f0fdf4", border: `1.5px solid ${DARK}`, borderRadius: "4px", padding: "2mm 4mm", textAlign: "center" }}>
                  <div style={{ fontSize: "7pt", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>PASSPORT</div>
                  <div style={{ fontSize: "16pt", fontWeight: 900, fontFamily: "monospace", letterSpacing: "1px", color: DARK }}>{p.passportNumber || "—"}</div>
                </div>
                <div style={{ flex: 1, background: "#f0fdf4", border: `1.5px solid ${DARK}`, borderRadius: "4px", padding: "2mm 4mm", textAlign: "center" }}>
                  <div style={{ fontSize: "7pt", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>MAKTAB</div>
                  <div style={{ fontSize: "16pt", fontWeight: 900, color: DARK }}>{group.maktabNumber || "—"}</div>
                </div>
              </div>

              <div style={{ width: "100%", display: "flex", gap: "2mm", marginBottom: "2mm" }}>
                {([
                  { lbl: "HOTEL MAKKAH 1", h: group.hotels?.aziziah },
                  { lbl: "HOTEL MAKKAH 2", h: group.hotels?.makkah },
                  { lbl: "HOTEL MADINAH",  h: group.hotels?.madinah },
                ]).map(({ lbl, h }) => (
                  <div key={lbl} style={{ flex: 1, background: "#fefce8", border: "1px solid #e5e7eb", borderRadius: "4px", padding: "1.5mm 3mm", display: "flex", gap: "2mm", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>{lbl}</div>
                      <div style={{ fontWeight: 700, fontSize: "9pt", color: "#222" }}>{h?.name || "—"}</div>
                      {h?.nameAr && <div style={{ fontWeight: 700, fontSize: "8pt", color: "#222", direction: "rtl", textAlign: "right" }}>{h.nameAr}</div>}
                      {h?.address && <div style={{ fontSize: "6pt", color: "#666", lineHeight: 1.2 }}>{h.address}</div>}
                      {(h as any)?.addressAr && <div style={{ fontSize: "6pt", color: "#666", lineHeight: 1.2, direction: "rtl", textAlign: "right" }}>{(h as any).addressAr}</div>}
                    </div>
                    {h?.name && (
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm" }}>
                        <QRCodeCanvas value={buildHotelMapUrl(h.name, h.address)} size={38} level="M" />
                        <div style={{ fontSize: "4pt", color: "#999", textAlign: "center" }}>MAP</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{
                width: "100%", background: "#f9f9f9", borderRadius: "4px",
                padding: "2mm 4mm", marginBottom: "2mm",
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1mm 4mm",
              }}>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>City</div>
                  <div style={{ fontWeight: 700, fontSize: "9pt" }}>{p.city || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>India Mobile</div>
                  <div style={{ fontWeight: 700, fontSize: "9pt" }}>{p.mobileIndia || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "6pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>Saudi Mobile</div>
                  <div style={{ fontWeight: 700, fontSize: "9pt" }}>{p.mobileSaudi || "—"}</div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "5mm", marginTop: "auto", paddingBottom: "1mm" }}>
                <QRCodeCanvas value={buildVerifyUrl(p.id)} size={68} level="M" />
                <Barcode value={p.passportNumber || `H${String(p.serialNumber).padStart(3, "0")}`} height={40} width={2} fontSize={0} />
              </div>
            </div>

            <div style={{ position: "relative", zIndex: 2, background: DARK, color: GOLD, padding: "2mm 5mm", fontSize: "8pt", textAlign: "center", fontWeight: 600, letterSpacing: "0.3px" }}>
              {company.name} | {company.phone}
            </div>
          </div>
        </div>
      ))}
      </div>
    </>
  );
}
