import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";

interface HajjGroup {
  id: string;
  groupName: string;
}

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

const GREEN = "#0B3D2E";
const GOLD = "#C9A23F";
const W = "86mm";
const H = "54mm";

const ROLE_LABELS: Record<string, string> = {
  airport_staff: "AIRPORT STAFF",
  catering_staff: "CATERING STAFF",
};

/* ── Mosque SVG illustration ── */
function MosqueSVG({ color = GOLD }: { color?: string }) {
  return (
    <svg viewBox="0 0 80 56" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.92 }}>
      {/* Main dome */}
      <ellipse cx="40" cy="28" rx="12" ry="10" fill="none" stroke={color} strokeWidth="1.5" />
      <rect x="28" y="28" width="24" height="16" rx="1" fill="none" stroke={color} strokeWidth="1.5" />
      {/* Side domes */}
      <ellipse cx="20" cy="33" rx="7" ry="6" fill="none" stroke={color} strokeWidth="1.2" />
      <rect x="13" y="33" width="14" height="11" rx="1" fill="none" stroke={color} strokeWidth="1.2" />
      <ellipse cx="60" cy="33" rx="7" ry="6" fill="none" stroke={color} strokeWidth="1.2" />
      <rect x="53" y="33" width="14" height="11" rx="1" fill="none" stroke={color} strokeWidth="1.2" />
      {/* Minarets */}
      <rect x="5" y="20" width="5" height="25" rx="1" fill="none" stroke={color} strokeWidth="1.2" />
      <ellipse cx="7.5" cy="20" rx="3" ry="4" fill="none" stroke={color} strokeWidth="1.2" />
      <line x1="7.5" y1="16" x2="7.5" y2="13" stroke={color} strokeWidth="1" />
      <rect x="70" y="20" width="5" height="25" rx="1" fill="none" stroke={color} strokeWidth="1.2" />
      <ellipse cx="72.5" cy="20" rx="3" ry="4" fill="none" stroke={color} strokeWidth="1.2" />
      <line x1="72.5" y1="16" x2="72.5" y2="13" stroke={color} strokeWidth="1" />
      {/* Crescent on main dome */}
      <path d="M37,22 a5,5 0 0,1 6,0" fill="none" stroke={color} strokeWidth="1.2" />
      <circle cx="43" cy="19.5" r="1" fill={color} />
      {/* Ground */}
      <line x1="2" y1="44" x2="78" y2="44" stroke={color} strokeWidth="1" />
      {/* Windows */}
      <rect x="35" y="33" width="5" height="7" rx="2" fill="none" stroke={color} strokeWidth="1" />
      <rect x="16" y="36" width="4" height="5" rx="1.5" fill="none" stroke={color} strokeWidth="0.9" />
      <rect x="60" y="36" width="4" height="5" rx="1.5" fill="none" stroke={color} strokeWidth="0.9" />
    </svg>
  );
}

