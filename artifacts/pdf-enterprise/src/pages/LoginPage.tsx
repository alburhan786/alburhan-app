import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Lock, User, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { login, verifyTwoFactor } = useAuth();
  const [step, setStep] = useState<"login" | "2fa">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.requiresTwoFactor) {
        setStep("2fa");
        toast.info("Enter your 2FA code to continue");
      } else {
        toast.success("Welcome back!");
      }
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    try {
      await verifyTwoFactor(code);
      toast.success("Authenticated!");
    } catch (err: any) {
      toast.error(err.message || "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #0d1b3e 0%, #0a0d14 60%)",
      }}
    >
      {/* Grid pattern */}
      <div
        style={{
          position: "fixed", inset: 0, opacity: 0.04,
          backgroundImage: "linear-gradient(#60a5fa 1px, transparent 1px), linear-gradient(90deg, #60a5fa 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: "100%", maxWidth: 400, padding: "0 1rem" }}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            style={{
              width: 64, height: 64,
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              borderRadius: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 16,
              boxShadow: "0 0 40px rgba(59,130,246,0.3)",
            }}
          >
            <FileText size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#d4d8e1", margin: 0 }}>
            PDF Enterprise
          </h1>
          <p style={{ fontSize: 13, color: "#4a5568", marginTop: 4 }}>
            Al Burhan Secure Document Platform
          </p>
        </div>

        <div className="card" style={{ padding: "2rem" }}>
          {step === "login" ? (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#d4d8e1", marginBottom: 24, marginTop: 0 }}>
                Sign in to your account
              </h2>
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <label>Username</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      autoComplete="username"
                      required
                      style={{ paddingLeft: 36 }}
                    />
                    <User size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4a5568" }} />
                  </div>
                </div>
                <div>
                  <label>Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      style={{ paddingLeft: 36, paddingRight: 36 }}
                    />
                    <Lock size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4a5568" }} />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", padding: 2, color: "#4a5568" }}
                    >
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || !username || !password}
                  style={{ marginTop: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600 }}
                >
                  {loading ? "Signing in…" : "Sign In"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div style={{ width: 36, height: 36, background: "#1e3a5f", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ShieldCheck size={18} color="#60a5fa" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#d4d8e1" }}>Two-Factor Authentication</div>
                  <div style={{ fontSize: 12, color: "#4a5568" }}>Enter the 6-digit code from your authenticator app</div>
                </div>
              </div>
              <form onSubmit={handleVerify2FA} className="flex flex-col gap-4">
                <div>
                  <label>Authentication Code</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    style={{ fontSize: 24, letterSpacing: "0.3em", textAlign: "center" }}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || code.length !== 6}
                  style={{ padding: "10px 16px", fontWeight: 600 }}
                >
                  {loading ? "Verifying…" : "Verify"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { setStep("login"); setCode(""); }}
                >
                  ← Back to login
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#2d3748", marginTop: 16 }}>
          🔒 All documents are encrypted with AES-256-GCM
        </p>
      </div>
    </div>
  );
}
