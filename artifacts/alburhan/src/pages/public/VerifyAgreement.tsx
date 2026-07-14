import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { MainLayout } from "@/components/layout/MainLayout";

const API = import.meta.env.VITE_API_URL || "";

interface VerifyData {
  agreementNumber: string;
  bookingNumber: string;
  customerName: string;
  packageName: string;
  status: string;
  signedAt: string | null;
  otpVerified: boolean;
  createdAt: string;
  isValid: boolean;
}

export default function VerifyAgreement() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<VerifyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/agreements/verify/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to verify agreement"))
      .finally(() => setLoading(false));
  }, [token]);

  const statusColor = (s: string) => {
    if (s === "signed") return "#0B3D2E";
    if (s === "cancelled") return "#CC0000";
    return "#7B4700";
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      draft: "Draft — Awaiting Signature",
      pending_signature: "Pending Customer Signature",
      signed: "Signed & Verified",
      cancelled: "Cancelled",
    };
    return map[s] || s.replace(/_/g, " ").toUpperCase();
  };

  return (
    <MainLayout>
      <div style={{ minHeight: "80vh", background: "#f8f9fa", padding: "40px 16px", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        <div style={{ maxWidth: 560, width: "100%", fontFamily: "Georgia, serif" }}>
          {/* Header */}
          <div style={{ background: "#0B3D2E", borderRadius: "10px 10px 0 0", padding: "28px 32px 20px", textAlign: "center" }}>
            <div style={{ color: "#C9A23F", fontSize: 13, fontFamily: "sans-serif", letterSpacing: 2, marginBottom: 6 }}>AL BURHAN TOURS & TRAVELS</div>
            <div style={{ color: "white", fontSize: 22, fontWeight: "bold" }}>Agreement Verification</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4, fontFamily: "sans-serif" }}>Secure Document Authentication Portal</div>
          </div>

          <div style={{ background: "white", borderRadius: "0 0 10px 10px", border: "1px solid #DDD", borderTop: "none", padding: "32px" }}>
            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#888", fontFamily: "sans-serif" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                <div>Verifying agreement...</div>
              </div>
            )}

            {error && !loading && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
                <div style={{ color: "#CC0000", fontWeight: "bold", fontSize: 18, fontFamily: "sans-serif" }}>Verification Failed</div>
                <div style={{ color: "#888", fontSize: 14, marginTop: 8, fontFamily: "sans-serif" }}>{error}</div>
                <div style={{ color: "#888", fontSize: 12, marginTop: 16, fontFamily: "sans-serif" }}>
                  This agreement may not exist or the verification link may be invalid.
                </div>
              </div>
            )}

            {data && !loading && (
              <div>
                {/* Status badge */}
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                  <div style={{
                    display: "inline-block",
                    background: data.isValid ? "#E8F5E9" : "#FFF8E7",
                    border: `2px solid ${statusColor(data.status)}`,
                    borderRadius: 8,
                    padding: "12px 28px",
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>{data.isValid ? "✅" : "⏳"}</div>
                    <div style={{ color: statusColor(data.status), fontWeight: "bold", fontSize: 16, fontFamily: "sans-serif" }}>
                      {statusLabel(data.status)}
                    </div>
                    {data.otpVerified && data.isValid && (
                      <div style={{ color: "#0B3D2E", fontSize: 12, marginTop: 4, fontFamily: "sans-serif" }}>
                        OTP Verified ✓ — Digitally Signed
                      </div>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div style={{ borderTop: "1px solid #EEE", paddingTop: 20 }}>
                  {[
                    { label: "Agreement ID", value: data.agreementNumber },
                    { label: "Booking Reference", value: data.bookingNumber },
                    { label: "Customer Name", value: data.customerName },
                    { label: "Package", value: data.packageName },
                    { label: "Date Signed", value: data.signedAt ? new Date(data.signedAt).toLocaleString("en-IN") : "Not yet signed" },
                    { label: "Agreement Created", value: new Date(data.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", padding: "10px 0", borderBottom: "1px solid #F5F5F5", fontFamily: "sans-serif" }}>
                      <div style={{ width: 160, color: "#666", fontSize: 13, flexShrink: 0 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111", wordBreak: "break-all" }}>{value || "—"}</div>
                    </div>
                  ))}
                </div>

                {/* Legal notice */}
                <div style={{ marginTop: 24, background: "#F0F7F0", border: "1px solid #C0D8C0", borderRadius: 6, padding: "14px 16px" }}>
                  <div style={{ color: "#0B3D2E", fontSize: 12, fontFamily: "sans-serif", lineHeight: 1.6 }}>
                    <strong>Legal Notice:</strong> This document has been digitally signed under the Information Technology Act, 2000 (India).
                    The digital signature is legally equivalent to a handwritten signature. This verification page confirms the authenticity
                    of the agreement issued by Al Burhan Tours & Travels.
                  </div>
                </div>

                {/* Footer */}
                <div style={{ textAlign: "center", marginTop: 24, color: "#999", fontSize: 11, fontFamily: "sans-serif" }}>
                  Al Burhan Tours & Travels | 5/8 Khanka Masjid Complex, Burhanpur 450331 M.P. | +91 9893989786
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