/* ── FRONT CARD ── */
function StaffCardFront({ s, groupName }: { s: StaffMember; groupName?: string }) {
  const company = getCompanyById(s.companyId);
  const roleLabel = ROLE_LABELS[s.role] || "STAFF";

  return (
    <div className="staff-card" style={{ background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* ── HEADER ── */}
      <div style={{
        background: GREEN, display: "flex", alignItems: "center",
        padding: "1.2mm 2.5mm", gap: "1.5mm", flexShrink: 0, minHeight: "8mm",
      }}>
        {company.logoUrl && (
          <img src={company.logoUrl} alt="" style={{ width: "7mm", height: "7mm", objectFit: "contain", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "6.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.1, letterSpacing: "0.3px" }}>
            {company.nameShort}
          </div>
          <div style={{ fontSize: "4.5pt", fontWeight: 700, color: GOLD, lineHeight: 1.1, letterSpacing: "0.2px" }}>
            TOURS &amp; TRAVELS
          </div>
          <div style={{ fontSize: "3pt", color: "rgba(255,255,255,0.7)", letterSpacing: "0.3px", marginTop: "0.3mm" }}>
            SERVING PILGRIMS WITH CARE
          </div>
        </div>
      </div>

      {/* ── MIDDLE AREA ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", background: "#f4f8f4" }}>

        {/* Role badge (left vertical strip) */}
        <div style={{
          width: "8mm", flexShrink: 0, background: GREEN,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1mm 0",
        }}>
          <span style={{
            writingMode: "vertical-rl", textOrientation: "mixed",
            transform: "rotate(180deg)",
            fontSize: "5pt", fontWeight: 900, color: GOLD,
            letterSpacing: "0.8px", textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}>
            {roleLabel}
          </span>
        </div>

        {/* Photo */}
        <div style={{
          width: "22mm", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1.5mm",
        }}>
          {s.photoUrl ? (
            <img
              src={`${API}${s.photoUrl}`}
              alt=""
              style={{
                width: "19mm", height: "23mm",
                objectFit: "cover",
                border: `2px solid ${GOLD}`,
                borderRadius: "3px",
              }}
            />
          ) : (
            <div style={{
              width: "19mm", height: "23mm",
              background: "#e0e7e0",
              border: `2px solid ${GOLD}`,
              borderRadius: "3px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: "1mm",
            }}>
              <div style={{ fontSize: "14pt", color: "#aaa" }}>👤</div>
              <div style={{ fontSize: "3pt", color: "#bbb", fontWeight: 700 }}>PHOTO</div>
            </div>
          )}
        </div>

        {/* Hajj logo right */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "1mm",
        }}>
          <div style={{ width: "100%", height: "18mm" }}>
            <MosqueSVG color={GREEN} />
          </div>
          <div style={{ textAlign: "center", marginTop: "0.5mm" }}>
            <div style={{ fontSize: "6pt", fontWeight: 900, color: GREEN, letterSpacing: "1px" }}>HAJJ</div>
            <div style={{ fontSize: "8pt", fontWeight: 900, color: GOLD, letterSpacing: "0.5px", lineHeight: 1 }}>2026</div>
          </div>
        </div>
      </div>

      {/* ── INFO SECTION ── */}
      <div style={{ background: "#fff", padding: "1mm 2mm 0.5mm", flexShrink: 0 }}>
        {/* Name */}
        <div style={{
          fontSize: "8pt", fontWeight: 900, color: "#111",
          textTransform: "uppercase", textAlign: "center",
          lineHeight: 1.1, letterSpacing: "0.3px", marginBottom: "0.5mm",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {s.fullName}
        </div>

        {/* Role + Designation */}
        <div style={{
          fontSize: "4pt", fontWeight: 700, color: "#444",
          textAlign: "center", lineHeight: 1.2, marginBottom: "0.8mm",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          ROLE : {roleLabel}
          {s.designation && <span style={{ marginLeft: "3mm" }}>DESIGNATION : {s.designation.toUpperCase()}</span>}
        </div>

        {/* ID badge */}
        {s.staffId && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: GREEN, borderRadius: "3px", padding: "0.5mm 2mm",
            marginBottom: "0.5mm",
          }}>
            <span style={{ fontSize: "3.5pt", marginRight: "1mm", color: GOLD }}>🪪</span>
            <span style={{ fontSize: "4.5pt", fontWeight: 900, color: "#fff", letterSpacing: "0.5px" }}>
              ID NO. : {s.staffId}
            </span>
          </div>
        )}

        {/* Group */}
        {groupName && (
          <div style={{
            fontSize: "3.8pt", color: "#555", textAlign: "center",
            letterSpacing: "0.2px", lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            GROUP : {groupName}
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        background: GREEN, padding: "0.8mm 2.5mm", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1mm" }}>
          <span style={{ fontSize: "4.5pt", color: GOLD }}>📞</span>
          <span style={{ fontSize: "3.5pt", color: "#fff", fontWeight: 700 }}>{company.mobile}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1mm" }}>
          <span style={{ fontSize: "4.5pt", color: GOLD }}>🌐</span>
          <span style={{ fontSize: "3.5pt", color: "#fff", fontWeight: 700 }}>{company.website}</span>
        </div>
      </div>
    </div>
  );
}

/* ── BACK CARD ── */
function StaffCardBack({ s, groupName }: { s: StaffMember; groupName?: string }) {
  const company = getCompanyById(s.companyId);
  const roleLabel = ROLE_LABELS[s.role] || "STAFF";
  const verifyUrl = s.staffId
    ? `${PROD_DOMAIN}/verify-staff?id=${encodeURIComponent(s.staffId)}`
    : `${PROD_DOMAIN}/verify-staff`;

  return (
    <div className="staff-card" style={{ background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* ── HEADER ── */}
      <div style={{
        background: GREEN, display: "flex", alignItems: "center",
        padding: "1mm 2.5mm", gap: "1.5mm", flexShrink: 0, minHeight: "7mm",
      }}>
        {company.logoUrl && (
          <img src={company.logoUrl} alt="" style={{ width: "6mm", height: "6mm", objectFit: "contain", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: "#fff", lineHeight: 1.1, letterSpacing: "0.3px" }}>
            {company.nameShort} TOURS &amp; TRAVELS
          </div>
          <div style={{ fontSize: "4pt", color: GOLD, lineHeight: 1.1, direction: "rtl", textAlign: "left", fontFamily: "Arial, sans-serif" }}>
            {company.arabicName}
          </div>
        </div>
      </div>

      {/* ── IDENTITY CARD LABEL ── */}
      <div style={{ display: "flex", justifyContent: "center", padding: "0.8mm 2mm 0.3mm", flexShrink: 0 }}>
        <div style={{
          background: GREEN, borderRadius: "20px",
          padding: "0.4mm 4mm",
          fontSize: "4pt", fontWeight: 900, color: "#fff", letterSpacing: "0.8px",
        }}>
          STAFF IDENTITY CARD
        </div>
      </div>

      {/* ── QR + DETAILS ROW ── */}
      <div style={{ display: "flex", padding: "0.5mm 2mm", gap: "2mm", flexShrink: 0, flex: 1, overflow: "hidden" }}>

        {/* QR code */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5mm", flexShrink: 0 }}>
          <div style={{ border: `1.5px solid ${GREEN}`, borderRadius: "2px", padding: "1px" }}>
            <QRCodeSVG value={verifyUrl} size={32} level="M" fgColor={GREEN} bgColor="#fff" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5mm" }}>
            <span style={{ fontSize: "3pt", color: GREEN }}>📱</span>
            <span style={{ fontSize: "2.8pt", fontWeight: 700, color: GREEN, letterSpacing: "0.2px" }}>SCAN TO VERIFY</span>
          </div>
        </div>

        {/* Details table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5mm", overflow: "hidden" }}>
          {[
            ["NAME", s.fullName.toUpperCase()],
            ["ROLE", roleLabel],
            s.designation ? ["DESIGNATION", s.designation.toUpperCase()] : null,
            s.staffId ? ["ID NO.", s.staffId] : null,
            groupName ? ["GROUP", groupName] : null,
            s.mobileIndia ? ["MOBILE", s.mobileIndia] : null,
            s.bloodGroup ? ["BLOOD GROUP", s.bloodGroup] : null,
          ].filter(Boolean).map(([label, value], i) => (
            <div key={i} style={{ display: "flex", gap: "1mm", alignItems: "baseline" }}>
              <span style={{ fontSize: "3pt", fontWeight: 700, color: GREEN, minWidth: "14mm", letterSpacing: "0.2px" }}>
                {label}
              </span>
              <span style={{ fontSize: "3pt", color: "#555", letterSpacing: "0.1px" }}>:</span>
              <span style={{
                fontSize: "3pt", fontWeight: label === "ID NO." ? 900 : 600,
                color: label === "BLOOD GROUP" ? "#b91c1c" : label === "ID NO." ? GREEN : "#111",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── GOLD DIVIDER ── */}
      <div style={{ height: "0.3mm", background: GOLD, margin: "0 2mm", flexShrink: 0 }} />

      {/* ── INSTRUCTIONS + ARABIC ── */}
      <div style={{ display: "flex", padding: "0.8mm 2mm", gap: "2mm", flexShrink: 0 }}>
        {/* Instructions */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "3pt", fontWeight: 900, color: GREEN, letterSpacing: "0.3px", marginBottom: "0.5mm" }}>
            IMPORTANT INSTRUCTIONS
          </div>
          {[
            "This ID card is issued for official duty only.",
            "This card must be carried at all times.",
            "If found, please return to the nearest Al Burhan office.",
            "Misuse of this card will lead to strict action.",
          ].map((line, i) => (
            <div key={i} style={{ display: "flex", gap: "0.8mm", alignItems: "flex-start", marginBottom: "0.4mm" }}>
              <span style={{ fontSize: "3pt", color: GREEN, flexShrink: 0, lineHeight: 1.3 }}>•</span>
              <span style={{ fontSize: "2.6pt", color: "#444", lineHeight: 1.3 }}>{line}</span>
            </div>
          ))}
        </div>

        {/* Arabic + mosque */}
        <div style={{
          width: "20mm", flexShrink: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            fontSize: "5pt", fontWeight: 900, color: GREEN, lineHeight: 1.4,
            textAlign: "center", direction: "rtl", fontFamily: "Arial, sans-serif",
          }}>
            خدمة الحجاج شرف لنا
          </div>
          <div style={{
            fontSize: "4pt", color: GOLD, lineHeight: 1.4,
            textAlign: "center", direction: "rtl", fontFamily: "Arial, sans-serif",
          }}>
            الحمد لله على توفيقه
          </div>
          <div style={{ width: "18mm", height: "9mm", marginTop: "0.5mm", opacity: 0.7 }}>
            <MosqueSVG color={GREEN} />
          </div>
        </div>
      </div>

      {/* ── ADDRESS ROW ── */}
      <div style={{
        background: "#f4f8f4", padding: "0.5mm 2.5mm", flexShrink: 0,
        display: "flex", alignItems: "center", gap: "3mm",
        borderTop: `0.5px solid ${GREEN}22`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.8mm", flexShrink: 0 }}>
          <span style={{ fontSize: "4pt", color: GREEN }}>📞</span>
          <span style={{ fontSize: "2.8pt", fontWeight: 700, color: "#111" }}>{company.mobile}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.8mm", flex: 1, overflow: "hidden" }}>
          <span style={{ fontSize: "4pt", color: GREEN, flexShrink: 0 }}>📍</span>
          <span style={{ fontSize: "2.6pt", color: "#444", lineHeight: 1.3, overflow: "hidden" }}>
            {company.address}
          </span>
        </div>
      </div>

      {/* ── TAGLINE FOOTER ── */}
      <div style={{
        background: GREEN, padding: "0.8mm", textAlign: "center", flexShrink: 0,
      }}>
        <span style={{ fontSize: "3.5pt", color: GOLD, fontWeight: 900, letterSpacing: "1px" }}>
          ❖ SERVING PILGRIMS WITH CARE ❖
        </span>
      </div>
    </div>
  );
}

/* ── MAIN EXPORT ── */
export default function PrintStaffCards() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [pdfLoading, setPdfLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/staff`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/api/groups`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    ]).then(([staffData, groupsData]) => {
      setStaff(Array.isArray(staffData) ? staffData : []);
      const map: Record<string, string> = {};
      if (Array.isArray(groupsData)) {
        (groupsData as HajjGroup[]).forEach(g => { map[g.id] = g.groupName; });
      }
      setGroups(map);
      setLoading(false);
    }).catch(() => setLoading(false));
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

  if (loading) return (
    <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial", color: GREEN }}>
      Loading staff cards...
    </div>
  );

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .staff-card {
          width: ${W};
          height: ${H};
          border-radius: 4px;
          overflow: hidden;
          page-break-inside: avoid;
          font-family: Arial, sans-serif;
          background: #fff;
          position: relative;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
          border: 0.5px solid #ccc;
        }
        .cards-row {
          display: flex;
          gap: 5mm;
          justify-content: center;
          margin-bottom: 4mm;
        }
        .page-break { page-break-after: always; }
        @media screen {
          .staff-card { box-shadow: 0 3px 12px rgba(0,0,0,0.18); }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{
        padding: "12px 16px",
        background: `${GREEN}08`,
        borderBottom: `2px solid ${GREEN}22`,
        display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
      }}>
        <span style={{ fontWeight: 800, fontSize: "15px", color: GREEN }}>
          Staff ID Cards
        </span>
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px" }}>
          <option value="all">All Companies</option>
          {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.nameShort}</option>)}
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px" }}>
          <option value="all">All Roles</option>
          <option value="airport_staff">Airport Staff</option>
          <option value="catering_staff">Catering Staff</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px" }}>
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <span style={{ fontSize: "12px", color: "#666", marginLeft: "4px" }}>{filtered.length} card(s)</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={handleDownload} disabled={pdfLoading || filtered.length === 0}
            style={{
              padding: "8px 20px", background: GREEN, color: "#fff",
              border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer",
              opacity: pdfLoading || filtered.length === 0 ? 0.5 : 1,
            }}>
            {pdfLoading ? "Generating..." : "⬇ Download PDF"}
          </button>
          <button onClick={() => window.print()}
            style={{ padding: "8px 20px", background: "#fff", border: `1px solid ${GREEN}`, color: GREEN, borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
            🖨 Print
          </button>
          <button onClick={() => window.history.back()}
            style={{ padding: "8px 20px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", background: "#fff" }}>
            ← Back
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="no-print" style={{ padding: "60px", textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🪪</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: GREEN }}>No staff members match the selected filters.</div>
          <div style={{ fontSize: "13px", color: "#aaa", marginTop: "4px" }}>Add staff first from the Staff ID Cards admin page.</div>
        </div>
      ) : (
        <div ref={contentRef} style={{ background: "#f8f9fa", padding: "6mm" }}>
          {pages.map((page, pi) => (
            <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""} style={{ marginBottom: "4mm" }}>
              {/* Front faces */}
              <div className="cards-row">
                {page.map(s => (
                  <StaffCardFront
                    key={`f-${s.id}`}
                    s={s}
                    groupName={s.groupId ? groups[s.groupId] : undefined}
                  />
                ))}
                {Array.from({ length: 2 - page.length }).map((_, i) => (
                  <div key={`ph-f-${i}`} className="staff-card" style={{ border: "1px dashed #ddd", opacity: 0.15, background: "#fff" }} />
                ))}
              </div>
              {/* Back faces */}
              <div className="cards-row">
                {page.map(s => (
                  <StaffCardBack
                    key={`b-${s.id}`}
                    s={s}
                    groupName={s.groupId ? groups[s.groupId] : undefined}
                  />
                ))}
                {Array.from({ length: 2 - page.length }).map((_, i) => (
                  <div key={`ph-b-${i}`} className="staff-card" style={{ border: "1px dashed #ddd", opacity: 0.15, background: "#fff" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
