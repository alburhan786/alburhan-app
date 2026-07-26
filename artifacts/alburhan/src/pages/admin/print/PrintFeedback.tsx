import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { downloadAsPdf } from "@/lib/downloadUtils";
import { PrintHeader } from "./PrintHeader";
import { COMPANIES, getCompanyById } from "@/lib/companies";
const API = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.online";

function QrImg({ value, size = 80 }: { value: string; size?: number }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&color=0d5040&bgcolor=ffffff&margin=2`;
  return <img src={src} width={size} height={size} alt="QR Code" style={{ display: "block" }} />;
}

interface Group { id: string; groupName: string; year: number; departureDate?: string; returnDate?: string; companyId?: string; }
interface Pilgrim { id: string; serialNumber: number; fullName: string; mobileIndia?: string; passportNumber?: string; }

const categories = [
  "Accommodation — Makkah 1 (Aziziah)",
  "Accommodation — Makkah 2",
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
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [bookingMap, setBookingMap] = useState<Record<string, string>>({});
  const [companyId, setCompanyId] = useState("alburhan");
  const [showQR, setShowQR] = useState(false);
  const company = getCompanyById(companyId);
  const contentRef = useRef<HTMLDivElement>(null);
  const [dlState, setDlState] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()).then(g => {
      setGroup(g);
      if (g.companyId) setCompanyId(g.companyId);
    });
    fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()).then(data => {
      setPilgrims(Array.isArray(data) ? data : data.pilgrims || []);
    });
    fetch(`${API}/api/feedback/admin/group-bookings/${groupId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : {})
      .then(map => setBookingMap(map))
      .catch(() => {});
  }, [groupId]);

  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  const feedbackBaseUrl = `${PROD_DOMAIN}/feedback`;
  function getPilgrimQrUrl(p: Pilgrim): string {
    const bookingNumber = p.mobileIndia ? bookingMap[p.mobileIndia] : undefined;
    if (bookingNumber) return `${feedbackBaseUrl}?booking_id=${encodeURIComponent(bookingNumber)}`;
    return feedbackBaseUrl;
  }

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

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <button
          onClick={() => setShowQR(false)}
          style={{ padding: "10px 20px", background: showQR ? "#fff" : "#0d5040", color: showQR ? "#374151" : "#fff", border: "1px solid #ccc", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
        >
          📄 Feedback Form
        </button>
        <button
          onClick={() => setShowQR(true)}
          style={{ padding: "10px 20px", background: showQR ? "#0d5040" : "#fff", color: showQR ? "#fff" : "#374151", border: "1px solid #ccc", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
        >
          📱 QR Code Sheet ({pilgrims.length})
        </button>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#0d5040", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          🖨 Print
        </button>
        <button onClick={async () => { if (!contentRef.current) return; setDlState("pdf"); try { await downloadAsPdf(contentRef.current, `feedback-${group?.groupName || "group"}`); } finally { setDlState(null); } }}
          disabled={!!dlState} style={{ padding: "10px 20px", background: dlState ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
          {dlState ? "⏳..." : "⬇ PDF"}
        </button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
      {!showQR && (
        <div>
          <div style={{ padding: "2mm", fontFamily: "'Inter', Arial, sans-serif", maxWidth: "210mm", margin: "0 auto" }}>
            <PrintHeader title="Customer Feedback Form" subtitle={`${group.groupName} — ${group.year}${group.departureDate ? ` | ${group.departureDate}` : ""}${group.returnDate ? ` to ${group.returnDate}` : ""}`} company={company} />

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
                    <th style={{ background: "#0d5040", color: "#fff", padding: "3mm 4mm", textAlign: "left", fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid #0d5040" }}>Service Category</th>
                    {[1, 2, 3, 4, 5].map(n => (
                      <th key={n} style={{ background: "#0d5040", color: "#fff", padding: "3mm 2mm", textAlign: "center", fontSize: "8pt", width: "14mm", border: "1px solid #0d5040" }}>
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
                    <tr key={cat} style={{ background: i % 2 === 0 ? "#fff" : "#f0fdf4" }}>
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
              <div style={{ fontWeight: 700, fontSize: "10pt", marginBottom: "2mm" }}>Would you recommend {company.name} to others?</div>
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
              Thank you for your valuable feedback. It helps us serve you better. — {company.name}
            </div>
          </div>
        </div>
      )}

      {showQR && (
        <div>
          <div style={{ padding: "4mm", fontFamily: "'Inter', Arial, sans-serif", maxWidth: "210mm", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "6mm", borderBottom: "2px solid #0d5040", paddingBottom: "4mm" }}>
              <div style={{ fontSize: "14pt", fontWeight: 700, color: "#0d5040" }}>{company.name}</div>
              <div style={{ fontSize: "10pt", color: "#555", marginTop: "1mm" }}>Feedback QR Codes — {group.groupName} {group.year}</div>
              <div style={{ fontSize: "8pt", color: "#888", marginTop: "1mm" }}>Pilgrims: scan the QR code to share your feedback online</div>
            </div>

            {pilgrims.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20mm", color: "#999", fontSize: "10pt" }}>
                No pilgrims found for this group.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4mm" }}>
                {pilgrims.map((p) => (
                  <div key={p.id} style={{
                    border: "1.5px solid #0d5040",
                    borderRadius: "4mm",
                    padding: "4mm",
                    textAlign: "center",
                    background: "#fff",
                    breakInside: "avoid",
                  }}>
                    <div style={{ fontSize: "8pt", fontWeight: 700, color: "#0d5040", marginBottom: "2mm" }}>
                      #{p.serialNumber} — {p.fullName}
                    </div>
                    {p.passportNumber && (
                      <div style={{ fontSize: "7pt", color: "#888", marginBottom: "2mm" }}>
                        PP: {p.passportNumber}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "2mm" }}>
                      <QrImg value={getPilgrimQrUrl(p)} size={80} />
                    </div>
                    <div style={{ fontSize: "6.5pt", color: "#555", wordBreak: "break-all" }}>
                      {getPilgrimQrUrl(p)}
                    </div>
                    <div style={{ fontSize: "7pt", color: "#0d5040", fontWeight: 600, marginTop: "1.5mm" }}>
                      اسکین کریں اور تاثرات دیں
                    </div>
                    <div style={{ fontSize: "6.5pt", color: "#888", marginTop: "0.5mm" }}>
                      Scan to give feedback
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: "6mm", textAlign: "center", fontSize: "7pt", color: "#aaa", borderTop: "1px solid #e0e0e0", paddingTop: "3mm" }}>
              {company.name} — Feedback QR Sheet — {group.groupName} {group.year} — {pilgrims.length} Pilgrims
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
