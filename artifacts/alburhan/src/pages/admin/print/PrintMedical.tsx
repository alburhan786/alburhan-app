import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { Barcode } from "@/components/print/Barcode";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  dateOfBirth?: string; gender?: string; bloodGroup?: string; photoUrl?: string;
  mobileIndia?: string; mobileSaudi?: string; address?: string; city?: string; state?: string;
  coverNumber?: string; medicalCondition?: string; relation?: string;
}
interface Group { id: string; groupName: string; year: number; }

function calcAge(dob?: string): string {
  if (!dob) return "—";
  const parts = dob.split("/");
  if (parts.length === 3) {
    const year = parseInt(parts[2], 10);
    if (!isNaN(year)) return String(new Date().getFullYear() - year) + " YEARS";
  }
  return "—";
}

const CARD_W = "89mm";
const CARD_H = "76mm";

function MedCard({ p, group }: { p: Pilgrim; group: Group }) {
  const qrData = [
    `Name: ${p.fullName}`,
    `Passport: ${p.passportNumber || "N/A"}`,
    `Blood: ${p.bloodGroup || "N/A"}`,
    `Mobile (India): ${p.mobileIndia || "N/A"}`,
    `Mobile (Saudi): ${p.mobileSaudi || "N/A"}`,
    `Emergency India: +91 9893989786`,
    `Emergency Saudi: 0547090786`,
  ].join("\n");

  return (
    <div style={{
      width: CARD_W, height: CARD_H,
      border: "1.5px solid #333",
      fontFamily: "Arial, sans-serif",
      background: "#fff",
      display: "flex",
      flexDirection: "row",
      overflow: "hidden",
      pageBreakInside: "avoid",
      boxSizing: "border-box",
    }}>
      {/* LEFT: Text Content */}
      <div style={{ flex: 1, padding: "3mm 3mm", display: "flex", flexDirection: "column", gap: "0.7mm", fontSize: "6.5pt", lineHeight: 1.35, minWidth: 0 }}>
        <div><b>COVER NUMBER:</b> {p.coverNumber || "—"}</div>
        <div><b>PASSPORT NO:</b> {p.passportNumber || "—"}</div>
        <div><b>NAME:</b> {p.serialNumber} &nbsp; {p.fullName.toUpperCase()}</div>
        <div style={{ marginTop: "1.5mm" }}>
          <div><b>GUARDIAN / ACCOMPANYING</b></div>
          <div><b>PERSON'S NAME:</b> {p.relation || "—"}</div>
        </div>
        <div style={{ marginTop: "1.5mm" }}>
          <div><b>AGE:</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {calcAge(p.dateOfBirth)}</div>
          <div><b>GENDER:</b> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {(p.gender || "—").toUpperCase()}</div>
          <div><b>BLOOD GROUP:</b> &nbsp; {p.bloodGroup || "—"}</div>
          <div><b>MARITAL STATUS:</b> YES</div>
          <div><b>CONTACT NUMBER:</b> {p.mobileIndia || "—"}</div>
        </div>
        <div style={{ marginTop: "1mm" }}>
          <div><b>ADDRESS OF CORRESPONDENCE:</b></div>
          <div style={{ fontSize: "6pt" }}>{[p.address, p.city, p.state].filter(Boolean).join(" ") || "—"}</div>
        </div>
        <div style={{ marginTop: "1mm" }}>
          <div><b>EMERGENCY CONTACT DETAILS</b></div>
          <div><b>(NAME &amp; NUMBER):</b></div>
          <div><b>NAME:</b> {p.fullName.toUpperCase()}</div>
          <div><b>SAUDI MOBILE:</b> {p.mobileSaudi || "0547090786"}</div>
          <div><b>INDIAN MOBILE:</b> {p.mobileIndia ? `+91${p.mobileIndia}` : "+91 9893989786"}</div>
        </div>
      </div>

      {/* RIGHT: Photo + Barcode */}
      <div style={{ width: "26mm", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "3mm 2mm", borderLeft: "1px solid #ccc" }}>
        {/* Photo */}
        <div>
          {p.photoUrl ? (
            <img src={`${API}${p.photoUrl}`} alt="" style={{ width: "22mm", height: "28mm", objectFit: "cover", border: "1px solid #999" }} />
          ) : (
            <div style={{ width: "22mm", height: "28mm", background: "#f0f0f0", border: "1px solid #ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5pt", color: "#aaa" }}>PHOTO</div>
          )}
        </div>

        {/* Vertical Barcode */}
        <div style={{ transform: "rotate(90deg)", transformOrigin: "center center", marginTop: "4mm" }}>
          <Barcode value={p.passportNumber || String(p.serialNumber).padStart(6, "0")} height={18} width={0.8} fontSize={5} displayValue />
        </div>
      </div>
    </div>
  );
}

export default function PrintMedical() {
  const [, params] = useRoute("/admin/groups/:groupId/print/medical");
  const groupId = params?.groupId || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!contentRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadPdf(contentRef.current, { filename: `Medical-Cards-${group?.groupName || "group"}.pdf` });
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

  const pairs: Pilgrim[][] = [];
  for (let i = 0; i < pilgrims.length; i += 2) pairs.push(pilgrims.slice(i, i + 2));

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .med-row { page-break-inside: avoid; }
          .med-page-break { page-break-after: always; }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center" }}>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: "#c0392b", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px", opacity: pdfLoading ? 0.6 : 1 }}>
          {pdfLoading ? "Generating PDF..." : "⬇ Download PDF"}
        </button>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", marginRight: "12px" }}>🖨 Print</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
        {pairs.map((pair, pi) => (
          <div key={pi} className={pi < pairs.length - 1 ? "med-page-break" : ""} style={{ display: "flex", flexDirection: "column", gap: "6mm", padding: "4mm" }}>
            {pair.map(p => (
              <div key={p.id} className="med-row">
                <MedCard p={p} group={group} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
