import { useState, useEffect } from "react";
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

const GREEN = "#0d5040";
const GOLD  = "#C9A23F";
const W = "54mm";
const H = "86mm";

const ROLE_LABELS: Record<string, string> = {
  airport_staff:  "AIRPORT STAFF",
  catering_staff: "CATERING STAFF",
  office_staff:   "OFFICE STAFF",
};

/* ── Premium Kaaba Icon — solid cube with kiswa & gold accents ── */
function KaabaIcon({ color = "#d4af37", size = "100%" }: { color?: string; size?: string | number }) {
  return (
    <svg viewBox="0 0 100 96" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      {/* Platform base */}
      <rect x="11" y="84" width="78" height="8" rx="4" fill="#0d1710" />
      <rect x="11" y="84" width="78" height="2" rx="1" fill={color} opacity="0.85" />
      {/* Left wall face (slightly lighter dark) */}
      <path d="M17,37 L50,22 L50,84 L17,84 Z" fill="#141d18" />
      {/* Right wall face (darker) */}
      <path d="M50,22 L83,37 L83,84 L50,84 Z" fill="#0a120e" />
      {/* Top ridge — gold V outline */}
      <path d="M17,37 L50,22 L83,37" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Centre vertical seam — gold */}
      <line x1="50" y1="22" x2="50" y2="84" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Kiswa band — left face (white stripe) */}
      <path d="M17,51 L50,40 L50,47 L17,58 Z" fill="rgba(255,255,255,0.88)" />
      {/* Kiswa band — right face (slightly dimmer) */}
      <path d="M50,40 L83,51 L83,58 L50,47 Z" fill="rgba(255,255,255,0.72)" />
      {/* Gold decorative dashes — left face (below kiswa, follow face slope) */}
      <path d="M21,65.3 L29,63.9 L29,66.4 L21,67.8 Z" fill={color} />
      <path d="M33,63.3 L41,61.9 L41,64.4 L33,65.8 Z" fill={color} />
      <path d="M43,61.6 L49,60.4 L49,62.9 L43,64.1 Z" fill={color} />
      {/* Gold decorative dashes — right face (mirrored slope) */}
      <path d="M51,60.5 L59,61.9 L59,64.4 L51,63 Z" fill={color} />
      <path d="M61,62.2 L69,63.6 L69,66.1 L61,64.7 Z" fill={color} />
      <path d="M71,64 L79,65.3 L79,67.8 L71,66.5 Z" fill={color} />
    </svg>
  );
}

