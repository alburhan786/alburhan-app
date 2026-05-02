import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { QRCodeSVG } from "qrcode.react";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const PROD_DOMAIN = "https://alburhantravels.com";

interface HajjGroup { id: string; groupName: string; }

interface StaffMember {
  id: string; staffId?: string; companyId: string; groupId?: string;
  fullName: string; fatherName?: string; designation?: string; department?: string;
  role: string; employeeCode?: string; mobileIndia?: string; bloodGroup?: string;
  dateOfBirth?: string; address?: string; aadhaarLast4?: string;
  emergencyContact?: string; emergencyMobile?: string; joiningDate?: string;
  validUpto?: string; photoUrl?: string; qrToken?: string; status: string;
}

const GREEN = "#0B3D2E";
const GOLD  = "#C9A23F";
const W = "86mm";
const H = "54mm";

const ROLE_LABELS: Record<string, string> = {
  airport_staff:  "AIRPORT STAFF",
  catering_staff: "CATERING STAFF",
};

/* ── Kaaba + Masjid SVG ── */
function KaabaSVG({ color = GOLD, size = "100%" }: { color?: string; size?: string | number }) {
  return (
    <svg viewBox="0 0 100 80" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      {/* Masjid arches background */}
      <line x1="2" y1="66" x2="98" y2="66" stroke={color} strokeWidth="1" />
      {/* Left minaret */}
      <rect x="4" y="28" width="6" height="38" rx="1" fill="none" stroke={color} strokeWidth="1.2" />
      <ellipse cx="7" cy="28" rx="4" ry="5" fill="none" stroke={color} strokeWidth="1.2" />
      <rect x="6" y="17" width="2" height="11" fill="none" stroke={color} strokeWidth="1" />
      <path d="M5,17 Q7,13 9,17 Z" fill={color} opacity="0.8" />
      {/* Right minaret */}
      <rect x="90" y="28" width="6" height="38" rx="1" fill="none" stroke={color} strokeWidth="1.2" />
      <ellipse cx="93" cy="28" rx="4" ry="5" fill="none" stroke={color} strokeWidth="1.2" />
      <rect x="92" y="17" width="2" height="11" fill="none" stroke={color} strokeWidth="1" />
      <path d="M91,17 Q93,13 95,17 Z" fill={color} opacity="0.8" />
      {/* Masjid arches */}
      <path d="M14,66 Q14,54 22,54 Q30,54 30,66" fill="none" stroke={color} strokeWidth="1.1" />
      <path d="M30,66 Q30,54 38,54 Q46,54 46,66" fill="none" stroke={color} strokeWidth="1.1" />
      <path d="M54,66 Q54,54 62,54 Q70,54 70,66" fill="none" stroke={color} strokeWidth="1.1" />
      <path d="M70,66 Q70,54 78,54 Q86,54 86,66" fill="none" stroke={color} strokeWidth="1.1" />
      {/* Kaaba cube */}
      <rect x="36" y="30" width="28" height="36" rx="1.5" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5" />
      <rect x="36" y="30" width="28" height="36" rx="1.5" fill="none" stroke={color} strokeWidth="1.8" />
      {/* Kaaba kiswa gold band */}
      <rect x="36" y="38" width="28" height="6" fill={color} opacity="0.5" />
      <line x1="36" y1="38" x2="64" y2="38" stroke={color} strokeWidth="0.8" />
      <line x1="36" y1="44" x2="64" y2="44" stroke={color} strokeWidth="0.8" />
      {/* Kaaba door */}
      <rect x="46" y="49" width="8" height="17" rx="1" fill="none" stroke={color} strokeWidth="1.2" />
      <path d="M46,53 Q50,49 54,53" fill="none" stroke={color} strokeWidth="1" />
      {/* Gold trim line on Kaaba */}
      <rect x="36" y="30" width="28" height="1.5" rx="0.5" fill={color} opacity="0.7" />
      {/* Crescent on top */}
      <path d="M46,27 a5,5 0 0,1 8,0" fill="none" stroke={color} strokeWidth="1.3" />
      <circle cx="55" cy="24" r="1.2" fill={color} />
      {/* Column supports */}
      <line x1="36" y1="50" x2="33" y2="66" stroke={color} strokeWidth="1" />
      <line x1="64" y1="50" x2="67" y2="66" stroke={color} strokeWidth="1" />
    </svg>
  );
}

