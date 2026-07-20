import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { MainLayout } from "@/components/layout/MainLayout";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "";

interface AgreementData {
  id: string;
  agreementNumber: string;
  bookingNumber: string;
  packageName: string;
  customerName: string;
  customerMobile: string;
  finalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  signedAt: string | null;
  verificationUrl: string;
  clauses: Array<{ id: string; title: string; body: string }>;
}

export default function AgreementSigning() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [agreement, setAgreement] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"terms" | "sign" | "complete">("terms");

  // Terms acceptance state
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [allAccepted, setAllAccepted] = useState(false);

  // OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/api/agreements/my/${id}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => {
        if (d.id) setAgreement(d);
        if (d.status === "signed") setStep("complete");
      })
      .catch(() => toast({ title: "Error", description: "Failed to load agreement", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!agreement?.clauses) return;
    const all = agreement.clauses.every(c => accepted[c.id]);
    setAllAccepted(all);
  }, [accepted, agreement]);

  // ─── Canvas drawing ─────────────────────────────────────────────────────────
  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e.nativeEvent as any, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e.nativeEvent as any, canvas);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#0B3D2E";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      setHasSig(true);
    }
    lastPos.current = pos;
  };

  const endDraw = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const clearSig = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  // ─── OTP ────────────────────────────────────────────────────────────────────
  const requestOtp = async () => {
    setOtpLoading(true);
    try {
      const r = await fetch(`${API}/api/agreements/my/${id}/request-otp`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      let d: any;
      try { d = await r.json(); } catch { throw new Error("We couldn't connect to the server. Please try again."); }
      if (d.ok) {
        setOtpSent(true);
        toast({ title: "OTP Sent", description: "OTP sent to your registered mobile number" });
      } else {
        toast({ title: "Error", description: d.error || "Failed to send OTP", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Network error", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── Collect browser/device metadata ────────────────────────────────────────
  const getDeviceMeta = () => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isWindows = /Windows/.test(ua);
    const isMac = /Mac OS X/.test(ua) && !isIOS;
    const isLinux = /Linux/.test(ua) && !isAndroid;
    const isMobile = /Mobi|Android|iPhone|iPad/.test(ua);
    const isChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
    const isFirefox = /Firefox\//.test(ua);
    const isSafari = /Safari\//.test(ua) && !isChrome;
    const isEdge = /Edg\//.test(ua);
    return {
      signingBrowser: isChrome ? "Chrome" : isFirefox ? "Firefox" : isSafari ? "Safari" : isEdge ? "Edge" : "Unknown",
      signingDevice: isMobile ? "Mobile" : "Desktop",
      signingOS: isIOS ? "iOS" : isAndroid ? "Android" : isWindows ? "Windows" : isMac ? "macOS" : isLinux ? "Linux" : "Unknown",
    };
  };

  // ─── Submit signature ────────────────────────────────────────────────────────
  const submitSignature = async () => {
    if (!hasSig) return toast({ title: "Missing Signature", description: "Please draw your signature", variant: "destructive" });
    if (!otp) return toast({ title: "Missing OTP", description: "Please enter the OTP sent to your mobile", variant: "destructive" });

    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL("image/png");
    const deviceMeta = getDeviceMeta();

    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/agreements/my/${id}/sign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp, signatureData, termsAccepted: accepted, ...deviceMeta }),
      });
      let d: any;
      try { d = await r.json(); } catch { throw new Error("We couldn't connect to the server. Please try again."); }
      if (d.ok) {
        toast({ title: "Agreement Signed!", description: "Your agreement has been signed and sent to your email and WhatsApp." });
        if (d.pdfBase64) {
          const blob = new Blob([Buffer.from ? Buffer.from(d.pdfBase64, "base64") : Uint8Array.from(atob(d.pdfBase64), c => c.charCodeAt(0))], { type: "application/pdf" });
          setDownloadUrl(URL.createObjectURL(blob));
        }
        setStep("complete");
        if (agreement) setAgreement({ ...agreement, status: "signed", signedAt: new Date().toISOString() });
      } else {
        toast({ title: "Error", description: d.error || "Failed to sign agreement", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error while signing", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center text-gray-500">Loading agreement...</div>
        </div>
      </MainLayout>
    );
  }

  if (!agreement) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center text-red-500">Agreement not found</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div style={{ minHeight: "100vh", background: "#f4f6f8", padding: "24px 16px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ background: "#0B3D2E", borderRadius: "10px 10px 0 0", padding: "24px 28px" }}>
            <div style={{ color: "#C9A23F", fontSize: 12, letterSpacing: 2, marginBottom: 4 }}>AL BURHAN TOURS & TRAVELS</div>
            <div style={{ color: "white", fontSize: 22, fontWeight: "bold" }}>Hajj Agreement</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 }}>
              {agreement.agreementNumber} · Booking {agreement.bookingNumber}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ background: "white", borderLeft: "1px solid #DDD", borderRight: "1px solid #DDD", padding: "16px 28px", display: "flex", gap: 0 }}>
            {(["terms", "sign", "complete"] as const).map((s, i) => (
              <div key={s} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: step === s ? "#0B3D2E" : (["terms", "sign", "complete"].indexOf(step) > i ? "#4CAF50" : "#E0E0E0"),
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: "bold",
                }}>{["terms", "sign", "complete"].indexOf(step) > i ? "✓" : i + 1}</div>
                <div style={{ fontSize: 13, color: step === s ? "#0B3D2E" : "#888", fontWeight: step === s ? 600 : 400 }}>
                  {s === "terms" ? "Terms" : s === "sign" ? "Sign" : "Done"}
                </div>
                {i < 2 && <div style={{ flex: 1, height: 2, background: ["terms", "sign", "complete"].indexOf(step) > i ? "#4CAF50" : "#E0E0E0", marginLeft: 4 }} />}
              </div>
            ))}
          </div>

          <div style={{ background: "white", border: "1px solid #DDD", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "28px" }}>

            {/* ─── STEP 1: Terms ─── */}
            {step === "terms" && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: "bold", color: "#0B3D2E", marginBottom: 8 }}>Digital Consent & Declarations</h2>
                <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
                  Please read each consent declaration carefully and check the box to accept. All 9 consent categories must be accepted before proceeding to sign.
                </p>

                {/* Package info summary */}
                <div style={{ background: "#F0F7F0", border: "1px solid #C0D8C0", borderRadius: 8, padding: "14px 18px", marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, color: "#0B3D2E", marginBottom: 8 }}>Package Summary</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
                    <span style={{ color: "#666" }}>Package:</span><span style={{ fontWeight: 600 }}>{agreement.packageName}</span>
                    <span style={{ color: "#666" }}>Customer:</span><span>{agreement.customerName}</span>
                    <span style={{ color: "#666" }}>Total Amount:</span><span style={{ fontWeight: 600 }}>₹{Number(agreement.finalAmount || 0).toLocaleString("en-IN")}</span>
                    <span style={{ color: "#666" }}>Balance Due:</span><span style={{ color: Number(agreement.balanceAmount) > 0 ? "#CC0000" : "#0B3D2E", fontWeight: 600 }}>₹{Number(agreement.balanceAmount || 0).toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {agreement.clauses?.map((clause) => (
                    <div key={clause.id} style={{
                      border: `2px solid ${accepted[clause.id] ? "#0B3D2E" : "#E0E0E0"}`,
                      borderRadius: 8, padding: "16px",
                      background: accepted[clause.id] ? "#F0F7F0" : "white",
                      transition: "all 0.2s",
                    }}>
                      <label style={{ display: "flex", gap: 12, cursor: "pointer", alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={!!accepted[clause.id]}
                          onChange={e => setAccepted(prev => ({ ...prev, [clause.id]: e.target.checked }))}
                          style={{ marginTop: 2, width: 18, height: 18, accentColor: "#0B3D2E", flexShrink: 0 }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#0B3D2E", marginBottom: 6 }}>{clause.title}</div>
                          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, whiteSpace: "pre-line" }}>{clause.body}</div>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: allAccepted ? "#0B3D2E" : "#CC0000" }}>
                    {allAccepted ? "✅ All 9 consent declarations accepted" : `⚠️ ${agreement.clauses?.filter(c => !accepted[c.id]).length} declaration(s) pending`}
                  </div>
                  <button
                    onClick={() => setStep("sign")}
                    disabled={!allAccepted}
                    style={{
                      background: allAccepted ? "#0B3D2E" : "#CCC",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      padding: "10px 24px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: allAccepted ? "pointer" : "not-allowed",
                    }}
                  >
                    Proceed to Sign →
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 2: Sign ─── */}
            {step === "sign" && (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: "bold", color: "#0B3D2E", marginBottom: 8 }}>Digital Signature & OTP Verification</h2>
                <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
                  Verify your mobile number via OTP, then draw your signature below to execute the agreement.
                </p>

                {/* OTP section */}
                <div style={{ border: "1px solid #E0E0E0", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, color: "#0B3D2E", marginBottom: 12 }}>Step 1: OTP Verification</div>
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                    Verify your mobile number <strong>{agreement.customerMobile}</strong> via OTP before signing.
                  </p>
                  {!otpSent ? (
                    <button
                      onClick={requestOtp}
                      disabled={otpLoading}
                      style={{
                        background: "#0B3D2E", color: "white", border: "none",
                        borderRadius: 6, padding: "9px 20px", fontSize: 14,
                        cursor: otpLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      {otpLoading ? "Sending..." : "Send OTP to Mobile"}
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Enter 6-digit OTP"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                        style={{
                          border: "2px solid #0B3D2E", borderRadius: 6, padding: "9px 14px",
                          fontSize: 18, letterSpacing: 6, width: 180, textAlign: "center",
                        }}
                      />
                      <button onClick={requestOtp} disabled={otpLoading} style={{ background: "none", border: "1px solid #0B3D2E", color: "#0B3D2E", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
                        Resend OTP
                      </button>
                      {otp.length === 6 && <span style={{ color: "#0B3D2E", fontSize: 13 }}>✅ OTP entered</span>}
                    </div>
                  )}
                </div>

                {/* Signature section */}
                <div style={{ border: "1px solid #E0E0E0", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, color: "#0B3D2E" }}>Step 2: Draw Your Signature</div>
                    {hasSig && (
                      <button onClick={clearSig} style={{ background: "none", border: "1px solid #CC0000", color: "#CC0000", borderRadius: 4, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>
                        Clear
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Draw your signature using your finger, mouse, or stylus.</p>
                  <canvas
                    ref={canvasRef}
                    width={640}
                    height={160}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                    style={{
                      width: "100%",
                      height: 160,
                      border: `2px solid ${hasSig ? "#0B3D2E" : "#DDD"}`,
                      borderRadius: 6,
                      cursor: "crosshair",
                      background: hasSig ? "#FAFFFE" : "#F9F9F9",
                      touchAction: "none",
                      display: "block",
                    }}
                  />
                  {!hasSig && (
                    <p style={{ fontSize: 11, color: "#AAA", marginTop: 6, textAlign: "center" }}>
                      ✏️ Draw here to sign
                    </p>
                  )}
                </div>

                {/* Legal declaration */}
                <div style={{ background: "#FFF8E7", border: "1px solid #F0CC70", borderRadius: 6, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#7B4700", lineHeight: 1.6 }}>
                  <strong>Declaration:</strong> By clicking "Sign Agreement", I confirm that I have read, understood, and accepted all 9 consent declarations and all legal clauses of this Premium Hajj Agreement. I confirm my mobile number has been verified via OTP. I understand that this digital signature is legally binding under the Information Technology Act, 2000 (India) and is equivalent to a wet-ink signature.
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
                  <button
                    onClick={() => setStep("terms")}
                    style={{ background: "none", border: "1px solid #CCC", color: "#666", borderRadius: 6, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}
                  >
                    ← Back to Terms
                  </button>
                  <button
                    onClick={submitSignature}
                    disabled={submitting || !hasSig || !otp || otp.length < 6}
                    style={{
                      background: (!hasSig || !otp || otp.length < 6 || submitting) ? "#CCC" : "#0B3D2E",
                      color: "white", border: "none", borderRadius: 6,
                      padding: "10px 28px", fontSize: 14, fontWeight: 600,
                      cursor: (!hasSig || !otp || otp.length < 6 || submitting) ? "not-allowed" : "pointer",
                    }}
                  >
                    {submitting ? "Signing..." : "✍ Sign Agreement"}
                  </button>
                </div>
              </div>
            )}

            {/* ─── STEP 3: Complete ─── */}
            {step === "complete" && (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
                <h2 style={{ fontSize: 22, fontWeight: "bold", color: "#0B3D2E", marginBottom: 8 }}>Agreement Signed Successfully!</h2>
                <p style={{ color: "#555", fontSize: 14, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
                  Alhumdulillah! Your Hajj Agreement has been signed and is now legally binding. A copy has been sent to your registered email and WhatsApp.
                </p>

                <div style={{ background: "#F0F7F0", border: "1px solid #C0D8C0", borderRadius: 8, padding: "16px 20px", display: "inline-block", marginBottom: 24, minWidth: 300 }}>
                  <div style={{ color: "#0B3D2E", fontWeight: 600, marginBottom: 8 }}>Agreement Details</div>
                  <div style={{ fontSize: 13, color: "#555" }}>ID: <strong>{agreement.agreementNumber}</strong></div>
                  <div style={{ fontSize: 13, color: "#555" }}>Booking: <strong>{agreement.bookingNumber}</strong></div>
                  {agreement.signedAt && <div style={{ fontSize: 13, color: "#555" }}>Signed: <strong>{new Date(agreement.signedAt).toLocaleString("en-IN")}</strong></div>}
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  {downloadUrl && (
                    <a href={downloadUrl} download={`Agreement-${agreement.agreementNumber}.pdf`}
                      style={{ background: "#0B3D2E", color: "white", textDecoration: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}>
                      ⬇ Download PDF
                    </a>
                  )}
                  <a href={`${API}/api/agreements/my/${id}/pdf`} target="_blank" rel="noreferrer"
                    style={{ background: "#C9A23F", color: "white", textDecoration: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}>
                    🖨 View PDF
                  </a>
                  {agreement.verificationUrl && (
                    <a href={agreement.verificationUrl} target="_blank" rel="noreferrer"
                      style={{ background: "white", color: "#0B3D2E", border: "2px solid #0B3D2E", textDecoration: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}>
                      🔍 Verify Agreement
                    </a>
                  )}
                  <button onClick={() => navigate("/customer/dashboard")}
                    style={{ background: "none", border: "1px solid #CCC", color: "#666", borderRadius: 6, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}>
                    Back to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
