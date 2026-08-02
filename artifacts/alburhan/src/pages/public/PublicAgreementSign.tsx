import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";

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

export default function PublicAgreementSign() {
  const { token } = useParams<{ token: string }>();

  const [agreement, setAgreement] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<"terms" | "sign" | "complete">("terms");

  // Terms
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [allAccepted, setAllAccepted] = useState(false);

  // OTP
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ title: string; desc: string; ok: boolean } | null>(null);

  const toast = (title: string, desc: string, ok = true) => {
    setToastMsg({ title, desc, ok });
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Load agreement
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/agreements/sign/${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(d => {
        setAgreement(d);
        if (d.status === "signed") setStep("complete");
      })
      .catch((e) => {
        if (e?.code === "AGREEMENT_NOT_FOUND" || e?.status === 404) setNotFound(true);
        else setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!agreement?.clauses) return;
    setAllAccepted(agreement.clauses.every(c => accepted[c.id]));
  }, [accepted, agreement]);

  // Canvas
  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ("touches" in e) return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    setIsDrawing(true);
    lastPos.current = getPos(e.nativeEvent as any, c);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing || !canvasRef.current) return;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e.nativeEvent as any, c);
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
  const endDraw = () => { setIsDrawing(false); lastPos.current = null; };
  const clearSig = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasSig(false);
  };

  const getDeviceMeta = () => {
    const ua = navigator.userAgent;
    const isMobile = /Mobi|Android|iPhone|iPad/.test(ua);
    const isChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
    const isFirefox = /Firefox\//.test(ua);
    const isSafari = /Safari\//.test(ua) && !isChrome;
    const isEdge = /Edg\//.test(ua);
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isWindows = /Windows/.test(ua);
    const isMac = /Mac OS X/.test(ua) && !isIOS;
    return {
      signingBrowser: isChrome ? "Chrome" : isFirefox ? "Firefox" : isSafari ? "Safari" : isEdge ? "Edge" : "Unknown",
      signingDevice: isMobile ? "Mobile" : "Desktop",
      signingOS: isIOS ? "iOS" : isAndroid ? "Android" : isWindows ? "Windows" : isMac ? "macOS" : "Unknown",
    };
  };

  // OTP
  const requestOtp = async () => {
    setOtpLoading(true);
    try {
      const r = await fetch(`${API}/api/agreements/sign/${encodeURIComponent(token!)}/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (d.ok) { setOtpSent(true); toast("OTP Sent", "OTP sent to your registered mobile number"); }
      else toast("Error", d.error || "Failed to send OTP", false);
    } catch { toast("Error", "Network error. Please try again.", false); }
    finally { setOtpLoading(false); }
  };

  // Submit
  const submitSignature = async () => {
    if (!hasSig) return toast("Missing Signature", "Please draw your signature", false);
    if (!otp || otp.length < 6) return toast("Missing OTP", "Please enter the 6-digit OTP", false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL("image/png");
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`${API}/api/agreements/sign/${encodeURIComponent(token!)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp, signatureData, termsAccepted: accepted, ...getDeviceMeta() }),
      });
      const d = await r.json();
      if (d.ok) {
        toast("Agreement Signed!", "Your agreement is now legally binding. A copy has been sent to your WhatsApp and email.");
        if (d.pdfBase64) {
          const bytes = Uint8Array.from(atob(d.pdfBase64), c => c.charCodeAt(0));
          setDownloadUrl(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
        }
        setStep("complete");
        if (agreement) setAgreement({ ...agreement, status: "signed", signedAt: new Date().toISOString() });
      } else {
        setSubmitError(d.error || "Failed to sign agreement");
        toast("Error", d.error || "Failed to sign agreement", false);
      }
    } catch {
      setSubmitError("Network error while signing. Please try again.");
      toast("Error", "Network error while signing", false);
    } finally { setSubmitting(false); }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f6f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, border: "4px solid #0B3D2E", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "#555", fontSize: 15 }}>Loading agreement…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: "#f4f6f8", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ maxWidth: 460, width: "100%", background: "white", borderRadius: 12, boxShadow: "0 2px 20px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          <div style={{ background: "#0B3D2E", padding: "24px 28px" }}>
            <div style={{ color: "#C9A23F", fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>AL BURHAN TOURS & TRAVELS</div>
            <div style={{ color: "white", fontSize: 20, fontWeight: "bold" }}>Agreement Not Found</div>
          </div>
          <div style={{ padding: "32px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔍</div>
            <h2 style={{ fontSize: 18, fontWeight: "bold", color: "#CC0000", marginBottom: 12 }}>Invalid Agreement Link</h2>
            <p style={{ color: "#555", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              This link is invalid or has expired. Please check the message sent to you and use the correct link, or contact Al Burhan Tours & Travels for assistance.
            </p>
            <div style={{ background: "#FFF3F3", border: "1px solid #FFCCCC", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#CC0000", marginBottom: 24 }}>
              Link ID: <code style={{ fontFamily: "monospace" }}>{token}</code>
            </div>
            <a
              href="https://wa.me/911234567890"
              style={{ display: "inline-block", background: "#25D366", color: "white", textDecoration: "none", borderRadius: 6, padding: "10px 24px", fontSize: 14, fontWeight: 600 }}
            >
              📞 Contact Support on WhatsApp
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!agreement) return null;

  const steps = ["terms", "sign", "complete"] as const;

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f8", padding: "24px 16px" }}>
      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          background: toastMsg.ok ? "#0B3D2E" : "#CC0000",
          color: "white", borderRadius: 8, padding: "12px 18px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          maxWidth: 340, fontSize: 14,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{toastMsg.title}</div>
          <div style={{ opacity: 0.9, fontSize: 13 }}>{toastMsg.desc}</div>
        </div>
      )}

      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ background: "#0B3D2E", borderRadius: "10px 10px 0 0", padding: "24px 28px" }}>
          <div style={{ color: "#C9A23F", fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>AL BURHAN TOURS & TRAVELS</div>
          <div style={{ color: "white", fontSize: 22, fontWeight: "bold" }}>Hajj Agreement</div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 }}>
            {agreement.agreementNumber} · Booking {agreement.bookingNumber}
          </div>
        </div>

        {/* Progress */}
        <div style={{ background: "white", borderLeft: "1px solid #DDD", borderRight: "1px solid #DDD", padding: "16px 28px", display: "flex", gap: 0 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: step === s ? "#0B3D2E" : (steps.indexOf(step) > i ? "#4CAF50" : "#E0E0E0"),
                color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: "bold",
              }}>{steps.indexOf(step) > i ? "✓" : i + 1}</div>
              <div style={{ fontSize: 13, color: step === s ? "#0B3D2E" : "#888", fontWeight: step === s ? 600 : 400 }}>
                {s === "terms" ? "Terms" : s === "sign" ? "Sign" : "Done"}
              </div>
              {i < 2 && <div style={{ flex: 1, height: 2, background: steps.indexOf(step) > i ? "#4CAF50" : "#E0E0E0", marginLeft: 4 }} />}
            </div>
          ))}
        </div>

        <div style={{ background: "white", border: "1px solid #DDD", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "28px" }}>

          {/* ── Already signed ── */}
          {agreement.status === "signed" && step !== "complete" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: "bold", color: "#0B3D2E", marginBottom: 8 }}>Agreement Already Signed</h2>
              <p style={{ color: "#555", fontSize: 14, marginBottom: 20 }}>
                This agreement was signed on{" "}
                {agreement.signedAt ? new Date(agreement.signedAt).toLocaleString("en-IN") : "a previous date"}.
              </p>
              <a
                href={`${API}/api/agreements/sign/${encodeURIComponent(token!)}/pdf`}
                target="_blank" rel="noreferrer"
                style={{ background: "#0B3D2E", color: "white", textDecoration: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}
              >
                ⬇ Download Signed PDF
              </a>
            </div>
          )}

          {/* ── STEP 1: Terms ── */}
          {step === "terms" && agreement.status !== "signed" && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: "bold", color: "#0B3D2E", marginBottom: 8 }}>Digital Consent & Declarations</h2>
              <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
                Please read each consent declaration carefully and check the box to accept. All {agreement.clauses?.length ?? 9} consent categories must be accepted before proceeding to sign.
              </p>

              {/* Booking summary */}
              <div style={{ background: "#F0F7F0", border: "1px solid #C0D8C0", borderRadius: 8, padding: "14px 18px", marginBottom: 20 }}>
                <div style={{ fontWeight: 600, color: "#0B3D2E", marginBottom: 10 }}>Booking Summary</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}>
                  <span style={{ color: "#666" }}>Customer:</span>
                  <span style={{ fontWeight: 600 }}>{agreement.customerName}</span>
                  <span style={{ color: "#666" }}>Booking ID:</span>
                  <span>{agreement.bookingNumber}</span>
                  <span style={{ color: "#666" }}>Agreement No.:</span>
                  <span>{agreement.agreementNumber}</span>
                  <span style={{ color: "#666" }}>Package:</span>
                  <span style={{ fontWeight: 600 }}>{agreement.packageName || "—"}</span>
                  <span style={{ color: "#666" }}>Total Amount:</span>
                  <span style={{ fontWeight: 600 }}>₹{Number(agreement.finalAmount || 0).toLocaleString("en-IN")}</span>
                  <span style={{ color: "#666" }}>Paid:</span>
                  <span style={{ color: "#0B3D2E", fontWeight: 600 }}>₹{Number(agreement.paidAmount || 0).toLocaleString("en-IN")}</span>
                  <span style={{ color: "#666" }}>Balance Due:</span>
                  <span style={{ color: Number(agreement.balanceAmount) > 0 ? "#CC0000" : "#0B3D2E", fontWeight: 600 }}>
                    ₹{Number(agreement.balanceAmount || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {/* PDF preview link */}
              <div style={{ background: "#FFFBF0", border: "1px solid #F0CC70", borderRadius: 8, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22 }}>📄</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#7B4700", marginBottom: 2 }}>View Agreement PDF</div>
                  <div style={{ fontSize: 12, color: "#888" }}>Read the full agreement document before signing.</div>
                </div>
                <a
                  href={`${API}/api/agreements/sign/${encodeURIComponent(token!)}/pdf`}
                  target="_blank" rel="noreferrer"
                  style={{ marginLeft: "auto", background: "#C9A23F", color: "white", textDecoration: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  Open PDF
                </a>
              </div>

              {/* Clauses */}
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
                  {allAccepted
                    ? `✅ All ${agreement.clauses?.length ?? 9} consent declarations accepted`
                    : `⚠️ ${agreement.clauses?.filter(c => !accepted[c.id]).length ?? 9} declaration(s) pending`}
                </div>
                <button
                  onClick={() => setStep("sign")}
                  disabled={!allAccepted}
                  style={{
                    background: allAccepted ? "#0B3D2E" : "#CCC",
                    color: "white", border: "none", borderRadius: 6,
                    padding: "10px 24px", fontSize: 14, fontWeight: 600,
                    cursor: allAccepted ? "pointer" : "not-allowed",
                  }}
                >
                  Proceed to Sign →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Sign ── */}
          {step === "sign" && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: "bold", color: "#0B3D2E", marginBottom: 8 }}>Digital Signature & OTP Verification</h2>
              <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
                Verify your mobile number via OTP, then draw your signature below to execute the agreement.
              </p>

              {/* OTP */}
              <div style={{ border: "1px solid #E0E0E0", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <div style={{ fontWeight: 600, color: "#0B3D2E", marginBottom: 12 }}>Step 1: OTP Verification</div>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                  Verify your mobile number <strong>{agreement.customerMobile ? `***${agreement.customerMobile.slice(-4)}` : "(registered number)"}</strong> via OTP before signing.
                </p>
                {!otpSent ? (
                  <button
                    onClick={requestOtp}
                    disabled={otpLoading}
                    style={{ background: "#0B3D2E", color: "white", border: "none", borderRadius: 6, padding: "9px 20px", fontSize: 14, cursor: otpLoading ? "not-allowed" : "pointer" }}
                  >
                    {otpLoading ? "Sending…" : "Send OTP to Mobile"}
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="tel" inputMode="numeric" maxLength={6}
                      placeholder="Enter 6-digit OTP"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                      style={{ border: "2px solid #0B3D2E", borderRadius: 6, padding: "9px 14px", fontSize: 18, letterSpacing: 6, width: 180, textAlign: "center" }}
                    />
                    <button onClick={requestOtp} disabled={otpLoading} style={{ background: "none", border: "1px solid #0B3D2E", color: "#0B3D2E", borderRadius: 6, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
                      Resend OTP
                    </button>
                    {otp.length === 6 && <span style={{ color: "#0B3D2E", fontSize: 13 }}>✅ OTP entered</span>}
                  </div>
                )}
              </div>

              {/* Signature canvas */}
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
                  width={640} height={160}
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                  style={{
                    width: "100%", height: 160,
                    border: `2px solid ${hasSig ? "#0B3D2E" : "#DDD"}`,
                    borderRadius: 6, cursor: "crosshair",
                    background: hasSig ? "#FAFFFE" : "#F9F9F9",
                    touchAction: "none", display: "block",
                  }}
                />
                {!hasSig && <p style={{ fontSize: 11, color: "#AAA", marginTop: 6, textAlign: "center" }}>✏️ Draw here to sign</p>}
              </div>

              {/* Declaration */}
              <div style={{ background: "#FFF8E7", border: "1px solid #F0CC70", borderRadius: 6, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: "#7B4700", lineHeight: 1.6 }}>
                <strong>Declaration:</strong> By clicking "Sign Agreement", I confirm that I have read, understood, and accepted all consent declarations and legal clauses of this Premium Hajj Agreement. I confirm my mobile number has been verified via OTP. I understand that this digital signature is legally binding under the Information Technology Act, 2000 (India) and is equivalent to a wet-ink signature.
              </div>

              {submitError && (
                <div style={{ background: "#FFF0F0", border: "1px solid #FFCCCC", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#CC0000" }}>
                  ⚠️ {submitError}
                </div>
              )}

              <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
                <button onClick={() => setStep("terms")} style={{ background: "none", border: "1px solid #CCC", color: "#666", borderRadius: 6, padding: "10px 20px", fontSize: 14, cursor: "pointer" }}>
                  ← Back to Terms
                </button>
                <button
                  onClick={submitSignature}
                  disabled={submitting || !hasSig || otp.length < 6}
                  style={{
                    background: (!hasSig || otp.length < 6 || submitting) ? "#CCC" : "#0B3D2E",
                    color: "white", border: "none", borderRadius: 6,
                    padding: "10px 28px", fontSize: 14, fontWeight: 600,
                    cursor: (!hasSig || otp.length < 6 || submitting) ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Signing…" : "✍ Sign Agreement"}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Complete ── */}
          {step === "complete" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: "bold", color: "#0B3D2E", marginBottom: 8 }}>Agreement Signed Successfully!</h2>
              <p style={{ color: "#555", fontSize: 14, marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
                Alhumdulillah! Your Hajj Agreement has been signed and is now legally binding. A copy has been sent to your registered email and WhatsApp.
              </p>
              <div style={{ background: "#F0F7F0", border: "1px solid #C0D8C0", borderRadius: 8, padding: "16px 20px", display: "inline-block", marginBottom: 24, minWidth: 300, textAlign: "left" }}>
                <div style={{ color: "#0B3D2E", fontWeight: 600, marginBottom: 8 }}>Agreement Details</div>
                <div style={{ fontSize: 13, color: "#555" }}>Agreement No.: <strong>{agreement.agreementNumber}</strong></div>
                <div style={{ fontSize: 13, color: "#555" }}>Booking: <strong>{agreement.bookingNumber}</strong></div>
                <div style={{ fontSize: 13, color: "#555" }}>Customer: <strong>{agreement.customerName}</strong></div>
                {agreement.signedAt && <div style={{ fontSize: 13, color: "#555" }}>Signed At: <strong>{new Date(agreement.signedAt).toLocaleString("en-IN")}</strong></div>}
              </div>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                {downloadUrl && (
                  <a href={downloadUrl} download={`Agreement-${agreement.agreementNumber}.pdf`}
                    style={{ background: "#0B3D2E", color: "white", textDecoration: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}>
                    ⬇ Download PDF
                  </a>
                )}
                <a href={`${API}/api/agreements/sign/${encodeURIComponent(token!)}/pdf`} target="_blank" rel="noreferrer"
                  style={{ background: "#C9A23F", color: "white", textDecoration: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}>
                  🖨 View PDF
                </a>
                {agreement.verificationUrl && (
                  <a href={agreement.verificationUrl} target="_blank" rel="noreferrer"
                    style={{ background: "white", color: "#0B3D2E", border: "2px solid #0B3D2E", textDecoration: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600 }}>
                    🔍 Verify Agreement
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "16px 0 8px", fontSize: 12, color: "#AAA" }}>
          Al Burhan Tours & Travels · Secured agreement powered by digital signature technology
        </div>
      </div>
    </div>
  );
}