/* ── FRONT CARD ── */
function StaffCardFront({ s, groupName }: { s: StaffMember; groupName?: string }) {
  const company  = getCompanyById(s.companyId);
  const roleLabel = ROLE_LABELS[s.role] || "STAFF";

  return (
    <div className="staff-card" style={{ background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* ── HEADER ── */}
      <div style={{
        background: GREEN, display: "flex", alignItems: "center",
        padding: "1.2mm 2.5mm", gap: "1.8mm", flexShrink: 0, minHeight: "9mm",
      }}>
        {company.logoUrl && (
          <img src={company.logoUrl} alt="" style={{
            width: "8mm", height: "8mm", objectFit: "contain",
            flexShrink: 0, borderRadius: "50%", background: "#fff", padding: "0.5px",
          }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: "8pt", fontWeight: 900, color: "#fff",
            lineHeight: 1.05, letterSpacing: "0.5px", textTransform: "uppercase",
          }}>
            {company.nameShort}
          </div>
          <div style={{
            fontSize: "5.5pt", fontWeight: 800, color: GOLD,
            lineHeight: 1.1, letterSpacing: "0.3px",
          }}>
            TOURS &amp; TRAVELS
          </div>
          <div style={{
            fontSize: "3pt", color: "rgba(255,255,255,0.75)",
            letterSpacing: "0.5px", marginTop: "0.4mm", textTransform: "uppercase",
          }}>
            SERVING PILGRIMS WITH CARE
          </div>
        </div>
      </div>

      {/* ── MIDDLE AREA ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", background: "#eef4ee" }}>

        {/* Left: Role badge (vertical green strip) */}
        <div style={{
          width: "9mm", flexShrink: 0, background: GREEN,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "1mm 0",
        }}>
          <span style={{
            writingMode: "vertical-rl", textOrientation: "mixed",
            transform: "rotate(180deg)",
            fontSize: "4.8pt", fontWeight: 900, color: GOLD,
            letterSpacing: "0.8px", textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}>
            {roleLabel}
          </span>
        </div>

        {/* Centre: Photo */}
        <div style={{
          width: "23mm", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "2mm 1.5mm",
        }}>
          {s.photoUrl ? (
            <img src={`${API}${s.photoUrl}`} alt="" style={{
              width: "19.5mm", height: "24mm", objectFit: "cover",
              border: `2.5px solid ${GOLD}`, borderRadius: "4px",
            }} />
          ) : (
            <div style={{
              width: "19.5mm", height: "24mm",
              background: "#d4e0d4", border: `2.5px solid ${GOLD}`, borderRadius: "4px",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: "1mm",
            }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#888" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              <div style={{ fontSize: "3pt", color: "#999", fontWeight: 700, letterSpacing: "0.3px" }}>PHOTO</div>
            </div>
          )}
        </div>

        {/* Right: HAJJ 2026 Kaaba badge */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "1mm 1.5mm",
        }}>
          <div style={{ width: "22mm", height: "19mm" }}>
            <KaabaSVG color={GREEN} />
          </div>
          <div style={{ textAlign: "center", marginTop: "0.5mm", lineHeight: 1 }}>
            <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GREEN, letterSpacing: "1.5px" }}>HAJJ</div>
            <div style={{ fontSize: "9pt",  fontWeight: 900, color: GOLD,  letterSpacing: "0.5px", lineHeight: 1 }}>2026</div>
          </div>
        </div>
      </div>

      {/* ── INFO SECTION ── */}
      <div style={{ background: "#fff", padding: "1.2mm 2.5mm 0.8mm", flexShrink: 0 }}>

        {/* Name */}
        <div style={{
          fontSize: "8.5pt", fontWeight: 900, color: "#111",
          textTransform: "uppercase", textAlign: "center",
          lineHeight: 1.05, letterSpacing: "0.4px", marginBottom: "0.6mm",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {s.fullName}
        </div>

        {/* Role / Designation */}
        <div style={{
          display: "flex", justifyContent: "center", gap: "3mm",
          fontSize: "3.8pt", fontWeight: 700, color: "#444",
          textAlign: "center", lineHeight: 1.2, marginBottom: "1mm",
        }}>
          <span>ROLE : <span style={{ color: GREEN }}>{roleLabel}</span></span>
          {s.designation && (
            <span>DESIGNATION : <span style={{ color: GREEN }}>{s.designation.toUpperCase()}</span></span>
          )}
        </div>

        {/* ID pill */}
        {s.staffId && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: GREEN, borderRadius: "4px", padding: "0.7mm 2.5mm",
            marginBottom: "0.7mm",
          }}>
            <span style={{ fontSize: "3.5pt", marginRight: "1.2mm", color: GOLD }}>
              <svg viewBox="0 0 16 12" width="7" height="5" fill={GOLD}>
                <rect x="0" y="0" width="16" height="12" rx="2" fill="none" stroke={GOLD} strokeWidth="1.5"/>
                <line x1="4" y1="4" x2="12" y2="4" stroke={GOLD} strokeWidth="1.2"/>
                <line x1="4" y1="7" x2="10" y2="7" stroke={GOLD} strokeWidth="1.2"/>
              </svg>
            </span>
            <span style={{ fontSize: "5pt", fontWeight: 900, color: "#fff", letterSpacing: "0.5px" }}>
              ID NO. :&nbsp;{s.staffId}
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
            GROUP : &nbsp;<span style={{ fontWeight: 700, color: "#333" }}>{groupName}</span>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        background: GREEN, padding: "1mm 3mm", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.2mm" }}>
          <svg viewBox="0 0 24 24" width="7" height="7" fill="none" stroke={GOLD} strokeWidth="2.5">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.08 5.18 2 2 0 0 1 5.07 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.09 10.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 23 18z" />
          </svg>
          <span style={{ fontSize: "3.5pt", color: "#fff", fontWeight: 700 }}>{company.mobile}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.2mm" }}>
          <svg viewBox="0 0 24 24" width="7" height="7" fill="none" stroke={GOLD} strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span style={{ fontSize: "3.5pt", color: "#fff", fontWeight: 700 }}>{company.website}</span>
        </div>
      </div>
    </div>
  );
}

/* ── BACK CARD ── */
function StaffCardBack({ s, groupName }: { s: StaffMember; groupName?: string }) {
  const company   = getCompanyById(s.companyId);
  const roleLabel = ROLE_LABELS[s.role] || "STAFF";
  const verifyUrl = s.staffId
    ? `${PROD_DOMAIN}/verify-staff?id=${encodeURIComponent(s.staffId)}`
    : `${PROD_DOMAIN}/verify-staff`;

  return (
    <div className="staff-card" style={{ background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* ── HEADER ── */}
      <div style={{
        background: GREEN, display: "flex", alignItems: "center",
        padding: "1mm 2.5mm", gap: "1.8mm", flexShrink: 0, minHeight: "8mm",
      }}>
        {company.logoUrl && (
          <img src={company.logoUrl} alt="" style={{
            width: "7mm", height: "7mm", objectFit: "contain",
            flexShrink: 0, borderRadius: "50%", background: "#fff", padding: "0.5px",
          }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "7pt", fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "0.4px" }}>
            {company.nameShort}
          </div>
          <div style={{ fontSize: "5pt", fontWeight: 800, color: GOLD, lineHeight: 1.1, letterSpacing: "0.2px" }}>
            TOURS &amp; TRAVELS
          </div>
          <div style={{
            fontSize: "3.5pt", color: "rgba(255,255,255,0.8)", lineHeight: 1.2,
            direction: "rtl", fontFamily: "Arial, sans-serif", marginTop: "0.2mm",
          }}>
            {company.arabicName}
          </div>
        </div>
      </div>

      {/* ── IDENTITY CARD LABEL ── */}
      <div style={{ display: "flex", justifyContent: "center", padding: "0.8mm 2mm 0.3mm", flexShrink: 0 }}>
        <div style={{
          background: GREEN, borderRadius: "20px", padding: "0.5mm 5mm",
          fontSize: "4.2pt", fontWeight: 900, color: "#fff", letterSpacing: "1px",
          border: `0.5px solid ${GOLD}33`,
        }}>
          STAFF IDENTITY CARD
        </div>
      </div>

      {/* ── QR + DETAILS ROW ── */}
      <div style={{ display: "flex", padding: "0.5mm 2mm", gap: "2.5mm", flexShrink: 0, flex: 1, overflow: "hidden" }}>

        {/* QR code column */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8mm", flexShrink: 0 }}>
          <div style={{ border: `2px solid ${GREEN}`, borderRadius: "3px", padding: "1.5px", background: "#fff" }}>
            <QRCodeSVG value={verifyUrl} size={36} level="M" fgColor={GREEN} bgColor="#fff" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.8mm" }}>
            <svg viewBox="0 0 24 24" width="6" height="6" fill="none" stroke={GREEN} strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
            </svg>
            <span style={{ fontSize: "2.8pt", fontWeight: 800, color: GREEN, letterSpacing: "0.3px" }}>SCAN TO VERIFY</span>
          </div>
        </div>

        {/* Details table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.55mm", overflow: "hidden", justifyContent: "center" }}>
          {([
            ["NAME",        s.fullName.toUpperCase()],
            ["ROLE",        roleLabel],
            s.designation ? ["DESIGNATION", s.designation.toUpperCase()] : null,
            s.staffId     ? ["ID NO.",       s.staffId]                   : null,
            groupName     ? ["GROUP",        groupName]                   : null,
            s.mobileIndia ? ["MOBILE",       `+91 ${s.mobileIndia.replace(/^\+?91/, "")}`] : null,
            s.bloodGroup  ? ["BLOOD GROUP",  s.bloodGroup]                : null,
          ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, value], i) => (
            <div key={i} style={{ display: "flex", gap: "0.8mm", alignItems: "baseline" }}>
              <span style={{
                fontSize: "3pt", fontWeight: 800, color: GREEN,
                minWidth: "15mm", letterSpacing: "0.1px", flexShrink: 0,
              }}>{label}</span>
              <span style={{ fontSize: "3pt", color: "#555" }}>:</span>
              <span style={{
                fontSize: "3pt",
                fontWeight: label === "ID NO." ? 900 : label === "NAME" ? 800 : 600,
                color: label === "BLOOD GROUP" ? "#b91c1c" : label === "ID NO." ? GREEN : "#111",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
              }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── GOLD DIVIDER ── */}
      <div style={{ height: "0.4mm", background: GOLD, margin: "0 2mm", flexShrink: 0 }} />

      {/* ── INSTRUCTIONS + ARABIC ── */}
      <div style={{ display: "flex", padding: "0.8mm 2mm 0.5mm", gap: "2mm", flexShrink: 0 }}>

        {/* Instructions */}
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: "3pt", fontWeight: 900, color: GREEN,
            letterSpacing: "0.4px", marginBottom: "0.6mm", textTransform: "uppercase",
          }}>
            Important Instructions
          </div>
          {[
            "This ID card is issued for official duty only.",
            "This card must be carried at all times.",
            "If found, please return to the nearest Al Burhan office.",
            "Misuse of this card will lead to strict action.",
          ].map((line, i) => (
            <div key={i} style={{ display: "flex", gap: "0.8mm", alignItems: "flex-start", marginBottom: "0.5mm" }}>
              <span style={{ fontSize: "3pt", color: GOLD, flexShrink: 0, lineHeight: 1.3, fontWeight: 900 }}>•</span>
              <span style={{ fontSize: "2.6pt", color: "#444", lineHeight: 1.3 }}>{line}</span>
            </div>
          ))}
        </div>

        {/* Arabic text + Kaaba illustration */}
        <div style={{
          width: "21mm", flexShrink: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "0.5mm",
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
          <div style={{ width: "18mm", height: "10mm", marginTop: "0.3mm", opacity: 0.85 }}>
            <KaabaSVG color={GREEN} />
          </div>
        </div>
      </div>

      {/* ── ADDRESS ROW ── */}
      <div style={{
        background: "#f0f6f0", padding: "0.6mm 2.5mm", flexShrink: 0,
        display: "flex", alignItems: "flex-start", gap: "3mm",
        borderTop: `0.5px solid ${GREEN}33`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1mm", flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width="7" height="7" fill="none" stroke={GREEN} strokeWidth="2.5">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.08 5.18 2 2 0 0 1 5.07 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.09 10.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 23 18z" />
          </svg>
          <span style={{ fontSize: "2.8pt", fontWeight: 800, color: "#111", whiteSpace: "nowrap" }}>{company.mobile}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1mm", flex: 1, overflow: "hidden" }}>
          <svg viewBox="0 0 24 24" width="7" height="7" fill="none" stroke={GREEN} strokeWidth="2.5" style={{ flexShrink: 0, marginTop: "0.2mm" }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          <span style={{ fontSize: "2.5pt", color: "#555", lineHeight: 1.35, overflow: "hidden" }}>
            {company.address}
          </span>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        background: GREEN, padding: "0.8mm", textAlign: "center", flexShrink: 0,
      }}>
        <span style={{ fontSize: "3.5pt", color: GOLD, fontWeight: 900, letterSpacing: "1.2px" }}>
          ❖&nbsp; SERVING PILGRIMS WITH CARE &nbsp;❖
        </span>
      </div>
    </div>
  );
}

/* ── MAIN EXPORT ── */
export default function PrintStaffCards() {
  const [staff,         setStaff]         = useState<StaffMember[]>([]);
  const [groups,        setGroups]         = useState<Record<string, string>>({});
  const [loading,       setLoading]        = useState(true);
  const [companyFilter, setCompanyFilter]  = useState("all");
  const [roleFilter,    setRoleFilter]     = useState("all");
  const [statusFilter,  setStatusFilter]   = useState("active");
  const [pdfLoading,    setPdfLoading]     = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/staff`,  { credentials: "include" }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/api/groups`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    ]).then(([staffData, groupsData]) => {
      setStaff(Array.isArray(staffData) ? staffData : []);
      const map: Record<string, string> = {};
      if (Array.isArray(groupsData))
        (groupsData as HajjGroup[]).forEach(g => { map[g.id] = g.groupName; });
      setGroups(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = staff.filter(s => {
    if (companyFilter !== "all" && s.companyId !== companyFilter) return false;
    if (roleFilter    !== "all" && s.role      !== roleFilter)    return false;
    if (statusFilter  !== "all" && s.status    !== statusFilter)  return false;
    return true;
  });

  const pages: StaffMember[][] = [];
  for (let i = 0; i < filtered.length; i += 2) pages.push(filtered.slice(i, i + 2));

  const handleDownload = useCallback(async () => {
    if (!contentRef.current || pdfLoading) return;
    setPdfLoading(true);
    try { await downloadPdf(contentRef.current, { filename: "Staff-ID-Cards.pdf" }); }
    finally { setPdfLoading(false); }
  }, [pdfLoading]);

  if (loading) return (
    <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial", color: GREEN }}>
      Loading staff cards…
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
          border-radius: 5px;
          overflow: hidden;
          page-break-inside: avoid;
          font-family: Arial, Helvetica, sans-serif;
          background: #fff;
          position: relative;
          box-shadow: 0 2px 8px rgba(0,0,0,0.14);
          border: 0.5px solid #c8d8c8;
        }
        .cards-row {
          display: flex;
          gap: 6mm;
          justify-content: center;
          margin-bottom: 4mm;
        }
        .page-break { page-break-after: always; }
        @media screen {
          .staff-card { box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print" style={{
        padding: "12px 16px", background: `${GREEN}08`,
        borderBottom: `2px solid ${GREEN}22`,
        display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
      }}>
        <span style={{ fontWeight: 800, fontSize: "15px", color: GREEN }}>Staff ID Cards</span>

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
          <button onClick={handleDownload} disabled={pdfLoading || filtered.length === 0} style={{
            padding: "8px 20px", background: GREEN, color: "#fff",
            border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer",
            opacity: pdfLoading || filtered.length === 0 ? 0.5 : 1,
          }}>
            {pdfLoading ? "Generating…" : "⬇ Download PDF"}
          </button>
          <button onClick={() => window.print()} style={{
            padding: "8px 20px", background: "#fff", border: `1px solid ${GREEN}`,
            color: GREEN, borderRadius: "8px", cursor: "pointer", fontWeight: 600,
          }}>
            🖨 Print
          </button>
          <button onClick={() => window.history.back()} style={{
            padding: "8px 20px", border: "1px solid #ccc",
            borderRadius: "8px", cursor: "pointer", background: "#fff",
          }}>
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
        <div ref={contentRef} style={{ background: "#f0f4f0", padding: "8mm" }}>
          {pages.map((page, pi) => (
            <div key={pi} className={pi < pages.length - 1 ? "page-break" : ""} style={{ marginBottom: "6mm" }}>
              {/* Front faces */}
              <div className="cards-row">
                {page.map(s => (
                  <StaffCardFront key={`f-${s.id}`} s={s} groupName={s.groupId ? groups[s.groupId] : undefined} />
                ))}
              </div>
              {/* Back faces */}
              <div className="cards-row">
                {page.map(s => (
                  <StaffCardBack key={`b-${s.id}`} s={s} groupName={s.groupId ? groups[s.groupId] : undefined} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
