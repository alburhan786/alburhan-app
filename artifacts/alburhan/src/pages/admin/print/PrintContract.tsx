import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { PrintHeader } from "./PrintHeader";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";

interface Pilgrim {
  id: string; serialNumber: number; fullName: string; passportNumber?: string;
  mobileIndia?: string; address?: string; city?: string; state?: string; photoUrl?: string;
}
interface Group {
  id: string; groupName: string; year: number; departureDate?: string; returnDate?: string;
  hotels?: { makkah?: { name?: string }; madinah?: { name?: string }; aziziah?: { name?: string } };
}

export default function PrintContract() {
  const [, params] = useRoute("/admin/groups/:groupId/print/contract");
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
      await downloadPdf(contentRef.current, { filename: `Contracts-${group?.groupName || "group"}.pdf` });
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
  if (pilgrims.length === 0) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>No pilgrims in this group.</div>;

  const s: React.CSSProperties = { fontFamily: "'Inter', Arial, sans-serif", fontSize: "10pt", lineHeight: 1.8, color: "#333" };
  const heading: React.CSSProperties = { fontWeight: 700, fontSize: "11pt", color: "#0A3D2A", marginTop: "5mm", marginBottom: "2mm" };

  const renderContract = (pilgrim: Pilgrim, idx: number) => (
    <div key={pilgrim.id} style={{ ...s, maxWidth: "210mm", margin: "0 auto", padding: "2mm", pageBreakAfter: idx < pilgrims.length - 1 ? "always" : "auto" }}>
      <PrintHeader title="BOOKING AGREEMENT / CONTRACT" company={company} />

      <div style={{ display: "flex", gap: "4mm", fontSize: "9pt", marginBottom: "5mm", padding: "3mm 4mm", background: "#f5faf7", borderRadius: "4px", border: "1px solid #e0e0e0" }}>
        <div style={{ flexShrink: 0 }}>
          {pilgrim.photoUrl ? (
            <img src={`${API}${pilgrim.photoUrl}`} alt="" style={{ width: "18mm", height: "22mm", objectFit: "cover", borderRadius: "3px", border: "1.5px solid #0A3D2A" }} />
          ) : (
            <div style={{ width: "18mm", height: "22mm", background: "#e8e8e8", borderRadius: "3px", border: "1.5px solid #ccc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "6pt", color: "#aaa" }}>PHOTO</div>
          )}
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2mm 6mm" }}>
          <div><span style={{ color: "#666" }}>Agreement Date:</span> <b>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</b></div>
          <div><span style={{ color: "#666" }}>Group:</span> <b>{group!.groupName} ({group!.year})</b></div>
          <div><span style={{ color: "#666" }}>Pilgrim Name:</span> <b>{pilgrim.fullName}</b></div>
          <div><span style={{ color: "#666" }}>Passport No.:</span> <b>{pilgrim.passportNumber || "—"}</b></div>
          <div><span style={{ color: "#666" }}>Mobile:</span> <b>{pilgrim.mobileIndia || "—"}</b></div>
          <div><span style={{ color: "#666" }}>Address:</span> <b>{[pilgrim.address, pilgrim.city, pilgrim.state].filter(Boolean).join(", ") || "—"}</b></div>
        </div>
      </div>

      <p>This Agreement is entered into between <b>{company.name}</b> (hereinafter referred to as "the Company") and <b>{pilgrim.fullName}</b> (hereinafter referred to as "the Pilgrim") for the services outlined below.</p>

      <div style={heading}>1. Package & Amount</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt", marginBottom: "3mm" }}>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "2mm 4mm", width: "35%", background: "#f5faf7", fontWeight: 600 }}>Package Name</td>
            <td style={{ border: "1px solid #ddd", padding: "2mm 4mm" }}>{group!.groupName}</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "2mm 4mm", background: "#f5faf7", fontWeight: 600 }}>Total Package Amount (per person)</td>
            <td style={{ border: "1px solid #ddd", padding: "2mm 4mm" }}>₹ _______________</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "2mm 4mm", background: "#f5faf7", fontWeight: 600 }}>GST (5%)</td>
            <td style={{ border: "1px solid #ddd", padding: "2mm 4mm" }}>₹ _______________</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "2mm 4mm", background: "#f5faf7", fontWeight: 700 }}>Grand Total Payable</td>
            <td style={{ border: "1px solid #ddd", padding: "2mm 4mm", fontWeight: 700 }}>₹ _______________</td>
          </tr>
        </tbody>
      </table>

      <div style={heading}>2. Services Included</div>
      <p>The Company shall provide the following services as part of the <b>{group!.groupName}</b> package:</p>
      <ul style={{ paddingLeft: "6mm", margin: "2mm 0" }}>
        <li>Return airfare (Economy class) — India to Saudi Arabia and back</li>
        <li>Accommodation in Makkah 1 (Aziziah){group!.hotels?.aziziah?.name ? ` — ${group!.hotels.aziziah.name}` : ""}</li>
        <li>Accommodation in Makkah 2{group!.hotels?.makkah?.name ? ` — ${group!.hotels.makkah.name}` : ""}</li>
        <li>Accommodation in Madinah{group!.hotels?.madinah?.name ? ` — ${group!.hotels.madinah.name}` : ""}</li>
        <li>Transport between Makkah, Madinah, and Jeddah Airport</li>
        <li>Visa processing and documentation</li>
        <li>Hajj/Umrah guide and group leader services</li>
        <li>Meals as per package inclusions</li>
        <li>Zamzam water (5 litres per pilgrim)</li>
        <li>Travel insurance</li>
      </ul>

      {group!.departureDate && (
        <>
          <div style={heading}>3. Travel Dates</div>
          <p>Departure: <b>{group!.departureDate}</b>{group!.returnDate ? <> | Return: <b>{group!.returnDate}</b></> : null}. Dates are subject to change based on airline schedule and government regulations.</p>
        </>
      )}

      <div style={heading}>4. Payment Terms</div>
      <ul style={{ paddingLeft: "6mm", margin: "2mm 0" }}>
        <li>A non-refundable advance of <b>₹25,000/-</b> is required at the time of booking to confirm the seat.</li>
        <li>Second installment of <b>50%</b> of the total package cost is due 60 days before departure.</li>
        <li>Full and final payment must be completed 30 days before the departure date.</li>
        <li>Payments can be made via Bank Transfer, UPI, or Razorpay (online).</li>
        <li>All applicable GST (5%) will be charged as per government norms (SAC Code: 998555).</li>
      </ul>

      <div style={heading}>5. Cancellation Policy</div>
      <ul style={{ paddingLeft: "6mm", margin: "2mm 0" }}>
        <li>Cancellation more than 60 days before departure: Advance amount forfeited.</li>
        <li>Cancellation 30–60 days before departure: 50% of total package cost will be charged.</li>
        <li>Cancellation less than 30 days before departure: No refund.</li>
        <li>Once the visa process has begun, the payment is non-refundable.</li>
      </ul>

      <div style={heading}>6. Terms & Conditions</div>
      <ol style={{ paddingLeft: "6mm", margin: "2mm 0", fontSize: "9pt" }}>
        <li>The Pilgrim must possess a valid passport with at least 6 months validity from the date of travel.</li>
        <li>The Company is not responsible for delays caused by airlines, government authorities, or force majeure events.</li>
        <li>Hotel room allocation is subject to availability and may change without prior notice.</li>
        <li>The Pilgrim must comply with all rules and regulations of the Kingdom of Saudi Arabia.</li>
        <li>Any additional expenses incurred by the Pilgrim during the trip (shopping, personal calls, extra meals) are not covered.</li>
        <li>The Company reserves the right to cancel or modify the itinerary if circumstances require.</li>
        <li>All disputes are subject to the jurisdiction of courts in Burhanpur, Madhya Pradesh.</li>
      </ol>

      <div style={heading}>7. Acknowledgment</div>
      <p>I, <b>{pilgrim.fullName}</b>, have read and understood the above terms and conditions. I agree to abide by them and confirm my booking with {company.name} for the <b>{group!.groupName}</b> package.</p>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16mm", paddingTop: "2mm" }}>
        <div style={{ textAlign: "center", width: "45%" }}>
          <div style={{ marginBottom: "18mm" }} />
          <div style={{ borderTop: "1px solid #333", paddingTop: "2mm" }}>
            <div style={{ fontWeight: 700, fontSize: "9pt" }}>{pilgrim.fullName}</div>
            <div style={{ fontSize: "7pt", color: "#888" }}>Pilgrim Signature & Date</div>
          </div>
        </div>
        <div style={{ textAlign: "center", width: "45%" }}>
          <div style={{ marginBottom: "18mm" }} />
          <div style={{ borderTop: "1px solid #333", paddingTop: "2mm" }}>
            <div style={{ fontWeight: 700, fontSize: "9pt" }}>For {company.name.split(" ").slice(0, 2).join(" ")} {company.name.includes("&") ? "& " : ""}Travels</div>
            <div style={{ fontSize: "7pt", color: "#888" }}>Authorized Signatory & Stamp</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "8mm", textAlign: "center", fontSize: "7pt", color: "#aaa", borderTop: "1px solid #e0e0e0", paddingTop: "3mm" }}>
        This is a computer-generated agreement. &nbsp;|&nbsp; GSTIN: 27AXXPXXXXXX1ZX &nbsp;|&nbsp; PAN: AXXPXXXXXX
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm 18mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
      `}</style>

      <div className="no-print" style={{ padding: "16px", background: "#fef3c7", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
        </select>
        <button onClick={handleDownload} disabled={pdfLoading} style={{ padding: "10px 24px", background: "#0A3D2A", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", opacity: pdfLoading ? 0.6 : 1 }}>{pdfLoading ? "Generating PDF..." : `⬇ Download PDF (${pilgrims.length})`}</button>
        <button onClick={() => window.history.back()} style={{ padding: "10px 24px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
      </div>

      <div ref={contentRef}>
        {pilgrims.map((p, i) => renderContract(p, i))}
      </div>
    </>
  );
}
