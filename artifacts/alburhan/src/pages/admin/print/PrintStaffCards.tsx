import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";

interface StaffMember {
  id: string;
  staffId?: string;
  companyId: string;
  groupId?: string;
  fullName: string;
  fatherName?: string;
  designation?: string;
  department?: string;
  role: string;
  employeeCode?: string;
  mobileIndia?: string;
  bloodGroup?: string;
  dateOfBirth?: string;
  address?: string;
  aadhaarLast4?: string;
  emergencyContact?: string;
  emergencyMobile?: string;
  joiningDate?: string;
  validUpto?: string;
  photoUrl?: string;
  qrToken?: string;
  status: string;
}

const GOLD = "#C9A23F";
const AIRPORT_COLOR = "#1e3a5f";
const CATERING_COLOR = "#7c2d12";
const W = "85mm";
const H = "54mm";

const ROLE_LABELS: Record<string, string> = {
  airport_staff: "AIRPORT STAFF",
  catering_staff: "CATERING STAFF",
};

const ROLE_COLORS: Record<string, string> = {
  airport_staff: AIRPORT_COLOR,
  catering_staff: CATERING_COLOR,
};

function StaffCardFront({ s }: { s: StaffMember }) {
  const company = getCompanyById(s.companyId);
  const accentColor = ROLE_COLORS[s.role] || AIRPORT_COLOR;

  return (
    <div className="pro-card" style={{ background: "#fff" }}>
      {/* Header */}
      <div style={{
        background: accentColor,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1.5mm 3mm", flexShrink: 0, minHeight: "6.5mm",
      }}>
        <span style={{ fontSize: "3.8pt", fontWeight: 800, color: "#fff", letterSpacing: "0.4px", textTransform: "uppercase" }}>
          {company.name}
        </span>
        <span style={{
          fontSize: "3.8pt", fontWeight: 900, color: GOLD,
          background: "rgba(255,255,255,0.12)", padding: "0.4mm 1.5mm",
          borderRadius: "2px", letterSpacing: "0.4px", textTransform: "uppercase",
        }}>
          {ROLE_LABELS[s.role] || "STAFF"}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left sidebar */}
        <div style={{
          width: "25mm", flexShrink: 0, background: "#f5f7fa",
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "1.5mm 1.5mm", gap: "1mm",
        }}>
          {company.logoUrl
            ? <img src={company.logoUrl} alt="" style={{ width: "9mm", height: "9mm", objectFit: "contain" }} />
            : <div style={{ width: "9mm", height: "9mm", background: accentColor, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: GOLD, fontWeight: 900, fontSize: "6pt" }}>{company.nameShort.slice(0, 1)}</div>
          }
          <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {s.photoUrl ? (
              <img
                src={`${API}${s.photoUrl}`}
                alt=""
                style={{ width: "17mm", height: "19mm", objectFit: "cover", border: `2px solid ${GOLD}`, borderRadius: "2px" }}
              />
            ) : (
              <div style={{
                width: "17mm", height: "19mm", background: "#e8ede8",
                border: `2px solid ${GOLD}`, borderRadius: "2px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "4pt", color: "#aaa", fontWeight: 700,
              }}>PHOTO</div>
            )}
          </div>
          {s.bloodGroup && (
            <div style={{
              background: "#b91c1c", color: "#fff", fontSize: "6pt", fontWeight: 900,
              padding: "0.5mm 2mm", borderRadius: "3px", textAlign: "center",
            }}>
              {s.bloodGroup}
            </div>
          )}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, padding: "1.5mm 2mm 1mm", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
          {/* Staff ID */}
          {s.staffId && (
            <div style={{
              fontSize: "4.5pt", fontWeight: 900, color: accentColor,
              letterSpacing: "0.5px", marginBottom: "0.5mm",
              fontFamily: "'Arial Black', Arial, sans-serif",
            }}>
              {s.staffId}
            </div>
          )}

          {/* Name */}
          <div style={{
            fontSize: "8pt", fontWeight: 900, color: "#111",
            textTransform: "uppercase", lineHeight: 1.15,
            wordBreak: "break-word", marginBottom: "0.3mm",
            maxWidth: "calc(100% - 2mm)",
          }}>
            {s.fullName}
          </div>

          {/* Father's name */}
          {s.fatherName && (
            <div style={{ fontSize: "4pt", color: "#555", marginBottom: "0.5mm", lineHeight: 1.2 }}>
              S/o {s.fatherName}
            </div>
          )}

          {/* Designation */}
          {s.designation && (
            <div style={{ fontSize: "5pt", fontWeight: 700, color: accentColor, marginBottom: "0.3mm", lineHeight: 1.2 }}>
              {s.designation}
            </div>
          )}

          {/* Department */}
          {s.department && (
            <div style={{ fontSize: "4pt", color: "#666", marginBottom: "0.5mm" }}>
              {s.department}
            </div>
          )}

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.4mm" }}>
            {s.mobileIndia && (
              <div style={{ display: "flex", gap: "1mm", alignItems: "center" }}>
                <span style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", minWidth: "11mm" }}>Mobile</span>
                <span style={{ fontSize: "4.5pt", fontWeight: 800, color: "#111" }}>{s.mobileIndia}</span>
              </div>
            )}
            {s.validUpto && (
              <div style={{ display: "flex", gap: "1mm", alignItems: "center" }}>
                <span style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px", minWidth: "11mm" }}>Valid Upto</span>
                <span style={{ fontSize: "4.5pt", fontWeight: 900, color: "#b91c1c" }}>{s.validUpto}</span>
              </div>
            )}
          </div>

          {/* 🇮🇳 Flag */}
          <span style={{ position: "absolute", bottom: "1mm", right: "1.5mm", fontSize: "16pt", lineHeight: 1 }}>🇮🇳</span>
        </div>
      </div>

      {/* Footer strip */}
      <div style={{ background: accentColor, padding: "0.8mm 3mm", textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontSize: "3pt", color: "rgba(255,255,255,0.75)", letterSpacing: "0.3px" }}>
          {company.nameShort} | {company.phone}
        </div>
      </div>
    </div>
  );
}