/* ── FRONT CARD (portrait 54×86mm) ── */
function StaffCardFront({ s, groupName }: { s: StaffMember; groupName?: string }) {
  const company   = getCompanyById(s.companyId);
  const roleLabel = ROLE_LABELS[s.role] || "STAFF";
  const mobile    = s.mobileIndia
    ? `+91 ${s.mobileIndia.replace(/^\+?91/, "").trim()}`
    : company.mobile;

  return (
    <div className="staff-card" style={{ background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* ── HEADER: logo LEFT + text RIGHT ~15mm ── */}
      <div style={{
        background: GREEN, display: "flex", alignItems: "center",
        padding: "1.8mm 2.5mm 1.5mm", gap: "2mm", flexShrink: 0,
      }}>
        {company.logoUrl && (
          <img src={company.logoUrl} alt="" style={{
            width: "11mm", height: "11mm", objectFit: "contain", flexShrink: 0,
            borderRadius: "50%", background: "#fff", padding: "1px",
            border: `1.5px solid ${GOLD}`,
          }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: "11pt", fontWeight: 900, color: "#fff",
            lineHeight: 1.0, letterSpacing: "0.6px", textTransform: "uppercase",
          }}>
            {company.nameShort}
          </div>
          <div style={{
            fontSize: "6.5pt", fontWeight: 800, color: GOLD,
            lineHeight: 1.1, letterSpacing: "0.8px",
          }}>
            TOURS &amp; TRAVELS
          </div>
          <div style={{
            fontSize: "3pt", color: "rgba(255,255,255,0.75)",
            letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "1mm",
          }}>
            SERVING PILGRIMS WITH CARE
          </div>
          {/* HAJJ 2026 gold pill */}
          <div style={{
            display: "inline-block",
            background: GOLD, borderRadius: "20px", padding: "0.5mm 3mm",
            fontSize: "5.5pt", fontWeight: 900, color: GREEN, letterSpacing: "1.5px",
          }}>
            HAJJ 2026
          </div>
        </div>
      </div>

      {/* ── ROLE BANNER (full-width) ~7mm ── */}
      <div style={{
        background: "#1a5c41", display: "flex", alignItems: "center",
        justifyContent: "center", padding: "1.8mm 2mm", flexShrink: 0,
        borderTop: `1px solid ${GOLD}55`, borderBottom: `1px solid ${GOLD}55`,
      }}>
        <span style={{
          fontSize: "7pt", fontWeight: 900, color: "#fff",
          letterSpacing: "2.5px", textTransform: "uppercase",
        }}>
          {roleLabel}
        </span>
      </div>

      {/* ── MIDDLE: photo LEFT + Kaaba/HAJJ RIGHT ~30mm ── */}
      <div style={{
        background: "#f0fdf4", display: "flex", alignItems: "stretch",
        padding: "2mm 2mm 1.5mm", gap: "2mm", flexShrink: 0, height: "32mm",
      }}>
        {/* Photo */}
        {s.photoUrl ? (
          <img src={`${API}${s.photoUrl}`} alt="" style={{
            width: "22mm", height: "100%", objectFit: "cover",
            border: `2.5px solid ${GOLD}`, borderRadius: "4px", flexShrink: 0,
          }} />
        ) : (
          <div style={{
            width: "22mm", height: "100%", flexShrink: 0,
            background: "#dcfce7", border: `2.5px solid ${GOLD}`, borderRadius: "4px",
            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1.5mm",
          }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#888" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            <div style={{ fontSize: "3.5pt", color: "#999", fontWeight: 700 }}>PHOTO</div>
          </div>
        )}
        {/* Kaaba icon + HAJJ 2026 */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "2mm",
        }}>
          <KaabaIcon color="#d4af37" size="18mm" />
          <div style={{
            fontSize: "7.5pt", fontWeight: 900, color: "#d4af37",
            letterSpacing: "2px", textAlign: "center", lineHeight: 1,
          }}>
            HAJJ 2026
          </div>
        </div>
      </div>

      {/* ── INFO (flex:1) ── */}
      <div style={{
        background: "#fff", padding: "1.5mm 2.5mm 1mm",
        flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.9mm",
      }}>
        {/* Name */}
        <div style={{
          fontSize: "9.5pt", fontWeight: 900, color: "#111",
          textTransform: "uppercase", textAlign: "center",
          lineHeight: 1.0, letterSpacing: "0.5px",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {s.fullName}
        </div>

        {/* Gold divider */}
        <div style={{ height: "0.4mm", background: GOLD, borderRadius: "1px" }} />

        {/* Role */}
        <div style={{
          fontSize: "4.5pt", fontWeight: 700, color: "#444",
          textAlign: "center", lineHeight: 1.3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          ROLE : <span style={{ color: GREEN, fontWeight: 900 }}>{roleLabel}</span>
        </div>

        {/* Designation */}
        {s.designation && (
          <div style={{
            fontSize: "4.5pt", fontWeight: 700, color: "#444",
            textAlign: "center", lineHeight: 1.3,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            DESIGNATION : <span style={{ color: GREEN, fontWeight: 900 }}>{s.designation.toUpperCase()}</span>
          </div>
        )}

        {/* ID pill */}
        {s.staffId && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: GREEN, borderRadius: "5px", padding: "1mm 2mm",
          }}>
            <svg viewBox="0 0 16 12" width="9" height="7" style={{ marginRight: "1.5mm", flexShrink: 0 }}>
              <rect x="0.5" y="0.5" width="15" height="11" rx="2" fill="none" stroke={GOLD} strokeWidth="1.2"/>
              <line x1="4" y1="4" x2="12" y2="4" stroke={GOLD} strokeWidth="1.1"/>
              <line x1="4" y1="7.5" x2="10" y2="7.5" stroke={GOLD} strokeWidth="1.1"/>
            </svg>
            <span style={{ fontSize: "6pt", fontWeight: 900, color: "#fff", letterSpacing: "0.5px" }}>
              ID NO. : {s.staffId}
            </span>
          </div>
        )}

        {/* Group */}
        {groupName && (
          <div style={{
            fontSize: "4pt", color: "#555", textAlign: "center", lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            GROUP : <span style={{ fontWeight: 800, color: "#333" }}>{groupName}</span>
          </div>
        )}
      </div>

      {/* ── FOOTER: personal mobile LEFT + website RIGHT ── */}
      <div style={{
        background: GREEN, padding: "1.5mm 3mm", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
          <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke={GOLD} strokeWidth="2.5">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.08 5.18 2 2 0 0 1 5.07 3h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.09 10.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 23 18z" />
          </svg>
          <span style={{ fontSize: "3.5pt", color: "#fff", fontWeight: 700 }}>{mobile}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
          <svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke={GOLD} strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span style={{ fontSize: "3.5pt", color: "#fff", fontWeight: 700 }}>{company.website}</span>
        </div>
      </div>
    </div>
  );
}

/* ── BACK CARD (portrait 54×86mm) ── */
function StaffCardBack({ s, groupName }: { s: StaffMember; groupName?: string }) {
  const company   = getCompanyById(s.companyId);
  const roleLabel = ROLE_LABELS[s.role] || "STAFF";
  const verifyUrl = s.staffId
    ? `${PROD_DOMAIN}/verify-staff?id=${encodeURIComponent(s.staffId)}`
    : `${PROD_DOMAIN}/verify-staff`;

  const rows: [string, string][] = ([
    ["NAME",        s.fullName.toUpperCase()],
    ["ROLE",        roleLabel],
    s.designation ? ["DESIGNATION", s.designation.toUpperCase()] : null,
    s.staffId     ? ["ID NO.",      s.staffId]                   : null,
    groupName     ? ["GROUP",       groupName]                   : null,
    s.mobileIndia ? ["MOBILE",      `+91 ${s.mobileIndia.replace(/^\+?91/, "").trim()}`] : null,
    s.bloodGroup  ? ["BLOOD GROUP", s.bloodGroup]                : null,
  ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null);

  return (
    <div className="staff-card" style={{ background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* ── HEADER: logo LEFT + text RIGHT ~14mm ── */}
      <div style={{
        background: GREEN, display: "flex", alignItems: "center",
        padding: "1.8mm 2.5mm 1.5mm", gap: "2mm", flexShrink: 0,
      }}>
        {company.logoUrl && (
          <img src={company.logoUrl} alt="" style={{
            width: "11mm", height: "11mm", objectFit: "contain", flexShrink: 0,
            borderRadius: "50%", background: "#fff", padding: "1px",
            border: `1.5px solid ${GOLD}`,
          }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "10pt", fontWeight: 900, color: "#fff", lineHeight: 1.0, letterSpacing: "0.6px" }}>
            {company.nameShort}
          </div>
          <div style={{ fontSize: "6pt", fontWeight: 800, color: GOLD, lineHeight: 1.1, letterSpacing: "0.8px" }}>
            TOURS &amp; TRAVELS
          </div>
          <div style={{ fontSize: "4.5pt", color: "rgba(255,255,255,0.85)", lineHeight: 1.3, direction: "rtl", fontFamily: "Arial, sans-serif" }}>
            {company.arabicName}
          </div>
        </div>
      </div>

      {/* ── STAFF IDENTITY CARD pill banner ~7mm ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1.5mm 2mm", flexShrink: 0,
        borderTop: `1px solid ${GOLD}44`, borderBottom: `1px solid ${GOLD}44`,
        background: "#fff",
      }}>
        <div style={{
          background: GREEN, borderRadius: "20px", padding: "0.8mm 5mm",
          fontSize: "5pt", fontWeight: 900, color: "#fff", letterSpacing: "1.5px",
        }}>
          STAFF IDENTITY CARD
        </div>
      </div>

      {/* ── QR LEFT + DETAILS RIGHT (side by side) ~32mm ── */}
      <div style={{
        display: "flex", gap: "2.5mm", padding: "2mm 2.5mm 1.5mm",
        flexShrink: 0, alignItems: "flex-start",
      }}>
        {/* QR column */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1mm", flexShrink: 0 }}>
          <div style={{ border: `2.5px solid ${GREEN}`, borderRadius: "4px", padding: "2px", background: "#fff" }}>
            <QRCodeSVG value={verifyUrl} size={64} level="L" fgColor={GREEN} bgColor="#fff" />
          </div>
          <div style={{
            background: GREEN, borderRadius: "12px", padding: "0.5mm 1.5mm",
            display: "flex", alignItems: "center", gap: "0.8mm",
          }}>
            <svg viewBox="0 0 24 24" width="5" height="5" fill="none" stroke="#fff" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
            </svg>
            <span style={{ fontSize: "2.8pt", fontWeight: 900, color: "#fff", letterSpacing: "0.3px" }}>SCAN TO VERIFY</span>
          </div>
        </div>

        {/* Details table */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.9mm" }}>
          {rows.map(([label, value], i) => (
            <div key={i} style={{ display: "flex", gap: "0.5mm", alignItems: "baseline" }}>
              <span style={{
                fontSize: "3pt", fontWeight: 900, color: GREEN,
                minWidth: "15mm", flexShrink: 0, letterSpacing: "0.1px",
              }}>{label}</span>
              <span style={{ fontSize: "3pt", color: "#888", flexShrink: 0 }}>:</span>
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
      <div style={{ height: "0.5mm", background: GOLD, margin: "0 2mm", flexShrink: 0 }} />

      {/* ── INSTRUCTIONS + ARABIC (flex:1) ── */}
      <div style={{ flex: 1, display: "flex", gap: "2mm", padding: "1mm 2.5mm 0.5mm", overflow: "hidden" }}>

        {/* Instructions */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "3.2pt", fontWeight: 900, color: GREEN, letterSpacing: "0.4px", marginBottom: "0.8mm" }}>
            IMPORTANT INSTRUCTIONS
          </div>
          {[
            "This ID card is issued for official duty only.",
            "This card must be carried at all times.",
            "If found, please return to the nearest Al Burhan office.",
            "Misuse of this card will lead to strict action.",
          ].map((line, i) => (
            <div key={i} style={{ display: "flex", gap: "0.8mm", alignItems: "flex-start", marginBottom: "0.7mm" }}>
              <span style={{ fontSize: "3.2pt", color: GOLD, flexShrink: 0, lineHeight: 1.3, fontWeight: 900 }}>•</span>
              <span style={{ fontSize: "2.8pt", color: "#444", lineHeight: 1.4 }}>{line}</span>
            </div>
          ))}
        </div>

        {/* Arabic text + Kaaba icon */}
        <div style={{ width: "18mm", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: "1mm" }}>
          <div style={{ fontSize: "5.5pt", fontWeight: 900, color: GREEN, lineHeight: 1.5, textAlign: "center", direction: "rtl", fontFamily: "Arial, sans-serif" }}>
            خدمة الحجاج شرف لنا
          </div>
          <div style={{ fontSize: "4.5pt", color: GOLD, lineHeight: 1.4, textAlign: "center", direction: "rtl", fontFamily: "Arial, sans-serif" }}>
            الحمد لله على توفيقه
          </div>
          <KaabaIcon color="#d4af37" size="16mm" />
        </div>
      </div>

      {/* ── ADDRESS ROW (light green) ── */}
      <div style={{
        background: "#f0fdf4", padding: "1mm 2.5mm", flexShrink: 0,
        display: "flex", alignItems: "flex-start", gap: "2mm",
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
          <span style={{ fontSize: "2.5pt", color: "#555", lineHeight: 1.4, overflow: "hidden" }}>
            {company.address}
          </span>
        </div>
      </div>

      {/* ── FOOTER: gold bar ── */}
      <div style={{ background: GOLD, padding: "1mm", textAlign: "center", flexShrink: 0 }}>
        <span style={{ fontSize: "3.5pt", color: GREEN, fontWeight: 900, letterSpacing: "1.2px" }}>
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
  for (let i = 0; i < filtered.length; i += 9) pages.push(filtered.slice(i, i + 9));

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
          flex-wrap: wrap;
          gap: 4mm;
          justify-content: center;
          margin-bottom: 4mm;
        }
        .page-block { page-break-after: always; }
        .page-block:last-child { page-break-after: auto; }
        @media screen {
          .staff-card { box-shadow: 0 6px 24px rgba(0,0,0,0.22); }
          .cards-area .staff-card { zoom: 1.8; }
          .cards-area .cards-row  { gap: 14mm; margin-bottom: 8mm; }
          .cards-area { padding: 10mm; }
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
          <option value="office_staff">Office Staff</option>
        </select>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px" }}>
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>

        <span style={{ fontSize: "12px", color: "#666", marginLeft: "4px" }}>{filtered.length} card(s)</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={() => window.print()} disabled={filtered.length === 0} style={{
            padding: "8px 20px", background: GREEN, color: "#fff",
            border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer",
            opacity: filtered.length === 0 ? 0.5 : 1,
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
        <div className="cards-area" style={{ background: "#f0fdf4", padding: "8mm" }}>
          {pages.map((page, pi) => (
            <div key={pi}>
              {/* ── FRONT PAGE ── */}
              <div className="page-block">
                <div className="no-print" style={{ textAlign: "center", fontSize: "11px", color: "#888", padding: "4px 0 6px", fontStyle: "italic" }}>
                  ▶ FRONT — Page {pi + 1} &nbsp;({page.length} cards)
                </div>
                <div className="cards-row">
                  {page.map(s => (
                    <StaffCardFront key={`f-${s.id}`} s={s} groupName={s.groupId ? groups[s.groupId] : undefined} />
                  ))}
                </div>
              </div>
              {/* ── BACK PAGE ── */}
              <div className="page-block">
                <div className="no-print" style={{ textAlign: "center", fontSize: "11px", color: "#888", padding: "4px 0 6px", fontStyle: "italic" }}>
                  ◀ BACK — Page {pi + 1} &nbsp;({page.length} cards)
                </div>
                <div className="cards-row">
                  {page.map(s => (
                    <StaffCardBack key={`b-${s.id}`} s={s} groupName={s.groupId ? groups[s.groupId] : undefined} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
