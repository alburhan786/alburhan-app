import { useEffect, useState } from "react";
import { useRoute } from "wouter";

const DARK = "#0B3D2E";
const GOLD = "#C9A23F";
const BASE = import.meta.env.BASE_URL || "/";

function apiBase() {
  return BASE.replace(/\/$/, "") + "/api";
}

interface HotelAssignment {
  pilgrimName:   string;
  bookingNumber: string;
  hotelName:     string;
  hotelCity:     string;
  hotelAddress?: string;
  roomNumber:    string;
  floorNumber?:  string;
  bedType?:      string;
  checkInDate?:  string;
  checkOutDate?: string;
  groupName?:    string;
  maktabNumber?: string;
  issuedAt?:     string;
  verified:      boolean;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee", gap: "8px" }}>
      <span style={{ fontSize: "12px", color: "#888", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "#222", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return v; }
}

export default function VerifyHotelAssignment() {
  const [, params] = useRoute("/verify/hotel/:id");
  const docId = params?.id || "";
  const [data, setData] = useState<HotelAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!docId) return;
    fetch(`${apiBase()}/hotels/verify-assignment/${docId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Could not verify assignment. Please try again."); setLoading(false); });
  }, [docId]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
      <div style={{ textAlign: "center", color: DARK }}>
        <div style={{ width: 48, height: 48, border: `4px solid ${GOLD}`, borderTop: "4px solid transparent", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
        <p>Verifying assignment…</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 32, maxWidth: 400, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.1)" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <h2 style={{ color: "#c00", marginBottom: 8 }}>Verification Failed</h2>
        <p style={{ color: "#666" }}>{error || "Assignment not found or invalid QR code."}</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: DARK, borderRadius: "12px 12px 0 0", padding: "24px 20px", textAlign: "center" }}>
          <div style={{ color: GOLD, fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>AL BURHAN TOURS & TRAVELS</div>
          <div style={{ color: "#B8D4C8", fontSize: 11, marginTop: 4 }}>www.alburhantravels.com</div>
          <div style={{ marginTop: 16, background: data.verified ? "#27AE60" : "#E74C3C", borderRadius: 8, padding: "10px 20px", display: "inline-block" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
              {data.verified ? "✅ VERIFIED ROOM ASSIGNMENT" : "⚠️ UNVERIFIED"}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", padding: "24px 20px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <h3 style={{ color: DARK, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, marginBottom: 16, fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>
            Pilgrim Details
          </h3>
          <InfoRow label="Pilgrim Name"    value={data.pilgrimName} />
          <InfoRow label="Booking Ref"     value={data.bookingNumber} />

          <h3 style={{ color: DARK, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, margin: "20px 0 16px", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>
            Room Allocation
          </h3>
          <InfoRow label="Hotel"           value={data.hotelName} />
          <InfoRow label="City"            value={data.hotelCity} />
          <InfoRow label="Address"         value={data.hotelAddress} />
          <InfoRow label="Room Number"     value={data.roomNumber} />
          <InfoRow label="Floor"           value={data.floorNumber} />
          <InfoRow label="Bed Type"        value={data.bedType} />
          <InfoRow label="Check-In"        value={fmtDate(data.checkInDate)} />
          <InfoRow label="Check-Out"       value={fmtDate(data.checkOutDate)} />

          {(data.groupName || data.maktabNumber) && (
            <>
              <h3 style={{ color: DARK, borderBottom: `2px solid ${GOLD}`, paddingBottom: 8, margin: "20px 0 16px", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>
                Group Information
              </h3>
              <InfoRow label="Group Name"    value={data.groupName} />
              <InfoRow label="Maktab Number" value={data.maktabNumber} />
            </>
          )}

          <div style={{ marginTop: 24, background: "#F5FAF5", borderRadius: 8, padding: "12px 16px", border: `1px solid ${DARK}20` }}>
            <p style={{ color: "#888", fontSize: 11, margin: 0, textAlign: "center" }}>
              Verified by Al Burhan Tours & Travels • {fmtDate(data.issuedAt)}
            </p>
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
