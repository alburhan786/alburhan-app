interface PrintHeaderProps {
  title?: string;
  subtitle?: string;
}

const BASE = import.meta.env.BASE_URL || "/";

export function PrintHeader({ title, subtitle }: PrintHeaderProps) {
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
      <img
        src={`${BASE}images/logo.png`}
        alt="Al Burhan Logo"
        style={{ height: "52px", objectFit: "contain", flexShrink: 0 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: "18pt", color: "#0A3D2A", letterSpacing: "0.5px", lineHeight: 1.2 }}>
          AL BURHAN TOURS AND TRAVELS
        </div>
        <div style={{ fontSize: "8pt", color: "#666", marginTop: "1mm", lineHeight: 1.4 }}>
          Shop No 8-5, Khanka Masjid Complex, Sanwara Road, Burhanpur 450331 M.P.
        </div>
        <div style={{ fontSize: "8pt", color: "#666" }}>
          Phone: +91 8989701701 / +91 9893989786
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
