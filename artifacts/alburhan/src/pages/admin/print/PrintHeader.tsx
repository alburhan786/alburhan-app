import type { CompanyInfo } from "@/lib/companies";
import { getDefaultCompany } from "@/lib/companies";

interface PrintHeaderProps {
  title?: string;
  subtitle?: string;
  company?: CompanyInfo;
}

const BASE = import.meta.env.BASE_URL || "/";

export function PrintHeader({ title, subtitle, company }: PrintHeaderProps) {
  const co = company ?? getDefaultCompany();
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "5mm",
      paddingBottom: "4mm",
      marginBottom: "5mm",
      borderBottom: "3px solid #0A3D2A",
      fontFamily: "'Inter', Arial, sans-serif",
    }}>
      {co.logoUrl ? (
        <img
          src={co.logoUrl}
          alt={co.name}
          style={{ height: "52px", objectFit: "contain", flexShrink: 0 }}
        />
      ) : (
        <div style={{
          width: "52px", height: "52px", flexShrink: 0,
          background: "#0A3D2A", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#C9A84C", fontWeight: 900, fontSize: "13pt", letterSpacing: "0.5px",
        }}>
          {co.nameShort.slice(0, 1)}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: "16pt", color: "#0A3D2A", letterSpacing: "0.5px", lineHeight: 1.2 }}>
          {co.name}
        </div>
        {co.arabicName && (
          <div style={{ fontSize: "9pt", color: "#444", marginTop: "0.5mm", direction: "rtl", fontFamily: "serif" }}>
            {co.arabicName}
          </div>
        )}
        <div style={{ fontSize: "7.5pt", color: "#666", marginTop: "1mm", lineHeight: 1.4 }}>
          {co.address}
        </div>
        <div style={{ fontSize: "7.5pt", color: "#666" }}>
          Phone: {co.phone}
        </div>
      </div>
      {(title || subtitle) && (
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {title && <div style={{ fontSize: "13pt", fontWeight: 700, color: "#333" }}>{title}</div>}
          {subtitle && <div style={{ fontSize: "9pt", color: "#666", marginTop: "1mm" }}>{subtitle}</div>}
        </div>
      )}
    </div>
  );
}