function StaffCardBack({ s }: { s: StaffMember }) {
  const company = getCompanyById(s.companyId);
  const accentColor = ROLE_COLORS[s.role] || AIRPORT_COLOR;
  const verifyUrl = s.staffId
    ? `${PROD_DOMAIN}/verify-staff?id=${encodeURIComponent(s.staffId)}`
    : `${PROD_DOMAIN}/verify-staff`;

  return (
    <div className="pro-card" style={{ background: "#fff" }}>
      {/* Header */}
      <div style={{
        background: accentColor, padding: "1.5mm 3mm",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, minHeight: "6.5mm",
      }}>
        <span style={{ fontSize: "4pt", fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Employee ID Card — {company.nameShort}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", padding: "1.5mm 3mm 1mm", gap: "3mm", overflow: "hidden" }}>
        {/* Left: info */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.8mm", overflow: "hidden" }}>
          <div>
            <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Name</div>
            <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#111", textTransform: "uppercase", lineHeight: 1.2 }}>{s.fullName}</div>
            {s.fatherName && <div style={{ fontSize: "4pt", color: "#555" }}>S/o {s.fatherName}</div>}
          </div>
          {s.designation && (
            <div>
              <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Designation</div>
              <div style={{ fontSize: "4.5pt", fontWeight: 700, color: accentColor }}>{s.designation}</div>
            </div>
          )}
          {s.address && (
            <div>
              <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Address</div>
              <div style={{ fontSize: "3.8pt", color: "#444", lineHeight: 1.3, overflow: "hidden", maxHeight: "7mm" }}>{s.address}</div>
            </div>
          )}
          {s.aadhaarLast4 && (
            <div>
              <div style={{ fontSize: "3pt", color: "#999", textTransform: "uppercase", letterSpacing: "0.3px" }}>Aadhaar</div>
              <div style={{ fontSize: "4.5pt", fontWeight: 700, color: "#111" }}>XXXX-XXXX-{s.aadhaarLast4}</div>
            </div>
          )}
          {s.emergencyContact && (
            <div>
              <div style={{ fontSize: "3pt", color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.3px", fontWeight: 700 }}>Emergency</div>
              <div style={{ fontSize: "4pt", fontWeight: 800, color: "#111" }}>{s.emergencyContact}</div>
              {s.emergencyMobile && <div style={{ fontSize: "4.5pt", fontWeight: 900, color: "#111" }}>{s.emergencyMobile}</div>}
            </div>
          )}
        </div>

        {/* Right: QR code */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm", flexShrink: 0 }}>
          <div style={{ background: "#fff", padding: "1.5px", border: `2px solid ${accentColor}`, borderRadius: "3px" }}>
            <QRCodeSVG value={verifyUrl} size={34} level="M" fgColor={accentColor} />
          </div>
          <div style={{ fontSize: "3pt", color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", textAlign: "center" }}>
            Scan to Verify
          </div>
          {s.staffId && (
            <div style={{ fontSize: "3pt", fontFamily: "monospace", color: accentColor, fontWeight: 700, textAlign: "center" }}>
              {s.staffId}
            </div>
          )}
          {s.validUpto && (
            <div style={{ fontSize: "3.5pt", color: "#b91c1c", fontWeight: 900, textAlign: "center" }}>
              Valid: {s.validUpto}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: accentColor, padding: "0.8mm 3mm", flexShrink: 0, textAlign: "center" }}>
        <div style={{ fontSize: "3pt", color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {company.address}
        </div>
        <div style={{ fontSize: "3.5pt", color: GOLD, fontWeight: 800 }}>
          {company.nameShort} | {company.phone}
        </div>
      </div>
    </div>
  );
}

export default function PrintStaffCards() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [pdfLoading, setPdfLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/staff`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setStaff(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = staff.filter(s => {
    if (companyFilter !== "all" && s.companyId !== companyFilter) return false;
    if (roleFilter !== "all" && s.role !== roleFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  });

  const pages: StaffMember[][] = [];
  for (let i = 0; i < filtered.length; i += 2) pages.push(filtered.slice(i, i + 2));

  const handleDownload = useCallback(async () => {
    if (!contentRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadPdf(contentRef.current, { filename: "Staff-ID-Cards.pdf" });
    } finally { setPdfLoading(false); }
  }, [pdfLoading]);

  if (loading) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial" }}>Loading...</div>;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .pro-card {
          width: ${W}; height: ${H};
          border: 1px solid #bbb; border-radius: 4px; overflow: hidden;
          page-break-inside: avoid; font-family: Arial, sans-serif;
          background: #fff; position: relative; display: flex; flex-direction: column;
        }
        .pro-cards-row { display: flex; gap: 5mm; justify-content: center; margin-bottom: 3mm; }
        .pro-page-break { page-break-after: always; }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{
        padding: "12px 16px", background: "#f0fdf4", borderBottom: "1px solid #d1fae5",
        display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
      }}>
        <span style={{ fontWeight: 700, fontSize: "14px", color: "#166534" }}>Staff ID Cards</span>
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px" }}>
          <option value="all">All Companies</option>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.nameShort}</option>)}
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px" }}>
          <option value="all">All Roles</option>
          <option value="airport_staff">Airport Staff</option>
          <option value="catering_staff">Catering Staff</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px" }}>
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <span style={{ fontSize: "12px", color: "#666", marginLeft: "4px" }}>{filtered.length} card(s)</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={handleDownload} disabled={pdfLoading || filtered.length === 0} style={{ padding: "8px 20px", background: "#166534", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", opacity: pdfLoading || filtered.length === 0 ? 0.6 : 1 }}>
            {pdfLoading ? "Generating..." : "⬇ Download PDF"}
          </button>
          <button onClick={() => window.print()} style={{ padding: "8px 20px", background: "#fff", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer" }}>🖨 Print</button>
          <button onClick={() => window.history.back()} style={{ padding: "8px 20px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>Back</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="no-print" style={{ padding: "40px", textAlign: "center", color: "#666" }}>
          No staff members match the selected filters.
        </div>
      ) : (
        <div ref={contentRef} style={{ background: "#fff", padding: "4mm" }}>
          {pages.map((page, pi) => (
            <div key={pi} className={pi < pages.length - 1 ? "pro-page-break" : ""} style={{ marginBottom: "4mm" }}>
              {/* Front faces */}
              <div className="pro-cards-row">
                {page.map(s => <StaffCardFront key={`f-${s.id}`} s={s} />)}
                {Array.from({ length: 2 - page.length }).map((_, i) => (
                  <div key={`ph-f-${i}`} className="pro-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
                ))}
              </div>
              {/* Back faces */}
              <div className="pro-cards-row">
                {page.map(s => <StaffCardBack key={`b-${s.id}`} s={s} />)}
                {Array.from({ length: 2 - page.length }).map((_, i) => (
                  <div key={`ph-b-${i}`} className="pro-card" style={{ border: "1px dashed #ddd", opacity: 0.2 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
